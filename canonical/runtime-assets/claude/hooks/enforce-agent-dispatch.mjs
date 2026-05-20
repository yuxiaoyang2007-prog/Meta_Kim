import process from "node:process";
import { join } from "node:path";
import { readJsonFromStdin, extractFilePath } from "./utils.mjs";
import {
  readSpineState,
  isExecutionTool,
  isReadOnlyTool,
  recordDispatch,
  writeSpineState,
  checkStageRequirements,
  STAGE_META_AGENT_MAP,
  extractMetaAgentName,
  setSimpleMode,
  recordSkippedHook,
  getGovernanceFlow,
} from "./spine-state.mjs";
import {
  getSkipRule,
  hasSimpleKeyword,
  recordSkip,
  formatSkipReason,
  getHookImpact,
  SKIP_DECISION,
} from "./skip-reminder.mjs";

const cwd = process.cwd();
const payload = await readJsonFromStdin();
const toolName = payload?.tool_name ?? "";
const toolInput = payload?.tool_input ?? {};

const SPINE_STATE_DIR =
  process.env.META_KIM_SPINE_STATE_DIR || ".meta-kim/state/default/spine";
const targetPath = extractFilePath(payload) || "";

function isSpineStateWrite() {
  return (
    targetPath.includes("spine-state.json") || targetPath.includes("spine")
  );
}

function isPlanningFile() {
  const planningFiles = ["task_plan.md", "findings.md", "progress.md"];
  if (planningFiles.some((f) => targetPath.endsWith(f))) return true;
  const cmd = (toolInput?.command || "").toLowerCase();
  return planningFiles.some((f) => cmd.includes(f.toLowerCase()));
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `[Meta_Kim Spine] ${reason}`,
      },
    }),
  );
}

/**
 * Check if an agent is a meta-agent (governance layer)
 * Meta-agents are identified by the "meta-" prefix in their name
 * They should NOT be used for direct execution work
 *
 * @param {string} agentName - The agent name to check
 * @returns {boolean} - true if this is a meta-agent
 */
function isMetaAgent(agentName) {
  if (!agentName || typeof agentName !== "string") return false;
  const lowerName = agentName.toLowerCase();
  // Check for meta- prefix in various formats
  return (
    lowerName.startsWith("meta-") ||
    lowerName.includes("meta-warden") ||
    lowerName.includes("meta-prism") ||
    lowerName.includes("meta-conductor") ||
    lowerName.includes("meta-genesis") ||
    lowerName.includes("meta-artisan") ||
    lowerName.includes("meta-sentinel") ||
    lowerName.includes("meta-librarian") ||
    lowerName.includes("meta-scout") ||
    lowerName.includes("meta-chrysalis")
  );
}

/**
 * Emit a warning if a meta-agent is being dispatched for execution work
 *
 * @param {string} agentName - The agent being dispatched
 * @param {string} stage - Current stage
 */
function warnMetaAgentExecution(agentName, stage) {
  const warning = `\n⚠️  [Meta_Kim] WARNING: Meta-agent "${agentName}" may be used for execution work in stage "${stage}"\n` +
    `Meta-agents (layer='meta') are for governance coordination only.\n` +
    `They should NOT perform direct execution tasks like writing code or running tests.\n` +
    `Use execution-agents (layer='execution') for execution work.\n` +
    `If this is governance work (coordination, review, synthesis), you may ignore this warning.\n`;

  process.stderr.write(warning);
}

/**
 * Determine if this hook should be skipped based on configuration and context
 * Checks (in priority order):
 * 1. META_KIM_HOOK_SKIP environment variable (explicit user override)
 * 2. Simple mode flag in spine state
 * 3. Simple keywords in prompt (auto-detection)
 * 4. Governance flow rules (PRIN-ST: configuration-based)
 *
 * @param {object} state - Current spine state
 * @param {string} userPrompt - User's prompt for analysis
 * @returns {object} - { shouldSkip: boolean, reason: string, source: string }
 */
function shouldSkipHook(state, userPrompt) {
  const hookName = "enforce-agent-dispatch";
  const envSkip = process.env.META_KIM_HOOK_SKIP;

  // Priority 1: Explicit environment variable (user override)
  if (envSkip && envSkip !== "empty" && envSkip !== "0" && envSkip !== "false") {
    return {
      shouldSkip: true,
      reason: formatSkipReason("env_var"),
      source: "env_var",
    };
  }

  // Priority 2: Simple mode flag in spine state
  if (state?.simpleMode) {
    return {
      shouldSkip: true,
      reason: formatSkipReason("simple_mode"),
      source: "simple_mode",
    };
  }

  // Priority 3: Auto-detect simple keywords in prompt
  if (hasSimpleKeyword(userPrompt)) {
    return {
      shouldSkip: true,
      reason: formatSkipReason("keyword"),
      source: "keyword",
    };
  }

  // Priority 4: Governance flow rules (PRIN-ST configuration)
  const governanceFlow = getGovernanceFlow(state);
  const skipDecision = getSkipRule(hookName, governanceFlow);

  if (skipDecision === SKIP_DECISION.SKIP) {
    return {
      shouldSkip: true,
      reason: formatSkipReason("governance_flow", governanceFlow),
      source: "governance_flow",
    };
  }

  return { shouldSkip: false, reason: "", source: null };
}

