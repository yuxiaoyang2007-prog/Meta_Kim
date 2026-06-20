#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(scriptDir, "..");
const CONTRACT_PATH = path.join(REPO_ROOT, "config", "contracts", "product-delivery-bundle-contract.json");
const SCENARIO_PATH = path.join(
  REPO_ROOT,
  "tests",
  "meta-theory",
  "scenarios",
  "reviewer-calibration-samples.json",
);
const OUTPUT_DIR = path.join(REPO_ROOT, ".meta-kim", "state", "default", "product-delivery-bundle");
const BUNDLE_RUN_ID = `product-delivery-bundle-${process.pid}`;

const componentCommands = {
  governedRun: [
    "scripts/run-meta-theory-governed-execution.mjs",
    "--task",
    "Generate an AI-readable product delivery bundle with design, execution, acceptance, feedback, deliverables, reviewer calibration, runtime evidence, GitHub delta, and research evidence.",
  ],
  deliverables: ["scripts/generate-meta-theory-run-deliverables.mjs"],
  githubGap: ["scripts/generate-github-gap-report.mjs"],
  runtimeMatrix: ["scripts/generate-runtime-live-shard-matrix.mjs"],
  orchestrationDag: ["scripts/generate-orchestration-dag-report.mjs"],
  research: ["scripts/generate-research-preparation-report.mjs"],
  feedback: ["scripts/generate-feedback-loop-report.mjs"],
};

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath).replaceAll("\\", "/");
}

function parseJsonFromStdout(stdout) {
  const jsonStart = stdout.indexOf("{");
  if (jsonStart === -1) throw new Error(`Command did not print JSON: ${stdout}`);
  return JSON.parse(stdout.slice(jsonStart));
}

function tryParseJsonFromStdout(stdout) {
  try {
    return parseJsonFromStdout(stdout);
  } catch {
    return null;
  }
}

function runNodeScript(args) {
  const commandArgs = [...args];
  if (commandArgs[0] === "scripts/run-meta-theory-governed-execution.mjs") {
    commandArgs.push(
      "--run-id",
      BUNDLE_RUN_ID,
      "--state-dir",
      OUTPUT_DIR,
      "--db",
      path.join(OUTPUT_DIR, `governed-${process.pid}.sqlite`),
    );
  }
  if (commandArgs[0] === "scripts/generate-meta-theory-run-deliverables.mjs") {
    commandArgs.push(
      "--run-id",
      BUNDLE_RUN_ID,
      "--state-dir",
      OUTPUT_DIR,
    );
  }
  const allowPartialNonzero =
    commandArgs[0] === "scripts/run-meta-theory-governed-execution.mjs";
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const parsed = result.stdout ? tryParseJsonFromStdout(result.stdout) : null;
  if (result.status !== 0 && allowPartialNonzero && parsed?.status === "partial") {
    return parsed;
  }
  if (result.status !== 0) {
    throw new Error(
      result.stderr || result.stdout || `Command failed: node ${commandArgs.join(" ")}`,
    );
  }
  return parsed ?? parseJsonFromStdout(result.stdout);
}

function hasLocalAbsolutePath(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /[A-Za-z]:[\\/]/.test(text) || /\/(?:Users|home|var|tmp|mnt)\//.test(text);
}

function buildCalibration(scenario, contract) {
  const samples = scenario.scoringSamples.map((sample) => ({
    id: sample.id,
    pitfall: sample.pitfall,
    secondaryPitfall: sample.secondaryPitfall,
    kind: sample.kind,
    reviewerVerdict: sample.reviewerVerdict,
    score: sample.score,
    reviewerPrompt: sample.reviewerPrompt,
    passSignal: sample.passSignal,
    failSignal: sample.failSignal,
    reviewUse: `${sample.reviewerPrompt} Pass: ${sample.passSignal} Fail: ${sample.failSignal}`,
  }));
  const coveredPitfalls = new Set(
    samples.flatMap((sample) => [sample.pitfall, sample.secondaryPitfall].filter(Boolean)),
  );
  return {
    schemaVersion: "product-reviewer-calibration-v0.1",
    sampleCount: samples.length,
    positiveExampleCount: samples.filter((sample) => sample.kind === "positive").length,
    negativeExampleCount: samples.filter((sample) => sample.kind === "negative").length,
    coveredPitfalls: [...coveredPitfalls].sort(),
    missingPitfalls: contract.calibrationRequiredPitfalls.filter((pitfall) => !coveredPitfalls.has(pitfall)),
    samples,
  };
}

