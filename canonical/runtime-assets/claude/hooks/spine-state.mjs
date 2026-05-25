import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname, resolve, relative, isAbsolute, normalize } from "node:path";

const META_KIM_STATE_ROOT = ".meta-kim/state";
const DEFAULT_SPINE_STATE_DIR = ".meta-kim/state/default/spine";
const SPINE_STATE_FILE = "spine-state.json";
const ACTIVE_RUN_STATUS_FILE = "active-run.json";
const RUN_STATUS_FILE = "status.json";

export const STAGE_ORDER = [
  "critical",
  "fetch",
  "thinking",
  "execution",
  "review",
  "meta_review",
  "verification",
  "evolution",
];

export const STAGE_PUBLIC_LABELS = {
  critical: "Critical",
  fetch: "Fetch",
  thinking: "Thinking",
  execution: "Execution",
  review: "Review",
  meta_review: "Meta-Review",
  verification: "Verification",
  evolution: "Evolution",
};

export const CHOICE_SURFACE_STATES = [
  "not_allowed",
  "critical_clarification_allowed",
  "execution_confirmation_allowed",
  "completed",
];

const STAGE_PROGRESS_PERCENT = {
  critical: 12,
  fetch: 25,
  thinking: 38,
  execution: 50,
  review: 63,
  meta_review: 75,
  verification: 88,
  evolution: 100,
};

export const STAGE_META_AGENT_MAP = {
  critical: {
    required: ["meta-warden"],
    label: "Critical (Warden scope clarification)",
  },
  fetch: {
    required: [],
    label: "Fetch (capability discovery)",
    requiresFetchRecord: true,
  },
  thinking: {
    required: ["meta-conductor"],
    label: "Thinking (Conductor dispatch board)",
    requiresFetchRecord: true,
  },
  execution: { required: [], label: "Execution", requiresAgentDispatch: true },
  review: {
    required: ["meta-prism"],
    label: "Review (Prism quality forensics)",
  },
  meta_review: {
    required: ["meta-warden"],
    label: "Meta-Review (Warden standards check)",
  },
  verification: {
    required: ["meta-warden"],
    label: "Verification (Warden closure)",
  },
  evolution: { required: [], label: "Evolution (writeback)" },
};

const META_AGENT_NAMES = [
  "meta-warden",
  "meta-conductor",
  "meta-genesis",
  "meta-artisan",
  "meta-sentinel",
  "meta-librarian",
  "meta-prism",
  "meta-scout",
];

function createRunId(timestamp = new Date().toISOString()) {
  return `meta-${timestamp.replace(/[:.]/g, "-")}`;
}

