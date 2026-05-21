import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SKILL_PATH, readFile } from "./_helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENARIOS_PATH = path.join(__dirname, "scenarios", "clarity-gate-scenarios.json");

const requiredOptionSignals = [
  /change|touch|include|optimi[sz]e|apply|modify/i,
  /problem solved|solves|prevent|avoid|fix/i,
  /result|expected result|user gets/i,
  /advantage|benefit|why choose/i,
  /disadvantage|cost|risk|trade-off/i,
];

describe("Clarity Gate unified execution confirmation", async () => {
  const skillContent = await fs.readFile(SKILL_PATH, "utf-8");
  const decisionTemplate = await readFile(
    "canonical/templates/user-interaction/decision-template.md",
  );
  const batchTemplate = await readFile(
    "canonical/templates/user-interaction/batch-decision-template.md",
  );
  const workflowContract = await readFile("config/contracts/workflow-contract.json");
  const workflowContractJson = JSON.parse(workflowContract);

  test("confirmation happens after Fetch and Thinking, before Execution", () => {
    assert.match(skillContent, /Fetch\/content evidence.*Thinking\/pre-decision option framing/s);
    assert.match(skillContent, /At the transition from Thinking.*Execution/s);
    assert.match(skillContent, /After Thinking completes, BEFORE any Execution/);
    assert.match(skillContent, /DO NOT.*Critical\/Fetch\/Thinking\/Review/s);
  });

  test("Critical clarification is separate from execution confirmation", () => {
    assert.match(skillContent, /Critical clarification/i);
    assert.match(skillContent, /too unclear or risky to Fetch/i);
    assert.match(skillContent, /before executing a dispatch plan/i);
    assert.doesNotMatch(skillContent, /IMMEDIATELY invoke the native question tool/i);
  });

  test("confirmation includes AI understanding, additions, route, and candidate paths", () => {
    for (const phrase of [
      "AI understanding",
      "AI additions",
      "Capability route",
      "Candidate paths",
    ]) {
      assert.ok(skillContent.includes(phrase), `${phrase} must be present`);
    }
  });

  test("confirmation has at least 4 questions and each question has 3-4 options", () => {
    const confirmationBlock = skillContent.slice(
      skillContent.indexOf("1. Outcome Confirmation"),
      skillContent.indexOf("Wait for user response before proceeding to Execution."),
    );
    const questions = [...confirmationBlock.matchAll(/^\d+\.\s+.+Confirmation$/gm)];
    assert.ok(questions.length >= 4, `expected 4+ questions, got ${questions.length}`);

    for (let i = 0; i < questions.length; i++) {
      const start = questions[i].index ?? 0;
      const end = i + 1 < questions.length ? (questions[i + 1].index ?? confirmationBlock.length) : confirmationBlock.length;
      const questionBlock = confirmationBlock.slice(start, end);
      const options = [...questionBlock.matchAll(/^\s+- Option [A-D]:/gm)];
      assert.ok(
        options.length >= 3 && options.length <= 4,
        `${questions[i][0]} must have 3-4 options, got ${options.length}`,
      );
    }
  });

  test("options use non-technical product wording with result, advantages, and disadvantages", () => {
    const optionLines = skillContent
      .split(/\r?\n/)
      .filter((line) => /^\s+- Option [A-D]:/.test(line));
    assert.ok(optionLines.length >= 12, "expected product option examples");
    for (const line of optionLines) {
      for (const signal of requiredOptionSignals.slice(2)) {
        assert.match(line, signal, `option missing product signal: ${line}`);
      }
    }
    assert.match(skillContent, /understandable to non-technical users/i);
  });

  test("templates enforce 3-4 options and product-readable dimensions", () => {
    const combined = `${decisionTemplate}\n${batchTemplate}`;
    assert.match(combined, /3-4 options/);
    assert.match(combined, /Expected result/);
    assert.match(combined, /non-technical users/);
    assert.doesNotMatch(combined, /\*\*Your choice:\*\* \[ \] A \[ \] B\s*$/m);
  });

  test("workflow contract distinguishes native surfaces without requiring stage-by-stage popups", () => {
    assert.match(workflowContract, /nativeChoiceSurface|choiceSurfaces/);
    assert.doesNotMatch(
      workflowContract,
      /Critical\/Fetch\/Thinking\/Review confirmation/,
    );
  });

  test("non-trivial executable work requires preDecisionOptionFrame content evidence before decision", () => {
    const preDecisionOptionFrame =
      workflowContractJson.protocols?.preDecisionOptionFrame;
    assert.ok(
      preDecisionOptionFrame,
      "workflow contract must define protocols.preDecisionOptionFrame",
    );

    const requiredFields = preDecisionOptionFrame.requiredFields ?? [];
    for (const field of [
      "decisionTrigger",
      "contentEvidence",
      "optionFrame",
      "presentedBeforeDecision",
      "userChoiceState",
      "nativeChoiceSurface",
    ]) {
      assert.ok(
        requiredFields.includes(field),
        `preDecisionOptionFrame missing required field "${field}"`,
      );
    }

    const policyText = JSON.stringify(preDecisionOptionFrame);
    assert.match(policyText, /non[-_ ]trivial/i);
    assert.match(policyText, /executable/i);
    assert.match(policyText, /contentEvidence|content evidence/i);
    assert.match(policyText, /before.*decision|decision.*before/i);
  });

  test("contentEvidencePacket defines deep research requirements for evidence owner", () => {
    const packet = workflowContractJson.protocols?.contentEvidencePacket;
    assert.ok(packet, "workflow contract must define protocols.contentEvidencePacket");

    const requiredFields = packet.requiredFields ?? [];
    for (const field of [
      "researchCapabilityDiscovery",
      "deepResearchPlan",
      "sourceCategoryCoverage",
      "crossReferenceMatrix",
      "contradictionLog",
      "assumptionLedger",
      "decisionImpactMap",
    ]) {
      assert.ok(
        requiredFields.includes(field),
        `contentEvidencePacket missing deep research field "${field}"`,
      );
    }

    const policyText = JSON.stringify(packet);
    assert.match(policyText, /deep research/i);
    assert.match(policyText, /decision impact/i);
    assert.match(policyText, /evidence owner|Conductor/i);
  });

  test("contentEvidencePacket requires capability-proof research discovery without platformSurface", () => {
    const packet = workflowContractJson.protocols?.contentEvidencePacket;
    assert.ok(packet, "workflow contract must define protocols.contentEvidencePacket");

    const requiredFields = packet.requiredFields ?? [];
    assert.ok(
      requiredFields.includes("researchCapabilityDiscovery"),
      "contentEvidencePacket must require researchCapabilityDiscovery",
    );

    const discovery = packet.researchCapabilityDiscovery;
    assert.ok(discovery, "contentEvidencePacket must define researchCapabilityDiscovery");

    for (const field of [
      "requiredCapabilities",
      "runtimeContext",
      "toolInventorySources",
      "availableRetrievalCapabilities",
      "selectedResearchPath",
      "capabilityGaps",
      "validatedBy",
    ]) {
      assert.ok(
        discovery.requiredFields?.includes(field),
        `researchCapabilityDiscovery missing required field "${field}"`,
      );
    }

    const policyText = JSON.stringify(discovery);
    assert.match(policyText, /toolInventorySources/);
    assert.match(policyText, /web_search|url_fetch|docs_lookup|mcp_search|plugin_search/);
    assert.match(policyText, /proof/);
    assert.match(policyText, /selectedResearchPath/);
    assert.match(policyText, /host-form-factor|capability proof|capability evidence/i);
    assert.doesNotMatch(policyText, /desktop \| cli \| web \| ide/i);
    assert.ok(
      discovery.forbiddenFields?.includes("platformSurface"),
      "platformSurface must be explicitly forbidden as a research capability signal",
    );
  });

  test("Codex fallback pauses with localized confirmation card when native choice is unavailable", () => {
    const codexSurface =
      workflowContractJson.runDiscipline?.runtimeNativeChoiceSurfaces?.codex;
    assert.ok(codexSurface, "Codex native choice surface policy must exist");
    assert.equal(codexSurface.primarySurface, "native_choice");
    assert.ok(
      codexSurface.fallbackSurfaces?.includes("conversation_fallback"),
      "Codex must allow conversation_fallback",
    );

    const codexPolicyText = `${codexSurface.triggerDescription} ${codexSurface.implementation}`;
    assert.match(codexPolicyText, /pause/i);
    assert.match(codexPolicyText, /localized confirmation card/i);
    assert.match(codexPolicyText, /native choice.*exposes it|native.*unavailable/i);
  });
});

describe("Clarity Gate scenario JSON remains valid", async () => {
  const rawJson = await fs.readFile(SCENARIOS_PATH, "utf-8");
  const scenarios = JSON.parse(rawJson);

  test("scenarios file contains at least 12 entries", () => {
    assert.ok(scenarios.length >= 12, `expected at least 12 scenarios, got ${scenarios.length}`);
  });

  test("each scenario keeps reviewable pass/fail criteria", () => {
    for (const scenario of scenarios) {
      assert.equal(typeof scenario.id, "string");
      assert.equal(typeof scenario.input, "string");
      assert.ok(Array.isArray(scenario.ambiguousDims));
      assert.equal(typeof scenario.expectedBehavior, "string");
      assert.equal(typeof scenario.passFailCriteria?.PASS, "string");
      assert.equal(typeof scenario.passFailCriteria?.FAIL, "string");
    }
  });
});
