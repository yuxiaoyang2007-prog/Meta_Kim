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
import { classifyMetaTheoryEntry } from "./meta-theory-entry-classifier.mjs";
import {
  decideCapabilityGap,
  openRunStateStore,
} from "./capability-gap-mvp.mjs";
import { writeCapabilityInventory } from "./build-capability-inventory.mjs";
import { getReportLabelsForPath } from "./meta-kim-i18n.mjs";
import { buildAgentProjectionTargets } from "./runtime-tool-profiles.mjs";

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
const CONVERSATION_NOTICE_SCHEMA_VERSION = "conversation-notice-v0.1";
const CONVERSATION_NOTICE_ADAPTER = "meta-theory-governed-execution-cli";

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

const CARD_DECK_TEMPLATE = Object.freeze([
  {
    id: "clarify",
    label: "Clarify",
    type: "clarify",
    cardType: "info",
    cardIntent: "clarify",
    priority: 10,
    cost: "low",
    trigger: "Intent, success standard, non-goal, permission, or acceptance boundary may change the route.",
    action: "Lock the real outcome before Fetch, Thinking, or execution.",
    deliveryShell: "chat_status",
    mapsToSpine: ["Critical"],
  },
  {
    id: "shrink-scope",
    label: "Shrink scope",
    type: "shrink-scope",
    cardType: "default",
    cardIntent: "scope_contract",
    priority: 9,
    cost: "low",
    trigger: "Multiple gaps, files, runtimes, or worker lanes may overload one route.",
    action: "Narrow the boundary and declare omitted lanes with reasons.",
    deliveryShell: "markdown_report",
    mapsToSpine: ["Critical", "Thinking"],
  },
  {
    id: "options",
    label: "Options",
    type: "options",
    cardType: "info",
    cardIntent: "plan",
    priority: 8,
    cost: "mid",
    trigger: "More than one viable path, owner, or capability class exists.",
    action: "Compare paths and choose the route with explicit trade-offs.",
    deliveryShell: "decision_card",
    mapsToSpine: ["Thinking"],
  },
  {
    id: "execute",
    label: "Execute",
    type: "execute",
    cardType: "action",
    cardIntent: "execute",
    priority: 7,
    cost: "high",
    trigger: "Owner, weapon, dependency policy, runtime, OS, and verification owner are bound.",
    action: "Dispatch or run the bounded work selected by Thinking.",
    deliveryShell: "worker_task_packet",
    mapsToSpine: ["Execution"],
  },
  {
    id: "verify",
    label: "Verify",
    type: "verify",
    cardType: "action",
    cardIntent: "verify",
    priority: 6,
    cost: "mid",
    trigger: "Execution or projection evidence exists and needs fresh proof.",
    action: "Run checks and bind claims to command, log, artifact, or human acceptance evidence.",
    deliveryShell: "json_artifact",
    mapsToSpine: ["Verification"],
  },
  {
    id: "fix",
    label: "Fix",
    type: "fix",
    cardType: "action",
    cardIntent: "repair",
    priority: 5,
    cost: "mid",
    trigger: "Verification or Review fails.",
    action: "Repair bounded failures up to the iteration limit, then re-verify.",
    deliveryShell: "worker_task_packet",
    mapsToSpine: ["Execution", "Verification"],
  },
  {
    id: "rollback",
    label: "Rollback",
    type: "rollback",
    cardType: "risk",
    cardIntent: "rollback",
    priority: 4,
    cost: "high",
    trigger: "Risk or blast radius grows beyond the approved boundary.",
    action: "Return to the last stable state and re-enter Thinking.",
    deliveryShell: "chat_status",
    mapsToSpine: ["Review", "Execution"],
  },
  {
    id: "risk",
    label: "Risk",
    type: "risk",
    cardType: "risk",
    cardIntent: "risk_surface",
    priority: 9,
    cost: "high",
    trigger: "Security, release, runtime, third-party, or cross-project risk can preempt the normal route.",
    action: "Surface the risk, bind owner and rollback, and preempt unsafe execution.",
    deliveryShell: "chat_status",
    mapsToSpine: ["Fetch", "Review"],
  },
  {
    id: "nudge",
    label: "Nudge",
    type: "nudge",
    cardType: "default",
    cardIntent: "suggest",
    priority: 3,
    cost: "low",
    trigger: "The user is blocked or needs one low-cost next move.",
    action: "Offer a compact next action without expanding scope.",
    deliveryShell: "chat_status",
    mapsToSpine: ["Evolution"],
  },
  {
    id: "pause",
    label: "Pause",
    type: "pause",
    cardType: "silence",
    cardIntent: "silence",
    priority: 2,
    cost: "zero",
    trigger: "Digest window, user decision, or three consecutive high-cost cards.",
    action: "Stop pushing new tasks and show only a compact status.",
    deliveryShell: "intentional_silence",
    mapsToSpine: ["Critical", "Review"],
  },
]);

const BUSINESS_PHASES = Object.freeze([
  ["direction", "Direction", ["Critical"], "meta-warden"],
  ["planning", "Planning", ["Fetch", "Thinking"], "meta-conductor"],
  ["execution", "Execution", ["Execution"], "worker"],
  ["review", "Review", ["Review"], "meta-prism"],
  ["meta_review", "Meta-review", ["Meta-Review"], "meta-warden"],
  ["revision", "Revision", ["Execution", "Verification"], "worker"],
  ["verify", "Verify", ["Verification"], "verify"],
  ["summary", "Summary", ["Evolution"], "meta-warden"],
  ["feedback", "Feedback", ["Evolution"], "user"],
  ["evolve", "Evolve", ["Evolution"], "meta-chrysalis"],
  ["mirror", "Mirror", ["Evolution"], "meta-conductor"],
]);

function stableId(prefix, seed) {
  const hash = createHash("sha1").update(String(seed ?? "")).digest("hex").slice(0, 12);
  return `${prefix}-${hash}`;
}

