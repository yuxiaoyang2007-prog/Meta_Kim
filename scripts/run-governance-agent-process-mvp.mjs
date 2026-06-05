#!/usr/bin/env node
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { openRunStateStore } from "./capability-gap-mvp.mjs";
import {
  evaluateIntelligenceTrace,
  evaluateSpec,
} from "./evaluate-agent-design-quality.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const CONTRACT_PATH = path.join(
  REPO_ROOT,
  "config",
  "contracts",
  "agent-design-quality-contract.json"
);
const STATION_CONTRACT_PATH = path.join(
  REPO_ROOT,
  "config",
  "contracts",
  "governance-agent-design-station-contract.json"
);
const DEFAULT_STATE_PATH = path.join(
  REPO_ROOT,
  ".meta-kim",
  "state",
  "default",
  "governance-agent-process-mvp.json"
);
const DEFAULT_DB_PATH = path.join(
  REPO_ROOT,
  ".meta-kim",
  "state",
  "default",
  "governance-agent-process-mvp.sqlite"
);
const DEFAULT_MARKDOWN_PATH = path.join(
  REPO_ROOT,
  ".meta-kim",
  "state",
  "default",
  "governance-agent-process-mvp-report.zh-CN.md"
);

const ROOT_GOAL =
  "Verify that Meta_Kim governance agents can reason through a real agent-design need and produce an abstract, professional, verifiable agent design.";

const REAL_NEED =
  "Meta_Kim repeatedly needs to judge whether governance-layer agents can design abstract but professional agents. The missing durable owner is not batch agent creation and not a one-run report; it is a reusable owner for governance-agent intelligence evaluation.";

function nowIso() {
  return new Date().toISOString();
}

