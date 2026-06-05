#!/usr/bin/env node

import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  CAPABILITY_GAP_OUTPUT_CONTRACT,
  decideCapabilityGap,
} from "./capability-gap-mvp.mjs";

const CANDIDATE_FIXTURES = [
  {
    decision: "create_skill",
    input: "同一套 PRD review standard 已经多次出现，需要流程包和触发条件。",
    candidateClass: "skill",
  },
  {
    decision: "create_script",
    input: "release summary JSON 每周重复整理，输入输出稳定，需要本地脚本。",
    candidateClass: "script",
  },
  {
    decision: "create_mcp_provider",
    input: "内部知识库需要 MCP provider 边界，明确权限、凭证、审计和只读查询。",
    candidateClass: "mcp_provider",
  },
  {
    decision: "worker_task_only",
    input: "这次只整理一个标题的措辞，已有编辑能力足够。",
    candidateClass: "runtime_worker_task",
  },
];

function hasNonEmpty(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return typeof value === "string" && value.trim().length > 0;
}

function requiredOutputsPresent(contract, payload) {
  return (contract.requiredOutputs ?? []).every((field) => hasNonEmpty(payload[field]));
}

function scoreCandidate(result, fixture) {
  const decision = result.gapDecision.decision;
  const output = result.decisionOutput;
  const payload = output.payload ?? {};
  const contract = CAPABILITY_GAP_OUTPUT_CONTRACT.outputs[decision];
  const candidate = result.candidateWriteback;
  const candidateOnly = ["create_skill", "create_script", "create_mcp_provider"].includes(decision);
  const runtimeWorkerTask = decision === "worker_task_only";
  const dimensions = {
    boundary:
      output.owner === contract.owner &&
      output.scope === contract.scope &&
      output.kind === contract.kind,
    loadout:
      requiredOutputsPresent(contract, payload) &&
      (candidateOnly ? hasNonEmpty(candidate?.candidateType) : true),
    leastPrivilege:
      output.acceptance.noAutomaticCanonicalWrite === true &&
      output.acceptance.noExternalWriteWithoutApproval === true &&
      (decision !== "create_mcp_provider" || /write/i.test(JSON.stringify(payload.readWritePolicy ?? {}))),
    verification:
      hasNonEmpty(output.verification?.owner) &&
      hasNonEmpty(output.verification?.passCondition) &&
      output.acceptance.status === "pass",
    memoryPolicy:
      output.acceptance.noAutomaticCanonicalWrite === true &&
      output.acceptance.noExternalWriteWithoutApproval === true &&
      !JSON.stringify(payload).includes("scopeFiles") &&
      !JSON.stringify(payload).includes("todayTask"),
    writebackPolicy: candidateOnly
      ? candidate?.writebackDecision === "candidate_only" &&
        output.scope === "candidate_only"
      : runtimeWorkerTask && !candidate && output.scope === "run_scoped",
  };
  return {
    decision,
    candidateClass: fixture.candidateClass,
    outputId: output.outputId,
    candidateType: candidate?.candidateType ?? null,
    dimensions,
    status: Object.values(dimensions).every(Boolean) ? "pass" : "fail",
  };
}

function buildCandidateScorecard() {
  const scorecards = CANDIDATE_FIXTURES.map((fixture) => {
    const result = decideCapabilityGap(fixture.input, {
      expectedDecision: fixture.decision,
    });
    return scoreCandidate(result, fixture);
  });
  const candidateClasses = scorecards.map((scorecard) => scorecard.candidateClass);
  const status = scorecards.every((scorecard) => scorecard.status === "pass")
    ? "pass"
    : "fail";
  return {
    schemaVersion: "capability-candidate-scorecard-v0.1",
    status,
    owner: "meta-prism",
    stationCoverage: {
      "meta-genesis": "boundary",
      "meta-artisan": "loadout",
      "meta-librarian": "memoryPolicy",
      "meta-prism": "verification",
      "meta-warden": "writebackPolicy",
    },
    checkedDimensions: [
      "boundary",
      "loadout",
      "leastPrivilege",
      "verification",
      "memoryPolicy",
      "writebackPolicy",
    ],
    candidateClasses,
    scorecards,
    acceptance: {
      scorecardCount: scorecards.length,
      passCount: scorecards.filter((scorecard) => scorecard.status === "pass").length,
      automaticCanonicalWrite: 0,
      unauthorizedExternalWrite: 0,
      failedCandidates: scorecards
        .filter((scorecard) => scorecard.status !== "pass")
        .map((scorecard) => scorecard.decision),
    },
  };
}

function main() {
  const report = buildCandidateScorecard();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== "pass") {
    process.exit(1);
  }
}

export { buildCandidateScorecard, scoreCandidate };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
