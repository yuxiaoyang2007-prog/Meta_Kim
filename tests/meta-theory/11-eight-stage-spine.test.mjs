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
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkCapabilityNodeBindings,
  checkChoiceSurfaceGate,
  checkStageRequirements,
  createInitialState,
} from "../../canonical/runtime-assets/claude/hooks/spine-state.mjs";
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

function minimalNodeBindings() {
  return {
    fetchRecord: {
      capabilitySearchPerformed: true,
      capabilityMatches: [
        {
          name: "backend implementation capability",
          score: 3,
          matchReason: "covered by backend role lane",
        },
      ],
    },
    businessFlowBlueprintPacket: {
      requiredLanes: [
        {
          laneId: "backend",
          capabilityNeed: "backend implementation",
          capabilitySearchQuery: "backend implementation owner",
          candidateOwners: ["meta-conductor"],
          candidateSkills: ["meta-theory"],
          selectedOwner: "meta-conductor",
          selectionReason: "capability-first scan selected meta-conductor",
          coverageStatus: "covered",
        },
      ],
      optionalLanes: [],
    },
    agentBlueprintPacket: {
      roles: [
        {
          businessRoleId: "backend",
          roleDisplayName: "backend",
          ownerAgent: "meta-conductor",
          ownerSource: "meta_kim_canonical",
          agentCopyPolicy: "meta_kim_governance_only",
          ownerResolution: "reuse_existing_owner",
          assignedResponsibilitySlice: ["backend"],
          matchedSkills: [
            {
              matchId: "match-backend-001",
              capabilitySlot: "backend implementation",
              providerId: "meta-theory",
              skillId: "local-project-code-change",
              source: "capability-index",
              selectionReason: "run-scoped skill evidence",
              selectionScope: "run_scoped",
            },
          ],
          skillSelectionScope: "run_scoped",
          governanceStageNodes: [
            {
              stage: "Fetch",
              ownerAgent: "meta-artisan",
              responsibility: "match capability",
            },
          ],
        },
      ],
    },
    workerTaskPackets: [
      {
        taskPacketId: "task-backend-001",
        ownerAgent: "meta-conductor",
        businessRoleId: "backend",
        roleDisplayName: "backend",
        roleInstanceId: "backend#1",
        todayTask: "implement bounded backend change",
        output: "patch and verification notes",
        verifySteps: ["focused test passes"],
      },
    ],
  };
}

function completePreExecutionBindings() {
  return {
    ...minimalNodeBindings(),
    dispatchEnvelopePacket: {
      ownerAgent: "meta-conductor",
      roleDisplayName: "backend",
      route: "project_only",
      capabilityBoundary: "backend implementation",
      allowedCapabilities: ["backend implementation"],
      blockedCapabilities: ["deploy production"],
      ownerSelection: "capability_first",
      memoryMode: "project_only",
      reviewOwner: "meta-prism",
      verificationOwner: "meta-warden",
      userChoiceState: "explicit_auto_proceed",
    },
    orchestrationTaskBoardPacket: {
      dispatchBoardId: "board-001",
      boardMode: "direct_dispatch",
      synthesisOwner: "meta-conductor",
      tasks: [
        {
          taskId: "task-backend-001",
          ownerAgent: "meta-conductor",
          dependsOn: [],
        },
      ],
    },
    dispatchBoard: {
      boardId: "board-001",
      department: "Meta_Kim",
      primaryDeliverable: "auth-refresh-hardening",
      ownerAgent: "meta-conductor",
      reviewerAgent: "meta-prism",
      verifierAgent: "meta-warden",
    },
    productCompletenessPacket: {
      completenessStatus: "pass",
      owner: "meta-conductor",
      evidenceRefs: ["businessFlowBlueprintPacket"],
    },
    experienceQualityPacket: {
      experienceStatus: "not_applicable_with_reason",
      owner: "meta-prism",
      evidenceRefs: ["summaryPacket"],
    },
    testStrategyPacket: {
      testStatus: "pass",
      owner: "meta-warden",
      evidenceRefs: ["workerTaskPackets[0].verifySteps"],
    },
    structureHygienePacket: {
      hygieneStatus: "pass",
      owner: "meta-prism",
      evidenceRefs: ["workerResultPackets"],
    },
    permissionMatrixPacket: {
      permissionStatus: "pass",
      owner: "meta-sentinel",
      evidenceRefs: ["reviewPacket"],
    },
    sideEffectLedgerPacket: {
      sideEffectStatus: "tracked",
      owner: "meta-sentinel",
      evidenceRefs: ["workerResultPackets"],
    },
    rollbackPlanPacket: {
      rollbackStatus: "ready",
      owner: "meta-warden",
      evidenceRefs: ["verificationPacket"],
    },
    businessFlowBlueprintPacket: {
      ...minimalNodeBindings().businessFlowBlueprintPacket,
      deliverableType: "custom",
      omittedLanes: [],
      laneDependencies: [],
      coverageJudgment: "complete",
      blueprintSource: "test",
      blueprintVersion: "v1",
    },
  };
}

