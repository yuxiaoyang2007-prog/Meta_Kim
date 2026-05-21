#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const contractPath = path.join(
  repoRoot,
  "config",
  "contracts",
  "workflow-contract.json",
);
const artifactArg = process.argv[2];

export const PACKET_LOCATIONS = {
  runHeader: "runHeader",
  taskClassification: "taskClassification",
  fetchPacket: "fetchPacket",
  intentPacket: "intentPacket",
  intentGatePacket: "intentGatePacket",
  cardPlanPacket: "cardPlanPacket",
  dispatchEnvelopePacket: "dispatchEnvelopePacket",
  orchestrationTaskBoardPacket: "orchestrationTaskBoardPacket",
  businessFlowBlueprintPacket: "businessFlowBlueprintPacket",
  agentBlueprintPacket: "agentBlueprintPacket",
  capabilityGapPacket: "capabilityGapPacket",
  executionAgentCard: "executionAgentCard",
  dispatchBoard: "dispatchBoard",
  workerTaskPacket: "workerTaskPackets",
  workerResultPacket: "workerResultPackets",
  reviewPacket: "reviewPacket",
  verificationPacket: "verificationPacket",
  summaryPacket: "summaryPacket",
  compactionPacket: "compactionPacket",
  evolutionWritebackPacket: "evolutionWritebackPacket",
};

function fail(message) {
  throw new Error(message);
}

function ensure(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function ensureFields(target, fields, context) {
  ensure(target && typeof target === "object", `${context} must be an object.`);
  for (const field of fields) {
    ensure(field in target, `${context} is missing required field "${field}".`);
  }
}

function ensureArray(value, context) {
  ensure(Array.isArray(value), `${context} must be an array.`);
}

function ensureEnum(value, allowed, context) {
  ensure(
    allowed.includes(value),
    `${context} must be one of [${allowed.join(", ")}], got: ${value}`,
  );
}

function normalizePathRef(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeTargetPath(value) {
  return String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "");
}

function containsPathTraversal(target) {
  return normalizeTargetPath(target).split("/").includes("..");
}

function isForbiddenEvolutionWritebackTarget(target) {
  const normalized = normalizeTargetPath(target).toLowerCase();
  return (
    normalized === "memory" ||
    normalized.startsWith("memory/") ||
    normalized.startsWith(".meta-kim/state/") ||
    normalized.includes("/compaction/") ||
    normalized === "compaction" ||
    normalized.startsWith("compaction/") ||
    normalized === "run-index" ||
    normalized.startsWith("run-index/") ||
    normalized.includes("run-index.sqlite")
  );
}

function matchesEvolutionWritebackTarget(target, allowedTarget) {
  const normalizedTarget = normalizeTargetPath(target);
  const normalizedAllowed = normalizeTargetPath(allowedTarget);

  if (!normalizedAllowed) return false;
  if (normalizedAllowed.endsWith("/")) {
    return normalizedTarget.startsWith(normalizedAllowed);
  }

  const escaped = normalizedAllowed
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\{[^/]+\\\}/g, "[^/]+");
  return new RegExp(`^${escaped}$`).test(normalizedTarget);
}

function validateEvolutionWritebackTargets(contract, writebacks) {
  const allowedTargets = contract.runDiscipline.evolutionWritebackTargets ?? [];
  ensureArray(
    allowedTargets,
    "runDiscipline.evolutionWritebackTargets",
  );

  for (const [index, writeback] of writebacks.entries()) {
    const target = writeback.target;
    ensure(
      !containsPathTraversal(target),
      `evolutionWritebackPacket.writebacks[${index}].target must not contain path traversal: ${target}`,
    );
    ensure(
      !isForbiddenEvolutionWritebackTarget(target),
      `evolutionWritebackPacket.writebacks[${index}].target must not use memory, compaction, or run-index storage for Evolution writeback: ${target}`,
    );
    ensure(
      allowedTargets.some((allowedTarget) =>
        matchesEvolutionWritebackTarget(target, allowedTarget),
      ),
      `evolutionWritebackPacket.writebacks[${index}].target must match one of runDiscipline.evolutionWritebackTargets: ${target}`,
    );
  }
}

async function readJson(targetPath) {
  const raw = await fs.readFile(targetPath, "utf8");
  return JSON.parse(raw);
}

function getPacket(artifact, packetName) {
  return artifact[PACKET_LOCATIONS[packetName] ?? packetName];
}

function ensureString(value, context) {
  ensure(
    typeof value === "string" && value.trim().length >= 1,
    `${context} must be a non-empty string.`,
  );
}

function ensureStringArray(value, context) {
  ensureArray(value, context);
  for (const [index, item] of value.entries()) {
    ensureString(item, `${context}[${index}]`);
  }
}

function ensureObject(value, context) {
  ensure(value && typeof value === "object" && !Array.isArray(value), `${context} must be an object.`);
}

function ensureNonEmptyValue(value, context) {
  if (Array.isArray(value)) {
    ensure(value.length >= 1, `${context} must not be empty.`);
    for (const [index, item] of value.entries()) {
      ensureString(item, `${context}[${index}]`);
    }
    return;
  }
  ensureString(value, context);
}

function validateRoleDisplayName(name, context) {
  const trimmed = String(name ?? "").trim();
  ensure(
    !/^[A-Z][a-z]+$/.test(trimmed),
    `${context} must be business-readable, not a runtime nickname.`,
  );
  ensure(
    !/[-_/\\:]/.test(trimmed),
    `${context} must stay at role-family level; put work-item scope in roleInstanceId, shardScope, assignedResponsibilitySlice, or task text.`,
  );
}

function valuesAsStrings(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [String(value)];
}

function ensureDecisionItems(value, context) {
  ensureArray(value, context);
  for (const [index, item] of value.entries()) {
    ensure(
      item && typeof item === "object",
      `${context}[${index}] must be an object.`,
    );
    ensureString(item.target, `${context}[${index}].target`);
    ensureString(item.reason, `${context}[${index}].reason`);
  }
}

function computePendingFindingIds(artifact) {
  const reviewFindings = artifact.reviewPacket?.findings ?? [];
  const closedIds = new Set(artifact.verificationPacket?.closeFindings ?? []);
  return reviewFindings
    .filter((finding) => !closedIds.has(finding.findingId))
    .map((finding) => finding.findingId);
}

function deriveVerifyGateState(artifact) {
  if (artifact.verificationPacket?.verified !== true) {
    return "pending_verify";
  }
  const hasAcceptedRisk = (
    artifact.verificationPacket?.verificationResults ?? []
  ).some((result) => result.closeState === "accepted_risk");
  return hasAcceptedRisk ? "accepted_risk" : "verified";
}

function validateTaskClassification(contract, taskClassification) {
  ensureFields(
    taskClassification,
    contract.protocols.taskClassification.requiredFields,
    "taskClassification",
  );

  const classificationPolicy = contract.runDiscipline.taskClassification;
  ensureEnum(
    taskClassification.taskClass,
    classificationPolicy.taskClassEnum,
    "taskClassification.taskClass",
  );
  ensureEnum(
    taskClassification.requestClass,
    classificationPolicy.requestClassEnum,
    "taskClassification.requestClass",
  );
  ensureEnum(
    taskClassification.queryScope,
    classificationPolicy.queryScopeEnum,
    "taskClassification.queryScope",
  );
  ensureString(taskClassification.projectRef, "taskClassification.projectRef");
  ensureEnum(
    taskClassification.registryStatus,
    classificationPolicy.registryStatusEnum,
    "taskClassification.registryStatus",
  );
  ensureString(
    taskClassification.crossProjectReason,
    "taskClassification.crossProjectReason",
  );
  ensureEnum(
    taskClassification.governanceFlow,
    classificationPolicy.governanceFlowEnum,
    "taskClassification.governanceFlow",
  );
  ensureArray(
    taskClassification.triggerReasons,
    "taskClassification.triggerReasons",
  );
  ensureArray(
    taskClassification.upgradeReasons,
    "taskClassification.upgradeReasons",
  );
  ensureArray(
    taskClassification.bypassReasons,
    "taskClassification.bypassReasons",
  );

  for (const item of taskClassification.triggerReasons) {
    ensureEnum(
      item,
      classificationPolicy.triggerReasonEnum,
      "taskClassification.triggerReasons[]",
    );
  }
  for (const item of taskClassification.upgradeReasons) {
    ensureEnum(
      item,
      classificationPolicy.upgradeReasonEnum,
      "taskClassification.upgradeReasons[]",
    );
  }
  for (const item of taskClassification.bypassReasons) {
    ensureEnum(
      item,
      classificationPolicy.bypassReasonEnum,
      "taskClassification.bypassReasons[]",
    );
  }

  if (taskClassification.ownerRequired === false) {
    ensure(
      taskClassification.taskClass === "Q" &&
        taskClassification.requestClass === "query" &&
        taskClassification.governanceFlow === "query" &&
        taskClassification.bypassReasons.includes("pure_query"),
      "ownerRequired=false is only legal for pure-query runs.",
    );
  }
}

