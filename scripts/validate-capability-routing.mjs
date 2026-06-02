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
assert(fuzzy.ownerDiscoveryPacket?.governanceStages?.Critical?.requiredAgents?.includes("meta-warden"), "Route output must expose Critical governance owner discovery");
assert(Array.isArray(fuzzy.ownerDiscoveryPacket?.projectRuntimeAgents), "Route output must expose project runtime agent discovery");
assert(fuzzy.ownerDiscoveryPacket?.discoveryPrinciple === "provider_first_evidence_owner_last_binding", "Route output must use provider-first evidence and owner-last binding");
assert(fuzzy.ownerDiscoveryPacket?.searchOrder?.[0] === "available_capability_providers_skills_tools_mcp", "Provider evidence must precede owner binding");
assert(fuzzy.ownerDiscoveryPacket?.ownerBindingOrder?.includes("project_runtime_agent_inventory"), "Route owner binding must include project runtime agent inventory");
assert(Array.isArray(fuzzy.ownerDiscoveryPacket?.projectRuntimeSkillProviders), "Route output must expose project runtime skill provider discovery");
assert(Array.isArray(fuzzy.ownerDiscoveryPacket?.localGlobalSkillProviders), "Route output must expose local/global skill provider discovery");
assert(Array.isArray(fuzzy.ownerDiscoveryPacket?.projectRuntimeCapabilityProviders), "Route output must expose project runtime capability provider discovery");
assert(Array.isArray(fuzzy.ownerDiscoveryPacket?.localGlobalCapabilityProviders), "Route output must expose local/global capability provider discovery");
assert(fuzzy.ownerDiscoveryPacket?.capabilityProviderCoverage?.projectRuntimeLightScan?.hooks >= 1, "Route output must expose project hook provider coverage");
assert(fuzzy.ownerDiscoveryPacket?.capabilityProviderCoverage?.projectRuntimeLightScan?.rules >= 1, "Route output must expose project rule/prompt provider coverage");
assert(fuzzy.ownerDiscoveryPacket?.capabilityProviderCoverage?.localGlobalCached?.plugins >= 1, "Route output must expose cached global plugin provider coverage");
assert(fuzzy.ownerDiscoveryPacket?.runtimeToolProviders?.some((provider) => provider.type === "runtimeTools"), "Route output must expose runtime tool providers");
assert(fuzzy.ownerDiscoveryPacket?.capabilityProviderCoverage?.projectRuntimeLightScan?.runtimeTools >= 1, "Route output must count runtime tool providers");
assert(fuzzy.ownerDiscoveryPacket?.globalInventoryFreshness?.mode === "cached_global_inventory_plus_project_light_scan", "Route output must expose cached+light-scan freshness policy");
assert(fuzzy.ownerDiscoveryPacket?.globalInventoryFreshness?.staleAfterMinutes === 20160, "Route output must use a 14-day global inventory stale threshold");
assert(fuzzy.ownerDiscoveryPacket?.globalInventoryFreshness?.staleAfterDays === 14, "Route output must expose the 2-week capability refresh cadence");
assert(typeof fuzzy.ownerDiscoveryPacket?.globalInventoryFreshness?.refreshRequiredBeforeExecution === "boolean", "Route output must expose whether refresh is required before execution");
assert(fuzzy.routeExecutionGate?.canPreviewRoute === true, "Stale cache may still allow route preview");
assert(typeof fuzzy.routeExecutionGate?.canEnterExecution === "boolean", "Route output must expose whether Execution may start");
assert(fuzzy.ownerDiscoveryPacket?.candidateReusableCapabilityProviders?.length > 0, "Route output must expose reusable capability providers before agent creation");
assert(fuzzy.ownerDiscoveryPacket?.searchOrder?.includes("available_capability_providers_skills_tools_mcp"), "Route owner discovery must include provider-first skill/tool/MCP inventory");
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
