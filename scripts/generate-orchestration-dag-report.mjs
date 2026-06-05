#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { buildCapabilityGapOrchestration } from "./run-capability-gap-orchestration.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(scriptDir, "..");
const SCENARIO_PATH = path.join(
  REPO_ROOT,
  "tests",
  "meta-theory",
  "scenarios",
  "complex-capability-gap-inputs.json",
);
const OUTPUT_DIR = path.join(REPO_ROOT, ".meta-kim", "state", "default", "orchestration-dag");

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath).replaceAll("\\", "/");
}

function mermaidId(value) {
  return String(value).replace(/[^a-zA-Z0-9_]/g, "_");
}

function lineForNode(node) {
  const label = `${node.roleDisplayName}:${node.roleInstanceId}\\n${node.parallelGroup}`;
  return `  ${mermaidId(node.id)}["${label}"]`;
}

function buildDag(orchestration, testCase) {
  const taskById = new Map(
    orchestration.workerTaskPackets.map((packet) => [packet.taskPacketId, packet]),
  );
  const nodes = orchestration.orchestrationTaskBoardPacket.tasks.map((task) => {
    const packet = taskById.get(task.taskPacketId);
    return {
      id: task.taskPacketId,
      owner: task.owner,
      roleDisplayName: task.roleDisplayName,
      roleInstanceId: task.roleInstanceId,
      parallelGroup: task.parallelGroup,
      mergeOwner: task.mergeOwner,
      shardScope: task.shardScope,
      dependsOn: task.dependsOn ?? [],
      blocked:
        packet?.owner === "meta-sentinel" ||
        packet?.capabilityRequirements?.includes("blocked_or_needs_approval"),
      output: packet?.output ?? null,
      acceptanceCriteria: packet?.acceptanceCriteria ?? [],
    };
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const dependencyEdges = nodes.flatMap((node) =>
    node.dependsOn.map((source) => ({
      from: source,
      to: node.id,
      edgeType: "depends_on",
      valid: nodeIds.has(source),
    })),
  );
  const groupMap = new Map();
  for (const node of nodes) {
    if (!groupMap.has(node.parallelGroup)) groupMap.set(node.parallelGroup, []);
    groupMap.get(node.parallelGroup).push(node);
  }
  const parallelGroups = [...groupMap.entries()].map(([parallelGroup, groupNodes]) => ({
    parallelGroup,
    taskCount: groupNodes.length,
    roleInstanceIds: groupNodes.map((node) => node.roleInstanceId),
    mergeOwners: [...new Set(groupNodes.map((node) => node.mergeOwner))],
    blockedTasks: groupNodes.filter((node) => node.blocked).map((node) => node.id),
  }));
  const fakeParallelismFindings = [];
  for (const group of parallelGroups) {
    const duplicateInstances = group.roleInstanceIds.filter(
      (id, index) => group.roleInstanceIds.indexOf(id) !== index,
    );
    if (duplicateInstances.length > 0) {
      fakeParallelismFindings.push({
        parallelGroup: group.parallelGroup,
        reason: "duplicate_role_instance_id",
        duplicateInstances,
      });
    }
    if (group.mergeOwners.length !== 1) {
      fakeParallelismFindings.push({
        parallelGroup: group.parallelGroup,
        reason: "multiple_merge_owners",
        mergeOwners: group.mergeOwners,
      });
    }
  }
  const orphanDependencies = dependencyEdges.filter((edge) => !edge.valid);
  const mermaidLines = [
    "flowchart TD",
    ...nodes.map(lineForNode),
    ...dependencyEdges.map(
      (edge) => `  ${mermaidId(edge.from)} --> ${mermaidId(edge.to)}`,
    ),
  ];
  if (dependencyEdges.length === 0 && nodes.length > 1) {
    mermaidLines.push(
      `  ${mermaidId(nodes[0].id)} -. same run merge .- ${mermaidId(nodes[nodes.length - 1].id)}`,
    );
  }
  return {
    caseId: testCase.id,
    input: testCase.input,
    status:
      nodes.length === orchestration.workerTaskPackets.length &&
      nodes.every(
        (node) =>
          node.owner &&
          node.roleDisplayName &&
          node.roleInstanceId &&
          node.parallelGroup &&
          node.mergeOwner &&
          node.shardScope,
      ) &&
      orphanDependencies.length === 0 &&
      fakeParallelismFindings.length === 0
        ? "pass"
        : "fail",
    boardId: orchestration.orchestrationTaskBoardPacket.dispatchBoardId,
    synthesisOwner: orchestration.orchestrationTaskBoardPacket.synthesisOwner,
    nodeCount: nodes.length,
    edgeCount: dependencyEdges.length,
    nodes,
    edges: dependencyEdges,
    parallelGroups,
    blockedNodes: nodes.filter((node) => node.blocked).map((node) => node.id),
    fakeParallelismFindings,
    orphanDependencies,
    mermaid: mermaidLines.join("\n"),
  };
}

function buildMarkdown(report) {
  const lines = [
    "# Orchestration DAG Report",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- status: ${report.status}`,
    `- caseCount: ${report.summary.caseCount}`,
    `- fakeParallelismCount: ${report.summary.fakeParallelismCount}`,
    `- blockedNodeCount: ${report.summary.blockedNodeCount}`,
    "",
    "## Cases",
    "",
    "| Case | Status | Nodes | Edges | Parallel Groups | Blocked Nodes |",
    "|---|---|---:|---:|---:|---:|",
    ...report.dags.map(
      (dag) =>
        `| ${dag.caseId} | ${dag.status} | ${dag.nodeCount} | ${dag.edgeCount} | ${dag.parallelGroups.length} | ${dag.blockedNodes.length} |`,
    ),
    "",
    "## Mermaid Preview",
    "",
    "```mermaid",
    report.dags[0]?.mermaid ?? "flowchart TD",
    "```",
    "",
    "## Checks",
    "",
    "- Every workerTask appears as one DAG node.",
    "- Every node records dependsOn, parallelGroup, mergeOwner, roleInstanceId, and shardScope.",
    "- Fake parallelism count must stay 0.",
    "- Blocked tasks remain visible instead of being hidden as pass nodes.",
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const scenario = JSON.parse(await fs.readFile(SCENARIO_PATH, "utf8"));
  const selectedCases = scenario.cases.filter((testCase) =>
    ["multi-capability-release-system", "approval-blocked-github-write", "same-type-skill-repeat"].includes(
      testCase.id,
    ),
  );
  const dags = selectedCases.map((testCase) =>
    buildDag(buildCapabilityGapOrchestration(testCase.input), testCase),
  );
  const fakeParallelismCount = dags.reduce(
    (sum, dag) => sum + dag.fakeParallelismFindings.length,
    0,
  );
  const blockedNodeCount = dags.reduce((sum, dag) => sum + dag.blockedNodes.length, 0);
  const report = {
    schemaVersion: "orchestration-dag-report-v0.1",
    generatedAt: new Date().toISOString(),
    scenario: relativeToRepo(SCENARIO_PATH),
    status:
      dags.length >= 3 &&
      dags.every((dag) => dag.status === "pass") &&
      fakeParallelismCount === 0 &&
      blockedNodeCount >= 1
        ? "pass"
        : "fail",
    summary: {
      caseCount: dags.length,
      passCount: dags.filter((dag) => dag.status === "pass").length,
      fakeParallelismCount,
      blockedNodeCount,
      totalNodes: dags.reduce((sum, dag) => sum + dag.nodeCount, 0),
      totalEdges: dags.reduce((sum, dag) => sum + dag.edgeCount, 0),
      requiredFields: ["dependsOn", "parallelGroup", "mergeOwner", "roleInstanceId", "shardScope"],
    },
    dags,
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, "latest.json");
  const mdPath = path.join(OUTPUT_DIR, "latest.zh-CN.md");
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(mdPath, buildMarkdown(report));

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: report.status === "pass",
        report: relativeToRepo(jsonPath),
        markdown: relativeToRepo(mdPath),
        caseCount: report.summary.caseCount,
        fakeParallelismCount: report.summary.fakeParallelismCount,
        blockedNodeCount: report.summary.blockedNodeCount,
      },
      null,
      2,
    )}\n`,
  );
  if (report.status !== "pass") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
