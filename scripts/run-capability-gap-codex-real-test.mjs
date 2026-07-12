#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getProfilePaths } from "./meta-kim-local-state.mjs";
import process from "node:process";

const CASES = [
  {
    id: "CGRT-01",
    name: "create_skill",
    task: "create skill for reusable PRD review flow using same Critical Fetch Thinking Review standard",
    expectedDecision: "create_skill",
  },
  {
    id: "CGRT-02",
    name: "create_agent",
    task: "create agent for long-term test coverage strategy owner",
    expectedDecision: "create_agent",
  },
  {
    id: "CGRT-03",
    name: "create_script",
    task: "create script for mechanical testable JSON report normalization from release artifacts",
    expectedDecision: "create_script",
  },
  {
    id: "CGRT-04",
    name: "create_mcp_provider",
    task: "create mcp provider for stable internal knowledge base capability with credential boundary and audit",
    expectedDecision: "create_mcp_provider",
  },
  {
    id: "CGRT-05",
    name: "worker_task_only",
    task: "capability gap check: one-off docs title wording update, existing docs owner and tools are enough",
    expectedDecision: "worker_task_only",
  },
  {
    id: "CGRT-06",
    name: "blocked_or_needs_approval",
    task: "missing dependency task requiring imaginary provider xzzq",
    expectedDecision: "blocked_or_needs_approval",
  },
];

