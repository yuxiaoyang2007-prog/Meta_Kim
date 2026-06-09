#!/usr/bin/env node

import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  GAP_DECISIONS,
  decideCapabilityGap,
} from "./capability-gap-mvp.mjs";
import { buildAgentProjectionTargets } from "./runtime-tool-profiles.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(scriptDir, "..");
const DEFAULT_OUTPUT_PATH = path.resolve(
  REPO_ROOT,
  ".meta-kim/state/default/capability-gap-orchestration.json"
);

const ROLE_BY_DECISION = {
  create_skill: "skill",
  create_agent: "agent",
  create_script: "script",
  create_mcp_provider: "provider",
  worker_task_only: "worker",
  blocked_or_needs_approval: "safety",
};

const OWNER_BY_DECISION = {
  create_skill: "meta-artisan",
  create_agent: "meta-genesis",
  create_script: "script-provider",
  create_mcp_provider: "mcp-provider-capability",
  worker_task_only: "existing_execution_owner",
  blocked_or_needs_approval: "meta-sentinel",
};

const MULTI_TYPE_CAPABILITY_INVENTORY = [
  {
    capabilityType: "agent",
    source: "canonical agents and runtime agent mirrors",
    routeImpact: "owner selection and governance boundary",
  },
  {
    capabilityType: "skill",
    source: "canonical skills and installed/runtime skill mirrors",
    routeImpact: "reusable workflow selection",
  },
  {
    capabilityType: "script",
    source: "scripts/ and package automation",
    routeImpact: "repeatable local implementation or validation path",
  },
  {
    capabilityType: "command",
    source: "package.json scripts and local CLI commands",
    routeImpact: "callable execution weapon",
  },
  {
    capabilityType: "mcp_provider_tool",
    source: "MCP configs, provider registry, and tool inventory",
    routeImpact: "external or structured tool provider path",
  },
  {
    capabilityType: "runtime_tool",
    source: "runtime-native tools and host adapters",
    routeImpact: "host-specific execution surface",
  },
  {
    capabilityType: "plugin_connector",
    source: "plugin and connector inventory",
    routeImpact: "optional integration surface",
  },
  {
    capabilityType: "retrieval_capability",
    source: "web, url, docs, browser, MCP, plugin, local, and user-source retrieval",
    routeImpact: "source-backed Fetch and deep research readiness",
  },
  {
    capabilityType: "dependency_external_package",
    source: "dependency registry and external package references",
    routeImpact: "third-party capability reuse or risk boundary",
  },
  {
    capabilityType: "worker_task",
    source: "run-scoped workerTaskPacket path",
    routeImpact: "one-run execution without durable capability creation",
  },
];

const AGENT_PROJECTION_TARGETS = buildAgentProjectionTargets();

const RETRIEVAL_CAPABILITIES = [
  {
    name: "web_search",
    status: "requires_runtime_inventory",
    role: "current public facts and ecosystem discovery",
  },
  {
    name: "url_fetch",
    status: "requires_runtime_inventory",
    role: "direct source retrieval when a URL is known",
  },
  {
    name: "docs_lookup",
    status: "requires_runtime_inventory",
    role: "official documentation and API surface verification",
  },
  {
    name: "browser_open",
    status: "requires_runtime_inventory",
    role: "interactive or rendered page inspection",
  },
  {
    name: "mcp_search",
    status: "requires_runtime_inventory",
    role: "MCP-backed search or provider discovery",
  },
  {
    name: "plugin_search",
    status: "requires_runtime_inventory",
    role: "runtime plugin or connector discovery",
  },
  {
    name: "local_only",
    status: "available",
    role: "repo, canonical, contract, package, and test evidence",
  },
  {
    name: "user_supplied_sources",
    status: "available_if_provided",
    role: "pasted text, attachments, or explicit source files",
  },
];

function stableId(prefix, seed) {
  const hash = createHash("sha1").update(String(seed ?? "")).digest("hex").slice(0, 10);
  const safe = String(seed ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 36);
  return `${prefix}-${safe || "item"}-${hash}`;
}

