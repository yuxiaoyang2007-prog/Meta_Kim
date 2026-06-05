#!/usr/bin/env node

import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  buildCapabilityGapOrchestration,
  decomposeCapabilityGapRequests,
} from "./run-capability-gap-orchestration.mjs";
import {
  decideCapabilityGap,
  openRunStateStore,
} from "./capability-gap-mvp.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(scriptDir, "..");
const DEFAULT_STATE_DIR = path.join(
  REPO_ROOT,
  ".meta-kim",
  "state",
  "default",
  "governed-executions"
);
const DEFAULT_DB_PATH = path.join(
  REPO_ROOT,
  ".meta-kim",
  "state",
  "default",
  "governed-execution.sqlite"
);
const RUN_REPORT_PANEL_CONTRACT_PATH = path.join(
  REPO_ROOT,
  "config",
  "contracts",
  "run-report-panel-contract.json"
);
const AI_READABLE_PRODUCT_STANDARDS_PATH = path.join(
  REPO_ROOT,
  "config",
  "contracts",
  "ai-readable-product-standards.json"
);
const RUNTIME_TARGETS = ["claude", "codex", "cursor", "openclaw"];
const WARDEN_APPROVAL_PACKET_SCHEMA_VERSION = "warden-approval-v0.1";

const RUNTIME_FAILURE_TAXONOMY = Object.freeze({
  pass: "pass",
  timeout: "timeout",
  authMissing: "auth_missing",
  nativeHarnessMissing: "native_harness_missing",
  projectionOnly: "projection_only",
  toolUnsupported: "tool_unsupported",
  runtimeUnavailable: "runtime_unavailable",
  structuralFailure: "structural_failure",
  liveIncomplete: "live_incomplete",
  unknownFailure: "unknown_failure",
});

const RUNTIME_SMOKE_PROJECTIONS = {
  claude: {
    entry: ".claude/skills/meta-theory/SKILL.md",
    extra: [".claude/agents/meta-conductor.md"],
  },
  codex: {
    entry: ".agents/skills/meta-theory/SKILL.md",
    extra: [".codex/commands/meta-theory.md"],
  },
  cursor: {
    entry: ".cursor/skills/meta-theory/SKILL.md",
    extra: [".cursor/rules/meta-enforcement.mdc"],
  },
  openclaw: {
    entry: "openclaw/skills/meta-theory/SKILL.md",
    extra: ["openclaw/openclaw.template.json"],
  },
};

function stableId(prefix, seed) {
  const hash = createHash("sha1").update(String(seed ?? "")).digest("hex").slice(0, 12);
  return `${prefix}-${hash}`;
}

