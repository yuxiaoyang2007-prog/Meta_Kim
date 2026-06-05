#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildCapabilityGapOrchestration } from "./run-capability-gap-orchestration.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const DEFAULT_TASK = [
  "同一套 PRD review standard 已经多次出现，需要流程包和触发条件。",
  "每次 PRD review 都要 same Critical Fetch Thinking Review，可复用流程要沉淀。",
  "长期 test coverage owner 需要 agent。",
  "release summary JSON 需要脚本。",
  "内部知识库需要 MCP provider 边界。",
  "这次只整理一个标题的措辞，已有编辑能力足够。",
  "请直接给远程 GitHub PR 加 label，但当前没有授权。",
].join("\n");

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function normalizeTaskId(value) {
  return String(value ?? "");
}

function validateOrchestrationBoard(report) {
  const errors = [];
  const board = report?.orchestrationTaskBoardPacket;
  const workerPackets = report?.workerTaskPackets ?? [];
  const boardTasks = board?.tasks ?? [];

  if (!board || typeof board !== "object") {
    errors.push("missing orchestrationTaskBoardPacket");
  }
  if (board?.synthesisOwner !== "meta-conductor") {
    errors.push("orchestrationTaskBoardPacket.synthesisOwner must be meta-conductor");
  }
  if (!Array.isArray(boardTasks) || boardTasks.length === 0) {
    errors.push("orchestrationTaskBoardPacket.tasks must be non-empty");
  }
  if (boardTasks.length !== workerPackets.length) {
    errors.push("board task count must match workerTaskPackets count");
  }

  const boardTaskIds = new Set(boardTasks.map((task) => normalizeTaskId(task.taskPacketId)));
  const workerTaskIds = new Set(workerPackets.map((packet) => normalizeTaskId(packet.taskPacketId)));
  for (const taskId of boardTaskIds) {
    if (!workerTaskIds.has(taskId)) {
      errors.push(`board task ${taskId} has no matching workerTaskPacket`);
    }
  }
  for (const taskId of workerTaskIds) {
    if (!boardTaskIds.has(taskId)) {
      errors.push(`workerTaskPacket ${taskId} has no matching board task`);
    }
  }

  const seenRoleInstances = new Set();
  const mergeOwnerByParallelGroup = new Map();
  const taskIdSet = new Set([...boardTaskIds, ...workerTaskIds]);
  for (const packet of workerPackets) {
    if (!packet.roleInstanceId) {
      errors.push(`${packet.taskPacketId} missing roleInstanceId`);
    } else if (seenRoleInstances.has(packet.roleInstanceId)) {
      errors.push(`duplicate roleInstanceId ${packet.roleInstanceId}`);
    }
    seenRoleInstances.add(packet.roleInstanceId);

    if (!packet.parallelGroup) {
      errors.push(`${packet.taskPacketId} missing parallelGroup`);
    }
    if (packet.mergeOwner !== "meta-conductor") {
      errors.push(`${packet.taskPacketId} mergeOwner must be meta-conductor`);
    }
    if (!packet.shardScope) {
      errors.push(`${packet.taskPacketId} missing shardScope`);
    }
    if (!Array.isArray(packet.dependsOn)) {
      errors.push(`${packet.taskPacketId} dependsOn must be an array`);
    } else {
      for (const dependency of packet.dependsOn) {
        const dependencyId =
          typeof dependency === "string" ? dependency : dependency?.taskPacketId ?? dependency?.taskId;
        if (!taskIdSet.has(normalizeTaskId(dependencyId))) {
          errors.push(`${packet.taskPacketId} depends on unknown task ${dependencyId}`);
        }
      }
    }

    if (packet.parallelGroup) {
      const key = `${packet.ownerAgent}:${packet.parallelGroup}`;
      const existing = mergeOwnerByParallelGroup.get(key);
      if (existing && existing !== packet.mergeOwner) {
        errors.push(`${key} has conflicting mergeOwner values`);
      }
      mergeOwnerByParallelGroup.set(key, packet.mergeOwner);
    }
  }

  const groupedRepeatedNeeds = (report?.groupedGaps ?? []).filter(
    (group) => group.duplicatePolicy === "same_type_same_repeat_key_grouped"
  );
  for (const group of groupedRepeatedNeeds) {
    const taskCount = workerPackets.filter(
      (packet) => packet.parallelGroup === group.parallelGroup
    ).length;
    if (taskCount !== group.items.length) {
      errors.push(
        `${group.groupKey} grouped ${group.items.length} needs but has ${taskCount} worker tasks`
      );
    }
  }

  return {
    status: errors.length === 0 ? "pass" : "fail",
    errors,
    checked: {
      taskCount: boardTasks.length,
      workerTaskPacketCount: workerPackets.length,
      uniqueRoleInstanceIds: seenRoleInstances.size,
      parallelGroups: [...new Set(workerPackets.map((packet) => packet.parallelGroup))].filter(Boolean),
      groupedRepeatedNeeds: groupedRepeatedNeeds.length,
      mergeOwners: [...new Set(workerPackets.map((packet) => packet.mergeOwner))],
    },
  };
}

async function readTask() {
  const inputPath = argValue("--input", null);
  if (inputPath) {
    return fs.readFile(path.resolve(process.cwd(), inputPath), "utf8");
  }
  return argValue("--task", DEFAULT_TASK);
}

async function main() {
  const task = await readTask();
  const report = buildCapabilityGapOrchestration(task);
  const validation = validateOrchestrationBoard(report);
  const output = {
    schemaVersion: "capability-gap-orchestration-board-validation-v0.1",
    status: validation.status,
    owner: "meta-conductor",
    reviewOwner: "meta-prism",
    verificationOwner: "verify",
    reportStatus: report.status,
    boardId: report.orchestrationTaskBoardPacket.dispatchBoardId,
    validation,
  };
  const jsonOut = argValue("--json-out", null);
  if (jsonOut) {
    const outputPath = path.resolve(process.cwd(), jsonOut);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (validation.status !== "pass") {
    process.exit(1);
  }
}

export { validateOrchestrationBoard };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exit(1);
  });
}