function runRoute(task) {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/select-execution-route.mjs",
      "--task",
      task,
      "--runtime",
      "codex",
      "--os",
      "windows",
      "--json",
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Route command failed for task: ${task}`);
  }
  return JSON.parse(result.stdout);
}

function compactStageOutputs(routeOutput) {
  const decision = routeOutput.capabilityGapDecision;
  const evidence = decision?.decisionEvidence;
  const rule = evidence?.decisionRule;
  const providerCoverage = routeOutput.ownerDiscoveryPacket?.capabilityProviderCoverage ?? {};
  const codexAgents = (routeOutput.ownerDiscoveryPacket?.projectRuntimeAgents ?? [])
    .filter((agent) => agent.runtime === "codex")
    .map((agent) => ({
      id: agent.id,
      layer: agent.layer,
      executionBlock: agent.executionBlock,
      sourceRef: agent.sourceRef,
    }));

  return {
    critical: {
      taskShape: routeOutput.taskShape,
      needsIntentAmplification: routeOutput.intentAmplificationPrecheck?.needsIntentAmplification,
      scoreThreshold: routeOutput.intentAmplificationPrecheck?.scoreThreshold,
      reason: routeOutput.intentAmplificationPrecheck?.reason,
    },
    fetch: {
      runtime: routeOutput.runtimeFilterResult?.applied,
      os: routeOutput.osFilterResult?.applied,
      discoveryPrinciple: routeOutput.ownerDiscoveryPacket?.discoveryPrinciple,
      searchOrder: routeOutput.ownerDiscoveryPacket?.searchOrder,
      evidenceRefs: routeOutput.ownerDiscoveryPacket?.evidenceRefs,
      providerCoverage,
      codexAgents,
    },
    thinking: {
      recommendedRoute: routeOutput.recommendedRoute
        ? {
            id: routeOutput.recommendedRoute.id,
            owner: routeOutput.recommendedRoute.owner,
            weapon: routeOutput.recommendedRoute.weapon,
            score: routeOutput.recommendedRoute.score,
            scoreBand: routeOutput.recommendedRoute.scoreBand,
            verificationOwner: routeOutput.recommendedRoute.verificationOwner,
            verificationMethod: routeOutput.recommendedRoute.verificationMethod,
          }
        : null,
      capabilityGapDetected: routeOutput.capabilityGapDetected,
      gapDecision: decision?.decision,
      decisionReason: decision?.gapDecision?.decisionReason,
      rejectedAlternatives: decision?.gapDecision?.rejectedAlternatives,
      branchOwner: rule?.branchOwner,
      branchOwnerRole: rule?.branchOwnerRole,
      deliverable: rule?.deliverable,
      verifier: rule?.verifier,
      graphPath: decision?.graphPath,
    },
    executionGate: {
      canPreviewRoute: routeOutput.routeExecutionGate?.canPreviewRoute,
      canEnterExecution: routeOutput.routeExecutionGate?.canEnterExecution,
      blockedBy: routeOutput.routeExecutionGate?.blockedBy,
      returnToStage: routeOutput.routeExecutionGate?.returnToStage,
      reason: routeOutput.routeExecutionGate?.reason,
    },
    review: {
      evidenceStatus: evidence?.status,
      requiredEvidence: evidence?.requiredEvidence,
      missingEvidence: evidence?.missingEvidence,
      checklist: (evidence?.checklist ?? []).map((item) => ({
        key: item.key,
        owner: item.owner,
        ownerRole: item.ownerRole ?? null,
        status: item.status,
      })),
      forbiddenBehaviors: rule?.forbiddenBehaviors,
    },
    verification: {
      command: "node scripts/run-capability-gap-codex-real-test.mjs",
      expectedDecision: decision?.decision,
      evidenceCovered: evidence?.status === "pass" && (evidence?.missingEvidence ?? []).length === 0,
      routeRuntimeIsCodex: routeOutput.runtimeFilterResult?.applied === "codex",
      routeOsIsWindows: routeOutput.osFilterResult?.applied === "windows",
    },
    evolution: {
      decisionOutput: decision?.decisionOutput
        ? {
            kind: decision.decisionOutput.kind,
            owner: decision.decisionOutput.owner,
            scope: decision.decisionOutput.scope,
            outputFields: decision.decisionOutput.outputs,
            acceptanceStatus: decision.decisionOutput.acceptance?.status,
            missingFields: decision.decisionOutput.acceptance?.missingFields ?? [],
          }
        : null,
      candidateWriteback: decision?.candidateWriteback
        ? {
            candidateType: decision.candidateWriteback.candidateType,
            writebackDecision: decision.candidateWriteback.writebackDecision,
            promotionRule: decision.candidateWriteback.promotionRule,
          }
        : null,
      generatedAgentSpec: decision?.generatedAgentSpec
        ? {
            name: decision.generatedAgentSpec.name,
            identityCleanliness: decision.generatedAgentSpec.identityCleanliness?.status,
          }
        : null,
      workerTaskPacket: decision?.workerTaskPacket
        ? {
            scope: decision.workerTaskPacket.scope,
            reason: decision.workerTaskPacket.reason,
          }
        : null,
      blockedReason: decision?.blockedReason ?? null,
    },
  };
}

function validateCase(testCase, routeOutput, stageOutputs) {
  const failures = [];
  const decision = routeOutput.capabilityGapDecision;
  const evidence = decision?.decisionEvidence;
  const rule = evidence?.decisionRule;

  if (routeOutput.runtimeFilterResult?.applied !== "codex") failures.push("runtime must be codex");
  if (routeOutput.osFilterResult?.applied !== "windows") failures.push("os must be windows");
  if (routeOutput.capabilityGapDetected !== true) failures.push("capabilityGapDetected must be true");
  if (decision?.decision !== testCase.expectedDecision) {
    failures.push(`decision must be ${testCase.expectedDecision}, got ${decision?.decision ?? "missing"}`);
  }
  if (evidence?.status !== "pass") failures.push("DecisionEvidenceContract must pass");
  if ((evidence?.missingEvidence ?? []).length !== 0) failures.push("missingEvidence must be empty");
  if (!rule?.branchOwner) failures.push("branch owner missing");
  if (!rule?.verifier) failures.push("verifier missing");
  if (!rule?.forbiddenBehaviors?.length) failures.push("forbidden behaviors missing");
  if (!decision?.decisionOutput) failures.push("decisionOutput missing");
  if (decision?.decisionOutput?.acceptance?.status !== "pass") failures.push("decisionOutput acceptance must pass");
  if ((decision?.decisionOutput?.acceptance?.missingFields ?? []).length !== 0) failures.push("decisionOutput missingFields must be empty");
  if (!decision?.decisionOutput?.owner) failures.push("decisionOutput owner missing");
  if (!decision?.decisionOutput?.scope) failures.push("decisionOutput scope missing");
  if (!decision?.decisionOutput?.verification?.owner) failures.push("decisionOutput verification owner missing");
  if ((evidence?.responsibilityChain ?? []).length < 7) failures.push("responsibility chain incomplete");
  if (!Array.isArray(stageOutputs.fetch.searchOrder) || stageOutputs.fetch.searchOrder.length < 5) {
    failures.push("Fetch searchOrder incomplete");
  }
  if (stageOutputs.review.checklist.length < 8) failures.push("review checklist incomplete");

  if (testCase.expectedDecision === "blocked_or_needs_approval") {
    if (routeOutput.routeExecutionGate?.canEnterExecution !== false) failures.push("blocked decision must close Execution gate");
    if (!routeOutput.routeExecutionGate?.blockedBy?.includes("capability_gap_decision_blocks_execution")) {
      failures.push("Execution gate must name capability_gap_decision_blocks_execution");
    }
    if (decision?.decisionOutput?.kind !== "approval_request") failures.push("blocked decision must produce approval_request");
  }
  if (testCase.expectedDecision === "create_agent") {
    if (decision?.generatedAgentSpec?.identityCleanliness?.status !== "pass") {
      failures.push("create_agent must produce clean GeneratedAgentSpec");
    }
    if (rule?.branchOwnerRole === "execution_worker") {
      failures.push("governance branch owner must not become execution worker");
    }
    if (decision?.decisionOutput?.kind !== "agent_candidate_spec") failures.push("create_agent must produce agent_candidate_spec");
  }
  if (testCase.expectedDecision === "worker_task_only") {
    if (!decision?.workerTaskPacket) failures.push("worker_task_only must produce workerTaskPacket");
    if (decision?.candidateWriteback) failures.push("worker_task_only must not produce candidateWriteback");
    if (decision?.decisionOutput?.kind !== "worker_task_packet") failures.push("worker_task_only must produce worker_task_packet output");
  }

  return {
    status: failures.length === 0 ? "pass" : "fail",
    failures,
  };
}

function markdownReport(report) {
  const lines = [
    "# Capability Gap Codex-only 真实测试报告",
    "",
    `- Runtime：\`${report.runtime}\``,
    `- OS：\`${report.os}\``,
    `- 用例数：${report.summary.total}`,
    `- 通过：${report.summary.passed}`,
    `- 失败：${report.summary.failed}`,
    `- 总体结果：${report.summary.status}`,
    "",
    "## 测试说明",
    "",
    "这份报告实际运行 `select-execution-route --runtime codex --os windows`，检查每个阶段是否产出 AI 可识别的证据。",
    "",
  ];

  for (const result of report.results) {
    const s = result.stageOutputs;
    lines.push(`## ${result.id} ${result.name}`);
    lines.push("");
    lines.push(`- 状态：${result.status}`);
    lines.push(`- 期望 decision：\`${result.expectedDecision}\``);
    lines.push(`- 实际 decision：\`${s.thinking.gapDecision}\``);
    lines.push(`- 执行门：canEnterExecution=\`${s.executionGate.canEnterExecution}\`，blockedBy=\`${(s.executionGate.blockedBy ?? []).join(", ") || "none"}\``);
    lines.push("");
    lines.push("| 阶段 | 产出 |");
    lines.push("|---|---|");
    lines.push(`| Critical | taskShape=\`${s.critical.taskShape}\`; needsIntentAmplification=\`${s.critical.needsIntentAmplification}\` |`);
    lines.push(`| Fetch | runtime=\`${s.fetch.runtime}\`; os=\`${s.fetch.os}\`; searchOrder=${s.fetch.searchOrder?.length ?? 0}; codexAgents=${s.fetch.codexAgents?.length ?? 0} |`);
    lines.push(`| Thinking | route=\`${s.thinking.recommendedRoute?.id ?? "none"}\`; branchOwner=\`${s.thinking.branchOwner}\`; deliverable=\`${s.thinking.deliverable}\` |`);
    lines.push(`| Execution Gate | returnToStage=\`${s.executionGate.returnToStage ?? "none"}\`; reason=${s.executionGate.reason} |`);
    lines.push(`| Review | evidenceStatus=\`${s.review.evidenceStatus}\`; missingEvidence=${s.review.missingEvidence?.length ?? 0}; checklist=${s.review.checklist?.length ?? 0} |`);
    lines.push(`| Verification | evidenceCovered=\`${s.verification.evidenceCovered}\`; routeRuntimeIsCodex=\`${s.verification.routeRuntimeIsCodex}\` |`);
    lines.push(`| Evolution | output=\`${s.evolution.decisionOutput?.kind ?? "none"}\`; outputStatus=\`${s.evolution.decisionOutput?.acceptanceStatus ?? "missing"}\`; candidate=\`${s.evolution.candidateWriteback?.candidateType ?? "none"}\`; generatedAgent=\`${s.evolution.generatedAgentSpec?.name ?? "none"}\`; workerTask=\`${s.evolution.workerTaskPacket?.scope ?? "none"}\`; blocked=\`${s.evolution.blockedReason ? "yes" : "no"}\` |`);
    if (result.failures.length) {
      lines.push("");
      lines.push(`失败原因：${result.failures.join("; ")}`);
    }
    lines.push("");
  }

  while (lines.at(-1) === "") lines.pop();
  return `${lines.join("\n")}\n`;
}