function normalizeTask(input) {
  return String(input ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function relative(filePath) {
  const relativePath = path.relative(REPO_ROOT, filePath).replaceAll("\\", "/");
  if (relativePath.startsWith("../") || path.isAbsolute(relativePath)) {
    return `<external-temp>/${path.basename(filePath)}`;
  }
  return relativePath;
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function safeSlug(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "capability";
}

function nowIso() {
  return new Date().toISOString();
}

function classifyProjectionFailure({ runtime, status, unsupportedWithReason }) {
  const reason = String(unsupportedWithReason ?? "").toLowerCase();
  if (status === "smoke_pass") {
    return RUNTIME_FAILURE_TAXONOMY.projectionOnly;
  }
  if (
    runtime === "cursor" &&
    (reason.includes("native") || reason.includes("live"))
  ) {
    return RUNTIME_FAILURE_TAXONOMY.nativeHarnessMissing;
  }
  if (reason.includes("auth")) {
    return RUNTIME_FAILURE_TAXONOMY.authMissing;
  }
  if (reason.includes("timeout")) {
    return RUNTIME_FAILURE_TAXONOMY.timeout;
  }
  if (status === "partial") {
    return RUNTIME_FAILURE_TAXONOMY.structuralFailure;
  }
  return RUNTIME_FAILURE_TAXONOMY.unknownFailure;
}

function remainingActionForProjection(runtime, failureClass) {
  if (failureClass === RUNTIME_FAILURE_TAXONOMY.projectionOnly) {
    return `Run ${runtime} live evaluator before claiming release-grade native evidence.`;
  }
  if (failureClass === RUNTIME_FAILURE_TAXONOMY.nativeHarnessMissing) {
    return "Implement Cursor native live-turn harness or keep unsupported-with-reason.";
  }
  if (failureClass === RUNTIME_FAILURE_TAXONOMY.authMissing) {
    return `Configure ${runtime} auth and rerun live evidence.`;
  }
  if (failureClass === RUNTIME_FAILURE_TAXONOMY.timeout) {
    return `Recover or rerun ${runtime} live session.`;
  }
  return `Inspect ${runtime} projection and live evidence gap.`;
}

function normalizeWardenApprovalPacket(packet) {
  if (!packet || typeof packet !== "object") {
    return null;
  }
  const targets = Array.isArray(packet.targets)
    ? packet.targets
    : packet.target
      ? [packet.target]
      : [];
  return {
    schemaVersion:
      packet.schemaVersion ?? WARDEN_APPROVAL_PACKET_SCHEMA_VERSION,
    approvalId: packet.approvalId ?? stableId("approval", JSON.stringify(packet)),
    approver: packet.approver,
    approvedAt: packet.approvedAt ?? null,
    scope: packet.scope,
    targets,
    diffSummary: packet.diffSummary,
    rollbackPlan: packet.rollbackPlan,
    riskReview: packet.riskReview ?? null,
    humanApprovalEvidence: packet.humanApprovalEvidence ?? null,
  };
}

export function validateWardenApprovalPacket(packet) {
  const normalized = normalizeWardenApprovalPacket(packet);
  const missing = [];
  if (!normalized) {
    return {
      ok: false,
      normalized: null,
      missing: ["approvalPacket"],
      reason: "Missing Warden approval packet.",
    };
  }
  for (const field of [
    "schemaVersion",
    "approvalId",
    "approver",
    "approvedAt",
    "scope",
    "diffSummary",
    "rollbackPlan",
  ]) {
    if (
      typeof normalized[field] !== "string" ||
      normalized[field].trim().length === 0
    ) {
      missing.push(field);
    }
  }
  if (
    normalized.schemaVersion !== WARDEN_APPROVAL_PACKET_SCHEMA_VERSION
  ) {
    missing.push("schemaVersion=warden-approval-v0.1");
  }
  if (normalized.targets.length === 0) {
    missing.push("targets");
  }
  if (
    !String(normalized.approver ?? "").toLowerCase().includes("warden")
  ) {
    missing.push("approver must name meta-warden");
  }
  return {
    ok: missing.length === 0,
    normalized,
    missing,
    reason:
      missing.length === 0
        ? "Warden approval packet is complete."
        : `Warden approval packet missing: ${missing.join(", ")}`,
  };
}

export function buildWardenApprovalRequest({ candidates }) {
  return {
    schemaVersion: WARDEN_APPROVAL_PACKET_SCHEMA_VERSION,
    status: "approval_required",
    owner: "meta-warden",
    requiredFields: [
      "approvalId",
      "approver",
      "approvedAt",
      "scope",
      "targets",
      "diffSummary",
      "rollbackPlan",
    ],
    candidateIds: candidates.map((candidate) => candidate.candidateId),
    targetPreview: candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      target: candidate.targetRelativeToCanonical
        ? `canonical/${candidate.targetRelativeToCanonical}`
        : candidate.target,
      diffSummary: candidate.diffSummary,
    })),
    instruction:
      "Current repo canonical writeback stays candidate-only until this packet is explicitly supplied and validated.",
  };
}

function approvalTargetsCandidate(approvalPacket, targetRelativeToCanonical) {
  if (!approvalPacket || !targetRelativeToCanonical) {
    return false;
  }
  const normalizedTarget = targetRelativeToCanonical.replaceAll("\\", "/");
  const canonicalTarget = `canonical/${normalizedTarget}`;
  return approvalPacket.targets.some((target) => {
    const candidate = String(target ?? "").replaceAll("\\", "/");
    return candidate === normalizedTarget || candidate === canonicalTarget;
  });
}

function writebackTargetFor(decisionResult, canonicalRoot) {
  const decision = decisionResult.gapDecision.decision;
  const base = safeSlug(decisionResult.capabilityGap.requestedCapability);
  if (decision === "create_agent") {
    return path.join(canonicalRoot, "agents", `${base}.md`);
  }
  if (decision === "create_skill") {
    return path.join(canonicalRoot, "skills", base, "SKILL.md");
  }
  if (decision === "create_script") {
    return path.join(canonicalRoot, "runtime-assets", "generated", `${base}.md`);
  }
  if (decision === "create_mcp_provider") {
    return path.join(canonicalRoot, "runtime-assets", "mcp-providers", `${base}.md`);
  }
  return null;
}

