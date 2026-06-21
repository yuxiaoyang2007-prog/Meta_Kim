#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { readMetaRunStatus } from "../canonical/runtime-assets/shared/hooks/spine-state.mjs";

const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const latest = args.has("--latest");
const profileArg = process.argv.find((arg) => arg.startsWith("--profile="));
const profile =
  profileArg?.slice("--profile=".length) || process.env.META_KIM_STATE_PROFILE;

const DEFAULT_LABELS = {
  inactive: "meta_governance_status=inactive",
  active: "meta_governance_active",
  completed: "completed",
  current: "current",
  next: "next",
  blocked: "blocked",
  none: "none",
  separator: "=",
  listSeparator: ",",
};

const LATEST_LABELS = {
  missing: "meta_governance_latest=missing",
  latestRun: "latest_run",
  task: "task",
  status: "status",
  publicReady: "public_ready",
  summary: "summary",
  ownerHandoff: "owner_handoff",
  runtimeEvidence: "runtime_evidence",
  releaseBoundary: "release_boundary",
  report: "report",
  nextCommand: "next_command",
  none: "none",
  separator: "=",
  listSeparator: "; ",
};

function safeProfileName(value) {
  const candidate = value || "default";
  if (/^[A-Za-z0-9._-]+$/.test(candidate)) return candidate;
  throw new Error(`Invalid profile name: ${candidate}`);
}

function toRepoRelative(cwd, value) {
  if (!value || typeof value !== "string") return null;
  const resolved = path.isAbsolute(value) ? value : path.resolve(cwd, value);
  const relative = path.relative(cwd, resolved) || ".";
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  return relative.split(path.sep).join("/");
}

function assertPathInside(baseDir, targetPath) {
  const relative = path.relative(baseDir, targetPath);
  if (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  ) {
    return targetPath;
  }
  throw new Error(
    `Refusing to read governed execution artifact outside ${baseDir}`,
  );
}

