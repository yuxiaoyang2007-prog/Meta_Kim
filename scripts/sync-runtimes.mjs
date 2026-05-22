import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  buildMetaKimHooksTemplate,
  mergeGlobalMetaKimHooksIntoSettings,
  mergeRepoClaudeSettings,
} from "./claude-settings-merge.mjs";
import {
  buildCodexHooksJson,
  buildCursorHooksJson,
  buildHookPromptAdapterSource,
  nodeHookCommand,
} from "./runtime-hook-mapping.mjs";
import {
  canonicalAgentsDir,
  canonicalCapabilityIndexDir,
  canonicalRuntimeAssetsDir,
  canonicalSkillsDir,
  canonicalSkillPath,
  canonicalSkillReferencesDir,
  repoRoot,
  resolveTargetContext,
  parseScopeArg,
  assertHomeBound,
  resolveRuntimeProjection,
  resolveRuntimeAllowedRoots,
  resolveRuntimeHomeDir,
} from "./meta-kim-sync-config.mjs";
import { t } from "./meta-kim-i18n.mjs";
import { CATEGORIES, openRecorder } from "./install-manifest.mjs";
import { validateSkillFrontmatter } from "./install-skill-sanitizer.mjs";

const cliArgs = process.argv.slice(2);
const checkOnly = process.argv.includes("--check");
const jsonMode = process.argv.includes("--json");
const reverseMode = process.argv.includes("--reverse");
const dryRun = process.argv.includes("--dry-run");
const forceWrite = process.argv.includes("--force");

// Captures "will be written" entries whenever writeGeneratedFile runs under
// --check. Populated even when not in --json mode so callers get deterministic
// planning data; consumers just ignore it when they do not need it.
const staleFiles = [];

// Recorder is lazily opened in main() when scope includes "project" so every
// write point (writeGeneratedFile / writeGeneratedJson) can record through
// this shared holder without plumbing a recorder arg through every build fn.
// Failures are swallowed — a manifest glitch must never break sync itself.
let manifestRecorder = null;
function recordSafe(fn) {
  if (!manifestRecorder) return;
  try {
    fn(manifestRecorder);
  } catch {
    /* recorder never breaks sync */
  }
}

/**
 * Map a sync write target to a project manifest category (D..H / G).
 * Returns null when the path is outside the repo or not one of the known
 * projection roots — those writes stay unrecorded rather than polluting
 * the manifest with ambiguous entries.
 *
 * Category semantics (see install-manifest.mjs CATEGORY_LABELS):
 *   D = Project runtime skills   (.claude/skills, .codex/skills, ...)
 *   E = Project runtime hooks    (.claude/hooks, .codex/hooks, .cursor/hooks, openclaw/hooks)
 *   F = Project runtime agents   (.claude/agents, .codex/agents, .cursor/agents)
 *   G = Project settings + MCP   (.claude/settings.json, .mcp.json, .codex/*.toml)
 */
export function inferProjectCategory(filePath, rootDir = repoRoot) {
  if (typeof filePath !== "string" || !filePath) return null;
  const rel = path.relative(rootDir, filePath).replace(/\\/g, "/");
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  if (rel === ".claude/settings.json" || rel === ".mcp.json") {
    return CATEGORIES.G;
  }
  if (
    rel.startsWith(".claude/capability-index/") ||
    rel.startsWith(".codex/capability-index/") ||
    rel.startsWith(".cursor/capability-index/") ||
    rel.startsWith("openclaw/capability-index/")
  ) {
    return CATEGORIES.G;
  }
  if (
    rel.startsWith(".claude/hooks/") ||
    rel.startsWith(".codex/hooks/") ||
    rel.startsWith(".cursor/hooks/") ||
    rel.startsWith("openclaw/hooks/")
  ) {
    return CATEGORIES.E;
  }
  if (
    rel.startsWith(".claude/agents/") ||
    rel.startsWith(".codex/agents/") ||
    rel.startsWith(".cursor/agents/")
  ) {
    return CATEGORIES.F;
  }
  if (
    rel.startsWith(".claude/skills/") ||
    rel.startsWith(".codex/skills/") ||
    rel.startsWith(".cursor/skills/") ||
    rel.startsWith("openclaw/skills/") ||
    rel.startsWith("openclaw/workspaces/")
  ) {
    return CATEGORIES.D;
  }
  if (
    rel.startsWith(".codex/commands/") ||
    rel === ".codex/hooks.json" ||
    rel === ".cursor/hooks.json"
  ) {
    return CATEGORIES.G;
  }
  if (rel === "openclaw/openclaw.template.json" || rel.startsWith(".codex/")) {
    return CATEGORIES.G;
  }
  return null;
}

export function inferProjectPurpose(category) {
  switch (category) {
    case CATEGORIES.D:
      return "project-skill";
    case CATEGORIES.E:
      return "project-hook";
    case CATEGORIES.F:
      return "project-agent";
    case CATEGORIES.G:
      return "project-settings";
    default:
      return null;
  }
}

/**
 * Safely read a canonical source file. Returns null if the file is missing
 * (e.g. when running via npx with a stale or incomplete cached package).
 */
async function tryReadCanonical(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    console.warn(t.canonicalMissingWarn(filePath));
    return null;
  }
}

// ── Scope-aware projection directories ───────────────────────────────

/**
 * Resolve projection base dir for a runtime.
 * project → repoRoot, global → runtime home dir
 */
function getProjectionBase(scope, runtimeId) {
  return resolveRuntimeProjection(runtimeId, scope).baseDir;
}

// ── Reverse sync: Runtime -> Canonical signal collection ────────────────

/**
 * Compare two file contents and return diff information.
 */
function compareFileContents(canonicalContent, runtimeContent) {
  if (canonicalContent === runtimeContent) {
    return { hasChanges: false };
  }
  const canonicalLines = canonicalContent.split("\n");
  const runtimeLines = runtimeContent.split("\n");
  return {
    hasChanges: true,
    canonicalLines: canonicalLines.length,
    runtimeLines: runtimeLines.length,
  };
}

/**
 * Detect local modifications in runtime agent files.
 * Returns evolution signals: changes that should propagate to canonical.
 */
async function detectRuntimeAgentChanges(runtimeAgentsDir, displayPath) {
  const signals = [];
  try {
    const files = await fs.readdir(runtimeAgentsDir);
    const agentFiles = files.filter((f) => f.endsWith(".md") || f.endsWith(".toml"));

    for (const file of agentFiles) {
      const runtimePath = path.join(runtimeAgentsDir, file);
      const runtimeContent = await fs.readFile(runtimePath, "utf8");

      // Map runtime file back to canonical source
      const canonicalPath = mapRuntimeToCanonicalAgent(runtimePath, file);
      if (!canonicalPath) continue;

      let canonicalContent = null;
      try {
        canonicalContent = await fs.readFile(canonicalPath, "utf8");
      } catch {
        // Canonical file missing - this is a new candidate
        signals.push({
          type: "new",
          runtimePath,
          canonicalPath,
          displayPath: `${displayPath}/${file}`,
          runtimeContent,
        });
        continue;
      }

      const diff = compareFileContents(canonicalContent, runtimeContent);
      if (diff.hasChanges) {
        signals.push({
          type: "modified",
          runtimePath,
          canonicalPath,
          displayPath: `${displayPath}/${file}`,
          canonicalContent,
          runtimeContent,
          diff,
        });
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Warning: Could not read ${runtimeAgentsDir}: ${error.message}`);
    }
  }
  return signals;
}

/**
 * Detect local modifications in runtime skill files.
 */
async function detectRuntimeSkillChanges(runtimeSkillRoot, displayPath) {
  const signals = [];
  try {
    const skillPath = path.join(runtimeSkillRoot, "SKILL.md");
    const canonicalSkill = canonicalSkillPath;

    let runtimeContent = null;
    try {
      runtimeContent = await fs.readFile(skillPath, "utf8");
    } catch {
      return signals;
    }

    let canonicalContent = null;
    try {
      canonicalContent = await fs.readFile(canonicalSkill, "utf8");
    } catch {
      signals.push({
        type: "new",
        runtimePath: skillPath,
        canonicalPath: canonicalSkill,
        displayPath: `${displayPath}/SKILL.md`,
        runtimeContent,
      });
      return signals;
    }

    const diff = compareFileContents(canonicalContent, runtimeContent);
    if (diff.hasChanges) {
      signals.push({
        type: "modified",
        runtimePath: skillPath,
        canonicalPath: canonicalSkill,
        displayPath: `${displayPath}/SKILL.md`,
        canonicalContent,
        runtimeContent,
        diff,
      });
    }

    // Check references
    const refsPath = path.join(runtimeSkillRoot, "references");
    try {
      const refFiles = await fs.readdir(refsPath);
      for (const refFile of refFiles) {
        const runtimeRefPath = path.join(refsPath, refFile);
        const canonicalRefPath = path.join(canonicalSkillReferencesDir, refFile);

        const runtimeRefContent = await fs.readFile(runtimeRefPath, "utf8");
        let canonicalRefContent = null;
        try {
          canonicalRefContent = await fs.readFile(canonicalRefPath, "utf8");
        } catch {
          signals.push({
            type: "new",
            runtimePath: runtimeRefPath,
            canonicalPath: canonicalRefPath,
            displayPath: `${displayPath}/references/${refFile}`,
            runtimeContent: runtimeRefContent,
          });
          continue;
        }

        const refDiff = compareFileContents(canonicalRefContent, runtimeRefContent);
        if (refDiff.hasChanges) {
          signals.push({
            type: "modified",
            runtimePath: runtimeRefPath,
            canonicalPath: canonicalRefPath,
            displayPath: `${displayPath}/references/${refFile}`,
            canonicalContent: canonicalRefContent,
            runtimeContent: runtimeRefContent,
            diff: refDiff,
          });
        }
      }
    } catch {
      // References directory might not exist
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Warning: Could not read ${runtimeSkillRoot}: ${error.message}`);
    }
  }
  return signals;
}

