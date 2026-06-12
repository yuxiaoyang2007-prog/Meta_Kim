import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readJson, readFile } from "./_helpers.mjs";

const REQUIRED_SPEC_FIELDS = [
  "name",
  "description",
  "flowPosition",
  "purpose",
  "capabilities",
  "nonCapabilities",
  "loadoutSlots",
  "inputs",
  "outputs",
  "handoff",
  "memoryPolicy",
  "gapPolicy",
  "verificationPolicy",
  "installProjection",
  "identityCleanliness",
  "qualityScorecard",
];

const REQUIRED_SCORECARD_KEYS = [
  "identity_clarity",
  "domain_specificity",
  "flow_fit",
  "tool_least_privilege",
  "memory_fit",
  "gap_honesty",
  "handoff_readiness",
  "verification_readiness",
  "install_projection_readiness",
  "identity_cleanliness",
];

describe("21 — Generated Agent Quality and LangGraph boundary", async () => {
  const fixtures = await readJson(
    "tests/meta-theory/scenarios/generated-agent-quality-fixtures.json"
  );
  const createAgentReference = await readFile(
    "canonical/skills/meta-theory/references/create-agent.md"
  );
  const capabilityGapPrd = await readFile(
    "docs/ai-native-capability-gap-mvp-prd.zh-CN.md"
  );

  test("GAQ fixtures cover create_agent, create_script, and blocked decisions", () => {
    assert.equal(fixtures.length, 3);
    assert.deepEqual(
      fixtures.map((fixture) => fixture.expectedDecision),
      ["create_agent", "create_script", "blocked_or_needs_approval"]
    );
  });

  test("create_agent fixture requires a complete GeneratedAgentSpec", () => {
    const fixture = fixtures.find((item) => item.expectedDecision === "create_agent");
    assert.ok(fixture, "create_agent fixture is missing");
    assert.equal(fixture.generatedAgentSpec?.name, "test-coverage-specialist");

    for (const field of REQUIRED_SPEC_FIELDS) {
      assert.ok(
        Object.hasOwn(fixture.generatedAgentSpec, field),
        `GeneratedAgentSpec missing ${field}`
      );
    }

    assert.ok(
      fixture.generatedAgentSpec.nonCapabilities.some((entry) =>
        /todayTask|scopeFiles|deliverableLink|verifySteps/i.test(entry)
      ),
      "GeneratedAgentSpec must explicitly reject one-run work-order fields"
    );
  });

  test("create_agent scorecard must be 10/10 pass", () => {
    const spec = fixtures.find(
      (item) => item.expectedDecision === "create_agent"
    ).generatedAgentSpec;

    for (const key of REQUIRED_SCORECARD_KEYS) {
      assert.equal(spec.qualityScorecard[key], "pass", `${key} must pass`);
    }
  });

  test("non-agent fixtures do not carry GeneratedAgentSpec", () => {
    for (const fixture of fixtures.filter(
      (item) => item.expectedDecision !== "create_agent"
    )) {
      assert.equal(
        fixture.generatedAgentSpec,
        undefined,
        `${fixture.id} must not pretend to create an agent`
      );
      assert.ok(
        fixture.expectedForbidden.includes("create_agent"),
        `${fixture.id} must forbid accidental create_agent routing`
      );
    }
  });

  test("create-agent reference documents quality contract and LangGraph projection", () => {
    assert.match(createAgentReference, /Generated Agent Spec Quality Contract/);
    assert.match(createAgentReference, /LangGraph Projection Boundary/);
    assert.match(createAgentReference, /Professional role standard/i);
    assert.match(createAgentReference, /Flow standard/i);
    assert.match(createAgentReference, /Memory standard/i);
    assert.match(createAgentReference, /GapDecision.*conditional edge/is);
  });

  test("single Capability Gap PRD separates all capability/function types", () => {
    assert.equal(
      existsSync("docs/meta-kim-capability-governance-langgraph-plan.zh-CN.md"),
      false,
      "Capability Gap / LangGraph product settings must live in the single PRD"
    );
    for (const term of [
      "治理 agent",
      "执行 agent",
      "skill",
      "script",
      "MCP",
      "tools",
      "retrieval / research",
      "dependency / external package",
      "workerTask",
      "StateGraph",
      "conditional edge",
      "CapabilityGap",
      "GapDecision",
      "GeneratedAgentSpec",
      "CandidateWriteback",
    ]) {
      assert.match(capabilityGapPrd, new RegExp(term, "i"), `Missing ${term}`);
    }
  });

  test("Capability Gap PRD carries goal, database, telemetry, and LangGraph delivery criteria", () => {
    for (const term of [
      "PRD-as-Goal Execution Contract",
      "Layered Architecture",
      "Database-Driven Runtime Shape",
      "RunStateStore",
      "埋点事件",
      "LangGraph Compatibility",
      "FR-008 RunStateStore",
      "FR-009 LangGraph",
      "Database-as-planner count",
      "LangGraph branch coverage",
    ]) {
      assert.match(capabilityGapPrd, new RegExp(term, "i"), `PRD missing ${term}`);
    }
  });
});