function validateFetchPacket(contract, artifact) {
  const packet = artifact.fetchPacket;
  ensureFields(packet, contract.protocols.fetchPacket.requiredFields, "fetchPacket");

  for (const field of [
    "projectsChecked",
    "projectLocalSources",
    "globalRegistryHits",
    "capabilityMatches",
    "capabilityGaps",
    "graphSources",
    "knowledgeSources",
  ]) {
    ensureArray(packet[field], `fetchPacket.${field}`);
  }

  for (const [index, item] of packet.projectsChecked.entries()) {
    ensure(item && typeof item === "object", `fetchPacket.projectsChecked[${index}] must be an object.`);
    ensureString(item.projectRef, `fetchPacket.projectsChecked[${index}].projectRef`);
    ensureString(item.checkMode, `fetchPacket.projectsChecked[${index}].checkMode`);
    ensureString(item.reason, `fetchPacket.projectsChecked[${index}].reason`);
  }

  for (const field of ["projectLocalSources", "globalRegistryHits", "graphSources", "knowledgeSources"]) {
    for (const [index, item] of packet[field].entries()) {
      ensure(item && typeof item === "object", `fetchPacket.${field}[${index}] must be an object.`);
      ensureString(item.projectRef, `fetchPacket.${field}[${index}].projectRef`);
      ensureString(item.sourceType, `fetchPacket.${field}[${index}].sourceType`);
      ensureString(item.sourceRef, `fetchPacket.${field}[${index}].sourceRef`);
    }
  }

  for (const [index, item] of packet.capabilityMatches.entries()) {
    ensure(item && typeof item === "object", `fetchPacket.capabilityMatches[${index}] must be an object.`);
    ensureString(item.capability, `fetchPacket.capabilityMatches[${index}].capability`);
    ensureString(item.owner, `fetchPacket.capabilityMatches[${index}].owner`);
    ensureString(item.sourceProject, `fetchPacket.capabilityMatches[${index}].sourceProject`);
  }

  for (const [index, item] of packet.capabilityGaps.entries()) {
    ensure(item && typeof item === "object", `fetchPacket.capabilityGaps[${index}] must be an object.`);
    ensureString(item.capability, `fetchPacket.capabilityGaps[${index}].capability`);
    ensureString(item.reason, `fetchPacket.capabilityGaps[${index}].reason`);
  }

  const checkedProjects = packet.projectsChecked.map((item) => item.projectRef);
  ensure(
    checkedProjects.includes(artifact.taskClassification.projectRef),
    "fetchPacket.projectsChecked must include taskClassification.projectRef.",
  );

  if (artifact.taskClassification.queryScope === "current_project") {
    ensure(
      packet.projectsChecked.length === 1 &&
        checkedProjects[0] === artifact.taskClassification.projectRef,
      "current_project runs may only check the current project in fetchPacket.projectsChecked.",
    );
    ensure(
      packet.globalRegistryHits.length === 0,
      "current_project runs must not record global registry hits.",
    );
  }
}

function validateContentEvidencePacket(contract, artifact) {
  const packet = artifact.contentEvidencePacket;
  const policy = contract.protocols.contentEvidencePacket;
  ensureFields(packet, policy.requiredFields, "contentEvidencePacket");
  ensureEnum(
    packet.evidenceScope,
    policy.evidenceScopeEnum,
    "contentEvidencePacket.evidenceScope",
  );
  ensureEnum(
    packet.researchSkipReason,
    policy.researchSkipReasonEnum,
    "contentEvidencePacket.researchSkipReason",
  );
  ensureString(
    packet.evidenceLaneValidatedBy,
    "contentEvidencePacket.evidenceLaneValidatedBy",
  );

  const discovery = packet.researchCapabilityDiscovery;
  const discoveryPolicy = policy.researchCapabilityDiscovery;
  ensureFields(
    discovery,
    discoveryPolicy.requiredFields,
    "contentEvidencePacket.researchCapabilityDiscovery",
  );

  for (const field of discoveryPolicy.forbiddenFields ?? []) {
    ensure(
      !(field in discovery),
      `contentEvidencePacket.researchCapabilityDiscovery must not include forbidden field "${field}".`,
    );
  }

  ensureStringArray(
    discovery.requiredCapabilities,
    "contentEvidencePacket.researchCapabilityDiscovery.requiredCapabilities",
  );
  ensureFields(
    discovery.runtimeContext,
    discoveryPolicy.runtimeContextRequiredFields,
    "contentEvidencePacket.researchCapabilityDiscovery.runtimeContext",
  );
  ensureString(
    discovery.runtimeContext.os,
    "contentEvidencePacket.researchCapabilityDiscovery.runtimeContext.os",
  );
  ensureString(
    discovery.runtimeContext.runtimeFamily,
    "contentEvidencePacket.researchCapabilityDiscovery.runtimeContext.runtimeFamily",
  );

  ensureArray(
    discovery.toolInventorySources,
    "contentEvidencePacket.researchCapabilityDiscovery.toolInventorySources",
  );
  for (const [index, source] of discovery.toolInventorySources.entries()) {
    ensureEnum(
      source,
      discoveryPolicy.toolInventorySourceEnum,
      `contentEvidencePacket.researchCapabilityDiscovery.toolInventorySources[${index}]`,
    );
  }

  ensureArray(
    discovery.availableRetrievalCapabilities,
    "contentEvidencePacket.researchCapabilityDiscovery.availableRetrievalCapabilities",
  );
  for (const [index, capability] of discovery.availableRetrievalCapabilities.entries()) {
    ensureObject(
      capability,
      `contentEvidencePacket.researchCapabilityDiscovery.availableRetrievalCapabilities[${index}]`,
    );
    ensureEnum(
      capability.capability,
      discoveryPolicy.retrievalCapabilityEnum,
      `contentEvidencePacket.researchCapabilityDiscovery.availableRetrievalCapabilities[${index}].capability`,
    );
    ensureEnum(
      capability.providerKind,
      discoveryPolicy.providerKindEnum,
      `contentEvidencePacket.researchCapabilityDiscovery.availableRetrievalCapabilities[${index}].providerKind`,
    );
    ensureEnum(
      capability.status,
      discoveryPolicy.statusEnum,
      `contentEvidencePacket.researchCapabilityDiscovery.availableRetrievalCapabilities[${index}].status`,
    );
    ensureString(
      capability.proof,
      `contentEvidencePacket.researchCapabilityDiscovery.availableRetrievalCapabilities[${index}].proof`,
    );
    ensureStringArray(
      capability.limitations,
      `contentEvidencePacket.researchCapabilityDiscovery.availableRetrievalCapabilities[${index}].limitations`,
    );
  }

  ensureFields(
    discovery.selectedResearchPath,
    ["mode", "reason"],
    "contentEvidencePacket.researchCapabilityDiscovery.selectedResearchPath",
  );
  ensureEnum(
    discovery.selectedResearchPath.mode,
    discoveryPolicy.selectedResearchPathModeEnum,
    "contentEvidencePacket.researchCapabilityDiscovery.selectedResearchPath.mode",
  );
  ensureString(
    discovery.selectedResearchPath.reason,
    "contentEvidencePacket.researchCapabilityDiscovery.selectedResearchPath.reason",
  );

  ensureArray(
    discovery.capabilityGaps,
    "contentEvidencePacket.researchCapabilityDiscovery.capabilityGaps",
  );
  for (const [index, gap] of discovery.capabilityGaps.entries()) {
    ensureObject(gap, `contentEvidencePacket.researchCapabilityDiscovery.capabilityGaps[${index}]`);
    ensureString(gap.gap, `contentEvidencePacket.researchCapabilityDiscovery.capabilityGaps[${index}].gap`);
    ensureString(gap.impact, `contentEvidencePacket.researchCapabilityDiscovery.capabilityGaps[${index}].impact`);
    ensureString(gap.handoff, `contentEvidencePacket.researchCapabilityDiscovery.capabilityGaps[${index}].handoff`);
  }
  ensureString(
    discovery.validatedBy,
    "contentEvidencePacket.researchCapabilityDiscovery.validatedBy",
  );
}

function validateIntentPacketWhenRequired(contract, artifact) {
  const when =
    contract.runDiscipline.protocolFirst
      .intentPacketRequiredWhenGovernanceFlows;
  if (!Array.isArray(when) || when.length === 0) {
    return;
  }
  const flow = artifact.taskClassification?.governanceFlow;
  if (!when.includes(flow)) {
    return;
  }
  const intent = artifact.intentPacket;
  ensure(
    intent && typeof intent === "object",
    `intentPacket is required when governanceFlow is ${flow}.`,
  );
  ensureFields(
    intent,
    contract.protocols.intentPacket.requiredFields,
    "intentPacket",
  );
  for (const field of ["trueUserIntent", "successCriteria", "nonGoals"]) {
    ensure(
      typeof intent[field] === "string" && intent[field].trim().length >= 1,
      `intentPacket.${field} must be a non-empty string.`,
    );
  }
  ensure(
    intent.intentPacketVersion === "v1",
    'intentPacket.intentPacketVersion must be "v1" for this contract revision.',
  );
}

