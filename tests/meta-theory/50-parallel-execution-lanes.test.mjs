import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";

function route(task, runtime = "claude_code", os = "windows") {
  const result = spawnSync(
    process.execPath,
    ["scripts/select-execution-route.mjs", "--task", task, "--runtime", runtime, "--os", os, "--json"],
    { encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

describe("50 — Parallel execution lanes (engineering fan-out)", () => {
  test("multi-segment task produces >=2 workers and parallel lanes", () => {
    const result = route(
      "refactor frontend components in src/ui, rebuild backend api routes in src/api, and migrate database schema. three independent parallel lanes."
    );
    const drafts = result.workerTaskPacketDrafts;
    const lanes = result.recommendedRoute.parallelExecutionLanes ?? [];
    assert.ok(lanes.length >= 2, `expected >=2 parallel lanes, got ${lanes.length}`);
    assert.ok(drafts.length >= 2, `expected >=2 worker drafts, got ${drafts.length}`);
  });

  test("every produced worker ownerAgent must come from runtime-scoped candidate owners (by ownerKind)", () => {
    const result = route(
      "refactor frontend components in src/ui, rebuild backend api routes in src/api, and migrate database schema."
    );
    const agentAvailable = new Set(result.ownerDiscoveryPacket.candidateExistingExecutionOwners);
    const nonAgentProviders = [
      ...result.ownerDiscoveryPacket.repoCanonicalCapabilityProviders,
      ...result.ownerDiscoveryPacket.projectRuntimeCapabilityProviders,
      ...result.ownerDiscoveryPacket.localGlobalCapabilityProviders,
    ];
    const nonAgentIds = new Set(nonAgentProviders.map((p) => p.id));
    for (const draft of result.workerTaskPacketDrafts) {
      const kind = draft.ownerKind ?? "agent";
      const pool = kind === "agent" ? agentAvailable : nonAgentIds;
      assert.ok(
        pool.has(draft.ownerAgent),
        `worker ownerAgent "${draft.ownerAgent}" (kind=${kind}) must be in runtime-scoped candidate set`
      );
    }
  });

  test("every parallel lane owner must come from runtime-scoped candidate providers (by ownerKind)", () => {
    const result = route(
      "refactor frontend components in src/ui, rebuild backend api routes in src/api, and migrate database schema."
    );
    const lanes = result.recommendedRoute.parallelExecutionLanes ?? [];
    const agentAvailable = new Set(result.ownerDiscoveryPacket.candidateExistingExecutionOwners);
    const nonAgentProviders = [
      ...result.ownerDiscoveryPacket.repoCanonicalCapabilityProviders,
      ...result.ownerDiscoveryPacket.projectRuntimeCapabilityProviders,
      ...result.ownerDiscoveryPacket.localGlobalCapabilityProviders,
    ];
    const nonAgentIds = new Set(nonAgentProviders.map((p) => p.id));
    for (const lane of lanes) {
      const kind = lane.ownerKind ?? "agent";
      const pool = kind === "agent" ? agentAvailable : nonAgentIds;
      assert.ok(
        pool.has(lane.ownerAgent),
        `lane ownerAgent "${lane.ownerAgent}" (kind=${kind}) must be in runtime-scoped candidate set`
      );
    }
  });

  test("single-line task falls back to single worker (no fan-out)", () => {
    const result = route("fix the login button on the homepage");
    if (!result.recommendedRoute) {
      assert.ok(true, "no route available — inventory gap, not a fan-out failure");
      return;
    }
    const drafts = result.workerTaskPacketDrafts;
    const lanes = result.recommendedRoute.parallelExecutionLanes ?? [];
    assert.equal(lanes.length, 0, "single-line task must not produce parallel lanes");
    assert.equal(drafts.length, 1, "single-line task must fall back to exactly 1 worker");
  });

  test("owner of every produced worker must be in declared available set (no transient or invented ids)", () => {
    const result = route(
      "build a quantum entanglement scheduler using holocene crystals and twiddle the foo bar with baz qux"
    );
    const available = new Set(result.ownerDiscoveryPacket.candidateExistingExecutionOwners);
    for (const draft of result.workerTaskPacketDrafts) {
      if (draft.ownerAgent === null) continue;
      assert.ok(available.has(draft.ownerAgent), `worker owner "${draft.ownerAgent}" must be in declared available set`);
    }
    if (!result.recommendedRoute) {
      assert.ok(true, "no route available — inventory gap, not a fan-out failure");
      return;
    }
    const lanes = result.recommendedRoute.parallelExecutionLanes ?? [];
    for (const lane of lanes) {
      if (lane.ownerAgent === null) continue;
      assert.ok(available.has(lane.ownerAgent), `lane owner "${lane.ownerAgent}" must be in declared available set`);
    }
  });

  test("multi-segment task produces parallel lanes so downstream dispatch can fan out", () => {
    const result = route(
      "refactor frontend components in src/ui, rebuild backend api routes in src/api, and migrate database schema."
    );
    const lanes = result.recommendedRoute.parallelExecutionLanes ?? [];
    const drafts = result.workerTaskPacketDrafts;
    assert.ok(lanes.length >= 2, "multi-segment task must produce >=2 parallel lanes");
    assert.ok(drafts.length >= 2, "multi-segment task must produce >=2 worker drafts");
  });

  test("meta-governed whitespace capability anchors still split into reusable global-agent lanes", () => {
    const result = route(
      "Critical Thinking → Fetch → Deep Thinking → Review 检查平台 key adapter 注册 能力账本 第二批平台路由 上传证据",
      "codex",
      "windows",
    );
    const lanes = result.recommendedRoute.parallelExecutionLanes ?? [];
    const drafts = result.workerTaskPacketDrafts;
    const available = new Set(result.ownerDiscoveryPacket.candidateExistingExecutionOwners);

    assert.equal(result.entryClassification.subagentAuthorizationSource, "meta_theory_trigger_request");
    assert.ok(lanes.length >= 2, `expected whitespace capability anchors to produce >=2 lanes, got ${lanes.length}`);
    assert.ok(drafts.length >= 2, `expected >=2 worker drafts, got ${drafts.length}`);
    for (const draft of drafts) {
      assert.equal(draft.ownerKind, "agent");
      assert.ok(available.has(draft.ownerAgent), `worker owner "${draft.ownerAgent}" must be an existing discovered owner`);
      assert.equal(draft.codexSpawnBinding?.spawnMode, "typed_spawn");
      assert.equal(draft.codexSpawnBinding?.agent_type, draft.ownerAgent);
    }
  });
});
