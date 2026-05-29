#!/usr/bin/env node
import path from "node:path";
import { commandProbe, exists, readJson, repoPath, stateDir, writeJson } from "./governance-lib.mjs";

const args = new Set(process.argv.slice(2));
const probePath = path.join(stateDir, "runtime-capability-probe.json");

async function inspectRuntime(id, command, projectPaths, globalPaths) {
  const cmd = commandProbe(command);
  const project = {};
  for (const rel of projectPaths) {
    project[rel] = await exists(repoPath(rel));
  }
  const global = {};
  for (const p of globalPaths) {
    global[p] = await exists(p.replace(/^~(?=$|\/|\\)/, process.env.USERPROFILE || process.env.HOME || ""));
  }
  return {
    id,
    command: cmd,
    project,
    global,
  };
}

async function buildProbe() {
  return {
    generatedAt: new Date().toISOString(),
    runtimes: {
      claude_code: await inspectRuntime("claude_code", "claude", [".claude/settings.json", ".claude/agents", ".claude/skills", ".claude/hooks", ".mcp.json"], ["~/.claude"]),
      codex: await inspectRuntime("codex", "codex", [".codex/config.toml", ".codex/hooks.json", ".codex/agents", ".agents/skills", ".mcp.json"], ["~/.codex"]),
      openclaw: await inspectRuntime("openclaw", "openclaw", ["openclaw/openclaw.template.json", "openclaw/workspaces", "openclaw/skills", "openclaw/hooks"], ["~/.openclaw"]),
      cursor: await inspectRuntime("cursor", "cursor", [".cursor/mcp.json", ".cursor/hooks.json", ".cursor/agents", ".cursor/rules", ".cursor/skills"], ["~/.cursor"]),
    },
  };
}

function matrixSupportFor(matrix, platform) {
  const entry = matrix.platforms.find((item) => item.platform === platform);
  if (!entry) return new Map();
  const map = new Map();
  for (const capability of entry.capabilities ?? []) {
    map.set(capability.capability, capability.support);
  }
  for (const [support, names] of Object.entries(entry.capabilityTemplate ?? {})) {
    if (!Array.isArray(names)) continue;
    for (const name of names) map.set(name, support);
  }
  return map;
}

async function check(probe) {
  const matrix = await readJson("config/runtime-capability-matrix.json");
  for (const platform of ["claude_code", "codex", "openclaw", "cursor"]) {
    const support = matrixSupportFor(matrix, platform);
    if (support.size === 0) {
      throw new Error(`runtime-capability-matrix missing ${platform}`);
    }
    for (const capability of matrix.capabilityNames ?? []) {
      if (!support.has(capability)) {
        throw new Error(`${platform} missing capability ${capability}`);
      }
    }
  }
  for (const [platform, runtime] of Object.entries(probe.runtimes)) {
    const support = matrixSupportFor(matrix, platform);
    if (runtime.command.available && support.get("shell") === "unsupported") {
      throw new Error(`${platform} command is available but matrix says shell unsupported`);
    }
  }
}

const probe = await buildProbe();
await writeJson(probePath, probe);
if (args.has("--check")) {
  await check(probe);
}
if (args.has("--json")) {
  console.log(JSON.stringify(probe, null, 2));
} else {
  console.log(`Runtime capability probe written to ${probePath}`);
}