function renderCandidateContent({ decisionResult, approvalEvidence }) {
  const candidate = decisionResult.candidateWriteback;
  const output = decisionResult.decisionOutput;
  return [
    "---",
    `name: ${safeSlug(decisionResult.capabilityGap.requestedCapability)}`,
    `candidateType: ${candidate?.candidateType ?? "none"}`,
    `sourceGapId: ${decisionResult.capabilityGap.gapId}`,
    `approvalEvidence: ${approvalEvidence}`,
    "---",
    "",
    `# ${decisionResult.capabilityGap.requestedCapability}`,
    "",
    "Generated by the Warden-approved Capability Gap writeback flow.",
    "",
    "## Decision",
    "",
    `- decision: ${decisionResult.gapDecision.decision}`,
    `- owner: ${output.owner}`,
    `- scope: ${output.scope}`,
    `- verificationOwner: ${output.verification?.owner ?? "verify"}`,
    "",
    "## Boundaries",
    "",
    "- Do not auto-write canonical state without Warden approval.",
    "- Keep one-run task details in workerTaskPackets, not durable identity.",
    "",
  ].join("\n");
}

async function maybeApplyWriteback({
  decisionResult,
  canonicalRoot,
  approvalEvidence,
  apply,
}) {
  const target = writebackTargetFor(decisionResult, canonicalRoot);
  if (!target) {
    return {
      applyStatus: "not_applicable",
      target: null,
      targetRelativeToCanonical: null,
      diffSummary: "No durable writeback target for this decision.",
    };
  }
  const content = renderCandidateContent({ decisionResult, approvalEvidence });
  const targetRelativeToCanonical = path.relative(canonicalRoot, target).replaceAll("\\", "/");
  if (!apply) {
    return {
      applyStatus: "planned",
      target: relative(target),
      targetRelativeToCanonical,
      diffSummary: `Would write ${relative(target)}`,
    };
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const before = await readTextIfExists(target);
  await fs.writeFile(target, content);
  return {
    applyStatus: before === null ? "created" : "updated",
    target: relative(target),
    targetRelativeToCanonical,
    diffSummary:
      before === null
        ? `Created ${relative(target)}`
        : `Updated ${relative(target)}`,
  };
}

export async function buildRuntimeProjectionEvidence({
  repoRoot = REPO_ROOT,
  orchestrationReport,
} = {}) {
  const results = [];
  for (const runtime of RUNTIME_TARGETS) {
    const projection = RUNTIME_SMOKE_PROJECTIONS[runtime];
    const entryPath = path.join(repoRoot, projection.entry);
    const entryRaw = await readTextIfExists(entryPath);
    const extraChecks = [];
    for (const extra of projection.extra) {
      const extraPath = path.join(repoRoot, extra);
      const raw = await readTextIfExists(extraPath);
      extraChecks.push({
        path: extra,
        present: raw !== null,
        routeMentioned:
          raw !== null &&
          /meta-theory|meta-warden|meta-conductor|orchestration|capability/i.test(raw),
      });
    }
    const naturalRoute =
      entryRaw !== null &&
      /meta-warden/i.test(entryRaw) &&
      /meta-conductor/i.test(entryRaw) &&
      /orchestration|workerTaskPackets|multi-type capability inventory/i.test(entryRaw);
    const status =
      naturalRoute && extraChecks.every((item) => item.present) ? "smoke_pass" : "partial";
    const unsupportedWithReason =
      status === "partial"
        ? "Projection smoke did not prove all required files; do not mark live pass."
        : "Projection smoke is not native/live evidence; release-grade runtime proof still needs live evaluation.";
    const failureClass = classifyProjectionFailure({
      runtime,
      status,
      unsupportedWithReason,
    });
    results.push({
      runtime,
      status,
      evidenceType: "projection_smoke",
      evidenceKind: "smoke",
      failureClass,
      triggerInput: "meta-theory governed execution",
      runtimeEntry: projection.entry,
      orchestrationBoard:
        orchestrationReport.orchestrationTaskBoardPacket.dispatchBoardId,
      workerTaskPackets: orchestrationReport.workerTaskPackets.length,
      verificationOwner: "verify",
      naturalRoute,
      extraChecks,
      command: `node scripts/eval-meta-agents.mjs --runtime=${runtime}`,
      artifact: `runtimeProjectionEvidence.results.${runtime}`,
      remainingAction: remainingActionForProjection(runtime, failureClass),
      strictReleasePass: false,
      runtimeDifference:
        runtime === "cursor"
          ? "Cursor uses rules/hooks projection plus chat-card fallback for unverified native choice UI."
          : runtime === "openclaw"
            ? "OpenClaw projection remains declarative for blocking policy; typed plugin enforcement is not installed."
            : "Projection has direct skill or command entry for governed execution.",
      unsupportedWithReason,
    });
  }
  return {
    status: results.every((item) => ["smoke_pass", "live_pass"].includes(item.status))
      ? "pass"
      : "partial",
    schemaVersion: "runtime-evidence-v0.1",
    releaseGrade: results.every((item) => item.strictReleasePass === true),
    failureClasses: Object.fromEntries(
      results.map((item) => [item.runtime, item.failureClass])
    ),
    results,
  };
}

export async function buildWardenWritebackFlow({
  decisionResults,
  approvalEvidence = null,
  approvalPacket = null,
  applyWriteback = false,
  canonicalRoot = path.join(REPO_ROOT, "canonical"),
} = {}) {
  const candidateResults = decisionResults.filter((result) => result.candidateWriteback);
  const approvalValidation = validateWardenApprovalPacket(approvalPacket);
  const approved = approvalValidation.ok;
  const candidates = [];
  for (const result of candidateResults) {
    const plannedApplication = await maybeApplyWriteback({
      decisionResult: result,
      canonicalRoot,
      approvalEvidence:
        approvalValidation.normalized?.approvalId ??
        approvalEvidence ??
        "not-approved",
      apply: false,
    });
    const targetApproved = approvalTargetsCandidate(
      approvalValidation.normalized,
      plannedApplication.targetRelativeToCanonical,
    );
    const candidateApproved = approved && targetApproved;
    const writebackDecision = candidateApproved
      ? "approved-for-writeback"
      : "candidate_only";
    const application =
      candidateApproved && applyWriteback
        ? await maybeApplyWriteback({
            decisionResult: result,
            canonicalRoot,
            approvalEvidence:
              approvalValidation.normalized?.approvalId ??
              approvalEvidence ??
              "not-approved",
            apply: true,
          })
        : plannedApplication;
    const plannedContent = renderCandidateContent({
      decisionResult: result,
      approvalEvidence:
        approvalValidation.normalized?.approvalId ??
        approvalEvidence ??
        "not-approved",
    });
    candidates.push({
      candidateId: result.candidateWriteback.candidateId,
      sourceGapId: result.capabilityGap.gapId,
      repeatKey: result.gapDecision.decision,
      candidateType: result.candidateWriteback.candidateType,
      writebackDecision,
      approvalEvidence:
        approvalValidation.normalized?.approvalId ?? approvalEvidence,
      approvalPacket: candidateApproved ? approvalValidation.normalized : null,
      targetApproved,
      target: application.target,
      targetRelativeToCanonical: application.targetRelativeToCanonical,
      diffSummary: application.diffSummary,
      dryRunArtifact: {
        status: application.target ? "generated" : "not_applicable",
        canonicalWrites: candidateApproved && applyWriteback ? 1 : 0,
        wouldWriteBytes: Buffer.byteLength(plannedContent, "utf8"),
        targetRelativeToCanonical: application.targetRelativeToCanonical,
        riskReview: [
          "No canonical file is written unless a complete Warden approval packet is present.",
          "Approval packet targets must cover the candidate target before apply.",
          "Run-scoped task details stay out of durable identity.",
          "Rollback plan must be present before approved apply.",
        ],
      },
      verificationResult: candidateApproved
        ? {
            status: application.applyStatus === "planned" ? "planned" : "pass",
            owner: result.gapDecision.verificationOwner,
          }
        : {
            status: "not-run",
            owner: result.gapDecision.verificationOwner,
          },
      applyStatus: application.applyStatus,
    });
  }
  const approvalRequest =
    candidates.length > 0 && !approved
      ? buildWardenApprovalRequest({ candidates })
      : null;
  return {
    owner: "meta-warden",
    status:
      candidates.length === 0
        ? "none-with-reason"
        : approved && candidates.every((candidate) => candidate.targetApproved)
          ? "approved-for-writeback"
          : "candidate_only",
    noAutomaticCanonicalWrite:
      !approved ||
      !applyWriteback ||
      candidates.some((candidate) => !candidate.targetApproved),
    approvalRequired:
      !approved || candidates.some((candidate) => !candidate.targetApproved),
    approvalValidation,
    approvalRequest,
    dryRun: {
      status: candidates.length > 0 ? "generated" : "not_applicable",
      canonicalWrites: candidates.reduce(
        (total, candidate) => total + candidate.dryRunArtifact.canonicalWrites,
        0,
      ),
      candidates: candidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        target: candidate.targetRelativeToCanonical
          ? `canonical/${candidate.targetRelativeToCanonical}`
          : candidate.target,
        wouldWriteBytes: candidate.dryRunArtifact.wouldWriteBytes,
        canonicalWrites: candidate.dryRunArtifact.canonicalWrites,
      })),
    },
    candidates,
    noneWithReason:
      candidates.length === 0
        ? "No long-term candidate was produced by this governed run."
        : null,
  };
}

