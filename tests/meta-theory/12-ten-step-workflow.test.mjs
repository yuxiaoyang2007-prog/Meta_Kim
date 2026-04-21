/**
 * 12-ten-step-workflow.test.mjs
 *
 * Tests the 11-stage business workflow:
 * direction → planning → execution → review → meta_review → revision → verify → summary → feedback → evolve → mirror
 *
 * Validates:
 * - Exactly 11 phases are defined
 * - Marker phases (meta_review/verify/evolve) require explicit closure
 * - Terminal phases are correctly identified
 * - Labels (zh-CN and en-US) are complete for all 11 phases
 * - Summary preference order is correct
 * - The 11-stage workflow is distinct from the 8-stage spine
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readJson } from "./_helpers.mjs";

describe("Part A: 11-phase business workflow structure", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");

  test("businessWorkflow.phases has exactly 11 entries", () => {
    const phases = contract.businessWorkflow?.phases ?? [];
    assert.equal(phases.length, 11, `Expected 11 phases, got ${phases.length}`);
  });

  test("all 11 phase names are correct", () => {
    const phases = contract.businessWorkflow?.phases ?? [];
    const expected = [
      "direction",
      "planning",
      "execution",
      "review",
      "meta_review",
      "revision",
      "verify",
      "summary",
      "feedback",
      "evolve",
      "mirror",
    ];
    for (const name of expected) {
      assert.ok(phases.includes(name), `Missing phase: ${name}`);
    }
    assert.deepEqual(phases.sort(), expected.sort());
  });

  test("distinctFromCanonicalSpine is true", () => {
    assert.equal(contract.businessWorkflow?.distinctFromCanonicalSpine, true);
  });

  test("canonicalExecutionSpineRef references the 8-stage spine", () => {
    const ref = contract.businessWorkflow?.canonicalExecutionSpineRef ?? "";
    assert.ok(ref.includes("Critical"), "must reference Critical stage");
    assert.ok(ref.includes("Fetch"), "must reference Fetch stage");
    assert.ok(ref.includes("Evolution"), "must reference Evolution stage");
    assert.ok(
      ref.includes("dev-governance.md"),
      "must reference dev-governance.md as spine definition",
    );
  });

  test("canonicalExecutionSpineStages has exactly 8 entries", () => {
    const stages =
      contract.businessWorkflow?.canonicalExecutionSpineStages ?? [];
    assert.equal(stages.length, 8);
  });
});

describe("Part B: marker phases", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");

  test("markerPhases includes meta_review, verify, evolve", () => {
    const markers = contract.businessWorkflow?.markerPhases ?? [];
    assert.ok(
      markers.includes("meta_review"),
      "markerPhases must include meta_review",
    );
    assert.ok(markers.includes("verify"), "markerPhases must include verify");
    assert.ok(markers.includes("evolve"), "markerPhases must include evolve");
    assert.equal(markers.length, 3, "markerPhases must have exactly 3 entries");
  });

  test("marker phases are a subset of terminal phases", () => {
    const markers = contract.businessWorkflow?.markerPhases ?? [];
    const terminals = contract.businessWorkflow?.terminalPhases ?? [];
    for (const marker of markers) {
      assert.ok(
        terminals.includes(marker),
        `marker phase "${marker}" must also be in terminalPhases`,
      );
    }
  });
});

describe("Part C: terminal phases", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");

  test("terminalPhases has exactly 7 entries", () => {
    const terminals = contract.businessWorkflow?.terminalPhases ?? [];
    assert.equal(
      terminals.length,
      7,
      `Expected 7 terminal phases, got ${terminals.length}`,
    );
  });

  test("all terminal phases are correct", () => {
    const terminals = contract.businessWorkflow?.terminalPhases ?? [];
    const expected = [
      "review",
      "meta_review",
      "verify",
      "summary",
      "feedback",
      "evolve",
      "mirror",
    ];
    for (const t of expected) {
      assert.ok(terminals.includes(t), `Missing terminal phase: ${t}`);
    }
  });
});

describe("Part D: phase labels (i18n)", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");

  test("labels.zh-CN has all 11 phases", () => {
    const labels = contract.businessWorkflow?.labels?.["zh-CN"] ?? {};
    const expected = [
      "CEO方向", // direction
      "经理规划", // planning
      "执行产出", // execution
      "经理评审", // review
      "元部门审计", // meta_review
      "修改迭代", // revision
      "经理验证", // verify
      "经理汇总", // summary
      "CEO反馈", // feedback
      "Agent进化", // evolve
      "镜像发布", // mirror
    ];
    for (const [phase, label] of Object.entries(labels)) {
      assert.ok(
        label && label.length > 0,
        `zh-CN label for phase "${phase}" must be non-empty`,
      );
    }
    assert.equal(Object.keys(labels).length, 11, "zh-CN must have 11 labels");
  });

  test("labels.en-US has all 11 phases", () => {
    const labels = contract.businessWorkflow?.labels?.["en-US"] ?? {};
    for (const [phase, label] of Object.entries(labels)) {
      assert.ok(
        label && label.length > 0,
        `en-US label for phase "${phase}" must be non-empty`,
      );
    }
    assert.equal(Object.keys(labels).length, 11, "en-US must have 11 labels");
  });

  test("zh-CN and en-US labels are different for each phase", () => {
    const zh = contract.businessWorkflow?.labels?.["zh-CN"] ?? {};
    const en = contract.businessWorkflow?.labels?.["en-US"] ?? {};
    for (const phase of Object.keys(zh)) {
      assert.notEqual(
        zh[phase],
        en[phase],
        `zh-CN and en-US labels for "${phase}" must differ`,
      );
    }
  });
});

describe("Part E: summary preference order", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");

  test("summaryPreference has 6 entries", () => {
    const pref = contract.businessWorkflow?.summaryPreference ?? [];
    assert.equal(pref.length, 6, "summaryPreference must have 6 entries");
  });

  test("summaryPreference order is correct", () => {
    const pref = contract.businessWorkflow?.summaryPreference ?? [];
    assert.equal(pref[0], "summary", "summary must be first");
    assert.equal(pref[1], "verify", "verify must be second");
    assert.equal(pref[2], "revision", "revision must be third");
    assert.equal(pref[3], "execution", "execution must be fourth");
    assert.equal(pref[4], "planning", "planning must be fifth");
    assert.equal(pref[5], "direction", "direction must be sixth");
  });
});

describe("Part F: gates for 11-phase workflow", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");
  const gates = contract.gates ?? {};

  test("planning gate exists with correct owner", () => {
    assert.equal(gates.planning?.owner, "meta-conductor");
    assert.equal(gates.planning?.passToken, "Pass");
    assert.equal(gates.planning?.reworkToken, "Requires Re-scheduling");
  });

  test("metaReview gate has multiple owners", () => {
    const owners = gates.metaReview?.owners ?? [];
    assert.ok(owners.length >= 2, "metaReview gate must have multiple owners");
    assert.ok(owners.includes("meta-warden"));
    assert.ok(owners.includes("meta-prism"));
  });

  test("verify gate has multiple owners", () => {
    const owners = gates.verify?.owners ?? [];
    assert.ok(owners.length >= 2, "verify gate must have multiple owners");
    assert.ok(owners.includes("meta-warden"));
    assert.ok(owners.includes("meta-prism"));
  });

  test("summary gate owner is meta-warden and requires verified run", () => {
    assert.equal(gates.summary?.owner, "meta-warden");
    assert.equal(gates.summary?.requiresVerifiedRun, true);
  });

  test("dealer gate is meta-conductor primary with meta-warden escalation", () => {
    assert.equal(gates.dealer?.primaryOwner, "meta-conductor");
    assert.equal(gates.dealer?.escalationOwner, "meta-warden");
    const sources = gates.dealer?.interruptSources ?? [];
    assert.ok(sources.includes("meta-sentinel"));
    assert.ok(sources.includes("meta-prism"));
    assert.ok(sources.includes("user"));
    assert.ok(sources.includes("system"));
  });
});

describe("Part G: business workflow vs 8-stage spine distinction", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");

  test("8-stage spine phases are in snake_case (distinct from business phases)", () => {
    const spine =
      contract.businessWorkflow?.canonicalExecutionSpineStages ?? [];
    // Business phases use snake_case too, but are different names
    const business = contract.businessWorkflow?.phases ?? [];
    // They should not be the same array
    assert.notDeepEqual(
      spine,
      business,
      "spine and business phases must be distinct",
    );
  });

  test("business phases are department-run vocabulary, not spine rename", () => {
    // This is the core invariant: business phase ids do NOT rename spine stages
    const ref = contract.businessWorkflow?.canonicalExecutionSpineRef ?? "";
    assert.ok(
      ref.includes("do not rename") || ref.includes("do not substitute"),
      "contract must explicitly state business phases do not rename spine stages",
    );
  });

  test("runDiscipline.runHeader has required fields for business workflow", () => {
    const fields = contract.protocols?.runHeader?.requiredFields ?? [];
    const essential = ["department", "primaryDeliverable", "audience"];
    for (const f of essential) {
      assert.ok(
        fields.includes(f),
        `runHeader.requiredFields must include "${f}"`,
      );
    }
  });
});
