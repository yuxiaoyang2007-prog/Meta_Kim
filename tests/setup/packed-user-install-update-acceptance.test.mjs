import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  HISTORICAL_UPDATE_REF,
  PACKED_USER_TARGETS,
} from "../../scripts/verify-packed-user-install-update.mjs";

const acceptanceSource = readFileSync(
  "scripts/verify-packed-user-install-update.mjs",
  "utf8",
);
const verifyAllSource = readFileSync("scripts/run-verify-all.mjs", "utf8");
const setupSource = readFileSync("setup.mjs", "utf8");

function functionSource(name, nextName) {
  const start = setupSource.indexOf(`async function ${name}(`);
  const end = setupSource.indexOf(`async function ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `unable to isolate ${name}`);
  return setupSource.slice(start, end);
}

function acceptanceFunctionSource(name, nextName) {
  const start = acceptanceSource.indexOf(`function ${name}(`);
  const end = acceptanceSource.indexOf(`function ${nextName}(`, start + 1);
  assert.ok(start >= 0 && end > start, `unable to isolate acceptance ${name}`);
  return acceptanceSource.slice(start, end);
}

test("packed user acceptance runs public install and update from an npm-packed candidate", () => {
  assert.deepEqual(PACKED_USER_TARGETS, ["claude", "codex", "openclaw", "cursor"]);
  assert.equal(HISTORICAL_UPDATE_REF, "v2.8.85");
  assert.match(acceptanceSource, /npm["'], \["pack"/u);
  assert.match(acceptanceSource, /path\.join\(workspace, "bin", "meta-kim\.mjs"\)/u);
  assert.match(acceptanceSource, /\["install", "update", "update"\]/u);
  assert.match(acceptanceSource, /global-only CLI polluted ordinary cwd/u);
  assert.match(acceptanceSource, /second packed user update changed managed artifacts/u);
  assert.match(acceptanceSource, /global install manifest is missing required entries/u);
});

test("every packed CLI install and update lane uses all four runtime targets", () => {
  for (const [name, nextName] of [
    ["runPublicCli", "runPublicProjectCli"],
    ["runPublicProjectCli", "runPublicGlobalUpdateFromProject"],
    ["runPublicGlobalUpdateFromProject", "runProjectCapabilityCopy"],
  ]) {
    assert.match(
      acceptanceFunctionSource(name, nextName),
      /"--targets",[\s\S]*?PACKED_USER_TARGETS\.join\(","\)/u,
      `${name} must pass all four targets to the real packed CLI`,
    );
  }
  const historicalLane = acceptanceFunctionSource(
    "runHistoricalUpdateLane",
    "runPackedUserInstallUpdateAcceptance",
  );
  assert.match(
    historicalLane,
    /historicalPackage\.workspace[\s\S]*?"--targets",[\s\S]*?PACKED_USER_TARGETS\.join\(","\)/u,
    "the historical seed must install all four runtime targets",
  );
  assert.match(
    historicalLane,
    /runPublicCli\(packageInfo\.workspace, roots, env, "update", timeoutMs\)/u,
    "the historical upgrade must use the same four-target packed update entry",
  );
  assert.match(acceptanceSource, /targets: \[\.\.\.PACKED_USER_TARGETS\]/u);
});

test("packed acceptance fingerprints Cursor and OpenClaw global and project artifacts", () => {
  for (const requiredPath of [
    /cursorSkill: path\.join\(roots\.cursorHome, "skills", "meta-theory", "SKILL\.md"\)/u,
    /openclawSkill: path\.join\(roots\.openclawHome, "skills", "meta-theory", "SKILL\.md"\)/u,
    /cursorSkill: path\.join\(projectDir, "\.cursor", "skills", "meta-theory", "SKILL\.md"\)/u,
    /cursorMcp: path\.join\(projectDir, "\.cursor", "mcp\.json"\)/u,
    /openclawSkill: path\.join\(projectDir, "openclaw", "skills", "meta-theory", "SKILL\.md"\)/u,
    /openclawTemplate: path\.join\(projectDir, "openclaw", "openclaw\.template\.json"\)/u,
  ]) {
    assert.match(acceptanceSource, requiredPath);
  }
});

test("packed user acceptance covers project install/update and runtime-sedimented ownership", () => {
  assert.match(acceptanceSource, /"--scope",\s*"project"/u);
  assert.match(acceptanceSource, /runPublicProjectCli/u);
  assert.match(acceptanceSource, /`packed project \$\{mode\}`/u);
  assert.match(acceptanceSource, /"project",\s*"capability",\s*"copy"/u);
  for (const type of ["agent", "skill", "command"]) {
    assert.match(acceptanceSource, new RegExp(`type: "${type}"`, "u"));
  }
  assert.match(acceptanceSource, /preserved_project_copy/u);
  assert.match(acceptanceSource, /dependencyUpdatePolicy === "preserve_project_copy"/u);
  assert.match(acceptanceSource, /global update overwrote the project-owned/u);
  assert.match(acceptanceSource, /runGlobalReuseNegativeLane/u);
  assert.match(acceptanceSource, /packet\?\.decision !== "use_global_directly"/u);
  assert.match(acceptanceSource, /use_global_directly created project copies/u);
  assert.match(acceptanceSource, /use_global_directly added project capability ownership entries/u);
});

test("packed global update refreshes a bootstrapped project without overwriting user-owned project state", () => {
  assert.match(acceptanceSource, /runPublicGlobalUpdateFromProject/u);
  assert.match(acceptanceSource, /"update",[\s\S]*?"--scope",[\s\S]*?"global"/u);
  assert.match(acceptanceSource, /cwd: roots\.projectDir/u);
  assert.match(acceptanceSource, /readValidatedProjectBootstrapManifest/u);
  assert.match(acceptanceSource, /meta-kim-project-bootstrap-v0\.1/u);
  assert.match(acceptanceSource, /project-aware global update did not refresh the global Codex skill/u);
  assert.match(acceptanceSource, /manifest_managed_projection_replace/u);
  assert.match(acceptanceSource, /managed_block_preserve_user_text/u);
  assert.match(acceptanceSource, /project-aware global update changed an unknown user project file/u);
  assert.match(acceptanceSource, /project capability manifest was not prepared before the global update/u);
  assert.match(acceptanceSource, /project-aware global update overwrote the runtime-sedimented/u);
  assert.match(acceptanceSource, /runtimeSedimentedCopiesPreserved: true/u);
  assert.match(acceptanceSource, /project-aware global update changed the existing project projection mode/u);
  assert.match(acceptanceSource, /projectProjectionModePreserved: true/u);
  assert.match(acceptanceSource, /freshGlobalUpdateCreatedProjectCopies: false/u);
});

test("setup persists project projection mode only after successful project-scope completion", () => {
  const installSource = functionSource("runInstall", "runUpdate");
  const updateSource = functionSource("runUpdate", "runCheck");
  const installSummaryIndex = installSource.indexOf("summarizeInstallStatus(stepResults)");
  const installModeWriteIndexes = [
    ...installSource.matchAll(/rememberProjectProjectionMode/gu),
  ].map((match) => match.index);

  assert.ok(installSummaryIndex >= 0);
  assert.equal(installModeWriteIndexes.length, 1);
  assert.ok(
    installModeWriteIndexes[0] > installSummaryIndex,
    "cancelled or failed install must not persist a projection mode",
  );
  const updateSummaryIndex = updateSource.indexOf("summarizeInstallStatus(stepResults)");
  const updateModeWriteIndexes = [
    ...updateSource.matchAll(/rememberProjectProjectionMode/gu),
  ].map((match) => match.index);
  assert.equal(updateModeWriteIndexes.length, 1);
  assert.ok(
    updateModeWriteIndexes[0] > updateSummaryIndex,
    "failed project update must not persist a projection mode",
  );
  assert.match(updateSource, /needProject\s*&&[\s\S]*rememberProjectProjectionMode/u);
});

test("verify-all blocks release-grade when packed public CLI acceptance fails", () => {
  assert.match(verifyAllSource, /runPackedUserInstallUpdateAcceptance/u);
  assert.match(verifyAllSource, /packedUserProof\.status !== "passed"/u);
  assert.match(verifyAllSource, /packed-user-install-update-acceptance/u);
  assert.match(verifyAllSource, /npm-packed public CLI/u);
});
