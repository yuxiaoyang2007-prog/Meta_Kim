import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

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

  test("install and update project deploy exports run as protected batches", () => {
    assert.match(source, /const deployDirs = await askDeployDirectory\(\);/);
    assert.match(source, /if \(deployDirs\.length > 0\) \{\s*await copyToDeployDirs\(activeTargets, deployDirs\);/);
    assert.match(source, /copyToDeployDirs\(activeTargets, targetDirs\)/);
    assert.match(source, /projectDeployProtectionNote/);
  });

  test("install and update sync global Claude hooks for cleanup", () => {
    assert.match(source, /function metaTheoryGlobalSyncArgs\(targets\)/);
    assert.match(source, /syncArgs\.push\("--with-global-hooks"\)/);
    assert.match(
      source,
      /runNodeScript\(\s*"scripts\/sync-global-meta-theory\.mjs",\s*metaTheoryGlobalSyncArgs\(activeTargets\)/,
      "install/update global meta-theory sync must opt into Claude hook cleanup",
    );
  });
});
