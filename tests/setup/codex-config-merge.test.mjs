import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertCodexConfigTomlMergeable,
  ensureCodexAppNativeControls,
  ensureCodexWindowsNotifyCompat,
  ensureCodexRequestUserInputFeature,
  hasCodexRequestUserInputFeature,
  mergeCodexConfigAddOnly,
} from "../../scripts/codex-config-merge.mjs";

function sectionBlock(configText, sectionName) {
  const lines = String(configText).replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => line.trim() === `[${sectionName}]`);
  if (start < 0) return "";
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*\[[^\]]+\]\s*(?:#.*)?$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

describe("Codex config merge", () => {
  test("adds features section when missing", () => {
    const out = ensureCodexRequestUserInputFeature('model = "gpt-5.5"\n');
    assert.match(out, /\[features\]\ndefault_mode_request_user_input = true/);
    assert.equal(hasCodexRequestUserInputFeature(out), true);
  });

  test("enables existing false value without changing unrelated settings", () => {
    const input = [
      'model = "gpt-5.5"',
      "",
      "[features]",
      "multi_agent = true",
      "default_mode_request_user_input = false",
      "",
      "[agents]",
      "max_threads = 6",
      "",
    ].join("\n");

    const out = ensureCodexRequestUserInputFeature(input);
    assert.match(out, /multi_agent = true/);
    assert.match(out, /default_mode_request_user_input = true/);
    assert.match(out, /\[agents\]\nmax_threads = 6/);
    assert.equal(hasCodexRequestUserInputFeature(out), true);
  });

  test("inserts into existing features section before the next table", () => {
    const input = [
      "[features]",
      "multi_agent = true",
      "[mcp_servers.github]",
      'command = "npx"',
      "",
    ].join("\n");

    const out = ensureCodexRequestUserInputFeature(input);
    assert.match(
      out,
      /\[features\]\nmulti_agent = true\ndefault_mode_request_user_input = true\n\[mcp_servers\.github\]/,
    );
  });

  test("rejects unclosed TOML arrays before Codex feature merges", () => {
    const invalid = [
      "notify = [",
      '  "terminal-notifier"',
      "multi_agent = true",
      "",
    ].join("\n");

    assert.throws(
      () => ensureCodexRequestUserInputFeature(invalid),
      (error) => {
        assert.equal(error.name, "CodexConfigTomlError");
        assert.match(error.message, /line 3:1/);
        assert.match(error.message, /array opened at line 1:10/);
        assert.match(error.message, /multi_agent = true/);
        assert.match(error.message, /\[features\]/);
        assert.match(error.message, /missing comma or closing bracket/);
        return true;
      },
    );
    assert.throws(
      () => mergeCodexConfigAddOnly(invalid, "[features]\njs_repl = true\n"),
      /Codex config\.toml is not safe to merge/,
    );
    assert.throws(
      () => ensureCodexAppNativeControls(invalid, { platformName: "darwin" }),
      /Codex config\.toml is not safe to merge/,
    );
  });

  test("allows valid multiline TOML arrays before feature merges", () => {
    const valid = [
      "notify = [",
      '  "terminal-notifier",',
      '  "-message",',
      '  "done"',
      "]",
      "",
      "[features]",
      "multi_agent = true",
      "",
    ].join("\n");

    assert.doesNotThrow(() => assertCodexConfigTomlMergeable(valid));
    const out = ensureCodexRequestUserInputFeature(valid);
    assert.match(out, /notify = \[/);
    assert.match(out, /\[features\]\nmulti_agent = true\ndefault_mode_request_user_input = true/);
  });

  test("replaces macOS terminal-notifier with Windows-safe no-op notify", () => {
    const input = [
      'approval_policy = "on-request"',
      "notify = [",
      '  "terminal-notifier",',
      '  "-title", "Codex ECC",',
      '  "-message", "Task completed!",',
      "]",
      "",
      "[features]",
      "multi_agent = true",
      "",
    ].join("\n");

    const out = ensureCodexWindowsNotifyCompat(input, "win32");
    assert.doesNotMatch(out, /terminal-notifier/);
    assert.match(out, /notify = \[/);
    assert.match(out, /"powershell\.exe"/);
    assert.match(out, /\$input \| Out-Null/);
    assert.match(out, /\[features\]\nmulti_agent = true/);
  });

  test("leaves terminal-notifier unchanged on non-Windows platforms", () => {
    const input = 'notify = ["terminal-notifier", "-message", "done"]\n';
    const out = ensureCodexWindowsNotifyCompat(input, "darwin");
    assert.equal(out, input);
  });

  test("prefers Codex computer-use helper notify on Windows when present", () => {
    const codexHome = mkdtempSync(path.join(os.tmpdir(), "meta-kim-codex-home-"));
    const helperPath = path.join(
      codexHome,
      "plugins",
      "cache",
      "openai-bundled",
      "computer-use",
      "26.602.71036",
      "node_modules",
      "@oai",
      "sky",
      "bin",
      "windows",
      "codex-computer-use.exe",
    );
    mkdirSync(path.dirname(helperPath), { recursive: true });
    const input = 'notify = ["terminal-notifier", "-message", "done"]\n';

    const out = ensureCodexWindowsNotifyCompat(input, "win32", {
      codexHome,
      pathExists: (candidate) => candidate === helperPath,
    });

    assert.doesNotMatch(out, /terminal-notifier/);
    assert.match(out, /codex-computer-use\.exe/);
    assert.match(out, /"turn-ended"/);
    assert.doesNotMatch(out, /\$input \| Out-Null/);
  });

  test("restores Windows Codex App native controls after ECC config overwrite", () => {
    const bundledSource = path.join(
      mkdtempSync(path.join(os.tmpdir(), "meta-kim-codex-app-")),
      "app",
      "resources",
      "plugins",
      "openai-bundled",
    );
    mkdirSync(bundledSource, { recursive: true });
    const input = [
      'model = "gpt-5.5"',
      "notify = [",
      '  "terminal-notifier",',
      '  "-message", "Task completed!",',
      "]",
      "",
      "[features]",
      "multi_agent = true",
      "default_mode_request_user_input = false",
      "",
      "[mcp_servers.github]",
      'command = "npx"',
      "",
      "[hooks]",
      'stop = "scripts/stop.mjs"',
      "",
      "[agents.frontend]",
      'model = "gpt-5.4"',
      "",
      '[projects."D:/KimProject/Meta_Kim"]',
      'trust_level = "trusted"',
      "",
      "[windows]",
      'sandbox = "elevated"',
      "",
      '[plugins."browser@openai-bundled"]',
      "enabled = false",
      "",
      "[marketplaces.openai-bundled]",
      'source_type = "local"',
      "source = '\\\\?\\C:\\Users\\Kim\\.codex\\.tmp\\bundled-marketplaces\\openai-bundled'",
      "",
    ].join("\n");

    const out = ensureCodexAppNativeControls(input, {
      platformName: "win32",
      bundledMarketplaceSource: bundledSource,
      pathExists: (candidate) =>
        candidate.replace(/^\\\\\?\\/, "") === bundledSource,
    });

    assert.doesNotMatch(out, /terminal-notifier/);
    assert.match(out, /"powershell\.exe"/);
    assert.match(out, /default_mode_request_user_input = true/);
    assert.match(out, /js_repl = true/);
    assert.match(out, /\[windows\]\nsandbox = "unelevated"/);
    assert.match(out, /\[plugins\."browser@openai-bundled"\]\nenabled = true/);
    assert.match(out, /\[plugins\."chrome@openai-bundled"\]\nenabled = true/);
    assert.match(out, /\[plugins\."computer-use@openai-bundled"\]\nenabled = true/);
    assert.match(out, /\[marketplaces\.openai-bundled\][\s\S]*source_type = "local"/);
    const expectedSource = /^[A-Za-z]:\\/.test(bundledSource)
      ? `\\\\?\\${bundledSource}`
      : bundledSource;
    assert.ok(out.includes(`source = '${expectedSource}'`));
    assert.doesNotMatch(out, /\\.codex\\.tmp\\bundled-marketplaces\\openai-bundled/i);
    assert.match(out, /\[mcp_servers\.github\]\ncommand = "npx"/);
    assert.match(out, /\[hooks\]\nstop = "scripts\/stop\.mjs"/);
    assert.match(out, /\[agents\.frontend\]\nmodel = "gpt-5.4"/);
    assert.match(out, /\[projects\."D:\/KimProject\/Meta_Kim"\]\ntrust_level = "trusted"/);
  });

  test("does not add Windows-only App plugin blocks on non-Windows platforms", () => {
    const input = [
      "[features]",
      "multi_agent = true",
      "",
    ].join("\n");

    const out = ensureCodexAppNativeControls(input, { platformName: "linux" });

    assert.match(out, /js_repl = true/);
    assert.doesNotMatch(out, /\[windows\]/);
    assert.doesNotMatch(out, /openai-bundled/);
  });

  test("merges ECC overwrite output add-only into the original user config", () => {
    const originalUserConfig = [
      'approval_policy = "never"',
      'sandbox_mode = "workspace-write"',
      "",
      "[features]",
      "multi_agent = false",
      "",
      "[mcp_servers.private]",
      'command = "node"',
      'args = ["private-server.mjs"]',
      "",
      "[hooks]",
      'stop = "scripts/user-stop.mjs"',
      "",
      "[agents.custom]",
      'description = "User custom agent"',
      "",
      '[projects."D:/User/Project"]',
      'trust_level = "trusted"',
      "",
    ].join("\n");
    const eccOverwriteConfig = [
      'approval_policy = "on-request"',
      'sandbox_mode = "read-only"',
      'web_search = "live"',
      "",
      "[features]",
      "multi_agent = true",
      "",
      "[mcp_servers.context7]",
      'command = "npx"',
      'args = ["-y", "@upstash/context7-mcp@latest"]',
      "",
      "[agents.explorer]",
      'description = "ECC explorer"',
      "",
    ].join("\n");

    const out = mergeCodexConfigAddOnly(originalUserConfig, eccOverwriteConfig);

    assert.match(out, /approval_policy = "never"/);
    assert.match(out, /sandbox_mode = "workspace-write"/);
    assert.match(out, /web_search = "live"/);
    assert.match(out, /\[features\]\nmulti_agent = false/);
    assert.match(out, /\[mcp_servers\.private\]\ncommand = "node"\nargs = \["private-server\.mjs"\]/);
    assert.match(out, /\[mcp_servers\.context7\]\ncommand = "npx"\nargs = \["-y", "@upstash\/context7-mcp@latest"\]/);
    assert.match(out, /\[hooks\]\nstop = "scripts\/user-stop\.mjs"/);
    assert.match(out, /\[agents\.custom\]\ndescription = "User custom agent"/);
    assert.match(out, /\[agents\.explorer\]\ndescription = "ECC explorer"/);
    assert.match(out, /\[projects\."D:\/User\/Project"\]\ntrust_level = "trusted"/);
    assert.doesNotMatch(out, /approval_policy = "on-request"/);
    assert.doesNotMatch(out, /sandbox_mode = "read-only"/);
  });

  test("normalizes MCP server when upstream replaces remote url with stdio command", () => {
    const originalUserConfig = [
      "[mcp_servers.exa]",
      'url = "https://mcp.exa.ai/mcp"',
      "enabled = false",
      "",
    ].join("\n");
    const upstreamConfig = [
      "[mcp_servers.exa]",
      'command = "npx"',
      'args = ["-y", "mcp-remote", "https://mcp.exa.ai/mcp"]',
      "startup_timeout_sec = 30",
      "",
    ].join("\n");

    const out = mergeCodexConfigAddOnly(originalUserConfig, upstreamConfig);
    const exa = sectionBlock(out, "mcp_servers.exa");

    assert.match(exa, /command = "npx"/);
    assert.match(
      exa,
      /args = \["-y", "mcp-remote", "https:\/\/mcp\.exa\.ai\/mcp"\]/,
    );
    assert.match(exa, /startup_timeout_sec = 30/);
    assert.match(exa, /enabled = false/);
    assert.doesNotMatch(exa, /^\s*url\s*=/m);
  });

  test("normalizes MCP server when upstream replaces stdio command with remote url", () => {
    const originalUserConfig = [
      "[mcp_servers.exa]",
      'command = "npx"',
      'args = ["-y", "mcp-remote", "https://mcp.exa.ai/mcp"]',
      "startup_timeout_sec = 30",
      "",
    ].join("\n");
    const upstreamConfig = [
      "[mcp_servers.exa]",
      'url = "https://mcp.exa.ai/mcp"',
      "startup_timeout_sec = 30",
      "",
    ].join("\n");

    const out = mergeCodexConfigAddOnly(originalUserConfig, upstreamConfig);
    const exa = sectionBlock(out, "mcp_servers.exa");

    assert.match(exa, /url = "https:\/\/mcp\.exa\.ai\/mcp"/);
    assert.match(exa, /startup_timeout_sec = 30/);
    assert.doesNotMatch(exa, /^\s*command\s*=/m);
    assert.doesNotMatch(exa, /^\s*args\s*=/m);
  });

  test("cleans an existing invalid MCP url plus stdio server during app control sync", () => {
    const input = [
      "[mcp_servers.exa]",
      'url = "https://mcp.exa.ai/mcp"',
      'command = "npx"',
      'args = ["-y", "mcp-remote", "https://mcp.exa.ai/mcp"]',
      "startup_timeout_sec = 30",
      "",
    ].join("\n");

    const out = ensureCodexAppNativeControls(input, { platformName: "linux" });
    const exa = sectionBlock(out, "mcp_servers.exa");

    assert.match(exa, /command = "npx"/);
    assert.match(
      exa,
      /args = \["-y", "mcp-remote", "https:\/\/mcp\.exa\.ai\/mcp"\]/,
    );
    assert.match(exa, /startup_timeout_sec = 30/);
    assert.doesNotMatch(exa, /^\s*url\s*=/m);
    assert.match(out, /default_mode_request_user_input = true/);
  });
});
