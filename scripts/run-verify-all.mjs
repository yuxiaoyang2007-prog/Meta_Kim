#!/usr/bin/env node
// Meta_Kim verify-all 编排器
//
// 把 package.json 里 `meta:verify:all` 的 26 命令 `&&` 链，换成有名字、可续跑的流水线。
// 每步打印名字、耗时；挂了告诉你哪步挂、怎么续跑。
//
// 用法：
//   node scripts/run-verify-all.mjs              # 跑全部
//   node scripts/run-verify-all.mjs --list       # 列阶段
//   node scripts/run-verify-all.mjs --from meta:check   # 从某步续跑
//
// 不替换 meta:verify:all（有 test 断言它的命令链字面量）。
// 通过 npm run meta:verify:stages 调用本编排器。

import { execSync } from "node:child_process";

const STAGES = [
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

if (args.includes("--list")) {
  STAGES.forEach((s, i) => console.log(`${i + 1}. ${s.name}  →  ${s.cmd}`));
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

function runWithTimeout(cmd, timeoutMs) {
  // execSync 自带 timeout 选项；超时返回 status null + signal SIGTERM
  try {
    execSync(cmd, { stdio: "inherit", cwd: process.cwd(), timeout: timeoutMs });
    return { ok: true, timedOut: false };
  } catch (err) {
    const timedOut = err.signal === "SIGTERM" || err.status === null;
    return { ok: false, timedOut, exitCode: err.status };
  }
}

let failedStage = null;
for (let i = startIndex; i < STAGES.length; i += 1) {
  const stage = STAGES[i];
  const label = `[${i + 1}/${STAGES.length}] ${stage.name}`;
  const t0 = Date.now();
  console.log(`\n=== ${label} ===\n> ${stage.cmd}`);
  const result = runWithTimeout(stage.cmd, stage.timeoutMs);
  const ms = Date.now() - t0;
  if (result.ok) {
    console.log(`\n✓ ${label} 通过 (${ms}ms)`);
  } else {
    const reason = result.timedOut ? `超时 (>${stage.timeoutMs}ms)` : `exit ${result.exitCode ?? "?"}`;
    console.error(`\n✗ ${label} 失败 (${ms}ms, ${reason})`);
    console.error(`  续跑：node scripts/run-verify-all.mjs --from ${stage.name}`);
    failedStage = stage;
    break;
  }
}

if (failedStage) {
  console.error(`\n=== verify-all 停在 ${failedStage.name} ===`);
  process.exit(1);
}
console.log(
  `\n=== verify-all 全过（从第 ${startIndex + 1} 步起，共 ${STAGES.length - startIndex} 步）===`,
);
