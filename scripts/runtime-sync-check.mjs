export const META_AGENTS = [
  "meta-artisan",
  "meta-conductor",
  "meta-genesis",
  "meta-librarian",
  "meta-prism",
  "meta-scout",
  "meta-sentinel",
  "meta-warden",
];

export const OPENCLAW_WORKSPACE_MD = [
  "BOOT.md",
  "BOOTSTRAP.md",
  "IDENTITY.md",
  "MEMORY.md",
  "USER.md",
  "SOUL.md",
  "AGENTS.md",
  "HEARTBEAT.md",
  "TOOLS.md",
];

export const CLAUDE_HOOK_FILES = [
  "block-dangerous-bash.mjs",
  "pre-git-push-confirm.mjs",
  "post-format.mjs",
  "post-typecheck.mjs",
  "post-console-log-warn.mjs",
  "subagent-context.mjs",
  "stop-compaction.mjs",
  "stop-memory-save.mjs",
  "stop-console-log-audit.mjs",
  "stop-completion-guard.mjs",
];

export function expectedAgentProjectionFiles(
  extension,
  agentIds = META_AGENTS,
) {
  return agentIds.map((id) => `${id}${extension}`);
}

export function summarizeExpectedFiles(existingFiles, expectedFiles) {
  const existing = new Set(existingFiles);
  const expected = [...expectedFiles];
  const present = expected.filter((file) => existing.has(file));
  const missing = expected.filter((file) => !existing.has(file));
  const extra = existingFiles.filter((file) => !expected.includes(file));

  return {
    present,
    missing,
    extra,
    presentCount: present.length,
  };
}
