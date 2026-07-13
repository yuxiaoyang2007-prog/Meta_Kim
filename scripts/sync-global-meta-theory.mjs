#!/usr/bin/env node
/**
 * Global sync: canonical meta-theory skill + Meta_Kim Claude runtime hook assets into runtime homes.
 * Flags: --check, --print-targets, --with-global-hooks (opt into global hook copy + settings merge where supported).
 */

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  buildMetaKimHooksTemplate,
  hookCommandNode,
  isGlobalMetaKimManagedHookCommand,
  mergeHookMatcherBlocks,
  mergeGlobalMetaKimHooksIntoSettings,
} from "./claude-settings-merge.mjs";
import {
  canonicalRuntimeAssetsDir,
  canonicalSkillRoot,
  resolveTargetContext,
  resolveRuntimeHomeInfo,
} from "./meta-kim-sync-config.mjs";
import {
  CODEX_REQUEST_USER_INPUT_FEATURE,
  assertCodexConfigTomlMergeable,
  ensureCodexAppNativeControls,
  hasCodexRequestUserInputFeature,
} from "./codex-config-merge.mjs";
import { CATEGORIES, openRecorder } from "./install-manifest.mjs";
import { validateSkillFrontmatter } from "./install-skill-sanitizer.mjs";
import {
  applyRuntimePaths,
  buildCodexSkillContent,
} from "./sync-runtimes.mjs";
import {
  buildCodexHooksJson,
  buildHookPromptAdapterSource,
  SHARED_RUNTIME_HOOK_FILES,
} from "./runtime-hook-mapping.mjs";

// Recorder is lazily opened in runSync(); helpers record through this holder
// so we do not have to thread recorder arg through every sync function.
let manifestRecorder = null;
function recordSafe(fn) {
  if (!manifestRecorder) return;
  try {
    fn(manifestRecorder);
  } catch {
    /* recorder never breaks sync */
  }
}

// ANSI colors matching setup.mjs
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  amber: "\x1b[38;2;160;120;60m",
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const sourceDir = canonicalSkillRoot;
const sourceSkillFile = path.join(sourceDir, "SKILL.md");

const cliArgs = process.argv.slice(2);

function printHelp() {
  console.log(`Usage: node scripts/sync-global-meta-theory.mjs [options]

Options:
  --check                 Check selected global projections without writing
  --print-targets         Print resolved runtime homes and selected targets
  --targets <ids>         Comma-separated runtime ids
  --with-global-hooks     Include global Hook files and runtime registration
  --skip-global-hooks     Explicitly skip global Hook synchronization
  --help, -h              Show this help without resolving homes or writing`);
}

function parseCliArgs(args) {
  const flags = new Set([
    "--check",
    "--print-targets",
    "--with-global-hooks",
    "--skip-global-hooks",
    "--help",
    "-h",
  ]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (flags.has(arg)) continue;
    if (arg === "--targets") {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("--targets requires a comma-separated value");
      }
      index += 1;
      continue;
    }
    if (arg.startsWith("--targets=")) {
      if (!arg.slice("--targets=".length).trim()) {
        throw new Error("--targets requires a comma-separated value");
      }
      continue;
    }
    throw new Error(`Unknown option: ${arg}. Run with --help for usage.`);
  }

  const help = args.includes("--help") || args.includes("-h");
  const skipGlobalHooks = args.includes("--skip-global-hooks");
  return {
    help,
    checkOnly: args.includes("--check"),
    printTargetsOnly: args.includes("--print-targets"),
    skipGlobalHooks,
    withGlobalHooks: args.includes("--with-global-hooks") && !skipGlobalHooks,
  };
}

