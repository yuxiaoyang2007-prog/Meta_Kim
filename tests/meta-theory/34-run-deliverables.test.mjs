import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { generateRunDeliverables } from "../../scripts/generate-meta-theory-run-deliverables.mjs";
import { runMetaTheoryGovernedExecution } from "../../scripts/run-meta-theory-governed-execution.mjs";
import { getReportLabels } from "../../scripts/meta-kim-i18n.mjs";
import { buildAgentProjectionTargets } from "../../scripts/runtime-tool-profiles.mjs";

const task = [
  "同一套 PRD review standard 需要 skill。",
  "长期 test coverage owner 需要 agent。",
  "release summary JSON 需要脚本。",
  "内部知识库需要 MCP provider 边界。",
].join("\n");

function hasLocalAbsolutePath(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /[A-Za-z]:[\\/]/.test(text) || /\/(?:Users|home|var|tmp|mnt)\//.test(text);
}

const requiredReportLabelFields = [
  "governedExecutionReportTitle",
  "panelTitle",
  "task",
  "inputTask",
  "gap",
  "decision",
  "reason",
  "blocked",
  "workerTask",
  "candidate",
  "type",
  "target",
  "dryRunWrites",
  "verification",
  "entry",
  "approvalRequired",
  "approvalValidation",
  "dryRunCanonicalWrites",
  "orchestrationReview",
  "writeback",
  "decisionRuns",
  "none",
  "notRun",
  "plainLanguageSummary",
  "capabilityRouteTitle",
  "capabilityType",
  "routeImpact",
  "cardPlanTitle",
  "cardDealer",
  "card",
  "cardShell",
  "cardWhy",
  "businessPhasePlanTitle",
  "phase",
  "mapsToSpine",
  "evidence",
  "spineRelationship",
  "durableAgentPolicyTitle",
];

function assertStringLabelSet(labels, fields) {
  for (const field of fields) {
    assert.equal(typeof labels[field], "string", `${field} should be a string`);
    assert.notEqual(labels[field].trim(), "", `${field} should not be empty`);
  }
}

function visibleTopLevelLabelText(labels) {
  return requiredReportLabelFields.map((field) => labels[field]).join("\n");
}

