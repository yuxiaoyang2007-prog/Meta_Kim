import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, readFile as readRepoFile } from "./_helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("meta-theory run status envelope", () => {
  test("workflow contract defines cross-runtime public run status", async () => {
    const contract = await readJson("config/contracts/workflow-contract.json");
    const envelope = contract.runDiscipline?.runStatusEnvelope;

    assert.ok(envelope?.enabled, "runStatusEnvelope must be enabled");
    assert.equal(envelope.schemaVersion, 1);
    assert.equal(
      envelope.stateFiles?.activeRun,
      ".meta-kim/state/{profile}/active-run.json",
    );
    assert.equal(
      envelope.stateFiles?.perRunStatus,
      ".meta-kim/state/{profile}/runs/{runId}/status.json",
    );
    assert.equal(envelope.pathPolicy?.crossPlatform, true);
    assert.equal(envelope.pathPolicy?.useNodePathJoin, true);
    assert.equal(envelope.pathPolicy?.mustStayWithin, ".meta-kim/state");
    assert.equal(envelope.publicDisplayPolicy?.primaryDisplay, "conversation_notice");
    assert.equal(envelope.publicDisplayPolicy?.popupRequired, false);

    for (const field of [
      "active",
      "runId",
      "currentStage",
      "stageIndex",
      "stageTotal",
      "percent",
      "completed",
      "next",
      "blockedOn",
      "surfaceMode",
      "resolvedOutputLanguage",
      "languageResolution",
      "publicSurface",
      "publicLabels",
      "stagePurpose",
      "stagePurposeKey",
    ]) {
      assert.ok(
        envelope.requiredFields.includes(field),
        `runStatusEnvelope must require ${field}`,
      );
    }

    for (const runtime of ["claude", "codex", "cursor", "openclaw"]) {
      assert.ok(
        envelope.runtimeAdapters?.[runtime],
        `runStatusEnvelope must document ${runtime} adapter behavior`,
      );
    }
  });

  test("spine-state writes active-run and per-run status files", async () => {
    // Isolate language-resolution env vars: resolveOutputLanguage() falls back
    // to process.env.LANG / META_KIM_OUTPUT_LANGUAGE / LC_ALL / LANGUAGE when no
    // higher-priority candidate is present. Host shells (e.g. zh_CN.UTF-8)
    // leak LANG into the test process and flip languageResolution.source from
    // "not_resolved" to "environment", breaking the assertions below. Save +
    // clear before the test, restore in finally so other tests are unaffected.
    const savedLang = {
      LANG: process.env.LANG,
      LC_ALL: process.env.LC_ALL,
      LANGUAGE: process.env.LANGUAGE,
      META_KIM_OUTPUT_LANGUAGE: process.env.META_KIM_OUTPUT_LANGUAGE,
    };
    delete process.env.LANG;
    delete process.env.LC_ALL;
    delete process.env.LANGUAGE;
    delete process.env.META_KIM_OUTPUT_LANGUAGE;

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-status-"));
    try {
      const spine = await import(
        `../../canonical/runtime-assets/shared/hooks/spine-state.mjs?test=${Date.now()}`
      );

      let state = spine.createInitialState({
        taskClassification: "meta_theory_auto",
        triggerReason: "skill_activation_auto",
      });
      await spine.writeSpineState(tempDir, state);

      const activePath = path.join(
        tempDir,
        ".meta-kim",
        "state",
        "default",
        "active-run.json",
      );
      let active = JSON.parse(await readFile(activePath, "utf8"));

      assert.equal(active.active, true);
      assert.equal(active.currentStage, "Critical");
      assert.equal(active.stageIndex, 1);
      assert.equal(active.stageTotal, 8);
      assert.equal(active.percent, 12);
      assert.equal(active.resolvedOutputLanguage, "undetermined");
      assert.equal(active.languageResolution.source, "not_resolved");
      assert.equal(active.stagePurposeKey, "critical");
      assert.equal(active.publicSurface.primaryDisplay, "conversation_notice");
      assert.equal(active.publicSurface.popupRequired, false);
      assert.ok(active.runId.startsWith("meta-"));

      const perRunPath = path.join(
        tempDir,
        ".meta-kim",
        "state",
        "default",
        "runs",
        active.runId,
        "status.json",
      );
      const perRun = JSON.parse(await readFile(perRunPath, "utf8"));
      assert.equal(perRun.runId, active.runId);

      state = spine.advanceStage(state, "fetch");
      await spine.writeSpineState(tempDir, state);
      active = JSON.parse(await readFile(activePath, "utf8"));

      assert.equal(active.currentStage, "Fetch");
      assert.equal(active.stageIndex, 2);
      assert.equal(active.percent, 25);
      assert.deepEqual(active.completed, ["Critical"]);
      assert.equal(active.next, "Thinking");
      assert.equal(active.stagePurposeKey, "fetch");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
      for (const [k, v] of Object.entries(savedLang)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  test("skill and notice template describe the public status surface", async () => {
    const skill = await readRepoFile("canonical/skills/meta-theory/SKILL.md");
    const notice = await readRepoFile(
      "canonical/templates/user-interaction/notice-template.md",
    );
    const combined = `${skill}\n${notice}`;

    assert.match(combined, /runStatusEnvelope/);
    assert.match(combined, /\.meta-kim\/state\/\{profile\}\/active-run\.json/);
    assert.match(combined, /\{localizedActiveLabel\}: \{Current Stage\}/);
    assert.match(combined, /runtime\/tool selected output language first/);
    assert.match(combined, /publicLabels/);
    assert.match(combined, /latest input language/);
    assert.match(combined, /Do not hardcode|hardcode/i);
    assert.match(combined, /must not expose internal protocol fields/i);
    assert.match(combined, /Preflight/);
    assert.match(combined, /conversation_fallback/);
  });

  test("public notice template does not make English labels the default", async () => {
    const notice = await readRepoFile(
      "canonical/templates/user-interaction/notice-template.md",
    );

    assert.doesNotMatch(
      notice,
      /```markdown\s*Meta governance active: \{Current Stage\}/,
      "notice template must start from localized labels, not fixed English labels",
    );
    assert.match(notice, /Do not hardcode any single human language/);
  });

  test("status CLI returns neutral inactive output without hardcoded language", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-status-cli-"));
    try {
      const result = spawnSync(
        process.execPath,
        [path.join(__dirname, "..", "..", "scripts", "meta-run-status.mjs")],
        {
          cwd: tempDir,
          encoding: "utf8",
        },
      );

      assert.equal(result.status, 0);
      assert.match(result.stdout, /meta_governance_status=inactive/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("status CLI uses runtime-provided active output labels", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-status-cli-"));
    try {
      const statusDir = path.join(tempDir, ".meta-kim", "state", "default");
      await mkdir(statusDir, { recursive: true });
      await writeFile(
        path.join(statusDir, "active-run.json"),
        JSON.stringify(
          {
            active: true,
            currentStage: "Fetch",
            stageIndex: 2,
            stageTotal: 8,
            percent: 25,
            completed: ["Critical"],
            next: "Thinking",
            blockedOn: null,
            stagePurpose: "P_FETCH",
            publicLabels: {
              active: "L_ACTIVE",
              completed: "L_DONE",
              current: "L_CURRENT",
              next: "L_NEXT",
              blocked: "L_BLOCKED",
              none: "L_NONE",
              separator: "=>",
              listSeparator: "|",
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = spawnSync(
        process.execPath,
        [path.join(__dirname, "..", "..", "scripts", "meta-run-status.mjs")],
        {
          cwd: tempDir,
          encoding: "utf8",
        },
      );

      assert.equal(result.status, 0);
      assert.match(result.stdout, /L_ACTIVE=>Fetch/);
      assert.match(result.stdout, /L_DONE=>Critical/);
      assert.match(result.stdout, /L_CURRENT=>P_FETCH/);
      assert.match(result.stdout, /L_NEXT=>Thinking/);
      assert.match(result.stdout, /L_BLOCKED=>L_NONE/);
      assert.doesNotMatch(result.stdout, /^Completed:/m);
      assert.doesNotMatch(result.stdout, /^Current:/m);
      assert.doesNotMatch(result.stdout, /^Next:/m);
      assert.doesNotMatch(result.stdout, /^Blocked:/m);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("status CLI summarizes latest governed execution artifact", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-status-cli-"));
    try {
      const executionDir = path.join(
        tempDir,
        ".meta-kim",
        "state",
        "default",
        "governed-executions",
      );
      await mkdir(executionDir, { recursive: true });

      const runId = "meta-latest-demo";
      const jsonPath = `.meta-kim/state/default/governed-executions/${runId}.json`;
      const markdownPath = `.meta-kim/state/default/governed-executions/${runId}.zh-CN.md`;
      await writeFile(
        path.join(executionDir, "latest.json"),
        JSON.stringify(
          {
            runId,
            jsonPath,
            markdownPath,
          },
          null,
          2,
        ),
        "utf8",
      );
      await writeFile(
        path.join(executionDir, `${runId}.json`),
        JSON.stringify(
          {
            runId,
            status: "pass",
            task: "demo task",
            publicReadyDecision: {
              publicReady: false,
              status: "partial",
            },
            runReportPanelContract: {
              decisionSummary: {
                plainLanguageSummary: "demo summary",
              },
              ownerHandoff: [
                {
                  owner: "meta-conductor",
                  mergeOwner: "meta-warden",
                  verificationOwner: "verify",
                },
              ],
            },
            runtimeEvidencePacket: {
              records: [
                {
                  runtime: "codex",
                  status: "pass",
                  evidenceKind: "runtime_live_pass",
                  failureClass: "pass",
                  strictReleasePass: true,
                },
                {
                  runtime: "cursor",
                  status: "blocked",
                  evidenceKind: "unsupported",
                  failureClass: "native_harness_missing",
                  strictReleasePass: false,
                  remainingAction:
                    "Keep Cursor as compatibility until native harness is available.",
                },
              ],
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = spawnSync(
        process.execPath,
        [
          path.join(__dirname, "..", "..", "scripts", "meta-run-status.mjs"),
          "--latest",
        ],
        {
          cwd: tempDir,
          encoding: "utf8",
        },
      );

      assert.equal(result.status, 0);
      assert.match(result.stdout, /latest_run=meta-latest-demo/);
      assert.match(result.stdout, /task=demo task/);
      assert.match(result.stdout, /status=pass/);
      assert.match(result.stdout, /public_ready=false/);
      assert.match(result.stdout, /summary=demo summary/);
      assert.match(
        result.stdout,
        /owner_handoff=meta-conductor->meta-warden\/verify/,
      );
      assert.match(
        result.stdout,
        /runtime_evidence=codex:pass\/runtime_live_pass\/pass; cursor:blocked\/unsupported\/native_harness_missing/,
      );
      assert.match(
        result.stdout,
        /release_boundary=cursor: Keep Cursor as compatibility until native harness is available\./,
      );
      assert.match(result.stdout, new RegExp(`report=${markdownPath}`));
      assert.match(
        result.stdout,
        /next_command=npm run meta:theory:report -- --run-id meta-latest-demo/,
      );
      const escapedTempDir = tempDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.doesNotMatch(result.stdout, new RegExp(escapedTempDir));
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("status CLI rejects latest artifact paths outside governed execution state", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-status-cli-"));
    try {
      const executionDir = path.join(
        tempDir,
        ".meta-kim",
        "state",
        "default",
        "governed-executions",
      );
      await mkdir(executionDir, { recursive: true });
      await writeFile(
        path.join(executionDir, "latest.json"),
        JSON.stringify(
          {
            runId: "unsafe-demo",
            jsonPath: "outside.json",
          },
          null,
          2,
        ),
        "utf8",
      );
      await writeFile(
        path.join(tempDir, "outside.json"),
        JSON.stringify({ runId: "unsafe-demo" }, null, 2),
        "utf8",
      );

      const result = spawnSync(
        process.execPath,
        [
          path.join(__dirname, "..", "..", "scripts", "meta-run-status.mjs"),
          "--latest",
        ],
        {
          cwd: tempDir,
          encoding: "utf8",
        },
      );

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Refusing to read governed execution artifact/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
