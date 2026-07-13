import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

function runSyncCheck(targets) {
  const result = runSyncCheckResult(targets);
  return (result.stdout || "") + (result.stderr || "");
}

function runSyncCheckResult(targets, extraEnv = {}) {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/sync-runtimes.mjs",
      "--check",
      "--json",
      "--targets",
      targets,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...extraEnv },
    },
  );

  return result;
}

function createTempSourceRepoFixture() {
  const tempRoot = mkdtempSync(join(os.tmpdir(), "meta-kim-source-repo-"));
  cpSync(join(repoRoot, "package.json"), join(tempRoot, "package.json"));
  cpSync(join(repoRoot, "config"), join(tempRoot, "config"), { recursive: true });
  cpSync(join(repoRoot, "canonical"), join(tempRoot, "canonical"), { recursive: true });
  return tempRoot;
}

function runSyncGlobal(targets, extraEnv = {}) {
  return spawnSync(
    process.execPath,
    [
      "scripts/sync-runtimes.mjs",
      "--scope",
      "global",
      "--targets",
      targets,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...extraEnv },
    },
  );
}

function runProjectSyncFromFixture(tempRoot, args = []) {
  return spawnSync(
    process.execPath,
    ["scripts/sync-runtimes.mjs", ...args],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, META_KIM_REPO_ROOT: tempRoot },
    },
  );
}

