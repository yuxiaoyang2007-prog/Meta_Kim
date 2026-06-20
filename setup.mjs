#!/usr/bin/env node
/**
 * Meta_Kim interactive setup (i18n)
 *
 * Usage:
 *   node setup.mjs              # Interactive first-run setup
 *   node setup.mjs --lang zh    # Skip language selection, use Chinese
 *   node setup.mjs --update     # Update installed skills
 *   node setup.mjs --check      # Environment check only
 *   node setup.mjs --silent     # Non-interactive (CI / scripts)
 *   node setup.mjs --skills a,b # Limit global skill repos (non-interactive / CI)
 *   node setup.mjs --project-dir <dir> [--project-dir <dir>]
 *                                # Also export project-level runtime files to one or more projects
 *   node setup.mjs --all-projects # Reuse saved project directories for export/update
 *   node setup.mjs --project-bootstrap --project-dir <dir> [--dry-run|--apply] [--json]
 *                                # Global-first first-trigger project bootstrap
 *
 * Optional prompts (off by default — install uses global scope and skips proxy UI):
 *   --prompt-proxy              # Ask Windows system proxy for git (META_KIM_GIT_PROXY)
 *   META_KIM_PROMPT_PROXY=1
 */

import { execSync, spawnSync, spawn } from "node:child_process";
import http from "node:http";
import {
  existsSync,
  mkdirSync,
  rmSync,
  readdirSync,
  cpSync,
  statSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, dirname, resolve, isAbsolute, relative } from "node:path";
import { homedir, platform, tmpdir } from "node:os";
import { createInterface } from "node:readline";
import {
  ensureProfileState,
  toRepoRelative,
} from "./scripts/meta-kim-local-state.mjs";
import {
  detectPython310,
  extractPipShowVersion,
  readProcessText,
  runPythonModule,
  checkNetworkx,
} from "./scripts/graphify-runtime.mjs";
import { resolveManifestSkillSubdir } from "./scripts/install-platform-config.mjs";
import { buildNodeScriptSpawn } from "./scripts/node-spawn-config.mjs";
import {
  CODEX_BUSINESS_ROLE_AGENT_IDS,
  CODEX_RUNTIME_ADAPTER_AGENT_IDS,
  META_AGENTS,
  OPENCLAW_WORKSPACE_MD,
  expectedAgentProjectionFiles,
  summarizeExpectedFiles,
} from "./scripts/runtime-sync-check.mjs";
import {
  mergeRepoClaudeSettings,
} from "./scripts/claude-settings-merge.mjs";
import {
  buildCodexHooksJson,
  buildCursorHooksJson,
  stripProjectMetaKimHooksFromHookConfig,
} from "./scripts/runtime-hook-mapping.mjs";
import {
  loadLocalOverrides,
  normalizeTargets,
  parseSkillsArg,
  resolveTargetContext,
  resolveRuntimeHomeDir,
  writeLocalOverrides,
} from "./scripts/meta-kim-sync-config.mjs";
import {
  MIN_NODE_VERSION,
  isSupportedNodeVersion,
} from "./scripts/node-runtime-requirements.mjs";

// ── Config ──────────────────────────────────────────────

const PROJECT_DIR = resolve(import.meta.dirname || ".");
const SKILLS_DIR = join(resolveRuntimeHomeDir("claude"), "skills");
const PROXY = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "";
const isWin = platform() === "win32";
const args = process.argv.slice(2);
const updateMode = args.includes("--update") || args.includes("-u");
const checkOnly = args.includes("--check");
const projectBootstrapMode = args.includes("--project-bootstrap");
const projectCleanupMode =
  args.includes("--cleanup-projects") || args.includes("--project-cleanup");
const projectBootstrapDryRun = args.includes("--dry-run");
const projectBootstrapApply = args.includes("--apply");
const jsonOutputMode = args.includes("--json");
const silentMode = args.includes("--silent") || !process.stdout.isTTY;
const useSavedProjectDirsMode =
  args.includes("--all-projects") || args.includes("--update-projects");
const saveProjectDirsMode = args.includes("--save-project-dirs");

function writeUtf8BomFileSync(path, content) {
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(content, "utf8"),
    ]),
  );
}

/** Interactive extras (default off): proxy prompts stay opt-in; install scope is always shown in TTY. */
const promptProxy =
  args.includes("--prompt-proxy") || process.env.META_KIM_PROMPT_PROXY === "1";

/** Maps `node setup.mjs --lang zh` etc. to canonical language codes (defined before --lang handling). */
// const INSTALL_LOG_FILE = join(
//   homedir(),
//   ".cache",
//   "meta-kim-setup",
//   `install-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.log`,
// );

/** Maps `node setup.mjs --lang zh` etc. to canonical language codes (defined before --lang handling). */
const LANG_ARG_ALIASES = { zh: "zh-CN", ja: "ja-JP", ko: "ko-KR" };
function normalizeLangCliArg(arg) {
  if (!arg) return null;
  const trimmed = String(arg).trim();
  const lower = trimmed.toLowerCase();
  return LANG_ARG_ALIASES[lower] || trimmed;
}

const langIdx = args.indexOf("--lang");
const langArg = langIdx >= 0 && args[langIdx + 1] ? args[langIdx + 1] : null;
let currentLangCode = langArg ? normalizeLangCliArg(langArg) : "en";

const RUNTIME_CHOICES = [
  { id: "claude", label: "Claude Code" },
  { id: "codex", label: "Codex" },
  { id: "openclaw", label: "OpenClaw" },
  { id: "cursor", label: "Cursor" },
];

function normalizeProjectDeployDir(rawDir) {
  const raw = String(rawDir || "").trim();
  if (!raw) return null;
  if (raw.startsWith("~/")) return join(homedir(), raw.slice(2));
  if (raw.startsWith("~\\")) return join(homedir(), raw.slice(2));
  return resolve(raw);
}

function uniqueProjectDeployDirs(dirs) {
  const seen = new Set();
  const result = [];
  for (const rawDir of dirs || []) {
    const dir = normalizeProjectDeployDir(rawDir);
    if (!dir) continue;
    const key = isWin ? dir.replace(/\\/g, "/").toLowerCase() : dir;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(dir);
  }
  return result;
}

function parseProjectDeployDirArgs(argv = args) {
  const values = [];
  const names = new Set(["--project-dir", "--deploy-dir", "--target-dir"]);
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (names.has(current) && argv[index + 1]) {
      values.push(argv[index + 1]);
      index += 1;
      continue;
    }
    for (const name of names) {
      const prefix = `${name}=`;
      if (current.startsWith(prefix)) {
        values.push(current.slice(prefix.length));
      }
    }
  }
  return uniqueProjectDeployDirs(values);
}

const cliProjectDeployDirs = parseProjectDeployDirArgs(args);

/** Load skills manifest from shared config (single source of truth) */
function loadSkillsManifest() {
  const manifestPath = join(PROJECT_DIR, "config", "skills.json");
  try {
    const raw = readFileSync(manifestPath, "utf8");
    const manifest = JSON.parse(raw);

    // Allow env var override
    const skillOwner =
      process.env.META_KIM_SKILL_OWNER || manifest.skillOwner || "KimYx0207";

    // Transform manifest to legacy format for compatibility
    return {
      skillOwner,
      externalUrls: manifest.externalUrls || {},
      skills: manifest.skills.map((skill) => {
        const repo = skill.repo.replace("${skillOwner}", skillOwner);
        const subdir = resolveManifestSkillSubdir(skill, platform(), {
          fallbackToFindskillPack: true,
        });

        return {
          name: skill.id,
          repo,
          subdir,
          claudePlugin: skill.claudePlugin,
          defaultSelected: skill.defaultSelected ?? true,
          targets: skill.targets || ["claude", "codex", "openclaw"],
        };
      }),
    };
  } catch (err) {
    warn(t.warnManifestLoadFail(err.message));
    return { skillOwner: "KimYx0207", externalUrls: {}, skills: [] };
  }
}

const skillsManifest = loadSkillsManifest();
const SKILL_OWNER = skillsManifest.skillOwner;
const SKILLS = skillsManifest.skills;
const EXTERNAL_URLS = skillsManifest.externalUrls;

function getDefaultSkillIds() {
  return SKILLS.filter((s) => s.defaultSelected).map((s) => s.name);
}

function normalizeSkillIds(rawIds) {
  const validByLower = new Map(
    SKILLS.map((s) => [s.name.toLowerCase(), s.name]),
  );
  const seen = new Set();
  const out = [];
  for (const raw of rawIds || []) {
    const key = String(raw || "")
      .trim()
      .toLowerCase();
    if (!key) continue;
    const canonical = validByLower.get(key);
    if (!canonical) continue;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

const packageJsonPath = join(PROJECT_DIR, "package.json");
const packageVersion = existsSync(packageJsonPath)
  ? JSON.parse(readFileSync(packageJsonPath, "utf8")).version || "dev"
  : "dev";

// ── i18n ────────────────────────────────────────────────

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "zh-CN", label: "中文" },
  { code: "ja-JP", label: "日本語" },
  { code: "ko-KR", label: "한국어" },
];

const I18N = {
  en: {
    modeCheck: "check only",
    modeUpdate: "update",
    modeSilent: "silent",
    modeInteractive: "interactive",
    /** Shared gate before menu / CLI modes — headings below are titles only, no "step 1/N" */
    preflightHeading: "Environment check",
    nodeOld: (v) => `Node.js v${v} too old, need >=${MIN_NODE_VERSION}`,
    nodeOk: (v) => `Node.js v${v}`,
    npmNotFound: "npm not found",
    gitNotFound: "git not found — skills install requires git",
    proxyInfo: (p) => `Proxy: ${p}`,
    pkgFound: "package.json found",
    pkgNotFound: "package.json not found — run from Meta_Kim root",
    envFailed: "Environment check failed. Fix the issues above.",
    envOk: "Environment OK!",
    stepRuntime: "AI coding tool detection",
    claudeDetected: (v) => `Claude Code ${v}`,
    claudeNotDetected: "Claude Code CLI not detected",
    codexDetected: (v) => `Codex ${v}`,
    codexNotDetected: "Codex CLI not detected (optional)",
    openclawDetected: (v) => `OpenClaw ${v}`,
    openclawNotDetected: "OpenClaw CLI not detected (optional)",
    cursorDetected: (v) => `Cursor ${v}`,
    cursorNotDetected: "Cursor CLI not detected (optional)",
    noRuntime: "No AI coding tool detected.",
    noRuntimeHint1:
      "Meta_Kim works with Claude Code, Codex, OpenClaw, or Cursor.",
    noRuntimeHint2: "Install at least one: {claudeCodeDocs}",
    continueAnyway: "Continue setup anyway?",
    setupCancelled: "Setup cancelled. Install an AI coding tool and re-run.",
    stepConfig: "Project configuration",
    mcpExists: ".mcp.json already configured",
    mcpCreated: ".mcp.json created — MCP service registered",
    settingsExists: ".claude/settings.json already configured",
    askCreateSettings: "Create .claude/settings.json with hooks?",
    settingsCreated:
      ".claude/settings.json created — hooks + permissions registered",
    settingsSkipped: ".claude/settings.json skipped by user",
    settingsSkippedNoClaude:
      ".claude/settings.json skipped (Claude Code not detected)",
    stepSkills: "Install skills",
    shipsSkills: (n) => `Meta_Kim ships ${n} skills:`,
    runningNpm: "Running npm install ...",
    npmDone: "npm dependencies installed",
    npmFailed: `
✗ npm install failed

Possible causes:
1. Network error → Check your internet connection and proxy settings
2. Node version mismatch → Ensure Node ${MIN_NODE_VERSION}+ is installed
3. Permission issue → Run: npm install --no-optional

→ Fix: Run the command manually to see full output: npm install
`,
    nodeModulesExist: "node_modules exists (use --update to reinstall)",
    skillUpdated: (n) => `${n} — updated`,
    skillInstalled: (n) => `${n} — installed`,
    skillExists: (n) => `${n} — already installed`,
    skillSubdirInstalled: (n, s) => `${n} — installed (subdir: ${s})`,
    skillFailed: (n, r) => `
✗ Skill installation failed: ${n}

Possible causes:
1. Network timeout → Run: npm run meta:sync
2. Permission denied → Run with sudo/administrator
3. Repo not found → Check the skill repository URL

${r ? `Raw error: ${r}` : ""}
`,
    skillUpdateFailed: (n) =>
      `${n} — update skipped (non-fast-forward; keeping existing)`,
    skillSubdirNotFound: (n) => `${n} — subdir not found`,
    skillsReady: (ok, total, fail) =>
      `${ok}/${total} skills ready${fail > 0 ? `, ${fail} failed` : ""}`,
    stepValidate: "Validate project",
    agentPrompts: (n) => `${n} meta-agent prompts`,
    validationPassed: "Project validation passed",
    validationWarnings: "Validation has warnings (non-blocking)",
    setupComplete: "Setup complete!",
    whatMetaDoes: "What Meta_Kim does:",
    whatMetaDoesDesc1: "Gives your AI coding agent a team of specialists:",
    whatMetaDoesDesc2: "one reviews code, one handles security, one manages",
    whatMetaDoesDesc3: "memory — all coordinated automatically.",
    howToUse: "How to use:",
    step1Open: "Open Claude Code in this directory:",
    step2Try: "Try a meta-theory command:",
    step3Or: "Or just ask Claude to do something complex:",
    step3Hint: "(Meta_Kim will auto-coordinate the specialists)",
    codexNote: "Codex prompts are synced to .codex/",
    openclawNote: "OpenClaw workspace is synced to openclaw/",
    cursorNote: "Cursor agents are synced to .cursor/",
    noRuntimeGetStarted:
      "No AI coding tool detected. Install Claude Code to get started:",
    usefulCommands: "Useful commands:",
    cmdUpdate: "Update all skills",
    cmdCheck: "Check environment",
    cmdDoctor: "Diagnose Meta_Kim health",
    cmdVerify: "Full verification",
    cmdDiscover: "Scan global capabilities (agents/skills)",
    // Post-install notes
    postInstallNotesHeading: "Post-install notes:",
    postInstallNotesIntro:
      "After installation, here is what is available and how each layer activates:",
    postInstallNotesPlatformSync: "Platform capability sync:",
    platformClauleCode: "Claude Code",
    platformClauleCodeCap: "agents + skills + hooks",
    platformCodex: "Codex",
    platformCodexCap: "agents + skills",
    platformOpenClaw: "OpenClaw",
    platformOpenClawCap: "workspace + skills",
    platformCursor: "Cursor",
    platformCursorCap: "agents + skills",
    postInstallNotesLayerActivation: "Three-layer memory activation:",
    layer1Label: "Layer 1 (Memory)",
    layer1Note: "automatic — built into Claude Code",
    layer2Label: "Layer 2 (Graphify)",
    layer2Note: "automatic after graphify install (pip install graphifyy)",
    layer3Label: "Layer 3 (SQL / MCP Memory Service)",
    layer3Note:
      "requires server startup: memory server --http (then http://localhost:8000)",
    installLocationsHeading: "Installation locations:",
    installLocationsProject: "Project-level (this directory)",
    installLocationsGlobal: "Global-level (shared across projects)",
    installLocationsManifest: "Install manifest (for safe rollback)",
    usefulCommandsHeading: "Next useful commands:",
    cmdWhereStatus: "view all artifact locations",
    cmdWhereStatusDiff: "diff against previous install",
    cmdWhereUninstall: "safe uninstall",
    postInstallNotesReminder: "Reminder:",
    postInstallNotesReminderText:
      "Run node setup.mjs --check to verify your installation at any time.",
    setupError: "Setup error:",
    setupInterrupted:
      "Interrupted (Ctrl+C) — setup did not finish. Run node setup.mjs again when ready.",
    selectLang: "Select language / 选择语言 / 言語を選択 / 언어 선택",
    choose: (n) => `Choose (1-${n})`,
    /** Shown under @inquirer select (replaces default English key hints). */
    inquirerSingleHotkeys: "↑↓ navigate · ⏎ confirm",
    /** Shown under @inquirer checkbox — space / a / i match default shortcuts. */
    inquirerMultiHotkeys:
      "↑↓ move · space toggle · ⏎ confirm · a all · i invert",
    globalInstallPrompt:
      "Meta_Kim skills install to ~/.claude/skills/ (global). Install globally?",
    globalDirReady: (p) => `Global skills dir ready: ${p}`,
    globalDirCreated: (p) => `Created global skills dir: ${p}`,
    globalDirCreateFailed: (e) => `Failed to create global skills dir: ${e}`,
    globalDirTitle: "Global Skills Directory",
    globalDirPrompt: `Meta_Kim skills will be installed to ~/.claude/skills/
• Global install — Shared across all projects
• Skip — For this project only
• Re-run setup.mjs anytime to install`,
    globalSkipped: "Global install skipped — using project-local only",
    // Install scope selection
    installScopeHeading: "Installation Scope",
    installScopePrompt:
      "Install global reusable capabilities or update project directories?",
    installScopeProject:
      "Project directories — explicit project runtime update",
    installScopeGlobal:
      "Global — reusable agents, commands, MCP, hooks, and skills where the runtime supports them",
    installScopeProjectLabel: "Project directory updates",
    installScopeGlobalLabel: "Global capabilities (recommended)",
    installScopeProjectDesc:
      "Batch update selected project directories; skips reusable global capability install.",
    installScopeProjectDescDetail: `Updates the project directories you choose:
• Project context/config — managed AGENTS.md/CLAUDE.md blocks and add-only MCP/settings merges
• Project runtime projection — target-selected agents, commands, hooks, MCP, skills, rules/workspaces when project-level material is explicitly selected
• Project overrides — project-dedicated variants stay local when this project needs custom behavior
• graphify-out/ — Knowledge graph (reduces hallucination, speeds queries)
• .meta-kim/state/ and .meta-kim/backups/ — Runtime state, manifest, cache, backup, and rollback`,
    installScopeGlobalDesc:
      "Install reusable runtime capabilities; project-local files are created only for customization.",
    installScopeGlobalDescDetail: `Creates global-level features:
• Agents / commands / MCP / hooks / skills — installed into each selected runtime's official global/home locations when supported
• Project directories reuse these capabilities directly unless a project-specific extension is proven
• Other projects get discovery/dry-run first; local files are written only after customization/bootstrap confirmation`,
    askProjectRedundantCleanup:
      "Clean up redundant Meta_Kim project-level assets in selected project directories?\nGlobal capabilities will be installed into each runtime's global directory.\nCleanup only removes manifest-proven Meta_Kim-generated agents, skills, Commands, hooks, and empty folders.",
    projectCleanupAsk: "Project directories to clean",
    projectCleanupProtectionNote:
      "Cleanup-only mode: removes Meta_Kim-generated project-level runtime assets proven by manifest; preserves user files, credentials, and merged config.",
    projectCleanupHookConfigStripped: (files) =>
      `Removed Meta_Kim project hook references from merged config: ${files.join(", ")}`,
    projectCleanupBatchHeading: (n) =>
      `Cleaning redundant Meta_Kim project-level assets in ${n} project directory/directories`,
    projectCleanupSummary: "Project cleanup summary",
    // Directory structure explanation
    directoryExplanationHeading: "Directory Structure",
    directoryExplanationIntro: "Meta_Kim creates two levels of directories:",
    directoryExplanationProject: "Project-level (in this repo):",
    directoryExplanationProjectDetail: `• graphify-out/ — Knowledge graph built from your code
  Reduces AI hallucination by grounding queries in actual codebase structure

• .meta-kim/state/ — Runtime cache and session recovery
  Stores run history, compacts sessions, enables cross-session recovery

• .claude/.codex/.cursor/openclaw/ — Tool-specific project context/config/overrides
  Reusable agents, commands, MCP, hooks, and skills stay global unless the project needs a custom variant`,
    directoryExplanationGlobal: "Global-level (in home directory):",
    directoryExplanationGlobalDetail: `• ~/.claude/skills/ — Skills shared across ALL projects
  Install once, discover everywhere. Project files are written only for confirmed customization/state.

• ~/%tool%/skills/ — Tool-specific skills
  Claude: ~/.claude/skills/
  Codex: ~/.codex/skills/
  Cursor: ~/.cursor/skills/
  OpenClaw: ~/.openclaw/skills/`,
    directoryExplanationExisting: "For existing projects:",
    depCheckHeading: "Dependency Check",
    depOk: (n) => `${n} — OK`,
    depMissing: (n) => `${n} — MISSING`,
    depNoFiles: (n) => `${n} — directory exists but no .md files`,
    selectRuntimeTargets: "Which AI coding tools do you use on this machine?",
    selectSkillDependencies:
      "Which third-party skill repositories should be installed globally?",
    inputTargetsHint: (d) =>
      `Enter numbers, comma for multiple; Enter to use default ${d}`,
    inputSkillIdsHint: (d) =>
      `Enter numbers, comma for multiple; Enter to use default ${d}`,
    warnUnknownSkillId: (id) => `Unknown skill id (ignored): ${id}`,
    depSummaryAll: "All 9 dependencies verified",
    depSummarySome: (ok, total) =>
      `Only ${ok}/${total} dependencies verified — re-run with --update`,
    syncHeading: "Cross-Runtime Sync Check",
    syncClaudeAgents: (n) => `Claude Code agents: ${n}/${META_AGENTS.length} .md files`,
    syncClaudeSkills: "Claude Code skills/meta-theory/SKILL.md",
    syncClaudeHooks: (n) => `Claude Code hooks: ${n} scripts`,
    syncClaudeProjectHooksMigrated:
      "Claude Code project hooks migrated to global hooks; repo-local .claude/hooks is not required",
    syncClaudeSettings: "Claude Code .claude/settings.json",
    syncClaudeMcp: "Claude Code .mcp.json",
    syncCodexAgents: (n, total = META_AGENTS.length) =>
      `Codex agents: ${n}/${total} .toml files`,
    syncCodexSkills: "Codex .agents/skills/meta-theory/SKILL.md",
    syncCodexSkillsGlobal:
      "Codex project skill mirror: .agents/skills/meta-theory/SKILL.md",
    syncOpenclawWorkspaces: (n) =>
      `OpenClaw workspaces: ${n}/${META_AGENTS.length} agents — each folder has the 9 required .md files (BOOT, SOUL, …)`,
    syncOpenclawSkill: "OpenClaw shared meta-theory",
    syncSharedSkills: "Shared skills/meta-theory/SKILL.md",
    syncCursorAgents: (n) => `Cursor agents: ${n}/${META_AGENTS.length} .md files`,
    syncCursorSkills: "Cursor skills/meta-theory/SKILL.md",
    syncCursorMcp: "Cursor .cursor/mcp.json",
    mcpRuntimeProjectOnly: (p) =>
      `${p} contains meta-kim-runtime, but its script path is not usable here. This MCP is only for the Meta_Kim source repo; remove the meta-kim-runtime block in copied projects. Agents still load from .claude/.codex/.cursor/openclaw files.`,
    syncOk: "All sync targets verified",
    syncMissing: (p) => `Missing: ${p}`,
    syncPartial: (label, got, need) => `${label}: got ${got}, need ${need}`,
    stepPythonTools: "Optional Python Tools",
    pythonNotFound: "Python 3.10+ not found — skipping graphify",
    pythonHint:
      "Install Python 3.10+ and run: pip install graphifyy && python -m graphify claude install",
    pythonNotFoundOfferInstall:
      "Python 3.10+ not found. Do you want to auto-download and install it?",
    pythonInstalling: "Downloading and installing Python 3.10+...",
    pythonInstallSuccess: "Python 3.10+ installed successfully",
    pythonInstallFailed: (err) =>
      `Python installation failed: ${err} — you can install manually at https://www.python.org/downloads/`,
    pythonInstallNotSupported: (platform) =>
      `Auto-install not supported on ${platform}. Please install Python 3.10+ manually from https://www.python.org/downloads/`,
    pythonInstallWinget: "Installing Python via winget...",
    pythonInstallWingetHint:
      "winget is downloading and installing Python — this may take a few minutes, please wait...",
    pythonInstallScoop: "Installing Python via scoop...",
    graphifyCheck: (v) => `graphify ${v}`,
    graphifyInstalling: "Installing graphify (code knowledge graph)...",
    graphifyInstalled: "graphify installed and Claude skill registered",
    graphifyUpgrading: "Upgrading graphify to latest version...",
    graphifyUpgraded: (v) => `graphify upgraded to ${v}`,
    graphifyUpgradeFailed: `graphify upgrade failed (non-blocking)`,
    graphifyInstallFailed: `
✗ graphify installation failed (non-blocking)

Possible causes:
1. Python not found → Ensure Python 3.10+ is installed and in PATH
2. pip error → Run: pip install graphifyy manually to see details
3. Network error → Check your internet/proxy connection

→ Fix: Run: pip install graphifyy && python -m graphify claude install
`,
    graphifyAlreadyInstalled: (v) => `graphify ${v} — already installed`,
    graphifySkillRegistering: (p) => `Registering graphify ${p} skill...`,
    graphifySkillRegistered: (p) => `graphify ${p} skill registered`,
    graphifySkillFailed: (p) =>
      `graphify ${p} skill registration failed (non-blocking)`,
    graphifySkillSkippedGuideExists: (p) =>
      `graphify ${p} install skipped (guide already has Graphify section)`,
    graphifyCodeGraphGenerated: "graphify code graph generated",
    graphifyCodeGraphGenerationFailed:
      "graphify code graph generation failed (non-blocking)",
    networkxCheck: (v) => `networkx ${v}`,
    networkxUpgrading:
      "Upgrading networkx to >=3.4 for graphify compatibility...",
    networkxUpgraded: (v) => `networkx upgraded to ${v}`,
    networkxUpgradeFailed:
      "networkx upgrade failed (graphify may not generate graphs correctly)",
    networkxAlreadyOk: (v) => `networkx ${v} — compatible`,
    graphifyHookInstalling:
      "Installing git hooks for auto graph rebuild on commit/checkout...",
    graphifyHookInstalled:
      "graphify git hooks installed (auto-rebuild on commit/checkout)",
    graphifyHookFailed: "graphify git hook installation failed (non-blocking)",
    graphifyProjectWiringSkipped:
      "Graphify is installed globally. Run `npm run meta:graphify:rebuild` (or `python -m graphify update .`) inside a project to build its knowledge graph.",
    stepMcpMemory: "Meta_Kim cross-session memory",
    mcpMemoryInstalling: "Installing MCP Memory Service (Layer 3)...",
    mcpMemoryInstalled: "MCP Memory Service installed",
    mcpMemoryInstallFailed:
      "MCP Memory Service installation failed (non-blocking)",
    mcpMemoryAlreadyInstalled: (v) =>
      `MCP Memory Service ${v} — already installed`,
    mcpMemoryStopping: "Stopping running MCP Memory Service before upgrade...",
    mcpMemoryStopped: "MCP Memory Service stopped",
    mcpMemoryUpgrading: "Upgrading MCP Memory Service to latest version...",
    mcpMemoryUpgraded: (v) => `MCP Memory Service upgraded to ${v}`,
    mcpMemoryUpgradeFailed: "MCP Memory Service upgrade failed (non-blocking)",
    mcpMemoryServerRegistered: "MCP Memory Service registered in .mcp.json",
    mcpMemoryServerExists: ".mcp.json already has MCP Memory Service",
    askMcpMemoryInstall:
      "Enable Meta_Kim cross-session memory? This uses MCP Memory Service; setup installs it if missing, registers it, and starts it in the background.",
    mcpMemorySkipped: "MCP Memory Service skipped",
    mcpMemoryServerStartHint:
      "MCP Memory Service installed — HTTP service starts with: MCP_ALLOW_ANONYMOUS_ACCESS=true memory server --http",
    mcpMemoryHookInstalling:
      "Installing MCP Memory hooks for Claude Code, Codex, Cursor, and OpenClaw...",
    mcpMemoryHookInstalled: "MCP Memory runtime hooks installed",
    mcpMemoryHookWarnings:
      "Hook installation reported warnings (non-blocking) — underlying stderr shown below:",
    mcpMemoryAutoStarting: "Starting MCP Memory Service (HTTP, background)...",
    mcpMemoryAutoStarted: "MCP Memory Service running at http://localhost:8000",
    mcpMemoryAutoStartUnverified:
      "MCP Memory Service process is running; continuing",
    mcpMemoryAutoStartFailed: "Auto-start failed — start manually:",
    mcpMemoryAutoStartManual:
      "  MCP_ALLOW_ANONYMOUS_ACCESS=true memory server --http",
    mcpMemoryAutoStartBoot: "Boot auto-start configured",
    mcpMemoryAutoStartFailureTitle: "Meta_Kim MCP Memory Service",
    mcpMemoryAutoStartFailureMessage:
      "Meta_Kim MCP Memory Service failed to start or did not become healthy at http://127.0.0.1:8000. Cross-session memory may be unavailable. Please start it manually: MCP_ALLOW_ANONYMOUS_ACCESS=true memory server --http",
    updateHeading: "Update Mode",
    updateNpm: "Reinstalling npm dependencies...",
    updateSkills: "Updating all skills...",
    updateSyncProjectFiles:
      "Syncing tool configs in this repo from canonical/...",
    updateSyncDone: "Sync complete",
    updateSyncSkip: "Sync skipped or failed",
    updateReGlobal: "Re-select global skills directory?",
    askReselectRuntimes: "Re-select AI coding tools for this machine?",
    askPythonToolsUpdate: "Install Python graphify (code knowledge graph)?",
    pythonToolsSkipped: "Python tools skipped",
    askGlobalSkillsUpdate: "Update global skills? (optional)",
    updateSkillsDone: "Global skills updated",
    globalSkillsSkipped: "Global skills skipped",
    askMetaTheoryUpdate:
      "Sync the Meta_Kim global governance layer to the selected runtimes for reuse across projects? Includes agents, skills, MCP, Commands, hooks, etc.; supported items are checked automatically. (recommended)",
    updateMetaTheoryDone: "Meta_Kim global capabilities synced",
    metaTheorySkipped: "Meta_Kim global capability sync skipped",
    globalHooksMigrationHeading:
      "Self-host hook migration check (~/.claude/hooks/meta-kim/)",
    globalHooksMigrationFound: (n) =>
      `Found ${n} Meta_Kim-managed hook file(s) that no longer match the canonical whitelist.`,
    globalHooksMigrationListed: (files) =>
      `Files to remove:\n${files.map((f) => `  - ${f}`).join("\n")}`,
    globalHooksMigrationKept: (files) =>
      `User-authored files (kept):\n${files.map((f) => `  - ${f}`).join("\n")}`,
    globalHooksMigrationConfirm: (n) =>
      `Delete ${n} Meta_Kim-managed hook file(s) and back them up? (y/N)`,
    globalHooksMigrationBackedUp: (dir) => `Backed up to: ${dir}`,
    globalHooksMigrationDone: (n) =>
      `Removed ${n} Meta_Kim-managed hook file(s); will be re-installed by the global sync step.`,
    globalHooksMigrationSkipped:
      "Skipped by user; global hooks re-install may fail until you remove them manually.",
    globalHooksMigrationNoChange:
      "Global hooks dir is clean; no migration needed.",
    projectHooksMigrationHeading: (platform) =>
      `[${platform}] Removing Meta_Kim-managed project-level hook files`,
    projectHooksMigrationRemoved: (platform, count, dir) =>
      `[${platform}] Removed ${count} Meta_Kim-managed file(s) from ${dir}`,
    projectHooksMigrationKept: (platform, files) =>
      `[${platform}] User-authored hook files (kept): ${
        files.length > 0 ? files.join(", ") : "(none)"
      }`,
    projectHooksMigrationNoChange: (platform, dir) =>
      `[${platform}] ${dir} is clean; no Meta_Kim files to remove.`,
    projectAssetsCleanupIntro:
      "Meta_Kim is moving reusable capabilities to global runtime directories; project directories keep explicit project projections, project-specific overrides, state, and cache.",
    projectAssetsCleanupScope:
      "Cleanup only removes project-level capability assets proven by the project-bootstrap manifest to be Meta_Kim-generated and no longer managed. User files, credentials, and merged config files are preserved.",
    projectAssetsRetargetCleanupIntro:
      "Project runtime targets changed; Meta_Kim is pruning old project-level assets from targets that are not selected this time.",
    projectAssetsRetargetCleanupScope:
      "This project update removes only manifest-proven Meta_Kim-generated assets that are outside the current target selection. User files, credentials, and merged config files are preserved.",
    projectAssetsCleanupRemoved: (count, rows) =>
      `Removed ${count} stale project-level asset(s) and pruned empty directories:\n${rows.map((row) => `  - ${row}`).join("\n")}`,
    projectAssetsCleanupAllClean:
      "All capability types clean (agents/skills/commands/capability-index/hooks): 0 removed",
    projectAssetsCleanupSkipped: (count) =>
      `Skipped ${count} manifest entry/entries that were not safe to remove.`,
    updateComplete: "Update complete!",
    // Installation overview strings
    installOverviewTitle: "Meta_Kim Installation Overview",
    installOverviewWill: "This process will:",
    installOverviewSyncConfig:
      "Sync configurations to project directory (canonical → .claude/.codex/openclaw/.cursor/)",
    installOverviewInstallSkills:
      "Install selected global skill repositories (~/.claude/skills/)",
    installOverviewSyncMeta: "Sync Meta_Kim reusable capabilities to global runtime directories",
    installOverviewOptionalPython: "Install Python graphify tool",
    installOverviewTargets: "Target tools:",
    installOverviewSkillList: "Skill repositories:",
    installOverviewNoSkills: "(none selected)",
    installOverviewScope: "Installation scope:",
    installOverviewEstimated: "Estimated time:",
    installOverviewTime: "2-5 minutes (depends on network speed)",
    // Progress step strings
    progressPrepareDir: "Prepare global skills directory",
    progressNpmInstall: "Install npm dependencies",
    progressSyncConfig: "Sync tool configurations",
    progressCleanupLegacy: "Clean up legacy skill files",
    progressInstallSkills: "Install global skills (may take several minutes)",
    progressSyncMeta: "Sync Meta_Kim global capabilities",
    refreshGlobalCapabilityInventory:
      "Refreshing Meta_Kim global capability inventory...",
    globalCapabilityInventoryRefreshed:
      "Meta_Kim global capability inventory refreshed",
    globalCapabilityInventoryFailed:
      "Global capability discovery failed; run `npm run discover:global` after setup/update.",
    progressValidate: "Validate installation",
    // Confirm strings
    confirmStartInstall: "Start installation?",
    footprintTitle: "Installation footprint (from previous run)",
    footprintFirstInstall:
      "First install on this machine — no previous footprint recorded.",
    footprintRefreshNote: "Running install will refresh these entries.",
    footprintScopeGlobal: "Global",
    footprintScopeProject: "Project",
    footprintEntries: "entries",
    footprintCategoryLabels: {
      A: "Global runtime skills",
      B: "Global runtime hooks",
      C: "Global settings.json merges",
      D: "Project runtime skills",
      E: "Project runtime hooks",
      F: "Project runtime agents",
      G: "Project settings + MCP config",
      H: "Project local state (.meta-kim/)",
      I: "Shared dependencies (pip / git hooks)",
    },
    installCancelled: "Installation cancelled",
    installComplete: "Installation complete!",
    // Warning messages
    warnConfigSyncFailed: `
⚠ Config sync failed, continuing...

Possible causes:
1. File locked → Close IDE/Explorer on the target directory
2. Permission denied → Run as administrator
3. Git conflict → Resolve conflicts in canonical/ and retry

→ Fix: Run: node scripts/sync-runtimes.mjs --scope project
`,
    warnSkillsInstallFailed: `
⚠ Global skills install failed

Possible causes:
1. Directory locked (EBUSY) → Close Explorer/IDE, wait for antivirus, then retry
2. Network error → Check proxy settings with: node setup.mjs --prompt-proxy
3. Repo not found → Verify the skill repository URL is correct

→ Fix: Run: node setup.mjs --update
→ Hint: If EBUSY, close programs holding the skills folder, then manually delete any *.staged-* temp dirs.
`,
    warnMetaTheorySyncFailed: `
⚠ meta-theory sync failed

Possible causes:
1. Directory locked → Close programs holding ~/.claude/skills/
2. Permission denied → Check write permissions on global skills dir
3. Network error → Verify proxy settings

→ Fix: Run: node scripts/sync-global-meta-theory.mjs --targets claude
`,
    warnSkillsUpdateFailed: `
⚠ Global skills update failed

Possible causes:
1. Directory locked (EBUSY) → Close Explorer/IDE, wait for antivirus, then retry
2. Git fetch failed → Check network/proxy connection
3. Conflicts → Review staged files and resolve manually

→ Hint: If EBUSY, close programs holding the skills folder, then manually delete any *.staged-* temp dirs.
→ Fix: Run: node setup.mjs --update
`,
    warnSkillsUpdateFailedHint:
      "If the log shows EBUSY or 'resource busy', close Explorer/IDE on the skills folder, wait for antivirus/indexing to finish, then retry. You can delete leftover *.staged-* dirs manually once nothing holds the path.",
    warnMetaTheoryUpdateFailed: `
⚠ meta-theory sync failed

Possible causes:
1. Directory locked → Close programs holding ~/.claude/skills/
2. Permission denied → Check write permissions on global skills dir
3. Network error → Verify proxy settings

→ Fix: Run: node scripts/sync-global-meta-theory.mjs --targets claude
`,
    warnManifestLoadFail: (msg) => `Failed to load skills manifest: ${msg}`,
    labelOptional: "(optional)",
    selectedScope: (name) => `Selected: ${name}`,
    npmVerOk: (v) => `npm v${v}`,
    activeRuntimesSavedCli: (list) =>
      `Target tools saved from --targets: ${list}`,
    savedActiveTargets: (list) => `Saved target tools: ${list}`,
    okRepoSynced: "Repo projections synced from canonical/",
    failRepoSync:
      "Repo projection sync failed — some in-repo configs may be stale",
    pipErrorDetail: (err) => `  pip error: ${err}`,
    modeInfoLine: (mode, plat, ver) => `Mode: ${mode} | ${plat} | Node ${ver}`,
    stepLabel: (n, label) => `Step ${n}: ${label}`,
    // Proxy
    proxyHeading: "Network / Proxy",
    proxyDetectedPrompt: (port, url) =>
      `Detected proxy port ${port} (${url}). Use it?`,
    proxySkip: "No proxy — using direct connection",
    proxySkipDeclined: "Proxy declined — using direct connection",
    proxySaved: (url) => `Proxy saved: ${url}`,
    stepLabel: (n, label) => `Step ${n}: ${label}`,
    progressInstallPython: "Install Python graphify tool",
    progressInstallMcpMemory: "Configure Meta_Kim cross-session memory (optional)",
    checkTargets: (active, supported) =>
      `activeTargets=${active} supportedTargets=${supported}`,
    localStateHeader: "Local state",
    localStateProfile: (profile, key) => `profile=${profile} key=${key}`,
    localStateRunIndex: (path) => `run index: ${path}`,
    localStateCompaction: (path) => `compaction: ${path}`,
    localStateDispatch:
      "dispatch envelope: config/contracts/workflow-contract.json -> protocols.dispatchEnvelopePacket",
    localStateMigration:
      "migration helper: npm run migrate:meta-kim -- <source-dir> --apply",
    actionPrompt: "What would you like to do?",
    actionInstall: "Install — Full first-time setup",
    actionInstallQuick: "Quick setup — Pick one platform, ready to use",
    actionUpdate: "Update — Refresh skills & sync tools",
    actionCheck: "Check — Verify dependencies & sync status",
    actionExit: "Exit",

    npxQuickHeading: "Quick Setup",
    npxQuickPlatformPrompt: "Which platform do you use?",
    npxQuickPlatformClaude: "Claude Code",
    npxQuickPlatformOpenclaw: "OpenClaw",
    npxQuickPlatformCodex: "Codex CLI",
    npxQuickPlatformCursor: "Cursor",
    npxQuickPlatformAll: "All platforms",
    npxQuickDirPrompt: "Where should I prepare the project directory?",
    npxQuickDirDefault: "~/Desktop/Meta_Kim",
    npxQuickCreating: "Preparing project directory:",
    npxQuickCopyFiles: "Copying project-level runtime files",
    npxQuickDirExists: "Directory already exists; files inside will be updated",
    npxQuickDone: "Project-level files ready!",
    npxQuickPostCopyScript:
      "Project graph/state outputs are generated in that project by the global Meta_Kim initializer.",
    npxQuickOpenIn: "Open your platform in this directory:",
    npxQuickAskDeploy:
      "Export project-level runtime files to another directory? You can copy that directory into existing projects.",
    npxQuickDeployYes: "Select directory",
    npxQuickDeployNo: "Skip",
    projectDeployDirPrompt: "Project directories:",
    projectDeployAsk: "Project directory updates",
    projectDeployProtectionNote:
      "Existing local settings and MCP/hook configs are preserved and merged; only selected directories are touched.",
    projectDeployInteractiveHint:
      "Set up a saved project list once, then update every saved project together on future runs.",
    projectDeployPathEntryHint:
      "Enter all project roots in one line, separated by semicolons or commas. Example: D:/Project/a; D:/Project/b",
    projectDeploySavedPathHint: (path) =>
      `Saved in ${path}; next time choose the saved-directory option or run with --all-projects.`,
    projectDeployCliSaveHint:
      "Add --save-project-dirs to remember these CLI targets, then use --all-projects next time.",
    projectDeploySavedListHeading: (n) => `Saved project directories (${n}):`,
    projectDeployParsedTargets: (n) =>
      `Read ${n} project director${n === 1 ? "y" : "ies"}:`,
    projectDeployNoDirsEntered: "No project directories entered; skipping project export.",
    projectDeployConfirmSaveAndUpdate: (n) =>
      `Save and update ${n} project director${n === 1 ? "y" : "ies"}?`,
    projectDeployConfirmUpdateOnce: (n) =>
      `Update ${n} project director${n === 1 ? "y" : "ies"} for this run?`,
    projectDeployUseSaved: (n) => `Update all saved project directories (${n})`,
    projectDeploySelectOnce: "Update a one-time project directory list",
    projectDeploySelectAndRemember:
      "Add or change saved project directories, then update them",
    projectCleanupUseSaved: (n) =>
      `Clean redundant Meta_Kim assets from all saved project directories (${n})`,
    projectCleanupSelectOnce:
      "Clean redundant Meta_Kim assets from a one-time project directory list",
    projectCleanupSelectAndRemember:
      "Add or change saved project directories, then clean redundant Meta_Kim assets",
    projectDeployCliTargets: (n) =>
      `Using ${n} project directory target(s) from CLI`,
    projectDeploySavedTargets: (n) =>
      `Saved ${n} project directory target(s) for future updates`,
    projectDeployNoSaved:
      "No saved project directories found; skipping project export.",
    projectDeployBatchHeading: (n) =>
      `Updating project-level runtime files in ${n} project director${n === 1 ? "y" : "ies"}`,
    projectDeploySummary: "Project directory update summary",
    projectDeployStatusOk: "updated",
    projectDeployStatusFailed: "failed",
    projectDeployFailed: (dir, msg) => `Failed to update ${dir}: ${msg}`,
    projectDeployMoreTargets: (n) =>
      `Also updated ${n} more project director${n === 1 ? "y" : "ies"}.`,
    aboutAuthor: "About the Author",
    contactWebsite: "Website",
    contactGithub: "GitHub",
    contactFeishu: "Feishu Wiki",
    contactWechat: "WeChat Official Account",
  },
  "zh-CN": {
    modeCheck: "仅检查",
    modeUpdate: "更新",
    modeSilent: "静默",
    modeInteractive: "交互式",
    preflightHeading: "环境检查",
    nodeOld: (v) => `Node.js v${v} 版本过低，需要 >=${MIN_NODE_VERSION}`,
    nodeOk: (v) => `Node.js v${v}`,
    npmNotFound: "npm 未找到",
    gitNotFound: "git 未找到 — 安装技能需要 git",
    proxyInfo: (p) => `代理: ${p}`,
    pkgFound: "package.json 已找到",
    pkgNotFound: "package.json 未找到 — 请在 Meta_Kim 根目录运行",
    envFailed: "环境检查未通过，请先解决上述问题。",
    envOk: "环境检查通过！",
    stepRuntime: "检测 AI 编程工具",
    claudeDetected: (v) => `Claude Code ${v}`,
    claudeNotDetected: "未检测到 Claude Code CLI",
    codexDetected: (v) => `Codex ${v}`,
    codexNotDetected: "未检测到 Codex CLI（可选）",
    openclawDetected: (v) => `OpenClaw ${v}`,
    openclawNotDetected: "未检测到 OpenClaw CLI（可选）",
    cursorDetected: (v) => `Cursor ${v}`,
    cursorNotDetected: "未检测到 Cursor CLI（可选）",
    noRuntime: "未检测到 AI 编程工具。",
    noRuntimeHint1: "Meta_Kim 支持 Claude Code、Codex、OpenClaw 或 Cursor。",
    noRuntimeHint2: "至少安装一个：{claudeCodeDocs}",
    continueAnyway: "仍然继续安装？",
    setupCancelled: "安装已取消。请先安装 AI 编程工具。",
    stepConfig: "项目配置",
    mcpExists: ".mcp.json 已配置",
    mcpCreated: ".mcp.json 已创建 — 已注册 MCP 服务",
    settingsExists: ".claude/settings.json 已配置",
    askCreateSettings: "创建 .claude/settings.json（含 hooks 配置）？",
    settingsCreated: ".claude/settings.json 已创建 — hooks 和权限已注册",
    settingsSkipped: ".claude/settings.json 已跳过（用户选择）",
    settingsSkippedNoClaude:
      ".claude/settings.json 已跳过（未检测到 Claude Code）",
    stepSkills: "安装技能",
    shipsSkills: (n) => `Meta_Kim 内置 ${n} 个技能：`,
    runningNpm: "正在运行 npm install ...",
    npmDone: "npm 依赖安装完成",
    npmFailed: `
✗ npm install 失败

可能原因：
1. 网络错误 → 检查网络连接和代理设置
2. Node 版本不兼容 → 确保已安装 Node ${MIN_NODE_VERSION}+
3. 权限问题 → 运行：npm install --no-optional

修复：手动运行命令查看完整输出：npm install
`,
    nodeModulesExist: "node_modules 已存在（使用 --update 重新安装）",
    skillUpdated: (n) => `${n} — 已更新`,
    skillInstalled: (n) => `${n} — 已安装`,
    skillExists: (n) => `${n} — 已安装`,
    skillSubdirInstalled: (n, s) => `${n} — 已安装 (子目录: ${s})`,
    skillFailed: (n, r) => `
✗ 技能安装失败：${n}

可能原因：
1. 网络超时 → 运行：npm run meta:sync
2. 权限被拒绝 → 使用 sudo/管理员权限运行
3. 仓库未找到 → 检查技能仓库 URL

${r ? `原始错误：${r}` : ""}
`,
    skillUpdateFailed: (n) =>
      `${n} — 更新跳过（非 fast-forward，保留现有版本）`,
    skillSubdirNotFound: (n) => `${n} — 子目录未找到`,
    skillsReady: (ok, total, fail) =>
      `${ok}/${total} 个技能就绪${fail > 0 ? `，${fail} 个失败` : ""}`,
    stepValidate: "项目验证",
    agentPrompts: (n) => `${n} 个 meta-agent 提示词`,
    validationPassed: "项目验证通过",
    validationWarnings: "验证有警告（不影响使用）",
    setupComplete: "安装完成！",
    whatMetaDoes: "Meta_Kim 是什么：",
    whatMetaDoesDesc1: "给你的 AI 编程助手配上一支专家团队：",
    whatMetaDoesDesc2: "有人负责代码审查，有人负责安全，有人负责记忆——",
    whatMetaDoesDesc3: "全部自动协调，无需手动管理。",
    howToUse: "如何使用：",
    step1Open: "在此目录打开 Claude Code：",
    step2Try: "试试 meta-theory 命令：",
    step3Or: "或直接让 Claude 做复杂任务：",
    step3Hint: "（Meta_Kim 会自动协调各专家）",
    codexNote: "Codex 提示词同步到 .codex/",
    openclawNote: "OpenClaw 工作区同步到 openclaw/",
    cursorNote: "Cursor 智能体同步到 .cursor/",
    noRuntimeGetStarted: "未检测到 AI 编程工具。安装 Claude Code 开始使用：",
    usefulCommands: "常用命令：",
    cmdUpdate: "更新所有技能",
    cmdCheck: "检查环境",
    cmdDoctor: "诊断 Meta_Kim 健康状态",
    cmdVerify: "完整验证",
    cmdDiscover: "扫描全局能力（agents/skills）",
    // 安装后注意事项
    postInstallNotesHeading: "安装后注意事项：",
    postInstallNotesIntro: "安装完成后，各层能力的使用方式如下：",
    postInstallNotesPlatformSync: "各平台能力同步情况：",
    platformClauleCode: "Claude Code",
    platformClauleCodeCap: "agents + skills + hooks",
    platformCodex: "Codex",
    platformCodexCap: "agents + skills",
    platformOpenClaw: "OpenClaw",
    platformOpenClawCap: "workspace + skills",
    platformCursor: "Cursor",
    platformCursorCap: "agents + skills",
    postInstallNotesLayerActivation: "三层记忆激活方式：",
    layer1Label: "第一层（Memory）",
    layer1Note: "自动激活——内置于 Claude Code",
    layer2Label: "第二层（Graphify）",
    layer2Note: "安装 graphifyy 后自动激活（pip install graphifyy）",
    layer3Label: "第三层（SQL / MCP Memory Service）",
    layer3Note:
      "需手动启动服务器：memory server --http（然后访问 http://localhost:8000）",
    installLocationsHeading: "安装位置：",
    installLocationsProject: "项目级（当前目录）",
    installLocationsGlobal: "全局级（跨项目共享）",
    installLocationsManifest: "安装清单（可安全卸载）",
    usefulCommandsHeading: "常用后续命令：",
    cmdWhereStatus: "查看所有产物位置",
    cmdWhereStatusDiff: "对比上次安装",
    cmdWhereUninstall: "安全卸载",
    postInstallNotesReminder: "提醒：",
    postInstallNotesReminderText:
      "随时可运行 node setup.mjs --check 验证安装状态。",
    setupError: "安装出错：",
    setupInterrupted:
      "已中断（Ctrl+C），安装未完成。需要时请重新运行：node setup.mjs",
    selectLang: "Select language / 选择语言 / 言語を選択 / 언어 선택",
    choose: (n) => `选择 (1-${n})`,
    inquirerSingleHotkeys: "↑↓ 移动选项 · ⏎ 确认",
    inquirerMultiHotkeys: "↑↓ 移动 · 空格 勾选/取消 · ⏎ 确认 · a 全选 · i 反选",
    globalInstallPrompt:
      "Meta_Kim 技能安装到 ~/.claude/skills/（全局）。是否全局安装？",
    globalDirReady: (p) => `全局技能目录就绪：${p}`,
    globalDirCreated: (p) => `已创建全局技能目录：${p}`,
    globalDirCreateFailed: (e) => `创建全局技能目录失败：${e}`,
    globalDirTitle: "全局技能目录",
    globalDirPrompt: `Meta_Kim 技能将安装到 ~/.claude/skills/
• 全局安装 — 所有项目共享
• 跳过 — 仅在当前项目使用
• 随时可重新运行 setup.mjs 安装`,
    globalSkipped: "全局安装已跳过 — 将仅在当前项目使用",
    // 安装范围选择
    installScopeHeading: "安装范围",
    installScopePrompt: "安装全局通用能力，还是批量更新项目目录？",
    installScopeProject:
      "当前项目 — 仅项目专用定制",
    installScopeGlobal:
      "全局 — 按各 runtime 支持安装 agents、Commands、MCP、hooks、skills 等通用能力",
    installScopeProjectLabel: "批量项目更新",
    installScopeGlobalLabel: "全局通用能力（推荐）",
    installScopeProjectDesc: "进入批量项目目录更新；不安装全局通用能力。",
    installScopeProjectDescDetail: `选择要更新的项目目录：
• 会进入项目目录选择/保存目录流程
• 使用 merge 更新项目上下文/配置/状态
• 只在项目确实需要定制时保留项目级 agents、Commands、hooks、MCP 或 skills
• 不安装或更新全局通用能力`,
    installScopeGlobalDesc:
      "自动安装/更新全局通用能力；可选清理项目内冗余资产。",
    installScopeGlobalDescDetail: `创建全局级功能：
• agents / Commands / MCP / hooks / skills — 在所选 runtime 支持的官方全局/用户目录中安装
• 安装后会询问是否清理项目内冗余 Meta_Kim 项目级资产
• 清理只删除 manifest 能证明由 Meta_Kim 生成的旧项目级文件，并清空空目录`,
    askProjectRedundantCleanup:
      "是否帮助清理项目内冗余的 Meta_Kim 项目级资产？\n全局通用能力会安装到各 runtime 的全局目录。\n清理只会删除 manifest 能证明由 Meta_Kim 生成的旧 agents、skills、Commands、hooks 等，并清空空目录。",
    projectCleanupAsk: "选择要清理的项目目录",
    projectCleanupProtectionNote:
      "仅清理模式：只删除 manifest 能证明由 Meta_Kim 生成的项目级运行时资产；保留用户文件、凭据和配置 merge 文件。",
    projectCleanupHookConfigStripped: (files) =>
      `已从 merge 配置移除 Meta_Kim 项目级 hook 引用：${files.join("、")}`,
    projectCleanupBatchHeading: (n) =>
      `正在清理 ${n} 个项目目录内冗余的 Meta_Kim 项目级资产`,
    projectCleanupSummary: "项目目录清理结果",
    // 目录结构说明
    directoryExplanationHeading: "目录结构",
    directoryExplanationIntro: "Meta_Kim 创建两级目录：",
    directoryExplanationProject: "项目级（本仓库内）：",
    directoryExplanationProjectDetail: `• graphify-out/ — 从代码构建的知识图谱
  通过实际代码结构 grounding 查询，减少 AI 幻觉

• .meta-kim/state/ — 运行缓存与会话恢复
  存储运行历史、压缩会话、支持跨会话恢复

• .claude/.codex/.cursor/openclaw/ — 各工具的项目上下文/配置/覆盖层
  可复用 agents、Commands、MCP、hooks、skills 默认留在全局，除非项目需要定制版本`,
    directoryExplanationGlobal: "全局级（用户目录内）：",
    directoryExplanationGlobalDetail: `• ~/.claude/skills/ — 所有项目共享的技能
  一次安装，处处可发现。项目文件只在确认需要定制/状态记录时写入。

• ~/%tool%/skills/ — 各工具专用技能
  Claude: ~/.claude/skills/
  Codex: ~/.codex/skills/
  Cursor: ~/.cursor/skills/
  OpenClaw: ~/.openclaw/skills/`,
    directoryExplanationExisting: "现有项目使用方式：",
    depCheckHeading: "依赖检查",
    depOk: (n) => `${n} — 正常`,
    depMissing: (n) => `${n} — 缺失`,
    depNoFiles: (n) => `${n} — 目录存在但无 .md 文件`,
    selectRuntimeTargets: "这台电脑上用哪些 AI 编程工具？",
    selectSkillDependencies: "要安装哪些第三方技能仓库到全局 ~/.*/skills/？",
    inputTargetsHint: (d) => `输入编号，逗号多选；回车使用默认 ${d}`,
    inputSkillIdsHint: (d) => `输入编号，逗号多选；回车使用默认 ${d}`,
    warnUnknownSkillId: (id) => `未知的技能 id（已忽略）：${id}`,
    depSummaryAll: "全部 9 个依赖验证通过",
    depSummarySome: (ok, total) =>
      `仅 ${ok}/${total} 个依赖验证通过 — 请使用 --update 重新安装`,
    syncHeading: "同步状态检查",
    syncClaudeAgents: (n) => `Claude Code 智能体: ${n}/${META_AGENTS.length} .md 文件`,
    syncClaudeSkills: "Claude Code 技能/meta-theory/SKILL.md",
    syncClaudeHooks: (n) => `Claude Code 钩子: ${n} 个脚本`,
    syncClaudeProjectHooksMigrated:
      "Claude Code 项目级 hooks 已迁移到全局；不再要求仓库内 .claude/hooks",
    syncClaudeSettings: "Claude Code .claude/settings.json",
    syncClaudeMcp: "Claude Code .mcp.json",
    syncCodexAgents: (n, total = META_AGENTS.length) =>
      `Codex 智能体: ${n}/${total} .toml 文件`,
    syncCodexSkills: "Codex .agents/skills/meta-theory/SKILL.md",
    syncCodexSkillsGlobal:
      "Codex 项目技能镜像：.agents/skills/meta-theory/SKILL.md",
    syncOpenclawWorkspaces: (n) =>
      `OpenClaw 工作区：${n}/${META_AGENTS.length} 个智能体，各目录 9 个必备 Markdown 已齐（含 BOOT、SOUL 等；不含子文件夹里的额外文件）`,
    syncOpenclawSkill: "OpenClaw 共享 meta-theory",
    syncSharedSkills: "共享技能/meta-theory/SKILL.md",
    syncCursorAgents: (n) => `Cursor 智能体: ${n}/${META_AGENTS.length} .md 文件`,
    syncCursorSkills: "Cursor 技能/meta-theory/SKILL.md",
    syncCursorMcp: "Cursor .cursor/mcp.json",
    mcpRuntimeProjectOnly: (p) =>
      `${p} 包含 meta-kim-runtime，但这里的脚本路径不可用。这个 MCP 只给 Meta_Kim 源仓库使用；复制到普通项目时请删除 meta-kim-runtime 这一块。Agent 仍会从 .claude/.codex/.cursor/openclaw 文件加载。`,
    syncOk: "所有同步目标验证通过",
    syncMissing: (p) => `缺失：${p}`,
    syncPartial: (label, got, need) => `${label}：实际 ${got}，需要 ${need}`,
    stepPythonTools: "可选 Python 工具",
    pythonNotFound: "未检测到 Python 3.10+ — 跳过 graphify",
    pythonHint:
      "安装 Python 3.10+ 后运行：pip install graphifyy && python -m graphify claude install",
    pythonNotFoundOfferInstall: "未检测到 Python 3.10+，是否要自动下载安装？",
    pythonInstalling: "正在下载安装 Python 3.10+...",
    pythonInstallSuccess: "Python 3.10+ 安装成功",
    pythonInstallFailed: (err) =>
      `Python 安装失败：${err} — 可手动从 https://www.python.org/downloads/ 下载安装`,
    pythonInstallNotSupported: (platform) =>
      `${platform} 平台暂不支持自动安装，请从 https://www.python.org/downloads/ 手动下载 Python 3.10+`,
    pythonInstallWinget: "正在通过 winget 安装 Python...",
    pythonInstallWingetHint:
      "winget 正在下载安装 Python — 可能需要几分钟，请耐心等待...",
    pythonInstallScoop: "正在通过 scoop 安装 Python...",
    graphifyCheck: (v) => `graphify ${v}`,
    graphifyInstalling: "正在安装 graphify（代码知识图谱）...",
    graphifyInstalled: "graphify 已安装，Claude 技能已注册",
    graphifyUpgrading: "正在升级 graphify 至最新版本...",
    graphifyUpgraded: (v) => `graphify 已升级至 ${v}`,
    graphifyUpgradeFailed: `graphify 升级失败（不影响其他功能）`,
    graphifyInstallFailed: `
✗ graphify 安装失败（不影响其他功能）

可能原因：
1. Python 未找到 → 确保 Python 3.10+ 已安装并在 PATH 中
2. pip 错误 → 运行：pip install graphifyy 查看详细错误
3. 网络错误 → 检查网络/代理连接

修复：pip install graphifyy && python -m graphify claude install
`,
    graphifyAlreadyInstalled: (v) => `graphify ${v} — 已安装`,
    graphifySkillRegistering: (p) => `正在注册 graphify ${p} 技能...`,
    graphifySkillRegistered: (p) => `graphify ${p} 技能已注册`,
    graphifySkillFailed: (p) => `graphify ${p} 技能注册失败（不影响其他功能）`,
    graphifySkillSkippedGuideExists: (p) =>
      `跳过 graphify ${p} install（指南中已有 Graphify 章节）`,
    graphifyCodeGraphGenerated: "graphify 代码图谱已生成",
    graphifyCodeGraphGenerationFailed:
      "graphify 代码图谱生成失败（不影响其他功能）",
    networkxCheck: (v) => `networkx ${v}`,
    networkxUpgrading: "正在升级 networkx 至 >=3.4 以兼容 graphify...",
    networkxUpgraded: (v) => `networkx 已升级至 ${v}`,
    networkxUpgradeFailed: "networkx 升级失败（graphify 可能无法正确生成图谱）",
    networkxAlreadyOk: (v) => `networkx ${v} — 版本兼容`,
    graphifyHookInstalling:
      "正在安装 git hook（commit/checkout 时自动重建图谱）...",
    graphifyHookInstalled:
      "graphify git hook 已安装（commit/checkout 时自动重建图谱）",
    graphifyHookFailed: "graphify git hook 安装失败（不影响其他功能）",
    graphifyProjectWiringSkipped:
      "Graphify 已全局安装。在项目目录内跑 `npm run meta:graphify:rebuild`（或 `python -m graphify update .`）生成该项目的知识图谱。",
    stepMcpMemory: "Meta_Kim 跨会话记忆",
    mcpMemoryInstalling: "正在安装 MCP Memory Service（第三层）...",
    mcpMemoryInstalled: "MCP Memory Service 已安装",
    mcpMemoryInstallFailed: "MCP Memory Service 安装失败（不影响其他功能）",
    mcpMemoryAlreadyInstalled: (v) => `MCP Memory Service ${v} — 已安装`,
    mcpMemoryStopping: "升级前正在停止 MCP Memory Service...",
    mcpMemoryStopped: "MCP Memory Service 已停止",
    mcpMemoryUpgrading: "正在升级 MCP Memory Service 至最新版本...",
    mcpMemoryUpgraded: (v) => `MCP Memory Service 已升级至 ${v}`,
    mcpMemoryUpgradeFailed: "MCP Memory Service 升级失败（不影响其他功能）",
    mcpMemoryServerRegistered: "MCP Memory Service 已注册到 .mcp.json",
    mcpMemoryServerExists: ".mcp.json 已包含 MCP Memory Service",
    askMcpMemoryInstall:
      "启用 Meta_Kim 跨会话记忆？会使用 MCP Memory Service；若未安装则安装，并完成注册和后台启动。",
    mcpMemorySkipped: "MCP Memory Service 已跳过",
    mcpMemoryServerStartHint:
      "MCP Memory Service 已安装——HTTP 服务启动方式：MCP_ALLOW_ANONYMOUS_ACCESS=true memory server --http",
    mcpMemoryHookInstalling:
      "正在安装 Claude Code、Codex、Cursor、OpenClaw 的 MCP Memory 钩子...",
    mcpMemoryHookInstalled: "MCP Memory 运行时钩子已安装",
    mcpMemoryHookWarnings:
      "钩子安装产生警告（不影响后续流程）——以下是子进程 stderr 原文：",
    mcpMemoryAutoStarting: "正在启动 MCP Memory Service（HTTP 后台模式）...",
    mcpMemoryAutoStarted: "MCP Memory Service 已运行于 http://localhost:8000",
    mcpMemoryAutoStartUnverified:
      "MCP Memory Service 进程正在运行，继续安装",
    mcpMemoryAutoStartFailed: "自动启动失败——请手动启动：",
    mcpMemoryAutoStartManual:
      "  MCP_ALLOW_ANONYMOUS_ACCESS=true memory server --http",
    mcpMemoryAutoStartBoot: "已配置开机自启",
    mcpMemoryAutoStartFailureTitle: "Meta_Kim MCP Memory Service",
    mcpMemoryAutoStartFailureMessage:
      "Meta_Kim MCP Memory Service 启动失败，或未在 http://127.0.0.1:8000 变为 healthy。跨会话记忆可能不可用。请手动启动：MCP_ALLOW_ANONYMOUS_ACCESS=true memory server --http",
    updateHeading: "更新模式",
    updateNpm: "正在重新安装 npm 依赖...",
    updateSkills: "正在更新所有技能...",
    updateSyncProjectFiles: "正在从 canonical/ 同步本仓库内的工具配置...",
    updateSyncDone: "同步完成",
    updateSyncSkip: "未同步或同步失败",
    updateReGlobal: "是否重新选择全局技能目录？",
    askReselectRuntimes: "重新选择这台电脑的 AI 编程工具？",
    askPythonToolsUpdate: "安装 Python graphify（代码知识图谱）？",
    pythonToolsSkipped: "Python 工具已跳过",
    askGlobalSkillsUpdate: "更新全局技能？（可选）",
    updateSkillsDone: "全局技能已更新",
    globalSkillsSkipped: "全局技能已跳过",
    askMetaTheoryUpdate:
      "把 Meta_Kim 全局治理层同步到已选平台，供各项目复用？包含 agents、skills、MCP、Commands、hooks 等；实际支持项会自动检查后同步。（推荐）",
    updateMetaTheoryDone: "Meta_Kim 全局能力已同步",
    metaTheorySkipped: "Meta_Kim 全局能力同步已跳过",
    globalHooksMigrationHeading:
      "自托管 hook 迁移检查（~/.claude/hooks/meta-kim/）",
    globalHooksMigrationFound: (n) =>
      `发现 ${n} 个不再匹配 canonical 白名单的 Meta_Kim 管理 hook 文件。`,
    globalHooksMigrationListed: (files) =>
      `将删除的文件：\n${files.map((f) => `  - ${f}`).join("\n")}`,
    globalHooksMigrationKept: (files) =>
      `用户自建文件（保留）：\n${files.map((f) => `  - ${f}`).join("\n")}`,
    globalHooksMigrationConfirm: (n) =>
      `删除 ${n} 个 Meta_Kim 管理 hook 文件并备份？(y/N)`,
    globalHooksMigrationBackedUp: (dir) => `已备份到：${dir}`,
    globalHooksMigrationDone: (n) =>
      `已删除 ${n} 个 Meta_Kim 管理 hook 文件；全局 sync 步骤会重新安装。`,
    globalHooksMigrationSkipped:
      "用户已跳过；全局 hooks 重装可能失败，请手动删除。",
    globalHooksMigrationNoChange:
      "全局 hooks 目录干净，无需迁移。",
    projectHooksMigrationHeading: (platform) =>
      `[${platform}] 正在删除 Meta_Kim 项目级 hook 文件`,
    projectHooksMigrationRemoved: (platform, count, dir) =>
      `[${platform}] 已删除 ${count} 个 Meta_Kim 文件：${dir}`,
    projectHooksMigrationKept: (platform, files) =>
      `[${platform}] 用户自建 hook 文件（保留）：${
        files.length > 0 ? files.join("、") : "（无）"
      }`,
    projectHooksMigrationNoChange: (platform, dir) =>
      `[${platform}] ${dir} 干净，无需处理。`,
    projectAssetsCleanupIntro:
      "Meta_Kim 正转为全局通用能力：项目级保留显式项目投影、本项目定制内容、状态和缓存。",
    projectAssetsCleanupScope:
      "本次只清理 project-bootstrap manifest 能证明由 Meta_Kim 生成、且当前计划不再管理的项目级能力资产；用户文件、凭据和配置 merge 文件会保留。",
    projectAssetsRetargetCleanupIntro:
      "项目级目标已按本次选择重新计算：正在移除上次 manifest 中属于未选平台的旧 Meta_Kim 项目资产。",
    projectAssetsRetargetCleanupScope:
      "这是项目目录更新的一部分，只清理 manifest 能证明由 Meta_Kim 生成、且不属于本次目标选择的项目级资产；用户文件、凭据和配置 merge 文件会保留。",
    projectAssetsCleanupRemoved: (count, rows) =>
      `已清理 ${count} 个旧项目级资产，并清空空目录：\n${rows.map((row) => `  - ${row}`).join("\n")}`,
    projectAssetsCleanupAllClean:
      "全类型干净（agents/skills/commands/capability-index/hooks）：删除 0",
    projectAssetsCleanupSkipped: (count) =>
      `有 ${count} 条 manifest 记录不满足安全删除条件，已跳过。`,
    updateComplete: "更新完成！",
    // 安装概览字符串
    installOverviewTitle: "Meta_Kim 安装概览",
    installOverviewWill: "此过程将：",
    installOverviewSyncConfig:
      "同步配置文件 (canonical → .claude/.codex/openclaw/.cursor/)",
    installOverviewInstallSkills: "安装所选全局技能仓库（~/.claude/skills/）",
    installOverviewSyncMeta: "同步 Meta_Kim 可复用能力到全局目录",
    installOverviewOptionalPython: "可选：安装 Python graphify 工具",
    installOverviewTargets: "目标工具：",
    installOverviewSkillList: "技能仓库：",
    installOverviewNoSkills: "（未选择）",
    installOverviewScope: "安装范围：",
    installOverviewEstimated: "预计用时：",
    installOverviewTime: "2-5 分钟（取决于网络速度）",
    // 进度步骤字符串
    progressPrepareDir: "准备全局技能目录",
    progressNpmInstall: "安装 npm 依赖",
    progressSyncConfig: "同步配置文件",
    progressCleanupLegacy: "清理旧版技能文件",
    progressInstallSkills: "安装全局技能（可能需要几分钟）",
    progressSyncMeta: "同步 Meta_Kim 全局能力",
    refreshGlobalCapabilityInventory:
      "正在刷新 Meta_Kim 全局能力清单...",
    globalCapabilityInventoryRefreshed:
      "Meta_Kim 全局能力清单已刷新",
    globalCapabilityInventoryFailed:
      "全局能力发现失败；请在安装/更新后运行 `npm run discover:global`。",
    progressValidate: "验证安装",
    // 确认字符串
    confirmStartInstall: "开始安装？",
    footprintTitle: "安装足迹（上次安装记录）",
    footprintFirstInstall: "首次安装 — 无历史足迹可显示。",
    footprintRefreshNote: "本次安装将刷新上述条目。",
    footprintScopeGlobal: "全局",
    footprintScopeProject: "项目",
    footprintEntries: "条",
    footprintCategoryLabels: {
      A: "全局运行时技能",
      B: "全局运行时钩子",
      C: "全局 settings.json 合并",
      D: "项目运行时技能",
      E: "项目运行时钩子",
      F: "项目运行时智能体",
      G: "项目 settings + MCP 配置",
      H: "项目本地状态 (.meta-kim/)",
      I: "共享依赖 (pip / git 钩子)",
    },
    installCancelled: "安装已取消",
    installComplete: "安装完成！",
    // Warning messages
    warnConfigSyncFailed: `
⚠ 配置同步失败，继续安装...

可能原因：
1. 文件被锁定 → 关闭目标目录的 IDE/资源管理器窗口
2. 权限被拒绝 → 以管理员身份运行
3. Git 冲突 → 解决 canonical/ 中的冲突后重试

修复：node scripts/sync-runtimes.mjs --scope project
`,
    warnSkillsInstallFailed: `
⚠ 全局技能安装失败

可能原因：
1. 目录被锁定（EBUSY）→ 关闭资源管理器/IDE，等待杀毒/索引完成后重试
2. 网络错误 → 使用 node setup.mjs --prompt-proxy 检查代理设置
3. 仓库未找到 → 验证技能仓库 URL 是否正确

修复：node setup.mjs --update
提示：如遇 EBUSY，先关闭占用 skills 目录的程序，然后手动删除残留的 *.staged-* 临时目录。
`,
    warnMetaTheorySyncFailed: `
⚠ meta-theory 同步失败

可能原因：
1. 目录被锁定 → 关闭占用 ~/.claude/skills/ 的程序
2. 权限被拒绝 → 检查全局技能目录的写入权限
3. 网络错误 → 验证代理设置

修复：node scripts/sync-global-meta-theory.mjs --targets claude
`,
    warnSkillsUpdateFailed: `
⚠ 全局技能更新失败

可能原因：
1. 目录被锁定（EBUSY）→ 关闭资源管理器/IDE，等待杀毒/索引完成后重试
2. Git fetch 失败 → 检查网络/代理连接
3. 冲突 → 查看 staged 文件并手动解决

提示：如遇 EBUSY，先关闭占用 skills 目录的程序，然后手动删除残留的 *.staged-* 临时目录。
修复：node setup.mjs --update
`,
    warnSkillsUpdateFailedHint:
      "若日志含 EBUSY/目录被占用：请先关闭对该目录的资源管理器窗口与 IDE 监视、等待杀毒/索引结束后再重试；解锁后可手动删除残留的 *.staged-* 临时目录。",
    warnMetaTheoryUpdateFailed: `
⚠ meta-theory 同步失败

可能原因：
1. 目录被锁定 → 关闭占用 ~/.claude/skills/ 的程序
2. 权限被拒绝 → 检查全局技能目录的写入权限
3. 网络错误 → 验证代理设置

修复：node scripts/sync-global-meta-theory.mjs --targets claude
`,
    warnManifestLoadFail: (msg) => `加载技能清单失败：${msg}`,
    labelOptional: "（可选）",
    selectedScope: (name) => `已选择：${name}`,
    npmVerOk: (v) => `npm v${v}`,
    activeRuntimesSavedCli: (list) => `已从 --targets 保存目标工具：${list}`,
    savedActiveTargets: (list) => `已保存目标工具：${list}`,
    okRepoSynced: "仓库投影已从 canonical/ 同步",
    failRepoSync: "仓库投影同步失败 — 本仓库内部分配置可能已过期",
    pipErrorDetail: (err) => `  pip 错误：${err}`,
    modeInfoLine: (mode, plat, ver) => `模式：${mode} | ${plat} | Node ${ver}`,
    stepLabel: (n, label) => `步骤 ${n}：${label}`,
    // Proxy
    proxyHeading: "网络 / 代理",
    proxyDetectedPrompt: (port, url) =>
      `检测到代理端口 ${port}（${url}），是否使用？`,
    proxySkip: "未检测到代理 — 直连",
    proxySkipDeclined: "已拒绝代理 — 直连",
    proxySaved: (url) => `已保存代理：${url}`,
    stepLabel: (n, label) => `步骤 ${n}：${label}`,
    progressInstallPython: "安装 Python graphify 工具",
    progressInstallMcpMemory: "配置 Meta_Kim 跨会话记忆（可选）",
    checkTargets: (active, supported) =>
      `activeTargets=${active} supportedTargets=${supported}`,
    localStateHeader: "本地状态",
    localStateProfile: (profile, key) => `profile=${profile} key=${key}`,
    localStateRunIndex: (path) => `运行索引：${path}`,
    localStateCompaction: (path) => `压缩目录：${path}`,
    localStateDispatch:
      "调度信封：config/contracts/workflow-contract.json -> protocols.dispatchEnvelopePacket",
    localStateMigration:
      "迁移助手：npm run migrate:meta-kim -- <source-dir> --apply",
    actionPrompt: "你想做什么？",
    actionInstall: "安装 — 首次完整安装",
    actionInstallQuick: "快速配置 — 选一个平台，开箱即用",
    actionUpdate: "更新 — 刷新技能并同步配置",
    actionCheck: "检查 — 验证依赖和同步状态",
    actionExit: "退出",

    npxQuickHeading: "快速配置",
    npxQuickPlatformPrompt: "你用哪个平台？",
    npxQuickPlatformClaude: "Claude Code",
    npxQuickPlatformOpenclaw: "OpenClaw",
    npxQuickPlatformCodex: "Codex CLI",
    npxQuickPlatformCursor: "Cursor",
    npxQuickPlatformAll: "全部平台",
    npxQuickDirPrompt: "项目级目录放在哪里？",
    npxQuickDirDefault: "~/Desktop/Meta_Kim",
    npxQuickCreating: "正在准备项目级目录：",
    npxQuickCopyFiles: "正在复制项目级运行时文件",
    npxQuickDirExists: "目录已存在，将更新其中的文件",
    npxQuickDone: "项目级文件已就绪！",
    npxQuickPostCopyScript:
      "项目 graph/state 结果由全局 Meta_Kim 初始化器在该项目目录内生成。",
    npxQuickOpenIn: "在该目录打开你的平台：",
    npxQuickAskDeploy: "是否将项目级运行时文件导出到另一个目录？可把该目录复制到现有项目中。",
    npxQuickDeployYes: "选择目录",
    npxQuickDeployNo: "跳过",
    projectDeployDirPrompt: "项目目录：",
    projectDeployAsk: "项目目录更新",
    projectDeployProtectionNote:
      "已有本地 settings、MCP 和 hook 配置会保留并合并；只会更新你选择的目录。",
    projectDeployInteractiveHint:
      "先配置一次常用项目目录，后续更新时可一次更新所有已保存项目。",
    projectDeployPathEntryHint:
      "请在一行里输入所有项目根目录，多个目录用分号或逗号隔开。示例：D:/Project/a; D:/Project/b",
    projectDeploySavedPathHint: (path) =>
      `已保存到 ${path}；下次可选择已保存目录，或用 --all-projects 一次更新。`,
    projectDeployCliSaveHint:
      "加上 --save-project-dirs 可记住这些命令行目录，下次用 --all-projects 复用。",
    projectDeploySavedListHeading: (n) => `已保存的项目目录（${n} 个）：`,
    projectDeployParsedTargets: (n) => `已读取 ${n} 个项目目录：`,
    projectDeployNoDirsEntered: "没有输入项目目录，跳过项目级导出。",
    projectDeployConfirmSaveAndUpdate: (n) => `保存并立即更新这 ${n} 个项目目录？`,
    projectDeployConfirmUpdateOnce: (n) => `仅本次更新这 ${n} 个项目目录？`,
    projectDeployUseSaved: (n) => `更新全部已保存项目目录（${n} 个）`,
    projectDeploySelectOnce: "仅本次更新指定项目目录",
    projectDeploySelectAndRemember: "添加或修改已保存项目目录，并立即更新",
    projectCleanupUseSaved: (n) =>
      `清理全部已保存项目目录中的冗余 Meta_Kim 资产（${n} 个）`,
    projectCleanupSelectOnce: "仅本次清理指定项目目录",
    projectCleanupSelectAndRemember:
      "添加或修改已保存项目目录，并立即清理冗余 Meta_Kim 资产",
    projectDeployCliTargets: (n) => `使用命令行传入的 ${n} 个项目目录`,
    projectDeploySavedTargets: (n) => `已保存 ${n} 个项目目录，后续更新可复用`,
    projectDeployNoSaved: "没有已保存的项目目录，跳过项目级导出。",
    projectDeployBatchHeading: (n) => `正在更新 ${n} 个项目目录的项目级运行时文件`,
    projectDeploySummary: "项目目录更新结果",
    projectDeployStatusOk: "已更新",
    projectDeployStatusFailed: "失败",
    projectDeployFailed: (dir, msg) => `更新 ${dir} 失败：${msg}`,
    projectDeployMoreTargets: (n) => `另外 ${n} 个项目目录也已更新。`,
    aboutAuthor: "关于作者",
    contactWebsite: "个人主页",
    contactGithub: "GitHub",
    contactFeishu: "飞书开源知识库",
    contactWechat: "微信公众号",
  },
  "ja-JP": {
    modeCheck: "チェックのみ",
    modeUpdate: "更新",
    modeSilent: "サイレント",
    modeInteractive: "インタラクティブ",
    preflightHeading: "環境チェック",
    nodeOld: (v) =>
      `Node.js v${v} は古すぎます。>=${MIN_NODE_VERSION} が必要です`,
    nodeOk: (v) => `Node.js v${v}`,
    npmNotFound: "npm が見つかりません",
    gitNotFound: "git が見つかりません — スキルのインストールに必要です",
    proxyInfo: (p) => `プロキシ: ${p}`,
    pkgFound: "package.json が見つかりました",
    pkgNotFound:
      "package.json が見つかりません — Meta_Kim ルートで実行してください",
    envFailed: "環境チェックに失敗しました。上記の問題を解決してください。",
    envOk: "環境チェックOK！",
    stepRuntime: "AIコーディングツール検出",
    claudeDetected: (v) => `Claude Code ${v}`,
    claudeNotDetected: "Claude Code CLI が検出されませんでした",
    codexDetected: (v) => `Codex ${v}`,
    codexNotDetected: "Codex CLI が検出されませんでした（オプション）",
    openclawDetected: (v) => `OpenClaw ${v}`,
    openclawNotDetected: "OpenClaw CLI が検出されませんでした（オプション）",
    cursorDetected: (v) => `Cursor ${v}`,
    cursorNotDetected: "Cursor CLI が検出されませんでした（オプション）",
    noRuntime: "AIコーディングツールが検出されませんでした。",
    noRuntimeHint1:
      "Meta_Kim は Claude Code、Codex、OpenClaw、または Cursor で動作します。",
    noRuntimeHint2: "少なくとも1つインストールしてください：{claudeCodeDocs}",
    continueAnyway: "セットアップを続行しますか？",
    setupCancelled:
      "セットアップがキャンセルされました。AIコーディングツールをインストールして再実行してください。",
    stepConfig: "プロジェクト設定",
    mcpExists: ".mcp.json は既に設定されています",
    mcpCreated: ".mcp.json 作成済み — MCP サービスを登録",
    settingsExists: ".claude/settings.json は既に設定されています",
    askCreateSettings: ".claude/settings.json（hooks付き）を作成しますか？",
    settingsCreated:
      ".claude/settings.json 作成済み — hooks + パーミッション登録完了",
    settingsSkipped: ".claude/settings.json スキップ（ユーザー選択）",
    settingsSkippedNoClaude:
      ".claude/settings.json スキップ（Claude Code 未検出）",
    stepSkills: "スキルインストール",
    shipsSkills: (n) => `Meta_Kim には ${n} 個のスキルが含まれています：`,
    runningNpm: "npm install を実行中...",
    npmDone: "npm 依存関係のインストール完了",
    npmFailed: `
✗ npm install に失敗しました

考えられる原因：
1. ネットワークエラー → インターネット接続とプロキシ設定を確認
2. Node バージョンが不一致 → Node ${MIN_NODE_VERSION}+ がインストールされていることを確認
3. 権限の問題 → 実行：npm install --no-optional

修正：手動で実行して詳細を確認：npm install
`,
    nodeModulesExist: "node_modules が存在します（--update で再インストール）",
    skillUpdated: (n) => `${n} — 更新済み`,
    skillInstalled: (n) => `${n} — インストール済み`,
    skillExists: (n) => `${n} — インストール済み`,
    skillSubdirInstalled: (n, s) =>
      `${n} — インストール済み (サブディレクトリ: ${s})`,
    skillFailed: (n, r) => `
✗ スキルインストール失敗：${n}

考えられる原因：
1. ネットワークタイムアウト → 実行：npm run meta:sync
2. 権限が拒否されました → sudo/管理者権限で実行
3. リポジトリが見つかりません → スキルリポジトリの URL を確認

${r ? `生エラー：${r}` : ""}
`,
    skillUpdateFailed: (n) =>
      `${n} — 更新スキップ（非 fast-forward、既存版を維持）`,
    skillSubdirNotFound: (n) => `${n} — サブディレクトリが見つかりません`,
    skillsReady: (ok, total, fail) =>
      `${ok}/${total} スキル準備完了${fail > 0 ? `、${fail} 失敗` : ""}`,
    stepValidate: "プロジェクト検証",
    agentPrompts: (n) => `${n} 個のメタエージェントプロンプト`,
    validationPassed: "プロジェクト検証に合格しました",
    validationWarnings: "検証に警告があります（機能に影響なし）",
    setupComplete: "セットアップ完了！",
    whatMetaDoes: "Meta_Kim とは：",
    whatMetaDoesDesc1: "AIコーディングエージェントに専門家チームを提供します：",
    whatMetaDoesDesc2: "コードレビュー、セキュリティ、メモリ管理などを",
    whatMetaDoesDesc3: "自動的に調整します。",
    howToUse: "使い方：",
    step1Open: "このディレクトリで Claude Code を開く：",
    step2Try: "meta-theory コマンドを試す：",
    step3Or: "または Claude に複雑なタスクを依頼する：",
    step3Hint: "（Meta_Kim が自動的に専門家を調整します）",
    codexNote: "Codex プロンプトは .codex/ に同期されます",
    openclawNote: "OpenClaw ワークスペースは openclaw/ に同期されます",
    cursorNote: "Cursor エージェントは .cursor/ に同期されます",
    noRuntimeGetStarted:
      "AIコーディングツールが検出されませんでした。Claude Code をインストールしてください：",
    usefulCommands: "便利なコマンド：",
    cmdUpdate: "すべてのスキルを更新",
    cmdCheck: "環境をチェック",
    cmdDoctor: "Meta_Kim の健全性を診断",
    cmdVerify: "フル検証",
    cmdDiscover: "グローバル機能をスキャン（agents/skills）",
    // インストール後の注意事項
    postInstallNotesHeading: "インストール後の注意事項：",
    postInstallNotesIntro: "インストール完了後、各層の使い方は以下の通りです：",
    postInstallNotesPlatformSync: "各プラットフォームの同期状況：",
    platformClauleCode: "Claude Code",
    platformClauleCodeCap: "agents + skills + hooks",
    platformCodex: "Codex",
    platformCodexCap: "agents + skills",
    platformOpenClaw: "OpenClaw",
    platformOpenClawCap: "workspace + skills",
    platformCursor: "Cursor",
    platformCursorCap: "agents + skills",
    postInstallNotesLayerActivation: "3層メモリの有効化方法：",
    layer1Label: "第1層（Memory）",
    layer1Note: "自動有効 — Claude Code に組み込み済み",
    layer2Label: "第2層（Graphify）",
    layer2Note: "graphifyy インストール後は自動有効（pip install graphifyy）",
    layer3Label: "第3層（SQL / MCP Memory Service）",
    layer3Note:
      "サーバー手動起動が必要：memory server --http（次に http://localhost:8000 にアクセス）",
    installLocationsHeading: "インストール先：",
    installLocationsProject: "プロジェクトレベル（このディレクトリ）",
    installLocationsGlobal: "グローバルレベル（プロジェクト間で共有）",
    installLocationsManifest:
      "インストールマニフェスト（安全にアンインストール可能）",
    usefulCommandsHeading: "次によく使うコマンド：",
    cmdWhereStatus: "すべての成果物の場所を表示",
    cmdWhereStatusDiff: "前回のインストールとの差分",
    cmdWhereUninstall: "安全にアンインストール",
    postInstallNotesReminder: "補足：",
    postInstallNotesReminderText:
      "node setup.mjs --check でいつでも導入状態を確認できます。",
    setupError: "セットアップエラー：",
    setupInterrupted:
      "中断しました（Ctrl+C）。未完了です。再開するときは node setup.mjs を実行してください。",
    selectLang: "Select language / 选择语言 / 言語を選択 / 언어 선택",
    choose: (n) => `選択 (1-${n})`,
    inquirerSingleHotkeys: "↑↓ 移動 · ⏎ 確定",
    inquirerMultiHotkeys: "↑↓ 移動 · Space 切替 · ⏎ 確定 · a 全選択 · i 反転",
    globalInstallPrompt:
      "Meta_Kim スキルは ~/.claude/skills/（グローバル）にインストールされます。グローバルインストールしますか？",
    globalDirReady: (p) => `グローバルスキルディレクトリ準備完了：${p}`,
    globalDirCreated: (p) => `グローバルスキルディレクトリ作成：${p}`,
    globalDirCreateFailed: (e) =>
      `グローバルスキルディレクトリの作成に失敗：${e}`,
    globalDirTitle: "グローバルスキルディレクトリ",
    globalDirPrompt: `Meta_Kim スキルは ~/.claude/skills/ にインストールされます
• グローバルインストール — すべてのプロジェクトで共有
• スキップ — このプロジェクトのみ
• いつでも setup.mjs を再実行してインストール`,
    globalSkipped:
      "グローバルインストールスキップ — プロジェクトローカルのみ使用",
    // インストール範囲選択
    installScopeHeading: "インストール範囲",
    installScopePrompt: "再利用グローバル能力をインストールしますか、プロジェクトディレクトリを一括更新しますか？",
    installScopeProject:
      "プロジェクトディレクトリ — 明示的なプロジェクト runtime 更新",
    installScopeGlobal:
      "グローバル — runtime が対応する agents、Commands、MCP、hooks、skills の再利用能力",
    installScopeProjectLabel: "プロジェクトディレクトリ更新",
    installScopeGlobalLabel: "グローバル能力（推奨）",
    installScopeProjectDesc:
      "選択したプロジェクトディレクトリを一括更新。再利用グローバル能力はインストールしない。",
    installScopeProjectDescDetail: `選択したプロジェクトディレクトリを更新：
• Project context/config — AGENTS.md/CLAUDE.md managed block と MCP/settings の add-only merge
• Project runtime projection — 明示選択した target の agents、Commands、hooks、MCP、skills、rules/workspaces
• Project overrides — プロジェクト専用カスタムが必要な場合はローカルに保持
• graphify-out/ — 知識グラフ（幻覚低減、クエリ高速化）
• .meta-kim/state/ と .meta-kim/backups/ — state、manifest、cache、backup、rollback`,
    installScopeGlobalDesc:
      "再利用 runtime 能力をインストール。プロジェクトローカルファイルはカスタム時のみ作成。",
    installScopeGlobalDescDetail: `グローバルレベル機能を作成：
• agents / Commands / MCP / hooks / skills — 選択 runtime の公式グローバル/ユーザー場所へインストール
• 各プロジェクトは、専用拡張が証明されない限りグローバル能力を直接再利用
• 他プロジェクトはまず discovery/dry-run；カスタム/bootstrap 確認後のみローカルファイルを書く`,
    askProjectRedundantCleanup:
      "プロジェクト内の冗長な Meta_Kim プロジェクトレベル資産を整理しますか？\nグローバル能力は runtime のグローバルディレクトリに置かれます。\nmanifest で Meta_Kim 生成と確認できる古い agents、skills、Commands、hooks などと空ディレクトリだけを削除します。",
    projectCleanupAsk: "整理するプロジェクトディレクトリ",
    projectCleanupProtectionNote:
      "整理専用モード：manifest で Meta_Kim 生成と確認できるプロジェクトレベル runtime 資産だけを削除します。ユーザーファイル、認証情報、merge 対象設定は保持します。",
    projectCleanupHookConfigStripped: (files) =>
      `merge config から Meta_Kim プロジェクト hook 参照を削除しました：${files.join("、")}`,
    projectCleanupBatchHeading: (n) =>
      `${n} 個のプロジェクトディレクトリで冗長な Meta_Kim プロジェクトレベル資産を整理中`,
    projectCleanupSummary: "プロジェクトディレクトリ整理結果",
    // ディレクトリ構造説明
    directoryExplanationHeading: "ディレクトリ構造",
    directoryExplanationIntro: "Meta_Kim は 2 つのレベルのディレクトリを作成：",
    directoryExplanationProject: "プロジェクトレベル（このリポ内）：",
    directoryExplanationProjectDetail: `• graphify-out/ — コードから構築された知識グラフ
  実際のコードベース構造に基づいたクエリで AI 幻覚を低減

• .meta-kim/state/ — 実行キャッシュとセッション回復
  実行履歴、セッション圧縮、クロスセッション回復を保存

• .claude/.codex/.cursor/openclaw/ — 各ツールのプロジェクト context/config/override
  再利用 agents、Commands、MCP、hooks、skills は、プロジェクト専用版が必要な場合以外はグローバル`,
    directoryExplanationGlobal: "グローバルレベル（ホームディレクトリ内）：",
    directoryExplanationGlobalDetail: `• ~/.claude/skills/ — 全プロジェクト共有スキル
  一度のインストールでどこでも発見可能。プロジェクトファイルは確認済みカスタム/state の場合のみ書く。

• ~/%tool%/skills/ — 各ツール専用スキル
  Claude: ~/.claude/skills/
  Codex: ~/.codex/skills/
  Cursor: ~/.cursor/skills/
  OpenClaw: ~/.openclaw/skills/`,
    directoryExplanationExisting: "既存プロジェクトの場合：",
    depCheckHeading: "依存関係チェック",
    depOk: (n) => `${n} — OK`,
    depMissing: (n) => `${n} — 見つかりません`,
    depNoFiles: (n) => `${n} — ディレクトリはありますが.mdファイルがありません`,
    selectRuntimeTargets: "このパソコンで使うAIコーディングツールを選択",
    selectSkillDependencies:
      "グローバル ~/.*/skills/ に入れるサードパーティスキルリポジトリを選んでください",
    inputTargetsHint: (d) =>
      `番号を入力、カンマで複数選択；Enterでデフォルト ${d}`,
    inputSkillIdsHint: (d) =>
      `番号を入力、カンマで複数選択；Enterでデフォルト ${d}`,
    warnUnknownSkillId: (id) => `不明なスキル ID（無視）: ${id}`,
    depSummaryAll: "9つの依存関係すべて検証済み",
    depSummarySome: (ok, total) =>
      `${ok}/${total} の依存関係のみ検証 — --update で再インストールしてください`,
    syncHeading: "同期状態チェック",
    syncClaudeAgents: (n) => `Claude Code エージェント: ${n}/${META_AGENTS.length} .md ファイル`,
    syncClaudeSkills: "Claude Code スキル/meta-theory/SKILL.md",
    syncClaudeHooks: (n) => `Claude Code フック: ${n} スクリプト`,
    syncClaudeProjectHooksMigrated:
      "Claude Code プロジェクト hooks はグローバルへ移行済みです。repo 内 .claude/hooks は不要です",
    syncClaudeSettings: "Claude Code .claude/settings.json",
    syncClaudeMcp: "Claude Code .mcp.json",
    syncCodexAgents: (n, total = META_AGENTS.length) =>
      `Codex エージェント: ${n}/${total} .toml ファイル`,
    syncCodexSkills: "Codex .agents/skills/meta-theory/SKILL.md",
    syncCodexSkillsGlobal:
      "Codex プロジェクトスキルミラー：.agents/skills/meta-theory/SKILL.md",
    syncOpenclawWorkspaces: (n) =>
      `OpenClaw ワークスペース: ${n}/${META_AGENTS.length} エージェント — 各フォルダに必須の .md 9 件（BOOT、SOUL など）`,
    syncOpenclawSkill: "OpenClaw 共有 meta-theory",
    syncSharedSkills: "共有スキル/meta-theory/SKILL.md",
    syncCursorAgents: (n) => `Cursor エージェント: ${n}/${META_AGENTS.length} .md ファイル`,
    syncCursorSkills: "Cursor スキル/meta-theory/SKILL.md",
    syncCursorMcp: "Cursor .cursor/mcp.json",
    mcpRuntimeProjectOnly: (p) =>
      `${p} に meta-kim-runtime がありますが、この場所ではスクリプトパスを使用できません。この MCP は Meta_Kim ソースリポジトリ専用です。コピー先プロジェクトでは meta-kim-runtime ブロックを削除してください。Agents は .claude/.codex/.cursor/openclaw ファイルから引き続き読み込まれます。`,
    syncOk: "すべての同期ターゲット検証済み",
    syncMissing: (p) => `不足：${p}`,
    syncPartial: (label, got, need) => `${label}：実際 ${got}、必要 ${need}`,
    stepPythonTools: "オプション Python ツール",
    pythonNotFound: "Python 3.10+ が見つかりません — graphify をスキップ",
    pythonHint:
      "Python 3.10+ をインストール後：pip install graphifyy && python -m graphify claude install",
    pythonNotFoundOfferInstall:
      "Python 3.10+ が見つかりません。自動ダウンロード・インストールしますか？",
    pythonInstalling: "Python 3.10+ をダウンロード・インストール中...",
    pythonInstallSuccess: "Python 3.10+ のインストールに成功しました",
    pythonInstallFailed: (err) =>
      `Python のインストールに失敗しました：${err} — https://www.python.org/downloads/ から手動でインストールしてください`,
    pythonInstallNotSupported: (platform) =>
      `${platform} では自動インストールがサポートされていません。https://www.python.org/downloads/ から手動でインストールしてください`,
    pythonInstallWinget: "winget で Python をインストール中...",
    pythonInstallWingetHint:
      "winget で Python をダウンロード・インストール中 — 数分かかる場合があります、お待ちください...",
    pythonInstallScoop: "scoop で Python をインストール中...",
    graphifyCheck: (v) => `graphify ${v}`,
    graphifyInstalling: "graphify をインストール中（コードナレッジグラフ）...",
    graphifyInstalled: "graphify インストール完了、Claude スキル登録済み",
    graphifyUpgrading: "graphify を最新バージョンにアップグレード中...",
    graphifyUpgraded: (v) => `graphify を ${v} にアップグレードしました`,
    graphifyUpgradeFailed: `graphify アップグレード失敗（非ブロッキング）`,
    graphifyInstallFailed: `
✗ graphify インストール失敗（非ブロッキング）

考えられる原因：
1. Python が見つかりません → Python 3.10+ がインストールされ PATH に含まれていることを確認
2. pip エラー → 実行：pip install graphifyy で詳細を確認
3. ネットワークエラー → ネットワーク/プロキシ接続を確認

修正：pip install graphifyy && python -m graphify claude install
`,
    graphifyAlreadyInstalled: (v) => `graphify ${v} — インストール済み`,
    graphifySkillRegistering: (p) => `graphify ${p} スキルを登録中...`,
    graphifySkillRegistered: (p) => `graphify ${p} スキル登録済み`,
    graphifySkillFailed: (p) =>
      `graphify ${p} スキル登録失敗（非ブロッキング）`,
    graphifySkillSkippedGuideExists: (p) =>
      `graphify ${p} install をスキップ（ガイドに Graphify セクションが既にあります）`,
    graphifyCodeGraphGenerated: "graphify コードグラフ生成済み",
    graphifyCodeGraphGenerationFailed:
      "graphify コードグラフ生成失敗（非ブロッキング）",
    networkxCheck: (v) => `networkx ${v}`,
    networkxUpgrading: "graphify互換のためnetworkxを>=3.4にアップグレード中...",
    networkxUpgraded: (v) => `networkxを${v}にアップグレードしました`,
    networkxUpgradeFailed:
      "networkxのアップグレードに失敗（グラフ生成が正しく動作しない可能性）",
    networkxAlreadyOk: (v) => `networkx ${v} — 互換性あり`,
    graphifyHookInstalling:
      "git hookをインストール中（commit/checkout時にグラフ自動再構築）...",
    graphifyHookInstalled:
      "graphify git hookインストール完了（commit/checkout時に自動再構築）",
    graphifyHookFailed: "graphify git hookインストール失敗（非ブロッキング）",
    projectAssetsCleanupAllClean:
      "全タイプ綺麗（agents/skills/commands/capability-index/hooks）：削除 0",
    graphifyProjectWiringSkipped:
      "Graphify はグローバルにインストール済み。プロジェクト内で `npm run meta:graphify:rebuild`（または `python -m graphify update .`）を実行してナレッジグラフを構築してください。",
    stepMcpMemory: "Meta_Kim クロスセッション記憶",
    mcpMemoryInstalling: "MCP Memory Service（第三層）をインストール中...",
    mcpMemoryInstalled: "MCP Memory Service がインストールされました",
    mcpMemoryInstallFailed:
      "MCP Memory Service インストール失敗（非ブロッキング）",
    mcpMemoryAlreadyInstalled: (v) =>
      `MCP Memory Service ${v} — すでにインストール済み`,
    mcpMemoryStopping: "アップグレード前に MCP Memory Service を停止中...",
    mcpMemoryStopped: "MCP Memory Service を停止しました",
    mcpMemoryUpgrading:
      "MCP Memory Service を最新バージョンにアップグレード中...",
    mcpMemoryUpgraded: (v) =>
      `MCP Memory Service を ${v} にアップグレードしました`,
    mcpMemoryUpgradeFailed:
      "MCP Memory Service アップグレード失敗（非ブロッキング）",
    mcpMemoryServerRegistered:
      "MCP Memory Service が .mcp.json に登録されました",
    mcpMemoryServerExists:
      ".mcp.json にはすでに MCP Memory Service があります",
    askMcpMemoryInstall:
      "Meta_Kim のクロスセッション記憶を有効にしますか？MCP Memory Service を使用し、未インストールならインストールして登録・バックグラウンド起動します。",
    mcpMemorySkipped: "MCP Memory Service をスキップしました",
    mcpMemoryServerStartHint:
      "MCP Memory Service がインストールされました——HTTP サービスの起動方法：MCP_ALLOW_ANONYMOUS_ACCESS=true memory server --http",
    mcpMemoryHookInstalling:
      "Claude Code、Codex、Cursor、OpenClaw の MCP Memory フックをインストール中...",
    mcpMemoryHookInstalled: "MCP Memory ランタイムフックをインストールしました",
    mcpMemoryHookWarnings:
      "フックのインストール中に警告が発生しました（非ブロッキング）——子プロセスの stderr を以下に表示します:",
    mcpMemoryAutoStarting:
      "MCP Memory Service（HTTP バックグラウンド）を起動中...",
    mcpMemoryAutoStarted:
      "MCP Memory Service が http://localhost:8000 で実行中",
    mcpMemoryAutoStartUnverified:
      "MCP Memory Service プロセスは実行中です。インストールを続行します",
    mcpMemoryAutoStartFailed: "自動起動に失敗——手動で起動してください：",
    mcpMemoryAutoStartManual:
      "  MCP_ALLOW_ANONYMOUS_ACCESS=true memory server --http",
    mcpMemoryAutoStartBoot: "起動時自動開始を設定しました",
    mcpMemoryAutoStartFailureTitle: "Meta_Kim MCP Memory Service",
    mcpMemoryAutoStartFailureMessage:
      "Meta_Kim MCP Memory Service の起動に失敗したか、http://127.0.0.1:8000 が healthy になりませんでした。クロスセッションメモリが利用できない可能性があります。手動で起動してください: MCP_ALLOW_ANONYMOUS_ACCESS=true memory server --http",
    updateHeading: "アップデートモード",
    updateNpm: "npm依存関係を再インストール中...",
    updateSkills: "すべてのスキルを更新中...",
    updateSyncProjectFiles: "canonical/ からリポ内のツール設定を同期中...",
    updateSyncDone: "同期が完了しました",
    updateSyncSkip: "同期をスキップしたか失敗しました",
    updateReGlobal: "グローバルスキルディレクトリを再選択しますか？",
    askReselectRuntimes:
      "このパソコンで使うAIコーディングツールを再選択しますか？",
    askPythonToolsUpdate:
      "Python graphify（コードナレッジグラフ）をインストールしますか？",
    pythonToolsSkipped: "Python ツールをスキップしました",
    askGlobalSkillsUpdate: "グローバルスキルを更新しますか？（オプション）",
    updateSkillsDone: "グローバルスキルが更新されました",
    globalSkillsSkipped: "グローバルスキルをスキップしました",
    askMetaTheoryUpdate:
      "選択した runtime に Meta_Kim グローバル治理レイヤーを同期し、各プロジェクトで再利用しますか？agents、skills、MCP、Commands、hooks などを含み、対応項目は自動確認されます。（推奨）",
    updateMetaTheoryDone: "Meta_Kim グローバル能力を同期しました",
    metaTheorySkipped: "Meta_Kim グローバル能力同期をスキップしました",
    globalHooksMigrationHeading:
      "セルフホスト hook 移行チェック（~/.claude/hooks/meta-kim/）",
    globalHooksMigrationFound: (n) =>
      `canonical ホワイトリストに一致しない Meta_Kim 管理 hook ファイルを ${n} 件検出しました。`,
    globalHooksMigrationListed: (files) =>
      `削除対象ファイル：\n${files.map((f) => `  - ${f}`).join("\n")}`,
    globalHooksMigrationKept: (files) =>
      `ユーザー作成ファイル（保持）：\n${files.map((f) => `  - ${f}`).join("\n")}`,
    globalHooksMigrationConfirm: (n) =>
      `${n} 件の Meta_Kim 管理 hook ファイルを削除してバックアップしますか？（y/N）`,
    globalHooksMigrationBackedUp: (dir) => `バックアップ先：${dir}`,
    globalHooksMigrationDone: (n) =>
      `${n} 件の Meta_Kim 管理 hook ファイルを削除しました。グローバル sync ステップで再インストールされます。`,
    globalHooksMigrationSkipped:
      "ユーザーがスキップしました。手動で削除するまでグローバル hooks 再インストールは失敗する可能性があります。",
    globalHooksMigrationNoChange:
      "グローバル hooks ディレクトリは綺麗です。移行は不要です。",
    projectHooksMigrationHeading: (platform) =>
      `[${platform}] Meta_Kim 管理のプロジェクトレベル hook ファイルを削除中`,
    projectHooksMigrationRemoved: (platform, count, dir) =>
      `[${platform}] ${count} 個の Meta_Kim 管理ファイルを削除しました：${dir}`,
    projectHooksMigrationKept: (platform, files) =>
      `[${platform}] ユーザー作成の hook ファイル（保持）：${
        files.length > 0 ? files.join("、") : "（なし）"
      }`,
    projectHooksMigrationNoChange: (platform, dir) =>
      `[${platform}] ${dir} は綺麗です。処理は不要です。`,
    projectAssetsCleanupIntro:
      "Meta_Kim は再利用能力をグローバル runtime ディレクトリへ移行しています。プロジェクト側には明示的な project projection、専用 override、状態、キャッシュを残します。",
    projectAssetsCleanupScope:
      "このクリーンアップは project-bootstrap manifest で Meta_Kim 生成と確認でき、現在の計画で管理されないプロジェクトレベル能力資産だけを削除します。ユーザーファイル、認証情報、merge 対象の設定ファイルは保持します。",
    projectAssetsRetargetCleanupIntro:
      "プロジェクトレベルの対象 runtime が今回の選択に合わせて再計算されました。未選択 runtime の古い Meta_Kim プロジェクト資産を削除しています。",
    projectAssetsRetargetCleanupScope:
      "これはプロジェクトディレクトリ更新の一部です。manifest で Meta_Kim 生成と確認でき、今回の対象選択に含まれない資産だけを削除します。ユーザーファイル、認証情報、merge 対象の設定ファイルは保持します。",
    projectAssetsCleanupRemoved: (count, rows) =>
      `${count} 件の古いプロジェクトレベル資産を削除し、空ディレクトリを整理しました:\n${rows.map((row) => `  - ${row}`).join("\n")}`,
    projectAssetsCleanupSkipped: (count) =>
      `${count} 件の manifest エントリは安全削除条件を満たさないためスキップしました。`,
    updateComplete: "アップデート完了！",
    // インストール概要文字列
    installOverviewTitle: "Meta_Kim インストール概要",
    installOverviewWill: "このプロセスでは：",
    installOverviewSyncConfig:
      "プロジェクトディレクトリに設定を同期 (canonical → .claude/.codex/openclaw/.cursor/)",
    installOverviewInstallSkills:
      "選択したグローバルスキルリポジトリをインストール (~/.claude/skills/)",
    installOverviewSyncMeta: "Meta_Kim 再利用能力をグローバルディレクトリに同期",
    installOverviewOptionalPython: "Python graphify ツールをインストール",
    installOverviewTargets: "対象ツール：",
    installOverviewSkillList: "スキルリポジトリ：",
    installOverviewNoSkills: "（未選択）",
    installOverviewScope: "インストール範囲：",
    installOverviewEstimated: "予想時間：",
    installOverviewTime: "2-5分（ネットワーク速度によります）",
    // 進捗ステップ文字列
    progressPrepareDir: "グローバルスキルディレクトリを準備",
    progressNpmInstall: "npm依存関係をインストール",
    progressSyncConfig: "設定を同期",
    progressCleanupLegacy: "レガシースキルファイルをクリーンアップ",
    progressInstallSkills:
      "グローバルスキルをインストール（数分かかる場合があります）",
    progressSyncMeta: "Meta_Kim グローバル能力を同期",
    refreshGlobalCapabilityInventory:
      "Meta_Kim グローバル能力インベントリを更新中...",
    globalCapabilityInventoryRefreshed:
      "Meta_Kim グローバル能力インベントリを更新しました",
    globalCapabilityInventoryFailed:
      "グローバル能力 discovery に失敗しました。setup/update 後に `npm run discover:global` を実行してください。",
    progressValidate: "インストールを検証",
    // 確認文字列
    confirmStartInstall: "インストールを開始しますか？",
    footprintTitle: "インストール足跡（前回の記録）",
    footprintFirstInstall:
      "このマシンでの初回インストール — 前回の足跡はありません。",
    footprintRefreshNote: "インストール実行時に上記エントリは更新されます。",
    footprintScopeGlobal: "グローバル",
    footprintScopeProject: "プロジェクト",
    footprintEntries: "件",
    footprintCategoryLabels: {
      A: "グローバルランタイムスキル",
      B: "グローバルランタイムフック",
      C: "グローバル settings.json マージ",
      D: "プロジェクトランタイムスキル",
      E: "プロジェクトランタイムフック",
      F: "プロジェクトランタイムエージェント",
      G: "プロジェクト settings + MCP 設定",
      H: "プロジェクトローカル状態 (.meta-kim/)",
      I: "共有依存関係 (pip / git フック)",
    },
    installCancelled: "インストールがキャンセルされました",
    installComplete: "インストール完了！",
    // 警告メッセージ
    warnConfigSyncFailed: `
⚠ 設定同期失敗、続行します...

考えられる原因：
1. ファイルがロックされています → ターゲットディレクトリで IDE/エクスプローラーを閉じる
2. 権限が拒否されました → 管理者として実行
3. Git 競合 → canonical/ の競合を解決してから再試行

修正：node scripts/sync-runtimes.mjs --scope project
`,
    warnSkillsInstallFailed: `
⚠ グローバルスキルインストール失敗

考えられる原因：
1. ディレクトリがロックされています（EBUSY）→ エクスプローラー/IDE を閉じ、ウイルス対策/インデックス完了を待ってから再試行
2. ネットワークエラー → node setup.mjs --prompt-proxy でプロキシ設定を確認
3. リポジトリが見つかりません → スキルリポジトリの URL が正しいか確認

修正：node setup.mjs --update
ヒント：EBUSY の場合、スキルフォルダを使用しているプログラムを閉じてから、*.staged-* の一時ディレクトリを手動で削除してください。
`,
    warnMetaTheorySyncFailed: `
⚠ meta-theory 同期失敗

考えられる原因：
1. ディレクトリがロックされています → ~/.claude/skills/ を使用しているプログラムを閉じる
2. 権限が拒否されました → グローバルスキルディレクトリの書き込み権限を確認
3. ネットワークエラー → プロキシ設定を確認

修正：node scripts/sync-global-meta-theory.mjs --targets claude
`,
    warnSkillsUpdateFailed: `
⚠ グローバルスキル更新失敗

考えられる原因：
1. ディレクトリがロックされています（EBUSY）→ エクスプローラー/IDE を閉じ、ウイルス対策/インデックス完了を待ってから再試行
2. Git fetch に失敗しました → ネットワーク/プロキシ接続を確認
3. 競合 → ステージされたファイルを確認し、手動で解決

ヒント：EBUSY の場合、スキルフォルダを使用しているプログラムを閉じてから、*.staged-* の一時ディレクトリを手動で削除してください。
修正：node setup.mjs --update
`,
    warnSkillsUpdateFailedHint:
      "ログに EBUSY 等がある場合: スキルフォルダを開いているエクスプローラー/IDE を閉じ、ウイルス対策/インデックス完了を待って再実行。*.staged-* は解放後に手動削除可。",
    warnMetaTheoryUpdateFailed: `
⚠ meta-theory 同期失敗

考えられる原因：
1. ディレクトリがロックされています → ~/.claude/skills/ を使用しているプログラムを閉じる
2. 権限が拒否されました → グローバルスキルディレクトリの書き込み権限を確認
3. ネットワークエラー → プロキシ設定を確認

修正：node scripts/sync-global-meta-theory.mjs --targets claude
`,
    warnManifestLoadFail: (msg) => `スキルマニフェストの読み込みに失敗：${msg}`,
    labelOptional: "（オプション）",
    selectedScope: (name) => `選択済み：${name}`,
    npmVerOk: (v) => `npm v${v}`,
    activeRuntimesSavedCli: (list) => `--targets から対象ツールを保存：${list}`,
    savedActiveTargets: (list) => `対象ツールを保存：${list}`,
    okRepoSynced: "canonical/ からリポジトリプロジェクションを同期",
    failRepoSync:
      "リポジトリプロジェクション同期失敗 — リポ内の一部設定が古い可能性",
    pipErrorDetail: (err) => `  pip エラー：${err}`,
    modeInfoLine: (mode, plat, ver) =>
      `モード：${mode} | ${plat} | Node ${ver}`,
    stepLabel: (n, label) => `ステップ ${n}：${label}`,
    // Proxy
    proxyHeading: "ネットワーク / プロキシ",
    proxyDetectedPrompt: (port, url) =>
      `プロキシポート ${port}（${url}）を検出。使用しますか？`,
    proxySkip: "プロキシ未検出 — 直接接続",
    proxySkipDeclined: "プロキシ辞退 — 直接接続",
    proxySaved: (url) => `プロキシを保存：${url}`,
    stepLabel: (n, label) => `ステップ ${n}：${label}`,
    progressInstallPython: "Python graphify ツールをインストール",
    progressInstallMcpMemory: "Meta_Kim クロスセッション記憶を設定（任意）",
    checkTargets: (active, supported) =>
      `activeTargets=${active} supportedTargets=${supported}`,
    localStateHeader: "ローカル状態",
    localStateProfile: (profile, key) => `profile=${profile} key=${key}`,
    localStateRunIndex: (path) => `ランインデックス：${path}`,
    localStateCompaction: (path) => `コンパクション：${path}`,
    localStateDispatch:
      "ディスパッチエンベロープ：config/contracts/workflow-contract.json -> protocols.dispatchEnvelopePacket",
    localStateMigration:
      "マイグレーションヘルパー：npm run migrate:meta-kim -- <source-dir> --apply",
    actionPrompt: "何をしますか？",
    actionInstall: "インストール — 初回セットアップ",
    actionInstallQuick:
      "クイックセットアップ — プラットフォームを選んですぐ使う",
    actionUpdate: "アップデート — スキル更新＆設定同期",
    actionCheck: "チェック — 依存関係と同期状態を確認",
    actionExit: "終了",

    npxQuickHeading: "クイックセットアップ",
    npxQuickPlatformPrompt: "どのプラットフォームを使いますか？",
    npxQuickPlatformClaude: "Claude Code",
    npxQuickPlatformOpenclaw: "OpenClaw",
    npxQuickPlatformCodex: "Codex CLI",
    npxQuickPlatformCursor: "Cursor",
    npxQuickPlatformAll: "すべてのプラットフォーム",
    npxQuickDirPrompt: "プロジェクト用ディレクトリをどこに準備しますか？",
    npxQuickDirDefault: "~/Desktop/Meta_Kim",
    npxQuickCreating: "プロジェクト用ディレクトリを準備中：",
    npxQuickCopyFiles: "プロジェクト用ランタイムファイルをコピー中",
    npxQuickDirExists: "ディレクトリは既に存在します。中のファイルを更新します",
    npxQuickDone: "プロジェクト用ファイルの準備完了！",
    npxQuickPostCopyScript:
      "プロジェクトの graph/state 出力はグローバル Meta_Kim 初期化器がそのプロジェクト内に生成します。",
    npxQuickOpenIn: "このディレクトリでプラットフォームを開く：",
    npxQuickAskDeploy:
      "プロジェクト用ランタイムファイルを別ディレクトリに書き出しますか？そのディレクトリを既存プロジェクトへコピーできます。",
    npxQuickDeployYes: "ディレクトリを選択",
    npxQuickDeployNo: "スキップ",
    projectDeployDirPrompt: "プロジェクトディレクトリ：",
    projectDeployAsk: "プロジェクトディレクトリ更新",
    projectDeployProtectionNote:
      "既存のローカル settings、MCP、hook 設定は保持してマージします。選択したディレクトリだけを更新します。",
    projectDeployInteractiveHint:
      "プロジェクトリストを一度保存すると、以後の更新で保存済みプロジェクトをまとめて更新できます。",
    projectDeployPathEntryHint:
      "すべてのプロジェクトルートを 1 行で入力してください。複数のディレクトリはセミコロンまたはカンマで区切ります。例: D:/Project/a; D:/Project/b",
    projectDeploySavedPathHint: (path) =>
      `${path} に保存しました。次回は保存済みディレクトリを選ぶか --all-projects で更新できます。`,
    projectDeployCliSaveHint:
      "--save-project-dirs を付けると CLI で渡した対象を保存できます。次回は --all-projects を使えます。",
    projectDeploySavedListHeading: (n) => `保存済みプロジェクトディレクトリ（${n} 件）：`,
    projectDeployParsedTargets: (n) =>
      `${n} 件のプロジェクトディレクトリを読み取りました：`,
    projectDeployNoDirsEntered:
      "プロジェクトディレクトリが入力されていないため、プロジェクトエクスポートをスキップします。",
    projectDeployConfirmSaveAndUpdate: (n) =>
      `${n} 件のプロジェクトディレクトリを保存して今すぐ更新しますか？`,
    projectDeployConfirmUpdateOnce: (n) =>
      `今回だけ ${n} 件のプロジェクトディレクトリを更新しますか？`,
    projectDeployUseSaved: (n) => `保存済みプロジェクトディレクトリをすべて更新（${n} 件）`,
    projectDeploySelectOnce: "今回だけ指定したプロジェクトディレクトリを更新",
    projectDeploySelectAndRemember:
      "保存済みプロジェクトディレクトリを追加・変更し、今すぐ更新",
    projectCleanupUseSaved: (n) =>
      `保存済みプロジェクトディレクトリの冗長な Meta_Kim 資産をすべて整理（${n} 件）`,
    projectCleanupSelectOnce:
      "今回だけ指定したプロジェクトディレクトリの冗長な Meta_Kim 資産を整理",
    projectCleanupSelectAndRemember:
      "保存済みプロジェクトディレクトリを追加・変更し、冗長な Meta_Kim 資産を整理",
    projectDeployCliTargets: (n) =>
      `CLI から渡された ${n} 件のプロジェクトディレクトリを使用`,
    projectDeploySavedTargets: (n) =>
      `${n} 件のプロジェクトディレクトリを保存しました。今後の更新で再利用できます`,
    projectDeployNoSaved:
      "保存済みプロジェクトディレクトリがないため、プロジェクトエクスポートをスキップします。",
    projectDeployBatchHeading: (n) =>
      `${n} 件のプロジェクトディレクトリでプロジェクト用ランタイムファイルを更新中`,
    projectDeploySummary: "プロジェクトディレクトリ更新結果",
    projectDeployStatusOk: "更新済み",
    projectDeployStatusFailed: "失敗",
    projectDeployFailed: (dir, msg) => `${dir} の更新に失敗しました：${msg}`,
    projectDeployMoreTargets: (n) =>
      `他 ${n} 件のプロジェクトディレクトリも更新しました。`,
    aboutAuthor: "作者について",
    contactWebsite: "ウェブサイト",
    contactGithub: "GitHub",
    contactFeishu: "Feishu Wiki",
    contactWechat: "WeChat公式アカウント",
  },
  "ko-KR": {
    modeCheck: "확인만",
    modeUpdate: "업데이트",
    modeSilent: "자동",
    modeInteractive: "대화형",
    preflightHeading: "환경 확인",
    nodeOld: (v) =>
      `Node.js v${v} 버전이 너무 낮습니다. >=${MIN_NODE_VERSION} 필요`,
    nodeOk: (v) => `Node.js v${v}`,
    npmNotFound: "npm을 찾을 수 없습니다",
    gitNotFound: "git을 찾을 수 없습니다 — 스킬 설치에 필요합니다",
    proxyInfo: (p) => `프록시: ${p}`,
    pkgFound: "package.json 찾음",
    pkgNotFound:
      "package.json을 찾을 수 없습니다 — Meta_Kim 루트에서 실행하세요",
    envFailed: "환경 확인 실패. 위 문제를 먼저 해결하세요.",
    envOk: "환경 확인 통과!",
    stepRuntime: "AI 코딩 도구 감지",
    claudeDetected: (v) => `Claude Code ${v}`,
    claudeNotDetected: "Claude Code CLI 감지되지 않음",
    codexDetected: (v) => `Codex ${v}`,
    codexNotDetected: "Codex CLI 감지되지 않음 (선택)",
    openclawDetected: (v) => `OpenClaw ${v}`,
    openclawNotDetected: "OpenClaw CLI 감지되지 않음 (선택)",
    cursorDetected: (v) => `Cursor ${v}`,
    cursorNotDetected: "Cursor CLI 감지되지 않음 (선택)",
    noRuntime: "AI 코딩 도구가 감지되지 않았습니다.",
    noRuntimeHint1:
      "Meta_Kim은 Claude Code, Codex, OpenClaw 또는 Cursor에서 작동합니다.",
    noRuntimeHint2: "최소 하나를 설치하세요: {claudeCodeDocs}",
    continueAnyway: "설정을 계속 진행할까요?",
    setupCancelled:
      "설정이 취소되었습니다. AI 코딩 도구를 설치하고 다시 실행하세요.",
    stepConfig: "프로젝트 설정",
    mcpExists: ".mcp.json이 이미 구성되어 있습니다",
    mcpCreated: ".mcp.json 생성됨 — MCP 서비스 등록됨",
    settingsExists: ".claude/settings.json이 이미 구성되어 있습니다",
    askCreateSettings: "hooks가 포함된 .claude/settings.json을 생성할까요?",
    settingsCreated: ".claude/settings.json 생성됨 — hooks + 권한 등록 완료",
    settingsSkipped: ".claude/settings.json 건너뜀 (사용자 선택)",
    settingsSkippedNoClaude:
      ".claude/settings.json 건너뜀 (Claude Code 미감지)",
    stepSkills: "스킬 설치",
    shipsSkills: (n) => `Meta_Kim에는 ${n}개의 스킬이 포함되어 있습니다:`,
    runningNpm: "npm install 실행 중...",
    npmDone: "npm 의존성 설치 완료",
    npmFailed: `
✗ npm install 실패

가능한 원인：
1. 네트워크 오류 → 인터넷 연결 및 프록시 설정 확인
2. Node 버전 불일치 → Node ${MIN_NODE_VERSION}+ 가 설치되어 있는지 확인
3. 권한 문제 → 실행：npm install --no-optional

수정：수동으로 실행하여 세부 정보 확인：npm install
`,
    nodeModulesExist: "node_modules가 존재합니다 (--update로 재설치)",
    skillUpdated: (n) => `${n} — 업데이트됨`,
    skillInstalled: (n) => `${n} — 설치됨`,
    skillExists: (n) => `${n} — 이미 설치됨`,
    skillSubdirInstalled: (n, s) => `${n} — 설치됨 (하위디렉토리: ${s})`,
    skillFailed: (n, r) => `
✗ 스킬 설치 실패：${n}

가능한 원인：
1. 네트워크 타임아웃 → 실행：npm run meta:sync
2. 권한 거부 → sudo/관리자 권한으로 실행
3. 리포지토리를 찾을 수 없음 → 스킬 리포지토리 URL 확인

${r ? `원본 오류：${r}` : ""}
`,
    skillUpdateFailed: (n) =>
      `${n} — 업데이트 건너뜀（非 fast-forward, 기존 버전 유지）`,
    skillSubdirNotFound: (n) => `${n} — 하위디렉토리를 찾을 수 없음`,
    skillsReady: (ok, total, fail) =>
      `${ok}/${total} 스킬 준비 완료${fail > 0 ? `, ${fail} 실패` : ""}`,
    stepValidate: "프로젝트 검증",
    agentPrompts: (n) => `${n}개의 메타 에이전트 프롬프트`,
    validationPassed: "프로젝트 검증 통과",
    validationWarnings: "검증에 경고가 있습니다 (기능에 영향 없음)",
    setupComplete: "설정 완료!",
    whatMetaDoes: "Meta_Kim이란:",
    whatMetaDoesDesc1: "AI 코딩 에이전트에 전문가 팀을 제공합니다:",
    whatMetaDoesDesc2: "코드 리뷰, 보안, 메모리 관리 등을",
    whatMetaDoesDesc3: "자동으로 조정합니다.",
    howToUse: "사용 방법:",
    step1Open: "이 디렉토리에서 Claude Code 열기:",
    step2Try: "meta-theory 명령 시도:",
    step3Or: "또는 Claude에게 복잡한 작업 요청:",
    step3Hint: "(Meta_Kim이 자동으로 전문가를 조정합니다)",
    codexNote: "Codex 프롬프트는 .codex/에 동기화됩니다",
    openclawNote: "OpenClaw 워크스페이스는 openclaw/에 동기화됩니다",
    cursorNote: "Cursor 에이전트는 .cursor/에 동기화됩니다",
    noRuntimeGetStarted:
      "AI 코딩 도구가 감지되지 않았습니다. Claude Code를 설치하세요:",
    usefulCommands: "유용한 명령:",
    cmdUpdate: "모든 스킬 업데이트",
    cmdCheck: "환경 확인",
    cmdDoctor: "Meta_Kim 상태 진단",
    cmdVerify: "전체 검증",
    cmdDiscover: "전역 기능 스캔（agents/skills）",
    // 설치 후 주의사항
    postInstallNotesHeading: "설치 후 주의사항:",
    postInstallNotesIntro: "설치 완료 후 각 층의 사용 방식은 다음과 같습니다:",
    postInstallNotesPlatformSync: "각 플랫폼 동기화 현황:",
    platformClauleCode: "Claude Code",
    platformClauleCodeCap: "agents + skills + hooks",
    platformCodex: "Codex",
    platformCodexCap: "agents + skills",
    platformOpenClaw: "OpenClaw",
    platformOpenClawCap: "workspace + skills",
    platformCursor: "Cursor",
    platformCursorCap: "agents + skills",
    postInstallNotesLayerActivation: "3층 메모리 활성화 방식:",
    layer1Label: "제1층 (Memory)",
    layer1Note: "자동 활성화 — Claude Code에 내장됨",
    layer2Label: "제2층 (Graphify)",
    layer2Note: "graphifyy 설치 후 자동 활성화 (pip install graphifyy)",
    layer3Label: "제3층 (SQL / MCP Memory Service)",
    layer3Note:
      "서버 수동 시작 필요: memory server --http (그러면 http://localhost:8000 에 접속)",
    installLocationsHeading: "설치 위치:",
    installLocationsProject: "프로젝트 레벨 (현재 디렉터리)",
    installLocationsGlobal: "전역 레벨 (프로젝트 간 공유)",
    installLocationsManifest: "설치 매니페스트 (안전하게 제거 가능)",
    usefulCommandsHeading: "다음에 자주 사용하는 명령:",
    cmdWhereStatus: "모든 산출물 위치 확인",
    cmdWhereStatusDiff: "이전 설치와 비교",
    cmdWhereUninstall: "안전하게 제거",
    postInstallNotesReminder: "참고:",
    postInstallNotesReminderText:
      "node setup.mjs --check로 언제든지 설치 상태를 확인할 수 있습니다.",
    setupError: "설정 오류:",
    setupInterrupted:
      "중단됨(Ctrl+C). 설치가 끝나지 않았습니다. 다시 실행: node setup.mjs",
    selectLang: "Select language / 选择语言 / 言語を選択 / 언어 선택",
    choose: (n) => `선택 (1-${n})`,
    inquirerSingleHotkeys: "↑↓ 이동 · ⏎ 확인",
    inquirerMultiHotkeys:
      "↑↓ 이동 · Space 선택 토글 · ⏎ 확인 · a 전체 · i 반전",
    globalInstallPrompt:
      "Meta_Kim 스킬을 ~/.claude/skills/ (전역)에 설치합니다. 전역 설치할까요?",
    globalDirReady: (p) => `전역 스킬 디렉토리 준비됨: ${p}`,
    globalDirCreated: (p) => `전역 스킬 디렉토리 생성됨: ${p}`,
    globalDirCreateFailed: (e) => `전역 스킬 디렉토리 생성 실패：${e}`,
    globalDirTitle: "전역 스킬 디렉토리",
    globalDirPrompt: `Meta_Kim 스킬은 ~/.claude/skills/ 에 설치됩니다
• 전역 설치 — 모든 프로젝트에서 공유
• 건너뛰기 — 이 프로젝트에서만 사용
• 언제든 setup.mjs 를 다시 실행하여 설치`,
    globalSkipped: "전역 설치 건너뜀 — 프로젝트 로컬만 사용",
    // 설치 범위 선택
    installScopeHeading: "설치 범위",
    installScopePrompt: "재사용 글로벌 능력을 설치할까요, 프로젝트 디렉터리를 일괄 업데이트할까요?",
    installScopeProject:
      "프로젝트 디렉터리 — 명시적 프로젝트 runtime 업데이트",
    installScopeGlobal:
      "글로벌 — runtime 이 지원하는 agents, Commands, MCP, hooks, skills 재사용 능력",
    installScopeProjectLabel: "프로젝트 디렉터리 업데이트",
    installScopeGlobalLabel: "글로벌 능력 (권장)",
    installScopeProjectDesc:
      "선택한 프로젝트 디렉터리를 일괄 업데이트. 재사용 글로벌 능력은 설치하지 않음.",
    installScopeProjectDescDetail: `선택한 프로젝트 디렉터리 업데이트：
• Project context/config — AGENTS.md/CLAUDE.md managed block 및 MCP/settings add-only merge
• Project runtime projection — 명시 선택한 target 의 agents, Commands, hooks, MCP, skills, rules/workspaces
• Project overrides — 프로젝트 전용 커스터마이징이 필요하면 로컬에 유지
• graphify-out/ — 지식 그래프（환각 감소，쿼리 속도 향상）
• .meta-kim/state/ 및 .meta-kim/backups/ — state, manifest, cache, backup, rollback`,
    installScopeGlobalDesc:
      "재사용 runtime 능력 설치. 프로젝트 로컬 파일은 커스터마이징 때만 생성.",
    installScopeGlobalDescDetail: `글로벌 레벨 기능 생성：
• agents / Commands / MCP / hooks / skills — 선택 runtime 의 공식 글로벌/사용자 위치에 설치
• 각 프로젝트는 전용 확장이 증명되지 않는 한 글로벌 능력을 직접 재사용
• 다른 프로젝트는 discovery/dry-run 먼저；커스터마이징/bootstrap 확인 후에만 로컬 파일 작성`,
    askProjectRedundantCleanup:
      "프로젝트 안의 중복 Meta_Kim 프로젝트 레벨 자산을 정리할까요?\n글로벌 능력은 runtime 글로벌 디렉터리에 설치됩니다.\nmanifest 로 Meta_Kim 생성임이 증명된 오래된 agents, skills, Commands, hooks 등과 빈 디렉터리만 삭제합니다.",
    projectCleanupAsk: "정리할 프로젝트 디렉터리",
    projectCleanupProtectionNote:
      "정리 전용 모드: manifest 로 Meta_Kim 생성임이 증명된 프로젝트 레벨 runtime 자산만 삭제합니다. 사용자 파일, 인증 정보, merge 대상 설정은 보존합니다.",
    projectCleanupHookConfigStripped: (files) =>
      `merge config 에서 Meta_Kim 프로젝트 hook 참조를 제거했습니다: ${files.join(", ")}`,
    projectCleanupBatchHeading: (n) =>
      `${n}개 프로젝트 디렉터리의 중복 Meta_Kim 프로젝트 레벨 자산 정리 중`,
    projectCleanupSummary: "프로젝트 디렉터리 정리 결과",
    // 디렉토리 구조 설명
    directoryExplanationHeading: "디렉토리 구조",
    directoryExplanationIntro: "Meta_Kim 은 두 레벨의 디렉토리 생성：",
    directoryExplanationProject: "프로젝트 레벨（이 리포 내）：",
    directoryExplanationProjectDetail: `• graphify-out/ — 코드에서 구축된 지식 그래프
  실제 코드베이스 구조에 기반한 쿼리로 AI 환각 감소

• .meta-kim/state/ — 런타임 캐시 및 세션 복구
  실행 기록，세션 압축，크로스 세션 복구 저장

• .claude/.codex/.cursor/openclaw/ — 각 도구의 프로젝트 context/config/override
  재사용 agents, Commands, MCP, hooks, skills 는 프로젝트 전용 버전이 필요할 때 외에는 글로벌`,
    directoryExplanationGlobal: "글로벌 레벨（홈 디렉토리 내）：",
    directoryExplanationGlobalDetail: `• ~/.claude/skills/ — 모든 프로젝트 공유 스킬
  한 번 설치로 어디서든 발견 가능. 프로젝트 파일은 확인된 커스터마이징/state 일 때만 작성.

• ~/%tool%/skills/ — 각 도구 전용 스킬
  Claude: ~/.claude/skills/
  Codex: ~/.codex/skills/
  Cursor: ~/.cursor/skills/
  OpenClaw: ~/.openclaw/skills/`,
    directoryExplanationExisting: "기존 프로젝트 사용 방법：",
    depCheckHeading: "의존성 확인",
    depOk: (n) => `${n} — 정상`,
    depMissing: (n) => `${n} — 누락`,
    depNoFiles: (n) => `${n} — 디렉토리는 있으나 .md 파일 없음`,
    selectRuntimeTargets: "이 컴퓨터에서 사용할 AI 코딩 도구 선택",
    selectSkillDependencies:
      "전역 ~/.*/skills/에 설치할 서드파티 스킬 저장소를 선택하세요",
    inputTargetsHint: (d) => `번호 입력, 쉼표로 다중 선택；Enter로 기본값 ${d}`,
    inputSkillIdsHint: (d) =>
      `번호 입력, 쉼표로 다중 선택；Enter로 기본값 ${d}`,
    warnUnknownSkillId: (id) => `알 수 없는 스킬 id(무시): ${id}`,
    depSummaryAll: "9개 의존성 모두 확인 완료",
    depSummarySome: (ok, total) =>
      `${ok}/${total}개 의존성만 확인 — --update로 재설치하세요`,
    syncHeading: "동기화 상태 확인",
    syncClaudeAgents: (n) => `Claude Code 에이전트: ${n}/${META_AGENTS.length} .md 파일`,
    syncClaudeSkills: "Claude Code 스킬/meta-theory/SKILL.md",
    syncClaudeHooks: (n) => `Claude Code 훅: ${n} 스크립트`,
    syncClaudeProjectHooksMigrated:
      "Claude Code 프로젝트 hooks는 전역 hooks로 이전되었습니다. repo-local .claude/hooks는 필요하지 않습니다",
    syncClaudeSettings: "Claude Code .claude/settings.json",
    syncClaudeMcp: "Claude Code .mcp.json",
    syncCodexAgents: (n, total = META_AGENTS.length) =>
      `Codex 에이전트: ${n}/${total} .toml 파일`,
    syncCodexSkills: "Codex .agents/skills/meta-theory/SKILL.md",
    syncCodexSkillsGlobal:
      "Codex 프로젝트 스킬 미러: .agents/skills/meta-theory/SKILL.md",
    syncOpenclawWorkspaces: (n) =>
      `OpenClaw 워크스페이스: ${n}/${META_AGENTS.length} 에이전트 — 각 폴더에 필수 .md 9개(BOOT, SOUL 등)`,
    syncOpenclawSkill: "OpenClaw 공유 meta-theory",
    syncSharedSkills: "공유 스킬/meta-theory/SKILL.md",
    syncCursorAgents: (n) => `Cursor 에이전트: ${n}/${META_AGENTS.length} .md 파일`,
    syncCursorSkills: "Cursor 스킬/meta-theory/SKILL.md",
    syncCursorMcp: "Cursor .cursor/mcp.json",
    mcpRuntimeProjectOnly: (p) =>
      `${p}에 meta-kim-runtime이 있지만 이 위치에서는 스크립트 경로를 사용할 수 없습니다. 이 MCP는 Meta_Kim 소스 저장소 전용입니다. 복사한 일반 프로젝트에서는 meta-kim-runtime 블록을 삭제하세요. Agents는 계속 .claude/.codex/.cursor/openclaw 파일에서 로드됩니다.`,
    syncOk: "모든 동기화 대상 확인 완료",
    syncMissing: (p) => `누락: ${p}`,
    syncPartial: (label, got, need) => `${label}: 실제 ${got}, 필요 ${need}`,
    stepPythonTools: "선택적 Python 도구",
    pythonNotFound: "Python 3.10+ 없음 — graphify 건너뜀",
    pythonHint:
      "Python 3.10+ 설치 후: pip install graphifyy && python -m graphify claude install",
    pythonNotFoundOfferInstall:
      "Python 3.10+ 없음. 자동 다운로드 및 설치할까요?",
    pythonInstalling: "Python 3.10+ 다운로드 및 설치 중...",
    pythonInstallSuccess: "Python 3.10+ 설치 성공",
    pythonInstallFailed: (err) =>
      `Python 설치 실패: ${err} — https://www.python.org/downloads/ 에서 수동 설치 가능`,
    pythonInstallNotSupported: (platform) =>
      `${platform}은(는) 자동 설치를 지원하지 않습니다. https://www.python.org/downloads/ 에서 수동 설치하세요`,
    pythonInstallWinget: "winget으로 Python 설치 중...",
    pythonInstallWingetHint:
      "winget이 Python을 다운로드 및 설치 중입니다 — 몇 분 정도 걸릴 수 있습니다, 잠시만 기다려 주세요...",
    pythonInstallScoop: "scoop으로 Python 설치 중...",
    graphifyCheck: (v) => `graphify ${v}`,
    graphifyInstalling: "graphify 설치 중 (코드 지식 그래프)...",
    graphifyInstalled: "graphify 설치 완료, Claude 스킬 등록됨",
    graphifyUpgrading: "graphify을(를) 최신 버전으로 업그레이드 중...",
    graphifyUpgraded: (v) => `graphify이(가) ${v}(으)로 업그레이드되었습니다`,
    graphifyUpgradeFailed: `graphify 업그레이드 실패 (비차단)`,
    graphifyInstallFailed: `
✗ graphify 설치 실패 (비차단)

가능한 원인：
1. Python을 찾을 수 없음 → Python 3.10+ 가 설치되어 있고 PATH에 있는지 확인
2. pip 오류 → 실행：pip install graphifyy 로 세부 정보 확인
3. 네트워크 오류 → 네트워크/프록시 연결 확인

수정：pip install graphifyy && python -m graphify claude install
`,
    graphifyAlreadyInstalled: (v) => `graphify ${v} — 이미 설치됨`,
    graphifySkillRegistering: (p) => `graphify ${p} 스킬 등록 중...`,
    graphifySkillRegistered: (p) => `graphify ${p} 스킬 등록됨`,
    graphifySkillFailed: (p) => `graphify ${p} 스킬 등록 실패 (비차단)`,
    graphifySkillSkippedGuideExists: (p) =>
      `graphify ${p} install 건너뜀(가이드에 Graphify 섹션이 이미 있음)`,
    graphifyCodeGraphGenerated: "graphify 코드 그래프 생성됨",
    graphifyCodeGraphGenerationFailed:
      "graphify 코드 그래프 생성 실패 (비차단)",
    networkxCheck: (v) => `networkx ${v}`,
    networkxUpgrading:
      "graphify 호환성을 위해 networkx를 >=3.4로 업그레이드 중...",
    networkxUpgraded: (v) => `networkx ${v}(으)로 업그레이드 완료`,
    networkxUpgradeFailed:
      "networkx 업그레이드 실패 (그래프 생성이 올바르지 않을 수 있음)",
    networkxAlreadyOk: (v) => `networkx ${v} — 호환 가능`,
    graphifyHookInstalling:
      "git hook 설치 중 (commit/checkout 시 그래프 자동 재구축)...",
    graphifyHookInstalled:
      "graphify git hook 설치 완료 (commit/checkout 시 자동 재구축)",
    graphifyHookFailed: "graphify git hook 설치 실패 (비차단)",
    projectAssetsCleanupAllClean:
      "모든 타입 정리됨 (agents/skills/commands/capability-index/hooks): 삭제 0",
    graphifyProjectWiringSkipped:
      "Graphify가 전역에 설치되었습니다. 프로젝트 디렉터리에서 `npm run meta:graphify:rebuild`(또는 `python -m graphify update .`)를 실행해 지식 그래프를 생성하세요.",
    stepMcpMemory: "Meta_Kim 크로스세션 메모리",
    mcpMemoryInstalling: "MCP Memory Service（3층） 설치 중...",
    mcpMemoryInstalled: "MCP Memory Service 설치 완료",
    mcpMemoryInstallFailed: "MCP Memory Service 설치 실패 (비차단)",
    mcpMemoryAlreadyInstalled: (v) => `MCP Memory Service ${v} — 이미 설치됨`,
    mcpMemoryStopping: "업그레이드 전 MCP Memory Service 중지 중...",
    mcpMemoryStopped: "MCP Memory Service 중지됨",
    mcpMemoryUpgrading:
      "MCP Memory Service을(를) 최신 버전으로 업그레이드 중...",
    mcpMemoryUpgraded: (v) =>
      `MCP Memory Service이(가) ${v}(으)로 업그레이드되었습니다`,
    mcpMemoryUpgradeFailed: "MCP Memory Service 업그레이드 실패 (비차단)",
    mcpMemoryServerRegistered: "MCP Memory Service 가 .mcp.json 에 등록됨",
    mcpMemoryServerExists: ".mcp.json 에 이미 MCP Memory Service 있음",
    askMcpMemoryInstall:
      "Meta_Kim 크로스세션 메모리를 활성화할까요? MCP Memory Service 를 사용하며, 없으면 설치하고 등록한 뒤 백그라운드로 시작합니다.",
    mcpMemorySkipped: "MCP Memory Service 건너뜀",
    mcpMemoryServerStartHint:
      "MCP Memory Service 설치 완료——HTTP 서비스 시작 방법: MCP_ALLOW_ANONYMOUS_ACCESS=true memory server --http",
    mcpMemoryHookInstalling:
      "Claude Code, Codex, Cursor, OpenClaw용 MCP Memory 훅 설치 중...",
    mcpMemoryHookInstalled: "MCP Memory 런타임 훅 설치 완료",
    mcpMemoryHookWarnings:
      "훅 설치에서 경고가 발생했습니다 (비차단) — 하위 프로세스의 stderr 원문은 아래와 같습니다:",
    mcpMemoryAutoStarting: "MCP Memory Service (HTTP 백그라운드) 시작 중...",
    mcpMemoryAutoStarted:
      "MCP Memory Service가 http://localhost:8000에서 실행 중",
    mcpMemoryAutoStartUnverified:
      "MCP Memory Service 프로세스가 실행 중이므로 설치를 계속합니다",
    mcpMemoryAutoStartFailed: "자동 시작 실패 — 수동으로 시작하세요:",
    mcpMemoryAutoStartManual:
      "  MCP_ALLOW_ANONYMOUS_ACCESS=true memory server --http",
    mcpMemoryAutoStartBoot: "부팅 시 자동 시작 구성 완료",
    mcpMemoryAutoStartFailureTitle: "Meta_Kim MCP Memory Service",
    mcpMemoryAutoStartFailureMessage:
      "Meta_Kim MCP Memory Service를 시작하지 못했거나 http://127.0.0.1:8000 이 healthy 상태가 되지 않았습니다. 세션 간 메모리를 사용할 수 없을 수 있습니다. 수동으로 시작하세요: MCP_ALLOW_ANONYMOUS_ACCESS=true memory server --http",
    updateHeading: "업데이트 모드",
    updateNpm: "npm 의존성 재설치 중...",
    updateSkills: "모든 스킬 업데이트 중...",
    updateSyncProjectFiles: "canonical/에서 리포 내 도구 설정 동기화 중...",
    updateSyncDone: "동기화 완료",
    updateSyncSkip: "동기화를 건너뛰었거나 실패했습니다",
    updateReGlobal: "전역 스킬 디렉토리를 다시 선택할까요?",
    askReselectRuntimes: "이 컴퓨터에서 사용할 AI 코딩 도구를 다시 선택할까요?",
    askPythonToolsUpdate: "Python graphify (코드 지식 그래프)를 설치할까요?",
    pythonToolsSkipped: "Python 도구 건너뜀",
    askGlobalSkillsUpdate: "전역 스킬을 업데이트할까요? (선택)",
    updateSkillsDone: "전역 스킬 업데이트 완료",
    globalSkillsSkipped: "전역 스킬 건너뜀",
    askMetaTheoryUpdate:
      "선택한 runtime 에 Meta_Kim 글로벌 거버넌스 레이어를 동기화해 각 프로젝트에서 재사용할까요? agents, skills, MCP, Commands, hooks 등을 포함하며 지원 항목은 자동 확인됩니다. (권장)",
    updateMetaTheoryDone: "Meta_Kim 글로벌 능력 동기화 완료",
    metaTheorySkipped: "Meta_Kim 글로벌 능력 동기화 건너뜀",
    globalHooksMigrationHeading:
      "셀프 호스트 hook 마이그레이션 검사(~/.claude/hooks/meta-kim/)",
    globalHooksMigrationFound: (n) =>
      `canonical 화이트리스트와 더 이상 일치하지 않는 Meta_Kim 관리 hook 파일 ${n}개를 발견했습니다.`,
    globalHooksMigrationListed: (files) =>
      `삭제 대상 파일:\n${files.map((f) => `  - ${f}`).join("\n")}`,
    globalHooksMigrationKept: (files) =>
      `사용자 작성 파일(유지):\n${files.map((f) => `  - ${f}`).join("\n")}`,
    globalHooksMigrationConfirm: (n) =>
      `${n}개의 Meta_Kim 관리 hook 파일을 백업 후 삭제하시겠습니까? (y/N)`,
    globalHooksMigrationBackedUp: (dir) => `백업 위치: ${dir}`,
    globalHooksMigrationDone: (n) =>
      `${n}개의 Meta_Kim 관리 hook 파일을 삭제했습니다. 전역 sync 단계에서 다시 설치됩니다.`,
    globalHooksMigrationSkipped:
      "사용자가 건너뜀. 수동으로 삭제할 때까지 전역 hooks 재설치가 실패할 수 있습니다.",
    globalHooksMigrationNoChange:
      "전역 hooks 디렉터리는 깨끗합니다. 마이그레이션이 필요하지 않습니다.",
    projectHooksMigrationHeading: (platform) =>
      `[${platform}] Meta_Kim 관리 프로젝트 레벨 hook 파일 제거 중`,
    projectHooksMigrationRemoved: (platform, count, dir) =>
      `[${platform}] Meta_Kim 관리 파일 ${count}개 삭제: ${dir}`,
    projectHooksMigrationKept: (platform, files) =>
      `[${platform}] 사용자 작성 hook 파일(유지): ${
        files.length > 0 ? files.join(", ") : "(없음)"
      }`,
    projectHooksMigrationNoChange: (platform, dir) =>
      `[${platform}] ${dir} 깨끗함. 처리할 항목 없음.`,
    projectAssetsCleanupIntro:
      "Meta_Kim은 재사용 가능한 능력을 전역 runtime 디렉터리로 옮깁니다. 프로젝트에는 명시적 project projection, 프로젝트 전용 override, 상태, 캐시를 남깁니다.",
    projectAssetsCleanupScope:
      "이번 정리는 project-bootstrap manifest가 Meta_Kim 생성 파일임을 증명하고 현재 계획에서 더 이상 관리하지 않는 프로젝트 레벨 능력 자산만 삭제합니다. 사용자 파일, 인증 정보, merge 대상 설정 파일은 보존합니다.",
    projectAssetsRetargetCleanupIntro:
      "프로젝트 레벨 대상 runtime을 이번 선택에 맞게 다시 계산했습니다. 선택되지 않은 runtime의 오래된 Meta_Kim 프로젝트 자산을 삭제합니다.",
    projectAssetsRetargetCleanupScope:
      "이 작업은 프로젝트 디렉터리 업데이트의 일부입니다. manifest로 Meta_Kim 생성임이 증명되고 이번 대상 선택에 포함되지 않는 자산만 삭제합니다. 사용자 파일, 인증 정보, merge 대상 설정 파일은 보존합니다.",
    projectAssetsCleanupRemoved: (count, rows) =>
      `오래된 프로젝트 레벨 자산 ${count}개를 삭제하고 빈 디렉터리를 정리했습니다:\n${rows.map((row) => `  - ${row}`).join("\n")}`,
    projectAssetsCleanupSkipped: (count) =>
      `manifest 항목 ${count}개는 안전 삭제 조건을 만족하지 않아 건너뛰었습니다.`,
    updateComplete: "업데이트 완료!",
    // 설치 개요 문자열
    installOverviewTitle: "Meta_Kim 설치 개요",
    installOverviewWill: "이 과정에서:",
    installOverviewSyncConfig:
      "프로젝트 디렉토리에 설정 동기화 (canonical → .claude/.codex/openclaw/.cursor/)",
    installOverviewInstallSkills:
      "선택한 전역 스킬 리포지토리 설치 (~/.claude/skills/)",
    installOverviewSyncMeta: "Meta_Kim 재사용 능력을 글로벌 디렉터리에 동기화",
    installOverviewOptionalPython: "Python graphify 도구 설치",
    installOverviewTargets: "대상 도구:",
    installOverviewSkillList: "스킬 저장소:",
    installOverviewNoSkills: "(선택 없음)",
    installOverviewScope: "설치 범위:",
    installOverviewEstimated: "예상 시간:",
    installOverviewTime: "2-5분(네트워크 속도에 따라 다름)",
    // 진행 단계 문자열
    progressPrepareDir: "전역 스킬 디렉토리 준비",
    progressNpmInstall: "npm 의존성 설치",
    progressSyncConfig: "설정 동기화",
    progressCleanupLegacy: "레거시 스킬 파일 정리",
    progressInstallSkills: "전역 스킬 설치(몇 분 소요될 수 있음)",
    progressSyncMeta: "Meta_Kim 글로벌 능력 동기화",
    refreshGlobalCapabilityInventory:
      "Meta_Kim 글로벌 능력 인벤토리 새로고침 중...",
    globalCapabilityInventoryRefreshed:
      "Meta_Kim 글로벌 능력 인벤토리 새로고침 완료",
    globalCapabilityInventoryFailed:
      "글로벌 능력 discovery 실패; setup/update 후 `npm run discover:global` 를 실행하세요.",
    progressValidate: "설치 검증",
    // 확인 문자열
    confirmStartInstall: "설치를 시작할까요?",
    footprintTitle: "설치 발자국 (이전 설치 기록)",
    footprintFirstInstall: "이 머신에서 첫 설치 — 이전 발자국이 없습니다.",
    footprintRefreshNote: "설치 실행 시 위 항목들이 갱신됩니다.",
    footprintScopeGlobal: "전역",
    footprintScopeProject: "프로젝트",
    footprintEntries: "항목",
    footprintCategoryLabels: {
      A: "전역 런타임 스킬",
      B: "전역 런타임 훅",
      C: "전역 settings.json 병합",
      D: "프로젝트 런타임 스킬",
      E: "프로젝트 런타임 훅",
      F: "프로젝트 런타임 에이전트",
      G: "프로젝트 settings + MCP 설정",
      H: "프로젝트 로컬 상태 (.meta-kim/)",
      I: "공유 의존성 (pip / git 훅)",
    },
    installCancelled: "설치가 취소되었습니다",
    installComplete: "설치 완료!",
    // 경고 메시지
    warnConfigSyncFailed: `
⚠ 구성 동기화 실패, 계속 진행...

가능한 원인：
1. 파일이 잠겨 있습니다 → 대상 디렉토리의 IDE/탐색기를 닫으세요
2. 권한 거부 → 관리자로 실행
3. Git 충돌 → canonical/ 의 충돌을 해결한 후 재시도

수정：node scripts/sync-runtimes.mjs --scope project
`,
    warnSkillsInstallFailed: `
⚠ 전역 스킬 설치 실패

가능한 원인：
1. 디렉토리가 잠겨 있습니다（EBUSY）→ 탐색기/IDE를 닫고, 백신/인덱싱이 끝난 뒤 재시도
2. 네트워크 오류 → node setup.mjs --prompt-proxy 로 프록시 설정 확인
3. 리포지토리를 찾을 수 없음 → 스킬 리포지토리 URL이 올바른지 확인

수정：node setup.mjs --update
힌트：EBUSY인 경우 skills 폴더를 사용하는 프로그램을 닫은 후 *.staged-* 임시 폴더를 수동으로 삭제하세요.
`,
    warnMetaTheorySyncFailed: `
⚠ meta-theory 동기화 실패

가능한 원인：
1. 디렉토리가 잠겨 있습니다 → ~/.claude/skills/ 를 사용하는 프로그램 닫기
2. 권한 거부 → 전역 스킬 디렉토리의 쓰기 권한 확인
3. 네트워크 오류 → 프록시 설정 확인

수정：node scripts/sync-global-meta-theory.mjs --targets claude
`,
    warnSkillsUpdateFailed: `
⚠ 전역 스킬 업데이트 실패

가능한 원인：
1. 디렉토리가 잠겨 있습니다（EBUSY）→ 탐색기/IDE를 닫고, 백신/인덱싱이 끝난 뒤 재시도
2. Git fetch 실패 → 네트워크/프록시 연결 확인
3. 충돌 → 스테이지된 파일을 확인하고 수동으로 해결

힌트：EBUSY인 경우 skills 폴더를 사용하는 프로그램을 닫은 후 *.staged-* 임시 폴더를 수동으로 삭제하세요.
수정：node setup.mjs --update
`,
    warnSkillsUpdateFailedHint:
      "로그에 EBUSY 등이 있으면: 탐색기/IDE로 skills 폴더를 닫고, 후원/인덱싱이 끝난 뒤 재시도. 잠금 해제 후 *.staged-* 폴더는 수동 삭제 가능.",
    warnMetaTheoryUpdateFailed: `
⚠ meta-theory 동기화 실패

가능한 원인：
1. 디렉토리가 잠겨 있습니다 → ~/.claude/skills/ 를 사용하는 프로그램 닫기
2. 권한 거부 → 전역 스킬 디렉토리의 쓰기 권한 확인
3. 네트워크 오류 → 프록시 설정 확인

수정：node scripts/sync-global-meta-theory.mjs --targets claude
`,
    warnManifestLoadFail: (msg) => `스킬 매니페스트 로드 실패：${msg}`,
    labelOptional: "(선택)",
    selectedScope: (name) => `선택됨：${name}`,
    npmVerOk: (v) => `npm v${v}`,
    activeRuntimesSavedCli: (list) => `--targets에서 대상 도구 저장：${list}`,
    savedActiveTargets: (list) => `대상 도구 저장：${list}`,
    okRepoSynced: "canonical/에서 리포지토리 프로젝션 동기화됨",
    failRepoSync:
      "리포지토리 프로젝션 동기화 실패 — 리포 내 일부 설정이 오래되었을 수 있음",
    pipErrorDetail: (err) => `  pip 오류：${err}`,
    modeInfoLine: (mode, plat, ver) => `모드：${mode} | ${plat} | Node ${ver}`,
    stepLabel: (n, label) => `단계 ${n}：${label}`,
    // Proxy
    proxyHeading: "네트워크 / 프록시",
    proxyDetectedPrompt: (port, url) =>
      `프록시 포트 ${port}（${url}）감지됨. 사용하시겠습니까?`,
    proxySkip: "프록시 미감지 — 직접 연결",
    proxySkipDeclined: "프록시 거절됨 — 직접 연결",
    proxySaved: (url) => `프록시 저장됨: ${url}`,
    stepLabel: (n, label) => `단계 ${n}：${label}`,
    progressInstallPython: "Python graphify 도구 설치",
    progressInstallMcpMemory: "Meta_Kim 크로스세션 메모리 설정 (선택)",
    checkTargets: (active, supported) =>
      `activeTargets=${active} supportedTargets=${supported}`,
    localStateHeader: "로컬 상태",
    localStateProfile: (profile, key) => `profile=${profile} key=${key}`,
    localStateRunIndex: (path) => `런 인덱스：${path}`,
    localStateCompaction: (path) => `컴팩션：${path}`,
    localStateDispatch:
      "디스패치 엔벨로프：config/contracts/workflow-contract.json -> protocols.dispatchEnvelopePacket",
    localStateMigration:
      "마이그레이션 도우미：npm run migrate:meta-kim -- <source-dir> --apply",
    actionPrompt: "무엇을 하시겠습니까?",
    actionInstall: "설치 — 최초 전체 설정",
    actionInstallQuick: "빠른 설정 — 플랫폼 하나 선택, 바로 사용",
    actionUpdate: "업데이트 — 스킬 갱신 및 설정 동기화",
    actionCheck: "확인 — 의존성 및 동기화 상태 검증",
    actionExit: "종료",

    npxQuickHeading: "빠른 설정",
    npxQuickPlatformPrompt: "어떤 플랫폼을 사용하시나요?",
    npxQuickPlatformClaude: "Claude Code",
    npxQuickPlatformOpenclaw: "OpenClaw",
    npxQuickPlatformCodex: "Codex CLI",
    npxQuickPlatformCursor: "Cursor",
    npxQuickPlatformAll: "모든 플랫폼",
    npxQuickDirPrompt: "프로젝트용 디렉터리를 어디에 준비할까요?",
    npxQuickDirDefault: "~/Desktop/Meta_Kim",
    npxQuickCreating: "프로젝트용 디렉터리 준비 중:",
    npxQuickCopyFiles: "프로젝트용 런타임 파일 복사 중",
    npxQuickDirExists: "디렉터리가 이미 존재합니다. 내부 파일을 업데이트합니다",
    npxQuickDone: "프로젝트용 파일 준비 완료!",
    npxQuickPostCopyScript:
      "프로젝트 graph/state 출력은 전역 Meta_Kim 초기화기가 해당 프로젝트 안에 생성합니다.",
    npxQuickOpenIn: "이 디렉터리에서 플랫폼 열기:",
    npxQuickAskDeploy:
      "프로젝트용 런타임 파일을 다른 디렉터리로 내보낼까요? 해당 디렉터리를 기존 프로젝트에 복사할 수 있습니다.",
    npxQuickDeployYes: "디렉터리 선택",
    npxQuickDeployNo: "건너뛰기",
    projectDeployDirPrompt: "프로젝트 디렉터리:",
    projectDeployAsk: "프로젝트 디렉터리 업데이트",
    projectDeployProtectionNote:
      "기존 로컬 settings, MCP, hook 구성은 보존하고 병합합니다. 선택한 디렉터리만 업데이트합니다.",
    projectDeployInteractiveHint:
      "프로젝트 목록을 한 번 저장하면 이후 업데이트에서 저장된 모든 프로젝트를 함께 업데이트할 수 있습니다.",
    projectDeployPathEntryHint:
      "모든 프로젝트 루트를 한 줄에 입력하세요. 여러 디렉터리는 세미콜론이나 쉼표로 구분합니다. 예: D:/Project/a; D:/Project/b",
    projectDeploySavedPathHint: (path) =>
      `${path}에 저장했습니다. 다음에는 저장된 디렉터리 옵션을 선택하거나 --all-projects로 업데이트할 수 있습니다.`,
    projectDeployCliSaveHint:
      "--save-project-dirs를 추가하면 CLI 대상이 저장되며 다음에는 --all-projects를 사용할 수 있습니다.",
    projectDeploySavedListHeading: (n) => `저장된 프로젝트 디렉터리 (${n}개):`,
    projectDeployParsedTargets: (n) =>
      `프로젝트 디렉터리 ${n}개를 읽었습니다:`,
    projectDeployNoDirsEntered:
      "프로젝트 디렉터리가 입력되지 않아 프로젝트 내보내기를 건너뜁니다.",
    projectDeployConfirmSaveAndUpdate: (n) =>
      `프로젝트 디렉터리 ${n}개를 저장하고 지금 업데이트할까요?`,
    projectDeployConfirmUpdateOnce: (n) =>
      `이번 실행에서만 프로젝트 디렉터리 ${n}개를 업데이트할까요?`,
    projectDeployUseSaved: (n) => `저장된 모든 프로젝트 디렉터리 업데이트 (${n}개)`,
    projectDeploySelectOnce: "이번에만 지정한 프로젝트 디렉터리 업데이트",
    projectDeploySelectAndRemember:
      "저장된 프로젝트 디렉터리를 추가/변경하고 지금 업데이트",
    projectCleanupUseSaved: (n) =>
      `저장된 모든 프로젝트 디렉터리의 중복 Meta_Kim 자산 정리 (${n}개)`,
    projectCleanupSelectOnce:
      "이번에만 지정한 프로젝트 디렉터리의 중복 Meta_Kim 자산 정리",
    projectCleanupSelectAndRemember:
      "저장된 프로젝트 디렉터리를 추가/변경하고 중복 Meta_Kim 자산 정리",
    projectDeployCliTargets: (n) =>
      `CLI에서 전달된 프로젝트 디렉터리 ${n}개 사용`,
    projectDeploySavedTargets: (n) =>
      `프로젝트 디렉터리 ${n}개를 저장했습니다. 향후 업데이트에서 재사용할 수 있습니다`,
    projectDeployNoSaved:
      "저장된 프로젝트 디렉터리가 없어 프로젝트 내보내기를 건너뜁니다.",
    projectDeployBatchHeading: (n) =>
      `프로젝트 디렉터리 ${n}개의 프로젝트용 런타임 파일 업데이트 중`,
    projectDeploySummary: "프로젝트 디렉터리 업데이트 결과",
    projectDeployStatusOk: "업데이트됨",
    projectDeployStatusFailed: "실패",
    projectDeployFailed: (dir, msg) => `${dir} 업데이트 실패: ${msg}`,
    projectDeployMoreTargets: (n) =>
      `다른 프로젝트 디렉터리 ${n}개도 업데이트했습니다.`,
    aboutAuthor: "작성자 소개",
    contactWebsite: "웹사이트",
    contactGithub: "GitHub",
    contactFeishu: "Feishu 위키",
    contactWechat: "WeChat 공식 계정",
  },
};

let t = I18N.en; // default, overwritten by selectLanguage()
let quickDeployDir = null; // first deploy target shown in legacy next-step text
let quickDeployDirs = []; // set by quick deploy / project deploy exports

function detectNpxMode() {
  const normalized = PROJECT_DIR.replace(/\\/g, "/").toLowerCase();
  return normalized.includes("_npx") || normalized.includes("npm-cache");
}

if (langArg) {
  const code = normalizeLangCliArg(langArg);
  const langMatch = LANGUAGES.find((l) => l.code === code);
  if (langMatch && I18N[langMatch.code]) {
    t = I18N[langMatch.code];
  }
}

/** Format i18n string with placeholder replacement */
function fmt(template, values = {}) {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return result;
}

// ── ANSI colors ─────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  white: "\x1b[37m",
  // Logo/frame only - dark amber gold
  amber: "\x1b[38;2;160;120;60m",
  amberBright: "\x1b[38;2;200;160;80m",
  // Section headings - gray for contrast
  section: "\x1b[38;5;240m",
};

function log(icon, msg) {
  console.log(`${icon} ${msg}`);
}
function ok(msg) {
  log(`${C.green}✓${C.reset}`, msg);
}
function skip(msg) {
  log(`${C.yellow}⊘${C.reset}`, `${C.dim}${msg}${C.reset}`);
}
function warn(msg) {
  log(`${C.yellow}⚠${C.reset}`, msg);
}
function fail(msg) {
  log(`${C.red}✗${C.reset}`, msg);
}
function info(msg) {
  log(`${C.dim}ℹ${C.reset}`, msg);
}
function heading(msg) {
  console.log(`\n${C.bold}${C.section}▸ ${msg}${C.reset}`);
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      encoding: "utf-8",
      stdio: "pipe",
      cwd: PROJECT_DIR,
      shell: isWin,
      ...opts,
    }).trim();
  } catch {
    return null;
  }
}

// Cross-platform CLI detection: tries direct, .exe, then where/which fallback
function detectCli(name) {
  for (const cmd of [name, `${name}.exe`]) {
    const ver = run(`${cmd} --version`);
    if (ver) return ver.split(/\r?\n/)[0].trim();
  }
  const resolved = isWin
    ? run(`where ${name} 2>nul`)
    : run(`which ${name} 2>/dev/null`);
  if (resolved) {
    const path = resolved.split(/\r?\n/)[0].trim();
    const ver = run(`"${path}" --version`);
    if (ver) return ver.split(/\r?\n/)[0].trim();
  }
  return null;
}

function gitProxyArgs() {
  if (!PROXY) return "";
  return `-c http.proxy=${PROXY} -c https.proxy=${PROXY}`;
}

// ── Interactive prompt ──────────────────────────────────

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${C.bold}?${C.reset} ${question} `, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function askYesNo(question, defaultYes = true) {
  if (silentMode) return defaultYes;
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = await ask(`${question} ${C.dim}${hint}${C.reset}`);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith("y");
}

// ── Interactive lists ───────────────────────────────────
//
// TTY: @inquirer/prompts (select / checkbox) — reliable ↑↓ / Space / Enter on Windows, Cursor, narrow panels.
// Non-TTY: numbered readline fallback (CI / pipes).
//
// Layout: blank line before each prompt block; newline after question so options sit below a clear gap.

const ANSI_STRIP_RE = /\x1b\[[0-9;]*m/g;
function stripAnsi(s) {
  return String(s ?? "").replace(ANSI_STRIP_RE, "");
}

function blankLineBeforeInquirerPrompt() {
  console.log("");
}

/** Trailing \\n on message yields a visual blank line before the choice list (see @inquirer/select render). */
function inquirerPromptQuestionLine(text) {
  return `${stripAnsi(text)}\n`;
}

function inquirerThemeSingle() {
  return {
    style: {
      keysHelpTip: () => t.inquirerSingleHotkeys,
    },
  };
}

function inquirerThemeMulti() {
  return {
    style: {
      keysHelpTip: () => t.inquirerMultiHotkeys,
    },
  };
}

function formatSelectChoiceLabel(option) {
  const text =
    typeof option === "string" ? option : option.label || option.toString();
  return stripAnsi(text);
}

/** Static list for non-interactive / piped stdin (no @inquirer). */
function printSelectMenu(question, options, selected) {
  console.log(`\n${C.bold}?${C.reset} ${question}`);
  for (let i = 0; i < options.length; i++) {
    const prefix = i === selected ? `${C.green}▶${C.reset} ` : "  ";
    const text =
      typeof options[i] === "string"
        ? options[i]
        : options[i].label || options[i].toString();
    console.log(`${C.dim}${i + 1}.${C.reset} ${prefix}${text}`);
  }
}

function printMultiMenu(question, choices, focused, selected) {
  console.log(`\n${C.bold}?${C.reset} ${question}`);
  for (let i = 0; i < choices.length; i++) {
    const isFocused = i === focused;
    const isSelected = selected.has(choices[i].id);
    const focusMark = isFocused ? `${C.yellow}▶${C.reset} ` : "  ";
    const checkMark = isSelected ? `${C.green}✓${C.reset}` : " ";
    const text = choices[i].label || choices[i].toString();
    const idStr = choices[i].id || "";
    console.log(
      `${C.dim}${i + 1}.${C.reset} [${checkMark}] ${focusMark}${text} ${C.dim}(${idStr})${C.reset}`,
    );
  }
}

async function keyboardSelect(question, options) {
  if (silentMode) return 0;

  if (!process.stdin.isTTY) {
    printSelectMenu(question, options, 0);
    const answer = await ask(t.choose(options.length));
    const idx = parseInt(answer, 10) - 1;
    return idx >= 0 && idx < options.length ? idx : 0;
  }

  const { select } = await import("@inquirer/prompts");

  const choices = options.map((o, i) => ({
    name: formatSelectChoiceLabel(o),
    value: i,
  }));

  blankLineBeforeInquirerPrompt();
  const answer = await select({
    message: inquirerPromptQuestionLine(question),
    choices,
    default: 0,
    loop: true,
    theme: inquirerThemeSingle(),
  });

  return typeof answer === "number" && answer >= 0 && answer < options.length
    ? answer
    : 0;
}

async function keyboardMultiSelect(question, choices, defaultIds, hintText) {
  if (silentMode) return defaultIds;

  if (!process.stdin.isTTY) {
    printMultiMenu(question, choices, 0, new Set(defaultIds));
    const answer = await ask(
      `${hintText(`${C.dim}${defaultIds.join(", ")}${C.reset}`)}`,
    );
    if (!answer) return defaultIds;
    const parts = answer
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (!parts.length) return defaultIds;
    return parts.map((part) => {
      if (/^\d+$/.test(part)) {
        const index = parseInt(part, 10) - 1;
        return choices[index]?.id ?? part;
      }
      return part.toLowerCase();
    });
  }

  const { checkbox } = await import("@inquirer/prompts");

  const cbChoices = choices.map((c) => ({
    name: stripAnsi(`${c.label || ""} (${c.id || ""})`),
    value: c.id,
    checked: defaultIds.includes(c.id),
  }));

  blankLineBeforeInquirerPrompt();
  const picked = await checkbox({
    message: inquirerPromptQuestionLine(question),
    choices: cbChoices,
    required: false,
    theme: inquirerThemeMulti(),
  });

  return Array.isArray(picked) ? picked : defaultIds;
}

/** Alias for compatibility — redirect to keyboardSelect */
async function askSelect(question, options) {
  return keyboardSelect(question, options);
}

/** Alias for compatibility — redirect to keyboardMultiSelect */
async function askMultiSelectTargets(question, choices, defaultIds) {
  return keyboardMultiSelect(question, choices, defaultIds, t.inputTargetsHint);
}

/** Alias for compatibility — redirect to keyboardMultiSelect */
async function askMultiSelectSkillRepos(question, choices, defaultIds) {
  return keyboardMultiSelect(
    question,
    choices,
    defaultIds,
    t.inputSkillIdsHint,
  );
}

async function resolveSelectedSkillDependencyIds() {
  const cliSkills = parseSkillsArg(args);
  if (cliSkills !== null) {
    const validLower = new Set(SKILLS.map((s) => s.name.toLowerCase()));
    for (const raw of cliSkills) {
      const k = String(raw || "")
        .trim()
        .toLowerCase();
      if (k && !validLower.has(k)) {
        warn(t.warnUnknownSkillId(k));
      }
    }
    return normalizeSkillIds(cliSkills);
  }
  if (silentMode) {
    return getDefaultSkillIds();
  }
  const skillChoices = SKILLS.map((skill) => ({
    id: skill.name,
    label: skill.label || skill.name,
  }));
  const pickedSkills = await askMultiSelectSkillRepos(
    t.askSkillReposChoice ?? "Choose third-party skill repos to install",
    skillChoices,
    getDefaultSkillIds(),
  );
  return normalizeSkillIds(pickedSkills);
}

// ── Proxy configuration ────────────────────────────────

/**
 * Detect Windows system proxy from registry.
 * Returns { url, port, source } or null.
 */
function detectWindowsSystemProxy() {
  if (platform() !== "win32") return null;
  try {
    const enableResult = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable',
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    if (!enableResult.includes("0x1")) return null;

    const serverResult = execSync(
      'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer',
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    const match = serverResult.match(/REG_SZ\s+(.+)/);
    if (!match) return null;

    let raw = match[1].trim();
    if (raw.includes("=")) {
      const httpsEntry = raw
        .split(";")
        .find((s) => s.trim().startsWith("https="));
      const httpEntry = raw
        .split(";")
        .find((s) => s.trim().startsWith("http="));
      raw = (httpsEntry || httpEntry || raw).split("=").pop().trim();
    }
    if (!raw.includes("://")) raw = `http://${raw}`;

    // Extract port from URL
    let port = null;
    try {
      const parsed = new URL(raw);
      port = parsed.port ? parseInt(parsed.port, 10) : null;
    } catch {
      // ignore
    }

    return { url: raw, port, source: "system" };
  } catch {
    return null;
  }
}

/**
 * Ask user to configure git proxy.
 * Auto-detects system proxy port. Default = YES (use it). User can opt out.
 * Returns { port, url, source } or null (skip / no proxy).
 * Saves result to localOverrides.gitProxy.
 */
async function askProxyConfig() {
  const localOverrides = await loadLocalOverrides();

  // Non-interactive or prompts disabled: no git proxy in localOverrides (use HTTPS_PROXY for tools if set)
  if (silentMode || !promptProxy) {
    return null;
  }

  heading(t.proxyHeading);

  // Auto-detect system proxy, ask user to confirm (default = yes)
  const sysProxy = detectWindowsSystemProxy();

  if (sysProxy) {
    const answer = await ask(
      `${t.proxyDetectedPrompt(sysProxy.port, sysProxy.url)} ${C.dim}[Y/n]${C.reset}:`,
    );
    const trimmed = answer.trim().toLowerCase();
    // Default = yes (use proxy), only skip if user explicitly says n or no
    if (trimmed === "n" || trimmed === "no") {
      skip(t.proxySkipDeclined);
      if (localOverrides.gitProxy != null) {
        await writeLocalOverrides({ ...localOverrides, gitProxy: undefined });
      }
      return null;
    }
    // Empty input or y/yes → accept proxy
    ok(t.proxySaved(sysProxy.url));
    await writeLocalOverrides({ ...localOverrides, gitProxy: sysProxy.url });
    return { url: sysProxy.url, source: "system" };
  }

  // No system proxy detected — skip entirely
  skip(t.proxySkip);
  return null;
}

// ── Step 0: Language selection ───────────────────────────

async function selectLanguage() {
  if (langArg) {
    const code = normalizeLangCliArg(langArg);
    const match = LANGUAGES.find((l) => l.code === code);
    if (match) {
      t = I18N[match.code];
      currentLangCode = match.code;
      return match;
    }
  }

  if (silentMode) {
    currentLangCode = LANGUAGES[0].code;
    return LANGUAGES[0];
  }

  const labels = LANGUAGES.map((l) => `${l.label} (${l.code})`);
  const idx = await askSelect(t.selectLang, labels);
  t = I18N[LANGUAGES[idx].code];
  currentLangCode = LANGUAGES[idx].code;
  return LANGUAGES[idx];
}

// ── Utility functions ─────────────────────────────────────

/** Detect if this is first-time setup */
function isFirstRun() {
  const stateDir = join(PROJECT_DIR, ".meta-kim", "state");
  return !existsSync(stateDir);
}

/** Show installation overview before starting (scope-aware bullets) */
function showInstallOverview(
  activeTargets,
  installScope,
  skillIds = [],
) {
  const bullets = [];
  if (installScope === "project") {
    bullets.push(t.installOverviewSyncConfig);
  } else {
    bullets.push(t.installOverviewInstallSkills);
    bullets.push(t.installOverviewSyncMeta);
  }
  // graphify is always optional — show as optional hint, not a bullet
  const scopeLabel =
    {
      project: t.installScopeProjectLabel,
      global: t.installScopeGlobalLabel,
    }[installScope] || installScope;

  const skillLine =
    installScope === "project"
      ? ""
      : `\n${C.dim}${t.installOverviewSkillList}${C.reset}${
          skillIds.length > 0 ? skillIds.join(", ") : t.installOverviewNoSkills
        }`;

  console.log(`
${C.bold}${t.installOverviewTitle}${C.reset}

${C.dim}${t.installOverviewWill}${C.reset}
${bullets.map((b) => `${C.dim}•${C.reset} ${b}`).join("\n")}
${C.dim}•${C.reset} ${C.dim}${t.installOverviewOptionalPython}${C.reset} ${C.yellow}${t.labelOptional}${C.reset}

${C.dim}${t.installOverviewTargets}${C.reset}${activeTargets.join(", ")}
${C.dim}${t.installOverviewScope}${C.reset}${scopeLabel}${skillLine}
${C.dim}${t.installOverviewEstimated}${C.reset}${t.installOverviewTime}
`);
}

/**
 * Print a summary of Meta_Kim's existing install footprint (from manifests
 * written by prior sync runs) so the user can see what this install is about
 * to refresh. Pure read-only; safe to call even when no manifest exists.
 */
async function showExistingFootprint(installScope) {
  const { readManifest, manifestPathFor, listByCategory } =
    await import("./scripts/install-manifest.mjs");

  const sources = [];
  if (installScope === "global") {
    try {
      const m = readManifest(manifestPathFor("global"));
      if (m && m.entries?.length > 0)
        sources.push({ scope: "global", manifest: m });
    } catch {
      /* manifest read is best-effort */
    }
  }
  if (installScope === "project") {
    try {
      const m = readManifest(manifestPathFor("project", PROJECT_DIR));
      if (m && m.entries?.length > 0)
        sources.push({ scope: "project", manifest: m });
    } catch {
      /* manifest read is best-effort */
    }
  }

  console.log(`\n${C.bold}${t.footprintTitle}${C.reset}`);
  if (sources.length === 0) {
    console.log(`${C.dim}${t.footprintFirstInstall}${C.reset}\n`);
    return;
  }
  console.log("");

  for (let i = 0; i < sources.length; i++) {
    if (i > 0) console.log("");
    const { scope, manifest } = sources[i];
    const grouped = listByCategory(manifest);
    const scopeLabel =
      scope === "global" ? t.footprintScopeGlobal : t.footprintScopeProject;
    console.log(
      `${C.cyan}${scopeLabel}${C.reset}: ${manifest.entries.length} ${t.footprintEntries}`,
    );
    for (const [cat, items] of Object.entries(grouped)) {
      if (items.length === 0) continue;
      const catLabel = t.footprintCategoryLabels?.[cat] ?? cat;
      console.log(`${cat}. ${catLabel}: ${C.bold}${items.length}${C.reset}`);
    }
  }
  console.log("");
  console.log(`${C.dim}${t.footprintRefreshNote}${C.reset}`);
  console.log("");
}

/** Execute with progress indicator */
async function withProgress(label, fn) {
  console.log("");
  console.log(`${C.dim}→${C.reset} ${label}`);

  try {
    await fn();
    return true;
  } catch (err) {
    console.log(`${C.red}✗${C.reset}`);
    throw err;
  }
}

// ── Quick deploy (npx mode) ────────────────────────────

const QUICK_PLATFORMS = [
  { id: "claude", labelKey: "npxQuickPlatformClaude" },
  { id: "openclaw", labelKey: "npxQuickPlatformOpenclaw" },
  { id: "codex", labelKey: "npxQuickPlatformCodex" },
  { id: "cursor", labelKey: "npxQuickPlatformCursor" },
  { id: "all", labelKey: "npxQuickPlatformAll" },
];

async function askQuickPlatform() {
  const labels = QUICK_PLATFORMS.map((p) => t[p.labelKey]);
  const idx = await askSelect(t.npxQuickPlatformPrompt, labels);
  return QUICK_PLATFORMS[idx].id;
}

async function askTargetDirectory() {
  const rawDefault = t.npxQuickDirDefault;
  const expandedDefault = rawDefault
    .replace(/^~\//, homedir() + "/")
    .replace(/^~\\/, homedir() + "\\");
  const answer = await ask(
    `${t.npxQuickDirPrompt} ${C.dim}[${rawDefault}]${C.reset}`,
  );
  const raw = (answer || "").trim();
  if (!raw) return expandedDefault;
  return normalizeProjectDeployDir(raw);
}

function normalizeDeployRelPath(relPath) {
  return String(relPath || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

const DEPLOY_LOCAL_STATE_PATHS = new Set([
  ".claude/project-task-state.json",
  ".claude/scheduled_tasks.lock",
  ".claude/settings.local.json",
]);

const DEPLOY_PROTECTED_JSON_PATHS = new Set([
  ".claude/settings.json",
  ".mcp.json",
  ".codex/hooks.json",
  ".cursor/hooks.json",
  ".cursor/mcp.json",
  "openclaw/openclaw.template.json",
]);

const DEPLOY_PROTECTED_TEXT_PATHS = new Set(["AGENTS.md", "CLAUDE.md"]);

const DEPLOY_SKIP_CONFIG_PATHS = new Set([
  ".codex/config.toml",
]);

const PROJECT_BOOTSTRAP_MERGED_CONFIG_PATHS = new Set([
  ...DEPLOY_PROTECTED_JSON_PATHS,
  ...DEPLOY_PROTECTED_TEXT_PATHS,
  ...DEPLOY_SKIP_CONFIG_PATHS,
]);

const GLOBAL_HOOK_PACKAGE_FILES_LIST = [
  "activate-meta-theory-spine.mjs",
  "bash-readonly-whitelist.mjs",
  "block-dangerous-bash.mjs",
  "ecc-permission-cache-wrapper.mjs",
  "enforce-agent-dispatch.mjs",
  "graphify-context.mjs",
  "meta-kim-memory-save.mjs",
  "post-console-log-warn.mjs",
  "post-format.mjs",
  "post-typecheck.mjs",
  "skip-reminder.mjs",
  "stop-compaction.mjs",
  "stop-completion-guard.mjs",
  "stop-console-log-audit.mjs",
  "stop-memory-save.mjs",
  "stop-save-progress.mjs",
  "stop-spine-cleanup.mjs",
  "subagent-context.mjs",
  "utils.mjs",
];

const PROJECT_LOCAL_CAPABILITY_PREFIXES = [
  ".claude/agents/",
  ".claude/skills/",
  ".claude/commands/",
  ".claude/hooks/",
  ".claude/capability-index/",
  ".codex/agents/",
  ".codex/skills/",
  ".codex/commands/",
  ".codex/hooks/",
  ".codex/capability-index/",
  ".agents/skills/",
  ".cursor/agents/",
  ".cursor/skills/",
  ".cursor/hooks/",
  ".cursor/rules/",
  ".cursor/capability-index/",
  "openclaw/workspaces/",
  "openclaw/skills/",
  "openclaw/capability-index/",
  "openclaw/hooks/",
];

const PROJECT_SKILL_ROOTS_BY_PLATFORM = {
  claude: [".claude/skills"],
  codex: [".agents/skills"],
  cursor: [".cursor/skills"],
  openclaw: ["openclaw/skills"],
};

const PROJECT_META_KIM_CONFIG_RELS_BY_PLATFORM = {
  claude: [".claude/settings.json", ".mcp.json"],
  codex: [".codex/hooks.json", ".mcp.json"],
  cursor: [".cursor/hooks.json", ".cursor/mcp.json"],
  openclaw: ["openclaw/openclaw.template.json"],
};

const PROJECT_META_KIM_LOCAL_STATE_RELS = [
  ".claude/project-task-state.json",
  ".meta-kim",
];

const PROJECT_HOOK_REL_DIRS_BY_PLATFORM = {
  claude: ".claude/hooks",
  codex: ".codex/hooks",
  cursor: ".cursor/hooks",
  openclaw: "openclaw/hooks",
};

const PROJECT_HOOK_SOURCE_CANDIDATES = {
  claude: [
    ...GLOBAL_HOOK_PACKAGE_FILES_LIST,
    "spine-state.mjs",
  ],
  codex: [
    "activate-meta-theory-spine.mjs",
    "bash-readonly-whitelist.mjs",
    "enforce-agent-dispatch.mjs",
    "graphify-context.mjs",
    "post-console-log-warn.mjs",
    "post-format.mjs",
    "post-typecheck.mjs",
    "skip-reminder.mjs",
    "spine-state.mjs",
    "stop-compaction.mjs",
    "stop-completion-guard.mjs",
    "stop-console-log-audit.mjs",
    "stop-spine-cleanup.mjs",
    "subagent-context.mjs",
    "utils.mjs",
  ],
  cursor: [
    "activate-meta-theory-spine.mjs",
    "bash-readonly-whitelist.mjs",
    "enforce-agent-dispatch.mjs",
    "graphify-context.mjs",
    "post-console-log-warn.mjs",
    "post-format.mjs",
    "post-typecheck.mjs",
    "skip-reminder.mjs",
    "spine-state.mjs",
    "stop-compaction.mjs",
    "stop-completion-guard.mjs",
    "stop-console-log-audit.mjs",
    "stop-spine-cleanup.mjs",
    "subagent-context.mjs",
    "utils.mjs",
  ],
  openclaw: [
    "stop-save-progress.mjs",
  ],
};

function readProjectHookSource(platformId, hookName) {
  if (
    (platformId === "codex" || platformId === "cursor") &&
    hookName === "graphify-context.mjs"
  ) {
    return buildCodexGraphifyContextHookSource();
  }
  const candidates = [];
  if (platformId === "claude") {
    candidates.push(
      join(PROJECT_DIR, "canonical", "runtime-assets", "claude", "hooks", hookName),
    );
  }
  candidates.push(
    join(PROJECT_DIR, "canonical", "runtime-assets", "shared", "hooks", hookName),
  );
  candidates.push(
    join(PROJECT_DIR, "canonical", "runtime-assets", "claude", "hooks", hookName),
  );
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    return readFileSync(candidate, "utf8");
  }
  return null;
}

function buildCodexGraphifyContextHookSource() {
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

const OPENCLAW_AGENT_ORDER = [
  "meta-warden",
  "meta-genesis",
  "meta-artisan",
  "meta-sentinel",
  "meta-librarian",
  "meta-conductor",
  "meta-prism",
  "meta-scout",
];

function parseSetupAgentFrontmatter(raw, filePath) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`${filePath} is missing YAML frontmatter.`);
  }

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
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

function extractSetupAgentTitle(body, fallback) {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function roleFromSetupAgentTitle(title, fallback) {
  const parts = title.split(":");
  return parts.length > 1 ? parts.slice(1).join(":").trim() : fallback;
}

function sortSetupAgents(agents) {
  return [...agents].sort((left, right) => {
    const leftIndex = OPENCLAW_AGENT_ORDER.indexOf(left.id);
    const rightIndex = OPENCLAW_AGENT_ORDER.indexOf(right.id);
    if (leftIndex === -1 && rightIndex === -1) return left.id.localeCompare(right.id);
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
}

function loadSetupAgents() {
  const canonicalAgentsDir = join(PROJECT_DIR, "canonical", "agents");
  const files = readdirSync(canonicalAgentsDir)
    .filter((file) => file.endsWith(".md"))
    .sort();

  const agents = [];
  for (const file of files) {
    const filePath = join(canonicalAgentsDir, file);
    const raw = readFileSync(filePath, "utf8");
    const { data, body } = parseSetupAgentFrontmatter(raw, filePath);
    if (!data.name || !data.description) {
      throw new Error(`${filePath} must define frontmatter name and description.`);
    }
    const title = extractSetupAgentTitle(body, data.name);
    agents.push({
      id: data.name,
      description: data.description,
      sourceFile: relative(PROJECT_DIR, filePath).replace(/\\/g, "/"),
      title,
      role: roleFromSetupAgentTitle(title, data.description),
      body: body.trim(),
    });
  }

  return sortSetupAgents(agents);
}

function parseSetupAgentPresentation(agent) {
  const titleMatch = agent.title.match(
    /^(.*?)(?::\s*(.*?))?(?:\s+([^\s]+))?$/u,
  );
  return {
    displayName: titleMatch?.[1]?.trim() || agent.id,
    localizedRole: titleMatch?.[2]?.trim() || agent.description,
    emoji: titleMatch?.[3]?.trim() || "🤖",
  };
}

function buildSetupOpenClawBootstrap(agent) {
  const { displayName, localizedRole } = parseSetupAgentPresentation(agent);

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

function buildSetupOpenClawIdentity(agent) {
  const { displayName, localizedRole, emoji } = parseSetupAgentPresentation(agent);

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

function buildSetupOpenClawUser() {
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

function buildSetupOpenClawBoot(agent) {
  const { displayName } = parseSetupAgentPresentation(agent);

  return `# BOOT.md - ${agent.id}

After the OpenClaw gateway starts, run one-time boot checks in this order when needed.

1. Confirm the workspace path and that \`IDENTITY.md\`, \`SOUL.md\`, \`TOOLS.md\`, and \`AGENTS.md\` are readable.
2. Do not message the user proactively; act only when the boot task explicitly requires it.
3. If you see role-boundary conflicts, record them in \`MEMORY.md\` under open questions — do not rewrite persona on your own.
4. If you are \`${displayName}\`, keep boot checks inside your own boundary only.
`;
}

function buildSetupOpenClawMemory(agent) {
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

function buildSetupOpenClawTeamDirectory(agents) {
  const rows = agents
    .map((agent) => `| \`${agent.id}\` | ${agent.title} | ${agent.description} |`)
    .join("\n");

  return `# AGENTS.md - Meta_Kim Team Directory

This file is generated from \`canonical/agents/*.md\` by Meta_Kim runtime sync/bootstrap.

Use the smallest agent whose boundary matches the task. Escalate to \`meta-warden\` when the task spans multiple agent boundaries.

Important: this file lists only the Meta_Kim team. It is not the full OpenClaw registry. If the user asks how many agents exist, which agents are currently registered, or who can collaborate right now, query the live runtime registry first instead of answering from this file alone.

| Agent ID | Name | Responsibility |
| --- | --- | --- |
${rows}
`;
}

function buildSetupOpenClawSoul(agent) {
  return `# SOUL.md - ${agent.id}

Generated from \`${agent.sourceFile}\`. Edit the canonical source first, then run Meta_Kim runtime sync/bootstrap.

## Runtime Notes

- You are running inside OpenClaw.
- Read the local \`AGENTS.md\` before delegating with \`sessions_send\`.
- \`AGENTS.md\` only lists the Meta_Kim team, not the full OpenClaw registry.
- When the user asks which agents exist, how many agents exist, or who can collaborate right now, query the live runtime registry first through \`agents_list\`. If that tool is unavailable, fall back to an explicit runtime command and state the result source.
- Stay inside your own responsibility boundary unless the user explicitly asks you to coordinate broader work.
- The theory source is \`canonical/skills/meta-theory/references/meta-theory.md\`; public runtime behavior must not depend on local narrative notes.
- For \`meta-theory\`, \`/meta-theory\`, project understanding, architecture, runtime routing, hook/MCP/tool routing, commercialization, market, competitor, pricing, growth, strategy, or roadmap tasks, run or faithfully follow \`npm run meta:theory:run -- "<user request>"\` before Thinking. If command execution or retrieval capability is unavailable, return \`blocked_to_fetch\` with the exact missing capability instead of giving a shallow summary.
- Project-understanding Fetch must account for README, AGENTS, package scripts, canonical agents/skills/runtime assets, contracts, capability index, runtime projections, MCP configs, hooks, dependency registry, and Graphify when present.

${agent.body}
`;
}

function buildSetupOpenClawHeartbeat(agent) {
  const templatePath = join(
    PROJECT_DIR,
    "canonical",
    "runtime-assets",
    "openclaw",
    "HEARTBEAT.template.md",
  );
  const raw = readFileSync(templatePath, "utf8");
  return raw.replace(/^<!--[\s\S]*?-->\r?\n/, "").replaceAll("{{AGENT_ID}}", agent.id);
}

function buildSetupOpenClawTools(agent, agents) {
  const teammates = agents
    .filter((item) => item.id !== agent.id)
    .map((item) => `- \`${item.id}\`: ${item.description}`)
    .join("\n");

  return `# TOOLS.md - ${agent.id}

Auto-generated by Meta_Kim runtime sync/bootstrap. Edit canonical sources first, then re-sync.

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

function buildOpenClawWorkspacePlans(targetDir) {
  const agents = loadSetupAgents();
  const teamDirectory = buildSetupOpenClawTeamDirectory(agents);
  const builders = {
    "BOOT.md": (agent) => buildSetupOpenClawBoot(agent),
    "BOOTSTRAP.md": (agent) => buildSetupOpenClawBootstrap(agent),
    "IDENTITY.md": (agent) => buildSetupOpenClawIdentity(agent),
    "MEMORY.md": (agent) => buildSetupOpenClawMemory(agent),
    "USER.md": () => buildSetupOpenClawUser(),
    "SOUL.md": (agent) => buildSetupOpenClawSoul(agent),
    "AGENTS.md": () => teamDirectory,
    "HEARTBEAT.md": (agent) => buildSetupOpenClawHeartbeat(agent),
    "TOOLS.md": (agent) => buildSetupOpenClawTools(agent, agents),
  };

  return agents.flatMap((agent) =>
    OPENCLAW_WORKSPACE_MD.map((fileName) =>
      projectGeneratedFilePlan(
        `openclaw/workspaces/${agent.id}/${fileName}`,
        builders[fileName](agent),
        targetDir,
        `generated:openclaw-workspace:${agent.id}:${fileName}`,
      ),
    ),
  );
}

function projectHookGeneratedPlans(platformId, targetDir) {
  const plans = [];
  const relDir = PROJECT_HOOK_REL_DIRS_BY_PLATFORM[platformId];
  const hookNames = PROJECT_HOOK_SOURCE_CANDIDATES[platformId] ?? [];
  if (relDir && hookNames.length > 0) {
    for (const hookName of hookNames) {
      const content = readProjectHookSource(platformId, hookName);
      if (!content) continue;
      plans.push(projectGeneratedFilePlan(
        `${relDir}/${hookName}`,
        content,
        targetDir,
        `generated:project-hook:${platformId}:${hookName}`,
      ));
    }
  }
  if (platformId === "openclaw") {
    plans.push(...buildOpenClawWorkspacePlans(targetDir));
  }
  return plans;
}

function writeProjectGeneratedHooks(platformId, targetDir) {
  let count = 0;
  for (const plan of projectHookGeneratedPlans(platformId, targetDir)) {
    const content = plan.content;
    if (!content) continue;
    const destPath = join(targetDir, plan.relPath);
    mkdirSync(dirname(destPath), { recursive: true });
    writeFileSync(destPath, content, "utf8");
    count += 1;
  }
  return count;
}

function shouldSkipProjectDeployPath(relPath) {
  const rel = normalizeDeployRelPath(relPath);
  return (
    DEPLOY_LOCAL_STATE_PATHS.has(rel) ||
    DEPLOY_SKIP_CONFIG_PATHS.has(rel) ||
    rel.endsWith("/.openclaw/workspace-state.json")
  );
}

function isMetaKimNamespacedProjectPath(relPath) {
  const rel = normalizeDeployRelPath(relPath);
  return (
    rel === ".meta-kim/meta-kim-post-copy.mjs" ||
    rel.startsWith(".claude/agents/meta-") ||
    rel.startsWith(".codex/agents/meta-") ||
    rel.startsWith(".cursor/agents/meta-") ||
    rel.startsWith("openclaw/workspaces/meta-") ||
    rel.startsWith(".claude/skills/meta-theory/") ||
    rel.startsWith(".agents/skills/meta-theory/") ||
    rel.startsWith(".cursor/skills/meta-theory/") ||
    rel.startsWith("openclaw/skills/meta-theory/") ||
    rel.startsWith(".claude/capability-index/meta-kim-") ||
    rel.startsWith(".codex/capability-index/meta-kim-") ||
    rel.startsWith(".cursor/capability-index/meta-kim-") ||
    rel.startsWith("openclaw/capability-index/meta-kim-") ||
    // Hook scripts under each platform's hooks dir are Meta_Kim-managed when
    // their basename is on the canonical hook-file whitelist. Without this,
    // bootstrap misclassifies them as user files and aborts with
    // "user-owned file conflict" on every update.
    isMetaKimManagedHookRelPath(rel) ||
    rel === ".codex/commands/meta-theory.md"
  );
}

// Recognizes hook files shipped by Meta_Kim into a user's project hooks dir.
// Mirrors the GLOBAL_HOOK_PACKAGE_FILES whitelist so bootstrap correctly
// classifies them as owned by Meta_Kim (not as user-authored files).
function isMetaKimManagedHookRelPath(rel) {
  if (typeof rel !== "string") return false;
  const normalized = rel.replace(/\\/g, "/");
  let basename = null;
  if (normalized.startsWith(".claude/hooks/")) {
    basename = normalized.slice(".claude/hooks/".length);
  } else if (normalized.startsWith(".codex/hooks/")) {
    basename = normalized.slice(".codex/hooks/".length);
  } else if (normalized.startsWith(".cursor/hooks/")) {
    basename = normalized.slice(".cursor/hooks/".length);
  } else if (normalized.startsWith("openclaw/hooks/")) {
    basename = normalized.slice("openclaw/hooks/".length);
  }
  if (!basename) return false;
  const fileName = basename.split("/").pop();
  if (!fileName || !fileName.endsWith(".mjs")) return false;
  return (
    GLOBAL_HOOK_PACKAGE_FILES_LIST.includes(fileName) ||
    fileName === "spine-state.mjs" // legacy ghost file from older Meta_Kim installs
  );
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function parseJsonText(raw, filePath) {
  try {
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : {};
  } catch (error) {
    throw new Error(`${filePath} is not valid JSON: ${error.message}`);
  }
}

function readJsonObjectIfExists(filePath) {
  if (!existsSync(filePath)) return {};
  return parseJsonText(readFileSync(filePath, "utf8"), filePath);
}

function writeJsonObject(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalJson);
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])]),
    );
  }
  return value;
}

function jsonEquivalent(left, right) {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

function managedTextBlockMarkers(relPath) {
  const id = `META_KIM MANAGED BLOCK: ${normalizeDeployRelPath(relPath)}`;
  return {
    begin: `<!-- BEGIN ${id} -->`,
    end: `<!-- END ${id} -->`,
  };
}

function mergeManagedTextBlockPreserveBase(base, generated, relPath) {
  const existing = String(base ?? "");
  const nextBlock = String(generated ?? "").trimEnd();
  const { begin, end } = managedTextBlockMarkers(relPath);
  const block = `${begin}\n${nextBlock}\n${end}`;
  if (!existing.trim()) return `${block}\n`;
  if (existing.trimEnd() === block) return `${block}\n`;
  const escapedBegin = begin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockRe = new RegExp(`${escapedBegin}[\\s\\S]*?${escapedEnd}`);

  if (blockRe.test(existing)) {
    return `${existing.replace(blockRe, block).trimEnd()}\n`;
  }
  if (existing.trimEnd() === nextBlock) return `${block}\n`;
  return `${existing.trimEnd()}\n\n${block}\n`;
}

function stripManagedTextBlock(raw, relPath) {
  const { begin, end } = managedTextBlockMarkers(relPath);
  const escapedBegin = begin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockRe = new RegExp(`${escapedBegin}[\\s\\S]*?${escapedEnd}`, "g");
  return String(raw ?? "").replace(blockRe, "").trim();
}

function equivalentText(left, right) {
  return String(left ?? "").replace(/\r\n/g, "\n").trimEnd() ===
    String(right ?? "").replace(/\r\n/g, "\n").trimEnd();
}

function rewriteProjectDirRefs(raw, targetDir) {
  const sourceForward = PROJECT_DIR.replace(/\\/g, "/");
  const targetForward = targetDir.replace(/\\/g, "/");
  return String(raw)
    .replaceAll("__REPO_ROOT__", targetForward)
    .replaceAll(sourceForward, targetForward)
    .replaceAll(PROJECT_DIR, targetDir);
}

function cloneJson(value) {
  return value == null ? value : structuredClone(value);
}

function stableJsonKey(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function mergeArrayByIdPreserveBase(generated = [], base = []) {
  const result = cloneJson(base);
  const baseIds = new Map();
  for (let index = 0; index < result.length; index += 1) {
    const item = result[index];
    if (isPlainObject(item) && item.id) {
      baseIds.set(item.id, index);
    }
  }

  const seen = new Set(result.map(stableJsonKey));
  for (const item of generated) {
    if (isPlainObject(item) && item.id && baseIds.has(item.id)) {
      const index = baseIds.get(item.id);
      result[index] = mergeDeepPreserveBase(item, result[index]);
      continue;
    }
    const key = stableJsonKey(item);
    if (seen.has(key)) continue;
    result.push(cloneJson(item));
    seen.add(key);
  }
  return result;
}

function mergeDeepPreserveBase(generated, base) {
  if (Array.isArray(generated) || Array.isArray(base)) {
    return mergeArrayByIdPreserveBase(
      Array.isArray(generated) ? generated : [],
      Array.isArray(base) ? base : [],
    );
  }
  if (!isPlainObject(generated) || !isPlainObject(base)) {
    return base === undefined ? cloneJson(generated) : cloneJson(base);
  }

  const result = { ...cloneJson(generated), ...cloneJson(base) };
  for (const key of Object.keys(generated)) {
    if (base[key] === undefined) continue;
    if (isPlainObject(generated[key]) && isPlainObject(base[key])) {
      result[key] = mergeDeepPreserveBase(generated[key], base[key]);
    } else if (Array.isArray(generated[key]) || Array.isArray(base[key])) {
      result[key] = mergeArrayByIdPreserveBase(
        Array.isArray(generated[key]) ? generated[key] : [],
        Array.isArray(base[key]) ? base[key] : [],
      );
    }
  }
  return result;
}

function mergeMcpConfigPreserveBase(base, generated) {
  const merged = mergeDeepPreserveBase(generated, base);
  merged.mcpServers = {
    ...(generated.mcpServers ?? {}),
    ...(base.mcpServers ?? {}),
  };
  return merged;
}

function hookCommandKey(hook) {
  if (isPlainObject(hook) && typeof hook.command === "string") {
    return hook.command;
  }
  return stableJsonKey(hook);
}

function appendMissingHooks(existingHooks = [], generatedHooks = []) {
  const result = cloneJson(existingHooks);
  const seen = new Set(result.map(hookCommandKey));
  for (const hook of generatedHooks) {
    const key = hookCommandKey(hook);
    if (seen.has(key)) continue;
    result.push(cloneJson(hook));
    seen.add(key);
  }
  return result;
}

function mergeHookBlocks(existingBlocks = [], generatedBlocks = []) {
  const result = cloneJson(existingBlocks);
  for (const block of generatedBlocks) {
    if (!isPlainObject(block) || !Array.isArray(block.hooks)) {
      const key = stableJsonKey(block);
      if (!result.some((item) => stableJsonKey(item) === key)) {
        result.push(cloneJson(block));
      }
      continue;
    }

    const targetIndex = result.findIndex(
      (candidate) =>
        isPlainObject(candidate) &&
        candidate.matcher === block.matcher &&
        Array.isArray(candidate.hooks),
    );
    if (targetIndex === -1) {
      result.push(cloneJson(block));
      continue;
    }

    result[targetIndex] = {
      ...result[targetIndex],
      hooks: appendMissingHooks(result[targetIndex].hooks, block.hooks),
    };
  }
  return result;
}

function mergeHookConfigPreserveBase(base, generated) {
  const merged = mergeDeepPreserveBase(generated, base);
  const baseHooks = isPlainObject(base.hooks) ? base.hooks : {};
  const generatedHooks = isPlainObject(generated.hooks) ? generated.hooks : {};
  merged.hooks = { ...baseHooks };

  for (const [event, generatedEventValue] of Object.entries(generatedHooks)) {
    const existingEventValue = Array.isArray(baseHooks[event])
      ? baseHooks[event]
      : [];
    const generatedEvent = Array.isArray(generatedEventValue)
      ? generatedEventValue
      : [];
    const usesHookBlocks = generatedEvent.some(
      (item) => isPlainObject(item) && Array.isArray(item.hooks),
    );
    merged.hooks[event] = usesHookBlocks
      ? mergeHookBlocks(existingEventValue, generatedEvent)
      : appendMissingHooks(existingEventValue, generatedEvent);
  }

  return merged;
}

function prepareProjectDeployJson(relPath, srcPath, targetDir) {
  const rel = normalizeDeployRelPath(relPath);
  if (rel === ".mcp.json" || rel === ".cursor/mcp.json") {
    return { mcpServers: {} };
  }

  const raw = readFileSync(srcPath, "utf8");
  const parsed = parseJsonText(rewriteProjectDirRefs(raw, targetDir), srcPath);
  if (rel === "openclaw/openclaw.template.json") {
    delete parsed.mcp?.servers?.["meta-kim-runtime"];
  }
  return parsed;
}

function mergeProtectedProjectDeployFile(srcPath, destPath, relPath, targetDir) {
  writeJsonObject(
    destPath,
    plannedProtectedProjectDeployJson(srcPath, destPath, relPath, targetDir),
  );
  return 1;
}

function mergeProtectedProjectDeployTextFile(srcPath, destPath, relPath, targetDir) {
  writeFileSync(
    destPath,
    plannedProtectedProjectDeployText(srcPath, destPath, relPath, targetDir),
    "utf8",
  );
  return 1;
}

function plannedProtectedProjectDeployJson(srcPath, destPath, relPath, targetDir) {
  const rel = normalizeDeployRelPath(relPath);
  const base = readJsonObjectIfExists(destPath);
  const generated = prepareProjectDeployJson(rel, srcPath, targetDir);

  if (rel === ".claude/settings.json") {
    return mergeRepoClaudeSettings(base, generated, targetDir);
  }
  if (rel === ".mcp.json" || rel === ".cursor/mcp.json") {
    return mergeMcpConfigPreserveBase(base, generated);
  }
  if (rel === ".codex/hooks.json" || rel === ".cursor/hooks.json") {
    return mergeHookConfigPreserveBase(base, generated);
  }
  return mergeDeepPreserveBase(generated, base);
}

function plannedProtectedProjectDeployText(srcPath, destPath, relPath, targetDir) {
  const rel = normalizeDeployRelPath(relPath);
  const generated = rewriteProjectDirRefs(readFileSync(srcPath, "utf8"), targetDir);
  const base = existsSync(destPath) ? readFileSync(destPath, "utf8") : "";
  return mergeManagedTextBlockPreserveBase(base, generated, rel);
}

function copyProjectDeployFile(srcPath, destPath, relPath, targetDir) {
  const rel = normalizeDeployRelPath(relPath);
  if (shouldSkipProjectDeployPath(rel)) return 0;
  mkdirSync(dirname(destPath), { recursive: true });
  if (DEPLOY_PROTECTED_JSON_PATHS.has(rel)) {
    return mergeProtectedProjectDeployFile(srcPath, destPath, rel, targetDir);
  }
  if (DEPLOY_PROTECTED_TEXT_PATHS.has(rel)) {
    return mergeProtectedProjectDeployTextFile(srcPath, destPath, rel, targetDir);
  }
  cpSync(srcPath, destPath);
  return 1;
}

function copyDirRecursive(src, dest, context = {}) {
  if (!existsSync(src)) return 0;
  mkdirSync(dest, { recursive: true });
  let count = 0;
  const sourceRoot = context.sourceRoot || src;
  const targetDir = context.targetDir || dest;
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    const relPath = normalizeDeployRelPath(relative(sourceRoot, srcPath));
    if (entry.isDirectory()) {
      count += copyDirRecursive(srcPath, destPath, {
        sourceRoot,
        targetDir,
      });
    } else {
      count += copyProjectDeployFile(srcPath, destPath, relPath, targetDir);
    }
  }
  return count;
}

function projectDeployRootsForPlatform(platformId) {
  const roots = [];
  const add = (srcRel, destRel = srcRel) => roots.push({ srcRel, destRel });
  if (platformId === "claude" || platformId === "all") {
    add("CLAUDE.md");
  }
  if (
    platformId === "openclaw" ||
    platformId === "codex" ||
    platformId === "cursor" ||
    platformId === "all"
  ) {
    add("AGENTS.md");
  }

  // Replace whole-directory roots (.claude/.codex/.cursor/openclaw) with
  // explicit subpath roots so deploy only touches known runtime projection
  // surfaces and never recurses through unrelated local state.
  if (platformId === "claude" || platformId === "all") {
    add("canonical/agents", ".claude/agents");
    add("canonical/skills/meta-theory", ".claude/skills/meta-theory");
    add("config/capability-index", ".claude/capability-index");
    add("canonical/runtime-assets/claude/commands", ".claude/commands");
    add("canonical/runtime-assets/claude/settings.json", ".claude/settings.json");
    add("canonical/runtime-assets/claude/mcp.json", ".mcp.json");
  }
  if (platformId === "openclaw" || platformId === "all") {
    add("canonical/skills/meta-theory", "openclaw/skills/meta-theory");
    add("config/capability-index", "openclaw/capability-index");
    add(
      "canonical/runtime-assets/openclaw/openclaw.template.json",
      "openclaw/openclaw.template.json",
    );
  }
  if (platformId === "codex" || platformId === "all") {
    add("canonical/skills/meta-theory", ".agents/skills/meta-theory");
    add("config/capability-index", ".codex/capability-index");
    add("canonical/runtime-assets/codex/commands", ".codex/commands");
    add("canonical/runtime-assets/codex/hooks.json", ".codex/hooks.json");
    add(".codex/config.toml");
  }
  if (platformId === "cursor" || platformId === "all") {
    add("canonical/agents", ".cursor/agents");
    add("canonical/skills/meta-theory", ".cursor/skills/meta-theory");
    add("config/capability-index", ".cursor/capability-index");
    add("canonical/runtime-assets/cursor/rules", ".cursor/rules");
    add("canonical/runtime-assets/cursor/hooks.json", ".cursor/hooks.json");
    add("canonical/runtime-assets/claude/mcp.json", ".cursor/mcp.json");
  }
  return roots;
}

function collectDeployFilePlansFromRoot(srcRoot, destRoot, context = {}) {
  if (!existsSync(srcRoot)) return [];
  const sourceRoot = context.sourceRoot || srcRoot;
  const targetDir = context.targetDir || destRoot;
  const plans = [];
  if (!statSync(srcRoot).isDirectory()) {
    const relPath = normalizeDeployRelPath(
      context.destRelBase || relative(sourceRoot, srcRoot),
    );
    const destPath = join(targetDir, relPath);
    plans.push(projectDeployFilePlan(srcRoot, destPath, relPath, targetDir, context));
    return plans;
  }
  for (const entry of readdirSync(srcRoot, { withFileTypes: true })) {
    const srcPath = join(srcRoot, entry.name);
    const sourceRel = normalizeDeployRelPath(relative(sourceRoot, srcPath));
    const relPath = normalizeDeployRelPath(
      context.destRelBase ? join(context.destRelBase, sourceRel) : sourceRel,
    );
    const destPath = join(targetDir, relPath);
    if (entry.isDirectory()) {
      plans.push(
        ...collectDeployFilePlansFromRoot(srcPath, destPath, {
          sourceRoot,
          targetDir,
          managedRelPaths: context.managedRelPaths,
          destRelBase: context.destRelBase,
        }),
      );
    } else {
      plans.push(projectDeployFilePlan(srcPath, destPath, relPath, targetDir, context));
    }
  }
  return plans;
}

function projectDeployFilePlan(srcPath, destPath, relPath, targetDir, context = {}) {
  const rel = normalizeDeployRelPath(relPath);
  const skipped = shouldSkipProjectDeployPath(rel);
  const protectedJson = DEPLOY_PROTECTED_JSON_PATHS.has(rel);
  const protectedText = DEPLOY_PROTECTED_TEXT_PATHS.has(rel);
  const exists = existsSync(destPath);
  const contentStatus = projectDeployFileContentStatus(srcPath, destPath, rel, {
    skipped,
    protectedJson,
    protectedText,
    targetDir,
  });
  const managedByManifest = context.managedRelPaths?.has(rel) === true;
  const metaKimOwnedPath = isMetaKimNamespacedProjectPath(rel);
  const unknownExistingConflict =
    exists &&
    contentStatus !== "same" &&
    !skipped &&
    !protectedJson &&
    !protectedText &&
    !managedByManifest &&
    !metaKimOwnedPath;
  const mergePolicy = skipped
    ? "never_touch"
    : protectedJson
      ? "additive_preserve_user_state_json"
      : protectedText
        ? "managed_block_preserve_user_text"
        : unknownExistingConflict
          ? "user_owned_existing_file_conflict"
        : exists
          ? managedByManifest
            ? "manifest_managed_projection_replace"
            : "meta_kim_namespaced_projection_replace"
          : "generated_projection_create";
  return {
    relPath: rel,
    source: normalizeDeployRelPath(relative(PROJECT_DIR, srcPath)),
    exists,
    contentStatus,
    ownership: skipped
      ? "local_state"
      : protectedJson || protectedText
        ? "shared_config_merge"
        : managedByManifest
          ? "manifest_managed"
          : metaKimOwnedPath
            ? "meta_kim_owned"
            : exists
              ? "unknown_existing"
              : "new_file",
    action: skipped
      ? "skip"
      : protectedText
        ? "merge"
        : exists && protectedJson
        ? "merge"
        : unknownExistingConflict
          ? "conflict"
        : exists
          ? "replace"
          : "create",
    effectiveAction:
      skipped || contentStatus === "same"
        ? "unchanged"
        : protectedText
          ? "merge"
          : exists && protectedJson
          ? "merge"
          : unknownExistingConflict
            ? "conflict"
          : exists
            ? "replace"
            : "create",
    mergePolicy,
  };
}

function projectGeneratedFilePlan(relPath, content, targetDir, source) {
  const rel = normalizeDeployRelPath(relPath);
  const destPath = join(targetDir, rel);
  const exists = existsSync(destPath);
  const current = exists ? readFileSync(destPath, "utf8") : null;
  const contentStatus = !exists ? "missing" : current === content ? "same" : "different";
  return {
    relPath: rel,
    source,
    content,
    exists,
    contentStatus,
    ownership: isMetaKimNamespacedProjectPath(rel)
      ? "meta_kim_owned"
      : exists
        ? "unknown_existing"
        : "new_file",
    action: exists ? "replace" : "create",
    effectiveAction: contentStatus === "same" ? "unchanged" : exists ? "replace" : "create",
    mergePolicy: exists
      ? "meta_kim_namespaced_projection_replace"
      : "generated_projection_create",
  };
}

function projectDeployFileContentStatus(
  srcPath,
  destPath,
  relPath,
  { skipped, protectedJson, protectedText, targetDir },
) {
  if (skipped) return "skip";
  if (!existsSync(destPath)) return "missing";
  if (protectedJson) {
    const current = readJsonObjectIfExists(destPath);
    const planned = plannedProtectedProjectDeployJson(srcPath, destPath, relPath, targetDir);
    return jsonEquivalent(current, planned) ? "same" : "different";
  }
  if (protectedText) {
    const current = readFileSync(destPath, "utf8");
    const planned = plannedProtectedProjectDeployText(srcPath, destPath, relPath, targetDir);
    return current === planned ? "same" : "different";
  }
  return readFileSync(srcPath).equals(readFileSync(destPath)) ? "same" : "different";
}

function collectProjectDeployPlan(activeTargets, targetDir) {
  const plans = [];
  const seen = new Set();
  const managedRelPaths = previousProjectManagedRelPaths(targetDir);
  for (const platformId of activeTargets) {
    for (const root of projectDeployRootsForPlatform(platformId)) {
      const src = join(PROJECT_DIR, root.srcRel);
      const dest = join(targetDir, root.destRel);
      for (const plan of collectDeployFilePlansFromRoot(src, dest, {
        sourceRoot: root.destRel !== root.srcRel ? src : PROJECT_DIR,
        targetDir,
        managedRelPaths,
        destRelBase: root.destRel !== root.srcRel ? root.destRel : null,
      })) {
        if (seen.has(plan.relPath)) continue;
        seen.add(plan.relPath);
        plans.push(plan);
      }
    }
    for (const plan of projectHookGeneratedPlans(platformId, targetDir)) {
      if (seen.has(plan.relPath)) continue;
      seen.add(plan.relPath);
      plans.push(plan);
    }
  }
  return plans.sort((left, right) => left.relPath.localeCompare(right.relPath));
}

function readPackageVersion() {
  try {
    return JSON.parse(readFileSync(join(PROJECT_DIR, "package.json"), "utf8")).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function readSyncSourceChain() {
  const syncPath = join(PROJECT_DIR, "config", "sync.json");
  let sync = {};
  try {
    sync = JSON.parse(readFileSync(syncPath, "utf8"));
  } catch {
    sync = {};
  }
  return {
    packageRoot: PROJECT_DIR,
    binEntrypoint: "bin/meta-kim.mjs",
    setupEntrypoint: "setup.mjs --project-bootstrap",
    syncManifest: "config/sync.json",
    canonicalRoots: sync.canonicalRoots ?? {},
    generatedTargets: sync.generatedTargets ?? {},
    projectProjectionSource:
      "Generated runtime mirrors are read from the installed Meta_Kim package root after canonical sync.",
  };
}

function projectBootstrapManifestPath(targetDir) {
  return join(targetDir, ".meta-kim", "state", "default", "project-bootstrap.json");
}

function readProjectBootstrapManifest(targetDir) {
  const manifestPath = projectBootstrapManifestPath(targetDir);
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }
}

function previousProjectManagedRelPaths(targetDir) {
  const manifest = readProjectBootstrapManifest(targetDir);
  const managedFiles = Array.isArray(manifest?.managedFiles) ? manifest.managedFiles : [];
  return new Set(
    managedFiles
      .map((file) => normalizeDeployRelPath(file?.relPath ?? ""))
      .filter(Boolean),
  );
}

function previousProjectManagedFileMap(targetDir) {
  const manifest = readProjectBootstrapManifest(targetDir);
  const managedFiles = Array.isArray(manifest?.managedFiles) ? manifest.managedFiles : [];
  const result = new Map();
  for (const file of managedFiles) {
    const relPath = normalizeDeployRelPath(file?.relPath ?? "");
    if (!relPath) continue;
    result.set(relPath, file);
  }
  return result;
}

function isProjectLocalCapabilityAsset(relPath) {
  const rel = normalizeDeployRelPath(relPath);
  if (!rel || PROJECT_BOOTSTRAP_MERGED_CONFIG_PATHS.has(rel)) return false;
  return PROJECT_LOCAL_CAPABILITY_PREFIXES.some((prefix) => rel.startsWith(prefix));
}

function projectInstructionRelPathsForTargets(activeTargets) {
  const targets = activeTargets.includes("all")
    ? ["claude", "codex", "cursor", "openclaw"]
    : activeTargets;
  const rels = new Set();
  if (targets.includes("claude")) rels.add("CLAUDE.md");
  if (
    targets.includes("codex") ||
    targets.includes("cursor") ||
    targets.includes("openclaw")
  ) {
    rels.add("AGENTS.md");
  }
  return [...rels];
}

function isRedundantProjectInstructionFile(targetDir, relPath) {
  const rel = normalizeDeployRelPath(relPath);
  const targetPath = join(targetDir, rel);
  const sourcePath = join(PROJECT_DIR, rel);
  if (!existsSync(targetPath) || !existsSync(sourcePath)) return false;
  const stats = statSync(targetPath);
  if (!stats.isFile()) return false;
  const current = readFileSync(targetPath, "utf8");
  const generated = rewriteProjectDirRefs(readFileSync(sourcePath, "utf8"), targetDir);
  const userText = stripManagedTextBlock(current, rel);
  const metaKimProjectionSignature =
    (rel === "AGENTS.md" && userText.trimStart().startsWith("# Meta_Kim for Codex")) ||
    (rel === "CLAUDE.md" &&
      userText.trimStart().startsWith("# Meta_Kim for Claude Code"));
  return (
    equivalentText(current, generated) ||
    equivalentText(userText, "") ||
    equivalentText(userText, generated) ||
    metaKimProjectionSignature
  );
}

function removeRedundantProjectInstructionFiles(targetDir, activeTargets) {
  const removed = [];
  const skipped = [];
  const root = resolve(targetDir);
  for (const relPath of projectInstructionRelPathsForTargets(activeTargets)) {
    const rel = normalizeDeployRelPath(relPath);
    const absPath = resolve(targetDir, rel);
    if (!isPathInsideDir(absPath, root)) {
      skipped.push({ relPath: rel, reason: "outside_target_dir" });
      continue;
    }
    if (!isRedundantProjectInstructionFile(targetDir, rel)) continue;
    if (!removeUntrackedProjectPath(targetDir, rel, skipped, { recursive: false })) {
      continue;
    }
    removed.push(rel);
    pruneEmptyProjectDirs(targetDir, rel);
  }
  return { removed, skipped };
}

function projectAssetCleanupBucket(relPath) {
  const rel = normalizeDeployRelPath(relPath);
  const runtime = rel.startsWith(".claude/")
    ? "Claude Code"
    : rel.startsWith(".codex/") || rel.startsWith(".agents/")
      ? "Codex"
      : rel.startsWith(".cursor/")
        ? "Cursor"
        : rel.startsWith("openclaw/")
          ? "OpenClaw"
          : "Other";
  const type = rel.includes("/agents/") || rel.startsWith("openclaw/workspaces/")
    ? "agents"
    : rel.includes("/skills/")
      ? "skills"
      : rel.includes("/commands/")
        ? "Commands"
        : rel.includes("/hooks/")
          ? "hooks"
          : rel.includes("/rules/")
            ? "rules"
            : rel.includes("/capability-index/")
              ? "capability-index"
              : "assets";
  return `${runtime} ${type}`;
}

function summarizeProjectAssetCleanup(removed) {
  const counts = new Map();
  for (const relPath of removed) {
    const bucket = projectAssetCleanupBucket(relPath);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([bucket, count]) => `${bucket}: ${count}`);
}

function isPathInsideDir(absPath, absDir) {
  const rel = relative(absDir, absPath);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function isGitTrackedProjectPath(targetDir, relPath) {
  if (!existsSync(join(targetDir, ".git"))) return false;
  const rel = normalizeDeployRelPath(relPath);
  const probe = spawnSync("git", ["-C", targetDir, "ls-files", "--", rel], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (probe.status !== 0) return false;
  return probe.stdout.trim().length > 0;
}

function removeUntrackedProjectPath(targetDir, relPath, skipped, options = {}) {
  const rel = normalizeDeployRelPath(relPath);
  const root = resolve(targetDir);
  const absPath = resolve(targetDir, rel);
  if (!isPathInsideDir(absPath, root)) {
    skipped.push({ relPath: rel, reason: "outside_target_dir" });
    return false;
  }
  if (!existsSync(absPath)) return false;
  if (isGitTrackedProjectPath(targetDir, rel)) {
    skipped.push({ relPath: rel, reason: "git_tracked_preserved" });
    return false;
  }
  rmSync(absPath, { recursive: options.recursive !== false, force: true });
  return true;
}

function pruneEmptyProjectDirs(targetDir, relPath) {
  let currentDir = dirname(join(targetDir, normalizeDeployRelPath(relPath)));
  const root = resolve(targetDir);
  while (currentDir !== root && isPathInsideDir(currentDir, root)) {
    let entries = [];
    try {
      entries = readdirSync(currentDir);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    if (entries.length > 0) return;
    rmSync(currentDir, { recursive: true, force: true });
    currentDir = dirname(currentDir);
  }
}

function removeStaleManagedProjectAssets(
  targetDir,
  currentFilePlans,
  options = {},
) {
  const removeCurrentManaged = options.removeCurrentManaged === true;
  const currentRelPaths = new Set(
    currentFilePlans.map((file) => normalizeDeployRelPath(file.relPath)).filter(Boolean),
  );
  const previousRelPaths = previousProjectManagedRelPaths(targetDir);
  const removed = [];
  const skipped = [];
  const root = resolve(targetDir);

  // cleanupProjectRedundancyDirs (removeCurrentManaged) must delete every
  // capability asset the current plan would install — including cursor/openclaw
  // roots that are absent from the historical manifest (which only recorded the
  // bootstrap-time activeTargets, e.g. [claude,codex]). Without unioning
  // currentRelPaths, those runtimes' project-level agents/skills/workspaces are
  // never cleaned and the global-single-source intent silently leaks.
  const cleanupSources = removeCurrentManaged
    ? Array.from(new Set([...previousRelPaths, ...currentRelPaths]))
    : Array.from(previousRelPaths);
  for (const relPath of cleanupSources) {
    if (!removeCurrentManaged && currentRelPaths.has(relPath)) continue;
    if (!isProjectLocalCapabilityAsset(relPath)) continue;
    const absPath = resolve(targetDir, relPath);
    if (!isPathInsideDir(absPath, root)) {
      skipped.push({ relPath, reason: "outside_target_dir" });
      continue;
    }
    if (!existsSync(absPath)) continue;
    const stats = statSync(absPath);
    if (!stats.isFile()) {
      skipped.push({ relPath, reason: "not_a_file" });
      continue;
    }
    if (!removeUntrackedProjectPath(targetDir, relPath, skipped, { recursive: false })) {
      continue;
    }
    removed.push(relPath);
    pruneEmptyProjectDirs(targetDir, relPath);
  }

  return { removed, skipped };
}

const LEGACY_PROJECT_CAPABILITY_RELS_BY_PLATFORM = {
  claude: [
    ".claude/skills/meta-theory.md",
    ".claude/skills/references",
  ],
  codex: [
    ".codex/skills/meta-theory.md",
    ".codex/skills/references",
    ".codex/skills/meta-theory",
  ],
  cursor: [
    ".cursor/skills/meta-theory.md",
    ".cursor/skills/references",
  ],
  openclaw: [
    "openclaw/skills/meta-theory.md",
    "openclaw/skills/references",
  ],
};

function mergeProjectCleanupResults(...cleanups) {
  return {
    removed: cleanups.flatMap((cleanup) => cleanup?.removed ?? []),
    skipped: cleanups.flatMap((cleanup) => cleanup?.skipped ?? []),
  };
}

function legacyProjectCapabilityRelPaths(activeTargets) {
  const targets = activeTargets.includes("all")
    ? Object.keys(LEGACY_PROJECT_CAPABILITY_RELS_BY_PLATFORM)
    : activeTargets;
  return [
    ...new Set(
      targets.flatMap(
        (target) => LEGACY_PROJECT_CAPABILITY_RELS_BY_PLATFORM[target] ?? [],
      ),
    ),
  ];
}

function removeLegacyProjectCapabilityEntrypoints(targetDir, activeTargets) {
  const removed = [];
  const skipped = [];
  const root = resolve(targetDir);

  for (const relPath of legacyProjectCapabilityRelPaths(activeTargets)) {
    const rel = normalizeDeployRelPath(relPath);
    const absPath = resolve(targetDir, rel);
    if (!isPathInsideDir(absPath, root)) {
      skipped.push({ relPath: rel, reason: "outside_target_dir" });
      continue;
    }
    if (!existsSync(absPath)) continue;
    if (!removeUntrackedProjectPath(targetDir, rel, skipped)) continue;
    removed.push(rel);
    pruneEmptyProjectDirs(targetDir, rel);
  }

  return { removed, skipped };
}

const GLOBAL_CLEANUP_PROJECT_CAPABILITY_ROOTS_BY_PLATFORM = {
  claude: [
    ".claude/skills/meta-theory",
  ],
  codex: [
    ".agents/skills/meta-theory",
  ],
  cursor: [
    ".cursor/skills/meta-theory",
  ],
  openclaw: [
    "openclaw/skills/meta-theory",
  ],
};

function globalCleanupProjectCapabilityRoots(activeTargets) {
  const targets = activeTargets.includes("all")
    ? Object.keys(GLOBAL_CLEANUP_PROJECT_CAPABILITY_ROOTS_BY_PLATFORM)
    : activeTargets;
  return [
    ...new Set(
      targets.flatMap(
        (target) => GLOBAL_CLEANUP_PROJECT_CAPABILITY_ROOTS_BY_PLATFORM[target] ?? [],
      ),
    ),
  ];
}

function removeGlobalProjectCapabilityRoots(targetDir, activeTargets) {
  const removed = [];
  const skipped = [];
  const root = resolve(targetDir);

  for (const relPath of globalCleanupProjectCapabilityRoots(activeTargets)) {
    const rel = normalizeDeployRelPath(relPath);
    const absPath = resolve(targetDir, rel);
    if (!isPathInsideDir(absPath, root)) {
      skipped.push({ relPath: rel, reason: "outside_target_dir" });
      continue;
    }
    if (!existsSync(absPath)) continue;
    if (!removeUntrackedProjectPath(targetDir, rel, skipped)) continue;
    removed.push(rel);
    pruneEmptyProjectDirs(targetDir, rel);
  }

  return { removed, skipped };
}

function expandedCleanupTargets(activeTargets) {
  return activeTargets.includes("all")
    ? ["claude", "codex", "cursor", "openclaw"]
    : activeTargets;
}

function targetValuesForPlatforms(map, activeTargets) {
  return [
    ...new Set(
      expandedCleanupTargets(activeTargets).flatMap((target) => map[target] ?? []),
    ),
  ];
}

function readTextIfFile(filePath) {
  if (!existsSync(filePath)) return "";
  const stats = statSync(filePath);
  if (!stats.isFile()) return "";
  return readFileSync(filePath, "utf8");
}

function isMetaKimGeneratedSkillDirectory(dirPath) {
  const skillPath = join(dirPath, "SKILL.md");
  const raw = readTextIfFile(skillPath);
  if (!raw.trim()) return false;
  const markerRe =
    /\b(author:\s*Meta_Kim|sourceGapId:\s*gap-|approvalEvidence:\s*warden-approved|Reusable Meta_Kim|Meta_Kim executable governance dispatcher)\b/u;
  return markerRe.test(raw);
}

function removeMetaKimGeneratedProjectSkillResidue(targetDir, activeTargets) {
  const removed = [];
  const skipped = [];
  const root = resolve(targetDir);
  for (const relRoot of targetValuesForPlatforms(PROJECT_SKILL_ROOTS_BY_PLATFORM, activeTargets)) {
    const absRoot = resolve(targetDir, relRoot);
    if (!isPathInsideDir(absRoot, root)) {
      skipped.push({ relPath: normalizeDeployRelPath(relRoot), reason: "outside_target_dir" });
      continue;
    }
    if (!existsSync(absRoot)) continue;
    for (const entry of readdirSync(absRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const absPath = join(absRoot, entry.name);
      const relPath = normalizeDeployRelPath(relative(targetDir, absPath));
      if (!isMetaKimGeneratedSkillDirectory(absPath)) continue;
      if (!removeUntrackedProjectPath(targetDir, relPath, skipped)) continue;
      removed.push(relPath);
      pruneEmptyProjectDirs(targetDir, relPath);
    }
  }
  return { removed, skipped };
}

function directoryContainsFiles(dirPath) {
  if (!existsSync(dirPath)) return false;
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = join(dirPath, entry.name);
    if (entry.isFile()) return true;
    if (entry.isDirectory() && directoryContainsFiles(entryPath)) return true;
  }
  return false;
}

function isMetaKimOpenClawHookDirectory(dirPath) {
  const hookDoc = readTextIfFile(join(dirPath, "HOOK.md"));
  return hookDoc.includes("Meta_Kim") || hookDoc.includes("mcp-memory-service");
}

function removeMetaKimOpenClawDirectoryResidue(targetDir, activeTargets) {
  const removed = [];
  const skipped = [];
  if (!expandedCleanupTargets(activeTargets).includes("openclaw")) {
    return { removed, skipped };
  }
  const root = resolve(targetDir);
  const hookRoot = resolve(targetDir, "openclaw/hooks");
  if (isPathInsideDir(hookRoot, root) && existsSync(hookRoot)) {
    for (const entry of readdirSync(hookRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const absPath = join(hookRoot, entry.name);
      const relPath = normalizeDeployRelPath(relative(targetDir, absPath));
      if (!isMetaKimOpenClawHookDirectory(absPath)) continue;
      if (!removeUntrackedProjectPath(targetDir, relPath, skipped)) continue;
      removed.push(relPath);
      pruneEmptyProjectDirs(targetDir, relPath);
    }
  } else if (!isPathInsideDir(hookRoot, root)) {
    skipped.push({ relPath: "openclaw/hooks", reason: "outside_target_dir" });
  }

  const workspaceRoot = resolve(targetDir, "openclaw/workspaces");
  if (isPathInsideDir(workspaceRoot, root) && existsSync(workspaceRoot)) {
    for (const entry of readdirSync(workspaceRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith("meta-")) continue;
      const absPath = join(workspaceRoot, entry.name);
      const relPath = normalizeDeployRelPath(relative(targetDir, absPath));
      if (directoryContainsFiles(absPath)) continue;
      if (!removeUntrackedProjectPath(targetDir, relPath, skipped)) continue;
      removed.push(relPath);
      pruneEmptyProjectDirs(targetDir, relPath);
    }
  } else if (!isPathInsideDir(workspaceRoot, root)) {
    skipped.push({ relPath: "openclaw/workspaces", reason: "outside_target_dir" });
  }

  return { removed, skipped };
}

function stripMetaKimMcpServersFromConfig(config = {}) {
  const next = cloneJson(config && typeof config === "object" ? config : {});
  if (isPlainObject(next.mcpServers)) {
    for (const key of ["meta-kim-runtime", "mcp-memory-service"]) {
      delete next.mcpServers[key];
    }
  }
  if (isPlainObject(next.mcp?.servers)) {
    for (const key of ["meta-kim-runtime", "mcp-memory-service"]) {
      delete next.mcp.servers[key];
    }
  }
  return next;
}

function stripMetaKimOpenClawTemplate(config = {}) {
  const next = stripMetaKimMcpServersFromConfig(config);
  if (Array.isArray(next.agents?.list)) {
    next.agents.list = next.agents.list.filter(
      (agent) => !String(agent?.id ?? "").startsWith("meta-"),
    );
  }
  if (Array.isArray(next.tools?.agentToAgent?.allow)) {
    next.tools.agentToAgent.allow = next.tools.agentToAgent.allow.filter(
      (id) => !String(id ?? "").startsWith("meta-"),
    );
  }
  if (Array.isArray(next.skills?.load?.extraDirs)) {
    next.skills.load.extraDirs = next.skills.load.extraDirs.filter(
      (dir) => !String(dir ?? "").replace(/\\/g, "/").includes("/openclaw/skills"),
    );
  }
  return next;
}

function stripMetaKimProjectConfig(relPath, config = {}) {
  const rel = normalizeDeployRelPath(relPath);
  let next = cloneJson(config && typeof config === "object" ? config : {});
  if (rel.endsWith("hooks.json") || rel === ".claude/settings.json") {
    next = stripProjectMetaKimHooksFromHookConfig(next);
  }
  if (rel.endsWith("mcp.json") || rel === ".mcp.json") {
    next = stripMetaKimMcpServersFromConfig(next);
  }
  if (rel === "openclaw/openclaw.template.json") {
    next = stripMetaKimOpenClawTemplate(next);
  }
  return next;
}

function generatedProjectConfigVariantsForRel(targetDir, relPath, currentFilePlans = []) {
  const rel = normalizeDeployRelPath(relPath);
  const plan = currentFilePlans.find(
    (file) => normalizeDeployRelPath(file.relPath) === rel,
  );
  const sourcePath = join(PROJECT_DIR, plan?.source ?? rel);
  if (!existsSync(sourcePath)) return null;
  const raw = readFileSync(sourcePath, "utf8");
  const candidates = [raw, rewriteProjectDirRefs(raw, targetDir)];
  const variants = [];
  const seen = new Set();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    variants.push(parseJsonText(candidate, sourcePath));
  }
  return variants;
}

function isEmptyProjectConfigShell(config = {}) {
  if (!isPlainObject(config)) return false;
  return Object.entries(config).every(([key, value]) => {
    if (key === "version") return true;
    if (Array.isArray(value)) return value.length === 0;
    if (isPlainObject(value)) return Object.keys(value).length === 0;
    return value === null || value === "" || value === false;
  });
}

function isGeneratedOnlyProjectConfig(targetDir, relPath, config, currentFilePlans = []) {
  const rel = normalizeDeployRelPath(relPath);
  const previousFiles = previousProjectManagedFileMap(targetDir);
  const plan = currentFilePlans.find((file) => normalizeDeployRelPath(file.relPath) === rel);
  const hasMetaKimManagementEvidence =
    previousFiles.has(rel) ||
    plan?.ownership === "shared_config_merge" ||
    plan?.mergePolicy === "additive_preserve_user_state_json";
  if (!hasMetaKimManagementEvidence) return false;
  const generatedVariants = generatedProjectConfigVariantsForRel(
    targetDir,
    rel,
    currentFilePlans,
  );
  if (!generatedVariants) return false;
  return generatedVariants.some((generated) => {
    const strippedGenerated = stripMetaKimProjectConfig(rel, generated);
    return jsonEquivalent(config, generated) || jsonEquivalent(config, strippedGenerated);
  });
}

function cleanupRedundantProjectConfigs(targetDir, activeTargets, currentFilePlans = []) {
  const removed = [];
  const skipped = [];
  const root = resolve(targetDir);
  const relPaths = targetValuesForPlatforms(
    PROJECT_META_KIM_CONFIG_RELS_BY_PLATFORM,
    activeTargets,
  );
  for (const relPath of relPaths) {
    const rel = normalizeDeployRelPath(relPath);
    const absPath = resolve(targetDir, rel);
    if (!isPathInsideDir(absPath, root)) {
      skipped.push({ relPath: rel, reason: "outside_target_dir" });
      continue;
    }
    if (!existsSync(absPath)) continue;
    const current = readJsonObjectIfExists(absPath);
    if (!current) continue;
    const stripped = stripMetaKimProjectConfig(rel, current);
    const shouldDelete =
      isEmptyProjectConfigShell(stripped) ||
      isGeneratedOnlyProjectConfig(targetDir, rel, stripped, currentFilePlans);
    if (shouldDelete) {
      if (!removeUntrackedProjectPath(targetDir, rel, skipped, { recursive: false })) {
        continue;
      }
      removed.push(rel);
      pruneEmptyProjectDirs(targetDir, rel);
      continue;
    }
    if (!jsonEquivalent(current, stripped)) {
      if (isGitTrackedProjectPath(targetDir, rel)) {
        skipped.push({ relPath: rel, reason: "git_tracked_preserved" });
        continue;
      }
      writeJsonObject(absPath, stripped);
    }
  }
  return { removed, skipped };
}

function isMetaKimProjectTaskState(filePath) {
  const raw = readTextIfFile(filePath);
  return raw.includes("auto-save from Stop hook") && raw.includes("meta_kim");
}

function removeMetaKimProjectLocalState(targetDir) {
  const removed = [];
  const skipped = [];
  const root = resolve(targetDir);
  for (const relPath of PROJECT_META_KIM_LOCAL_STATE_RELS) {
    const rel = normalizeDeployRelPath(relPath);
    const absPath = resolve(targetDir, rel);
    if (!isPathInsideDir(absPath, root)) {
      skipped.push({ relPath: rel, reason: "outside_target_dir" });
      continue;
    }
    if (!existsSync(absPath)) continue;
    if (rel === ".claude/project-task-state.json" && !isMetaKimProjectTaskState(absPath)) {
      skipped.push({ relPath: rel, reason: "local_state_not_meta_kim_signed" });
      continue;
    }
    if (!removeUntrackedProjectPath(targetDir, rel, skipped)) continue;
    removed.push(rel);
    pruneEmptyProjectDirs(targetDir, rel);
  }
  return { removed, skipped };
}

function pruneEmptyDirsPostOrder(absDir, targetRoot, removed, targetDir) {
  if (!existsSync(absDir) || !isPathInsideDir(absDir, targetRoot)) return;
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    pruneEmptyDirsPostOrder(join(absDir, entry.name), targetRoot, removed, targetDir);
  }
  if (absDir === targetRoot) return;
  const entries = readdirSync(absDir);
  if (entries.length > 0) return;
  rmSync(absDir, { recursive: true, force: true });
  removed.push(normalizeDeployRelPath(relative(targetDir, absDir)));
}

function pruneEmptyProjectRuntimeDirs(targetDir, activeTargets) {
  const removed = [];
  const skipped = [];
  const root = resolve(targetDir);
  const roots = [
    ...targetValuesForPlatforms(PROJECT_SKILL_ROOTS_BY_PLATFORM, activeTargets),
    ".agents",
    ".claude",
    ".codex",
    "openclaw",
    ".cursor",
  ];
  for (const relRoot of [...new Set(roots)]) {
    const absRoot = resolve(targetDir, relRoot);
    if (!isPathInsideDir(absRoot, root)) {
      skipped.push({ relPath: normalizeDeployRelPath(relRoot), reason: "outside_target_dir" });
      continue;
    }
    if (!existsSync(absRoot)) continue;
    pruneEmptyDirsPostOrder(absRoot, root, removed, targetDir);
  }
  return { removed, skipped };
}

function stripStaleProjectHookConfigs(targetDir, currentFilePlans) {
  const currentRelPaths = new Set(
    currentFilePlans.map((file) => normalizeDeployRelPath(file.relPath)).filter(Boolean),
  );
  const previousFiles = previousProjectManagedFileMap(targetDir);
  const hookConfigPaths = new Set([
    ".claude/settings.json",
    ".codex/hooks.json",
    ".cursor/hooks.json",
  ]);
  const changed = [];

  for (const relPath of previousFiles.keys()) {
    if (currentRelPaths.has(relPath)) continue;
    if (!hookConfigPaths.has(relPath)) continue;
    const configPath = join(targetDir, relPath);
    if (!existsSync(configPath)) continue;
    const current = readJsonObjectIfExists(configPath);
    if (!current) continue;
    const stripped = stripProjectMetaKimHooksFromHookConfig(current);
    if (jsonEquivalent(current, stripped)) continue;
    if (isGitTrackedProjectPath(targetDir, relPath)) continue;
    writeJsonObject(configPath, stripped);
    changed.push(relPath);
  }

  return changed;
}

function reportProjectAssetCleanup(cleanup, options = {}) {
  if (jsonOutputMode || !cleanup) return;
  if (cleanup.removed.length > 0) {
    const isRetarget = options.reason === "project_retarget";
    const isGlobalRedundancy = options.reason === "global_redundancy";
    // Batch cleanup prints intro/scope once at the heading; per-project only
    // report what was removed to avoid N× repeated boilerplate across dirs.
    if (!isGlobalRedundancy) {
      info(
        isRetarget
          ? t.projectAssetsRetargetCleanupIntro
          : t.projectAssetsCleanupIntro,
      );
      info(
        isRetarget
          ? t.projectAssetsRetargetCleanupScope
          : t.projectAssetsCleanupScope,
      );
    }
    info(
      t.projectAssetsCleanupRemoved(
        cleanup.removed.length,
        summarizeProjectAssetCleanup(cleanup.removed),
      ),
    );
  } else if (options.reason === "global_redundancy") {
    info(t.projectAssetsCleanupAllClean ?? t.projectAssetsCleanupRemoved(0, []));
  }
  if (cleanup.skipped.length > 0) {
    info(t.projectAssetsCleanupSkipped(cleanup.skipped.length));
  }
}

function projectBootstrapStatus(targetDir, activeTargets, filePlans) {
  const existingManifest = readProjectBootstrapManifest(targetDir);
  const version = readPackageVersion();
  const actionable = filePlans.filter((plan) => plan.action !== "skip");
  const pending = actionable.filter((plan) => plan.effectiveAction !== "unchanged");
  const missingCount = pending.filter((plan) => !plan.exists).length;
  const createCount = pending.filter((plan) => plan.effectiveAction === "create").length;
  const mergeCount = pending.filter((plan) => plan.effectiveAction === "merge").length;
  const replaceCount = pending.filter((plan) => plan.effectiveAction === "replace").length;
  const conflictCount = pending.filter((plan) => plan.effectiveAction === "conflict").length;
  const targetChanged =
    Boolean(existingManifest) &&
    JSON.stringify(existingManifest.activeTargets ?? []) !== JSON.stringify(activeTargets);
  const versionChanged =
    Boolean(existingManifest) &&
    Boolean(existingManifest.metaKimVersion) &&
    existingManifest.metaKimVersion !== version;
  const status = conflictCount > 0
    ? "conflict"
    : versionChanged
    ? "stale"
    : targetChanged
      ? "target_scope_changed"
    : !existingManifest && missingCount > 0
      ? "missing"
      : existingManifest && (replaceCount > 0 || mergeCount > 0 || createCount > 0 || missingCount > 0)
        ? "repair_required"
        : replaceCount > 0 || mergeCount > 0 || createCount > 0
          ? "ready_with_existing_config"
        : existingManifest
          ? "ready"
          : "ready_with_existing_config";
  return {
    status,
    requiresConfirmation: status !== "ready",
    confirmationReason:
      status === "ready"
        ? "Project bootstrap manifest and project-specific files are current; no project write is needed."
        : status === "conflict"
          ? "Existing project files overlap Meta_Kim generated paths but are not known to be Meta_Kim-owned; resolve conflicts before apply."
          : status === "stale"
          ? "Existing project bootstrap manifest uses a different Meta_Kim version."
          : status === "target_scope_changed"
            ? "Selected runtime targets differ from the previous project bootstrap manifest."
          : status === "missing"
            ? "Project context/config/state or confirmed overrides are missing one or more required files."
            : status === "repair_required"
              ? "Project bootstrap version is current, but managed files need repair, merge, or recreation."
              : "Project has existing or equivalent config but still needs a confirmed bootstrap to record state or apply pending changes.",
    metaKimVersion: version,
    targetDir,
    activeTargets,
    counts: {
      total: filePlans.length,
      create: createCount,
      merge: mergeCount,
      replace: replaceCount,
      conflict: conflictCount,
      skip: filePlans.filter((plan) => plan.action === "skip").length,
      missing: missingCount,
      unchanged: actionable.length - pending.length,
      pending: pending.length,
    },
    previousManifest: existingManifest
      ? {
          metaKimVersion: existingManifest.metaKimVersion ?? null,
          appliedAt: existingManifest.appliedAt ?? null,
          activeTargets: existingManifest.activeTargets ?? [],
          targetChanged,
        }
      : null,
  };
}

function projectBootstrapWritePreview(targetDir, filePlans, state) {
  const pending = filePlans.filter(
    (plan) => plan.action !== "skip" && plan.effectiveAction !== "unchanged",
  );
  const conflicts = pending.filter((plan) => plan.effectiveAction === "conflict");
  const writablePending = pending.filter((plan) => plan.effectiveAction !== "conflict");
  const existing = writablePending.filter((plan) => existsSync(join(targetDir, plan.relPath)));
  const projectWrites = filePlans
    .filter(
      (plan) =>
        plan.action !== "skip" &&
        plan.effectiveAction !== "unchanged" &&
        plan.effectiveAction !== "conflict",
    )
    .map((plan) => ({
      relPath: plan.relPath,
      action: plan.effectiveAction,
      plannedAction: plan.action,
      mergePolicy: plan.mergePolicy,
      ownership: plan.ownership,
      backupBeforeApply: plan.exists,
    }));
  return {
    globalWrites: [],
    projectWrites,
    projectConflicts: conflicts.map((plan) => ({
      relPath: plan.relPath,
      action: plan.effectiveAction,
      plannedAction: plan.action,
      mergePolicy: plan.mergePolicy,
      ownership: plan.ownership,
      safeNextAction:
        "Inspect the existing file, rename it, remove it, or mark it as managed only after user confirmation.",
    })),
    manifestWrite: {
      requiredBeforeReady: state.status !== "ready",
      reason: state.confirmationReason,
      stateManifest: ".meta-kim/state/default/project-bootstrap.json",
    },
    confirmation: {
      required: state.requiresConfirmation,
      reason: state.confirmationReason,
    },
    backup: {
      requiredBeforeApply: state.status !== "ready" && existing.length > 0,
      backupRootPattern: ".meta-kim/backups/project-bootstrap/<timestamp>",
      fileCount: existing.length,
      entries: existing.map((plan) => ({
        relPath: plan.relPath,
        mergePolicy: plan.mergePolicy,
      })),
    },
    rollbackPlan: {
      availableAfterApply: true,
      restoreFrom: ".meta-kim/backups/project-bootstrap/<timestamp>/backup-manifest.json",
      stateManifest: ".meta-kim/state/default/project-bootstrap.json",
      policy:
        "Restore backed-up files from backup-manifest.json; created-only generated files can be removed from managedFiles in the project bootstrap manifest.",
    },
  };
}

function buildProjectBootstrapChoiceSurface(state, writePreview) {
  if (!state.requiresConfirmation) {
    return {
      required: false,
      trigger: "no_choice_needed_current",
      header: "Project ready",
      question:
        "Meta_Kim project bootstrap is already current for the selected targets. No project-specific files need to be written, and no confirmation popup should be shown.",
      recommendedOptionId: "continue",
      options: [
        {
          id: "continue",
          label: "Continue",
          expectedResult: "Proceed with the governed run without project-specific bootstrap writes.",
          advantage: "Avoids repeated prompts and leaves the project untouched.",
          risk: "None for the current selected targets.",
          verificationImpact: "Dry-run shows status=ready, requiresConfirmation=false, and zero project writes.",
        },
      ],
    };
  }

  const pendingCount = writePreview.projectWrites.length;
  const conflictCount = writePreview.projectConflicts?.length ?? 0;
  const targetText = state.activeTargets.join(", ");
  const reason = state.confirmationReason;
  const hasConflicts = state.status === "conflict";
  return {
    required: true,
    trigger: "runtime_native_choice_required_before_apply",
    runtimeRequirement:
      "Claude Code must use AskUserQuestion and Codex must use request_user_input before --apply. Compatibility runtimes may show a labeled chat decision card.",
    header: "Project bootstrap",
    question: [
      `AI understanding: this directory needs Meta_Kim project-specific context/config/state or confirmed overrides for ${targetText}.`,
      `AI additions: dry-run found ${state.status}; ${reason}`,
      "Capability route: reuse global runtime capabilities first, then apply only project-specific context/config/state or confirmed overrides.",
      `Candidate paths: ${
        hasConflicts
          ? "inspect and resolve conflicts, skip this project for now, or apply only after conflicts are resolved"
          : "apply now, inspect only, or skip this project for now"
      }. Pending project writes: ${pendingCount}; conflicts: ${conflictCount}; global writes: ${writePreview.globalWrites.length}.`,
    ].join("\n"),
    recommendedOptionId: hasConflicts ? "inspect_dry_run_only" : "apply_project_bootstrap",
    options: [
      {
        id: "apply_project_bootstrap",
        label: hasConflicts ? "Apply after resolving conflicts" : "Apply project bootstrap (Recommended)",
        expectedResult:
          "Create or update the selected project-specific context/config/state or confirmed overrides, then write the project bootstrap manifest.",
        advantage: "The next meta-theory trigger can proceed without asking again when files remain current.",
        risk: hasConflicts
          ? "Blocked until writePreview.projectConflicts is empty; Meta_Kim will not overwrite unknown user-owned files."
          : "Touches project files listed in writePreview.projectWrites after backup/merge policy.",
        verificationImpact:
          "After apply, a second dry-run must report status=ready, requiresConfirmation=false, pending=0, and projectWrites=0.",
      },
      {
        id: "inspect_dry_run_only",
        label: "Inspect only",
        expectedResult: "Do not write files; keep the dry-run plan for human review.",
        advantage: "Safest when the project owner wants to inspect generated files first.",
        risk: "Meta_Kim can still reuse global capabilities, but project-specific context/config/state may remain stale for this directory.",
        verificationImpact: "No manifest update is written; the next trigger will ask again if state is unchanged.",
      },
      {
        id: "skip_this_project",
        label: "Skip project-local writes",
        expectedResult: "Continue without applying Meta_Kim project-specific files.",
        advantage: "Avoids changing a directory that should rely on global reusable capabilities only.",
        risk: "Only global reusable capabilities remain available; project-specific overrides/config/state are not enabled.",
        verificationImpact: "The run must not claim project-governed readiness for this directory.",
      },
    ],
  };
}

function buildProjectBootstrapPlan(activeTargets, targetDir) {
  const filePlans = collectProjectDeployPlan(activeTargets, targetDir);
  const state = projectBootstrapStatus(targetDir, activeTargets, filePlans);
  const writePreview = projectBootstrapWritePreview(targetDir, filePlans, state);
  return {
    schemaVersion: "meta-kim-project-bootstrap-plan-v0.1",
    mode: "dry-run",
    sourceChain: readSyncSourceChain(),
    state,
    files: filePlans,
    writePreview,
    choiceSurface: buildProjectBootstrapChoiceSurface(state, writePreview),
    decisions: {
      defaultTargets:
        "config/sync.json defaultTargets are Claude Code + Codex; effective activeTargets may also come from an explicit --targets value or saved .meta-kim/local.overrides.json activeTargets.",
      protectedMerge: "JSON configs use additive preserve-user-state merge; AGENTS.md/CLAUDE.md use managed text blocks; .codex/config.toml is skipped because Codex native controls belong to global host config.",
      firstTriggerFlow:
        "Global skill runs dry-run first, asks through the runtime native choice surface, then runs --apply only after user confirmation or trusted-auto policy.",
    },
  };
}

function assertNoProjectBootstrapConflicts(plan) {
  const conflicts = plan.writePreview?.projectConflicts ?? [];
  if (conflicts.length === 0) return;
  const rels = conflicts.map((entry) => entry.relPath).join(", ");
  throw new Error(
    `Project bootstrap blocked by ${conflicts.length} user-owned file conflict(s): ${rels}`,
  );
}

function createProjectBootstrapBackup(targetDir, filePlans) {
  const existing = filePlans.filter(
    (plan) =>
      plan.action !== "skip" &&
      plan.effectiveAction !== "unchanged" &&
      plan.effectiveAction !== "conflict" &&
      existsSync(join(targetDir, plan.relPath)),
  );
  if (existing.length === 0) {
    return { created: false, fileCount: 0, entries: [] };
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupRoot = join(targetDir, ".meta-kim", "backups", "project-bootstrap", stamp);
  const entries = [];
  for (const plan of existing) {
    const from = join(targetDir, plan.relPath);
    const to = join(backupRoot, plan.relPath);
    mkdirSync(dirname(to), { recursive: true });
    cpSync(from, to);
    entries.push({
      relPath: plan.relPath,
      mergePolicy: plan.mergePolicy,
      backupRelPath: normalizeDeployRelPath(relative(targetDir, to)),
    });
  }
  const manifest = {
    schemaVersion: "meta-kim-project-bootstrap-backup-v0.1",
    createdAt: new Date().toISOString(),
    targetDir,
    entries,
  };
  writeJsonObject(join(backupRoot, "backup-manifest.json"), manifest);
  return {
    created: true,
    backupRoot,
    backupRelPath: normalizeDeployRelPath(relative(targetDir, backupRoot)),
    fileCount: entries.length,
    entries,
  };
}

function writeProjectBootstrapManifest(targetDir, plan, backup, cleanup = null) {
  const manifestPath = projectBootstrapManifestPath(targetDir);
  const manifest = {
    schemaVersion: "meta-kim-project-bootstrap-v0.1",
    appliedAt: new Date().toISOString(),
    metaKimVersion: readPackageVersion(),
    activeTargets: plan.state.activeTargets,
    sourceChain: plan.sourceChain,
    stateBeforeApply: plan.state,
    protectedMergeDecisions: plan.decisions,
    backup,
    cleanup,
    managedFiles: plan.files.filter(
      (file) => file.action !== "skip" && file.effectiveAction !== "conflict",
    ),
    skippedFiles: plan.files.filter((file) => file.action === "skip"),
  };
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeJsonObject(manifestPath, manifest);
  return manifestPath;
}

// Per-platform project-level hook directories. Mirrors RUNTIME_HOOK_CAPABILITIES
// but kept inline so this function stays self-contained for the bootstrap CLI.
const PROJECT_HOOK_DIRS_BY_PLATFORM = {
  claude: ".claude/hooks",
  codex: ".codex/hooks",
  cursor: ".cursor/hooks",
  openclaw: "openclaw/hooks",
};

// Per-platform whitelist of Meta_Kim-managed hook files. Files NOT on the
// whitelist (user-authored) are preserved.
const PROJECT_HOOK_FILE_WHITELIST_BY_PLATFORM = {
  claude: new Set([
    "activate-meta-theory-spine.mjs",
    "bash-readonly-whitelist.mjs",
    "block-dangerous-bash.mjs",
    "ecc-permission-cache-wrapper.mjs",
    "enforce-agent-dispatch.mjs",
    "graphify-context.mjs",
    "hook-i18n.mjs",
    "meta-kim-memory-save.mjs",
    "post-format.mjs",
    "post-typecheck.mjs",
    "post-console-log-warn.mjs",
    "skip-reminder.mjs",
    "subagent-context.mjs",
    "stop-compaction.mjs",
    "stop-memory-save.mjs",
    "stop-console-log-audit.mjs",
    "stop-completion-guard.mjs",
    "stop-save-progress.mjs",
    "stop-spine-cleanup.mjs",
    "utils.mjs",
    "spine-state.mjs",
  ]),
  codex: new Set([
    "activate-meta-theory-spine.mjs",
    "bash-readonly-whitelist.mjs",
    "codex_hook_adapter.py",
    "codex_hook_runner.mjs",
    "enforce-agent-dispatch.mjs",
    "graphify-context.mjs",
    "hook-i18n.mjs",
    "hookprompt-adapter.mjs",
    "meta-kim-memory-save.mjs",
    "planning-with-files-adapter.mjs",
    "post_tool_use.py",
    "post-tool-use.sh",
    "post-console-log-warn.mjs",
    "post-format.mjs",
    "post-typecheck.mjs",
    "pre_tool_use.py",
    "pre-tool-use.sh",
    "pre-compact.sh",
    "session_start.py",
    "session-start.sh",
    "stop.py",
    "stop.sh",
    "user_prompt_submit.py",
    "user-prompt-submit.sh",
    "permission_request.py",
    "resolve-plan-dir.sh",
    "skip-reminder.mjs",
    "spine-state.mjs",
    "stop-compaction.mjs",
    "stop-console-log-audit.mjs",
    "stop-completion-guard.mjs",
    "stop-spine-cleanup.mjs",
    "subagent-context.mjs",
    "utils.mjs",
  ]),
  cursor: new Set([
    "activate-meta-theory-spine.mjs",
    "bash-readonly-whitelist.mjs",
    "enforce-agent-dispatch.mjs",
    "graphify-context.mjs",
    "hook-i18n.mjs",
    "hookprompt-adapter.mjs",
    "meta-kim-memory-save.mjs",
    "planning-with-files-adapter.mjs",
    "post-tool-use.ps1",
    "post-tool-use.sh",
    "post-console-log-warn.mjs",
    "post-format.mjs",
    "post-typecheck.mjs",
    "pre-tool-use.ps1",
    "pre-tool-use.sh",
    "stop.ps1",
    "stop.sh",
    "user-prompt-submit.ps1",
    "user-prompt-submit.sh",
    "skip-reminder.mjs",
    "spine-state.mjs",
    "stop-compaction.mjs",
    "stop-console-log-audit.mjs",
    "stop-completion-guard.mjs",
    "stop-spine-cleanup.mjs",
    "subagent-context.mjs",
    "utils.mjs",
  ]),
  openclaw: new Set([
    "stop-save-progress.mjs",
  ]),
};

// Remove Meta_Kim-managed hook files from a target project's hook dirs.
// Walks every active platform, removes files matching the per-platform
// whitelist, and emits a 4-locale progress message.
async function migrateProjectMetaKimHooksForBootstrap(activeTargets, targetDir) {
  const platforms = Array.isArray(activeTargets) ? activeTargets : [];
  for (const platform of platforms) {
    const relDir = PROJECT_HOOK_DIRS_BY_PLATFORM[platform];
    const whitelist = PROJECT_HOOK_FILE_WHITELIST_BY_PLATFORM[platform];
    if (!relDir || !whitelist) continue;
    const hooksDir = join(targetDir, relDir);
    let entries;
    try {
      entries = readdirSync(hooksDir);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    const removed = [];
    const kept = [];
    for (const name of entries) {
      if (!whitelist.has(name)) {
        kept.push(name);
        continue;
      }
      const relPath = normalizeDeployRelPath(join(relDir, name));
      const skipped = [];
      if (!removeUntrackedProjectPath(targetDir, relPath, skipped, { recursive: false })) {
        kept.push(name);
        continue;
      }
      try {
        removed.push(name);
      } catch (error) {
        if (error.code !== "ENOENT") {
          warn(
            `[Meta_Kim] Failed to remove ${platform} hook ${name}: ${error.message}`,
          );
        }
      }
    }
    if (removed.length > 0) {
      if (!jsonOutputMode) {
        info(t.projectHooksMigrationRemoved(platform, removed.length, hooksDir));
        info(t.projectHooksMigrationKept(platform, kept));
      }
      let remaining = [];
      try {
        remaining = readdirSync(hooksDir);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (remaining.length === 0) {
        rmSync(hooksDir, { recursive: true, force: true });
      }
    } else {
      if (!jsonOutputMode) {
        info(t.projectHooksMigrationNoChange(platform, hooksDir));
      }
    }
  }
}

async function applyProjectBootstrapToDir(activeTargets, targetDir) {
  const legacyCleanup = removeLegacyProjectCapabilityEntrypoints(targetDir, activeTargets);
  let plan = buildProjectBootstrapPlan(activeTargets, targetDir);
  const cleanup = mergeProjectCleanupResults(
    legacyCleanup,
    removeStaleManagedProjectAssets(targetDir, plan.files),
  );
  const strippedHookConfigs = stripStaleProjectHookConfigs(targetDir, plan.files);
  cleanup.strippedHookConfigs = strippedHookConfigs;
  reportProjectAssetCleanup(cleanup, { reason: "project_retarget" });
  if (cleanup.removed.length > 0 || strippedHookConfigs.length > 0) {
    plan = buildProjectBootstrapPlan(activeTargets, targetDir);
  }
  assertNoProjectBootstrapConflicts(plan);
  if (plan.state.status === "ready") {
    return {
      ...plan,
      mode: "apply",
      applied: false,
      noOp: true,
      backup: { created: false, fileCount: 0, entries: [] },
      cleanup,
      manifestPath: projectBootstrapManifestPath(targetDir),
    };
  }
  const backup = createProjectBootstrapBackup(targetDir, plan.files);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }
  for (const platformId of activeTargets) {
    deployPlatformFiles(platformId, targetDir);
  }
  const manifestPath = writeProjectBootstrapManifest(targetDir, plan, backup, cleanup);
  const afterPlan = buildProjectBootstrapPlan(activeTargets, targetDir);
  return {
    ...afterPlan,
    mode: "apply",
    applied: true,
    backup,
    cleanup,
    manifestPath,
  };
}

function classifyProjectBootstrapError(error) {
  const msg = error?.message || String(error);
  return /EACCES|EPERM|permission|read-only|readonly|access denied/i.test(msg)
    ? "blocked"
    : "failed";
}

function projectBootstrapFailureResult(targetDir, activeTargets, error) {
  const message = error?.message || String(error);
  return {
    schemaVersion: "meta-kim-project-bootstrap-plan-v0.1",
    mode: "apply",
    applied: false,
    state: {
      status: classifyProjectBootstrapError(error),
      targetDir,
      activeTargets,
    },
    error: {
      status: classifyProjectBootstrapError(error),
      message,
      returnToStage: "Fetch",
      repairAction:
        "Fix target permissions or resolve the conflicting project file, then rerun project bootstrap dry-run before apply.",
    },
  };
}

function deployPlatformFiles(platformId, targetDir) {
  let fileCount = 0;
  const targetIsRepo = resolve(targetDir) === resolve(PROJECT_DIR);
  const copyIfExists = (srcRel, destRel) => {
    const src = join(PROJECT_DIR, srcRel);
    const dest = join(targetDir, destRel);
    if (
      targetIsRepo &&
      existsSync(src) &&
      resolve(src) === resolve(dest)
    ) {
      return;
    }
    if (!existsSync(src)) return;
    mkdirSync(dirname(dest), { recursive: true });
    const relPath = normalizeDeployRelPath(destRel);
    if (existsSync(src) && statSync(src).isDirectory()) {
      fileCount += copyDirRecursive(src, dest, {
        sourceRoot: PROJECT_DIR,
        targetDir,
      });
    } else {
      fileCount += copyProjectDeployFile(src, dest, relPath, targetDir);
    }
  };

  for (const root of projectDeployRootsForPlatform(platformId)) {
    copyIfExists(root.srcRel, root.destRel);
  }
  fileCount += writeProjectGeneratedHooks(platformId, targetDir);
  return fileCount;
}

function printPostCopyBootstrapHint() {
  console.log(`${C.dim}  ${t.npxQuickPostCopyScript}${C.reset}`);
}

function savedProjectDeployDirsFrom(overrides) {
  return uniqueProjectDeployDirs(overrides?.projectDeployDirs || []);
}

function projectDeployConfigDisplayPath() {
  return ".meta-kim/local.overrides.json";
}

async function saveProjectDeployDirs(dirs) {
  const normalized = uniqueProjectDeployDirs(dirs);
  const localOverrides = await loadLocalOverrides();
  await writeLocalOverrides({
    ...localOverrides,
    projectDeployDirs: normalized,
  });
  info(t.projectDeploySavedTargets(normalized.length));
  console.log(
    `${C.dim}${t.projectDeploySavedPathHint(projectDeployConfigDisplayPath())}${C.reset}`,
  );
}

function stripProjectDeployDirInput(raw) {
  const trimmed = String(raw || "").trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseProjectDeployDirText(rawText) {
  const dirs = [];
  const parts = String(rawText || "")
    .replace(/\r?\n/g, ";")
    .split(/[;,，；]+/);
  for (const part of parts) {
    const cleaned = stripProjectDeployDirInput(part);
    if (!cleaned || cleaned.startsWith("#")) continue;
    dirs.push(cleaned);
  }
  return uniqueProjectDeployDirs(dirs);
}

async function askProjectDeployTargetDirectories() {
  console.log(`${C.dim}${t.projectDeployPathEntryHint}${C.reset}`);
  const answer = await ask(t.projectDeployDirPrompt);
  return parseProjectDeployDirText(answer);
}

function printProjectDeployDirList(heading, dirs) {
  if (!dirs.length) return;
  console.log(`${C.bold}${heading}${C.reset}`);
  dirs.forEach((dir, index) => {
    console.log(`${C.dim}${index + 1}.${C.reset} ${dir}`);
  });
  console.log("");
}

async function confirmProjectDeployDirs(dirs, remember) {
  const normalized = uniqueProjectDeployDirs(dirs);
  if (normalized.length === 0) {
    skip(t.projectDeployNoDirsEntered);
    return [];
  }
  printProjectDeployDirList(
    t.projectDeployParsedTargets(normalized.length),
    normalized,
  );
  const confirmQuestion = remember
    ? t.projectDeployConfirmSaveAndUpdate(normalized.length)
    : t.projectDeployConfirmUpdateOnce(normalized.length);
  const confirmed = await askYesNo(confirmQuestion, true);
  return confirmed ? normalized : [];
}

async function collectProjectDeployDirs(remember) {
  const parsed = await askProjectDeployTargetDirectories();
  const confirmed = await confirmProjectDeployDirs(parsed, remember);
  if (remember && confirmed.length > 0) {
    await saveProjectDeployDirs(confirmed);
  }
  return confirmed;
}

async function askDeployDirectory() {
  console.log("");

  if (cliProjectDeployDirs.length > 0) {
    info(t.projectDeployCliTargets(cliProjectDeployDirs.length));
    if (saveProjectDirsMode) {
      await saveProjectDeployDirs(cliProjectDeployDirs);
    } else {
      console.log(`${C.dim}${t.projectDeployCliSaveHint}${C.reset}`);
    }
    return cliProjectDeployDirs;
  }

  const localOverrides = await loadLocalOverrides();
  const savedDirs = savedProjectDeployDirsFrom(localOverrides);

  if (useSavedProjectDirsMode) {
    if (savedDirs.length === 0) {
      skip(t.projectDeployNoSaved);
      return [];
    }
    info(t.projectDeployUseSaved(savedDirs.length));
    return savedDirs;
  }

  if (silentMode) {
    return [];
  }

  console.log(`${C.dim}${t.projectDeployProtectionNote}${C.reset}`);
  console.log(`${C.dim}${t.projectDeployInteractiveHint}${C.reset}`);
  if (savedDirs.length > 0) {
    printProjectDeployDirList(
      t.projectDeploySavedListHeading(savedDirs.length),
      savedDirs,
    );
  }
  const options = [];
  if (savedDirs.length > 0) {
    options.push({ id: "saved", label: t.projectDeployUseSaved(savedDirs.length) });
    options.push(
      { id: "remember", label: t.projectDeploySelectAndRemember },
      { id: "once", label: t.projectDeploySelectOnce },
    );
  } else {
    options.push(
      { id: "remember", label: t.projectDeploySelectAndRemember },
      { id: "once", label: t.projectDeploySelectOnce },
    );
  }
  options.push({ id: "skip", label: t.npxQuickDeployNo });

  const choiceIdx = await askSelect(
    t.projectDeployAsk,
    options.map((option) => option.label),
  );
  const choice = options[choiceIdx]?.id || "skip";
  if (choice === "saved") {
    console.log("");
    return savedDirs;
  }
  if (choice === "once") {
    const dirs = await collectProjectDeployDirs(false);
    console.log("");
    return dirs;
  }
  if (choice === "remember") {
    const dirs = await collectProjectDeployDirs(true);
    console.log("");
    return dirs;
  }
  console.log("");
  return [];
}

async function askProjectCleanupDirectory() {
  console.log("");

  if (cliProjectDeployDirs.length > 0) {
    info(t.projectDeployCliTargets(cliProjectDeployDirs.length));
    if (saveProjectDirsMode) {
      await saveProjectDeployDirs(cliProjectDeployDirs);
    } else {
      console.log(`${C.dim}${t.projectDeployCliSaveHint}${C.reset}`);
    }
    return cliProjectDeployDirs;
  }

  const localOverrides = await loadLocalOverrides();
  const savedDirs = savedProjectDeployDirsFrom(localOverrides);

  if (useSavedProjectDirsMode) {
    if (savedDirs.length === 0) {
      skip(t.projectDeployNoSaved);
      return [];
    }
    info(t.projectCleanupUseSaved(savedDirs.length));
    return savedDirs;
  }

  if (silentMode) {
    return [];
  }

  if (savedDirs.length > 0) {
    printProjectDeployDirList(
      t.projectDeploySavedListHeading(savedDirs.length),
      savedDirs,
    );
  } else {
    console.log(`${C.dim}${t.projectDeployNoSaved}${C.reset}`);
  }

  const wantCleanup = await askYesNo(t.askProjectRedundantCleanup, true);
  if (!wantCleanup) return [];

  console.log(`${C.dim}${t.projectCleanupProtectionNote}${C.reset}`);
  if (savedDirs.length === 0) {
    const dirs = await collectProjectDeployDirs(false);
    console.log("");
    return dirs;
  }

  const options = [
    { id: "saved", label: t.projectCleanupUseSaved(savedDirs.length) },
    { id: "remember", label: t.projectCleanupSelectAndRemember },
    { id: "once", label: t.projectCleanupSelectOnce },
  ];
  options.push({ id: "skip", label: t.npxQuickDeployNo });

  const choiceIdx = await askSelect(
    t.projectCleanupAsk,
    options.map((option) => option.label),
  );
  const choice = options[choiceIdx]?.id || "skip";
  if (choice === "saved") {
    console.log("");
    return savedDirs;
  }
  if (choice === "once") {
    const dirs = await collectProjectDeployDirs(false);
    console.log("");
    return dirs;
  }
  if (choice === "remember") {
    const dirs = await collectProjectDeployDirs(true);
    console.log("");
    return dirs;
  }
  console.log("");
  return [];
}

function printProjectDeploySummary(results) {
  if (!results.length) return;
  console.log(`${C.bold}${t.projectDeploySummary}${C.reset}`);
  for (const result of results) {
    const label =
      result.status === "ok"
        ? `${C.green}${t.projectDeployStatusOk}${C.reset}`
        : `${C.red}${t.projectDeployStatusFailed}${C.reset}`;
    console.log(`${C.dim}- ${result.dir}:${C.reset} ${label}`);
  }
  console.log("");
}

function printProjectCleanupSummary(results) {
  if (!results.length) return;
  console.log(`${C.bold}${t.projectCleanupSummary}${C.reset}`);
  for (const result of results) {
    const label =
      result.status === "ok"
        ? `${C.green}${t.projectDeployStatusOk}${C.reset}`
        : `${C.red}${t.projectDeployStatusFailed}${C.reset}`;
    console.log(`${C.dim}- ${result.dir}:${C.reset} ${label}`);
  }
  console.log("");
}

function cleanupProjectHookConfigs(activeTargets, targetDir) {
  const platforms = new Set();
  for (const platform of activeTargets) {
    if (platform === "all") {
      platforms.add("claude");
      platforms.add("codex");
      platforms.add("cursor");
      continue;
    }
    if (platform === "claude" || platform === "codex" || platform === "cursor") {
      platforms.add(platform);
    }
  }

  const relPaths = [];
  if (platforms.has("claude")) relPaths.push(".claude/settings.json");
  if (platforms.has("codex")) relPaths.push(".codex/hooks.json");
  if (platforms.has("cursor")) relPaths.push(".cursor/hooks.json");

  const changed = [];
  for (const relPath of relPaths) {
    const configPath = join(targetDir, relPath);
    if (!existsSync(configPath)) continue;
    const current = readJsonObjectIfExists(configPath);
    if (!current) continue;
    const stripped = stripProjectMetaKimHooksFromHookConfig(current);
    if (jsonEquivalent(current, stripped)) continue;
    if (isGitTrackedProjectPath(targetDir, relPath)) continue;
    writeJsonObject(configPath, stripped);
    changed.push(relPath);
  }

  if (changed.length > 0 && !jsonOutputMode) {
    const formatter = t.projectCleanupHookConfigStripped;
    const message =
      typeof formatter === "function"
        ? formatter(changed)
        : `Removed Meta_Kim project hook references from: ${changed.join(", ")}`;
    info(message);
  }
  return changed;
}

async function cleanupProjectRedundancyDirs(activeTargets, targetDirs) {
  const dirs = uniqueProjectDeployDirs(targetDirs);
  if (dirs.length === 0) return [];

  if (!jsonOutputMode) {
    heading(t.projectCleanupBatchHeading(dirs.length));
    console.log(`${C.dim}${t.projectCleanupProtectionNote}${C.reset}`);
    info(t.projectAssetsCleanupIntro);
    info(t.projectAssetsCleanupScope);
  }

  const results = [];
  for (const targetDir of dirs) {
    try {
      await migrateProjectMetaKimHooksForBootstrap(activeTargets, targetDir);
      const strippedHookConfigs = cleanupProjectHookConfigs(activeTargets, targetDir);
      const legacyCleanup = removeLegacyProjectCapabilityEntrypoints(targetDir, activeTargets);
      const plan = buildProjectBootstrapPlan(activeTargets, targetDir);
      const capabilityRootCleanup = removeGlobalProjectCapabilityRoots(targetDir, activeTargets);
      const generatedSkillCleanup = removeMetaKimGeneratedProjectSkillResidue(
        targetDir,
        activeTargets,
      );
      const openClawDirectoryCleanup = removeMetaKimOpenClawDirectoryResidue(
        targetDir,
        activeTargets,
      );
      const configCleanup = cleanupRedundantProjectConfigs(
        targetDir,
        activeTargets,
        plan.files,
      );
      const instructionCleanup = removeRedundantProjectInstructionFiles(
        targetDir,
        activeTargets,
      );
      const localStateCleanup = removeMetaKimProjectLocalState(targetDir);
      const emptyDirCleanup = pruneEmptyProjectRuntimeDirs(targetDir, activeTargets);
      const cleanup = mergeProjectCleanupResults(
        legacyCleanup,
        capabilityRootCleanup,
        generatedSkillCleanup,
        openClawDirectoryCleanup,
        configCleanup,
        instructionCleanup,
        removeStaleManagedProjectAssets(targetDir, plan.files, {
          removeCurrentManaged: true,
        }),
        localStateCleanup,
        emptyDirCleanup,
      );
      if (!jsonOutputMode) {
        reportProjectAssetCleanup(cleanup, { reason: "global_redundancy" });
      }
      results.push({ dir: targetDir, status: "ok", cleanup, strippedHookConfigs });
    } catch (error) {
      const msg = error?.message || String(error);
      if (!jsonOutputMode) {
        warn(t.projectDeployFailed(targetDir, msg));
      }
      results.push({ dir: targetDir, status: "failed", message: msg });
    }
  }
  if (!jsonOutputMode) {
    printProjectCleanupSummary(results);
  }
  return results;
}

async function copyToDeployDirs(activeTargets, targetDirs) {
  const dirs = uniqueProjectDeployDirs(targetDirs);
  if (dirs.length === 0) return [];

  heading(t.projectDeployBatchHeading(dirs.length));
  console.log(`${C.dim}${t.projectDeployProtectionNote}${C.reset}`);

  const results = [];
  for (const targetDir of dirs) {
    try {
      const result = await copyToDeployDir(activeTargets, targetDir);
      results.push({ dir: targetDir, status: "ok", manifestPath: result.manifestPath });
    } catch (error) {
      const msg = error?.message || String(error);
      warn(t.projectDeployFailed(targetDir, msg));
      results.push({ dir: targetDir, status: "failed", message: msg });
    }
  }
  printProjectDeploySummary(results);
  return results;
}

async function copyToDeployDir(activeTargets, targetDir) {
  if (existsSync(targetDir)) {
    console.log(`${C.dim}  ${t.npxQuickDirExists}${C.reset}`);
  } else {
    mkdirSync(targetDir, { recursive: true });
  }

  console.log(`${C.dim}  ${t.npxQuickCreating} ${targetDir}${C.reset}`);

  const bootstrapResult = await applyProjectBootstrapToDir(activeTargets, targetDir);
  quickDeployDir = quickDeployDir || targetDir;
  quickDeployDirs = uniqueProjectDeployDirs([...quickDeployDirs, targetDir]);

  console.log(`${C.green}${C.bold}✓ ${t.npxQuickDone}${C.reset}`);
  console.log(`${C.dim}  ${targetDir}${C.reset}`);
  printPostCopyBootstrapHint();
  console.log("");
  return bootstrapResult;
}

async function runQuickDeploy() {
  heading(t.npxQuickHeading);

  const platformId = await askQuickPlatform();
  const targetDir = await askTargetDirectory();

  if (existsSync(targetDir)) {
    console.log(`${C.dim}  ${t.npxQuickDirExists}${C.reset}`);
  } else {
    mkdirSync(targetDir, { recursive: true });
  }

  console.log(`${C.dim}  ${t.npxQuickCreating} ${targetDir}${C.reset}`);

  // Run normal install to PROJECT_DIR first (generates runtime files)
  const runtimes = await detectRuntimes();

  // npm install deps
  await withProgress(t.progressNpmInstall, async () => {
    if (
      existsSync(join(PROJECT_DIR, "node_modules", "@modelcontextprotocol"))
    ) {
      return true;
    }
    info(t.runningNpm);
    const result = spawnSync("npm", ["install"], {
      cwd: PROJECT_DIR,
      stdio: "inherit",
      shell: isWin,
    });
    return result.status === 0;
  });

  // Clean up legacy skill files before sync
  await withProgress(t.progressCleanupLegacy, () => {
    const n = cleanupLegacySkills("project");
    if (n > 0) ok(`Cleaned ${n} legacy file(s)`);
    return true;
  });

  // Sync runtimes to PROJECT_DIR
  await withProgress(t.progressSyncConfig, async () => {
    const configResult = await autoConfigure("project");
    return !!configResult;
  });

  // Copy platform files to target directory
  await withProgress(t.npxQuickCopyFiles, async () => {
    assertNoProjectBootstrapConflicts(buildProjectBootstrapPlan([platformId], targetDir));
    const count = deployPlatformFiles(platformId, targetDir);
    quickDeployDir = targetDir;
    quickDeployDirs = uniqueProjectDeployDirs([targetDir]);
    return count > 0;
  });

  // Install global skills
  await withProgress(t.progressPrepareDir, async () => {
    if (!existsSync(SKILLS_DIR)) mkdirSync(SKILLS_DIR, { recursive: true });
    ok(t.globalDirReady(SKILLS_DIR));
    return true;
  });

  await withProgress(t.progressInstallSkills, async () => {
    const localOverrides = await loadLocalOverrides();
    const proxyEnv = localOverrides.gitProxy
      ? { META_KIM_GIT_PROXY: localOverrides.gitProxy }
      : {};
    const targets = platformId === "all" ? "claude" : platformId;
    const installResult = runNodeScript(
      "scripts/install-global-skills-all-runtimes.mjs",
      ["--targets", targets, "--skills", ""],
      proxyEnv,
    );
    return installResult.status === 0;
  });

  await withProgress(t.progressSyncMeta, () => {
    const targets = platformId === "all" ? "claude" : platformId;
    const syncResult = runNodeScript(
      "scripts/sync-global-meta-theory.mjs",
      metaTheoryGlobalSyncArgs(targets),
    );
    return syncResult.status === 0;
  });

  console.log("");
  console.log(`${C.green}${C.bold}✓ ${t.npxQuickDone}${C.reset}`);
  console.log(`${C.dim}  ${targetDir}${C.reset}`);
  printPostCopyBootstrapHint();
  console.log("");

  showNextSteps(runtimes);
}

// ── Install scope selection ─────────────────────────────

/**
 * Ask user where to install: global reusable capabilities or project directory updates.
 * Returns: 'project' | 'global'
 */
async function askInstallScope() {
  if (silentMode) return "global";

  heading(t.installScopeHeading);

  const scopes = [
    {
      id: "global",
      label: t.installScopeGlobalLabel,
      desc: t.installScopeGlobalDesc,
    },
    {
      id: "project",
      label: t.installScopeProjectLabel,
      desc: t.installScopeProjectDesc,
    },
  ];

  const idx = await keyboardSelect(
    t.installScopePrompt,
    scopes.map((s) => ({
      ...s,
      label: `${s.label}  ${C.dim}${s.desc}${C.reset}`,
    })),
  );

  const selected = scopes[idx]?.id || "global";
  const pickedLabel =
    {
      project: t.installScopeProjectLabel,
      global: t.installScopeGlobalLabel,
    }[selected] || selected;
  info(t.selectedScope(pickedLabel));

  // Show selected scope detail
  const detailKey =
    {
      project: "installScopeProjectDescDetail",
      global: "installScopeGlobalDescDetail",
    }[selected];
  if (t[detailKey]) {
    console.log("");
    console.log(`${C.green}${C.bold}▸ ${pickedLabel}${C.reset}`);
    const detailLines = t[detailKey].split("\n");
    for (const line of detailLines) {
      if (line.startsWith("•")) {
        console.log(`${C.dim}  ${line}${C.reset}`);
      } else if (line.trim()) {
        console.log(`${C.dim}  ${line.trim()}${C.reset}`);
      }
    }
    console.log("");
  }

  return selected;
}

// ── Directory structure explanation ─────────────────────────────

function showDirectoryExplanation() {
  console.log("");
  console.log(`${C.bold}${C.cyan}● ${t.directoryExplanationHeading}${C.reset}`);
  console.log("");
  console.log(`${C.dim}${t.directoryExplanationIntro}${C.reset}`);
  console.log("");

  // Project-level
  console.log(`${C.bold}${t.directoryExplanationProject}${C.reset}`);
  const projectLines = t.directoryExplanationProjectDetail.split("\n");
  for (const line of projectLines) {
    if (line.startsWith("•")) {
      console.log(`${C.dim}•${C.reset} ${line.slice(1).trim()}`);
    } else if (line.trim()) {
      console.log(`${C.dim}  ${line.trim()}${C.reset}`);
    }
  }
  console.log("");

  // Global-level
  console.log(`${C.bold}${t.directoryExplanationGlobal}${C.reset}`);
  const globalLines = t.directoryExplanationGlobalDetail.split("\n");
  for (const line of globalLines) {
    if (line.startsWith("•")) {
      console.log(`${C.dim}•${C.reset} ${line.slice(1).trim()}`);
    } else if (line.trim()) {
      console.log(`${C.dim}  ${line.trim()}${C.reset}`);
    }
  }
}

// ── Global install guidance ─────────────────────────────

async function ensureGlobalSkillsDir() {
  if (existsSync(SKILLS_DIR)) {
    ok(t.globalDirReady(SKILLS_DIR));
    return true;
  }

  const promptLines = t.globalDirPrompt.split("\n");
  console.log("");
  console.log(`${C.bold}${t.globalDirTitle}${C.reset}`);
  console.log("");
  console.log(`${promptLines[0]}`);
  console.log(`${C.dim}•${C.reset} ${promptLines[1].split("— ")[1]}`);
  console.log(`${C.dim}•${C.reset} ${promptLines[2].split("— ")[1]}`);
  console.log(`${C.dim}•${C.reset} ${promptLines[3].split("— ")[1]}`);
  console.log("");

  const shouldInstall = await askYesNo(t.globalInstallPrompt, true);
  if (!shouldInstall) {
    skip(t.globalSkipped);
    return false;
  }

  try {
    mkdirSync(SKILLS_DIR, { recursive: true });
    ok(t.globalDirCreated(SKILLS_DIR));
    return true;
  } catch (err) {
    fail(t.globalDirCreateFailed(err.message));
    return false;
  }
}

// ── Dependency verification ─────────────────────────────
// NOTE: This function is currently NOT used in the main install/update flow.
// It checks if global skills are installed in ~/.claude/skills/.
// Consider using it for pre-flight validation or remove if not needed.
// Usage: call checkDependencies() before installAllSkills() to verify state.

function checkDependencies() {
  heading(t.depCheckHeading);
  let verified = 0;

  for (const skill of SKILLS) {
    const dir = join(SKILLS_DIR, skill.name);
    if (!existsSync(dir)) {
      fail(t.depMissing(skill.name));
      continue;
    }
    // Check for at least one .md file (SKILL.md or any .md)
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    if (files.length === 0) {
      warn(t.depNoFiles(skill.name));
      continue;
    }
    ok(t.depOk(skill.name));
    verified++;
  }

  console.log();
  if (verified === SKILLS.length) {
    info(t.depSummaryAll);
  } else {
    warn(t.depSummarySome(verified, SKILLS.length));
  }
  return verified === SKILLS.length;
}

// ── Cross-runtime sync verification ─────────────────────

function openclawWorkspaceMdComplete(wsPath) {
  return OPENCLAW_WORKSPACE_MD.every((name) => existsSync(join(wsPath, name)));
}

function metaKimRuntimeNotice(mcpPath) {
  if (!existsSync(mcpPath)) return null;
  try {
    const config = JSON.parse(readFileSync(mcpPath, "utf8"));
    const server = config.mcpServers?.["meta-kim-runtime"];
    if (!server) return null;
    const scriptPath = server.args?.[0];
    if (!scriptPath) return t.mcpRuntimeProjectOnly(mcpPath);
    if (
      scriptPath.includes("__REPO_ROOT__") ||
      scriptPath.includes("REPLACE_WITH_REPO_ROOT")
    ) {
      return t.mcpRuntimeProjectOnly(mcpPath);
    }
    const resolvedScript = isAbsolute(scriptPath)
      ? scriptPath
      : join(PROJECT_DIR, scriptPath);
    if (!existsSync(resolvedScript)) return t.mcpRuntimeProjectOnly(mcpPath);
    return null;
  } catch {
    return null;
  }
}

function checkSync(
  runtimes,
  repoTargets = ["claude", "codex", "openclaw", "cursor"],
) {
  heading(t.syncHeading);
  let allOk = true;

  // --- Claude Code ---
  if (repoTargets.includes("claude")) {
    const claudeAgentsDir = join(PROJECT_DIR, ".claude", "agents");
    if (existsSync(claudeAgentsDir)) {
      const summary = summarizeExpectedFiles(
        readdirSync(claudeAgentsDir).filter((f) => f.endsWith(".md")),
        expectedAgentProjectionFiles(".md"),
      );
      if (summary.missing.length === 0)
        ok(t.syncClaudeAgents(summary.presentCount));
      else {
        warn(
          t.syncPartial(
            "Claude agents",
            `${summary.presentCount}/${META_AGENTS.length}`,
            `missing: ${summary.missing.join(", ")}`,
          ),
        );
        allOk = false;
      }
    } else {
      fail(t.syncMissing(".claude/agents/"));
      allOk = false;
    }

    const claudeSkillPath = join(
      PROJECT_DIR,
      ".claude",
      "skills",
      "meta-theory",
      "SKILL.md",
    );
    if (existsSync(claudeSkillPath)) ok(t.syncClaudeSkills);
    else {
      fail(t.syncMissing(".claude/skills/meta-theory/SKILL.md"));
      allOk = false;
    }

    ok(t.syncClaudeProjectHooksMigrated);

    if (existsSync(join(PROJECT_DIR, ".claude", "settings.json")))
      ok(t.syncClaudeSettings);
    else {
      warn(t.syncMissing(".claude/settings.json"));
      allOk = false;
    }

    const claudeMcp = join(PROJECT_DIR, ".mcp.json");
    if (existsSync(claudeMcp)) {
      ok(t.syncClaudeMcp);
      const notice = metaKimRuntimeNotice(claudeMcp);
      if (notice) warn(notice);
    } else {
      warn(t.syncMissing(".mcp.json"));
      allOk = false;
    }
  }

  // --- Codex ---
  if (repoTargets.includes("codex")) {
    console.log("");
    const codexAgentsDir = join(PROJECT_DIR, ".codex", "agents");
    const expectedCodexAgentFiles = expectedAgentProjectionFiles(".toml", [
      ...META_AGENTS,
      ...CODEX_RUNTIME_ADAPTER_AGENT_IDS,
      ...CODEX_BUSINESS_ROLE_AGENT_IDS,
    ]);
    if (existsSync(codexAgentsDir)) {
      const summary = summarizeExpectedFiles(
        readdirSync(codexAgentsDir).filter((f) => f.endsWith(".toml")),
        expectedCodexAgentFiles,
      );
      if (summary.missing.length === 0)
        ok(t.syncCodexAgents(summary.presentCount, expectedCodexAgentFiles.length));
      else {
        warn(
          t.syncPartial(
            "Codex agents",
            `${summary.presentCount}/${expectedCodexAgentFiles.length}`,
            `missing: ${summary.missing.join(", ")}`,
          ),
        );
        allOk = false;
      }
    } else {
      fail(t.syncMissing(".codex/agents/"));
      allOk = false;
    }

    const codexSkillPath = join(
      PROJECT_DIR,
      ".agents",
      "skills",
      "meta-theory",
      "SKILL.md",
    );
    if (existsSync(codexSkillPath)) {
      ok(t.syncCodexSkillsGlobal ?? t.syncCodexSkills);
    } else {
      fail(t.syncMissing(".agents/skills/meta-theory/SKILL.md"));
      allOk = false;
    }
  }

  // --- OpenClaw ---
  if (repoTargets.includes("openclaw")) {
    console.log("");
    const workspacesRoot = join(PROJECT_DIR, "openclaw", "workspaces");
    const wsDirs = existsSync(workspacesRoot)
      ? readdirSync(workspacesRoot, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
      : [];
    const wsSummary = summarizeExpectedFiles(wsDirs, META_AGENTS);
    const wsCount = wsSummary.presentCount;
    const completeAgents = META_AGENTS.filter((id) =>
      openclawWorkspaceMdComplete(join(workspacesRoot, id)),
    ).length;
    if (
      wsCount === META_AGENTS.length &&
      completeAgents === META_AGENTS.length
    ) {
      ok(t.syncOpenclawWorkspaces(wsCount));
    } else {
      warn(
        t.syncPartial(
          "OpenClaw workspaces",
          `${completeAgents}/${META_AGENTS.length} agents with 9 core .md`,
          wsSummary.missing.length > 0
            ? `missing: ${wsSummary.missing.join(", ")}`
            : `${META_AGENTS.length} agents, 9 .md each (BOOT … TOOLS)`,
        ),
      );
      allOk = false;
    }
  }

  // --- Cursor ---
  if (repoTargets.includes("cursor")) {
    console.log("");
    const cursorAgentsDir = join(PROJECT_DIR, ".cursor", "agents");
    if (existsSync(cursorAgentsDir)) {
      const summary = summarizeExpectedFiles(
        readdirSync(cursorAgentsDir).filter((f) => f.endsWith(".md")),
        expectedAgentProjectionFiles(".md"),
      );
      if (summary.missing.length === 0)
        ok(t.syncCursorAgents(summary.presentCount));
      else {
        warn(
          t.syncPartial(
            "Cursor agents",
            `${summary.presentCount}/${META_AGENTS.length}`,
            `missing: ${summary.missing.join(", ")}`,
          ),
        );
        allOk = false;
      }
    } else {
      fail(t.syncMissing(".cursor/agents/"));
      allOk = false;
    }

    const cursorSkillPath = join(
      PROJECT_DIR,
      ".cursor",
      "skills",
      "meta-theory",
      "SKILL.md",
    );
    if (existsSync(cursorSkillPath)) ok(t.syncCursorSkills);
    else {
      fail(t.syncMissing(".cursor/skills/meta-theory/SKILL.md"));
      allOk = false;
    }

    const cursorMcp = join(PROJECT_DIR, ".cursor", "mcp.json");
    if (existsSync(cursorMcp)) {
      ok(t.syncCursorMcp);
      const notice = metaKimRuntimeNotice(cursorMcp);
      if (notice) warn(notice);
    } else {
      warn(t.syncMissing(".cursor/mcp.json"));
      allOk = false;
    }
  }

  console.log();
  if (allOk) info(t.syncOk);
  return allOk;
}

// ── Step 1: Pre-flight checks ───────────────────────────

function preflight() {
  heading(t.preflightHeading);
  let passed = true;

  const nodeVer = process.versions.node;
  if (isSupportedNodeVersion(nodeVer)) ok(t.nodeOk(nodeVer));
  else {
    fail(t.nodeOld(nodeVer));
    passed = false;
  }

  const npmVer = run("npm --version");
  if (npmVer) ok(t.npmVerOk(npmVer));
  else {
    fail(t.npmNotFound);
    passed = false;
  }

  const gitVer = run("git --version");
  if (gitVer) ok(`${gitVer}`);
  else {
    fail(t.gitNotFound);
    passed = false;
  }

  if (PROXY) info(t.proxyInfo(PROXY));
  if (existsSync(join(PROJECT_DIR, "package.json"))) ok(t.pkgFound);
  else {
    fail(t.pkgNotFound);
    passed = false;
  }

  return passed;
}

// ── Step 2: Runtime detection ───────────────────────────

async function detectRuntimes() {
  heading(t.stepRuntime);
  const runtimes = {
    claude: false,
    codex: false,
    openclaw: false,
    cursor: false,
  };

  const claudeVer = detectCli("claude");
  if (claudeVer) {
    ok(t.claudeDetected(claudeVer));
    runtimes.claude = true;
  } else warn(t.claudeNotDetected);

  const codexVer = detectCli("codex");
  if (codexVer) {
    ok(t.codexDetected(codexVer));
    runtimes.codex = true;
  } else skip(t.codexNotDetected);

  const openclawVer = detectCli("openclaw") || detectCli("oc");
  if (openclawVer) {
    ok(t.openclawDetected(openclawVer));
    runtimes.openclaw = true;
  } else skip(t.openclawNotDetected);

  const cursorVer = detectCli("cursor");
  if (cursorVer) {
    ok(t.cursorDetected(cursorVer));
    runtimes.cursor = true;
  } else skip(t.cursorNotDetected);

  if (
    !runtimes.claude &&
    !runtimes.codex &&
    !runtimes.openclaw &&
    !runtimes.cursor
  ) {
    console.log("");
    console.log(`${C.yellow}⚠ ${t.noRuntime}${C.reset}`);
    console.log(`${C.dim}${t.noRuntimeHint1}${C.reset}`);
    console.log(
      `${C.dim}${fmt(t.noRuntimeHint2, {
        claudeCodeDocs:
          EXTERNAL_URLS.claudeCodeDocs ||
          "https://docs.anthropic.com/en/docs/claude-code",
      })}${C.reset}`,
    );
    console.log("");
    const proceed = await askYesNo(t.continueAnyway, false);
    if (!proceed) {
      console.log("");
      console.log(`${C.dim}${t.setupCancelled}${C.reset}`);
      console.log("");
      process.exit(0);
    }
  }

  return runtimes;
}

function detectedTargetIds(runtimes) {
  return RUNTIME_CHOICES.filter((choice) => runtimes[choice.id]).map(
    (choice) => choice.id,
  );
}

async function selectActiveTargets(runtimes) {
  const { cliTargets, defaultTargets } = await resolveTargetContext(args);
  const localOverrides = await loadLocalOverrides();

  if (cliTargets.length > 0) {
    await writeLocalOverrides({ ...localOverrides, activeTargets: cliTargets });
    info(t.activeRuntimesSavedCli(cliTargets.join(", ")));
    return cliTargets;
  }

  const chosenTargets = await askMultiSelectTargets(
    t.selectRuntimeTargets,
    RUNTIME_CHOICES,
    defaultTargets,
  );

  await writeLocalOverrides({
    ...localOverrides,
    activeTargets: chosenTargets,
  });
  info(t.savedActiveTargets(chosenTargets.join(", ")));

  // Platform capability transparency: warn if Claude Code is not selected
  const hasClaude = chosenTargets.includes("claude");
  if (!hasClaude) {
    console.log(`
⚠  平台能力提示:
   您选择的平台暂不支持以下功能:
   • Hook 自动化 (PreToolUse/PostToolUse)
   • Layer 1 Memory 自动激活
   • CLI 快速命令 (npm run meta:xxx)

   推荐: Claude Code 提供最完整的 Meta_Kim 体验。
         https://docs.anthropic.com/claude-code
`);
  }

  return chosenTargets;
}

function runNodeScript(scriptRelative, extraArgs = [], envOverrides = {}) {
  // Automatically pass --lang to child scripts
  const langArgs = currentLangCode ? ["--lang", currentLangCode] : [];
  const spawnConfig = buildNodeScriptSpawn(
    process.execPath,
    PROJECT_DIR,
    scriptRelative,
    extraArgs,
    langArgs,
  );
  const mergedOptions = {
    ...spawnConfig.options,
    env: {
      ...process.env,
      ...envOverrides,
    },
  };
  return spawnSync(spawnConfig.command, spawnConfig.args, mergedOptions);
}

function refreshGlobalCapabilityInventory(activeTargets = []) {
  info(t.refreshGlobalCapabilityInventory);
  const targetArgs =
    Array.isArray(activeTargets) && activeTargets.length > 0
      ? ["--runtime-inventory-only", "--targets", activeTargets.join(",")]
      : ["--runtime-inventory-only"];
  const result = runNodeScript("scripts/discover-global-capabilities.mjs", targetArgs, {
    META_KIM_LANG: currentLangCode,
  });
  if (result.status === 0) {
    ok(t.globalCapabilityInventoryRefreshed);
    return true;
  }
  warn(t.globalCapabilityInventoryFailed);
  return false;
}

function metaTheoryGlobalSyncArgs(targets) {
  const targetList = Array.isArray(targets) ? targets.join(",") : String(targets);
  const syncArgs = ["--targets", targetList];
  const hookTargets = targetList
    .split(",")
    .map((target) => target.trim())
    .filter(Boolean);
  if (hookTargets.some((target) => ["claude", "codex"].includes(target))) {
    syncArgs.push("--with-global-hooks");
  }
  return syncArgs;
}

function nonClaudeGlobalRuntimeHookTargets(targets) {
  const targetList = Array.isArray(targets)
    ? targets
    : String(targets || "")
        .split(",")
        .filter(Boolean);
  return targetList.filter((target) =>
    ["cursor", "openclaw"].includes(target),
  );
}

function formatRuntimeTargetLabels(targets) {
  const labels = new Map(RUNTIME_CHOICES.map((choice) => [choice.id, choice.label]));
  return targets.map((target) => labels.get(target) || target).join(", ");
}

function syncNonClaudeGlobalRuntimeHooks(targets) {
  const hookTargets = nonClaudeGlobalRuntimeHookTargets(targets);
  if (hookTargets.length === 0) return true;
  const syncResult = runNodeScript("scripts/sync-runtimes.mjs", [
    "--scope",
    "global",
    "--targets",
    hookTargets.join(","),
  ]);
  return syncResult.status === 0;
}

// Returns { ok: boolean, missing: string[], stale: string[] } for the global
// Meta_Kim hooks dir. Used by global hook migration and sync checks.
function checkGlobalHooksCompleteness(hooksDir) {
  const missing = [];
  const stale = [];
  if (!existsSync(hooksDir)) {
    return { ok: false, missing: GLOBAL_HOOK_PACKAGE_FILES_LIST, stale: [] };
  }
  for (const fileName of GLOBAL_HOOK_PACKAGE_FILES_LIST) {
    if (!existsSync(join(hooksDir, fileName))) {
      missing.push(fileName);
    }
  }
  let entries = [];
  try {
    entries = readdirSync(hooksDir);
  } catch {
    return { ok: missing.length === 0, missing, stale };
  }
  for (const entry of entries) {
    if (
      entry.endsWith(".mjs") &&
      !GLOBAL_HOOK_PACKAGE_FILES_LIST.includes(entry)
    ) {
      stale.push(entry);
    }
  }
  return { ok: missing.length === 0 && stale.length === 0, missing, stale };
}

// Migrate the global Meta_Kim hooks dir: back up + remove files that no
// longer match the canonical whitelist (e.g. legacy spine-state.mjs), and
// user-authored files (anything not on the whitelist) are preserved.
async function migrateGlobalMetaKimHooksDir(hooksDir) {
  const result = { removed: [], kept: [], backupDir: null, status: "noop" };
  if (!existsSync(hooksDir)) return result;
  let entries = [];
  try {
    entries = await fs.readdir(hooksDir);
  } catch {
    return result;
  }
  const metaKimFiles = entries.filter(
    (e) =>
      e.endsWith(".mjs") &&
      GLOBAL_HOOK_PACKAGE_FILES_LIST.includes(e) === false,
  );
  if (metaKimFiles.length === 0) {
    result.status = "clean";
    return result;
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = `${hooksDir}.meta-kim.bak-${ts}`;
  let confirmed = false;
  if (silentMode || checkMode) {
    confirmed = true;
  } else {
    info(t.globalHooksMigrationHeading);
    info(t.globalHooksMigrationFound(metaKimFiles.length));
    info(t.globalHooksMigrationListed(metaKimFiles));
    const remaining = entries.filter((e) => !metaKimFiles.includes(e));
    if (remaining.length > 0) {
      info(t.globalHooksMigrationKept(remaining));
    }
    confirmed = await askYesNo(
      t.globalHooksMigrationConfirm(metaKimFiles.length),
      false,
    );
  }
  if (!confirmed) {
    result.status = "skipped";
    warn(t.globalHooksMigrationSkipped);
    return result;
  }
  await fs.mkdir(backupDir, { recursive: true });
  for (const fileName of metaKimFiles) {
    try {
      await fs.copyFile(join(hooksDir, fileName), join(backupDir, fileName));
      await fs.unlink(join(hooksDir, fileName));
      result.removed.push(fileName);
    } catch (error) {
      if (error.code !== "ENOENT") {
        warn(
          `[Meta_Kim] Failed to migrate ${fileName}: ${error.message}`,
        );
      }
    }
  }
  result.backupDir = backupDir;
  result.kept = entries.filter((e) => !metaKimFiles.includes(e));
  result.status = "migrated";
  if (!silentMode) {
    info(t.globalHooksMigrationBackedUp(backupDir));
    info(t.globalHooksMigrationDone(result.removed.length));
  }
  return result;
}

// ── Legacy skill file cleanup ────────────────────────────
// Precise removal of old single-file skill format that was replaced
// by directory format (meta-theory.md → meta-theory/SKILL.md).

const LEGACY_PROJECT_PATHS = [
  join(PROJECT_DIR, ".claude", "skills", "meta-theory.md"),
  join(PROJECT_DIR, ".codex", "skills", "meta-theory.md"),
  join(PROJECT_DIR, ".codex", "skills", "references"),
  join(PROJECT_DIR, ".codex", "skills", "meta-theory"),
  join(PROJECT_DIR, "openclaw", "skills", "meta-theory.md"),
  join(PROJECT_DIR, "openclaw", "skills", "references"),
  join(PROJECT_DIR, ".cursor", "skills", "meta-theory.md"),
];

const LEGACY_GLOBAL_PATHS = [
  {
    id: "claude",
    file: join(homedir(), ".claude", "skills", "meta-theory.md"),
  },
  {
    id: "codex",
    file: join(homedir(), ".codex", "skills", "meta-theory.md"),
    dir: join(homedir(), ".codex", "skills", "references"),
  },
  {
    id: "openclaw",
    file: join(homedir(), ".openclaw", "skills", "meta-theory.md"),
    dir: join(homedir(), ".openclaw", "skills", "references"),
  },
  {
    id: "cursor",
    file: join(homedir(), ".cursor", "skills", "meta-theory.md"),
  },
];

function cleanupLegacySkills(scope = "project") {
  let cleaned = 0;

  if (scope === "project") {
    for (const p of LEGACY_PROJECT_PATHS) {
      if (!existsSync(p)) continue;
      try {
        rmSync(p, { recursive: true, force: true });
        cleaned++;
      } catch {
        // Best-effort: locked or permission-denied is non-fatal
      }
    }
  }

  if (scope === "global") {
    for (const { file, dir } of LEGACY_GLOBAL_PATHS) {
      for (const p of [file, dir]) {
        if (!existsSync(p)) continue;
        try {
          rmSync(p, { recursive: true, force: true });
          cleaned++;
        } catch {
          // Best-effort
        }
      }
    }
  }

  return cleaned;
}

// ── Step 3: Auto-configure project files ────────────────

async function autoConfigure(installScope = "project", activeTargets = []) {
  const syncArgs = ["--scope", installScope];
  if (activeTargets.length > 0) {
    syncArgs.push("--targets", activeTargets.join(","));
  }
  const syncResult = runNodeScript("scripts/sync-runtimes.mjs", syncArgs);
  if (syncResult.status === 0) {
    ok(t.okRepoSynced);
    return true;
  }
  fail(t.failRepoSync);
  return false;
}

// ── Step 4: npm install + skills ────────────────────────

function installDeps() {
  if (existsSync(join(PROJECT_DIR, "node_modules", "@modelcontextprotocol"))) {
    if (!updateMode) {
      skip(t.nodeModulesExist);
      return true;
    }
  }
  info(t.runningNpm);
  const result = spawnSync("npm", ["install"], {
    cwd: PROJECT_DIR,
    stdio: "inherit",
    shell: isWin,
  });
  if (result.status === 0) {
    ok(t.npmDone);
    return true;
  }
  fail(t.npmFailed);
  return false;
}

function installSkill(skill) {
  const target = join(SKILLS_DIR, skill.name);
  const proxy = gitProxyArgs();

  if (existsSync(target)) {
    if (updateMode) {
      if (skill.subdir) {
        rmSync(target, { recursive: true, force: true });
      } else {
        const pullResult = run(`git ${proxy} pull --ff-only`.trim(), {
          cwd: target,
        });
        if (pullResult !== null) {
          ok(t.skillUpdated(skill.name));
          return true;
        }
        // ff-only failure: don't delete the existing skill, just warn and skip
        warn(t.skillUpdateFailed(skill.name));
        return true;
      }
    } else {
      skip(t.skillExists(skill.name));
      return true;
    }
  }

  if (skill.subdir) return installSkillFromSubdir(skill, target, proxy);

  const url = `https://github.com/${skill.repo}.git`;
  const cloneResult = run(
    `git ${proxy} clone --depth 1 "${url}" "${target}"`.trim(),
  );
  if (cloneResult !== null) {
    ok(t.skillInstalled(skill.name));
    return true;
  }
  fail(t.skillFailed(skill.name, skill.repo));
  return false;
}

function installSkillFromSubdir(skill, target, proxy) {
  const url = `https://github.com/${skill.repo}.git`;
  const tmp = join(tmpdir(), `meta-kim-skill-${Date.now()}`);
  try {
    const cloneResult = run(
      `git ${proxy} clone --depth 1 --filter=blob:none --sparse "${url}" "${tmp}"`.trim(),
    );
    if (cloneResult === null) {
      fail(t.skillFailed(skill.name, "clone failed"));
      return false;
    }
    const checkoutResult = run(`git sparse-checkout set "${skill.subdir}"`, {
      cwd: tmp,
    });
    if (checkoutResult === null) {
      fail(t.skillSubdirNotFound(skill.name));
      return false;
    }
    const src = join(tmp, skill.subdir);
    if (!existsSync(src)) {
      fail(t.skillSubdirNotFound(skill.name));
      return false;
    }
    mkdirSync(target, { recursive: true });
    cpSync(src, target, { recursive: true });
    ok(t.skillSubdirInstalled(skill.name, skill.subdir));
    return true;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// NOTE: This function is currently NOT used in the main install flow.
// Skills installation is now handled by scripts/install-global-skills-all-runtimes.mjs
// which is called from runInstall(). This function is kept for reference
// or potential future use cases where direct skill installation is needed.
async function installAllSkills() {
  heading(t.stepSkills);
  if (!silentMode) {
    console.log(`${C.dim}${t.shipsSkills(SKILLS.length)}${C.reset}`);
    SKILLS.forEach((s) => console.log(`${C.dim}•${C.reset} ${s.name}`));
    console.log();
  }
  installDeps();
  mkdirSync(SKILLS_DIR, { recursive: true });
  let installed = 0,
    failed = 0;
  for (const skill of SKILLS) {
    if (installSkill(skill)) installed++;
    else failed++;
  }
  console.log();
  info(t.skillsReady(installed, SKILLS.length, failed));
  return failed === 0;
}

// ── Step 4.5: Optional Python tools (graphify) ─────────

function checkPython310() {
  return detectPython310(spawnSync, platform(), {
    requirePip: true,
    bootstrapPip: true,
  });
}

// graphify platform name → graphify install command
const GRAPHIFY_PLATFORM_MAP = {
  claude: "claude",
  codex: "codex",
  openclaw: "claw",
  cursor: "cursor",
};

const GRAPHIFY_GUIDE_TARGETS = {
  claude: "CLAUDE.md",
  codex: "AGENTS.md",
  claw: "AGENTS.md",
  opencode: "AGENTS.md",
  aider: "AGENTS.md",
  droid: "AGENTS.md",
  trae: "AGENTS.md",
  "trae-cn": "AGENTS.md",
};

function guideAlreadyHasGraphifySection(platform, baseDir = PROJECT_DIR) {
  const target = GRAPHIFY_GUIDE_TARGETS[platform];
  if (!target) return false;
  const filePath = join(baseDir, target);
  if (!existsSync(filePath)) return false;
  const content = readFileSync(filePath, "utf8");
  return /^##\s+graphify\b/im.test(content);
}

function expandGraphifyTargets(activeTargets) {
  const targets = Array.isArray(activeTargets) ? activeTargets : [activeTargets];
  if (targets.includes("all")) return Object.keys(GRAPHIFY_PLATFORM_MAP);
  return targets;
}

/**
 * Attempt to auto-download and install Python 3.10+.
 * Returns the Python object on success, null on failure or user decline.
 */
async function downloadAndInstallPython() {
  const p = platform();
  if (silentMode) return null;

  const answer = await askYesNo(t.pythonNotFoundOfferInstall, true);
  if (!answer) {
    info(t.pythonHint);
    return null;
  }

  if (p === "win32") {
    // Try winget first (most reliable on Windows 10/11)
    const wingetCheck = spawnSync("winget", ["--version"], {
      encoding: "utf8",
    });
    const wingetAvailable = wingetCheck.status === 0;

    if (wingetAvailable) {
      info(t.pythonInstallWinget);
      console.log(`${C.dim}  ${t.pythonInstallWingetHint}${C.reset}`);
      const result = spawnSync(
        "winget",
        [
          "install",
          "--id",
          "Python.Python.3.11",
          "--accept-package-agreements",
          "--accept-source-agreements",
        ],
        { stdio: "inherit", shell: true },
      );
      // winget returns non-zero for "package already installed, no upgrade
      // available" and for genuine failures alike — re-run detection either
      // way so an already-installed Python (that just isn't on PATH) is not
      // reported as "winget unavailable".
      const newPython = checkPython310();
      if (newPython) {
        if (result.status === 0) ok(t.pythonInstallSuccess);
        return newPython;
      }
      // Python still not found. Differentiate "winget ran but PATH needs
      // refresh" from "winget could not install".
      if (result.status === 0) {
        warn(
          t.pythonInstallNotSupported(
            "Windows (restart shell to pick up PATH)",
          ),
        );
      } else {
        warn(t.pythonInstallNotSupported("Windows (winget install failed)"));
      }
      info(t.pythonHint);
      return null;
    }

    // winget not available at all
    warn(t.pythonInstallNotSupported("Windows (winget unavailable)"));
    info(t.pythonHint);
    return null;
  } else if (p === "darwin") {
    warn(t.pythonInstallNotSupported("macOS"));
    info(
      `Run: brew install python@3.11  ${C.dim}(or python3.12 if preferred)${C.reset}`,
    );
    return null;
  } else {
    warn(t.pythonInstallNotSupported(p));
    info(
      `Run: sudo apt install python3.11  ${C.dim}(or your distro's package manager)${C.reset}`,
    );
    return null;
  }
}

async function installPythonTools(
  activeTargets,
  inUpdateMode = false,
  targetDir = PROJECT_DIR,
  options = {},
) {
  heading(t.stepPythonTools);
  const projectWiring = options.projectWiring !== false;
  const graphifyDir = resolve(targetDir);
  let python = checkPython310();
  if (!python) {
    python = await downloadAndInstallPython();
    if (!python) return false;
  }

  // Check if graphify already installed via pip show (more reliable than --version)
  const pipShow = runPythonModule(python, ["-m", "pip", "show", "graphifyy"]);
  if (pipShow.status === 0) {
    const version =
      extractPipShowVersion(readProcessText(pipShow)) ?? "unknown";
    if (inUpdateMode) {
      // Upgrade in update mode
      info(t.graphifyUpgrading);
      const upgradeResult = runPythonModule(
        python,
        ["-m", "pip", "install", "--upgrade", "graphifyy"],
        undefined,
        { stdio: "pipe" },
      );
      if (upgradeResult.status !== 0) {
        const stderr = readProcessText(upgradeResult);
        warn(t.graphifyUpgradeFailed);
        if (stderr) {
          console.log(`${C.dim}${t.pipErrorDetail(stderr)}${C.reset}`);
        }
        return false;
      }
      const newVersion =
        extractPipShowVersion(readProcessText(upgradeResult)) ?? version;
      ok(t.graphifyUpgraded(newVersion));
    } else {
      ok(t.graphifyAlreadyInstalled(version));
    }
  } else {
    // Install graphify
    info(t.graphifyInstalling);
    const installResult = runPythonModule(
      python,
      ["-m", "pip", "install", "graphifyy"],
      undefined,
      { stdio: "pipe" },
    );
    if (installResult.status !== 0) {
      const stderr = readProcessText(installResult);
      warn(t.graphifyInstallFailed);
      if (stderr) {
        console.log(`${C.dim}${t.pipErrorDetail(stderr)}${C.reset}`);
      }
      return false;
    }
    ok(t.graphifyInstalled);
  }

  // Ensure networkx >= 3.4 for louvain_communities(max_level) compatibility
  ensureNetworkxCompatibility(python);

  if (!projectWiring) {
    skip(t.graphifyProjectWiringSkipped);
    return true;
  }

  // Idempotent wiring: register graphify skill for each active target + git hooks once.
  // git hooks are cross-platform (commit/checkout trigger), install once.
  // If the repo wasn't cloned via git (e.g. extracted from a zip), `.git` won't
  // exist and `graphify hook install` has nowhere to write — that's not a real
  // failure, just a no-op environment. Skip cleanly instead of alarming the user.
  if (!existsSync(join(graphifyDir, ".git"))) {
    info(
      "Skipping graphify git hook (not a git repository — run `git init` or clone via git to enable auto-rebuild)",
    );
  } else {
    const hookResult = runPythonModule(
      python,
      ["-m", "graphify", "hook", "install"],
      undefined,
      { cwd: graphifyDir, stdio: "pipe" },
    );
    if (hookResult.status === 0) {
      ok(t.graphifyHookInstalled);
    } else {
      warn(t.graphifyHookFailed);
      const hookStdout = readProcessText(hookResult);
      const hookStderr = (hookResult.stderr || "").toString().trim();
      if (hookStdout) {
        console.log(`${C.dim}stdout: ${hookStdout}${C.reset}`);
      }
      if (hookStderr) {
        console.log(`${C.dim}stderr: ${hookStderr}${C.reset}`);
      }
      if (hookResult.error?.message) {
        console.log(
          `${C.dim}spawn error: ${hookResult.error.message}${C.reset}`,
        );
      }
    }
  }

  // Register graphify skill for each active platform
  for (const target of expandGraphifyTargets(activeTargets)) {
    const platform = GRAPHIFY_PLATFORM_MAP[target];
    if (!platform) continue;
    if (guideAlreadyHasGraphifySection(platform, graphifyDir)) {
      skip(t.graphifySkillSkippedGuideExists(platform));
      continue;
    }
    info(t.graphifySkillRegistering(platform));
    const skillResult = runPythonModule(
      python,
      ["-m", "graphify", platform, "install"],
      undefined,
      { cwd: graphifyDir, stdio: "pipe" },
    );
    if (skillResult.status === 0) {
      ok(t.graphifySkillRegistered(platform));
    } else {
      warn(t.graphifySkillFailed(platform));
    }
  }

  const rebuildResult = runPythonModule(
    python,
    ["-m", "graphify", "update", "."],
    undefined,
    { cwd: graphifyDir, stdio: "pipe" },
  );
  if (rebuildResult.status === 0) {
    ok(t.graphifyCodeGraphGenerated);
    return true;
  } else {
    warn(t.graphifyCodeGraphGenerationFailed);
    const rebuildOutput = readProcessText(rebuildResult);
    if (rebuildOutput) {
      console.log(`${C.dim}${rebuildOutput}${C.reset}`);
    }
    return false;
  }
}

// ── Step 4.6: Optional MCP Memory Service (Layer 3) ─────

// Python resolution strategy for MCP Memory Service.
// The upstream package depends on safetensors, which often fails to build on
// Python 3.13. We prefer 3.11/3.12; if the detected Python is outside that
// range, we try to build an isolated venv locked to 3.12.
//
// NOTE: detectPython310() returns a launcher descriptor, not a string:
//   { command: string, args: string[], version: { major, minor, patch }, versionText }
// All helpers below consume and return the same shape so they integrate
// cleanly with runPythonModule(python, args) and formatPythonLauncher(python).

function isSupportedMemoryPython(pythonLauncher) {
  const v = pythonLauncher?.version;
  if (!v || typeof v.major !== "number" || typeof v.minor !== "number") {
    return false;
  }
  return v.major === 3 && v.minor >= 11 && v.minor <= 12;
}

function probePythonLauncher(command, args, spawnFn = spawnSync) {
  try {
    const result = spawnFn(command, [...args, "--version"], {
      encoding: "utf8",
      shell: false,
    });
    if (result?.error || result?.status !== 0) return null;
    const versionText = readProcessText(result);
    const m = /Python\s+(\d+)\.(\d+)(?:\.(\d+))?/i.exec(versionText || "");
    if (!m) return null;
    return {
      command,
      args: [...args],
      version: {
        major: Number(m[1]),
        minor: Number(m[2]),
        patch: Number(m[3] || 0),
      },
      versionText: (versionText || "").trim(),
    };
  } catch {
    return null;
  }
}

function findPython311Or312(spawnFn = spawnSync) {
  const isWin = platform() === "win32";
  const candidates = isWin
    ? [
        ["py", ["-3.12"]],
        ["py", ["-3.11"]],
        ["python3.12", []],
        ["python3.11", []],
      ]
    : [
        ["python3.12", []],
        ["python3.11", []],
        ["py", ["-3.12"]],
        ["py", ["-3.11"]],
      ];

  for (const [command, args] of candidates) {
    const probe = probePythonLauncher(command, args, spawnFn);
    if (probe && isSupportedMemoryPython(probe)) {
      return probe;
    }
  }
  return null;
}

function venvPythonPath(venvDir) {
  const isWin = platform() === "win32";
  return isWin
    ? join(venvDir, "Scripts", "python.exe")
    : join(venvDir, "bin", "python");
}

function createMemoryServiceVenv(sourceLauncher, venvDir, spawnFn = spawnSync) {
  if (!sourceLauncher) return null;
  try {
    const parent = dirname(venvDir);
    if (!existsSync(parent)) {
      mkdirSync(parent, { recursive: true });
    }
    const result = spawnFn(
      sourceLauncher.command,
      [...sourceLauncher.args, "-m", "venv", venvDir],
      { encoding: "utf8", shell: false, stdio: "inherit" },
    );
    if (result.status !== 0) return null;

    const venvPython = venvPythonPath(venvDir);
    if (!existsSync(venvPython)) return null;

    const probed = probePythonLauncher(venvPython, [], spawnFn);
    if (!probed) return null;
    return { ...probed, absolutePath: true };
  } catch {
    return null;
  }
}

function resolvePythonForMemoryService(detectedPython) {
  if (isSupportedMemoryPython(detectedPython)) {
    return { python: detectedPython, venvCreated: false };
  }

  const detectedLabel = detectedPython?.versionText || "unknown";
  warn(
    `Detected ${detectedLabel} — mcp-memory-service prefers Python 3.11/3.12 (safetensors may fail on 3.13).`,
  );

  const venvDir = join(homedir(), ".meta-kim", "memory-venv");
  const existingVenvPython = venvPythonPath(venvDir);
  if (existsSync(existingVenvPython)) {
    const existingProbe = probePythonLauncher(existingVenvPython, []);
    if (existingProbe && isSupportedMemoryPython(existingProbe)) {
      ok(`Reusing existing venv: ${venvDir}`);
      return {
        python: { ...existingProbe, absolutePath: true },
        venvCreated: false,
        venvDir,
      };
    }
  }

  info("Attempting to create an isolated venv locked to Python 3.11/3.12...");
  const sourceLauncher = findPython311Or312();
  if (!sourceLauncher) {
    warn(
      "No Python 3.11/3.12 launcher found — falling back to detected Python (install may fail).",
    );
    info(
      platform() === "win32"
        ? "Install Python 3.12 from python.org, or run: winget install Python.Python.3.12"
        : "Install Python 3.12 via your package manager (e.g. apt/brew/pyenv).",
    );
    return { python: detectedPython, venvCreated: false, fallback: true };
  }

  const venvLauncher = createMemoryServiceVenv(sourceLauncher, venvDir);
  if (!venvLauncher) {
    warn(
      "Failed to create 3.12 venv — falling back to detected Python (install may fail).",
    );
    return { python: detectedPython, venvCreated: false, fallback: true };
  }

  ok(`Created venv at ${venvDir}`);
  return { python: venvLauncher, venvCreated: true, venvDir };
}

async function runMcpMemoryHookInstaller(activeTargets = DEFAULT_TARGETS.map((target) => target.id)) {
  const hookScript = join(
    PROJECT_DIR,
    "scripts",
    "install-mcp-memory-hooks.mjs",
  );
  if (!existsSync(hookScript)) {
    warn(`Hook installer missing: ${hookScript}`);
    return;
  }

  const spawnDesc = buildNodeScriptSpawn(
    process.execPath,
    PROJECT_DIR,
    "scripts/install-mcp-memory-hooks.mjs",
    ["--targets", activeTargets.join(",")],
  );
  let result;
  await withProgress(t.mcpMemoryHookInstalling, async () => {
    result = spawnSync(spawnDesc.command, spawnDesc.args, {
      ...spawnDesc.options,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
    });
  });

  if (result.status === 0) {
    ok(t.mcpMemoryHookInstalled);
  } else {
    warn(t.mcpMemoryHookWarnings);
    const stderrText = (result.stderr || "").trim();
    if (stderrText) {
      console.log(`${C.dim}${stderrText}${C.reset}`);
    }
  }
}

function checkMcpMemoryService(python) {
  const result = runPythonModule(python, [
    "-m",
    "pip",
    "show",
    "mcp-memory-service",
  ]);
  if (result.status !== 0) {
    return { installed: false, version: null };
  }
  const versionMatch = (result.stdout || "").match(/Version:\s*(.+)/i);
  return {
    installed: true,
    version: versionMatch ? versionMatch[1].trim() : null,
  };
}

function findMemoryBinPath(resolved) {
  const plat = platform();
  const binName = plat === "win32" ? "memory.exe" : "memory";

  // Strategy 1: resolve python executable, then check nearby directories
  let pythonCmd = resolved.python.command || resolved.python;
  if (
    !/\//.test(pythonCmd) &&
    !/\\/.test(pythonCmd) &&
    !/[A-Za-z]:/.test(pythonCmd)
  ) {
    try {
      const launcher = resolved.python;
      const result = spawnSync(
        launcher.command,
        [...launcher.args, "-c", "import sys; print(sys.executable)"],
        { encoding: "utf8", shell: false },
      );
      if (result.status === 0 && result.stdout.trim()) {
        pythonCmd = result.stdout.trim();
      }
    } catch {}
  }
  const pythonDir = dirname(pythonCmd);

  const sameDir = join(pythonDir, binName);
  if (existsSync(sameDir)) return sameDir;

  if (plat === "win32") {
    const scriptsDir = join(pythonDir, "Scripts", binName);
    if (existsSync(scriptsDir)) return scriptsDir;
  }

  const binDir = join(pythonDir, "..", "bin", binName);
  if (existsSync(binDir)) return resolve(binDir);

  // Strategy 2: search system PATH (handles cross-install pip --user case)
  const whichCmd = plat === "win32" ? "where" : "which";
  try {
    const result = spawnSync(whichCmd, [binName], {
      encoding: "utf8",
      shell: true,
    });
    if (result.status === 0 && result.stdout.trim()) {
      const found = result.stdout.trim().split(/\r?\n/)[0];
      if (found && existsSync(found)) return found;
    }
  } catch {}

  return null;
}

function buildMcpMemoryServerConfig(resolved) {
  const memoryBin = findMemoryBinPath(resolved);
  if (memoryBin) {
    return {
      command: memoryBin,
      args: ["server"],
    };
  }
  const python = resolved.python;
  return {
    command: python.command,
    args: [...python.args, "-m", "mcp_memory_service.server"],
  };
}

function isLegacyMcpMemoryServerConfig(config) {
  return (
    Array.isArray(config?.args) &&
    config.args.includes("-m") &&
    config.args.includes("mcp_memory_service")
  );
}

function stopMcpMemoryService() {
  const plat = platform();
  try {
    if (plat === "win32") {
      execSync("taskkill /F /IM memory.exe", { stdio: "pipe" });
    } else if (plat === "darwin") {
      try {
        execSync(
          "launchctl unload ~/Library/LaunchAgents/com.meta-kim.mcp-memory-service.plist 2>/dev/null",
          { stdio: "pipe" },
        );
      } catch {}
      execSync("pkill -f 'memory server --http'", { stdio: "pipe" });
    } else {
      execSync("pkill -f 'memory server --http'", { stdio: "pipe" });
    }
    return true;
  } catch {
    return false;
  }
}

function isMcpMemoryProcessRunning() {
  if (platform() !== "win32") return false;
  try {
    const result = spawnSync(
      "pwsh.exe",
      [
        "-NoProfile",
        "-Command",
        "if (Get-Process -Name memory -ErrorAction SilentlyContinue) { 'running' }",
      ],
      { encoding: "utf8", windowsHide: true },
    );
    if (result.status === 0 && result.stdout.includes("running")) return true;
  } catch {}

  try {
    const result = spawnSync("tasklist", ["/FI", "IMAGENAME eq memory.exe"], {
      encoding: "utf8",
      windowsHide: true,
    });
    return result.status === 0 && /\bmemory\.exe\b/iu.test(result.stdout);
  } catch {
    return false;
  }
}

async function startMcpMemoryServiceBackground(resolved) {
  const memoryBin = findMemoryBinPath(resolved);
  if (!memoryBin) {
    warn(t.mcpMemoryAutoStartFailed);
    info(t.mcpMemoryAutoStartManual);
    return;
  }

  info(t.mcpMemoryAutoStarting);
  const env = {
    ...process.env,
    MCP_ALLOW_ANONYMOUS_ACCESS: "true",
    HF_HUB_OFFLINE: "1",
    TRANSFORMERS_OFFLINE: "1",
  };

  try {
    const child = spawn(memoryBin, ["server", "--http"], {
      env,
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  } catch {
    // Background start may report errors but still succeed
  }

  // Poll health endpoint — service may need several seconds to initialize
  const POLL_INTERVAL = 1500;
  const POLL_MAX_MS = 10000;
  const pollStart = Date.now();
  let healthy = false;

  while (Date.now() - pollStart < POLL_MAX_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    healthy = await new Promise((resolve) => {
      const req = http.get(
        "http://127.0.0.1:8000/api/health",
        { timeout: 3000 },
        (res) => {
          let body = "";
          res.on("data", (c) => (body += c));
          res.on("end", () => resolve(body.includes("healthy")));
        },
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
    });
    if (healthy) break;
  }

  if (healthy) {
    ok(t.mcpMemoryAutoStarted);
    const bootOk = configureBootAutoStart(memoryBin);
    if (bootOk) ok(t.mcpMemoryAutoStartBoot);
    return;
  }

  if (isMcpMemoryProcessRunning()) {
    ok(t.mcpMemoryAutoStartUnverified);
    const bootOk = configureBootAutoStart(memoryBin);
    if (bootOk) ok(t.mcpMemoryAutoStartBoot);
    return;
  }

  warn(t.mcpMemoryAutoStartFailed);
  info(t.mcpMemoryAutoStartManual);
}

function configureBootAutoStart(memoryBin) {
  const plat = platform();
  const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;
  const psSingleQuote = (value) => `'${String(value).replace(/'/g, "''")}'`;
  const failureTitle = t.mcpMemoryAutoStartFailureTitle;
  const failureMessage = t.mcpMemoryAutoStartFailureMessage;
  try {
    if (plat === "win32") {
      const startupDir = join(
        homedir(),
        "AppData",
        "Roaming",
        "Microsoft",
        "Windows",
        "Start Menu",
        "Programs",
        "Startup",
      );
      if (!existsSync(startupDir)) return false;
      const metaKimDir = join(homedir(), ".meta-kim");
      mkdirSync(metaKimDir, { recursive: true });
      const psPath = join(metaKimDir, "mcp-memory-start.ps1");
      const cmdPath = join(metaKimDir, "mcp-memory-start.cmd");
      const vbsPath = join(startupDir, "mcp-memory-silent.vbs");
      const legacyCmdPath = join(startupDir, "mcp-memory-start.cmd");
      if (existsSync(legacyCmdPath)) rmSync(legacyCmdPath, { force: true });
      const escapedMemoryBin = memoryBin.replace(/'/g, "''");
      writeUtf8BomFileSync(
        psPath,
        `$ErrorActionPreference = "SilentlyContinue"\r\n` +
          `$env:MCP_ALLOW_ANONYMOUS_ACCESS = "true"\r\n` +
          `$env:HF_HUB_OFFLINE = "1"\r\n` +
          `$env:TRANSFORMERS_OFFLINE = "1"\r\n` +
          `$memoryBin = '${escapedMemoryBin}'\r\n` +
          `$failureTitle = ${psSingleQuote(failureTitle)}\r\n` +
          `$failureMessage = ${psSingleQuote(failureMessage)}\r\n` +
          `$logDir = Join-Path $env:USERPROFILE ".meta-kim"\r\n` +
          `$stdoutLog = Join-Path $logDir "mcp-memory.out.log"\r\n` +
          `$stderrLog = Join-Path $logDir "mcp-memory.err.log"\r\n` +
          `function Test-MetaKimMemoryHealth {\r\n` +
          `  try {\r\n` +
          `    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/health" -UseBasicParsing -TimeoutSec 3\r\n` +
          `    return ($response.Content -match "healthy")\r\n` +
          `  } catch { return $false }\r\n` +
          `}\r\n` +
          `if (Test-MetaKimMemoryHealth) { exit 0 }\r\n` +
          `try {\r\n` +
          `  Start-Process -FilePath $memoryBin -ArgumentList @("server", "--http") -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog\r\n` +
          `} catch {}\r\n` +
          `$healthy = $false\r\n` +
          `for ($i = 0; $i -lt 150; $i++) {\r\n` +
          `  Start-Sleep -Seconds 2\r\n` +
          `  if (Test-MetaKimMemoryHealth) { $healthy = $true; break }\r\n` +
          `}\r\n` +
          `if (-not $healthy) {\r\n` +
          `  Add-Type -AssemblyName PresentationFramework\r\n` +
          `  [System.Windows.MessageBox]::Show($failureMessage, $failureTitle, "OK", "Warning") | Out-Null\r\n` +
          `}\r\n`,
      );
      writeFileSync(
        cmdPath,
        `@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${psPath}"\r\n`,
      );
      writeFileSync(
        vbsPath,
        `Set WshShell = CreateObject("WScript.Shell")\r\nWshShell.Run """${cmdPath}""", 0, False\r\n`,
      );
      return true;
    }
    if (plat === "darwin") {
      const launchDir = join(homedir(), "Library", "LaunchAgents");
      mkdirSync(launchDir, { recursive: true });
      const metaKimDir = join(homedir(), ".meta-kim");
      mkdirSync(metaKimDir, { recursive: true });
      const logPath = join(metaKimDir, "mcp-memory.log");
      const scriptPath = join(metaKimDir, "mcp-memory-start.sh");
      writeFileSync(
        scriptPath,
        `#!/bin/sh\n` +
          `export MCP_ALLOW_ANONYMOUS_ACCESS=true\n` +
          `export HF_HUB_OFFLINE=1\n` +
          `export TRANSFORMERS_OFFLINE=1\n` +
          `MEMORY_BIN=${shellQuote(memoryBin)}\n` +
          `LOG_PATH=${shellQuote(logPath)}\n` +
          `TITLE=${shellQuote(failureTitle)}\n` +
          `MSG=${shellQuote(failureMessage)}\n` +
          `check_health() {\n` +
          `  command -v curl >/dev/null 2>&1 && curl -fsS --max-time 3 http://127.0.0.1:8000/api/health 2>/dev/null | grep -q healthy\n` +
          `}\n` +
          `notify_failure() {\n` +
          `  osascript -e "display dialog \\"$MSG\\" with title \\"$TITLE\\" buttons {\\"OK\\"} with icon caution" >/dev/null 2>&1 || true\n` +
          `}\n` +
          `check_health && exit 0\n` +
          `"$MEMORY_BIN" server --http >>"$LOG_PATH" 2>&1 &\n` +
          `healthy=0\n` +
          `i=0\n` +
          `while [ "$i" -lt 150 ]; do\n` +
          `  sleep 2\n` +
          `  if check_health; then healthy=1; break; fi\n` +
          `  i=$((i + 1))\n` +
          `done\n` +
          `[ "$healthy" -eq 1 ] || notify_failure\n`,
        { mode: 0o755 },
      );
      writeFileSync(
        join(launchDir, "com.meta-kim.mcp-memory-service.plist"),
        `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.meta-kim.mcp-memory-service</string>
  <key>ProgramArguments</key><array>
    <string>/bin/sh</string><string>${scriptPath}</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>MCP_ALLOW_ANONYMOUS_ACCESS</key><string>true</string>
    <key>HF_HUB_OFFLINE</key><string>1</string>
    <key>TRANSFORMERS_OFFLINE</key><string>1</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${logPath}</string>
  <key>StandardErrorPath</key><string>${logPath}</string>
</dict></plist>`,
      );
      return true;
    }
    // Linux: XDG autostart
    const autoDir = join(homedir(), ".config", "autostart");
    const metaKimDir = join(homedir(), ".meta-kim");
    mkdirSync(autoDir, { recursive: true });
    mkdirSync(metaKimDir, { recursive: true });
    const logPath = join(metaKimDir, "mcp-memory.log");
    const scriptPath = join(metaKimDir, "mcp-memory-start.sh");
    writeFileSync(
      scriptPath,
      `#!/bin/sh\n` +
        `export MCP_ALLOW_ANONYMOUS_ACCESS=true\n` +
        `export HF_HUB_OFFLINE=1\n` +
        `export TRANSFORMERS_OFFLINE=1\n` +
        `MEMORY_BIN=${shellQuote(memoryBin)}\n` +
        `LOG_PATH=${shellQuote(logPath)}\n` +
        `TITLE=${shellQuote(failureTitle)}\n` +
        `MSG=${shellQuote(failureMessage)}\n` +
        `check_health() {\n` +
        `  command -v curl >/dev/null 2>&1 && curl -fsS --max-time 3 http://127.0.0.1:8000/api/health 2>/dev/null | grep -q healthy\n` +
        `}\n` +
        `notify_failure() {\n` +
        `  if command -v notify-send >/dev/null 2>&1; then notify-send "$TITLE" "$MSG"; return; fi\n` +
        `  if command -v zenity >/dev/null 2>&1; then zenity --warning --title="$TITLE" --text="$MSG"; return; fi\n` +
        `  if command -v kdialog >/dev/null 2>&1; then kdialog --sorry "$MSG" --title "$TITLE"; return; fi\n` +
        `  if command -v xmessage >/dev/null 2>&1; then xmessage -center "$MSG"; return; fi\n` +
        `  printf '%s\\n' "$MSG" >>"$LOG_PATH"\n` +
        `}\n` +
        `check_health && exit 0\n` +
        `"$MEMORY_BIN" server --http >>"$LOG_PATH" 2>&1 &\n` +
        `healthy=0\n` +
        `i=0\n` +
        `while [ "$i" -lt 150 ]; do\n` +
        `  sleep 2\n` +
        `  if check_health; then healthy=1; break; fi\n` +
        `  i=$((i + 1))\n` +
        `done\n` +
        `[ "$healthy" -eq 1 ] || notify_failure\n`,
      { mode: 0o755 },
    );
    writeFileSync(
      join(autoDir, "mcp-memory-service.desktop"),
      `[Desktop Entry]\nType=Application\nName=MCP Memory Service\nExec=/bin/sh "${scriptPath}"\nNoDisplay=true\n`,
    );
    return true;
  } catch {
    return false;
  }
}

async function installMcpMemoryServiceStep(inUpdateMode = false, activeTargets = DEFAULT_TARGETS.map((target) => target.id)) {
  heading(t.stepMcpMemory);

  const want = await askYesNo(t.askMcpMemoryInstall, true);
  if (!want) {
    skip(`${C.dim}${t.mcpMemorySkipped}${C.reset}`);
    return;
  }

  // Detect Python — reuse same detection as graphify for consistency
  const detected = checkPython310();
  if (!detected) {
    warn(t.pythonNotFound);
    info(t.pythonHint);
    return;
  }

  // Resolve Python for mcp-memory-service (safetensors prefers 3.11/3.12).
  // When the detected Python is outside that range, try to build/reuse a venv
  // locked to 3.12. Falls back to the detected Python with a warning.
  const resolved = resolvePythonForMemoryService(detected);
  const python = resolved.python;

  // Check if already installed
  const existing = checkMcpMemoryService(python);
  if (existing.installed) {
    if (inUpdateMode) {
      // Stop running service before upgrading (Windows locks the binary)
      info(t.mcpMemoryStopping);
      const stopped = stopMcpMemoryService();
      if (stopped) {
        ok(t.mcpMemoryStopped);
        await new Promise((r) => setTimeout(r, 2000));
      }
      // Upgrade in update mode
      info(t.mcpMemoryUpgrading);
      const upgradeResult = runPythonModule(python, [
        "-m",
        "pip",
        "install",
        "--upgrade",
        "mcp-memory-service",
      ]);
      if (upgradeResult.status !== 0) {
        const stderr = readProcessText(upgradeResult);
        warn(t.mcpMemoryUpgradeFailed);
        if (stderr) {
          console.log(`${C.dim}${t.pipErrorDetail(stderr)}${C.reset}`);
        }
        return;
      }
      const newVersion = checkMcpMemoryService(python).version ?? "latest";
      ok(t.mcpMemoryUpgraded(newVersion));
    } else {
      ok(t.mcpMemoryAlreadyInstalled(existing.version ?? "unknown"));
    }
  } else {
    // Install via pip (use resolved Python for cross-platform compatibility)
    info(t.mcpMemoryInstalling);
    const installResult = runPythonModule(python, [
      "-m",
      "pip",
      "install",
      "mcp-memory-service",
    ]);
    if (installResult.status !== 0) {
      const stderr = readProcessText(installResult);
      warn(t.mcpMemoryInstallFailed);
      if (stderr) {
        console.log(`${C.dim}${t.pipErrorDetail(stderr)}${C.reset}`);
      }
      return;
    } else {
      ok(t.mcpMemoryInstalled);
    }
  }

  // Register in project .mcp.json. When running inside a venv we write the
  // absolute python path so Claude Code can launch it without shell PATH setup.
  // `python` here is a launcher descriptor { command, args, version, ... }.
  const memoryServerConfig = buildMcpMemoryServerConfig(resolved);

  const mcpPath = join(PROJECT_DIR, ".mcp.json");
  if (existsSync(mcpPath)) {
    try {
      const mcpConfig = JSON.parse(readFileSync(mcpPath, "utf8"));
      if (
        isLegacyMcpMemoryServerConfig(
          mcpConfig.mcpServers?.["mcp-memory-service"],
        )
      ) {
        const nextConfig = {
          ...mcpConfig,
          mcpServers: {
            ...(mcpConfig.mcpServers ?? {}),
            "mcp-memory-service": memoryServerConfig,
          },
        };
        writeFileSync(mcpPath, JSON.stringify(nextConfig, null, 2) + "\n");
        ok(t.mcpMemoryServerRegistered);
      } else if (mcpConfig.mcpServers?.["mcp-memory-service"]) {
        ok(t.mcpMemoryServerExists);
      } else {
        const nextConfig = {
          ...mcpConfig,
          mcpServers: {
            ...(mcpConfig.mcpServers ?? {}),
            "mcp-memory-service": memoryServerConfig,
          },
        };
        writeFileSync(mcpPath, JSON.stringify(nextConfig, null, 2) + "\n");
        ok(t.mcpMemoryServerRegistered);
      }
    } catch {
      warn(t.mcpMemoryServerExists);
    }
  } else {
    // Create minimal .mcp.json with just the memory service
    const newConfig = {
      mcpServers: {
        "mcp-memory-service": memoryServerConfig,
      },
    };
    writeFileSync(mcpPath, JSON.stringify(newConfig, null, 2) + "\n");
    ok(t.mcpMemoryServerRegistered);
  }

  info(t.mcpMemoryServerStartHint);

  // Step 4.7 — auto-install runtime memory hooks so the full pipeline
  // (pip package → .mcp.json → hook files → runtime registration →
  // health check) runs from a single `node setup.mjs` invocation.
  await runMcpMemoryHookInstaller(activeTargets);

  // Step 4.8 — start the HTTP server in background and configure boot auto-start
  await startMcpMemoryServiceBackground(resolved);
}

function ensureNetworkxCompatibility(python) {
  const nx = checkNetworkx(python);
  if (!nx.installed) {
    // networkx not found — will be pulled in by graphify, check again
    const recheck = checkNetworkx(python);
    if (!recheck.installed || recheck.meets) return;
    if (!recheck.meets) upgradeNetworkx(python);
    return;
  }
  if (nx.meets) {
    ok(t.networkxAlreadyOk(nx.version));
    return;
  }
  upgradeNetworkx(python);
}

function upgradeNetworkx(python) {
  info(t.networkxUpgrading);
  const result = runPythonModule(
    python,
    ["-m", "pip", "install", "--upgrade", "networkx"],
    undefined,
    { stdio: "pipe" },
  );
  if (result.status === 0) {
    const recheck = checkNetworkx(python);
    const newVersion = recheck.version ?? "latest";
    ok(t.networkxUpgraded(newVersion));
  } else {
    warn(t.networkxUpgradeFailed);
    const stderr = readProcessText(result);
    if (stderr) {
      console.log(`${C.dim}${t.pipErrorDetail(stderr)}${C.reset}`);
    }
  }
}

// ── Step 5: Validate + next steps ───────────────────────

async function validate() {
  heading(t.stepValidate);
  const agentsDir = join(PROJECT_DIR, ".claude", "agents");
  if (existsSync(agentsDir)) {
    const summary = summarizeExpectedFiles(
      readdirSync(agentsDir).filter((f) => f.endsWith(".md")),
      expectedAgentProjectionFiles(".md"),
    );
    ok(t.agentPrompts(summary.presentCount));
  }
  const validateSpawn = buildNodeScriptSpawn(
    process.execPath,
    PROJECT_DIR,
    "scripts/validate-project.mjs",
    ["--context", "install"],
  );
  const validateResult = spawnSync(
    validateSpawn.command,
    validateSpawn.args,
    validateSpawn.options,
  );
  if (validateResult.status === 0) ok(t.validationPassed);
  else warn(t.validationWarnings);
}

function showNextSteps(runtimes) {
  const hasDeployDirs = quickDeployDirs.length > 0 || Boolean(quickDeployDir);
  const displayDir = quickDeployDirs[0] || quickDeployDir || PROJECT_DIR;

  console.log(`${C.bold}${t.howToUse}${C.reset}
`);

  if (runtimes.claude) {
    console.log(
      `${C.dim}1.${C.reset} ${hasDeployDirs ? t.npxQuickOpenIn : t.step1Open}`,
    );
    console.log(`${C.dim}cd "${displayDir}" && claude${C.reset}`);
    if (quickDeployDirs.length > 1) {
      console.log(
        `${C.dim}${t.projectDeployMoreTargets(quickDeployDirs.length - 1)}${C.reset}`,
      );
    }
    console.log("");
    console.log(`${C.dim}2.${C.reset} ${t.step2Try}`);
    console.log(`${C.dim}/meta-theory review my agent definitions${C.reset}`);
    console.log("");
    console.log(`${C.dim}3.${C.reset} ${t.step3Or}`);
    console.log(`${C.dim}Build a user authentication system${C.reset}`);
    console.log(`${C.dim}${t.step3Hint}${C.reset}`);
    console.log("");
  }

  if (runtimes.codex)
    console.log(`${C.dim}Codex:${C.reset} ${C.dim}${t.codexNote}${C.reset}`);
  if (runtimes.openclaw)
    console.log(
      `${C.dim}OpenClaw:${C.reset} ${C.dim}${t.openclawNote}${C.reset}`,
    );
  if (runtimes.cursor)
    console.log(`${C.dim}Cursor:${C.reset} ${C.dim}${t.cursorNote}${C.reset}`);

  if (
    !runtimes.claude &&
    !runtimes.codex &&
    !runtimes.openclaw &&
    !runtimes.cursor
  ) {
    console.log(`${C.yellow}${t.noRuntimeGetStarted}${C.reset}`);
    console.log(
      `${C.dim}${
        EXTERNAL_URLS.claudeCodeDocs ||
        "https://docs.anthropic.com/en/docs/claude-code"
      }${C.reset}`,
    );
  }

  console.log("");
  console.log(`${C.bold}${t.usefulCommands}${C.reset}
`);
  if (hasDeployDirs) {
    console.log(
      `${C.dim}npx --yes github:KimYx0207/Meta_Kim meta-kim -- --update${C.reset}`,
    );
    console.log(
      `${C.dim}npx --yes github:KimYx0207/Meta_Kim meta-kim -- --check${C.reset}`,
    );
  } else {
    console.log(
      `${C.dim}node setup.mjs --update          # ${t.cmdUpdate}${C.reset}`,
    );
    console.log(
      `${C.dim}node setup.mjs --check           # ${t.cmdCheck}${C.reset}`,
    );
    console.log(
      `${C.dim}npm run discover:global          # ${t.cmdDiscover}${C.reset}`,
    );
    console.log(
      `${C.dim}npm run meta:doctor:governance    # ${t.cmdDoctor}${C.reset}`,
    );
    console.log(
      `${C.dim}npm run meta:verify:all           # ${t.cmdVerify}${C.reset}`,
    );
  }

  console.log("");
  console.log(`${C.bold}${t.postInstallNotesHeading}${C.reset}`);
  console.log(`${C.dim}${t.postInstallNotesIntro}${C.reset}`);
  console.log("");
  console.log(
    `${C.bold}${C.cyan}● ${t.postInstallNotesPlatformSync}${C.reset}`,
  );
  const platformRows = [
    { name: t.platformClauleCode, cap: t.platformClauleCodeCap },
    { name: t.platformCodex, cap: t.platformCodexCap },
    { name: t.platformOpenClaw, cap: t.platformOpenClawCap },
    { name: t.platformCursor, cap: t.platformCursorCap },
  ].filter(
    (r) =>
      runtimes[
        r.name
          .replace("platform", "")
          .toLowerCase()
          .replace("claulecode", "claude")
      ] || r.name === t.platformClauleCode,
  );
  for (const row of platformRows) {
    console.log(`${C.dim}• ${row.name}: ${row.cap}${C.reset}`);
  }
  console.log("");
  console.log(
    `${C.bold}${C.cyan}● ${t.postInstallNotesLayerActivation}${C.reset}`,
  );
  console.log(`${C.dim}${t.layer1Label} — ${t.layer1Note}${C.reset}`);
  console.log(`${C.dim}${t.layer2Label} — ${t.layer2Note}${C.reset}`);
  console.log(`${C.dim}${t.layer3Label} — ${t.layer3Note}${C.reset}`);
  console.log("");
  console.log(`${C.bold}${C.cyan}● ${t.installLocationsHeading}${C.reset}`);
  console.log(
    `${C.dim}• ${t.installLocationsProject}: ${displayDir}${C.reset}`,
  );
  console.log(
    `${C.dim}• ${t.installLocationsGlobal}: ~/.claude/skills/  ~/.codex/skills/  ~/.cursor/skills/  ~/.openclaw/skills/${C.reset}`,
  );
  console.log(
    `${C.dim}• ${t.installLocationsManifest}: ~/.meta-kim/install-manifest.json${C.reset}`,
  );
  console.log("");
  console.log(`${C.bold}${C.cyan}● ${t.usefulCommandsHeading}${C.reset}`);
  console.log(
    `${C.dim}  npm run meta:status        # ${t.cmdWhereStatus}${C.reset}`,
  );
  console.log(
    `${C.dim}  npm run meta:status:diff   # ${t.cmdWhereStatusDiff}${C.reset}`,
  );
  console.log(
    `${C.dim}  npm run meta:uninstall     # ${t.cmdWhereUninstall}${C.reset}`,
  );
  console.log("");
  console.log(
    `${C.dim}${C.yellow}★ ${t.postInstallNotesReminder} ${t.postInstallNotesReminderText}${C.reset}`,
  );
  console.log("");
}

// ── Main ────────────────────────────────────────────────

function bannerLogo() {
  // Double-width block pixels for maximum visual impact
  const B = "\u2588\u2588"; // ██
  const S = "  ";

  const G = {
    M: [
      `${B}${S}${S}${S}${S}${S}${B}`,
      `${B}${B}${S}${S}${S}${B}${B}`,
      `${B}${S}${B}${S}${B}${S}${B}`,
      `${B}${S}${S}${B}${S}${S}${B}`,
      `${B}${S}${S}${S}${S}${S}${B}`,
      `${B}${S}${S}${S}${S}${S}${B}`,
      `${B}${S}${S}${S}${S}${S}${B}`,
    ],
    E: [
      `${B}${B}${B}${B}${B}${B}${B}`,
      `${B}${S}${S}${S}${S}${S}${S}`,
      `${B}${S}${S}${S}${S}${S}${S}`,
      `${B}${B}${B}${B}${B}${S}${S}`,
      `${B}${S}${S}${S}${S}${S}${S}`,
      `${B}${S}${S}${S}${S}${S}${S}`,
      `${B}${B}${B}${B}${B}${B}${B}`,
    ],
    T: [
      `${B}${B}${B}${B}${B}${B}${B}`,
      `${S}${S}${S}${B}${S}${S}${S}`,
      `${S}${S}${S}${B}${S}${S}${S}`,
      `${S}${S}${S}${B}${S}${S}${S}`,
      `${S}${S}${S}${B}${S}${S}${S}`,
      `${S}${S}${S}${B}${S}${S}${S}`,
      `${S}${S}${S}${B}${S}${S}${S}`,
    ],
    A: [
      `${S}${S}${S}${B}${S}${S}${S}`,
      `${S}${S}${B}${S}${B}${S}${S}`,
      `${S}${S}${B}${S}${B}${S}${S}`,
      `${S}${B}${B}${B}${B}${B}${S}`,
      `${S}${B}${S}${S}${S}${B}${S}`,
      `${S}${B}${S}${S}${S}${B}${S}`,
      `${B}${B}${S}${S}${S}${B}${B}`,
    ],
    _: [
      `${S}${S}${S}${S}${S}${S}${S}`,
      `${S}${S}${S}${S}${S}${S}${S}`,
      `${S}${S}${S}${S}${S}${S}${S}`,
      `${S}${S}${S}${S}${S}${S}${S}`,
      `${S}${S}${S}${S}${S}${S}${S}`,
      `${S}${S}${S}${S}${S}${S}${S}`,
      `${B}${B}${B}${B}${B}${B}${B}`,
    ],
    K: [
      `${B}${B}${S}${S}${S}${B}${S}`,
      `${B}${B}${S}${S}${B}${S}${S}`,
      `${B}${B}${S}${B}${S}${S}${S}`,
      `${B}${B}${B}${S}${S}${S}${S}`,
      `${B}${B}${S}${B}${S}${S}${S}`,
      `${B}${B}${S}${S}${B}${S}${S}`,
      `${B}${B}${S}${S}${S}${B}${S}`,
    ],
    I: [
      `${B}${B}${B}${B}${B}${B}${B}`,
      `${S}${S}${S}${B}${S}${S}${S}`,
      `${S}${S}${S}${B}${S}${S}${S}`,
      `${S}${S}${S}${B}${S}${S}${S}`,
      `${S}${S}${S}${B}${S}${S}${S}`,
      `${S}${S}${S}${B}${S}${S}${S}`,
      `${B}${B}${B}${B}${B}${B}${B}`,
    ],
  };

  const word = ["M", "E", "T", "A", "_", "K", "I", "M"];
  // Gold gradient: deep amber (24-bit RGB, dark and subtle)
  const rowColors = [
    "\x1b[38;2;160;120;60m",
    "\x1b[38;2;180;140;70m",
    "\x1b[38;2;200;160;80m",
    "\x1b[38;2;180;140;70m",
    "\x1b[38;2;160;120;60m",
    "\x1b[38;2;140;100;50m",
    "\x1b[38;2;120;80;40m",
  ];

  // Build ASCII art lines
  const artLines = [];
  for (let row = 0; row < 7; row++) {
    let line = "";
    word.forEach((ch, idx) => {
      line += G[ch][row];
      if (idx < word.length - 1) line += " "; // 1-char gap between letters
    });
    artLines.push(line);
  }

  // Visual width helper (CJK characters = 2 columns, everything else = 1)
  const dw = (s) =>
    [...s].reduce((w, ch) => {
      const cp = ch.codePointAt(0);
      const isCJK =
        (cp >= 0x4e00 && cp <= 0x9fff) ||
        (cp >= 0x3040 && cp <= 0x30ff) ||
        (cp >= 0xac00 && cp <= 0xd7af) ||
        (cp >= 0xff00 && cp <= 0xffef) ||
        (cp >= 0x3000 && cp <= 0x303f);
      return w + (isCJK ? 2 : 1);
    }, 0);

  const contacts = [
    `Website: ${EXTERNAL_URLS.author?.website || "https://www.aiking.dev/"}`,
    `GitHub:  ${EXTERNAL_URLS.author?.github || "https://github.com/KimYx0207"}`,
    `X:       ${EXTERNAL_URLS.author?.x || "https://x.com/KimYx0207"}`,
    `Feishu:  ${
      EXTERNAL_URLS.author?.feishu ||
      "https://my.feishu.cn/wiki/OhQ8wqntFihcI1kWVDlcNdpznFf"
    }`,
    "WeChat:  \u8001\u91d1\u5e26\u4f60\u73a9AI",
  ];

  const padVis = (s, width) => s + " ".repeat(Math.max(0, width - dw(s)));
  // Art width: all chars are ASCII (█ = 1 col, space = 1 col), string length = visual width
  const artW = artLines[0].length;
  const PAD = 3;
  const innerW = artW + PAD * 2;
  const bar = "\u2501".repeat(innerW);
  const blank = " ".repeat(innerW);
  const center = (text) => {
    const p = innerW - dw(text);
    const l = Math.floor(p / 2);
    return " ".repeat(l) + text + " ".repeat(p - l);
  };

  const sep = "\u2500".repeat(30);
  const frame = `\x1b[38;2;160;120;60m${C.bold}`; // deep amber frame

  const versionText = `Setup v${packageVersion}`;
  const tagline = "AI Coding Governance Layer";

  console.log("");
  console.log(`${frame}  \u250f${bar}\u2513`);
  console.log(`${frame}  \u2503${blank}\u2503`);
  artLines.forEach((line, row) => {
    const color = rowColors[row];
    const padded = " ".repeat(PAD) + padVis(line, artW) + " ".repeat(PAD);
    console.log(
      `${frame}  \u2503${color}${C.bold}${padded}${C.reset}${frame}\u2503`,
    );
  });
  console.log(`${frame}  \u2503${blank}\u2503`);
  console.log(
    `${frame}  \u2503${C.bold}\x1b[38;2;200;160;80m${center(versionText)}${C.reset}${frame}\u2503`,
  );
  console.log(
    `${frame}  \u2503${C.dim}${center(tagline)}${C.reset}${frame}\u2503`,
  );
  console.log(`${frame}  \u2503${C.dim}${center(sep)}${C.reset}${frame}\u2503`);
  console.log(`${frame}  \u2503${blank}\u2503`);
  contacts.forEach((c) => {
    console.log(`${frame}  \u2503${C.dim}${center(c)}${C.reset}${frame}\u2503`);
  });
  console.log(`${frame}  \u2503${blank}\u2503`);
  console.log(`${frame}  \u2517${bar}\u251b${C.reset}`);
  console.log("");
}

function showModeInfo() {
  const modeStr = checkOnly
    ? t.modeCheck
    : updateMode
      ? t.modeUpdate
      : silentMode
        ? t.modeSilent
        : t.modeInteractive;
  console.log(
    `${C.dim}${t.modeInfoLine(modeStr, platform(), process.versions.node)}${C.reset}`,
  );
}

async function runProjectBootstrapCli() {
  if (projectBootstrapApply && projectBootstrapDryRun) {
    throw new Error("--project-bootstrap cannot use --apply and --dry-run together");
  }
  const targetContext = await resolveTargetContext(args);
  const activeTargets = targetContext.activeTargets;
  const targetDirs = cliProjectDeployDirs.length > 0 ? cliProjectDeployDirs : [process.cwd()];
  const applyMode = projectBootstrapApply && !projectBootstrapDryRun;
  const results = [];
  let ok = true;

  for (const targetDir of targetDirs) {
    try {
      const plan = buildProjectBootstrapPlan(activeTargets, targetDir);
      if (!applyMode) {
        results.push(plan);
        continue;
      }

      results.push(await applyProjectBootstrapToDir(activeTargets, targetDir));
    } catch (error) {
      ok = false;
      if (jsonOutputMode) {
        results.push(projectBootstrapFailureResult(targetDir, activeTargets, error));
      } else {
        throw error;
      }
    }
  }

  const summary = {
    schemaVersion: "meta-kim-project-bootstrap-result-v0.1",
    mode: applyMode ? "apply" : "dry-run",
    ok,
    resultCount: results.length,
    results,
  };

  if (jsonOutputMode) {
    console.log(JSON.stringify(summary, null, 2));
    return ok;
  }

  for (const result of results) {
    const counts = result.state.counts;
    console.log(`Meta_Kim project bootstrap ${summary.mode}: ${result.state.targetDir}`);
    console.log(`  status=${result.state.status} targets=${result.state.activeTargets.join(",")}`);
    console.log(
      `  create=${counts.create} merge=${counts.merge} replace=${counts.replace} skip=${counts.skip}`,
    );
    console.log(`  source=${result.sourceChain.setupEntrypoint} from ${result.sourceChain.syncManifest}`);
    if (result.manifestPath) {
      console.log(`  manifest=${result.manifestPath}`);
    }
  }
  return ok;
}

async function runProjectCleanupCli() {
  const targetContext = await resolveTargetContext(args);
  const activeTargets = targetContext.activeTargets;
  const localOverrides = await loadLocalOverrides();
  const savedDirs = savedProjectDeployDirsFrom(localOverrides);
  const targetDirs =
    cliProjectDeployDirs.length > 0
      ? cliProjectDeployDirs
      : savedDirs;

  const results = await cleanupProjectRedundancyDirs(activeTargets, targetDirs);
  const failed = results.filter((result) => result.status === "failed");
  const summary = {
    schemaVersion: "meta-kim-project-cleanup-result-v0.1",
    mode: "cleanup",
    ok: failed.length === 0,
    resultCount: results.length,
    results,
  };

  if (jsonOutputMode) {
    console.log(JSON.stringify(summary, null, 2));
    return summary.ok;
  }

  console.log(`Meta_Kim project cleanup: ${summary.ok ? "ok" : "failed"}`);
  console.log(`  targets=${activeTargets.join(",")}`);
  console.log(`  cleanedProjects=${summary.resultCount}`);
  return summary.ok;
}

async function main() {
  if (projectBootstrapMode) {
    const ok = await runProjectBootstrapCli();
    process.exit(ok ? 0 : 1);
  }
  if (projectCleanupMode) {
    const ok = await runProjectCleanupCli();
    process.exit(ok ? 0 : 1);
  }

  // Show logo before language selection
  bannerLogo();

  // Step 0: Language selection
  await selectLanguage();
  showModeInfo();

  if (!preflight()) {
    console.log(`\n${C.red}  ${t.envFailed}${C.reset}\n`);
    process.exit(1);
  }

  // ── CLI shortcut modes (non-interactive) ──
  if (checkOnly) {
    console.log(`\n${C.green}✓ ${t.envOk}${C.reset}\n`);
    const detectedRuntimes = await detectRuntimes();
    const targetContext = await resolveTargetContext(args);
    checkSync(detectedRuntimes, targetContext.supportedTargets);
    console.log(
      `${C.dim}${t.checkTargets(targetContext.activeTargets.join(", "), targetContext.supportedTargets.join(", "))}${C.reset}`,
    );
    const localState = await ensureProfileState();
    console.log("");
    console.log(`${C.bold}${t.localStateHeader}${C.reset}`);
    console.log(
      `${C.dim}  profile=${localState.profile} key=${localState.metadata.profileKey}${C.reset}`,
    );
    console.log(
      `${C.dim}  run index: ${toRepoRelative(localState.runIndexPath)}${C.reset}`,
    );
    console.log(
      `${C.dim}  compaction: ${toRepoRelative(localState.compactionDir)}${C.reset}`,
    );
    console.log(
      `${C.dim}  dispatch envelope: config/contracts/workflow-contract.json -> protocols.dispatchEnvelopePacket${C.reset}`,
    );
    console.log(
      `${C.dim}  migration helper: npm run migrate:meta-kim -- <source-dir> --apply${C.reset}`,
    );
    console.log("");
    process.exit(0);
  }

  if (updateMode) {
    await runUpdate();
    process.exit(0);
  }

  if (silentMode) {
    await runInstall();
    process.exit(0);
  }

  // ── Interactive: choose action ──
  const actionLabels = [
    t.actionInstall,
    t.actionUpdate,
    t.actionCheck,
    t.actionExit,
  ];
  const actionIdx = await askSelect(t.actionPrompt, actionLabels);

  if (actionIdx === 0) await runInstall();
  else if (actionIdx === 1) await runUpdate();
  else if (actionIdx === 2) await runCheck();
  else process.exit(0);
}

// ── Action runners ──────────────────────────────────────

async function runInstall() {
  const runtimes = await detectRuntimes();
  const activeTargets = await selectActiveTargets(runtimes);

  // 询问安装范围
  const installScope = await askInstallScope();
  const needProject = installScope === "project";
  const needGlobal = installScope === "global";

  // Ask proxy configuration (saves to localOverrides)
  await askProxyConfig();

  let selectedSkillIds = [];
  if (needGlobal) {
    selectedSkillIds = await resolveSelectedSkillDependencyIds();
  }

  // 在用户知道选了哪些技能后，显示目录结构说明
  showDirectoryExplanation();

  // Ask project deploy directories BEFORE confirm (so user decides upfront)
  const deployDirs = needProject ? await askDeployDirectory() : [];
  const cleanupDirs = needGlobal ? await askProjectCleanupDirectory() : [];

  // Early cleanup: run right after directory selection so the user sees the
  // result immediately. Must not depend on the slower install steps below
  // (npm install / python / mcp / validate) — those are easy to interrupt,
  // and losing the cleanup defeats the global-single-source intent.
  if (cleanupDirs.length > 0) {
    await cleanupProjectRedundancyDirs(activeTargets, cleanupDirs);
  }

  // Show installation overview
  showInstallOverview(
    activeTargets,
    installScope,
    selectedSkillIds,
  );
  await showExistingFootprint(installScope);

  const confirm = await askYesNo(t.confirmStartInstall, true);
  if (!confirm) {
    console.log(`\n${C.dim}${t.installCancelled}${C.reset}\n`);
    process.exit(0);
  }

  console.log();

  // 步骤计数
  let stepNum = 0;

  // 项目目录更新
  if (needProject) {
    stepNum++;
    await withProgress(t.stepLabel(stepNum, t.progressNpmInstall), async () => {
      if (
        existsSync(join(PROJECT_DIR, "node_modules", "@modelcontextprotocol"))
      ) {
        skip(t.nodeModulesExist);
        return true;
      }
      info(t.runningNpm);
      const result = spawnSync("npm", ["install"], {
        cwd: PROJECT_DIR,
        stdio: "inherit",
        shell: isWin,
      });
      if (result.status === 0) {
        ok(t.npmDone);
        return true;
      }
      warn(t.npmFailed);
      return false;
    });

    stepNum++;
    await withProgress(t.stepLabel(stepNum, t.progressCleanupLegacy), () => {
      const n = cleanupLegacySkills(installScope);
      if (n > 0) ok(`Cleaned ${n} legacy file(s)`);
      return true;
    });

    stepNum++;
    await withProgress(t.stepLabel(stepNum, t.progressSyncConfig), async () => {
      const configResult = await autoConfigure(installScope, activeTargets);
      if (!configResult) {
        warn(t.warnConfigSyncFailed);
      }
      return configResult;
    });
  }

  // 全局安装
  if (needGlobal) {
    // 准备全局目录
    stepNum++;
    await withProgress(t.stepLabel(stepNum, t.progressPrepareDir), async () => {
      const dirReady = existsSync(SKILLS_DIR);
      if (!dirReady) {
        mkdirSync(SKILLS_DIR, { recursive: true });
      }
      ok(t.globalDirReady(SKILLS_DIR));
      return true;
    });

    // 安装全局技能
    stepNum++;
    await withProgress(
      t.stepLabel(stepNum, t.progressInstallSkills),
      async () => {
        const localOverrides = await loadLocalOverrides();
        const proxyEnv = localOverrides.gitProxy
          ? { META_KIM_GIT_PROXY: localOverrides.gitProxy }
          : {};
        const skillArgs =
          selectedSkillIds.length > 0
            ? [
                "--targets",
                activeTargets.join(","),
                "--skills",
                selectedSkillIds.join(","),
              ]
            : ["--targets", activeTargets.join(","), "--skills", ""];
        // ).concat(["--log-file", INSTALL_LOG_FILE]);
        const installResult = runNodeScript(
          "scripts/install-global-skills-all-runtimes.mjs",
          skillArgs,
          proxyEnv,
        );
        if (installResult.status !== 0) {
          warn(t.warnSkillsInstallFailed);
          warn(`${C.dim}${t.warnSkillsUpdateFailedHint}${C.reset}`);
        }
        return installResult.status === 0;
      },
    );

    // 同步全局 meta-theory
    stepNum++;
    await withProgress(t.stepLabel(stepNum, t.progressSyncMeta), () => {
      const syncResult = runNodeScript(
        "scripts/sync-global-meta-theory.mjs",
        metaTheoryGlobalSyncArgs(activeTargets),
      );
      const runtimeHooksOk = syncNonClaudeGlobalRuntimeHooks(activeTargets);
      if (syncResult.status !== 0 || !runtimeHooksOk) {
        warn(t.warnMetaTheorySyncFailed);
      }
      return syncResult.status === 0 && runtimeHooksOk;
    });
  }

  if (needGlobal) {
    stepNum++;
    await withProgress(
      t.stepLabel(stepNum, t.refreshGlobalCapabilityInventory),
      async () => refreshGlobalCapabilityInventory(activeTargets),
    );
  }

  // [Optional] Python tools (graphify)
  stepNum++;
  await withProgress(
    t.stepLabel(stepNum, t.progressInstallPython),
    async () => {
      const wantPython = await askYesNo(t.askPythonToolsUpdate, true);
      if (wantPython) {
        await installPythonTools(activeTargets, false, PROJECT_DIR, {
          projectWiring: needProject,
        });
      } else {
        skip(`${C.dim}${t.pythonToolsSkipped}${C.reset}`);
      }
    },
  );

  // [Optional] MCP Memory Service (Layer 3)
  stepNum++;
  await withProgress(
    t.stepLabel(stepNum, t.progressInstallMcpMemory),
    async () => {
      await installMcpMemoryServiceStep(false, activeTargets);
    },
  );

  // 验证：项目路径检查 repo-local；全局路径只跑项目完整性校验
  stepNum++;
  await withProgress(t.stepLabel(stepNum, t.progressValidate), async () => {
    if (needProject) {
      checkSync(runtimes, activeTargets);
    }
    await validate();
  });

  console.log(`\n${C.bold}${C.green}✓ ${t.installComplete}${C.reset}\n`);

  // Copy runtime files to user-chosen project directories (if opted in earlier)
  if (deployDirs.length > 0) {
    await copyToDeployDirs(activeTargets, deployDirs);
  }

  showNextSteps(runtimes);
}

async function runUpdate() {
  heading(t.updateHeading);
  const runtimes = await detectRuntimes();
  const reselectTargets = await askYesNo(t.askReselectRuntimes, true);
  const activeTargets = reselectTargets
    ? await selectActiveTargets(runtimes)
    : (await resolveTargetContext(args)).activeTargets;

  // ── 0. Ask for update scope (like install mode) ─────────────────────
  const updateScope = await askInstallScope();
  const needProject = updateScope === "project";
  const needGlobal = updateScope === "global";

  // Ask proxy configuration (saves to localOverrides)
  await askProxyConfig();

  // Ask project deploy directories BEFORE update starts
  const deployDirs = needProject ? await askDeployDirectory() : [];
  const cleanupDirs = needGlobal ? await askProjectCleanupDirectory() : [];

  // Early cleanup: run right after directory selection so the user sees the
  // result immediately. Must not depend on the slower install steps below
  // (npm install / python / mcp / validate) — those are easy to interrupt,
  // and losing the cleanup defeats the global-single-source intent.
  if (cleanupDirs.length > 0) {
    await cleanupProjectRedundancyDirs(activeTargets, cleanupDirs);
  }

  // ── 1. npm install (always — new code may have new deps) ────────────
  info(t.updateNpm);
  const npmResult = spawnSync("npm", ["install"], {
    cwd: PROJECT_DIR,
    stdio: "inherit",
    shell: isWin,
  });
  if (npmResult.status === 0) ok(t.npmDone);
  else warn(t.npmFailed);

  // ── 2. [Optional] Python tools (graphify) ─────────────────────────
  console.log("");
  const wantPython = await askYesNo(t.askPythonToolsUpdate, true);
  if (wantPython) {
    await installPythonTools(activeTargets, true, PROJECT_DIR, {
      projectWiring: needProject,
    });
  } else {
    skip(`${C.dim}${t.pythonToolsSkipped}${C.reset}`);
  }

  // ── 2.5 [Optional] MCP Memory Service (Layer 3) ─────────────────
  console.log("");
  await installMcpMemoryServiceStep(true, activeTargets);

  // ── 2.8. Clean up legacy skill files ───────────────────────────────
  const legacyCount = cleanupLegacySkills(updateScope);
  if (legacyCount > 0) ok(`Cleaned ${legacyCount} legacy file(s)`);

  // ── 3. sync-runtimes (scope from user selection) ──────────────────
  if (needProject) {
    info(t.updateSyncProjectFiles);
    const syncResult = runNodeScript("scripts/sync-runtimes.mjs", [
      "--scope",
      updateScope,
      "--targets",
      activeTargets.join(","),
    ]);
    if (syncResult.status === 0) ok(t.updateSyncDone);
    else warn(t.updateSyncSkip);
  }

  // ── 4. Global skills update ───────────────────────────────────────
  console.log("");
  if (needGlobal) {
    const updateSkillIds = await resolveSelectedSkillDependencyIds();
    const localOverrides = await loadLocalOverrides();
    const proxyEnv = localOverrides.gitProxy
      ? { META_KIM_GIT_PROXY: localOverrides.gitProxy }
      : {};
    const updateSkillArgs =
      updateSkillIds.length > 0
        ? [
            "--update",
            "--targets",
            activeTargets.join(","),
            "--skills",
            updateSkillIds.join(","),
          ]
        : ["--update", "--targets", activeTargets.join(","), "--skills", ""];
    // ).concat(["--log-file", INSTALL_LOG_FILE]);
    const updateInstallResult = runNodeScript(
      "scripts/install-global-skills-all-runtimes.mjs",
      updateSkillArgs,
      proxyEnv,
    );
    if (updateInstallResult.status === 0) ok(t.updateSkillsDone);
    else {
      warn(t.warnSkillsUpdateFailed);
      warn(`${C.dim}${t.warnSkillsUpdateFailedHint}${C.reset}`);
    }
  }

  // ── 5. Global meta-theory sync ────────────────────────────────────
  console.log("");
  if (needGlobal) {
    const updateSyncResult = runNodeScript(
      "scripts/sync-global-meta-theory.mjs",
      metaTheoryGlobalSyncArgs(activeTargets),
    );
    const runtimeHooksOk = syncNonClaudeGlobalRuntimeHooks(activeTargets);
    if (updateSyncResult.status === 0 && runtimeHooksOk)
      ok(t.updateMetaTheoryDone);
    else warn(t.warnMetaTheoryUpdateFailed);
  }

  // ── 5.5. Refresh global capability inventory ───────────────────────
  console.log("");
  if (needGlobal) {
    await refreshGlobalCapabilityInventory(activeTargets);
  }

  // ── 6. checkSync (repo-local, project scope) ───────────────────────
  const { supportedTargets } = await resolveTargetContext(args);
  if (needProject) {
    checkSync(runtimes, supportedTargets);
  }
  console.log(`\n${C.bold}${C.green}✓ ${t.updateComplete}${C.reset}\n`);

  // Copy runtime files to user-chosen project directories (if opted in earlier)
  if (deployDirs.length > 0) {
    await copyToDeployDirs(activeTargets, deployDirs);
  }
}

async function runCheck() {
  console.log(`\n${C.green}✓ ${t.envOk}${C.reset}\n`);
  const runtimes = await detectRuntimes();
  const targetContext = await resolveTargetContext(args);
  checkSync(runtimes, targetContext.supportedTargets);
  console.log(
    `${C.dim}${t.checkTargets(targetContext.activeTargets.join(", "), targetContext.supportedTargets.join(", "))}${C.reset}`,
  );
}

main().catch((err) => {
  const msg = err?.message || String(err);
  const interrupted =
    msg.includes("SIGINT") ||
    msg.includes("force closed") ||
    err?.name === "ExitPromptError";
  if (interrupted) {
    console.error(`\n${C.dim}  ${t.setupInterrupted}${C.reset}\n`);
    process.exit(130);
  }
  console.error(`\n${C.red}  ${t.setupError} ${msg}${C.reset}\n`);
  process.exit(1);
});