function isWithin(parent, target) {
  // Windows file systems are case-insensitive: normalize and lowercase both
  // sides so that a path like C:\KimProject vs c:\kimproject does not slip
  // past the containment check.
  const isWin = process.platform === "win32";
  const norm = (p) => {
    const n = normalize(p);
    return isWin ? n.toLowerCase() : n;
  };
  const rel = relative(norm(parent), norm(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function sanitizeStateProfile(input) {
  const value =
    typeof input === "string" && input.trim() ? input.trim() : "default";
  if (value === "." || value === ".." || value.length > 80) return "default";
  if (!/^[A-Za-z0-9._-]+$/.test(value)) return "default";
  return value;
}

export function resolveMetaKimStateRoot(cwd) {
  return resolve(cwd || process.cwd(), META_KIM_STATE_ROOT);
}

export function resolveRepoLocalStateDir(cwd, requestedPath, fallbackPath) {
  const repoRoot = resolve(cwd || process.cwd());
  const stateRoot = resolveMetaKimStateRoot(repoRoot);
  const fallback = resolve(repoRoot, fallbackPath || DEFAULT_SPINE_STATE_DIR);
  const raw =
    typeof requestedPath === "string" && requestedPath.trim()
      ? requestedPath.trim()
      : "";

  const candidate = raw
    ? resolve(isAbsolute(raw) ? raw : join(repoRoot, raw))
    : fallback;

  if (isWithin(stateRoot, candidate)) return candidate;
  return fallback;
}

export function resolveProfileStateDir(cwd, profile, ...segments) {
  const safeProfile = sanitizeStateProfile(profile);
  const stateRoot = resolveMetaKimStateRoot(cwd);
  const candidate = resolve(stateRoot, safeProfile, ...segments);
  if (!isWithin(stateRoot, candidate)) {
    return resolve(stateRoot, "default", ...segments);
  }
  return candidate;
}

export function extractMetaAgentName(description, prompt) {
  const text = `${description || ""} ${prompt || ""}`.toLowerCase();
  for (const name of META_AGENT_NAMES) {
    if (text.includes(name)) return name;
  }
  return null;
}

function spineStatePath(cwd) {
  return join(
    resolveRepoLocalStateDir(
      cwd,
      process.env.META_KIM_SPINE_STATE_DIR,
      DEFAULT_SPINE_STATE_DIR,
    ),
    SPINE_STATE_FILE,
  );
}

function ensureDir(filePath) {
  return mkdir(dirname(filePath), { recursive: true });
}

function normalizeStage(stageName) {
  if (typeof stageName !== "string") return "critical";
  const normalized = stageName.trim().toLowerCase().replace(/-/g, "_");
  return STAGE_ORDER.includes(normalized) ? normalized : "critical";
}

/**
 * Normalize a spine state object so downstream code can safely access
 * required array/object fields without TypeError on undefined.
 *
 * Defensive default for spine states written by older versions or by code
 * paths that constructed partial state. Existing valid fields are preserved.
 *
 * @param {object|null|undefined} state - Spine state (may be partial or null)
 * @returns {object} - State with guaranteed default shape for required fields
 */
function normalizeSpineState(state) {
  const base = state && typeof state === "object" ? state : {};
  const normalized = { ...base };

  normalized.dispatchedAgents = Array.isArray(normalized.dispatchedAgents)
    ? [...normalized.dispatchedAgents]
    : [];

  normalized.dispatchChain =
    normalized.dispatchChain && typeof normalized.dispatchChain === "object"
      ? { ...normalized.dispatchChain }
      : {};

  normalized.stages =
    normalized.stages && typeof normalized.stages === "object"
      ? { ...normalized.stages }
      : {};

  normalized.skippedHooks = Array.isArray(normalized.skippedHooks)
    ? [...normalized.skippedHooks]
    : [];

  return normalized;
}

function profileFromState(state) {
  return sanitizeStateProfile(
    state?.profile || state?.stateProfile || process.env.META_KIM_STATE_PROFILE,
  );
}

function cleanLanguageTag(input) {
  return typeof input === "string" && input.trim() ? input.trim() : null;
}

function resolveOutputLanguage(state, options = {}) {
  const candidates = [
    ["tool_selected", options.toolSelectedLanguage || state?.toolSelectedLanguage],
    ["explicit_output_choice", options.outputLanguage || state?.outputLanguage],
    ["intent_gate", state?.intentGatePacket?.userLanguage],
    ["card_decision", state?.cardDecision?.userLanguage],
    ["delivery_shell", state?.deliveryShell?.userLanguage],
    ["latest_user_input", state?.latestUserInputLanguage],
    ["environment", process.env.META_KIM_OUTPUT_LANGUAGE || process.env.LANG],
  ];

  for (const [source, value] of candidates) {
    const language = cleanLanguageTag(value);
    if (language) return { language, source };
  }

  return { language: "undetermined", source: "not_resolved" };
}

function runStatusPaths(cwd, profile, runId) {
  const profileDir = resolveProfileStateDir(cwd, profile);
  return {
    activeRun: join(profileDir, ACTIVE_RUN_STATUS_FILE),
    runStatus: join(profileDir, "runs", runId, RUN_STATUS_FILE),
  };
}

export async function readSpineState(cwd) {
  const filePath = spineStatePath(cwd);
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeSpineState(cwd, state) {
  const filePath = spineStatePath(cwd);
  await ensureDir(filePath);
  const normalized = normalizeSpineState(state);
  await writeFile(filePath, JSON.stringify(normalized, null, 2), "utf-8");
  await writeMetaRunStatus(cwd, normalized);
}

export function createInitialState({ taskClassification, triggerReason }) {
  const triggeredAt = new Date().toISOString();
  return {
    active: true,
    version: 2,
    runId: createRunId(triggeredAt),
    triggeredAt,
    currentStage: "critical",
    stages: {
      critical: { status: "in_progress", completedAt: null },
      fetch: { status: "pending", completedAt: null },
      thinking: { status: "pending", completedAt: null },
      execution: { status: "pending", completedAt: null },
      review: { status: "pending", completedAt: null },
      meta_review: { status: "pending", completedAt: null },
      verification: { status: "pending", completedAt: null },
      evolution: { status: "pending", completedAt: null },
    },
    taskClassification: taskClassification || null,
    triggerReason: triggerReason || "user_invocation",
    dispatchedAgents: [],
    dispatchChain: {},
    choiceSurfaceState: "not_allowed",
    queryBypass: false,
    executionStarted: false,
    // Simple mode: allows hook skipping for lightweight tasks
    simpleMode: false,
    // Audit trail for skipped hooks
    skippedHooks: [],
  };
}

export function createMetaRunStatusEnvelope(state, options = {}) {
  const currentStage = normalizeStage(
    options.currentStage || state?.currentStage || "critical",
  );
  const stageIndex = STAGE_ORDER.indexOf(currentStage) + 1;
  const stageTotal = STAGE_ORDER.length;
  const stages = state?.stages || {};
  const completed = STAGE_ORDER.filter(
    (stage) => stages?.[stage]?.status === "completed",
  ).map((stage) => STAGE_PUBLIC_LABELS[stage]);
  const nextStage =
    stageIndex < stageTotal ? STAGE_ORDER[stageIndex] : null;
  const startedAt =
    state?.triggeredAt || state?.startedAt || new Date().toISOString();
  const updatedAt = new Date().toISOString();
  const runId = state?.runId || createRunId(startedAt);
  const languageResolution = resolveOutputLanguage(state, options);
  const stagePurpose =
    state?.stagePurpose ||
    state?.stagePurposes?.[languageResolution.language] ||
    null;

  return {
    schemaVersion: 1,
    active: state?.active !== false,
    runId,
    triggeredBy:
      state?.triggerReason || state?.triggeredBy || "meta-theory",
    currentStage: STAGE_PUBLIC_LABELS[currentStage],
    currentStageKey: currentStage,
    stageIndex,
    stageTotal,
    percent: STAGE_PROGRESS_PERCENT[currentStage],
    completed,
    next: nextStage ? STAGE_PUBLIC_LABELS[nextStage] : null,
    blockedOn: state?.blockedOn || null,
    startedAt,
    updatedAt,
    lastUserVisibleNotice: state?.lastUserVisibleNotice || null,
    surfaceMode: "public",
    resolvedOutputLanguage: languageResolution.language,
    languageResolution,
    publicSurface: {
      primaryDisplay: "conversation_notice",
      nativeEnhancementAllowed: true,
      popupRequired: false,
      hiddenInternalFields: [
        "Preflight",
        "nativeChoiceSurface",
        "conversation_fallback",
        "packet_id",
        "protocol_trace",
      ],
    },
    publicLabels: state?.publicLabels || null,
    stagePurpose,
    stagePurposeKey: currentStage,
  };
}

export async function writeMetaRunStatus(cwd, state, options = {}) {
  if (!state || typeof state !== "object") return null;
  const envelope = createMetaRunStatusEnvelope(state, options);
  const profile = profileFromState(state);
  const paths = runStatusPaths(cwd, profile, envelope.runId);
  await ensureDir(paths.activeRun);
  await ensureDir(paths.runStatus);
  const serialized = JSON.stringify(envelope, null, 2);
  await Promise.all([
    writeFile(paths.activeRun, serialized, "utf-8"),
    writeFile(paths.runStatus, serialized, "utf-8"),
  ]);
  return envelope;
}

export async function readMetaRunStatus(cwd, profile) {
  const filePath = runStatusPaths(cwd, sanitizeStateProfile(profile), "latest")
    .activeRun;
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function advanceStage(state, stageName) {
  const stageOrder = STAGE_ORDER;

  const idx = stageOrder.indexOf(stageName);
  if (idx === -1) return state;

  const newState = normalizeSpineState(state);

  for (let i = 0; i < idx; i++) {
    const prev = stageOrder[i];
    if (!newState.stages[prev] || newState.stages[prev].status !== "completed") {
      newState.stages[prev] = {
        status: "completed",
        completedAt: new Date().toISOString(),
        autoCompleted: true,
        reason: `Advanced past by stage ${stageName}`,
      };
    }
  }

  newState.stages[stageName] = {
    status: "in_progress",
    completedAt: null,
    startedAt: new Date().toISOString(),
  };
  newState.currentStage = stageName;

  if (stageName === "execution") {
    newState.executionStarted = true;
  }

  return newState;
}

export function completeStage(state, stageName) {
  const newState = normalizeSpineState(state);
  if (!newState.stages[stageName]) return newState;
  newState.stages[stageName] = {
    status: "completed",
    completedAt: new Date().toISOString(),
  };

  const stageOrder = STAGE_ORDER;
  const idx = stageOrder.indexOf(stageName);
  if (idx < stageOrder.length - 1) {
    const nextStage = stageOrder[idx + 1];
    newState.currentStage = nextStage;
    newState.stages[nextStage] = {
      status: "in_progress",
      startedAt: new Date().toISOString(),
    };
  }

  return newState;
}

export function recordDispatch(state, agentName, metaAgentName) {
  const newState = normalizeSpineState(state);
  if (!newState.dispatchedAgents.includes(agentName)) {
    newState.dispatchedAgents = [...newState.dispatchedAgents, agentName];
  }

  if (metaAgentName) {
    const chain = { ...newState.dispatchChain };
    const stage = newState.currentStage;
    if (!chain[stage]) chain[stage] = [];
    if (!chain[stage].includes(metaAgentName)) {
      chain[stage] = [...chain[stage], metaAgentName];
    }
    newState.dispatchChain = chain;
  }

  return newState;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function hasNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

const PRE_EXECUTION_PACKET_STATUS_FIELDS = {
  productCompletenessPacket: "completenessStatus",
  experienceQualityPacket: "experienceStatus",
  testStrategyPacket: "testStatus",
  structureHygienePacket: "hygieneStatus",
  permissionMatrixPacket: "permissionStatus",
  sideEffectLedgerPacket: "sideEffectStatus",
  rollbackPlanPacket: "rollbackStatus",
};

const PRE_EXECUTION_ALLOWED_STATUSES = {
  productCompletenessPacket: ["pass"],
  experienceQualityPacket: ["pass", "not_applicable_with_reason"],
  testStrategyPacket: ["pass"],
  structureHygienePacket: ["pass"],
  permissionMatrixPacket: ["pass"],
  sideEffectLedgerPacket: ["none", "tracked"],
  rollbackPlanPacket: ["ready", "not_applicable_with_reason"],
};

const REQUIRED_PRE_EXECUTION_PACKETS = [
  "dispatchEnvelopePacket",
  "dispatchBoard",
  "orchestrationTaskBoardPacket",
  ...Object.keys(PRE_EXECUTION_PACKET_STATUS_FIELDS),
];

function collectPreExecutionReadinessGaps(state) {
  const missing = [];

  for (const packetName of REQUIRED_PRE_EXECUTION_PACKETS) {
    const packet = state?.[packetName];
    if (!isObject(packet)) {
      missing.push(packetName);
      continue;
    }

    const statusField = PRE_EXECUTION_PACKET_STATUS_FIELDS[packetName];
    if (!statusField) continue;

    const allowed = PRE_EXECUTION_ALLOWED_STATUSES[packetName] || [];
    if (!allowed.includes(packet[statusField])) {
      missing.push(`${packetName}.${statusField}`);
    }
  }

  return missing;
}

export function checkPreExecutionReadiness(state) {
  const normalized = normalizeSpineState(state);
  if (!normalized || normalized.queryBypass || normalized.simpleMode) {
    return {
      met: true,
      missing: [],
      reason: "pre-execution readiness gate bypassed",
    };
  }

  const missing = collectPreExecutionReadinessGaps(normalized);
  return {
    met: missing.length === 0,
    missing,
    reason:
      missing.length === 0
        ? "pre-execution design-time packets are complete"
        : "Pre-execution readiness requires complete design-time dispatch, product, experience, test, structure, permission, side-effect, and rollback packets before execution.",
  };
}

function collectCapabilityNodeBindingGaps(state) {
  const missing = [];

  const fetchRecord = state?.fetchRecord;
  if (!isObject(fetchRecord)) {
    missing.push("fetchRecord");
  } else {
    if (fetchRecord.capabilitySearchPerformed !== true) {
      missing.push("fetchRecord.capabilitySearchPerformed=true");
    }
    if (
      !hasNonEmptyArray(fetchRecord.capabilityMatches) &&
      !hasNonEmptyArray(fetchRecord.matchedCapabilities)
    ) {
      missing.push("fetchRecord.capabilityMatches or fetchRecord.matchedCapabilities");
    }
  }

  const flow = state?.businessFlowBlueprintPacket;
  if (!isObject(flow)) {
    missing.push("businessFlowBlueprintPacket");
  } else {
    const laneGroups = [
      ["requiredLanes", flow.requiredLanes],
      ["optionalLanes", flow.optionalLanes],
    ];
    const lanes = [];
    for (const [groupName, group] of laneGroups) {
      if (!Array.isArray(group)) {
        missing.push(`businessFlowBlueprintPacket.${groupName}`);
        continue;
      }
      for (const [index, lane] of group.entries()) {
        lanes.push(lane);
        const context = `businessFlowBlueprintPacket.${groupName}[${index}]`;
        if (!isObject(lane)) {
          missing.push(context);
          continue;
        }
        for (const field of [
          "laneId",
          "capabilityNeed",
          "capabilitySearchQuery",
          "selectedOwner",
          "selectionReason",
          "coverageStatus",
        ]) {
          if (!isNonEmptyString(lane[field])) missing.push(`${context}.${field}`);
        }
        if (!hasNonEmptyArray(lane.candidateOwners)) {
          missing.push(`${context}.candidateOwners`);
        }
        if (
          !hasNonEmptyArray(lane.candidateSkills) &&
          !hasNonEmptyArray(lane.candidateCapabilities)
        ) {
          missing.push(`${context}.candidateSkills or candidateCapabilities`);
        }
      }
    }
    if (lanes.length === 0) {
      missing.push("businessFlowBlueprintPacket.requiredLanes or optionalLanes");
    }
  }

  const agentBlueprint = state?.agentBlueprintPacket;
  const roleKeys = new Set();
  if (!isObject(agentBlueprint)) {
    missing.push("agentBlueprintPacket");
  } else if (!hasNonEmptyArray(agentBlueprint.roles)) {
    missing.push("agentBlueprintPacket.roles");
  } else {
    for (const [index, role] of agentBlueprint.roles.entries()) {
      const context = `agentBlueprintPacket.roles[${index}]`;
      if (!isObject(role)) {
        missing.push(context);
        continue;
      }
      for (const field of [
        "businessRoleId",
        "roleDisplayName",
        "ownerAgent",
        "ownerSource",
        "agentCopyPolicy",
        "ownerResolution",
        "skillSelectionScope",
      ]) {
        if (!isNonEmptyString(role[field])) missing.push(`${context}.${field}`);
      }
      if (!hasNonEmptyArray(role.assignedResponsibilitySlice)) {
        missing.push(`${context}.assignedResponsibilitySlice`);
      }
      if (!hasNonEmptyArray(role.governanceStageNodes)) {
        missing.push(`${context}.governanceStageNodes`);
      }
      if (
        !hasNonEmptyArray(role.matchedSkills) &&
        !hasNonEmptyArray(role.matchedCapabilities)
      ) {
        missing.push(`${context}.matchedCapabilities or matchedSkills`);
      }
      if (hasNonEmptyArray(role.matchedSkills)) {
        for (const [skillIndex, skill] of role.matchedSkills.entries()) {
          const skillContext = `${context}.matchedSkills[${skillIndex}]`;
          for (const field of [
            "matchId",
            "capabilitySlot",
            "providerId",
            "skillId",
            "source",
            "selectionReason",
            "selectionScope",
          ]) {
            if (!isNonEmptyString(skill?.[field])) missing.push(`${skillContext}.${field}`);
          }
        }
      }
      if (hasNonEmptyArray(role.matchedCapabilities)) {
        for (const [capabilityIndex, capability] of role.matchedCapabilities.entries()) {
          const capabilityContext = `${context}.matchedCapabilities[${capabilityIndex}]`;
          for (const field of [
            "matchId",
            "capabilitySlot",
            "bindingType",
            "bindingRef",
            "source",
            "selectionReason",
            "selectionScope",
          ]) {
            if (!isNonEmptyString(capability?.[field])) {
              missing.push(`${capabilityContext}.${field}`);
            }
          }
        }
        if (!hasNonEmptyArray(role.capabilityBindings)) {
          missing.push(`${context}.capabilityBindings`);
        } else {
          for (const [bindingIndex, binding] of role.capabilityBindings.entries()) {
            const bindingContext = `${context}.capabilityBindings[${bindingIndex}]`;
            for (const field of [
              "bindingId",
              "capabilitySlot",
              "bindingType",
              "bindingRef",
              "source",
              "evidenceRef",
            ]) {
              if (!isNonEmptyString(binding?.[field])) {
                missing.push(`${bindingContext}.${field}`);
              }
            }
          }
          for (const [capabilityIndex, capability] of role.matchedCapabilities.entries()) {
            const hasBinding = role.capabilityBindings.some(
              (binding) =>
                binding.capabilitySlot === capability.capabilitySlot &&
                binding.bindingType === capability.bindingType &&
                binding.bindingRef === capability.bindingRef,
            );
            if (!hasBinding) {
              missing.push(
                `${context}.matchedCapabilities[${capabilityIndex}].capabilityBinding`,
              );
            }
          }
        }
      }
      if (isNonEmptyString(role.ownerAgent) && isNonEmptyString(role.businessRoleId)) {
        roleKeys.add(`${role.ownerAgent}::${role.businessRoleId}`);
      }
    }
  }

  const workerTaskPackets = state?.workerTaskPackets;
  if (!hasNonEmptyArray(workerTaskPackets)) {
    missing.push("workerTaskPackets");
  } else {
    for (const [index, packet] of workerTaskPackets.entries()) {
      const context = `workerTaskPackets[${index}]`;
      if (!isObject(packet)) {
        missing.push(context);
        continue;
      }
      for (const field of [
        "taskPacketId",
        "ownerAgent",
        "businessRoleId",
        "roleDisplayName",
        "roleInstanceId",
        "todayTask",
        "output",
        "verifySteps",
      ]) {
        const value = packet[field];
        if (field === "verifySteps") {
          if (!hasNonEmptyArray(value)) missing.push(`${context}.${field}`);
        } else if (!isNonEmptyString(value)) {
          missing.push(`${context}.${field}`);
        }
      }
      const roleKey = `${packet.ownerAgent}::${packet.businessRoleId}`;
      if (!roleKeys.has(roleKey)) {
        missing.push(`${context}.agentBlueprintRoleBinding`);
      }
    }
  }

  return missing;
}

export function checkCapabilityNodeBindings(state) {
  const normalized = normalizeSpineState(state);
  if (!normalized || normalized.queryBypass || normalized.simpleMode) {
    return { met: true, missing: [], reason: "capability node binding gate bypassed" };
  }

  const missing = collectCapabilityNodeBindingGaps(normalized);
  return {
    met: missing.length === 0,
    missing,
    reason:
      missing.length === 0
        ? "capability node bindings present"
        : "Execution requires every orchestration node to carry capability search evidence, selected owner, run-scoped skill/tool evidence, and worker task binding.",
  };
}

export function checkStageRequirements(state) {
  const normalized = normalizeSpineState(state);
  const stage = normalized.currentStage;
  const req = STAGE_META_AGENT_MAP[stage];
  if (!req) return { met: true, missing: [], reason: "no requirements" };

  const chain = normalized.dispatchChain;
  const dispatched = chain[stage] || [];

  const missing = req.required.filter((a) => !dispatched.includes(a));

  if (req.requiresAgentDispatch && normalized.dispatchedAgents.length === 0) {
    return {
      met: false,
      missing: ["at least one agent via Agent tool"],
      reason: `Stage "${stage}" requires at least one agent dispatch before execution.`,
    };
  }

  // Verify fetchRecord exists when stage requires it
  if (req.requiresFetchRecord && !normalized.fetchRecord) {
    return {
      met: false,
      missing: ["fetchRecord in spine state"],
      reason:
        "Fetch stage must produce a fetchRecord before advancing to Thinking. " +
        "Complete capability search, write fetchRecord to spine state, then return to Thinking.",
    };
  }

  // Verify research validation when fetchRecord declares research required
  if (
    normalized.fetchRecord &&
    normalized.fetchRecord.researchRequired &&
    !normalized.fetchRecord.researchValidationPerformed
  ) {
    return {
      met: false,
      missing: ["research validation in fetchRecord"],
      reason:
        "Task requires research validation but researchValidationPerformed=false. " +
        "Discover web search tools via capability descriptors, search ≥5 source categories, " +
        "record in fetchRecord, then return to Thinking.",
    };
  }

  const choiceSurfaceGate = checkChoiceSurfaceGate(normalized);
  if (!choiceSurfaceGate.met) {
    return choiceSurfaceGate;
  }

  if (STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf("execution")) {
    const readinessGate = checkPreExecutionReadiness(normalized);
    if (!readinessGate.met) {
      return readinessGate;
    }

    const nodeBindingGate = checkCapabilityNodeBindings(normalized);
    if (!nodeBindingGate.met) {
      return nodeBindingGate;
    }
  }

  return {
    met: missing.length === 0,
    missing,
    reason:
      missing.length > 0
        ? `Stage "${stage}" requires meta-agent(s): ${missing.join(", ")}. Dispatch them via Agent tool first.`
        : "requirements met",
  };
}

function normalizeChoiceSurfaceState(value) {
  return CHOICE_SURFACE_STATES.includes(value) ? value : "not_allowed";
}

function hasFetchEvidence(state) {
  return !!(
    state?.fetchRecord ||
    state?.fetchPacket ||
    state?.contentEvidencePacket ||
    state?.capabilityEvidencePacket
  );
}

function hasCandidateOptions(frame) {
  if (!frame || typeof frame !== "object") return false;
  const optionFields = [
    frame.candidatePaths,
    frame.solutionPaths,
    frame.options,
    frame.candidates,
    frame.cards,
  ];
  return optionFields.some((value) => Array.isArray(value) && value.length > 0);
}

function getPreDecisionOptionFrame(state) {
  return (
    state?.preDecisionOptionFrame ||
    state?.cardPlanPacket ||
    state?.businessFlowBlueprintPacket ||
    null
  );
}

function hasChoiceGateSkip(state) {
  const frame = getPreDecisionOptionFrame(state);
  return !!(
    state?.choiceGateSkip ||
    frame?.choiceGateSkip ||
    state?.intentGatePacket?.choiceGateSkip
  );
}

export function checkChoiceSurfaceGate(state) {
  if (!state || state.queryBypass || state.simpleMode) {
    return { met: true, missing: [], reason: "choice surface gate bypassed" };
  }

  const stage = normalizeStage(state.currentStage);
  const stageIdx = STAGE_ORDER.indexOf(stage);
  const thinkingIdx = STAGE_ORDER.indexOf("thinking");
  const executionIdx = STAGE_ORDER.indexOf("execution");
  const choiceState = normalizeChoiceSurfaceState(state.choiceSurfaceState);
  const fetchEvidencePresent = hasFetchEvidence(state);
  const preDecisionFrame = getPreDecisionOptionFrame(state);
  const candidateOptionsPresent = hasCandidateOptions(preDecisionFrame);
  const skipRecorded = hasChoiceGateSkip(state);
  const decisionBasisPresent =
    fetchEvidencePresent && (candidateOptionsPresent || skipRecorded);

  if (
    stageIdx < thinkingIdx &&
    (choiceState === "execution_confirmation_allowed" ||
      choiceState === "completed")
  ) {
    return {
      met: false,
      missing: ["Fetch evidence", "Thinking candidate options"],
      reason:
        "Choice Surface Gate violation: execution confirmation appeared before Fetch and Thinking completed.",
    };
  }

  if (
    stage === "thinking" &&
    (choiceState === "execution_confirmation_allowed" ||
      choiceState === "completed") &&
    !decisionBasisPresent
  ) {
    return {
      met: false,
      missing: ["Fetch evidence", "preDecisionOptionFrame"],
      reason:
        "Choice Surface Gate violation: execution confirmation requires Fetch evidence and a Thinking option frame.",
    };
  }

  if (stageIdx >= executionIdx) {
    if (!decisionBasisPresent) {
      return {
        met: false,
        missing: ["Fetch evidence", "preDecisionOptionFrame"],
        reason:
          "Execution cannot start before Fetch evidence and Thinking candidate options are recorded.",
      };
    }

    if (choiceState !== "completed" && !skipRecorded) {
      return {
        met: false,
        missing: ["choiceSurfaceState=completed"],
        reason:
          "Execution cannot start before execution confirmation is completed or an explicit choiceGateSkip is recorded.",
      };
    }
  }

  return { met: true, missing: [], reason: "choice surface gate met" };
}

export function setQueryBypass(state, bypass) {
  return { ...state, queryBypass: bypass };
}

export function deactivateState(state) {
  return {
    ...state,
    active: false,
    deactivatedAt: new Date().toISOString(),
  };
}

export function isExecutionTool(toolName) {
  const execTools = [
    "Write",
    "Edit",
    "Bash",
    "MultiEdit",
    "NotebookEdit",
    "apply_patch",
  ];
  return execTools.includes(toolName);
}

export function isReadOnlyTool(toolName) {
  const readOnlyTools = [
    "Read",
    "Glob",
    "Grep",
    "LSPO",
    "TaskList",
    "TaskGet",
    "TaskOutput",
    "WebFetch",
    "WebSearch",
    "ListMcpResourcesTool",
    "ReadMcpResourceTool",
  ];
  return readOnlyTools.includes(toolName);
}

/**
 * Enable or disable simple mode in spine state
 * Simple mode allows selective hook skipping for lightweight tasks
 */
export function setSimpleMode(state, enabled) {
  return { ...state, simpleMode: !!enabled };
}

/**
 * Record a skipped hook to the audit trail
 * @param {object} state - Current spine state
 * @param {string} hookName - Name of the hook being skipped
 * @param {string} reason - Why the hook was skipped
 * @returns {object} - Updated state with skip record added
 */
export function recordSkippedHook(state, hookName, reason) {
  const record = {
    hook: hookName,
    reason,
    timestamp: new Date().toISOString(),
  };

  return {
    ...state,
    skippedHooks: [...(state.skippedHooks || []), record],
  };
}

/**
 * Get the current governance flow from task classification
 * Maps task classification to governance flow for hook skip decisions
 */
export function getGovernanceFlow(state) {
  const tc = state?.taskClassification;

  // Direct mapping from common classifications to governance flows
  const flowMap = {
    query: "query",
    simple_exec: "simple_exec",
    complex_dev: "complex_dev",
    meta_theory_auto: "complex_dev", // meta-theory is always complex
  };

  return flowMap[tc] || "simple_exec"; // Default to simple_exec
}
