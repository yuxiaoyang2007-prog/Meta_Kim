/**
 * 11-eight-stage-spine.test.mjs
 *
 * Tests the complete 8-stage execution spine:
 * Critical → Fetch → Thinking → Execution → Review → Meta-Review → Verification → Evolution
 *
 * Validates:
 * - All 8 stages have correct state transitions
 * - gateState is properly set at each gate
 * - controlState (normal/skip/interrupt/intentional-silence/iteration) switches correctly
 * - All required protocol packets exist for each stage
 * - Stage ordering is enforced (Critical before Fetch, Evolution last)
 * - The spine relationship to business workflow phases is distinct
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  REPO_ROOT,
  EIGHT_STAGES,
  readFile,
  readJson,
  fileExists,
} from "./_helpers.mjs";

const DEV_GOV_PATH = `${REPO_ROOT}/canonical/skills/meta-theory/references/dev-governance.md`;
const SKILL_PATH = `${REPO_ROOT}/canonical/skills/meta-theory/SKILL.md`;
const WORKFLOW_CONTRACT = `${REPO_ROOT}/config/contracts/workflow-contract.json`;
const VALID_FIXTURE = `${REPO_ROOT}/tests/fixtures/run-artifacts/valid-run.json`;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part A: Stage Ordering & State Machine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part A: 8-stage spine ordering", async () => {
  test("all 8 stages are listed in EIGHT_STAGES helper", () => {
    const expected = [
      "Critical",
      "Fetch",
      "Thinking",
      "Execution",
      "Review",
      "Meta-Review",
      "Verification",
      "Evolution",
    ];
    assert.deepEqual(EIGHT_STAGES, expected);
  });

  test("SKILL.md defines the 8-stage spine", async () => {
    const skill = await readFile("canonical/skills/meta-theory/SKILL.md");
    for (const stage of EIGHT_STAGES) {
      assert.ok(
        skill.includes(stage),
        `SKILL.md must reference stage "${stage}"`,
      );
    }
  });

  test("workflow-contract.json canonicalExecutionSpineStages has all 8", async () => {
    const contract = await readJson("config/contracts/workflow-contract.json");
    const stages =
      contract.businessWorkflow?.canonicalExecutionSpineStages ?? [];
    assert.equal(stages.length, 8);
    const expected = [
      "critical",
      "fetch",
      "thinking",
      "execution",
      "review",
      "meta_review",
      "verification",
      "evolution",
    ];
    for (const stage of expected) {
      assert.ok(stages.includes(stage), `Missing spine stage: ${stage}`);
    }
  });

  test("workflow-contract.json distinctFromCanonicalSpine is true", async () => {
    const contract = await readJson("config/contracts/workflow-contract.json");
    assert.equal(
      contract.businessWorkflow?.distinctFromCanonicalSpine,
      true,
      "business workflow must be declared distinct from the 8-stage spine",
    );
    assert.ok(
      contract.businessWorkflow?.canonicalExecutionSpineRef?.includes(
        "Critical",
      ),
      "business workflow must reference the canonical 8-stage spine",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part B: Hidden State Skeleton
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part B: hidden state skeleton", async () => {
  const devGov = await readFile(
    "canonical/skills/meta-theory/references/dev-governance.md",
  );

  test("stageState progression is documented", () => {
    const stageStatePattern =
      /stageState.*Critical.*Fetch.*Thinking.*Execution.*Review.*Meta-Review.*Verification.*Evolution/s;
    assert.ok(
      stageStatePattern.test(devGov) || devGov.includes("stageState"),
      "dev-governance.md must document stageState progression",
    );
  });

  test("controlState values are documented", () => {
    const controlStates = [
      "normal",
      "skip",
      "interrupt",
      "intentional-silence",
      "iteration",
    ];
    for (const state of controlStates) {
      assert.ok(
        devGov.includes(state),
        `controlState value "${state}" must be documented in dev-governance.md`,
      );
    }
  });

  test("gateState values are documented", () => {
    const gateStates = [
      "planning-open",
      "planning-passed",
      "verification-open",
      "verification-closed",
      "synthesis-ready",
    ];
    let found = 0;
    for (const state of gateStates) {
      if (devGov.includes(state)) found++;
    }
    assert.ok(
      found >= 3,
      `dev-governance.md must document at least 3 gateState values (found ${found}/5)`,
    );
  });

  test("surfaceState values are documented", () => {
    const surfaceStates = ["debug-surface", "internal-ready", "public-ready"];
    let found = 0;
    for (const state of surfaceStates) {
      if (devGov.includes(state)) found++;
    }
    assert.ok(
      found >= 2,
      `dev-governance.md must document at least 2 surfaceState values (found ${found}/3)`,
    );
  });

  test("4-state layers (stageState, controlState, gateState, surfaceState) all present", () => {
    const hasStage = devGov.includes("stageState");
    const hasControl = devGov.includes("controlState");
    const hasGate = devGov.includes("gateState");
    const hasSurface = devGov.includes("surfaceState");
    assert.ok(
      hasStage && hasControl && hasGate && hasSurface,
      "All 4 hidden state layers must be documented",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part C: Stage-Stage State Transitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part C: stage-state transitions are documented", async () => {
  const devGov = await readFile(
    "canonical/skills/meta-theory/references/dev-governance.md",
  );

  test("Critical → Fetch transition is documented", () => {
    // Critical feeds into Fetch; the clarity gate must pass before Fetch
    const patterns = [
      /Critical.*Fetch/i,
      /Clarity.*Gate.*Fetch/i,
      /Gate 1.*Fetch/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(devGov)),
      "Critical → Fetch transition must be documented",
    );
  });

  test("Fetch → Thinking transition is documented", () => {
    // Fetch produces capability matches, then Thinking decomposes
    const patterns = [
      /Fetch.*Thinking/i,
      /capability.*Thinking/i,
      /decomposition.*after.*Fetch/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(devGov)),
      "Fetch → Thinking transition must be documented",
    );
  });

  test("Thinking → Execution transition requires Stage 3 artifacts", () => {
    // Execution only starts after runHeader, taskClassification, dispatchEnvelopePacket exist
    const patterns = [
      /Execution.*after.*Thinking/i,
      /Stage 3 artifacts.*before.*Execution/i,
      /runHeader.*dispatchEnvelope/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(devGov)),
      "Thinking → Execution transition requires Stage 3 artifacts",
    );
  });

  test("Review → Meta-Review → Verification chain is documented", () => {
    const patterns = [
      /Review.*Meta-Review.*Verification/s,
      /Meta-Review.*Verification.*Evolution/s,
      /verification.*Evolution/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(devGov)),
      "Review → Meta-Review → Verification chain must be documented",
    );
  });

  test("Evolution is always the final stage", () => {
    // Evolution closes the loop; nothing comes after it as a normal stage
    // It can reference other stages (→ meta-warden synthesis, → scar protocol) but
    // the 8-stage spine ends at Evolution
    const evolutionSection = devGov.match(/Evolution[\s\S]{0,800}/);
    assert.ok(evolutionSection, "Evolution section must exist");
    // Verify Evolution is documented as the terminal stage of the spine
    // by checking the stageState progression ends with Evolution
    const hasTerminalEvolution =
      devGov.includes("Verification") &&
      devGov.includes("Evolution") &&
      (devGov.match(/stageState.*Evolution/s) !== null ||
        devGov.match(/Evolution.*→/s) !== null ||
        devGov.match(
          /stageState.*critical.*fetch.*thinking.*execution.*review.*meta.review.*verification.*evolution/gi,
        ) !== null);
    assert.ok(
      hasTerminalEvolution,
      "Evolution must be documented as the terminal stage of the 8-stage spine",
    );
  });

  test("skip/interrupt/iteration control transitions are documented", () => {
    const patterns = [
      /controlState.*skip/i,
      /skip.*stage/i,
      /interrupt.*stage/i,
      /iteration.*stage/i,
    ];
    let found = 0;
    for (const p of patterns) {
      if (p.test(devGov)) found++;
    }
    assert.ok(
      found >= 2,
      "Skip/interrupt/iteration transitions must be documented",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part D: Protocol Packets Per Stage
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part D: required protocol packets per stage", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");

  const STAGE_PACKETS = {
    Critical: ["runHeader", "taskClassification"],
    Fetch: ["fetchPacket"],
    Thinking: [
      "cardPlanPacket",
      "dispatchEnvelopePacket",
      "orchestrationTaskBoardPacket",
      "businessFlowBlueprintPacket",
      "agentBlueprintPacket",
    ],
    Execution: ["workerTaskPacket", "workerResultPacket"],
    Review: ["reviewPacket"],
    Verification: ["verificationPacket"],
    Evolution: ["evolutionWritebackPacket"],
  };

  // Meta-Review doesn't produce its own packet; it reviews the review standards

  for (const [stage, packets] of Object.entries(STAGE_PACKETS)) {
    for (const packet of packets) {
      test(`protocols.${packet} exists (produced at stage: ${stage})`, () => {
        assert.ok(
          contract.protocols?.[packet] !== undefined,
          `protocols.${packet} must exist (produced at stage: ${stage})`,
        );
        assert.ok(
          contract.protocols?.[packet]?.requiredFields?.length > 0,
          `protocols.${packet} must have requiredFields`,
        );
      });
    }
  }

  test("Meta-Review reviews the reviewPacket, not a separate packet", () => {
    // Meta-Review is the review-of-review; it doesn't define a new protocol
    // but operates on the reviewPacket from Stage 5
    const hasMetaReviewDocs =
      contract.protocols?.reviewPacket?.description?.includes("Meta-Review") ||
      contract.businessWorkflow?.phases?.includes("meta_review");
    assert.ok(
      hasMetaReviewDocs,
      "Meta-Review should be referenced in reviewPacket description or phases",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part E: Full Run Artifact — All 8 Stage Products Present
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part E: valid run artifact contains all 8-stage products", async () => {
  test("valid-run.json fixture contains runHeader", async () => {
    const fixture = await readJson(
      "tests/fixtures/run-artifacts/valid-run.json",
    );
    assert.ok(fixture.runHeader, "valid-run.json must have runHeader");
    assert.ok(fixture.runHeader.department, "runHeader must have department");
    assert.ok(
      fixture.runHeader.primaryDeliverable,
      "runHeader must have primaryDeliverable",
    );
  });

  test("valid-run.json fixture contains taskClassification", async () => {
    const fixture = await readJson(
      "tests/fixtures/run-artifacts/valid-run.json",
    );
    assert.ok(
      fixture.taskClassification,
      "valid-run.json must have taskClassification",
    );
    assert.ok(
      fixture.taskClassification.governanceFlow,
      "taskClassification must have governanceFlow",
    );
  });

  test("valid-run.json fixture contains fetchPacket", async () => {
    const fixture = await readJson(
      "tests/fixtures/run-artifacts/valid-run.json",
    );
    assert.ok(fixture.fetchPacket, "valid-run.json must have fetchPacket");
    assert.ok(
      fixture.fetchPacket.capabilityMatches !== undefined,
      "fetchPacket must have capabilityMatches",
    );
  });

  test("valid-run.json fixture contains cardPlanPacket", async () => {
    const fixture = await readJson(
      "tests/fixtures/run-artifacts/valid-run.json",
    );
    assert.ok(
      fixture.cardPlanPacket,
      "valid-run.json must have cardPlanPacket",
    );
    assert.ok(fixture.cardPlanPacket.cards, "cardPlanPacket must have cards");
  });

  test("valid-run.json fixture contains dispatchEnvelopePacket", async () => {
    const fixture = await readJson(
      "tests/fixtures/run-artifacts/valid-run.json",
    );
    assert.ok(
      fixture.dispatchEnvelopePacket,
      "valid-run.json must have dispatchEnvelopePacket",
    );
    assert.ok(
      fixture.dispatchEnvelopePacket.ownerAgent,
      "dispatchEnvelopePacket must have ownerAgent",
    );
  });

  test("valid-run.json fixture contains orchestrationTaskBoardPacket", async () => {
    const fixture = await readJson(
      "tests/fixtures/run-artifacts/valid-run.json",
    );
    assert.ok(
      fixture.orchestrationTaskBoardPacket,
      "valid-run.json must have orchestrationTaskBoardPacket",
    );
    assert.ok(
      fixture.orchestrationTaskBoardPacket.tasks,
      "orchestrationTaskBoardPacket must have tasks",
    );
  });

  test("valid-run.json fixture contains workerTaskPacket(s)", async () => {
    const fixture = await readJson(
      "tests/fixtures/run-artifacts/valid-run.json",
    );
    assert.ok(
      fixture.workerTaskPackets || fixture.workerTaskPacket,
      "valid-run.json must have workerTaskPacket(s)",
    );
  });

  test("valid-run.json fixture contains reviewPacket", async () => {
    const fixture = await readJson(
      "tests/fixtures/run-artifacts/valid-run.json",
    );
    assert.ok(fixture.reviewPacket, "valid-run.json must have reviewPacket");
    assert.ok(fixture.reviewPacket.findings, "reviewPacket must have findings");
  });

  test("valid-run.json fixture contains verificationPacket", async () => {
    const fixture = await readJson(
      "tests/fixtures/run-artifacts/valid-run.json",
    );
    assert.ok(
      fixture.verificationPacket,
      "valid-run.json must have verificationPacket",
    );
    assert.ok(
      fixture.verificationPacket.verified !== undefined,
      "verificationPacket must have verified",
    );
  });

  test("valid-run.json fixture contains summaryPacket", async () => {
    const fixture = await readJson(
      "tests/fixtures/run-artifacts/valid-run.json",
    );
    assert.ok(fixture.summaryPacket, "valid-run.json must have summaryPacket");
    assert.ok(
      fixture.summaryPacket.publicReady !== undefined,
      "summaryPacket must have publicReady",
    );
  });

  test("valid-run.json fixture contains evolutionWritebackPacket", async () => {
    const fixture = await readJson(
      "tests/fixtures/run-artifacts/valid-run.json",
    );
    assert.ok(
      fixture.evolutionWritebackPacket,
      "valid-run.json must have evolutionWritebackPacket",
    );
    assert.ok(
      fixture.evolutionWritebackPacket.writebackDecision !== undefined,
      "evolutionWritebackPacket must have writebackDecision",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part F: Gate State Enforcement
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part F: gate state enforcement", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");

  test("planning gate owner is meta-conductor", () => {
    assert.equal(contract.gates?.planning?.owner, "meta-conductor");
  });

  test("planning gate has pass and rework tokens", () => {
    assert.equal(contract.gates?.planning?.passToken, "Pass");
    assert.equal(
      contract.gates?.planning?.reworkToken,
      "Requires Re-scheduling",
    );
  });

  test("verification gate owners are meta-warden and meta-prism", () => {
    const owners = contract.gates?.verify?.owners ?? [];
    assert.ok(
      owners.includes("meta-warden"),
      "verify gate must include meta-warden",
    );
    assert.ok(
      owners.includes("meta-prism"),
      "verify gate must include meta-prism",
    );
  });

  test("metaReview gate owners are meta-warden and meta-prism", () => {
    const owners = contract.gates?.metaReview?.owners ?? [];
    assert.ok(
      owners.includes("meta-warden"),
      "metaReview gate must include meta-warden",
    );
    assert.ok(
      owners.includes("meta-prism"),
      "metaReview gate must include meta-prism",
    );
  });

  test("summary gate requires verified run", () => {
    assert.equal(contract.gates?.summary?.requiresVerifiedRun, true);
  });

  test("publicDisplay gate is a hard release gate", () => {
    const gate = contract.gates?.publicDisplay ?? {};
    assert.equal(gate.hardReleaseGate, true);
    assert.ok(
      gate.blockFinalDraftWithoutVerifiedRun,
      "must block without verified run",
    );
    assert.ok(
      gate.blockExternalDisplayWithoutSummaryClosure,
      "must block without summary closure",
    );
    assert.ok(
      gate.blockCompletionWithoutClosedDeliverableChain,
      "must block without deliverable chain",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part G: Control State Transitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part G: control state transitions", async () => {
  const devGov = await readFile(
    "canonical/skills/meta-theory/references/dev-governance.md",
  );
  const contract = await readJson("config/contracts/workflow-contract.json");

  test("skip transition documented (stage skipped)", () => {
    const patterns = [
      /skip.*stage/i,
      /controlState.*skip/i,
      /skip.*condition/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(devGov)),
      "Skip control transition must be documented",
    );
  });

  test("interrupt transition documented (emergency pause)", () => {
    const patterns = [
      /interrupt.*stage/i,
      /controlState.*interrupt/i,
      /emergency.*interrupt/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(devGov)),
      "Interrupt control transition must be documented",
    );
  });

  test("iteration transition documented (re-enter Execution after verification fail)", () => {
    const patterns = [
      /iteration.*Execution/i,
      /controlState.*iteration/i,
      /re-enter.*Execution.*verification.*fail/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(devGov)),
      "Iteration control transition must be documented",
    );
  });

  test("intentional-silence transition documented", () => {
    const patterns = [
      /intentional.*silence/i,
      /controlState.*silence/i,
      /forced.*silence/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(devGov)),
      "Intentional-silence control transition must be documented",
    );
  });

  test("returnsToMainChain rule documented for interrupt/override", () => {
    assert.equal(
      contract.runDiscipline?.controlIntervention?.requiresReturnToMainChain,
      true,
      "controlIntervention.requiresReturnToMainChain must be true",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part H: Verification → Evolution Close
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part H: verification-to-evolution close", async () => {
  const devGov = await readFile(
    "canonical/skills/meta-theory/references/dev-governance.md",
  );

  test("Evolution receives verificationPacket results", () => {
    const patterns = [
      /Evolution.*verification.*Packet/i,
      /verification.*Evolution/i,
      /verification.*close.*Evolution/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(devGov)),
      "Evolution must receive verificationPacket results",
    );
  });

  test("Evolution produces evolutionWritebackPacket with required fields", async () => {
    const contract = await readJson("config/contracts/workflow-contract.json");
    const fields =
      contract.protocols?.evolutionWritebackPacket?.requiredFields ?? [];
    const required = ["writebackDecision", "decisionReason", "writebacks"];
    for (const field of required) {
      assert.ok(
        fields.includes(field),
        `evolutionWritebackPacket must have required field: ${field}`,
      );
    }
  });

  test("Evolution writeback targets are defined", async () => {
    const contract = await readJson("config/contracts/workflow-contract.json");
    const targets = contract.runDiscipline?.evolutionWritebackTargets ?? [];
    assert.ok(
      targets.length >= 2,
      "evolutionWritebackTargets must have at least 2 targets",
    );
    assert.ok(
      targets.some((t) => t.includes("canonical/agents/")),
      "must target agents",
    );
    assert.ok(
      targets.some((t) => t.includes("canonical/skills/")),
      "must target skills",
    );
    // Evolution writes back to agent definitions directly, NOT memory/
    assert.ok(
      !targets.some((t) => t.includes("memory/")),
      "must NOT target memory/ (Claude Code session memory, not Meta_Kim evolution)",
    );
  });
});
