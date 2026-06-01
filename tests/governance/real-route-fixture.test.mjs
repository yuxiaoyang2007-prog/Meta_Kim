import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const fixtures = [
  ["用户想做一个模糊产品变现方案，需要找到最短正确路径和最小验证动作", "codex", "windows"],
  ["检查 Codex 和 Cursor 的 hook / skill / MCP / approval 兼容性", "codex", "windows"],
  ["查找可复用依赖项目能力，但不能硬绑定任何参考项目", "claude_code", "macos"],
  ["复杂代码重构，需要 owner + weapon + verification owner + rollback path", "codex", "linux"],
];

test("real route fixtures emit complete executable route or honest gap", () => {
  for (const [task, runtime, os] of fixtures) {
    const result = spawnSync(process.execPath, ["scripts/select-execution-route.mjs", "--task", task, "--runtime", runtime, "--os", os, "--json"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    for (const field of ["taskShape", "ownerDiscoveryPacket", "candidateOwners", "candidateWeapons", "runtimeFilterResult", "osFilterResult", "rankedRoutes", "rejectedRoutes", "verificationPlan"]) {
      assert(output[field] !== undefined, `${task} missing ${field}`);
    }
    assert(output.ownerDiscoveryPacket.governanceStages.Critical.requiredAgents.includes("meta-warden"), `${task} missing Critical owner discovery`);
    assert(Array.isArray(output.ownerDiscoveryPacket.projectRuntimeAgents), `${task} missing project runtime agent inventory`);
    assert(Array.isArray(output.ownerDiscoveryPacket.projectRuntimeSkillProviders), `${task} missing project runtime skill provider inventory`);
    assert(Array.isArray(output.ownerDiscoveryPacket.localGlobalSkillProviders), `${task} missing local/global skill provider inventory`);
    assert(Array.isArray(output.ownerDiscoveryPacket.projectRuntimeCapabilityProviders), `${task} missing project runtime capability provider inventory`);
    assert(Array.isArray(output.ownerDiscoveryPacket.localGlobalCapabilityProviders), `${task} missing local/global capability provider inventory`);
    assert(output.ownerDiscoveryPacket.globalInventoryFreshness?.mode === "cached_global_inventory_plus_project_light_scan", `${task} missing scan cadence policy`);
    assert(output.ownerDiscoveryPacket.globalInventoryFreshness?.staleAfterDays === 14, `${task} missing 2-week scan cadence`);
    assert(typeof output.ownerDiscoveryPacket.globalInventoryFreshness?.refreshRequiredBeforeExecution === "boolean", `${task} missing refresh-before-execution flag`);
    assert(output.ownerDiscoveryPacket.candidateReusableCapabilityProviders?.length > 0, `${task} missing reusable capability provider candidates`);
    assert(output.recommendedRoute || output.capabilityGapPacket, `${task} needs route or gap`);
    assert(!output.rankedRoutes.some((route) => route.owner === "general-purpose"), `${task} used general-purpose owner`);
    assert(!output.rankedRoutes.some((route) => route.score >= 85 && route.blockedReasons?.length), `${task} executable route has blockers`);
    if (task.includes("重构")) {
      assert(output.capabilityGapPacket || !/^meta-/.test(output.recommendedRoute?.owner ?? ""), "engineering execution must not recommend governance agent as implementation worker");
    }
    if (output.recommendedRoute?.score >= 85) {
      for (const field of ["owner", "weapon", "runtime", "os", "verificationOwner", "verificationMethod"]) {
        assert(output.recommendedRoute[field], `${task} route missing ${field}`);
      }
      assert.notEqual(output.recommendedRoute.dependency, "kim-decision", "Kim_Decision must not be an execution dependency");
    }
  }
});
