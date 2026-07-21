import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sanitizeGraphifyWindowsHooks } from "../../scripts/graphify-hook-sanitize.mjs";

const BACKSLASH_HOOK = {
  type: "command",
  command: String.raw`C:\Users\Kim\Python\Scripts\graphify.EXE hook-guard read`,
};

function writeHookSettings(dir, settings) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  const settingsPath = join(dir, ".claude", "settings.json");
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  return settingsPath;
}

describe("sanitizeGraphifyWindowsHooks()", () => {
  test("rewrites graphify Windows shell-form hook to direct-spawn command + args", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-sanitize-"));
    const settingsPath = writeHookSettings(dir, {
      hooks: { PreToolUse: [{ matcher: "Read|Glob", hooks: [BACKSLASH_HOOK] }] },
    });

    const result = sanitizeGraphifyWindowsHooks(settingsPath, { platform: "win32" });
    assert.equal(result.changed, true);
    assert.equal(result.count, 1);

    const saved = JSON.parse(readFileSync(settingsPath, "utf8"));
    const hook = saved.hooks.PreToolUse[0].hooks[0];
    assert.equal(hook.command, String.raw`C:\Users\Kim\Python\Scripts\graphify.EXE`);
    assert.deepEqual(hook.args, ["hook-guard", "read"]);
  });

  test("is a no-op on non-win32 platforms", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-sanitize-"));
    const settingsPath = writeHookSettings(dir, {
      hooks: { PreToolUse: [{ matcher: "Read|Glob", hooks: [BACKSLASH_HOOK] }] },
    });

    const result = sanitizeGraphifyWindowsHooks(settingsPath, { platform: "linux" });
    assert.equal(result.changed, false);
    assert.equal(result.count, 0);
  });

  test("is idempotent (second run is a no-op)", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-sanitize-"));
    const settingsPath = writeHookSettings(dir, {
      hooks: { PreToolUse: [{ matcher: "Read|Glob", hooks: [BACKSLASH_HOOK] }] },
    });

    sanitizeGraphifyWindowsHooks(settingsPath, { platform: "win32" });
    const second = sanitizeGraphifyWindowsHooks(settingsPath, { platform: "win32" });
    assert.equal(second.changed, false);
    assert.equal(second.count, 0);
  });

  test("writes a backup file alongside the repaired settings", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-sanitize-"));
    const settingsPath = writeHookSettings(dir, {
      hooks: { PreToolUse: [{ matcher: "Read|Glob", hooks: [BACKSLASH_HOOK] }] },
    });

    const original = readFileSync(settingsPath, "utf8");
    const result = sanitizeGraphifyWindowsHooks(settingsPath, {
      platform: "win32",
      now: new Date("2026-07-21T00:00:00.123Z"),
    });
    assert.equal(typeof result.backup, "string");
    assert.ok(result.backup.includes(".backup-"));

    const backups = readdirSync(join(dir, ".claude")).filter((name) =>
      name.startsWith("settings.json.backup-"),
    );
    assert.deepEqual(backups, ["settings.json.backup-2026-07-21T00-00-00-123Z-graphify"]);
    assert.equal(readFileSync(result.backup, "utf8"), original);
  });

  test("fails closed when the required backup cannot be written", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-sanitize-"));
    const settingsPath = writeHookSettings(dir, {
      hooks: { PreToolUse: [{ matcher: "Read|Glob", hooks: [BACKSLASH_HOOK] }] },
    });
    const original = readFileSync(settingsPath, "utf8");

    assert.throws(
      () => sanitizeGraphifyWindowsHooks(settingsPath, {
        platform: "win32",
        writeFile(filePath, ...args) {
          if (String(filePath).includes(".backup-")) {
            throw new Error("simulated backup failure");
          }
          return writeFileSync(filePath, ...args);
        },
      }),
      /backup creation failed/,
    );
    assert.equal(readFileSync(settingsPath, "utf8"), original);
  });

  test("keeps the original settings when the atomic replacement fails", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-sanitize-"));
    const settingsPath = writeHookSettings(dir, {
      hooks: { PreToolUse: [{ matcher: "Read|Glob", hooks: [BACKSLASH_HOOK] }] },
    });
    const original = readFileSync(settingsPath, "utf8");

    assert.throws(
      () => sanitizeGraphifyWindowsHooks(settingsPath, {
        platform: "win32",
        renameFile() {
          throw new Error("simulated replace failure");
        },
      }),
      /original backup is/,
    );
    assert.equal(readFileSync(settingsPath, "utf8"), original);
  });

  test("leaves non-graphify shell-form hooks untouched", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-sanitize-"));
    const settingsPath = writeHookSettings(dir, {
      hooks: {
        PreToolUse: [
          {
            matcher: "Read|Glob",
            hooks: [
              { type: "command", command: String.raw`C:\Users\Kim\bin\other-tool.EXE run` },
            ],
          },
        ],
      },
    });

    const result = sanitizeGraphifyWindowsHooks(settingsPath, { platform: "win32" });
    assert.equal(result.changed, false);
    assert.equal(result.count, 0);
  });

  test("returns unchanged when settings file is missing", () => {
    const result = sanitizeGraphifyWindowsHooks(
      join(tmpdir(), "missing-graphify-dir", ".claude", "settings.json"),
      { platform: "win32" },
    );
    assert.equal(result.changed, false);
    assert.equal(result.count, 0);
  });

  test("preserves permissions and sibling hooks while rewriting", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-sanitize-"));
    const settingsPath = writeHookSettings(dir, {
      permissions: { deny: ["Read(./.env)"] },
      hooks: {
        PreToolUse: [
          {
            matcher: "Read|Glob",
            hooks: [
              BACKSLASH_HOOK,
              { type: "command", command: "node .claude/hooks/graphify-context.mjs" },
            ],
          },
        ],
      },
    });

    const result = sanitizeGraphifyWindowsHooks(settingsPath, { platform: "win32" });
    assert.equal(result.count, 1);

    const saved = JSON.parse(readFileSync(settingsPath, "utf8"));
    assert.deepEqual(saved.permissions.deny, ["Read(./.env)"]);
    const hooks = saved.hooks.PreToolUse[0].hooks;
    assert.equal(hooks[0].command, String.raw`C:\Users\Kim\Python\Scripts\graphify.EXE`);
    assert.deepEqual(hooks[0].args, ["hook-guard", "read"]);
    assert.equal(hooks[1].command, "node .claude/hooks/graphify-context.mjs");
    assert.equal(Object.hasOwn(hooks[1], "args"), false);
  });

  test("preserves command metadata on the rewritten Graphify hook", () => {
    const dir = mkdtempSync(join(tmpdir(), "graphify-sanitize-"));
    const settingsPath = writeHookSettings(dir, {
      hooks: {
        PreToolUse: [{
          matcher: "Read",
          hooks: [{ ...BACKSLASH_HOOK, timeout: 25, statusMessage: "Graph lookup" }],
        }],
      },
    });

    sanitizeGraphifyWindowsHooks(settingsPath, { platform: "win32" });
    const hook = JSON.parse(readFileSync(settingsPath, "utf8"))
      .hooks.PreToolUse[0].hooks[0];
    assert.equal(hook.timeout, 25);
    assert.equal(hook.statusMessage, "Graph lookup");
  });
});
