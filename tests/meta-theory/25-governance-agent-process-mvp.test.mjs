import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runGovernanceAgentProcessMvp } from "../../scripts/run-governance-agent-process-mvp.mjs";

describe("25 — Real governance agent process MVP", async () => {
  test("runs one real governance-agent process through LangGraph state, RunStateStore, and evaluator", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-agent-process-"));
    try {
      const report = await runGovernanceAgentProcessMvp({
        statePath: path.join(tempDir, "process.json"),
        markdownPath: path.join(tempDir, "process.md"),
        dbPath: path.join(tempDir, "process.sqlite"),
      });

      assert.equal(report.status, "pass");
      assert.equal(report.gapDecision, "create_agent");
      assert.equal(
        report.generatedAgentSpec.name,
        "governance-agent-intelligence-evaluator"
      );
      assert.equal(report.evaluation.specEvaluation.status, "pass");
      assert.equal(report.evaluation.intelligenceEvaluation.status, "pass");
      assert.deepEqual(Object.keys(report.stationPackets), [
        "agentBoundaryDecision",
        "agentLoadoutDecision",
        "agentMemoryDecision",
        "agentDesignReview",
        "agentCandidateGateDecision",
      ]);
      assert.equal(
        report.stationPackets.agentDesignReview.copyRiskCheck.sourceNeutral,
        true
      );
      assert.equal(report.stationPackets.agentDesignReview.returnToStage, "none");
      assert.match(
        report.stationPackets.agentMemoryDecision.writebackGate,
        /meta-warden/
      );

      assert.ok(
        report.langGraphTrace.edges.some(
          (edge) =>
            edge.type === "conditional" &&
            edge.condition === "GapDecision.decision == create_agent" &&
            edge.to === "genesis_boundary"
        ),
        "LangGraph control graph must route create_agent to Genesis"
      );

      for (const eventType of [
        "root_goal_locked",
        "evidence_loaded",
        "langgraph_state_created",
        "genesis_boundary_output",
        "artisan_loadout_output",
        "librarian_memory_output",
        "prism_adversarial_review_output",
        "warden_candidate_gate_output",
        "agent_design_quality_evaluated",
        "none_with_reason",
      ]) {
        assert.ok(
          report.database.eventTypes.includes(eventType),
          `RunStateStore missing ${eventType}`
        );
      }

      for (const check of report.acceptanceChecks) {
        assert.equal(check.passed, true, `${check.id} must pass`);
      }
      for (const checkId of [
        "station_output_coverage",
        "station_source_neutral",
        "missing_return_to_stage_count_zero",
        "memory_writeback_bypass_zero",
      ]) {
        assert.ok(
          report.acceptanceChecks.some((check) => check.id === checkId),
          `${checkId} acceptance check missing`
        );
      }
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
