import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const node = process.execPath;

function runValidator(args = []) {
  return spawnSync(node, ["scripts/validate-provider-capabilities.mjs", ...args], {
    encoding: "utf8",
  });
}

test("provider capability validator passes portable registry checks", () => {
  const result = runValidator(["--json"]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.ok(payload.summary.providers >= 10);
});

test("provider registry covers all provider kinds and required modeled providers", () => {
  const registry = JSON.parse(
    readFileSync("config/capability-index/provider-registry.json", "utf8"),
  );
  for (const type of [
    "runtime_native",
    "canonical_agent",
    "canonical_skill",
    "external_skill",
    "plugin_marketplace",
    "plugin_bundle",
    "mcp_server",
    "hook_script",
    "command",
    "rule_file",
    "dependency_project",
    "memory_provider",
    "graph_provider",
  ]) {
    assert.ok(registry.providerTypes.includes(type), `missing ${type}`);
    assert.ok(
      registry.providers.some((provider) => provider.providerType === type),
      `missing provider instance for ${type}`,
    );
  }

  for (const id of [
    "external-skill-hookprompt",
    "external-skill-planning-with-files",
    "plugin-marketplace-superpowers",
    "plugin-marketplace-ecc",
    "mcp-server-meta-kim-runtime",
    "hook-script-codex-hookprompt-adapter",
    "hook-script-cursor-hookprompt-adapter",
  ]) {
    assert.ok(registry.providers.some((provider) => provider.id === id), id);
  }

  for (const provider of registry.providers) {
    for (const field of [
      "providerKind",
      "capabilities",
      "source",
      "trust",
      "installMethod",
      "runtimeAdapters",
      "osAdapters",
      "installLayers",
      "exposedArtifacts",
      "activationEvents",
      "outputContracts",
      "safetyBoundary",
      "degradation",
      "owner",
      "reviewOwner",
      "evolutionKey",
    ]) {
      assert.ok(provider[field], `${provider.id} missing ${field}`);
    }
    assert.equal(provider.providerKind, provider.providerType);
    for (const runtime of ["claude_code", "codex", "cursor", "openclaw"]) {
      assert.ok(provider.runtimeAdapters[runtime], `${provider.id} missing ${runtime} adapter`);
    }
    for (const osName of ["macos", "windows", "linux", "wsl2"]) {
      assert.ok(provider.osAdapters[osName], `${provider.id} missing ${osName} adapter`);
    }
  }
});

test("strict global hook validation checks Codex and Cursor HookPrompt adapters", () => {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "meta-kim-hooks-"));
  const codexHooks = path.join(tempDir, ".codex", "hooks.json");
  const cursorHooks = path.join(tempDir, ".cursor", "hooks.json");
  mkdirSync(path.dirname(codexHooks), { recursive: true });
  mkdirSync(path.dirname(cursorHooks), { recursive: true });
  writeFileSync(codexHooks, `${JSON.stringify({ hooks: {} }, null, 2)}\n`);
  writeFileSync(cursorHooks, `${JSON.stringify({ hooks: {} }, null, 2)}\n`);

  try {
    const result = runValidator([
      "--strict-global-hooks",
      "--codex-hooks",
      codexHooks,
      "--cursor-hooks",
      cursorHooks,
      "--json",
    ]);
    assert.notEqual(result.status, 0);
    const payload = JSON.parse(result.stdout);
    const runtimes = new Set(payload.issues.map((entry) => entry.runtimeId));
    assert.ok(runtimes.has("codex"));
    assert.ok(runtimes.has("cursor"));
    assert.match(JSON.stringify(payload.issues), /UserPromptSubmit/);
    assert.match(JSON.stringify(payload.issues), /beforeSubmitPrompt/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("HookPrompt fixer writes adapter source before registering global hooks", () => {
  const source = readFileSync("scripts/validate-provider-capabilities.mjs", "utf8");

  assert.match(source, /buildHookPromptAdapterSource/);
  assert.match(
    source,
    /fs\.writeFile\(\s*adapter,\s*buildHookPromptAdapterSource\(runtimeId\)/s,
    "fix mode must create hookprompt-adapter.mjs, not only add a hooks.json command",
  );
});

test("plugin manifest entries cannot exist only in skills.json", () => {
  const registry = JSON.parse(
    readFileSync("config/capability-index/provider-registry.json", "utf8"),
  );
  registry.providers = registry.providers.filter(
    (provider) => !provider.mappings?.skillsJsonIds?.includes("superpowers"),
  );

  const tempDir = mkdtempSync(path.join(os.tmpdir(), "meta-kim-providers-"));
  const registryPath = path.join(tempDir, "provider-registry.json");
  writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

  try {
    const result = runValidator(["--registry", registryPath]);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /superpowers/);
    assert.match(result.stdout + result.stderr, /plugin|provider/i);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("canonical capability index exposes plugin providers", () => {
  const index = JSON.parse(
    readFileSync("config/capability-index/meta-kim-capabilities.json", "utf8"),
  );
  assert.ok(index.summary.totalPlugins >= 3, "totalPlugins must not regress to 0");
  for (const key of [
    "manifest:plugin-marketplace:superpowers",
    "manifest:plugin-marketplace:ecc",
    "manifest:plugin-marketplace:cli-anything",
  ]) {
    assert.ok(index.byCapabilityType.plugins?.[key], `${key} missing`);
  }
});