function validateIntentGatePacketWhenRequired(contract, artifact) {
  const when =
    contract.runDiscipline.protocolFirst
      .intentGatePacketRequiredWhenGovernanceFlows;
  if (!Array.isArray(when) || when.length === 0) {
    return;
  }
  const flow = artifact.taskClassification?.governanceFlow;
  if (!when.includes(flow)) {
    return;
  }
  const gate = artifact.intentGatePacket;
  ensure(
    gate && typeof gate === "object",
    `intentGatePacket is required when governanceFlow is ${flow}.`,
  );
  ensureFields(
    gate,
    contract.protocols.intentGatePacket.requiredFields,
    "intentGatePacket",
  );
  ensure(
    typeof gate.ambiguitiesResolved === "boolean",
    "intentGatePacket.ambiguitiesResolved must be a boolean.",
  );
  ensure(
    typeof gate.requiresUserChoice === "boolean",
    "intentGatePacket.requiresUserChoice must be a boolean.",
  );
  ensure(
    Array.isArray(gate.defaultAssumptions),
    "intentGatePacket.defaultAssumptions must be an array.",
  );
  for (const [i, item] of gate.defaultAssumptions.entries()) {
    ensure(
      typeof item === "string" && item.trim().length >= 1,
      `intentGatePacket.defaultAssumptions[${i}] must be a non-empty string.`,
    );
  }
  ensure(
    gate.intentGatePacketVersion === "v1",
    'intentGatePacket.intentGatePacketVersion must be "v1" for this contract revision.',
  );
  if (gate.requiresUserChoice === true) {
    ensure(
      Array.isArray(gate.pendingUserChoices) &&
        gate.pendingUserChoices.length >= 1,
      "intentGatePacket.requiresUserChoice=true requires non-empty pendingUserChoices array.",
    );
    for (const [i, c] of gate.pendingUserChoices.entries()) {
      ensure(
        typeof c === "string" && c.trim().length >= 1,
        `intentGatePacket.pendingUserChoices[${i}] must be a non-empty string.`,
      );
    }
  }
}

function validateDispatchEnvelope(contract, artifact) {
  const when =
    contract.runDiscipline.protocolFirst
      .dispatchEnvelopePacketRequiredWhenGovernanceFlows ?? [];
  const flow = artifact.taskClassification?.governanceFlow;
  if (!when.includes(flow)) {
    return;
  }

  const packet = artifact.dispatchEnvelopePacket;
  ensure(
    packet && typeof packet === "object",
    `dispatchEnvelopePacket is required when governanceFlow is ${flow}.`,
  );
  ensureFields(
    packet,
    contract.protocols.dispatchEnvelopePacket.requiredFields,
    "dispatchEnvelopePacket",
  );
  ensureString(packet.ownerAgent, "dispatchEnvelopePacket.ownerAgent");
  ensureString(packet.businessRoleId, "dispatchEnvelopePacket.businessRoleId");
  ensureString(packet.roleDisplayName, "dispatchEnvelopePacket.roleDisplayName");
  validateRoleDisplayName(
    packet.roleDisplayName,
    "dispatchEnvelopePacket.roleDisplayName",
  );
  ensureString(packet.roleInstanceId, "dispatchEnvelopePacket.roleInstanceId");
  ensureString(packet.taskRef, "dispatchEnvelopePacket.taskRef");
  ensureStringArray(
    packet.allowedCapabilities,
    "dispatchEnvelopePacket.allowedCapabilities",
  );
  ensureStringArray(
    packet.blockedCapabilities,
    "dispatchEnvelopePacket.blockedCapabilities",
  );
  ensureEnum(
    packet.route,
    contract.protocols.dispatchEnvelopePacket.routeEnum,
    "dispatchEnvelopePacket.route",
  );
  ensureEnum(
    packet.ownerSelection,
    contract.protocols.dispatchEnvelopePacket.ownerSelectionEnum,
    "dispatchEnvelopePacket.ownerSelection",
  );
  ensure(
    packet.allowedCapabilities.length >= 1,
    "dispatchEnvelopePacket.allowedCapabilities must contain at least one capability.",
  );
  ensureEnum(
    packet.memoryMode,
    contract.protocols.dispatchEnvelopePacket.memoryModeEnum,
    "dispatchEnvelopePacket.memoryMode",
  );
  ensureString(packet.workspaceHint, "dispatchEnvelopePacket.workspaceHint");
  ensureString(
    packet.resultSchemaRef,
    "dispatchEnvelopePacket.resultSchemaRef",
  );
  ensureString(packet.reviewOwner, "dispatchEnvelopePacket.reviewOwner");
  ensureString(
    packet.verificationOwner,
    "dispatchEnvelopePacket.verificationOwner",
  );

  const overlaps = packet.allowedCapabilities.filter((capability) =>
    packet.blockedCapabilities.includes(capability),
  );
  ensure(
    overlaps.length === 0,
    `dispatchEnvelopePacket capability boundary overlaps are forbidden: ${overlaps.join(", ")}`,
  );

  if (artifact.taskClassification?.queryScope === "current_project") {
    ensure(
      packet.route === "project_only",
      "current_project runs must use dispatchEnvelopePacket.route=project_only.",
    );
    ensure(
      packet.memoryMode === "project_only",
      "current_project runs must use dispatchEnvelopePacket.memoryMode=project_only.",
    );
  }

  if (artifact.taskClassification?.queryScope === "all_projects") {
    ensure(
      packet.route === "cross_project",
      "all_projects runs must use dispatchEnvelopePacket.route=cross_project.",
    );
    ensure(
      packet.memoryMode === "cross_project_readonly",
      "all_projects runs must use dispatchEnvelopePacket.memoryMode=cross_project_readonly.",
    );
  }
}

function validateOrchestrationTaskBoard(contract, artifact) {
  const when =
    contract.runDiscipline.protocolFirst
      .orchestrationTaskBoardPacketRequiredWhenGovernanceFlows ?? [];
  const flow = artifact.taskClassification?.governanceFlow;
  if (!when.includes(flow)) {
    return;
  }

  const packet = artifact.orchestrationTaskBoardPacket;
  ensure(
    packet && typeof packet === "object",
    `orchestrationTaskBoardPacket is required when governanceFlow is ${flow}.`,
  );
  ensureFields(
    packet,
    contract.protocols.orchestrationTaskBoardPacket.requiredFields,
    "orchestrationTaskBoardPacket",
  );
  ensure(
    packet.dispatchBoardId === artifact.dispatchBoard?.boardId,
    "orchestrationTaskBoardPacket.dispatchBoardId must match dispatchBoard.boardId.",
  );
  ensureEnum(
    packet.boardMode,
    contract.protocols.orchestrationTaskBoardPacket.boardModeEnum,
    "orchestrationTaskBoardPacket.boardMode",
  );
  ensureArray(packet.tasks, "orchestrationTaskBoardPacket.tasks");
  ensure(
    packet.tasks.length >= 1,
    "orchestrationTaskBoardPacket.tasks must contain at least one task.",
  );
  ensureString(
    packet.synthesisOwner,
    "orchestrationTaskBoardPacket.synthesisOwner",
  );

  const taskIds = new Set();
  const sequences = new Set();
  let hasFactoryTask = false;
  for (const [index, task] of packet.tasks.entries()) {
    ensureFields(
      task,
      contract.protocols.orchestrationTask.requiredFields,
      `orchestrationTaskBoardPacket.tasks[${index}]`,
    );
    ensure(!taskIds.has(task.taskId), `Duplicate orchestration taskId: ${task.taskId}`);
    taskIds.add(task.taskId);
    ensureEnum(
      task.taskKind,
      contract.protocols.orchestrationTask.taskKindEnum,
      `orchestrationTaskBoardPacket.tasks[${index}].taskKind`,
    );
    ensureString(
      task.owner,
      `orchestrationTaskBoardPacket.tasks[${index}].owner`,
    );
    ensureString(
      task.businessRoleId,
      `orchestrationTaskBoardPacket.tasks[${index}].businessRoleId`,
    );
    ensureString(
      task.roleDisplayName,
      `orchestrationTaskBoardPacket.tasks[${index}].roleDisplayName`,
    );
    validateRoleDisplayName(
      task.roleDisplayName,
      `orchestrationTaskBoardPacket.tasks[${index}].roleDisplayName`,
    );
    ensure(
      Number.isInteger(task.sequence) && task.sequence >= 1,
      `orchestrationTaskBoardPacket.tasks[${index}].sequence must be a positive integer.`,
    );
    ensure(
      !sequences.has(task.sequence),
      `Duplicate orchestration sequence: ${task.sequence}`,
    );
    sequences.add(task.sequence);
    ensureArray(
      task.dependsOn,
      `orchestrationTaskBoardPacket.tasks[${index}].dependsOn`,
    );
    ensureString(
      task.deliverable,
      `orchestrationTaskBoardPacket.tasks[${index}].deliverable`,
    );
    if (task.taskKind !== "execution") {
      hasFactoryTask = true;
    }
  }

  for (const [index, task] of packet.tasks.entries()) {
    for (const [depIndex, dep] of task.dependsOn.entries()) {
      ensureString(
        dep,
        `orchestrationTaskBoardPacket.tasks[${index}].dependsOn[${depIndex}]`,
      );
      ensure(
        taskIds.has(dep),
        `orchestrationTaskBoardPacket task ${task.taskId} depends on unknown taskId ${dep}.`,
      );
    }
  }

  if (packet.boardMode === "factory_then_dispatch") {
    ensure(
      hasFactoryTask,
      "orchestrationTaskBoardPacket.boardMode=factory_then_dispatch requires at least one factory task.",
    );
  }
  if (packet.boardMode === "direct_dispatch") {
    ensure(
      hasFactoryTask === false,
      "orchestrationTaskBoardPacket.boardMode=direct_dispatch may not include factory tasks.",
    );
  }
}

