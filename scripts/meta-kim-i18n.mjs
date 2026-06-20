/**
 * Shared i18n for Meta_Kim installation scripts.
 * Import this from setup.mjs, install-global-skills-all-runtimes.mjs,
 * and sync-runtimes.mjs to avoid duplicating strings.
 */

import { platform } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadAgentProjectionProfiles,
  loadFormalToolProfiles,
} from "./runtime-tool-profiles.mjs";

// ── Detect language ──────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

const FORMAL_TOOL_PROFILES = Object.freeze(loadFormalToolProfiles());
const FORMAL_TOOL_NAMES = Object.freeze(FORMAL_TOOL_PROFILES.map((profile) => profile.label));
const AGENT_PROJECTION_PROFILES = Object.freeze(loadAgentProjectionProfiles());

export const INSTALL_STATUS_CLASSES = Object.freeze([
  "success",
  "skipped",
  "manual",
  "failed",
]);

export const INSTALL_STATUS_NEXT_ACTION = Object.freeze({
  success: "continue",
  skipped: "continue unless the skipped optional capability is needed",
  manual: "perform the named manual action, then rerun the check",
  failed: "fix the reported cause before declaring install or update complete",
});

export const INSTALL_STATUS_MESSAGE_CLASSES = Object.freeze({
  okUpdated: "success",
  warnGitUsableDespiteError: "success",
  okArchiveInstalled: "success",
  okCloned: "success",
  okBasename: "success",
  allUpToDate: "success",
  pluginUpdated: "success",
  codexConfigRestoredAfterEcc: "success",
  codexGlobalAgentsRestoredAfterEcc: "success",
  codexGlobalAgentsQuarantinedAfterEcc: "success",
  codexChoiceSurfacePreserved: "success",
  codexChoiceSurfaceRestored: "success",
  okRemovedObsolete: "success",

  skipExists: "skipped",
  skipAlreadyInstalled: "skipped",
  labelUpToDate: "skipped",
  skillsFilterEmpty: "skipped",
  skillsFilterNoMatches: "skipped",
  warnManifestMissing: "skipped",
  skipGraphifyInstalled: "skipped",
  graphifyInstallSkippedGuideExists: "skipped",
  noteSettingsNotAffected: "skipped",

  codexNativePluginManualStep: "manual",
  cursorNativePluginManualStep: "manual",
  upstreamProjectLocalSkipped: "manual",
  codexNativePluginAutoInstallIncomplete: "manual",
  warnClaNotFound: "manual",
  pythonNotFound: "manual",
  pythonNotFoundGraphify: "manual",
  pythonInstallHint: "manual",
  pythonInstallHintGraphify: "manual",
  warnStagingLocked: "manual",

  failManifestLoad: "failed",
  warnGitInstallFailed: "failed",
  warnPluginFailed: "failed",
  warnArchiveFailed: "failed",
  warnReplaceFailed: "failed",
  reverseModeValidationFailed: "failed",
  reverseModeAborted: "failed",
  warnGraphifySkillFailed: "failed",
  warnGraphifyPipFailed: "failed",
});

export function installStatusClassForMessageKey(messageKey) {
  return INSTALL_STATUS_MESSAGE_CLASSES[messageKey] ?? null;
}

export function installStatusNextAction(statusClass) {
  return INSTALL_STATUS_NEXT_ACTION[statusClass] ?? null;
}

/** Align with setup.mjs LANG_ARG_ALIASES so `--lang zh` resolves to zh-CN. */
const LANG_ALIASES = { zh: "zh-CN", ja: "ja-JP", ko: "ko-KR" };
function normalizeLangCode(code) {
  if (!code) return "en";
  const trimmed = String(code).trim();
  const lower = trimmed.toLowerCase();
  return LANG_ALIASES[lower] || trimmed;
}

function detectLang() {
  const cliIdx = process.argv.indexOf("--lang");
  if (cliIdx >= 0 && process.argv[cliIdx + 1]) {
    return normalizeLangCode(process.argv[cliIdx + 1]);
  }
  const envLang = process.env.META_KIM_LANG;
  if (envLang) return normalizeLangCode(envLang);
  // Heuristic: Windows with CJK system → Chinese
  if (platform() === "win32") {
    try {
      const sysLocale = Intl.DateTimeFormat().resolvedOptions().locale;
      if (/^zh/i.test(sysLocale)) return "zh-CN";
      if (/^ja/i.test(sysLocale)) return "ja-JP";
      if (/^ko/i.test(sysLocale)) return "ko-KR";
    } catch {
      // fall through
    }
  }
  return "en";
}

// ── Strings ───────────────────────────────────────────────────