function preExecutionReadinessPacketsOnly() {
  const {
    fetchRecord,
    businessFlowBlueprintPacket,
    agentBlueprintPacket,
    workerTaskPackets,
    ...packets
  } = completePreExecutionBindings();
  return packets;
}

function modernCapabilityNodeBindings() {
  const state = completePreExecutionBindings();
  const lane = state.businessFlowBlueprintPacket.requiredLanes[0];
  lane.candidateCapabilities = [
    {
      capabilitySlot: "backend implementation",
      bindingType: "command",
      bindingRef: "npm:test:meta-theory",
    },
  ];
  delete lane.candidateSkills;

  const role = state.agentBlueprintPacket.roles[0];
  delete role.matchedSkills;
  role.matchedCapabilities = [
    {
      matchId: "cap-backend-001",
      capabilitySlot: "backend implementation",
      bindingType: "command",
      bindingRef: "npm run meta:test:meta-theory",
      source: "config/capability-index",
      confidenceScore: 4,
      selectionReason: "Focused command binding covers the test lane.",
      selectionScope: "run_scoped",
      persistencePolicy: "do_not_persist_to_agent_identity",
      fallback: "Block with capabilityGapPacket if the command is unavailable.",
    },
  ];
  role.capabilityBindings = [
    {
      bindingId: "binding-backend-001",
      capabilitySlot: "backend implementation",
      bindingType: "command",
      bindingRef: "npm run meta:test:meta-theory",
      source: "config/capability-index",
      evidenceRef: "fetchRecord.capabilityMatches[0]",
    },
  ];

  return state;
}

