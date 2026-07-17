import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStageDagPacket,
  selectMaximalSafeReadySet,
  stageLaneNodeId,
  stageMergeNodeId,
} from "../../scripts/governed-execution/stage-dag.mjs";

function lane(laneId, overrides = {}) {
  return {
    laneId,
    laneKind: "execution_worker",
    ownerBindingRef: `owner:${laneId}`,
    capabilityBindingRef: `capability:${laneId}`,
    dependsOn: [],
    effectClass: "project_write",
    resourceScopes: [`file:${laneId}.mjs`],
    isolation: "shared_worktree_disjoint_files",
    status: "planned_not_invoked",
    ...overrides,
  };
}

test("stage DAG creates one merge node per stage and preserves stage barriers", () => {
  const packet = buildStageDagPacket({ stageOrder: ["Critical", "Fetch"] });
  assert.deepEqual(packet.stageOrder, ["Critical", "Fetch"]);
  assert.equal(packet.stageSummaries.length, 2);
  assert.ok(packet.nodes.some((node) => node.nodeId === stageMergeNodeId("Critical")));
  assert.ok(packet.nodes.some((node) => node.nodeId === stageMergeNodeId("Fetch")));
  for (const node of packet.nodes) {
    for (const field of [
      "nodeId",
      "stage",
      "laneKind",
      "ownerBindingRef",
      "capabilityBindingRef",
      "dependsOn",
      "effectClass",
      "resourceScopes",
      "isolation",
      "mergeNodeId",
      "status",
    ]) {
      assert.ok(Object.hasOwn(node, field), `${node.nodeId} missing ${field}`);
    }
  }

  const criticalControl = stageLaneNodeId("Critical", "control");
  const fetchControl = packet.stageSummaries[1].laneNodeIds[0];
  assert.deepEqual(
    selectMaximalSafeReadySet(packet, { capacity: 4 }).readyNodeIds,
    [criticalControl],
  );
  assert.deepEqual(
    selectMaximalSafeReadySet(packet, {
      completedNodeIds: [criticalControl],
      capacity: 4,
    }).readyNodeIds,
    [stageMergeNodeId("Critical")],
  );
  assert.deepEqual(
    selectMaximalSafeReadySet(packet, {
      completedNodeIds: [criticalControl, stageMergeNodeId("Critical")],
      capacity: 4,
    }).readyNodeIds,
    [fetchControl],
  );
});

test("independent disjoint lanes run together up to host capacity", () => {
  const packet = buildStageDagPacket({
    stageOrder: ["Execution"],
    stageLanes: { Execution: [lane("a"), lane("b"), lane("c")] },
    runtimeCapacity: 3,
  });
  const ready = selectMaximalSafeReadySet(packet, { stage: "Execution", capacity: 3 });
  assert.deepEqual(ready.readyNodeIds, [
    stageLaneNodeId("Execution", "a"),
    stageLaneNodeId("Execution", "b"),
    stageLaneNodeId("Execution", "c"),
  ]);
});

test("dependency edges serialize otherwise independent lanes", () => {
  const aId = stageLaneNodeId("Execution", "a");
  const packet = buildStageDagPacket({
    stageOrder: ["Execution"],
    stageLanes: { Execution: [lane("a"), lane("b", { dependsOn: [aId] })] },
  });
  assert.deepEqual(
    selectMaximalSafeReadySet(packet, { stage: "Execution", capacity: 2 }).readyNodeIds,
    [aId],
  );
  assert.deepEqual(
    selectMaximalSafeReadySet(packet, {
      stage: "Execution",
      completedNodeIds: [aId],
      capacity: 2,
    }).readyNodeIds,
    [stageLaneNodeId("Execution", "b")],
  );
});

test("same resource mutations do not run concurrently", () => {
  const packet = buildStageDagPacket({
    stageOrder: ["Execution"],
    stageLanes: {
      Execution: [
        lane("a", { resourceScopes: ["file:shared.mjs"] }),
        lane("b", { resourceScopes: ["file:shared.mjs"] }),
      ],
    },
  });
  const ready = selectMaximalSafeReadySet(packet, { stage: "Execution", capacity: 2 });
  assert.equal(ready.readyNodeIds.length, 1);
  assert.equal(ready.deferredNodeIds.length, 1);
});

test("Windows file scopes normalize case and separators and preserve parent-child exclusion", () => {
  const packet = buildStageDagPacket({
    stageOrder: ["Execution"],
    stageLanes: {
      Execution: [
        lane("parent", { resourceScopes: ["path:C:\\Repo\\SRC"] }),
        lane("child", { resourceScopes: ["file:c:/repo/src/components/App.mjs"] }),
      ],
    },
  });
  const ready = selectMaximalSafeReadySet(packet, { stage: "Execution", capacity: 2 });
  assert.deepEqual(ready.readyNodeIds, [stageLaneNodeId("Execution", "parent")]);
  assert.deepEqual(ready.deferredNodeIds, [stageLaneNodeId("Execution", "child")]);
});

test("ready-set maximizes cardinality instead of accepting a greedy blocking lane", () => {
  const packet = buildStageDagPacket({
    stageOrder: ["Execution"],
    stageLanes: {
      Execution: [
        lane("a", { resourceScopes: ["artifact:x", "artifact:y"] }),
        lane("b", { resourceScopes: ["artifact:x"] }),
        lane("c", { resourceScopes: ["artifact:y"] }),
      ],
    },
  });
  const ready = selectMaximalSafeReadySet(packet, { stage: "Execution", capacity: 2 });
  assert.deepEqual(ready.readyNodeIds, [
    stageLaneNodeId("Execution", "b"),
    stageLaneNodeId("Execution", "c"),
  ]);
  assert.deepEqual(ready.deferredNodeIds, [stageLaneNodeId("Execution", "a")]);
});

test("unknown mutation scope is exclusive and never parallelized", () => {
  const packet = buildStageDagPacket({
    stageOrder: ["Execution"],
    stageLanes: {
      Execution: [
        lane("unknown-a", { resourceScopes: [] }),
        lane("unknown-b", { resourceScopes: [] }),
      ],
    },
  });
  const ready = selectMaximalSafeReadySet(packet, { stage: "Execution", capacity: 8 });
  assert.equal(ready.readyNodeIds.length, 1);
  assert.equal(ready.deferredNodeIds.length, 1);
});

test("runtime capacity bounds the maximal safe ready set", () => {
  const packet = buildStageDagPacket({
    stageOrder: ["Execution"],
    stageLanes: { Execution: [lane("a"), lane("b"), lane("c")] },
    runtimeCapacity: 2,
  });
  const ready = selectMaximalSafeReadySet(packet, { stage: "Execution" });
  assert.equal(ready.readyNodeIds.length, 2);
  assert.equal(ready.deferredNodeIds.length, 1);
});
