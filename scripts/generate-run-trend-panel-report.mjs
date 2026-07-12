#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { openRunStateStore } from "./capability-gap-mvp.mjs";
import { createReportContext } from "./report-context.mjs";

const reportContext = createReportContext();
const REPO_ROOT = reportContext.repoRoot;
const DEFAULT_DB_PATH = reportContext.resolveStatePath("governed-execution.sqlite");
const OUTPUT_DIR = reportContext.resolveStatePath("run-trend-panel");

const relativeToRepo = reportContext.relativeToRepo;

function hasLocalAbsolutePath(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /[A-Za-z]:[\\/]/.test(text) || /\/(?:Users|home|var|tmp|mnt)\//.test(text);
}

async function readJsonIfExists(filePath, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function loadGeneratedReport(name) {
  const reportPath = reportContext.resolveStatePath(name, "latest.json");
  const report = await readJsonIfExists(reportPath, null);
  return report ? { path: relativeToRepo(reportPath), report } : null;
}

async function buildTrendReport() {
  const store = await openRunStateStore(DEFAULT_DB_PATH);
  const analytics = store.analytics();
  store.close();

  const feedback = await loadGeneratedReport("feedback-loop");
  const reviewerReplay = await loadGeneratedReport("product-reviewer-replay");
  const runtimeMatrix = await loadGeneratedReport("runtime-live-shard-matrix");
  const githubGap = await loadGeneratedReport("github-gap-report");

  const reviewerScoreTrend = Object.entries(
    reviewerReplay?.report?.summary?.dimensionAverages ?? {},
  ).map(([dimension, average]) => ({
    dimension,
    average,
    source: reviewerReplay.path,
  }));
  const blockedReasonTrend = [
    ...(analytics.blockedReasons ?? []).map((row) => ({
      reason: row.reason ?? row.blockedReason ?? "unknown",
      count: row.count ?? 1,
      source: "RunStateStore.analytics.blockedReasons",
    })),
    ...(runtimeMatrix?.report?.records ?? [])
      .filter((row) => row.releaseGradeCandidate === false)
      .map((row) => ({
        reason: row.expectedFailureClass,
        count: 1,
        runtime: row.runtime,
        source: runtimeMatrix.path,
      })),
  ];
  const ownerFailureTrend = analytics.ownerFailureRate ?? [];
  const decisionTrend = analytics.decisionDistribution ?? [];
  const feedbackTrend = feedback?.report
    ? {
        changedDecisionCount: feedback.report.summary.changedDecisionCount,
        repeatGapCount: feedback.report.summary.repeatGapCount,
        reviewerConfusionReduced: feedback.report.summary.reviewerConfusionReduced,
        source: feedback.path,
      }
    : null;
  const githubDelta = githubGap
    ? {
        cannotClaimGithubComplete:
          githubGap.report?.releaseBoundary?.cannotClaimGithubComplete ?? false,
        cannotClaimAllToolCompatibility:
          githubGap.report?.releaseBoundary?.cannotClaimAllToolCompatibility ?? false,
        compatibilityFollowUpTaskIds:
          githubGap.report?.releaseBoundary?.compatibilityFollowUpTaskIds ?? [],
        cursorIsPrimaryReleaseBlocker:
          githubGap.report?.releaseBoundary?.cursorIsPrimaryReleaseBlocker ?? false,
        source: githubGap.path,
      }
    : null;

  const filters = [
    {
      id: "runId",
      label: "Run ID",
      field: "runId",
      source: "governed-executions/latest.json",
    },
    {
      id: "timeRange",
      label: "Time range",
      field: "generatedAt",
      source: "generated reports",
    },
    {
      id: "decision",
      label: "Gap decision",
      field: "gapDecision.decision",
      source: "RunStateStore.analytics.decisionDistribution",
    },
    {
      id: "owner",
      label: "Owner",
      field: "owner",
      source: "RunStateStore.analytics.ownerFailureRate",
    },
    {
      id: "reviewerDimension",
      label: "Reviewer dimension",
      field: "reviewerScoreTrend.dimension",
      source: reviewerReplay?.path ?? "product reviewer replay",
    },
  ];
  const endpoints = [
    { method: "GET", path: "/runs", description: "List run ids and generated report timestamps." },
    { method: "GET", path: "/trends/decisions", description: "Decision distribution over the selected runs." },
    { method: "GET", path: "/trends/blocked", description: "Blocked reasons and runtime failure classes." },
    { method: "GET", path: "/trends/owners", description: "Owner failure-rate table." },
    { method: "GET", path: "/trends/reviewer-scores", description: "AI-readable reviewer score trend." },
  ];
  const panels = [
    {
      id: "decision-distribution",
      title: "Decision Distribution",
      dataSource: "decisionTrend",
      rowCount: decisionTrend.length,
      reviewerUse: "Check whether the route keeps distinguishing skill, agent, script, MCP provider, worker task, and blocked decisions.",
    },
    {
      id: "blocked-reasons",
      title: "Blocked Reasons",
      dataSource: "blockedReasonTrend",
      rowCount: blockedReasonTrend.length,
      reviewerUse: "Keep compatibility follow-up evidence and approval blockers visible without promoting smoke evidence to live proof.",
    },
    {
      id: "owner-failure-rate",
      title: "Owner Failure Rate",
      dataSource: "ownerFailureTrend",
      rowCount: ownerFailureTrend.length,
      reviewerUse: "Find owners whose outputs need retry, return to stage, or clearer boundaries.",
    },
    {
      id: "reviewer-score-trend",
      title: "Reviewer Score Trend",
      dataSource: "reviewerScoreTrend",
      rowCount: reviewerScoreTrend.length,
      reviewerUse: "Show whether external reviewers can understand design, execution, acceptance, feedback, and deliverables.",
    },
  ];
  const privacyLeaks = [filters, endpoints, panels, decisionTrend, blockedReasonTrend, ownerFailureTrend, reviewerScoreTrend]
    .filter(hasLocalAbsolutePath);
  const status =
    filters.length >= 5 &&
    endpoints.length >= 5 &&
    panels.length >= 4 &&
    reviewerScoreTrend.length >= 5 &&
    blockedReasonTrend.length >= 1 &&
    privacyLeaks.length === 0
      ? "pass"
      : "fail";

  return {
    schemaVersion: "run-trend-panel-v0.1",
    generatedAt: new Date().toISOString(),
    status,
    summary: {
      filterCount: filters.length,
      endpointCount: endpoints.length,
      panelCount: panels.length,
      decisionTrendRows: decisionTrend.length,
      blockedReasonRows: blockedReasonTrend.length,
      ownerFailureRows: ownerFailureTrend.length,
      reviewerScoreRows: reviewerScoreTrend.length,
      privacyStatus: privacyLeaks.length === 0 ? "pass" : "fail",
      githubCompleteClaimed: false,
    },
    filters,
    endpoints,
    panels,
    trends: {
      decisionTrend,
      blockedReasonTrend,
      ownerFailureTrend,
      reviewerScoreTrend,
      feedbackTrend,
      githubDelta,
    },
    privacyCheck: {
      status: privacyLeaks.length === 0 ? "pass" : "fail",
      leaks: privacyLeaks.map((item) => String(item).slice(0, 80)),
    },
  };
}

function buildHtml(report) {
  const panelItems = report.panels
    .map(
      (panel) => `<section>
  <h2>${panel.title}</h2>
  <p>${panel.reviewerUse}</p>
  <strong>${panel.rowCount}</strong>
</section>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>Meta_Kim Run Trend Panel</title>
  <style>
    body { margin: 0; font: 15px/1.5 system-ui, sans-serif; color: #1d252c; background: #f6f8f7; }
    header, main { padding: 24px; }
    header { background: #fff; border-bottom: 1px solid #d6dde2; }
    main { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    section { background: #fff; border: 1px solid #d6dde2; border-radius: 8px; padding: 16px; }
    h1, h2 { margin: 0 0 8px; letter-spacing: 0; }
    h1 { font-size: 28px; }
    h2 { font-size: 18px; }
    p { color: #5a6772; margin: 0 0 12px; }
    strong { font-size: 24px; color: #116466; }
  </style>
</head>
<body>
  <header>
    <h1>Meta_Kim Run Trend Panel</h1>
    <p>Filters: ${report.filters.map((filter) => filter.id).join(", ")}</p>
  </header>
  <main>${panelItems}</main>
</body>
</html>
`;
}

function buildMarkdown(report) {
  const lines = [
    "# Run Trend Panel",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- status: ${report.status}`,
    `- filters: ${report.summary.filterCount}`,
    `- panels: ${report.summary.panelCount}`,
    `- privacyStatus: ${report.summary.privacyStatus}`,
    "",
    "## Filters",
    "",
    "| Filter | Field | Source |",
    "|---|---|---|",
    ...report.filters.map((filter) => `| ${filter.id} | ${filter.field} | ${filter.source} |`),
    "",
    "## Panels",
    "",
    "| Panel | Data | Rows | Reviewer use |",
    "|---|---|---:|---|",
    ...report.panels.map((panel) => `| ${panel.id} | ${panel.dataSource} | ${panel.rowCount} | ${panel.reviewerUse} |`),
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const report = await buildTrendReport();
  await reportContext.ensureDirectory(OUTPUT_DIR);
  const jsonPath = path.join(OUTPUT_DIR, "latest.json");
  const mdPath = path.join(OUTPUT_DIR, "latest.zh-CN.md");
  const htmlPath = path.join(OUTPUT_DIR, "trend-panel.html");
  await reportContext.writeJson(jsonPath, report);
  await reportContext.writeText(mdPath, buildMarkdown(report));
  await reportContext.writeText(htmlPath, buildHtml(report));

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: report.status === "pass",
        report: relativeToRepo(jsonPath),
        markdown: relativeToRepo(mdPath),
        html: relativeToRepo(htmlPath),
        filterCount: report.summary.filterCount,
        panelCount: report.summary.panelCount,
        reviewerScoreRows: report.summary.reviewerScoreRows,
        privacyStatus: report.summary.privacyStatus,
      },
      null,
      2,
    )}\n`,
  );
  if (report.status !== "pass") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});
