import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  detectHookRuntimeIncompatibility,
  extractCommandPath,
  findProjectSettings,
  projectRootFromArgs,
  removeZombies,
  resolveHookTargetPath,
  scanSettingsFile,
} from "../../scripts/doctor-hooks.mjs";

function withTempProject(run) {
  const root = mkdtempSync(path.join(tmpdir(), "meta-kim-hook-doctor-"));
  try {
    mkdirSync(path.join(root, ".claude", "hooks"), { recursive: true });
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function writeSettings(root, command) {
  const settingsPath = path.join(root, ".claude", "settings.json");
  writeFileSync(settingsPath, JSON.stringify({
    hooks: {
      PostToolUse: [{
        matcher: "Write|Edit",
        hooks: [{ type: "command", command }],
      }],
    },
  }, null, 2));
  return settingsPath;
}

describe("doctor-hooks extractCommandPath", () => {
  test("should detect direct script command correctly", () => {
    assert.strictEqual(
      extractCommandPath("./hook.sh"),
      "./hook.sh"
    );
    assert.strictEqual(
      extractCommandPath(".claude/hooks/foo.mjs"),
      ".claude/hooks/foo.mjs"
    );
    assert.strictEqual(
      extractCommandPath(".claude/hooks/foo.js"),
      ".claude/hooks/foo.js"
    );
  });

  test("should skip known runner and return correct script target", () => {
    assert.strictEqual(
      extractCommandPath("node .claude/hooks/foo.mjs"),
      ".claude/hooks/foo.mjs"
    );
    assert.strictEqual(
      extractCommandPath("python3 C:/repo/hooks/memory.py"),
      "C:/repo/hooks/memory.py"
    );
    assert.strictEqual(
      extractCommandPath("python C:/repo/hooks/memory.py"),
      "C:/repo/hooks/memory.py"
    );
    assert.strictEqual(
      extractCommandPath("bash ./hook.sh"),
      "./hook.sh"
    );
  });

  test("should skip runner with absolute or windows executable paths", () => {
    assert.strictEqual(
      extractCommandPath("C:/node/node.exe C:/repo/.claude/hooks/x.mjs"),
      "C:/repo/.claude/hooks/x.mjs"
    );
    assert.strictEqual(
      extractCommandPath("C:\\Python312\\python.exe C:\\repo\\.claude\\hooks\\memory.py"),
      "C:\\repo\\.claude\\hooks\\memory.py"
    );
    assert.strictEqual(
      extractCommandPath("/usr/bin/python3 /usr/local/bin/hook.py"),
      "/usr/local/bin/hook.py"
    );
  });

  test("should handle quoted paths and spaces correctly", () => {
    assert.strictEqual(
      extractCommandPath('"C:\\Program Files\\nodejs\\node.exe" .claude/hooks/foo.mjs'),
      ".claude/hooks/foo.mjs"
    );
    assert.strictEqual(
      extractCommandPath('node "C:/My Folder/hooks/foo.js"'),
      "C:/My Folder/hooks/foo.js"
    );
  });

  test("should handle recursive shell command payloads", () => {
    assert.strictEqual(
      extractCommandPath('sh -c "node .claude/hooks/foo.mjs"'),
      ".claude/hooks/foo.mjs"
    );
    assert.strictEqual(
      extractCommandPath('bash -c "./hook.sh"'),
      "./hook.sh"
    );
    assert.strictEqual(
      extractCommandPath('pwsh -Command .claude/hooks/foo.ps1'),
      ".claude/hooks/foo.ps1"
    );
    assert.strictEqual(
      extractCommandPath('bash -lc "node .claude/hooks/foo.mjs"'),
      ".claude/hooks/foo.mjs"
    );
    assert.strictEqual(
      extractCommandPath('bash -lc "cd C:/repo && node .claude/hooks/foo.mjs"'),
      ".claude/hooks/foo.mjs"
    );
    assert.strictEqual(
      extractCommandPath('sh -c "cd C:/repo && node .claude/hooks/foo.mjs"'),
      ".claude/hooks/foo.mjs"
    );
    assert.strictEqual(
      extractCommandPath('sh -c "cd C:/repo; node .claude/hooks/foo.mjs"'),
      ".claude/hooks/foo.mjs"
    );
    assert.strictEqual(
      extractCommandPath("C:/repo"),
      null
    );
  });

  test("should handle node loader, import and experimental options", () => {
    assert.strictEqual(
      extractCommandPath('node --experimental-loader ts-node/esm .claude/hooks/foo.ts'),
      ".claude/hooks/foo.ts"
    );
    assert.strictEqual(
      extractCommandPath('node --import ./.claude/hooks/setup.mjs .claude/hooks/foo.mjs'),
      ".claude/hooks/foo.mjs"
    );
  });

  test("should return null for unrecognized/non-script commands (regression/false-positives check)", () => {
    assert.strictEqual(
      extractCommandPath("echo hello"),
      null
    );
    assert.strictEqual(
      extractCommandPath("cmd /c .claude/hooks/foo.mjs"),
      ".claude/hooks/foo.mjs"
    );
    assert.strictEqual(
      extractCommandPath("cmd.exe /c C:/repo/.claude/hooks/foo.mjs"),
      "C:/repo/.claude/hooks/foo.mjs"
    );
    assert.strictEqual(
      extractCommandPath("npx tsx .claude/hooks/foo.ts"),
      ".claude/hooks/foo.ts"
    );
    assert.strictEqual(
      extractCommandPath("node -r ts-node/register .claude/hooks/foo.ts"),
      ".claude/hooks/foo.ts"
    );
    assert.strictEqual(
      extractCommandPath("python -m pip install"),
      null
    );
    assert.strictEqual(
      extractCommandPath("python -m my_module.hook"),
      null
    );
  });

  test("should fallback to null appropriately", () => {
    assert.strictEqual(
      extractCommandPath(""),
      null
    );
    assert.strictEqual(
      extractCommandPath("node"),
      null
    );
  });
});

describe("doctor-hooks project-aware runtime diagnostics", () => {
  test("resolves an explicit project root before the caller cwd", () => {
    withTempProject((root) => {
      const settingsPath = writeSettings(root, "node .claude/hooks/hook.mjs");
      assert.strictEqual(projectRootFromArgs(["--project-root", root], "C:/ignored"), root);
      assert.strictEqual(findProjectSettings(root), settingsPath);
      assert.strictEqual(projectRootFromArgs([], root), root);
    });
  });

  test("rejects a missing --project-root value", () => {
    assert.throws(
      () => projectRootFromArgs(["--project-root", "--project"], process.cwd()),
      /requires a path/u,
    );
  });

  test("resolves relative hook commands from the project containing settings.json", () => {
    withTempProject((root) => {
      const hookPath = path.join(root, ".claude", "hooks", "hook.mjs");
      writeFileSync(hookPath, "export {};\n");
      const settingsPath = writeSettings(root, "node .claude/hooks/hook.mjs");
      assert.strictEqual(
        resolveHookTargetPath(".claude/hooks/hook.mjs", settingsPath),
        hookPath,
      );
      const result = scanSettingsFile(settingsPath);
      assert.equal(result.zombies.length, 0);
      assert.equal(result.incompatible.length, 0);
      assert.equal(result.live.length, 1);
    });
  });

  test("classifies CommonJS syntax in a type=module .js hook as incompatible", () => {
    withTempProject((root) => {
      writeFileSync(path.join(root, "package.json"), '{"type":"module"}\n');
      const hookPath = path.join(root, ".claude", "hooks", "legacy.js");
      writeFileSync(hookPath, "const fs = require('node:fs');\n");
      const settingsPath = writeSettings(root, "node .claude/hooks/legacy.js");

      const issue = detectHookRuntimeIncompatibility(hookPath);
      assert.equal(issue?.code, "esm_commonjs_mismatch");

      const result = scanSettingsFile(settingsPath);
      assert.equal(result.zombies.length, 0);
      assert.equal(result.live.length, 0);
      assert.equal(result.incompatible.length, 1);
      assert.equal(result.incompatible[0].path, hookPath);
    });
  });

  test("does not flag ESM .js or CommonJS .cjs hooks", () => {
    withTempProject((root) => {
      writeFileSync(path.join(root, "package.json"), '{"type":"module"}\n');
      const esmPath = path.join(root, ".claude", "hooks", "esm.js");
      const cjsPath = path.join(root, ".claude", "hooks", "legacy.cjs");
      writeFileSync(esmPath, "import fs from 'node:fs';\nvoid fs;\n");
      writeFileSync(cjsPath, "module.exports = {};\n");
      assert.equal(detectHookRuntimeIncompatibility(esmPath), null);
      assert.equal(detectHookRuntimeIncompatibility(cjsPath), null);
    });
  });

  test("classifies commands with no parseable target as unverified, not healthy or broken", () => {
    withTempProject((root) => {
      const settingsPath = writeSettings(root, "graphify hook-guard search");
      const result = scanSettingsFile(settingsPath);
      assert.equal(result.zombies.length, 0);
      assert.equal(result.incompatible.length, 0);
      assert.equal(result.live.length, 0);
      assert.equal(result.unverified.length, 1);
      assert.equal(result.unverified[0].command, "graphify hook-guard search");
    });
  });

  test("fix cleanup preserves commands with no parseable target", () => {
    withTempProject((root) => {
      const settingsPath = writeSettings(root, "graphify hook-guard search");
      const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
      const cleaned = removeZombies(settings, settingsPath);
      assert.equal(cleaned.removed, 0);
      assert.deepEqual(
        cleaned.settings.hooks.PostToolUse[0].hooks.map((hook) => hook.command),
        ["graphify hook-guard search"],
      );
    });
  });

  test("fix cleanup removes only missing hooks and preserves incompatible unknown hooks", () => {
    withTempProject((root) => {
      writeFileSync(path.join(root, "package.json"), '{"type":"module"}\n');
      const hookPath = path.join(root, ".claude", "hooks", "legacy.js");
      writeFileSync(hookPath, "module.exports = {};\n");
      const settingsPath = writeSettings(root, "node .claude/hooks/legacy.js");
      const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
      settings.hooks.PostToolUse[0].hooks.push({
        type: "command",
        command: "node .claude/hooks/missing.mjs",
      });

      const cleaned = removeZombies(settings, settingsPath);
      assert.equal(cleaned.removed, 1);
      assert.deepEqual(
        cleaned.settings.hooks.PostToolUse[0].hooks.map((hook) => hook.command),
        ["node .claude/hooks/legacy.js"],
      );
    });
  });
});
