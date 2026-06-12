import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const source = readFileSync(path.join(repoRoot, "setup.mjs"), "utf8");

function functionBody(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} not found`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, nextFunction === -1 ? undefined : nextFunction);
}

describe("project deploy protection", () => {
  test("batch project deploy targets come from CLI args, saved dirs, or explicit interaction", () => {
    assert.match(source, /const useSavedProjectDirsMode =/);
    assert.match(source, /const saveProjectDirsMode =/);
    assert.match(source, /function parseProjectDeployDirArgs/);
    assert.match(source, /"--project-dir", "--deploy-dir", "--target-dir"/);
    assert.match(source, /projectDeployDirs: normalized/);
    assert.match(source, /projectDeploySelectAndRemember/);
    assert.match(source, /projectDeployInteractiveHint/);
    assert.match(source, /projectDeployPathEntryHint/);
    assert.match(source, /projectDeploySavedListHeading/);
    assert.match(source, /projectDeployParsedTargets/);
    assert.match(source, /projectDeployConfirmSaveAndUpdate/);
    assert.match(source, /projectDeployConfirmUpdateOnce/);
    assert.match(source, /projectDeploySavedPathHint/);
    assert.match(source, /projectDeployCliSaveHint/);
  });

  test("interactive project deploy is a saved-list manager, not repeated yes/no prompts", () => {
    const collectBody = functionBody("collectProjectDeployDirs");
    const askBody = functionBody("askProjectDeployTargetDirectories");
    const parseBody = functionBody("parseProjectDeployDirText");
    const deployBody = functionBody("askDeployDirectory");

    assert.doesNotMatch(source, /projectDeployAddAnother/);
    assert.doesNotMatch(collectBody, /askYesNo\(t\.projectDeployAddAnother/);
    assert.match(parseBody, /\.split\(\s*\/\[;,，；\]\+\//);
    assert.match(parseBody, /replace\(\/\\r\?\\n\/g, ";"/);
    assert.match(askBody, /ask\(t\.projectDeployDirPrompt\)/);
    assert.match(deployBody, /printProjectDeployDirList\(\s*t\.projectDeploySavedListHeading/);
    assert.match(deployBody, /projectDeployUseSaved\(savedDirs\.length\)/);
    assert.ok(
      deployBody.indexOf('{ id: "remember"') < deployBody.indexOf('{ id: "once"'),
      "first-time interactive flow should default to saving the project list before one-time updates",
    );
  });

  test("project deploy skips local-only state and runtime-local configs", () => {
    const skipBody = functionBody("shouldSkipProjectDeployPath");

    assert.match(source, /const DEPLOY_LOCAL_STATE_PATHS = new Set/);
    assert.match(source, /\.claude\/settings\.local\.json/);
    assert.match(source, /\.claude\/project-task-state\.json/);
    assert.match(source, /\.claude\/scheduled_tasks\.lock/);
    assert.match(source, /const DEPLOY_SKIP_CONFIG_PATHS = new Set/);
    assert.match(source, /\.codex\/config\.toml/);
    assert.match(skipBody, /rel\.endsWith\("\/\.openclaw\/workspace-state\.json"\)/);
  });

  test("project deploy merges protected JSON configs instead of blind copying", () => {
    const deployFileBody = functionBody("copyProjectDeployFile");
    const mergeBody = functionBody("mergeProtectedProjectDeployFile");

    assert.match(source, /const DEPLOY_PROTECTED_JSON_PATHS = new Set/);
    assert.match(source, /\.claude\/settings\.json/);
    assert.match(source, /\.mcp\.json/);
    assert.match(source, /\.codex\/hooks\.json/);
    assert.match(source, /\.cursor\/hooks\.json/);
    assert.match(source, /\.cursor\/mcp\.json/);
    assert.match(source, /openclaw\/openclaw\.template\.json/);
    assert.match(deployFileBody, /DEPLOY_PROTECTED_JSON_PATHS\.has\(rel\)/);
    assert.match(deployFileBody, /mergeProtectedProjectDeployFile/);
    assert.match(mergeBody, /mergeRepoClaudeSettings\(base, generated, targetDir\)/);
    assert.match(mergeBody, /mergeMcpConfigPreserveBase\(base, generated\)/);
    assert.match(mergeBody, /mergeHookConfigPreserveBase\(base, generated\)/);
  });

  test("recursive project deploy computes relative paths from the repo root", () => {
    const deployBody = functionBody("deployPlatformFiles");
    const recursiveBody = functionBody("copyDirRecursive");

    assert.match(recursiveBody, /relative\(sourceRoot, srcPath\)/);
    assert.match(deployBody, /sourceRoot: PROJECT_DIR/);
  });

  test("external project deploy avoids exporting broken runtime MCP configs", () => {
    const prepareBody = functionBody("prepareProjectDeployJson");

    assert.match(prepareBody, /rel === "\.mcp\.json"/);
    assert.match(prepareBody, /rel === "\.cursor\/mcp\.json"/);
    assert.match(prepareBody, /return \{ mcpServers: \{\} \};/);
    assert.match(prepareBody, /delete parsed\.mcp\?\.servers\?\.\["meta-kim-runtime"\]/);
    assert.match(source, /rewriteProjectDirRefs\(raw, targetDir\)/);
  });
});
