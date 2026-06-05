#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_TASK =
  "我需要 Meta_Kim 能把每次 Codex 真实测试后的 stage outputs 自动整理成一份稳定 JSON summary，并检测缺失的 verification owner、decision output、blocked gate reason。这个动作会反复跑，要求机械、可测试、本地完成，不需要新 agent 身份。";

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function commandForDisplay(command, args) {
  return [command, ...args].join(" ");
}

function runCommand({ command, args, label }) {
  const executable = command === "node" ? process.execPath : command;
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  return {
    label,
    command: commandForDisplay(command, args),
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    passed: result.status === 0,
  };
}

function parseRouteJson(commandResult) {
  if (!commandResult.passed) return null;
  try {
    return JSON.parse(commandResult.stdout);
  } catch {
    return null;
  }
}

function compactRoute(routeOutput) {
  const decision = routeOutput?.capabilityGapDecision;
  const evidence = decision?.decisionEvidence;
  const decisionOutput = decision?.decisionOutput;
  const decisionRule = evidence?.decisionRule;
  return {
    capabilityGapDetected: routeOutput?.capabilityGapDetected ?? false,
    decision: decision?.decision ?? null,
    decisionReason: decision?.gapDecision?.decisionReason ?? null,
    rejectedAlternativesCount: decision?.gapDecision?.rejectedAlternatives?.length ?? 0,
    decisionEvidenceStatus: evidence?.status ?? null,
    missingEvidenceCount: evidence?.missingEvidence?.length ?? null,
    branchOwner: decisionRule?.branchOwner ?? null,
    branchOwnerRole: decisionRule?.branchOwnerRole ?? null,
    verifier: decisionRule?.verifier ?? null,
    decisionOutput: decisionOutput
      ? {
          kind: decisionOutput.kind,
          owner: decisionOutput.owner,
          scope: decisionOutput.scope,
          acceptanceStatus: decisionOutput.acceptance?.status ?? null,
          missingFields: decisionOutput.acceptance?.missingFields ?? [],
          verificationOwner: decisionOutput.verification?.owner ?? null,
          noAutomaticCanonicalWrite: decisionOutput.acceptance?.noAutomaticCanonicalWrite ?? null,
          noExternalWriteWithoutApproval:
            decisionOutput.acceptance?.noExternalWriteWithoutApproval ?? null,
          reviewable: decisionOutput.acceptance?.reviewable ?? null,
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
          identityCleanliness: decision.generatedAgentSpec.identityCleanliness?.status ?? null,
        }
      : null,
    routeExecutionGate: {
      canEnterExecution: routeOutput?.routeExecutionGate?.canEnterExecution ?? null,
      blockedBy: routeOutput?.routeExecutionGate?.blockedBy ?? [],
      returnToStage: routeOutput?.routeExecutionGate?.returnToStage ?? null,
      reason: routeOutput?.routeExecutionGate?.reason ?? null,
    },
  };
}

