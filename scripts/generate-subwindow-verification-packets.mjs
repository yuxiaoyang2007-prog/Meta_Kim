#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(scriptDir, "..");
const PRD_PATH = path.join(REPO_ROOT, "docs", "ai-native-capability-gap-mvp-prd.zh-CN.md");
const OUTPUT_DIR = path.join(
  REPO_ROOT,
  ".meta-kim",
  "state",
  "default",
  "subwindow-verification-packets",
);

const COMMANDS_BY_TASK = {
  "P-026": [
    "node --test tests/setup/eval-meta-agents.test.mjs",
    "node --test tests/meta-theory/29-capability-gap-complete-product-prd.test.mjs",
  ],
  "P-027": [
    "$env:META_KIM_CURSOR_LIVE_SUCCESS_FIXTURE='1'; node scripts/eval-meta-agents.mjs --runtime=cursor --live; Remove-Item Env:META_KIM_CURSOR_LIVE_SUCCESS_FIXTURE -ErrorAction SilentlyContinue",
    "node --test tests/setup/eval-meta-agents.test.mjs",
  ],
  "P-028": [
    "npm run meta:github:gap",
    "node --test tests/meta-theory/35-release-closure-deliverables.test.mjs",
  ],
  "P-034": [
    "npm run meta:verification:subwindows",
    "node --test tests/meta-theory/35-release-closure-deliverables.test.mjs",
  ],
  "P-036": ["node --test tests/meta-theory/29-capability-gap-complete-product-prd.test.mjs"],
};

function parsePrdTasks(prd) {
  return prd
    .split(/\r?\n/)
    .filter((line) => /^\| P-\d{3} \|/.test(line))
    .map((line) => {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      return {
        id: cells[0],
        track: cells[1],
        task: cells[2],
        status: cells[3],
        owner: cells[4],
        parallel: cells[5],
        evidence: cells[6],
      };
    });
}

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath).replaceAll("\\", "/");
}

function buildPacket(task) {
  return {
    schemaVersion: "subwindow-verification-packet-v0.1",
    taskId: task.id,
    task: task.task,
    owner: task.owner,
    status: task.status,
    mode: "read_only_verification",
    mainWindowName: "主窗口",
    childWindowRole: "verification",
    allowedCommands: COMMANDS_BY_TASK[task.id] ?? [
      "git status --short --branch",
      "node --test tests/meta-theory/29-capability-gap-complete-product-prd.test.mjs",
    ],
    forbiddenActions: [
      "Do not edit files.",
      "Do not commit, push, merge, publish, or approve external writes.",
      "Do not mark P-024 complete unless Cursor native live returns a real pass.",
    ],
    expectedOutput: "Return PASS or FAIL, followed by the exact command evidence and any remaining gap.",
    mergePolicy:
      "The main window keeps PRD status and final synthesis authority; the child window only returns evidence.",
  };
}

function buildMarkdown(packets) {
  const lines = ["# Subwindow Verification Packets", ""];
  for (const packet of packets) {
    lines.push(`## ${packet.taskId}`, "", packet.task, "");
    lines.push(`- mode: ${packet.mode}`);
    lines.push(`- owner: ${packet.owner}`);
    lines.push(`- expectedOutput: ${packet.expectedOutput}`, "");
    lines.push("Allowed commands:");
    for (const command of packet.allowedCommands) {
      lines.push(`- \`${command}\``);
    }
    lines.push("");
    lines.push("Forbidden actions:");
    for (const action of packet.forbiddenActions) {
      lines.push(`- ${action}`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  let prd = "";
  let privateEvidence = {
    status: "attached",
    requiredForPublicValidation: true,
  };
  try {
    prd = await fs.readFile(PRD_PATH, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    privateEvidence = {
      status: "private_evidence_not_attached",
      requiredForPublicValidation: false,
      path: relativeToRepo(PRD_PATH),
    };
  }
  const tasks = prd
    ? parsePrdTasks(prd).filter((task) => /^P-0(?:26|27|28|34|36)$/.test(task.id))
    : Object.keys(COMMANDS_BY_TASK).map((taskId) => ({
        id: taskId,
        task: "Private PRD evidence is not attached; verify with the listed commands before claiming completion.",
        owner: "verification",
        status: "private_evidence_not_attached",
      }));
  const packets = tasks.map(buildPacket);
  const report = {
    schemaVersion: "subwindow-verification-packets-v0.1",
    generatedAt: new Date().toISOString(),
    source: relativeToRepo(PRD_PATH),
    privateEvidence,
    mainWindowName: "主窗口",
    packets,
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, "latest.json");
  const mdPath = path.join(OUTPUT_DIR, "latest.zh-CN.md");
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(mdPath, buildMarkdown(packets));

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: packets.length >= 5,
        packetCount: packets.length,
        report: relativeToRepo(jsonPath),
        markdown: relativeToRepo(mdPath),
        prdEvidenceStatus: privateEvidence.status,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