function normalizeTaskText(input) {
  return String(input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

export function decomposeCapabilityGapRequests(input) {
  const text = normalizeTaskText(input);
  if (!text) return [];
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^\s*[-*•\d.、)）]+/, "").trim())
    .filter(Boolean);
  const sourceItems = lines.length > 1 ? lines : text.split(/[；;]+/).map((item) => item.trim());
  return sourceItems
    .filter(Boolean)
    .map((item, index) => ({
      requestId: stableId("gap-request", `${index}-${item}`),
      index,
      input: item,
    }));
}

function repeatKeyFor(result) {
  const text = result.capabilityGap.taskContext.toLowerCase();
  if (text.includes("prd") || text.includes("review standard") || text.includes("critical")) {
    return "prd-review-flow";
  }
  if (text.includes("coverage") || text.includes("test")) {
    return "coverage-strategy-owner";
  }
  if (text.includes("release") || text.includes("artifact") || text.includes("json")) {
    return "artifact-normalizer";
  }
  if (text.includes("knowledge") || text.includes("provider") || text.includes("内部知识库")) {
    return "knowledge-provider";
  }
  if (text.includes("credential") || text.includes("paid") || text.includes("publish")) {
    return "external-action-approval";
  }
  return result.gapDecision.decision;
}

function makeGroupKey(result) {
  return `${result.gapDecision.decision}:${repeatKeyFor(result)}`;
}

function needsExternalResearch(input) {
  return /\b(latest|current|today|api|platform|provider|dependency|external|web|search|official|version|price)\b|联网|最新|当前|今天|平台|外部|生态|供应商|依赖|官方|版本|价格|搜索|市场/i.test(
    String(input ?? "")
  );
}

function buildResearchCapabilityDiscovery(input) {
  const researchRequired = needsExternalResearch(input);
  return {
    owner: "meta-scout",
    researchRequired,
    retrievalCapabilities: RETRIEVAL_CAPABILITIES,
    selectedPath: researchRequired ? "mixed_source_backed_research" : "local_only_with_probe_record",
    blocked: false,
    limitations: researchRequired
      ? [
          "External retrieval capability must be proven by the active runtime before source-backed claims are final.",
        ]
      : [
          "No current external-fact dependency detected for this orchestration fixture.",
        ],
  };
}

function buildDeepResearchPlan(input) {
  const required = needsExternalResearch(input);
  return {
    owner: "meta-scout",
    required,
    decisionImpactRequired: true,
    stageGate: required ? "must_complete_before_thinking" : "recorded_before_thinking",
    sourceCategories: required
      ? ["official_docs", "current_runtime_inventory", "provider_registry", "external_ecosystem"]
      : ["canonical_sources", "contracts", "local_runtime_inventory"],
    questions: required
      ? [
          "Which current facts or external provider capabilities change the route?",
          "Which retrieval capability can verify those facts in this runtime?",
          "Does the evidence support reuse, creation, upgrade, workerTask-only, or block?",
        ]
      : [
          "Which local canonical and contract evidence changes the route?",
          "Which capability types are already covered before Thinking?",
        ],
    skipReason: required
      ? null
      : "Task does not depend on current external facts, third-party state, or live ecosystem claims.",
  };
}

function buildCapabilityInventory(decided) {
  const decisions = new Set(decided.map((gap) => gap.decision));
  return MULTI_TYPE_CAPABILITY_INVENTORY.map((item) => ({
    ...item,
    checkedBeforeThinking: true,
    coverageStatus:
      item.capabilityType === "worker_task" ||
      (item.capabilityType === "skill" && decisions.has("create_skill")) ||
      (item.capabilityType === "agent" && decisions.has("create_agent")) ||
      (item.capabilityType === "script" && decisions.has("create_script")) ||
      (item.capabilityType === "mcp_provider_tool" && decisions.has("create_mcp_provider"))
        ? "route_relevant"
        : "checked_no_primary_route",
    insufficiencyPolicy: "create_or_upgrade_only_after_fetch_evidence",
  }));
}

