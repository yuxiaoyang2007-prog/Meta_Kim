#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(scriptDir, "..");
const PRD_PATH = path.join(REPO_ROOT, "docs", "ai-native-capability-gap-mvp-prd.zh-CN.md");
const OUTPUT_DIR = path.join(REPO_ROOT, ".meta-kim", "state", "default", "github-gap-report");

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    return {
      ok: false,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      status: result.status,
    };
  }
  return {
    ok: true,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    status: result.status,
  };
}

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

function extractSection(prd, startMarker, endMarker) {
  const start = prd.indexOf(startMarker);
  if (start === -1) return "";
  const afterStart = start + startMarker.length;
  const end = prd.indexOf(endMarker, afterStart);
  return prd.slice(afterStart, end === -1 ? undefined : end).trim();
}

function parseVersion(prd) {
  return /^- 版本：(.+)$/m.exec(prd)?.[1]?.trim() ?? "unknown";
}

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath).replaceAll("\\", "/");
}

function buildMarkdown(report) {
  const lines = [
    "# Meta_Kim GitHub Gap Report",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- branch: ${report.git.branch}`,
    `- aheadOfOriginMain: ${report.git.aheadOfOriginMain}`,
    `- hasWorkingTreeDelta: ${report.git.hasWorkingTreeDelta}`,
    `- prdVersion: ${report.prd.version}`,
    "",
    "## Local Commits Not On origin/main",
    "",
    ...report.git.localCommits.map((commit) => `- ${commit}`),
    "",
    "## Working Tree Delta",
    "",
    ...report.git.workingTreeEntries.map((entry) => `- ${entry}`),
    "",
    "## Current GitHub Delta From PRD",
    "",
    report.prd.currentGithubDelta || "(missing)",
    "",
    "## Blocked Or Not Done",
    "",
    ...report.tasks.blockedOrNotDone.map(
      (task) => `- ${task.id} [${task.status}] ${task.task}`,
    ),
    "",
    "## Completed Parallel Backlog Evidence",
    "",
    ...report.tasks.completedParallelBacklog.map(
      (task) => `- ${task.id} [${task.status}] ${task.task}`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const prd = await fs.readFile(PRD_PATH, "utf8");
  const branch = runGit(["branch", "--show-current"]).stdout || "unknown";
  const aheadRaw = runGit(["rev-list", "--count", "origin/main..HEAD"]);
  const commitsRaw = runGit(["log", "--oneline", "--no-decorate", "origin/main..HEAD"]);
  const statusRaw = runGit(["status", "--short", "--branch"]);
  const workingTreeEntries = statusRaw.stdout
    ? statusRaw.stdout
        .split(/\r?\n/)
        .filter((line) => line.trim() && !line.startsWith("##"))
    : [];
  const tasks = parsePrdTasks(prd);
  const report = {
    schemaVersion: "github-gap-report-v0.1",
    generatedAt: new Date().toISOString(),
    git: {
      branch,
      aheadOfOriginMain: aheadRaw.ok ? Number(aheadRaw.stdout || 0) : null,
      aheadEvidenceCommand: "git rev-list --count origin/main..HEAD",
      status: statusRaw.stdout,
      hasWorkingTreeDelta: workingTreeEntries.length > 0,
      workingTreeEntries,
      workingTreeEvidenceCommand: "git status --short --branch",
      localCommits: commitsRaw.stdout ? commitsRaw.stdout.split(/\r?\n/) : [],
      localCommitsCommand: "git log --oneline --no-decorate origin/main..HEAD",
    },
    prd: {
      path: relativeToRepo(PRD_PATH),
      version: parseVersion(prd),
      currentGithubDelta: extractSection(prd, "当前 GitHub 差距：", "状态口径："),
      productSettingsSource: "docs/ai-native-capability-gap-mvp-prd.zh-CN.md",
      singleSourceOfTruth: /单一产品源/.test(prd),
    },
    tasks: {
      total: tasks.length,
      blockedOrNotDone: tasks.filter((task) =>
        /阻塞|未开始|进行中|部分完成/.test(task.status),
      ),
      completedParallelBacklog: tasks.filter((task) =>
        /^P-0(?:26|27|28|34|36)$/.test(task.id) && /已测通/.test(task.status),
      ),
    },
    releaseBoundary: {
      cannotClaimGithubComplete: tasks.some(
        (task) => task.id === "P-024" && /阻塞/.test(task.status),
      ),
      reason: "P-024 Cursor native live pass remains blocked until a parseable native Cursor Agent CLI is available.",
    },
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, "latest.json");
  const mdPath = path.join(OUTPUT_DIR, "latest.zh-CN.md");
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(mdPath, buildMarkdown(report));

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        report: relativeToRepo(jsonPath),
        markdown: relativeToRepo(mdPath),
        aheadOfOriginMain: report.git.aheadOfOriginMain,
        hasWorkingTreeDelta: report.git.hasWorkingTreeDelta,
        cannotClaimGithubComplete: report.releaseBoundary.cannotClaimGithubComplete,
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