/**
 * Map runtime agent file path to canonical source path.
 */
function mapRuntimeToCanonicalAgent(runtimePath, fileName) {
  const ext = path.extname(fileName);
  const baseName = path.basename(fileName, ext);

  // Claude Code: .claude/agents/{id}.md -> canonical/agents/{id}.md
  if (runtimePath.includes(".claude/agents/") || runtimePath.includes("\\.claude\\agents\\")) {
    return path.join(canonicalAgentsDir, `${baseName}.md`);
  }
  // Codex: .codex/agents/{id}.toml -> canonical/agents/{id}.md
  if (runtimePath.includes(".codex/agents/") || runtimePath.includes("\\.codex\\agents\\")) {
    return path.join(canonicalAgentsDir, `${baseName}.md`);
  }
  // Cursor: .cursor/agents/{id}.md -> canonical/agents/{id}.md
  if (runtimePath.includes(".cursor/agents/") || runtimePath.includes("\\.cursor\\agents\\")) {
    return path.join(canonicalAgentsDir, `${baseName}.md`);
  }
  // OpenClaw: openclaw/workspaces/{id}/SOUL.md -> canonical/agents/{id}.md
  if (runtimePath.includes("workspaces") && (runtimePath.endsWith("SOUL.md") || runtimePath.endsWith("BOOTSTRAP.md"))) {
    const workspaceMatch = runtimePath.match(/workspaces[\/\\]([^\/\\]+)/);
    if (workspaceMatch) {
      return path.join(canonicalAgentsDir, `${workspaceMatch[1]}.md`);
    }
  }

  return null;
}

/**
 * Validate that proposed canonical changes comply with Five Criteria.
 * Basic validation: frontmatter, structure, essential fields.
 */
function validateProposedChange(content, filePath) {
  const errors = [];

  if (filePath.endsWith(".md")) {
    // Check for YAML frontmatter (skip if already has skill frontmatter with different format)
    if (!content.startsWith("---")) {
      errors.push("Missing YAML frontmatter");
    }

    // Check for essential frontmatter fields
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      if (!frontmatter.includes("name:") && !frontmatter.includes("title:") && !frontmatter.includes("description:")) {
        errors.push("Missing name, title, or description in frontmatter");
      }
    }

    // Check agent files have required sections (only for actual agent files)
    const lowerContent = content.toLowerCase();
    const lowerPath = filePath.toLowerCase();

    // Only check agent files (in canonical/agents/ or with agents in path)
    const isAgentFile = lowerPath.includes("canonical/agents") ||
                        lowerPath.includes(".claude/agents") ||
                        lowerPath.includes(".codex/agents") ||
                        lowerPath.includes(".cursor/agents") ||
                        lowerPath.includes("/agents/");

    if (isAgentFile) {
      if (!lowerContent.includes("## boundary") &&
          !lowerContent.includes("## responsibilities") &&
          !lowerContent.includes("## role") &&
          !lowerContent.includes("## ownership")) {
        errors.push("Missing boundary, responsibilities, role, or ownership section");
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check for conflicts between canonical and runtime versions.
 * Returns true if there's a conflict that requires user attention.
 */
function detectConflict(signal) {
  if (signal.type === "new") {
    return false;
  }

  // Heuristic: if canonical has significantly more content, it may have
  // received updates not yet synced to this runtime
  const { canonicalLines, runtimeLines } = signal.diff;
  const lineDiff = Math.abs(canonicalLines - runtimeLines);
  const threshold = Math.max(20, Math.floor(canonicalLines * 0.1));

  // If canonical is 10% or 20+ lines different, flag as potential conflict
  return lineDiff > threshold && canonicalLines > runtimeLines;
}

/**
 * Execute reverse sync: collect evolution signals and write back to canonical.
 */
async function executeReverseSync(dirs, selectedTargets) {
  console.log("");
  console.log("── meta:sync (reverse mode: runtime -> canonical) ──");
  console.log(t.reverseModeIntro);
  console.log("");

  const allSignals = [];

  // Collect signals from each runtime
  for (const runtimeId of selectedTargets) {
    const projection = resolveRuntimeProjection(runtimeId, "project");

    // Check agents
    if (projection.agentsDir) {
      const agentSignals = await detectRuntimeAgentChanges(
        projection.agentsDir,
        projection.display.agentsDir || `${runtimeId}/agents`,
      );
      allSignals.push(...agentSignals.map((s) => ({ ...s, runtimeId })));
    }

    // Check skills
    if (projection.skillRoot) {
      const skillSignals = await detectRuntimeSkillChanges(
        projection.skillRoot,
        projection.display.skillRoot || `${runtimeId}/skills`,
      );
      allSignals.push(...skillSignals.map((s) => ({ ...s, runtimeId })));
    }
  }

  if (allSignals.length === 0) {
    console.log(t.reverseModeNoSignals);
    return [];
  }

  console.log(t.reverseModeSignalsFound(allSignals.length));
  console.log("");

  // Import gate functions for validation
  const {
    processEvolutionPacket
  } = await import("./evolution-writeback-gate.mjs");

  // Build evolution packet from signals
  const evolutionPacket = {
    writebackDecision: "writeback",
    writebacks: allSignals.map(s => s.canonicalPath),
    retain: [],
    upgrade: [],
    retire: [],
    scarIds: [],
    syncRequired: true,
    signalSummary: {
      totalSignals: allSignals.length,
      byType: allSignals.reduce((acc, s) => {
        acc[s.type] = (acc[s.type] || 0) + 1;
        return acc;
      }, {}),
      bySeverity: allSignals.reduce((acc, s) => {
        acc[s.severity] = (acc[s.severity] || 0) + 1;
        return acc;
      }, {})
    }
  };

  // Pass through Evolution Writeback Gate
  console.log("[Gate] Passing signals through Evolution Writeback Gate...");
  const gateResult = await processEvolutionPacket(evolutionPacket, {
    force: forceWrite,
    dryRun: dryRun
  });

  console.log(`[Gate] Decision: ${gateResult.decision}`);
  console.log(`[Gate] Risk Level: ${gateResult.riskLevel}`);
  console.log(`[Gate] Reason: ${gateResult.reason}`);

  // If gate rejects, stop here
  if (gateResult.decision === "reject") {
    console.log("");
    console.error(`[Gate] Rejected: ${gateResult.reason}`);
    throw new Error(`Evolution writeback rejected: ${gateResult.reason}`);
  }

  // If gate defers (needs user confirmation), stop unless --force
  if (gateResult.decision === "defer" && !forceWrite) {
    console.log("");
    console.log("[Gate] User confirmation required");
    console.log("Use --force to proceed anyway.");
    throw new Error("Evolution writeback deferred: user confirmation required");
  }

  console.log("");
  console.log("[Gate] Approved - proceeding with writeback");
  console.log("");

  // Categorize signals
  const conflicts = [];
  const safeWrites = [];

  for (const signal of allSignals) {
    const validation = validateProposedChange(signal.runtimeContent, signal.canonicalPath);

    if (!validation.valid) {
      console.warn(t.reverseModeValidationFailed(signal.displayPath));
      for (const error of validation.errors) {
        console.warn(`  - ${error}`);
      }
      continue;
    }

    if (detectConflict(signal)) {
      conflicts.push(signal);
    } else {
      safeWrites.push(signal);
    }
  }

  // Handle conflicts
  if (conflicts.length > 0) {
    console.warn("");
    console.warn(t.reverseModeConflictsDetected(conflicts.length));
    for (const conflict of conflicts) {
      console.warn(`  - ${conflict.displayPath}`);
      console.warn(`    ${t.reverseModeConflictHint}`);
    }

    if (!forceWrite && !dryRun) {
      console.warn("");
      console.warn(t.reverseModeConflictPrompt);
      // In non-interactive context, abort on conflict
      console.error(t.reverseModeAborted);
      process.exitCode = 1;
      return allSignals;
    }

    if (forceWrite) {
      console.warn("");
      console.warn(t.reverseModeForceProceed);
    }
  }

  // Show summary of safe writes
  if (safeWrites.length > 0) {
    console.log("");
    console.log(t.reverseModeSafeWrites(safeWrites.length));
    for (const signal of safeWrites) {
      const icon = signal.type === "new" ? "+" : "~";
      console.log(`  ${icon} ${signal.displayPath}`);
    }
  }

  // Dry run: show what would be written
  if (dryRun) {
    console.log("");
    console.log(t.reverseModeDryRun);
    return allSignals;
  }

  // Perform writeback for safe writes and forced conflicts
  const toWrite = forceWrite ? [...safeWrites, ...conflicts] : safeWrites;
  const writtenFiles = [];

  for (const signal of toWrite) {
    try {
      await ensureDir(path.dirname(signal.canonicalPath));
      await fs.writeFile(signal.canonicalPath, signal.runtimeContent, "utf8");
      console.log(`  [writeback] ${signal.displayPath} -> canonical/${path.relative(repoRoot, signal.canonicalPath)}`);
      writtenFiles.push(signal.canonicalPath);
    } catch (error) {
      console.error(t.reverseModeWriteFailed(signal.displayPath, error.message));
    }
  }

  if (writtenFiles.length > 0) {
    console.log("");
    console.log(t.reverseModeComplete(writtenFiles.length));
  }

  return allSignals;
}

/**
 * Resolve projection directories based on scope.
 * Returns an object with all paths needed for sync.
 */
function resolveProjectionDirs(scope) {
  const claude = resolveRuntimeProjection("claude", scope);
  const codex = resolveRuntimeProjection("codex", scope);
  const openclaw = resolveRuntimeProjection("openclaw", scope);
  const cursor = resolveRuntimeProjection("cursor", scope);
  const globalScope = scope === "global";

  return {
    // Claude Code
    claudeAgentsProjectionDir: claude.agentsDir,
    claudeSkillsProjectionDir: claude.skillsDir,
    claudeSkillProjectionRoot: claude.skillRoot,
    claudeHooksProjectionDir: claude.hooksDir,
    claudeSettingsProjectionPath: claude.settingsFile,
    claudeMcpProjectionPath: claude.mcpFile,
    claudeCapabilityIndexDir: claude.capabilityIndexDir,

    // Codex
    codexSkillsDir: codex.skillsDir,
    codexSkillRoot: codex.skillRoot,
    codexLegacySkillFile: globalScope ? null : codex.legacySkillFile,
    codexLegacySkillReferencesDir: globalScope
      ? null
      : codex.legacySkillReferencesDir,
    codexUsesDirectorySkill: true,
    codexAgentsDir: codex.agentsDir,
    codexHooksDir: globalScope ? null : codex.hooksDir,
    codexHooksFile: globalScope ? null : codex.hooksFile,
    codexCommandsDir: codex.commandsDir,
    codexConfigExamplePath: codex.configExampleFile,
    codexCapabilityIndexDir: codex.capabilityIndexDir,

    // OpenClaw
    openclawWorkspaceDir: openclaw.workspaceDir,
    openclawDisplayWorkspaceDir: openclaw.displayWorkspaceDir,
    openclawSkillsDir: openclaw.skillsDir,
    openclawSkillRoot: openclaw.skillRoot,
    openclawLegacySkillFile: globalScope ? null : openclaw.legacySkillFile,
    openclawLegacySkillReferencesDir: globalScope
      ? null
      : openclaw.legacySkillReferencesDir,
    openclawHooksDir: openclaw.hooksDir,
    openclawTemplateConfigPath: openclaw.templateConfigFile,
    openclawCapabilityIndexDir: openclaw.capabilityIndexDir,

    // Cursor
    cursorAgentsDir: cursor.agentsDir,
    cursorSkillsDir: cursor.skillsDir,
    cursorSkillRoot: cursor.skillRoot,
    cursorHooksDir: cursor.hooksDir,
    cursorHooksFile: cursor.hooksFile,
    cursorMcpPath: cursor.mcpFile,
    cursorCapabilityIndexDir: cursor.capabilityIndexDir,

    // Allowed roots for safety assertion
    allowedRoots: resolveRuntimeAllowedRoots(scope),

    displayPaths: {
      claudeAgents: claude.display.agentsDir,
      claudeSkills: claude.display.skillsDir,
      claudeSkill: claude.display.skillRoot,
      claudeHooks: claude.display.hooksDir,
      claudeSettings: claude.display.settingsFile,
      claudeMcp: claude.display.mcpFile,
      claudeCapabilityIndex: claude.display.capabilityIndexDir,
      codexAgents: codex.display.agentsDir,
      codexSkillsRoot: codex.display.skillsDir,
      codexSkills: codex.display.skillRoot,
      codexHooks: globalScope ? null : codex.display.hooksDir,
      codexHooksFile: globalScope ? null : codex.display.hooksFile,
      codexCommands: codex.display.commandsDir,
      codexConfig: codex.display.configExampleFile,
      codexCapabilityIndex: codex.display.capabilityIndexDir,
      openclawWorkspaces: globalScope
        ? openclaw.baseDir
        : "openclaw/workspaces",
      openclawTemplate: openclaw.display.templateConfigFile,
      openclawCapabilityIndex: openclaw.display.capabilityIndexDir,
      openclawSkillsRoot: openclaw.display.skillsDir,
      openclawSkills: openclaw.display.skillRoot,
      openclawHooks: openclaw.display.hooksDir,
      cursorAgents: cursor.display.agentsDir,
      cursorSkillsRoot: cursor.display.skillsDir,
      cursorSkill: cursor.display.skillRoot,
      cursorHooks: cursor.display.hooksDir,
      cursorHooksFile: cursor.display.hooksFile,
      cursorMcp: cursor.display.mcpFile,
      cursorCapabilityIndex: cursor.display.capabilityIndexDir,
    },
  };
}

// ── Canonical source paths (scope-independent) ──────────────────

const canonicalClaudeHooksDir = path.join(
  canonicalRuntimeAssetsDir,
  "claude",
  "hooks",
);
const canonicalClaudeSettingsPath = path.join(
  canonicalRuntimeAssetsDir,
  "claude",
  "settings.json",
);
const canonicalClaudeMcpPath = path.join(
  canonicalRuntimeAssetsDir,
  "claude",
  "mcp.json",
);
const canonicalCodexConfigExamplePath = path.join(
  canonicalRuntimeAssetsDir,
  "codex",
  "config.toml.example",
);
const canonicalCodexCommandPath = path.join(
  canonicalRuntimeAssetsDir,
  "codex",
  "commands",
  "meta-theory.md",
);
const canonicalSharedMemoryHookPath = path.join(
  canonicalRuntimeAssetsDir,
  "shared",
  "hooks",
  "meta-kim-memory-save.mjs",
);
const canonicalSharedSpineHookPath = path.join(
  canonicalRuntimeAssetsDir,
  "shared",
  "hooks",
  "activate-meta-theory-spine.mjs",
);
const canonicalOpenClawTemplatePath = path.join(
  canonicalRuntimeAssetsDir,
  "openclaw",
  "openclaw.template.json",
);
const canonicalOpenClawMemoryHookDir = path.join(
  canonicalRuntimeAssetsDir,
  "openclaw",
  "hooks",
  "mcp-memory-service",
);

const preferredOrder = [
  "meta-warden",
  "meta-genesis",
  "meta-artisan",
  "meta-sentinel",
  "meta-librarian",
  "meta-conductor",
  "meta-prism",
  "meta-scout",
];

function parseFrontmatter(raw, filePath) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`${filePath} is missing YAML frontmatter.`);
  }

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf(":");
    if (separator === -1) {
      throw new Error(`${filePath} has an invalid frontmatter line: ${line}`);
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }

  return { data, body: match[2].trimStart() };
}

