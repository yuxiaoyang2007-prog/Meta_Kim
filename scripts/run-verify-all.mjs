#!/usr/bin/env node
// Meta_Kim verify-all 编排器
//
// 把 `meta:verify:all` 的长 `&&` 链，换成有名字、可续跑的流水线。
// 每步打印名字、耗时；挂了告诉你哪步挂、怎么续跑。
//
// 用法：
//   node scripts/run-verify-all.mjs              # 跑全部
//   node scripts/run-verify-all.mjs --list       # 列阶段
//   node scripts/run-verify-all.mjs --from meta:check   # 从某步续跑
//   node scripts/run-verify-all.mjs --json       # 结束时打印聚合 JSON
//   node scripts/run-verify-all.mjs --live-certified # 追加外部签名实机认证

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createReportContext } from "./report-context.mjs";

export const STAGES = [
  { name: "discover:global", cmd: "npm run discover:global", timeoutMs: 120_000 },
  { name: "meta:check", cmd: "npm run meta:check", timeoutMs: 120_000 },
  { name: "meta:verify:governance", cmd: "npm run meta:verify:governance", timeoutMs: 300_000 },
  { name: "meta:graphify:check", cmd: "npm run meta:graphify:check", timeoutMs: 60_000 },
  { name: "meta:check:global:release", cmd: "npm run meta:check:global:release", timeoutMs: 120_000 },
  { name: "eval-meta-agents", cmd: "node scripts/eval-meta-agents.mjs --require-all-runtimes", timeoutMs: 300_000 },
  { name: "meta:test:inventory", cmd: "npm run meta:test:inventory", timeoutMs: 30_000 },
  { name: "meta:test:unit", cmd: "npm run meta:test:unit", timeoutMs: 120_000 },
  { name: "meta:test:setup", cmd: "npm run meta:test:setup", timeoutMs: 300_000 },
  { name: "meta:test:meta-theory", cmd: "npm run meta:test:meta-theory", timeoutMs: 180_000 },
  { name: "meta:test:integration", cmd: "npm run meta:test:integration", timeoutMs: 180_000 },
];

export const LIVE_CERTIFIED_STAGE = {
  name: "meta:acceptance:clean-room:require",
  cmd: "npm run meta:acceptance:clean-room:require",
  timeoutMs: 30_000,
};

export function computeReleaseGrade({ results, startIndex }) {
  if (startIndex !== 0 || results.length < STAGES.length) return false;
  return STAGES.every(
    (stage, index) =>
      results[index]?.name === stage.name && results[index]?.status === "passed",
  );
}

export function computeLiveCertified({
  requested,
  releaseGrade,
  results,
  startIndex,
}) {
  if (!requested || !releaseGrade || startIndex !== 0) return false;
  const liveResult = results[STAGES.length];
  return (
    liveResult?.name === LIVE_CERTIFIED_STAGE.name &&
    liveResult?.status === "passed"
  );
}

export function computeVerificationClaims({ requested, results, startIndex }) {
  const releaseGrade = computeReleaseGrade({ results, startIndex });
  const liveCertified = computeLiveCertified({
    requested,
    releaseGrade,
    results,
    startIndex,
  });
  return {
    releaseGrade,
    liveCertified,
    liveCertificationStatus: requested
      ? liveCertified
        ? "passed"
        : "failed_or_incomplete"
      : "not_requested",
  };
}

async function main() {

const args = process.argv.slice(2);
const liveCertifiedRequested = args.includes("--live-certified");
const selectedStages = liveCertifiedRequested
  ? [...STAGES, LIVE_CERTIFIED_STAGE]
  : STAGES;
const jsonMode = args.includes("--json");
const noReport = args.includes("--no-report");
const reportIdx = args.findIndex((arg) => arg === "--report" || arg === "--json-out");
const reportContext = createReportContext();
const reportPath =
  reportIdx >= 0 && args[reportIdx + 1] && !args[reportIdx + 1].startsWith("--")
    ? args[reportIdx + 1]
    : reportContext.resolveStatePath("verification-report.json");

function writeReport(report) {
  if (noReport) return;
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

if (args.includes("--list")) {
  if (jsonMode) {
    console.log(JSON.stringify({ stages: selectedStages, liveCertifiedRequested }, null, 2));
  } else {
    selectedStages.forEach((s, i) => console.log(`${i + 1}. ${s.name}  →  ${s.cmd}`));
  }
  process.exit(0);
}

const fromIdx = args.indexOf("--from");
let startIndex = 0;
if (fromIdx >= 0) {
  const target = args[fromIdx + 1];
  const idx = selectedStages.findIndex((s) => s.name === target);
  if (idx < 0) {
    console.error(
      `未知阶段：${target}。可用：${selectedStages.map((s) => s.name).join(", ")}`,
    );
    process.exit(2);
  }
  startIndex = idx;
}

function parseStageCommand(cmd) {
  const parts = cmd.trim().split(/\s+/);
  if (parts[0] === "npm" && parts[1] === "run" && parts[2]) {
    if (process.platform === "win32") {
      return {
        command: process.env.ComSpec || "cmd.exe",
        args: ["/d", "/s", "/c", ["npm", "run", ...parts.slice(2)].join(" ")],
      };
    }
    return { command: "npm", args: ["run", ...parts.slice(2)] };
  }
  if (parts[0] === "node" && parts[1]) {
    return { command: process.execPath, args: parts.slice(1) };
  }
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", cmd],
    };
  }
  return { command: "sh", args: ["-lc", cmd] };
}

