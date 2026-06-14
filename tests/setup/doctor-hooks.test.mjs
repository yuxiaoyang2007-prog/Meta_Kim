import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { extractCommandPath } from "../../scripts/doctor-hooks.mjs";

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