function runEnforceHook(state, payload, options = {}) {
  const { runtime = "codex" } = options;
  const cwd = mkdtempSync(join(tmpdir(), "meta-kim-hook-"));
  try {
    const hookDir = join(cwd, "hooks");
    mkdirSync(hookDir, { recursive: true });
    for (const fileName of [
      "enforce-agent-dispatch.mjs",
      "bash-readonly-whitelist.mjs",
      "spine-state.mjs",
    ]) {
      copyFileSync(
        join(REPO_ROOT, "canonical/runtime-assets/claude/hooks", fileName),
        join(hookDir, fileName),
      );
    }
    for (const fileName of ["utils.mjs", "skip-reminder.mjs", "hook-i18n.mjs"]) {
      copyFileSync(
        join(REPO_ROOT, "canonical/runtime-assets/shared/hooks", fileName),
        join(hookDir, fileName),
      );
    }
    const spineDir = join(cwd, ".meta-kim", "state", "test", "spine");
    mkdirSync(spineDir, { recursive: true });
    writeFileSync(
      join(spineDir, "spine-state.json"),
      JSON.stringify(state, null, 2),
      "utf8",
    );
    return spawnSync(
      process.execPath,
      [join(hookDir, "enforce-agent-dispatch.mjs")],
      {
        cwd,
        input: JSON.stringify(payload),
        encoding: "utf8",
        env: {
          ...process.env,
          META_KIM_SPINE_STATE_DIR: ".meta-kim/state/test/spine",
          META_KIM_CAPABILITY_GATE: "block",
          META_KIM_HOOK_RUNTIME: runtime,
        },
      },
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

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

  test("workflow-contract.json documents the new stage semantics", async () => {
    const contract = await readJson("config/contracts/workflow-contract.json");
    const semantics = contract.businessWorkflow?.stageSemantics ?? {};

    assert.equal(
      semantics.critical?.primaryAction,
      "clarify_intent_first",
      "Critical must clarify intent before research or planning",
    );
    assert.equal(
      semantics.fetch?.primaryAction,
      "research_and_confirm_problem_with_candidate_solutions",
      "Fetch must search local/online sources and confirm the problem plus candidate solutions",
    );
    assert.deepEqual(
      semantics.thinking?.capabilityDecisionOrder,
      [
        "determine_needed_execution_capabilities",
        "match_existing_capabilities",
        "create_or_upgrade_only_for_gaps",
        "orchestrate_dag_with_merge_owner",
      ],
      "Thinking must decide capability needs before matching, gap creation, and DAG orchestration",
    );
    assert.ok(
      semantics.execution?.executionCapabilityTypes?.includes("agent") &&
        semantics.execution?.executionCapabilityTypes?.includes("skill") &&
        semantics.execution?.executionCapabilityTypes?.includes("command") &&
        semantics.execution?.executionCapabilityTypes?.includes("mcp_capability") &&
        semantics.execution?.executionCapabilityTypes?.includes("tool"),
      "Execution must cover agents, skills, commands, MCP capabilities, and tools",
    );
    assert.equal(
      semantics.verification?.primaryAction,
      "run_real_tests_with_fresh_evidence",
      "Verification must require real tests, not summary-only checks",
    );
    assert.ok(
      semantics.evolution?.allowedDecisions?.includes("writeback") &&
        semantics.evolution?.allowedDecisions?.includes("none"),
      "Evolution must write back or explicitly record no writeback",
    );
  });

  test("SKILL.md and dev-governance.md describe Fetch before Thinking capability matching", async () => {
    const skill = await readFile("canonical/skills/meta-theory/SKILL.md");
    const devGov = await readFile(
      "canonical/skills/meta-theory/references/dev-governance.md",
    );
    const combined = `${skill}\n${devGov}`;

    assert.doesNotMatch(
      skill,
      /## Fetch-first Pattern \(Search → Match → Invoke\)|3-step capability discovery[\s\S]{0,120}keyword → search → invoke/i,
      "SKILL.md must not keep the old Fetch-first Search-Match-Invoke main flow",
    );
    assert.doesNotMatch(
      devGov,
      /Fetch — Discover Available Agents|Invoke selected agents from Stage 2|<selected agent from Stage 2>|Capability discovery \(Search–Match–Invoke\)/i,
      "dev-governance.md must not route Execution through Stage 2 selected agents",
    );
    assert.match(
      skill,
      /\| 2 \| Fetch \|[\s\S]{0,360}(?:online|联网|web)[\s\S]{0,220}(?:local|本地)[\s\S]{0,220}(?:confirm|确认)[\s\S]{0,220}(?:problem|问题)[\s\S]{0,220}(?:candidate solutions|候选解决方案)/i,
      "The SKILL.md stage table must define Fetch as online/local problem and candidate-solution research",
    );
    assert.match(
      skill,
      /\| 3 \| Thinking \|[\s\S]{0,520}determine needed execution capabilities[\s\S]{0,260}agents[\s\S]{0,160}skills[\s\S]{0,160}commands[\s\S]{0,160}MCP capabilities[\s\S]{0,160}tools[\s\S]{0,260}match existing capabilities[\s\S]{0,260}create or upgrade only for gaps[\s\S]{0,260}(?:DAG|parallel|serial)[\s\S]{0,160}mergeOwner/i,
      "The SKILL.md stage table must make Thinking the owner/skill/tool matching and orchestration stage",
    );
    assert.match(
      devGov,
      /## STAGE 4: Execution[\s\S]{0,900}agentBlueprintPacket[\s\S]{0,240}workerTaskPackets[\s\S]{0,360}(?:skills|commands|MCP|tools)/i,
      "The dev-governance Execution section must dispatch from Thinking artifacts and selected capabilities",
    );
    assert.match(
      combined,
      /Critical[\s\S]{0,240}clarif(?:y|ies)[\s\S]{0,160}intent/i,
      "Critical must explicitly clarify intent first",
    );
    assert.match(
      combined,
      /Fetch[\s\S]{0,260}(?:online|联网|web)[\s\S]{0,260}(?:local|本地)[\s\S]{0,260}(?:confirm|确认)[\s\S]{0,220}(?:problem|问题)[\s\S]{0,220}(?:candidate solutions|候选解决方案)/i,
      "Fetch must cover online/local research and confirm problem plus candidate solutions",
    );
    assert.match(
      combined,
      /Thinking[\s\S]{0,260}determine needed execution capabilities[\s\S]{0,260}agents[\s\S]{0,160}skills[\s\S]{0,160}commands[\s\S]{0,160}MCP capabilities[\s\S]{0,160}tools[\s\S]{0,260}match existing capabilities[\s\S]{0,260}create or upgrade only for gaps[\s\S]{0,260}(?:DAG|parallel|serial)[\s\S]{0,160}mergeOwner/i,
      "Thinking must first decide needed capabilities, then match/create gaps, then plan DAG/merge owner",
    );
    assert.match(
      combined,
      /Execution[\s\S]{0,260}multi-agent[\s\S]{0,260}(?:skill|command|MCP|tool)/i,
      "Execution must be multi-agent work using skills, commands, MCP capabilities, and tools",
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
// Part F2: Choice Surface Runtime Gate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part F2: choice surface runtime gate", async () => {
  test("initial Critical state does not allow execution confirmation", () => {
    const state = createInitialState({
      taskClassification: "meta_theory_auto",
      triggerReason: "test",
    });

    const result = checkChoiceSurfaceGate(state);
    assert.equal(state.choiceSurfaceState, "not_allowed");
    assert.equal(result.met, true);
  });

  test("blocks execution confirmation before Fetch and Thinking evidence", () => {
    const state = {
      ...createInitialState({
        taskClassification: "meta_theory_auto",
        triggerReason: "test",
      }),
      currentStage: "fetch",
      choiceSurfaceState: "completed",
    };

    const result = checkChoiceSurfaceGate(state);
    assert.equal(result.met, false);
    assert.match(result.reason, /before Fetch and Thinking completed/);
  });

  test("blocks Execution when confirmation was offered but not completed", () => {
    const state = {
      ...createInitialState({
        taskClassification: "meta_theory_auto",
        triggerReason: "test",
      }),
      currentStage: "execution",
      dispatchedAgents: ["frontend"],
      fetchRecord: { capabilityMatches: ["frontend"] },
      preDecisionOptionFrame: {
        candidatePaths: ["direct hook enforcement", "contract-only guard"],
      },
      choiceSurfaceState: "execution_confirmation_allowed",
    };

    const result = checkStageRequirements(state);
    assert.equal(result.met, false);
    assert.deepEqual(result.missing, ["choiceSurfaceState=completed"]);
  });

  test("blocks Execution when design-time packets are incomplete", () => {
    const state = {
      ...createInitialState({
        taskClassification: "meta_theory_auto",
        triggerReason: "test",
      }),
      ...minimalNodeBindings(),
      currentStage: "execution",
      dispatchedAgents: ["frontend"],
      preDecisionOptionFrame: {
        candidatePaths: ["direct hook enforcement", "contract-only guard"],
      },
      choiceSurfaceState: "completed",
    };

    const result = checkStageRequirements(state);
    assert.equal(result.met, false);
    assert.match(result.reason, /pre-execution readiness|design-time/i);
    assert.ok(result.missing.includes("dispatchEnvelopePacket"));
    assert.ok(result.missing.includes("productCompletenessPacket"));
    assert.ok(result.missing.includes("rollbackPlanPacket"));
  });

  test("allows Execution after Fetch, Thinking, and complete design-time packets", () => {
    const state = {
      ...createInitialState({
        taskClassification: "meta_theory_auto",
        triggerReason: "test",
      }),
      ...completePreExecutionBindings(),
      currentStage: "execution",
      dispatchedAgents: ["frontend"],
      preDecisionOptionFrame: {
        candidatePaths: ["direct hook enforcement", "contract-only guard"],
      },
      choiceSurfaceState: "completed",
    };

    const result = checkStageRequirements(state);
    assert.equal(result.met, true);
  });

  test("allows Execution with generalized capability bindings without matchedSkills", () => {
    const state = {
      ...createInitialState({
        taskClassification: "meta_theory_auto",
        triggerReason: "test",
      }),
      ...modernCapabilityNodeBindings(),
      currentStage: "execution",
      dispatchedAgents: ["frontend"],
      preDecisionOptionFrame: {
        candidatePaths: ["command binding", "skill binding"],
      },
      choiceSurfaceState: "completed",
    };

    const result = checkStageRequirements(state);
    assert.equal(result.met, true);
  });

  test("blocks Execution when top-level capability search lacks node bindings", () => {
    const state = {
      ...createInitialState({
        taskClassification: "meta_theory_auto",
        triggerReason: "test",
      }),
      ...preExecutionReadinessPacketsOnly(),
      currentStage: "execution",
      dispatchedAgents: ["meta-conductor"],
      fetchRecord: {
        capabilitySearchPerformed: true,
        capabilityMatches: ["backend"],
      },
      preDecisionOptionFrame: {
        candidatePaths: ["direct hook enforcement", "contract-only guard"],
      },
      choiceSurfaceState: "completed",
    };

    const result = checkStageRequirements(state);
    assert.equal(result.met, false);
    assert.match(result.reason, /every orchestration node/);
    assert.ok(result.missing.includes("businessFlowBlueprintPacket"));
    assert.ok(result.missing.includes("agentBlueprintPacket"));
    assert.ok(result.missing.includes("workerTaskPackets"));
  });

  test("blocks Execution when a worker task cannot bind to an agent role", () => {
    const state = {
      ...createInitialState({
        taskClassification: "meta_theory_auto",
        triggerReason: "test",
      }),
      ...minimalNodeBindings(),
    };
    state.workerTaskPackets[0].businessRoleId = "frontend";

    const result = checkCapabilityNodeBindings(state);
    assert.equal(result.met, false);
    assert.ok(result.missing.includes("workerTaskPackets[0].agentBlueprintRoleBinding"));
  });

  test("allows explicit choiceGateSkip as an auditable non-interactive path", () => {
    const state = {
      ...createInitialState({
        taskClassification: "meta_theory_auto",
        triggerReason: "test",
      }),
      currentStage: "execution",
      fetchRecord: { capabilityMatches: ["frontend"] },
      preDecisionOptionFrame: {
        choiceGateSkip: {
          reason: "non-interactive runtime fallback",
        },
      },
      choiceSurfaceState: "not_allowed",
    };

    const result = checkChoiceSurfaceGate(state);
    assert.equal(result.met, true);
  });

  test("execution hook imports and applies the choice surface gate", async () => {
    const hook = await readFile(
      "canonical/runtime-assets/claude/hooks/enforce-agent-dispatch.mjs",
    );
    assert.match(hook, /checkChoiceSurfaceGate/);
    assert.match(hook, /choiceSurfaceGate\.met/);
    assert.match(hook, /checkCapabilityNodeBindings/);
    assert.match(hook, /Capability node binding violation/);
  });

  test("Agent hook denies execution dispatch without node bindings", () => {
    const state = {
      ...createInitialState({
        taskClassification: "meta_theory_auto",
        triggerReason: "test",
      }),
      ...preExecutionReadinessPacketsOnly(),
      currentStage: "execution",
      fetchRecord: {
        capabilitySearchPerformed: true,
        capabilityMatches: ["backend"],
      },
      preDecisionOptionFrame: {
        candidatePaths: ["direct hook enforcement", "contract-only guard"],
      },
      choiceSurfaceState: "completed",
    };

    const result = runEnforceHook(state, {
      tool_name: "Agent",
      tool_input: {
        description: "meta-conductor backend execution",
        prompt: "Run task-backend-001",
      },
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Capability node binding violation/);
  });

  test("spawn_agent hook denies execution dispatch before capability search", () => {
    const state = {
      ...createInitialState({
        taskClassification: "meta_theory_auto",
        triggerReason: "test",
      }),
      ...minimalNodeBindings(),
      currentStage: "execution",
    };
    state.fetchRecord.capabilitySearchPerformed = false;

    const result = runEnforceHook(state, {
      tool_name: "spawn_agent",
      tool_input: {
        agent_type: "meta-conductor",
        message: "Run task-backend-001 for role backend#1",
      },
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Capability-first violation/);
  });

  test("spawn_agent hook denies execution-intent dispatch during Thinking before readiness", () => {
    const state = {
      ...createInitialState({
        taskClassification: "meta_theory_auto",
        triggerReason: "test",
      }),
      ...minimalNodeBindings(),
      currentStage: "thinking",
      dispatchChain: { thinking: ["meta-conductor"] },
      preDecisionOptionFrame: {
        candidatePaths: ["direct hook enforcement", "contract-only guard"],
      },
      choiceSurfaceState: "completed",
    };

    const result = runEnforceHook(state, {
      tool_name: "spawn_agent",
      tool_input: {
        agent_type: "backend",
        message: "Implement backend task task-backend-001",
      },
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /pre-execution readiness|design-time/i);
  });

  test("spawn_agent hook allows governance dispatch during Thinking", () => {
    const state = {
      ...createInitialState({
        taskClassification: "meta_theory_auto",
        triggerReason: "test",
      }),
      ...minimalNodeBindings(),
      currentStage: "thinking",
      dispatchChain: { thinking: ["meta-conductor"] },
      preDecisionOptionFrame: {
        candidatePaths: ["direct hook enforcement", "contract-only guard"],
      },
      choiceSurfaceState: "completed",
    };

    const result = runEnforceHook(state, {
      tool_name: "spawn_agent",
      tool_input: {
        agent_type: "meta-prism",
        message: "Review Thinking packet quality as meta-prism",
      },
    });

    assert.equal(result.status, 0);
    assert.doesNotMatch(result.stdout, /permissionDecision/);
  });

  test("apply_patch hook is treated as an execution tool", () => {
    const state = {
      ...createInitialState({
        taskClassification: "meta_theory_auto",
        triggerReason: "test",
      }),
      ...preExecutionReadinessPacketsOnly(),
      currentStage: "execution",
      fetchRecord: {
        capabilitySearchPerformed: true,
        capabilityMatches: ["backend"],
      },
      preDecisionOptionFrame: {
        candidatePaths: ["direct hook enforcement", "contract-only guard"],
      },
      choiceSurfaceState: "completed",
    };

    const result = runEnforceHook(state, {
      tool_name: "apply_patch",
      tool_input: {
        patch: "*** Begin Patch\n*** End Patch\n",
      },
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Capability node binding violation/);
  });

  test("Cursor deny path exits with code 2 and Cursor payload", () => {
    const state = {
      ...createInitialState({
        taskClassification: "meta_theory_auto",
        triggerReason: "test",
      }),
      ...minimalNodeBindings(),
      currentStage: "execution",
    };
    state.fetchRecord.capabilitySearchPerformed = false;

    const result = runEnforceHook(
      state,
      {
        tool_name: "spawn_agent",
        tool_input: {
          agent_type: "meta-conductor",
          message: "Run task-backend-001 for role backend#1",
        },
      },
      { runtime: "cursor" },
    );

    assert.equal(result.status, 2);
    assert.match(result.stdout, /"permission":"deny"/);
    assert.match(result.stderr, /Capability-first violation/);
  });

  test("Agent hook denies execution dispatch that omits task node id", () => {
    const state = {
      ...createInitialState({
        taskClassification: "meta_theory_auto",
        triggerReason: "test",
      }),
      ...completePreExecutionBindings(),
      currentStage: "execution",
    };

    const result = runEnforceHook(state, {
      tool_name: "Agent",
      tool_input: {
        description: "meta-conductor backend execution",
        prompt: "Run the backend task without citing its packet id",
      },
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /must cite a workerTaskPackets/);
  });

  test("Agent hook allows execution dispatch with matching task node id", () => {
    const state = {
      ...createInitialState({
        taskClassification: "meta_theory_auto",
        triggerReason: "test",
      }),
      ...completePreExecutionBindings(),
      currentStage: "execution",
    };

    const result = runEnforceHook(state, {
      tool_name: "Agent",
      tool_input: {
        description: "meta-conductor backend execution",
        prompt: "Run task-backend-001 for role backend#1",
      },
    });

    assert.equal(result.status, 0);
    assert.doesNotMatch(result.stdout, /permissionDecision/);
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
