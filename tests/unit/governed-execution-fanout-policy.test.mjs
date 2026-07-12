import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildAgentTeamsWaves,
  buildFanoutSafetyPacket,
  taskIsExecutableWorker,
} from "../../scripts/governed-execution/fanout-policy.mjs";

function task(id, overrides = {}) {
  return {
    taskPacketId: id,
    roleDisplayName: id,
    parallelGroup: "repair",
    collisionPolicy: "exclusive_scope",
    workspaceIsolation: "shared_worktree_disjoint_files",
    scopeFiles: [`${id}.mjs`],
    dependsOn: [],
    externalWriteBoundary: false,
    ...overrides,
  };
}

test("fanout policy accepts independent disjoint lanes", () => {
  const tasks = [task("a"), task("b")];
  const safety = buildFanoutSafetyPacket(tasks);
  assert.equal(safety.safeForParallelFanout, true);
  assert.equal(safety.status, "pass");
  const waves = buildAgentTeamsWaves(tasks, {
    maxConcurrentAgents: 2,
    requestedParallelAgents: 2,
    runtimeCapacity: 4,
    capacitySource: "test",
    capacitySourceKind: "test",
  }, safety);
  assert.deepEqual(waves.map((wave) => wave.taskPacketIds), [["a", "b"]]);
});

test("fanout policy blocks collisions, cycles, and external writes", () => {
  const collision = buildFanoutSafetyPacket([
    task("a", { scopeFiles: ["same.mjs"] }),
    task("b", { scopeFiles: ["same.mjs"] }),
  ]);
  assert.equal(collision.safeForParallelFanout, false);
  assert.equal(collision.collisionConflicts.length, 1);

  const cycle = buildFanoutSafetyPacket([
    task("a", { dependsOn: ["b"] }),
    task("b", { dependsOn: ["a"] }),
  ]);
  assert.equal(cycle.dependencySafe, false);
  assert.deepEqual(new Set(cycle.cycleTaskIds), new Set(["a", "b"]));

  assert.equal(taskIsExecutableWorker(task("write", { externalWriteBoundary: true })), false);
});

test("wave planning honors dependencies and runtime capacity", () => {
  const tasks = [
    task("a"),
    task("b"),
    task("c", { dependsOn: ["a", "b"] }),
  ];
  const safety = buildFanoutSafetyPacket(tasks);
  const waves = buildAgentTeamsWaves(tasks, {
    maxConcurrentAgents: 2,
    requestedParallelAgents: 3,
    runtimeCapacity: 2,
    capacitySource: "test",
    capacitySourceKind: "test",
  }, safety);
  assert.deepEqual(waves.map((wave) => wave.taskPacketIds), [["a", "b"], ["c"]]);
});

test("governed execution defaults resolve through the active profile", async () => {
  const source = await readFile(
    new URL("../../scripts/run-meta-theory-governed-execution.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /getProfilePaths\(\{ repoPath: REPO_ROOT \}\)\.profileDir/);
  assert.doesNotMatch(source, /["']state["']\s*,\s*["']default["']\s*,\s*["']governed-executions["']/);
});