describe("34 — Meta-theory run deliverables", () => {
  test("report i18n covers all supported locales beyond English and Chinese", () => {
    const english = getReportLabels("en");
    const localeExpectations = [
      {
        locale: "zh-CN",
        card: /发牌/u,
        phase: /11 阶段业务流/u,
        route: /能力路线/u,
        durable: /持久 Agent/u,
      },
      {
        locale: "ja-JP",
        card: /カード配布/u,
        phase: /11フェーズ業務ワークフロー/u,
        route: /能力ルート/u,
        durable: /永続 Agent/u,
      },
      {
        locale: "ko-KR",
        card: /카드 배분/u,
        phase: /11단계 비즈니스 워크플로/u,
        route: /능력 경로/u,
        durable: /영구 Agent/u,
      },
    ];

    assertStringLabelSet(english, requiredReportLabelFields);
    assert.doesNotMatch(visibleTopLevelLabelText(english), /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u);
    assert.equal(typeof english.stageSummaries.critical, "function");
    assert.equal(typeof english.durableAgentPolicyBullets, "function");

    for (const { locale, card, phase, route, durable } of localeExpectations) {
      const labels = getReportLabels(locale);
      assertStringLabelSet(labels, requiredReportLabelFields);
      assert.match(labels.cardPlanTitle, card);
      assert.match(labels.businessPhasePlanTitle, phase);
      assert.match(labels.capabilityRouteTitle, route);
      assert.match(labels.durableAgentPolicyTitle, durable);
      assert.notEqual(labels.cardPlanTitle, english.cardPlanTitle);
      assert.notEqual(labels.businessPhasePlanTitle, english.businessPhasePlanTitle);
      assert.notEqual(labels.capabilityRouteTitle, english.capabilityRouteTitle);
      assert.notEqual(labels.durableAgentPolicyTitle, english.durableAgentPolicyTitle);
      assert.equal(typeof labels.stageSummaries.critical, "function");
      assert.equal(typeof labels.stageSummaries.review, "function");
      assert.equal(typeof labels.cardPlanSummary, "function");
      assert.equal(typeof labels.businessPhaseSummary, "function");
      assert.equal(typeof labels.durableAgentPolicyBullets, "function");
      const toolList = labels.toolList(labels.toolNames);
      assert.match(labels.stageSummaries.critical(toolList), new RegExp(toolList));
      assert.doesNotMatch(labels.stageSummaries.critical(toolList), /undefined|function/u);
      const policy = labels.durableAgentPolicyBullets(labels.toolProfiles);
      assert.ok(Array.isArray(policy));
      assert.ok(policy.length >= labels.toolProfiles.length + 2);
      assert.doesNotMatch(policy.join("\n"), /undefined|function/u);
      assert.equal(typeof labels.deliverableLinks.readabilityReview, "string");
      assert.equal(typeof labels.readability.title, "string");
      assert.equal(typeof labels.rubric.title, "string");
      assert.equal(typeof labels.casePack.title, "string");
      assert.equal(labels.productTasks.length, 4);
    }
    assert.doesNotMatch(visibleTopLevelLabelText(getReportLabels("ja-JP")), /[\uac00-\ud7af]/u);
    assert.doesNotMatch(visibleTopLevelLabelText(getReportLabels("ko-KR")), /[\u3040-\u30ff]/u);
  });

  test("generates separate UI, readability, rubric, and case-pack deliverables", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-deliverables-"));
    try {
      await runMetaTheoryGovernedExecution({
        task,
        runId: "test-run-deliverables",
        stateDir: tempDir,
        dbPath: path.join(tempDir, "runs.sqlite"),
      });
      const runArtifact = JSON.parse(
        await readFile(path.join(tempDir, "test-run-deliverables.json"), "utf8")
      );
      assert.deepEqual(runArtifact.stageVisibility.requiredStages, [
        "Critical",
        "Fetch",
        "Thinking",
        "Review",
      ]);
      assert.equal(runArtifact.durableProjectAgentPolicy.temporarySubagentAsDefinition, false);
      assert.deepEqual(
        runArtifact.durableProjectAgentPolicy.runtimeTargets,
        buildAgentProjectionTargets()
      );
      assert.ok(runArtifact.capabilityRoute.length >= 10);
      assert.equal(runArtifact.cardPlanPacket.schemaVersion, "card-plan-v0.1");
      assert.equal(runArtifact.cardPlanPacket.dealerOwner, "meta-conductor");
      assert.equal(runArtifact.cardPlanPacket.cards.length, 10);
      assert.deepEqual(
        runArtifact.cardPlanPacket.cards.map((item) => item.cardKey).sort(),
        [
          "clarify",
          "execute",
          "fix",
          "nudge",
          "options",
          "pause",
          "risk",
          "rollback",
          "shrink-scope",
          "verify",
        ]
      );
      assert.ok(runArtifact.cardPlanPacket.dealOrder.includes("pause"));
      assert.equal(
        runArtifact.businessPhasePlanPacket.schemaVersion,
        "business-phase-plan-v0.1"
      );
      assert.equal(runArtifact.businessPhasePlanPacket.phaseCount, 11);
      assert.deepEqual(
        runArtifact.businessPhasePlanPacket.phases.map((item) => item.phase),
        [
          "direction",
          "planning",
          "execution",
          "review",
          "meta_review",
          "revision",
          "verify",
          "summary",
          "feedback",
          "evolve",
          "mirror",
        ]
      );
      assert.equal(
        runArtifact.businessFlowBlueprintPacket.coverageJudgment,
        "pass_all_11_business_phases_recorded"
      );
      const markdown = await readFile(path.join(tempDir, "test-run-deliverables.zh-CN.md"), "utf8");
      assert.match(markdown, /Critical \/ Fetch \/ Thinking \/ Review/);
      assert.match(markdown, /## 发牌/);
      assert.match(markdown, /11 阶段业务流/);
      assert.match(markdown, /能力路线/);
      assert.match(markdown, /持久 Agent 策略/);
      assert.match(markdown, /\.claude\/agents\/\{agent\}\.md/);
      assert.match(markdown, /\.codex\/agents\/\{agent\}\.toml/);
      assert.match(markdown, /openclaw\/workspaces\/\{agent\}\/SOUL\.md/);
      assert.match(markdown, /\.cursor\/agents\/\{agent\}\.md/);
      assert.match(markdown, /partial 或 needs_probe/);
      const manifest = await generateRunDeliverables({
        runId: "test-run-deliverables",
        stateDir: tempDir,
        outDir: path.join(tempDir, "deliverables"),
      });

      assert.equal(manifest.schemaVersion, "meta-theory-run-deliverables-v0.1");
      assert.equal(manifest.status, "pass");
      assert.deepEqual(
        manifest.productTasks.map((item) => `${item.id}:${item.status}`),
        ["P-012:pass", "P-013:pass", "P-014:pass", "P-023:pass"]
      );
      assert.equal(hasLocalAbsolutePath(manifest), false);

      const filePaths = Object.fromEntries(
        Object.entries(manifest.files).map(([key, relativePath]) => [
          key,
          path.join(tempDir, "deliverables", path.basename(relativePath)),
        ])
      );
      for (const filePath of Object.values(filePaths)) {
        await stat(filePath);
      }

      const panel = await readFile(filePaths.panelHtml, "utf8");
      const labels = getReportLabels("zh-CN");
      const sectionLabels = labels.sections;
      assert.match(panel, /Meta_Kim 运行面板/);
      assert.match(panel, new RegExp(sectionLabels.decisionSummary));
      assert.match(panel, new RegExp(sectionLabels.ownerHandoff));
      assert.match(panel, new RegExp(sectionLabels.toolEvidenceShort));
      assert.match(panel, new RegExp(sectionLabels.aiReadableRubric));
      assert.equal(hasLocalAbsolutePath(panel), false);

      const readability = await readFile(filePaths.readabilityReview, "utf8");
      assert.match(readability, /字段翻译表/);
      assert.match(readability, /机器字段/);
      assert.match(readability, /人话标签/);
      assert.equal(hasLocalAbsolutePath(readability), false);

      const rubricJson = JSON.parse(await readFile(filePaths.rubricJson, "utf8"));
      assert.equal(rubricJson.schemaVersion, "ai-readable-run-rubric-v0.1");
      assert.deepEqual(
        rubricJson.criteria.map((item) => item.id),
        ["design", "execution", "acceptance", "feedback", "deliverables"]
      );
      assert.equal(hasLocalAbsolutePath(rubricJson), false);

      const rubricMarkdown = await readFile(filePaths.rubricMarkdown, "utf8");
      assert.match(rubricMarkdown, /设计标准/);
      assert.match(rubricMarkdown, /执行标准/);
      assert.match(rubricMarkdown, /验收标准/);
      assert.match(rubricMarkdown, /反馈标准/);
      assert.match(rubricMarkdown, /交付内容标准/);

      const casePack = await readFile(filePaths.casePack, "utf8");
      assert.match(casePack, /reviewer 该看到什么/);
      assert.match(casePack, /reviewer 怎么评分/);
      assert.match(casePack, /通过 \/ 失败样例/);
      assert.equal(hasLocalAbsolutePath(casePack), false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("CLI writes a manifest for the latest run", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-deliverables-cli-"));
    try {
      await runMetaTheoryGovernedExecution({
        task,
        runId: "test-run-deliverables-cli",
        stateDir: tempDir,
        dbPath: path.join(tempDir, "runs.sqlite"),
      });
      const result = spawnSync(
        process.execPath,
        [
          "scripts/generate-meta-theory-run-deliverables.mjs",
          "latest",
          tempDir,
          path.join(tempDir, "deliverables-cli"),
        ],
        { cwd: process.cwd(), encoding: "utf8" }
      );
      assert.equal(result.status, 0, result.stderr);
      const manifest = JSON.parse(result.stdout);
      assert.equal(manifest.runId, "test-run-deliverables-cli");
      assert.equal(manifest.files.panelHtml.endsWith("run-panel.html"), true);
      assert.equal(hasLocalAbsolutePath(manifest), false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
