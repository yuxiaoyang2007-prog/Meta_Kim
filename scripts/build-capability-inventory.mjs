#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { OS_TARGETS, RUNTIMES, listFiles, readJson, repoPath, stateDir, toPosix, writeJson } from "./governance-lib.mjs";

const outputPath = path.join(stateDir, "capability-inventory.json");

function defaultSupport(runtime = "partial", os = "partial") {
  return {
    runtimeSupport: Object.fromEntries(RUNTIMES.map((name) => [name, runtime])),
    osSupport: Object.fromEntries(OS_TARGETS.map((name) => [name, os])),
  };
}

async function packageScripts() {
  const pkg = await readJson("package.json");
  return Object.entries(pkg.scripts ?? {}).map(([id, command]) => ({
    id,
    type: "command",
    sourcePath: "package.json",
    invocationPath: `npm run ${id}`,
    triggerWords: [id, ...String(command).split(/\s+/).filter((part) => /^meta:|node|npm|graphify|validate|discover|probe/.test(part)).slice(0, 8)],
    ownerCandidates: ["meta-artisan", "meta-prism"],
    weaponCandidates: [id],
    dependencyCandidates: [],
    verificationMethod: id.includes("validate") || id.includes("check") || id.includes("test") ? `npm run ${id}` : null,
    risk: { canExecuteShell: true, requiresApproval: false },
    mustPreserve: /sync|install|uninstall|doctor|status|validate|verify|graphify|deps|runtime|os|test/.test(id),
    routeEligibility: "callable",
    missingFields: [],
    evidence: { source: "local_file", sourceRef: "package.json", confidence: "verified_local" },
    confidence: "verified_local",
    writebackKey: `command:${id}`,
    ...defaultSupport("partial", "partial"),
  }));
}

async function fileCapabilities(root, type, ownerCandidates, options = {}) {
  const files = await listFiles(repoPath(root), (file) => options.match ? options.match(file) : true);
  return files.map((file) => {
    const rel = toPosix(path.relative(repoPath("."), file));
    const id = options.id ? options.id(file) : path.basename(file, path.extname(file));
    return {
      id,
      type,
      sourcePath: rel,
      triggerWords: [id, type],
      ownerCandidates,
      weaponCandidates: options.weaponCandidates ?? [],
      dependencyCandidates: [],
      verificationMethod: options.verificationMethod ?? null,
      risk: options.risk ?? { canMutateFiles: false },
      mustPreserve: Boolean(options.mustPreserve),
      routeEligibility: options.routeEligibility ?? "reference",
      missingFields: [],
      evidence: { source: "local_file", sourceRef: rel, confidence: "verified_local" },
      confidence: "verified_local",
      invocationPath: options.invocationPath ?? null,
      writebackKey: `${type}:${id}`,
      ...defaultSupport(options.runtime ?? "partial", options.os ?? "partial"),
    };
  });
}

async function inventory() {
  const dependencies = await readJson("config/capability-index/dependency-project-registry.json");
  const weapons = await readJson("config/capability-index/weapon-registry.json");
  const runtimeMatrix = await readJson("config/runtime-capability-matrix.json");
  const osMatrix = await readJson("config/os-compatibility-matrix.json");
  const records = [
    ...(await fileCapabilities("canonical/agents", "agent", ["meta-warden"], { match: (file) => file.endsWith(".md"), mustPreserve: true, routeEligibility: "governance_owner" })),
    ...(await fileCapabilities("canonical/skills", "skill", ["meta-artisan"], { match: (file) => path.basename(file) === "SKILL.md", mustPreserve: true, routeEligibility: "callable", invocationPath: "skill trigger" })),
    ...(await fileCapabilities("canonical/skills/meta-theory/references", "reference", ["meta-conductor", "meta-prism"], { match: (file) => file.endsWith(".md"), mustPreserve: true })),
    ...(await fileCapabilities("scripts", "script", ["meta-artisan", "meta-prism"], { match: (file) => file.endsWith(".mjs"), mustPreserve: true, routeEligibility: "callable", invocationPath: "node <script>" })),
    ...(await fileCapabilities("canonical/runtime-assets", "hook", ["meta-sentinel"], { match: (file) => /hooks|memory-hooks/.test(file), mustPreserve: true, routeEligibility: "callable" })),
    ...(await packageScripts()),
  ];
  for (const tool of ["shell", "filesystem", "apply_patch", "browser", "web_search", "online_research", "MCP", "memory", "graph", "graphify", "hook", "command", "subagent", "approval", "sandbox"]) {
    records.push({
      id: tool,
      type: "runtime_tool",
      sourcePath: "config/runtime-capability-matrix.json",
      triggerWords: [tool, tool.replace(/_/g, " ")],
      ownerCandidates: ["meta-artisan", "meta-sentinel", "meta-scout"],
      weaponCandidates: [tool],
      dependencyCandidates: [],
      runtimeSupport: defaultSupport("partial", "partial").runtimeSupport,
      osSupport: defaultSupport("partial", "partial").osSupport,
      verificationMethod: "npm run meta:runtime:validate",
      risk: { requiresApproval: ["shell", "filesystem", "apply_patch"].includes(tool) },
      mustPreserve: true,
      routeEligibility: "callable",
      missingFields: [],
      evidence: { source: "local_file", sourceRef: "config/runtime-capability-matrix.json", confidence: "repo_claim" },
      confidence: "repo_claim",
      invocationPath: tool,
      writebackKey: `runtime_tool:${tool}`,
    });
  }
  for (const weapon of weapons.weapons ?? []) {
    records.push({
      id: weapon.id,
      type: weapon.type ?? "weapon",
      sourcePath: "config/capability-index/weapon-registry.json",
      triggerWords: weapon.triggerConditions ?? [],
      ownerCandidates: weapon.ownerCandidates ?? [],
      weaponCandidates: [weapon.id],
      dependencyCandidates: weapon.dependencyProjects ?? [],
      runtimeSupport: weapon.runtimeSupport ?? defaultSupport().runtimeSupport,
      osSupport: weapon.osSupport ?? defaultSupport().osSupport,
      verificationMethod: weapon.verification?.command ?? null,
      risk: weapon.risk ?? {},
      mustPreserve: true,
      routeEligibility: "callable",
      missingFields: [],
      evidence: { source: "local_file", sourceRef: "config/capability-index/weapon-registry.json", confidence: "verified_local" },
      confidence: "verified_local",
      invocationPath: weapon.howToTrigger?.explicit ?? null,
      writebackKey: `weapon:${weapon.id}`,
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    capabilities: records,
    runtimeMatrixCapabilities: runtimeMatrix.capabilityNames ?? [],
    osTargets: (osMatrix.operatingSystems ?? []).map((entry) => entry.id),
    dependencyProjects: dependencies.projects ?? [],
    summary: {
      total: records.length,
      mustPreserve: records.filter((record) => record.mustPreserve).length,
      webSearchBrowserResearch: records.filter((record) => /web|browser|research|fetch|online/i.test(JSON.stringify(record))).length,
      memoryGraphMcpHook: records.filter((record) => /memory|graph|MCP|hook|graphify/i.test(JSON.stringify(record))).length,
    },
  };
}

const result = await inventory();
await writeJson(outputPath, result);
console.log(JSON.stringify(result, null, 2));