const STRINGS = {
  en: {
    // Skill install (shared)
    dryRun: (cmd) => `[dry-run] ${cmd}`,
    okUpdated: (path) => `[OK] updated ${path}`,
    warnPullFailed: (path) => `[WARN] pull failed, re-cloning ${path}`,
    /** Avoid "git stage <id>" phrasing — not a git subcommand; phase-1 parallel cache fetch. */
    gitRetryLabelStaging: (id) => `${id} (phase-1 cache fetch)`,
    warnGitInstallFailed: (id, category) =>
      `[WARN] git install failed for ${id} (${category})`,
    /** Git exited non-zero but the destination already looks complete — skip archive / failure record. */
    warnGitUsableDespiteError: (id, destPath) =>
      `${id}: git reported an error, but ${destPath} already looks usable — treating as success.`,
    gitFailureExitLine: (code) => `git exit code: ${code}`,
    /** Shown when stderr mentions fetch progress — explains 100% vs full clone success. */
    gitFailureProgressNotFinalHint:
      'Why progress looked "done": fetch can reach high % before checkout / delta resolution / TLS completes. The lines above are the authoritative error.',
    gitFailureNoStderr:
      "(no stderr captured — try running the same git command in a terminal to see full output.)",
    proxyDetected: (url, source) =>
      `Using proxy for git: ${url} (from ${source})`,
    proxyStrippedHint:
      "Loopback proxy env stripped. Use --proxy <url> or set META_KIM_GIT_PROXY to configure proxy.",
    warnIgnoringLoopbackProxyEnv: (entries) =>
      `Ignoring loopback proxy env for install: ${entries.join(", ")}`,
    // sync-runtimes.mjs — incremental summary + --check
    canonicalMissingWarn: (filePath) =>
      `[sync-runtimes] Skipping missing canonical file: ${filePath}`,
    syncRuntimesSummaryTitle: "── meta:sync (incremental write summary) ──",
    syncRuntimesSummaryIntro:
      "Listed counts are paths that changed this run; unchanged paths are omitted.",
    runtimeGroupClaude: "Claude Code",
    runtimeGroupCodex: "Codex",
    runtimeGroupOpenclaw: "OpenClaw",
    runtimeGroupCursor: "Cursor",
    syncDetailAgents: (count, teamSize) =>
      `${count}/${teamSize} agent file(s) updated`,
    syncDetailWorkspaces: (count, teamSize) =>
      `${count}/${teamSize} workspace dir(s) with changes`,
    syncDetailFiles: (count) => `${count} file(s) updated`,
    syncScopeLine: (scope, targets) =>
      `Scope: ${scope}  ·  Targets: ${targets}`,
    syncInstallManifestOk: (path, entries) =>
      `Install manifest: ${path} (${entries} entries)`,
    syncRuntimesCheckStale: "Generated runtime assets are out of date:",
    syncRuntimesCheckStaleLine: (file) => `- ${file}`,
    syncRuntimesCheckOk: "Runtime assets are up to date.",
    syncRuntimesCheckSourceRepoProjectionAbsent: (count) =>
      `Source repository check passed: project runtime projections are intentionally absent here (${count} generated project file(s) skipped). Run project bootstrap in a target project to materialize project-local assets.`,
    // Reverse mode strings
    reverseModeIntro: "Scanning runtime projections for evolution signals...",
    reverseModeNoSignals: "No evolution signals detected. Runtime projections match canonical sources.",
    reverseModeSignalsFound: (n) => `Found ${n} evolution signal(s) from runtime projections.`,
    reverseModeConflictsDetected: (n) => `⚠ ${n} potential conflict(s) detected:`,
    reverseModeConflictHint: "(canonical has more content - may have un-synced changes)",
    reverseModeConflictPrompt: "Conflicts detected. Use --force to overwrite canonical, or review changes manually.",
    reverseModeAborted: "Aborted: resolve conflicts before writeback.",
    reverseModeForceProceed: "--force flag: proceeding with writeback despite conflicts.",
    reverseModeSafeWrites: (n) => `Safe to write back to canonical (${n} files):`,
    reverseModeDryRun: "Dry run complete: no files written. Use without --dry-run to apply changes.",
    reverseModeWriteFailed: (path, err) => `Failed to write back ${path}: ${err}`,
    reverseModeComplete: (n) => `Reverse sync complete: ${n} file(s) written to canonical/`,
    reverseModePropagating: "Propagating canonical updates to other runtimes...",
    reverseModeValidationFailed: (path) => `Validation failed for ${path}, skipping:`,
    proxyFallbackProxy: (label) =>
      `Direct connection failed for "${label}", retrying with proxy...`,
    proxyFallbackProxySuccess: (label) =>
      `Proxy connection succeeded for "${label}". Using proxy for this session.`,
    warnArchiveFallback: (id, category) =>
      `[WARN] falling back to archive for ${id} (${category})`,
    okArchiveInstalled: (path) => `[OK] archive installed ${path}`,
    warnArchiveFailed: (id, category, reason) =>
      `[WARN] archive fallback failed for ${id} (${category}): ${reason}`,
    okCloned: (path) => `[OK] cloned ${path}`,
    skipExists: (path) => `exists ${path}`,
    okBasename: (name, dest) => `[OK] ${name} -> ${dest}`,
    allUpToDate: (label) => `All ${label} up to date`,
    // Plugins
    pluginsHeader: "--- Claude Code plugins (user scope) ---",
    checkingPluginMarketplaces: "Checking plugin marketplaces...",
    warnClaNotFound:
      "claude CLI not found on PATH — skip plugin install. Install Claude Code CLI, then re-run with --plugins-only.",
    warnPluginFailed: (spec, code) =>
      `[WARN] plugin install failed: ${spec} (exit ${code})`,
    skipAlreadyInstalled: (name) => `${name} — already installed`,
    labelUpToDate: "up to date",
    labelCannotCheckGitHub: "cannot reach GitHub — skipping version check",
    labelUsingLocalRecord: (v) => `using local record: ${v}`,
    installingPlugin: (spec) => `Installing plugin: ${spec}`,
    updatingPlugin: (spec) => `Updating plugin: ${spec}`,
    pluginUpdateVersionMismatch: (spec, installedVer, specVer) =>
      `[UPDATE] ${spec} version mismatch: installed ${installedVer}, manifest ${specVer} — reinstalling`,
    pluginUpdateUnknownVersion: (spec) =>
      `[UPDATE] ${spec} has unknown installed version — reinstalling`,
    pluginUpdated: (spec) => `Plugin updated: ${spec}`,
    // Python/graphify
    pythonToolsHeader: "--- Python Tools (optional) ---",
    pythonNotFound: "Python 3.10+ not found. Skipping graphify.",
    pythonInstallHint:
      "Install Python 3.10+ and run: pip install graphifyy && python -m graphify claude install",
    skipGraphifyInstalled: (v) => `graphify already installed (${v})`,
    installingGraphify: "Installing graphify (code knowledge graph)...",
    installingGraphifySkill: "Registering graphify Claude skill...",
    okGraphifyInstalled: "graphify installed and Claude skill registered",
    warnGraphifySkillFailed:
      "graphify Claude skill registration failed (non-blocking)",
    warnGraphifyPipFailed: "graphify pip install failed (non-blocking)",
    pythonToolsOptionalHeader: "--- Python Tools (optional) ---",
    pythonNotFoundGraphify: "Python 3.10+ not found. Skipping graphify.",
    pythonInstallHintGraphify:
      "Install Python 3.10+ and run: pip install graphifyy && python -m graphify claude install",
    // Shared i18n keys for install-global-skills
    skillsHeader: (label, root) => `--- ${label}: ${root} ---`,
    skillsRuntimeSectionClaude: "Claude Code skills",
    skillsRuntimeSectionCodex: "Codex skills",
    skillsRuntimeSectionOpenclaw: "OpenClaw skills",
    skillsRuntimeSectionCursor: "Cursor skills",
    failManifestLoad: (err) => `Failed to load skills manifest: ${err}`,
    skillsFilterUnknown: (id) => `Unknown skill id (ignored): ${id}`,
    skillsFilterEmpty:
      "No third-party skill repos selected — skipping git installs for manifest skills.",
    skillsFilterNoMatches:
      "No matching skill ids — check config/skills.json and --skills / META_KIM_SKILL_IDS.",
    done: "Done.",
    noteCodexOpenclaw:
      "Note: Codex/Cursor native plugins must be installed through their host plugin UI; non-native runtimes use skill-directory fallbacks.",
    upstreamNativeInstallersHeader: "Upstream native installers",
    pluginBundlesHeader: "Plugin bundles / native plugin handoff",
    upstreamNativeInstall: (id, runtimeId) =>
      `${id}: upstream native install for ${runtimeId}`,
    upstreamProjectLocalSkipped: (id, runtimeId, commandText) =>
      `${id}: project-local installer skipped during global update; run from each ${runtimeId} project root: ${commandText}`,
    upstreamCodexConfigPreserveDryRun: (configPath) =>
      `preserve existing ${configPath} before ECC upstream installer and restore it with add-only ECC merge`,
    upstreamCodexGlobalAgentsPreserveDryRun: (agentsPath) =>
      `protect ${agentsPath} from ECC upstream installer: restore user-authored content or quarantine the ECC baseline if it appears globally`,
    upstreamInstallerFailureReason: (commandText) =>
      `Run ${commandText} directly to see the upstream installer output.`,
    codexNativeControlsDryRun: (configPath, requestUserInputFeature) =>
      `ensure ${configPath} preserves Codex App Browser/Chrome/Computer Use native controls ([features].${requestUserInputFeature}, [features].js_repl, Windows sandbox/notify, openai-bundled marketplace/plugins)`,
    codexConfigBackupBeforeEcc: (backupPath) =>
      `Backed up Codex config before ECC upstream installer: ${backupPath}`,
    codexConfigRestoredAfterEcc: (configPath) =>
      `Restored user Codex config after ECC upstream installer with add-only ECC merge: ${configPath}`,
    codexGlobalAgentsBackupBeforeEcc: (backupPath) =>
      `Backed up Codex global AGENTS.md before ECC upstream installer: ${backupPath}`,
    codexGlobalAgentsRestoredAfterEcc: (agentsPath) =>
      `Restored user Codex global AGENTS.md after ECC upstream installer: ${agentsPath}`,
    codexGlobalAgentsQuarantinedAfterEcc: (agentsPath, backupPath) =>
      `Quarantined ECC baseline from Codex global AGENTS.md: ${agentsPath}; backup: ${backupPath}`,
    codexChoiceSurfacePreserved: (configPath) =>
      `Codex choice surface and App native controls preserved: ${configPath}`,
    codexConfigBackupBeforeChoiceSurface: (backupPath) =>
      `Backed up Codex config before restoring choice surface and App native controls: ${backupPath}`,
    codexChoiceSurfaceRestored: (configPath) =>
      `Restored Codex choice surface, Windows-safe notify, and App native controls: ${configPath}`,
    codexNativePluginManualStep: (pluginId) =>
      `Codex native plugin manual step: run "codex plugin add ${pluginId}@openai-curated" or install it from /plugins.`,
    cursorNativePluginManualStep: (pluginId) =>
      `Cursor native plugin manual step: run /add-plugin ${pluginId} in Cursor Agent chat, or install it from Cursor's plugin marketplace. Cursor CLI does not currently expose a non-interactive plugin install command.`,
    codexPluginAlreadyInstalled: (pluginSpec) =>
      `Codex plugin ${pluginSpec} already installed`,
    codexNativePluginAutoInstallIncomplete: (pluginSpec) =>
      `Optional Codex native plugin auto-install did not complete: codex plugin add ${pluginSpec}. Install it from /plugins or rerun the command manually.`,
    staleClaudePluginRecordRemoved: (skillId, recordKey) =>
      `${skillId}: removing stale Claude plugin record ${recordKey}`,
    graphifyInstallSkippedGuideExists: (platformName) =>
      `graphify ${platformName} install skipped (guide already has Graphify section)`,
    usingActiveVenv: (venvPath) => `Using active venv: ${venvPath}`,
    venvTooOldFallback: (venvPath, versionText) =>
      `Venv at "${venvPath}" has ${versionText} (need 3.10+). Falling back to system Python.`,
    activeTargets: (targets) => `Active runtime targets: ${targets.join(", ")}`,
    metaKimRoot: (root) => `Meta_Kim repo (canonical source root): ${root}`,
    logSaved: (path) => `Full log saved to: ${path}`,
    warnManifestMissing: "skills manifest missing — no skills to install",
    warnRepairLegacyLayout: (id, dir) =>
      `repairing legacy install layout for ${id}: ${dir}`,
    warnRepairLegacySharedRoot: (dir) =>
      `Repairing legacy full-clone in shared root: ${dir}`,
    warnRemovingObsoleteDir:
      "Removing obsolete directory (left by a previous Meta_Kim version):",
    warnNestedCopyNotUsed: (runtimeId) =>
      `This nested copy is not used by ${runtimeId} and can be safely removed.`,
    warnPre2Artifact: "Pre-2.0 install artifact, no longer needed.",
    okRemovedObsolete: (n) =>
      `Removed ${n} obsolete director${n > 1 ? "ies" : "y"} left by a previous Meta_Kim version.`,
    noteSettingsNotAffected:
      "Your current settings, skills, and hooks are not affected.",
    warnQuarantineDryRun: (id, detail) =>
      `${id}: would quarantine invalid SKILL.md within managed install (${detail})`,
    warnQuarantined: (id, detail) =>
      `${id}: quarantined invalid SKILL.md within managed install (${detail})`,
    warnReplaceFailed: (id, dir, msg) =>
      `${id}: failed to replace existing install at ${dir}: ${msg}`,
    warnLegacyNameRemoved: (skillId, legacyName, dir) =>
      `${skillId}: removed legacy "${legacyName}" at ${dir} (renamed skill)`,
    warnDisabledResidueRemoved: (skillId, dir) =>
      `${skillId}: removed stale .disabled/ residue at ${dir}`,
    summaryInstallFailures: (n) => `Installation failures (${n}):`,
    summaryArchiveFallbacks: (n) => `Archive fallbacks used (${n}):`,
    summaryArchiveFallbackLine: (id, category) =>
      `${id} used archive fallback (${category})`,
    summaryArchiveFallbackScopeNote:
      "Only skills listed here used the tarball after git clone failed. Others in phase 1 succeeded via git (see ✓ staged lines above).",
    summaryRepairedOrFlagged: (n) =>
      `Meta_Kim-managed legacy installs repaired or flagged (${n}):`,
    summaryQuarantined: (n) =>
      `Invalid nested SKILL.md files quarantined inside Meta_Kim-managed installs (${n}):`,
    failureHint_tls_transport:
      "TLS/SSL connection failed — check network, proxy, or VPN settings",
    failureHint_repo_not_found:
      "Repository not found — check config/skills.json",
    failureHint_auth_required:
      "Authentication required — repository may be private",
    failureHint_subdir_missing:
      "Subdirectory not found — repository structure may have changed",
    failureHint_proxy_network:
      "Network connection failed — use --proxy <url> or set META_KIM_GIT_PROXY env, then retry",
    failureHint_permission_denied:
      "Permission denied — check home directory write permissions",
    failureHint_missing_runtime:
      "Missing runtime — ensure git is installed and in PATH",
    failureHint_unknown:
      "Unknown error — see details above or retry with --update",
    failureSuggestions: "Suggestions:",
    stagingHeaderParallel:
      "Phase 1: fetch skill repos into a temp cache (parallel)",
    stagingExplainParallel: (cacheDir) =>
      `How this step works:\n• Cache folder (not your project repo): ${cacheDir}\n• Git clones run here first so each upstream repo is downloaded once.\n• Phase 2 copies into each selected runtime skills directory (~/.claude/skills, etc.).\n• The cache folder is deleted when finished.`,
    cloneStarting: (id) => `Fetching ${id}…`,
    cloneProgressLine: (id, curStr, totStr, pct, curObj, totObj) =>
      `[${id}] ${curStr} / ~${totStr} total · ${pct}% · objects ${curObj}/${totObj}`,
    cloneProgressLinePartial: (id, curStr) =>
      `[${id}] ${curStr} received (estimating total…)`,
    okStaged: (id) => `Ready in cache: ${id}`,
    okStagedSubdir: (id, subdir) => `Ready in cache: ${id} (${subdir})`,
    warnStaleStagingResidual:
      "Stale staging directory left by a previous install run.",
    okRemovedStagingResidual: (n) =>
      `Removed ${n} stale staging director${n > 1 ? "ies" : "y"}.`,
    warnStagingLocked: (dir) =>
      `Windows reports EBUSY (directory busy/locked) — could not remove: ${dir}. Common causes: Explorer preview, antivirus/indexer, or another process holding the path. Close apps that touch ~/.openclaw/skills (or the path above), then re-run. Install may still have succeeded; leftover *.staged-* folders are safe to delete manually after unlock.`,
    val: {
      headerTitle: "Meta_Kim Project Integrity Check",
      step01: "Checking required files",
      step01Detail:
        "README.md, CLAUDE.md, package.json, sync manifest, canonical sources, local-state rules",
      step01Pass: "All required kernel files present",
      step02: "Validating stage-quality contract",
      step02Detail:
        "Critical, Fetch, Thinking, worker packets, and Review gates",
      step02Pass: "Stage-quality contract is valid",
      step03: "Validating sync manifest",
      step03Detail:
        "supportedTargets, defaultTargets, availableTargets, generatedTargets",
      step03Pass: "Sync manifest and runtime target catalog are coherent",
      step04: "Validating canonical agent definitions",
      step04Detail:
        "frontmatter completeness + forbidden-marker check + boundary discipline",
      step04Pass: (n, names) => `${n} agents passed: ${names.join(", ")}`,
      step05: "Checking canonical SKILL.md",
      step05Detail:
        "canonical metadata, station deliverable markers, and references",
      step05Pass: "Canonical meta-theory skill package is valid",
      step06: "Checking skills manifest",
      step06Detail: "skill capabilities and platform support metadata",
      step06Pass: "Skills manifest is valid",
      step07: "Checking canonical capability index",
      step07Detail: "source, mirrors, fetch order, and canonical coverage",
      step07Pass: "Capability index source and mirrors are valid",
      footerAll: (n) => `All ${n} checks passed`,
      footerAgents: (n) => `${n} agents ready`,
      valFailed: "Validation failed!",
      agentsReady: "agents ready",
    },
  },
  "zh-CN": {
    dryRun: (cmd) => `[dry-run] ${cmd}`,
    okUpdated: (path) => `[OK] 已更新 ${path}`,
    warnPullFailed: (path) => `[WARN] pull 失败，重新克隆 ${path}`,
    gitRetryLabelStaging: (id) => `${id}（阶段1·缓存拉取）`,
    warnGitInstallFailed: (id, category) =>
      `[WARN] ${id} git 安装失败 (${category})`,
    warnGitUsableDespiteError: (id, destPath) =>
      `${id}：git 报错，但 ${destPath} 已可用 — 按成功处理。`,
    gitFailureExitLine: (code) => `git 退出码：${code}`,
    gitFailureProgressNotFinalHint:
      "为何进度像「下完了」：接收对象/解析增量显示很高百分比时，检出、TLS 或增量解析仍可能在后面失败；请以**上方 git 原文**为准。",
    gitFailureNoStderr:
      "（未捕获到 stderr，可在终端手动执行相同 git 命令查看完整输出。）",
    proxyDetected: (url, source) =>
      `为 git 配置代理：${url}（来源：${source}）`,
    proxyStrippedHint:
      "已移除回环代理环境变量。使用 --proxy <url> 或设置 META_KIM_GIT_PROXY 环境变量来配置代理。",
    warnIgnoringLoopbackProxyEnv: (entries) =>
      `已忽略安装流程中的回环代理环境变量：${entries.join(", ")}`,
    canonicalMissingWarn: (filePath) =>
      `[sync-runtimes] 跳过缺失的 canonical 源文件：${filePath}`,
    syncRuntimesSummaryTitle: "── meta:sync（本轮增量写入摘要）──",
    syncRuntimesSummaryIntro:
      "下列数量为本次运行中有变更的路径；未列出的路径表示已与 canonical 一致。",
    runtimeGroupClaude: "Claude Code",
    runtimeGroupCodex: "Codex",
    runtimeGroupOpenclaw: "OpenClaw",
    runtimeGroupCursor: "Cursor",
    syncDetailAgents: (count, teamSize) =>
      `${count}/${teamSize} 个 agent 文件已更新`,
    syncDetailWorkspaces: (count, teamSize) =>
      `${count}/${teamSize} 个 workspace 目录有变更`,
    syncDetailFiles: (count) => `已更新 ${count} 个文件`,
    syncScopeLine: (scope, targets) =>
      `范围：${scope}  ·  目标工具：${targets}`,
    syncInstallManifestOk: (path, entries) =>
      `安装清单：${path}（共 ${entries} 条）`,
    syncRuntimesCheckStale: "生成的工具端镜像已过期：",
    syncRuntimesCheckStaleLine: (file) => `- ${file}`,
    syncRuntimesCheckOk: "工具端镜像已是最新。",
    syncRuntimesCheckSourceRepoProjectionAbsent: (count) =>
      `源仓库自检通过：项目级工具端投影在这里按预期保持未生成（已跳过 ${count} 个应生成的项目文件）。需要项目本地资产时，请在目标项目中运行 project bootstrap。`,
    // Reverse mode strings
    reverseModeIntro: "扫描工具端镜像以检测演进信号...",
    reverseModeNoSignals: "未检测到演进信号。工具端镜像与 canonical 源一致。",
    reverseModeSignalsFound: (n) => `从工具端镜像发现 ${n} 个演进信号。`,
    reverseModeConflictsDetected: (n) => `⚠ 检测到 ${n} 个潜在冲突：`,
    reverseModeConflictHint: "（canonical 内容更多 - 可能有未同步的更改）",
    reverseModeConflictPrompt: "检测到冲突。使用 --force 覆盖 canonical，或手动审查更改。",
    reverseModeAborted: "已中止：写回前请解决冲突。",
    reverseModeForceProceed: "--force 标志：尽管存在冲突仍继续写回。",
    reverseModeSafeWrites: (n) => `可安全写回 canonical（${n} 个文件）：`,
    reverseModeDryRun: "试运行完成：未写入文件。使用不带 --dry-run 的命令应用更改。",
    reverseModeWriteFailed: (path, err) => `写回失败 ${path}：${err}`,
    reverseModeComplete: (n) => `反向同步完成：${n} 个文件已写入 canonical/`,
    reverseModePropagating: "将 canonical 更新传播到其他工具端...",
    reverseModeValidationFailed: (path) => `验证失败 ${path}，跳过：`,
    proxyFallbackProxy: (label) => `"${label}" 直连失败，正在尝试代理连接...`,
    proxyFallbackProxySuccess: (label) =>
      `"${label}" 代理连接成功，本次会话使用代理。`,
    warnArchiveFallback: (id, category) =>
      `[WARN] ${id} 回退到归档安装 (${category})`,
    okArchiveInstalled: (path) => `[OK] 归档安装完成 ${path}`,
    warnArchiveFailed: (id, category, reason) =>
      `[WARN] ${id} 归档安装失败 (${category}): ${reason}`,
    okCloned: (path) => `[OK] 已克隆 ${path}`,
    skipExists: (path) => `已存在 ${path}`,
    okBasename: (name, dest) => `[OK] ${name} -> ${dest}`,
    allUpToDate: (label) => `全部就绪 — ${label}`,
    pluginsHeader: "--- Claude Code 插件（用户范围）---",
    checkingPluginMarketplaces: "正在检查插件市场...",
    warnClaNotFound:
      "未找到 claude CLI — 跳过插件安装。请先安装 Claude Code CLI，然后运行 --plugins-only。",
    skipAlreadyInstalled: (name) => `${name} — 已安装`,
    labelUpToDate: "已是最新",
    labelCannotCheckGitHub: "无法连接 GitHub — 跳过版本检测",
    labelUsingLocalRecord: (v) => `使用本地记录：${v}`,
    installingPlugin: (spec) => `正在安装插件：${spec}`,
    updatingPlugin: (spec) => `正在更新插件：${spec}`,
    warnPluginFailed: (spec, code) =>
      `[WARN] 插件安装失败：${spec}（退出码 ${code}）`,
    pluginUpdateVersionMismatch: (spec, installedVer, specVer) =>
      `[更新] ${spec} 版本不匹配：已安装 ${installedVer}，清单 ${specVer} — 重新安装`,
    pluginUpdateUnknownVersion: (spec) =>
      `[更新] ${spec} 已安装版本未知 — 重新安装`,
    pluginUpdated: (spec) => `插件已更新：${spec}`,
    pythonToolsHeader: "--- Python 工具（可选）---",
    pythonNotFound: "未找到 Python 3.10+，跳过 graphify。",
    pythonInstallHint:
      "安装 Python 3.10+ 后运行：pip install graphifyy && python -m graphify claude install",
    skipGraphifyInstalled: (v) => `graphify 已安装 (${v})`,
    installingGraphify: "正在安装 graphify（代码知识图谱）...",
    installingGraphifySkill: "正在注册 graphify Claude 技能...",
    okGraphifyInstalled: "graphify 已安装，Claude 技能已注册",
    warnGraphifySkillFailed: "graphify Claude 技能注册失败（不影响其他功能）",
    warnGraphifyPipFailed: "graphify pip 安装失败（不影响其他功能）",
    skillsHeader: (label, root) => `--- ${label}: ${root} ---`,
    skillsRuntimeSectionClaude: "Claude Code 技能",
    skillsRuntimeSectionCodex: "Codex 技能",
    skillsRuntimeSectionOpenclaw: "OpenClaw 技能",
    skillsRuntimeSectionCursor: "Cursor 技能",
    failManifestLoad: (err) => `加载技能清单失败：${err}`,
    skillsFilterUnknown: (id) => `未知的技能 id（已忽略）：${id}`,
    skillsFilterEmpty: "未选择任何第三方技能仓库 — 跳过清单中的 git 安装。",
    skillsFilterNoMatches:
      "没有匹配的 skill id — 请检查 config/skills.json 以及 --skills / META_KIM_SKILL_IDS。",
    done: "完成。",
    noteCodexOpenclaw:
      "注意：Codex/Cursor 原生插件必须通过宿主插件 UI 安装；没有原生插件入口的工具端才使用技能目录回退。",
    upstreamNativeInstallersHeader: "上游原生安装器",
    pluginBundlesHeader: "插件包 / 原生插件交接",
    upstreamNativeInstall: (id, runtimeId) =>
      `${id}：正在为 ${runtimeId} 运行上游原生安装`,
    upstreamProjectLocalSkipped: (id, runtimeId, commandText) =>
      `${id}：全局更新不会写入项目本地安装；请在每个 ${runtimeId} 项目根目录运行：${commandText}`,
    upstreamCodexConfigPreserveDryRun: (configPath) =>
      `保留现有 ${configPath}；ECC 上游安装后用只追加合并恢复`,
    upstreamCodexGlobalAgentsPreserveDryRun: (agentsPath) =>
      `保护 ${agentsPath} 不被 ECC 上游安装器覆盖：用户原文会恢复；全局 ECC 基线会备份并隔离`,
    upstreamInstallerFailureReason: (commandText) =>
      `请直接运行 ${commandText} 查看上游安装器输出。`,
    codexNativeControlsDryRun: (configPath, requestUserInputFeature) =>
      `确保 ${configPath} 保留 Codex App Browser/Chrome/Computer Use 原生控制（[features].${requestUserInputFeature}、[features].js_repl、Windows sandbox/notify、openai-bundled marketplace/plugins）`,
    codexConfigBackupBeforeEcc: (backupPath) =>
      `ECC 上游安装前已备份 Codex 配置：${backupPath}`,
    codexConfigRestoredAfterEcc: (configPath) =>
      `已在 ECC 上游安装后用只追加合并恢复用户 Codex 配置：${configPath}`,
    codexGlobalAgentsBackupBeforeEcc: (backupPath) =>
      `ECC 上游安装前已备份 Codex 全局 AGENTS.md：${backupPath}`,
    codexGlobalAgentsRestoredAfterEcc: (agentsPath) =>
      `已在 ECC 上游安装后恢复用户 Codex 全局 AGENTS.md：${agentsPath}`,
    codexGlobalAgentsQuarantinedAfterEcc: (agentsPath, backupPath) =>
      `已隔离 Codex 全局 AGENTS.md 中的 ECC 基线：${agentsPath}；备份：${backupPath}`,
    codexChoiceSurfacePreserved: (configPath) =>
      `Codex 选择界面和 App 原生控制已保留：${configPath}`,
    codexConfigBackupBeforeChoiceSurface: (backupPath) =>
      `恢复选择界面和 App 原生控制前已备份 Codex 配置：${backupPath}`,
    codexChoiceSurfaceRestored: (configPath) =>
      `已恢复 Codex 选择界面、Windows 安全通知和 App 原生控制：${configPath}`,
    codexNativePluginManualStep: (pluginId) =>
      `Codex 原生插件需手动安装：运行 "codex plugin add ${pluginId}@openai-curated"，或在 /plugins 中安装。`,
    cursorNativePluginManualStep: (pluginId) =>
      `Cursor 原生插件需手动安装：在 Cursor Agent 聊天中运行 /add-plugin ${pluginId}，或从 Cursor 插件市场安装。Cursor CLI 当前没有非交互式插件安装命令。`,
    codexPluginAlreadyInstalled: (pluginSpec) =>
      `Codex 插件 ${pluginSpec} 已安装`,
    codexNativePluginAutoInstallIncomplete: (pluginSpec) =>
      `可选 Codex 原生插件自动安装未完成：codex plugin add ${pluginSpec}。请从 /plugins 安装或手动重试。`,
    staleClaudePluginRecordRemoved: (skillId, recordKey) =>
      `${skillId}：正在移除过时的 Claude 插件记录 ${recordKey}`,
    graphifyInstallSkippedGuideExists: (platformName) =>
      `跳过 graphify ${platformName} install（指南中已有 Graphify 章节）`,
    usingActiveVenv: (venvPath) => `使用当前 venv：${venvPath}`,
    venvTooOldFallback: (venvPath, versionText) =>
      `venv "${venvPath}" 当前为 ${versionText}（需要 3.10+），改用系统 Python。`,
    activeTargets: (targets) => `当前启用的工具端：${targets.join(", ")}`,
    metaKimRoot: (root) => `Meta_Kim 仓库（正典源根目录）：${root}`,
    logSaved: (path) => `完整日志已保存至：${path}`,
    warnManifestMissing: "缺少技能清单 — 无技能可安装",
    warnRepairLegacyLayout: (id, dir) => `正在修复遗留安装布局 ${id}：${dir}`,
    warnRepairLegacySharedRoot: (dir) =>
      `正在修复共享根目录中的遗留完整克隆：${dir}`,
    warnRemovingObsoleteDir: "正在移除过时目录（由旧版 Meta_Kim 留下）：",
    warnNestedCopyNotUsed: (runtimeId) =>
      `该嵌套副本未被 ${runtimeId} 使用，可安全移除。`,
    warnPre2Artifact: "2.0 之前的安装残留，不再需要。",
    okRemovedObsolete: (n) => `已移除 ${n} 个旧版 Meta_Kim 遗留的过时目录。`,
    noteSettingsNotAffected: "您当前的设置、技能和钩子不受影响。",
    warnQuarantineDryRun: (id, detail) =>
      `${id}：将隔离托管安装中的无效 SKILL.md（${detail}）`,
    warnQuarantined: (id, detail) =>
      `${id}：已隔离托管安装中的无效 SKILL.md（${detail}）`,
    warnReplaceFailed: (id, dir, msg) =>
      `${id}：替换已有安装失败 ${dir}：${msg}`,
    warnLegacyNameRemoved: (skillId, legacyName, dir) =>
      `${skillId}：已移除旧名称 "${legacyName}" 位于 ${dir}（技能已重命名）`,
    warnDisabledResidueRemoved: (skillId, dir) =>
      `${skillId}：已移除过时的 .disabled/ 残留 ${dir}`,
    summaryInstallFailures: (n) => `安装失败（${n}）：`,
    summaryArchiveFallbacks: (n) => `使用了归档回退（${n}）：`,
    summaryArchiveFallbackLine: (id, category) =>
      `${id} 已使用归档回退（${category}）`,
    summaryArchiveFallbackScopeNote:
      "仅上表列出者在 git clone 失败后使用了源码包；同阶段已显示「已拉取到缓存」的其它技能均为正常 git，不计入归档。",
    summaryRepairedOrFlagged: (n) =>
      `Meta_Kim 管理的遗留安装已修复或标记（${n}）：`,
    summaryQuarantined: (n) =>
      `Meta_Kim 管理安装中隔离的无效嵌套 SKILL.md 文件（${n}）：`,
    failureHint_tls_transport:
      "TLS/SSL 连接失败 — 请检查网络连接、代理设置或 VPN 配置",
    failureHint_repo_not_found:
      "仓库未找到 — 请检查 config/skills.json 中的仓库地址",
    failureHint_auth_required: "需要认证 — 仓库可能是私有仓库",
    failureHint_subdir_missing: "子目录未找到 — 仓库结构可能已变更",
    failureHint_proxy_network:
      "网络连接失败 — 请使用 --proxy <url> 或设置 META_KIM_GIT_PROXY 环境变量后重试",
    failureHint_permission_denied: "权限被拒绝 — 请检查用户目录的读写权限",
    failureHint_missing_runtime: "缺少 git 命令 — 请确保 git 已安装并在 PATH 中",
    failureHint_unknown:
      "未知错误 — 请查看上方详细错误信息，或使用 --update 重试",
    failureSuggestions: "建议：",
    stagingHeaderParallel: "阶段 1：在临时缓存目录并行拉取技能仓库",
    stagingExplainParallel: (cacheDir) =>
      `这一步在做什么：\n• 缓存目录（不是你的项目仓库）：${cacheDir}\n• 先把各上游仓库下载到这里，多工具端只拉取一次。\n• 阶段 2 再复制到你勾选的各工具端 skills 目录（如 ~/.claude/skills）。\n• 全部完成后会删除该临时目录。`,
    cloneStarting: (id) => `开始拉取 ${id}…`,
    cloneProgressLine: (id, curStr, totStr, pct, curObj, totObj) =>
      `[${id}] 已接收 ${curStr} / 约 ${totStr} · ${pct}% · 对象 ${curObj}/${totObj}`,
    cloneProgressLinePartial: (id, curStr) =>
      `[${id}] 已接收 ${curStr}（估算总量中…）`,
    okStaged: (id) => `已拉取到缓存：${id}`,
    okStagedSubdir: (id, subdir) => `已拉取到缓存：${id}（${subdir}）`,
    warnStaleStagingResidual: "上次安装运行残留的临时暂存目录。",
    okRemovedStagingResidual: (n) => `已清理 ${n} 个残留暂存目录。`,
    warnStagingLocked: (dir) =>
      `Windows 报告 EBUSY（目录被占用/锁定），暂无法删除：${dir}。常见原因：资源管理器预览、杀毒/索引器、或其它进程占用该路径。请关闭占用 ~/.openclaw/skills（或上述路径）的程序后重试。技能可能已安装成功；解锁后可手动删除残留的 *.staged-* 目录。`,
    pythonToolsOptionalHeader: "--- Python 工具（可选）---",
    pythonNotFoundGraphify: "未找到 Python 3.10+，跳过 graphify。",
    pythonInstallHintGraphify:
      "安装 Python 3.10+ 后运行：pip install graphifyy && python -m graphify claude install",
    val: {
      headerTitle: "Meta_Kim 项目完整性检查",
      step01: "检查必需文件",
      step01Detail:
        "README.md, CLAUDE.md, package.json, 同步清单, canonical 源, 本地状态规则",
      step01Pass: "所有必需内核文件就绪",
      step02: "验证阶段质量合约",
      step02Detail:
        "Critical（确认真实目标）、Fetch（收集证据和能力来源）、Thinking（选择路线）、worker packet 和 Review（审查质量与边界）gate",
      step02Pass: "阶段质量合约有效",
      step03: "验证同步清单",
      step03Detail:
        "supportedTargets, defaultTargets, availableTargets, generatedTargets",
      step03Pass: "同步清单与工具端目标目录一致",
      step04: "验证 canonical 智能体定义",
      step04Detail: "frontmatter 完整性 + 禁止标记检查 + 边界规范",
      step04Pass: (n, names) => `${n} 个智能体通过：${names.join(", ")}`,
      step05: "检查 canonical SKILL.md",
      step05Detail: "规范元数据, station 交付标记, references",
      step05Pass: "Canonical meta-theory 技能包有效",
      step06: "检查 Skills manifest",
      step06Detail: "技能能力与平台支持元数据",
      step06Pass: "Skills manifest 有效",
      step07: "检查 canonical capability index",
      step07Detail: "来源、镜像、fetch 顺序和 canonical 覆盖",
      step07Pass: "Capability index 源和镜像有效",
      footerAll: (n) => `全部 ${n} 项检查通过`,
      footerAgents: (n) => `${n} 个智能体就绪`,
      valFailed: "验证失败！",
      agentsReady: "个智能体就绪",
    },
  },
  "ja-JP": {
    dryRun: (cmd) => `[dry-run] ${cmd}`,
    okUpdated: (path) => `[OK] 更新済み ${path}`,
    warnPullFailed: (path) => `[WARN] pull 失敗、再クローン ${path}`,
    gitRetryLabelStaging: (id) => `${id}（フェーズ1·キャッシュ取得）`,
    warnGitInstallFailed: (id, category) =>
      `[WARN] ${id} gitインストール失敗 (${category})`,
    warnGitUsableDespiteError: (id, destPath) =>
      `${id}: git がエラーを返しましたが、${destPath} は利用可能です — 成功として扱います。`,
    gitFailureExitLine: (code) => `git 終了コード: ${code}`,
    gitFailureProgressNotFinalHint:
      "進捗が完了に見える理由: フェッチの % が高くても、その後の checkout / delta / TLS で失敗することがあります。上の行が実際のエラーです。",
    gitFailureNoStderr:
      "（stderr がありません。同じ git コマンドを端末で実行して確認してください。）",
    proxyDetected: (url, source) =>
      `git プロキシ設定: ${url}（来源: ${source}）`,
    proxyStrippedHint:
      "ループバックプロキシ環境変数を削除しました。--proxy <url> または META_KIM_GIT_PROXY 環境変数でプロキシを設定してください。",
    warnIgnoringLoopbackProxyEnv: (entries) =>
      `インストール用のループバックプロキシ環境変数を無視しました: ${entries.join(", ")}`,
    canonicalMissingWarn: (filePath) =>
      `[sync-runtimes] 欠落している canonical ファイルをスキップ: ${filePath}`,
    syncRuntimesSummaryTitle: "── meta:sync（増分書き込み要約）──",
    syncRuntimesSummaryIntro:
      "表示件数は今回変更されたパスのみです。変更のないパスは省略されます。",
    runtimeGroupClaude: "Claude Code",
    runtimeGroupCodex: "Codex",
    runtimeGroupOpenclaw: "OpenClaw",
    runtimeGroupCursor: "Cursor",
    syncDetailAgents: (count, teamSize) =>
      `${count}/${teamSize} 件のエージェントファイルを更新`,
    syncDetailWorkspaces: (count, teamSize) =>
      `${count}/${teamSize} 件のワークスペースディレクトリに変更あり`,
    syncDetailFiles: (count) => `${count} ファイルを更新`,
    syncScopeLine: (scope, targets) =>
      `スコープ: ${scope}  ·  ターゲット: ${targets}`,
    syncInstallManifestOk: (path, entries) =>
      `インストールマニフェスト: ${path}（${entries} 件）`,
    syncRuntimesCheckStale: "生成されたランタイム資産が古くなっています:",
    syncRuntimesCheckStaleLine: (file) => `- ${file}`,
    syncRuntimesCheckOk: "ランタイム資産は最新です。",
    syncRuntimesCheckSourceRepoProjectionAbsent: (count) =>
      `Source repository check passed: project runtime projections are intentionally absent here (${count} generated project file(s) skipped). Run project bootstrap in a target project to materialize project-local assets.`,
    // Reverse mode strings
    reverseModeIntro: "ランタイム投影から進化信号をスキャン中...",
    reverseModeNoSignals: "進化信号は検出されませんでした。ランタイム投影は canonical ソースと一致しています。",
    reverseModeSignalsFound: (n) => `ランタイム投影から ${n} 個の進化信号が見つかりました。`,
    reverseModeConflictsDetected: (n) => `⚠ ${n} 個の潜在的な競合が検出されました：`,
    reverseModeConflictHint: "（canonical のコンテンツが多い - 未同期の変更がある可能性があります）",
    reverseModeConflictPrompt: "競合が検出されました。--force で canonical を上書きするか、手動で変更を確認してください。",
    reverseModeAborted: "中止：ライトバック前に競合を解決してください。",
    reverseModeForceProceed: "--force フラグ：競合があるにもかかわらずライトバックを続行します。",
    reverseModeSafeWrites: (n) => `canonical へのライトバックが安全です（${n} ファイル）：`,
    reverseModeDryRun: "ドライラン完了：ファイルは書き込まれませんでした。--dry-run を外して変更を適用してください。",
    reverseModeWriteFailed: (path, err) => `ライトバック失敗 ${path}：${err}`,
    reverseModeComplete: (n) => `リバース同期完了：${n} ファイルを canonical/ に書き込みました`,
    reverseModePropagating: "canonical の更新を他のランタイムに伝播中...",
    reverseModeValidationFailed: (path) => `${path} の検証に失敗しました、スキップ：`,
    proxyFallbackProxy: (label) =>
      `"${label}" 直接接続失敗、プロキシで再試行中...`,
    proxyFallbackProxySuccess: (label) =>
      `"${label}" プロキシ接続成功。このセッションはプロキシを使用します。`,
    warnArchiveFallback: (id, category) =>
      `[WARN] ${id} アーカイブフォールバック (${category})`,
    okArchiveInstalled: (path) => `[OK] アーカイブインストール ${path}`,
    warnArchiveFailed: (id, category, reason) =>
      `[WARN] ${id} アーカイブ失敗 (${category}): ${reason}`,
    okCloned: (path) => `[OK] クローン済み ${path}`,
    skipExists: (path) => `存在 ${path}`,
    okBasename: (name, dest) => `[OK] ${name} -> ${dest}`,
    pluginsHeader: "--- Claude Code プラグイン（ユーザー範囲）---",
    checkingPluginMarketplaces: "プラグインマーケットプレイスを確認中...",
    warnClaNotFound:
      "claude CLI が見つかりません — プラグインインストールをスキップ。Claude Code CLI をインストール後、--plugins-only を再実行してください。",
    skipAlreadyInstalled: (name) => `${name} — インストール済み`,
    labelUpToDate: "最新バージョン",
    labelCannotCheckGitHub:
      "GitHub に接続できません — バージョンチェックをスキップ",
    labelUsingLocalRecord: (v) => `ローカルレコードを使用：${v}`,
    installingPlugin: (spec) => `プラグインをインストール中：${spec}`,
    updatingPlugin: (spec) => `プラグインを更新中：${spec}`,
    warnPluginFailed: (spec, code) =>
      `[WARN] プラグインインストール失敗：${spec}（終了 ${code}）`,
    pluginUpdateVersionMismatch: (spec, installedVer, specVer) =>
      `[更新] ${spec} バージョン不一致：インストール済み ${installedVer}、マニフェスト ${specVer} — 再インストール`,
    pluginUpdateUnknownVersion: (spec) =>
      `[更新] ${spec} インストール済みバージョンが不明 — 再インストール`,
    pluginUpdated: (spec) => `プラグイン更新済み：${spec}`,
    pythonToolsHeader: "--- Python ツール（オプション）---",
    pythonNotFound: "Python 3.10+ が見つかりません — graphify をスキップ。",
    pythonInstallHint:
      "Python 3.10+ インストール後：pip install graphifyy && python -m graphify claude install",
    skipGraphifyInstalled: (v) => `graphify インストール済み (${v})`,
    installingGraphify: "graphify をインストール中（コードナレッジグラフ）...",
    installingGraphifySkill: "graphify Claude スキルを登録中...",
    okGraphifyInstalled: "graphify インストール完了、Claude スキル登録済み",
    allUpToDate: (label) => `${label} すべて最新です`,
    warnGraphifySkillFailed: "graphify Claude スキル登録失敗（非ブロッキング）",
    warnGraphifyPipFailed: "graphify pip インストール失敗（非ブロッキング）",
    skillsHeader: (label, root) => `--- ${label}: ${root} ---`,
    skillsRuntimeSectionClaude: "Claude Code スキル",
    skillsRuntimeSectionCodex: "Codex スキル",
    skillsRuntimeSectionOpenclaw: "OpenClaw スキル",
    skillsRuntimeSectionCursor: "Cursor スキル",
    failManifestLoad: (err) => `スキルマニフェストの読み込みに失敗：${err}`,
    skillsFilterUnknown: (id) => `不明なスキル ID（無視）: ${id}`,
    skillsFilterEmpty:
      "サードパーティのスキルリポジトリが未選択 — マニフェストの git クローンをスキップします。",
    skillsFilterNoMatches:
      "一致するスキル ID がありません — config/skills.json と --skills / META_KIM_SKILL_IDS を確認してください。",
    done: "完了。",
    noteCodexOpenclaw:
      "注意：Codex/Cursor のネイティブプラグインは各ホストのプラグイン UI からインストールしてください。ネイティブ入口がないランタイムのみスキルディレクトリにフォールバックします。",
    upstreamNativeInstallersHeader: "上流ネイティブインストーラー",
    pluginBundlesHeader: "プラグインバンドル / ネイティブプラグイン引き渡し",
    upstreamNativeInstall: (id, runtimeId) =>
      `${id}: ${runtimeId} 向け上流ネイティブインストールを実行中`,
    upstreamProjectLocalSkipped: (id, runtimeId, commandText) =>
      `${id}: グローバル更新ではプロジェクトローカルインストールを変更しません。各 ${runtimeId} プロジェクトルートで実行してください: ${commandText}`,
    upstreamCodexConfigPreserveDryRun: (configPath) =>
      `既存の ${configPath} を保持し、ECC 上流インストール後に追加のみのマージで復元します`,
    upstreamCodexGlobalAgentsPreserveDryRun: (agentsPath) =>
      `${agentsPath} を ECC 上流インストーラーから保護します。ユーザー内容は復元し、グローバル ECC ベースラインはバックアップして隔離します`,
    upstreamInstallerFailureReason: (commandText) =>
      `上流インストーラー出力を確認するには ${commandText} を直接実行してください。`,
    codexNativeControlsDryRun: (configPath, requestUserInputFeature) =>
      `${configPath} が Codex App Browser/Chrome/Computer Use のネイティブ制御（[features].${requestUserInputFeature}, [features].js_repl, Windows sandbox/notify, openai-bundled marketplace/plugins）を保持することを確認します`,
    codexConfigBackupBeforeEcc: (backupPath) =>
      `ECC 上流インストール前に Codex 設定をバックアップしました: ${backupPath}`,
    codexConfigRestoredAfterEcc: (configPath) =>
      `ECC 上流インストール後、追加のみのマージでユーザー Codex 設定を復元しました: ${configPath}`,
    codexGlobalAgentsBackupBeforeEcc: (backupPath) =>
      `ECC 上流インストール前に Codex グローバル AGENTS.md をバックアップしました: ${backupPath}`,
    codexGlobalAgentsRestoredAfterEcc: (agentsPath) =>
      `ECC 上流インストール後にユーザーの Codex グローバル AGENTS.md を復元しました: ${agentsPath}`,
    codexGlobalAgentsQuarantinedAfterEcc: (agentsPath, backupPath) =>
      `Codex グローバル AGENTS.md の ECC ベースラインを隔離しました: ${agentsPath}; バックアップ: ${backupPath}`,
    codexChoiceSurfacePreserved: (configPath) =>
      `Codex choice surface と App ネイティブ制御を保持しました: ${configPath}`,
    codexConfigBackupBeforeChoiceSurface: (backupPath) =>
      `choice surface と App ネイティブ制御の復元前に Codex 設定をバックアップしました: ${backupPath}`,
    codexChoiceSurfaceRestored: (configPath) =>
      `Codex choice surface、Windows-safe notify、App ネイティブ制御を復元しました: ${configPath}`,
    codexNativePluginManualStep: (pluginId) =>
      `Codex ネイティブプラグインは手動手順です: "codex plugin add ${pluginId}@openai-curated" を実行するか /plugins からインストールしてください。`,
    cursorNativePluginManualStep: (pluginId) =>
      `Cursor ネイティブプラグインは手動手順です: Cursor Agent チャットで /add-plugin ${pluginId} を実行するか、Cursor のプラグインマーケットからインストールしてください。Cursor CLI は現在、非対話プラグインインストールを公開していません。`,
    codexPluginAlreadyInstalled: (pluginSpec) =>
      `Codex プラグイン ${pluginSpec} はインストール済み`,
    codexNativePluginAutoInstallIncomplete: (pluginSpec) =>
      `任意の Codex ネイティブプラグイン自動インストールが完了しませんでした: codex plugin add ${pluginSpec}。/plugins からインストールするか手動で再実行してください。`,
    staleClaudePluginRecordRemoved: (skillId, recordKey) =>
      `${skillId}: 古い Claude プラグインレコード ${recordKey} を削除中`,
    graphifyInstallSkippedGuideExists: (platformName) =>
      `graphify ${platformName} install をスキップ（ガイドに Graphify セクションが既にあります）`,
    usingActiveVenv: (venvPath) => `アクティブな venv を使用: ${venvPath}`,
    venvTooOldFallback: (venvPath, versionText) =>
      `venv "${venvPath}" は ${versionText}（3.10+ が必要）です。システム Python にフォールバックします。`,
    activeTargets: (targets) =>
      `アクティブランタイムターゲット：${targets.join(", ")}`,
    metaKimRoot: (root) => `Meta_Kim リポジトリ（正典ソースルート）：${root}`,
    logSaved: (path) => `フルログ保存先：${path}`,
    warnManifestMissing:
      "スキルマニフェストが見つかりません — インストールするスキルがありません",
    warnRepairLegacyLayout: (id, dir) =>
      `レガシーインストールレイアウトを修復中 ${id}：${dir}`,
    warnRepairLegacySharedRoot: (dir) =>
      `共有ルートのレガシーフルクローンを修復中：${dir}`,
    warnRemovingObsoleteDir:
      "旧バージョンの Meta_Kim が残した古いディレクトリを削除中：",
    warnNestedCopyNotUsed: (runtimeId) =>
      `このネストされたコピーは ${runtimeId} で使用されておらず、安全に削除できます。`,
    warnPre2Artifact: "2.0 以前のインストールアーティファクト、不要です。",
    okRemovedObsolete: (n) =>
      `旧バージョンの Meta_Kim が残した古いディレクトリ ${n} 個を削除しました。`,
    noteSettingsNotAffected: "現在の設定、スキル、フックには影響しません。",
    warnQuarantineDryRun: (id, detail) =>
      `${id}：管理下インストールの無効な SKILL.md を隔離予定（${detail}）`,
    warnQuarantined: (id, detail) =>
      `${id}：管理下インストールの無効な SKILL.md を隔離しました（${detail}）`,
    warnReplaceFailed: (id, dir, msg) =>
      `${id}：既存インストールの置換に失敗 ${dir}：${msg}`,
    warnLegacyNameRemoved: (skillId, legacyName, dir) =>
      `${skillId}：旧名 "${legacyName}" を削除しました ${dir}（スキル名変更）`,
    warnDisabledResidueRemoved: (skillId, dir) =>
      `${skillId}：古い .disabled/ 残留を削除しました ${dir}`,
    summaryInstallFailures: (n) => `インストール失敗（${n}）：`,
    summaryArchiveFallbacks: (n) => `アーカイブフォールバック使用（${n}）：`,
    summaryArchiveFallbackLine: (id, category) =>
      `${id} はアーカイブフォールバックを使用（${category}）`,
    summaryArchiveFallbackScopeNote:
      "上記のみ git clone 失敗後に tarball を使用。フェーズ1 で「キャッシュ取得済み」と出たその他スキルは git のみで、集計に含みません。",
    summaryRepairedOrFlagged: (n) =>
      `Meta_Kim 管理のレガシーインストール修復/フラグ（${n}）：`,
    summaryQuarantined: (n) =>
      `Meta_Kim 管理インストール内の無効なネスト SKILL.md ファイルを隔離（${n}）：`,
    failureHint_tls_transport:
      "TLS/SSL 接続失敗 — ネットワーク、プロキシ、または VPN 設定を確認してください",
    failureHint_repo_not_found:
      "リポジトリが見つかりません — config/skills.json を確認してください",
    failureHint_auth_required:
      "認証が必要です — リポジトリが非公開の可能性があります",
    failureHint_subdir_missing:
      "サブディレクトリが見つかりません — リポジトリ構造が変更された可能性があります",
    failureHint_proxy_network:
      "ネットワーク接続失敗 — --proxy <url> または META_KIM_GIT_PROXY 環境変数を設定して再試行してください",
    failureHint_permission_denied:
      "権限が拒否されました — ホームディレクトリの書き込み権限を確認してください",
    failureHint_missing_runtime:
      "ランタイム不足 — git がインストールされ PATH に含まれていることを確認してください",
    failureHint_unknown:
      "不明なエラー — 上記の詳細を確認するか、--update で再試行してください",
    failureSuggestions: "提案：",
    stagingHeaderParallel:
      "フェーズ1：一時キャッシュにスキルリポジトリを並列取得",
    stagingExplainParallel: (cacheDir) =>
      `このステップの流れ:\n• キャッシュフォルダ（プロジェクト本体ではありません）: ${cacheDir}\n• 先に各リポジトリをここへ clone（複数ランタイムでも 1 回だけ）。\n• フェーズ2 で各ランタイムの skills ディレクトリへコピー（例: ~/.claude/skills）。\n• 完了後、この一時フォルダは削除されます。`,
    cloneStarting: (id) => `${id} を取得中…`,
    okStaged: (id) => `キャッシュ準備完了: ${id}`,
    okStagedSubdir: (id, subdir) => `キャッシュ準備完了: ${id}（${subdir}）`,
    warnStaleStagingResidual:
      "前回のインストール実行から残ったステージングディレクトリ。",
    okRemovedStagingResidual: (n) =>
      `${n} 個の古いステージングディレクトリを削除しました。`,
    warnStagingLocked: (dir) =>
      `Windows が EBUSY（ディレクトリ使用中）を返しました — 削除できません: ${dir}。原因例: エクスプローラー、ウイルス対策/インデクサ、他プロセス。~/.openclaw/skills 等を触っているアプリを終了して再実行してください。インストール自体は成功している場合があります。*.staged-* は解放後に手動削除して構いません。`,
    pythonToolsOptionalHeader: "--- Python ツール（オプション）---",
    pythonNotFoundGraphify:
      "Python 3.10+ が見つかりません — graphify をスキップ。",
    pythonInstallHintGraphify:
      "Python 3.10+ インストール後：pip install graphifyy && python -m graphify claude install",
    val: {
      headerTitle: "Meta_Kim プロジェクト整合性チェック",
      step01: "必須ファイルのチェック",
      step01Detail:
        "README.md, CLAUDE.md, package.json, 同期マifest, canonical sources, ローカル状態ルール",
      step01Pass: "すべての必須カーネルファイルが存在します",
      step02: "ステージ品質コントラクトの検証",
      step02Detail:
        "Critical, Fetch, Thinking, worker packets, Review gates",
      step02Pass: "ステージ品質コントラクトが有効です",
      step03: "同期マifest の検証",
      step03Detail:
        "supportedTargets, defaultTargets, availableTargets, generatedTargets",
      step03Pass: "同期マifestとランタイムターゲットカタログが整合しています",
      step04: "canonical エージェント定義の検証",
      step04Detail: "frontmatter 完全性 + 禁止マーカー検査 + 境界規範",
      step04Pass: (n, names) => `${n} エージェントが合格: ${names.join(", ")}`,
      step05: "canonical SKILL.md のチェック",
      step05Detail:
        "規範メタデータ, station ディリバラブルマーカー, references",
      step05Pass: "Canonical meta-theory スキルパッケージが有効です",
      step06: "Skills manifest のチェック",
      step06Detail: "スキル能力とプラットフォームサポートのメタデータ",
      step06Pass: "Skills manifest が有効です",
      step07: "canonical capability index のチェック",
      step07Detail: "source, mirrors, fetch order, canonical coverage",
      step07Pass: "Capability index の source と mirrors が有効です",
      footerAll: (n) => `全 ${n} チェックが合格しました`,
      footerAgents: (n) => `${n} エージェントが準備できています`,
      valFailed: "検証に失敗しました！",
      agentsReady: "エージェントが準備できています",
    },
  },
  "ko-KR": {
    dryRun: (cmd) => `[dry-run] ${cmd}`,
    okUpdated: (path) => `[OK] 업데이트됨 ${path}`,
    warnPullFailed: (path) => `[WARN] pull 실패, 재클론 ${path}`,
    gitRetryLabelStaging: (id) => `${id}（1단계·캐시 가져오기）`,
    warnGitInstallFailed: (id, category) =>
      `[WARN] ${id} git 설치 실패 (${category})`,
    warnGitUsableDespiteError: (id, destPath) =>
      `${id}: git 오류가 있었지만 ${destPath}는 이미 사용 가능 — 성공으로 처리합니다.`,
    gitFailureExitLine: (code) => `git 종료 코드: ${code}`,
    gitFailureProgressNotFinalHint:
      "진행률이 끝난 것처럼 보일 수 있는 이유: 객체 수신 % 이후에 checkout/delta/TLS 단계에서 실패할 수 있습니다. 위 줄이 실제 오류입니다.",
    gitFailureNoStderr:
      "(stderr가 없습니다. 동일 git 명령을 터미널에서 실행해 전체 출력을 확인하세요.)",
    proxyDetected: (url, source) =>
      `git 프록시 설정: ${url}（출처: ${source}）`,
    proxyStrippedHint:
      "루프백 프록시 환경변수가 제거되었습니다. --proxy <url> 또는 META_KIM_GIT_PROXY 환경변수로 프록시를 설정하세요.",
    warnIgnoringLoopbackProxyEnv: (entries) =>
      `설치에서 루프백 프록시 환경변수를 무시했습니다: ${entries.join(", ")}`,
    canonicalMissingWarn: (filePath) =>
      `[sync-runtimes] 누락된 canonical 파일을 건너뜁니다: ${filePath}`,
    syncRuntimesSummaryTitle: "── meta:sync（증분 쓰기 요약）──",
    syncRuntimesSummaryIntro:
      "표시된 개수는 이번 실행에서 변경된 경로입니다. 변경이 없으면 생략됩니다.",
    runtimeGroupClaude: "Claude Code",
    runtimeGroupCodex: "Codex",
    runtimeGroupOpenclaw: "OpenClaw",
    runtimeGroupCursor: "Cursor",
    syncDetailAgents: (count, teamSize) =>
      `${count}/${teamSize}개 에이전트 파일 업데이트됨`,
    syncDetailWorkspaces: (count, teamSize) =>
      `${count}/${teamSize}개 워크스페이스 디렉터리에 변경 있음`,
    syncDetailFiles: (count) => `${count}개 파일 업데이트됨`,
    syncScopeLine: (scope, targets) => `범위: ${scope}  ·  대상: ${targets}`,
    syncInstallManifestOk: (path, entries) =>
      `설치 매니페스트: ${path} (${entries}개 항목)`,
    syncRuntimesCheckStale: "생성된 런타임 자산이 오래되었습니다:",
    syncRuntimesCheckStaleLine: (file) => `- ${file}`,
    syncRuntimesCheckOk: "런타임 자산이 최신입니다.",
    syncRuntimesCheckSourceRepoProjectionAbsent: (count) =>
      `Source repository check passed: project runtime projections are intentionally absent here (${count} generated project file(s) skipped). Run project bootstrap in a target project to materialize project-local assets.`,
    // Reverse mode strings
    reverseModeIntro: "런타임 프로젝션에서 진화 신호 스캔 중...",
    reverseModeNoSignals: "진화 신호가 감지되지 않았습니다. 런타임 프로젝션이 canonical 소스와 일치합니다.",
    reverseModeSignalsFound: (n) => `런타임 프로젝션에서 ${n}개의 진화 신호를 찾았습니다.`,
    reverseModeConflictsDetected: (n) => `⚠ ${n}개의 잠재적 충돌이 감지되었습니다:`,
    reverseModeConflictHint: "(canonical에 콘텐츠가 더 많음 - 동기화되지 않은 변경이 있을 수 있음)",
    reverseModeConflictPrompt: "충돌이 감지되었습니다. --force로 canonical을 덮어쓰거나 변경을 수동으로 검토하세요.",
    reverseModeAborted: "중단됨: 라이트백 전에 충돌을 해결하세요.",
    reverseModeForceProceed: "--force 플래그: 충돌이 있어도 라이트백을 진행합니다.",
    reverseModeSafeWrites: (n) => `canonical에 라이트백하기 안전함(${n}개 파일):`,
    reverseModeDryRun: "드라이런 완료: 파일이 기록되지 않았습니다. --dry-run 없이 변경을 적용하세요.",
    reverseModeWriteFailed: (path, err) => `라이트백 실패 ${path}: ${err}`,
    reverseModeComplete: (n) => `리버스 동기 완료: ${n}개 파일을 canonical/에 씀`,
    reverseModePropagating: "canonical 업데이트를 다른 런타임으로 전파 중...",
    reverseModeValidationFailed: (path) => `${path} 검증 실패, 건너뜀:`,
    proxyFallbackProxy: (label) =>
      `"${label}" 직접 연결 실패, 프록시로 재시도 중...`,
    proxyFallbackProxySuccess: (label) =>
      `"${label}" 프록시 연결 성공. 이 세션은 프록시를 사용합니다.`,
    warnArchiveFallback: (id, category) =>
      `[WARN] ${id} 아카이브 폴백 (${category})`,
    okArchiveInstalled: (path) => `[OK] 아카이브 설치됨 ${path}`,
    warnArchiveFailed: (id, category, reason) =>
      `[WARN] ${id} 아카이브 실패 (${category}): ${reason}`,
    okCloned: (path) => `[OK] 클론됨 ${path}`,
    skipExists: (path) => `존재함 ${path}`,
    okBasename: (name, dest) => `[OK] ${name} -> ${dest}`,
    pluginsHeader: "--- Claude Code 플러그인 (사용자 범위) ---",
    checkingPluginMarketplaces: "플러그인 마켓플레이스 확인 중...",
    warnClaNotFound:
      "claude CLI를 찾을 수 없음 — 플러그인 설치 건너뜀. Claude Code CLI를 설치한 후 --plugins-only를 다시 실행하세요.",
    skipAlreadyInstalled: (name) => `${name} — 이미 설치됨`,
    labelUpToDate: "최신 버전",
    labelCannotCheckGitHub: "GitHub 연결 불가 — 버전 확인 건너뜀",
    labelUsingLocalRecord: (v) => `로컬 레코드 사용：${v}`,
    installingPlugin: (spec) => `플러그인 설치 중：${spec}`,
    updatingPlugin: (spec) => `플러그인 업데이트 중：${spec}`,
    warnPluginFailed: (spec, code) =>
      `[WARN] 플러그인 설치 실패：${spec}（종료 코드 ${code}）`,
    pluginUpdateVersionMismatch: (spec, installedVer, specVer) =>
      `[업데이트] ${spec} 버전 불일치: 설치됨 ${installedVer}, 매니페스트 ${specVer} — 재설치`,
    pluginUpdateUnknownVersion: (spec) =>
      `[업데이트] ${spec} 설치 버전 알 수 없음 — 재설치`,
    pluginUpdated: (spec) => `플러그인 업데이트됨：${spec}`,
    pythonToolsHeader: "--- Python 도구 (선택) ---",
    pythonNotFound: "Python 3.10+ 없음 — graphify 건너뜀.",
    pythonInstallHint:
      "Python 3.10+ 설치 후: pip install graphifyy && python -m graphify claude install",
    skipGraphifyInstalled: (v) => `graphify 이미 설치됨 (${v})`,
    installingGraphify: "graphify 설치 중 (코드 지식 그래프)...",
    installingGraphifySkill: "graphify Claude 스킬 등록 중...",
    okGraphifyInstalled: "graphify 설치 완료, Claude 스킬 등록됨",
    allUpToDate: (label) => `${label} 모두 최신 상태입니다`,
    warnGraphifySkillFailed: "graphify Claude 스킬 등록 실패 (비차단)",
    warnGraphifyPipFailed: "graphify pip 설치 실패 (비차단)",
    skillsHeader: (label, root) => `--- ${label}: ${root} ---`,
    skillsRuntimeSectionClaude: "Claude Code 스킬",
    skillsRuntimeSectionCodex: "Codex 스킬",
    skillsRuntimeSectionOpenclaw: "OpenClaw 스킬",
    skillsRuntimeSectionCursor: "Cursor 스킬",
    failManifestLoad: (err) => `스킬 매니페스트 로드 실패：${err}`,
    skillsFilterUnknown: (id) => `알 수 없는 스킬 id(무시): ${id}`,
    skillsFilterEmpty:
      "선택된 서드파티 스킬 저장소 없음 — 매니페스트 git 설치를 건너뜁니다.",
    skillsFilterNoMatches:
      "일치하는 스킬 id 없음 — config/skills.json 및 --skills / META_KIM_SKILL_IDS를 확인하세요.",
    done: "완료.",
    noteCodexOpenclaw:
      "참고: Codex/Cursor 네이티브 플러그인은 각 호스트의 플러그인 UI에서 설치해야 합니다. 네이티브 진입점이 없는 런타임만 스킬 디렉토리 fallback을 사용합니다.",
    upstreamNativeInstallersHeader: "업스트림 네이티브 설치기",
    pluginBundlesHeader: "플러그인 번들 / 네이티브 플러그인 안내",
    upstreamNativeInstall: (id, runtimeId) =>
      `${id}: ${runtimeId}용 업스트림 네이티브 설치 실행 중`,
    upstreamProjectLocalSkipped: (id, runtimeId, commandText) =>
      `${id}: 전역 업데이트에서는 프로젝트 로컬 설치를 변경하지 않습니다. 각 ${runtimeId} 프로젝트 루트에서 실행하세요: ${commandText}`,
    upstreamCodexConfigPreserveDryRun: (configPath) =>
      `기존 ${configPath}를 보존하고 ECC 업스트림 설치 후 추가 전용 병합으로 복원합니다`,
    upstreamCodexGlobalAgentsPreserveDryRun: (agentsPath) =>
      `${agentsPath}를 ECC 업스트림 설치기로부터 보호합니다. 사용자 내용은 복원하고 전역 ECC baseline은 백업 후 격리합니다`,
    upstreamInstallerFailureReason: (commandText) =>
      `업스트림 설치기 출력을 보려면 ${commandText}를 직접 실행하세요.`,
    codexNativeControlsDryRun: (configPath, requestUserInputFeature) =>
      `${configPath}가 Codex App Browser/Chrome/Computer Use 네이티브 제어([features].${requestUserInputFeature}, [features].js_repl, Windows sandbox/notify, openai-bundled marketplace/plugins)를 보존하는지 확인합니다`,
    codexConfigBackupBeforeEcc: (backupPath) =>
      `ECC 업스트림 설치 전에 Codex 설정을 백업했습니다: ${backupPath}`,
    codexConfigRestoredAfterEcc: (configPath) =>
      `ECC 업스트림 설치 후 사용자 Codex 설정을 추가 전용 병합으로 복원했습니다: ${configPath}`,
    codexGlobalAgentsBackupBeforeEcc: (backupPath) =>
      `ECC 업스트림 설치 전에 Codex 전역 AGENTS.md를 백업했습니다: ${backupPath}`,
    codexGlobalAgentsRestoredAfterEcc: (agentsPath) =>
      `ECC 업스트림 설치 후 사용자 Codex 전역 AGENTS.md를 복원했습니다: ${agentsPath}`,
    codexGlobalAgentsQuarantinedAfterEcc: (agentsPath, backupPath) =>
      `Codex 전역 AGENTS.md의 ECC baseline을 격리했습니다: ${agentsPath}; 백업: ${backupPath}`,
    codexChoiceSurfacePreserved: (configPath) =>
      `Codex choice surface 및 App 네이티브 제어를 보존했습니다: ${configPath}`,
    codexConfigBackupBeforeChoiceSurface: (backupPath) =>
      `choice surface 및 App 네이티브 제어 복원 전에 Codex 설정을 백업했습니다: ${backupPath}`,
    codexChoiceSurfaceRestored: (configPath) =>
      `Codex choice surface, Windows-safe notify 및 App 네이티브 제어를 복원했습니다: ${configPath}`,
    codexNativePluginManualStep: (pluginId) =>
      `Codex 네이티브 플러그인은 수동 단계가 필요합니다: "codex plugin add ${pluginId}@openai-curated"를 실행하거나 /plugins에서 설치하세요.`,
    cursorNativePluginManualStep: (pluginId) =>
      `Cursor 네이티브 플러그인은 수동 단계가 필요합니다: Cursor Agent 채팅에서 /add-plugin ${pluginId}를 실행하거나 Cursor 플러그인 마켓플레이스에서 설치하세요. Cursor CLI는 현재 비대화형 플러그인 설치 명령을 제공하지 않습니다.`,
    codexPluginAlreadyInstalled: (pluginSpec) =>
      `Codex 플러그인 ${pluginSpec} 설치됨`,
    codexNativePluginAutoInstallIncomplete: (pluginSpec) =>
      `선택적 Codex 네이티브 플러그인 자동 설치가 완료되지 않았습니다: codex plugin add ${pluginSpec}. /plugins에서 설치하거나 명령을 다시 실행하세요.`,
    staleClaudePluginRecordRemoved: (skillId, recordKey) =>
      `${skillId}: 오래된 Claude 플러그인 레코드 ${recordKey} 제거 중`,
    graphifyInstallSkippedGuideExists: (platformName) =>
      `graphify ${platformName} install 건너뜀(가이드에 Graphify 섹션이 이미 있음)`,
    usingActiveVenv: (venvPath) => `활성 venv 사용: ${venvPath}`,
    venvTooOldFallback: (venvPath, versionText) =>
      `venv "${venvPath}"는 ${versionText}입니다(3.10+ 필요). 시스템 Python으로 전환합니다.`,
    activeTargets: (targets) => `활성 런타임 대상：${targets.join(", ")}`,
    metaKimRoot: (root) => `Meta_Kim 저장소 (정본 소스 루트)：${root}`,
    logSaved: (path) => `전체 로그 저장 위치：${path}`,
    warnManifestMissing: "스킬 매니페스트 누락 — 설치할 스킬이 없습니다",
    warnRepairLegacyLayout: (id, dir) =>
      `레거시 설치 레이아웃 복구 중 ${id}：${dir}`,
    warnRepairLegacySharedRoot: (dir) =>
      `공유 루트의 레거시 전체 클론 복구 중：${dir}`,
    warnRemovingObsoleteDir:
      "이전 버전 Meta_Kim이 남긴 구식 디렉토리 제거 중：",
    warnNestedCopyNotUsed: (runtimeId) =>
      `이 중첩 복사본은 ${runtimeId}에서 사용되지 않으며 안전하게 제거할 수 있습니다.`,
    warnPre2Artifact: "2.0 이전 설치 아티팩트, 더 이상 필요하지 않습니다.",
    okRemovedObsolete: (n) =>
      `이전 버전 Meta_Kim이 남긴 구식 디렉토리 ${n}개를 제거했습니다.`,
    noteSettingsNotAffected: "현재 설정, 스킬 및 훅은 영향을 받지 않습니다.",
    warnQuarantineDryRun: (id, detail) =>
      `${id}：관리 설치 내 무효한 SKILL.md 격리 예정（${detail}）`,
    warnQuarantined: (id, detail) =>
      `${id}：관리 설치 내 무효한 SKILL.md 격리 완료（${detail}）`,
    warnReplaceFailed: (id, dir, msg) =>
      `${id}：기존 설치 교체 실패 ${dir}：${msg}`,
    warnLegacyNameRemoved: (skillId, legacyName, dir) =>
      `${skillId}：레거시 "${legacyName}" 제거됨 ${dir} (스킬 이름 변경)`,
    warnDisabledResidueRemoved: (skillId, dir) =>
      `${skillId}：오래된 .disabled/ 잔여물 제거됨 ${dir}`,
    summaryInstallFailures: (n) => `설치 실패（${n}）：`,
    summaryArchiveFallbacks: (n) => `아카이브 폴백 사용（${n}）：`,
    summaryArchiveFallbackLine: (id, category) =>
      `${id} 아카이브 폴백 사용 (${category})`,
    summaryArchiveFallbackScopeNote:
      "위에 나열된 항목만 git clone 실패 후 tarball을 사용했습니다. 같은 단계에서「캐시로 가져옴」이 표시된 다른 스킬은 git만 사용했으며 여기에 포함되지 않습니다.",
    summaryRepairedOrFlagged: (n) =>
      `Meta_Kim 관리 레거시 설치 복구/플래그（${n}）：`,
    summaryQuarantined: (n) =>
      `Meta_Kim 관리 설치 내 무효한 중첩 SKILL.md 파일 격리（${n}）：`,
    failureHint_tls_transport:
      "TLS/SSL 연결 실패 — 네트워크, 프록시 또는 VPN 설정을 확인하세요",
    failureHint_repo_not_found:
      "저장소를 찾을 수 없음 — config/skills.json을 확인하세요",
    failureHint_auth_required: "인증 필요 — 저장소가 비공개일 수 있습니다",
    failureHint_subdir_missing:
      "하위 디렉토리를 찾을 수 없음 — 저장소 구조가 변경되었을 수 있습니다",
    failureHint_proxy_network:
      "네트워크 연결 실패 — --proxy <url> 또는 META_KIM_GIT_PROXY 환경변수를 설정한 후 다시 시도하세요",
    failureHint_permission_denied:
      "권한 거부 — 홈 디렉토리 쓰기 권한을 확인하세요",
    failureHint_missing_runtime:
      "런타임 누락 — git이 설치되어 있고 PATH에 있는지 확인하세요",
    failureHint_unknown:
      "알 수 없는 오류 — 위의 세부 정보를 확인하거나 --update로 재시도하세요",
    failureSuggestions: "제안：",
    stagingHeaderParallel: "1단계: 임시 캐시에 스킬 저장소 병렬 가져오기",
    stagingExplainParallel: (cacheDir) =>
      `이 단계 설명:\n• 캐시 폴더(프로젝트 저장소 아님): ${cacheDir}\n• 먼저 각 upstream을 여기로 clone(여러 런타임이어도 1회만).\n• 2단계에서 선택한 각 런타임 skills 경로로 복사합니다(~/.claude/skills 등).\n• 끝나면 이 임시 폴더는 삭제됩니다.`,
    cloneStarting: (id) => `${id} 가져오는 중…`,
    cloneProgressLine: (id, curStr, totStr, pct, curObj, totObj) =>
      `[${id}] ${curStr} / ~${totStr} · ${pct}% · 객체 ${curObj}/${totObj}`,
    cloneProgressLinePartial: (id, curStr) =>
      `[${id}] ${curStr} 수신 중(총량 추정 중…)`,
    okStaged: (id) => `캐시 준비 완료: ${id}`,
    okStagedSubdir: (id, subdir) => `캐시 준비 완료: ${id}（${subdir}）`,
    warnStaleStagingResidual: "이전 설치 실행에서 남은 임시 스테이징 디렉토리.",
    okRemovedStagingResidual: (n) =>
      `${n}개의 잔여 스테이징 디렉토리를 정리했습니다.`,
    warnStagingLocked: (dir) =>
      `Windows EBUSY(디렉터리 사용 중) — 삭제 실패: ${dir}. 탐색기, 백신/인덱서, 다른 프로세스가 경로를 잡고 있을 수 있습니다. ~/.openclaw/skills 등을 사용 중인 앱을 닫고 재시도하세요. 설치는 성공했을 수 있으며, 잠금 해제 후 *.staged-* 폴더는 수동 삭제해도 됩니다.`,
    pythonToolsOptionalHeader: "--- Python 도구 (선택) ---",
    pythonNotFoundGraphify: "Python 3.10+ 없음 — graphify 건너뜀.",
    pythonInstallHintGraphify:
      "Python 3.10+ 설치 후: pip install graphifyy && python -m graphify claude install",
    val: {
      headerTitle: "Meta_Kim 프로젝트 무결성 검사",
      step01: "필수 파일 확인",
      step01Detail:
        "README.md, CLAUDE.md, package.json, 동기화 manifest, canonical sources, 로컬 상태 규칙",
      step01Pass: "모든 필수 커널 파일이 존재합니다",
      step02: "단계 품질 컨트랙트 검증",
      step02Detail:
        "Critical, Fetch, Thinking, worker packets, Review gates",
      step02Pass: "단계 품질 컨트랙트가 유효합니다",
      step03: "동기화 manifest 검증",
      step03Detail:
        "supportedTargets, defaultTargets, availableTargets, generatedTargets",
      step03Pass: "동기화 manifest와 런타임 대상 카탈로그가 정합합니다",
      step04: "canonical 에이전트 정의 검증",
      step04Detail: "frontmatter 완전성 + 금지 마커 검사 + 경계 규율",
      step04Pass: (n, names) => `${n}개 에이전트 합격: ${names.join(", ")}`,
      step05: "canonical SKILL.md 확인",
      step05Detail: "규범 메타데이터, station deliverable 마커, references",
      step05Pass: "Canonical meta-theory 스킬 패키지가 유효합니다",
      step06: "Skills manifest 확인",
      step06Detail: "스킬 능력과 플랫폼 지원 메타데이터",
      step06Pass: "Skills manifest가 유효합니다",
      step07: "canonical capability index 확인",
      step07Detail: "source, mirrors, fetch order, canonical coverage",
      step07Pass: "Capability index source와 mirror가 유효합니다",
      footerAll: (n) => `전체 ${n}개 검사 합격`,
      footerAgents: (n) => `${n}개 에이전트 준비됨`,
      valFailed: "검증 실패!",
      agentsReady: "개 에이전트 준비됨",
    },
  },
};

