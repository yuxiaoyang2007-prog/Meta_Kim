#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import process from "node:process";
import { assert } from "./governance-lib.mjs";

function route(task, runtime = "auto", os = "auto") {
  const result = spawnSync(process.execPath, ["scripts/select-execution-route.mjs", "--task", task, "--runtime", runtime, "--os", os, "--json"], {
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

const fuzzy = route("fuzzy strategy task: choose a product monetization path and minimum test");
assert(fuzzy.candidateWeapons.includes("meta-kim-decision-patterns"), "Fuzzy strategy/product task must recall internal Meta_Kim decision patterns");
if (fuzzy.candidateDependencyProjects.includes("kim-decision")) {
  assert(!fuzzy.rankedRoutes.some((item) => item.dependencyProject === "kim-decision" && item.scoreBand === "execute"), "Kim_Decision may be discovered but must not become an execution dependency");
}
assert(!fuzzy.rankedRoutes.some((item) => item.owner === "general-purpose"), "No general-purpose owner allowed");
assert(fuzzy.recommendedRoute?.weapon, "Recommended route needs weapon");
assert(fuzzy.recommendedRoute?.verificationOwner, "Recommended route needs verification owner");
assert(fuzzy.recommendedRoute?.runtime, "Recommended route needs runtime");
assert(fuzzy.recommendedRoute?.os, "Recommended route needs OS");
assert(fuzzy.recommendedRoute?.verificationMethod, "Recommended route needs verification method");

const code = route("complex code refactor with tests");
assert(!code.rankedRoutes.some((item) => item.dependencyProject === "kim-decision"), "Kim_Decision must not become implementation owner for pure code execution");

const hook = route("platform hook install for Codex and Cursor");
assert(hook.candidateWeapons.includes("runtime-capability-matrix") || hook.candidateOwners.includes("meta-sentinel"), "Platform hook task must recall runtime matrix or sentinel");

const windows = route("Windows setup task for hooks and MCP", "codex", "windows");
assert(windows.osFilterResult.applied === "windows", "Windows setup must apply windows OS filter");

const cursorUnknown = route("Cursor unknown native choice surface task", "cursor", "windows");
assert(cursorUnknown.recommendedRoute || cursorUnknown.capabilityGapPacket, "Cursor unknown capability must route or gap honestly");

const missing = route("missing dependency task requiring imaginary provider xzzq");
assert(missing.recommendedRoute || missing.capabilityGapPacket, "Missing dependency task must produce route or capabilityGapPacket");

console.log("capability routing valid");