function validateBusinessFlowBlueprint(contract, artifact) {
  const flow = artifact.businessFlowBlueprintPacket;
  const policy = contract.protocols.businessFlowBlueprintPacket;
  ensureFields(
    flow,
    policy.requiredFields,
    "businessFlowBlueprintPacket",
  );
  ensureEnum(
    flow.deliverableType,
    policy.deliverableTypeEnum,
    "businessFlowBlueprintPacket.deliverableType",
  );
  ensureArray(flow.requiredLanes, "businessFlowBlueprintPacket.requiredLanes");
  ensureArray(flow.optionalLanes, "businessFlowBlueprintPacket.optionalLanes");
  ensureArray(flow.omittedLanes, "businessFlowBlueprintPacket.omittedLanes");

  const requiredLaneIds = new Set();
  const optionalLaneIds = new Set();
  const omittedLaneIds = new Set();

  const validateLane = (lane, context, bucket) => {
    ensureObject(lane, context);
    ensureFields(lane, policy.laneRequiredFields, context);
    for (const field of policy.laneRequiredFields) {
      if (field === "candidateOwners" || field === "candidateSkills") {
        ensureStringArray(lane[field], `${context}.${field}`);
        ensure(
          lane[field].length >= 1,
          `${context}.${field} must include at least one global capability scan candidate.`,
        );
      } else {
        ensureString(lane[field], `${context}.${field}`);
      }
    }
    ensureEnum(
      lane.coverageStatus,
      policy.laneCoverageStatusEnum,
      `${context}.coverageStatus`,
    );
    ensure(
      lane.coverageStatus !== "omitted_with_reason",
      `${context}.coverageStatus must not be omitted_with_reason; use omittedLanes for omitted lanes.`,
    );
    bucket.add(lane.laneId);
  };

  for (const [index, lane] of flow.requiredLanes.entries()) {
    validateLane(
      lane,
      `businessFlowBlueprintPacket.requiredLanes[${index}]`,
      requiredLaneIds,
    );
  }
  for (const [index, lane] of flow.optionalLanes.entries()) {
    validateLane(
      lane,
      `businessFlowBlueprintPacket.optionalLanes[${index}]`,
      optionalLaneIds,
    );
  }

  for (const [index, lane] of flow.omittedLanes.entries()) {
    ensureObject(lane, `businessFlowBlueprintPacket.omittedLanes[${index}]`);
    const laneId = lane.laneId ?? lane.lane;
    ensureString(laneId, `businessFlowBlueprintPacket.omittedLanes[${index}].lane`);
    ensureString(
      lane.reason,
      `businessFlowBlueprintPacket.omittedLanes[${index}].reason`,
    );
    ensure(
      lane.coverageStatus === "omitted_with_reason",
      `businessFlowBlueprintPacket.omittedLanes[${index}].coverageStatus must be omitted_with_reason.`,
    );
    omittedLaneIds.add(laneId);
  }
  ensureArray(flow.laneDependencies, "businessFlowBlueprintPacket.laneDependencies");
  ensureEnum(
    flow.coverageJudgment,
    policy.coverageJudgmentEnum,
    "businessFlowBlueprintPacket.coverageJudgment",
  );

  if (flow.coverageJudgment === "complete") {
    for (const [index, lane] of flow.requiredLanes.entries()) {
      ensure(
        lane.coverageStatus === "covered",
        `businessFlowBlueprintPacket.requiredLanes[${index}].coverageStatus must be covered when coverageJudgment=complete.`,
      );
    }
  }

  return { requiredLaneIds, optionalLaneIds, omittedLaneIds };
}

function validateAgentBlueprint(contract, artifact) {
  const packet = artifact.agentBlueprintPacket;
  const policy = contract.protocols.agentBlueprintPacket;
  ensureFields(
    packet,
    policy.requiredFields,
    "agentBlueprintPacket",
  );
  ensureArray(packet.roles, "agentBlueprintPacket.roles");
  ensure(packet.roles.length >= 1, "agentBlueprintPacket.roles must not be empty.");
  const coveredLaneIds = new Set();
  for (const [index, role] of packet.roles.entries()) {
    ensureObject(role, `agentBlueprintPacket.roles[${index}]`);
    ensureFields(
      role,
      policy.roleRequiredFields,
      `agentBlueprintPacket.roles[${index}]`,
    );
    for (const field of policy.roleRequiredFields) {
      ensureNonEmptyValue(role[field], `agentBlueprintPacket.roles[${index}].${field}`);
    }
    ensureString(role.businessRoleId, `agentBlueprintPacket.roles[${index}].businessRoleId`);
    ensureString(role.roleDisplayName, `agentBlueprintPacket.roles[${index}].roleDisplayName`);
    ensureString(role.ownerAgent, `agentBlueprintPacket.roles[${index}].ownerAgent`);
    ensureEnum(
      role.ownerResolution,
      policy.ownerResolutionEnum,
      `agentBlueprintPacket.roles[${index}].ownerResolution`,
    );
    validateRoleDisplayName(
      role.roleDisplayName,
      `agentBlueprintPacket.roles[${index}].roleDisplayName`,
    );
    for (const laneId of valuesAsStrings(role.assignedResponsibilitySlice)) {
      coveredLaneIds.add(laneId);
    }
  }
  ensureEnum(
    packet.roleCoverageGate,
    policy.roleCoverageGateEnum,
    "agentBlueprintPacket.roleCoverageGate",
  );
  ensureArray(packet.missingRoles, "agentBlueprintPacket.missingRoles");
  if (packet.roleCoverageGate === "pass") {
    ensure(
      packet.missingRoles.length === 0,
      "agentBlueprintPacket.missingRoles must be empty when roleCoverageGate=pass.",
    );
  }
  ensureEnum(
    packet.duplicateRolePolicy,
    policy.duplicateRolePolicyEnum,
    "agentBlueprintPacket.duplicateRolePolicy",
  );
  ensureObject(packet.namingPolicy, "agentBlueprintPacket.namingPolicy");
  for (const [field, expected] of Object.entries(policy.namingPolicy)) {
    if (field === "description") continue;
    ensure(
      packet.namingPolicy[field] === expected,
      `agentBlueprintPacket.namingPolicy.${field} must match workflow contract.`,
    );
  }

  for (const lane of artifact.businessFlowBlueprintPacket.requiredLanes) {
    ensure(
      coveredLaneIds.has(lane.laneId),
      `agentBlueprintPacket.roles must cover required businessFlowBlueprintPacket lane "${lane.laneId}".`,
    );
  }
}

function hasAgentBlueprintOwnerCreationOrUpgrade(contract, artifact) {
  const ownerResolutionAnyOf =
    contract.runDiscipline.protocolFirst
      .executionAgentCardRequiredWhenOwnerResolutionAnyOf ?? [];
  return (artifact.agentBlueprintPacket?.roles ?? []).some((role) =>
    ownerResolutionAnyOf.includes(role.ownerResolution),
  );
}

function isCapabilityGapRequired(contract, artifact) {
  const when =
    contract.runDiscipline.protocolFirst
      .capabilityGapPacketRequiredWhenUpgradeReasons ?? [];
  const upgradeReasons = artifact.taskClassification?.upgradeReasons ?? [];
  const roleCoveragePolicy =
    contract.runDiscipline.protocolFirst
      .capabilityGapPacketRequiredWhenRoleCoverage ?? {};
  const missingRoles = artifact.agentBlueprintPacket?.missingRoles ?? [];
  const roleCoverageRequiresGap =
    artifact.agentBlueprintPacket?.roleCoverageGate ===
      roleCoveragePolicy.roleCoverageGate ||
    (roleCoveragePolicy.missingRolesNonEmpty === true &&
      missingRoles.length > 0) ||
    (artifact.agentBlueprintPacket?.roles ?? []).some((role) =>
      (roleCoveragePolicy.ownerResolutionAnyOf ?? []).includes(
        role.ownerResolution,
      ),
    );
  return (
    upgradeReasons.some((reason) => when.includes(reason)) ||
    roleCoverageRequiresGap
  );
}