async function readJsonFile(filePath) {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function readLatestGovernedExecution(cwd, profileName) {
  const safeProfile = safeProfileName(profileName);
  const stateDir = path.join(
    cwd,
    ".meta-kim",
    "state",
    safeProfile,
    "governed-executions",
  );
  const latestPath = path.join(stateDir, "latest.json");

  let latestRecord;
  try {
    latestRecord = await readJsonFile(latestPath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }

  const artifactPath = assertPathInside(
    stateDir,
    latestRecord.jsonPath
      ? path.resolve(cwd, latestRecord.jsonPath)
      : path.join(stateDir, `${latestRecord.runId}.json`),
  );
  const artifact = await readJsonFile(artifactPath);

  return {
    latestRecord,
    artifact,
    paths: {
      latestPath,
      artifactPath,
      markdownPath: latestRecord.markdownPath
        ? path.resolve(cwd, latestRecord.markdownPath)
        : null,
    },
  };
}

function normalizeRuntimeRecords(artifact) {
  const records =
    artifact?.runtimeEvidencePacket?.records ||
    artifact?.runtimeProjectionEvidence?.results ||
    artifact?.runReportPanelContract?.runtimeEvidence ||
    [];

  return Array.isArray(records) ? records : [];
}

function summarizeRuntimeRecord(record) {
  const runtime = record.runtime || "unknown";
  const status = record.status || "unknown";
  const details = [record.evidenceKind, record.failureClass].filter(Boolean);
  return details.length
    ? `${runtime}:${status}/${details.join("/")}`
    : `${runtime}:${status}`;
}

function summarizeOwnerHandoff(ownerHandoff) {
  if (!Array.isArray(ownerHandoff) || ownerHandoff.length === 0) {
    return LATEST_LABELS.none;
  }

  return ownerHandoff
    .slice(0, 3)
    .map((handoff) => {
      const owner = handoff.owner || handoff.roleDisplayName || "owner";
      const mergeOwner = handoff.mergeOwner || "merge_owner_unknown";
      const verificationOwner =
        handoff.verificationOwner || "verification_owner_unknown";
      return `${owner}->${mergeOwner}/${verificationOwner}`;
    })
    .join(LATEST_LABELS.listSeparator);
}

function summarizeReleaseBoundaries(runtimeRecords) {
  const boundaries = runtimeRecords.filter(
    (record) =>
      record?.remainingAction &&
      (record.strictReleasePass === false ||
        record.releaseGrade === false ||
        record.status === "blocked"),
  );

  if (boundaries.length === 0) return LATEST_LABELS.none;

  return boundaries
    .map((record) => `${record.runtime || "unknown"}: ${record.remainingAction}`)
    .join(LATEST_LABELS.listSeparator);
}

function summarizeLatestGovernedExecution(cwd, latestExecution) {
  if (!latestExecution) return null;

  const { latestRecord, artifact, paths } = latestExecution;
  const panel = artifact.runReportPanelContract || {};
  const decisionSummary = panel.decisionSummary || {};
  const runtimeRecords = normalizeRuntimeRecords(artifact);
  const runId = artifact.runId || latestRecord.runId || "unknown";
  const publicReadyDecision =
    artifact.publicReadyDecision || artifact.coreLoop?.publicReadyDecision || {};
  const publicReady =
    typeof publicReadyDecision.publicReady === "boolean"
      ? String(publicReadyDecision.publicReady)
      : publicReadyDecision.status || "unknown";
  const markdownPath =
    toRepoRelative(cwd, latestRecord.markdownPath) ||
    toRepoRelative(cwd, artifact.runReport?.markdownPath) ||
    toRepoRelative(cwd, paths.markdownPath);

  return {
    runId,
    task: artifact.task || decisionSummary.task || "unknown",
    status: artifact.status || decisionSummary.status || "unknown",
    publicReady,
    summary:
      decisionSummary.plainLanguageSummary ||
      artifact.userExperienceNotice?.expectation ||
      "none",
    ownerHandoff: summarizeOwnerHandoff(panel.ownerHandoff),
    runtimeEvidence: runtimeRecords.length
      ? runtimeRecords.map(summarizeRuntimeRecord).join(LATEST_LABELS.listSeparator)
      : LATEST_LABELS.none,
    releaseBoundary: summarizeReleaseBoundaries(runtimeRecords),
    report: markdownPath || LATEST_LABELS.none,
    nextCommand: `npm run meta:theory:report -- --run-id ${runId}`,
    jsonPath:
      toRepoRelative(cwd, latestRecord.jsonPath) ||
      toRepoRelative(cwd, paths.artifactPath),
  };
}

function renderLatestSummary(summary) {
  if (!summary) return LATEST_LABELS.missing;

  return [
    `${LATEST_LABELS.latestRun}${LATEST_LABELS.separator}${summary.runId}`,
    `${LATEST_LABELS.task}${LATEST_LABELS.separator}${summary.task}`,
    `${LATEST_LABELS.status}${LATEST_LABELS.separator}${summary.status}`,
    `${LATEST_LABELS.publicReady}${LATEST_LABELS.separator}${summary.publicReady}`,
    `${LATEST_LABELS.summary}${LATEST_LABELS.separator}${summary.summary}`,
    `${LATEST_LABELS.ownerHandoff}${LATEST_LABELS.separator}${summary.ownerHandoff}`,
    `${LATEST_LABELS.runtimeEvidence}${LATEST_LABELS.separator}${summary.runtimeEvidence}`,
    `${LATEST_LABELS.releaseBoundary}${LATEST_LABELS.separator}${summary.releaseBoundary}`,
    `${LATEST_LABELS.report}${LATEST_LABELS.separator}${summary.report}`,
    `${LATEST_LABELS.nextCommand}${LATEST_LABELS.separator}${summary.nextCommand}`,
  ].join("\n");
}

if (latest) {
  const latestExecution = await readLatestGovernedExecution(
    process.cwd(),
    profile,
  );
  const summary = summarizeLatestGovernedExecution(process.cwd(), latestExecution);

  if (json) {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  }

  console.log(renderLatestSummary(summary));
  process.exit(0);
}

const status = await readMetaRunStatus(process.cwd(), profile);

if (json) {
  console.log(JSON.stringify(status || null, null, 2));
  process.exit(0);
}

if (!status) {
  console.log(DEFAULT_LABELS.inactive);
  process.exit(0);
}

const labels = {
  ...DEFAULT_LABELS,
  ...(status.publicLabels && typeof status.publicLabels === "object"
    ? status.publicLabels
    : {}),
};

if (status.active === false) {
  const continuation =
    status.deactivationReason === "session_stop"
      ? "local_continuity_or_new_run_only"
      : status.continuationBoundary?.mode || labels.none;
  console.log(
    [
      labels.inactive,
      `${labels.reason || "reason"}${labels.separator}${status.deactivationReason || labels.none}`,
      `${labels.continuation || "continuation"}${labels.separator}${continuation}`,
      `${labels.current}${labels.separator}${status.currentStage || labels.none}`,
    ].join("\n"),
  );
  process.exit(0);
}

const completed = status.completed?.length
  ? status.completed.join(labels.listSeparator)
  : labels.none;
const stagePurpose = status.stagePurpose || status.stagePurposeKey || labels.none;

console.log(
  [
    `${labels.active}${labels.separator}${status.currentStage} (${status.stageIndex}/${status.stageTotal}, ${status.percent}%)`,
    `${labels.completed}${labels.separator}${completed}`,
    `${labels.current}${labels.separator}${stagePurpose}`,
    `${labels.next}${labels.separator}${status.next || labels.none}`,
    `${labels.blocked}${labels.separator}${status.blockedOn || labels.none}`,
  ].join("\n"),
);