function evaluate({ compact, commands, expectedDecision }) {
  const checks = [
    {
      id: "capability_gap_detected",
      label: "CapabilityGap detected",
      passed: compact.capabilityGapDetected === true,
      evidence: compact.capabilityGapDetected,
    },
    {
      id: "decision_matches_expected",
      label: `GapDecision is ${expectedDecision}`,
      passed: compact.decision === expectedDecision,
      evidence: compact.decision,
    },
    {
      id: "decision_explainability",
      label: "Decision has reason and rejected alternatives",
      passed:
        typeof compact.decisionReason === "string" &&
        compact.decisionReason.length > 0 &&
        compact.rejectedAlternativesCount >= 1,
      evidence: {
        decisionReason: compact.decisionReason,
        rejectedAlternativesCount: compact.rejectedAlternativesCount,
      },
    },
    {
      id: "decision_evidence",
      label: "DecisionEvidenceContract passes",
      passed:
        compact.decisionEvidenceStatus === "pass" && compact.missingEvidenceCount === 0,
      evidence: {
        status: compact.decisionEvidenceStatus,
        missingEvidenceCount: compact.missingEvidenceCount,
      },
    },
    {
      id: "decision_output_complete",
      label: "DecisionOutput is complete",
      passed:
        compact.decisionOutput?.kind === "script_candidate_spec" &&
        compact.decisionOutput?.acceptanceStatus === "pass" &&
        compact.decisionOutput?.missingFields?.length === 0,
      evidence: compact.decisionOutput,
    },
    {
      id: "missing_verifier_zero",
      label: "Missing verifier count is 0",
      passed: Boolean(compact.verifier) && Boolean(compact.decisionOutput?.verificationOwner),
      evidence: {
        decisionRuleVerifier: compact.verifier,
        decisionOutputVerifier: compact.decisionOutput?.verificationOwner ?? null,
      },
    },
    {
      id: "fake_owner_zero",
      label: "Fake owner count is 0",
      passed:
        compact.branchOwner === "script-provider" &&
        compact.decisionOutput?.owner === "script-provider",
      evidence: {
        branchOwner: compact.branchOwner,
        outputOwner: compact.decisionOutput?.owner ?? null,
      },
    },
    {
      id: "identity_pollution_zero",
      label: "Long-term identity pollution is 0",
      passed:
        compact.generatedAgentSpec === null &&
        compact.branchOwnerRole !== "execution_worker" &&
        compact.decisionOutput?.scope === "candidate_only",
      evidence: {
        generatedAgentSpec: compact.generatedAgentSpec,
        branchOwnerRole: compact.branchOwnerRole,
        outputScope: compact.decisionOutput?.scope ?? null,
      },
    },
    {
      id: "validator_as_planner_zero",
      label: "Validator-as-planner count is 0",
      passed:
        compact.branchOwner !== "validator" &&
        compact.decisionEvidenceStatus === "pass" &&
        compact.decision !== null,
      evidence: {
        branchOwner: compact.branchOwner,
        decisionEvidenceStatus: compact.decisionEvidenceStatus,
      },
    },
    {
      id: "automatic_canonical_write_zero",
      label: "Automatic canonical writeback is 0",
      passed:
        compact.decisionOutput?.noAutomaticCanonicalWrite === true &&
        compact.candidateWriteback?.writebackDecision !== "write_canonical",
      evidence: {
        noAutomaticCanonicalWrite: compact.decisionOutput?.noAutomaticCanonicalWrite,
        writebackDecision: compact.candidateWriteback?.writebackDecision ?? null,
      },
    },
    {
      id: "route_integration_test",
      label: "Route integration regression passes",
      passed: commands.routeIntegrationTest.passed,
      evidence: {
        status: commands.routeIntegrationTest.status,
        command: commands.routeIntegrationTest.command,
      },
    },
    {
      id: "route_validator",
      label: "Route validator passes",
      passed: commands.routeValidator.passed,
      evidence: {
        status: commands.routeValidator.status,
        command: commands.routeValidator.command,
      },
    },
  ];
  return {
    status: checks.every((check) => check.passed) ? "pass" : "fail",
    checks,
  };
}

function escapeCell(value) {
  return String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|");
}

