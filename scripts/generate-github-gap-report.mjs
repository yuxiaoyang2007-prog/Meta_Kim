#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { getReportLabelsForPath } from "./meta-kim-i18n.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(scriptDir, "..");
const PRD_PATH = path.join(REPO_ROOT, "docs", "ai-native-capability-gap-mvp-prd.zh-CN.md");
const OUTPUT_DIR = path.join(REPO_ROOT, ".meta-kim", "state", "default", "github-gap-report");
const INCOMPLETE_PRIMARY_STATUS_RE = /阻塞|未开始|进行中|部分完成/;
const COMPATIBILITY_PENDING_STATUS_RE = /兼容待验证|低优先级兼容待验证/;
const COMPATIBILITY_TASK_RE = /^P-02[45]$/;

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

function buildMarkdown(report, outputPath) {
  const labels = getReportLabelsForPath(outputPath);
  const lines = [
    `# ${labels.githubGapReportTitle}`,
    "",
    `- ${labels.generatedAt}: ${report.generatedAt}`,
    `- ${labels.branch}: ${report.git.branch}`,
    `- ${labels.aheadOfOriginMain}: ${report.git.aheadOfOriginMain}`,
    `- ${labels.hasWorkingTreeDelta}: ${labels.boolean(report.git.hasWorkingTreeDelta)}`,
    `- ${labels.gitDeltaState}: ${report.git.deltaState}`,
    `- ${labels.prdVersion}: ${report.prd.version}`,
    "",
    `## ${labels.localCommitsNotOnOriginMain}`,
    "",
    ...report.git.localCommits.map((commit) => `- ${commit}`),
    "",
    `## ${labels.workingTreeDelta}`,
    "",
    ...report.git.workingTreeEntries.map((entry) => `- ${entry}`),
    "",
    `## ${labels.currentGithubDeltaFromPrd}`,
    "",
    report.prd.currentGithubDelta || labels.missing,
    "",
    `## ${labels.blockedOrNotDone}`,
    "",
    ...report.tasks.blockedOrNotDone.map(
      (task) => `- ${task.id} [${task.status}] ${task.task}`,
    ),
    "",
    `## ${labels.compatibilityFollowUp}`,
    "",
    ...report.tasks.compatibilityFollowUp.map(
      (task) => `- ${task.id} [${task.status}] ${task.task}`,
    ),
    "",
    `## ${labels.releaseBoundary}`,
    "",
    `- ${labels.cannotClaimGithubComplete}: ${labels.boolean(
      report.releaseBoundary.cannotClaimGithubComplete,
    )}`,
    `- ${labels.cannotClaimAllToolCompatibility}: ${labels.boolean(
      report.releaseBoundary.cannotClaimAllToolCompatibility,
    )}`,
    `- ${labels.reason}: ${report.releaseBoundary.reason}`,
    "",
    `## ${labels.completedParallelBacklogEvidence}`,
    "",
    ...report.tasks.completedParallelBacklog.map(
      (task) => `- ${task.id} [${task.status}] ${task.task}`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  let prd = "";
  let prdEvidence = {
    status: "attached",
    requiredForPublicValidation: true,
  };
  try {
    prd = await fs.readFile(PRD_PATH, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    prdEvidence = {
      status: "private_evidence_not_attached",
      requiredForPublicValidation: false,
      path: relativeToRepo(PRD_PATH),
    };
  }
  const branch = runGit(["branch", "--show-current"]).stdout || "unknown";
  const aheadRaw = runGit(["rev-list", "--count", "origin/main..HEAD"]);
  const commitsRaw = runGit(["log", "--oneline", "--no-decorate", "origin/main..HEAD"]);
  const statusRaw = runGit(["status", "--short", "--branch"]);
  const workingTreeEntries = statusRaw.stdout
    ? statusRaw.stdout
        .split(/\r?\n/)
        .filter((line) => line.trim() && !line.startsWith("##"))
    : [];
  const aheadOfOriginMain = aheadRaw.ok ? Number(aheadRaw.stdout || 0) : null;
  const hasWorkingTreeDelta = workingTreeEntries.length > 0;
  const deltaState =
    aheadOfOriginMain > 0 && hasWorkingTreeDelta
      ? "ahead_and_dirty"
      : aheadOfOriginMain > 0
        ? "ahead"
        : hasWorkingTreeDelta
          ? "dirty"
          : "clean_synced";
  const tasks = prd ? parsePrdTasks(prd) : [];
  const primaryReleaseBlockingTasks = tasks.filter(
    (task) => INCOMPLETE_PRIMARY_STATUS_RE.test(task.status) && !COMPATIBILITY_TASK_RE.test(task.id),
  );
  const compatibilityFollowUp = tasks.filter(
    (task) =>
      COMPATIBILITY_PENDING_STATUS_RE.test(task.status) ||
      (COMPATIBILITY_TASK_RE.test(task.id) && /native_harness_missing|cursor-agent/.test(task.evidence)),
  );
  const gitDeltaBlocksGithubComplete =
    Number.isFinite(aheadOfOriginMain) && aheadOfOriginMain > 0
      ? true
      : hasWorkingTreeDelta;
  const privateEvidenceMissing = prdEvidence.status === "private_evidence_not_attached";
  const cannotClaimGithubComplete =
    privateEvidenceMissing || gitDeltaBlocksGithubComplete || primaryReleaseBlockingTasks.length > 0;
  const cannotClaimAllToolCompatibility =
    privateEvidenceMissing || compatibilityFollowUp.some((task) => task.id === "P-024");
  const report = {
    schemaVersion: "github-gap-report-v0.1",
    generatedAt: new Date().toISOString(),
    git: {
      branch,
      aheadOfOriginMain,
      aheadEvidenceCommand: "git rev-list --count origin/main..HEAD",
      status: statusRaw.stdout,
      hasWorkingTreeDelta,
      deltaState,
      workingTreeEntries,
      workingTreeEvidenceCommand: "git status --short --branch",
      localCommits: commitsRaw.stdout ? commitsRaw.stdout.split(/\r?\n/) : [],
      localCommitsCommand: "git log --oneline --no-decorate origin/main..HEAD",
    },
    prd: {
      path: relativeToRepo(PRD_PATH),
      evidenceStatus: prdEvidence.status,
      privateEvidence: prdEvidence,
      version: prd ? parseVersion(prd) : "private_evidence_not_attached",
      currentGithubDelta: prd
        ? extractSection(prd, "当前 GitHub 差距：", "状态口径：")
        : "Private product PRD is not attached; public validation keeps the boundary explicit.",
      productSettingsSource: "docs/ai-native-capability-gap-mvp-prd.zh-CN.md",
      singleSourceOfTruth: prd ? /单一产品源/.test(prd) : null,
    },
    tasks: {
      total: tasks.length,
      blockedOrNotDone: primaryReleaseBlockingTasks,
      compatibilityFollowUp,
      completedParallelBacklog: tasks.filter((task) =>
        /^P-0(?:26|27|28|34|36)$/.test(task.id) && /已测通/.test(task.status),
      ),
    },
    releaseBoundary: {
      cannotClaimGithubComplete,
      cannotClaimAllToolCompatibility,
      githubDeltaBlocksGithubComplete: gitDeltaBlocksGithubComplete,
      primaryReleaseBlockingTaskIds: primaryReleaseBlockingTasks.map((task) => task.id),
      compatibilityFollowUpTaskIds: compatibilityFollowUp.map((task) => task.id),
      cursorIsPrimaryReleaseBlocker: false,
      reason: privateEvidenceMissing
        ? "Private product PRD is not attached; public validation can generate the report but cannot claim GitHub or all-tool completion from private evidence."
        : cannotClaimGithubComplete
        ? "GitHub completion still depends on clean sync and zero primary release gaps; Cursor compatibility follow-up is tracked separately."
        : "Cursor compatibility is outside primary GitHub completion; all-tool compatibility remains a separate follow-up.",
    },
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, "latest.json");
  const mdPath = path.join(OUTPUT_DIR, "latest.zh-CN.md");
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(mdPath, buildMarkdown(report, mdPath));

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        report: relativeToRepo(jsonPath),
        markdown: relativeToRepo(mdPath),
        aheadOfOriginMain: report.git.aheadOfOriginMain,
        hasWorkingTreeDelta: report.git.hasWorkingTreeDelta,
        cannotClaimGithubComplete: report.releaseBoundary.cannotClaimGithubComplete,
        cannotClaimAllToolCompatibility: report.releaseBoundary.cannotClaimAllToolCompatibility,
        prdEvidenceStatus: report.prd.evidenceStatus,
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