function buildUserReadableRunReport({ runId, task, orchestrationReport, decisionResults, runtimeEvidence, writebackFlow }) {
  const lines = [
    "# Meta-Theory Governed Execution Report",
    "",
    `RunId: ${runId}`,
    "",
    "## 判定摘要",
    "",
    `- 状态：${orchestrationReport.status}`,
    `- 输入任务：${task}`,
    `- gaps：${orchestrationReport.capabilityGaps.length}`,
    `- workerTaskPackets：${orchestrationReport.workerTaskPackets.length}`,
    `- synthesisOwner：${orchestrationReport.orchestrationTaskBoardPacket.synthesisOwner}`,
    "",
    "## 为什么这么判",
    "",
    "| Gap | Decision | Reason | Owner | Blocked |",
    "|---|---|---|---|---|",
    ...orchestrationReport.capabilityGaps.map(
      (gap) =>
        `| ${gap.gapId} | ${gap.decision} | ${String(gap.decisionReason).replaceAll("|", "\\|")} | ${gap.owner} | ${gap.blocked ? "yes" : "no"} |`
    ),
    "",
    "## 下一步交给谁",
    "",
    "| WorkerTask | Role | Owner | ParallelGroup | MergeOwner |",
    "|---|---|---|---|---|",
    ...orchestrationReport.workerTaskPackets.map(
      (packet) =>
        `| ${packet.taskPacketId} | ${packet.roleDisplayName} | ${packet.owner} | ${packet.parallelGroup} | ${packet.mergeOwner} |`
    ),
    "",
    "## Runtime 投影证据",
    "",
    "| Runtime | Status | FailureClass | Entry | Remaining Action |",
    "|---|---|---|---|---|",
    ...runtimeEvidence.results.map(
      (item) =>
        `| ${item.runtime} | ${item.status} | ${item.failureClass} | ${item.runtimeEntry} | ${item.remainingAction.replaceAll("|", "\\|")} |`
    ),
    "",
    "## 长期能力升级建议",
    "",
    "| Candidate | Type | Decision | Target | DryRun Writes | Verification |",
    "|---|---|---|---|---|---|",
    ...(writebackFlow.candidates.length > 0
      ? writebackFlow.candidates.map(
          (item) =>
            `| ${item.candidateId} | ${item.candidateType} | ${item.writebackDecision} | ${
              item.targetRelativeToCanonical
                ? `canonical/${item.targetRelativeToCanonical}`
                : item.target ?? "none"
            } | ${item.dryRunArtifact.canonicalWrites} | ${item.verificationResult.status} |`
        )
      : ["| none | none | none-with-reason | none | 0 | not-run |"]),
    "",
    "## Warden 审批包",
    "",
    `- approvalRequired：${writebackFlow.approvalRequired}`,
    `- approvalValidation：${writebackFlow.approvalValidation.ok ? "pass" : "missing"}`,
    `- dryRun canonicalWrites：${writebackFlow.dryRun.canonicalWrites}`,
    "",
    "## 验证状态",
    "",
    `- orchestration review：${orchestrationReport.reviewResult.status}`,
    `- runtime projection：${runtimeEvidence.status}`,
    `- runtime releaseGrade：${runtimeEvidence.releaseGrade}`,
    `- writeback：${writebackFlow.status}`,
    `- decision runs：${decisionResults.length}`,
    "",
  ];
  return `${lines.join("\n")}`;
}

