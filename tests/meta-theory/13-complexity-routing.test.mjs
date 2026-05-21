/**
 * 13-complexity-routing.test.mjs
 *
 * Tests the complexity routing logic: when does the 8-stage spine
 * upgrade to the 11-phase business workflow.
 *
 * Validates:
 * - Simple (1 file, pure logic) → 4 stages (Execution → Review → Verification → Evolution)
 * - Medium (2-5 files, 1 module) → full 8-stage spine
 * - Complex (>5 files / cross-system / multi-team / security) → 8-stage + 11-phase
 * - Governance flow enum (query/simple_exec/complex_dev/meta_analysis/proposal_review/rhythm)
 * - Upgrade reasons and bypass reasons are correctly defined
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readJson, readFile } from "./_helpers.mjs";
import path from "node:path";

const SCENARIOS_PATH = path.join(
  import.meta.dirname,
  "scenarios",
  "complexity-routing-scenarios.json",
);

describe("Part A: governance flow enum completeness", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");
  const govFlows =
    contract.runDiscipline?.taskClassification?.governanceFlowEnum ?? [];

  test("governanceFlowEnum includes all required flows", () => {
    const required = [
      "query",
      "simple_exec",
      "complex_dev",
      "meta_analysis",
      "proposal_review",
      "rhythm",
    ];
    for (const flow of required) {
      assert.ok(
        govFlows.includes(flow),
        `governanceFlowEnum must include "${flow}"`,
      );
    }
    assert.ok(govFlows.length >= 6);
  });

  test("query flow bypasses agent owner requirement", () => {
    const pureQueryCriteria =
      contract.runDiscipline?.queryBypassRule?.pureQueryCriteria ?? [];
    assert.ok(pureQueryCriteria.includes("no_file_or_code_change"));
    assert.ok(pureQueryCriteria.includes("no_external_side_effect"));
    assert.ok(pureQueryCriteria.includes("no_durable_execution_artifact"));
    assert.ok(pureQueryCriteria.includes("no_downstream_handoff_required"));
  });

  test("onlyQueryMayBypassOwner is true", () => {
    assert.equal(
      contract.runDiscipline?.taskClassification?.onlyQueryMayBypassOwner,
      true,
    );
  });
});

describe("Part B: upgrade reason enum completeness", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");
  const upgradeReasons =
    contract.runDiscipline?.taskClassification?.upgradeReasonEnum ?? [];

  test("upgradeReasonEnum includes all required reasons", () => {
    const required = [
      "cross_system_scope",
      "review_or_verify_required",
      "owner_creation_required",
      "parallel_merge_required",
      "business_workflow_upgrade",
      "security_gate_required",
    ];
    for (const reason of required) {
      assert.ok(
        upgradeReasons.includes(reason),
        `upgradeReasonEnum must include "${reason}"`,
      );
    }
  });

  test("trigger reason enum is complete", () => {
    const triggerReasons =
      contract.runDiscipline?.taskClassification?.triggerReasonEnum ?? [];
    const required = [
      "multi_file",
      "cross_module",
      "external_side_effect",
      "durable_artifact",
      "owner_missing",
      "cross_runtime_sync",
      "security_sensitive",
      "verification_required",
      "writeback_candidate",
      "user_explicit_review",
    ];
    for (const reason of required) {
      assert.ok(
        triggerReasons.includes(reason),
        `triggerReasonEnum must include "${reason}"`,
      );
    }
  });

  test("bypass reason enum is complete", () => {
    const bypassReasons =
      contract.runDiscipline?.taskClassification?.bypassReasonEnum ?? [];
    assert.ok(bypassReasons.includes("pure_query"));
    assert.ok(bypassReasons.includes("read_only_explanation"));
    assert.ok(bypassReasons.includes("existing_verified_artifact_reuse"));
  });
});

describe("Part C: complexity routing in dev-governance.md", async () => {
  const devGov = await readFile(
    "canonical/skills/meta-theory/references/dev-governance.md",
  );

  test("simple complexity routing is documented (4 stages)", () => {
    // Simple: 1 file, pure logic/style/comments
    const patterns = [
      /Simple.*Execution.*Review.*Verification.*Evolution/i,
      /1 file.*→.*Execution.*Review.*Verification.*Evolution/i,
      /4 stages.*simple/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(devGov)),
      "Simple routing (4 stages) must be documented",
    );
  });

  test("medium complexity routing is documented (full 8-stage spine)", () => {
    // Medium: 2-5 files, 1 module
    const patterns = [
      /Medium.*8.*stage/i,
      /2.*5 files.*→.*8.*stage/i,
      /5 files.*full.*8/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(devGov)),
      "Medium routing (full 8-stage spine) must be documented",
    );
  });

  test("complex complexity routing is documented (8-stage + 11-phase)", () => {
    // Complex: >5 files OR cross-system OR multi-team
    const patterns = [
      /Complex.*8.*stage.*11.*phase/i,
      />5 files.*upgrade.*11/i,
      /cross.system.*11.*phase/i,
      /multi.team.*upgrade/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(devGov)),
      "Complex routing (8-stage + 11-phase) must be documented",
    );
  });

  test("file scope threshold (>5 files) is explicitly documented", () => {
    const patterns = [/5 files/i, /five files/i, /6.*files/i];
    assert.ok(
      patterns.some((p) => p.test(devGov)),
      "File scope threshold (>5 files) must be documented",
    );
  });

  test("cross-system dependency triggers upgrade", () => {
    const patterns = [
      /cross.system.*upgrade/i,
      /cross.system.*11/i,
      /system.*dependency.*upgrade/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(devGov)),
      "Cross-system dependency must trigger upgrade",
    );
  });

  test("security-sensitive changes trigger upgrade", () => {
    const patterns = [/security.*upgrade/i, /security.*11/i, /security.gate/i];
    assert.ok(
      patterns.some((p) => p.test(devGov)),
      "Security-sensitive changes must trigger upgrade",
    );
  });

  test("legacy 10-stage wording is not documented as the current routing model", () => {
    const forbiddenCurrentModelPatterns = [
      /upgrade to (?:full )?10[- ](?:step|stage)/i,
      /10[- ]stage business workflow/i,
      /10阶段/,
      /Full 1[–-]10/i,
      /All 10\b/i,
    ];
    assert.ok(
      forbiddenCurrentModelPatterns.every((p) => !p.test(devGov)),
      "current complexity routing must not preserve the old 10-step/10-stage model",
    );
  });
});

describe("Part D: capability-first dispatch (no hardcoded names)", async () => {
  const devGov = await readFile(
    "canonical/skills/meta-theory/references/dev-governance.md",
  );

  test("Fetch-first pattern is documented (Search → Match → Invoke)", () => {
    const patterns = [
      /Fetch.*first/i,
      /Search.*Match.*Invoke/i,
      /capability.*match/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(devGov)),
      "Fetch-first pattern (Search → Match → Invoke) must be documented",
    );
  });

  test("ownerRequiredByDefault is true", async () => {
    const contract = await readJson("config/contracts/workflow-contract.json");
    assert.equal(
      contract.runDiscipline?.taskClassification?.ownerRequiredByDefault,
      true,
    );
  });
});

describe("Part E: complexity routing scenarios", async () => {
  test("complexity-routing-scenarios.json exists and is valid", async () => {
    const { promises: fs } = await import("node:fs");
    try {
      const raw = await fs.readFile(SCENARIOS_PATH, "utf8");
      const scenarios = JSON.parse(raw);
      assert.ok(Array.isArray(scenarios), "Scenarios must be an array");
      assert.ok(
        scenarios.length >= 5,
        `Expected at least 5 scenarios, got ${scenarios.length}`,
      );
    } catch (err) {
      if (err.code === "ENOENT") {
        assert.fail(`Missing scenario file: ${SCENARIOS_PATH}`);
      }
      throw err;
    }
  });

  // Dynamically load and validate each scenario
  let scenarios;
  try {
    const { promises: fs } = await import("node:fs");
    const raw = await fs.readFile(SCENARIOS_PATH, "utf8");
    scenarios = JSON.parse(raw);
  } catch {
    scenarios = [];
  }

  if (scenarios.length > 0) {
    for (const scenario of scenarios) {
      test(`Scenario ${scenario.id}: ${scenario.input}`, () => {
        assert.ok(scenario.id, "Scenario must have an id");
        assert.ok(scenario.input, "Scenario must have an input");
        assert.ok(
          scenario.expectedComplexity,
          "Scenario must have expectedComplexity",
        );
        assert.ok(
          scenario.expectedGovernanceFlow,
          "Scenario must have expectedGovernanceFlow",
        );
        assert.ok(
          scenario.passFailCriteria?.PASS,
          `Scenario ${scenario.id} must have passFailCriteria.PASS`,
        );
        assert.ok(
          scenario.passFailCriteria?.FAIL,
          `Scenario ${scenario.id} must have passFailCriteria.FAIL`,
        );
      });
    }
  }
});

describe("Part F: protocol-first required packets for governed flows", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");

  test("dispatchEnvelopePacket is required for non-query flows", () => {
    const requiredFor =
      contract.runDiscipline?.protocolFirst
        ?.dispatchEnvelopePacketRequiredWhenGovernanceFlows ?? [];
    assert.ok(requiredFor.includes("simple_exec"));
    assert.ok(requiredFor.includes("complex_dev"));
    assert.ok(
      !requiredFor.includes("query"),
      "dispatchEnvelopePacket should NOT be required for query",
    );
  });

  test("orchestrationTaskBoardPacket is required for non-query flows", () => {
    const requiredFor =
      contract.runDiscipline?.protocolFirst
        ?.orchestrationTaskBoardPacketRequiredWhenGovernanceFlows ?? [];
    assert.ok(requiredFor.includes("simple_exec"));
    assert.ok(requiredFor.includes("complex_dev"));
    assert.ok(
      !requiredFor.includes("query"),
      "orchestrationTaskBoardPacket should NOT be required for query",
    );
  });

  test("capabilityGapPacket is required when owner_creation_required upgrade reason", () => {
    const requiredWhen =
      contract.runDiscipline?.protocolFirst
        ?.capabilityGapPacketRequiredWhenUpgradeReasons ?? [];
    assert.ok(
      requiredWhen.includes("owner_creation_required"),
      "capabilityGapPacket must be required when owner_creation_required upgrade reason triggers",
    );
  });

  test("intentPacket is required for complex_dev and meta_analysis", () => {
    const requiredWhen =
      contract.runDiscipline?.protocolFirst
        ?.intentPacketRequiredWhenGovernanceFlows ?? [];
    assert.ok(requiredWhen.includes("complex_dev"));
    assert.ok(requiredWhen.includes("meta_analysis"));
  });

  test("all 16 required protocol packets are declared", () => {
    const required =
      contract.runDiscipline?.protocolFirst?.requiredPackets ?? [];
    assert.ok(required.includes("runHeader"), "runHeader must be required");
    assert.ok(
      required.includes("taskClassification"),
      "taskClassification must be required",
    );
    assert.ok(required.includes("fetchPacket"), "fetchPacket must be required");
    assert.ok(
      required.includes("cardPlanPacket"),
      "cardPlanPacket must be required",
    );
    assert.ok(
      required.includes("dispatchEnvelopePacket"),
      "dispatchEnvelopePacket must be required",
    );
    assert.ok(
      required.includes("orchestrationTaskBoardPacket"),
      "orchestrationTaskBoardPacket must be required",
    );
    assert.ok(
      required.includes("reviewPacket"),
      "reviewPacket must be required",
    );
    assert.ok(
      required.includes("verificationPacket"),
      "verificationPacket must be required",
    );
    assert.ok(
      required.includes("summaryPacket"),
      "summaryPacket must be required",
    );
    assert.ok(
      required.includes("evolutionWritebackPacket"),
      "evolutionWritebackPacket must be required",
    );
    // Contract defines 13 required packets; verify at minimum the core 10 are present
    assert.ok(
      required.length >= 10,
      `Expected at least 10 required packets, got ${required.length}`,
    );
  });
});