function validateCapabilityGapPacketWhenRequired(contract, artifact) {
  const shouldRequire = isCapabilityGapRequired(contract, artifact);
  if (!shouldRequire) {
    return;
  }

  const packet = artifact.capabilityGapPacket;
  ensure(
    packet && typeof packet === "object",
    "capabilityGapPacket is required when upgradeReasons, missingRoles, roleCoverageGate, or ownerResolution require owner creation or upgrade.",
  );
  ensureFields(
    packet,
    contract.protocols.capabilityGapPacket.requiredFields,
    "capabilityGapPacket",
  );
  ensureString(packet.gapId, "capabilityGapPacket.gapId");
  ensureString(
    packet.requestedCapability,
    "capabilityGapPacket.requestedCapability",
  );
  ensureStringArray(
    packet.currentAgentsChecked,
    "capabilityGapPacket.currentAgentsChecked",
  );
  ensure(
    packet.currentAgentsChecked.length >= 1,
    "capabilityGapPacket.currentAgentsChecked must contain at least one checked owner.",
  );
  ensureString(
    packet.insufficiencyReason,
    "capabilityGapPacket.insufficiencyReason",
  );
  ensureEnum(
    packet.resolutionAction,
    contract.protocols.capabilityGapPacket.resolutionActionEnum,
    "capabilityGapPacket.resolutionAction",
  );
  ensureString(packet.requestedBy, "capabilityGapPacket.requestedBy");
  ensureString(packet.approvedBy, "capabilityGapPacket.approvedBy");
}

function validateExecutionAgentCardWhenRequired(contract, artifact) {
  const when =
    contract.runDiscipline.protocolFirst
      .executionAgentCardRequiredWhenResolutionActions ?? [];
  const resolutionAction = artifact.capabilityGapPacket?.resolutionAction;
  if (
    !when.includes(resolutionAction) &&
    !hasAgentBlueprintOwnerCreationOrUpgrade(contract, artifact) &&
    !(artifact.agentBlueprintPacket?.missingRoles ?? []).length
  ) {
    return;
  }

  const packet = artifact.executionAgentCard;
  ensure(
    packet && typeof packet === "object",
    `executionAgentCard is required when capabilityGapPacket.resolutionAction is ${resolutionAction}.`,
  );
  ensureFields(
    packet,
    contract.protocols.executionAgentCard.requiredFields,
    "executionAgentCard",
  );
  ensureString(packet.agentId, "executionAgentCard.agentId");
  ensureString(packet.purpose, "executionAgentCard.purpose");
  ensureStringArray(
    packet.capabilities,
    "executionAgentCard.capabilities",
  );
  ensure(
    packet.capabilities.length >= 1,
    "executionAgentCard.capabilities must contain at least one capability.",
  );
  ensureStringArray(
    packet.nonCapabilities,
    "executionAgentCard.nonCapabilities",
  );
  ensure(
    packet.nonCapabilities.length >= 1,
    "executionAgentCard.nonCapabilities must contain at least one explicit boundary.",
  );
  ensureArray(packet.dependencies, "executionAgentCard.dependencies");
  for (const [index, dep] of packet.dependencies.entries()) {
    ensureString(dep, `executionAgentCard.dependencies[${index}]`);
  }
  ensureStringArray(packet.inputs, "executionAgentCard.inputs");
  ensure(
    packet.inputs.length >= 1,
    "executionAgentCard.inputs must contain at least one input.",
  );
  ensureStringArray(packet.outputs, "executionAgentCard.outputs");
  ensure(
    packet.outputs.length >= 1,
    "executionAgentCard.outputs must contain at least one output.",
  );
}

function validateSoftPublicReadyGates(contract, artifact) {
  const soft =
    contract.runDiscipline?.runArtifactValidation?.softPublicReadyTodoGate;
  const envKey =
    soft?.environmentVariable ?? "META_KIM_SOFT_PUBLIC_READY_GATES";
  const envVal = soft?.environmentValue ?? "1";
  if (process.env[envKey] !== envVal) {
    return;
  }
  const sp = artifact.summaryPacket;
  if (!sp || sp.publicReady !== true) {
    return;
  }
  const packets = artifact.workerTaskPackets;
  ensureArray(packets, "workerTaskPackets");
  for (const [index, packet] of packets.entries()) {
    if (packet?.taskTodoState === "open") {
      fail(
        `Soft gate (${envKey}=${envVal}): workerTaskPackets[${index}] has taskTodoState=open while summaryPacket.publicReady=true.`,
      );
    }
  }
}

function validateSoftCommentReviewGate(contract, artifact) {
  const gate =
    contract.runDiscipline?.runArtifactValidation?.softCommentReviewGate;
  const envKey = gate?.environmentVariable ?? "META_KIM_SOFT_COMMENT_REVIEW";
  const envVal = gate?.environmentValue ?? "1";
  if (process.env[envKey] !== envVal) {
    return;
  }
  const sp = artifact.summaryPacket;
  if (!sp || sp.publicReady !== true) {
    return;
  }
  const field = gate?.summaryBooleanField ?? "commentReviewAcknowledged";
  if (sp[field] !== true) {
    fail(
      `Soft gate (${envKey}=${envVal}): summaryPacket.publicReady=true requires summaryPacket.${field}=true.`,
    );
  }
}

