import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const CONTRACT_FILE = "config/contracts/core-loop-contract.json";
const DEV_GOVERNANCE_FILE = "canonical/skills/meta-theory/references/dev-governance.md";
const SKILL_FILE = "canonical/skills/meta-theory/SKILL.md";

function readContract() {
  return JSON.parse(readFileSync(CONTRACT_FILE, "utf8"));
}

describe("55 — ordered stage barriers with maximal safe internal parallelism", () => {
  test("the core-loop contract is the single machine authority", () => {
    const contract = readContract();
    assert.equal(
      contract.parallelExecutionPolicy.mode,
      "ordered_stage_barriers_with_maximal_safe_internal_parallelism",
    );
    assert.equal(contract.parallelExecutionPolicy.runtimeDagPacket, "coreLoop.stageDagPacket");
    assert.match(contract.parallelExecutionPolicy.authority, /single machine authority/iu);
  });

  test("all eight stages declare an internal parallel policy and one merge authority", () => {
    const contract = readContract();
    assert.deepEqual(
      contract.stages.map((stage) => stage.stage),
      ["Critical", "Fetch", "Thinking", "Execution", "Review", "Meta-Review", "Verification", "Evolution"],
    );
    for (const stage of contract.stages) {
      assert.ok(stage.parallelPolicy, `${stage.stage} must declare parallelPolicy`);
      assert.ok(stage.parallelPolicy.laneFamilies.length >= 2, `${stage.stage} must expose useful lane families`);
      assert.ok(stage.parallelPolicy.mergeAuthority, `${stage.stage} must keep one merge/verdict authority`);
      assert.equal(stage.parallelPolicy.nextStageRequiresMerge, true);
    }
  });

  test("the contract keeps stage barriers, resource safety, capacity, and invocation truth", () => {
    const policy = readContract().parallelExecutionPolicy;
    assert.match(policy.stageBarrierRule, /No lane in the next stage/iu);
    assert.match(policy.resourceRule, /Unknown write scope is unsafe/iu);
    assert.match(policy.capacityRule, /active runtime capacity/iu);
    assert.match(policy.invocationTruthRule, /not execution evidence/iu);
  });
});

describe("55b — human guidance projects the contract instead of reviving fixed waves", () => {
  test("dev-governance points to the authoritative policy and rejects Stage 0/fixed-wave authority", () => {
    assert.ok(existsSync(DEV_GOVERNANCE_FILE));
    const src = readFileSync(DEV_GOVERNANCE_FILE, "utf8");
    assert.match(src, /core-loop-contract\.json/iu);
    assert.match(src, /stage-internal parallelism|阶段内/iu);
    assert.doesNotMatch(src, /^###\s+Wave\s+[1-4]/mu);
    assert.doesNotMatch(src, /^###\s+Stage\s+0/mu);
    assert.doesNotMatch(src, /remain strict-serial|严格串行/iu);
  });

  test("SKILL keeps maximal safe internal parallelism and unique authorities", () => {
    const src = readFileSync(SKILL_FILE, "utf8");
    const boundaries = src.split("### Parallelism Boundaries")[1]?.split("## User Interaction")[0] ?? "";
    assert.match(boundaries, /every transition is a merge barrier/iu);
    assert.match(boundaries, /Inside each stage/iu);
    assert.match(boundaries, /one Warden verdict/iu);
    assert.match(boundaries, /one evidence\/claim authority/iu);
    assert.match(boundaries, /one approved durable writer/iu);
  });
});
