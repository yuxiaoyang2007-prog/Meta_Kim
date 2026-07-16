export const MCP_MEMORY_SETUP_ACTION = Object.freeze({
  RUN: "run",
  SKIP: "skip",
});

export const MCP_MEMORY_SETUP_REASON = Object.freeze({
  READY: "ready",
  GLOBAL_HOOKS_REQUIRED: "global_hooks_required",
  OPTIONAL_TOOLS_DISABLED: "optional_tools_disabled",
});

export function resolveMcpMemorySetupPolicy({
  needGlobal = false,
  withGlobalHooks = false,
  skipOptionalTools = false,
} = {}) {
  if (!needGlobal || !withGlobalHooks) {
    return {
      action: MCP_MEMORY_SETUP_ACTION.SKIP,
      reason: MCP_MEMORY_SETUP_REASON.GLOBAL_HOOKS_REQUIRED,
    };
  }
  if (skipOptionalTools) {
    return {
      action: MCP_MEMORY_SETUP_ACTION.SKIP,
      reason: MCP_MEMORY_SETUP_REASON.OPTIONAL_TOOLS_DISABLED,
    };
  }
  return {
    action: MCP_MEMORY_SETUP_ACTION.RUN,
    reason: MCP_MEMORY_SETUP_REASON.READY,
  };
}