function validateCardPlan(contract, artifact) {
  const cardPlan = artifact.cardPlanPacket;
  ensureFields(
    cardPlan,
    contract.protocols.cardPlanPacket.requiredFields,
    "cardPlanPacket",
  );
  ensureArray(cardPlan.cards, "cardPlanPacket.cards");
  ensureArray(cardPlan.deliveryShells, "cardPlanPacket.deliveryShells");
  ensureArray(cardPlan.controlDecisions, "cardPlanPacket.controlDecisions");

  const dealerGate = contract.gates.dealer;
  ensure(
    [dealerGate.primaryOwner, dealerGate.escalationOwner].includes(
      cardPlan.dealerOwner,
    ),
    `cardPlanPacket.dealerOwner must be ${dealerGate.primaryOwner} or ${dealerGate.escalationOwner}.`,
  );

  const cardPolicy = contract.runDiscipline.cardGovernance;
  const shellPolicy = contract.runDiscipline.deliveryShell;
  const silencePolicy = contract.runDiscipline.silencePolicy;
  const controlPolicy = contract.runDiscipline.controlIntervention;

  const cardIds = new Set();
  for (const [index, card] of cardPlan.cards.entries()) {
    ensureFields(
      card,
      contract.protocols.cardDecision.requiredFields,
      `cardPlanPacket.cards[${index}]`,
    );
    ensure(!cardIds.has(card.cardId), `Duplicate cardId: ${card.cardId}`);
    cardIds.add(card.cardId);
    ensureEnum(
      card.cardType,
      cardPolicy.cardTypeEnum,
      `card ${card.cardId} cardType`,
    );
    ensureEnum(
      card.cardIntent,
      cardPolicy.cardIntentEnum,
      `card ${card.cardId} cardIntent`,
    );
    ensureEnum(
      card.cardDecision,
      cardPolicy.cardDecisionEnum,
      `card ${card.cardId} cardDecision`,
    );
    ensureEnum(
      card.cardAudience,
      cardPolicy.cardAudienceEnum,
      `card ${card.cardId} cardAudience`,
    );
    ensureEnum(
      card.cardTiming,
      cardPolicy.cardTimingEnum,
      `card ${card.cardId} cardTiming`,
    );
    ensureEnum(
      card.cardShell,
      cardPolicy.cardShellEnum,
      `card ${card.cardId} cardShell`,
    );
    ensureEnum(
      card.cardSource,
      cardPolicy.cardSourceEnum,
      `card ${card.cardId} cardSource`,
    );
    ensure(
      Number.isInteger(card.cardPriority) && card.cardPriority >= 1,
      `card ${card.cardId} cardPriority must be a positive integer.`,
    );
    if (card.cardSuppressed === true) {
      ensure(
        typeof card.suppressionReason === "string" &&
          card.suppressionReason.trim().length >= 1,
        `suppressed card ${card.cardId} must record suppressionReason.`,
      );
    }
    if (card.suppressionReason) {
      ensure(
        cardPolicy.suppressionReasonEnum.includes(card.suppressionReason) ||
          String(card.suppressionReason).trim().length >= 1,
        `card ${card.cardId} suppressionReason must be documented.`,
      );
    }
  }

  const shellIds = new Set();
  for (const [index, shell] of cardPlan.deliveryShells.entries()) {
    ensureFields(
      shell,
      contract.protocols.deliveryShell.requiredFields,
      `cardPlanPacket.deliveryShells[${index}]`,
    );
    ensure(
      !shellIds.has(shell.deliveryShellId),
      `Duplicate deliveryShellId: ${shell.deliveryShellId}`,
    );
    shellIds.add(shell.deliveryShellId);
    ensureEnum(
      shell.shellType,
      shellPolicy.shellTypeEnum,
      `deliveryShell ${shell.deliveryShellId} shellType`,
    );
    ensureEnum(
      shell.presentationMode,
      shellPolicy.presentationModeEnum,
      `deliveryShell ${shell.deliveryShellId} presentationMode`,
    );
    ensureEnum(
      shell.exposureLevel,
      shellPolicy.exposureLevelEnum,
      `deliveryShell ${shell.deliveryShellId} exposureLevel`,
    );
    ensureEnum(
      shell.interventionForm,
      shellPolicy.interventionFormEnum,
      `deliveryShell ${shell.deliveryShellId} interventionForm`,
    );
  }

  ensure(
    shellIds.has(cardPlan.defaultShellId),
    `cardPlanPacket.defaultShellId ${cardPlan.defaultShellId} must reference an existing delivery shell.`,
  );
  for (const card of cardPlan.cards) {
    ensure(
      shellIds.has(card.deliveryShellId),
      `card ${card.cardId} references missing deliveryShellId ${card.deliveryShellId}.`,
    );
  }

  ensureFields(
    cardPlan.silenceDecision,
    contract.protocols.silenceDecision.requiredFields,
    "cardPlanPacket.silenceDecision",
  );
  ensureEnum(
    cardPlan.silenceDecision.silenceDecision,
    silencePolicy.silenceDecisionEnum,
    "cardPlanPacket.silenceDecision.silenceDecision",
  );
  if (cardPlan.silenceDecision.silenceDecision === "defer") {
    ensure(
      typeof cardPlan.silenceDecision.deferUntil === "string" &&
        cardPlan.silenceDecision.deferUntil.trim().length >= 1,
      "defer silenceDecision must include deferUntil.",
    );
  }
  if (cardPlan.silenceDecision.silenceDecision !== "none") {
    ensure(
      typeof cardPlan.silenceDecision.reasonForSilence === "string" &&
        cardPlan.silenceDecision.reasonForSilence.trim().length >= 1,
      "non-none silenceDecision must include reasonForSilence.",
    );
  }

  const controlIds = new Set();
  for (const [index, decision] of cardPlan.controlDecisions.entries()) {
    ensureFields(
      decision,
      contract.protocols.controlDecision.requiredFields,
      `cardPlanPacket.controlDecisions[${index}]`,
    );
    ensure(
      !controlIds.has(decision.decisionId),
      `Duplicate control decision id: ${decision.decisionId}`,
    );
    controlIds.add(decision.decisionId);
    ensureEnum(
      decision.decisionType,
      controlPolicy.decisionTypeEnum,
      `controlDecision ${decision.decisionId} decisionType`,
    );

    if (decision.decisionType === "skip") {
      ensureEnum(
        decision.skipReason,
        controlPolicy.skipReasonEnum,
        `controlDecision ${decision.decisionId} skipReason`,
      );
    }
    if (decision.decisionType === "interrupt") {
      ensureEnum(
        decision.interruptReason,
        controlPolicy.interruptReasonEnum,
        `controlDecision ${decision.decisionId} interruptReason`,
      );
      ensure(
        controlPolicy.insertedGovernanceOwners.includes(
          decision.insertedGovernanceOwner,
        ),
        `interrupt decision ${decision.decisionId} must declare an insertedGovernanceOwner.`,
      );
    }
    if (
      decision.decisionType === "override" ||
      decision.decisionType === "escalation_insert"
    ) {
      ensureEnum(
        decision.overrideReason,
        controlPolicy.overrideReasonEnum,
        `controlDecision ${decision.decisionId} overrideReason`,
      );
      ensure(
        controlPolicy.insertedGovernanceOwners.includes(
          decision.insertedGovernanceOwner,
        ),
        `${decision.decisionType} decision ${decision.decisionId} must declare an insertedGovernanceOwner.`,
      );
    }
    if (controlPolicy.requiresReturnToMainChain === true) {
      ensure(
        typeof decision.returnsToStage === "string" &&
          decision.returnsToStage.trim().length >= 1,
        `controlDecision ${decision.decisionId} must declare returnsToStage.`,
      );
      ensure(
        typeof decision.rejoinCondition === "string" &&
          decision.rejoinCondition.trim().length >= 1,
        `controlDecision ${decision.decisionId} must declare rejoinCondition.`,
      );
    }
  }
}

function validateWorkerPackets(contract, artifact) {
  const primaryDeliverable = artifact.runHeader.primaryDeliverable;
  ensure(
    artifact.dispatchBoard.primaryDeliverable === primaryDeliverable,
    "dispatchBoard.primaryDeliverable must match runHeader.primaryDeliverable.",
  );

  const taskPackets = artifact.workerTaskPackets;
  const resultPackets = artifact.workerResultPackets;
  ensureArray(taskPackets, "workerTaskPackets");
  ensureArray(resultPackets, "workerResultPackets");

  const taskById = new Map();
  const packetsByOwnerAgent = new Map();
  const workerPolicy = contract.protocols.workerTaskPacket.sameOwnerMultiInstancePolicy;
  const validCollisionPolicies = workerPolicy.collisionPolicyEnum ?? [];
  const validWorkspaceIsolation = new Set([
    "same_workspace_readonly_overlap",
    "isolated_worktree",
    "file_lock_required",
  ]);
  for (const [index, packet] of taskPackets.entries()) {
    ensureFields(
      packet,
      contract.protocols.workerTaskPacket.requiredFields,
      `workerTaskPackets[${index}]`,
    );
    ensure(
      !taskById.has(packet.taskPacketId),
      `Duplicate workerTaskPacket taskPacketId: ${packet.taskPacketId}`,
    );
    ensureString(packet.roleDisplayName, `workerTaskPackets[${index}].roleDisplayName`);
    ensureString(packet.ownerAgent, `workerTaskPackets[${index}].ownerAgent`);
    ensureString(packet.roleInstanceId, `workerTaskPackets[${index}].roleInstanceId`);
    ensureString(packet.shardKey, `workerTaskPackets[${index}].shardKey`);
    ensureArray(packet.shardScope, `workerTaskPackets[${index}].shardScope`);
    ensure(
      packet.shardScope.length >= 1,
      `workerTaskPackets[${index}].shardScope must contain at least one shard.`,
    );
    ensureString(
      packet.artifactNamespace,
      `workerTaskPackets[${index}].artifactNamespace`,
    );
    ensureString(
      packet.collisionPolicy,
      `workerTaskPackets[${index}].collisionPolicy`,
    );
    ensureEnum(
      packet.collisionPolicy,
      validCollisionPolicies,
      `workerTaskPackets[${index}].collisionPolicy`,
    );
    ensure(
      validWorkspaceIsolation.has(packet.workspaceIsolation),
      `workerTaskPackets[${index}].workspaceIsolation must be one of [${[...validWorkspaceIsolation].join(", ")}].`,
    );
    validateRoleDisplayName(
      packet.roleDisplayName,
      `workerTaskPacket ${packet.taskPacketId} roleDisplayName`,
    );
    const ownerPackets = packetsByOwnerAgent.get(packet.ownerAgent) ?? [];
    ownerPackets.push({ ...packet, index });
    packetsByOwnerAgent.set(packet.ownerAgent, ownerPackets);
    taskById.set(packet.taskPacketId, packet);
    if (
      contract.runDiscipline.runArtifactValidation
        .deliverableLinkMustReferencePrimaryDeliverable
    ) {
      ensure(
        normalizePathRef(packet.deliverableLink).includes(
          normalizePathRef(primaryDeliverable),
        ),
        `workerTaskPacket ${packet.taskPacketId} deliverableLink must reference primaryDeliverable ${primaryDeliverable}.`,
      );
    }
  }

  for (const [ownerAgent, ownerPackets] of packetsByOwnerAgent.entries()) {
    const roleInstanceIds = new Set();
    const artifactNamespaces = new Set();
    const scopes = new Map();
    const mergeOwnerByParallelGroup = new Map();
    for (const packet of ownerPackets) {
      ensure(
        !roleInstanceIds.has(packet.roleInstanceId),
        `Duplicate roleInstanceId ${packet.roleInstanceId} for ownerAgent ${ownerAgent}.`,
      );
      roleInstanceIds.add(packet.roleInstanceId);
      ensure(
        !artifactNamespaces.has(packet.artifactNamespace),
        `Duplicate artifactNamespace ${packet.artifactNamespace} for ownerAgent ${ownerAgent}.`,
      );
      artifactNamespaces.add(packet.artifactNamespace);
      if (ownerPackets.length > 1) {
        const group = packet.parallelGroup;
        const groupMergeOwner = mergeOwnerByParallelGroup.get(group);
        if (groupMergeOwner) {
          ensure(
            groupMergeOwner === packet.mergeOwner,
            `same ownerAgent ${ownerAgent} in parallelGroup ${group} must use one mergeOwner.`,
          );
        } else {
          mergeOwnerByParallelGroup.set(group, packet.mergeOwner);
        }
        for (const scope of packet.shardScope.map((item) => normalizePathRef(item))) {
          const previous = scopes.get(scope);
          ensure(
            !previous,
            `same ownerAgent ${ownerAgent} must not use overlapping shardScope "${scope}" across ${previous} and ${packet.taskPacketId}.`,
          );
          scopes.set(scope, packet.taskPacketId);
        }
      }
    }
  }

  const resultById = new Map();
  for (const [index, packet] of resultPackets.entries()) {
    ensureFields(
      packet,
      contract.protocols.workerResultPacket.requiredFields,
      `workerResultPackets[${index}]`,
    );
    ensure(
      taskById.has(packet.taskPacketId),
      `workerResultPacket ${packet.taskPacketId} has no matching workerTaskPacket.`,
    );
    const taskPacket = taskById.get(packet.taskPacketId);
    ensure(
      packet.owner === taskPacket.owner,
      `workerResultPacket ${packet.taskPacketId} owner must match workerTaskPacket owner.`,
    );
    resultById.set(packet.taskPacketId, packet);
  }

  for (const taskId of taskById.keys()) {
    ensure(
      resultById.has(taskId),
      `workerTaskPacket ${taskId} has no matching workerResultPacket.`,
    );
  }
}

