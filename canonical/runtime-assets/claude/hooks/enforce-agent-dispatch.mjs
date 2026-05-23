/**
 * enforce-agent-dispatch.mjs — Meta_Kim Spine PreToolUse guard.
 *
 * Responsibilities:
 *   1. Spine-active runs: gate execution tools until the right meta-agents have
 *      been dispatched per stage requirements.
 *   2. Meta-agent readonly enforcement: even when spine is inactive (or skipped),
 *      a caller identified as a meta-* agent must not directly mutate the
 *      workspace via Edit / Write / MultiEdit / NotebookEdit / Bash. They must
 *      dispatch down to an execution worker instead.
 *
 * Environment knobs:
 *   META_KIM_HOOK_SKIP
 *     Truthy ("1", "true", any non-empty non-"empty"/"0"/"false") -> skip hook.
 *
 *   META_KIM_META_ENFORCEMENT_MODE  (controls meta-* readonly enforcement)
 *     "warn"
 *         Log to stderr and allow the tool call. Use for soft rollout.
 *     "block"
 *         Deny outright when a meta-* caller attempts mutation. Final state.
 *     "progressive" (default)
 *         For the first META_KIM_META_ENFORCEMENT_GRACE_DAYS (default 7) days
 *         since the run started, behave as "warn"; afterwards behave as
 *         "block". Lets teams adopt the new contract without breakage.
 *
 *   META_KIM_META_ENFORCEMENT_GRACE_DAYS
 *     Integer day count for the progressive grace window. Default 7.
 *
 *   CLAUDE_SUBAGENT_TYPE
 *     Runtime-injected hint for the current subagent's type. When this starts
 *     with "meta-" we treat the caller as a meta-agent without further parsing.
 */

import process from "node:process";
import { join, normalize } from "node:path";
import { readJsonFromStdin, extractFilePath } from "./utils.mjs";
import { isReadOnlyBash, classifyBashCommand } from "./bash-readonly-whitelist.mjs";
import {
  readSpineState,
  isExecutionTool,
  isReadOnlyTool,
  recordDispatch,
  writeSpineState,
  checkStageRequirements,
  checkChoiceSurfaceGate,
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
  // Windows paths are case-insensitive: comparing the lowercased, normalized
  // suffix prevents a meta-agent from sneaking writes via mixed case such as
  // "Spine-State.JSON".
  const normalized = normalize(targetPath || "").toLowerCase();
  const spineFile = normalize("spine-state.json").toLowerCase();
  if (normalized.endsWith(spineFile)) return true;
  // Also reject anything under a ".../spine/..." segment so adjacent ledger
  // files do not become a back door.
  return /[\\/]spine[\\/]/.test(normalized);
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
    `Use governance meta owners plus run-scoped matchedSkills/tools for public Meta_Kim execution capability.\n` +
    `If this is governance work (coordination, review, synthesis), you may ignore this warning.\n`;

  process.stderr.write(warning);
}

/**
 * Infer the caller's identity (which agent is making the current tool call).
 * Priority order:
 *   1. CLAUDE_SUBAGENT_TYPE environment variable (runtime-injected).
 *   2. Latest entry in spine state's dispatchChain (most recently dispatched
 *      owner for the current stage).
 *   3. Conservative fallback: null. The caller treats null as "unknown" and
 *      degrades to warn-mode so that legitimate user activity is not blocked
 *      by a parsing miss.
 *
 * @param {object|null} state
 * @returns {{ name: string|null, source: string }}
 */
function inferCallerIdentity(state) {
  const envHint = process.env.CLAUDE_SUBAGENT_TYPE;
  if (envHint && typeof envHint === "string" && envHint.trim()) {
    return { name: envHint.trim(), source: "env" };
  }

  const chain = state?.dispatchChain;
  const stage = state?.currentStage;
  if (chain && stage && Array.isArray(chain[stage]) && chain[stage].length) {
    // The most recently appended entry is the active owner for this stage.
    const latest = chain[stage][chain[stage].length - 1];
    if (latest) return { name: latest, source: "spine_chain" };
  }

  // Walk back through all stages, newest first, as a secondary signal.
  if (chain && typeof chain === "object") {
    const stages = Object.keys(chain);
    for (let i = stages.length - 1; i >= 0; i--) {
      const list = chain[stages[i]];
      if (Array.isArray(list) && list.length) {
        return { name: list[list.length - 1], source: "spine_chain_walk" };
      }
    }
  }

  return { name: null, source: "unknown" };
}

/**
 * Decide which enforcement mode is active right now.
 *
 *   warn        -> log + allow
 *   block       -> deny
 *   progressive -> warn during grace window, block after
 *
 * Returns the resolved mode string: "warn" or "block".
 */
function resolveEnforcementMode(state) {
  const raw = (process.env.META_KIM_META_ENFORCEMENT_MODE || "progressive")
    .toLowerCase()
    .trim();

  if (raw === "warn") return "warn";
  if (raw === "block") return "block";

  // progressive (default)
  const graceDaysRaw = parseInt(
    process.env.META_KIM_META_ENFORCEMENT_GRACE_DAYS || "7",
    10,
  );
  const graceDays = Number.isFinite(graceDaysRaw) && graceDaysRaw >= 0 ? graceDaysRaw : 7;
  const startedAt =
    state?.runStartTimestamp || state?.triggeredAt || state?.startedAt || null;
  if (!startedAt) {
    // No anchor: be conservative and warn.
    return "warn";
  }
  const startedMs = Date.parse(startedAt);
  if (!Number.isFinite(startedMs)) return "warn";
  const elapsedDays = (Date.now() - startedMs) / (1000 * 60 * 60 * 24);
  return elapsedDays < graceDays ? "warn" : "block";
}

