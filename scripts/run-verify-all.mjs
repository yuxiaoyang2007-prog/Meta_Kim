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

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import process from "node:process";
import path from "node:path";

export const STAGES = [
  { name: "discover:global", cmd: "npm run discover:global", timeoutMs: 120_000 },
  { name: "meta:check", cmd: "npm run meta:check", timeoutMs: 120_000 },
  { name: "meta:verify:governance", cmd: "npm run meta:verify:governance", timeoutMs: 300_000 },
  { name: "meta:graphify:check", cmd: "npm run meta:graphify:check", timeoutMs: 60_000 },
  { name: "meta:check:global:release", cmd: "npm run meta:check:global:release", timeoutMs: 120_000 },
  { name: "eval-meta-agents", cmd: "node scripts/eval-meta-agents.mjs --require-all-runtimes", timeoutMs: 300_000 },
  { name: "meta:test:setup", cmd: "npm run meta:test:setup", timeoutMs: 300_000 },
  { name: "meta:test:meta-theory", cmd: "npm run meta:test:meta-theory", timeoutMs: 180_000 },
];

const args = process.argv.slice(2);
const jsonMode = args.includes("--json");
const noReport = args.includes("--no-report");
const reportIdx = args.findIndex((arg) => arg === "--report" || arg === "--json-out");
const reportPath =
  reportIdx >= 0 && args[reportIdx + 1] && !args[reportIdx + 1].startsWith("--")
    ? args[reportIdx + 1]
    : path.join(".meta-kim", "state", "default", "verification-report.json");

function writeReport(report) {
  if (noReport) return;
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

if (args.includes("--list")) {
  if (jsonMode) {
    console.log(JSON.stringify({ stages: STAGES }, null, 2));
  } else {
    STAGES.forEach((s, i) => console.log(`${i + 1}. ${s.name}  →  ${s.cmd}`));
  }
  process.exit(0);
}

const fromIdx = args.indexOf("--from");
let startIndex = 0;
if (fromIdx >= 0) {
  const target = args[fromIdx + 1];
  const idx = STAGES.findIndex((s) => s.name === target);
  if (idx < 0) {
    console.error(
      `未知阶段：${target}。可用：${STAGES.map((s) => s.name).join(", ")}`,
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
for (let i = startIndex; i < STAGES.length; i += 1) {
  const stage = STAGES[i];
  const label = `[${i + 1}/${STAGES.length}] ${stage.name}`;
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
    console.error(`  续跑：node scripts/run-verify-all.mjs --from ${stage.name}`);
    results.push({
      name: stage.name,
      cmd: stage.cmd,
      status: "failed",
      durationMs: ms,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      signal: result.signal,
      error: result.error,
      resumeCommand: `node scripts/run-verify-all.mjs --from ${stage.name}`,
    });
    failedStage = stage;
    break;
  }
}

const report = {
  ok: !failedStage,
  startedAt,
  completedAt: new Date().toISOString(),
  startStage: STAGES[startIndex]?.name ?? null,
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
console.log(
  `\n=== verify-all 全过（从第 ${startIndex + 1} 步起，共 ${STAGES.length - startIndex} 步）===`,
);
console.log(`报告：${reportPath}`);
