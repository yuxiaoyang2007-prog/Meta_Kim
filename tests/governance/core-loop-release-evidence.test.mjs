import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import {
  captureReleaseSourceSnapshot,
  compareReleaseSourceSnapshotSequence,
  compareReleaseSourceSnapshots,
  computeLiveCertified,
  computeReleaseGrade,
  computeVerificationClaims,
  LIVE_CERTIFIED_STAGE,
  runAllRuntimeGlobalInstallUpdateProbe,
  runReleasePreflight,
  STAGES,
} from "../../scripts/run-verify-all.mjs";

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
  assert.match(verifyRunnerSource, /npm run meta:verify:governance:core/);
  assert.match(packageJson.scripts["meta:verify:governance:core"], /npm run meta:test:governance/);
  assert.match(packageJson.scripts["meta:verify:governance"], /meta:open-source-boundary:validate/);
  assert.match(packageJson.scripts["meta:verify:governance"], /meta:test:integration/);
  assert.doesNotMatch(packageJson.scripts["meta:verify:governance:core"], /meta:open-source-boundary:validate/);
  assert.doesNotMatch(packageJson.scripts["meta:verify:governance:core"], /meta:test:integration/);
  assert.match(verifyRunnerSource, /npm run meta:graphify:check/);
  assert.match(verifyRunnerSource, /node scripts\/eval-meta-agents\.mjs --require-all-runtimes/);
  assert.match(verifyRunnerSource, /npm run meta:acceptance:clean-room:require/);
  assert.doesNotMatch(
    packageJson.scripts["meta:verify:all:chain"],
    /npm run meta:acceptance:clean-room:require/,
    "standard release-grade chain must not require optional external live certification",
  );
  assert.match(packageJson.scripts["meta:verify:live-certified"], /--live-certified/);
  assert.match(
    packageJson.scripts["meta:verify:live-certified:chain"],
    /meta:verify:live-certified/,
  );
  assert.equal(
    packageJson.scripts["meta:verify:all:live"],
    "node scripts/eval-meta-agents.mjs --require-all-runtimes --live",
    "existing live runtime evaluation command must remain compatible",
  );
  for (const requiredStage of [
    "meta:verify:governance:core",
    "meta:test:inventory",
    "meta:test:unit",
    "meta:test:setup",
    "meta:test:meta-theory",
    "meta:test:integration",
  ]) {
    assert.equal(STAGES.some((stage) => stage.name === requiredStage), true, requiredStage);
  }
  assert.equal(STAGES.some((stage) => stage.name === LIVE_CERTIFIED_STAGE.name), false);
  assert.match(verifyRunnerSource, /releaseGrade/);
  assert.match(verifyRunnerSource, /续跑诊断通过/);
  assert.match(verifyRunnerSource, /--live-certified.*--from/);
  assert.match(
    packageJson.scripts["meta:acceptance:clean-room:require"],
    /require-clean-room-live-evidence\.mjs/,
  );
});

test("verify-all owns one stage manifest and expands deterministic checks once", () => {
  assert.equal(packageJson.scripts["meta:verify:all:chain"], "npm run meta:verify:all");
  const expandCommand = (command, ancestry = []) =>
    command.split(/\s*&&\s*/u).flatMap((part) => {
      const trimmed = part.trim();
      const npmRun = trimmed.match(/^npm run ([^\s]+)(?:\s+--(?:\s+.*)?)?$/u);
      if (!npmRun) return [trimmed];
      const scriptId = npmRun[1];
      assert.equal(ancestry.includes(scriptId), false, `script cycle: ${[...ancestry, scriptId].join(" -> ")}`);
      assert.equal(typeof packageJson.scripts[scriptId], "string", `missing script: ${scriptId}`);
      return expandCommand(packageJson.scripts[scriptId], [...ancestry, scriptId]);
    });
  const expandedIds = STAGES.flatMap((stage) => expandCommand(stage.cmd));
  assert.notDeepEqual(
    expandCommand("npm run meta:check -- --json"),
    ["npm run meta:check -- --json"],
    "npm argument forwarding must still expand the referenced script",
  );
  assert.equal(new Set(expandedIds).size, expandedIds.length, expandedIds.join("\n"));
  assert.equal(
    expandedIds.filter((id) => id.includes("validate-open-source-boundary.mjs")).length,
    1,
  );
  assert.equal(
    expandedIds.filter((id) => id.includes('tests/integration/*.test.mjs')).length,
    1,
  );
});

