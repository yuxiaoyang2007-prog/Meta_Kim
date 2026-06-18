import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
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
    },
  );

  return (result.stdout || "") + (result.stderr || "");
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

describe("runtime hook sync contract", () => {
  test("project sync does not generate repo-local hook files", () => {
    const output = runSyncCheck("claude").replace(/\\/g, "/");
    assert.doesNotMatch(output, /\.claude\/hooks\//);
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