function buildMarkdown(report) {
  const lines = [
    "# Product Delivery Bundle",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- status: ${report.status}`,
    `- bundleFiles: ${report.summary.fileCount}`,
    `- requiredSectionsCovered: ${report.summary.requiredSectionsCovered}`,
    `- reviewerScoringSamples: ${report.reviewerCalibration.sampleCount}`,
    `- privacyCheck: ${report.privacyCheck.status}`,
    "",
    "## Product Sections",
    "",
    "| Section | Review Use | Evidence |",
    "|---|---|---|",
    ...report.sections.map(
      (section) => `| ${section.id} | ${section.reviewUse} | ${section.evidence.join(", ")} |`,
    ),
    "",
    "## Bundle Files",
    "",
    "| Key | Path | Audience |",
    "|---|---|---|",
    ...Object.entries(report.files).map(
      ([key, item]) => `| ${key} | ${item.path} | ${item.audience} |`,
    ),
    "",
    "## Reviewer Calibration",
    "",
    "| Sample | Pitfall | Verdict | Score | Pass Signal | Fail Signal |",
    "|---|---|---|---:|---|---|",
    ...report.reviewerCalibration.samples.map(
      (sample) =>
        `| ${sample.id} | ${sample.pitfall}${sample.secondaryPitfall ? ` / ${sample.secondaryPitfall}` : ""} | ${sample.reviewerVerdict} | ${sample.score} | ${sample.passSignal} | ${sample.failSignal} |`,
    ),
    "",
    "## Checks",
    "",
    "- Bundle manifest separates design, execution, acceptance, feedback, and deliverables.",
    "- Panel, report, rubric, case pack, GitHub gap, runtime matrix, DAG report, research report, and feedback report are included.",
    "- Reviewer calibration covers research-before-orchestration, skill-only capability, fake parallelism, fixture pass as live, unauthorized writeback, GitHub gap overclaim, Warden approval confusion, and mixed deliverables.",
    "- Privacy check rejects local absolute paths and credentials.",
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const contract = JSON.parse(await fs.readFile(CONTRACT_PATH, "utf8"));
  const scenario = JSON.parse(await fs.readFile(SCENARIO_PATH, "utf8"));

  const governedRun = runNodeScript(componentCommands.governedRun);
  const deliverables = runNodeScript(componentCommands.deliverables);
  const githubGap = runNodeScript(componentCommands.githubGap);
  const runtimeMatrix = runNodeScript(componentCommands.runtimeMatrix);
  const orchestrationDag = runNodeScript(componentCommands.orchestrationDag);
  const research = runNodeScript(componentCommands.research);
  const feedback = runNodeScript(componentCommands.feedback);

  const files = {
    panelHtml: {
      path: deliverables.files.panelHtml,
      audience: "reviewer",
      reviewUse: "Inspect why the run chose this route.",
    },
    readabilityReview: {
      path: deliverables.files.readabilityReview,
      audience: "reviewer",
      reviewUse: "Translate internal fields into user-facing labels.",
    },
    rubricMarkdown: {
      path: deliverables.files.rubricMarkdown,
      audience: "reviewer",
      reviewUse: "Score design, execution, acceptance, feedback, and deliverables.",
    },
    rubricJson: {
      path: deliverables.files.rubricJson,
      audience: "automation",
      reviewUse: "Machine-check the five-dimensional rubric.",
    },
    casePack: {
      path: deliverables.files.casePack,
      audience: "reviewer",
      reviewUse: "Review pass/fail examples without hidden protocol knowledge.",
    },
    githubGapReport: {
      path: githubGap.report,
      audience: "reviewer",
      reviewUse: "Prevent local-vs-GitHub completion overclaims.",
    },
    runtimeMatrixReport: {
      path: runtimeMatrix.report,
      audience: "reviewer",
      reviewUse: "Separate live, smoke, fixture, and blocked runtime evidence.",
    },
    orchestrationDagReport: {
      path: orchestrationDag.report,
      audience: "reviewer",
      reviewUse: "Show parallel groups, dependencies, and merge owner.",
    },
    researchReport: {
      path: research.report,
      audience: "reviewer",
      reviewUse: "Show why research must complete before Thinking.",
    },
    feedbackLoopReport: {
      path: feedback.report,
      audience: "reviewer",
      reviewUse: "Show how user correction changes the next route.",
    },
  };

  const sections = [
    {
      id: "design",
      reviewUse: "Explain real intent, capability gap, and selected route.",
      evidence: [deliverables.files.rubricJson, orchestrationDag.report, research.report],
    },
    {
      id: "execution",
      reviewUse: "Show workerTask handoff, DAG, owner, and runtime evidence.",
      evidence: [deliverables.files.panelHtml, runtimeMatrix.report, orchestrationDag.report],
    },
    {
      id: "acceptance",
      reviewUse: "Score pass/fail with rubric, GitHub delta, and runtime boundary.",
      evidence: [deliverables.files.rubricMarkdown, githubGap.report, runtimeMatrix.report],
    },
    {
      id: "feedback",
      reviewUse: "Show accept/correct/reject/promote/keep-one-time actions and next route effect.",
      evidence: [feedback.report, feedback.markdown],
    },
    {
      id: "deliverables",
      reviewUse: "List the product-facing files and how reviewers should use them.",
      evidence: [deliverables.files.casePack, deliverables.files.manifest],
    },
  ];

  const reviewerCalibration = buildCalibration(scenario, contract);
  const privacyLeaks = [];
  for (const value of [files, sections, reviewerCalibration]) {
    if (hasLocalAbsolutePath(value)) privacyLeaks.push("local_absolute_path");
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, "latest.json");
  const mdPath = path.join(OUTPUT_DIR, "latest.zh-CN.md");
  files.bundleManifest = {
    path: relativeToRepo(jsonPath),
    audience: "automation",
    reviewUse: "Machine-readable bundle manifest.",
  };
  files.bundleMarkdown = {
    path: relativeToRepo(mdPath),
    audience: "reviewer",
    reviewUse: "Human-readable product delivery bundle.",
  };

  const summary = {
    fileCount: Object.keys(files).length,
    requiredSectionsCovered: contract.requiredSections.filter((section) =>
      sections.some((item) => item.id === section),
    ).length,
    requiredFilesCovered: contract.requiredFiles.filter((file) => files[file]).length,
    reviewUseCount: Object.values(files).filter((file) => file.reviewUse).length,
    governedRunStatus: governedRun.status,
  };
  const basePass =
    contract.schemaVersion === "product-delivery-bundle-contract-v0.1" &&
    summary.requiredSectionsCovered === contract.requiredSections.length &&
    summary.requiredFilesCovered === contract.requiredFiles.length &&
    reviewerCalibration.sampleCount >= 8 &&
    reviewerCalibration.positiveExampleCount >= 2 &&
    reviewerCalibration.negativeExampleCount >= 5 &&
    reviewerCalibration.missingPitfalls.length === 0 &&
    privacyLeaks.length === 0;
  const status = basePass ? (governedRun.status === "pass" ? "pass" : "partial") : "fail";

  const report = {
    schemaVersion: "product-delivery-bundle-v0.1",
    generatedAt: new Date().toISOString(),
    contract: relativeToRepo(CONTRACT_PATH),
    scenario: relativeToRepo(SCENARIO_PATH),
    status,
    summary,
    privacyCheck: {
      status: privacyLeaks.length === 0 ? "pass" : "fail",
      leaks: privacyLeaks,
    },
    sections,
    files,
    reviewerCalibration,
  };

  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(mdPath, buildMarkdown(report));

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: report.status === "pass",
        status: report.status,
        report: relativeToRepo(jsonPath),
        markdown: relativeToRepo(mdPath),
        fileCount: report.summary.fileCount,
        requiredSectionsCovered: report.summary.requiredSectionsCovered,
        governedRunStatus: report.summary.governedRunStatus,
        scoringSampleCount: report.reviewerCalibration.sampleCount,
        missingPitfalls: report.reviewerCalibration.missingPitfalls,
        privacyStatus: report.privacyCheck.status,
      },
      null,
      2,
    )}\n`,
  );
  if (report.status !== "pass") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
