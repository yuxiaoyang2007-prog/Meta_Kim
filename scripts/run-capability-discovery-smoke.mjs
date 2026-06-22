#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const stateDir = path.join(repoRoot, ".meta-kim", "state", "default");

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const task = argValue(
  "--task",
  "Create a reusable provider smoke test that discovers an execution agent, finds or creates an agent, finds a skill provider, finds or creates a skill, finds an MCP provider, and emits a verification command.",
);
const runtime = argValue("--runtime", "codex");
const osTarget = argValue("--os", "windows");

function selectorArgs() {
  return [
    "--task",
    task,
    "--runtime",
    runtime,
    "--os",
    osTarget,
    "--json",
    "--runner-compact",
  ];
}

async function runSelectorInProcess(spawnError = null) {
  const originalArgv = process.argv;
  const originalLog = console.log;
  const originalError = console.error;
  const stdout = [];
  const stderr = [];
  try {
    process.argv = [
      process.execPath,
      path.join(repoRoot, "scripts/select-execution-route.mjs"),
      ...selectorArgs(),
    ];
    console.log = (...args) => stdout.push(args.join(" "));
    console.error = (...args) => stderr.push(args.join(" "));
    const selectorUrl =
      pathToFileURL(path.join(repoRoot, "scripts/select-execution-route.mjs")).href +
      `?smoke=${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await import(selectorUrl);
  } finally {
    process.argv = originalArgv;
    console.log = originalLog;
    console.error = originalError;
  }
  const text = stdout.join("\n").trim();
  if (!text) {
    throw new Error(
      [
        "select-execution-route produced no JSON output",
        spawnError?.message ? `original spawn error: ${spawnError.message}` : null,
        stderr.join("\n").trim(),
      ].filter(Boolean).join("\n"),
    );
  }
  return JSON.parse(text);
}

const routeResult = spawnSync(
  process.execPath,
  ["scripts/select-execution-route.mjs", ...selectorArgs()],
  {
    cwd: repoRoot,
    encoding: "utf8",
  },
);

let routeOutput;
if (routeResult.error) {
  routeOutput = await runSelectorInProcess(routeResult.error);
} else if (routeResult.status !== 0) {
  process.stderr.write(
    routeResult.stderr ||
      routeResult.stdout ||
      `select-execution-route failed with status ${routeResult.status}\n`,
  );
  process.exit(routeResult.status ?? 1);
} else {
  routeOutput = JSON.parse(routeResult.stdout);
}
const route = routeOutput.recommendedRoute;
const providers = route?.selectedCapabilityProviders ?? {};
const failures = [];

if (!route) failures.push("recommendedRoute missing");
if (route?.id !== `${"execution-capability-discovery"}:${runtime}:${osTarget}`) failures.push("execution discovery route not selected");
if (!route?.owner || route.owner.startsWith("meta-")) failures.push("execution owner missing or governance owner selected");
if (!providers.agent) failures.push("execution agent provider missing");
if (!providers.agentCreation) failures.push("agent creation provider missing");
if (!providers.skillDiscovery) failures.push("skill discovery provider missing");
if (!providers.skillCreation) failures.push("skill creation provider missing");
if (!providers.skill) failures.push("selected skill provider missing");
if (!providers.mcpServer && !providers.mcpTool) failures.push("MCP provider missing");
if (!providers.command && !providers.runtimeTool) failures.push("command or runtime tool provider missing");
if (!route?.verificationMethod) failures.push("verification method missing");

const artifact = {
  generatedAt: new Date().toISOString(),
  task,
  runtime,
  os: osTarget,
  status: failures.length ? "failed" : "passed",
  failures,
  route: route
    ? {
        id: route.id,
        owner: route.owner,
        weapon: route.weapon,
        verificationMethod: route.verificationMethod,
        score: route.score,
        scoreBand: route.scoreBand,
      }
    : null,
  selectedCapabilityProviders: providers,
  routeExecutionGate: routeOutput.routeExecutionGate,
};

await fs.mkdir(stateDir, { recursive: true });
const artifactPath = path.join(stateDir, "capability-discovery-smoke.json");
await fs.writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

if (failures.length) {
  console.error(`capability discovery smoke failed: ${failures.join("; ")}`);
  console.error(`artifact: ${artifactPath}`);
  process.exit(1);
}

console.log("capability discovery smoke passed");
console.log(`route: ${route.id}`);
console.log(`owner: ${route.owner}`);
console.log(`skillDiscovery: ${providers.skillDiscovery?.id}`);
console.log(`skillCreation: ${providers.skillCreation?.id}`);
console.log(`agent: ${providers.agent?.id}`);
console.log(`agentCreation: ${providers.agentCreation?.id}`);
console.log(`mcp: ${providers.mcpServer?.id ?? providers.mcpTool?.id}`);
console.log(`verification: ${route.verificationMethod}`);
console.log(`artifact: ${artifactPath}`);
