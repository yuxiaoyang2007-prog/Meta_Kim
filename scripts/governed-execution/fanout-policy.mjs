function arrayOfStrings(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim())
    : [];
}

export function taskIsExecutableWorker(packet) {
  return packet?.executionMode !== "approval_gate" && packet?.externalWriteBoundary !== true;
}

export function taskDependencyIds(packet) {
  return arrayOfStrings(packet?.dependsOn).filter(
    (value, index, array) => array.indexOf(value) === index,
  );
}

function taskCollisionScopes(packet) {
  const scopeFiles = arrayOfStrings(packet?.scopeFiles).map((item) => `file:${item}`);
  if (scopeFiles.length > 0) return scopeFiles;
  if (packet?.artifactNamespace) return [`artifact:${packet.artifactNamespace}`];
  if (packet?.shardKey) return [`shard:${packet.shardKey}`];
  if (packet?.workspaceIsolation === "run_scoped" && packet?.taskPacketId) {
    return [`run-scoped:${packet.taskPacketId}`];
  }
  return packet?.taskPacketId ? [`task:${packet.taskPacketId}`] : ["unknown-scope"];
}

function detectDependencyCycles(tasks) {
  const taskIds = new Set(tasks.map((packet) => packet.taskPacketId));
  const visiting = new Set();
  const visited = new Set();
  const cycleTaskIds = new Set();
  const visit = (taskId, stack = []) => {
    if (visited.has(taskId)) return;
    if (visiting.has(taskId)) {
      for (const id of stack.slice(stack.indexOf(taskId))) cycleTaskIds.add(id);
      return;
    }
    visiting.add(taskId);
    const task = tasks.find((packet) => packet.taskPacketId === taskId);
    for (const dependencyId of taskDependencyIds(task).filter((id) => taskIds.has(id))) {
      visit(dependencyId, [...stack, taskId]);
    }
    visiting.delete(taskId);
    visited.add(taskId);
  };
  for (const task of tasks) visit(task.taskPacketId);
  return [...cycleTaskIds];
}

export function buildFanoutSafetyPacket(executableTasks) {
  const taskIds = new Set(executableTasks.map((packet) => packet.taskPacketId));
  const rows = executableTasks.map((packet) => {
    const dependencyIds = taskDependencyIds(packet);
    return {
      taskPacketId: packet.taskPacketId,
      parallelGroup: packet.parallelGroup ?? null,
      dependsOn: dependencyIds,
      collisionPolicy: packet.collisionPolicy ?? "unspecified",
      workspaceIsolation: packet.workspaceIsolation ?? "unspecified",
      mutationScopes: taskCollisionScopes(packet),
      externalWriteBoundary: packet.externalWriteBoundary === true,
    };
  });
  const missingDependencies = rows.flatMap((row) =>
    row.dependsOn
      .filter((dependencyId) => !taskIds.has(dependencyId))
      .map((dependencyId) => ({ taskPacketId: row.taskPacketId, dependencyId })),
  );
  const selfDependencies = rows
    .filter((row) => row.dependsOn.includes(row.taskPacketId))
    .map((row) => row.taskPacketId);
  const cycleTaskIds = detectDependencyCycles(executableTasks);
  const scopeOwners = new Map();
  for (const row of rows) {
    for (const scope of row.mutationScopes) {
      if (!scopeOwners.has(scope)) scopeOwners.set(scope, []);
      scopeOwners.get(scope).push(row.taskPacketId);
    }
  }
  const collisionConflicts = [...scopeOwners.entries()]
    .filter(([, owners]) => owners.length > 1)
    .map(([scope, owners]) => ({ scope, taskPacketIds: owners }));
  const explicitParallelMetadata = rows.every(
    (row) => Boolean(row.parallelGroup) &&
      row.collisionPolicy !== "unspecified" &&
      row.workspaceIsolation !== "unspecified",
  );
  const initialReadyLaneCount = rows.filter((row) => row.dependsOn.length === 0).length;
  const safeForParallelFanout = rows.length >= 2 &&
    explicitParallelMetadata &&
    missingDependencies.length === 0 &&
    selfDependencies.length === 0 &&
    cycleTaskIds.length === 0 &&
    collisionConflicts.length === 0 &&
    rows.every((row) => row.externalWriteBoundary === false);
  return {
    schemaVersion: "agent-teams-fanout-safety-v0.1",
    status: safeForParallelFanout ? "pass" : rows.length >= 2 ? "partial" : "not_required",
    executableLaneCount: rows.length,
    initialReadyLaneCount,
    explicitParallelMetadata,
    missingDependencies,
    selfDependencies,
    cycleTaskIds,
    collisionConflicts,
    dependencySafe:
      missingDependencies.length === 0 && selfDependencies.length === 0 && cycleTaskIds.length === 0,
    collisionSafe: collisionConflicts.length === 0,
    externalWriteSafe: rows.every((row) => row.externalWriteBoundary === false),
    safeForParallelFanout,
    rows,
  };
}

export function buildAgentTeamsWaves(workerTaskPackets, parallelBudget, fanoutSafetyPacket = null) {
  const executableTasks = workerTaskPackets.filter(taskIsExecutableWorker);
  if (!parallelBudget) throw new TypeError("parallelBudget is required");
  const safetyPacket = fanoutSafetyPacket ?? buildFanoutSafetyPacket(executableTasks);
  if (!safetyPacket.safeForParallelFanout) return [];
  const waves = [];
  const remaining = new Map(executableTasks.map((task) => [task.taskPacketId, task]));
  const completed = new Set();
  while (remaining.size > 0) {
    const readyTasks = [...remaining.values()].filter((task) =>
      taskDependencyIds(task).every(
        (dependencyId) => completed.has(dependencyId) || !remaining.has(dependencyId),
      ),
    );
    if (readyTasks.length === 0) break;
    const tasks = readyTasks.slice(0, parallelBudget.maxConcurrentAgents);
    waves.push({
      waveId: `agent-team-wave-${waves.length + 1}`,
      mode: waves.length === 0 ? "primary_parallel_wave" : "followup_parallel_wave",
      taskPacketIds: tasks.map((packet) => packet.taskPacketId),
      roleDisplayNames: tasks.map((packet) => packet.roleDisplayName),
      parallelCount: tasks.length,
      requestedParallelAgents: parallelBudget.requestedParallelAgents,
      runtimeCapacity: parallelBudget.runtimeCapacity,
      capacitySource: parallelBudget.capacitySource,
      capacitySourceKind: parallelBudget.capacitySourceKind,
      mergeOwner: "meta-conductor",
    });
    for (const task of tasks) {
      completed.add(task.taskPacketId);
      remaining.delete(task.taskPacketId);
    }
  }
  return waves;
}