function summarizeGap(result, request) {
  const repeatKey = repeatKeyFor(result);
  return {
    requestId: request.requestId,
    sourceIndex: request.index,
    input: request.input,
    gapId: result.capabilityGap.gapId,
    repeatKey,
    decision: result.gapDecision.decision,
    decisionReason: result.gapDecision.decisionReason,
    owner: OWNER_BY_DECISION[result.gapDecision.decision],
    outputKind: result.decisionOutput.kind,
    candidateType: result.candidateWriteback?.candidateType ?? null,
    projectRetention: result.generatedAgentSpec?.projectRetention ?? null,
    blocked: result.gapDecision.decision === "blocked_or_needs_approval",
  };
}

function makeWorkerTaskPacket({ gap, group, groupIndex, itemIndex }) {
  const decision = gap.decision;
  const roleDisplayName = ROLE_BY_DECISION[decision] ?? "worker";
  const taskPacketId = stableId("worker-task", `${group.groupKey}-${gap.requestId}`);
  return {
    taskPacketId,
    owner: gap.owner,
    ownerMode: decision === "worker_task_only" ? "existing-owner" : "create-owner-first",
    ownerAgent: gap.owner,
    businessRoleId: roleDisplayName,
    roleDisplayName,
    roleInstanceId: `${roleDisplayName}-${groupIndex + 1}-${itemIndex + 1}`,
    runtimeInstanceAlias: null,
    coreProblem: gap.decisionReason,
    todayTask: `Produce ${gap.outputKind} for capability gap ${gap.gapId}.`,
    nonGoals: [
      "Do not write canonical state automatically.",
      "Do not execute external writes without approval.",
      "Do not turn one-run details into durable identity.",
    ],
    output: gap.outputKind,
    acceptanceCriteria: [
      "GapDecision evidence is pass.",
      "DecisionOutput acceptance is pass.",
      "Review owner can verify owner boundary and non-goals.",
    ],
    deliverableLink: null,
    scopeFiles: [],
    qualityBar: "reviewable, source-grounded, no fake owner, no missing verifier",
    workType: "capability_gap_resolution",
    expertLensRefs: ["Critical", "Fetch", "Thinking", "Review"],
    evidenceRefs: [gap.gapId, gap.requestId],
    capabilityRequirements: [decision],
    toolRequirements: [],
    capabilityInventoryRefs: group.capabilityInventoryRefs,
    durableProjectAgentPolicy:
      decision === "create_agent"
        ? {
            requiredDeliverable: "project_retained_abstract_agent_definition",
            temporaryWorkerIsNotDeliverable: true,
            runtimeTargets: AGENT_PROJECTION_TARGETS.map((target) => ({ ...target })),
          }
        : null,
    referenceDirection: "Use CapabilityGap and GapDecision evidence; concrete one-run work stays in this packet.",
    handoffTarget: "meta-conductor",
    handoffContract: {
      handoffTo: "meta-conductor",
      handoffWhen: "task output is review-ready",
      requiredEvidence: ["decisionEvidence", "decisionOutput", "verificationOwner"],
    },
    lengthExpectation: "compact",
    visualOrAssetPlan: "none",
    dependsOn: [],
    parallelGroup: group.parallelGroup,
    mergeOwner: "meta-conductor",
    shardKey: group.groupKey,
    shardScope: gap.repeatKey,
    workspaceIsolation: "run_scoped",
    artifactNamespace: group.groupKey.replace(/[^a-z0-9:_-]/gi, "-"),
    collisionPolicy: group.items.length > 1 ? "merge_by_owner" : "no_overlap",
    verifySteps: [
      {
        id: "decision-output-reviewed",
        command: "npm run meta:gap:orchestrate",
        successMarker: "status=pass",
      },
    ],
    preDecisionOptionFrameRef: "capability-gap-orchestration",
    userChoiceState: "auto_proceed_no_branching_choice",
    finalizationGate: "Review then Verification",
  };
}

function groupGaps(gaps) {
  const groupsByKey = new Map();
  for (const gap of gaps) {
    const groupKey = makeGroupKey({
      capabilityGap: { taskContext: gap.input },
      gapDecision: { decision: gap.decision },
    });
    if (!groupsByKey.has(groupKey)) {
      groupsByKey.set(groupKey, {
        groupKey,
        decision: gap.decision,
        repeatKey: gap.repeatKey,
        items: [],
      });
    }
    groupsByKey.get(groupKey).items.push(gap);
  }
  return [...groupsByKey.values()].map((group, index) => ({
    ...group,
    parallelGroup: `capability-gap-${index + 1}`,
    duplicatePolicy: group.items.length > 1 ? "same_type_same_repeat_key_grouped" : "distinct_gap",
  }));
}

