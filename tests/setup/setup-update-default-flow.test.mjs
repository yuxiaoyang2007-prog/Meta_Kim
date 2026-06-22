import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  const source = readFileSync(path.join(repoRoot, "setup.mjs"), "utf8");

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

  test("repo-local setup checks honor global-only mode and active targets", () => {
    assert.match(
      source,
      /function checkProjectRuntimeSync\(runtimes, targetContext\) \{[\s\S]*?targetContext\.localOverrides\?\.projectProjectionMode !== "global_only"[\s\S]*?checkSync\(runtimes, targetContext\.activeTargets\);/,
      "repo-local runtime sync checks must be skipped when local overrides declare global_only",
    );

    const checkOnlyStart = source.indexOf("if (checkOnly) {");
    const checkOnlyEnd = source.indexOf("const localState = await ensureProfileState", checkOnlyStart);
    const checkOnlySource = source.slice(checkOnlyStart, checkOnlyEnd);
    assert.match(
      checkOnlySource,
      /checkProjectRuntimeSync\(detectedRuntimes, targetContext\)/,
      "--check must route through the global-only-aware sync check",
    );
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
      /checkProjectRuntimeSync\(runtimes, targetContext\)/,
      "runCheck() must route through the global-only-aware sync check",
    );
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

  test("install copy keeps reusable capabilities global by default", () => {
    assert.doesNotMatch(
      source,
      /Existing projects can use Meta_Kim without setup|现有项目无需安装即可使用|既存プロジェクトもセットアップ不要|기존 프로젝트도 설치 없이/,
      "setup copy must not claim global install automatically governs every existing project",
    );
    assert.match(
      source,
      /Global capabilities \(recommended\)/,
      "English setup copy must name global capabilities as the recommended default",
    );
    assert.match(
      source,
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
      "hooks",
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
    assert.match(source, /if \(deployDirs\.length > 0\) \{\s*await copyToDeployDirs\(activeTargets, deployDirs\);/);
    assert.match(source, /copyToDeployDirs\(activeTargets, targetDirs\)/);
    assert.match(source, /projectDeployProtectionNote/);
    assert.match(source, /projectCleanupProtectionNote/);
    assert.match(
      source,
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
    assert.match(cleanupSource, /migrateProjectMetaKimHooksForBootstrap\(activeTargets, targetDir\)/);
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

  test("install and update do not ask a second Claude-only global governance question", () => {
    assert.match(source, /function metaTheoryGlobalSyncArgs\(targets\)/);
    assert.match(source, /\["claude", "codex"\]\.includes\(target\)/);
    assert.match(source, /syncArgs\.push\("--with-global-hooks"\)/);
    assert.doesNotMatch(source, /askAdvancedGlobalControls\(activeTargets\)/);
    assert.doesNotMatch(source, /askYesNo\(t\.askAdvancedGlobalControls/);
    assert.doesNotMatch(source, /announceGlobalRuntimeHooksPlan\(activeTargets\)/);
    assert.doesNotMatch(
      source,
      /下面只确认 Claude Code|是否在 Claude Code 启用同一套 Meta_Kim 全局治理规则/,
      "global sync must not show a redundant Claude Code-only confirmation",
    );
    assert.match(
      source,
      /把 Meta_Kim 全局治理层同步到已选平台，供各项目复用？包含 agents、skills、MCP、Commands、hooks 等；实际支持项会自动检查后同步。（推荐）/,
      "global sync prompt must name the Meta_Kim governance layer and capability families",
    );
    assert.match(source, /metaTheoryGlobalSyncArgs\(activeTargets\)/);
    assert.match(source, /syncNonClaudeGlobalRuntimeHooks\(activeTargets\)/);
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
