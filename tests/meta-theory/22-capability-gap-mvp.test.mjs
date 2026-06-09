import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {
  CAPABILITY_GAP_DECISION_CONTRACT,
  CAPABILITY_GAP_OUTPUT_CONTRACT,
  DECISION_RULES,
  GAP_DECISIONS,
  decideCapabilityGap,
  openRunStateStore,
} from "../../scripts/capability-gap-mvp.mjs";
import { buildAgentProjectionTargets } from "../../scripts/runtime-tool-profiles.mjs";
import { readJson } from "./_helpers.mjs";

describe("22 — Capability Gap MVP policy and RunStateStore", async () => {
  const fixtures = await readJson(
    "tests/meta-theory/scenarios/capability-gap-decision-fixtures.json"
  );

  test("fixtures cover exactly the six MVP GapDecision branches", () => {
    assert.deepEqual(
      fixtures.map((fixture) => fixture.expectedDecision).sort(),
      [...GAP_DECISIONS].sort()
    );
    assert.deepEqual(
      Object.keys(CAPABILITY_GAP_DECISION_CONTRACT.decisions).sort(),
      [...GAP_DECISIONS].sort()
    );
    assert.deepEqual(
      Object.keys(CAPABILITY_GAP_OUTPUT_CONTRACT.outputs).sort(),
      [...GAP_DECISIONS].sort()
    );
  });

  test("policy emits correct GapDecision, branch, verifier, and rejected alternatives", () => {
    for (const fixture of fixtures) {
      const result = decideCapabilityGap(fixture.input, {
        expectedDecision: fixture.expectedDecision,
        requiredEvidence: fixture.requiredEvidence,
        forbidden: fixture.forbidden,
      });
      assert.equal(result.gapDecision.decision, fixture.expectedDecision);
      assert.ok(
        result.graphPath.includes(fixture.expectedBranch),
        `${fixture.id} must route through ${fixture.expectedBranch}`
      );
      assert.ok(result.gapDecision.decisionReason);
      assert.ok(result.gapDecision.verificationOwner);
      assert.ok(
        result.gapDecision.rejectedAlternatives.length >= 1,
        `${fixture.id} must reject at least one alternative route`
      );
      assert.ok(
        result.capabilityGap.currentProvidersChecked.length >= 6,
        `${fixture.id} must record provider discovery evidence`
      );
    }
  });

  test("every decision carries the owner responsibility chain and required evidence contract", () => {
    for (const fixture of fixtures) {
      const result = decideCapabilityGap(fixture.input, {
        expectedDecision: fixture.expectedDecision,
        requiredEvidence: fixture.requiredEvidence,
        forbidden: fixture.forbidden,
      });
      const evidence = result.decisionEvidence;
      assert.equal(evidence.status, "pass", `${fixture.id} evidence contract must pass`);
      assert.equal(evidence.missingEvidence.length, 0, `${fixture.id} must not miss evidence`);
      assert.equal(evidence.decisionRule.decision, fixture.expectedDecision);
      assert.equal(
        evidence.decisionRule.branchOwner,
        DECISION_RULES[fixture.expectedDecision].owner
      );
      assert.ok(evidence.responsibilityChain.length >= 7);
      for (const requiredKey of fixture.requiredEvidence) {
        assert.ok(
          evidence.checklist.some((item) => item.key === requiredKey && item.status === "pass"),
          `${fixture.id} must prove ${requiredKey}`
        );
      }
      for (const forbidden of fixture.forbidden) {
        assert.ok(
          evidence.decisionRule.forbiddenBehaviors.includes(forbidden),
          `${fixture.id} must preserve forbidden behavior ${forbidden}`
        );
      }
    }
  });

  test("every decision produces a complete next-step output artifact", () => {
    for (const fixture of fixtures) {
      const result = decideCapabilityGap(fixture.input, {
        expectedDecision: fixture.expectedDecision,
        requiredEvidence: fixture.requiredEvidence,
        forbidden: fixture.forbidden,
      });
      const output = result.decisionOutput;
      const outputRule = CAPABILITY_GAP_OUTPUT_CONTRACT.outputs[fixture.expectedDecision];
      assert.equal(output.kind, outputRule.kind);
      assert.equal(output.owner, outputRule.owner);
      assert.equal(output.scope, outputRule.scope);
      assert.equal(output.acceptance.status, "pass", `${fixture.id} output must pass`);
      assert.deepEqual(output.acceptance.missingFields, []);
      for (const field of CAPABILITY_GAP_OUTPUT_CONTRACT.requiredFields) {
        assert.ok(output[field] !== undefined && output[field] !== null, `${fixture.id} missing ${field}`);
      }
      for (const field of outputRule.requiredOutputs) {
        assert.ok(output.payload[field] !== undefined && output.payload[field] !== null, `${fixture.id} missing payload.${field}`);
      }
    }
  });

  test("governance agents design and gate, but do not become implementation workers", () => {
    const governanceOwners = [
      "meta-warden",
      "meta-conductor",
      "meta-scout",
      "meta-artisan",
      "meta-genesis",
      "meta-sentinel",
      "meta-prism",
      "meta-chrysalis",
    ];
    for (const fixture of fixtures) {
      const result = decideCapabilityGap(fixture.input, {
        expectedDecision: fixture.expectedDecision,
        requiredEvidence: fixture.requiredEvidence,
      });
      const { branchOwner, branchOwnerRole } = result.decisionEvidence.decisionRule;
      if (governanceOwners.includes(branchOwner)) {
        assert.notEqual(branchOwnerRole, "execution_worker");
      }
    }
  });

  test("create_agent produces GeneratedAgentSpec; non-agent branches do not", () => {
    for (const fixture of fixtures) {
      const result = decideCapabilityGap(fixture.input, {
        expectedDecision: fixture.expectedDecision,
        requiredEvidence: fixture.requiredEvidence,
      });
      if (fixture.expectedDecision === "create_agent") {
        assert.equal(result.generatedAgentSpec.name, "test-coverage-specialist");
        assert.equal(result.generatedAgentSpec.identityCleanliness.status, "pass");
        assert.equal(result.generatedAgentSpec.qualityScorecard.identity_cleanliness, "pass");
        assert.equal(result.generatedAgentSpec.projectRetention.policy, "project_local_agent");
        assert.equal(
          result.generatedAgentSpec.projectRetention.temporarySubagentAsDefinition,
          false
        );
        assert.deepEqual(
          result.generatedAgentSpec.projectRetention.runtimeTargets,
          Object.fromEntries(
            buildAgentProjectionTargets("test-coverage-specialist").map((target) => [
              target.runtime,
              {
                target: target.target,
                tool: target.tool,
                compatibilityStatus: target.compatibilityStatus,
              },
            ])
          )
        );
        assert.equal(
          result.decisionOutput.payload.projectRetention.temporarySubagentAsDefinition,
          false
        );
      } else {
        assert.equal(result.generatedAgentSpec, null);
      }
    }
  });

  test("RunStateStore persists runs, events, gaps, decisions, specs, and candidates", async () => {
    const store = await openRunStateStore(":memory:");
    const results = fixtures.map((fixture) => store.replayFixture(fixture));

    assert.equal(store.count("runs"), fixtures.length);
    assert.equal(store.count("capability_gaps"), fixtures.length);
    assert.equal(store.count("gap_decisions"), fixtures.length);
    assert.equal(store.count("generated_agent_specs"), 1);
    assert.equal(store.count("candidate_writebacks"), 4);
    assert.equal(store.count("user_feedback"), fixtures.length);
    assert.ok(store.count("run_events") >= fixtures.length * 8);

    for (const [index, fixture] of fixtures.entries()) {
      const result = results[index];
      const persistedDecision = store.getLatestDecision(result.capabilityGap.gapId);
      assert.equal(persistedDecision.decision, fixture.expectedDecision);
      const events = store.eventTypes(result.run.runId);
      assert.ok(events.includes("capability_gap_detected"));
      assert.ok(events.includes("providers_checked"));
      assert.ok(events.includes("gap_decision_made"));
      assert.ok(events.includes("decision_evidence_recorded"));
      assert.ok(events.includes(fixture.expectedEvent));
    }
  });

  test("workerTask-only has no candidate writeback and blocked branch has no bypass candidate", () => {
    const worker = decideCapabilityGap(
      fixtures.find((fixture) => fixture.expectedDecision === "worker_task_only").input,
      { expectedDecision: "worker_task_only" }
    );
    assert.ok(worker.workerTaskPacket);
    assert.equal(worker.candidateWriteback, null);

    const blocked = decideCapabilityGap(
      fixtures.find((fixture) => fixture.expectedDecision === "blocked_or_needs_approval").input,
      { expectedDecision: "blocked_or_needs_approval" }
    );
    assert.ok(blocked.blockedReason);
    assert.equal(blocked.candidateWriteback, null);
    assert.equal(blocked.generatedAgentSpec, null);
  });

  test("CLI replays fixtures into a local sqlite database", async () => {
    const dbPath = path.join(
      os.tmpdir(),
      `meta-kim-gap-mvp-${process.pid}-${Date.now()}.sqlite`
    );
    const result = spawnSync(
      process.execPath,
      [
        "scripts/capability-gap-mvp.mjs",
        "--fixture",
        "tests/meta-theory/scenarios/capability-gap-decision-fixtures.json",
        "--db",
        dbPath,
        "--json",
      ],
      { encoding: "utf8" }
    );
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.summary.replayed, 6);
    assert.deepEqual(parsed.summary.decisions.sort(), [...GAP_DECISIONS].sort());
    assert.equal(parsed.summary.generatedAgentSpecs, 1);
    assert.equal(parsed.summary.candidateWritebacks, 4);
    assert.equal(parsed.summary.userFeedback, 6);
  });
});