function validateFindingChain(contract, artifact) {
  const reviewPacket = artifact.reviewPacket;
  const verificationPacket = artifact.verificationPacket;
  ensureFields(
    reviewPacket,
    contract.protocols.reviewPacket.requiredFields,
    "reviewPacket",
  );
  ensureFields(
    verificationPacket,
    contract.protocols.verificationPacket.requiredFields,
    "verificationPacket",
  );

  ensureArray(reviewPacket.sourceProjects, "reviewPacket.sourceProjects");
  ensureEnum(
    reviewPacket.crossProjectContaminationCheck,
    contract.protocols.reviewPacket.crossProjectContaminationCheckEnum,
    "reviewPacket.crossProjectContaminationCheck",
  );
  ensureArray(reviewPacket.findings, "reviewPacket.findings");
  ensureArray(
    verificationPacket.revisionResponses,
    "verificationPacket.revisionResponses",
  );
  ensureArray(
    verificationPacket.verificationResults,
    "verificationPacket.verificationResults",
  );
  ensureArray(
    verificationPacket.closeFindings,
    "verificationPacket.closeFindings",
  );

  const findingClosure = contract.runDiscipline.findingClosure;
  const findings = new Map();
  for (const [index, finding] of reviewPacket.findings.entries()) {
    ensureFields(
      finding,
      contract.protocols.reviewFinding.requiredFields,
      `reviewPacket.findings[${index}]`,
    );
    ensure(
      !findings.has(finding.findingId),
      `Duplicate review findingId: ${finding.findingId}`,
    );
    ensureString(
      finding.sourceProject,
      `review finding ${finding.findingId} sourceProject`,
    );
    ensure(
      reviewPacket.sourceProjects.includes(finding.sourceProject),
      `review finding ${finding.findingId} sourceProject must appear in reviewPacket.sourceProjects.`,
    );
    ensureEnum(
      finding.closeState,
      findingClosure.closeStateEnum,
      `review finding ${finding.findingId} closeState`,
    );
    ensure(
      ["open", "fixed_pending_verify"].includes(finding.closeState),
      `review finding ${finding.findingId} cannot start in a terminal closeState.`,
    );
    findings.set(finding.findingId, finding);
  }

  if (reviewPacket.crossProjectContaminationCheck === "fail") {
    ensure(
      reviewPacket.revisionNeeded === true,
      "cross-project contamination failures must require revision.",
    );
  }

  const revisionsByFinding = new Map();
  for (const [
    index,
    response,
  ] of verificationPacket.revisionResponses.entries()) {
    ensureFields(
      response,
      contract.protocols.revisionResponse.requiredFields,
      `verificationPacket.revisionResponses[${index}]`,
    );
    ensure(
      findings.has(response.findingId),
      `revisionResponse ${response.actionId} references unknown findingId ${response.findingId}.`,
    );
    revisionsByFinding.set(response.findingId, response);
  }

  const verificationByFinding = new Map();
  for (const [
    index,
    result,
  ] of verificationPacket.verificationResults.entries()) {
    ensureFields(
      result,
      contract.protocols.verificationResult.requiredFields,
      `verificationPacket.verificationResults[${index}]`,
    );
    ensure(
      findings.has(result.findingId),
      `verificationResult references unknown findingId ${result.findingId}.`,
    );
    ensureEnum(
      result.closeState,
      findingClosure.closeStateEnum,
      `verificationResult ${result.findingId} closeState`,
    );
    ensure(
      ["verified_closed", "accepted_risk"].includes(result.closeState),
      `verificationResult ${result.findingId} must finish in a terminal closeState.`,
    );
    verificationByFinding.set(result.findingId, result);
  }

  for (const findingId of findings.keys()) {
    ensure(
      revisionsByFinding.has(findingId),
      `Finding ${findingId} is missing a revisionResponse.`,
    );
    ensure(
      verificationByFinding.has(findingId),
      `Finding ${findingId} is missing a verificationResult.`,
    );
  }

  const closedIds = new Set(verificationPacket.closeFindings);
  for (const closedId of closedIds) {
    ensure(
      findings.has(closedId),
      `closeFindings contains unknown findingId ${closedId}.`,
    );
    const verificationResult = verificationByFinding.get(closedId);
    ensure(
      verificationResult &&
        ["verified_closed", "accepted_risk"].includes(
          verificationResult.closeState,
        ),
      `closeFindings may only contain findings with a terminal verification closeState (${closedId}).`,
    );
  }

  if (verificationPacket.verified === true) {
    ensure(
      verificationPacket.remainingIssues.length === 0,
      "verificationPacket.verified=true requires remainingIssues to be empty.",
    );
    ensure(
      closedIds.size === findings.size,
      "verificationPacket.verified=true requires every review finding to be closed.",
    );
  }
}

function validateSummaryAndEvolution(contract, artifact) {
  const summaryPacket = artifact.summaryPacket;
  const verificationPacket = artifact.verificationPacket;
  const evolutionPacket = artifact.evolutionWritebackPacket;
  ensureFields(
    summaryPacket,
    contract.protocols.summaryPacket.requiredFields,
    "summaryPacket",
  );
  ensureArray(
    summaryPacket.deliveryShellsUsed,
    "summaryPacket.deliveryShellsUsed",
  );
  ensureArray(summaryPacket.sourceProjects, "summaryPacket.sourceProjects");
  ensureArray(summaryPacket.blockedBy, "summaryPacket.blockedBy");

  for (const [index, projectRef] of summaryPacket.sourceProjects.entries()) {
    ensureString(projectRef, `summaryPacket.sourceProjects[${index}]`);
  }
  for (const projectRef of artifact.reviewPacket.sourceProjects) {
    ensure(
      summaryPacket.sourceProjects.includes(projectRef),
      `summaryPacket.sourceProjects must include reviewPacket source project ${projectRef}.`,
    );
  }
  const checkedProjects = new Set(
    artifact.fetchPacket.projectsChecked.map((item) => item.projectRef),
  );
  for (const projectRef of summaryPacket.sourceProjects) {
    ensure(
      checkedProjects.has(projectRef),
      `summaryPacket.sourceProjects may only reference projects checked during Fetch (${projectRef}).`,
    );
  }
  if (artifact.taskClassification.queryScope === "current_project") {
    ensure(
      summaryPacket.sourceProjects.length === 1 &&
        summaryPacket.sourceProjects[0] === artifact.taskClassification.projectRef,
      "current_project runs must summarize exactly one source project.",
    );
  }

  const shellIds = new Set(
    artifact.cardPlanPacket.deliveryShells.map(
      (shell) => shell.deliveryShellId,
    ),
  );
  for (const shellId of summaryPacket.deliveryShellsUsed) {
    ensure(
      shellIds.has(shellId),
      `summaryPacket references unknown delivery shell ${shellId}.`,
    );
  }

  ensure(
    summaryPacket.verifyPassed === verificationPacket.verified,
    "summaryPacket.verifyPassed must match verificationPacket.verified.",
  );

  const publicConditions = contract.runDiscipline.publicDisplayRequires;
  const missingConditions = publicConditions.filter(
    (field) => summaryPacket[field] !== true,
  );
  if (summaryPacket.publicReady === true) {
    ensure(
      missingConditions.length === 0,
      `summaryPacket.publicReady=true but these public-display conditions are false: ${missingConditions.join(", ")}`,
    );
    ensure(
      summaryPacket.blockedBy.length === 0,
      "summaryPacket.publicReady=true requires blockedBy to be empty.",
    );
  } else if (missingConditions.length > 0) {
    ensure(
      summaryPacket.blockedBy.length >= 1,
      "summaryPacket must record blockedBy reasons when publicReady=false due to gate failure.",
    );
  }

  ensureFields(
    evolutionPacket,
    contract.protocols.evolutionWritebackPacket.requiredFields,
    "evolutionWritebackPacket",
  );
  ensureArray(
    evolutionPacket.writebacks,
    "evolutionWritebackPacket.writebacks",
  );
  ensureDecisionItems(
    evolutionPacket.retain,
    "evolutionWritebackPacket.retain",
  );
  ensureDecisionItems(
    evolutionPacket.upgrade,
    "evolutionWritebackPacket.upgrade",
  );
  ensureDecisionItems(
    evolutionPacket.retire,
    "evolutionWritebackPacket.retire",
  );
  ensureArray(evolutionPacket.scarIds, "evolutionWritebackPacket.scarIds");
  ensureEnum(
    evolutionPacket.writebackDecision,
    contract.runDiscipline.evolutionDecision.allowedDecisions,
    "evolutionWritebackPacket.writebackDecision",
  );
  ensure(
    typeof evolutionPacket.decisionReason === "string" &&
      evolutionPacket.decisionReason.trim().length >= 1,
    "evolutionWritebackPacket.decisionReason must be non-empty.",
  );
  if (evolutionPacket.writebackDecision === "writeback") {
    ensure(
      evolutionPacket.writebacks.length >= 1,
      "writebackDecision=writeback requires at least one writeback target.",
    );
  }
  if (evolutionPacket.writebacks.length > 0) {
    validateEvolutionWritebackTargets(contract, evolutionPacket.writebacks);
  }
  ensure(
    evolutionPacket.retain.length +
      evolutionPacket.upgrade.length +
      evolutionPacket.retire.length >=
      1,
    "evolutionWritebackPacket must record at least one retain/upgrade/retire decision.",
  );
}