async function main() {
  const results = [];
  for (const testCase of CASES) {
    const routeOutput = runRoute(testCase.task);
    const stageOutputs = compactStageOutputs(routeOutput);
    const validation = validateCase(testCase, routeOutput, stageOutputs);
    results.push({
      id: testCase.id,
      name: testCase.name,
      task: testCase.task,
      expectedDecision: testCase.expectedDecision,
      status: validation.status,
      failures: validation.failures,
      stageOutputs,
    });
  }

  const summary = {
    total: results.length,
    passed: results.filter((result) => result.status === "pass").length,
    failed: results.filter((result) => result.status !== "pass").length,
  };
  summary.status = summary.failed === 0 ? "pass" : "fail";

  const report = {
    reportId: "capability-gap-codex-real-test",
    runtime: "codex",
    os: "windows",
    generatedAt: new Date().toISOString(),
    summary,
    results,
  };

  const stateDir = getProfilePaths({ repoPath: process.cwd() }).profileDir;
  await fs.mkdir(stateDir, { recursive: true });
  const jsonPath = path.join(stateDir, "capability-gap-codex-real-test.json");
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));

  const markdownPath = path.join(stateDir, "capability-gap-codex-real-test-report.zh-CN.md");
  await fs.writeFile(markdownPath, markdownReport(report));

  console.log(JSON.stringify({
    summary,
    jsonPath: jsonPath.replace(/\\/g, "/"),
    markdownPath: markdownPath.replace(/\\/g, "/"),
  }, null, 2));

  if (summary.failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
