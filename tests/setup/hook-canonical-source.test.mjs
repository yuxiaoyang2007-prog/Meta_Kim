import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { SHARED_RUNTIME_HOOK_FILES } from "../../scripts/runtime-hook-mapping.mjs";
import {
  createInitialState,
  readMetaRunStatus,
  readSpineStateIncludingInactive,
  sanitizeStateProfile,
  writeSpineState,
} from "../../canonical/runtime-assets/shared/hooks/spine-state.mjs";
import { withFileLock } from "../../canonical/runtime-assets/shared/hooks/spine-state-utils.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SHARED_HOOK_DIR = join(REPO_ROOT, "canonical", "runtime-assets", "shared", "hooks");
const CLAUDE_HOOK_DIR = join(REPO_ROOT, "canonical", "runtime-assets", "claude", "hooks");
const CLAUDE_COMPATIBILITY_ADAPTERS = new Set([
  "activate-meta-theory-spine.mjs",
  "skip-reminder.mjs",
  "spine-state.mjs",
  "utils.mjs",
]);

test("cross-runtime hook core has one canonical owner", () => {
  assert.deepEqual(SHARED_RUNTIME_HOOK_FILES, [
    "activate-meta-theory-spine.mjs",
    "project-root.mjs",
    "skip-reminder.mjs",
    "spine-state.mjs",
    "spine-state-utils.mjs",
    "utils.mjs",
  ]);

  for (const fileName of SHARED_RUNTIME_HOOK_FILES) {
    assert.equal(existsSync(join(SHARED_HOOK_DIR, fileName)), true, fileName);
    const claudePath = join(CLAUDE_HOOK_DIR, fileName);
    if (!CLAUDE_COMPATIBILITY_ADAPTERS.has(fileName)) {
      assert.equal(existsSync(claudePath), false, fileName);
      continue;
    }
    const adapter = readFileSync(claudePath, "utf8");
    assert.match(adapter, /\.\.\/\.\.\/shared\/hooks\//, fileName);
    assert.ok(adapter.split(/\r?\n/u).filter(Boolean).length <= 2, `${fileName} must stay thin`);
    assert.notEqual(adapter, readFileSync(join(SHARED_HOOK_DIR, fileName), "utf8"));
  }
});

test("global hook sync projects the shared core identically to Claude, Codex, and Cursor", () => {
  const root = mkdtempSync(join(tmpdir(), "meta-kim-hook-source-"));
  try {
    const homes = {
      claude: join(root, "claude"),
      codex: join(root, "codex"),
      cursor: join(root, "cursor"),
    };
    const result = spawnSync(
      process.execPath,
      [
        "scripts/sync-runtimes.mjs",
        "--scope",
        "global",
        "--targets",
        "claude,codex,cursor",
      ],
      {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          META_KIM_CLAUDE_HOME: homes.claude,
          META_KIM_CODEX_HOME: homes.codex,
          META_KIM_CURSOR_HOME: homes.cursor,
        },
      },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);

    for (const fileName of SHARED_RUNTIME_HOOK_FILES) {
      const canonical = readFileSync(join(SHARED_HOOK_DIR, fileName), "utf8");
      for (const [runtime, home] of Object.entries(homes)) {
        const projected = readFileSync(
          join(home, "hooks", "meta-kim", fileName),
          "utf8",
        );
        assert.equal(projected, canonical, `${runtime}:${fileName}`);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("concurrent spine writes remain atomic and keep status paired with state", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "meta-kim-spine-concurrency-"));
  try {
    const states = Array.from({ length: 12 }, (_, index) => ({
      ...createInitialState({
        taskClassification: "concurrency_regression",
        triggerReason: "test",
      }),
      runId: `concurrent-${index}`,
      currentStage: index % 2 === 0 ? "fetch" : "thinking",
      writerMarker: index,
    }));

    await Promise.all(states.map((state) => writeSpineState(cwd, state)));

    const finalState = await readSpineStateIncludingInactive(cwd);
    const activeStatus = await readMetaRunStatus(cwd, "default");
    assert.ok(finalState);
    assert.ok(activeStatus);
    assert.equal(activeStatus.runId, finalState.runId);
    assert.equal(activeStatus.currentStageKey, finalState.currentStage);
    assert.equal(
      existsSync(
        join(cwd, ".meta-kim", "state", "default", "spine", "spine-state.json.lock"),
      ),
      false,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("stale lock owners are reclaimed after a crashed writer", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "meta-kim-stale-lock-"));
  const lockPath = join(cwd, "spine-state.json.lock");
  try {
    writeFileSync(lockPath, `${JSON.stringify({ pid: 2147483647, createdAt: "2000-01-01T00:00:00.000Z" })}\n`);
    let entered = false;
    await withFileLock(lockPath, async () => { entered = true; });
    assert.equal(entered, true);
    assert.equal(existsSync(lockPath), false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("META_KIM_PROFILE keeps spine and status envelopes in one named profile", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "meta-kim-named-profile-"));
  const previous = process.env.META_KIM_PROFILE;
  process.env.META_KIM_PROFILE = "named-profile";
  try {
    const state = {
      ...createInitialState({ taskClassification: "profile_regression", triggerReason: "test" }),
      runId: "named-profile-run",
      currentStage: "fetch",
    };
    await writeSpineState(cwd, state);
    assert.equal(
      existsSync(join(cwd, ".meta-kim", "state", "named-profile", "spine", "spine-state.json")),
      true,
    );
    assert.equal(
      existsSync(join(cwd, ".meta-kim", "state", "named-profile", "active-run.json")),
      true,
    );
    assert.equal(existsSync(join(cwd, ".meta-kim", "state", "default", "spine", "spine-state.json")), false);
  } finally {
    if (previous === undefined) delete process.env.META_KIM_PROFILE;
    else process.env.META_KIM_PROFILE = previous;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("writeSpineState resolves one profile when environment and state disagree", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "meta-kim-profile-mismatch-"));
  const previous = process.env.META_KIM_PROFILE;
  process.env.META_KIM_PROFILE = "environment-profile";
  try {
    const state = {
      ...createInitialState({ taskClassification: "profile_regression", triggerReason: "test" }),
      runId: "profile-mismatch-run",
      currentStage: "thinking",
      profile: "state-profile",
    };
    await writeSpineState(cwd, state);

    assert.equal(
      existsSync(join(cwd, ".meta-kim", "state", "environment-profile", "spine", "spine-state.json")),
      true,
    );
    assert.equal(
      existsSync(join(cwd, ".meta-kim", "state", "environment-profile", "active-run.json")),
      true,
    );
    assert.equal(
      existsSync(
        join(
          cwd,
          ".meta-kim",
          "state",
          "environment-profile",
          "runs",
          "profile-mismatch-run",
          "status.json",
        ),
      ),
      true,
    );
    assert.equal(existsSync(join(cwd, ".meta-kim", "state", "state-profile")), false);
  } finally {
    if (previous === undefined) delete process.env.META_KIM_PROFILE;
    else process.env.META_KIM_PROFILE = previous;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("custom spine directory routes spine and status through the same profile", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "meta-kim-custom-spine-profile-"));
  const previousProfile = process.env.META_KIM_PROFILE;
  const previousSpineDir = process.env.META_KIM_SPINE_STATE_DIR;
  process.env.META_KIM_PROFILE = "environment-profile";
  process.env.META_KIM_SPINE_STATE_DIR = ".meta-kim/state/custom-profile/spine";
  try {
    const state = {
      ...createInitialState({ taskClassification: "profile_regression", triggerReason: "test" }),
      runId: "custom-profile-run",
      currentStage: "review",
    };
    await writeSpineState(cwd, state);

    assert.equal(
      existsSync(join(cwd, ".meta-kim", "state", "custom-profile", "spine", "spine-state.json")),
      true,
    );
    assert.equal(
      existsSync(join(cwd, ".meta-kim", "state", "custom-profile", "active-run.json")),
      true,
    );
    assert.equal(
      existsSync(
        join(
          cwd,
          ".meta-kim",
          "state",
          "custom-profile",
          "runs",
          "custom-profile-run",
          "status.json",
        ),
      ),
      true,
    );
    assert.equal(existsSync(join(cwd, ".meta-kim", "state", "environment-profile")), false);
    assert.equal((await readSpineStateIncludingInactive(cwd))?.runId, "custom-profile-run");
    assert.equal((await readMetaRunStatus(cwd, "custom-profile"))?.runId, "custom-profile-run");
  } finally {
    if (previousProfile === undefined) delete process.env.META_KIM_PROFILE;
    else process.env.META_KIM_PROFILE = previousProfile;
    if (previousSpineDir === undefined) delete process.env.META_KIM_SPINE_STATE_DIR;
    else process.env.META_KIM_SPINE_STATE_DIR = previousSpineDir;
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("profile sanitization is stable, readable, and collision-resistant", () => {
  for (const profile of ["default", "tenant-a", "team.one_2", "UPPER.case"]) {
    assert.equal(sanitizeStateProfile(profile), profile);
  }

  const slash = sanitizeStateProfile("tenant/a");
  const space = sanitizeStateProfile("tenant a");
  assert.match(slash, /^tenant-a-[a-f0-9]{12}$/u);
  assert.match(space, /^tenant-a-[a-f0-9]{12}$/u);
  assert.notEqual(slash, space);

  const traversal = sanitizeStateProfile("../../customer-a");
  assert.match(traversal, /^customer-a-[a-f0-9]{12}$/u);
  assert.doesNotMatch(traversal, /\.\.|[\\/]/u);

  const longA = sanitizeStateProfile(`${"tenant".repeat(20)}-a`);
  const longB = sanitizeStateProfile(`${"tenant".repeat(20)}-b`);
  assert.ok(longA.length <= 80);
  assert.ok(longB.length <= 80);
  assert.notEqual(longA, longB);
  assert.match(longA, /-[a-f0-9]{12}$/u);
});

test("unsafe custom spine profile segment uses the same collision-resistant route", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "meta-kim-unsafe-custom-spine-"));
  const previousSpineDir = process.env.META_KIM_SPINE_STATE_DIR;
  process.env.META_KIM_SPINE_STATE_DIR = ".meta-kim/state/tenant a/spine";
  try {
    const profile = sanitizeStateProfile("tenant a");
    const state = {
      ...createInitialState({ taskClassification: "profile_regression", triggerReason: "test" }),
      runId: "unsafe-custom-profile-run",
    };
    await writeSpineState(cwd, state);
    assert.equal(
      existsSync(join(cwd, ".meta-kim", "state", profile, "spine", "spine-state.json")),
      true,
    );
    assert.equal(
      existsSync(join(cwd, ".meta-kim", "state", profile, "active-run.json")),
      true,
    );
    assert.equal(existsSync(join(cwd, ".meta-kim", "state", "tenant a")), false);
  } finally {
    if (previousSpineDir === undefined) delete process.env.META_KIM_SPINE_STATE_DIR;
    else process.env.META_KIM_SPINE_STATE_DIR = previousSpineDir;
    rmSync(cwd, { recursive: true, force: true });
  }
});
