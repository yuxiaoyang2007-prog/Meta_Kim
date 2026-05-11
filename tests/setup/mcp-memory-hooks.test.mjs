import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

function readRepoFile(...segments) {
  return readFileSync(path.join(repoRoot, ...segments), "utf8");
}

describe("MCP memory cross-runtime hooks", () => {
  test("shared hook supports lifecycle save and lookup", () => {
    const source = readRepoFile(
      "canonical",
      "runtime-assets",
      "shared",
      "hooks",
      "meta-kim-memory-save.mjs",
    );

    assert.match(source, /session-start/);
    assert.match(source, /user-prompt/);
    assert.match(source, /\/api\/search/);
    assert.match(source, /n_results/);
    assert.match(source, /memory_type:\s*"observation"/);
    assert.doesNotMatch(source, /memoryTypeForEvent/);
    assert.doesNotMatch(source, /legacy_memory_type/);
    assert.doesNotMatch(source, /\/api\/memories\/search/);
    assert.match(source, /systemMessage/);
    assert.match(source, /node:https/);
    assert.match(source, /url\.protocol === "https:" \? https : http/);
  });

  test("Claude stop memory hook writes correct memory type", () => {
    const source = readRepoFile(
      "canonical",
      "runtime-assets",
      "claude",
      "hooks",
      "stop-memory-save.mjs",
    );

    assert.match(source, /memory_type:\s*"observation"/);
    assert.doesNotMatch(source, /legacy_memory_type/);
    assert.doesNotMatch(source, /memory_type:\s*"session-summary"/);
  });

  test("installer registers Codex and Cursor lifecycle events", () => {
    const source = readRepoFile("scripts", "install-mcp-memory-hooks.mjs");

    assert.match(source, /settings\.hooks\.SessionStart/);
    assert.match(source, /settings\.hooks\.UserPromptSubmit/);
    assert.match(source, /settings\.hooks\.Stop/);
    assert.match(source, /settings\.hooks\.beforeSubmitPrompt/);
    assert.match(source, /settings\.hooks\.stop/);
  });

  test("installer uses PATH-resolved node for shell-portable hook commands", () => {
    const source = readRepoFile("scripts", "install-mcp-memory-hooks.mjs");

    assert.match(source, /return \["node", hookPath, \.\.\.args\]/);
    assert.doesNotMatch(source, /\[process\.execPath, hookPath/);
  });

  test("OpenClaw managed hook is packaged", () => {
    const hookMd = readRepoFile(
      "canonical",
      "runtime-assets",
      "openclaw",
      "hooks",
      "mcp-memory-service",
      "HOOK.md",
    );
    const handler = readRepoFile(
      "canonical",
      "runtime-assets",
      "openclaw",
      "hooks",
      "mcp-memory-service",
      "handler.ts",
    );

    assert.match(hookMd, /command:new/);
    assert.match(hookMd, /command:stop/);
    assert.match(handler, /\/api\/memories/);
    assert.match(handler, /memory_type:\s*"observation"/);
    assert.doesNotMatch(handler, /memoryType/);
    assert.doesNotMatch(handler, /legacyMemoryType/);
    assert.doesNotMatch(handler, /legacy_memory_type/);
    assert.doesNotMatch(handler, /return "session-summary"/);
  });

  test("boot autostart uses health-checked launchers with user-visible failure notices", () => {
    const source = readRepoFile("setup.mjs");

    assert.match(source, /const shellQuote = \(value\) =>/);
    assert.match(source, /const psSingleQuote = \(value\) =>/);
    assert.match(source, /mcpMemoryAutoStartFailureTitle/);
    assert.match(source, /mcpMemoryAutoStartFailureMessage/);
    assert.match(source, /启动失败/);
    assert.match(source, /起動に失敗/);
    assert.match(source, /시작하지 못했거나/);
    assert.match(source, /const metaKimDir = join\(homedir\(\), "\.meta-kim"\)/);
    assert.match(source, /const psPath = join\(metaKimDir, "mcp-memory-start\.ps1"\)/);
    assert.match(source, /const cmdPath = join\(metaKimDir, "mcp-memory-start\.cmd"\)/);
    assert.match(source, /const vbsPath = join\(startupDir, "mcp-memory-silent\.vbs"\)/);
    assert.match(source, /const legacyCmdPath = join\(startupDir, "mcp-memory-start\.cmd"\)/);
    assert.match(source, /rmSync\(legacyCmdPath, \{ force: true \}\)/);
    assert.match(source, /function Test-MetaKimMemoryHealth/);
    assert.match(source, /http:\/\/127\.0\.0\.1:8000\/api\/health/);
    assert.match(source, /Start-Process -FilePath \$memoryBin/);
    assert.match(source, /System\.Windows\.MessageBox/);
    assert.match(source, /\[System\.Windows\.MessageBox\]::Show\(\$failureMessage, \$failureTitle/);
    assert.doesNotMatch(source, /const cmdPath = join\(startupDir, "mcp-memory-start\.cmd"\)/);

    assert.match(source, /const scriptPath = join\(metaKimDir, "mcp-memory-start\.sh"\)/);
    assert.match(source, /curl -fsS --max-time 3 http:\/\/127\.0\.0\.1:8000\/api\/health/);
    assert.match(source, /TITLE=\$\{shellQuote\(failureTitle\)\}/);
    assert.match(source, /MSG=\$\{shellQuote\(failureMessage\)\}/);
    assert.match(source, /osascript -e "display dialog/);
    assert.match(source, /notify-send "\$TITLE" "\$MSG"/);
    assert.match(source, /zenity --warning/);
    assert.match(source, /kdialog --sorry/);
    assert.match(source, /xmessage -center/);
    assert.match(source, /Exec=\/bin\/sh "\$\{scriptPath\}"/);
    assert.match(source, /<string>\/bin\/sh<\/string><string>\$\{scriptPath\}<\/string>/);
  });
});
