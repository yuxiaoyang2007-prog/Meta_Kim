import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

describe("eval-meta-agents Claude smoke", () => {
  test("Windows CLI search includes npm-style ~/.local shims before native bin", () => {
    const source = readFileSync(
      path.join(repoRoot, "scripts", "eval-meta-agents.mjs"),
      "utf8",
    );
    const searchDirs = source.match(
      /function getWindowsCliSearchDirs\(\) \{[\s\S]*?\n\}/,
    )?.[0];

    assert.ok(searchDirs);
    assert.ok(
      searchDirs.indexOf('path.join(up, ".local")') <
        searchDirs.indexOf('path.join(up, ".local", "bin")'),
    );
  });

  test("Claude discovery falls back to project agent files when CLI lacks agents command", () => {
    const source = readFileSync(
      path.join(repoRoot, "scripts", "eval-meta-agents.mjs"),
      "utf8",
    );
    const discovery = source.match(
      /async function runClaudeDiscovery\(agentIds\) \{[\s\S]*?\n\}/,
    )?.[0];

    assert.ok(discovery);
    assert.match(discovery, /cmd\.toArgs\(\["--help"\]\)/);
    assert.match(discovery, /supportsAgentsCommand/);
    assert.match(discovery, /\.claude", "agents"/);
    assert.match(discovery, /source: "project-files"/);
    assert.match(discovery, /source: "claude-agents-command"/);
    assert.match(discovery, /claude-agents-command-unavailable/);
    assert.match(discovery, /claude-agents-command-non-tty/);
  });

  test("OpenClaw smoke can structurally validate without local auth secrets", () => {
    const source = readFileSync(
      path.join(repoRoot, "scripts", "eval-meta-agents.mjs"),
      "utf8",
    );

    assert.match(source, /function isMissingOpenClawAuthError/);
    assert.match(source, /async function runOpenClawStructuralSmoke/);
    assert.match(source, /openclaw_auth_not_configured/);
    assert.match(source, /source: "structural-template"/);
  });
});