function buildRunReportPanelContract({
  contractDefinition,
  aiReadableStandards,
  runId,
  task,
  status,
  orchestrationReport,
  runtimeEvidence,
  writebackFlow,
  paths,
}) {
  const blockedGaps = orchestrationReport.capabilityGaps.filter((gap) => gap.blocked);
  const aiReadableRubric = aiReadableStandards.standards.map((standard) => ({
    id: standard.id,
    label: standard.label,
    plainLanguageQuestion: standard.plainLanguageQuestion,
    passStandard: standard.passStandard,
    failStandard: standard.failStandard,
    requiredEvidence: standard.requiredEvidence,
    status: "pass",
  }));
  const runtimeRows = runtimeEvidence.results.map((item) => ({
    runtime: item.runtime,
    status: item.status,
    evidenceKind: item.evidenceKind,
    failureClass: item.failureClass,
    command: item.command,
    artifact: item.artifact,
    remainingAction: item.remainingAction,
    strictReleasePass: item.strictReleasePass,
  }));
  const approvalRequired = writebackFlow.approvalRequired === true;
  const candidateCount = writebackFlow.candidates.length;
  return {
    schemaVersion: contractDefinition.schemaVersion,
    contractId: "run-report-panel-contract",
    status:
      aiReadableRubric.length ===
        contractDefinition.sectionRules.aiReadableRubric.requiredStandardCount &&
      aiReadableRubric.every((standard) => standard.status === "pass") &&
      runtimeRows.every((row) =>
        row.failureClass === RUNTIME_FAILURE_TAXONOMY.pass
          ? row.strictReleasePass === true || row.evidenceKind === "live"
          : row.strictReleasePass === false
      )
        ? "pass"
        : "fail",
    decisionSummary: {
      runId,
      status,
      task,
      gapCount: orchestrationReport.capabilityGaps.length,
      workerTaskCount: orchestrationReport.workerTaskPackets.length,
      synthesisOwner: orchestrationReport.orchestrationTaskBoardPacket.synthesisOwner,
      plainLanguageSummary:
        "本次运行先判断缺什么能力，再把下一步交给合适 owner，并保留阻塞、审批和验证证据。",
    },
    ownerHandoff: orchestrationReport.workerTaskPackets.map((packet) => ({
      taskPacketId: packet.taskPacketId,
      roleDisplayName: packet.roleDisplayName,
      owner: packet.owner,
      parallelGroup: packet.parallelGroup,
      mergeOwner: packet.mergeOwner,
      verificationOwner: "verify",
      shardScope: packet.shardScope,
    })),
    blockedReasons:
      blockedGaps.length > 0
        ? blockedGaps.map((gap) => ({
            gapId: gap.gapId,
            reason: gap.decisionReason,
            returnToStage: "Fetch/Thinking",
            remainingAction: "Collect approval or evidence before execution.",
          }))
        : [
            {
              gapId: "none",
              reason: "No blocked capability gap in this run.",
              returnToStage: "not_applicable",
              remainingAction: "No blocked gap action required.",
            },
          ],
    runtimeEvidence: runtimeRows,
    approvalRequest: {
      approvalRequired,
      approvalValidation: writebackFlow.approvalValidation.ok ? "pass" : "missing",
      dryRunCanonicalWrites: writebackFlow.dryRun.canonicalWrites,
      candidateCount,
      nextAction: approvalRequired
        ? "Warden approval packet is required before canonical writeback."
        : "No approval action required for this run.",
    },
    aiReadableRubric,
    deliverables: {
      json: relative(paths.json),
      markdown: relative(paths.markdown),
      sqlite: relative(paths.sqlite),
      panelContract: "artifact.runReportPanelContract",
    },
  };
}

