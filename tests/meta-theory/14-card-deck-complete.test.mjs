/**
 * 14-card-deck-complete.test.mjs
 *
 * Tests the complete card/deck system:
 * - All 10 card types (Clarify, Shrink scope, Options, Execute, Verify, Fix, Rollback, Risk, Nudge, Pause)
 * - All 6 card types (info, action, risk, silence, default, upgrade)
 * - All 6 card decisions (deal, suppress, defer, skip, interrupt_insert, escalate)
 * - Control intervention rules (skip, interrupt, override, escalation_insert)
 * - Forced silence rules (≥3 consecutive high-cost cards)
 * - Delivery shell selection
 *
 * Validates:
 * - cardGovernance contract compliance
 * - silencePolicy contract compliance
 * - controlIntervention contract compliance
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readJson, readFile } from "./_helpers.mjs";
import path from "node:path";

const SCENARIOS_PATH = path.join(
  import.meta.dirname,
  "scenarios",
  "card-deck-scenarios.json",
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part A: Card Governance Contract
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part A: cardGovernance contract", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");
  const cg = contract.runDiscipline?.cardGovernance ?? {};

  test("cardGovernance.enabled is true", () => {
    assert.equal(cg.enabled, true);
  });

  test("dealerRoleModel is conductor-primary-warden-escalation", () => {
    assert.equal(cg.dealerRoleModel, "conductor-primary-warden-escalation");
  });

  test("cardTypeEnum has all 6 types", () => {
    const types = cg.cardTypeEnum ?? [];
    const expected = [
      "info",
      "action",
      "risk",
      "silence",
      "default",
      "upgrade",
    ];
    for (const t of expected) {
      assert.ok(types.includes(t), `cardTypeEnum must include "${t}"`);
    }
    assert.equal(types.length, 6);
  });

  test("cardIntentEnum has all required intents", () => {
    const intents = cg.cardIntentEnum ?? [];
    const required = [
      "clarify", // Clarify
      "scope_contract", // Shrink scope
      "plan", // Options
      "execute", // Execute
      "review", // Verify
      "verify", // Verify (separate)
      "repair", // Fix
      "rollback", // Rollback
      "risk_surface", // Risk
      "suggest", // Nudge
      "silence", // Pause
      "default_path", // default
      "escalate", // escalation
    ];
    for (const intent of required) {
      assert.ok(
        intents.includes(intent),
        `cardIntentEnum must include "${intent}"`,
      );
    }
    // At minimum we need 10 intents matching the 10 card types
    assert.ok(
      intents.length >= 10,
      `cardIntentEnum should have ≥10 entries, got ${intents.length}`,
    );
  });

  test("cardDecisionEnum has all 6 decisions", () => {
    const decisions = cg.cardDecisionEnum ?? [];
    const expected = [
      "deal",
      "suppress",
      "defer",
      "skip",
      "interrupt_insert",
      "escalate",
    ];
    for (const d of expected) {
      assert.ok(decisions.includes(d), `cardDecisionEnum must include "${d}"`);
    }
    assert.equal(decisions.length, 6);
  });

  test("suppressionReasonEnum is complete", () => {
    const reasons = cg.suppressionReasonEnum ?? [];
    const expected = [
      "attention_budget_low",
      "already_known",
      "already_in_context",
      "verification_pending",
      "public_display_blocked",
      "no_clear_intervention_gain",
    ];
    for (const r of expected) {
      assert.ok(
        reasons.includes(r),
        `suppressionReasonEnum must include "${r}"`,
      );
    }
  });

  test("dealAccuracyStandard is measurable and evidence-backed", () => {
    const standard = cg.dealAccuracyStandard ?? {};
    assert.equal(standard.schemaVersion, "card-deal-standard-v0.1");
    assert.equal(standard.passThreshold, 80);
    for (const state of [
      "accurate_deal",
      "accurate_interrupt",
      "accurate_suppress",
      "weak_deal",
      "weak_interrupt",
      "unsupported_suppress",
    ]) {
      assert.ok(
        standard.decisionStateEnum?.includes(state),
        `missing card decision state: ${state}`,
      );
    }
    for (const field of [
      "decisionState",
      "accuracyScore",
      "passThreshold",
      "expectedDecision",
      "activationRule",
      "quantitativeSignals",
      "evidenceRefs",
      "falsificationChecks",
    ]) {
      assert.ok(standard.requiredFields?.includes(field), `missing field: ${field}`);
    }
    for (const field of ["signal", "observed", "expected", "pass"]) {
      assert.ok(
        standard.signalRequiredFields?.includes(field),
        `missing signal field: ${field}`,
      );
    }
    assert.match(standard.rule ?? "", /Deck presence or hardcoded order is not enough evidence/i);
    assert.match(standard.deepResearchBinding ?? "", /deep-research claim evidence cards/i);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part B: Silence Policy Contract
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part B: silencePolicy contract", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");
  const sp = contract.runDiscipline?.silencePolicy ?? {};

  test("noInterventionPreferred is true", () => {
    assert.equal(sp.noInterventionPreferred, true);
  });

  test("silenceDecisionEnum has all 4 values", () => {
    const decisions = sp.silenceDecisionEnum ?? [];
    const expected = ["none", "no_card", "defer", "intentional_silence"];
    for (const d of expected) {
      assert.ok(
        decisions.includes(d),
        `silenceDecisionEnum must include "${d}"`,
      );
    }
    assert.equal(decisions.length, 4);
  });

  test("defaultWhen has all 4 default silence scenarios", () => {
    const defaults = sp.defaultWhen ?? [];
    const expected = [
      "no_clear_intervention_gain",
      "user_already_has_context",
      "attention_budget_exceeded",
      "public_display_blocked_pending_verification",
    ];
    for (const d of expected) {
      assert.ok(
        defaults.includes(d),
        `silencePolicy.defaultWhen must include "${d}"`,
      );
    }
    assert.equal(defaults.length, 4);
  });

  test("requiresInterruptionJustification is true", () => {
    assert.equal(sp.requiresInterruptionJustification, true);
  });

  test("deferRequiresDeadline is true", () => {
    assert.equal(sp.deferRequiresDeadline, true);
  });

  test("defaultNoCardPolicy is prefer_silence_without_clear_intervention_gain", () => {
    assert.equal(
      contract.runDiscipline?.cardGovernance?.defaultNoCardPolicy,
      "prefer_silence_without_clear_intervention_gain",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part C: Control Intervention Contract
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part C: controlIntervention contract", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");
  const ci = contract.runDiscipline?.controlIntervention ?? {};

  test("decisionTypeEnum has all 4 types", () => {
    const types = ci.decisionTypeEnum ?? [];
    const expected = ["skip", "interrupt", "override", "escalation_insert"];
    for (const t of expected) {
      assert.ok(types.includes(t), `decisionTypeEnum must include "${t}"`);
    }
    assert.equal(types.length, 4);
  });

  test("skipReasonEnum is complete", () => {
    const reasons = ci.skipReasonEnum ?? [];
    assert.ok(reasons.includes("already_known"));
    assert.ok(reasons.includes("already_in_context"));
    assert.ok(reasons.includes("attention_budget_low"));
    assert.ok(reasons.includes("not_applicable"));
    assert.ok(reasons.includes("artifact_not_needed"));
  });

  test("interruptReasonEnum is complete", () => {
    const reasons = ci.interruptReasonEnum ?? [];
    assert.ok(reasons.includes("security_risk"));
    assert.ok(reasons.includes("quality_drift"));
    assert.ok(reasons.includes("user_urgent"));
    assert.ok(reasons.includes("system_failure"));
    assert.ok(reasons.includes("global_impact"));
  });

  test("insertedGovernanceOwners includes all 4 governance agents", () => {
    const owners = ci.insertedGovernanceOwners ?? [];
    assert.ok(owners.includes("meta-sentinel"));
    assert.ok(owners.includes("meta-prism"));
    assert.ok(owners.includes("meta-warden"));
    assert.ok(owners.includes("meta-conductor"));
    assert.equal(owners.length, 4);
  });

  test("requiresReturnToMainChain is true", () => {
    assert.equal(ci.requiresReturnToMainChain, true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part D: Delivery Shell Contract
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part D: deliveryShell contract", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");
  const shell = contract.runDiscipline?.deliveryShell ?? {};

  test("shellTypeEnum has all 6 types", () => {
    const types = shell.shellTypeEnum ?? [];
    const expected = [
      "one_line",
      "structured_status",
      "technical_detail",
      "review_delta",
      "executive_summary",
      "artifact_link",
    ];
    for (const t of expected) {
      assert.ok(types.includes(t), `shellTypeEnum must include "${t}"`);
    }
  });

  test("presentationModeEnum has all 4 modes", () => {
    const modes = shell.presentationModeEnum ?? [];
    const expected = ["direct", "digest", "deferred", "quiet"];
    for (const m of expected) {
      assert.ok(modes.includes(m), `presentationModeEnum must include "${m}"`);
    }
  });

  test("exposureLevelEnum has all 3 levels", () => {
    const levels = shell.exposureLevelEnum ?? [];
    assert.ok(levels.includes("internal"));
    assert.ok(levels.includes("review"));
    assert.ok(levels.includes("public"));
  });

  test("interventionFormEnum has all 6 forms", () => {
    const forms = shell.interventionFormEnum ?? [];
    const expected = [
      "conversation",
      "file_write",
      "task_packet",
      "agent_dispatch",
      "notification",
      "none",
    ];
    for (const f of expected) {
      assert.ok(forms.includes(f), `interventionFormEnum must include "${f}"`);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part E: Card Protocol Structures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part E: card protocol structures", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");

  test("cardPlanPacket protocol has required fields", () => {
    const fields = contract.protocols?.cardPlanPacket?.requiredFields ?? [];
    const required = [
      "dealerOwner",
      "dealerMode",
      "cardEvents",
      "cardTypeCatalog",
      "cardTypeDecisions",
      "deliveryShells",
      "dealStandard",
      "silenceDecision",
      "controlDecisions",
      "defaultShellId",
    ];
    for (const f of required) {
      assert.ok(fields.includes(f), `cardPlanPacket must have "${f}"`);
    }
  });

  test("cardDecision protocol has all required fields", () => {
    const fields = contract.protocols?.cardDecision?.requiredFields ?? [];
    const required = [
      "cardId",
      "cardType",
      "cardIntent",
      "cardDecision",
      "cardAudience",
      "cardTiming",
      "cardShell",
      "cardPriority",
      "cardReason",
      "cardSource",
      "cardSuppressed",
      "suppressionReason",
      "deliveryShellId",
    ];
    for (const f of required) {
      assert.ok(fields.includes(f), `cardDecision must have "${f}"`);
    }
  });

  test("silenceDecision protocol has all required fields", () => {
    const fields = contract.protocols?.silenceDecision?.requiredFields ?? [];
    const required = [
      "silenceDecision",
      "noInterventionPreferred",
      "interruptionJustified",
      "deferUntil",
      "reasonForSilence",
    ];
    for (const f of required) {
      assert.ok(fields.includes(f), `silenceDecision must have "${f}"`);
    }
  });

  test("controlDecision protocol has all required fields", () => {
    const fields = contract.protocols?.controlDecision?.requiredFields ?? [];
    const required = [
      "decisionId",
      "decisionType",
      "skipReason",
      "interruptReason",
      "overrideReason",
      "insertedGovernanceOwner",
      "emergencyGovernanceTriggered",
      "returnsToStage",
      "rejoinCondition",
    ];
    for (const f of required) {
      assert.ok(fields.includes(f), `controlDecision must have "${f}"`);
    }
  });

  test("deliveryShell protocol has all required fields", () => {
    const fields = contract.protocols?.deliveryShell?.requiredFields ?? [];
    const required = [
      "deliveryShellId",
      "shellType",
      "presentationMode",
      "exposureLevel",
      "interventionForm",
      "audience",
      "contentBoundary",
    ];
    for (const f of required) {
      assert.ok(fields.includes(f), `deliveryShell must have "${f}"`);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part F: Dealer Role Model
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part F: dealer role model in meta-conductor", async () => {
  const conductor = await readFile("canonical/agents/meta-conductor.md");

  test("conductor owns card dealing and rhythm control", () => {
    const patterns = [/card.*deal/i, /rhythm.*control/i, /deal.*card/i];
    assert.ok(
      patterns.some((p) => p.test(conductor)),
      "meta-conductor must own card dealing and rhythm control",
    );
  });

  test("conductor owns dispatch board ownership", () => {
    const patterns = [/dispatch.*board/i, /board.*owner/i];
    assert.ok(
      patterns.some((p) => p.test(conductor)),
      "meta-conductor must own dispatch board",
    );
  });

  test("conductor owns delivery shell selection", () => {
    assert.ok(
      conductor.includes("Delivery Shell") ||
        conductor.includes("delivery shell"),
    );
  });

  test("conductor does NOT own execution (Dispatcher, not executor)", () => {
    const patterns = [
      /not.*executor/i,
      /dispatch.*not.*execute/i,
      /orchestration.*only/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(conductor)),
      "meta-conductor must NOT own execution (Dispatcher, not executor)",
    );
  });

  test("four dealer questions are documented", () => {
    const patterns = [
      /What.*deal/i,
      /When.*deal/i,
      /Who.*receive/i,
      /Why.*deal.*now/i,
    ];
    let found = 0;
    for (const p of patterns) {
      if (p.test(conductor)) found++;
    }
    assert.ok(
      found >= 3,
      "At least 3 of 4 dealer questions must be documented",
    );
  });

  test("Intentional Silence is documented as a deliberate card", () => {
    const patterns = [
      /intentional.*silence/i,
      /silence.*not.*inaction/i,
      /silence.*deliberate/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(conductor)),
      "Intentional Silence must be documented as a deliberate card",
    );
  });

  test("serial execution of independent tasks is condemned", () => {
    const patterns = [
      /serial.*execution.*independent/i,
      /parallelize.*independent/i,
      /cardinal.*sin.*serial/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(conductor)),
      "Serial execution of independent tasks must be condemned",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part G: Card Deck Scenarios
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part G: card deck scenarios", async () => {
  test("card-deck-scenarios.json exists and is valid", async () => {
    const { promises: fs } = await import("node:fs");
    try {
      const raw = await fs.readFile(SCENARIOS_PATH, "utf8");
      const scenarios = JSON.parse(raw);
      assert.ok(Array.isArray(scenarios), "Scenarios must be an array");
      assert.ok(
        scenarios.length >= 10,
        `Expected at least 10 scenarios, got ${scenarios.length}`,
      );
    } catch (err) {
      if (err.code === "ENOENT") {
        assert.fail(`Missing scenario file: ${SCENARIOS_PATH}`);
      }
      throw err;
    }
  });

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
      test(`Card scenario ${scenario.id}: ${scenario.input}`, () => {
        assert.ok(scenario.id, "Scenario must have an id");
        assert.ok(scenario.input, "Scenario must have an input");
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part H: Forced Silence Rule (≥3 consecutive high-cost cards)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part H: forced silence rule", async () => {
  const devGov = await readFile(
    "canonical/skills/meta-theory/references/dev-governance.md",
  );

  test("≥3 consecutive high-cost cards triggers Intentional Silence", () => {
    const patterns = [
      /3.*consecutive/i,
      /consecutive.*3/i,
      /three.*consecutive/i,
      /consecutive.*high/i,
      /forced.*silence/i,
    ];
    const hasSilence = /silence/i.test(devGov);
    const hasConsecutive = /consecutive/i.test(devGov);
    const hasHighDensity = /high.density/i.test(devGov);
    assert.ok(
      patterns.some((p) => p.test(devGov)) && (hasSilence || hasHighDensity),
      "dev-governance.md must document that ≥3 consecutive cards triggers silence/pause",
    );
  });

  test("max_iterations limit is documented", () => {
    const patterns = [/max.*iterations/i, /iteration.*limit/i];
    assert.ok(
      patterns.some((p) => p.test(devGov)),
      "dev-governance.md must document max_iterations limit",
    );
  });

  test("escalate to Warden when max_iterations exceeded", () => {
    const patterns = [
      /max.*iterations.*warden/i,
      /warden.*escalat.*iterations/i,
      /exceed.*iterations.*warden/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(devGov)),
      "Exceeding max_iterations must escalate to Warden",
    );
  });

  test("interrupt_trigger mechanism is documented", () => {
    const patterns = [
      /interrupt.*trigger/i,
      /jump.*front/i,
      /urgent.*governance/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(devGov)),
      "interrupt_trigger mechanism must be documented",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part I: Meta-Warden Integration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part I: warden escalation integration", async () => {
  const warden = await readFile("canonical/agents/meta-warden.md");

  test("warden approves/denies dispatch board", () => {
    const patterns = [
      /approves.*dispatch/i,
      /denies.*dispatch/i,
      /dispatch.*approv/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(warden)),
      "meta-warden must approve/deny dispatch board",
    );
  });

  test("warden owns public display gate", () => {
    // Warden controls publicReadinessState: public-ready, debug-surface, internal-ready.
    // Runtime surfaceState remains silent/notice/decision interaction mode.
    // This is the public display gate ownership
    const patterns = [
      /public.*display/i,
      /public.display/i,
      /gate.*ownership/i,
      /publicReadinessState.*public/i,
      /public.*ready.*warden/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(warden)),
      "meta-warden must own public display gate (controls publicReadinessState)",
    );
  });
});