test("standard release-grade and optional live certification remain separate", () => {
  const standardResults = STAGES.map((stage) => ({ name: stage.name, status: "passed" }));
  const standardClaims = computeVerificationClaims({
    requested: false,
    results: standardResults,
    startIndex: 0,
  });
  assert.deepEqual(standardClaims, {
    releaseGrade: true,
    liveCertified: false,
    liveCertificationStatus: "not_requested",
  });
  const releaseGrade = computeReleaseGrade({ results: standardResults, startIndex: 0 });
  assert.equal(releaseGrade, true);
  assert.equal(
    computeLiveCertified({
      requested: false,
      releaseGrade,
      results: standardResults,
      startIndex: 0,
    }),
    false,
  );

  const liveResults = [
    ...standardResults,
    { name: LIVE_CERTIFIED_STAGE.name, status: "passed" },
  ];
  assert.equal(
    computeLiveCertified({
      requested: true,
      releaseGrade,
      results: liveResults,
      startIndex: 0,
    }),
    true,
  );

  const cleanRoomOnly = [
    {
      name: "meta:acceptance:clean-room:require",
      status: "passed",
    },
  ];
  assert.equal(
    computeReleaseGrade({ results: cleanRoomOnly, startIndex: STAGES.length }),
    false,
  );
  assert.equal(
    computeLiveCertified({
      requested: true,
      releaseGrade: false,
      results: STAGES.map((stage) => ({ name: stage.name, status: "passed" })),
      startIndex: STAGES.length,
    }),
    false,
  );
});

test("release-grade requires a stable captured source snapshot and all-runtime install/update proof", () => {
  const standardResults = STAGES.map((stage) => ({ name: stage.name, status: "passed" }));
  assert.equal(
    computeReleaseGrade({
      results: standardResults,
      startIndex: 0,
      sourceIntegrity: { releaseEligible: false },
      globalTargetProof: { status: "passed" },
    }),
    false,
  );
  assert.equal(
    computeReleaseGrade({
      results: standardResults,
      startIndex: 0,
      sourceIntegrity: { releaseEligible: true },
      globalTargetProof: { status: "failed" },
    }),
    false,
  );
  assert.equal(
    computeReleaseGrade({
      results: standardResults,
      startIndex: 0,
      sourceIntegrity: { releaseEligible: true },
      globalTargetProof: { status: "passed" },
      packedUserProof: { status: "failed" },
    }),
    false,
  );
  assert.equal(
    compareReleaseSourceSnapshots(
      {
        captureOk: true,
        head: "a",
        tree: "tree-a",
        dirty: false,
        diffHash: "diff-a",
        packageManifestHash: "pkg-a",
      },
      {
        captureOk: true,
        head: "b",
        tree: "tree-b",
        dirty: false,
        diffHash: "diff-b",
        packageManifestHash: "pkg-b",
      },
    ).releaseEligible,
    false,
  );
});

