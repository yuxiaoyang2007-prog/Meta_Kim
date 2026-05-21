import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { SKILL_PATH, ALL_AGENTS, readFile } from "./_helpers.mjs";
import { readFile as readJsonFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENARIOS_PATH = path.join(
  __dirname,
  "scenarios",
  "dispatch-scenarios.json"
);

const TYPE_AGENT_MAP = {
  A: { mandatory: ["meta-prism", "meta-warden"], optional: [] },
  B: {
    mandatory: ["meta-genesis", "meta-artisan"],
    review: ["meta-prism", "meta-warden"],
    optional: ["meta-sentinel", "meta-librarian", "meta-conductor"],
  },
  C: {
    mandatory: [],
    optional: ["meta-prism", "meta-sentinel", "meta-scout"],
    note: "Dynamic via Fetch",
  },
  D: {
    mandatory: ["meta-prism", "meta-warden"],
    optional: ["meta-scout", "meta-sentinel", "meta-chrysalis"],
  },
  E: { mandatory: ["meta-conductor", "meta-warden"], optional: [] },
};

let skillContent;
let scenarios;
let workflowContract;
let prismContent;

async function ensureLoaded() {
  if (!skillContent) {
    skillContent = await readFile("canonical/skills/meta-theory/SKILL.md");
  }
  if (!scenarios) {
    const raw = await readJsonFile(SCENARIOS_PATH, "utf-8");
    scenarios = JSON.parse(raw);
  }
  if (!workflowContract) {
    workflowContract = JSON.parse(await readFile("config/contracts/workflow-contract.json"));
  }
  if (!prismContent) {
    prismContent = await readFile("canonical/agents/meta-prism.md");
  }
}

// ---------------------------------------------------------------------------
// Part A: Dispatch Mapping (18 tests)
// ---------------------------------------------------------------------------

describe("Agent Dispatch — Part A: Dispatch Mapping", async () => {
  await ensureLoaded();

  const TYPE_SECTION_HEADINGS = {
    A: "Type A",
    B: "Type B",
    C: "Type C",
    D: "Type D",
    E: "Type E",
  };

  // --- Per-type tests (3 each = 15) ---

  for (const [type, mapping] of Object.entries(TYPE_AGENT_MAP)) {
    const heading = TYPE_SECTION_HEADINGS[type];

    test(`Type ${type}: mandatory agents mentioned in SKILL.md ${heading} section`, async () => {
      await ensureLoaded();

      const headingRegex = new RegExp(
        `##\\s+${heading}[:\\s]`,
        "i"
      );
      const headingMatch = skillContent.match(headingRegex);
      assert.ok(
        headingMatch,
        `SKILL.md must contain a section for ${heading}`
      );

      const sectionStart = headingMatch.index;
      const nextTypeRegex = /\n## Type [A-E]/;
      const nextMatch = skillContent.slice(sectionStart + 1).match(nextTypeRegex);
      const sectionEnd = nextMatch
        ? sectionStart + 1 + nextMatch.index
        : skillContent.length;
      const section = skillContent.slice(sectionStart, sectionEnd);

      const mandatoryAgents = mapping.mandatory || [];
      const reviewAgents = mapping.review || [];
      const allRequired = [...mandatoryAgents, ...reviewAgents];

      for (const agent of allRequired) {
        assert.ok(
          section.includes(agent),
          `${heading} section must mention mandatory/review agent "${agent}"`
        );
      }
    });

    test(`Type ${type}: optional agents exist in ALL_AGENTS`, async () => {
      await ensureLoaded();

      const optionalAgents = mapping.optional || [];
      for (const agent of optionalAgents) {
        assert.ok(
          ALL_AGENTS.includes(agent),
          `Optional agent "${agent}" for Type ${type} must be a valid agent in ALL_AGENTS`
        );
      }
    });

    test(`Type ${type}: self-execution is forbidden (dispatch gate documented)`, async () => {
      await ensureLoaded();

      const dispatchGatePatterns = [
        /dispatch/i,
        /Agent\s*(?:tool|\()/i,
        /DISPATCHER/i,
        /not the executor/i,
        /spawn/i,
      ];

      const headingRegex = new RegExp(`##\\s+${heading}[:\\s]`, "i");
      const headingMatch = skillContent.match(headingRegex);
      const sectionStart = headingMatch.index;
      const nextTypeRegex = /\n## Type [A-E]/;
      const nextMatch = skillContent.slice(sectionStart + 1).match(nextTypeRegex);
      const sectionEnd = nextMatch
        ? sectionStart + 1 + nextMatch.index
        : skillContent.length;
      const section = skillContent.slice(sectionStart, sectionEnd);

      const hasDispatchLanguage = dispatchGatePatterns.some((pattern) =>
        pattern.test(section)
      );
      assert.ok(
        hasDispatchLanguage,
          `${heading} section must document dispatch gate (Agent tool / DISPATCHER language)`
      );
    });
  }

  // --- 3 global tests ---

  test("All expected agents appear in at least one type dispatch map", async () => {
    await ensureLoaded();

    const referencedAgents = new Set();
    for (const mapping of Object.values(TYPE_AGENT_MAP)) {
      for (const agent of mapping.mandatory || []) referencedAgents.add(agent);
      for (const agent of mapping.review || []) referencedAgents.add(agent);
      for (const agent of mapping.optional || []) referencedAgents.add(agent);
    }

    for (const agent of ALL_AGENTS) {
      assert.ok(
        referencedAgents.has(agent),
        `Agent "${agent}" must appear in at least one type dispatch mapping`
      );
    }
  });

  test("No non-existent agent referenced in TYPE_AGENT_MAP", async () => {
    await ensureLoaded();

    for (const [type, mapping] of Object.entries(TYPE_AGENT_MAP)) {
      const allAgentsInType = [
        ...(mapping.mandatory || []),
        ...(mapping.review || []),
        ...(mapping.optional || []),
      ];
      for (const agent of allAgentsInType) {
        assert.ok(
          ALL_AGENTS.includes(agent),
          `Agent "${agent}" in Type ${type} is not a valid meta-agent`
        );
      }
    }
  });

  test("Every type (A-E) has dispatch instructions in SKILL.md", async () => {
    await ensureLoaded();

    for (const type of Object.keys(TYPE_AGENT_MAP)) {
      const heading = TYPE_SECTION_HEADINGS[type];
      const headingRegex = new RegExp(`##\\s+${heading}[:\\s]`, "i");
      assert.ok(
        headingRegex.test(skillContent),
        `SKILL.md must contain dispatch instructions under "${heading}"`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Part B: Dispatch Rule Verification (15 tests)
// ---------------------------------------------------------------------------

describe("Agent Dispatch — Part B: Dispatch Rule Verification", async () => {
  await ensureLoaded();

  test('Agent tool dispatch syntax documented ("Agent tool" or "Agent(")', async () => {
    await ensureLoaded();
    const hasAgentTool = /Agent\s*tool/i.test(skillContent);
    const hasAgentCall = /Agent\s*\(/.test(skillContent);
    assert.ok(
      hasAgentTool || hasAgentCall,
      'SKILL.md must document Agent tool or Agent( dispatch syntax'
    );
  });

  test("all meta agents listed in dispatch table", async () => {
    await ensureLoaded();
    for (const agent of ALL_AGENTS) {
      assert.ok(
        skillContent.includes(agent),
        `Agent "${agent}" must be listed in SKILL.md`
      );
    }
  });

  test("Dispatch Self-Check section exists", async () => {
    await ensureLoaded();
    assert.ok(
      /DISPATCH SELF-CHECK/i.test(skillContent),
      "SKILL.md must contain a Dispatch Self-Check section"
    );
  });

  test('"DISPATCHER" language present', async () => {
    await ensureLoaded();
    const hasDispatcher =
      /DISPATCHER/i.test(skillContent) ||
      /You are a dispatcher/i.test(skillContent) ||
      /you are the DISPATCHER/i.test(skillContent);
    assert.ok(
      hasDispatcher,
      'SKILL.md must contain "DISPATCHER" or "You are a dispatcher" language'
    );
  });

  test('">3 sentences" violation threshold documented', async () => {
    await ensureLoaded();
    assert.ok(
      skillContent.includes(">3 sentences"),
      'SKILL.md must document the ">3 sentences" violation threshold'
    );
  });

  test("agentInvocationState lifecycle documented (idle -> discovered -> matched -> dispatched -> returned/escalated)", async () => {
    await ensureLoaded();
    const states = ["idle", "discovered", "matched", "dispatched"];
    for (const state of states) {
      assert.ok(
        skillContent.includes(state),
        `agentInvocationState must document "${state}" state`
      );
    }
    const hasReturnedOrEscalated =
      skillContent.includes("returned") && skillContent.includes("escalated");
    assert.ok(
      hasReturnedOrEscalated,
      'agentInvocationState must document "returned" and "escalated" terminal states'
    );
  });

  test("Fetch-first pattern documented (Search -> Match -> Invoke)", async () => {
    await ensureLoaded();
    const hasFetchFirst =
      /Fetch-first/i.test(skillContent) ||
      /Search.*Match.*Invoke/i.test(skillContent);
    assert.ok(
      hasFetchFirst,
      "SKILL.md must document the Fetch-first pattern (Search -> Match -> Invoke)"
    );
  });

  test("Capability gap resolution ladder documented (existing -> Type B -> temporary fallback)", async () => {
    await ensureLoaded();
    const hasExistingOwner = /existing owner/i.test(skillContent);
    const hasTypeB = /Type B creat/i.test(skillContent);
    const hasTempFallback = /temporary.*fallback/i.test(skillContent);
    assert.ok(
      hasExistingOwner && hasTypeB && hasTempFallback,
      "SKILL.md must document the capability gap resolution ladder: existing owner -> Type B creation -> temporary fallback"
    );
  });

  test("Protocol-first rule documented (runHeader, dispatchBoard, etc. before Stage 4)", async () => {
    await ensureLoaded();
    const hasProtocolFirst = /Protocol-first/i.test(skillContent);
    const hasRunHeader = skillContent.includes("runHeader");
    const hasDispatchBoard = skillContent.includes("dispatchBoard");
    const hasBeforeStage4 =
      /Stage 4 may not start/i.test(skillContent) ||
      /before Stage 4/i.test(skillContent);

    assert.ok(
      hasProtocolFirst,
      "SKILL.md must document Protocol-first Dispatch"
    );
    assert.ok(hasRunHeader, "SKILL.md must mention runHeader artifact");
    assert.ok(hasDispatchBoard, "SKILL.md must mention dispatchBoard artifact");
    assert.ok(
      hasBeforeStage4,
      "SKILL.md must state that Stage 4 may not start before protocol artifacts are ready"
    );
  });

  test("Option Exploration (≥2 solution paths) is MANDATORY in Stage 3", async () => {
    await ensureLoaded();
    const hasOptionExploration =
      /Option Exploration/i.test(skillContent) ||
      /optionExploration/i.test(skillContent);
    const hasTwoPaths =
      /≥2 solution path/i.test(skillContent) ||
      /at least 2.*solution/i.test(skillContent);
    const hasProsConsOrDecisionRecord =
      /Pros.*Cons/i.test(skillContent) ||
      /Decision Record/i.test(skillContent) ||
      /rejected.*alternatives/i.test(skillContent);
    const hasMANDATORY =
      /MANDATORY/i.test(skillContent) &&
      /Option Exploration/i.test(skillContent);

    assert.ok(
      hasOptionExploration,
      "SKILL.md must document Option Exploration as a Stage 3 requirement"
    );
    assert.ok(
      hasTwoPaths,
      "SKILL.md must require ≥2 solution paths in Stage 3"
    );
    assert.ok(
      hasProsConsOrDecisionRecord,
      "SKILL.md must require Pros/Cons table or Decision Record for option exploration"
    );
    assert.ok(
      hasMANDATORY,
      "Option Exploration must be marked MANDATORY in SKILL.md"
    );
  });

  test("Skip-Level Self-Reflection Gate documented", async () => {
    await ensureLoaded();
    const hasSkipLevel =
      /Skip-Level/i.test(skillContent) ||
      /Skip.Level.*Gate/i.test(skillContent);
    assert.ok(
      hasSkipLevel,
      "SKILL.md must document the Skip-Level Self-Reflection Gate"
    );
  });

  test("Escalation Signals documented", async () => {
    await ensureLoaded();
    assert.ok(
      /escalat/i.test(skillContent),
      "SKILL.md must document escalation signals (escalated / escalation)"
    );
  });

  test("workerTaskPackets documented with dependsOn and parallelGroup", async () => {
    await ensureLoaded();
    assert.ok(
      skillContent.includes("workerTaskPackets"),
      "SKILL.md must document workerTaskPackets"
    );
    assert.ok(
      skillContent.includes("dependsOn"),
      "workerTaskPackets must include dependsOn field"
    );
    assert.ok(
      skillContent.includes("parallelGroup"),
      "workerTaskPackets must include parallelGroup field"
    );
    assert.ok(
      skillContent.includes("mergeOwner"),
      "workerTaskPackets must include mergeOwner field"
    );
  });

  test("dispatch and worker packets cannot finalize before user choice except explicit auto-proceed or skip reason", async () => {
    await ensureLoaded();

    const protocols = workflowContract.protocols ?? {};
    const dispatchFields = protocols.dispatchEnvelopePacket?.requiredFields ?? [];
    const workerFields = protocols.workerTaskPacket?.requiredFields ?? [];

    for (const field of [
      "preDecisionOptionFrameRef",
      "userChoiceState",
      "finalizationGate",
    ]) {
      assert.ok(
        dispatchFields.includes(field),
        `dispatchEnvelopePacket missing pre-decision finalization field "${field}"`
      );
      assert.ok(
        workerFields.includes(field),
        `workerTaskPacket missing pre-decision finalization field "${field}"`
      );
    }

    const finalizationPolicy = JSON.stringify({
      dispatchEnvelopePacket: protocols.dispatchEnvelopePacket,
      workerTaskPacket: protocols.workerTaskPacket,
      preDecisionOptionFrame: protocols.preDecisionOptionFrame,
      controlIntervention: workflowContract.runDiscipline?.controlIntervention,
    });
    assert.match(finalizationPolicy, /finali[sz].*before.*userChoice|userChoice.*before.*finali[sz]/i);
    assert.match(finalizationPolicy, /auto[-_ ]?proceed/i);
    assert.match(finalizationPolicy, /skipReason|skip reason/i);
    assert.match(finalizationPolicy, /explicit/i);
  });

  test("Review and Prism check trigger reasons against skip reasons", async () => {
    await ensureLoaded();

    const reviewFields =
      workflowContract.protocols?.reviewPacket?.requiredFields ?? [];
    assert.ok(
      reviewFields.some((field) => /trigger.*skip|skip.*trigger/i.test(field)),
      "reviewPacket must require a trigger-vs-skip reason check field"
    );

    const reviewPolicy = JSON.stringify({
      reviewPacket: workflowContract.protocols?.reviewPacket,
      taskClassification: workflowContract.protocols?.taskClassification,
      controlDecision: workflowContract.protocols?.controlDecision,
    });
    assert.match(reviewPolicy, /triggerReasons/i);
    assert.match(reviewPolicy, /skipReason/i);
    assert.match(reviewPolicy, /trigger.*skip|skip.*trigger/i);
    assert.match(prismContent, /trigger.*skip|skip.*trigger/i);
  });

  test("Evolution writeback plan documented", async () => {
    await ensureLoaded();
    const hasEvolutionWriteback =
      skillContent.includes("evolutionWritebackPlan") ||
      /evolution.*writeback/i.test(skillContent);
    assert.ok(
      hasEvolutionWriteback,
      "SKILL.md must document evolution writeback plan"
    );
  });

  test("Parallelism discipline documented (independent sub-tasks must be parallelized)", async () => {
    await ensureLoaded();
    const hasParallelism =
      /Parallelism Discipline/i.test(skillContent) ||
      /parallel/i.test(skillContent);
    assert.ok(
      hasParallelism,
      "SKILL.md must document parallelism discipline for independent sub-tasks"
    );
  });

  test("Dispatch scenarios file is valid and contains 15 scenarios", async () => {
    await ensureLoaded();
    assert.equal(
      scenarios.length,
      15,
      "dispatch-scenarios.json must contain exactly 15 scenarios"
    );

    const expectedIds = Array.from({ length: 15 }, (_, i) =>
      `AD-${String(i + 1).padStart(2, "0")}`
    );
    const actualIds = scenarios.map((s) => s.id);
    assert.deepStrictEqual(
      actualIds,
      expectedIds,
      "Scenario IDs must be AD-01 through AD-15 in order"
    );

    for (const scenario of scenarios) {
      assert.ok(scenario.id, "Each scenario must have an id");
      assert.ok(scenario.input, "Each scenario must have an input");
      assert.ok(scenario.expectedType || scenario.expectedDispatchSequence,
        `Scenario ${scenario.id} must have expectedType or expectedDispatchSequence`);
      assert.ok(
        Array.isArray(scenario.expectedDispatchSequence),
        `Scenario ${scenario.id} must have expectedDispatchSequence as array`
      );
      assert.ok(
        scenario.forbiddenBehavior,
        `Scenario ${scenario.id} must have forbiddenBehavior`
      );
      assert.ok(
        scenario.passFailCriteria,
        `Scenario ${scenario.id} must have passFailCriteria`
      );
      assert.ok(
        scenario.passFailCriteria.PASS,
        `Scenario ${scenario.id} must have passFailCriteria.PASS`
      );
      assert.ok(
        scenario.passFailCriteria.FAIL,
        `Scenario ${scenario.id} must have passFailCriteria.FAIL`
      );
    }
  });
});