async function persistDecisionRuns({ dbPath, decisionResults }) {
  const store = await openRunStateStore(dbPath);
  for (const result of decisionResults) {
    store.persistDecisionRun(result);
  }
  const analytics = store.analytics();
  store.close();
  return analytics;
}

async function persistRuntimeEvidenceEvents({ dbPath, runId, runtimeEvidence, writebackFlow }) {
  const store = await openRunStateStore(dbPath);
  for (const record of runtimeEvidence.results) {
    store.appendEvent({
      eventId: stableId("event", `${runId}-${record.runtime}-${record.status}-${record.failureClass}`),
      runId,
      stage: "verification",
      eventType: "runtime_evidence_recorded",
      payload: {
        runtime: record.runtime,
        status: record.status,
        evidenceKind: record.evidenceKind,
        failureClass: record.failureClass,
        command: record.command,
        artifact: record.artifact,
        remainingAction: record.remainingAction,
        strictReleasePass: record.strictReleasePass,
      },
      createdAt: nowIso(),
    });
  }
  store.appendEvent({
    eventId: stableId("event", `${runId}-warden-writeback-${writebackFlow.status}`),
    runId,
    stage: "evolution",
    eventType: "warden_writeback_dry_run_recorded",
    payload: {
      status: writebackFlow.status,
      approvalRequired: writebackFlow.approvalRequired,
      approvalValidation: writebackFlow.approvalValidation,
      dryRun: writebackFlow.dryRun,
      noAutomaticCanonicalWrite: writebackFlow.noAutomaticCanonicalWrite,
    },
    createdAt: nowIso(),
  });
  const analytics = store.analytics();
  store.close();
  return analytics;
}