let cliOptions;
try {
  cliOptions = parseCliArgs(cliArgs);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

const checkOnly = cliOptions?.checkOnly ?? false;
const printTargetsOnly = cliOptions?.printTargetsOnly ?? false;
const withGlobalHooks = cliOptions?.withGlobalHooks ?? false;

const repoHooksDir = path.join(canonicalRuntimeAssetsDir, "claude", "hooks");
const sharedHooksDir = path.join(canonicalRuntimeAssetsDir, "shared", "hooks");
const sharedRuntimeHookFiles = new Set(SHARED_RUNTIME_HOOK_FILES);
// Files shipped into ~/.claude/hooks/meta-kim/ during global sync.
// Sources: canonical/runtime-assets/claude/hooks/*.mjs + shared/hooks/*.mjs.
// This whitelist is the single source of truth for "what belongs to Meta_Kim
// in the global hooks dir" — used by sync, cleanup, and migration flows.
const CANONICAL_CLAUDE_HOOKS_DIR = path.join(
  canonicalRuntimeAssetsDir,
  "claude",
  "hooks",
);
const CANONICAL_SHARED_HOOKS_DIR = path.join(
  canonicalRuntimeAssetsDir,
  "shared",
  "hooks",
);
const GLOBAL_HOOK_PACKAGE_FILES = new Set([
  // ── canonical/runtime-assets/claude/hooks/ ──
  "bash-readonly-whitelist.mjs",
  "block-dangerous-bash.mjs",
  "ecc-permission-cache-wrapper.mjs",
  "enforce-agent-dispatch.mjs",
  "graphify-context.mjs",
  "post-console-log-warn.mjs",
  "post-format.mjs",
  "post-typecheck.mjs",
  "stop-compaction.mjs",
  "stop-completion-guard.mjs",
  "stop-console-log-audit.mjs",
  "stop-memory-save.mjs",
  "stop-save-progress.mjs",
  "stop-spine-cleanup.mjs",
  "subagent-context.mjs",
  // ── canonical/runtime-assets/shared/hooks/ ──
  "activate-meta-theory-spine.mjs",
  "project-root.mjs",
  "meta-kim-memory-save.mjs",
  "skip-reminder.mjs",
  "spine-state.mjs",
  "spine-state-utils.mjs",
  "utils.mjs",
]);
const GLOBAL_HOOK_PACKAGE_FILES_LEGACY = new Set([
  // Files that were shipped historically but are no longer in canonical.
  // Listed here so migration logic can clean them up instead of leaving ghosts.
]);
const RETIRED_HOOK_FILES = ["pre-git-push-confirm.mjs"];
const legacyHookBackupStamp = new Date()
  .toISOString()
  .replace(/[:.]/g, "-");
const codexCommandsSourceDir = path.join(
  canonicalRuntimeAssetsDir,
  "codex",
  "commands",
);
const claudeCommandsSourceDir = path.join(
  canonicalRuntimeAssetsDir,
  "claude",
  "commands",
);
const STALE_META_KIM_SKILL_ALIAS_SPECS = [
  {
    name: "meta_kim",
    label: "legacy Meta Arsenal skill package",
    required: [/Meta Arsenal/i, /Smallest Governable Unit/i],
  },
  {
    name: "meta-theory-agent-calling-gap",
    label: "fixed Meta Theory agent-calling gap skill",
    required: [/Meta-Theory Agent Calling Gap/i, /Status:\s*.*FIXED/i],
  },
  {
    name: "source-command-meta-theory-report",
    label: "legacy Meta Theory report source-command skill",
    required: [/source-command-meta-theory-report/i, /run-meta-theory-governed-execution\.mjs/i],
  },
  {
    name: "source-command-meta-theory-verify",
    label: "legacy Meta Theory verify source-command skill",
    required: [/source-command-meta-theory-verify/i, /meta:(release:smoke|verify:all|check:global:release)/i],
  },
  {
    name: "critical-fetch-thinking-review",
    label: "legacy Critical/Fetch/Thinking/Review Meta_Kim alias",
    required: [/Meta[_ -]?Kim|Meta Theory/i, /Critical[\s\S]*Fetch[\s\S]*Thinking[\s\S]*Review/i],
  },
  {
    name: "critical-fetch-thinking-and-review",
    label: "legacy Critical/Fetch/Thinking/Review Meta_Kim alias",
    required: [/Meta[_ -]?Kim|Meta Theory/i, /Critical[\s\S]*Fetch[\s\S]*Thinking[\s\S]*Review/i],
  },
  {
    name: "critical-and-fetch-thinking-review",
    label: "legacy Critical/Fetch/Thinking/Review Meta_Kim alias",
    required: [/Meta[_ -]?Kim|Meta Theory/i, /Critical[\s\S]*Fetch[\s\S]*Thinking[\s\S]*Review/i],
  },
  {
    name: "critical-and-fetch-thinking-and-review",
    label: "legacy Critical/Fetch/Thinking/Review Meta_Kim alias",
    required: [/Meta[_ -]?Kim|Meta Theory/i, /Critical[\s\S]*Fetch[\s\S]*Thinking[\s\S]*Review/i],
  },
];
const CODEX_LEGACY_SHARED_SKILL_ROOT = path.join(
  os.homedir(),
  ".agents",
  "skills",
);

let runtimeHomes = {};
let allowedRoots = [];
let allowedRealRoots = [];
let activeTargets = [];
let cleanupTargets = [];
let staleSkillCleanupTargets = [];
let selectedTargetIds = [];
const removedOwnedLegacyHookPaths = new Set();

function assertHomeBound(targetPath) {
  const resolved = path.resolve(targetPath);
  const isAllowed = allowedRoots.some(
    (root) => resolved === root || resolved.startsWith(`${root}${path.sep}`),
  );
  if (!isAllowed) {
    throw new Error(
      `Refusing to write outside the configured runtime homes: ${resolved}`,
    );
  }
}

async function projectedRealPath(targetPath) {
  let cursor = path.resolve(targetPath);
  const missing = [];
  while (true) {
    try {
      const real = await fs.realpath(cursor);
      return path.join(real, ...missing.reverse());
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      missing.push(path.basename(cursor));
      cursor = parent;
    }
  }
}

function pathIsWithin(root, target) {
  const relativePath = path.relative(root, target);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

async function assertRealHomeBound(targetPath) {
  assertHomeBound(targetPath);
  const resolved = path.resolve(targetPath);
  const realTarget = await projectedRealPath(resolved);
  const matched = allowedRoots
    .map((root, index) => ({ root, realRoot: allowedRealRoots[index] }))
    .filter(({ root }) => pathIsWithin(root, resolved));
  if (!matched.some(({ realRoot }) => pathIsWithin(realRoot, realTarget))) {
    throw new Error(
      `Refusing to follow a symlink or junction outside configured runtime homes: ${resolved} -> ${realTarget}`,
    );
  }
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function backupExistingPath(targetPath, { family, label }) {
  assertHomeBound(targetPath);
  await assertRealHomeBound(targetPath);
  if (!(await pathExists(targetPath))) return null;

  const backupDir = path.join(
    path.dirname(targetPath),
    `.meta-kim-${family}-backup`,
    legacyHookBackupStamp,
  );
  assertHomeBound(backupDir);
  await assertRealHomeBound(backupDir);
  await fs.mkdir(backupDir, { recursive: true });

  const backupPath = path.join(backupDir, path.basename(targetPath));
  assertHomeBound(backupPath);
  await assertRealHomeBound(backupPath);
  await fs.cp(targetPath, backupPath, {
    recursive: true,
    force: true,
    errorOnExist: false,
  });
  console.log(`Backed up previous ${label} to ${backupPath}`);
  return backupPath;
}

async function resolveTargets() {
  const targetContext = await resolveTargetContext(cliArgs);
  runtimeHomes = {
    claude: resolveRuntimeHomeInfo("claude"),
    openclaw: resolveRuntimeHomeInfo("openclaw"),
    codex: resolveRuntimeHomeInfo("codex"),
    cursor: resolveRuntimeHomeInfo("cursor"),
  };

  selectedTargetIds = [...targetContext.activeTargets];

  allowedRoots = Object.values(runtimeHomes).map(({ dir }) =>
    path.resolve(dir),
  );
  if (selectedTargetIds.includes("codex")) {
    allowedRoots.push(path.resolve(path.dirname(CODEX_LEGACY_SHARED_SKILL_ROOT)));
  }
  allowedRealRoots = await Promise.all(
    allowedRoots.map((root) => projectedRealPath(root)),
  );

  activeTargets = selectedTargetIds.map((targetId) => ({
    targetId,
    label: `${targetContext.profiles[targetId]?.label ?? targetId} global skill`,
    dir: path.join(runtimeHomes[targetId].dir, "skills", "meta-theory"),
  }));

  const legacyFlatSkillLabels = {
    claude: "legacy Claude Code flat skill",
    codex: "legacy Codex flat skill",
    openclaw: "legacy OpenClaw flat skill",
    cursor: "legacy Cursor flat skill",
  };
  cleanupTargets = selectedTargetIds.map((targetId) => ({
    label:
      legacyFlatSkillLabels[targetId] ??
      `legacy ${targetContext.profiles[targetId]?.label ?? targetId} flat skill`,
    dir: path.join(runtimeHomes[targetId].dir, "skills", "meta-theory.md"),
  }));

  staleSkillCleanupTargets = [];
  for (const targetId of selectedTargetIds) {
    const roots = [path.join(runtimeHomes[targetId].dir, "skills")];
    if (targetId === "codex") {
      roots.push(CODEX_LEGACY_SHARED_SKILL_ROOT);
    }
    for (const skillsRoot of roots) {
      for (const aliasSpec of STALE_META_KIM_SKILL_ALIAS_SPECS) {
        staleSkillCleanupTargets.push({
          ...aliasSpec,
          runtimeId: targetId,
          dir: path.join(skillsRoot, aliasSpec.name),
        });
      }
    }
  }
  if (selectedTargetIds.includes("codex")) {
    staleSkillCleanupTargets.push({
      name: "meta-theory",
      label: "legacy shared Codex global meta-theory duplicate",
      runtimeId: "codex",
      dir: path.join(CODEX_LEGACY_SHARED_SKILL_ROOT, "meta-theory"),
      required: [/name:\s*meta-theory/i, /Meta_Kim executable governance dispatcher/i],
      removeOnlyWhenPathExists: path.join(
        runtimeHomes.codex.dir,
        "skills",
        "meta-theory",
      ),
    });
  }
}

async function* walkFiles(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(fullPath);
      continue;
    }
    if (entry.isFile()) {
      yield fullPath;
    }
  }
}

async function fingerprintDir(rootDir) {
  if (!(await pathExists(rootDir))) {
    return null;
  }

  const filePaths = [];
  for await (const filePath of walkFiles(rootDir)) {
    filePaths.push(filePath);
  }
  filePaths.sort((left, right) => left.localeCompare(right));

  const hash = createHash("sha256");
  for (const filePath of filePaths) {
    const relativePath = path.relative(rootDir, filePath).replace(/\\/g, "/");
    hash.update(relativePath);
    hash.update("\n");
    hash.update(await fs.readFile(filePath));
    hash.update("\n");
  }

  return {
    fileCount: filePaths.length,
    hash: hash.digest("hex"),
  };
}

function renderGlobalSkillContent(content, targetId, relativePath) {
  if (targetId !== "codex") {
    return content;
  }
  const projected = applyRuntimePaths(content, "codex");
  return relativePath === "SKILL.md"
    ? buildCodexSkillContent(projected)
    : projected;
}

async function fingerprintSourceForTarget(targetId) {
  if (!(await pathExists(sourceDir))) {
    return null;
  }

  const filePaths = [];
  for await (const filePath of walkFiles(sourceDir)) {
    filePaths.push(filePath);
  }
  filePaths.sort((left, right) => left.localeCompare(right));

  const hash = createHash("sha256");
  for (const filePath of filePaths) {
    const relativePath = path.relative(sourceDir, filePath).replace(/\\/g, "/");
    const content = await fs.readFile(filePath, "utf8");
    hash.update(relativePath);
    hash.update("\n");
    hash.update(renderGlobalSkillContent(content, targetId, relativePath));
    hash.update("\n");
  }

  return {
    fileCount: filePaths.length,
    hash: hash.digest("hex"),
  };
}

async function fingerprintSelectedFiles(rootDir, allowedNames) {
  if (!(await pathExists(rootDir))) {
    return null;
  }

  const filePaths = [];
  for (const fileName of [...allowedNames].sort((left, right) => left.localeCompare(right))) {
    const filePath = path.join(rootDir, fileName);
    if (await pathExists(filePath)) {
      filePaths.push(filePath);
    }
  }

  const hash = createHash("sha256");
  for (const filePath of filePaths) {
    const relativePath = path.relative(rootDir, filePath).replace(/\\/g, "/");
    hash.update(relativePath);
    hash.update("\n");
    hash.update(await fs.readFile(filePath));
    hash.update("\n");
  }

  return {
    fileCount: filePaths.length,
    hash: hash.digest("hex"),
  };
}

async function canonicalHookSourcePath(fileName) {
  if (sharedRuntimeHookFiles.has(fileName)) {
    const shared = path.join(sharedHooksDir, fileName);
    return (await pathExists(shared)) ? shared : null;
  }
  const claudeSpecific = path.join(repoHooksDir, fileName);
  if (await pathExists(claudeSpecific)) {
    return claudeSpecific;
  }
  const shared = path.join(sharedHooksDir, fileName);
  if (await pathExists(shared)) {
    return shared;
  }
  return null;
}

async function fingerprintGlobalHookSources() {
  const hash = createHash("sha256");
  let fileCount = 0;
  for (const fileName of [...GLOBAL_HOOK_PACKAGE_FILES].sort((left, right) => left.localeCompare(right))) {
    const filePath = await canonicalHookSourcePath(fileName);
    if (!filePath) continue;
    hash.update(fileName);
    hash.update("\n");
    hash.update(await fs.readFile(filePath));
    hash.update("\n");
    fileCount += 1;
  }
  return {
    fileCount,
    hash: hash.digest("hex"),
  };
}

async function fingerprintInstalledGlobalHooks(rootDir) {
  if (!(await pathExists(rootDir))) {
    return null;
  }
  const hash = createHash("sha256");
  let fileCount = 0;
  for (const fileName of [...GLOBAL_HOOK_PACKAGE_FILES].sort((left, right) => left.localeCompare(right))) {
    const filePath = path.join(rootDir, fileName);
    if (!(await pathExists(filePath))) continue;
    hash.update(fileName);
    hash.update("\n");
    hash.update(await fs.readFile(filePath));
    hash.update("\n");
    fileCount += 1;
  }
  return {
    fileCount,
    hash: hash.digest("hex"),
  };
}

async function copyCanonicalSkill(targetDir, targetId) {
  assertHomeBound(targetDir);
  await assertRealHomeBound(targetDir);
  await fs.mkdir(path.dirname(targetDir), { recursive: true });
  await fs.rm(targetDir, { recursive: true, force: true });
  await fs.mkdir(targetDir, { recursive: true });
  for await (const sourcePath of walkFiles(sourceDir)) {
    const relativePath = path.relative(sourceDir, sourcePath).replace(/\\/g, "/");
    const targetPath = path.join(targetDir, ...relativePath.split("/"));
    assertHomeBound(targetPath);
    await assertRealHomeBound(targetPath);
    const content = await fs.readFile(sourcePath, "utf8");
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(
      targetPath,
      renderGlobalSkillContent(content, targetId, relativePath),
      "utf8",
    );
  }
  recordSafe((rec) =>
    rec.recordDir(targetDir, {
      source: "sync-global-meta-theory",
      purpose: `${targetId ?? "runtime"}-global-skill`,
      category: CATEGORIES.A,
    }),
  );
}

async function assertCanonicalSkillFrontmatter() {
  const raw = await fs.readFile(sourceSkillFile, "utf8");
  const validation = validateSkillFrontmatter(raw);
  if (!validation.ok) {
    throw new Error(
      `Invalid canonical skill frontmatter in ${sourceSkillFile}: ${validation.message}`,
    );
  }
}

function renderGlobalCommandContent(raw) {
  return raw.replaceAll("__META_KIM_PACKAGE_ROOT__", repoRoot.replace(/\\/g, "/"));
}

async function collectCanonicalCommands(sourceDir) {
  const entries = await fs.readdir(sourceDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (
      !entry.isFile() ||
      !entry.name.endsWith(".md") ||
      entry.name.includes(".tmp.") ||
      entry.name.endsWith(".tmp")
    ) {
      continue;
    }
    files.push({
      name: entry.name,
      content: renderGlobalCommandContent(
        await fs.readFile(path.join(sourceDir, entry.name), "utf8"),
      ),
    });
  }
  return files.sort((left, right) => left.name.localeCompare(right.name));
}

async function copyRuntimeCommands(targetId, sourceDir) {
  const commandsDir = path.join(runtimeHomes[targetId].dir, "commands");
  assertHomeBound(commandsDir);
  await assertRealHomeBound(commandsDir);
  const commands = await collectCanonicalCommands(sourceDir);
  await fs.mkdir(commandsDir, { recursive: true });

  const targetPaths = [];
  for (const command of commands) {
    const targetPath = path.join(commandsDir, command.name);
    assertHomeBound(targetPath);
    await assertRealHomeBound(targetPath);
    await fs.writeFile(targetPath, command.content, "utf8");
    targetPaths.push(targetPath);
    recordSafe((rec) =>
      rec.recordFile(targetPath, {
        source: "sync-global-meta-theory",
        purpose: `${targetId}-global-command`,
        category: CATEGORIES.A,
      }),
    );
  }
  return targetPaths;
}

async function checkRuntimeCommands(targetId, sourceDir) {
  const commandsDir = path.join(runtimeHomes[targetId].dir, "commands");
  assertHomeBound(commandsDir);
  const commands = await collectCanonicalCommands(sourceDir);
  const outOfSync = [];

  for (const command of commands) {
    const targetPath = path.join(commandsDir, command.name);
    assertHomeBound(targetPath);
    const targetRaw = (await pathExists(targetPath))
      ? await fs.readFile(targetPath, "utf8")
      : null;
    if (targetRaw !== command.content) {
      outOfSync.push(command.name);
    }
  }

  const inSync = outOfSync.length === 0;
  const label = targetId === "claude" ? "Claude Code" : "Codex";
  console.log(
    `${inSync ? `${C.green}✓${C.reset}` : `${C.yellow}⊘${C.reset}`} ${C.dim}${label} commands: ${commandsDir} (${commands.length} files)${C.reset}`,
  );
  if (!inSync) {
    console.log(
      `${C.yellow}⊘${C.reset} ${C.dim}Out-of-sync ${label} commands: ${outOfSync.join(", ")}${C.reset}`,
    );
  }
  return { inSync, outOfSync, commands };
}

async function ensureCodexGlobalConfigChoiceSurface() {
  const configPath = path.join(runtimeHomes.codex.dir, "config.toml");
  assertHomeBound(configPath);
  await assertRealHomeBound(configPath);
  await fs.mkdir(path.dirname(configPath), { recursive: true });

  const prev = (await pathExists(configPath))
    ? await fs.readFile(configPath, "utf8")
    : "";
  const next = ensureCodexAppNativeControls(prev, {
    codexHome: runtimeHomes.codex.dir,
  });

  if (prev === next) {
    console.log(
      `${C.green}✓${C.reset} ${C.dim}Codex choice surface and App native controls already enabled: ${configPath}${C.reset}`,
    );
    return configPath;
  }

  if (prev) {
    await backupExistingPath(configPath, {
      family: "settings",
      label: "Codex config",
    });
  }

  await fs.writeFile(configPath, next, "utf8");
  recordSafe((rec) =>
    rec.recordSettingsMerge(
      configPath,
      [
        CODEX_REQUEST_USER_INPUT_FEATURE,
        "js_repl",
        "notify",
        "windows.sandbox",
        "marketplaces.openai-bundled",
        "plugins.browser@openai-bundled",
        "plugins.chrome@openai-bundled",
        "plugins.computer-use@openai-bundled",
      ],
      {
        source: "sync-global-meta-theory",
        purpose: "codex-global-config-choice-surface-and-app-native-controls",
        category: CATEGORIES.C,
      },
    ),
  );
  console.log(
    `${C.green}✓${C.reset} ${C.dim}Enabled Codex choice surface and App native controls: ${configPath}${C.reset}`,
  );
  return configPath;
}

async function removeIfExists(targetPath) {
  assertHomeBound(targetPath);
  await assertRealHomeBound(targetPath);
  if (!(await pathExists(targetPath))) {
    return false;
  }
  await fs.rm(targetPath, { recursive: true, force: true });
  return true;
}

async function readSkillSignatureText(targetPath) {
  if (!(await pathExists(targetPath))) {
    return "";
  }
  const stat = await fs.lstat(targetPath);
  if (stat.isFile()) {
    return fs.readFile(targetPath, "utf8");
  }
  if (!stat.isDirectory()) {
    return "";
  }

  const chunks = [];
  for await (const filePath of walkFiles(targetPath)) {
    if (path.basename(filePath) !== "SKILL.md") continue;
    chunks.push(await fs.readFile(filePath, "utf8"));
    if (chunks.length >= 8) break;
  }
  return chunks.join("\n\n");
}

async function isStaleMetaKimSkillAlias(target) {
  if (!(await pathExists(target.dir))) {
    return false;
  }
  if (
    target.removeOnlyWhenPathExists &&
    !(await pathExists(target.removeOnlyWhenPathExists))
  ) {
    return false;
  }
  const signatureText = await readSkillSignatureText(target.dir);
  if (!signatureText) {
    return false;
  }
  return target.required.every((pattern) => pattern.test(signatureText));
}

async function backupAndRemoveStaleSkillAlias(target) {
  assertHomeBound(target.dir);
  await assertRealHomeBound(target.dir);
  if (!(await isStaleMetaKimSkillAlias(target))) {
    return false;
  }

  const backupRoot = path.join(
    runtimeHomes[target.runtimeId].dir,
    ".meta-kim",
    "backups",
    "stale-skill-aliases",
    legacyHookBackupStamp,
  );
  assertHomeBound(backupRoot);
  await assertRealHomeBound(backupRoot);
  await fs.mkdir(backupRoot, { recursive: true });
  const backupPath = path.join(
    backupRoot,
    `${path.basename(target.dir)}-${path
      .resolve(target.dir)
      .replace(/^[A-Za-z]:/, "")
      .replace(/[^A-Za-z0-9_.-]+/g, "_")}`,
  );
  assertHomeBound(backupPath);
  await assertRealHomeBound(backupPath);
  await fs.cp(target.dir, backupPath, {
    recursive: true,
    force: true,
    errorOnExist: false,
  });
  await fs.rm(target.dir, { recursive: true, force: true });
  console.log(
    `${C.green}✓${C.reset} ${C.dim}Removed ${target.label}: ${target.dir}${C.reset}`,
  );
  console.log(
    `${C.dim}  backup: ${backupPath}${C.reset}`,
  );
  return true;
}

async function sameFileContent(leftPath, rightPath) {
  try {
    const [left, right] = await Promise.all([
      fs.readFile(leftPath),
      fs.readFile(rightPath),
    ]);
    return left.equals(right);
  } catch {
    return false;
  }
}

async function backupAndRemoveLegacyRootHook(
  topHooksDir,
  fileName,
  { canonicalSourcePath = null, retired = false } = {},
) {
  const legacyTopPath = path.join(topHooksDir, fileName);
  assertHomeBound(legacyTopPath);
  await assertRealHomeBound(legacyTopPath);
  if (!(await pathExists(legacyTopPath))) {
    return false;
  }
  const owned = retired
    ? await isOwnedRetiredMetaKimHook(legacyTopPath, fileName)
    : canonicalSourcePath &&
      (await sameFileContent(legacyTopPath, canonicalSourcePath));
  if (!owned) return false;
  const backupDir = path.join(
    topHooksDir,
    ".meta-kim-legacy-backup",
    legacyHookBackupStamp,
  );
  assertHomeBound(backupDir);
  await assertRealHomeBound(backupDir);
  await fs.mkdir(backupDir, { recursive: true });
  await fs.copyFile(legacyTopPath, path.join(backupDir, fileName));
  await fs.rm(legacyTopPath, { force: true });
  removedOwnedLegacyHookPaths.add(
    path.resolve(legacyTopPath).replace(/\\/g, "/"),
  );
  return true;
}

async function isOwnedRetiredMetaKimHook(filePath, fileName) {
  if (fileName !== "pre-git-push-confirm.mjs" || !(await pathExists(filePath))) {
    return false;
  }
  let source;
  try {
    source = await fs.readFile(filePath, "utf8");
  } catch {
    return false;
  }
  return [
    "PreToolUse hook: remind before git push",
    "readJsonFromStdin",
    "About to git push",
    "permissionDecision: \"allow\"",
  ].every((marker) => source.includes(marker));
}

function globalMetaKimHooksDir() {
  return path.join(runtimeHomes.claude.dir, "hooks", "meta-kim");
}

function codexGlobalMetaKimHooksDir() {
  return path.join(runtimeHomes.codex.dir, "hooks", "meta-kim");
}

async function copyCanonicalHooksToGlobal() {
  const dest = globalMetaKimHooksDir();
  assertHomeBound(dest);
  await assertRealHomeBound(dest);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await backupExistingPath(dest, {
    family: "hook-package",
    label: "Claude Code global hook package",
  });
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(dest, { recursive: true });
  for (const fileName of GLOBAL_HOOK_PACKAGE_FILES) {
    const sourcePath = await canonicalHookSourcePath(fileName);
    if (!sourcePath) {
      continue;
    }
    const destPath = path.join(dest, fileName);
    await assertRealHomeBound(destPath);
    await fs.copyFile(sourcePath, destPath);
    const removed = await backupAndRemoveLegacyRootHook(
      path.dirname(dest),
      fileName,
      { canonicalSourcePath: sourcePath },
    );
    const legacyPath = path.join(path.dirname(dest), fileName);
    if (!removed && (await pathExists(legacyPath))) {
      console.warn(`Preserved unowned same-name Hook: ${legacyPath}`);
    }
  }

  // Cleanup hooks removed from canonical but still present in older installs.
  for (const retired of RETIRED_HOOK_FILES) {
    const retiredPath = path.join(dest, retired);
    assertHomeBound(retiredPath);
    if (await pathExists(retiredPath)) {
      await fs.rm(retiredPath, { force: true });
    }
  }
  // Also cleanup top-level global hooks dir (pre-meta-kim-subdir layout)
  const topHooksDir = path.dirname(dest);
  for (const retired of RETIRED_HOOK_FILES) {
    const topPath = path.join(topHooksDir, retired);
    assertHomeBound(topPath);
    await assertRealHomeBound(topPath);
    if (await isOwnedRetiredMetaKimHook(topPath, retired)) {
      await backupAndRemoveLegacyRootHook(topHooksDir, retired, {
        retired: true,
      });
    } else if (await pathExists(topPath)) {
      console.warn(
        `Preserved unowned same-name Hook during retired cleanup: ${topPath}`,
      );
    }
  }

  recordSafe((rec) =>
    rec.recordDir(dest, {
      source: "sync-global-meta-theory",
      purpose: "claude-global-hooks-dir",
      category: CATEGORIES.B,
    }),
  );
  try {
    const entries = await fs.readdir(dest, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      recordSafe((rec) =>
        rec.recordFile(path.join(dest, entry.name), {
          source: "sync-global-meta-theory",
          purpose: "claude-global-hook",
          category: CATEGORIES.B,
        }),
      );
    }
  } catch {
    /* directory iteration best-effort */
  }
}

async function copyCanonicalHooksToCodexGlobal() {
  const dest = codexGlobalMetaKimHooksDir();
  assertHomeBound(dest);
  await assertRealHomeBound(dest);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await backupExistingPath(dest, {
    family: "hook-package",
    label: "Codex global hook package",
  });
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(dest, { recursive: true });
  for (const fileName of GLOBAL_HOOK_PACKAGE_FILES) {
    const sourcePath = await canonicalHookSourcePath(fileName);
    if (!sourcePath) {
      continue;
    }
    const destPath = path.join(dest, fileName);
    await assertRealHomeBound(destPath);
    await fs.copyFile(sourcePath, destPath);
  }

  for (const retired of RETIRED_HOOK_FILES) {
    const retiredPath = path.join(dest, retired);
    assertHomeBound(retiredPath);
    if (await pathExists(retiredPath)) {
      await fs.rm(retiredPath, { force: true });
    }
  }

  recordSafe((rec) =>
    rec.recordDir(dest, {
      source: "sync-global-meta-theory",
      purpose: "codex-global-hooks-dir",
      category: CATEGORIES.B,
    }),
  );
  try {
    const entries = await fs.readdir(dest, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      recordSafe((rec) =>
        rec.recordFile(path.join(dest, entry.name), {
          source: "sync-global-meta-theory",
          purpose: "codex-global-hook",
          category: CATEGORIES.B,
        }),
      );
    }
  } catch {
    /* directory iteration best-effort */
  }
}

async function syncClaudeGlobalSettingsHooks() {
  const absHooks = globalMetaKimHooksDir();
  const settingsPath = path.join(runtimeHomes.claude.dir, "settings.json");
  assertHomeBound(settingsPath);
  await assertRealHomeBound(settingsPath);

  const template = buildMetaKimHooksTemplate(absHooks, repoRoot, {
    hookPromptCommand: await claudeGlobalHookPromptCommand(),
  });
  const recordSettingsMerge = () => {
    recordSafe((rec) => {
      const managedCommands = [];
      for (const blocks of Object.values(template)) {
        for (const block of blocks ?? []) {
          for (const h of block.hooks ?? []) {
            if (h?.command) managedCommands.push(h.command);
          }
        }
      }
      rec.recordSettingsMerge(settingsPath, managedCommands, {
        source: "sync-global-meta-theory",
        purpose: "claude-global-settings-merge",
        category: CATEGORIES.C,
      });
    });
  };

  let base = {};
  if (await pathExists(settingsPath)) {
    const raw = await fs.readFile(settingsPath, "utf8");
    try {
      base = JSON.parse(raw);
    } catch {
      throw new Error(
        `Invalid JSON in ${settingsPath}; fix or move aside before sync.`,
      );
    }
  }

  if (base.disableAllHooks === true) {
    console.warn(
      "Warning: ~/.claude/settings.json has disableAllHooks=true — Meta_Kim hook entries were merged but will not run until disabled.",
    );
  }

  const merged = mergeGlobalMetaKimHooksIntoSettings(base, template, {
    isManagedHookCommand: isOwnedGlobalMetaKimHookCommand,
  });
  const out = `${JSON.stringify(merged, null, 2)}\n`;
  const prev = (await pathExists(settingsPath))
    ? await fs.readFile(settingsPath, "utf8")
    : null;

  if (prev === out) {
    console.log(
      `Claude Code settings hooks already up to date: ${settingsPath}`,
    );
    recordSettingsMerge();
    return;
  }

  if (prev !== null) {
    await backupExistingPath(settingsPath, {
      family: "settings",
      label: "Claude Code settings",
    });
  }

  await fs.writeFile(settingsPath, out, "utf8");
  console.log(`Merged Meta_Kim hooks into ${settingsPath}`);
  recordSettingsMerge();
}

function codexGlobalHooksJsonPath() {
  return path.join(runtimeHomes.codex.dir, "hooks.json");
}

function codexGlobalHookPromptAdapterPath() {
  return path.join(runtimeHomes.codex.dir, "hooks", "hookprompt-adapter.mjs");
}

async function claudeGlobalHookPromptCommand() {
  const scriptPath = path.join(
    runtimeHomes.claude.dir,
    "hooks",
    "user-prompt-submit.js",
  );
  return (await pathExists(scriptPath)) ? hookCommandNode(scriptPath) : null;
}

async function ensureCodexGlobalHookPromptAdapter() {
  const adapterPath = codexGlobalHookPromptAdapterPath();
  assertHomeBound(adapterPath);
  await assertRealHomeBound(adapterPath);
  await fs.mkdir(path.dirname(adapterPath), { recursive: true });
  await fs.writeFile(adapterPath, buildHookPromptAdapterSource("codex"), "utf8");
  recordSafe((rec) =>
    rec.recordFile(adapterPath, {
      source: "sync-global-meta-theory",
      purpose: "codex-global-hookprompt-adapter",
      category: CATEGORIES.B,
    }),
  );
  return adapterPath;
}

function buildCodexGlobalHooksTemplate() {
  const absHooks = codexGlobalMetaKimHooksDir();
  return buildCodexHooksJson({
    graphifyHookPath: path.join(absHooks, "graphify-context.mjs"),
    memoryHookPath: path.join(absHooks, "meta-kim-memory-save.mjs"),
    spineHookPath: path.join(absHooks, "activate-meta-theory-spine.mjs"),
    packageRoot: repoRoot,
    enforceAgentDispatchHookPath: path.join(
      absHooks,
      "enforce-agent-dispatch.mjs",
    ),
    hookPromptAdapterPath: codexGlobalHookPromptAdapterPath(),
  });
}

function stripGlobalMetaKimHooksFromCodexConfig(config = {}) {
  const next = structuredClone(config && typeof config === "object" ? config : {});
  const hooks = {};
  for (const [event, blocks] of Object.entries(next.hooks ?? {})) {
    if (!Array.isArray(blocks)) {
      hooks[event] = blocks;
      continue;
    }
    const keptBlocks = [];
    for (const block of blocks) {
      const blockHooks = Array.isArray(block?.hooks)
        ? block.hooks.filter(
            (hook) =>
              !isOwnedGlobalMetaKimHookCommand(hook?.command ?? ""),
          )
        : [];
      if (Array.isArray(block?.hooks)) {
        if (blockHooks.length > 0) {
          keptBlocks.push({ ...block, hooks: blockHooks });
        }
        continue;
      }
      if (
        !isOwnedGlobalMetaKimHookCommand(block?.command ?? "")
      ) {
        keptBlocks.push(block);
      }
    }
    if (keptBlocks.length > 0) {
      hooks[event] = keptBlocks;
    }
  }
  next.hooks = hooks;
  return next;
}

function mergeCodexGlobalHooksIntoConfig(config, template) {
  const next = stripGlobalMetaKimHooksFromCodexConfig(config);
  next.hooks ??= {};
  for (const [event, additionBlocks] of Object.entries(template.hooks ?? {})) {
    next.hooks[event] = mergeHookMatcherBlocks(
      Array.isArray(next.hooks[event]) ? next.hooks[event] : [],
      Array.isArray(additionBlocks) ? additionBlocks : [additionBlocks],
    );
  }
  return next;
}

async function readJsonConfig(configPath, label) {
  if (!(await pathExists(configPath))) {
    return {};
  }
  const raw = await fs.readFile(configPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${label}; fix or move aside before sync.`);
  }
}

async function syncCodexGlobalHooksJson() {
  const hooksJsonPath = codexGlobalHooksJsonPath();
  assertHomeBound(hooksJsonPath);
  await assertRealHomeBound(hooksJsonPath);
  const template = buildCodexGlobalHooksTemplate();
  const base = await readJsonConfig(hooksJsonPath, hooksJsonPath);
  const merged = mergeCodexGlobalHooksIntoConfig(base, template);
  const out = `${JSON.stringify(merged, null, 2)}\n`;
  const prev = (await pathExists(hooksJsonPath))
    ? await fs.readFile(hooksJsonPath, "utf8")
    : null;

  const managedCommands = flattenHookCommands(template.hooks);
  const recordHooksJsonMerge = () => {
    recordSafe((rec) =>
      rec.recordSettingsMerge(hooksJsonPath, managedCommands, {
        source: "sync-global-meta-theory",
        purpose: "codex-global-hooks-json-merge",
        category: CATEGORIES.C,
      }),
    );
  };

  if (prev === out) {
    console.log(`Codex hooks.json already up to date: ${hooksJsonPath}`);
    recordHooksJsonMerge();
    return;
  }

  await fs.mkdir(path.dirname(hooksJsonPath), { recursive: true });
  if (prev !== null) {
    await backupExistingPath(hooksJsonPath, {
      family: "settings",
      label: "Codex hooks.json",
    });
  }

  await fs.writeFile(hooksJsonPath, out, "utf8");
  console.log(`Merged Meta_Kim hooks into ${hooksJsonPath}`);
  recordHooksJsonMerge();
}

async function readClaudeGlobalSettings(settingsPath) {
  if (!(await pathExists(settingsPath))) {
    return {};
  }
  const raw = await fs.readFile(settingsPath, "utf8");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(
      `Invalid JSON in ${settingsPath}; fix or move aside before sync.`,
    );
  }
}

function flattenHookCommands(hooks = {}) {
  const commands = [];
  for (const blocks of Object.values(hooks ?? {})) {
    for (const block of blocks ?? []) {
      for (const hook of block?.hooks ?? []) {
        if (hook?.command) {
          commands.push(hook.command);
        }
      }
    }
  }
  return commands;
}

function hookCommandScriptPath(command) {
  const trimmed = String(command ?? "").trim();
  const quoted = trimmed.match(/^node\s+"([^"]+)"/u);
  if (quoted) {
    return quoted[1];
  }
  const unquoted = trimmed.match(/^node\s+([^\s]+)/u);
  return unquoted?.[1] ?? null;
}

async function checkClaudeGlobalSettingsHooks() {
  const settingsPath = path.join(runtimeHomes.claude.dir, "settings.json");
  const absHooks = globalMetaKimHooksDir();
  const template = buildMetaKimHooksTemplate(absHooks, repoRoot, {
    hookPromptCommand: await claudeGlobalHookPromptCommand(),
  });
  const settings = await readClaudeGlobalSettings(settingsPath);
  const expected = mergeGlobalMetaKimHooksIntoSettings(settings, template, {
    isManagedHookCommand: isOwnedGlobalMetaKimHookCommand,
  });

  const actualHooks = JSON.stringify(settings.hooks ?? {});
  const expectedHooks = JSON.stringify(expected.hooks ?? {});
  let inSync = actualHooks === expectedHooks;
  const missingCommands = [];

  for (const command of flattenHookCommands(settings.hooks)) {
    if (!isGlobalMetaKimManagedHookCommand(command)) {
      continue;
    }
    const scriptPath = hookCommandScriptPath(command);
    if (!scriptPath || !(await pathExists(scriptPath))) {
      missingCommands.push(command);
    }
  }

  if (missingCommands.length > 0) {
    inSync = false;
  }

  console.log(
    `${inSync ? `${C.green}✓${C.reset}` : `${C.yellow}⊘${C.reset}`} ${C.dim}Claude Code global settings hooks: ${settingsPath}${C.reset}`,
  );
  if (!inSync && missingCommands.length > 0) {
    console.log(
      `${C.yellow}⊘${C.reset} ${C.dim}Missing registered Meta_Kim hook scripts: ${missingCommands.length}${C.reset}`,
    );
  }
  return inSync;
}

async function checkCodexGlobalHooksJson() {
  const hooksJsonPath = codexGlobalHooksJsonPath();
  const template = buildCodexGlobalHooksTemplate();
  const config = await readJsonConfig(hooksJsonPath, hooksJsonPath);
  const expected = mergeCodexGlobalHooksIntoConfig(config, template);

  const actualHooks = JSON.stringify(config.hooks ?? {});
  const expectedHooks = JSON.stringify(expected.hooks ?? {});
  let inSync = actualHooks === expectedHooks;
  const missingCommands = [];

  for (const command of flattenHookCommands(config.hooks)) {
    if (!isGlobalMetaKimManagedHookCommand(command)) {
      continue;
    }
    const scriptPath = hookCommandScriptPath(command);
    if (!scriptPath || !(await pathExists(scriptPath))) {
      missingCommands.push(command);
    }
  }

  if (missingCommands.length > 0) {
    inSync = false;
  }

  console.log(
    `${inSync ? `${C.green}✓${C.reset}` : `${C.yellow}⊘${C.reset}`} ${C.dim}Codex global hooks.json: ${hooksJsonPath}${C.reset}`,
  );
  if (!inSync && missingCommands.length > 0) {
    console.log(
      `${C.yellow}⊘${C.reset} ${C.dim}Missing registered Meta_Kim Codex hook scripts: ${missingCommands.length}${C.reset}`,
    );
  }
  return inSync;
}

function isOwnedGlobalMetaKimHookCommand(command) {
  if (isGlobalMetaKimManagedHookCommand(command)) return true;
  const normalized = String(command ?? "").replace(/\\\\/g, "\\").replace(/\\/g, "/");
  return [...removedOwnedLegacyHookPaths].some((ownedPath) =>
    normalized.includes(ownedPath),
  );
}

async function runCheck() {
  await assertCanonicalSkillFrontmatter();
  let failed = false;

  for (const target of activeTargets) {
    const sourceFingerprint = await fingerprintSourceForTarget(
      target.targetId,
    );
    const targetFingerprint = await fingerprintDir(target.dir);
    const inSync =
      targetFingerprint !== null &&
      sourceFingerprint !== null &&
      targetFingerprint.hash === sourceFingerprint.hash &&
      targetFingerprint.fileCount === sourceFingerprint.fileCount;
    console.log(
      `${inSync ? `${C.green}✓${C.reset}` : `${C.yellow}⊘${C.reset}`} ${C.dim}${target.label}: ${target.dir}${C.reset}`,
    );
    if (!inSync) {
      failed = true;
    }
  }

  for (const target of cleanupTargets) {
    const exists = await pathExists(target.dir);
    console.log(
      `${exists ? `${C.yellow}⊘${C.reset}` : `${C.green}✓${C.reset}`} ${C.dim}${target.label}: ${target.dir}${C.reset}`,
    );
    if (exists) {
      failed = true;
    }
  }

  for (const target of staleSkillCleanupTargets) {
    const exists = await pathExists(target.dir);
    const isStale = exists && (await isStaleMetaKimSkillAlias(target));
    console.log(
      `${isStale ? `${C.yellow}⊘${C.reset}` : `${C.green}✓${C.reset}`} ${C.dim}${target.label}: ${target.dir}${C.reset}`,
    );
    if (isStale) {
      failed = true;
    }
  }

  if (selectedTargetIds.includes("claude") && withGlobalHooks) {
    const repoHooksFp = await fingerprintGlobalHookSources();
    const globalHooksPath = globalMetaKimHooksDir();
    const globalHooksFp = await fingerprintInstalledGlobalHooks(globalHooksPath);
    const hooksInSync =
      repoHooksFp !== null &&
      globalHooksFp !== null &&
      repoHooksFp.hash === globalHooksFp.hash &&
      repoHooksFp.fileCount === globalHooksFp.fileCount;
    console.log(
      `${hooksInSync ? `${C.green}✓${C.reset}` : `${C.yellow}⊘${C.reset}`} ${C.dim}Claude Code global hooks (meta-kim): ${globalHooksPath}${C.reset}`,
    );
    if (!hooksInSync) {
      failed = true;
    }
    const settingsHooksInSync = await checkClaudeGlobalSettingsHooks();
    if (!settingsHooksInSync) {
      failed = true;
    }
  } else if (selectedTargetIds.includes("claude")) {
    console.log(
      `${C.yellow}⊘${C.reset} ${C.dim}Claude Code global hooks skipped (use --with-global-hooks to check them): ${globalMetaKimHooksDir()}${C.reset}`,
    );
  }

  if (selectedTargetIds.includes("codex") && withGlobalHooks) {
    const repoHooksFp = await fingerprintGlobalHookSources();
    const codexHooksPath = codexGlobalMetaKimHooksDir();
    const codexHooksFp = await fingerprintInstalledGlobalHooks(codexHooksPath);
    const hooksInSync =
      repoHooksFp !== null &&
      codexHooksFp !== null &&
      repoHooksFp.hash === codexHooksFp.hash &&
      repoHooksFp.fileCount === codexHooksFp.fileCount;
    console.log(
      `${hooksInSync ? `${C.green}✓${C.reset}` : `${C.yellow}⊘${C.reset}`} ${C.dim}Codex global hooks (meta-kim): ${codexHooksPath}${C.reset}`,
    );
    if (!hooksInSync) {
      failed = true;
    }
    const hooksJsonInSync = await checkCodexGlobalHooksJson();
    if (!hooksJsonInSync) {
      failed = true;
    }
  } else if (selectedTargetIds.includes("codex")) {
    console.log(
      `${C.yellow}⊘${C.reset} ${C.dim}Codex global hooks skipped (use --with-global-hooks to check them): ${codexGlobalMetaKimHooksDir()}${C.reset}`,
    );
  }

  if (selectedTargetIds.includes("claude")) {
    const commandResults = await checkRuntimeCommands("claude", claudeCommandsSourceDir);
    if (!commandResults.inSync) failed = true;
  }

  if (selectedTargetIds.includes("codex")) {
    const commandResults = await checkRuntimeCommands("codex", codexCommandsSourceDir);
    if (!commandResults.inSync) failed = true;

    const configPath = path.join(runtimeHomes.codex.dir, "config.toml");
    const configRaw = (await pathExists(configPath))
      ? await fs.readFile(configPath, "utf8")
      : "";
    let featureEnabled = false;
    try {
      assertCodexConfigTomlMergeable(configRaw);
      featureEnabled = hasCodexRequestUserInputFeature(configRaw);
    } catch (error) {
      console.log(
        `${C.red}×${C.reset} ${C.dim}Codex config.toml is invalid: ${configPath}${C.reset}`,
      );
      console.error(error.message);
      failed = true;
    }
    console.log(
      `${featureEnabled ? `${C.green}✓${C.reset}` : `${C.yellow}⊘${C.reset}`} ${C.dim}Codex ${CODEX_REQUEST_USER_INPUT_FEATURE}: ${configPath}${C.reset}`,
    );
    if (!featureEnabled) {
      failed = true;
    }
  }

  process.exitCode = failed ? 1 : 0;
}

async function runSync() {
  // Leading newline to separate from parent's progress message
  console.log("");
  if (!(await pathExists(sourceSkillFile))) {
    throw new Error(`Missing canonical skill source: ${sourceSkillFile}`);
  }
  await assertCanonicalSkillFrontmatter();
  manifestRecorder = openRecorder({
    scope: "global",
    metaKimVersion: process.env.META_KIM_VERSION ?? null,
  });

  for (const target of cleanupTargets) {
    const removed = await removeIfExists(target.dir);
    if (removed) {
      console.log(
        `${C.green}✓${C.reset} ${C.dim}Removed ${target.label}: ${target.dir}${C.reset}`,
      );
    }
  }

  for (const target of activeTargets) {
    await copyCanonicalSkill(target.dir, target.targetId);
    console.log(
      `${C.green}✓${C.reset} ${C.dim}Synced ${target.label}: ${target.dir}${C.reset}`,
    );
  }

  for (const target of staleSkillCleanupTargets) {
    await backupAndRemoveStaleSkillAlias(target);
  }

  if (selectedTargetIds.includes("claude") && withGlobalHooks) {
    await copyCanonicalHooksToGlobal();
    console.log(
      `${C.green}✓${C.reset} ${C.dim}Synced Claude Code global hooks: ${globalMetaKimHooksDir()}${C.reset}`,
    );
    await syncClaudeGlobalSettingsHooks();
  } else {
    if (selectedTargetIds.includes("claude")) {
      console.log(
        `${C.yellow}⊘${C.reset} ${C.dim}Skipped Claude Code global hooks (opt in with --with-global-hooks).${C.reset}`,
      );
    }
  }

  if (selectedTargetIds.includes("codex") && withGlobalHooks) {
    await copyCanonicalHooksToCodexGlobal();
    await ensureCodexGlobalHookPromptAdapter();
    console.log(
      `${C.green}✓${C.reset} ${C.dim}Synced Codex global hooks: ${codexGlobalMetaKimHooksDir()}${C.reset}`,
    );
    await syncCodexGlobalHooksJson();
  } else if (selectedTargetIds.includes("codex")) {
    console.log(
      `${C.yellow}⊘${C.reset} ${C.dim}Skipped Codex global hooks (opt in with --with-global-hooks).${C.reset}`,
    );
  }

  if (selectedTargetIds.includes("claude")) {
    const commandPaths = await copyRuntimeCommands("claude", claudeCommandsSourceDir);
    console.log(
      `${C.green}✓${C.reset} ${C.dim}Synced Claude Code commands: ${path.join(runtimeHomes.claude.dir, "commands")} (${commandPaths.length} files)${C.reset}`,
    );
  }

  if (selectedTargetIds.includes("codex")) {
    const commandPaths = await copyRuntimeCommands("codex", codexCommandsSourceDir);
    console.log(
      `${C.green}✓${C.reset} ${C.dim}Synced Codex commands: ${path.join(runtimeHomes.codex.dir, "commands")} (${commandPaths.length} files)${C.reset}`,
    );
    await ensureCodexGlobalConfigChoiceSurface();
  }

  if (manifestRecorder) {
    const result = await manifestRecorder.flush();
    if (result.ok) {
      console.log(
        `${C.green}✓${C.reset} ${C.dim}Install manifest: ${result.path} (${result.entries} entries)${C.reset}`,
      );
    }
  }
}

function printTargets() {
  console.log("Resolved runtime homes:");
  console.log(
    `- Claude Code: ${runtimeHomes.claude.dir} (${runtimeHomes.claude.source})`,
  );
  console.log(
    `- OpenClaw: ${runtimeHomes.openclaw.dir} (${runtimeHomes.openclaw.source})`,
  );
  console.log(
    `- Codex: ${runtimeHomes.codex.dir} (${runtimeHomes.codex.source})`,
  );
  console.log(
    `- Cursor: ${runtimeHomes.cursor.dir} (${runtimeHomes.cursor.source})`,
  );
  console.log("");
  console.log("Resolved active targets:");
  for (const target of activeTargets) {
    console.log(`- ${target.label}: ${target.dir}`);
  }
  console.log("");
  console.log("Environment overrides:");
  console.log("- META_KIM_CLAUDE_HOME or CLAUDE_HOME");
  console.log("- META_KIM_OPENCLAW_HOME or OPENCLAW_HOME");
  console.log("- META_KIM_CODEX_HOME or CODEX_HOME");
  console.log("- META_KIM_CURSOR_HOME or CURSOR_HOME");
  console.log("");
  console.log("Runtime slash commands:");
  console.log(
    `- ${path.join(runtimeHomes.claude.dir, "commands")} (Claude Code)`,
  );
  console.log(
    `- ${path.join(runtimeHomes.codex.dir, "commands")} (Codex)`,
  );
  console.log(
    `- ${path.join(runtimeHomes.codex.dir, "config.toml")} ([features].${CODEX_REQUEST_USER_INPUT_FEATURE} = true)`,
  );
  console.log("");
  console.log("Runtime hooks (only with --with-global-hooks):");
  console.log(`- Codex scripts: ${codexGlobalMetaKimHooksDir()}`);
  console.log(`- Codex merged into: ${codexGlobalHooksJsonPath()}`);
  console.log(`- Scripts: ${globalMetaKimHooksDir()}`);
  console.log(
    `- Claude Code merged into: ${path.join(runtimeHomes.claude.dir, "settings.json")}`,
  );
}

async function main() {
  if (!cliOptions) return;
  if (cliOptions.help) {
    printHelp();
    return;
  }
  await resolveTargets();
  if (printTargetsOnly) {
    printTargets();
    return;
  }
  if (checkOnly) {
    await runCheck();
    return;
  }
  await runSync();
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