describe("runtime hook sync contract", () => {
  test("source repo project check treats absent runtime projections as expected", () => {
    const tempRoot = createTempSourceRepoFixture();
    try {
      const result = runSyncCheckResult("claude,codex,cursor,openclaw", {
        META_KIM_REPO_ROOT: tempRoot,
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);

      const summary = JSON.parse(result.stdout);
      assert.equal(summary.status, "source_repo_project_projections_absent");
      assert.equal(summary.total, 0);
      assert.equal(summary.sourceRepoProjectProjections.expectedAbsent, true);
      assert.equal(summary.staleFiles.length, 0);
      assert.ok(summary.sourceRepoProjectProjections.skippedStaleFiles > 0);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("source repo project check ignores empty projection directories", () => {
    const tempRoot = createTempSourceRepoFixture();
    const claudeRoot = join(tempRoot, ".claude");
    const emptyHooksDir = join(claudeRoot, "hooks");

    try {
      mkdirSync(emptyHooksDir, { recursive: true });

      const result = runSyncCheckResult("claude", {
        META_KIM_REPO_ROOT: tempRoot,
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);

      const summary = JSON.parse(result.stdout);
      assert.equal(summary.status, "source_repo_project_projections_absent");
      assert.equal(summary.total, 0);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("project sync does not generate repo-local hook files", () => {
    const output = runSyncCheck("claude").replace(/\\/g, "/");
    assert.doesNotMatch(output, /\.claude\/hooks\//);
  });

  test("global_only project sync keeps Claude Codex Cursor hook dependency pairs resolvable", () => {
    const tempRoot = createTempSourceRepoFixture();
    try {
      const overrideDir = join(tempRoot, ".meta-kim");
      mkdirSync(overrideDir, { recursive: true });
      writeFileSync(
        join(overrideDir, "local.overrides.json"),
        `${JSON.stringify({ projectProjectionMode: "global_only" }, null, 2)}\n`,
      );

      const retiredHookSentinel = "// user-owned legacy basename\n";
      for (const runtimeDir of [".claude", ".codex", ".cursor"]) {
        const hooksDir = join(tempRoot, runtimeDir, "hooks");
        mkdirSync(hooksDir, { recursive: true });
        writeFileSync(
          join(hooksDir, "hook-i18n.mjs"),
          retiredHookSentinel,
          "utf8",
        );
      }

      const sync = runProjectSyncFromFixture(tempRoot);
      assert.equal(sync.status, 0, sync.stderr || sync.stdout);
      assert.doesNotMatch(
        sync.stdout + sync.stderr,
        /missing canonical.*hook-i18n|缺失的 canonical.*hook-i18n/iu,
      );

      for (const runtimeDir of [".claude", ".codex", ".cursor"]) {
        const hooksDir = join(tempRoot, runtimeDir, "hooks");
        const activatorPath = join(hooksDir, "activate-meta-theory-spine.mjs");
        const projectRootPath = join(hooksDir, "project-root.mjs");
        assert.equal(existsSync(activatorPath), true, `${runtimeDir} activator missing`);
        assert.equal(existsSync(projectRootPath), true, `${runtimeDir} project-root missing`);
        assert.match(
          readFileSync(activatorPath, "utf8"),
          /from "\.\/project-root\.mjs"/u,
          `${runtimeDir} activator must resolve its paired project-root dependency`,
        );
        assert.equal(
          readFileSync(join(hooksDir, "hook-i18n.mjs"), "utf8"),
          retiredHookSentinel,
          `${runtimeDir} same-name legacy file must be preserved without exact ownership proof`,
        );
      }

      assert.equal(existsSync(join(tempRoot, ".codex", "agents")), false);
      assert.equal(existsSync(join(tempRoot, ".cursor", "agents")), false);
      assert.equal(existsSync(join(tempRoot, ".agents", "skills")), false);

      const check = runProjectSyncFromFixture(tempRoot, ["--check", "--json"]);
      assert.equal(check.status, 0, check.stderr || check.stdout);
      const summary = JSON.parse(check.stdout);
      assert.equal(summary.status, "ok");
      assert.deepEqual(summary.targets, []);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("global sync includes the meta-theory spine activation hook package", () => {
    const source = readFileSync(
      join(repoRoot, "scripts/sync-global-meta-theory.mjs"),
      "utf8",
    );

    assert.match(
      source,
      /GLOBAL_HOOK_PACKAGE_FILES = new Set\(\[[\s\S]*"activate-meta-theory-spine\.mjs"/,
    );
    assert.equal(
      existsSync(
        join(
          repoRoot,
          "canonical/runtime-assets/shared/hooks/activate-meta-theory-spine.mjs",
        ),
      ),
      true,
    );
    assert.match(
      source,
      /GLOBAL_HOOK_PACKAGE_FILES = new Set\(\[[\s\S]*"project-root\.mjs"/,
    );
  });

  test("Codex global sync writes hooks and hook config to the Codex home", () => {
    const root = mkdtempSync(join(os.tmpdir(), "meta-kim-codex-global-hooks-"));
    try {
      const codexHome = join(root, "codex");
      mkdirSync(join(codexHome, "hooks"), { recursive: true });
      writeFileSync(join(codexHome, "hooks", "graphify-context.mjs"), "");
      writeFileSync(join(codexHome, "hooks", "custom-user-hook.mjs"), "");

      const result = runSyncGlobal("codex", {
        META_KIM_CODEX_HOME: codexHome,
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.equal(
        existsSync(join(codexHome, "hooks", "meta-kim", "graphify-context.mjs")),
        true,
      );
      assert.equal(
        existsSync(
          join(codexHome, "hooks", "meta-kim", "activate-meta-theory-spine.mjs"),
        ),
        true,
      );
      assert.equal(
        existsSync(join(codexHome, "hooks", "meta-kim", "project-root.mjs")),
        true,
      );
      assert.equal(existsSync(join(codexHome, "hooks.json")), true);
      assert.equal(existsSync(join(codexHome, "hooks", "graphify-context.mjs")), false);
      assert.equal(existsSync(join(codexHome, "hooks", "custom-user-hook.mjs")), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("Claude global sync keeps namespaced hook package entries", () => {
    const root = mkdtempSync(join(os.tmpdir(), "meta-kim-claude-global-hooks-"));
    try {
      const claudeHome = join(root, "claude");
      mkdirSync(join(claudeHome, "hooks", "meta-kim"), { recursive: true });
      writeFileSync(
        join(claudeHome, "hooks", "meta-kim", "block-dangerous-bash.mjs"),
        "// installed by sync-global-meta-theory\n",
      );

      const result = runSyncGlobal("claude", {
        META_KIM_CLAUDE_HOME: claudeHome,
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.equal(
        existsSync(join(claudeHome, "hooks", "meta-kim", "block-dangerous-bash.mjs")),
        true,
      );

      const settings = readFileSync(join(claudeHome, "settings.json"), "utf8");
      assert.match(settings, /hooks\/meta-kim\/activate-meta-theory-spine\.mjs/);
      assert.match(settings, /hooks\/meta-kim\/block-dangerous-bash\.mjs/);
      assert.doesNotMatch(settings, /node "\\.claude\/hooks\//);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("global target filtering does not touch Claude home when only Codex is selected", () => {
    const root = mkdtempSync(join(os.tmpdir(), "meta-kim-global-target-filter-"));
    try {
      const claudeHome = join(root, "claude");
      const codexHome = join(root, "codex");
      mkdirSync(claudeHome, { recursive: true });
      const sentinel = `${JSON.stringify({ hooks: { Stop: [{ hooks: [{ command: "node user-stop.js" }] }] } }, null, 2)}\n`;
      writeFileSync(join(claudeHome, "settings.json"), sentinel);

      const result = runSyncGlobal("codex", {
        META_KIM_CLAUDE_HOME: claudeHome,
        META_KIM_CODEX_HOME: codexHome,
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.equal(readFileSync(join(claudeHome, "settings.json"), "utf8"), sentinel);
      assert.equal(existsSync(join(claudeHome, "hooks", "meta-kim")), false);
      assert.equal(existsSync(join(codexHome, "hooks", "meta-kim")), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("global target filtering does not touch Codex home when only Claude is selected", () => {
    const root = mkdtempSync(join(os.tmpdir(), "meta-kim-global-target-filter-"));
    try {
      const claudeHome = join(root, "claude");
      const codexHome = join(root, "codex");
      mkdirSync(codexHome, { recursive: true });
      const sentinel = `${JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [{ command: "node user-hook.mjs" }] }] } }, null, 2)}\n`;
      writeFileSync(join(codexHome, "hooks.json"), sentinel);

      const result = runSyncGlobal("claude", {
        META_KIM_CLAUDE_HOME: claudeHome,
        META_KIM_CODEX_HOME: codexHome,
      });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      assert.equal(readFileSync(join(codexHome, "hooks.json"), "utf8"), sentinel);
      assert.equal(existsSync(join(codexHome, "hooks", "meta-kim")), false);
      assert.equal(existsSync(join(claudeHome, "settings.json")), true);
      assert.equal(existsSync(join(claudeHome, "hooks", "meta-kim")), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("shared hook backup is not a canonical runtime asset", () => {
    assert.equal(
      existsSync(
        join(
          repoRoot,
          "canonical/runtime-assets/shared/hooks/skip-reminder.mjs.bak",
        ),
      ),
      false,
    );
  });
});
