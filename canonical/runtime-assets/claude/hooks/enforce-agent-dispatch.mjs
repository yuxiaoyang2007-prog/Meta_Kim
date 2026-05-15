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
} from "./spine-state.mjs";

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

let state = await readSpineState(cwd);

if (!state && isSpineStateWrite()) {
  process.exit(0);
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
