import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

const repoRoot = join(import.meta.dirname, "..", "..");

test("doctor-governance accepts healthy global hooks when project hooks are intentionally empty", () => {
  const root = mkdtempSync(join(os.tmpdir(), "meta-kim-doctor-global-hooks-"));
  try {
    const claudeHome = join(root, ".claude");
    const hooksDir = join(claudeHome, "hooks", "meta-kim");
    mkdirSync(hooksDir, { recursive: true });

    for (const fileName of [
      "activate-meta-theory-spine.mjs",
      "block-dangerous-bash.mjs",
      "hookprompt-adapter.mjs",
    ]) {
      writeFileSync(join(hooksDir, fileName), "// test hook\n", "utf8");
    }

    writeFileSync(
      join(claudeHome, "settings.json"),
      `${JSON.stringify(
        {
          hooks: {
            UserPromptSubmit: [
              {
                hooks: [
                  {
                    type: "command",
                    command: `node "${join(hooksDir, "activate-meta-theory-spine.mjs").replace(/\\/g, "/")}"`,
                  },
                  {
                    type: "command",
                    command: `node "${join(hooksDir, "hookprompt-adapter.mjs").replace(/\\/g, "/")}"`,
                  },
                ],
              },
            ],
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [
                  {
                    type: "command",
                    command: `node "${join(hooksDir, "block-dangerous-bash.mjs").replace(/\\/g, "/")}"`,
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const result = spawnSync(
      process.execPath,
      ["scripts/doctor-governance.mjs"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          META_KIM_CLAUDE_HOME: claudeHome,
        },
        timeout: 120_000,
      },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Claude global Meta_Kim hooks/);
    assert.doesNotMatch(result.stdout, /missing PreToolUse or PostToolUse/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("doctor-governance accepts native Claude HookPrompt before Meta_Kim spine", () => {
  const root = mkdtempSync(join(os.tmpdir(), "meta-kim-doctor-native-hookprompt-"));
  try {
    const claudeHome = join(root, ".claude");
    const hooksDir = join(claudeHome, "hooks");
    const metaKimHooksDir = join(hooksDir, "meta-kim");
    mkdirSync(metaKimHooksDir, { recursive: true });

    writeFileSync(join(hooksDir, "user-prompt-submit.js"), "// native hookprompt\n", "utf8");
    for (const fileName of [
      "activate-meta-theory-spine.mjs",
      "block-dangerous-bash.mjs",
    ]) {
      writeFileSync(join(metaKimHooksDir, fileName), "// test hook\n", "utf8");
    }

    writeFileSync(
      join(claudeHome, "settings.json"),
      `${JSON.stringify(
        {
          hooks: {
            UserPromptSubmit: [
              {
                hooks: [
                  {
                    type: "command",
                    command: `node "${join(hooksDir, "user-prompt-submit.js").replace(/\\/g, "/")}"`,
                  },
                  {
                    type: "command",
                    command: `node "${join(metaKimHooksDir, "activate-meta-theory-spine.mjs").replace(/\\/g, "/")}"`,
                  },
                ],
              },
            ],
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [
                  {
                    type: "command",
                    command: `node "${join(metaKimHooksDir, "block-dangerous-bash.mjs").replace(/\\/g, "/")}"`,
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const result = spawnSync(
      process.execPath,
      ["scripts/doctor-governance.mjs"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          META_KIM_CLAUDE_HOME: claudeHome,
        },
        timeout: 120_000,
      },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Claude global Meta_Kim hooks/);
    assert.doesNotMatch(result.stdout, /prompt entry hook/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