function runWithTimeout(cmd, timeoutMs) {
  const { command, args: commandArgs } = parseStageCommand(cmd);
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    shell: false,
    stdio: "inherit",
    timeout: timeoutMs,
  });
  const timedOut = result.error?.code === "ETIMEDOUT" || result.signal === "SIGTERM";
  const exitCode = result.status ?? (timedOut ? null : 1);
  return {
    ok: exitCode === 0 && !timedOut && !result.error,
    timedOut,
    exitCode,
    signal: result.signal ?? null,
    error: result.error?.message ?? null,
  };
}

let failedStage = null;
const startedAt = new Date().toISOString();
const results = [];
for (let i = startIndex; i < selectedStages.length; i += 1) {
  const stage = selectedStages[i];
  const label = `[${i + 1}/${selectedStages.length}] ${stage.name}`;
  const t0 = Date.now();
  console.log(`\n=== ${label} ===\n> ${stage.cmd}`);
  const result = runWithTimeout(stage.cmd, stage.timeoutMs);
  const ms = Date.now() - t0;
  if (result.ok) {
    console.log(`\n✓ ${label} 通过 (${ms}ms)`);
    results.push({
      name: stage.name,
      cmd: stage.cmd,
      status: "passed",
      durationMs: ms,
      exitCode: 0,
      timedOut: false,
    });
  } else {
    const reason = result.timedOut ? `超时 (>${stage.timeoutMs}ms)` : `exit ${result.exitCode ?? "?"}`;
    console.error(`\n✗ ${label} 失败 (${ms}ms, ${reason})`);
    console.error(
      `  续跑：node scripts/run-verify-all.mjs${liveCertifiedRequested ? " --live-certified" : ""} --from ${stage.name}`,
    );
    results.push({
      name: stage.name,
      cmd: stage.cmd,
      status: "failed",
      durationMs: ms,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      signal: result.signal,
      error: result.error,
      resumeCommand: `node scripts/run-verify-all.mjs${liveCertifiedRequested ? " --live-certified" : ""} --from ${stage.name}`,
    });
    failedStage = stage;
    break;
  }
}

const verificationClaims = computeVerificationClaims({
  requested: liveCertifiedRequested,
  results,
  startIndex,
});
const { releaseGrade, liveCertified, liveCertificationStatus } = verificationClaims;
const report = {
  ok: !failedStage,
  releaseGrade,
  liveCertified,
  liveCertificationStatus,
  resumedRun: startIndex > 0,
  releaseGradeReason:
    startIndex > 0
      ? `Resumed verification is diagnostic only; release-grade requires one report containing all ${STAGES.length} standard stages.`
      : !releaseGrade
        ? failedStage
        ? `Verification failed at ${failedStage.name}.`
        : `The report does not contain all ${STAGES.length} standard release-grade stages.`
        : `All ${STAGES.length} standard release-grade stages passed in one complete run.`,
  liveCertificationReason: liveCertifiedRequested
    ? liveCertified
      ? "The optional external clean-room signature gate passed after the complete standard release-grade run."
      : startIndex > 0
        ? "A resumed run cannot self-promote to live-certified."
        : failedStage?.name === LIVE_CERTIFIED_STAGE.name
          ? "Standard release-grade passed, but the optional external clean-room signature gate failed."
          : "Live certification was requested but the complete standard run or external signature gate did not pass."
    : "Optional external live certification was not requested.",
  startedAt,
  completedAt: new Date().toISOString(),
  startStage: selectedStages[startIndex]?.name ?? null,
  failedStage: failedStage?.name ?? null,
  stages: results,
};
writeReport(report);

if (failedStage) {
  console.error(`  报告：${reportPath}`);
  if (jsonMode) console.log(JSON.stringify(report, null, 2));
  console.error(`\n=== verify-all 停在 ${failedStage.name} ===`);
  process.exit(1);
}
if (jsonMode) console.log(JSON.stringify(report, null, 2));
if (startIndex > 0) {
  console.log(
    `\n=== verify-all 续跑诊断通过（从第 ${startIndex + 1} 步起）；不构成 release-grade 或 live-certified ===`,
  );
} else {
  console.log(
    `\n=== verify-all 全过（共 ${selectedStages.length} 步）===`,
  );
}
console.log(`报告：${reportPath}`);
}

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) await main();
