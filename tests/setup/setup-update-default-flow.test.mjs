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

  test("install scope direct-enter default is global capability plus current project projection", () => {
    const askScopeStart = source.indexOf("async function askInstallScope()");
    const askScopeEnd = source.indexOf("// ── Directory structure explanation", askScopeStart);
    const askScopeSource = source.slice(askScopeStart, askScopeEnd);

    assert.match(
      askScopeSource,
      /if \(silentMode \|\| !promptInstallScope\) return "both";/,
      "non-interactive scope default must be the recommended global+project path",
    );
    assert.ok(
      askScopeSource.indexOf('id: "both"') < askScopeSource.indexOf('id: "project"'),
      "interactive direct-Enter must choose the recommended both scope before project-only",
    );
    assert.ok(
      askScopeSource.indexOf('id: "both"') < askScopeSource.indexOf('id: "global"'),
      "interactive direct-Enter must choose the recommended both scope before global-only",
    );
  });

  test("install copy preserves project projection as the default governance boundary", () => {
    assert.doesNotMatch(
      source,
      /Existing projects can use Meta_Kim without setup|现有项目无需安装即可使用|既存プロジェクトもセットアップ不要|기존 프로젝트도 설치 없이/,
      "setup copy must not claim global install automatically governs every existing project",
    );
    assert.match(
      source,
      /Global \+ project \(recommended\)/,
      "English setup copy must name the recommended default as global plus project",
    );
    assert.match(
      source,
      /全局 \+ 项目（推荐）/,
      "Chinese setup copy must name the recommended default as global plus project",
    );
    assert.match(
      readmeEn,
      /global reusable capabilities \+ the current project's target-selected projection/,
      "README must describe the default install as global capabilities plus target-selected project projection",
    );
    assert.match(
      readmeZh,
      /全局通用能力 \+ 当前项目按目标平台选择的完整投影/,
      "Chinese README must describe the default install as global capabilities plus target-selected project projection",
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

  test("install and update project deploy exports run only for project-enabled scopes", () => {
    assert.match(
      source,
      /const deployDirs = needProject \? await askDeployDirectory\(\) : \[\];/,
      "global-only install/update must not ask for or write project deploy directories",
    );
    assert.match(source, /if \(deployDirs\.length > 0\) \{\s*await copyToDeployDirs\(activeTargets, deployDirs\);/);
    assert.match(source, /copyToDeployDirs\(activeTargets, targetDirs\)/);
    assert.match(source, /projectDeployProtectionNote/);
  });

  test("external project deploy reuses protected project bootstrap apply", () => {
    assert.match(source, /async function applyProjectBootstrapToDir\(activeTargets, targetDir\)/);
    assert.match(
      source,
      /const bootstrapResult = await applyProjectBootstrapToDir\(activeTargets, targetDir\);/,
    );
    assert.match(source, /writeProjectBootstrapManifest\(targetDir, plan, backup\)/);
    assert.match(source, /createProjectBootstrapBackup\(targetDir, plan\.files\)/);
  });

  test("install and update keep advanced global hooks behind explicit second confirmation", () => {
    assert.match(source, /function metaTheoryGlobalSyncArgs\(targets,\s*options = \{\}\)/);
    assert.match(source, /options\.includeGlobalHooks/);
    assert.match(source, /askAdvancedGlobalControls\(activeTargets\)/);
    assert.match(source, /askYesNo\(t\.askAdvancedGlobalControls, false\)/);
    assert.match(
      source,
      /metaTheoryGlobalSyncArgs\(activeTargets,\s*\{\s*includeGlobalHooks: includeAdvancedGlobalControls,\s*\}\)/,
      "install/update global meta-theory sync must pass hooks only after second confirmation",
    );
  });

  test("project-only update does not ask for global skill or meta-theory writes", () => {
    assert.match(
      source,
      /const wantGlobalSkills = needGlobal\s*\?\s*await askYesNo\(t\.askGlobalSkillsUpdate, true\)\s*:\s*false;/,
    );
    assert.match(
      source,
      /const wantMetaTheory = needGlobal\s*\?\s*await askYesNo\(t\.askMetaTheoryUpdate, true\)\s*:\s*false;/,
    );
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