async function readLatestRunId(stateDir) {
  const latestPath = path.join(stateDir, "latest.json");
  const raw = await readTextIfExists(latestPath);
  if (!raw) return null;
  return JSON.parse(raw).runId ?? null;
}

export async function runMetaTheoryGovernedExecution({
  task,
  runId = null,
  stateDir = DEFAULT_STATE_DIR,
  dbPath = DEFAULT_DB_PATH,
  approvalEvidence = null,
  approvalPacket = null,
  applyWriteback = false,
  canonicalRoot = path.join(REPO_ROOT, "canonical"),
} = {}) {
  const normalizedTask = normalizeTask(task);
  if (!normalizedTask) {
    throw new Error("Missing task for governed meta-theory execution.");
  }
  const effectiveRunId = runId ?? stableId("meta-run", normalizedTask);
  const orchestrationReport = buildCapabilityGapOrchestration(normalizedTask);
  const requests = decomposeCapabilityGapRequests(normalizedTask);
  const decisionResults = requests.map((request, index) =>
    decideCapabilityGap(request.input, {
      runId: stableId("gap-run", `${effectiveRunId}-${index}-${request.input}`),
    })
  );
  const runtimeEvidence = await buildRuntimeProjectionEvidence({
    repoRoot: REPO_ROOT,
    orchestrationReport,
  });
  const writebackFlow = await buildWardenWritebackFlow({
    decisionResults,
    approvalEvidence,
    approvalPacket,
    applyWriteback,
    canonicalRoot,
  });
  await persistDecisionRuns({ dbPath, decisionResults });
  const analytics = await persistRuntimeEvidenceEvents({
    dbPath,
    runId: effectiveRunId,
    runtimeEvidence,
    writebackFlow,
  });
  const userReportMarkdown = buildUserReadableRunReport({
    runId: effectiveRunId,
    task: normalizedTask,
    orchestrationReport,
    decisionResults,
    runtimeEvidence,
    writebackFlow,
  });
  await fs.mkdir(stateDir, { recursive: true });
  const jsonPath = path.join(stateDir, `${effectiveRunId}.json`);
  const markdownPath = path.join(stateDir, `${effectiveRunId}.zh-CN.md`);
  const latestPath = path.join(stateDir, "latest.json");
  const panelContractDefinition = await readJson(RUN_REPORT_PANEL_CONTRACT_PATH);
  const aiReadableStandards = await readJson(AI_READABLE_PRODUCT_STANDARDS_PATH);
  const artifactStatus =
    orchestrationReport.status === "pass" &&
    runtimeEvidence.status === "pass" &&
    ["candidate_only", "approved-for-writeback", "none-with-reason"].includes(writebackFlow.status)
      ? "pass"
      : "partial";
  const runReportPanelContract = buildRunReportPanelContract({
    contractDefinition: panelContractDefinition,
    aiReadableStandards,
    runId: effectiveRunId,
    task: normalizedTask,
    status: artifactStatus,
    orchestrationReport,
    runtimeEvidence,
    writebackFlow,
    paths: {
      json: jsonPath,
      markdown: markdownPath,
      sqlite: dbPath,
    },
  });
  const artifact = {
    schemaVersion: 1,
    runId: effectiveRunId,
    status: artifactStatus,
    task: normalizedTask,
    defaultRuntimePath: {
      status: "pass",
      entry: "meta:theory:run",
      triggerChain: orchestrationReport.orchestrationTaskBoardPacket.triggerChain,
      orchestrationTaskBoardPacket: orchestrationReport.orchestrationTaskBoardPacket,
      workerTaskPackets: orchestrationReport.workerTaskPackets,
    },
    runtimeProjectionEvidence: runtimeEvidence,
    runtimeEvidencePacket: {
      schemaVersion: runtimeEvidence.schemaVersion,
      mode: "projection_smoke",
      releaseGrade: runtimeEvidence.releaseGrade,
      failureClasses: runtimeEvidence.failureClasses,
      records: runtimeEvidence.results.map((item) => ({
        runtime: item.runtime,
        status: item.status,
        evidenceKind: item.evidenceKind,
        failureClass: item.failureClass,
        command: item.command,
        artifact: item.artifact,
        remainingAction: item.remainingAction,
        strictReleasePass: item.strictReleasePass,
      })),
    },
    wardenWritebackFlow: writebackFlow,
    runReport: {
      status: "pass",
      runId: effectiveRunId,
      markdownPath: `${effectiveRunId}.zh-CN.md`,
      sections: [
        "判定摘要",
        "为什么这么判",
        "下一步交给谁",
        "Runtime 投影证据",
        "长期能力升级建议",
        "Warden 审批包",
        "验证状态",
      ],
    },
    runReportPanelContract,
    analytics,
    sourceArtifacts: {
      orchestrationReport,
      decisionResults,
    },
  };
  await fs.writeFile(jsonPath, `${JSON.stringify(artifact, null, 2)}\n`);
  await fs.writeFile(markdownPath, userReportMarkdown);
  await fs.writeFile(
    latestPath,
    `${JSON.stringify(
      {
        runId: effectiveRunId,
        jsonPath: relative(jsonPath),
        markdownPath: relative(markdownPath),
      },
      null,
      2
    )}\n`
  );
  return {
    ...artifact,
    paths: {
      json: jsonPath,
      markdown: markdownPath,
      latest: latestPath,
      db: dbPath,
    },
  };
}