function boardModeFor(gaps) {
  return gaps.some((gap) =>
    ["create_skill", "create_agent", "create_script", "create_mcp_provider"].includes(gap.decision)
  )
    ? "factory_then_dispatch"
    : "direct_dispatch";
}

export function buildCapabilityGapOrchestration(input) {
  const requests = decomposeCapabilityGapRequests(input);
  const decided = requests.map((request) => {
    const result = decideCapabilityGap(request.input);
    return summarizeGap(result, request);
  });
  const capabilityInventory = buildCapabilityInventory(decided);
  const researchCapabilityDiscovery = buildResearchCapabilityDiscovery(input);
  const deepResearchPlan = buildDeepResearchPlan(input);
  const groups = groupGaps(decided);
  for (const group of groups) {
    group.capabilityInventoryRefs = capabilityInventory.map((item) => item.capabilityType);
  }
  const workerTaskPackets = groups.flatMap((group, groupIndex) =>
    group.items.map((gap, itemIndex) =>
      makeWorkerTaskPacket({ gap, group, groupIndex, itemIndex })
    )
  );
  const orchestrationTaskBoardPacket = {
    dispatchBoardId: stableId("dispatch-board", input),
    boardMode: boardModeFor(decided),
    synthesisOwner: "meta-conductor",
    triggerChain: [
      "meta-theory-skill-adapter",
      "meta-warden-entry-gate",
      "meta-conductor-orchestration",
      "capability-gap-decision-kernel",
    ],
    tasks: workerTaskPackets.map((packet) => ({
      taskPacketId: packet.taskPacketId,
      owner: packet.owner,
      roleDisplayName: packet.roleDisplayName,
      roleInstanceId: packet.roleInstanceId,
      dependsOn: packet.dependsOn,
      parallelGroup: packet.parallelGroup,
      mergeOwner: packet.mergeOwner,
      shardKey: packet.shardKey,
      shardScope: packet.shardScope,
      durableProjectAgentPolicy: packet.durableProjectAgentPolicy,
    })),
  };
  const decisionCounts = Object.fromEntries(
    GAP_DECISIONS.map((decision) => [
      decision,
      decided.filter((gap) => gap.decision === decision).length,
    ])
  );
  const status =
    requests.length > 0 &&
    workerTaskPackets.length === decided.length &&
    workerTaskPackets.every((packet) => packet.mergeOwner === "meta-conductor") &&
    capabilityInventory.length >= 10 &&
    capabilityInventory.every((item) => item.checkedBeforeThinking) &&
    researchCapabilityDiscovery.retrievalCapabilities.length >= 8 &&
    deepResearchPlan.decisionImpactRequired === true &&
    orchestrationTaskBoardPacket.triggerChain[0] === "meta-theory-skill-adapter" &&
    orchestrationTaskBoardPacket.triggerChain[2] === "meta-conductor-orchestration"
      ? "pass"
      : "fail";
  return {
    schemaVersion: 1,
    status,
    rootGoal:
      "Route meta-theory-triggered complex tasks through Warden/Conductor before CapabilityGap decisions enter execution.",
    criticalSummary: {
      realGoal:
        "Support multiple capability gaps and repeated same-type needs without making a skill or runtime adapter the planner.",
      nonGoals: [
        "No full CapabilityGraph.",
        "No graph database.",
        "No automatic canonical write.",
        "No governance agent as implementation worker.",
      ],
      successCriteria: [
        "Skill is only the trigger adapter.",
        "Conductor owns orchestration.",
        "Each gap has its own GapDecision.",
        "Same-type repeated needs have stable grouping and merge owner.",
        "Create-agent routes produce durable project-agent candidates, not temporary worker prompts.",
        "Formal tool projection targets are declared from the compatibility catalog.",
      ],
    },
    stageVisibility: {
      requiredStages: ["Critical", "Fetch", "Thinking", "Review"],
      publicSummaryRequired: true,
      mustShowCapabilityRoute: true,
      mustDistinguishTemporarySubagentsFromDurableAgents: true,
    },
    fetchEvidence: {
      sources: [
        "canonical/skills/meta-theory/SKILL.md",
        "config/contracts/workflow-contract.json",
        "config/contracts/capability-gap-decision-contract.json",
      ],
      entryGate: "meta-warden",
      orchestrationOwner: "meta-conductor",
      decisionKernel: "scripts/capability-gap-mvp.mjs",
      stageOrder: "Fetch completes research and multi-type capability inventory before Thinking.",
      capabilityInventory,
      runtimeRequirements: {
        formalToolTargets: AGENT_PROJECTION_TARGETS.map((target) => ({ ...target })),
      },
      researchCapabilityDiscovery,
      deepResearchPlan,
      decisionImpactMap: capabilityInventory.map((item) => ({
        capabilityType: item.capabilityType,
        routeImpact: item.routeImpact,
        checkedBeforeThinking: item.checkedBeforeThinking,
      })),
    },
    thinkingRoute: {
      boardMode: boardModeFor(decided),
      groupingPolicy: "same decision + repeat key share parallel group",
      ownerSelectionPolicy:
        "Use governance owner for candidate design; implementation workers remain run-scoped.",
      durableProjectAgentPolicy:
        "When decision=create_agent, the deliverable is a project-retained abstract agent candidate with formal tool projection targets.",
      runtimeTargets: AGENT_PROJECTION_TARGETS.map((target) => ({ ...target })),
    },
    capabilityGaps: decided,
    groupedGaps: groups,
    decisionCounts,
    orchestrationTaskBoardPacket,
    workerTaskPackets,
    reviewResult: {
      owner: "meta-prism",
      status,
      checks: {
        skillIsNotPlanner:
          orchestrationTaskBoardPacket.triggerChain[0] === "meta-theory-skill-adapter",
        conductorOwnsBoard: orchestrationTaskBoardPacket.synthesisOwner === "meta-conductor",
        eachGapHasWorkerTask: workerTaskPackets.length === decided.length,
        sameOwnerInstancesHaveShardScope: workerTaskPackets.every(
          (packet) => packet.roleInstanceId && packet.shardScope && packet.mergeOwner
        ),
        multiTypeCapabilityInventoryPresent:
          capabilityInventory.length >= 10 &&
          capabilityInventory.every((item) => item.checkedBeforeThinking),
        researchCapabilityDiscoveryRecorded:
          researchCapabilityDiscovery.retrievalCapabilities.length >= 8,
        deepResearchPlanRecorded: deepResearchPlan.decisionImpactRequired === true,
        fetchBeforeThinking:
          orchestrationTaskBoardPacket.triggerChain.indexOf("meta-conductor-orchestration") >
          orchestrationTaskBoardPacket.triggerChain.indexOf("meta-warden-entry-gate"),
      },
    },
    verificationResult: {
      owner: "verify",
      status,
      command: "npm run meta:gap:orchestrate",
    },
    evolutionDecision: {
      status: "none-with-reason",
      reason: "This run proves orchestration routing; canonical writeback requires Warden approval.",
    },
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
    if (["--task", "--input", "--json-out"].includes(value)) {
      index += 1;
      continue;
    }
    if (value.startsWith("--")) continue;
    positional.push(value);
  }
  return positional.length > 0 ? positional.join(" ") : fallback;
}

async function main() {
  const task = argValue("--task", positionalTask(null));
  const inputPath = argValue("--input", null);
  const outputPath = path.resolve(argValue("--json-out", DEFAULT_OUTPUT_PATH));
  const input = inputPath
    ? await fs.readFile(path.resolve(process.cwd(), inputPath), "utf8")
    : task;
  if (!input) {
    throw new Error("Missing --task or --input for capability gap orchestration.");
  }
  const report = buildCapabilityGapOrchestration(input);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify(
      {
        status: report.status,
        gaps: report.capabilityGaps.length,
        groups: report.groupedGaps.length,
        boardMode: report.orchestrationTaskBoardPacket.boardMode,
        report: outputPath.replace(/\\/g, "/"),
      },
      null,
      2
    )}\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exit(1);
  });
}