function extractTitle(body, fallback) {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function extractSummary(body, fallback) {
  const match = body.match(/^>\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function roleFromTitle(title, fallback) {
  const parts = title.split(":");
  return parts.length > 1 ? parts.slice(1).join(":").trim() : fallback;
}

function sortAgents(agents) {
  return [...agents].sort((left, right) => {
    const leftIndex = preferredOrder.indexOf(left.id);
    const rightIndex = preferredOrder.indexOf(right.id);

    if (leftIndex === -1 && rightIndex === -1) {
      return left.id.localeCompare(right.id);
    }
    if (leftIndex === -1) {
      return 1;
    }
    if (rightIndex === -1) {
      return -1;
    }
    return leftIndex - rightIndex;
  });
}

function parseAgentPresentation(agent) {
  const titleMatch = agent.title.match(
    /^(.*?)(?::\s*(.*?))?(?:\s+([^\s]+))?$/u,
  );
  const displayName = titleMatch?.[1]?.trim() || agent.id;
  const localizedRole = titleMatch?.[2]?.trim() || agent.description;
  const emoji = titleMatch?.[3]?.trim() || "🤖";

  return {
    displayName,
    localizedRole,
    emoji,
  };
}

function buildBootstrap(agent) {
  const { displayName, localizedRole } = parseAgentPresentation(agent);

  return `# BOOTSTRAP.md - ${agent.id}

This workspace already ships Meta_Kim meta-architecture assets; do not invent a persona from scratch.

## Cold-start order

1. Read \`IDENTITY.md\` — confirm you are \`${displayName}\` and your role is ${localizedRole}.
2. Read \`SOUL.md\` — boundaries and quality bar.
3. Read \`TOOLS.md\` and \`AGENTS.md\` — decide what to delegate.
4. Update \`USER.md\` only when the user explicitly asks for long-lived context.

## First reply

- One sentence: what you own (and only that).
- Do not absorb other meta agents' responsibilities.
- Escalate cross-boundary conflicts to \`meta-warden\`.
`;
}

function buildIdentity(agent) {
  const { displayName, localizedRole, emoji } = parseAgentPresentation(agent);

  return `# IDENTITY.md - ${agent.id}

- **Name:** ${displayName}
- **Creature:** Meta_Kim meta agent
- **Vibe:** Focused, minimal, clear boundaries; primary job: ${localizedRole}
- **Emoji:** ${emoji}
- **Avatar:** 

## Identity Notes

- Agent ID: \`${agent.id}\`
- Core role: ${agent.description}
- Canonical source: \`${agent.sourceFile}\`
`;
}

function buildUser() {
  return `# USER.md - About Your Human

- **Name:**
- **What to call them:**
- **Pronouns:** _(optional)_
- **Timezone:**
- **Notes:**

## Context

Record this user's long-term preferences for Meta_Kim work; do not store unrelated private data.
`;
}

function buildBoot(agent) {
  const { displayName } = parseAgentPresentation(agent);

  return `# BOOT.md - ${agent.id}

After the OpenClaw gateway starts, run one-time boot checks in this order when needed.

1. Confirm the workspace path and that \`IDENTITY.md\`, \`SOUL.md\`, \`TOOLS.md\`, and \`AGENTS.md\` are readable.
2. Do not message the user proactively; act only when the boot task explicitly requires it.
3. If you see role-boundary conflicts, record them in \`MEMORY.md\` under open questions — do not rewrite persona on your own.
4. If you are \`${displayName}\`, keep boot checks inside your own boundary only.
`;
}

function buildMemory(agent) {
  return `# MEMORY.md - ${agent.id}

Store information that stays true across sessions.

## Do record

- Stable user preferences
- Recurring architecture decisions
- Confirmed boundary interpretations
- Risk constraints that keep applying

## Do not record

- One-off task state
- Ephemeral command output
- Unconfirmed guesses
- Personal data unrelated to Meta_Kim
`;
}

async function loadAgents() {
  const files = (await fs.readdir(canonicalAgentsDir))
    .filter((file) => file.endsWith(".md"))
    .sort();

  const agents = [];
  for (const file of files) {
    const filePath = path.join(canonicalAgentsDir, file);
    const raw = await fs.readFile(filePath, "utf8");
    const { data, body } = parseFrontmatter(raw, filePath);

    if (!data.name || !data.description) {
      throw new Error(
        `${filePath} must define frontmatter name and description.`,
      );
    }

    agents.push({
      id: data.name,
      description: data.description,
      sourceFile: path.relative(repoRoot, filePath).replace(/\\/g, "/"),
      title: extractTitle(body, data.name),
      summary: extractSummary(body, data.description),
      role: roleFromTitle(extractTitle(body, data.name), data.description),
      raw,
      body: body.trim(),
    });
  }

  return sortAgents(agents);
}

function buildWorkspaceDirectory(agents) {
  const rows = agents
    .map(
      (agent) => `| \`${agent.id}\` | ${agent.title} | ${agent.description} |`,
    )
    .join("\n");

  return `# AGENTS.md - Meta_Kim Team Directory

This file is generated from \`canonical/agents/*.md\` by \`npm run sync:runtimes\`.

Use the smallest agent whose boundary matches the task. Escalate to \`meta-warden\` when the task spans multiple agent boundaries.

Important: this file lists only the Meta_Kim team. It is not the full OpenClaw registry. If the user asks how many agents exist, which agents are currently registered, or who can collaborate right now, query the live runtime registry first instead of answering from this file alone.

| Agent ID | Name | Responsibility |
| --- | --- | --- |
${rows}
`;
}

function buildSoul(agent) {
  return `# SOUL.md - ${agent.id}

Generated from \`${agent.sourceFile}\`. Edit the canonical source first, then run \`npm run sync:runtimes\`.

## Runtime Notes

- You are running inside OpenClaw.
- Read the local \`AGENTS.md\` before delegating with \`sessions_send\`.
- \`AGENTS.md\` only lists the Meta_Kim team, not the full OpenClaw registry.
- When the user asks which agents exist, how many agents exist, or who can collaborate right now, query the live runtime registry first through \`agents_list\`. If that tool is unavailable, fall back to an explicit runtime command and state the result source.
- Stay inside your own responsibility boundary unless the user explicitly asks you to coordinate broader work.
- The theory source is \`canonical/skills/meta-theory/references/meta-theory.md\`; public runtime behavior must not depend on local narrative notes.

${agent.body}
`;
}

function buildHeartbeat(agent) {
  return `# HEARTBEAT.md - ${agent.id}

Default heartbeat policy:

- If there is no explicit scheduled work, respond with \`HEARTBEAT_OK\`.
- Do not create autonomous tasks or self-assign missions by default.
- Only act proactively after the deployment owner adds concrete heartbeat tasks below.

## Deployment Tasks

- None by default.
`;
}

function buildTools(agent, agents) {
  const teammates = agents
    .filter((item) => item.id !== agent.id)
    .map((item) => `- \`${item.id}\`: ${item.description}`)
    .join("\n");

  return `# TOOLS.md - ${agent.id}

Auto-generated by \`npm run sync:runtimes\`. Edit templates in \`scripts/sync-runtimes.mjs\`, then re-sync.

## OpenClaw runtime conventions

- Read \`SOUL.md\` and \`AGENTS.md\` in this directory first.
- For collaboration, prefer OpenClaw native agent-to-agent routing.
- \`AGENTS.md\` lists the Meta_Kim team only — it is not the full OpenClaw registry.
- When the user asks for agent counts, names, or who can collaborate, call \`agents_list\` first; if unavailable, use an explicit command and state the source.
- Shared skill: \`../../skills/meta-theory/SKILL.md\` (directory under \`openclaw/skills/\`, not duplicated per workspace).
- Do not absorb other agents' duties; delegate or escalate to \`meta-warden\` when out of scope.

## Teammates

${teammates || "- None"}
`;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function loadSkillReferences() {
  const entries = await fs.readdir(canonicalSkillReferencesDir, {
    withFileTypes: true,
  });
  const files = entries.filter((entry) => entry.isFile());

  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      content: await fs.readFile(
        path.join(canonicalSkillReferencesDir, file.name),
        "utf8",
      ),
    })),
  );
}