test("dirty but stable source content remains release-grade while commit eligibility stays false", () => {
  const dirtySnapshot = {
    captureOk: true,
    head: "head-a",
    tree: "tree-a",
    dirty: true,
    diffHash: "diff-a",
    packageManifestHash: "pkg-a",
  };
  const sourceIntegrity = compareReleaseSourceSnapshots(
    dirtySnapshot,
    { ...dirtySnapshot },
  );
  assert.equal(sourceIntegrity.stable, true);
  assert.equal(sourceIntegrity.releaseEligible, true);
  assert.equal(sourceIntegrity.cleanCommitEligible, false);
  assert.ok(sourceIntegrity.mismatchReasons.includes("source_dirty_at_start"));
  const sequenceIntegrity = compareReleaseSourceSnapshotSequence([
    { label: "invocation", snapshot: dirtySnapshot },
    { label: "post_probe", snapshot: { ...dirtySnapshot } },
    { label: "final", snapshot: { ...dirtySnapshot } },
  ]);
  assert.equal(sequenceIntegrity.stable, true);
  assert.equal(sequenceIntegrity.releaseEligible, true);
  assert.equal(sequenceIntegrity.cleanCommitEligible, false);
  assert.equal(
    computeReleaseGrade({
      results: STAGES.map((stage) => ({ name: stage.name, status: "passed" })),
      startIndex: 0,
      sourceIntegrity,
      globalTargetProof: { status: "passed" },
    }),
    true,
  );
});

test("release preflight rejects a source mutation inside the probe window", () => {
  const invocation = {
    captureOk: true,
    head: "head-a",
    tree: "tree-a",
    dirty: false,
    diffHash: "diff-a",
    packageManifestHash: "pkg-a",
  };
  let current = invocation;
  const preflight = runReleasePreflight({
    captureSnapshot: () => ({ ...current }),
    runProbe: () => {
      current = {
        ...current,
        dirty: true,
        diffHash: "diff-mutated-during-probe",
      };
      return { status: "passed" };
    },
    runPackedProbe: () => ({ status: "passed" }),
  });

  assert.equal(preflight.globalTargetProof.status, "passed");
  assert.equal(preflight.sourceIntegrity.stable, false);
  assert.equal(preflight.sourceIntegrity.releaseEligible, false);
  assert.ok(
    preflight.sourceIntegrity.mismatchReasons.includes("diffHash_changed_during_verification"),
  );
  assert.deepEqual(
    preflight.sourceIntegrity.windows.map(({ from, to }) => ({ from, to })),
    [{ from: "invocation", to: "post_probe" }],
  );

  const completeIntegrity = compareReleaseSourceSnapshotSequence([
    { label: "invocation", snapshot: preflight.sourceSnapshot.invocation },
    { label: "post_probe", snapshot: preflight.sourceSnapshot.postProbe },
    { label: "final", snapshot: { ...preflight.sourceSnapshot.postProbe } },
  ]);
  assert.equal(completeIntegrity.releaseEligible, false);
  assert.equal(
    computeReleaseGrade({
      results: STAGES.map((stage) => ({ name: stage.name, status: "passed" })),
      startIndex: 0,
      sourceIntegrity: completeIntegrity,
      globalTargetProof: preflight.globalTargetProof,
    }),
    false,
  );
});

