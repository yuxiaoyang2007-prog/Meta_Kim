import path from "node:path";

// Renderer contract shared by projection writes and uninstall ownership checks.
// Keep the file set centralized so a new workspace artifact cannot become
// removable before the renderer itself declares it.
export const OPENCLAW_WORKSPACE_FILE_NAMES = Object.freeze([
  "BOOT.md",
  "BOOTSTRAP.md",
  "IDENTITY.md",
  "MEMORY.md",
  "USER.md",
  "SOUL.md",
  "AGENTS.md",
  "HEARTBEAT.md",
  "TOOLS.md",
]);

export function resolveOpenClawWorkspaceOwnedFiles(projection, agentIds) {
  if (!projection || typeof projection.workspaceDir !== "function") return [];
  return [...new Set(agentIds ?? [])].flatMap((agentId) =>
    OPENCLAW_WORKSPACE_FILE_NAMES.map((fileName) =>
      path.join(projection.workspaceDir(agentId), fileName)
    )
  );
}