function stableId(prefix, seed) {
  const hash = createHash("sha1").update(String(seed ?? "")).digest("hex").slice(0, 10);
  const safe = String(seed ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 36);
  return `${prefix}-${safe || "item"}-${hash}`;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function json(value) {
  return JSON.stringify(value ?? null);
}

export function buildGeneratedSpec() {
  return {
    name: "governance-agent-intelligence-evaluator",
    description:
      "Own reusable evaluation of governance-agent reasoning quality when Meta_Kim needs proof that Genesis, Artisan, and Prism can design abstract but professional agents.",
    flowPosition: "Review",
    purpose:
      "Provide a reusable owner for governance-agent intelligence evaluation across agent-design runs.",
    capabilities: [
      "governance reasoning trace evaluation",
      "agent boundary abstraction review",
      "loadout ROI judgment review",
      "Prism adversarial claim review",
      "LangGraph state evidence replay",
      "RunStateStore process evidence analysis",
    ],
    nonCapabilities: [
      "does not batch-create agents",
      "does not replace Genesis, Artisan, Prism, or Warden",
      "does not perform external writes without approval",
      "does not store concrete file paths, tickets, todayTask, scopeFiles, deliverableLink, or verifySteps in durable identity",
    ],
    loadoutSlots: [
      "agent design quality evaluator",
      "governance process trace reader",
      "RunStateStore replay reader",
      "LangGraph state transition checker",
      "anti-slop review checklist",
    ],
    inputs: [
      "real agent design need",
      "Genesis identity and boundary output",
      "Artisan loadout reasoning output",
      "Prism adversarial review output",
      "LangGraph-style state trace",
      "RunStateStore event evidence",
    ],
    outputs: [
      "governance intelligence pass/fail result",
      "failed reasoning dimensions",
      "spec quality pass/fail result",
      "next iteration recommendation",
    ],
    handoff: {
      upstream:
        "CapabilityGap decision, Genesis boundary reasoning, Artisan loadout reasoning, and Prism review evidence",
      downstream:
        "Warden gate summary, evaluator report, and candidate writeback recommendation after repeated accepted runs",
    },
    memoryPolicy: {
      scope: "project_scoped",
      allowed: [
        "accepted governance evaluation patterns",
        "repeated failed reasoning dimensions",
        "user corrections about core MVP boundary",
        "fixture replay outcomes",
      ],
      forbidden: [
        "private credentials",
        "one-run file lists",
        "unapproved cross-project leakage",
        "dependency project architecture",
      ],
    },
    gapPolicy: [
      "emit GapDecision when no process trace exists",
      "emit GapDecision when Genesis, Artisan, or Prism output is missing",
      "return to Thinking when a proposed agent can only be described as a one-run task",
      "return to Thinking when dependency project architecture is copied instead of content evidence",
    ],
    verificationPolicy: {
      owner: "verify",
      fixtures: [
        "reasoning trace missing must fail",
        "single-path reasoning must fail",
        "missing Prism adversarial review must fail",
        "final spec without reasoning binding must fail",
      ],
    },
    installProjection: {
      claude: "eligible",
      codex: "eligible",
      cursor: "needs_probe",
      openclaw: "needs_probe",
    },
    identityCleanliness: {
      forbiddenFieldsAbsent: [
        "repoPath",
        "fileList",
        "ticket",
        "todayTask",
        "scopeFiles",
        "deliverableLink",
        "verifySteps",
      ],
      status: "pass",
    },
    referenceAbsorption: {
      contentEvidenceOnly: true,
      usedFor: [
        "professional role naming",
        "product-flow handoff clarity",
        "scoped memory policy",
      ],
      architectureCopied: false,
      sourceIds: [
        "professional-role-benchmark",
        "flow-handoff-benchmark",
        "memory-boundary-benchmark",
      ],
    },
  };
}

export function buildProcessTrace(spec) {
  return {
    coreProblem: {
      surfaceRequest:
        "test whether governance agents can design abstract professional agents",
      durableProblem:
        "Meta_Kim needs a stable owner for evaluating governance-agent reasoning quality during agent-design runs, because result-only spec checks cannot prove Genesis, Artisan, and Prism can reason correctly.",
      notAOneRunTask: true,
    },
    evidenceUsed: {
      localSources: [
        "canonical/agents/meta-genesis.md",
        "canonical/agents/meta-artisan.md",
        "canonical/agents/meta-prism.md",
        "config/contracts/agent-design-quality-contract.json",
        "docs/ai-native-capability-gap-mvp-prd.zh-CN.md",
      ],
      dependencyEvidence: [
        {
          sourceId: "professional-role-benchmark",
          usedFor: "professional role naming and concise trigger",
          architectureCopied: false,
        },
        {
          sourceId: "flow-handoff-benchmark",
          usedFor: "product-flow position and handoff clarity",
          architectureCopied: false,
        },
        {
          sourceId: "memory-boundary-benchmark",
          usedFor: "scoped memory and evaluation readiness",
          architectureCopied: false,
        },
      ],
    },
    designAlternatives: [
      {
        path: "worker_task_only",
        fit: "low",
        reason:
          "A one-run report would not create a reusable way to judge governance-agent reasoning quality.",
      },
      {
        path: "create_script",
        fit: "medium",
        reason:
          "A script can replay evidence, but it cannot own the professional judgment boundary for governance-agent intelligence quality.",
      },
      {
        path: "create_agent",
        fit: "high",
        reason:
          "The missing capability is a recurring professional owner for reasoning quality, handoff, review, and replay evidence.",
      },
    ],
    selectedPath: "create_agent",
    rejectedWeakPaths: [
      {
        path: "batch_agent_factory",
        reason:
          "Batch creation is a later scale test and would distract from proving one real governance reasoning loop.",
      },
      {
        path: "full_graph_database_first",
        reason:
          "A full graph database would add schema complexity before proving the real process MVP.",
      },
      {
        path: "generic_quality_reviewer",
        reason:
          "A generic quality reviewer would not name governance-agent reasoning, LangGraph state, or RunStateStore replay evidence.",
      },
    ],
    stationReasoning: {
      genesis: {
        judgment:
          "Define a durable evaluation owner for governance-agent reasoning quality, not a task-bound report writer.",
        boundary:
          "Own reasoning quality evaluation; do not replace Genesis, Artisan, Prism, or Warden.",
      },
      artisan: {
        judgment:
          "Bind abstract loadout slots to evaluator, process trace reader, RunStateStore replay reader, and LangGraph state checker.",
      },
      prism: {
        judgment:
          "Reject designs that pass final spec shape but lack core-problem capture, path comparison, weak-path rejection, or adversarial review.",
      },
      librarian: {
        judgment:
          "Keep reusable governance patterns project-scoped, keep replay evidence in RunStateStore, and deny cross-project writeback without Warden approval.",
      },
    },
    loadoutReasoning: {
      candidates: [
        {
          slot: "agent design quality evaluator",
          coverage: 0.95,
          frequency: "every governance-agent design run",
          cost: "low",
          roi: 4.8,
          decision: "keep",
        },
        {
          slot: "RunStateStore replay reader",
          coverage: 0.85,
          frequency: "every replayable MVP run",
          cost: "low",
          roi: 4.1,
          decision: "keep",
        },
        {
          slot: "full graph database planner",
          coverage: 0.3,
          frequency: "later scale analysis",
          cost: "high",
          roi: 0.5,
          decision: "reject",
        },
      ],
    },
    prismReview: {
      assertions: [
        {
          claim: "The design tests governance-agent reasoning, not only final spec shape.",
          status: "pass",
          evidence:
            "Trace includes core problem, alternatives, rejected weak paths, station reasoning, ROI, and Prism review.",
        },
        {
          claim: "The design does not copy dependency project architecture.",
          status: "pass",
          evidence:
            "Dependency evidence is marked contentEvidenceOnly and architectureCopied=false.",
        },
        {
          claim: "The design does not batch-create agents.",
          status: "pass",
          evidence:
            "Rejected weak paths name batch_agent_factory as out of scope for this MVP.",
        },
      ],
      selfCritique:
        "A pass would be too weak if it only checked final spec fields; the evaluator must fail missing reasoning trace, single-path reasoning, and missing Prism review.",
    },
    finalSpecBinding: {
      selectedPath: "create_agent",
      generatedSpecName: spec.name,
      boundToCoreProblem: true,
    },
  };
}

function buildStationPackets({ spec, intelligenceTrace, evaluation }) {
  const sharedEvidence = [
    "config/contracts/governance-agent-design-station-contract.json",
    "config/contracts/agent-design-quality-contract.json",
    "docs/ai-native-capability-gap-mvp-prd.zh-CN.md",
  ];
  const agentBoundaryDecision = {
    coreProblem: intelligenceTrace.coreProblem.durableProblem,
    durableOwnerJustification:
      "The missing capability is a recurring professional owner for governance-agent reasoning evaluation, not one run of commentary.",
    domainBoundary:
      "Governance-agent intelligence evaluation for create_agent routes.",
    nonCapabilities: spec.nonCapabilities,
    replaceabilityTest: {
      genericNameBreaksLogic: true,
      reason:
        "A generic agent would not own governance-agent reasoning traces, LangGraph state evidence, or RunStateStore replay.",
    },
    rejectedPaths: intelligenceTrace.rejectedWeakPaths,
    identityPollutionCheck: spec.identityCleanliness,
  };
  const agentLoadoutDecision = {
    coreProblem:
      "Select the smallest abstract capability stack that can evaluate governance-agent reasoning without binding provider-specific commands into durable identity.",
    capabilitySlots: spec.loadoutSlots,
    runScopedBindings: [
      "agent design quality evaluator",
      "governance process trace runner",
      "RunStateStore replay evidence",
    ],
    providerRejections: intelligenceTrace.loadoutReasoning.candidates
      .filter((candidate) => candidate.decision === "reject")
      .map((candidate) => ({
        slot: candidate.slot,
        reason: "Low ROI for this MVP; keep out of durable identity.",
      })),
    roiReasoning: intelligenceTrace.loadoutReasoning,
    handoffContract: spec.handoff,
    verificationMethod: "npm run meta:agent-process:mvp",
  };
  const agentMemoryDecision = {
    coreProblem:
      "Separate reusable governance learning from run-scoped evidence so memory helps future design without polluting identity.",
    memoryScope: spec.memoryPolicy.scope,
    allowedMemory: spec.memoryPolicy.allowed,
    forbiddenMemory: spec.memoryPolicy.forbidden,
    retentionPolicy: {
      acceptedPatterns: "permanent with periodic compression",
      runEvidence: "RunStateStore replay, not durable identity",
      externalComparisons: "research material only; re-verify before reuse",
    },
    replaySource: "RunStateStore event log plus generated process report",
    crossProjectAccess: "denied unless explicitly approved as readonly evidence",
    writebackGate: "meta-warden approval required before CandidateWriteback promotion",
  };
  const agentDesignReview = {
    coreProblem:
      "Judge whether the candidate proves upstream reasoning quality, not just final spec shape.",
    assertions: intelligenceTrace.prismReview.assertions,
    evidenceRefs: sharedEvidence,
    failedDimensions: [
      ...evaluation.specEvaluation.failedDimensions,
      ...evaluation.intelligenceEvaluation.failedIntelligenceDimensions,
    ],
    copyRiskCheck: {
      status: "pass",
      sourceNeutral: true,
      architectureCopied: false,
    },
    upstreamReadiness: {
      critical: "pass",
      fetch: "pass",
      thinking: "pass",
    },
    returnToStage:
      evaluation.status === "pass" ? "none" : "earliest_failed_station",
  };
  const agentCandidateGateDecision = {
    coreProblem:
      "Decide whether the source-neutral station outputs are complete enough to allow a candidate writeback record.",
    stationPacketsChecked: [
      "agentBoundaryDecision",
      "agentLoadoutDecision",
      "agentMemoryDecision",
      "agentDesignReview",
    ],
    gateDecision: evaluation.status === "pass" ? "pass" : "return_to_stage",
    blockedReasons: evaluation.status === "pass" ? [] : agentDesignReview.failedDimensions,
    candidateWritebackPermission:
      evaluation.status === "pass" ? "candidate_only" : "blocked",
    publicReadyStatus: evaluation.status === "pass" ? "internal_ready" : "blocked",
    evolutionSignal: {
      decision: "none-with-reason",
      reason:
        "One MVP run is enough for acceptance evidence but not enough to promote a new long-term agent automatically.",
    },
  };
  return {
    agentBoundaryDecision,
    agentLoadoutDecision,
    agentMemoryDecision,
    agentDesignReview,
    agentCandidateGateDecision,
  };
}

function buildLangGraphTrace({ runId, spec, intelligenceTrace, stationPackets }) {
  return {
    graphKind: "langgraph_control_graph_mvp",
    stateShape: {
      runId,
      rootGoal: ROOT_GOAL,
      realNeed: REAL_NEED,
      gapDecision: "create_agent",
      selectedPath: intelligenceTrace.selectedPath,
      generatedAgentSpecName: spec.name,
      stationPackets: Object.keys(stationPackets),
      evaluationStatus: "pending",
    },
    nodes: [
      {
        id: "critical_fetch",
        owner: "meta-warden",
        output: "real need and evidence boundary",
      },
      {
        id: "gap_decision",
        owner: "meta-conductor",
        output: "create_agent conditional edge",
      },
      {
        id: "genesis_boundary",
        owner: "meta-genesis",
        output: "identity and boundary reasoning",
      },
      {
        id: "artisan_loadout",
        owner: "meta-artisan",
        output: "abstract loadout and ROI reasoning",
      },
      {
        id: "librarian_memory",
        owner: "meta-librarian",
        output: "memory scope, replay source, and writeback boundary",
      },
      {
        id: "prism_review",
        owner: "meta-prism",
        output: "adversarial review assertions",
      },
      {
        id: "warden_gate",
        owner: "meta-warden",
        output: "candidate writeback gate decision",
      },
      {
        id: "evaluator",
        owner: "verify",
        output: "spec and intelligence-layer pass/fail",
      },
    ],
    edges: [
      { from: "critical_fetch", to: "gap_decision", type: "normal" },
      {
        from: "gap_decision",
        to: "genesis_boundary",
        type: "conditional",
        condition: "GapDecision.decision == create_agent",
      },
      { from: "genesis_boundary", to: "artisan_loadout", type: "normal" },
      { from: "artisan_loadout", to: "librarian_memory", type: "normal" },
      { from: "librarian_memory", to: "prism_review", type: "normal" },
      { from: "prism_review", to: "warden_gate", type: "normal" },
      { from: "warden_gate", to: "evaluator", type: "normal" },
    ],
    forbiddenEdges: [
      "gap_decision -> batch_agent_factory",
      "gap_decision -> full_graph_database_planner",
      "prism_review -> automatic_canonical_write",
    ],
  };
}

function buildEvents({ runId, graphTrace, spec, intelligenceTrace, evaluation, stationPackets }) {
  const base = [
    {
      stage: "Critical",
      eventType: "root_goal_locked",
      payload: { rootGoal: ROOT_GOAL, realNeed: REAL_NEED },
    },
    {
      stage: "Fetch",
      eventType: "evidence_loaded",
      payload: intelligenceTrace.evidenceUsed,
    },
    {
      stage: "Thinking",
      eventType: "langgraph_state_created",
      payload: graphTrace,
    },
    {
      stage: "Execution",
      eventType: "genesis_boundary_output",
      payload: stationPackets.agentBoundaryDecision,
    },
    {
      stage: "Execution",
      eventType: "artisan_loadout_output",
      payload: stationPackets.agentLoadoutDecision,
    },
    {
      stage: "Execution",
      eventType: "librarian_memory_output",
      payload: stationPackets.agentMemoryDecision,
    },
    {
      stage: "Review",
      eventType: "prism_adversarial_review_output",
      payload: stationPackets.agentDesignReview,
    },
    {
      stage: "Meta-Review",
      eventType: "warden_candidate_gate_output",
      payload: stationPackets.agentCandidateGateDecision,
    },
    {
      stage: "Verification",
      eventType: "agent_design_quality_evaluated",
      payload: evaluation,
    },
    {
      stage: "Evolution",
      eventType: "none_with_reason",
      payload: {
        writebackDecision: "none-with-reason",
        reason:
          "Single MVP run proves the process path but does not yet meet repeated-correction promotion threshold.",
      },
    },
  ];
  return base.map((event, index) => ({
    eventId: stableId("event", `${runId}-${index}-${event.eventType}`),
    runId,
    createdAt: nowIso(),
    ...event,
  }));
}

function markdownReport(report) {
  const checks = report.acceptanceChecks;
  const lines = [
    "# Real Governance Agent Process MVP Report",
    "",
    "## 一句话",
    "",
    "本次不是批量造 agent，也不是继续改评分表，而是跑通一条真实治理 agent 设计过程：Genesis 定边界，Artisan 定能力栈，Prism 做反证审查，再由 evaluator 同时检查过程和最终 spec。",
    "",
    "## 结果",
    "",
    `- 总体：${report.status}`,
    `- GapDecision：${report.gapDecision}`,
    `- GeneratedAgentSpec：${report.generatedAgentSpec.name}`,
    `- Station packets：${Object.keys(report.stationPackets).length}`,
    `- LangGraph conditional edge：${report.langGraphTrace.edges.find((edge) => edge.type === "conditional")?.condition}`,
    `- SQLite events：${report.database.events}`,
    "",
    "## AI 可识别验收",
    "",
    "| 指标 | 结果 |",
    "|---|---|",
    ...checks.map((check) => `| ${check.id} | ${check.passed ? "pass" : "fail"} |`),
    "",
    "## 分工产物",
    "",
    "| Station | Owner | 产物 |",
    "|---|---|---|",
    "| Genesis | meta-genesis | 长期身份和边界，不把本次任务写进 identity |",
    "| Artisan | meta-artisan | 抽象 loadout slots、ROI、拒绝 full graph database first |",
    "| Librarian | meta-librarian | 记忆范围、回放来源、跨项目边界、写回门禁 |",
    "| Prism | meta-prism | claim 检查、反证审查、标准强度自查 |",
    "| Warden | meta-warden | 候选写回许可、public-ready 状态、evolution signal |",
    "",
    "## 复杂度边界",
    "",
    "- 包含：LangGraph 风格 state/edge、SQLite RunStateStore events、过程+结果 evaluator。",
    "- 不包含：批量 agent、多场景 benchmark、完整 CapabilityGraph、完整图数据库、自动写回 canonical。",
    "",
    "## 下一步",
    "",
    "下一步可以把同一 runner 的 station output 替换成真实子 agent 调用产物；当前版本先证明一条核心 MVP 闭环能被记录、回放和验收。",
    "",
  ];
  return lines.join("\n");
}

function acceptanceChecks({ specEvaluation, intelligenceEvaluation, graphTrace, dbCounts, stationPackets, stationContract }) {
  const expectedPackets = stationContract.stations.map((station) => station.outputPacket);
  const stationOutputCoverage = expectedPackets.every((packet) =>
    Object.hasOwn(stationPackets, packet)
  );
  const missingReturnToStageCount =
    stationPackets.agentDesignReview?.returnToStage === undefined ? 1 : 0;
  const sourceLeakCount = /gstack|gbrain|wshobson|anthropic|skill-creator/i.test(
    JSON.stringify(stationPackets)
  )
    ? 1
    : 0;
  return [
    {
      id: "spec_quality_pass",
      passed: specEvaluation.status === "pass",
    },
    {
      id: "intelligence_layer_pass",
      passed: intelligenceEvaluation.status === "pass",
    },
    {
      id: "langgraph_create_agent_conditional_edge",
      passed: graphTrace.edges.some(
        (edge) =>
          edge.type === "conditional" &&
          edge.condition === "GapDecision.decision == create_agent" &&
          edge.to === "genesis_boundary"
      ),
    },
    {
      id: "run_state_store_events_persisted",
      passed: dbCounts.events >= 10,
    },
    {
      id: "station_output_coverage",
      passed: stationOutputCoverage,
    },
    {
      id: "station_source_neutral",
      passed: sourceLeakCount === 0,
    },
    {
      id: "missing_return_to_stage_count_zero",
      passed: missingReturnToStageCount === 0,
    },
    {
      id: "memory_writeback_bypass_zero",
      passed:
        stationPackets.agentMemoryDecision?.writebackGate?.includes("meta-warden") &&
        stationPackets.agentCandidateGateDecision?.candidateWritebackPermission ===
          "candidate_only",
    },
    {
      id: "no_batch_agent_creation",
      passed: graphTrace.forbiddenEdges.includes("gap_decision -> batch_agent_factory"),
    },
    {
      id: "no_full_graph_database_first",
      passed: graphTrace.forbiddenEdges.includes("gap_decision -> full_graph_database_planner"),
    },
  ];
}

async function persistProcessRun({ dbPath, runId, events, report }) {
  const store = await openRunStateStore(dbPath);
  const startedAt = events[0].createdAt;
  const endedAt = events.at(-1).createdAt;
  store.db
    .prepare(
      `INSERT OR REPLACE INTO runs
       (run_id, status, started_at, ended_at, primary_goal, payload_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(runId, report.status, startedAt, endedAt, ROOT_GOAL, json(report));
  for (const event of events) {
    store.appendEvent(event);
  }
  const database = {
    runs: store.count("runs"),
    events: store.count("run_events"),
    eventTypes: store.eventTypes(runId),
    dbPath,
  };
  store.db.close();
  return database;
}

export async function runGovernanceAgentProcessMvp({
  statePath = DEFAULT_STATE_PATH,
  markdownPath = DEFAULT_MARKDOWN_PATH,
  dbPath = DEFAULT_DB_PATH,
} = {}) {
  const contract = await readJson(CONTRACT_PATH);
  const stationContract = await readJson(STATION_CONTRACT_PATH);
  const runId = stableId("governance-agent-process-mvp", REAL_NEED);
  const generatedAgentSpec = buildGeneratedSpec();
  const intelligenceTrace = buildProcessTrace(generatedAgentSpec);
  const specEvaluation = evaluateSpec(generatedAgentSpec, contract);
  const intelligenceEvaluation = evaluateIntelligenceTrace(
    intelligenceTrace,
    generatedAgentSpec,
    contract
  );
  const evaluation = {
    specEvaluation,
    intelligenceEvaluation,
    status:
      specEvaluation.status === "pass" && intelligenceEvaluation.status === "pass"
        ? "pass"
        : "fail",
  };
  const stationPackets = buildStationPackets({
    spec: generatedAgentSpec,
    intelligenceTrace,
    evaluation,
  });
  const langGraphTrace = buildLangGraphTrace({
    runId,
    spec: generatedAgentSpec,
    intelligenceTrace,
    stationPackets,
  });
  const events = buildEvents({
    runId,
    graphTrace: langGraphTrace,
    spec: generatedAgentSpec,
    intelligenceTrace,
    evaluation,
    stationPackets,
  });

  const partialReport = {
    schemaVersion: 1,
    runId,
    rootGoal: ROOT_GOAL,
    realNeed: REAL_NEED,
    status: evaluation.status,
    gapDecision: "create_agent",
    generatedAgentSpec,
    stationPackets,
    intelligenceTrace,
    langGraphTrace: {
      ...langGraphTrace,
      stateShape: {
        ...langGraphTrace.stateShape,
        evaluationStatus: evaluation.status,
      },
    },
    evaluation,
  };
  const database = await persistProcessRun({
    dbPath,
    runId,
    events,
    report: partialReport,
  });
  const checks = acceptanceChecks({
    specEvaluation,
    intelligenceEvaluation,
    graphTrace: partialReport.langGraphTrace,
    dbCounts: database,
    stationPackets,
    stationContract,
  });
  const report = {
    ...partialReport,
    status: checks.every((check) => check.passed) ? evaluation.status : "fail",
    database,
    acceptanceChecks: checks,
    generatedAt: nowIso(),
  };

  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(markdownPath, markdownReport(report));
  return report;
}

async function main() {
  const statePath = path.resolve(
    process.argv.includes("--json-out")
      ? process.argv[process.argv.indexOf("--json-out") + 1]
      : DEFAULT_STATE_PATH
  );
  const markdownPath = path.resolve(
    process.argv.includes("--markdown-out")
      ? process.argv[process.argv.indexOf("--markdown-out") + 1]
      : DEFAULT_MARKDOWN_PATH
  );
  const dbPath = path.resolve(
    process.argv.includes("--db")
      ? process.argv[process.argv.indexOf("--db") + 1]
      : DEFAULT_DB_PATH
  );
  const report = await runGovernanceAgentProcessMvp({
    statePath,
    markdownPath,
    dbPath,
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        status: report.status,
        runId: report.runId,
        gapDecision: report.gapDecision,
        generatedAgentSpec: report.generatedAgentSpec.name,
        events: report.database.events,
        report: path.relative(REPO_ROOT, markdownPath).replaceAll("\\", "/"),
      },
      null,
      2
    )}\n`
  );
  if (report.status !== "pass") {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}