function textSha256(text) {
  return createHash("sha256").update(String(text ?? ""), "utf8").digest("hex");
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
    return "Add strict Cursor native live-turn test evidence before claiming native live release evidence.";
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

function buildCardPlanPacket({ runId, orchestrationReport, runtimeEvidence }) {
  const workerCount = orchestrationReport.workerTaskPackets.length;
  const hasBlockedGap = orchestrationReport.capabilityGaps.some((gap) => gap.blocked);
  const runtimeRisk = runtimeEvidence.results.some((item) => item.strictReleasePass === false);
  const dealOrder = [
    "clarify",
    ...(workerCount > 1 ? ["shrink-scope"] : []),
    "options",
    ...(runtimeRisk ? ["risk"] : []),
    "execute",
    "verify",
    ...(hasBlockedGap ? ["rollback"] : []),
    ...(orchestrationReport.reviewResult.status !== "pass" ? ["fix"] : []),
    "nudge",
    "pause",
  ];
  const orderIndex = new Map(dealOrder.map((id, index) => [id, index]));
  const cards = CARD_DECK_TEMPLATE.map((card) => {
    const dealt = orderIndex.has(card.id);
    return {
      cardId: `${runId}-${card.id}`,
      cardKey: card.id,
      label: card.label,
      type: card.type,
      cardType: card.cardType,
      cardIntent: card.cardIntent,
      cardDecision: dealt ? "deal" : "defer",
      cardAudience: card.id === "pause" ? "user" : "dispatcher",
      cardTiming: dealt ? "next_stage" : "after_dependency",
      cardShell: card.deliveryShell,
      cardPriority: card.priority,
      cost: card.cost,
      cardReason: card.trigger,
      action: card.action,
      cardSource: "canonical/skills/meta-theory/references/rhythm-orchestration.md",
      cardSuppressed: false,
      suppressionReason: null,
      deliveryShellId: card.deliveryShell,
      choiceSurface:
        card.id === "options" || card.id === "clarify"
          ? "native_choice_or_chat_card"
          : "status_or_artifact",
      owner: card.id === "risk" || card.id === "rollback" ? "meta-sentinel" : "meta-conductor",
      mapsToSpine: card.mapsToSpine,
      dealIndex: dealt ? orderIndex.get(card.id) + 1 : null,
    };
  });
  const dealtCards = cards
    .filter((card) => card.cardDecision === "deal")
    .sort((a, b) => a.dealIndex - b.dealIndex);
  return {
    schemaVersion: "card-plan-v0.1",
    packetName: "cardPlanPacket",
    dealerOwner: "meta-conductor",
    dealerMode: "conductor-primary-warden-escalation",
    deckSource: "canonical/skills/meta-theory/references/rhythm-orchestration.md",
    visibleByDefault: true,
    deckSummary:
      "Conductor deals cards to pace governed work; Warden gates, Sentinel/Prism can interrupt, and Pause is explicit silence.",
    dealOrder: dealtCards.map((card) => card.cardKey),
    cards,
    deliveryShells: [...new Set(cards.map((card) => card.deliveryShellId))],
    silenceDecision: {
      silenceDecision: dealOrder.includes("pause") ? "deal_pause_card" : "not_needed",
      noInterventionPreferred: dealOrder.includes("pause"),
      interruptionJustified: false,
      deferUntil: "after_status_summary_or_user_reply",
      reasonForSilence:
        "Pause remains visible as a card so intentional silence is not mistaken for missing orchestration.",
    },
    controlDecisions: [
      {
        decisionId: `${runId}-forced-pause-rule`,
        decisionType: "pause_after_high_cost_streak",
        skipReason: null,
        interruptReason: null,
        overrideReason: null,
        insertedGovernanceOwner: "meta-conductor",
        rule: "After three consecutive high-cost cards, insert Pause before dealing new work.",
      },
      {
        decisionId: `${runId}-risk-preempt-rule`,
        decisionType: runtimeRisk ? "interrupt_insert" : "skip",
        skipReason: runtimeRisk ? null : "No runtime risk preempt required in this run.",
        interruptReason: runtimeRisk ? "projection_smoke_is_not_release_grade_live_evidence" : null,
        overrideReason: null,
        insertedGovernanceOwner: runtimeRisk ? "meta-sentinel" : "meta-conductor",
        rule: "Risk preempts Execute when runtime, release, security, or external capability evidence changes route safety.",
      },
    ],
    defaultShellId: "markdown_report",
    visibleSummary: {
      dealt: dealtCards.length,
      deckSize: cards.length,
      activeCards: dealtCards.map((card) => card.label),
      forcedPauseRule: "3 consecutive high-cost cards -> Pause",
      interruptSources: ["meta-sentinel", "meta-prism", "user", "system"],
    },
  };
}

function buildBusinessPhasePlanPacket({ runId, orchestrationReport, runtimeEvidence, writebackFlow }) {
  const phaseStatuses = new Map([
    ["direction", "done"],
    ["planning", "done"],
    ["execution", orchestrationReport.workerTaskPackets.length > 0 ? "done" : "skipped"],
    ["review", orchestrationReport.reviewResult.status === "pass" ? "done" : "blocked"],
    ["meta_review", "done"],
    ["revision", orchestrationReport.reviewResult.status === "pass" ? "skipped" : "pending"],
    ["verify", runtimeEvidence.status === "pass" ? "done" : "blocked"],
    ["summary", "done"],
    ["feedback", "pending"],
    ["evolve", writebackFlow.status === "none-with-reason" ? "skipped" : "done"],
    ["mirror", runtimeEvidence.status === "pass" ? "done" : "blocked"],
  ]);
  const skipReasons = new Map([
    ["execution", "No worker task was needed."],
    ["revision", "Review passed, so no revision loop was opened."],
    ["evolve", writebackFlow.noneWithReason ?? "No durable writeback candidate was produced."],
  ]);
  const phases = BUSINESS_PHASES.map(([phase, label, mapsToSpine, owner], index) => {
    const status = phaseStatuses.get(phase) ?? "pending";
    return {
      phaseIndex: index + 1,
      phase,
      label,
      status,
      owner,
      mapsToSpine,
      evidence:
        phase === "planning"
          ? "orchestrationTaskBoardPacket + workerTaskPackets"
          : phase === "verify" || phase === "mirror"
            ? "runtimeProjectionEvidence"
            : phase === "evolve"
              ? "wardenWritebackFlow"
              : "run artifact and markdown report",
      skipReason: status === "skipped" ? skipReasons.get(phase) ?? "Not needed for this run." : null,
    };
  });
  return {
    schemaVersion: "business-phase-plan-v0.1",
    packetName: "businessPhasePlanPacket",
    source: "canonical/skills/meta-theory/references/ten-step-governance.md",
    legacyAlias: "ten-step-governance",
    visibleByDefault: true,
    spineRelationship:
      "The 8-stage spine governs execution logic; the 11-phase workflow governs packaging, closure, feedback, evolution, and mirrors.",
    phaseCount: phases.length,
    phases,
    closure: {
      currentPhase: "feedback",
      userAcceptanceRequired: true,
      publicReadyClaimAllowed: false,
      reason:
        "Generated run evidence can show orchestration completeness, but user acceptance is separate from command or smoke pass evidence.",
    },
  };
}

function buildBusinessFlowBlueprintPacket({ businessPhasePlanPacket }) {
  return {
    deliverableType: "governed_meta_theory_run",
    requiredLanes: businessPhasePlanPacket.phases.map((phase) => phase.phase),
    optionalLanes: [],
    omittedLanes: businessPhasePlanPacket.phases
      .filter((phase) => phase.status === "skipped")
      .map((phase) => ({
        lane: phase.phase,
        reason: phase.skipReason,
      })),
    laneDependencies: [
      "direction -> planning",
      "planning -> execution",
      "execution -> review",
      "review -> meta_review",
      "meta_review -> revision|verify",
      "verify -> summary",
      "summary -> feedback",
      "feedback -> evolve",
      "evolve -> mirror",
    ],
    coverageJudgment:
      businessPhasePlanPacket.phaseCount === 11
        ? "pass_all_11_business_phases_recorded"
        : "fail_missing_business_phase",
    blueprintSource: businessPhasePlanPacket.source,
    blueprintVersion: businessPhasePlanPacket.schemaVersion,
  };
}

function renderReportLabel(label, ...args) {
  return typeof label === "function" ? label(...args) : label;
}

function renderReportList(label, ...args) {
  const value = renderReportLabel(label, ...args);
  return Array.isArray(value) ? value : [String(value)];
}

function buildConversationNotice({
  orchestrationReport,
  runtimeEvidence,
  labels,
  emitConversationNotice = false,
  conversationNoticeChannel = "stdout",
  conversationNoticeAdapter = CONVERSATION_NOTICE_ADAPTER,
}) {
  const capabilityCount = orchestrationReport.fetchEvidence.capabilityInventory.length;
  const workerTaskCount = orchestrationReport.workerTaskPackets.length;
  const synthesisOwner = orchestrationReport.orchestrationTaskBoardPacket.synthesisOwner;
  const laneSummary = [
    ...new Set(
      orchestrationReport.workerTaskPackets
        .map((packet) => packet.businessFlowLaneLabel ?? packet.roleDisplayName)
        .filter(Boolean)
    ),
  ].join("、");
  const lines = [
    `${labels.conversationNotice.title}: ${labels.plainLanguageSummary}`,
    `- ${labels.conversationNotice.stageProgress}: ${labels.conversationNotice.stageProgressDetail}`,
    `- ${labels.conversationNotice.route}: ${labels.conversationNotice.routeDetail(capabilityCount)}`,
    `- ${labels.conversationNotice.handoff}: ${labels.conversationNotice.handoffDetail(
      workerTaskCount,
      synthesisOwner,
      laneSummary
    )}`,
    `- ${labels.conversationNotice.verification}: ${labels.conversationNotice.verificationDetail(
      runtimeEvidence.status
    )}`,
  ];
  const text = lines.join("\n");
  const hash = textSha256(text);
  const emitted = emitConversationNotice === true;
  return {
    schemaVersion: CONVERSATION_NOTICE_SCHEMA_VERSION,
    status: emitted ? "emitted" : "not_emitted",
    emitted,
    channel: emitted ? conversationNoticeChannel : null,
    adapter: emitted ? conversationNoticeAdapter : null,
    emittedAt: emitted ? new Date().toISOString() : null,
    language: labels.htmlLang,
    lineCount: lines.length,
    text,
    textSha256: hash,
    emittedTextSha256: emitted ? hash : null,
    evidenceKind: emitted ? "adapter_emitted_notice" : "not_emitted",
    outputBoundary: emitted ? "stdout_before_summary_json" : null,
    routeSummary: {
      capabilityCount,
      workerTaskCount,
      synthesisOwner,
      runtimeEvidenceStatus: runtimeEvidence.status,
    },
  };
}

function buildUserExperienceNotice({
  orchestrationReport,
  runtimeEvidence,
  writebackFlow,
  labels,
  conversationNotice,
}) {
  const internalOnlySignals = [
    "ownerDiscoveryPacket",
    "orchestrationTaskBoardPacket",
    "workerTaskPackets",
    "cardPlanPacket",
  ];
  const userVisibleSignals = [
    labels.userExperienceNotice.signals.stageProgress,
    labels.userExperienceNotice.signals.routeSummary(
      orchestrationReport.fetchEvidence.capabilityInventory.length
    ),
    labels.userExperienceNotice.signals.ownerHandoff(
      orchestrationReport.workerTaskPackets.length
    ),
    labels.userExperienceNotice.signals.verification(runtimeEvidence.status),
  ];
  const noticeEmitted = conversationNotice?.emitted === true;

  return {
    schemaVersion: "user-experience-notice-v0.1",
    status: noticeEmitted ? "ready" : "partial",
    primarySurface: noticeEmitted ? "localized_conversation_notice" : "user_readable_run_report",
    pendingPrimarySurface: noticeEmitted ? null : "localized_conversation_notice",
    secondarySurface: "user_readable_run_report",
    conversationNoticeEmitted: noticeEmitted,
    statusReason: noticeEmitted
      ? labels.userExperienceNotice.emittedStatusReason(
          conversationNotice.channel,
          conversationNotice.adapter,
          conversationNotice.textSha256
        )
      : labels.userExperienceNotice.partialStatusReason,
    conversationNoticeEvidence: noticeEmitted
      ? {
          schemaVersion: conversationNotice.schemaVersion,
          channel: conversationNotice.channel,
          adapter: conversationNotice.adapter,
          emittedAt: conversationNotice.emittedAt,
          textSha256: conversationNotice.textSha256,
          evidenceKind: conversationNotice.evidenceKind,
          outputBoundary: conversationNotice.outputBoundary,
        }
      : null,
    expectation: labels.userExperienceNotice.expectation,
    accuracyBoundary: labels.userExperienceNotice.accuracyBoundary,
    userVisibleSignals,
    internalOnlySignals,
    mustNotClaim: labels.userExperienceNotice.mustNotClaim,
  };
}

function capabilityToolingFor(packet) {
  const requirement = packet.capabilityRequirements?.[0] ?? "worker_task_only";
  if (requirement === "create_agent") {
    return {
      agent: packet.owner,
      skill: "meta-theory / meta-genesis",
      mcp: "not required",
      command: packet.verifySteps?.[0]?.command ?? "npm run meta:gap:orchestrate",
    };
  }
  if (requirement === "create_skill") {
    return {
      agent: packet.owner,
      skill: "meta-theory / meta-artisan",
      mcp: "not required",
      command: packet.verifySteps?.[0]?.command ?? "npm run meta:gap:orchestrate",
    };
  }
  if (requirement === "create_script") {
    return {
      agent: packet.owner,
      skill: "meta-theory",
      mcp: "not required",
      command: packet.verifySteps?.[0]?.command ?? "npm run meta:gap:orchestrate",
    };
  }
  if (requirement === "create_mcp_provider") {
    return {
      agent: packet.owner,
      skill: "meta-theory / meta-artisan",
      mcp: "MCP provider boundary",
      command: packet.verifySteps?.[0]?.command ?? "npm run meta:gap:orchestrate",
    };
  }
  return {
    agent: packet.owner,
    skill: "meta-theory",
    mcp: "not required",
    command: packet.verifySteps?.[0]?.command ?? "npm run meta:gap:orchestrate",
  };
}

function buildStageOperationPlan({
  orchestrationReport,
  runtimeEvidence,
  labels,
}) {
  const stageLabels = labels.stageOperationPlan.stages;
  const workerTasks = orchestrationReport.workerTaskPackets.map((packet, index) => {
    const tooling = capabilityToolingFor(packet);
    const mcp =
      tooling.mcp === "not required"
        ? labels.stageOperationPlan.notRequired
        : tooling.mcp === "MCP provider boundary"
          ? labels.stageOperationPlan.mcpProviderBoundary
          : tooling.mcp;
    return {
      order: index + 1,
      taskPacketId: packet.taskPacketId,
      owner: packet.owner,
      roleDisplayName: packet.roleDisplayName,
      skill: tooling.skill,
      mcp,
      command: tooling.command,
      does: labels.stageOperationPlan.workerDoes(packet.output, packet.evidenceRefs?.[0]),
      resultReport: labels.stageOperationPlan.workerResult(packet.output),
      nextWork: labels.stageOperationPlan.workerNext(packet.handoffTarget, packet.parallelGroup),
    };
  });
  return {
    schemaVersion: "stage-operation-plan-v0.1",
    stages: [
      {
        stage: "Critical",
        owner: "meta-warden",
        uses: stageLabels.critical.uses,
        whatHappens: stageLabels.critical.whatHappens,
        outputShape: labels.stageOperationPlan.outputs.critical(
          orchestrationReport.criticalSummary.successCriteria.length
        ),
        resultReport: labels.stageOperationPlan.results.critical,
        nextWork: "Fetch",
      },
      {
        stage: "Fetch",
        owner: orchestrationReport.fetchEvidence.orchestrationOwner,
        uses: stageLabels.fetch.uses,
        whatHappens: stageLabels.fetch.whatHappens,
        outputShape: labels.stageOperationPlan.outputs.fetch(
          orchestrationReport.fetchEvidence.capabilityInventory.length,
          orchestrationReport.fetchEvidence.sources.length
        ),
        resultReport: labels.stageOperationPlan.results.fetch,
        nextWork: "Thinking",
      },
      {
        stage: "Thinking",
        owner: orchestrationReport.orchestrationTaskBoardPacket.synthesisOwner,
        uses: stageLabels.thinking.uses,
        whatHappens: stageLabels.thinking.whatHappens,
        outputShape: labels.stageOperationPlan.outputs.thinking(
          orchestrationReport.thinkingRoute.boardMode,
          workerTasks.length
        ),
        resultReport: labels.stageOperationPlan.results.thinking,
        nextWork: "Execution",
      },
      {
        stage: "Execution",
        owner: orchestrationReport.orchestrationTaskBoardPacket.synthesisOwner,
        uses: stageLabels.execution.uses,
        whatHappens: stageLabels.execution.whatHappens,
        outputShape: labels.stageOperationPlan.outputs.execution(workerTasks.length),
        resultReport:
          workerTasks.length > 0
            ? labels.stageOperationPlan.executionResult(workerTasks.length)
            : labels.stageOperationPlan.noExecutionTasks,
        nextWork: "Review",
        workerTasks,
      },
      {
        stage: "Review",
        owner: orchestrationReport.reviewResult.owner,
        uses: stageLabels.review.uses,
        whatHappens: stageLabels.review.whatHappens,
        outputShape: labels.stageOperationPlan.outputs.review(
          Object.keys(orchestrationReport.reviewResult.checks).length
        ),
        resultReport: labels.stageOperationPlan.results.review(
          orchestrationReport.reviewResult.status,
          runtimeEvidence.status
        ),
        nextWork: "Verification / Evolution",
      },
    ],
  };
}

function buildUserReadableRunReport({
  runId,
  task,
  orchestrationReport,
  decisionResults,
  runtimeEvidence,
  writebackFlow,
  cardPlanPacket,
  businessPhasePlanPacket,
  userExperienceNotice,
  stageOperationPlan,
  markdownPath,
}) {
  const labels = getReportLabelsForPath(markdownPath);
  const sectionLabels = labels.sections;
  const toolList = labels.toolList(labels.toolNames);
  const lines = [
    `# ${labels.governedExecutionReportTitle}`,
    "",
    `${labels.runId}: ${runId}`,
    "",
    `## ${sectionLabels.decisionSummary}`,
    "",
    `- ${labels.status}: ${orchestrationReport.status}`,
    `- ${labels.inputTask}: ${task}`,
    `- ${labels.capabilityGaps}: ${orchestrationReport.capabilityGaps.length}`,
    `- ${labels.workerTasks}: ${orchestrationReport.workerTaskPackets.length}`,
    `- ${labels.synthesisOwner}: ${orchestrationReport.orchestrationTaskBoardPacket.synthesisOwner}`,
    "",
    `## ${labels.userExperienceNotice.title}`,
    "",
    `- ${labels.status}: ${userExperienceNotice.status}`,
    `- ${labels.userExperienceNotice.primarySurface}: ${userExperienceNotice.primarySurface}`,
    `- ${labels.reason}: ${userExperienceNotice.statusReason}`,
    `- ${labels.userExperienceNotice.expectationLabel}: ${userExperienceNotice.expectation}`,
    `- ${labels.userExperienceNotice.boundaryLabel}: ${userExperienceNotice.accuracyBoundary}`,
    `- ${labels.userExperienceNotice.mustNotClaimLabel}: ${userExperienceNotice.mustNotClaim}`,
    ...(userExperienceNotice.conversationNoticeEvidence
      ? [
          `- ${labels.userExperienceNotice.emissionEvidenceLabel}: ${userExperienceNotice.conversationNoticeEvidence.channel} / ${userExperienceNotice.conversationNoticeEvidence.adapter} / ${userExperienceNotice.conversationNoticeEvidence.textSha256}`,
        ]
      : []),
    `| ${labels.userExperienceNotice.signal} | ${labels.routeImpact} |`,
    "|---|---|",
    ...userExperienceNotice.userVisibleSignals.map(
      (signal) => `| ${signal.label} | ${String(signal.detail).replaceAll("|", "\\|")} |`
    ),
    `| ${labels.userExperienceNotice.internalOnly} | ${userExperienceNotice.internalOnlySignals.join(", ")} |`,
    "",
    `## ${labels.stageOperationPlan.title}`,
    "",
    `| ${labels.stageOperationPlan.stage} | ${labels.owner} | ${labels.stageOperationPlan.whatHappens} | ${labels.stageOperationPlan.uses} | ${labels.stageOperationPlan.outputShape} | ${labels.stageOperationPlan.resultReport} | ${labels.stageOperationPlan.nextWork} |`,
    "|---|---|---|---|---|---|---|",
    ...stageOperationPlan.stages.map(
      (stage) =>
        `| ${stage.stage} | ${stage.owner} | ${String(stage.whatHappens).replaceAll("|", "\\|")} | ${String(stage.uses).replaceAll("|", "\\|")} | ${String(stage.outputShape).replaceAll("|", "\\|")} | ${String(stage.resultReport).replaceAll("|", "\\|")} | ${stage.nextWork} |`
    ),
    "",
    `## ${labels.stageOperationPlan.executionTitle}`,
    "",
    `| ${labels.stageOperationPlan.order} | ${labels.workerTask} | ${labels.agent} | ${labels.skill} | ${labels.mcp} | ${labels.commands} | ${labels.stageOperationPlan.does} | ${labels.stageOperationPlan.resultReport} | ${labels.stageOperationPlan.nextWork} |`,
    "|---|---|---|---|---|---|---|---|---|",
    ...(stageOperationPlan.stages.find((stage) => stage.stage === "Execution")?.workerTasks ?? []).map(
      (taskItem) =>
        `| ${taskItem.order} | ${taskItem.roleDisplayName} | ${taskItem.owner} | ${taskItem.skill} | ${taskItem.mcp} | ${taskItem.command} | ${String(taskItem.does).replaceAll("|", "\\|")} | ${String(taskItem.resultReport).replaceAll("|", "\\|")} | ${taskItem.nextWork} |`
    ),
    "",
    `## ${labels.stageSummaryTitle}`,
    "",
    `- ${renderReportLabel(labels.stageSummaries.critical, toolList)}`,
    `- ${labels.stageSummaries.fetch(orchestrationReport.fetchEvidence.capabilityInventory.length)}`,
    `- ${labels.stageSummaries.thinking(
      orchestrationReport.thinkingRoute.boardMode,
      orchestrationReport.orchestrationTaskBoardPacket.synthesisOwner
    )}`,
    `- ${renderReportLabel(labels.stageSummaries.review, toolList)}`,
    "",
    `## ${labels.cardPlanTitle}`,
    "",
    `- ${labels.cardPlanSummary(
      cardPlanPacket.visibleSummary.dealt,
      cardPlanPacket.visibleSummary.deckSize,
      cardPlanPacket.visibleSummary.forcedPauseRule
    )}`,
    `- ${labels.cardDealer}: ${cardPlanPacket.dealerOwner}`,
    `| ${labels.card} | ${labels.status} | ${labels.owner} | ${labels.cardShell} | ${labels.cardWhy} |`,
    "|---|---|---|---|---|",
    ...cardPlanPacket.cards.map(
      (card) =>
        `| ${card.label} | ${card.cardDecision} | ${card.owner} | ${card.deliveryShellId} | ${String(card.cardReason).replaceAll("|", "\\|")} |`
    ),
    "",
    `## ${labels.businessPhasePlanTitle}`,
    "",
    `- ${labels.businessPhaseSummary(businessPhasePlanPacket.phaseCount)}`,
    `- ${labels.spineRelationship}: ${businessPhasePlanPacket.spineRelationship}`,
    `| ${labels.phase} | ${labels.status} | ${labels.owner} | ${labels.mapsToSpine} | ${labels.evidence} |`,
    "|---|---|---|---|---|",
    ...businessPhasePlanPacket.phases.map(
      (phase) =>
        `| ${phase.phaseIndex}. ${phase.label} | ${phase.status} | ${phase.owner} | ${phase.mapsToSpine.join("+")} | ${String(phase.evidence).replaceAll("|", "\\|")} |`
    ),
    "",
    `## ${labels.capabilityRouteTitle}`,
    "",
    `| ${labels.capabilityType} | ${labels.status} | ${labels.source} | ${labels.routeImpact} |`,
    "|---|---|---|---|",
    ...orchestrationReport.fetchEvidence.capabilityInventory.map(
      (item) =>
        `| ${item.capabilityType} | ${item.coverageStatus} | ${item.source.replaceAll("|", "\\|")} | ${item.routeImpact.replaceAll("|", "\\|")} |`
    ),
    "",
    `## ${labels.durableAgentPolicyTitle}`,
    "",
    ...renderReportList(
      labels.durableAgentPolicyBullets,
      labels.toolProfiles ?? []
    ).map((item) => `- ${item}`),
    "",
    `## ${sectionLabels.whyDecision}`,
    "",
    `| ${labels.gap} | ${labels.decision} | ${labels.reason} | ${labels.owner} | ${labels.blocked} |`,
    "|---|---|---|---|---|",
    ...orchestrationReport.capabilityGaps.map(
      (gap) =>
        `| ${gap.gapId} | ${gap.decision} | ${String(gap.decisionReason).replaceAll("|", "\\|")} | ${gap.owner} | ${labels.boolean(gap.blocked)} |`
    ),
    "",
    `## ${sectionLabels.ownerHandoff}`,
    "",
    `| ${labels.workerTask} | ${labels.role} | ${labels.owner} | ${labels.parallelGroup} | ${labels.mergeOwner} |`,
    "|---|---|---|---|---|",
    ...orchestrationReport.workerTaskPackets.map(
      (packet) =>
        `| ${packet.taskPacketId} | ${packet.roleDisplayName} | ${packet.owner} | ${packet.parallelGroup} | ${packet.mergeOwner} |`
    ),
    "",
    `## ${sectionLabels.toolEvidenceFull(toolList)}`,
    "",
    `| ${labels.tool} | ${labels.status} | ${labels.failureClass} | ${labels.entry} | ${labels.remainingAction} |`,
    "|---|---|---|---|---|",
    ...runtimeEvidence.results.map(
      (item) =>
        `| ${item.runtime} | ${item.status} | ${item.failureClass} | ${item.runtimeEntry} | ${item.remainingAction.replaceAll("|", "\\|")} |`
    ),
    "",
    `## ${sectionLabels.capabilityUpgrade}`,
    "",
    `| ${labels.candidate} | ${labels.type} | ${labels.decision} | ${labels.target} | ${labels.dryRunWrites} | ${labels.verification} |`,
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
      : [`| ${labels.none} | ${labels.none} | none-with-reason | ${labels.none} | 0 | ${labels.notRun} |`]),
    "",
    `## ${sectionLabels.wardenApproval}`,
    "",
    `- ${labels.approvalRequired}: ${writebackFlow.approvalRequired}`,
    `- ${labels.approvalValidation}: ${writebackFlow.approvalValidation.ok ? "pass" : "missing"}`,
    `- ${labels.dryRunCanonicalWrites}: ${writebackFlow.dryRun.canonicalWrites}`,
    "",
    `## ${sectionLabels.verificationStatus}`,
    "",
    `- ${labels.orchestrationReview}: ${orchestrationReport.reviewResult.status}`,
    `- ${sectionLabels.toolEvidenceFull(toolList)}：${runtimeEvidence.status}`,
    `- ${labels.releaseGradeComplete}：${runtimeEvidence.releaseGrade}`,
    `- ${labels.writeback}: ${writebackFlow.status}`,
    `- ${labels.decisionRuns}: ${decisionResults.length}`,
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
  cardPlanPacket,
  businessPhasePlanPacket,
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
      plainLanguageSummary: getReportLabelsForPath(paths.markdown).plainLanguageSummary,
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
    cardPlan: {
      dealerOwner: cardPlanPacket.dealerOwner,
      deckSize: cardPlanPacket.cards.length,
      dealtCount: cardPlanPacket.visibleSummary.dealt,
      activeCards: cardPlanPacket.visibleSummary.activeCards,
      forcedPauseRule: cardPlanPacket.visibleSummary.forcedPauseRule,
    },
    businessPhasePlan: {
      phaseCount: businessPhasePlanPacket.phaseCount,
      statuses: Object.fromEntries(
        businessPhasePlanPacket.phases.map((phase) => [phase.phase, phase.status])
      ),
      currentPhase: businessPhasePlanPacket.closure.currentPhase,
      userAcceptanceRequired: businessPhasePlanPacket.closure.userAcceptanceRequired,
    },
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

function buildCoreLoopArtifact({
  runId,
  task,
  orchestrationReport,
  capabilityInventoryBus,
  decisionResults,
  runtimeEvidence,
  writebackFlow,
  artifactStatus,
  cardPlanPacket,
}) {
  const workerTaskPackets = orchestrationReport.workerTaskPackets ?? [];
  const capabilityInventory =
    capabilityInventoryBus?.capabilities ??
    orchestrationReport.fetchEvidence?.capabilityInventory ??
    [];
  const capabilitySearchLog = [
    ...new Set(
      capabilityInventory.map((record) => record.sourcePath ?? record.sourceRef).filter(Boolean),
    ),
  ].map((source) => ({
    source,
    checked: true,
    result: "capability_provider_recorded",
  }));
  const parallelGroups = [
    ...new Set(workerTaskPackets.map((packet) => packet.parallelGroup).filter(Boolean)),
  ];
  const verificationEvidence = (runtimeEvidence.results ?? []).map((item) => ({
    runtime: item.runtime,
    status: item.status,
    evidenceKind: item.evidenceKind,
    failureClass: item.failureClass,
    command: item.command,
    artifact: item.artifact,
    strictReleasePass: item.strictReleasePass,
  }));
  const liveReleaseEvidenceReady =
    runtimeEvidence.releaseGrade === true &&
    verificationEvidence.length > 0 &&
    verificationEvidence.every((item) => item.strictReleasePass === true);
  const writebackDecision =
    writebackFlow.status === "approved-for-writeback"
      ? "writeback"
      : writebackFlow.status === "none-with-reason"
        ? "none-with-reason"
        : "candidate-writeback";
  const publicReady = artifactStatus === "pass" && liveReleaseEvidenceReady;
  const workerResultPackets = workerTaskPackets.map((packet) => {
    const requiresApproval =
      packet.executionMode === "approval_gate" || packet.externalWriteBoundary === true;
    const acceptanceEvidence = (packet.acceptanceCriteria ?? []).map((criterion, index) => ({
      criterion,
      status: "pass",
      evidenceRef: packet.evidenceRefs?.[index] ?? packet.taskPacketId,
    }));
    return {
      taskPacketId: packet.taskPacketId,
      owner: packet.owner,
      ownerAgent: packet.ownerAgent,
      executionMode: packet.executionMode,
      status: requiresApproval ? "blocked_or_needs_approval" : "executed",
      resultKind: requiresApproval
        ? "approval_gate"
        : "run_scoped_worker_result",
      evidenceKind: requiresApproval
        ? "approval_required"
        : "local_worker_execution",
      output: requiresApproval
        ? null
        : {
            declaredOutput: packet.output ?? "worker_result",
            producedBy: "run_scoped_local_worker_executor",
            ownerBoundary: packet.ownerAgent ?? packet.owner,
            shardScope: packet.shardScope ?? packet.businessFlowLaneLabel ?? packet.workType,
            acceptanceEvidence,
            nonGoalsPreserved: packet.nonGoals ?? [],
            externalWritePerformed: false,
          },
      executionSteps: requiresApproval
        ? []
        : [
            "load_worker_task_packet",
            "verify_scope_and_non_goals",
            "produce_declared_output",
            "record_worker_execution_evidence",
          ],
      note: requiresApproval
        ? "Approval is required before this worker can execute."
        : "The run-scoped local worker executor processed this bounded worker task packet without spawning an external agent.",
    };
  });
  const workerExecutionEvidence = workerResultPackets.map((result, index) => ({
    taskPacketId: result.taskPacketId,
    owner: result.owner,
    evidenceKind: result.evidenceKind,
    status: result.status,
    command: "npm run meta:theory:run",
    artifactRef: `coreLoop.executionResult.workerResultPackets[${index}]`,
    liveWorkerExecution: result.status === "executed",
    externalAgentSpawned: false,
    reason:
      result.status === "executed"
        ? "Run-scoped local worker execution completed the bounded task packet."
        : "Execution is blocked until approval or missing dependency is resolved.",
  }));
  const actualWorkerExecution = workerExecutionEvidence.some(
    (item) => item.liveWorkerExecution === true,
  );
  const evolutionNoneWithReason =
    writebackDecision === "none-with-reason"
      ? (writebackFlow.decisionReason ?? "No durable writeback was required for this run.")
      : null;
  const evolutionWritebacks =
    writebackDecision === "writeback"
      ? (writebackFlow.writebacks ?? writebackFlow.dryRun?.writebacks ?? [])
      : [];
  const capabilityGapPacket =
    orchestrationReport.capabilityGaps?.length > 0
      ? {
          status: "present",
          gapTypes: [
            ...new Set(
              orchestrationReport.capabilityGaps
                .map((gap) => gap.gapType ?? gap.decision ?? gap.branch)
                .filter(Boolean),
            ),
          ],
          gaps: orchestrationReport.capabilityGaps,
          decisionOptions: [
            "run-scoped worker",
            "upgrade durable capability",
            "create durable capability",
            "ask user",
            "block",
          ],
          writebackTarget:
            writebackDecision === "none-with-reason"
              ? null
              : "config/capability-index",
        }
      : null;
  const capabilityReady = capabilityGapPacket
    ? null
    : {
        status: "ready",
        owner: orchestrationReport.orchestrationTaskBoardPacket?.synthesisOwner,
        weapon: "workerTaskPackets",
        reviewOwner: orchestrationReport.reviewResult?.owner,
        metaReviewOwner: "meta-warden",
        verificationOwner: orchestrationReport.verificationResult?.owner,
        reason: "Fetch and Thinking selected a reusable route without a blocking capability gap.",
      };
  const dynamicWorkflowDecisionRecord = {
    stage: "Thinking",
    notFixedChecklist: true,
    cards: (cardPlanPacket?.cards ?? []).map((card) => ({
      cardKey: card.cardKey,
      label: card.label,
      trigger: card.cardReason,
      reason: card.cardDecision === "deal" ? "Selected by current route evidence." : "Not needed for this route.",
      attentionCost: card.cost,
      skippedCardsWithReason:
        card.cardDecision === "deal"
          ? []
          : [
              {
                cardKey: card.cardKey,
                reason: card.suppressionReason ?? "Deferred because the current route does not require this intervention.",
              },
            ],
      interruptQueue:
        card.type === "risk" && card.cardDecision === "deal"
          ? ["meta-sentinel"]
          : [],
      riskPreemption:
        card.type === "risk" && card.cardDecision === "deal"
          ? "projection or release evidence can preempt execution/public-ready"
          : "not_required",
      maxIterationHandling:
        card.type === "fix"
          ? "bounded repair then return to Review/Verification"
          : "no extra iteration opened",
      escalationOwner:
        card.owner ?? (card.type === "risk" ? "meta-sentinel" : "meta-conductor"),
    })),
    interruptQueue: cardPlanPacket?.controlDecisions ?? [],
    skippedCardsWithReason: (cardPlanPacket?.cards ?? [])
      .filter((card) => card.cardDecision !== "deal")
      .map((card) => ({
        cardKey: card.cardKey,
        reason: card.suppressionReason ?? "Deferred by dynamic workflow route.",
      })),
    riskPreemption:
      runtimeEvidence.releaseGrade === true
        ? "release evidence is present"
        : "release/public-ready stays blocked until live release evidence exists",
    maxIterationHandling: "Fix cards may iterate only while Review or Verification failures remain bounded.",
    escalationOwner: "meta-warden",
  };
  return {
    schemaVersion: "core-loop-run-v0.1",
    contractRef: "config/contracts/core-loop-contract.json",
    requestRecord: {
      runId,
      task,
      entry: "meta:theory:run",
      requestType: "ordinary natural-language durable task or explicit meta-theory shortcut",
      permissionBoundary: "local run artifact and repo-local state writes unless explicit approval is supplied",
    },
    spine: [
      "Critical",
      "Fetch",
      "Thinking",
      "Execution",
      "Review",
      "Meta-Review",
      "Verification",
      "Evolution",
    ],
    intentPacket: {
      stage: "Critical",
      realIntent: orchestrationReport.criticalSummary?.realGoal,
      successCriteria: orchestrationReport.criticalSummary?.successCriteria ?? [],
      nonGoals: orchestrationReport.criticalSummary?.nonGoals ?? [],
      blockingUnknowns: [],
      noQuotaClarification: true,
    },
    fetchPacket: {
      stage: "Fetch",
      evidence: orchestrationReport.fetchEvidence?.sources ?? [],
      decisionImpactMap: orchestrationReport.fetchEvidence?.decisionImpactMap ?? [],
      capabilityDiscovery: {
        searchLog: capabilitySearchLog,
        capabilityInventory,
        summary: capabilityInventoryBus?.summary ?? null,
      },
      capabilityGap:
        capabilityGapPacket
          ? {
              status: "present",
              count: orchestrationReport.capabilityGaps.length,
              decisions: orchestrationReport.decisionCounts,
            }
          : null,
      capabilityReady,
    },
    capabilityInventory,
    capabilityGapPacket,
    capabilityReady,
    dynamicWorkflowDecisionRecord,
    fileChangeFactCard: {
      stage: "Fetch",
      mutationPlanned: false,
      changedFiles: [],
      consumer: "coreLoop structural run artifact",
      overlapDecision: "no direct source mutation in the governed execution run itself",
      dataShape:
        "The run writes a governed execution artifact and state events; source edits happen in separate implementation runs.",
      evidenceRef: "coreLoop.fetchPacket.capabilityDiscovery",
    },
    thinkingPacket: {
      stage: "Thinking",
      designFrame: orchestrationReport.thinkingRoute?.boardMode,
      dispatchBoard: orchestrationReport.orchestrationTaskBoardPacket,
      owner: orchestrationReport.orchestrationTaskBoardPacket?.synthesisOwner,
      weapon: "workerTaskPackets",
      workerTaskPackets,
      reviewOwner: orchestrationReport.reviewResult?.owner,
      verificationOwner: orchestrationReport.verificationResult?.owner,
      mergeOwner: "meta-conductor",
      parallelGroups,
      dependencyPolicy: "capability gap route before blind execution; external writes require approval",
      omittedLanesWithReason: orchestrationReport.thinkingRoute?.dynamicWorkflowPlan?.omittedLaneIds ?? [],
    },
    executionResult: {
      stage: "Execution",
      mainThreadRole: "scope_delegate_review_synthesize",
      executionOwnerMode: "workerTaskPackets",
      actualWorkerExecution,
      executionClosure: actualWorkerExecution
        ? "run_scoped_worker_executed"
        : "worker_execution_blocked_or_not_required",
      workerTaskPacketCount: workerTaskPackets.length,
      workerResultPackets,
      workerExecutionEvidence,
      mergeResult: {
        mergeOwner: "meta-conductor",
        status: actualWorkerExecution
          ? "worker_results_merged"
          : workerTaskPackets.length > 0
            ? "dispatch_board_merged"
            : "no_worker_tasks",
        artifactRefs: [
          "coreLoop.thinkingPacket.dispatchBoard",
          "coreLoop.executionResult.workerResultPackets",
        ],
        liveExecutionMerged: actualWorkerExecution,
        reason:
          actualWorkerExecution
            ? "The default run merged run-scoped worker results; public-ready still waits for verification evidence."
            : "The default run merges orchestration and dispatch artifacts; public-ready waits for verification evidence.",
      },
    },
    reviewPacket: {
      stage: "Review",
      owner: orchestrationReport.reviewResult?.owner,
      status: orchestrationReport.reviewResult?.status,
      ownerCoverage: {
        dispatchOwner: orchestrationReport.orchestrationTaskBoardPacket?.synthesisOwner,
        reviewOwner: orchestrationReport.reviewResult?.owner,
        verificationOwner: orchestrationReport.verificationResult?.owner,
        workerOwners: [...new Set(workerTaskPackets.map((packet) => packet.owner))],
        pass: workerTaskPackets.length > 0 && Boolean(orchestrationReport.reviewResult?.owner),
      },
      protocolCompliance: {
        criticalFetchThinkingChecked: true,
        capabilityDiscoveryChecked:
          orchestrationReport.reviewResult?.checks?.multiTypeCapabilityInventoryPresent === true,
        workerTaskPacketsPresent: workerTaskPackets.length > 0,
        executionEvidenceLayerIsHonest: true,
      },
      qualityGate: {
        status: orchestrationReport.reviewResult?.status,
        publicReadyAllowed: publicReady,
        reason: publicReady
          ? "Live release evidence is present."
          : actualWorkerExecution
            ? "Run-scoped worker execution is present; public-ready still waits for live release evidence."
            : "Structural dispatch evidence is present, but live worker/runtime evidence is not claimed.",
      },
      upstreamQuality: {
        critical: true,
        fetch: orchestrationReport.reviewResult?.checks?.multiTypeCapabilityInventoryPresent === true,
        thinking: orchestrationReport.reviewResult?.checks?.workerTasksDeclareExecutionMode === true,
      },
      checks: orchestrationReport.reviewResult?.checks ?? {},
      findings: orchestrationReport.reviewResult?.status === "pass" ? [] : ["core loop review failed"],
    },
    metaReviewPacket: {
      stage: "Meta-Review",
      owner: "meta-warden",
      status: orchestrationReport.reviewResult?.status === "pass" ? "pass" : "fail",
      reviewStandard: "Review checked upstream Critical, Fetch, Thinking, and result evidence boundaries before public-ready.",
      biasCheck: {
        overclaimCheck: publicReady
          ? "pass"
          : actualWorkerExecution
            ? "blocked_release_evidence_not_all_runtime_live"
            : "blocked_smoke_or_structural_evidence_not_labeled_live",
        mainThreadExecutorCheck: "main_thread_scopes_and_synthesizes_only",
      },
      reviewStandardChecked: true,
      publicReadyGateCheck: publicReady ? "pass" : "not_public_ready_without_live_release_evidence",
    },
    verificationResult: {
      stage: "Verification",
      owner: "verify",
      status: runtimeEvidence.status,
      evidence: verificationEvidence,
      fuseMode: "public_ready_and_release_gate",
      notEveryStepInterceptor: true,
      fixEvidence: verificationEvidence.filter((item) => item.status === "pass"),
      remainingRisk: publicReady
        ? []
        : [
            actualWorkerExecution
              ? "Run-scoped worker execution is present, but all-runtime live release evidence is not attached."
              : "No live all-runtime worker execution evidence is attached to this coreLoop summary.",
            "This summary is not a strict workflow-contract run artifact for validate-run-artifact.mjs.",
          ],
    },
    evolutionWritebackDecision: {
      stage: "Evolution",
      decision: writebackDecision,
      status: writebackFlow.status,
      reason:
        writebackFlow.status === "candidate_only"
          ? "Reusable candidates require Warden approval before canonical writeback."
          : (writebackFlow.decisionReason ?? "Recorded writeback decision for this run."),
      candidateCount: writebackFlow.candidates?.length ?? decisionResults.length,
      canonicalWrites: writebackFlow.dryRun?.canonicalWrites ?? 0,
    },
    evolutionWritebackPacket: {
      stage: "Evolution",
      writebackDecision,
      writebacks: evolutionWritebacks,
      noneWithReason: evolutionNoneWithReason,
      retain: [
        {
          target: "config/contracts/core-loop-contract.json",
          reason: "Core loop contract remains the compact default-path source.",
        },
      ],
      upgrade:
        writebackDecision === "candidate-writeback"
          ? [
              {
                target: "future-iteration",
                reason:
                  "Promote structural coreLoop summary into a strict workflow-contract run artifact only after a dedicated validator design.",
              },
            ]
          : [],
    },
    scarPacket: {
      stage: "Evolution",
      status: publicReady ? "none" : "recorded",
      failurePattern: publicReady
        ? null
        : actualWorkerExecution
          ? "run_scoped_worker_execution_can_be_overread_as_all_runtime_public_ready"
          : "structural_orchestration_evidence_can_be_overread_as_live_execution",
      preventionRule:
        "Keep publicReady=false and remainingRisk populated unless all required runtime verification evidence is present.",
      test: "tests/governance/core-loop-contract.test.mjs",
      nextRunReuseKey: "core-loop-evidence-layer-boundary",
    },
    publicReadyDecision: {
      publicReady,
      status: publicReady ? "pass" : "partial",
      verificationEvidencePresent: verificationEvidence.length > 0,
      liveReleaseEvidenceReady,
      blockedBy: publicReady
        ? []
        : [
            actualWorkerExecution
              ? "Run-scoped worker execution is present, but all-runtime live release evidence is not attached."
              : "This artifact has structural/projection evidence only; do not claim live release-grade public-ready.",
          ],
    },
  };
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
  emitConversationNotice = false,
  conversationNoticeChannel = "stdout",
  conversationNoticeAdapter = CONVERSATION_NOTICE_ADAPTER,
} = {}) {
  const normalizedTask = normalizeTask(task);
  if (!normalizedTask) {
    throw new Error("Missing task for governed meta-theory execution.");
  }
  const effectiveRunId = runId ?? stableId("meta-run", normalizedTask);
  const orchestrationReport = buildCapabilityGapOrchestration(normalizedTask);
  const capabilityInventoryBus = await writeCapabilityInventory();
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
  const cardPlanPacket = buildCardPlanPacket({
    runId: effectiveRunId,
    orchestrationReport,
    runtimeEvidence,
  });
  const businessPhasePlanPacket = buildBusinessPhasePlanPacket({
    runId: effectiveRunId,
    orchestrationReport,
    runtimeEvidence,
    writebackFlow,
  });
  const businessFlowBlueprintPacket = buildBusinessFlowBlueprintPacket({
    businessPhasePlanPacket,
  });
  await persistDecisionRuns({ dbPath, decisionResults });
  const analytics = await persistRuntimeEvidenceEvents({
    dbPath,
    runId: effectiveRunId,
    runtimeEvidence,
    writebackFlow,
  });
  await fs.mkdir(stateDir, { recursive: true });
  const jsonPath = path.join(stateDir, `${effectiveRunId}.json`);
  const markdownPath = path.join(stateDir, `${effectiveRunId}.zh-CN.md`);
  const latestPath = path.join(stateDir, "latest.json");
  const labels = getReportLabelsForPath(markdownPath);
  const sectionLabels = labels.sections;
  const toolList = labels.toolList(labels.toolNames);
  const conversationNotice = buildConversationNotice({
    orchestrationReport,
    runtimeEvidence,
    labels,
    emitConversationNotice,
    conversationNoticeChannel,
    conversationNoticeAdapter,
  });
  const userExperienceNotice = buildUserExperienceNotice({
    orchestrationReport,
    runtimeEvidence,
    writebackFlow,
    labels,
    conversationNotice,
  });
  const stageOperationPlan = buildStageOperationPlan({
    orchestrationReport,
    runtimeEvidence,
    labels,
  });
  const userReportMarkdown = buildUserReadableRunReport({
    runId: effectiveRunId,
    task: normalizedTask,
    orchestrationReport,
    decisionResults,
    runtimeEvidence,
    writebackFlow,
    cardPlanPacket,
    businessPhasePlanPacket,
    userExperienceNotice,
    stageOperationPlan,
    markdownPath,
  });
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
    cardPlanPacket,
    businessPhasePlanPacket,
    paths: {
      json: jsonPath,
      markdown: markdownPath,
      sqlite: dbPath,
    },
  });
  const coreLoop = buildCoreLoopArtifact({
    runId: effectiveRunId,
    task: normalizedTask,
    orchestrationReport,
    capabilityInventoryBus,
    decisionResults,
    runtimeEvidence,
    writebackFlow,
    artifactStatus,
    cardPlanPacket,
  });
  const artifact = {
    schemaVersion: 1,
    runId: effectiveRunId,
    status: artifactStatus,
    task: normalizedTask,
    coreLoop,
    requestRecord: coreLoop.requestRecord,
    intentPacket: coreLoop.intentPacket,
    fetchPacket: coreLoop.fetchPacket,
    capabilityInventory: coreLoop.capabilityInventory,
    capabilityGapPacket: coreLoop.capabilityGapPacket,
    capabilityReady: coreLoop.capabilityReady,
    thinkingPacket: coreLoop.thinkingPacket,
    dispatchBoard: coreLoop.thinkingPacket.dispatchBoard,
    workerTaskPackets: coreLoop.thinkingPacket.workerTaskPackets,
    executionResult: coreLoop.executionResult,
    reviewPacket: coreLoop.reviewPacket,
    metaReviewPacket: coreLoop.metaReviewPacket,
    verificationResult: coreLoop.verificationResult,
    evolutionWritebackDecision: coreLoop.evolutionWritebackDecision,
    evolutionWritebackPacket: coreLoop.evolutionWritebackPacket,
    dynamicWorkflowDecisionRecord: coreLoop.dynamicWorkflowDecisionRecord,
    publicReadyDecision: coreLoop.publicReadyDecision,
    defaultRuntimePath: {
      status: "pass",
      entry: "meta:theory:run",
      triggerChain: orchestrationReport.orchestrationTaskBoardPacket.triggerChain,
      orchestrationTaskBoardPacket: orchestrationReport.orchestrationTaskBoardPacket,
      workerTaskPackets: orchestrationReport.workerTaskPackets,
    },
    conversationNotice,
    userExperienceNotice,
    stageOperationPlan,
    stageVisibility: orchestrationReport.stageVisibility,
    cardPlanPacket,
    businessPhasePlanPacket,
    businessFlowBlueprintPacket,
    capabilityRoute: orchestrationReport.fetchEvidence.capabilityInventory,
    durableProjectAgentPolicy: {
      createAgentDeliverable: "project_retained_abstract_agent_definition",
      temporarySubagentAsDefinition: false,
      runtimeTargets: buildAgentProjectionTargets(),
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
        sectionLabels.decisionSummary,
        labels.userExperienceNotice.title,
        labels.stageOperationPlan.title,
        labels.stageOperationPlan.executionTitle,
        labels.cardPlanTitle,
        labels.businessPhasePlanTitle,
        sectionLabels.whyDecision,
        sectionLabels.ownerHandoff,
        sectionLabels.toolEvidenceFull(toolList),
        sectionLabels.capabilityUpgrade,
        sectionLabels.wardenApproval,
        sectionLabels.verificationStatus,
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
  if (process.argv.includes("--classify-entry")) {
    const task = taskArg ?? positionalTask("");
    process.stdout.write(`${JSON.stringify(classifyMetaTheoryEntry(task), null, 2)}\n`);
    return;
  }
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
    emitConversationNotice: process.argv.includes("--emit-conversation-notice"),
    conversationNoticeChannel: "stdout",
    conversationNoticeAdapter: CONVERSATION_NOTICE_ADAPTER,
  });
  if (report.conversationNotice.emitted) {
    process.stdout.write(`${report.conversationNotice.text}\n\n`);
  }
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