async function collectSkillFiles(rootDir, currentDir = rootDir, bucket = []) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await collectSkillFiles(rootDir, entryPath, bucket);
    } else if (entry.isFile()) {
      bucket.push({
        relativePath: path.relative(rootDir, entryPath).replace(/\\/g, "/"),
        content: await fs.readFile(entryPath, "utf8"),
      });
    }
  }
  return bucket.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

async function loadCanonicalSkills() {
  const entries = await fs.readdir(canonicalSkillsDir, { withFileTypes: true });
  const skills = [];

  for (const entry of entries.filter((item) => item.isDirectory())) {
    const skillRoot = path.join(canonicalSkillsDir, entry.name);
    const skillPath = path.join(skillRoot, "SKILL.md");
    let raw = null;
    try {
      raw = await fs.readFile(skillPath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        continue;
      }
      throw error;
    }

    assertPortableSkillFrontmatter(raw, skillPath);
    skills.push({
      id: entry.name,
      root: skillRoot,
      skillPath,
      files: await collectSkillFiles(skillRoot),
    });
  }

  if (skills.length === 0) {
    throw new Error("No canonical skills found under canonical/skills/*/SKILL.md.");
  }

  return skills.sort((left, right) => left.id.localeCompare(right.id));
}

function assertPortableSkillFrontmatter(raw, filePath) {
  const validation = validateSkillFrontmatter(raw);
  if (!validation.ok) {
    throw new Error(
      `Invalid canonical skill frontmatter in ${filePath}: ${validation.message}`,
    );
  }
}