/**
 * Enforce meta-* readonly contract for execution tools.
 *
 * Edit / Write / MultiEdit / NotebookEdit / MCP-write → deny (meta cannot
 *   directly mutate the workspace; it must dispatch downward).
 * Bash → allow if isReadOnlyBash(command) is true; otherwise apply mode.
 *
 * Calls process.exit(0) after writing a deny payload. Returns true if the
 * caller should stop processing (because we already emitted output and exited),
 * false otherwise.
 *
 * @param {string} toolName
 * @param {object} input
 * @param {object|null} state
 * @param {{ name: string|null, source: string }} caller
 */
function enforceMetaReadonly(toolName, input, state, caller) {
  const callerLabel = caller.name || "unknown-meta-caller";

  // Bash: classify first; read-only commands pass through silently.
  if (toolName === "Bash") {
    const command = input?.command || "";
    const verdict = classifyBashCommand(command);
    if (verdict.readOnly) return false; // safe, fall through

    const mode = resolveEnforcementMode(state);
    const reasonText =
      `Meta-agent "${callerLabel}" attempted to run a non-read-only Bash command. ` +
      `Reason: ${verdict.reason}. Offending segment: ${verdict.segment || command}. ` +
      `Meta-agents must dispatch to an execution worker (e.g. Agent tool) instead of running mutating commands directly.`;

    if (mode === "warn") {
      process.stderr.write(`\n⚠️  [Meta_Kim meta-readonly:warn] ${reasonText}\n`);
      return false; // allow
    }
    deny(reasonText);
    process.exit(0);
  }

  // Any direct file-mutation tool is denied for meta-* callers.
  const mutationTools = new Set([
    "Edit",
    "Write",
    "MultiEdit",
    "NotebookEdit",
  ]);
  if (mutationTools.has(toolName)) {
    const mode = resolveEnforcementMode(state);
    const reasonText =
      `Meta-agent "${callerLabel}" attempted to use ${toolName} directly. ` +
      `Meta-agents must dispatch this work to an execution worker via the Agent tool ` +
      `(e.g. dispatch to a frontend/backend/test specialist) instead of editing files themselves.`;
    if (mode === "warn") {
      process.stderr.write(`\n⚠️  [Meta_Kim meta-readonly:warn] ${reasonText}\n`);
      return false;
    }
    deny(reasonText);
    process.exit(0);
  }

  // MCP write-like operations: best-effort heuristic — anything with create/update/
  // delete/write/push in the tool name from MCP namespaces.
  if (
    typeof toolName === "string" &&
    /(create|update|delete|write|push|publish|merge|patch|put)/i.test(toolName) &&
    /^mcp__/i.test(toolName)
  ) {
    const mode = resolveEnforcementMode(state);
    const reasonText =
      `Meta-agent "${callerLabel}" attempted MCP mutation via ${toolName}. ` +
      `Dispatch to an execution agent instead.`;
    if (mode === "warn") {
      process.stderr.write(`\n⚠️  [Meta_Kim meta-readonly:warn] ${reasonText}\n`);
      return false;
    }
    deny(reasonText);
    process.exit(0);
  }

  return false;
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

// Even when spine is inactive or unset, the meta-* readonly contract still
// applies: a meta agent must never directly mutate the workspace, regardless
// of spine state. We attempt to identify the caller and, if it is a meta-*
// agent invoking an execution tool, route through enforceMetaReadonly().
//
// This is the fix for the "spine-inactive escape hatch" — without it, every
// restriction would evaporate as soon as the spine deactivated.
if (!state || !state.active) {
  if (isExecutionTool(toolName)) {
    const caller = inferCallerIdentity(state);
    if (caller.name && isMetaAgent(caller.name)) {
      enforceMetaReadonly(toolName, toolInput, state, caller);
      // If enforceMetaReadonly chose warn-mode, fall through to exit(0) below.
    }
  }
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
  // Meta-agent readonly enforcement (covers Bash/Edit/Write/MultiEdit/NotebookEdit).
  // This runs BEFORE the spine-state-write / planning-file exemptions so that a
  // meta-* caller cannot, for example, push hand-crafted Bash through the
  // planning-file shortcut. Spine-state writes themselves are still exempt
  // only for non-meta callers (they fall through this guard untouched).
  const caller = inferCallerIdentity(state);
  if (caller.name && isMetaAgent(caller.name)) {
    enforceMetaReadonly(toolName, toolInput, state, caller);
    // warn-mode falls through; block-mode already exited.
  }

  if (isSpineStateWrite() || isPlanningFile()) {
    process.exit(0);
  }

  const choiceSurfaceGate = checkChoiceSurfaceGate(state);
  if (!choiceSurfaceGate.met) {
    deny(
      `${choiceSurfaceGate.reason} Missing: ${choiceSurfaceGate.missing.join(", ")}.`,
    );
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
