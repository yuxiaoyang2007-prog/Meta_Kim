import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";
import test from "node:test";

function route(task, runtime = "auto", os = "auto") {
  const result = spawnSync(process.execPath, ["scripts/select-execution-route.mjs", "--task", task, "--runtime", runtime, "--os", os, "--json"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("routing fixtures recall internal patterns and platform/OS matrices", () => {
  const fuzzy = route("fuzzy strategy task");
  assert.ok(fuzzy.candidateWeapons.includes("meta-kim-decision-patterns"));
  assert.ok(
    fuzzy.ownerDiscoveryPacket?.governanceStages?.Critical?.requiredAgents?.includes("meta-warden"),
    "Critical stage governance owner discovery must be visible",
  );
  assert.ok(
    fuzzy.ownerDiscoveryPacket?.governanceStages?.Fetch?.requiredAgents?.includes("meta-artisan"),
    "Fetch stage governance owner discovery must be visible",
  );
  assert.ok(
    Array.isArray(fuzzy.ownerDiscoveryPacket?.projectRuntimeAgents),
    "project runtime agents must be listed even when none are selected",
  );
  assert.ok(
    fuzzy.ownerDiscoveryPacket?.searchOrder?.includes("local_global_agent_inventory"),
    "local global inventory must be part of owner discovery",
  );
  assert.ok(
    fuzzy.ownerDiscoveryPacket?.searchOrder?.includes("available_capability_providers_skills_tools_mcp"),
    "skill/tool/MCP providers must be checked before agent creation",
  );
  assert.ok(
    fuzzy.ownerDiscoveryPacket?.projectRuntimeSkillProviders?.some((provider) => provider.id === "meta-theory"),
    "project-local skill providers must be visible in owner discovery",
  );
  assert.ok(
    fuzzy.ownerDiscoveryPacket?.projectRuntimeCapabilityProviders?.some((provider) => provider.type === "hooks"),
    "project-local hook providers must be visible in owner discovery",
  );
  assert.ok(
    fuzzy.ownerDiscoveryPacket?.projectRuntimeCapabilityProviders?.some((provider) => provider.type === "rules"),
    "project-local rule/prompt providers must be visible in owner discovery",
  );
  assert.ok(
    fuzzy.ownerDiscoveryPacket?.capabilityProviderCoverage?.localGlobalCached?.plugins >= 1,
    "cached global plugin providers must be counted without per-run full scan",
  );
  assert.equal(
    fuzzy.ownerDiscoveryPacket?.globalInventoryFreshness?.mode,
    "cached_global_inventory_plus_project_light_scan",
    "per-run routing must use cached global inventory plus light project scan",
  );
  assert.equal(fuzzy.ownerDiscoveryPacket?.globalInventoryFreshness?.staleAfterMinutes, 20160);
  assert.equal(fuzzy.ownerDiscoveryPacket?.globalInventoryFreshness?.staleAfterDays, 14);
  assert.equal(typeof fuzzy.ownerDiscoveryPacket?.globalInventoryFreshness?.refreshRequiredBeforeExecution, "boolean");
  assert.ok(
    fuzzy.ownerDiscoveryPacket?.candidateReusableCapabilityProviders?.length > 0,
    "reusable capability providers must be listed before create/upgrade",
  );
  if (fuzzy.candidateDependencyProjects.includes("kim-decision")) {
    assert.equal(fuzzy.rankedRoutes.some((route) => route.dependencyProject === "kim-decision" && route.scoreBand === "execute"), false);
  }

  const product = route("product monetization task");
  assert.ok(product.internalDecisionPatterns.includes("thinking-minimum-test"));

  const chineseProduct = route("模糊目标：帮我把一个产品商业化，但我不知道先做增长、定价还是转化", "codex", "windows");
  assert.equal(chineseProduct.taskShape, "strategy_product_decision");
  assert.equal(chineseProduct.intentAmplificationPrecheck.needsIntentAmplification, true);
  assert.equal(chineseProduct.recommendedRoute?.weapon, "meta-kim-decision-patterns");
  assert.equal(chineseProduct.recommendedRoute?.dependencyProject, null);

  const refactor = route("complex code refactor");
  assert.ok(refactor.recommendedRoute || refactor.capabilityGapPacket);
  assert.ok(refactor.capabilityGapPacket || !/^meta-/.test(refactor.recommendedRoute?.owner ?? ""), "Pure code execution must not route governance agent as implementation worker");

  const hook = route("platform hook install");
  assert.ok(hook.candidateWeapons.includes("runtime-capability-matrix"));

  const windows = route("windows setup task", "codex", "windows");
  assert.equal(windows.osFilterResult.applied, "windows");

  const cursor = route("cursor unknown capability task", "cursor", "windows");
  assert.ok(cursor.recommendedRoute || cursor.capabilityGapPacket);

  const missing = route("missing dependency task");
  assert.ok(missing.recommendedRoute || missing.capabilityGapPacket);
});