function escapeTomlBasicMultiline(value) {
  return value.replace(/\\/g, "\\\\").replace(/"""/g, '\\"\\"\\"');
}

function buildCodexAgentInstructions(agent) {
  return [
    `You are the Codex custom agent mirror of Meta_Kim agent \`${agent.id}\`.`,
    `Primary responsibility: ${agent.description}`,
    "Stay inside your own responsibility boundary.",
    "If the task crosses agent boundaries, hand the decision back to the parent session or recommend the correct sibling meta agent.",
    "Use the portable meta-theory skill when it helps, but do not claim ownership of another agent's deliverable.",
    "",
    agent.body.trim(),
  ].join("\n");
}

function buildCodexAgent(agent) {
  const instructions = escapeTomlBasicMultiline(
    buildCodexAgentInstructions(agent),
  );

  return `name = "${agent.id}"
description = "${agent.description.replace(/"/g, '\\"')}"
developer_instructions = """
${instructions}
"""
`;
}

/**
 * Build a Cursor-compatible agent Markdown file.
 * Cursor agents live in .cursor/agents/*.md and require YAML frontmatter.
 */
export function buildCursorAgent(agent) {
  const description = String(agent.description ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, "\\n");

  return `---
name: ${agent.id}
description: "${description}"
---

# ${agent.title}

> ${agent.summary}

<!-- Generated from ${agent.sourceFile} by npm run sync:runtimes. Edit canonical source first. -->

You are the Cursor agent mirror of Meta_Kim agent \`${agent.id}\`.
Primary responsibility: ${agent.description}

Stay inside your own responsibility boundary.
If the task crosses agent boundaries, hand the decision back to the parent session or recommend the correct sibling meta agent.
Use the portable meta-theory skill when it helps, but do not claim ownership of another agent's deliverable.

---

${agent.body}
`;
}

async function writeGeneratedFile(filePath, nextContent) {
  const recordGeneratedFile = () => {
    const category = inferProjectCategory(filePath);
    if (!category) return;
    recordSafe((rec) =>
      rec.recordFile(filePath, {
        source: "sync-runtimes",
        purpose: inferProjectPurpose(category),
        category,
      }),
    );
  };

  let currentContent = null;
  try {
    currentContent = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  if (currentContent === nextContent) {
    if (!checkOnly) {
      recordGeneratedFile();
    }
    return { changed: false };
  }

  if (checkOnly) {
    staleFiles.push({
      path: filePath,
      category: inferProjectCategory(filePath),
      action: currentContent === null ? "create" : "update",
    });
    return { changed: true };
  }

  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, nextContent, "utf8");
  recordGeneratedFile();
  return { changed: true };
}

async function writeGeneratedJson(filePath, value) {
  const nextContent = `${JSON.stringify(value, null, 2)}\n`;
  return writeGeneratedFile(filePath, nextContent);
}

function renderMetaKimRuntimeMcp(content, rootDir) {
  const normalizedRoot = rootDir.replace(/\\/g, "/");
  return content.replaceAll("__REPO_ROOT__", normalizedRoot);
}

function emptyMcpConfigContent() {
  return `${JSON.stringify({ mcpServers: {} }, null, 2)}\n`;
}

async function removeGeneratedPath(filePath) {
  if (!filePath) return { changed: false };

  let exists = false;
  try {
    await fs.access(filePath);
    exists = true;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  if (!exists) return { changed: false };

  if (checkOnly) {
    staleFiles.push({
      path: filePath,
      category: inferProjectCategory(filePath),
      action: "delete",
    });
    return { changed: true };
  }

  await fs.rm(filePath, { recursive: true, force: true });
  return { changed: true };
}

async function syncCapabilityIndexMirrors(dirs, selectedTargets, changedFiles) {
  const canonicalContent = await tryReadCanonical(
    path.join(canonicalCapabilityIndexDir, "meta-kim-capabilities.json"),
  );
  if (!canonicalContent) return;

  const targets = {
    claude: {
      dir: dirs.claudeCapabilityIndexDir,
      display: dirs.displayPaths.claudeCapabilityIndex,
    },
    codex: {
      dir: dirs.codexCapabilityIndexDir,
      display: dirs.displayPaths.codexCapabilityIndex,
    },
    openclaw: {
      dir: dirs.openclawCapabilityIndexDir,
      display: dirs.displayPaths.openclawCapabilityIndex,
    },
    cursor: {
      dir: dirs.cursorCapabilityIndexDir,
      display: dirs.displayPaths.cursorCapabilityIndex,
    },
  };

  for (const targetId of selectedTargets) {
    const target = targets[targetId];
    if (!target?.dir) continue;

    const mirrorPath = path.join(target.dir, "meta-kim-capabilities.json");
    if ((await writeGeneratedFile(mirrorPath, canonicalContent)).changed) {
      changedFiles.push(`${target.display}/meta-kim-capabilities.json`);
    }

    const localInventoryPath = path.join(target.dir, "global-capabilities.json");
    if ((await removeGeneratedPath(localInventoryPath)).changed) {
      changedFiles.push(`${target.display}/global-capabilities.json`);
    }
  }
}

// ── Runtime skill path substitution ─────────────────────────────────────
// The canonical SKILL.md and its references use canonical/ paths.
// During sync, these are substituted to runtime-specific paths so that
// the skill works correctly in each runtime projection.
//
// IMPORTANT: These rules must match the actual synced directory structure.
// When the sync config (meta-kim-sync-config.mjs) changes, these rules
// MUST be updated to match.

/**
 * Build a path substitution map for a given runtime target.
 * canonical/ paths are replaced with the runtime's actual projection paths.
 * @param {"claude"|"codex"|"openclaw"|"cursor"} targetId
 * @returns {{pattern:RegExp, replacement:string}[]}
 */
function buildRuntimeSkillMap(targetId) {
  const maps = {
    claude: [
      // Skill references: canonical/ → runtime-specific for Claude
      {
        pattern: /canonical\/skills\/meta-theory\/references\//g,
        replacement: ".claude/skills/meta-theory/references/",
      },
      // Agent definitions: canonical/ → runtime-specific for Claude
      { pattern: /canonical\/agents\//g, replacement: ".claude/agents/" },
      // Hook files: stay in .claude/hooks/ (no canonical equivalent)
      { pattern: /\.claude\/hooks\//g, replacement: ".claude/hooks/" },
      // Capability index: stays in .claude/capability-index/
      {
        pattern: /\.claude\/capability-index\//g,
        replacement: ".claude/capability-index/",
      },
      // Legacy .claude/skills/ references in canonical source → canonical/skills/ (normalize to canonical/)
      { pattern: /\.claude\/skills\//g, replacement: "canonical/skills/" },
    ],
    codex: [
      // Skill references: canonical/ → .codex/skills/meta-theory/references/
      {
        pattern: /canonical\/skills\/meta-theory\/references\//g,
        replacement: ".codex/skills/meta-theory/references/",
      },
      // Skill root: canonical/skills/ → .codex/skills/
      { pattern: /canonical\/skills\//g, replacement: ".codex/skills/" },
      // Agent definitions: canonical/ → .codex/agents/
      { pattern: /canonical\/agents\//g, replacement: ".codex/agents/" },
      // Hooks: Codex uses .codex/hooks/ plus .codex/hooks.json
      { pattern: /\.claude\/hooks\//g, replacement: ".codex/hooks/" },
      // Capability index: preserve subdirectory structure
      {
        pattern: /\.claude\/capability-index\//g,
        replacement: ".codex/capability-index/",
      },
      // Legacy .claude/skills/ references in source → platform-specific path
      { pattern: /\.claude\/skills\//g, replacement: ".codex/skills/" },
    ],
    openclaw: [
      // Skill references: canonical/ → openclaw/skills/meta-theory/references/
      {
        pattern: /canonical\/skills\/meta-theory\/references\//g,
        replacement: "openclaw/skills/meta-theory/references/",
      },
      // Skill root: canonical/skills/ → openclaw/skills/
      { pattern: /canonical\/skills\//g, replacement: "openclaw/skills/" },
      // Agent definitions: OpenClaw uses workspace-per-agent model.
      // Each workspace has AGENTS.md containing all agent definitions.
      {
        pattern: /canonical\/agents\//g,
        replacement: "openclaw/workspaces/{workspace}/AGENTS.md#",
      },
      // Hooks: OpenClaw uses Plugin SDK hooks under openclaw/hooks/
      { pattern: /\.claude\/hooks\//g, replacement: "openclaw/hooks/" },
      // Capability index: preserve subdirectory structure
      {
        pattern: /\.claude\/capability-index\//g,
        replacement: "openclaw/capability-index/",
      },
      // Legacy .claude/skills/ references in source → platform-specific path
      { pattern: /\.claude\/skills\//g, replacement: "openclaw/skills/" },
    ],
    cursor: [
      // Skill references: canonical/ → .cursor/skills/meta-theory/references/
      {
        pattern: /canonical\/skills\/meta-theory\/references\//g,
        replacement: ".cursor/skills/meta-theory/references/",
      },
      // Skill root: canonical/skills/ → .cursor/skills/
      { pattern: /canonical\/skills\//g, replacement: ".cursor/skills/" },
      // Agent definitions: canonical/ → .cursor/agents/
      { pattern: /canonical\/agents\//g, replacement: ".cursor/agents/" },
      // Hooks: Cursor uses .cursor/hooks/ plus .cursor/hooks.json
      { pattern: /\.claude\/hooks\//g, replacement: ".cursor/hooks/" },
      // Capability index: preserve subdirectory structure
      {
        pattern: /\.claude\/capability-index\//g,
        replacement: ".cursor/capability-index/",
      },
      // Legacy .claude/skills/ references in source → platform-specific path
      { pattern: /\.claude\/skills\//g, replacement: ".cursor/skills/" },
    ],
  };

  return maps[targetId] || maps.claude;
}

/**
 * Apply runtime-specific path substitutions to skill content.
 * @param {string} content - The skill file content
 * @param {"claude"|"codex"|"openclaw"|"cursor"} targetId
 * @returns {string}
 */
function applyRuntimePaths(content, targetId) {
  const rules = buildRuntimeSkillMap(targetId);
  let result = content;
  for (const { pattern, replacement } of rules) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function buildCodexGraphifyContextHook() {
  return [
    'import { existsSync, readFileSync } from "node:fs";',
    'import path from "node:path";',
    'import process from "node:process";',
    "",
    "function readPayload() {",
    "  try {",
    '    const raw = readFileSync(0, "utf8");',
    '    return raw.trim() ? JSON.parse(raw) : {};',
    "  } catch {",
    "    return {};",
    "  }",
    "}",
    "",
    "const payload = readPayload();",
    'const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();',
    'const graphPath = path.join(cwd, "graphify-out", "graph.json");',
    "",
    "if (existsSync(graphPath)) {",
    "  console.log(",
    "    JSON.stringify({",
    '      systemMessage: "graphify: Knowledge graph exists. Read graphify-out/GRAPH_REPORT.md for god nodes and community structure before searching raw files.",',
    "    }),",
    "  );",
    "}",
    "",
  ].join("\n");
}

export function buildCodexProjectHooksJson({
  graphifyHookPath = ".codex/hooks/graphify-context.mjs",
  memoryHookPath = ".codex/hooks/meta-kim-memory-save.mjs",
  spineHookPath = ".codex/hooks/activate-meta-theory-spine.mjs",
  hookPromptAdapterPath = null,
} = {}) {
  return buildCodexHooksJson({
    graphifyHookPath,
    memoryHookPath,
    spineHookPath,
    hookPromptAdapterPath,
  });
}

export function buildCursorProjectHooksJson({
  graphifyHookPath = ".cursor/hooks/graphify-context.mjs",
  memoryHookPath = ".cursor/hooks/meta-kim-memory-save.mjs",
  hookPromptAdapterPath = null,
} = {}) {
  return buildCursorHooksJson({
    graphifyHookPath,
    memoryHookPath,
    hookPromptAdapterPath,
  });
}

async function syncRuntimeSkills(
  runtimeId,
  runtimeSkillsDir,
  displaySkillsDir,
  canonicalSkills,
  changedFiles,
) {
  for (const skill of canonicalSkills) {
    for (const file of skill.files) {
      const targetPath = path.join(
        runtimeSkillsDir,
        skill.id,
        ...file.relativePath.split("/"),
      );
      if (
        (
          await writeGeneratedFile(
            targetPath,
            applyRuntimePaths(file.content, runtimeId),
          )
        ).changed
      ) {
        changedFiles.push(
          `${displaySkillsDir}/${skill.id}/${file.relativePath}`,
        );
      }
    }
  }
}

async function syncClaudeProjection(
  dirs,
  agents,
  canonicalSkills,
  changedFiles,
) {
  const {
    claudeAgentsProjectionDir,
    claudeSkillsProjectionDir,
    claudeHooksProjectionDir,
    claudeSettingsProjectionPath,
    claudeMcpProjectionPath,
    displayPaths,
  } = dirs;

  for (const agent of agents) {
    if (
      (
        await writeGeneratedFile(
          path.join(claudeAgentsProjectionDir, `${agent.id}.md`),
          agent.raw,
        )
      ).changed
    ) {
      changedFiles.push(`${displayPaths.claudeAgents}/${agent.id}.md`);
    }
  }

  await syncRuntimeSkills(
    "claude",
    claudeSkillsProjectionDir,
    displayPaths.claudeSkills,
    canonicalSkills,
    changedFiles,
  );

  const hookEntries = (
    await fs.readdir(canonicalClaudeHooksDir, { withFileTypes: true })
  )
    .filter((entry) => entry.isFile() && entry.name.endsWith(".mjs"))
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const hookEntry of hookEntries) {
    const hookContent = await fs.readFile(
      path.join(canonicalClaudeHooksDir, hookEntry.name),
      "utf8",
    );
    if (
      (
        await writeGeneratedFile(
          path.join(claudeHooksProjectionDir, hookEntry.name),
          hookContent,
        )
      ).changed
    ) {
      changedFiles.push(`${displayPaths.claudeHooks}/${hookEntry.name}`);
    }
  }

  const sharedClaudeHookDependencies = [
    "hook-i18n.mjs",
    "meta-kim-memory-save.mjs",
    "skip-reminder.mjs",
  ];
  for (const hookName of sharedClaudeHookDependencies) {
    const hookContent = await tryReadCanonical(
      path.join(canonicalRuntimeAssetsDir, "shared", "hooks", hookName),
    );
    if (
      hookContent &&
      (
        await writeGeneratedFile(
          path.join(claudeHooksProjectionDir, hookName),
          hookContent,
        )
      ).changed
    ) {
      changedFiles.push(`${displayPaths.claudeHooks}/${hookName}`);
    }
  }

  const [settingsContent, mcpContent] = await Promise.all([
    fs.readFile(canonicalClaudeSettingsPath, "utf8"),
    fs.readFile(canonicalClaudeMcpPath, "utf8"),
  ]);

  // Merge into existing settings.json — never blind overwrite (project + global).
  const inRepoRoot = claudeSettingsProjectionPath.includes(repoRoot);
  let finalSettingsContent;
  const canonicalParsed = JSON.parse(settingsContent);

  if (inRepoRoot) {
    let base = {};
    try {
      const prev = await fs.readFile(claudeSettingsProjectionPath, "utf8");
      base = JSON.parse(prev);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    const merged = mergeRepoClaudeSettings(base, canonicalParsed, repoRoot);
    finalSettingsContent = `${JSON.stringify(merged, null, 2)}\n`;
  } else {
    let base = {};
    try {
      const prev = await fs.readFile(claudeSettingsProjectionPath, "utf8");
      base = JSON.parse(prev);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    const template = buildMetaKimHooksTemplate(".claude/hooks");
    const merged = mergeGlobalMetaKimHooksIntoSettings(base, template);
    finalSettingsContent = `${JSON.stringify(merged, null, 2)}\n`;
  }

  if (
    (
      await writeGeneratedFile(
        claudeSettingsProjectionPath,
        finalSettingsContent,
      )
    ).changed
  ) {
    changedFiles.push(displayPaths.claudeSettings);
  }
  if (claudeMcpProjectionPath) {
    // Only write meta-kim-runtime MCP config when inside the Meta_Kim repo.
    // The MCP server script (scripts/mcp/meta-runtime-server.mjs) only exists
    // inside this repo — writing it to external projects breaks MCP startup.
    if (inRepoRoot) {
      const renderedMcpContent = renderMetaKimRuntimeMcp(mcpContent, repoRoot);
      if (
        (await writeGeneratedFile(claudeMcpProjectionPath, renderedMcpContent))
          .changed
      ) {
        changedFiles.push(displayPaths.claudeMcp);
      }
    } else {
      if (
        (
          await writeGeneratedFile(
            claudeMcpProjectionPath,
            emptyMcpConfigContent(),
          )
        ).changed
      ) {
        changedFiles.push(displayPaths.claudeMcp);
      }
    }
  }
}

async function main() {
  // ── Help ────────────────────────────────────────────────────────
  if (cliArgs.includes("--help") || cliArgs.includes("-h")) {
    console.log(`Usage: node sync-runtimes.mjs [options]

Options:
  --scope <project|global|both>  Write projection to repo (default: project)
  --targets <ids>                 Comma-separated runtime IDs (claude,codex,openclaw,cursor)
  --lang <code>                   Messages: en | zh-CN | ja-JP | ko-KR (aliases: zh, ja, ko)
  --check                        Show what would be synced without writing
  --reverse                      Reverse sync: runtime -> canonical (collect evolution signals)
  --dry-run                      Preview reverse sync changes without writing
  --force                        Skip conflict warnings and overwrite canonical
  --help, -h                     Show this help

Scopes:
  project  Write to repo-local directories (.claude/, .codex/, openclaw/)
  global  Write directly to runtime home dirs (${resolveRuntimeHomeDir("claude")}, etc.)
  both    Write to both locations

Examples:
  node sync-runtimes.mjs                        # project scope (default)
  node sync-runtimes.mjs --scope global        # write to ~/.claude, ~/.codex, ~/.openclaw
  node sync-runtimes.mjs --scope global --targets claude  # Claude Code only, global
  node sync-runtimes.mjs --check                # preview changes
  node sync-runtimes.mjs --reverse              # collect evolution signals from runtime
  node sync-runtimes.mjs --reverse --dry-run    # preview reverse sync
  node sync-runtimes.mjs --reverse --force      # force writeback without prompts
`);
    return;
  }

  const scope = parseScopeArg(cliArgs);
  const { cliTargets, supportedTargets } = await resolveTargetContext(cliArgs);
  const selectedTargets = cliTargets.length > 0 ? cliTargets : supportedTargets;
  const dirs = resolveProjectionDirs(scope);
  const agents = await loadAgents();
  const teamDirectory = buildWorkspaceDirectory(agents);
  const canonicalSkills = await loadCanonicalSkills();
  const changedFiles = [];

  // Safety assertion: all writes must stay within allowedRoots
  if (!checkOnly) {
    assertHomeBound(dirs.claudeAgentsProjectionDir, dirs.allowedRoots);
    if (dirs.claudeMcpProjectionPath) {
      assertHomeBound(dirs.claudeMcpProjectionPath, dirs.allowedRoots);
    }
  }

  // Open project install manifest recorder. Only record when writes actually
  // hit the repo (not in --check mode, and only when scope includes project).
  // Global-scope sync is recorded separately by sync-global-meta-theory.mjs.
  if (!checkOnly && (scope === "project" || scope === "both")) {
    manifestRecorder = openRecorder({
      scope: "project",
      repoRoot,
      metaKimVersion: process.env.META_KIM_VERSION ?? null,
      replaceSources: ["sync-runtimes"],
    });
  }

  // ── Reverse Mode: Runtime -> Canonical signal propagation ─────────────
  if (reverseMode) {
    const signals = await executeReverseSync(dirs, selectedTargets);

    // After reverse sync, optionally run forward sync to propagate updates
    // to other runtimes (unless --dry-run)
    if (!dryRun && signals.length > 0) {
      console.log("");
      console.log(t.reverseModePropagating);
      // Continue to forward sync below
    } else {
      return signals;
    }
  }

  await syncCapabilityIndexMirrors(dirs, selectedTargets, changedFiles);

  if (selectedTargets.includes("claude")) {
    await syncClaudeProjection(
      dirs,
      agents,
      canonicalSkills,
      changedFiles,
    );
  }

  if (selectedTargets.includes("openclaw")) {
    const dp = dirs.displayPaths;

    for (const agent of agents) {
      const workspaceDir = dirs.openclawWorkspaceDir(agent.id);
      const writes = await Promise.all([
        writeGeneratedFile(
          path.join(workspaceDir, "BOOT.md"),
          buildBoot(agent),
        ),
        writeGeneratedFile(
          path.join(workspaceDir, "BOOTSTRAP.md"),
          buildBootstrap(agent),
        ),
        writeGeneratedFile(
          path.join(workspaceDir, "IDENTITY.md"),
          buildIdentity(agent),
        ),
        writeGeneratedFile(
          path.join(workspaceDir, "MEMORY.md"),
          buildMemory(agent),
        ),
        writeGeneratedFile(path.join(workspaceDir, "USER.md"), buildUser()),
        writeGeneratedFile(
          path.join(workspaceDir, "SOUL.md"),
          buildSoul(agent),
        ),
        writeGeneratedFile(path.join(workspaceDir, "AGENTS.md"), teamDirectory),
        writeGeneratedFile(
          path.join(workspaceDir, "HEARTBEAT.md"),
          buildHeartbeat(agent),
        ),
        writeGeneratedFile(
          path.join(workspaceDir, "TOOLS.md"),
          buildTools(agent, agents),
        ),
      ]);

      if (writes.some((result) => result.changed)) {
        changedFiles.push(dirs.openclawDisplayWorkspaceDir(agent.id));
      }
    }

    // Gracefully handle missing openclaw.template.json (can happen when running
    // via npx with an older cached package version that doesn't include it)
    let templateConfig = null;
    const templateRaw = await tryReadCanonical(canonicalOpenClawTemplatePath);
    if (templateRaw) {
      templateConfig = JSON.parse(templateRaw);
    }

    if (templateConfig !== null) {
      const renderedTemplateRaw = renderMetaKimRuntimeMcp(
        JSON.stringify(templateConfig),
        repoRoot,
      );
      templateConfig = JSON.parse(renderedTemplateRaw);
    }

    if (
      templateConfig !== null &&
      (
        await writeGeneratedJson(
          dirs.openclawTemplateConfigPath,
          templateConfig,
        )
      ).changed
    ) {
      changedFiles.push(dp.openclawTemplate);
    }

    let openclawHookEntries = [];
    try {
      openclawHookEntries = await fs.readdir(canonicalOpenClawMemoryHookDir, {
        withFileTypes: true,
      });
    } catch {
      openclawHookEntries = [];
    }
    for (const hookEntry of openclawHookEntries) {
      if (!hookEntry.isFile()) continue;
      const hookContent = await tryReadCanonical(
        path.join(canonicalOpenClawMemoryHookDir, hookEntry.name),
      );
      if (
        hookContent &&
        (
          await writeGeneratedFile(
            path.join(dirs.openclawHooksDir, "mcp-memory-service", hookEntry.name),
            hookContent,
          )
        ).changed
      ) {
        changedFiles.push(
          `${dp.openclawHooks}/mcp-memory-service/${hookEntry.name}`,
        );
      }
    }

    if ((await removeGeneratedPath(dirs.openclawLegacySkillFile)).changed) {
      changedFiles.push("openclaw/skills/meta-theory.md");
    }
    if (
      (await removeGeneratedPath(dirs.openclawLegacySkillReferencesDir)).changed
    ) {
      changedFiles.push("openclaw/skills/references");
    }
    await syncRuntimeSkills(
      "openclaw",
      dirs.openclawSkillsDir,
      dp.openclawSkillsRoot,
      canonicalSkills,
      changedFiles,
    );
  }

  if (selectedTargets.includes("codex")) {
    const dp = dirs.displayPaths;

    if ((await removeGeneratedPath(dirs.codexLegacySkillFile)).changed) {
      changedFiles.push(".codex/skills/meta-theory.md");
    }
    if (
      (await removeGeneratedPath(dirs.codexLegacySkillReferencesDir)).changed
    ) {
      changedFiles.push(".codex/skills/references");
    }

    await syncRuntimeSkills(
      "codex",
      dirs.codexSkillsDir,
      dp.codexSkillsRoot,
      canonicalSkills,
      changedFiles,
    );
    if (
      scope !== "global" &&
      (
        await removeGeneratedPath(
          path.join(repoRoot, ".agents", "skills", "meta-theory"),
        )
      ).changed
    ) {
      changedFiles.push(".agents/skills/meta-theory");
    }
    const codexConfigExample = await tryReadCanonical(
      canonicalCodexConfigExamplePath,
    );
    if (
      codexConfigExample &&
      (
        await writeGeneratedFile(
          dirs.codexConfigExamplePath,
          codexConfigExample,
        )
      ).changed
    ) {
      changedFiles.push(dp.codexConfig);
    }

    const codexMetaTheoryCommand = await tryReadCanonical(
      canonicalCodexCommandPath,
    );
    if (
      codexMetaTheoryCommand &&
      (
        await writeGeneratedFile(
          path.join(dirs.codexCommandsDir, "meta-theory.md"),
          codexMetaTheoryCommand,
        )
      ).changed
    ) {
      changedFiles.push(`${dp.codexCommands}/meta-theory.md`);
    }

    if (dirs.codexHooksDir && dirs.codexHooksFile) {
      if (
        (
          await writeGeneratedFile(
            path.join(dirs.codexHooksDir, "graphify-context.mjs"),
            buildCodexGraphifyContextHook(),
          )
        ).changed
      ) {
        changedFiles.push(`${dp.codexHooks}/graphify-context.mjs`);
      }
      const memoryHookContent = await tryReadCanonical(canonicalSharedMemoryHookPath);
      if (
        memoryHookContent &&
        (
          await writeGeneratedFile(
            path.join(dirs.codexHooksDir, "meta-kim-memory-save.mjs"),
            memoryHookContent,
          )
        ).changed
      ) {
        changedFiles.push(`${dp.codexHooks}/meta-kim-memory-save.mjs`);
      }
      const spineHookContent = await tryReadCanonical(canonicalSharedSpineHookPath);
      if (
        spineHookContent &&
        (
          await writeGeneratedFile(
            path.join(dirs.codexHooksDir, "activate-meta-theory-spine.mjs"),
            spineHookContent,
          )
        ).changed
      ) {
        changedFiles.push(`${dp.codexHooks}/activate-meta-theory-spine.mjs`);
      }
      // Sync shared hook dependencies (utils.mjs, spine-state.mjs, hook-i18n.mjs, skip-reminder.mjs)
      const utilsHookContent = await tryReadCanonical(
        path.join(canonicalRuntimeAssetsDir, "shared", "hooks", "utils.mjs"),
      );
      if (
        utilsHookContent &&
        (
          await writeGeneratedFile(
            path.join(dirs.codexHooksDir, "utils.mjs"),
            utilsHookContent,
          )
        ).changed
      ) {
        changedFiles.push(`${dp.codexHooks}/utils.mjs`);
      }
      const spineStateHookContent = await tryReadCanonical(
        path.join(canonicalRuntimeAssetsDir, "shared", "hooks", "spine-state.mjs"),
      );
      if (
        spineStateHookContent &&
        (
          await writeGeneratedFile(
            path.join(dirs.codexHooksDir, "spine-state.mjs"),
            spineStateHookContent,
          )
        ).changed
      ) {
        changedFiles.push(`${dp.codexHooks}/spine-state.mjs`);
      }
      const skipReminderHookContent = await tryReadCanonical(
        path.join(canonicalRuntimeAssetsDir, "shared", "hooks", "skip-reminder.mjs"),
      );
      if (
        skipReminderHookContent &&
        (
          await writeGeneratedFile(
            path.join(dirs.codexHooksDir, "skip-reminder.mjs"),
            skipReminderHookContent,
          )
        ).changed
      ) {
        changedFiles.push(`${dp.codexHooks}/skip-reminder.mjs`);
      }
      const hookI18nContent = await tryReadCanonical(
        path.join(canonicalRuntimeAssetsDir, "shared", "hooks", "hook-i18n.mjs"),
      );
      if (
        hookI18nContent &&
        (
          await writeGeneratedFile(
            path.join(dirs.codexHooksDir, "hook-i18n.mjs"),
            hookI18nContent,
          )
        ).changed
      ) {
        changedFiles.push(`${dp.codexHooks}/hook-i18n.mjs`);
      }
      if (
        (
          await writeGeneratedFile(
            path.join(dirs.codexHooksDir, "hookprompt-adapter.mjs"),
            buildHookPromptAdapterSource("codex"),
          )
        ).changed
      ) {
        changedFiles.push(`${dp.codexHooks}/hookprompt-adapter.mjs`);
      }
      const graphifyHookPath =
        scope === "global"
          ? path.join(dirs.codexHooksDir, "graphify-context.mjs")
          : ".codex/hooks/graphify-context.mjs";
      const memoryHookPath =
        scope === "global"
          ? path.join(dirs.codexHooksDir, "meta-kim-memory-save.mjs")
          : ".codex/hooks/meta-kim-memory-save.mjs";
      const spineHookPath =
        scope === "global"
          ? path.join(dirs.codexHooksDir, "activate-meta-theory-spine.mjs")
          : ".codex/hooks/activate-meta-theory-spine.mjs";
      const hookPromptAdapterPath =
        scope === "global"
          ? path.join(dirs.codexHooksDir, "hookprompt-adapter.mjs")
          : ".codex/hooks/hookprompt-adapter.mjs";
      if (
        (
          await writeGeneratedJson(
            dirs.codexHooksFile,
            buildCodexProjectHooksJson({
              graphifyHookPath,
              memoryHookPath,
              spineHookPath,
              hookPromptAdapterPath,
            }),
          )
        ).changed
      ) {
        changedFiles.push(dp.codexHooksFile);
      }
    }

    for (const agent of agents) {
      if (
        (
          await writeGeneratedFile(
            path.join(dirs.codexAgentsDir, `${agent.id}.toml`),
            buildCodexAgent(agent),
          )
        ).changed
      ) {
        changedFiles.push(`${dp.codexAgents}/${agent.id}.toml`);
      }
    }
  }

  // ── Cursor sync ───────────────────────────────────────────────
  if (selectedTargets.includes("cursor")) {
    const dp = dirs.displayPaths;

    // Agent projections (.cursor/agents/*.md)
    for (const agent of agents) {
      if (
        (
          await writeGeneratedFile(
            path.join(dirs.cursorAgentsDir, `${agent.id}.md`),
            buildCursorAgent(agent),
          )
        ).changed
      ) {
        changedFiles.push(`${dp.cursorAgents}/${agent.id}.md`);
      }
    }

    // Skill projections (.cursor/skills/meta-theory/)
    await syncRuntimeSkills(
      "cursor",
      dirs.cursorSkillsDir,
      dp.cursorSkillsRoot,
      canonicalSkills,
      changedFiles,
    );

    if (dirs.cursorHooksDir && dirs.cursorHooksFile) {
      const memoryHookContent = await tryReadCanonical(canonicalSharedMemoryHookPath);
      if (
        memoryHookContent &&
        (
          await writeGeneratedFile(
            path.join(dirs.cursorHooksDir, "meta-kim-memory-save.mjs"),
            memoryHookContent,
          )
        ).changed
      ) {
        changedFiles.push(`${dp.cursorHooks}/meta-kim-memory-save.mjs`);
      }
      if (
        (
          await writeGeneratedFile(
            path.join(dirs.cursorHooksDir, "graphify-context.mjs"),
            buildCodexGraphifyContextHook(),
          )
        ).changed
      ) {
        changedFiles.push(`${dp.cursorHooks}/graphify-context.mjs`);
      }
      if (
        (
          await writeGeneratedFile(
            path.join(dirs.cursorHooksDir, "hookprompt-adapter.mjs"),
            buildHookPromptAdapterSource("cursor"),
          )
        ).changed
      ) {
        changedFiles.push(`${dp.cursorHooks}/hookprompt-adapter.mjs`);
      }
      const graphifyHookPath =
        scope === "global"
          ? path.join(dirs.cursorHooksDir, "graphify-context.mjs")
          : ".cursor/hooks/graphify-context.mjs";
      const memoryHookPath =
        scope === "global"
          ? path.join(dirs.cursorHooksDir, "meta-kim-memory-save.mjs")
          : ".cursor/hooks/meta-kim-memory-save.mjs";
      const hookPromptAdapterPath =
        scope === "global"
          ? path.join(dirs.cursorHooksDir, "hookprompt-adapter.mjs")
          : ".cursor/hooks/hookprompt-adapter.mjs";
      if (
        (
          await writeGeneratedJson(
            dirs.cursorHooksFile,
            buildCursorProjectHooksJson({
              graphifyHookPath,
              memoryHookPath,
              hookPromptAdapterPath,
            }),
          )
        ).changed
      ) {
        changedFiles.push(dp.cursorHooksFile);
      }
    }

    // MCP config (.cursor/mcp.json) — reuse Claude's MCP template
    if (dirs.cursorMcpPath) {
      const mcpContent = await tryReadCanonical(canonicalClaudeMcpPath);
      const cursorInRepoRoot = dirs.cursorMcpPath.includes(repoRoot);
      const renderedMcpContent = cursorInRepoRoot
        ? renderMetaKimRuntimeMcp(mcpContent, repoRoot)
        : emptyMcpConfigContent();
      if (
        mcpContent &&
        (await writeGeneratedFile(dirs.cursorMcpPath, renderedMcpContent))
          .changed
      ) {
        changedFiles.push(dp.cursorMcp);
      }
    }
  }

  if (checkOnly && jsonMode) {
    const byCategory = staleFiles.reduce((acc, f) => {
      const k = f.category || "unknown";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});
    const byAction = staleFiles.reduce((acc, f) => {
      acc[f.action] = (acc[f.action] || 0) + 1;
      return acc;
    }, {});
    process.stdout.write(
      `${JSON.stringify(
        {
          scope,
          targets: selectedTargets,
          total: staleFiles.length,
          byCategory,
          byAction,
          staleFiles,
        },
        null,
        2,
      )}\n`,
    );
    if (staleFiles.length > 0) process.exitCode = 1;
    return;
  }

  if (checkOnly && changedFiles.length > 0) {
    console.error(t.syncRuntimesCheckStale);
    for (const file of changedFiles) {
      console.error(t.syncRuntimesCheckStaleLine(file));
    }
    process.exitCode = 1;
    return;
  }

  if (checkOnly) {
    console.log(t.syncRuntimesCheckOk);
    return;
  }

  const normalizeDisplayPath = (value) =>
    String(value ?? "").replace(/\\/g, "/");
  const hasDisplayPrefix = (targetPath, prefix) => {
    if (!prefix) {
      return false;
    }
    const normalizedTarget = normalizeDisplayPath(targetPath);
    const normalizedPrefix = normalizeDisplayPath(prefix);
    return (
      normalizedTarget === normalizedPrefix ||
      normalizedTarget.startsWith(`${normalizedPrefix}/`)
    );
  };

  const openclawWorkspacePrefix =
    scope === "global"
      ? normalizeDisplayPath(dirs.openclawWorkspaceDir(""))
      : normalizeDisplayPath(dirs.displayPaths.openclawWorkspaces);

  const layerCounts = {
    claudeAgents: changedFiles.filter((f) =>
      hasDisplayPrefix(f, dirs.displayPaths.claudeAgents),
    ).length,
    claudeSkill: changedFiles.filter((f) =>
      hasDisplayPrefix(f, dirs.displayPaths.claudeSkills),
    ).length,
    claudeHooks: changedFiles.filter((f) =>
      hasDisplayPrefix(f, dirs.displayPaths.claudeHooks),
    ).length,
    claudeSettings: changedFiles.filter(
      (f) =>
        normalizeDisplayPath(f) ===
        normalizeDisplayPath(dirs.displayPaths.claudeSettings),
    ).length,
    claudeMcp: changedFiles.filter(
      (f) =>
        dirs.displayPaths.claudeMcp &&
        normalizeDisplayPath(f) ===
          normalizeDisplayPath(dirs.displayPaths.claudeMcp),
    ).length,
    codexAgents: changedFiles.filter((f) =>
      hasDisplayPrefix(f, dirs.displayPaths.codexAgents),
    ).length,
    codexSkill: changedFiles.filter((f) =>
      hasDisplayPrefix(f, dirs.displayPaths.codexSkillsRoot),
    ).length,
    codexHooks: changedFiles.filter((f) =>
      hasDisplayPrefix(f, dirs.displayPaths.codexHooks),
    ).length,
    codexConfig: changedFiles.filter(
      (f) =>
        normalizeDisplayPath(f) ===
        normalizeDisplayPath(dirs.displayPaths.codexConfig),
    ).length,
    codexHooksFile: changedFiles.filter(
      (f) =>
        normalizeDisplayPath(f) ===
        normalizeDisplayPath(dirs.displayPaths.codexHooksFile),
    ).length,
    openclawWorkspace: changedFiles.filter((f) =>
      normalizeDisplayPath(f).startsWith(openclawWorkspacePrefix),
    ).length,
    openclawSkill: changedFiles.filter((f) =>
      hasDisplayPrefix(f, dirs.displayPaths.openclawSkillsRoot),
    ).length,
    openclawHooks: changedFiles.filter((f) =>
      hasDisplayPrefix(f, dirs.displayPaths.openclawHooks),
    ).length,
    openclawTemplate: changedFiles.filter(
      (f) =>
        normalizeDisplayPath(f) ===
        normalizeDisplayPath(dirs.displayPaths.openclawTemplate),
    ).length,
    cursorAgents: changedFiles.filter((f) =>
      hasDisplayPrefix(f, dirs.displayPaths.cursorAgents),
    ).length,
    cursorSkill: changedFiles.filter((f) =>
      hasDisplayPrefix(f, dirs.displayPaths.cursorSkillsRoot),
    ).length,
    cursorHooks: changedFiles.filter((f) =>
      hasDisplayPrefix(f, dirs.displayPaths.cursorHooks),
    ).length,
    cursorHooksFile: changedFiles.filter(
      (f) =>
        normalizeDisplayPath(f) ===
        normalizeDisplayPath(dirs.displayPaths.cursorHooksFile),
    ).length,
    cursorMcp: changedFiles.filter(
      (f) =>
        normalizeDisplayPath(f) ===
        normalizeDisplayPath(dirs.displayPaths.cursorMcp),
    ).length,
  };

  const teamSize = agents.length;
  const groups = [
    {
      name: t.runtimeGroupClaude,
      entries: [
        {
          label: dirs.displayPaths.claudeAgents,
          count: layerCounts.claudeAgents,
          summaryKind: "agents",
        },
        {
          label: dirs.displayPaths.claudeSkills,
          count: layerCounts.claudeSkill,
          summaryKind: "files",
        },
        {
          label: dirs.displayPaths.claudeHooks,
          count: layerCounts.claudeHooks,
          summaryKind: "files",
        },
        {
          label: dirs.displayPaths.claudeSettings,
          count: layerCounts.claudeSettings,
          summaryKind: "files",
        },
        {
          label: dirs.displayPaths.claudeMcp,
          count: layerCounts.claudeMcp,
          summaryKind: "files",
        },
      ],
    },
    {
      name: t.runtimeGroupCodex,
      entries: [
        {
          label: dirs.displayPaths.codexAgents,
          count: layerCounts.codexAgents,
          summaryKind: "agents",
        },
        {
          label: dirs.displayPaths.codexSkillsRoot,
          count: layerCounts.codexSkill,
          summaryKind: "files",
        },
        {
          label: dirs.displayPaths.codexHooks,
          count: layerCounts.codexHooks,
          summaryKind: "files",
        },
        {
          label: dirs.displayPaths.codexHooksFile,
          count: layerCounts.codexHooksFile,
          summaryKind: "files",
        },
        {
          label: dirs.displayPaths.codexConfig,
          count: layerCounts.codexConfig,
          summaryKind: "files",
        },
      ],
    },
    {
      name: t.runtimeGroupOpenclaw,
      entries: [
        {
          label: dirs.displayPaths.openclawWorkspaces,
          count: layerCounts.openclawWorkspace,
          summaryKind: "workspaces",
        },
        {
          label: dirs.displayPaths.openclawSkillsRoot,
          count: layerCounts.openclawSkill,
          summaryKind: "files",
        },
        {
          label: dirs.displayPaths.openclawHooks,
          count: layerCounts.openclawHooks,
          summaryKind: "files",
        },
        {
          label: dirs.displayPaths.openclawTemplate,
          count: layerCounts.openclawTemplate,
          summaryKind: "files",
        },
      ],
    },
    {
      name: t.runtimeGroupCursor,
      entries: [
        {
          label: dirs.displayPaths.cursorAgents,
          count: layerCounts.cursorAgents,
          summaryKind: "agents",
        },
        {
          label: dirs.displayPaths.cursorSkillsRoot,
          count: layerCounts.cursorSkill,
          summaryKind: "files",
        },
        {
          label: dirs.displayPaths.cursorHooks,
          count: layerCounts.cursorHooks,
          summaryKind: "files",
        },
        {
          label: dirs.displayPaths.cursorHooksFile,
          count: layerCounts.cursorHooksFile,
          summaryKind: "files",
        },
        {
          label: dirs.displayPaths.cursorMcp,
          count: layerCounts.cursorMcp,
          summaryKind: "files",
        },
      ],
    },
  ];

  // Dynamic path column width: base on the longest active label so short
  // entries (e.g. ".mcp.json") do not trail a wall of spaces. Bounded below
  // so single-entry runs still have breathing room, and above so pathological
  // long paths do not push detail off-screen.
  const activeLabels = groups.flatMap((g) =>
    g.entries.filter((e) => e.label && e.count > 0).map((e) => String(e.label)),
  );
  const longestLabel = activeLabels.reduce(
    (max, label) => Math.max(max, label.length),
    0,
  );
  const pathColWidth = Math.max(16, Math.min(longestLabel + 2, 60));
  console.log("");
  console.log(t.syncRuntimesSummaryTitle);
  console.log(t.syncRuntimesSummaryIntro);
  console.log("");

  for (const group of groups) {
    const activeEntries = group.entries.filter(
      (entry) => entry.label && entry.count > 0,
    );
    if (activeEntries.length === 0) {
      continue;
    }
    console.log(`${group.name}`);
    for (const entry of activeEntries) {
      const pathCol = String(entry.label).padEnd(pathColWidth);
      let detail = "";
      if (entry.summaryKind === "agents") {
        detail = t.syncDetailAgents(entry.count, teamSize);
      } else if (entry.summaryKind === "workspaces") {
        detail = t.syncDetailWorkspaces(entry.count, teamSize);
      } else {
        detail = t.syncDetailFiles(entry.count);
      }
      console.log(`${pathCol} ${detail}`);
    }
    console.log("");
  }

  console.log(t.syncScopeLine(scope, selectedTargets.join(", ")));

  if (manifestRecorder) {
    const result = await manifestRecorder.flush();
    if (result.ok) {
      console.log(`✓ ${t.syncInstallManifestOk(result.path, result.entries)}`);
    }
  }
}

if (
  import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` ||
  process.argv[1]?.endsWith("sync-runtimes.mjs")
) {
  await main();
}
