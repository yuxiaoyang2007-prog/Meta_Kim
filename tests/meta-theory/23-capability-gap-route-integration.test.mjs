import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { readJson } from "./_helpers.mjs";

function route(task) {
  const result = spawnSync(
    process.execPath,
    ["scripts/select-execution-route.mjs", "--task", task, "--json"],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

describe("23 — Capability Gap route integration", async () => {
  const contract = await readJson("config/contracts/capability-gap-decision-contract.json");

  test("contract exposes AI-readable standards for all six decisions", () => {
    const decisions = Object.keys(contract.decisions);
    assert.deepEqual(decisions.sort(), [
      "blocked_or_needs_approval",
      "create_agent",
      "create_mcp_provider",
      "create_script",
      "create_skill",
      "worker_task_only",
    ]);
    for (const [decision, rule] of Object.entries(contract.decisions)) {
      assert.ok(rule.branch, `${decision} must define a graph branch`);
      assert.ok(rule.owner, `${decision} must define owner`);
      assert.ok(rule.ownerRole, `${decision} must define ownerRole`);
      assert.ok(rule.selectedBecause, `${decision} must define selectedBecause`);
      assert.ok(rule.deliverable, `${decision} must define deliverable`);
      assert.ok(rule.verifier, `${decision} must define verifier`);
      assert.ok(rule.forbiddenBehaviors?.length >= 1, `${decision} must define forbidden behaviors`);
    }
    assert.equal(contract.quantitativeAcceptance.fakeOwnerCount, 0);
    assert.equal(contract.quantitativeAcceptance.governanceAgentAsWorkerCount, 0);
  });

  test("explicit missing dependency routes through GapDecision and blocks execution", () => {
    const result = route("missing dependency task requiring imaginary provider xzzq");
    assert.equal(result.capabilityGapDetected, true);
    assert.equal(result.capabilityGapDecision.decision, "blocked_or_needs_approval");
    assert.equal(result.capabilityGapDecision.decisionEvidence.status, "pass");
    assert.deepEqual(result.capabilityGapDecision.decisionEvidence.missingEvidence, []);
    assert.equal(result.routeExecutionGate.canEnterExecution, false);
    assert.ok(result.routeExecutionGate.blockedBy.includes("capability_gap_decision_blocks_execution"));
  });

  test("explicit long-term owner gap produces create_agent evidence without identity pollution", () => {
    const result = route("create agent for long-term test coverage strategy owner");
    assert.equal(result.capabilityGapDetected, true);
    assert.equal(result.capabilityGapDecision.decision, "create_agent");
    assert.equal(result.capabilityGapDecision.generatedAgentSpec.name, "test-coverage-specialist");
    assert.equal(result.capabilityGapDecision.generatedAgentSpec.identityCleanliness.status, "pass");
    assert.equal(result.capabilityGapDecision.decisionEvidence.decisionRule.branchOwner, "meta-genesis");
    assert.notEqual(result.capabilityGapDecision.decisionEvidence.decisionRule.branchOwnerRole, "execution_worker");
  });

  test("repeatable mechanical local summary routes naturally through create_script", () => {
    const result = route(
      "我需要 Meta_Kim 能把每次 Codex 真实测试后的 stage outputs 自动整理成一份稳定 JSON summary，并检测缺失的 verification owner、decision output、blocked gate reason。这个动作会反复跑，要求机械、可测试、本地完成，不需要新 agent 身份。"
    );
    assert.equal(result.capabilityGapDetected, true);
    assert.equal(result.capabilityGapDecision.decision, "create_script");
    assert.equal(result.capabilityGapDecision.decisionOutput.kind, "script_candidate_spec");
    assert.equal(result.capabilityGapDecision.decisionOutput.acceptance.status, "pass");
    assert.deepEqual(result.capabilityGapDecision.decisionOutput.acceptance.missingFields, []);
    assert.equal(
      result.capabilityGapDecision.decisionEvidence.decisionRule.branchOwner,
      "script-provider"
    );
    assert.notEqual(
      result.capabilityGapDecision.decisionEvidence.decisionRule.branchOwnerRole,
      "execution_worker"
    );
  });
});