test("source snapshot binds HEAD tree diff state and package manifest and rejects mid-run mutation", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "meta-kim-release-snapshot-"));
  const runGit = (...args) =>
    spawnSync("git", args, { cwd: tempRoot, encoding: "utf8", windowsHide: true });
  try {
    assert.equal(runGit("init", "--quiet").status, 0);
    writeFileSync(path.join(tempRoot, "package.json"), '{"name":"fixture","version":"1.0.0"}\n');
    writeFileSync(path.join(tempRoot, "tracked.txt"), "initial\n");
    assert.equal(runGit("add", ".").status, 0);
    assert.equal(
      runGit(
        "-c",
        "user.name=Meta Kim Test",
        "-c",
        "user.email=meta-kim@example.invalid",
        "commit",
        "--quiet",
        "-m",
        "fixture",
      ).status,
      0,
    );

    const clean = captureReleaseSourceSnapshot(tempRoot);
    assert.equal(clean.captureOk, true);
    assert.equal(clean.dirty, false);
    assert.match(clean.head, /^[a-f0-9]{40}$/u);
    assert.match(clean.tree, /^[a-f0-9]{40}$/u);
    assert.match(clean.diffHash, /^[a-f0-9]{64}$/u);
    assert.match(clean.packageManifestHash, /^[a-f0-9]{64}$/u);

    writeFileSync(path.join(tempRoot, "tracked.txt"), "changed\n");
    const dirty = captureReleaseSourceSnapshot(tempRoot);
    const comparison = compareReleaseSourceSnapshots(clean, dirty);
    assert.equal(dirty.dirty, true);
    assert.equal(comparison.stable, false);
    assert.equal(comparison.releaseEligible, false);
    assert.ok(comparison.mismatchReasons.includes("diffHash_changed_during_verification"));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("all-runtime release preflight performs real isolated install and update artifacts", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "meta-kim-release-probe-test-"));
  const installerScript = path.join(tempRoot, "fake-installer.mjs");
  try {
    writeFileSync(
      installerScript,
      [
        'import { mkdirSync, writeFileSync } from "node:fs";',
        'import path from "node:path";',
        'const runtimes = ["claude", "codex", "openclaw", "cursor"];',
        'for (const runtime of runtimes) {',
        '  const home = process.env[`META_KIM_${runtime.toUpperCase()}_HOME`];',
        '  const target = path.join(home, "skills", "planning-with-files");',
        '  mkdirSync(target, { recursive: true });',
        '  writeFileSync(path.join(target, "SKILL.md"), "# planning-with-files\\n");',
        '}',
        'process.stdout.write(process.argv.includes("--update") ? "updated\\n" : "installed\\n");',
      ].join("\n"),
    );
    const progress = [];
    const stableSnapshot = {
      captureOk: true,
      head: "head-a",
      tree: "tree-a",
      dirty: false,
      diffHash: "diff-a",
      packageManifestHash: "package-a",
    };
    const preflight = runReleasePreflight({
      captureSnapshot: () => ({ ...stableSnapshot }),
      onProgress: (event) => progress.push(event),
      runProbe: ({ onProgress }) => runAllRuntimeGlobalInstallUpdateProbe({
        cwd: tempRoot,
        installerScript,
        environment: process.env,
        onProgress,
      }),
      runPackedProbe: () => ({
        status: "passed",
        sourcePolicy: "npm_pack_extracted_public_cli",
      }),
    });
    const proof = preflight.globalTargetProof;
    assert.equal(proof.status, "passed", proof.error);
    assert.deepEqual(proof.targets, ["claude", "codex", "openclaw", "cursor"]);
    assert.deepEqual(proof.modes.map((mode) => mode.mode), ["install", "update"]);
    assert.equal(proof.modes.every((mode) => mode.status === "passed"), true);
    assert.equal(
      proof.modes.every((mode) => mode.artifactProof.length === 4),
      true,
    );
    assert.equal(proof.artifactProof.length, 4);
    assert.equal(proof.identicalArtifactHash, true);
    assert.equal(proof.sourcePolicy, "external_declared_dependency_no_local_fallback");
    assert.equal(preflight.packedUserProof.status, "passed");
    assert.equal(
      preflight.packedUserProof.sourcePolicy,
      "npm_pack_extracted_public_cli",
    );
    assert.equal(progress[0].event, "release_preflight_start");
    assert.ok(progress[0].expectedDurationMs >= 360_000);
    assert.deepEqual(
      progress
        .filter((event) => event.event === "runtime_probe_mode_start" || event.event === "runtime_probe_mode_complete")
        .map((event) => [event.event, event.mode, event.status ?? null]),
      [
        ["runtime_probe_mode_start", "install", null],
        ["runtime_probe_mode_complete", "install", "passed"],
        ["runtime_probe_mode_start", "update", null],
        ["runtime_probe_mode_complete", "update", "passed"],
      ],
    );
    assert.equal(progress.at(-1).event, "release_preflight_complete");
    assert.equal(progress.at(-1).status, "passed");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
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