function validateCompactionPacket(contract, artifact) {
  const packet = artifact.compactionPacket;
  if (!packet) {
    return;
  }

  ensureFields(
    packet,
    contract.protocols.compactionPacket.requiredFields,
    "compactionPacket",
  );
  ensureString(packet.packetVersion, "compactionPacket.packetVersion");
  ensureString(packet.runRef, "compactionPacket.runRef");
  ensureString(packet.profile, "compactionPacket.profile");
  ensureString(packet.profileKey, "compactionPacket.profileKey");
  ensureStringArray(packet.openFindings, "compactionPacket.openFindings");
  ensureStringArray(
    packet.pendingRevisions,
    "compactionPacket.pendingRevisions",
  );
  ensureEnum(
    packet.verifyGateState,
    contract.protocols.compactionPacket.verifyGateStateEnum,
    "compactionPacket.verifyGateState",
  );
  ensure(
    packet.singleDeliverableState &&
      typeof packet.singleDeliverableState === "object",
    "compactionPacket.singleDeliverableState must be an object.",
  );
  ensure(
    packet.summaryDelta && typeof packet.summaryDelta === "object",
    "compactionPacket.summaryDelta must be an object.",
  );
  ensure(
    packet.writebackDecision ===
      artifact.evolutionWritebackPacket.writebackDecision,
    "compactionPacket.writebackDecision must match evolutionWritebackPacket.writebackDecision.",
  );

  const pendingFindingIds = computePendingFindingIds(artifact).sort();
  const packetOpenFindings = [...packet.openFindings].sort();
  ensure(
    JSON.stringify(packetOpenFindings) === JSON.stringify(pendingFindingIds),
    `compactionPacket.openFindings must exactly match unresolved review findings (${pendingFindingIds.join(", ")}).`,
  );

  if (pendingFindingIds.length > 0) {
    ensure(
      packet.pendingRevisions.length >= 1,
      "compactionPacket.pendingRevisions must retain at least one pending revision while findings remain open.",
    );
  }

  ensure(
    packet.verifyGateState === deriveVerifyGateState(artifact),
    "compactionPacket.verifyGateState must match verificationPacket closure state.",
  );
  ensure(
    packet.singleDeliverableState.singleDeliverableMaintained ===
      artifact.summaryPacket.singleDeliverableMaintained,
    "compactionPacket.singleDeliverableState.singleDeliverableMaintained must match summaryPacket.",
  );
  ensure(
    packet.singleDeliverableState.deliverableChainClosed ===
      artifact.summaryPacket.deliverableChainClosed,
    "compactionPacket.singleDeliverableState.deliverableChainClosed must match summaryPacket.",
  );
  ensure(
    packet.summaryDelta.publicReady === artifact.summaryPacket.publicReady,
    "compactionPacket.summaryDelta.publicReady must match summaryPacket.publicReady.",
  );
  ensure(
    packet.summaryDelta.verifyPassed === artifact.summaryPacket.verifyPassed,
    "compactionPacket.summaryDelta.verifyPassed must match summaryPacket.verifyPassed.",
  );
  ensure(
    packet.summaryDelta.summaryClosed === artifact.summaryPacket.summaryClosed,
    "compactionPacket.summaryDelta.summaryClosed must match summaryPacket.summaryClosed.",
  );

  if (packet.summaryDelta.publicReady === true) {
    ensure(
      artifact.verificationPacket.verified === true &&
        pendingFindingIds.length === 0,
      "compactionPacket must not claim publicReady while verification or finding closure remains open.",
    );
  }
}

function validateRequiredPackets(contract, artifact) {
  for (const packetName of contract.runDiscipline.protocolFirst
    .requiredPackets) {
    if (
      packetName === "dispatchEnvelopePacket" &&
      !(
        contract.runDiscipline.protocolFirst
          .dispatchEnvelopePacketRequiredWhenGovernanceFlows ?? []
      ).includes(artifact.taskClassification?.governanceFlow)
    ) {
      continue;
    }
    if (
      packetName === "orchestrationTaskBoardPacket" &&
      !(
        contract.runDiscipline.protocolFirst
          .orchestrationTaskBoardPacketRequiredWhenGovernanceFlows ?? []
      ).includes(artifact.taskClassification?.governanceFlow)
    ) {
      continue;
    }
    const packet = getPacket(artifact, packetName);
    ensure(
      packet !== undefined,
      `run artifact is missing required packet ${packetName}.`,
    );
  }
}

export function validateArtifact(contract, artifact) {
  validateRequiredPackets(contract, artifact);
  ensureFields(
    artifact.runHeader,
    contract.protocols.runHeader.requiredFields,
    "runHeader",
  );
  validateTaskClassification(contract, artifact.taskClassification);
  validateFetchPacket(contract, artifact);
  validateContentEvidencePacket(contract, artifact);
  validateIntentPacketWhenRequired(contract, artifact);
  validateIntentGatePacketWhenRequired(contract, artifact);
  validateCardPlan(contract, artifact);
  validateDispatchEnvelope(contract, artifact);
  ensureFields(
    artifact.dispatchBoard,
    contract.protocols.dispatchBoard.requiredFields,
    "dispatchBoard",
  );
  validateOrchestrationTaskBoard(contract, artifact);
  validateBusinessFlowBlueprint(contract, artifact);
  validateAgentBlueprint(contract, artifact);
  validateCapabilityGapPacketWhenRequired(contract, artifact);
  validateExecutionAgentCardWhenRequired(contract, artifact);
  validateWorkerPackets(contract, artifact);
  validateFindingChain(contract, artifact);
  validateSummaryAndEvolution(contract, artifact);
  validateCompactionPacket(contract, artifact);
  validateSoftPublicReadyGates(contract, artifact);
  validateSoftCommentReviewGate(contract, artifact);
}

export async function validateArtifactFile(artifactFilePath) {
  const artifactPath = path.resolve(process.cwd(), artifactFilePath);
  const artifact = await readJson(artifactPath);
  const contract = await readJson(contractPath);
  validateArtifact(contract, artifact);
  return artifact;
}

async function main() {
  if (!artifactArg) {
    fail("Usage: node scripts/validate-run-artifact.mjs <artifact.json>");
  }

  const artifactPath = path.resolve(process.cwd(), artifactArg);
  const artifact = await validateArtifactFile(artifactPath);
  const contract = await readJson(contractPath);

  console.log(
    JSON.stringify(
      {
        ok: true,
        artifact: path.relative(repoRoot, artifactPath).replace(/\\/g, "/"),
        validatedPackets: contract.runDiscipline.protocolFirst.requiredPackets,
      },
      null,
      2,
    ),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