function markdownReport(report) {
  const compact = report.route.compact;
  const lines = [
    "# Capability Gap 隔离真实任务报告",
    "",
    "## Summary",
    "",
    `- 结果：${report.evaluation.status}`,
    `- Runtime：\`${report.runtime}\``,
    `- OS：\`${report.os}\``,
    `- 期望 decision：\`${report.expectedDecision}\``,
    `- 实际 decision：\`${compact.decision ?? "missing"}\``,
    "",
    "## Task",
    "",
    report.task,
    "",
    "## Route Output",
    "",
    "| 字段 | 值 |",
    "|---|---|",
    `| capabilityGapDetected | \`${compact.capabilityGapDetected}\` |`,
    `| decisionReason | ${escapeCell(compact.decisionReason)} |`,
    `| rejectedAlternatives | \`${compact.rejectedAlternativesCount}\` |`,
    `| DecisionOutput.kind | \`${compact.decisionOutput?.kind ?? "missing"}\` |`,
    `| DecisionOutput.owner | \`${compact.decisionOutput?.owner ?? "missing"}\` |`,
    `| DecisionOutput.scope | \`${compact.decisionOutput?.scope ?? "missing"}\` |`,
    `| DecisionOutput.acceptance | \`${compact.decisionOutput?.acceptanceStatus ?? "missing"}\` |`,
    `| DecisionOutput.missingFields | \`${compact.decisionOutput?.missingFields?.join(", ") || "[]"}\` |`,
    `| DecisionOutput.verificationOwner | \`${compact.decisionOutput?.verificationOwner ?? "missing"}\` |`,
    `| ExecutionGate.canEnterExecution | \`${compact.routeExecutionGate.canEnterExecution}\` |`,
    `| ExecutionGate.blockedBy | \`${compact.routeExecutionGate.blockedBy.join(", ") || "none"}\` |`,
    `| ExecutionGate.returnToStage | \`${compact.routeExecutionGate.returnToStage ?? "none"}\` |`,
    "",
    "## Quantitative Acceptance",
    "",
    "| 检查 | 结果 | 证据 |",
    "|---|---|---|",
  ];
  for (const check of report.evaluation.checks) {
    lines.push(
      `| ${escapeCell(check.label)} | ${check.passed ? "pass" : "fail"} | ${escapeCell(
        JSON.stringify(check.evidence),
      )} |`,
    );
  }
  lines.push(
    "",
    "## Commands",
    "",
    "| 命令 | 结果 |",
    "|---|---|",
  );
  for (const command of Object.values(report.commands)) {
    lines.push(`| \`${escapeCell(command.command)}\` | ${command.passed ? "pass" : "fail"} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const task = argValue("--task", DEFAULT_TASK);
  const runtime = argValue("--runtime", "codex");
  const osTarget = argValue("--os", "windows");
  const expectedDecision = argValue("--expected-decision", "create_script");
  const jsonPath = path.resolve(
    argValue(
      "--json-out",
      ".meta-kim/state/default/capability-gap-isolated-task-report.json",
    ),
  );
  const markdownPath = path.resolve(
    argValue(
      "--markdown-out",
      ".meta-kim/state/default/capability-gap-isolated-task-report.zh-CN.md",
    ),
  );

  const routeCommand = runCommand({
    command: "node",
    label: "route",
    args: [
      "scripts/select-execution-route.mjs",
      "--runtime",
      runtime,
      "--os",
      osTarget,
      "--json",
      "--task",
      task,
    ],
  });
  const routeOutput = parseRouteJson(routeCommand);
  const compact = compactRoute(routeOutput);

  const routeIntegrationTest = runCommand({
    command: "node",
    label: "route-integration-test",
    args: [
      "scripts/run-node-tests.mjs",
      "tests/meta-theory/23-capability-gap-route-integration.test.mjs",
    ],
  });
  const routeValidator = runCommand({
    command: "node",
    label: "route-validator",
    args: ["scripts/validate-capability-routing.mjs"],
  });

  const commands = {
    route: routeCommand,
    routeIntegrationTest,
    routeValidator,
  };
  const evaluation = routeOutput
    ? evaluate({ compact, commands, expectedDecision })
    : {
        status: "fail",
        checks: [
          {
            id: "route_json_parse",
            label: "Route command produced parseable JSON",
            passed: false,
            evidence: {
              status: routeCommand.status,
              stderr: routeCommand.stderr.slice(0, 500),
              stdout: routeCommand.stdout.slice(0, 500),
            },
          },
        ],
      };

  const report = {
    reportId: "capability-gap-isolated-task-report",
    generatedAt: new Date().toISOString(),
    runtime,
    os: osTarget,
    task,
    expectedDecision,
    route: {
      compact,
    },
    commands: Object.fromEntries(
      Object.entries(commands).map(([key, command]) => [
        key,
        {
          label: command.label,
          command: command.command,
          status: command.status,
          signal: command.signal,
          passed: command.passed,
        },
      ]),
    ),
    evaluation,
  };

  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  await fs.mkdir(path.dirname(markdownPath), { recursive: true });
  await fs.writeFile(markdownPath, markdownReport(report));

  console.log(
    JSON.stringify(
      {
        status: evaluation.status,
        decision: compact.decision,
        decisionOutputKind: compact.decisionOutput?.kind ?? null,
        jsonPath: jsonPath.replace(/\\/g, "/"),
        markdownPath: markdownPath.replace(/\\/g, "/"),
      },
      null,
      2,
    ),
  );

  if (evaluation.status !== "pass") process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