let state = await readSpineState(cwd);

if (!state && isSpineStateWrite()) {
  process.exit(0);
}

// Extract user prompt for skip detection
const userPrompt = payload?.invocation?.prompt || payload?.prompt || "";

// Check if hook should be skipped (skip-reminder module)
if (state && state.active) {
  const skipDecision = shouldSkipHook(state, userPrompt);

  if (skipDecision.shouldSkip) {
    // Output reminder to stderr
    recordSkip(
      "enforce-agent-dispatch",
      skipDecision.reason,
      getHookImpact("enforce-agent-dispatch"),
    );

    // Record to spine state for audit trail
    state = recordSkippedHook(state, "enforce-agent-dispatch", skipDecision.reason);
    await writeSpineState(cwd, state);

    process.exit(0); // Skip hook execution
  }
}

if (!state || !state.active) {
  process.exit(0);
}

// Agent tool: record dispatch + track dispatch chain
if (toolName === "Agent") {
  const agentDesc =
    toolInput?.description || toolInput?.prompt?.substring(0, 80) || "unknown";
  const metaName = extractMetaAgentName(
    toolInput?.description,
    toolInput?.prompt,
  );

  // Check if a meta-agent is being dispatched for execution work
  // Warn if in execution stage and dispatching a meta-agent
  if (metaName && isMetaAgent(metaName)) {
    const stage = state.currentStage;
    // Warn in execution stage or if description suggests execution work
    const execKeywords = [
      "implement", "write", "create", "build", "test", "fix", "debug",
      "execute", "run", "generate", "produce", "code", "验收"
    ];
    const isExecWork = execKeywords.some(kw =>
      (agentDesc + " " + (toolInput?.prompt || "")).toLowerCase().includes(kw)
    );

    if (stage === "execution" && isExecWork) {
      warnMetaAgentExecution(metaName, stage);
    }
  }

  const updated = recordDispatch(state, agentDesc, metaName);
  await writeSpineState(cwd, updated);
  process.exit(0);
}

// Task tools: always allow
if (
  toolName === "TaskCreate" ||
  toolName === "TaskUpdate" ||
  toolName === "TaskList" ||
  toolName === "TaskGet" ||
  toolName === "TaskOutput" ||
  toolName === "TaskStop"
) {
  process.exit(0);
}

// Read-only tools: always allow
if (isReadOnlyTool(toolName)) {
  process.exit(0);
}

// Query bypass: allow everything
if (state.queryBypass) {
  process.exit(0);
}

// Execution tools: enforce dispatch chain
if (isExecutionTool(toolName)) {
  if (isSpineStateWrite() || isPlanningFile()) {
    process.exit(0);
  }

  const stage = state.currentStage;
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
  const currentIdx = stageOrder.indexOf(stage);
  const execIdx = stageOrder.indexOf("execution");

  // Pre-execution stages: block + check meta-agent requirements
  if (currentIdx < execIdx) {
    const req = checkStageRequirements(state);
    const stageInfo = STAGE_META_AGENT_MAP[stage];
    const label = stageInfo?.label || stage;

    if (!req.met) {
      deny(
        `Stage "${label}" requires: ${req.missing.join(", ")}. ` +
          `Dispatch them via Agent tool (description must contain the meta-agent name). ` +
          `Dispatch chain so far: ${JSON.stringify(state.dispatchChain || {})}`,
      );
    } else {
      deny(
        `You are in stage "${label}". Complete this stage before executing. ` +
          `Dispatch chain: ${JSON.stringify(state.dispatchChain || {})}`,
      );
    }
    process.exit(0);
  }

  // Execution stage: require at least one agent dispatch
  if (stage === "execution" && state.dispatchedAgents.length === 0) {
    deny(
      "Execution stage requires at least one agent dispatch via Agent tool. " +
        "Dispatch a specialist first. Violation: self-execution without delegation.",
    );
    process.exit(0);
  }

  // Post-execution stages: require correct meta-agent
  if (currentIdx >= execIdx && stage !== "execution") {
    const req = checkStageRequirements(state);
    if (!req.met) {
      const stageInfo = STAGE_META_AGENT_MAP[stage];
      deny(
        `Stage "${stageInfo?.label || stage}" requires: ${req.missing.join(", ")}. ` +
          `Dispatch them via Agent tool first. ` +
          `Dispatch chain: ${JSON.stringify(state.dispatchChain || {})}`,
      );
      process.exit(0);
    }
  }
}

process.exit(0);
