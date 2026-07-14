import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildGlobalMetaTheorySyncArgs } from "../../scripts/node-spawn-config.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const syncManifest = JSON.parse(
  readFileSync(path.join(repoRoot, "config", "sync.json"), "utf8"),
);
const packageJson = JSON.parse(
  readFileSync(path.join(repoRoot, "package.json"), "utf8"),
);
const readmeEn = readFileSync(path.join(repoRoot, "README.md"), "utf8");
const readmeZh = readFileSync(path.join(repoRoot, "README.zh-CN.md"), "utf8");

describe("setup update default flow", () => {
  test("update does not add a redundant final confirmation or map cancellation to complete", () => {
    assert.doesNotMatch(source, /updateConfirmCopy/);
    assert.doesNotMatch(source, /return summarizeInstallStatus\(\[\]\)/);
  });
  const source = readFileSync(path.join(repoRoot, "setup.mjs"), "utf8");
  const i18nStrings = readFileSync(path.join(repoRoot, "config", "i18n", "setup-strings.mjs"), "utf8");
  const projectFileSafetySource = readFileSync(
    path.join(repoRoot, "scripts", "project-bootstrap-file-safety.mjs"),
    "utf8",
  );

  test("--update takes precedence over non-TTY silent install mode", () => {
    const mainSource = source.slice(source.indexOf("async function main()"));
    const updateBranch = mainSource.indexOf("if (updateMode)");
    const silentBranch = mainSource.indexOf("if (silentMode)");

    assert.ok(updateBranch >= 0, "main() must branch on updateMode");
    assert.ok(silentBranch >= 0, "main() must branch on silentMode");
    assert.ok(
      updateBranch < silentBranch,
      "--update must run runUpdate() before silentMode can fall back to runInstall()",
    );
  });

  test("silent mode list prompts choose defaults without waiting for stdin", () => {
    assert.match(
      source,
      /async function keyboardSelect[\s\S]*?if \(silentMode\) return 0;/,
      "single-select prompts must choose the first/default option in silent mode",
    );
    assert.match(
      source,
      /async function keyboardMultiSelect[\s\S]*?if \(silentMode\) return defaultIds;/,
      "multi-select prompts must choose default ids in silent mode",
    );
  });

  test("interactive prompts fall back before npm dependencies are installed", () => {
    assert.match(source, /function isMissingInquirerPromptsError/);
    assert.match(source, /async function importInquirerPrompt/);
    assert.match(source, /numberedSelectFallback\(question, options\)/);
    assert.match(
      source,
      /numberedMultiSelectFallback\(question, choices, defaultIds, hintText\)/,
    );
  });

  test("install/update direct-enter defaults stay on Claude Code and Codex", () => {
    assert.deepEqual(syncManifest.defaultTargets, ["claude", "codex"]);
    assert.match(
      packageJson.scripts["meta:deps:install"],
      /--targets claude,codex$/,
    );
    assert.match(
      packageJson.scripts["meta:deps:update"],
      /--update --targets claude,codex$/,
    );
    assert.match(
      packageJson.scripts["meta:deps:install:all-runtimes"],
      /--targets claude,codex,openclaw,cursor$/,
    );
    assert.match(
      packageJson.scripts["meta:deps:update:all-runtimes"],
      /--update --targets claude,codex,openclaw,cursor$/,
    );
    assert.match(
      source,
      /askMultiSelectTargets\(\s*t\.selectRuntimeTargets,\s*RUNTIME_CHOICES,\s*defaultTargets,\s*\)/,
    );
    assert.match(
      source,
      /const reselectTargets = await askYesNo\(t\.askReselectRuntimes, true\)/,
    );
  });

  test("install scope direct-enter default is global reusable capabilities", () => {
    const askScopeStart = source.indexOf("async function askInstallScope()");
    const askScopeEnd = source.indexOf("// ── Directory structure explanation", askScopeStart);
    const askScopeSource = source.slice(askScopeStart, askScopeEnd);

    assert.match(
      askScopeSource,
      /if \(silentMode\) return "global";/,
      "non-interactive scope default must be the recommended global capability path",
    );
    assert.doesNotMatch(
      askScopeSource,
      /promptInstallScope/,
      "interactive install/update must always show the global vs project choice",
    );
    assert.ok(
      askScopeSource.indexOf('id: "global"') < askScopeSource.indexOf('id: "project"'),
      "interactive direct-Enter must choose global scope before project-only",
    );
    assert.doesNotMatch(
      askScopeSource,
      /id: "both"|installScopeBoth/,
      "install scope must be a two-way choice: global or project directories",
    );
    assert.doesNotMatch(
      source,
      /cleanupLegacySkills\("both"\)/,
      "legacy two-scope install mode must not survive in project deploy helpers",
    );
  });

  test("global scope remembers global-only project projection mode", () => {
    assert.match(
      source,
      /async function rememberProjectProjectionMode\(mode\)/,
      "setup must expose a local override writer for project projection mode",
    );
    assert.match(
      source,
      /projectProjectionMode: mode/,
      "project projection mode must be persisted in local overrides",
    );
    assert.match(
      source,
      /await rememberProjectProjectionMode\(needGlobal \? "global_only" : "project"\);/,
      "install/update scope selection must switch global installs to global-only project projection mode",
    );
  });

  test("repo-local setup checks validate the global-only hook dependency pairs and active targets", () => {
    assert.match(
      source,
      /function checkProjectRuntimeSync\(runtimes, targetContext\) \{[\s\S]*?projectProjectionMode === "global_only"[\s\S]*?return checkGlobalOnlyProjectHookPairs\(\);[\s\S]*?return checkSync\(runtimes, targetContext\.activeTargets\);/,
      "global_only must validate its project hook dependency set instead of returning true unconditionally",
    );
    assert.match(source, /function checkGlobalOnlyProjectHookPairs\(\)/);
    assert.match(source, /\.claude\/hooks[\s\S]*?\.codex\/hooks[\s\S]*?\.cursor\/hooks/);
    assert.match(source, /activate-meta-theory-spine\.mjs/);
    assert.match(source, /project-root\.mjs/);
    const pairCheckStart = source.indexOf("function checkGlobalOnlyProjectHookPairs");
    const pairCheckEnd = source.indexOf("function checkProjectRuntimeSync", pairCheckStart);
    const pairCheckSource = source.slice(pairCheckStart, pairCheckEnd);
    assert.match(pairCheckSource, /readFileSync\(activator, "utf8"\)/);
    assert.match(pairCheckSource, /activatorExists && resolverExists && importsResolver/);
    assert.doesNotMatch(
      source.slice(
        source.indexOf("function checkProjectRuntimeSync"),
        source.indexOf("function reportProjectRuntimeSyncResult"),
      ),
      /return true;/,
      "global_only sync checks must not keep the old unconditional success path",
    );

    const checkOnlyStart = source.indexOf("if (checkOnly) {");
    const checkOnlyEnd = source.indexOf("const localState = getProfilePaths", checkOnlyStart);
    const checkOnlySource = source.slice(checkOnlyStart, checkOnlyEnd);
    assert.match(
      checkOnlySource,
      /const syncOk = checkProjectRuntimeSync\(detectedRuntimes, targetContext\)/,
      "--check must route through the global-only-aware sync check",
    );
    const checkOnlyBranch = source.slice(
      checkOnlyStart,
      source.indexOf("if (updateMode)", checkOnlyStart),
    );
    assert.match(checkOnlyBranch, /reportProjectRuntimeSyncResult\(syncOk\)/);
    assert.match(checkOnlyBranch, /process\.exit\(syncOk \? 0 : 1\)/);
    assert.doesNotMatch(
      checkOnlySource,
      /checkSync\(detectedRuntimes, targetContext\.supportedTargets\)/,
      "--check must not require every supported runtime projection",
    );

    const updateCheckStart = source.indexOf("// ── 6. checkSync (repo-local, project scope)");
    const updateCheckEnd = source.indexOf("console.log(`\\n${C.bold}${C.green}✓ ${t.updateComplete}", updateCheckStart);
    const updateCheckSource = source.slice(updateCheckStart, updateCheckEnd);
    assert.match(
      updateCheckSource,
      /if \(needProject\) \{[\s\S]*?checkSync\(runtimes, activeTargets\);[\s\S]*?\}/,
      "project-scope update validation must check only selected active targets",
    );
    assert.doesNotMatch(
      updateCheckSource,
      /supportedTargets/,
      "project-scope update validation must not expand to all supported runtimes",
    );

    const runCheckStart = source.indexOf("async function runCheck()");
    const runCheckEnd = source.indexOf("main().catch", runCheckStart);
    const runCheckSource = source.slice(runCheckStart, runCheckEnd);
    assert.match(
      runCheckSource,
      /const syncOk = checkProjectRuntimeSync\(runtimes, targetContext\)/,
      "runCheck() must route through the global-only-aware sync check",
    );
    assert.match(runCheckSource, /reportProjectRuntimeSyncResult\(syncOk\)/);
    assert.match(runCheckSource, /return syncOk;/);
    assert.doesNotMatch(
      runCheckSource,
      /checkSync\(runtimes, targetContext\.supportedTargets\)/,
      "runCheck() must not require every supported runtime projection",
    );
  });

  test("global cleanup preserves local override state", () => {
    const localStateStart = source.indexOf("const PROJECT_META_KIM_LOCAL_STATE_RELS");
    const localStateEnd = source.indexOf("const PROJECT_HOOK_REL_DIRS_BY_PLATFORM", localStateStart);
    const localStateSource = source.slice(localStateStart, localStateEnd);
    assert.doesNotMatch(
      localStateSource,
      /"\.meta-kim",/,
      "global cleanup must not remove .meta-kim/local.overrides.json",
    );
    assert.match(
      localStateSource,
      /"\.meta-kim\/state\/default\/project-bootstrap\.json"/,
      "cleanup can remove the old bootstrap manifest without deleting the whole local state root",
    );
  });

  test("cleanup exposes retryable failure states and keeps the manifest until retry closes", () => {
    assert.match(projectFileSafetySource, /const PROJECT_CLEANUP_RETRYABLE_REASONS = new Map/);
    assert.match(projectFileSafetySource, /\["backup_failed_preserved", "partial"\]/);
    assert.match(projectFileSafetySource, /\["manifest_hash_mismatch_preserved", "partial"\]/);
    assert.match(projectFileSafetySource, /\["legacy_manifest_missing_hash_preserved", "partial"\]/);
    assert.match(projectFileSafetySource, /\["unsafe_realpath_or_link_preserved", "blocked"\]/);
    assert.match(
      source,
      /preserveManifest: retryableBeforeLocalState\.length > 0/,
    );
    assert.match(
      source,
      /ok: results\.every\(\(result\) => result\.status === "ok"\)/,
    );
    assert.doesNotMatch(source, /metaKimProjectionSignature/);
    assert.match(
      source,
      /rel === "\.claude\/project-task-state\.json"[\s\S]*?!projectRemovalProof\(targetDir, rel\)/,
    );
  });

  test("install copy keeps reusable capabilities global by default", () => {
    assert.doesNotMatch(
      source,
      /Existing projects can use Meta_Kim without setup|现有项目无需安装即可使用|既存プロジェクトもセットアップ不要|기존 프로젝트도 설치 없이/,
      "setup copy must not claim global install automatically governs every existing project",
    );
    assert.match(
      i18nStrings,
      /Global capabilities \(recommended\)/,
      "English setup copy must name global capabilities as the recommended default",
    );
    assert.match(
      i18nStrings,
      /全局通用能力（推荐）/,
      "Chinese setup copy must name global capabilities as the recommended default",
    );
    assert.match(
      readmeEn,
      /default Enter path is \*\*global reusable capabilities\*\*/,
      "README must describe the default install as global capabilities",
    );
    assert.match(
      readmeZh,
      /默认直接回车的路径是：\*\*全局通用能力\*\*/,
      "Chinese README must describe the default install as global capabilities",
    );
    assert.deepEqual(syncManifest.projectMaterializationPolicy.globalByDefault, [
      "agents",
      "commands",
      "mcp",
      "skills",
    ]);
    assert.equal(
      syncManifest.projectMaterializationPolicy.projectRuntimeAssetCopyPolicy,
      "copy_to_project_when_explicit_project_update_or_project_dedicated_extension",
    );
    assert.doesNotMatch(
      `${readmeEn}\n${readmeZh}`,
      /global installation .* work in any project|全局安装后在任何项目中都能工作/s,
      "README must not collapse global capability into automatic project governance",
    );
  });

  test("silent mode update skips interactive project deploy prompt unless CLI/saved targets are requested", () => {
    const deployFunctionStart = source.indexOf(
      "async function askDeployDirectory()",
    );
    const deployFunctionEnd = source.indexOf(
      "function printProjectDeploySummary",
      deployFunctionStart,
    );
    const deploySource = source.slice(deployFunctionStart, deployFunctionEnd);
    const silentBranch = deploySource.indexOf("if (silentMode)");
    const emptyReturn = deploySource.indexOf("return [];", silentBranch);
    const selectPrompt = deploySource.indexOf("askSelect(");

    assert.ok(
      deployFunctionStart >= 0,
      "askDeployDirectory() must exist in setup.mjs",
    );
    assert.ok(
      silentBranch >= 0,
      "askDeployDirectory() must special-case silent/default flow",
    );
    assert.ok(
      deploySource.indexOf("cliProjectDeployDirs.length > 0") >= 0,
      "askDeployDirectory() must honor explicit CLI project targets before silent fallback",
    );
    assert.ok(
      deploySource.indexOf("useSavedProjectDirsMode") >= 0,
      "askDeployDirectory() must honor saved project targets before silent fallback",
    );
    assert.ok(
      emptyReturn > silentBranch,
      "askDeployDirectory() silent/default flow must choose no extra project deploy copy",
    );
    assert.ok(
      selectPrompt >= 0,
      "askDeployDirectory() must keep the interactive project deploy choice",
    );
    assert.ok(
      emptyReturn < selectPrompt,
      "askDeployDirectory() must return [] before prompting for project deploy directory",
    );
  });

  test("install and update separate global cleanup from project directory updates", () => {
    assert.match(
      source,
      /const deployDirs = needProject \? await askDeployDirectory\(\) : \[\];/,
      "global-only install/update must not ask for or write project deploy directories",
    );
    assert.match(
      source,
      /const cleanupDirs = needGlobal \? await askProjectCleanupDirectory\(\) : \[\];/,
      "global install/update may ask for cleanup-only redundant project asset removal",
    );
    assert.match(source, /cleanupProjectRedundancyDirs\(activeTargets, cleanupDirs\)/);
    assert.match(source, /projectCleanupMode/);
    assert.match(source, /runProjectCleanupCli/);
    assert.match(source, /--cleanup-projects/);
    assert.doesNotMatch(source, /includeSelfCleanup/);
    assert.match(
      source,
      /if \(deployDirs\.length > 0\) \{\s*const deployResults = await copyToDeployDirs\(activeTargets, deployDirs\);[\s\S]*?deployResults\.length === deployDirs\.length &&\s*deployResults\.every\(\(item\) => item\.status === "ok"\)/,
    );
    assert.match(source, /copyToDeployDirs\(activeTargets, targetDirs\)/);
    assert.match(source, /projectDeployProtectionNote/);
    assert.match(source, /projectCleanupProtectionNote/);
    assert.match(
      i18nStrings,
      /askProjectRedundantCleanup:\s*"[^"]*\\n[^"]*\\n[^"]*"/,
      "project cleanup prompt must be line-broken instead of one long terminal line",
    );
    const cleanupFunctionStart = source.indexOf(
      "async function askProjectCleanupDirectory()",
    );
    const cleanupFunctionEnd = source.indexOf(
      "function printProjectDeploySummary",
      cleanupFunctionStart,
    );
    const cleanupFunctionSource = source.slice(
      cleanupFunctionStart,
      cleanupFunctionEnd,
    );
    assert.ok(
      cleanupFunctionSource.indexOf("printProjectDeployDirList(") <
        cleanupFunctionSource.indexOf("askYesNo(t.askProjectRedundantCleanup"),
      "global cleanup must show saved project directories before asking y/N",
    );
    assert.match(
      source,
      /const wantCleanup = await askYesNo\(t\.askProjectRedundantCleanup, true\);[\s\S]*?if \(savedDirs\.length === 0\) \{[\s\S]*?const dirs = await collectProjectDeployDirs\(false\);/,
      "answering yes to global cleanup must force directory entry when no saved directories exist",
    );
    assert.match(
      cleanupFunctionSource,
      /projectCleanupUseSaved\(savedDirs\.length\)/,
      "cleanup mode must label saved project selection as cleanup, not update",
    );
    assert.match(
      cleanupFunctionSource,
      /projectCleanupSelectAndRemember/,
      "cleanup mode must label saved-directory edits as cleanup",
    );
    assert.match(
      cleanupFunctionSource,
      /projectCleanupSelectOnce/,
      "cleanup mode must label one-time directory selection as cleanup",
    );
    assert.doesNotMatch(
      cleanupFunctionSource,
      /projectDeployUseSaved\(savedDirs\.length\)|projectDeploySelectAndRemember|projectDeploySelectOnce/,
      "cleanup mode must not reuse project update menu labels",
    );
  });

  test("external project deploy reuses protected project bootstrap apply", () => {
    assert.match(source, /async function applyProjectBootstrapToDir\(activeTargets, targetDir\)/);
    assert.match(
      source,
      /const bootstrapResult = await applyProjectBootstrapToDir\(activeTargets, targetDir\);/,
    );
    assert.match(source, /writeProjectBootstrapManifest\(targetDir, plan, backup, cleanup\)/);
    assert.match(source, /createProjectBootstrapBackup\(targetDir, plan\.files\)/);
    const manifestWriteStart = source.indexOf("function writeProjectBootstrapManifest");
    const manifestWriteEnd = source.indexOf("const PROJECT_HOOK_DIRS_BY_PLATFORM", manifestWriteStart);
    const manifestWriteSource = source.slice(manifestWriteStart, manifestWriteEnd);
    assert.match(manifestWriteSource, /executeSafeManagedFileTransaction\(/);
    assert.match(manifestWriteSource, /phase: "manifest"/);
    assert.match(manifestWriteSource, /lockKey: "project-bootstrap-manifest"/);
    assert.doesNotMatch(manifestWriteSource, /writeJsonObject\(manifestPath/);
    assert.match(
      source,
      /const PROJECT_MUTATION_SESSION_LOCK_KEY = "project-mutation-session"/,
    );
    assert.equal(
      (source.match(/lockKey: PROJECT_MUTATION_SESSION_LOCK_KEY/g) ?? []).length,
      2,
      "bootstrap and cleanup must share the same outer project mutation lock",
    );
    assert.doesNotMatch(source, /project-(?:bootstrap|cleanup)-session/);
  });

  test("project install restores hooks while global cleanup removes project hook residue", () => {
    const applyStart = source.indexOf("async function applyProjectBootstrapToDir");
    const applyEnd = source.indexOf("function classifyProjectBootstrapError", applyStart);
    const applySource = source.slice(applyStart, applyEnd);
    assert.doesNotMatch(
      applySource,
      /migrateProjectMetaKimHooksForBootstrap/,
      "project install/apply must not run project hook cleanup first",
    );

    const deployStart = source.indexOf("function deployPlatformFiles");
    const deployEnd = source.indexOf("function buildPostCopyBootstrapScript", deployStart);
    const deploySource = source.slice(deployStart, deployEnd);
    assert.match(deploySource, /writeProjectGeneratedHooks\(platformId, targetDir\)/);

    const planStart = source.indexOf("function collectProjectDeployPlan");
    const planEnd = source.indexOf("function readPackageVersion", planStart);
    const planSource = source.slice(planStart, planEnd);
    assert.match(planSource, /projectHookGeneratedPlans\(platformId, targetDir\)/);

    const protectedJsonStart = source.indexOf("function plannedProtectedProjectDeployJson");
    const protectedJsonEnd = source.indexOf("function plannedProtectedProjectDeployText", protectedJsonStart);
    const protectedJsonSource = source.slice(protectedJsonStart, protectedJsonEnd);
    assert.doesNotMatch(
      protectedJsonSource,
      /stripProjectMetaKimHooksFromHookConfig/,
      "project install must merge hook config instead of stripping Meta_Kim hooks",
    );

    const cleanupStart = source.indexOf("async function cleanupProjectRedundancyDirs");
    const cleanupEnd = source.indexOf("async function copyToDeployDirs", cleanupStart);
    const cleanupSource = source.slice(cleanupStart, cleanupEnd);
    assert.match(
      cleanupSource,
      /migrateProjectMetaKimHooksForBootstrap\(\s*activeTargets,\s*targetDir,?\s*\)/,
    );
    assert.match(cleanupSource, /cleanupProjectHookConfigs\(activeTargets, targetDir\)/);

    const cleanupConfigStart = source.indexOf("function cleanupProjectHookConfigs");
    const cleanupConfigEnd = source.indexOf("async function cleanupProjectRedundancyDirs", cleanupConfigStart);
    const cleanupConfigSource = source.slice(cleanupConfigStart, cleanupConfigEnd);
    assert.match(cleanupConfigSource, /stripProjectMetaKimHooksFromHookConfig\(current\)/);

    const bootstrapApplyStart = source.indexOf("async function applyProjectBootstrapToDir");
    const bootstrapApplyEnd = source.indexOf("function classifyProjectBootstrapError", bootstrapApplyStart);
    const bootstrapApplySource = source.slice(bootstrapApplyStart, bootstrapApplyEnd);
    assert.match(
      bootstrapApplySource,
      /reportProjectAssetCleanup\(cleanup, \{ reason: "project_retarget" \}\)/,
      "project install retarget cleanup must use project-specific wording",
    );
    assert.match(
      cleanupSource,
      /reportProjectAssetCleanup\(cleanup, \{ reason: "global_redundancy" \}\)/,
      "global cleanup must keep global redundancy wording",
    );
    assert.doesNotMatch(
      cleanupSource,
      /resolve\(targetDir\) !== resolve\(PROJECT_DIR\)/,
      "global cleanup must not skip the Meta_Kim source workspace by default",
    );
  });

  test("install and update keep global hooks opt-in without a second Claude-only question", () => {
    assert.match(
      source,
      /const setupWithGlobalHooks =[\s\S]*?args\.includes\("--with-global-hooks"\)[\s\S]*?META_KIM_WITH_GLOBAL_HOOKS/,
      "setup must expose an explicit global hook opt-in",
    );
    assert.doesNotMatch(
      source.slice(source.indexOf("const setupWithGlobalHooks"), source.indexOf("function writeUtf8BomFileSync")),
      /!updateMode|!args\.includes\("--without-global-hooks"\)/,
      "fresh installs must not silently enable global hooks",
    );
    assert.match(source, /function metaTheoryGlobalSyncArgs\(targets, withGlobalHooks = false\)/);
    assert.deepEqual(
      buildGlobalMetaTheorySyncArgs({
        targets: ["claude", "cursor"],
        withGlobalHooks: true,
      }),
      ["--targets", "claude,cursor", "--with-global-hooks"],
      "sync-global-meta-theory must receive --with-global-hooks only after setup opt-in",
    );
    assert.deepEqual(
      buildGlobalMetaTheorySyncArgs({
        targets: ["cursor", "openclaw"],
        withGlobalHooks: true,
      }),
      ["--targets", "cursor,openclaw"],
    );
    assert.match(
      source,
      /function syncNonClaudeGlobalRuntimeHooks\(targets, withGlobalHooks = false\) \{[\s\S]*?if \(!withGlobalHooks\) return true;/,
      "Cursor/OpenClaw global runtime hooks must also be gated by the setup opt-in",
    );
    assert.doesNotMatch(source, /askAdvancedGlobalControls\(activeTargets\)/);
    assert.doesNotMatch(source, /askYesNo\(t\.askAdvancedGlobalControls/);
    assert.doesNotMatch(source, /announceGlobalRuntimeHooksPlan\(activeTargets\)/);
    assert.doesNotMatch(
      source,
      /下面只确认 Claude Code|是否在 Claude Code 启用同一套 Meta_Kim 全局治理规则/,
      "global sync must not show a redundant Claude Code-only confirmation",
    );
    assert.match(
      i18nStrings,
      /把 Meta_Kim 全局治理层同步到已选平台，供各项目复用？包含 agents、skills、MCP、Commands；全局 hooks 需要 --with-global-hooks。实际支持项会自动检查后同步。（推荐）/,
      "global sync prompt must name hooks as explicit opt-in",
    );
    assert.doesNotMatch(
      source,
      /包含 agents、skills、MCP、Commands、hooks 等/,
      "setup copy must not present hooks as part of the default global capability sync",
    );
    assert.match(source, /metaTheoryGlobalSyncArgs\(activeTargets, setupWithGlobalHooks\)/);
    assert.match(source, /syncNonClaudeGlobalRuntimeHooks\(\s*activeTargets,\s*setupWithGlobalHooks,\s*\)/);
    assert.match(source, /globalHooksOptInNotice/);
    assert.match(source, /\["cursor", "openclaw"\]\.includes\(target\)/);
    assert.doesNotMatch(
      source,
      /\["codex", "cursor", "openclaw"\]\.includes\(target\)/,
      "Codex global hooks are already owned by sync-global-meta-theory and must not be overwritten by sync-runtimes global sync",
    );
  });

  test("global update runs global skill and governance updates without extra yes/no prompts", () => {
    assert.doesNotMatch(source, /wantGlobalSkills/);
    assert.doesNotMatch(source, /wantMetaTheory/);
    assert.doesNotMatch(source, /askYesNo\(t\.askGlobalSkillsUpdate/);
    assert.doesNotMatch(source, /askYesNo\(t\.askMetaTheoryUpdate/);
    assert.match(source, /if \(needGlobal\) \{\s*const updateSkillIds = await resolveSelectedSkillDependencyIds\(\);/);
    assert.match(source, /if \(needGlobal\) \{\s*const updateSyncResult = runNodeScript/);
    assert.doesNotMatch(source, /updateSyncProjectSkipped/);
  });

  test("global-only install/update does not run project Graphify wiring", () => {
    assert.match(
      source,
      /installPythonTools\(activeTargets,\s*false,\s*PROJECT_DIR,\s*\{\s*projectWiring: needProject,\s*\}\)/,
    );
    assert.match(
      source,
      /installPythonTools\(activeTargets,\s*true,\s*PROJECT_DIR,\s*\{\s*projectWiring: needProject,\s*\}\)/,
    );
    assert.match(
      source,
      /const projectWiring = options\.projectWiring !== false;/,
    );
    assert.match(
      source,
      /if \(!projectWiring\) \{\s*skip\(t\.graphifyProjectWiringSkipped\);\s*return true;\s*\}/,
    );
  });
});