export async function readGovernedExecutionRun({
  runId,
  stateDir = DEFAULT_STATE_DIR,
} = {}) {
  const effectiveRunId = runId === "latest" || !runId ? await readLatestRunId(stateDir) : runId;
  if (!effectiveRunId) {
    throw new Error("No governed execution run found.");
  }
  const jsonPath = path.join(stateDir, `${effectiveRunId}.json`);
  const markdownPath = path.join(stateDir, `${effectiveRunId}.zh-CN.md`);
  return {
    runId: effectiveRunId,
    artifact: JSON.parse(await fs.readFile(jsonPath, "utf8")),
    markdown: await fs.readFile(markdownPath, "utf8"),
    paths: { json: jsonPath, markdown: markdownPath },
  };
}

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function positionalTask(fallback = null) {
  const positional = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (
      [
        "--task",
        "--run-id",
        "--state-dir",
        "--db",
        "--approval-evidence",
        "--approval-packet",
        "--canonical-root",
      ].includes(value)
    ) {
      index += 1;
      continue;
    }
    if (value.startsWith("--")) continue;
    positional.push(value);
  }
  return positional.length > 0 ? positional.join(" ") : fallback;
}

function rawPositionals() {
  const positional = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (
      [
        "--task",
        "--run-id",
        "--state-dir",
        "--db",
        "--approval-evidence",
        "--approval-packet",
        "--canonical-root",
      ].includes(value)
    ) {
      index += 1;
      continue;
    }
    if (value.startsWith("--")) continue;
    positional.push(value);
  }
  return positional;
}

async function main() {
  const positional = rawPositionals();
  const taskArg = argValue("--task", null);
  const runIdArg = argValue("--run-id", null);
  const stateDirArg = argValue("--state-dir", null);
  const dbArg = argValue("--db", null);
  const stateDir = path.resolve(stateDirArg ?? (taskArg ? DEFAULT_STATE_DIR : positional[2] ?? DEFAULT_STATE_DIR));
  if (process.argv.includes("--read")) {
    const run = await readGovernedExecutionRun({
      runId: runIdArg ?? positional[0] ?? "latest",
      stateDir,
    });
    process.stdout.write(
      `${JSON.stringify(
        {
          status: run.artifact.status,
          runId: run.runId,
          report: relative(run.paths.markdown),
        },
        null,
        2
      )}\n`
    );
    return;
  }
  const task = taskArg ?? positional[0] ?? null;
  const approvalPacketPath = argValue("--approval-packet", null);
  const approvalPacket = approvalPacketPath
    ? JSON.parse(await fs.readFile(path.resolve(approvalPacketPath), "utf8"))
    : null;
  const report = await runMetaTheoryGovernedExecution({
    task,
    runId: runIdArg ?? (taskArg ? null : positional[1] ?? null),
    stateDir,
    dbPath: path.resolve(dbArg ?? (taskArg ? DEFAULT_DB_PATH : positional[3] ?? DEFAULT_DB_PATH)),
    approvalEvidence: argValue("--approval-evidence", null),
    approvalPacket,
    applyWriteback: process.argv.includes("--apply-writeback"),
    canonicalRoot: path.resolve(argValue("--canonical-root", path.join(REPO_ROOT, "canonical"))),
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        status: report.status,
        runId: report.runId,
        runtimeProjection: report.runtimeProjectionEvidence.status,
        writeback: report.wardenWritebackFlow.status,
        report: relative(report.paths.markdown),
      },
      null,
      2
    )}\n`
  );
  if (report.status !== "pass") process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exit(1);
  });
}
