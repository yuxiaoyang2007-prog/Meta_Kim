import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const CORE_LOOP_CONTRACT = JSON.parse(readFileSync("config/contracts/core-loop-contract.json", "utf8"));
const runFixtureRaw = readFileSync("tests/fixtures/run-artifacts/valid-core-loop-release-run.json", "utf8");
const RUN_FIXTURE = JSON.parse(runFixtureRaw);
const changelog = readFileSync("CHANGELOG.md", "utf8");
const changelogZh = readFileSync("CHANGELOG.zh-CN.md", "utf8");
const gitignore = readFileSync(".gitignore", "utf8");
const scriptsReadme = readFileSync("scripts/README.md", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const verifyRunnerSource = readFileSync("scripts/run-verify-all.mjs", "utf8");

test("core-loop release public evidence maps the default governed path", () => {
  assert.deepEqual(CORE_LOOP_CONTRACT.defaultEntry.spine, [
    "Critical",
    "Fetch",
    "Thinking",
    "Execution",
    "Review",
    "Meta-Review",
    "Verification",
    "Evolution",
  ]);
  assert.equal(CORE_LOOP_CONTRACT.defaultEntry.packageScript, "meta:theory:run");
  assert.equal(CORE_LOOP_CONTRACT.defaultEntry.contractIsDefaultPath, true);

  assert.equal(RUN_FIXTURE.runHeader.primaryDeliverable, "core-loop-governed-execution-repair");
  assert.match(RUN_FIXTURE.intentPacket.realIntent, /governed eight-stage core loop/);
  assert.ok(Array.isArray(RUN_FIXTURE.workerTaskPackets));
  assert.ok(RUN_FIXTURE.workerTaskPackets.length > 0);
  assert.equal(RUN_FIXTURE.verificationPacket.verified, true);
  assert.equal(RUN_FIXTURE.summaryPacket.publicReady, true);

  assert.ok(changelog.includes(`## [${packageJson.version}]`), "English changelog missing current version");
  assert.ok(changelogZh.includes(`## [${packageJson.version}]`), "Chinese changelog missing current version");
  assert.match(changelog, /Run-Scoped Worker Execution/);
  assert.match(changelogZh, /Run-scoped Worker 实机执行/);
});

test("docs PDR stays local-private and public fixtures avoid private paths", () => {
  assert.match(gitignore, /^docs\/\*\*/m);
  assert.doesNotMatch(gitignore, /^!docs\/pdr\//m);
  assert.doesNotMatch(gitignore, /^!docs\/pdr\/\*\.md/m);
  assert.doesNotMatch(runFixtureRaw, /docs\/pdr|current-core-loop-release/);
});

test("release verification path includes governance tests", () => {
  assert.match(packageJson.scripts["meta:verify:all"], /node scripts\/run-verify-all\.mjs/);
  assert.match(verifyRunnerSource, /npm run meta:verify:governance/);
  assert.match(packageJson.scripts["meta:verify:governance"], /npm run meta:test:governance/);
  assert.match(verifyRunnerSource, /npm run meta:graphify:check/);
  assert.match(verifyRunnerSource, /node scripts\/eval-meta-agents\.mjs --require-all-runtimes/);
});

test("script registry classifies scripts and protects cleanup candidates", () => {
  for (const bucket of [
    "Core engines",
    "Product/report generators",
    "Runtime evidence",
    "Sync/install/release",
    "Validators",
    "Doctor/status utilities",
    "Shared helpers",
  ]) {
    assert.ok(scriptsReadme.includes(bucket), `scripts README missing bucket ${bucket}`);
  }

  assert.match(scriptsReadme, /Do not prune scripts by filename count alone/);
  assert.match(scriptsReadme, /Before removing any script, check changelog history, release notes/);
});
