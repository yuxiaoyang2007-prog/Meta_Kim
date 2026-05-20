import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname, resolve, relative, isAbsolute } from "node:path";

const META_KIM_STATE_ROOT = ".meta-kim/state";
const DEFAULT_SPINE_STATE_DIR = ".meta-kim/state/default/spine";
const SPINE_STATE_FILE = "spine-state.json";

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

function isWithin(parent, target) {
  const rel = relative(parent, target);
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
  await writeFile(filePath, JSON.stringify(state, null, 2), "utf-8");
}

export function createInitialState({ taskClassification, triggerReason }) {
  return {
    active: true,
    version: 2,
    triggeredAt: new Date().toISOString(),
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
    queryBypass: false,
    executionStarted: false,
    // Simple mode: allows hook skipping for lightweight tasks
    simpleMode: false,
    // Audit trail for skipped hooks
    skippedHooks: [],
  };
}

export function advanceStage(state, stageName) {
  const stageOrder = [
    "critical",
    "fetch",
    "thinking",
    "execution",
    "review",
    "meta_review",
    "verification",
    "evolution",
  ];

  const idx = stageOrder.indexOf(stageName);
  if (idx === -1) return state;

  const newState = { ...state };

  for (let i = 0; i < idx; i++) {
    const prev = stageOrder[i];
    if (newState.stages[prev].status !== "completed") {
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
  if (!state.stages[stageName]) return state;
  const newState = { ...state };
  newState.stages[stageName] = {
    status: "completed",
    completedAt: new Date().toISOString(),
  };

  const stageOrder = [
    "critical",
    "fetch",
    "thinking",
    "execution",
    "review",
    "meta_review",
    "verification",
    "evolution",
  ];
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
  const newState = { ...state };
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

export function checkStageRequirements(state) {
  const stage = state.currentStage;
  const req = STAGE_META_AGENT_MAP[stage];
  if (!req) return { met: true, missing: [], reason: "no requirements" };

  const chain = state.dispatchChain || {};
  const dispatched = chain[stage] || [];

  const missing = req.required.filter((a) => !dispatched.includes(a));

  if (req.requiresAgentDispatch && state.dispatchedAgents.length === 0) {
    return {
      met: false,
      missing: ["at least one agent via Agent tool"],
      reason: `Stage "${stage}" requires at least one agent dispatch before execution.`,
    };
  }

  // Verify fetchRecord exists when stage requires it
  if (req.requiresFetchRecord && !state.fetchRecord) {
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
    state.fetchRecord &&
    state.fetchRecord.researchRequired &&
    !state.fetchRecord.researchValidationPerformed
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

  return {
    met: missing.length === 0,
    missing,
    reason:
      missing.length > 0
        ? `Stage "${stage}" requires meta-agent(s): ${missing.join(", ")}. Dispatch them via Agent tool first.`
        : "requirements met",
  };
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
  const execTools = ["Write", "Edit", "Bash", "MultiEdit", "NotebookEdit"];
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
