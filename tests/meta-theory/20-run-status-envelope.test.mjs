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
    assert.deepEqual(envelope.authorityPolicy?.authorityModeEnum, [
      "managed_runtime_spine",
      "hook_observed_advisory",
    ]);
    assert.equal(envelope.authorityPolicy?.publicReadyAuthority, false);

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
      "authorityMode",
      "driverMode",
      "hookGateMode",
      "publicReadyAuthority",
      "publicReadyBoundary",
      "deactivatedAt",
      "deactivationReason",
      "continuationBoundary",
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
      assert.equal(active.authorityMode, "managed_runtime_spine");
      assert.equal(active.driverMode, "managed");
      assert.equal(active.hookGateMode, "block");
      assert.equal(active.publicReadyAuthority, false);
      assert.equal(active.publicReadyBoundary.status, "not_public_ready_authority");
      assert.equal(active.deactivatedAt, null);
      assert.equal(active.deactivationReason, null);
      assert.equal(active.continuationBoundary.status, "active_run");
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

  test("hook-observed advisory status is not managed runtime or public-ready authority", async () => {
    const spine = await import(
      `../../canonical/runtime-assets/shared/hooks/spine-state.mjs?observed=${Date.now()}`
    );
    const envelope = spine.createMetaRunStatusEnvelope({
      active: true,
      runId: "meta-observed-test",
      currentStage: "fetch",
      stageRuntimeControl: {
        activationMode: "hook_observed",
        driverMode: "hook_observed",
        hookGateMode: "advisory",
      },
      stages: {
        critical: { status: "completed" },
        fetch: { status: "in_progress" },
      },
    });

    assert.equal(envelope.currentStage, "Fetch");
    assert.equal(envelope.authorityMode, "hook_observed_advisory");
    assert.equal(envelope.driverMode, "hook_observed");
    assert.equal(envelope.hookGateMode, "advisory");
    assert.equal(envelope.publicReadyAuthority, false);
    assert.match(envelope.publicReadyBoundary.reason, /Public-ready requires/);
  });

  test("inactive session-stop status exposes continuation boundary", async () => {
    const spine = await import(
      `../../canonical/runtime-assets/shared/hooks/spine-state.mjs?inactive=${Date.now()}`
    );
    const envelope = spine.createMetaRunStatusEnvelope({
      active: false,
      runId: "meta-stopped-test",
      currentStage: "critical",
      deactivatedAt: "2026-06-20T18:27:05.423Z",
      deactivationReason: "session_stop",
      stages: {
        critical: { status: "in_progress" },
      },
    });

    assert.equal(envelope.active, false);
    assert.equal(envelope.deactivatedAt, "2026-06-20T18:27:05.423Z");
    assert.equal(envelope.deactivationReason, "session_stop");
    assert.equal(
      envelope.continuationBoundary.mode,
      "session_stop_requires_new_run_or_offline_audit",
    );
    assert.match(envelope.continuationBoundary.reason, /Inactive run status/);
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
    assert.match(combined, /normal assistant chat|ordinary assistant chat/i);
    assert.match(combined, /HookPrompt\s*\/\s*`additionalContext`/i);
    assert.match(combined, /route selected before Execution/i);
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

  test("status CLI resolves inactive output from the shared default locale", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-status-cli-"));
    try {
      const result = spawnSync(
        process.execPath,
        [path.join(__dirname, "..", "..", "scripts", "meta-run-status.mjs")],
        {
          cwd: tempDir,
          encoding: "utf8",
          env: {
            ...process.env,
            META_KIM_OUTPUT_LANGUAGE: "zh",
          },
        },
      );

      assert.equal(result.status, 0);
      assert.match(result.stdout, /Meta_Kim 治理状态：未运行/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("status CLI reports inactive session-stop boundary without active label", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-status-cli-"));
    try {
      const statusDir = path.join(tempDir, ".meta-kim", "state", "default");
      await mkdir(statusDir, { recursive: true });
      await writeFile(
        path.join(statusDir, "active-run.json"),
        JSON.stringify(
          {
            active: false,
            runId: "meta-stopped-cli",
            currentStage: "Critical",
            stageIndex: 1,
            stageTotal: 8,
            percent: 12,
            completed: [],
            next: "Fetch",
            blockedOn: null,
            deactivatedAt: "2026-06-20T18:27:05.423Z",
            deactivationReason: "session_stop",
            continuationBoundary: {
              status: "inactive_run",
              mode: "session_stop_requires_new_run_or_offline_audit",
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
          "--lang",
          "en",
        ],
        {
          cwd: tempDir,
          encoding: "utf8",
        },
      );

      assert.equal(result.status, 0);
      assert.match(result.stdout, /meta_governance_status=inactive/);
      assert.match(result.stdout, /reason=session stopped/);
      assert.match(result.stdout, /continuation=continue from local context or start a new run/);
      assert.doesNotMatch(result.stdout, /meta_governance_active/);
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
          "--lang",
          "en",
          "--details",
        ],
        {
          cwd: tempDir,
          encoding: "utf8",
        },
      );

      assert.equal(result.status, 0);
      assert.match(result.stdout, /Latest governed run/);
      assert.match(result.stdout, /latest_run=meta-latest-demo/);
      assert.match(result.stdout, /task=demo task/);
      assert.match(result.stdout, /status=passed/);
      assert.match(result.stdout, /public_ready=no/);
      assert.match(result.stdout, /summary=demo summary/);
      assert.match(
        result.stdout,
        /owner_handoff=meta-conductor->meta-warden\/verify/,
      );
      assert.match(
        result.stdout,
        /runtime_evidence=codex:passed\/runtime_live_pass\/passed; cursor:blocked\/unsupported\/native_harness_missing/,
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

      const localized = [
        ["zh", /最近一次治理运行/, /状态：通过/, /可交付：否/],
        ["ja", /最新のガバナンス実行/, /状態：合格/, /公開準備：いいえ/],
        ["ko", /최근 거버넌스 실행/, /상태: 통과/, /공개 준비: 아니요/],
      ];
      for (const [language, title, statusLabel, readyLabel] of localized) {
        const localeResult = spawnSync(
          process.execPath,
          [
            path.join(__dirname, "..", "..", "scripts", "meta-run-status.mjs"),
            "--latest",
            "--lang",
            language,
          ],
          { cwd: tempDir, encoding: "utf8" },
        );
        assert.equal(localeResult.status, 0, localeResult.stderr);
        assert.match(localeResult.stdout, title);
        assert.match(localeResult.stdout, statusLabel);
        assert.match(localeResult.stdout, readyLabel);
        assert.match(localeResult.stdout, /demo summary/);
        assert.doesNotMatch(localeResult.stdout, /owner_handoff|runtime_evidence/);
      }

      const jsonResult = spawnSync(
        process.execPath,
        [
          path.join(__dirname, "..", "..", "scripts", "meta-run-status.mjs"),
          "--latest",
          "--lang",
          "zh",
          "--json",
        ],
        { cwd: tempDir, encoding: "utf8" },
      );
      const machineSummary = JSON.parse(jsonResult.stdout);
      assert.equal(machineSummary.status, "pass");
      assert.equal(machineSummary.publicReady, "false");
      assert.equal(machineSummary.task, "demo task");
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
