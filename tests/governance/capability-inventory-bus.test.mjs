import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

test("capability inventory bus emits unified multi-source provider records", () => {
  const result = spawnSync(process.execPath, ["scripts/build-capability-inventory.mjs"], {
    encoding: "utf8",
    timeout: 120_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const inventory = JSON.parse(
    readFileSync(".meta-kim/state/default/capability-inventory.json", "utf8"),
  );
  const providerTypes = new Set(inventory.capabilities.map((record) => record.providerType));

  for (const providerType of [
    "agent",
    "skill",
    "script",
    "tool",
    "MCP",
    "hook",
    "runtime",
    "OS",
    "memory",
    "graph",
    "external",
  ]) {
    assert.ok(providerTypes.has(providerType), `missing providerType ${providerType}`);
  }

  for (const record of inventory.capabilities) {
    for (const field of [
      "id",
      "providerType",
      "sourcePath",
      "runtimeSupport",
      "riskLevel",
      "ownerBoundary",
      "canExecute",
      "canReview",
      "canVerify",
      "canCreateOrUpgrade",
      "missingDependencies",
      "confidence",
      "reason",
    ]) {
      assert.ok(Object.hasOwn(record, field), `${record.id} missing ${field}`);
    }
  }

  const sourcePaths = new Set(inventory.capabilities.map((record) => record.sourcePath));
  for (const sourcePath of [
    "canonical/agents/meta-warden.md",
    ".codex/agents/meta-warden.toml",
    ".claude/agents/meta-warden.md",
    ".cursor/agents/meta-warden.md",
    "openclaw/workspaces/meta-warden/SOUL.md",
    ".mcp.json",
    "scripts/mcp/meta-runtime-server.mjs",
    "config/runtime-capability-matrix.json",
    "config/os-compatibility-matrix.json",
    "graphify-out/GRAPH_REPORT.md",
  ]) {
    assert.ok(sourcePaths.has(sourcePath), `missing source path ${sourcePath}`);
  }

  assert.ok(inventory.summary.total > 250);
  assert.ok(inventory.summary.byProviderType.MCP >= 1);
  assert.ok(inventory.summary.byProviderType.hook >= 1);
  assert.ok(inventory.summary.byProviderType.runtime >= 1);

  const byId = new Map(inventory.capabilities.map((record) => [record.id, record]));
  for (const configId of [
    "project-mcp-config",
    "cursor-mcp-config",
    "codex-mcp-config",
    "claude-settings",
    "codex-hooks",
    "cursor-hooks",
  ]) {
    const record = byId.get(configId);
    assert.ok(record, `missing config record ${configId}`);
    assert.equal(record.routeEligibility, "reference", `${configId} must be reference-only`);
    assert.equal(record.canExecute, false, `${configId} must not be executable`);
  }
  assert.equal(byId.get("meta-kim-runtime-mcp-server")?.canExecute, true);
});
