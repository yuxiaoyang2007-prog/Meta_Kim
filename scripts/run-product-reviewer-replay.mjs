#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(scriptDir, "..");
const SCENARIO_PATH = path.join(
  REPO_ROOT,
  "tests",
  "meta-theory",
  "scenarios",
  "product-reviewer-samples.json",
);
const OUTPUT_DIR = path.join(REPO_ROOT, ".meta-kim", "state", "default", "product-reviewer-replay");

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath).replaceAll("\\", "/");
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function labelForDimension(dimension) {
  return {
    design: "设计",
    execution: "执行",
    acceptance: "验收",
    feedback: "反馈",
    deliverables: "交付内容",
  }[dimension] ?? dimension;
}

function recommendationForConfusion(confusion) {
  if (/fixture|native live/i.test(confusion)) {
    return "在报告和面板中固定区分 fixture pass、projection smoke、native live pass。";
  }
  if (/commands|PASS/i.test(confusion)) {
    return "把每个 PASS 结论旁边的 replay command 和 artifact path 保持同屏可见。";
  }
  if (/blocked runtime|release-grade/i.test(confusion)) {
    return "runtime evidence 表必须显示 releaseGradeCandidate 和 remainingAction。";
  }
  if (/GitHub complete/i.test(confusion)) {
    return "GitHub 差距报告分开保留 cannotClaimGithubComplete 与 cannotClaimAllToolCompatibility。";
  }
  if (/Warden approval/i.test(confusion)) {
    return "AI 可读案例包增加 Warden approval 是安全边界而非流程仪式的教学说明。";
  }
  return "把内部字段翻译成一句人话标签，并给出通过/失败样例。";
}

function buildMarkdown(report) {
  const lines = [
    "# Product Reviewer Replay",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- status: ${report.status}`,
    `- reviewerSamples: ${report.summary.sampleCount}`,
    `- averageScore: ${report.summary.averageScore.toFixed(2)}`,
    "",
    "## Dimension Scores",
    "",
    "| Dimension | Average |",
    "|---|---|",
    ...Object.entries(report.summary.dimensionAverages).map(
      ([dimension, score]) => `| ${labelForDimension(dimension)} | ${score.toFixed(2)} |`,
    ),
    "",
    "## Misunderstandings And Fixes",
    "",
    ...report.results.flatMap((item) => [
      `### ${item.id}`,
      "",
      `Persona: ${item.persona}`,
      "",
      ...item.misunderstandingReview.map(
        (review) => `- ${review.confusion} -> ${review.recommendation}`,
      ),
      "",
    ]),
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const scenario = JSON.parse(await fs.readFile(SCENARIO_PATH, "utf8"));
  const results = scenario.samples.map((sample) => {
    const scoreValues = Object.values(sample.scores);
    return {
      id: sample.id,
      persona: sample.persona,
      scores: sample.scores,
      averageScore: average(scoreValues),
      misunderstandingReview: sample.confusions.map((confusion) => ({
        confusion,
        recommendation: recommendationForConfusion(confusion),
      })),
    };
  });
  const dimensionAverages = Object.fromEntries(
    scenario.rubricDimensions.map((dimension) => [
      dimension,
      average(results.map((item) => item.scores[dimension]).filter((value) => value != null)),
    ]),
  );
  const allRecommendations = results.flatMap((item) => item.misunderstandingReview);
  const report = {
    schemaVersion: "product-reviewer-replay-v0.1",
    generatedAt: new Date().toISOString(),
    scenario: relativeToRepo(SCENARIO_PATH),
    status:
      results.length >= 3 &&
      Object.values(dimensionAverages).every((score) => score >= 3) &&
      allRecommendations.length >= 6
        ? "pass"
        : "fail",
    summary: {
      sampleCount: results.length,
      averageScore: average(results.map((item) => item.averageScore)),
      dimensionAverages,
      recommendationCount: allRecommendations.length,
      requiredDimensions: scenario.rubricDimensions,
    },
    results,
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, "latest.json");
  const mdPath = path.join(OUTPUT_DIR, "latest.zh-CN.md");
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(mdPath, buildMarkdown(report));

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: report.status === "pass",
        report: relativeToRepo(jsonPath),
        markdown: relativeToRepo(mdPath),
        sampleCount: report.summary.sampleCount,
        recommendationCount: report.summary.recommendationCount,
      },
      null,
      2,
    )}\n`,
  );
  if (report.status !== "pass") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