const REPORT_STRINGS = {
  en: {
    htmlLang: "en",
    toolNames: FORMAL_TOOL_NAMES,
    toolProfiles: AGENT_PROJECTION_PROFILES,
    toolList: (tools) => tools.join("/"),
    runtimeProbePlaybookTitle: (tools) => `${tools} tool probe playbook`,
    runtimeLiveShardMatrixTitle: (tools) => `${tools} live shard matrix`,
    githubGapReportTitle: "Meta_Kim GitHub Gap Report",
    governedExecutionReportTitle: "Meta-Theory Governed Execution Report",
    panelTitle: "Meta_Kim Run Panel",
    generatedAt: "generatedAt",
    source: "source",
    status: "status",
    task: "Task",
    inputTask: "Input task",
    variantCount: "variantCount",
    releaseGradeCandidateCount: "releaseGradeCandidateCount",
    releaseGradeComplete: "releaseGrade",
    runId: "Run ID",
    runState: "Run state",
    aheadOfOriginMain: "aheadOfOriginMain",
    hasWorkingTreeDelta: "hasWorkingTreeDelta",
    gitDeltaState: "gitDeltaState",
    prdVersion: "prdVersion",
    localCommitsNotOnOriginMain: "Local commits not on origin/main",
    workingTreeDelta: "Working tree delta",
    currentGithubDeltaFromPrd: "Current GitHub delta from PRD",
    blockedOrNotDone: "Primary release gaps or not done",
    compatibilityFollowUp: "Compatibility follow-up",
    releaseBoundary: "Release boundary",
    cannotClaimGithubComplete: "cannotClaimGithubComplete",
    cannotClaimAllToolCompatibility: "cannotClaimAllToolCompatibility",
    completedParallelBacklogEvidence: "Completed parallel backlog evidence",
    missing: "(missing)",
    capabilityGaps: "Capability gaps",
    workerTasks: "Worker tasks",
    synthesisOwner: "Synthesis owner",
    tool: "Tool",
    role: "Role",
    owner: "Owner",
    agent: "Agent",
    skill: "Skill",
    mcp: "MCP",
    gap: "Gap",
    decision: "Decision",
    reason: "Reason",
    blocked: "Blocked",
    workerTask: "WorkerTask",
    candidate: "Candidate",
    branch: "Branch",
    type: "Type",
    target: "Target",
    dryRunWrites: "Dry-run writes",
    verification: "Verification",
    entry: "Entry",
    taskScope: "Task scope",
    parallelGroup: "Parallel group",
    mergeOwner: "Merge owner",
    acceptance: "Acceptance",
    canonicalWrites: "Canonical writes",
    environment: "Environment",
    shardGroup: "Shard group",
    expectedClass: "Expected class",
    evidenceKind: "Evidence kind",
    failureClass: "Failure class",
    releaseGrade: "Release-grade",
    releaseGradeCandidate: "Release-grade candidate",
    remainingAction: "Remaining action",
    commands: "Commands",
    fixtureOnly: "Fixture only",
    approvalRequired: "approvalRequired",
    approvalValidation: "approvalValidation",
    dryRunCanonicalWrites: "dryRun canonicalWrites",
    orchestrationReview: "orchestration review",
    writeback: "writeback",
    decisionRuns: "decision runs",
    none: "none",
    notRun: "not-run",
    plainLanguageSummary:
      "This run first decides which capability is missing, then hands next work to the right owner while keeping blocker, approval, and verification evidence.",
    conversationNotice: {
      title: "Meta_Kim notice",
      stageProgress: "Stage progress",
      stageProgressDetail:
        "Critical, Fetch, Thinking, Execution, and Review are being surfaced as compact progress.",
      route: "Capability route",
      routeDetail: (count) =>
        `Interpreted the natural-language request and checked ${count} capability type(s).`,
      handoff: "Owner handoff",
      handoffDetail: (count, owner, lanes = "") =>
        lanes
          ? `${owner} prepared ${count} worker handoff(s) from the user's short request: ${lanes}.`
          : `${owner} prepared ${count} worker handoff(s) from the user's short request.`,
      verification: "Verification",
      verificationDetail: (status) =>
        `Current verification status is ${status}; internal artifacts stay separate from what users see.`,
    },
    userExperienceNotice: {
      title: "User Experience Notice",
      primarySurface: "Primary surface",
      expectationLabel: "User expectation",
      boundaryLabel: "Accuracy boundary",
      mustNotClaimLabel: "Must not claim",
      emissionEvidenceLabel: "Conversation notice evidence",
      signal: "User-visible signal",
      internalOnly: "Internal evidence only",
      internalOnlySummary:
        "Machine-readable audit packets are retained internally; this report shows plain-language summaries instead of field names.",
      partialStatusReason:
        "The readable report is generated, but no runtime conversation notice is emitted by this script yet.",
      emittedStatusReason: (channel, adapter, hash) =>
        `A localized conversation notice was emitted through ${channel} by ${adapter}; textSha256=${hash}.`,
      expectation:
        "The user should receive compact progress, route, owner, blocker, and verification notices from ordinary language, without knowing internal commands or technical loadout terms.",
      accuracyBoundary:
        "Command output and JSON artifacts are supporting evidence; they are not a completed user experience unless surfaced through the runtime notice or readable report.",
      mustNotClaim:
        "Do not claim the orchestration is fully experienced by users when it only exists as an internal artifact.",
      signals: {
        stageProgress: {
          label: "Stage progress",
          detail: "Show the current stage, completed stages, next step, and blocker in localized plain language.",
        },
        routeSummary: (count) => ({
          label: "Capability route",
          detail: `Summarize the ${count} checked capability types as counts and top candidates, not raw packet dumps.`,
        }),
        ownerHandoff: (count) => ({
          label: "Owner handoff",
          detail: `Show ${count} worker task owner(s), scope, merge owner, and verification owner when work is split.`,
        }),
        verification: (status) => ({
          label: "Verification boundary",
          detail: `Show verification status ${status} and keep smoke, internal, blocked, and live evidence separate.`,
        }),
      },
    },
    stageOperationPlan: {
      title: "Stage Operation Plan",
      executionTitle: "Execution Orchestration Detail",
      stage: "Stage",
      whatHappens: "What happens",
      uses: "Uses",
      outputShape: "Output shape",
      resultReport: "Result report",
      nextWork: "Next work",
      order: "Order",
      does: "Does",
      notRequired: "not required",
      mcpProviderBoundary: "MCP provider boundary",
      noExecutionTasks: "No execution worker task was required.",
      executionResult: (count) =>
        `Execution runs ${count} worker task(s), reports each result, then hands the run to Review.`,
      workerDoes: (output, gapId) =>
        `Produce ${output} for ${gapId}, using the chosen owner loadout.`,
      workerResult: (output) =>
        `Briefly report that ${output} is review-ready and attach decision, acceptance, and verification evidence.`,
      workerNext: (handoffTarget, parallelGroup) =>
        `${handoffTarget} merges ${parallelGroup} and starts the next queued item.`,
      outputs: {
        critical: (count) => `${count} success criteria plus real-goal and non-goal boundaries.`,
        fetch: (capabilityCount, sourceCount) =>
          `${capabilityCount} capability types checked from ${sourceCount} source group(s).`,
        thinking: (mode, workerCount) =>
          `${mode}; ${workerCount} worker task(s) with owners and merge path.`,
        execution: (workerCount) => `${workerCount} ordered worker result report(s).`,
        review: (checkCount) => `${checkCount} upstream and result-quality checks.`,
      },
      results: {
        critical: "The run is allowed to gather evidence because the goal and non-goals are bounded.",
        fetch: "Fetch is complete enough to choose a route; capability discovery is not skill-only.",
        thinking: "The route, owners, loadout, merge owner, and verification owner are selected.",
        review: (reviewStatus, runtimeStatus) =>
          `Review status=${reviewStatus}; verification evidence status=${runtimeStatus}.`,
      },
      stages: {
        critical: {
          uses: "meta-theory skill and Warden entry gate",
          whatHappens:
            "Lock the real outcome, success standard, non-goals, and permission boundary before evidence gathering.",
        },
        fetch: {
          uses: "local source reads, capability inventory, retrieval readiness check",
          whatHappens:
            "Read local sources, collect evidence, and check capability types before route design.",
        },
        thinking: {
          uses: "dispatch board, GapDecision kernel, worker task packets",
          whatHappens:
            "Choose the route, owner, loadout, merge owner, and verification owner.",
        },
        execution: {
          uses: "selected agent, skill, MCP boundary, and command per task",
          whatHappens:
            "Run the selected worker tasks with their bound agent, skill, MCP, and command loadout.",
        },
        review: {
          uses: "meta-theory review checks",
          whatHappens:
            "Check upstream Critical/Fetch/Thinking quality and whether execution results satisfy the boundary.",
        },
      },
    },
    stageSummaryTitle: "Critical / Fetch / Thinking / Review",
    stageSummaries: {
      critical: (toolList) =>
        `Critical: lock the real goal, success standard, and non-goals for the formal tool targets: ${toolList}.`,
      fetch: (count) =>
        `Fetch: the capability route is not skill-only; checked ${count} capability types including agent, skill, command/script, MCP/tool, runtime tool, plugin, retrieval, dependency, and worker task.`,
      thinking: (mode, mergeOwner) =>
        `Thinking: ${mode}, mergeOwner=${mergeOwner}; create_agent routes must deliver a durable abstract project agent or candidate writeback.`,
      review: (toolList) =>
        `Review: verify that Critical/Fetch/Thinking really exist, temporary subagents were not promoted into durable agents, and ${toolList} projection goals are preserved.`,
    },
    capabilityRouteTitle: "Capability Route",
    capabilityType: "Capability Type",
    routeImpact: "Route Impact",
    cardPlanTitle: "Card Dealing",
    cardPlanSummary: (eventCount, cardTypeCount, pauseRule) =>
      `Card plan: ${eventCount} card events across ${cardTypeCount} card types; ${pauseRule}.`,
    cardDealer: "Dealer",
    card: "Card",
    cardShell: "Shell",
    cardWhy: "Why now",
    cardNames: {
      clarify: "Clarify",
      "shrink-scope": "Shrink scope",
      options: "Options",
      risk: "Risk",
      execute: "Execute",
      verify: "Verify",
      fix: "Fix",
      rollback: "Rollback",
      nudge: "Nudge",
      pause: "Pause",
    },
    cardVisibleSummary: {
      sectionTitle: "User-visible card summary",
      signalLabel: "Card dealing summary",
      userFocusLabel: "User focus cards",
      riskInserted: "Risk inserted",
      riskNotTriggered: "Risk not triggered",
      pauseTriggered: "Pause triggered",
      pauseNotTriggered: "Pause not triggered",
      nativeChoiceBoundary:
        "This is a chat/report summary, not native choice popup proof.",
      dealtLine: ({ eventCount, cardTypeCount, activeCards }) =>
        `Card dealing: ${eventCount} card events across ${cardTypeCount} card types: ${activeCards}.`,
      inactiveLine: ({ inactiveCards }) => `Inactive this round: ${inactiveCards}.`,
      userLine: ({ userCards, interruptCards, riskState, pauseState }) =>
        `User-relevant: ${userCards}; interrupts: ${interruptCards}; ${riskState}; ${pauseState}`,
      progressSectionTitle: "In-run card dealing",
      progressStageLine: ({ stage }) => `${stage} in progress`,
      progressDealLine: ({ discovery, cardName, repeatNote }) =>
        `Card dealt: found ${discovery}; triggered ${cardName} card${repeatNote ? ` (${repeatNote})` : ""}.`,
      repeatEventNote: ({ repeatOrdinal, repeatReason }) =>
        `repeat #${repeatOrdinal}, ${repeatReason}`,
      progressDiscoveries: {
        clarify: "the goal or acceptance boundary may change the route",
        "shrink-scope": "the route has multiple lanes and needs a tighter boundary",
        options: "more than one viable path exists",
        risk: "runtime or external-platform risk can preempt execution",
        execute: "owner, route, and verification are ready for bounded work",
        verify: "fresh proof is needed before claiming completion",
        fix: "review or verification found a bounded repair point",
        rollback: "risk may exceed the approved boundary",
        nudge: "the user needs one compact next action",
        pause: "the run needs a digest or decision window",
        default: "a route-changing signal appeared",
      },
      repeatPolicy:
        "Card types are dynamic signals; the same card type can be dealt repeatedly across stages.",
      nextLine:
        "Next: read the user-relevant cards first, then check whether risk or pause changed the route.",
    },
    businessPhasePlanTitle: "11-phase Business Workflow",
    businessPhaseSummary: (count) => `${count} business phases are recorded for packaging and closure.`,
    phase: "Phase",
    mapsToSpine: "Maps to spine",
    evidence: "Evidence",
    spineRelationship: "Spine relationship",
    durableAgentPolicyTitle: "Durable Agent Policy",
    durableAgentPolicyBullets: (profiles) => [
      "The final deliverable for create_agent / iterate_agent is a durable abstract project agent definition or candidate writeback, not a temporary worker prompt.",
      ...profiles.map((profile) => `${profile.label} projection target: \`${profile.agentPath}\`.`),
      "Projection status follows the compatibility catalog; partial or needs_probe targets are preserved without being overclaimed.",
      "Runtime-generated aliases are metadata only; they never replace `roleDisplayName` or durable `ownerAgent`.",
    ],
    boolean: (value) => (value ? "yes" : "no"),
    statusValue: (status) => {
      if (status === true || status === "pass" || status === "smoke_pass") return "pass";
      if (status === "blocked") return "blocked";
      if (status === "partial") return "partial";
      return String(status ?? "unknown");
    },
    deliverableLinks: {
      readabilityReview: "Readability review",
      rubricMarkdown: "AI-readable rubric Markdown",
      rubricJson: "AI-readable rubric JSON",
      casePack: "AI-readable case pack",
    },
    readability: {
      title: "Meta_Kim Run Readability Review",
      conclusionHeading: "Review Conclusion",
      conclusionBody:
        "PASS. The report may keep machine fields, but the user's first view should show business-readable labels, owner, blockers, and next actions without requiring protocol knowledge.",
      fieldTranslationHeading: "Field Translation Table",
      tableHeaders: {
        field: "Machine field",
        humanLabel: "Human label",
        meaning: "What the user should understand",
        pageTreatment: "Page treatment",
      },
      pageTreatment: "Keep the machine field, but prioritize the localized user-facing label on the page",
      fieldMeanings: {
        decisionSummary: "Tells the user why this decision was made.",
        ownerHandoff:
          "Tells the user each worker's owner, scope, parallel group, and acceptance owner.",
        blockedReasons:
          "Tells the user what cannot continue and which stage needs more evidence.",
        toolEvidence: "Separates live, smoke, unsupported, and release-grade evidence.",
        approvalRequest: "Explains whether canonical writeback needs Warden approval.",
        aiReadableRubric:
          "Turns design, execution, acceptance, feedback, and deliverables into scorable questions.",
        deliverables: "Lists files the user and system can inspect again.",
      },
      beforeAfterHeading: "Before / After",
      sourceContractEntry: "Source contract entry",
      visibleEntryPrefix: "User-visible entries",
      acceptanceHeading: "Acceptance Notes",
      gapCount: "Gap count",
      workerCount: "Worker count",
      toolEvidenceCount: "Tool evidence count",
      canonicalDryRunWriteCount: "Canonical dry-run write count",
      returnIfCannotExplain:
        "If a reviewer cannot explain why, who owns next, what is blocked, and how to verify from these labels, return this item to P-013.",
    },
    rubric: {
      title: "Meta_Kim AI-Readable Rubric",
      scoringIntro:
        "Scoring scale: pass / retry / fail. Score the run artifact, report, panel, and case pack evidence rather than the chat summary.",
      scoringScale: {
        pass: "Evidence is sufficient for an external reviewer to restate the decision and acceptance basis.",
        retry: "Evidence exists but is incomplete; supplement the report, owner, or verification fields.",
        fail: "No inspectable evidence exists, or a chat summary is presented as product delivery.",
      },
      humanQuestion: "Plain-language question",
      passStandard: "Pass standard",
      failStandard: "Fail standard",
      evidencePath: "Evidence path",
      reviewerScore: "Reviewer score",
      reviewerNotes: "Reviewer notes",
      pending: "pending",
    },
    casePack: {
      title: "Meta_Kim AI-Readable Case Pack",
      reviewerShouldSeeHeading: "What the reviewer should see",
      reviewerShouldSeeIntro: (summary) =>
        `The reviewer should first see a one-sentence goal: ${summary}`,
      reviewerShouldSeeThen: (toolEvidenceLabel) =>
        `Then they should see what the task was, how many capabilities were missing, how the work was split, who owns each worker, and which ${toolEvidenceLabel} is still smoke or blocked.`,
      reviewerScoringHeading: "How the reviewer scores",
      reviewerScoringBody: (rubricMarkdown, rubricJson) =>
        `The reviewer scores five dimensions: design, execution, acceptance, feedback, and deliverables. See \`${rubricMarkdown}\` and \`${rubricJson}\`.`,
      designEvidenceHeading: "Design Evidence",
      executionEvidenceHeading: "Execution Evidence",
      acceptanceEvidenceHeading: "Acceptance Evidence",
      feedbackEvidenceHeading: "Feedback Evidence",
      passFailExamplesHeading: "Pass / Fail Examples",
      taskLabel: "Task",
      synthesisOwnerLabel: "Synthesis owner",
      wardenApprovalRequired: "Warden approval required",
      canonicalDryRunWrites: "Canonical dry-run writes",
      staticPanel: "Static panel",
      readabilityReview: "Readability review",
      rubricMarkdown: "Rubric Markdown",
      rubricJson: "Rubric JSON",
      manifest: "Manifest",
      passExample:
        "Pass: the reviewer can explain why, who owns next, what is blocked, why canonical writeback still needs Warden approval, and which tool evidence cannot count as release-grade live pass.",
      failExample:
        "Fail: only a chat summary, only raw JSON, local absolute path leaks, or a P-012 page presented as the P-014 rubric / P-023 case pack.",
    },
    productTasks: [
      {
        id: "P-012",
        label: "Web/UI product panel prototype",
        evidence: "run-panel.html reads artifact.runReportPanelContract by runId.",
      },
      {
        id: "P-013",
        label: "Report readability review",
        evidence: "readability-review.zh-CN.md maps protocol fields to user-facing labels.",
      },
      {
        id: "P-014",
        label: "AI-readable rubric export",
        evidence: "ai-readable-rubric.zh-CN.md and ai-readable-rubric.json export five criteria.",
      },
      {
        id: "P-023",
        label: "AI-readable case pack",
        evidence: "ai-readable-case-pack.zh-CN.md shows reviewer view, reviewer scoring, pass/fail evidence.",
      },
    ],
    sections: {
      decisionSummary: "Decision summary",
      whyDecision: "Why this decision",
      ownerHandoff: "Who owns next",
      blockedApproval: "Blockers and approval",
      toolEvidenceShort: "Tool evidence",
      toolEvidenceFull: (tools) => `${tools} tool mirror evidence`,
      aiReadableRubric: "AI-readable scoring standard",
      deliverables: "Deliverables",
      capabilityUpgrade: "Long-term capability upgrades",
      wardenApproval: "Warden approval packet",
      verificationStatus: "Verification status",
    },
  },
  "zh-CN": {
    htmlLang: "zh-CN",
    toolNames: FORMAL_TOOL_NAMES,
    toolProfiles: AGENT_PROJECTION_PROFILES,
    toolList: (tools) => tools.join("/"),
    runtimeProbePlaybookTitle: (tools) => `${tools} 工具端探测手册`,
    runtimeLiveShardMatrixTitle: (tools) => `${tools} Live 分片矩阵`,
    githubGapReportTitle: "Meta_Kim GitHub 差距报告",
    governedExecutionReportTitle: "Meta-Theory 治理执行报告",
    panelTitle: "Meta_Kim 运行面板",
    generatedAt: "生成时间",
    source: "来源",
    status: "状态",
    branch: "分支",
    task: "任务",
    inputTask: "输入任务",
    variantCount: "探测变体数",
    releaseGradeCandidateCount: "可作为发布级证据候选",
    releaseGradeComplete: "发布级证据是否完整",
    runId: "运行 ID",
    runState: "运行状态",
    aheadOfOriginMain: "领先 origin/main",
    hasWorkingTreeDelta: "工作区是否有改动",
    gitDeltaState: "Git 差异状态",
    prdVersion: "PRD 版本",
    localCommitsNotOnOriginMain: "本地未进入 origin/main 的提交",
    workingTreeDelta: "工作区改动",
    currentGithubDeltaFromPrd: "PRD 中记录的当前 GitHub 差距",
    blockedOrNotDone: "主发布差距或未完成",
    compatibilityFollowUp: "兼容后续项",
    releaseBoundary: "发布边界",
    cannotClaimGithubComplete: "不能宣称 GitHub 完成",
    cannotClaimAllToolCompatibility: "不能宣称全工具端兼容完成",
    completedParallelBacklogEvidence: "已完成并行 backlog 证据",
    missing: "（缺失）",
    capabilityGaps: "能力缺口",
    workerTasks: "Worker 任务",
    synthesisOwner: "合成负责人",
    tool: "工具端",
    role: "角色",
    owner: "负责人",
    agent: "Agent",
    skill: "Skill",
    mcp: "MCP",
    gap: "缺口",
    decision: "判定",
    reason: "理由",
    blocked: "是否阻塞",
    workerTask: "Worker 任务",
    candidate: "候选",
    type: "类型",
    target: "目标",
    dryRunWrites: "dry-run 写入",
    verification: "验证",
    entry: "入口",
    taskScope: "任务范围",
    parallelGroup: "并行组",
    mergeOwner: "合并",
    acceptance: "验收",
    canonicalWrites: "Canonical 写入",
    environment: "环境",
    shardGroup: "分片组",
    expectedClass: "预期结果类",
    evidenceKind: "证据类型",
    failureClass: "失败类",
    releaseGrade: "发布级",
    releaseGradeCandidate: "可作为发布级证据候选",
    remainingAction: "下一步",
    commands: "命令",
    fixtureOnly: "仅 fixture",
    approvalRequired: "是否需要审批",
    approvalValidation: "审批验证",
    dryRunCanonicalWrites: "dry-run canonical 写入",
    orchestrationReview: "编排 review",
    writeback: "写回",
    decisionRuns: "决策运行数",
    none: "none",
    notRun: "not-run",
    plainLanguageSummary:
      "本次运行先判断缺什么能力，再把下一步交给合适 owner，并保留阻塞、审批和验证证据。",
    conversationNotice: {
      title: "Meta_Kim 对话提示",
      stageProgress: "阶段进度",
      stageProgressDetail:
        "Critical、Fetch、Thinking、Execution、Review 会被压缩成用户能看懂的简短进度。",
      route: "能力路线",
      routeDetail: (count) =>
        `已把许愿式自然语言需求转成路线，并检查 ${count} 类能力。`,
      handoff: "Owner 交接",
      handoffDetail: (count, owner, lanes = "") =>
        lanes
          ? `${owner} 已从用户短句准备 ${count} 个 worker 交接：${lanes}。`
          : `${owner} 已从用户短句准备 ${count} 个 worker 交接。`,
      verification: "验证",
      verificationDetail: (status) =>
        `当前验证状态是 ${status}；内部 artifact 不等于用户已看见的内容。`,
    },
    userExperienceNotice: {
      title: "用户体验提示",
      primarySurface: "主要呈现面",
      expectationLabel: "用户预期",
      boundaryLabel: "准确性边界",
      mustNotClaimLabel: "不能声称",
      emissionEvidenceLabel: "conversation notice 发射证据",
      signal: "用户可见信号",
      internalOnly: "仅内部证据",
      internalOnlySummary:
        "机器可审计 packet 仍在内部保留；这份报告只展示人话摘要，不列内部字段名。",
      partialStatusReason:
        "可读报告已生成，但这个脚本还没有发出 runtime conversation notice。",
      emittedStatusReason: (channel, adapter, hash) =>
        `本地化 conversation notice 已通过 ${channel} 由 ${adapter} 发出；textSha256=${hash}。`,
      expectation:
        "用户只用普通自然语言输入，也应该能看到简洁的进度、路线、owner、阻塞和验证提示，不需要知道内部命令或技术 loadout 名称。",
      accuracyBoundary:
        "命令输出和 JSON artifact 只是支撑证据；只有被运行时 notice 或可读报告呈现出来，才算用户可体验内容。",
      mustNotClaim:
        "如果编排只存在于内部 artifact 中，不要声称用户已经完整体验到编排。",
      signals: {
        stageProgress: {
          label: "阶段进度",
          detail: "用本地化人话显示当前阶段、已完成阶段、下一步和阻塞项。",
        },
        routeSummary: (count) => ({
          label: "能力路线",
          detail: `把已检查的 ${count} 类能力压缩成数量和 top candidates，不倾倒原始 packet。`,
        }),
        ownerHandoff: (count) => ({
          label: "Owner 交接",
          detail: `拆分工作时显示 ${count} 个 worker task 的 owner、范围、合并 owner 和验证 owner。`,
        }),
        verification: (status) => ({
          label: "验证边界",
          detail: `显示验证状态 ${status}，并区分 smoke、internal、blocked 和 live 证据。`,
        }),
      },
    },
    stageOperationPlan: {
      title: "阶段执行说明",
      executionTitle: "执行编排明细",
      stage: "阶段",
      whatHappens: "要做什么",
      uses: "使用什么",
      outputShape: "结果长什么样",
      resultReport: "完成后报告",
      nextWork: "下一项工作",
      order: "顺序",
      does: "做的事情",
      notRequired: "不需要",
      mcpProviderBoundary: "MCP provider 边界",
      noExecutionTasks: "本次不需要执行 worker 任务。",
      executionResult: (count) =>
        `执行阶段会运行 ${count} 个 worker 任务，逐项报告结果，然后交给 Review。`,
      workerDoes: (output, gapId) =>
        `为 ${gapId} 产出 ${output}，并使用 Thinking 选定的 owner loadout。`,
      workerResult: (output) =>
        `简要报告 ${output} 已可进入 review，并附上判定、验收和验证证据。`,
      workerNext: (handoffTarget, parallelGroup) =>
        `${handoffTarget} 合并 ${parallelGroup}，然后开始下一项工作。`,
      outputs: {
        critical: (count) => `${count} 条成功标准，加上真实目标和非目标边界。`,
        fetch: (capabilityCount, sourceCount) =>
          `从 ${sourceCount} 组来源检查 ${capabilityCount} 类能力。`,
        thinking: (mode, workerCount) =>
          `${mode === "factory_then_dispatch" ? "先准备候选能力再分派" : "直接分派"}；${workerCount} 个 worker 任务，包含 owner 和合并路径。`,
        execution: (workerCount) => `${workerCount} 份按顺序输出的 worker 简报。`,
        review: (checkCount) => `${checkCount} 项上游质量和结果质量检查。`,
      },
      results: {
        critical: "真实目标和非目标已经收束，可以进入证据收集。",
        fetch: "Fetch 证据足以进入路线选择；能力发现没有退化成 skill-only。",
        thinking: "路线、owner、loadout、合并 owner 和验证 owner 已选定。",
        review: (reviewStatus, runtimeStatus) =>
          `Review 状态=${reviewStatus}；验证证据状态=${runtimeStatus}。`,
      },
      stages: {
        critical: {
          uses: "meta-theory skill 和 Warden 入口",
          whatHappens:
            "先锁定真实目标、成功标准、非目标和权限边界，再进入证据收集。",
        },
        fetch: {
          uses: "本地来源读取、能力清单、retrieval readiness 检查",
          whatHappens:
            "读取本地来源，收集证据，并在设计路线前检查各类能力。",
        },
        thinking: {
          uses: "路线选择板、能力缺口判定内核、worker 任务简报",
          whatHappens:
            "选择路线、owner、loadout、合并 owner 和验证 owner。",
        },
        execution: {
          uses: "每个任务选定的 agent、skill、MCP 边界和 command",
          whatHappens:
            "按 Thinking 的编排运行 worker 任务，明确每项用哪个 agent、skill、MCP 和 command。",
        },
        review: {
          uses: "meta-theory review checks",
          whatHappens:
            "检查 Critical/Fetch/Thinking 是否够好，以及执行结果是否满足边界。",
        },
      },
    },
    stageSummaryTitle: "Critical / Fetch / Thinking / Review",
    stageSummaries: {
      critical: (toolList) =>
        `Critical：锁定真实目标、成功标准、非目标；正式工具端目标是 ${toolList}。`,
    fetch: (count) =>
        `Fetch：收集证据和能力来源；能力路线不是 skill-only，已检查 ${count} 类能力，包括 agent、skill、command/script、MCP/tool、工具端工具、plugin、retrieval、dependency 和 worker task。`,
      thinking: (mode, mergeOwner) =>
        `Thinking：选择路线和 owner；${mode}，mergeOwner=${mergeOwner}；create_agent 路线必须交付项目内可保留抽象 agent。`,
      review: (toolList) =>
        `Review：审查质量与边界；检查 Critical/Fetch/Thinking 是否真实存在、是否把临时 subagent 当成持久 agent、是否保留 ${toolList} 工具端投影目标。`,
    },
    capabilityRouteTitle: "能力路线",
    capabilityType: "能力类型",
    routeImpact: "路线影响",
    cardPlanTitle: "发牌",
    cardPlanSummary: (eventCount, cardTypeCount, pauseRule) =>
      `发牌计划：本轮记录 ${eventCount} 次发牌事件，涉及 ${cardTypeCount} 类牌；${pauseRule}。`,
    cardDealer: "发牌 owner",
    card: "牌",
    cardShell: "呈现壳",
    cardWhy: "为什么现在发",
    cardNames: {
      clarify: "澄清",
      "shrink-scope": "收窄范围",
      options: "选项",
      risk: "风险",
      execute: "执行",
      verify: "验证",
      fix: "修复",
      rollback: "回滚",
      nudge: "下一步提醒",
      pause: "暂停",
    },
    cardVisibleSummary: {
      sectionTitle: "用户可见发牌摘要",
      signalLabel: "发牌摘要",
      userFocusLabel: "用户相关牌",
      riskInserted: "风险已插入",
      riskNotTriggered: "风险未触发",
      pauseTriggered: "暂停已触发",
      pauseNotTriggered: "暂停未触发",
      nativeChoiceBoundary:
        "这是对话/报告摘要，不是 native choice popup 证据。",
      dealtLine: ({ eventCount, cardTypeCount, activeCards }) =>
        `触发发牌：本轮生成 ${eventCount} 次发牌事件，涉及 ${cardTypeCount} 类牌：${activeCards}。`,
      inactiveLine: ({ inactiveCards }) => `本轮未触发的牌型：${inactiveCards}。`,
      userLine: ({ userCards, interruptCards, riskState, pauseState }) =>
        `和用户直接相关：${userCards}；插入/打断：${interruptCards}；${riskState}；${pauseState}`,
      progressSectionTitle: "过程发牌事件",
      progressStageLine: ({ stage }) => `${stage} 进行中`,
      progressDealLine: ({ discovery, cardName, repeatNote }) =>
        `触发发牌：发现${discovery}，触发${cardName}牌${repeatNote ? `（${repeatNote}）` : ""}。`,
      repeatEventNote: ({ repeatOrdinal, repeatReason }) => {
        const reasons = {
          user_decision_window: "用户决策窗口",
          high_cost_control_window: "高成本节奏控制",
          digest_window_after_visible_status: "状态摘要后的消化窗口",
        };
        return `第 ${repeatOrdinal} 次，原因=${reasons[repeatReason] ?? repeatReason}`;
      },
      progressDiscoveries: {
        clarify: "目标或验收边界可能改变路线",
        "shrink-scope": "路线过宽，需要先收窄边界",
        options: "存在多个可行路径，需要选择",
        risk: "运行时或外部平台风险可能抢占执行",
        execute: "负责人、路线和验证条件已就绪",
        verify: "需要新证据才能声称完成",
        fix: "审查或验证发现可修复点",
        rollback: "风险可能超过已批准边界",
        nudge: "用户需要一个低成本下一步",
        pause: "当前需要消化窗口或决策窗口",
        default: "出现会改变路线的信号",
      },
      repeatPolicy:
        "牌是动态节奏信号；同一类牌可以在不同阶段、不同原因下重复发。",
      nextLine:
        "下一步先看用户相关牌，再看风险或暂停有没有改变路线。",
    },
    businessPhasePlanTitle: "11 阶段业务流",
    businessPhaseSummary: (count) => `已记录 ${count} 个业务阶段，用于打包、闭环、反馈和镜像。`,
    phase: "阶段",
    mapsToSpine: "映射到 8-stage",
    evidence: "证据",
    spineRelationship: "与 8-stage 的关系",
    durableAgentPolicyTitle: "持久 Agent 策略",
    durableAgentPolicyBullets: (profiles) => [
      "create_agent / iterate_agent 的最终交付物是项目内可保留的抽象 agent 定义或候选写回，不是临时 worker prompt。",
      ...profiles.map((profile) => `${profile.label} 投影目标：\`${profile.agentPath}\`。`),
      "投影状态以兼容目录为准；partial 或 needs_probe 的目标会保留证据，但不夸大为完整能力。",
      "工具端生成的 alias 只是 metadata，不会替代 `roleDisplayName` 或长期 `ownerAgent`。",
    ],
    boolean: (value) => (value ? "是" : "否"),
    statusValue: (status) => {
      if (status === true || status === "pass" || status === "smoke_pass") return "通过";
      if (status === "blocked") return "阻塞";
      if (status === "partial") return "部分完成";
      return String(status ?? "未知");
    },
    deliverableLinks: {
      readabilityReview: "可读性 review",
      rubricMarkdown: "AI 可读评分表 Markdown",
      rubricJson: "AI 可读评分表 JSON",
      casePack: "AI 可读案例包",
    },
    readability: {
      title: "Meta_Kim Run 可读性 Review",
      conclusionHeading: "Review 结论",
      conclusionBody:
        "PASS。报告可以继续保留机器字段，但用户第一眼看到的是中文业务标签、owner、阻塞原因和下一步动作，不需要理解内部 packet 才能判断这次运行是否靠谱。",
      fieldTranslationHeading: "字段翻译表",
      tableHeaders: {
        field: "机器字段",
        humanLabel: "人话标签",
        meaning: "用户要看懂什么",
        pageTreatment: "页面处理",
      },
      pageTreatment: "保留机器字段，但页面优先显示中文标签",
      fieldMeanings: {
        decisionSummary: "告诉用户这次为什么这样判。",
        ownerHandoff: "告诉用户每个 worker 的 owner、范围、并行组和验收 owner。",
        blockedReasons: "告诉用户哪里不能继续，以及要回到哪个阶段补证据。",
        toolEvidence: "区分 live、smoke、unsupported 和 release-grade。",
        approvalRequest: "说明 canonical 写回是否需要 Warden 批准。",
        aiReadableRubric: "把设计、执行、验收、反馈、交付内容变成可打分问题。",
        deliverables: "列出用户和系统能复查的文件。",
      },
      beforeAfterHeading: "前后对照",
      sourceContractEntry: "原始合同入口",
      visibleEntryPrefix: "用户看到的入口",
      acceptanceHeading: "验收说明",
      gapCount: "Gap 数量",
      workerCount: "Worker 数量",
      toolEvidenceCount: "工具端证据数",
      canonicalDryRunWriteCount: "Canonical dry-run 写入数",
      returnIfCannotExplain:
        "如果 reviewer 不能从这些标签解释“为什么判、交给谁、哪里阻塞、怎么验收”，本项应退回 P-013。",
    },
    rubric: {
      title: "Meta_Kim AI 可读评分表",
      scoringIntro:
        "评分口径：通过 / 重试 / 失败。评分对象不是聊天回答，而是 run artifact、报告、面板和案例包留下的证据。",
      scoringScale: {
        pass: "证据足够，外部 reviewer 可以复述判断和验收依据。",
        retry: "证据存在但不完整，需要补报告、owner 或验证字段。",
        fail: "没有可复查证据，或把聊天总结冒充产品交付。",
      },
      humanQuestion: "人话问题",
      passStandard: "通过标准",
      failStandard: "失败标准",
      evidencePath: "证据路径",
      reviewerScore: "Reviewer 评分",
      reviewerNotes: "Reviewer 备注",
      pending: "待填写",
    },
    casePack: {
      title: "Meta_Kim AI 可读案例包",
      reviewerShouldSeeHeading: "reviewer 该看到什么",
      reviewerShouldSeeIntro: (summary) =>
        `reviewer 应该能先看到一句话目标：${summary}`,
      reviewerShouldSeeThen: (toolEvidenceLabel) =>
        `然后看到这次任务是什么、缺几个能力、拆成几个 worker、每个 worker 交给谁、哪些${toolEvidenceLabel}还只是 smoke 或 blocked。`,
      reviewerScoringHeading: "reviewer 怎么评分",
      reviewerScoringBody: (rubricMarkdown, rubricJson) =>
        `reviewer 按五维评分：设计、执行、验收、反馈、交付内容。评分表见 \`${rubricMarkdown}\` 和 \`${rubricJson}\`。`,
      designEvidenceHeading: "设计证据",
      executionEvidenceHeading: "执行证据",
      acceptanceEvidenceHeading: "验收证据",
      feedbackEvidenceHeading: "反馈证据",
      passFailExamplesHeading: "通过 / 失败样例",
      taskLabel: "任务",
      synthesisOwnerLabel: "合成 owner",
      wardenApprovalRequired: "是否需要 Warden 审批",
      canonicalDryRunWrites: "Canonical dry-run 写入",
      staticPanel: "静态面板",
      readabilityReview: "可读性 review",
      rubricMarkdown: "评分表 Markdown",
      rubricJson: "评分表 JSON",
      manifest: "Manifest",
      passExample:
        "通过：reviewer 能说清楚为什么判、交给谁、哪里阻塞、为什么 canonical 写入仍需 Warden 批准，以及哪些工具端证据不能算发布级 live pass。",
      failExample:
        "失败：只有聊天总结、只有原始 JSON、页面泄露本机绝对路径、或把 P-012 页面冒充 P-014 评分表 / P-023 案例包。",
    },
    productTasks: [
      {
        id: "P-012",
        label: "Web/UI 产品面板原型",
        evidence: "run-panel.html reads artifact.runReportPanelContract by runId.",
      },
      {
        id: "P-013",
        label: "报告可读性 review",
        evidence: "readability-review.zh-CN.md maps protocol fields to user-facing labels.",
      },
      {
        id: "P-014",
        label: "AI 可读评分表导出",
        evidence: "ai-readable-rubric.zh-CN.md and ai-readable-rubric.json export five criteria.",
      },
      {
        id: "P-023",
        label: "AI 可读案例包",
        evidence:
          "ai-readable-case-pack.zh-CN.md shows reviewer view, reviewer scoring, pass/fail evidence.",
      },
    ],
    sections: {
      decisionSummary: "判定摘要",
      whyDecision: "为什么这么判",
      ownerHandoff: "下一步交给谁",
      blockedApproval: "阻塞与审批",
      toolEvidenceShort: "工具端证据",
      toolEvidenceFull: (tools) => `${tools} 工具端镜像证据`,
      aiReadableRubric: "AI 可读评分标准",
      deliverables: "交付内容",
      capabilityUpgrade: "长期能力升级建议",
      wardenApproval: "Warden 审批包",
      verificationStatus: "验证状态",
    },
  },
  "ja-JP": {
    htmlLang: "ja-JP",
    toolNames: FORMAL_TOOL_NAMES,
    toolProfiles: AGENT_PROJECTION_PROFILES,
    toolList: (tools) => tools.join("/"),
    runtimeProbePlaybookTitle: (tools) => `${tools} ツール側プローブ手順書`,
    runtimeLiveShardMatrixTitle: (tools) => `${tools} ライブシャード行列`,
    githubGapReportTitle: "Meta_Kim GitHub ギャップレポート",
    governedExecutionReportTitle: "Meta-Theory ガバナンス実行レポート",
    panelTitle: "Meta_Kim 実行パネル",
    generatedAt: "生成日時",
    source: "出典",
    status: "状態",
    branch: "ブランチ",
    task: "タスク",
    inputTask: "入力タスク",
    variantCount: "プローブ変種数",
    releaseGradeCandidateCount: "リリース級証拠候補数",
    releaseGradeComplete: "リリース級証拠の完全性",
    runId: "実行 ID",
    runState: "実行状態",
    aheadOfOriginMain: "origin/main との差分コミット数",
    hasWorkingTreeDelta: "作業ツリー差分あり",
    gitDeltaState: "Git 差分状態",
    prdVersion: "PRD バージョン",
    localCommitsNotOnOriginMain: "origin/main にないローカルコミット",
    workingTreeDelta: "作業ツリー差分",
    currentGithubDeltaFromPrd: "PRD 上の現在の GitHub ギャップ",
    blockedOrNotDone: "ブロックまたは未完了",
    compatibilityFollowUp: "互換性フォローアップ",
    releaseBoundary: "リリース境界",
    cannotClaimGithubComplete: "cannotClaimGithubComplete",
    cannotClaimAllToolCompatibility: "cannotClaimAllToolCompatibility",
    completedParallelBacklogEvidence: "完了済み並列 backlog 証拠",
    missing: "（欠落）",
    capabilityGaps: "能力ギャップ",
    workerTasks: "Worker タスク",
    synthesisOwner: "統合 owner",
    tool: "ツール側",
    role: "役割",
    owner: "担当",
    agent: "Agent",
    skill: "Skill",
    mcp: "MCP",
    gap: "ギャップ",
    decision: "判定",
    reason: "理由",
    blocked: "ブロック",
    workerTask: "Worker タスク",
    candidate: "候補",
    type: "種別",
    target: "対象",
    dryRunWrites: "dry-run 書き込み",
    verification: "検証",
    entry: "入口",
    taskScope: "タスク範囲",
    parallelGroup: "並列グループ",
    mergeOwner: "マージ担当",
    acceptance: "受け入れ",
    canonicalWrites: "Canonical 書き込み",
    environment: "環境",
    shardGroup: "シャードグループ",
    expectedClass: "期待クラス",
    evidenceKind: "証拠種別",
    failureClass: "失敗クラス",
    releaseGrade: "リリース級",
    releaseGradeCandidate: "リリース級証拠候補",
    remainingAction: "次の対応",
    commands: "コマンド",
    fixtureOnly: "fixture のみ",
    approvalRequired: "承認が必要",
    approvalValidation: "承認検証",
    dryRunCanonicalWrites: "dry-run canonical 書き込み",
    orchestrationReview: "オーケストレーション review",
    writeback: "書き戻し",
    decisionRuns: "判定実行数",
    none: "なし",
    notRun: "未実行",
    plainLanguageSummary:
      "この実行では、まず不足している能力を判定し、次の作業を適切な owner に渡しながら、ブロック、承認、検証の証拠を残します。",
    conversationNotice: {
      title: "Meta_Kim 通知",
      stageProgress: "ステージ進捗",
      stageProgressDetail:
        "Critical、Fetch、Thinking、Execution、Review を、ユーザーが読める短い進捗として表示します。",
      route: "能力ルート",
      routeDetail: (count) =>
        `願望に近い自然言語の依頼を解釈し、${count} 種類の能力を確認しました。`,
      handoff: "Owner 引き渡し",
      handoffDetail: (count, owner, lanes = "") =>
        lanes
          ? `${owner} がユーザーの短い依頼から ${count} 個の worker 引き渡しを準備しました: ${lanes}.`
          : `${owner} がユーザーの短い依頼から ${count} 個の worker 引き渡しを準備しました。`,
      verification: "検証",
      verificationDetail: (status) =>
        `現在の検証状態は ${status} です。内部 artifact はユーザー表示とは分けます。`,
    },
    userExperienceNotice: {
      title: "ユーザー体験通知",
      primarySurface: "主な表示面",
      expectationLabel: "ユーザー期待",
      boundaryLabel: "正確性の境界",
      mustNotClaimLabel: "主張してはいけないこと",
      emissionEvidenceLabel: "conversation notice 発射証拠",
      signal: "ユーザーに見える信号",
      internalOnly: "内部証拠のみ",
      internalOnlySummary:
        "機械可読の監査 packet は内部に保持し、このレポートではフィールド名ではなく平易な要約を表示します。",
      partialStatusReason:
        "読みやすいレポートは生成済みですが、このスクリプトはまだ runtime conversation notice を発射していません。",
      emittedStatusReason: (channel, adapter, hash) =>
        `ローカライズ済み conversation notice は ${adapter} により ${channel} へ発射されました; textSha256=${hash}.`,
      expectation:
        "ユーザーは内部コマンドを実行しなくても、進捗、ルート、owner、ブロック、検証を短く理解できる必要があります。",
      accuracyBoundary:
        "コマンド出力と JSON artifact は補助証拠です。runtime notice または読みやすいレポートに表示されて初めてユーザー体験になります。",
      mustNotClaim:
        "オーケストレーションが内部 artifact にしか存在しない場合、ユーザーが完全に体験済みだと主張してはいけません。",
      signals: {
        stageProgress: {
          label: "ステージ進捗",
          detail: "現在のステージ、完了済みステージ、次の手順、ブロックを自然な言葉で表示します。",
        },
        routeSummary: (count) => ({
          label: "能力ルート",
          detail: `${count} 種類の確認済み能力を、数と主要候補として要約し、生の packet を出しません。`,
        }),
        ownerHandoff: (count) => ({
          label: "Owner 引き渡し",
          detail: `作業分割時は ${count} 個の worker task の owner、範囲、merge owner、verification owner を表示します。`,
        }),
        verification: (status) => ({
          label: "検証境界",
          detail: `検証状態 ${status} を表示し、smoke、internal、blocked、live 証拠を分けます。`,
        }),
      },
    },
    stageOperationPlan: {
      title: "ステージ実行説明",
      executionTitle: "実行オーケストレーション詳細",
      stage: "ステージ",
      whatHappens: "何をするか",
      uses: "使用するもの",
      outputShape: "結果の形",
      resultReport: "完了後の報告",
      nextWork: "次の作業",
      order: "順序",
      does: "行うこと",
      notRequired: "不要",
      mcpProviderBoundary: "MCP provider 境界",
      noExecutionTasks: "この実行では execution worker task は不要です。",
      executionResult: (count) =>
        `Execution は ${count} 個の worker task を実行し、各結果を報告してから Review に渡します。`,
      workerDoes: (output, gapId) =>
        `${gapId} に対して ${output} を作成し、選択済み owner loadout を使います。`,
      workerResult: (output) =>
        `${output} が review 可能になったことを短く報告し、判定、受け入れ、検証証拠を添付します。`,
      workerNext: (handoffTarget, parallelGroup) =>
        `${handoffTarget} が ${parallelGroup} をマージし、次のキュー項目を開始します。`,
      outputs: {
        critical: (count) => `${count} 個の成功基準と、実際のゴール、非ゴール境界。`,
        fetch: (capabilityCount, sourceCount) =>
          `${sourceCount} 個のソースグループから ${capabilityCount} 種類の能力を確認。`,
        thinking: (mode, workerCount) =>
          `${mode}; owner と merge path を持つ ${workerCount} 個の worker task。`,
        execution: (workerCount) => `${workerCount} 個の順序付き worker 結果レポート。`,
        review: (checkCount) => `${checkCount} 個の上流品質と結果品質チェック。`,
      },
      results: {
        critical: "ゴールと非ゴールが境界づけられたため、証拠収集に進めます。",
        fetch: "Fetch はルート選択に十分です。能力 discovery は skill-only ではありません。",
        thinking: "ルート、owner、loadout、merge owner、verification owner が選択されました。",
        review: (reviewStatus, runtimeStatus) =>
          `Review 状態=${reviewStatus}; 検証証拠状態=${runtimeStatus}。`,
      },
      stages: {
        critical: {
          uses: "meta-theory skill と Warden entry gate",
          whatHappens:
            "証拠収集前に、本当の成果、成功基準、非ゴール、許可境界を固定します。",
        },
        fetch: {
          uses: "ローカルソース読み取り、能力 inventory、retrieval readiness check",
          whatHappens:
            "ローカルソースを読み、証拠を集め、ルート設計前に能力タイプを確認します。",
        },
        thinking: {
          uses: "dispatch board、GapDecision kernel、worker task packets",
          whatHappens:
            "ルート、owner、loadout、merge owner、verification owner を選びます。",
        },
        execution: {
          uses: "選択された agent、skill、MCP boundary、task ごとの command",
          whatHappens:
            "選択済み worker task を、紐づいた agent、skill、MCP、command loadout で実行します。",
        },
        review: {
          uses: "meta-theory review checks",
          whatHappens:
            "上流の Critical/Fetch/Thinking 品質と、execution 結果が境界を満たすかを確認します。",
        },
      },
    },
    stageSummaryTitle: "Critical / Fetch / Thinking / Review",
    stageSummaries: {
      critical: (toolList) =>
        `Critical: 本当のゴール、成功基準、非ゴールを、正式ツール対象 ${toolList} に対して固定します。`,
      fetch: (count) =>
        `Fetch: 能力ルートは skill だけではありません。agent、skill、command/script、MCP/tool、runtime tool、plugin、retrieval、dependency、worker task を含む ${count} 種類の能力を確認しました。`,
      thinking: (mode, mergeOwner) =>
        `Thinking: ルートと owner を選びます。${mode}、mergeOwner=${mergeOwner}。create_agent ルートは、プロジェクトに残せる抽象 agent または候補 writeback を成果物にする必要があります。`,
      review: (toolList) =>
        `Review: Critical/Fetch/Thinking が実在すること、一時 subagent が永続 agent として扱われていないこと、${toolList} の投影目標が保たれていることを確認します。`,
    },
    capabilityRouteTitle: "能力ルート",
    capabilityType: "能力種別",
    routeImpact: "ルートへの影響",
    cardPlanTitle: "カード配布",
    cardPlanSummary: (eventCount, cardTypeCount, pauseRule) =>
      `カード計画: 今回は ${eventCount} 件のカードイベント、${cardTypeCount} 種類のカードを記録します。${pauseRule}。`,
    cardDealer: "配布 owner",
    card: "カード",
    cardShell: "表示シェル",
    cardWhy: "今出す理由",
    cardNames: {
      clarify: "明確化",
      "shrink-scope": "範囲縮小",
      options: "選択肢",
      risk: "リスク",
      execute: "実行",
      verify: "検証",
      fix: "修正",
      rollback: "ロールバック",
      nudge: "次の一手",
      pause: "一時停止",
    },
    cardVisibleSummary: {
      sectionTitle: "ユーザー向けカード要約",
      signalLabel: "カード配布要約",
      userFocusLabel: "ユーザー関連カード",
      riskInserted: "リスクを挿入",
      riskNotTriggered: "リスク未発火",
      pauseTriggered: "一時停止が発火",
      pauseNotTriggered: "一時停止未発火",
      nativeChoiceBoundary:
        "これは会話/レポート要約であり、native choice popup の証拠ではありません。",
      dealtLine: ({ eventCount, cardTypeCount, activeCards }) =>
        `カード配布: ${eventCount} 件のカードイベント、${cardTypeCount} 種類: ${activeCards}。`,
      inactiveLine: ({ inactiveCards }) => `今回未発火のカード種類: ${inactiveCards}。`,
      userLine: ({ userCards, interruptCards, riskState, pauseState }) =>
        `ユーザー関連: ${userCards}; 割り込み: ${interruptCards}; ${riskState}; ${pauseState}`,
      progressSectionTitle: "実行中カードイベント",
      progressStageLine: ({ stage }) => `${stage} 進行中`,
      progressDealLine: ({ discovery, cardName, repeatNote }) =>
        `カード配布: ${discovery} を検出し、${cardName} カードを発火${repeatNote ? `（${repeatNote}）` : ""}。`,
      repeatEventNote: ({ repeatOrdinal, repeatReason }) =>
        `${repeatOrdinal} 回目、理由=${repeatReason}`,
      progressDiscoveries: {
        clarify: "目標または受け入れ境界がルートを変える可能性",
        "shrink-scope": "ルートが広く、境界を絞る必要",
        options: "複数の実行可能な道筋",
        risk: "実行を先取りする可能性のあるランタイムまたは外部リスク",
        execute: "owner、ルート、検証条件が揃った状態",
        verify: "完了主張前に fresh proof が必要",
        fix: "レビューまたは検証で修正点を検出",
        rollback: "リスクが承認済み境界を超える可能性",
        nudge: "ユーザーに低コストの次手が必要",
        pause: "消化または意思決定のための間",
        default: "ルートを変える信号",
      },
      repeatPolicy:
        "カード種類は動的なリズム信号です。同じ種類のカードは段階をまたいで繰り返し配布できます。",
      nextLine:
        "次はユーザー関連カードを先に見て、リスクや一時停止がルートを変えたか確認します。",
    },
    businessPhasePlanTitle: "11フェーズ業務ワークフロー",
    businessPhaseSummary: (count) =>
      `${count} 個の業務フェーズを、パッケージングと完了確認のために記録しています。`,
    phase: "フェーズ",
    mapsToSpine: "8-stage への対応",
    evidence: "証拠",
    spineRelationship: "8-stage との関係",
    durableAgentPolicyTitle: "永続 Agent 方針",
    durableAgentPolicyBullets: (profiles) => [
      "create_agent / iterate_agent の最終成果物は、プロジェクトに残せる抽象 agent 定義または候補 writeback であり、一時的な worker prompt ではありません。",
      ...profiles.map((profile) => `${profile.label} 投影ターゲット: \`${profile.agentPath}\`。`),
      "投影状態は互換性カタログに従います。partial または needs_probe の対象は保持しますが、過大に主張しません。",
      "ランタイム生成の alias は metadata にすぎず、`roleDisplayName` や永続 `ownerAgent` を置き換えません。",
    ],
    boolean: (value) => (value ? "はい" : "いいえ"),
    statusValue: (status) => {
      if (status === true || status === "pass" || status === "smoke_pass") return "合格";
      if (status === "blocked") return "ブロック";
      if (status === "partial") return "部分完了";
      return String(status ?? "不明");
    },
    deliverableLinks: {
      readabilityReview: "可読性 review",
      rubricMarkdown: "AI 可読ルーブリック Markdown",
      rubricJson: "AI 可読ルーブリック JSON",
      casePack: "AI 可読ケースパック",
    },
    readability: {
      title: "Meta_Kim 実行可読性 Review",
      conclusionHeading: "Review 結論",
      conclusionBody:
        "PASS。レポートは機械向けフィールドを保持できますが、ユーザーの最初のビューでは、プロトコル知識なしに判断できるローカライズ済みの業務ラベル、owner、ブロック理由、次の対応を優先します。",
      fieldTranslationHeading: "フィールド翻訳表",
      tableHeaders: {
        field: "機械フィールド",
        humanLabel: "人が読むラベル",
        meaning: "ユーザーが理解すべきこと",
        pageTreatment: "ページでの扱い",
      },
      pageTreatment:
        "機械フィールドは保持しつつ、ページではローカライズ済みのユーザー向けラベルを優先する",
      fieldMeanings: {
        decisionSummary: "この判定がなぜ行われたかを伝える。",
        ownerHandoff:
          "各 worker の owner、範囲、並列グループ、受け入れ owner を伝える。",
        blockedReasons: "何が続行不能で、どの段階に証拠を戻すべきかを伝える。",
        toolEvidence: "live、smoke、unsupported、release-grade の証拠を分ける。",
        approvalRequest: "canonical writeback に Warden 承認が必要かを説明する。",
        aiReadableRubric:
          "設計、実行、受け入れ、フィードバック、成果物を採点可能な質問に変換する。",
        deliverables: "ユーザーとシステムが再確認できるファイルを列挙する。",
      },
      beforeAfterHeading: "Before / After",
      sourceContractEntry: "元の契約エントリ",
      visibleEntryPrefix: "ユーザーに見えるエントリ",
      acceptanceHeading: "受け入れメモ",
      gapCount: "ギャップ数",
      workerCount: "Worker 数",
      toolEvidenceCount: "ツール側証拠数",
      canonicalDryRunWriteCount: "Canonical dry-run 書き込み数",
      returnIfCannotExplain:
        "reviewer が、なぜ、誰が次を担当するか、何がブロックされているか、どう検証するかをこれらのラベルから説明できない場合、この項目を P-013 に戻します。",
    },
    rubric: {
      title: "Meta_Kim AI 可読ルーブリック",
      scoringIntro:
        "採点尺度: pass / retry / fail。チャット要約ではなく、run artifact、レポート、パネル、ケースパックの証拠を採点します。",
      scoringScale: {
        pass: "外部 reviewer が判定と受け入れ根拠を再説明できるだけの証拠がある。",
        retry: "証拠はあるが不完全で、レポート、owner、検証フィールドの補足が必要。",
        fail: "確認可能な証拠がない、またはチャット要約を成果物として扱っている。",
      },
      humanQuestion: "平易な質問",
      passStandard: "合格基準",
      failStandard: "失敗基準",
      evidencePath: "証拠パス",
      reviewerScore: "Reviewer スコア",
      reviewerNotes: "Reviewer メモ",
      pending: "未記入",
    },
    casePack: {
      title: "Meta_Kim AI 可読ケースパック",
      reviewerShouldSeeHeading: "reviewer が見るべきもの",
      reviewerShouldSeeIntro: (summary) =>
        `reviewer はまず一文のゴールを確認できる必要があります: ${summary}`,
      reviewerShouldSeeThen: (toolEvidenceLabel) =>
        `次に、タスク内容、不足能力の数、worker 分割、各 worker の owner、どの ${toolEvidenceLabel} がまだ smoke または blocked なのかを確認します。`,
      reviewerScoringHeading: "reviewer の採点方法",
      reviewerScoringBody: (rubricMarkdown, rubricJson) =>
        `reviewer は設計、実行、受け入れ、フィードバック、成果物の五つの観点で採点します。詳しくは \`${rubricMarkdown}\` と \`${rubricJson}\` を参照してください。`,
      designEvidenceHeading: "設計証拠",
      executionEvidenceHeading: "実行証拠",
      acceptanceEvidenceHeading: "受け入れ証拠",
      feedbackEvidenceHeading: "フィードバック証拠",
      passFailExamplesHeading: "Pass / Fail 例",
      taskLabel: "タスク",
      synthesisOwnerLabel: "統合 owner",
      wardenApprovalRequired: "Warden 承認が必要",
      canonicalDryRunWrites: "Canonical dry-run 書き込み",
      staticPanel: "静的パネル",
      readabilityReview: "可読性 review",
      rubricMarkdown: "ルーブリック Markdown",
      rubricJson: "ルーブリック JSON",
      manifest: "Manifest",
      passExample:
        "Pass: reviewer が、なぜ、誰が次を担当するか、何がブロックされているか、なぜ canonical 書き込みに Warden 承認がまだ必要か、どのツール側証拠が release-grade live pass と見なせないかを説明できる。",
      failExample:
        "Fail: チャット要約だけ、raw JSON だけ、ローカル絶対パスの漏えい、または P-012 ページを P-014 ルーブリック / P-023 ケースパックとして扱っている。",
    },
    productTasks: [
      {
        id: "P-012",
        label: "Web/UI プロダクトパネル prototype",
        evidence: "run-panel.html reads artifact.runReportPanelContract by runId.",
      },
      {
        id: "P-013",
        label: "レポート可読性 review",
        evidence: "readability-review.ja-JP.md maps protocol fields to user-facing labels.",
      },
      {
        id: "P-014",
        label: "AI 可読ルーブリック export",
        evidence: "ai-readable-rubric.ja-JP.md and ai-readable-rubric.json export five criteria.",
      },
      {
        id: "P-023",
        label: "AI 可読ケースパック",
        evidence:
          "ai-readable-case-pack.ja-JP.md shows reviewer view, reviewer scoring, pass/fail evidence.",
      },
    ],
    sections: {
      decisionSummary: "判定サマリー",
      whyDecision: "この判定の理由",
      ownerHandoff: "次の担当",
      blockedApproval: "ブロックと承認",
      toolEvidenceShort: "ツール側証拠",
      toolEvidenceFull: (tools) => `${tools} ツール側ミラー証拠`,
      aiReadableRubric: "AI 可読スコア基準",
      deliverables: "成果物",
      capabilityUpgrade: "長期能力アップグレード",
      wardenApproval: "Warden 承認パケット",
      verificationStatus: "検証状態",
    },
  },
  "ko-KR": {
    htmlLang: "ko-KR",
    toolNames: FORMAL_TOOL_NAMES,
    toolProfiles: AGENT_PROJECTION_PROFILES,
    toolList: (tools) => tools.join("/"),
    runtimeProbePlaybookTitle: (tools) => `${tools} 도구 측 프로브 플레이북`,
    runtimeLiveShardMatrixTitle: (tools) => `${tools} 라이브 샤드 매트릭스`,
    githubGapReportTitle: "Meta_Kim GitHub 격차 보고서",
    governedExecutionReportTitle: "Meta-Theory 거버넌스 실행 보고서",
    panelTitle: "Meta_Kim 실행 패널",
    generatedAt: "생성 시각",
    source: "출처",
    status: "상태",
    branch: "브랜치",
    task: "작업",
    inputTask: "입력 작업",
    variantCount: "프로브 변형 수",
    releaseGradeCandidateCount: "릴리스급 증거 후보 수",
    releaseGradeComplete: "릴리스급 증거 완성 여부",
    runId: "실행 ID",
    runState: "실행 상태",
    aheadOfOriginMain: "origin/main 대비 앞선 커밋 수",
    hasWorkingTreeDelta: "작업 트리 변경 여부",
    gitDeltaState: "Git 차이 상태",
    prdVersion: "PRD 버전",
    localCommitsNotOnOriginMain: "origin/main 에 없는 로컬 커밋",
    workingTreeDelta: "작업 트리 변경",
    currentGithubDeltaFromPrd: "PRD 의 현재 GitHub 격차",
    blockedOrNotDone: "차단 또는 미완료",
    compatibilityFollowUp: "호환성 후속 항목",
    releaseBoundary: "릴리스 경계",
    cannotClaimGithubComplete: "cannotClaimGithubComplete",
    cannotClaimAllToolCompatibility: "cannotClaimAllToolCompatibility",
    completedParallelBacklogEvidence: "완료된 병렬 backlog 증거",
    missing: "（누락）",
    capabilityGaps: "능력 격차",
    workerTasks: "Worker 작업",
    synthesisOwner: "종합 owner",
    tool: "도구 측",
    role: "역할",
    owner: "담당",
    agent: "Agent",
    skill: "Skill",
    mcp: "MCP",
    gap: "격차",
    decision: "판정",
    reason: "이유",
    blocked: "차단됨",
    workerTask: "Worker 작업",
    candidate: "후보",
    type: "유형",
    target: "대상",
    dryRunWrites: "dry-run 쓰기",
    verification: "검증",
    entry: "엔트리",
    taskScope: "작업 범위",
    parallelGroup: "병렬 그룹",
    mergeOwner: "병합 담당",
    acceptance: "수락",
    canonicalWrites: "Canonical 쓰기",
    environment: "환경",
    shardGroup: "샤드 그룹",
    expectedClass: "예상 클래스",
    evidenceKind: "증거 종류",
    failureClass: "실패 클래스",
    releaseGrade: "릴리스급",
    releaseGradeCandidate: "릴리스급 증거 후보",
    remainingAction: "다음 조치",
    commands: "명령",
    fixtureOnly: "fixture 전용",
    approvalRequired: "승인 필요",
    approvalValidation: "승인 검증",
    dryRunCanonicalWrites: "dry-run canonical 쓰기",
    orchestrationReview: "오케스트레이션 review",
    writeback: "쓰기 반영",
    decisionRuns: "판정 실행 수",
    none: "없음",
    notRun: "미실행",
    plainLanguageSummary:
      "이 실행은 먼저 어떤 능력이 부족한지 판단한 뒤, 다음 작업을 적절한 owner 에 넘기고 차단, 승인, 검증 증거를 남깁니다.",
    conversationNotice: {
      title: "Meta_Kim 알림",
      stageProgress: "단계 진행",
      stageProgressDetail:
        "Critical, Fetch, Thinking, Execution, Review 를 사용자가 읽을 수 있는 짧은 진행 상태로 표시합니다.",
      route: "능력 경로",
      routeDetail: (count) =>
        `희망형 자연어 요청을 해석하고 ${count}개 능력 유형을 확인했습니다.`,
      handoff: "Owner 인계",
      handoffDetail: (count, owner, lanes = "") =>
        lanes
          ? `${owner} 가 사용자의 짧은 요청에서 ${count}개 worker 인계를 준비했습니다: ${lanes}.`
          : `${owner} 가 사용자의 짧은 요청에서 ${count}개 worker 인계를 준비했습니다.`,
      verification: "검증",
      verificationDetail: (status) =>
        `현재 검증 상태는 ${status} 입니다. 내부 artifact 는 사용자 표시와 분리합니다.`,
    },
    userExperienceNotice: {
      title: "사용자 경험 알림",
      primarySurface: "기본 표시 위치",
      expectationLabel: "사용자 기대",
      boundaryLabel: "정확성 경계",
      mustNotClaimLabel: "주장하면 안 되는 것",
      emissionEvidenceLabel: "conversation notice 발사 증거",
      signal: "사용자에게 보이는 신호",
      internalOnly: "내부 증거 전용",
      internalOnlySummary:
        "기계 판독용 감사 packet 은 내부에 보존하고, 이 보고서는 필드명 대신 쉬운 요약만 표시합니다.",
      partialStatusReason:
        "읽기 쉬운 보고서는 생성되었지만 이 스크립트는 아직 runtime conversation notice 를 발사하지 않았습니다.",
      emittedStatusReason: (channel, adapter, hash) =>
        `현지화된 conversation notice 가 ${adapter} 에 의해 ${channel} 로 발사되었습니다; textSha256=${hash}.`,
      expectation:
        "사용자는 내부 명령을 실행하지 않아도 진행 상황, 경로, owner, 차단 항목, 검증 상태를 간결하게 알 수 있어야 합니다.",
      accuracyBoundary:
        "명령 출력과 JSON artifact 는 보조 증거입니다. runtime notice 또는 읽기 쉬운 보고서에 표시되어야 사용자 경험으로 볼 수 있습니다.",
      mustNotClaim:
        "오케스트레이션이 내부 artifact 에만 있으면 사용자가 완전히 경험했다고 주장하지 않습니다.",
      signals: {
        stageProgress: {
          label: "단계 진행",
          detail: "현재 단계, 완료된 단계, 다음 단계, 차단 항목을 자연어로 표시합니다.",
        },
        routeSummary: (count) => ({
          label: "능력 경로",
          detail: `확인한 ${count}개 능력 유형을 개수와 주요 후보로 요약하고 원시 packet 을 덤프하지 않습니다.`,
        }),
        ownerHandoff: (count) => ({
          label: "Owner 인계",
          detail: `작업을 나눌 때 ${count}개 worker task 의 owner, 범위, merge owner, verification owner 를 표시합니다.`,
        }),
        verification: (status) => ({
          label: "검증 경계",
          detail: `검증 상태 ${status} 를 표시하고 smoke, internal, blocked, live 증거를 구분합니다.`,
        }),
      },
    },
    stageOperationPlan: {
      title: "단계 실행 설명",
      executionTitle: "실행 오케스트레이션 상세",
      stage: "단계",
      whatHappens: "무엇을 하는가",
      uses: "무엇을 쓰는가",
      outputShape: "결과 형태",
      resultReport: "완료 후 보고",
      nextWork: "다음 작업",
      order: "순서",
      does: "하는 일",
      notRequired: "필요 없음",
      mcpProviderBoundary: "MCP provider 경계",
      noExecutionTasks: "이번 실행에는 execution worker task 가 필요하지 않습니다.",
      executionResult: (count) =>
        `Execution 은 ${count}개 worker task 를 실행하고 각 결과를 보고한 뒤 Review 로 넘깁니다.`,
      workerDoes: (output, gapId) =>
        `${gapId} 에 대해 ${output} 를 만들고 선택된 owner loadout 을 사용합니다.`,
      workerResult: (output) =>
        `${output} 가 review 준비 상태임을 간단히 보고하고 판정, 수락, 검증 증거를 첨부합니다.`,
      workerNext: (handoffTarget, parallelGroup) =>
        `${handoffTarget} 가 ${parallelGroup} 를 병합한 뒤 다음 큐 작업을 시작합니다.`,
      outputs: {
        critical: (count) => `${count}개 성공 기준과 실제 목표, 비목표 경계.`,
        fetch: (capabilityCount, sourceCount) =>
          `${sourceCount}개 소스 그룹에서 ${capabilityCount}개 능력 유형을 확인.`,
        thinking: (mode, workerCount) =>
          `${mode}; owner 와 merge path 를 가진 ${workerCount}개 worker task.`,
        execution: (workerCount) => `${workerCount}개 순서 있는 worker 결과 보고.`,
        review: (checkCount) => `${checkCount}개 상류 품질 및 결과 품질 점검.`,
      },
      results: {
        critical: "목표와 비목표가 경계 지어졌으므로 증거 수집을 시작할 수 있습니다.",
        fetch: "Fetch 는 경로 선택에 충분합니다. 능력 discovery 는 skill-only 가 아닙니다.",
        thinking: "경로, owner, loadout, merge owner, verification owner 가 선택되었습니다.",
        review: (reviewStatus, runtimeStatus) =>
          `Review 상태=${reviewStatus}; 검증 증거 상태=${runtimeStatus}.`,
      },
      stages: {
        critical: {
          uses: "meta-theory skill 과 Warden entry gate",
          whatHappens:
            "증거 수집 전에 실제 결과, 성공 기준, 비목표, 권한 경계를 고정합니다.",
        },
        fetch: {
          uses: "로컬 소스 읽기, 능력 inventory, retrieval readiness check",
          whatHappens:
            "로컬 소스를 읽고 증거를 모으며 경로 설계 전에 능력 유형을 확인합니다.",
        },
        thinking: {
          uses: "dispatch board, GapDecision kernel, worker task packets",
          whatHappens:
            "경로, owner, loadout, merge owner, verification owner 를 선택합니다.",
        },
        execution: {
          uses: "선택된 agent, skill, MCP boundary, task 별 command",
          whatHappens:
            "선택된 worker task 를 연결된 agent, skill, MCP, command loadout 으로 실행합니다.",
        },
        review: {
          uses: "meta-theory review checks",
          whatHappens:
            "상류 Critical/Fetch/Thinking 품질과 execution 결과가 경계를 만족하는지 확인합니다.",
        },
      },
    },
    stageSummaryTitle: "Critical / Fetch / Thinking / Review",
    stageSummaries: {
      critical: (toolList) =>
        `Critical: 실제 목표, 성공 기준, 비목표를 공식 도구 대상 ${toolList} 기준으로 고정합니다.`,
      fetch: (count) =>
        `Fetch: 능력 경로는 skill 전용이 아닙니다. agent, skill, command/script, MCP/tool, runtime tool, plugin, retrieval, dependency, worker task 를 포함해 ${count}개 능력 유형을 확인했습니다.`,
      thinking: (mode, mergeOwner) =>
        `Thinking: 경로와 owner 를 선택합니다. ${mode}, mergeOwner=${mergeOwner}. create_agent 경로는 프로젝트에 남길 수 있는 추상 agent 또는 후보 writeback 을 산출해야 합니다.`,
      review: (toolList) =>
        `Review: Critical/Fetch/Thinking 이 실제로 존재하는지, 임시 subagent 를 영구 agent 로 승격하지 않았는지, ${toolList} 투영 목표가 보존되는지 확인합니다.`,
    },
    capabilityRouteTitle: "능력 경로",
    capabilityType: "능력 유형",
    routeImpact: "경로 영향",
    cardPlanTitle: "카드 배분",
    cardPlanSummary: (eventCount, cardTypeCount, pauseRule) =>
      `카드 계획: 이번 실행에서 ${eventCount}개의 카드 이벤트와 ${cardTypeCount}개 카드 유형을 기록합니다. ${pauseRule}.`,
    cardDealer: "배분 owner",
    card: "카드",
    cardShell: "표시 shell",
    cardWhy: "지금 배분하는 이유",
    cardNames: {
      clarify: "명확화",
      "shrink-scope": "범위 축소",
      options: "선택지",
      risk: "위험",
      execute: "실행",
      verify: "검증",
      fix: "수정",
      rollback: "롤백",
      nudge: "다음 행동",
      pause: "일시정지",
    },
    cardVisibleSummary: {
      sectionTitle: "사용자 표시 카드 요약",
      signalLabel: "카드 배분 요약",
      userFocusLabel: "사용자 관련 카드",
      riskInserted: "위험 삽입됨",
      riskNotTriggered: "위험 미발동",
      pauseTriggered: "일시정지 발동됨",
      pauseNotTriggered: "일시정지 미발동",
      nativeChoiceBoundary:
        "이것은 대화/보고서 요약이며 native choice popup 증거가 아닙니다.",
      dealtLine: ({ eventCount, cardTypeCount, activeCards }) =>
        `카드 배분: ${eventCount}개 카드 이벤트, ${cardTypeCount}개 카드 유형: ${activeCards}.`,
      inactiveLine: ({ inactiveCards }) => `이번 라운드 미발동 카드 유형: ${inactiveCards}.`,
      userLine: ({ userCards, interruptCards, riskState, pauseState }) =>
        `사용자 관련: ${userCards}; 인터럽트: ${interruptCards}; ${riskState}; ${pauseState}`,
      progressSectionTitle: "실행 중 카드 이벤트",
      progressStageLine: ({ stage }) => `${stage} 진행 중`,
      progressDealLine: ({ discovery, cardName, repeatNote }) =>
        `카드 배분: ${discovery} 발견, ${cardName} 카드 발동${repeatNote ? `(${repeatNote})` : ""}.`,
      repeatEventNote: ({ repeatOrdinal, repeatReason }) =>
        `${repeatOrdinal}번째, 이유=${repeatReason}`,
      progressDiscoveries: {
        clarify: "목표나 수용 기준이 경로를 바꿀 수 있음",
        "shrink-scope": "경로가 넓어 경계를 좁혀야 함",
        options: "실행 가능한 경로가 여러 개 있음",
        risk: "런타임 또는 외부 플랫폼 위험이 실행을 선점할 수 있음",
        execute: "owner, 경로, 검증 조건이 준비됨",
        verify: "완료 주장 전에 fresh proof 가 필요함",
        fix: "리뷰 또는 검증에서 수정 지점 발견",
        rollback: "위험이 승인된 경계를 넘을 수 있음",
        nudge: "사용자에게 낮은 비용의 다음 행동이 필요함",
        pause: "소화 또는 의사결정 시간이 필요함",
        default: "경로를 바꿀 수 있는 신호",
      },
      repeatPolicy:
        "카드 유형은 동적 리듬 신호입니다. 같은 유형의 카드는 단계마다 반복해서 배분될 수 있습니다.",
      nextLine:
        "다음은 사용자 관련 카드를 먼저 보고 위험이나 일시정지가 경로를 바꿨는지 확인합니다.",
    },
    businessPhasePlanTitle: "11단계 비즈니스 워크플로",
    businessPhaseSummary: (count) =>
      `${count}개 비즈니스 단계를 패키징과 종료 확인을 위해 기록했습니다.`,
    phase: "단계",
    mapsToSpine: "8-stage 매핑",
    evidence: "증거",
    spineRelationship: "8-stage 와의 관계",
    durableAgentPolicyTitle: "영구 Agent 정책",
    durableAgentPolicyBullets: (profiles) => [
      "create_agent / iterate_agent 의 최종 산출물은 프로젝트에 남길 수 있는 추상 agent 정의 또는 후보 writeback 이며, 임시 worker prompt 가 아닙니다.",
      ...profiles.map((profile) => `${profile.label} 투영 대상: \`${profile.agentPath}\`.`),
      "투영 상태는 호환성 카탈로그를 따릅니다. partial 또는 needs_probe 대상은 보존하되 과장하지 않습니다.",
      "런타임이 생성한 alias 는 metadata 일 뿐이며 `roleDisplayName` 또는 영구 `ownerAgent` 를 대체하지 않습니다.",
    ],
    boolean: (value) => (value ? "예" : "아니요"),
    statusValue: (status) => {
      if (status === true || status === "pass" || status === "smoke_pass") return "통과";
      if (status === "blocked") return "차단";
      if (status === "partial") return "부분 완료";
      return String(status ?? "알 수 없음");
    },
    deliverableLinks: {
      readabilityReview: "가독성 review",
      rubricMarkdown: "AI 가독 루브릭 Markdown",
      rubricJson: "AI 가독 루브릭 JSON",
      casePack: "AI 가독 케이스 팩",
    },
    readability: {
      title: "Meta_Kim 실행 가독성 Review",
      conclusionHeading: "Review 결론",
      conclusionBody:
        "PASS. 보고서는 기계 필드를 유지할 수 있지만, 사용자의 첫 화면에는 프로토콜 지식 없이 판단할 수 있는 현지화된 업무 라벨, owner, 차단 이유, 다음 조치가 우선 노출되어야 합니다.",
      fieldTranslationHeading: "필드 번역표",
      tableHeaders: {
        field: "기계 필드",
        humanLabel: "사람이 읽는 라벨",
        meaning: "사용자가 이해해야 할 것",
        pageTreatment: "페이지 처리",
      },
      pageTreatment:
        "기계 필드는 유지하되 페이지에서는 현지화된 사용자-facing 라벨을 우선 표시",
      fieldMeanings: {
        decisionSummary: "이번 판정이 왜 내려졌는지 알려준다.",
        ownerHandoff:
          "각 worker 의 owner, 범위, 병렬 그룹, 수락 owner 를 알려준다.",
        blockedReasons: "무엇 때문에 진행할 수 없고 어느 단계에 증거를 보강해야 하는지 알려준다.",
        toolEvidence: "live, smoke, unsupported, release-grade 증거를 구분한다.",
        approvalRequest: "canonical writeback 에 Warden 승인이 필요한지 설명한다.",
        aiReadableRubric:
          "설계, 실행, 수락, 피드백, 산출물을 채점 가능한 질문으로 바꾼다.",
        deliverables: "사용자와 시스템이 다시 확인할 수 있는 파일을 나열한다.",
      },
      beforeAfterHeading: "Before / After",
      sourceContractEntry: "원본 계약 엔트리",
      visibleEntryPrefix: "사용자에게 보이는 엔트리",
      acceptanceHeading: "수락 메모",
      gapCount: "격차 수",
      workerCount: "Worker 수",
      toolEvidenceCount: "도구 측 증거 수",
      canonicalDryRunWriteCount: "Canonical dry-run 쓰기 수",
      returnIfCannotExplain:
        "reviewer 가 왜, 누가 다음을 맡는지, 무엇이 차단되었는지, 어떻게 검증하는지를 이 라벨로 설명할 수 없다면 이 항목을 P-013 으로 되돌립니다.",
    },
    rubric: {
      title: "Meta_Kim AI 가독 루브릭",
      scoringIntro:
        "채점 척도: pass / retry / fail. 채팅 요약이 아니라 run artifact, 보고서, 패널, 케이스 팩 증거를 채점합니다.",
      scoringScale: {
        pass: "외부 reviewer 가 판정과 수락 근거를 다시 설명할 수 있을 만큼 증거가 충분하다.",
        retry: "증거는 있지만 불완전하며 보고서, owner, 검증 필드를 보강해야 한다.",
        fail: "검토 가능한 증거가 없거나 채팅 요약을 제품 산출물로 제시했다.",
      },
      humanQuestion: "쉬운 말 질문",
      passStandard: "통과 기준",
      failStandard: "실패 기준",
      evidencePath: "증거 경로",
      reviewerScore: "Reviewer 점수",
      reviewerNotes: "Reviewer 메모",
      pending: "대기",
    },
    casePack: {
      title: "Meta_Kim AI 가독 케이스 팩",
      reviewerShouldSeeHeading: "reviewer 가 봐야 할 것",
      reviewerShouldSeeIntro: (summary) =>
        `reviewer 는 먼저 한 문장 목표를 볼 수 있어야 합니다: ${summary}`,
      reviewerShouldSeeThen: (toolEvidenceLabel) =>
        `그다음 작업 내용, 부족한 능력 수, worker 분할, 각 worker 의 owner, 어떤 ${toolEvidenceLabel} 가 아직 smoke 또는 blocked 인지 확인합니다.`,
      reviewerScoringHeading: "reviewer 채점 방식",
      reviewerScoringBody: (rubricMarkdown, rubricJson) =>
        `reviewer 는 설계, 실행, 수락, 피드백, 산출물의 다섯 차원으로 채점합니다. \`${rubricMarkdown}\` 및 \`${rubricJson}\` 를 참고하세요.`,
      designEvidenceHeading: "설계 증거",
      executionEvidenceHeading: "실행 증거",
      acceptanceEvidenceHeading: "수락 증거",
      feedbackEvidenceHeading: "피드백 증거",
      passFailExamplesHeading: "Pass / Fail 예시",
      taskLabel: "작업",
      synthesisOwnerLabel: "종합 owner",
      wardenApprovalRequired: "Warden 승인 필요",
      canonicalDryRunWrites: "Canonical dry-run 쓰기",
      staticPanel: "정적 패널",
      readabilityReview: "가독성 review",
      rubricMarkdown: "루브릭 Markdown",
      rubricJson: "루브릭 JSON",
      manifest: "Manifest",
      passExample:
        "Pass: reviewer 가 왜, 누가 다음을 맡는지, 무엇이 차단되었는지, 왜 canonical 쓰기에 아직 Warden 승인이 필요한지, 어떤 도구 측 증거가 release-grade live pass 로 볼 수 없는지 설명할 수 있다.",
      failExample:
        "Fail: 채팅 요약만 있거나, raw JSON 만 있거나, 로컬 절대 경로가 노출되거나, P-012 페이지를 P-014 루브릭 / P-023 케이스 팩으로 취급한다.",
    },
    productTasks: [
      {
        id: "P-012",
        label: "Web/UI 제품 패널 prototype",
        evidence: "run-panel.html reads artifact.runReportPanelContract by runId.",
      },
      {
        id: "P-013",
        label: "보고서 가독성 review",
        evidence: "readability-review.ko-KR.md maps protocol fields to user-facing labels.",
      },
      {
        id: "P-014",
        label: "AI 가독 루브릭 export",
        evidence: "ai-readable-rubric.ko-KR.md and ai-readable-rubric.json export five criteria.",
      },
      {
        id: "P-023",
        label: "AI 가독 케이스 팩",
        evidence:
          "ai-readable-case-pack.ko-KR.md shows reviewer view, reviewer scoring, pass/fail evidence.",
      },
    ],
    sections: {
      decisionSummary: "판정 요약",
      whyDecision: "판정 이유",
      ownerHandoff: "다음 담당",
      blockedApproval: "차단 및 승인",
      toolEvidenceShort: "도구 측 증거",
      toolEvidenceFull: (tools) => `${tools} 도구 측 미러 증거`,
      aiReadableRubric: "AI 가독 평가 기준",
      deliverables: "산출물",
      capabilityUpgrade: "장기 능력 업그레이드",
      wardenApproval: "Warden 승인 패킷",
      verificationStatus: "검증 상태",
    },
  },
};

const LANG = detectLang();
const t = STRINGS[LANG] || STRINGS.en;

function mergeReportLabels(base, override) {
  const merged = { ...base, ...override };
  for (const [key, baseValue] of Object.entries(base)) {
    const overrideValue = override?.[key];
    if (
      baseValue &&
      overrideValue &&
      typeof baseValue === "object" &&
      typeof overrideValue === "object" &&
      !Array.isArray(baseValue) &&
      !Array.isArray(overrideValue) &&
      typeof baseValue !== "function" &&
      typeof overrideValue !== "function"
    ) {
      merged[key] = mergeReportLabels(baseValue, overrideValue);
    }
  }
  return merged;
}

function getReportLabels(lang = LANG) {
  const normalized = normalizeLangCode(lang);
  return mergeReportLabels(REPORT_STRINGS.en, REPORT_STRINGS[normalized] || {});
}

function getReportLabelsForPath(filePath, fallbackLang = LANG) {
  const match = String(filePath ?? "").match(/\.([a-z]{2}(?:-[A-Z]{2})?)\.md$/);
  return getReportLabels(match?.[1] ?? fallbackLang);
}

export { t, LANG, getReportLabels, getReportLabelsForPath };
