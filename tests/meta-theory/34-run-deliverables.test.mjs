import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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

const naturalUserTask = "帮我做个小红书营销自动发布器";

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
  "agent",
  "skill",
  "mcp",
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
        stagePlan: /阶段执行说明/u,
      },
      {
        locale: "ja-JP",
        card: /カード配布/u,
        phase: /11フェーズ業務ワークフロー/u,
        route: /能力ルート/u,
        durable: /永続 Agent/u,
        stagePlan: /ステージ実行説明/u,
      },
      {
        locale: "ko-KR",
        card: /카드 배분/u,
        phase: /11단계 비즈니스 워크플로/u,
        route: /능력 경로/u,
        durable: /영구 Agent/u,
        stagePlan: /단계 실행 설명/u,
      },
    ];

    assertStringLabelSet(english, requiredReportLabelFields);
    assert.doesNotMatch(visibleTopLevelLabelText(english), /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u);
    assert.equal(typeof english.stageSummaries.critical, "function");
    assert.equal(typeof english.durableAgentPolicyBullets, "function");
    assert.equal(typeof english.userExperienceNotice.title, "string");
    assert.equal(typeof english.userExperienceNotice.signals.routeSummary, "function");
    assert.equal(typeof english.userExperienceNotice.partialStatusReason, "string");
    assert.equal(typeof english.userExperienceNotice.emittedStatusReason, "function");
    assert.equal(typeof english.conversationNotice.title, "string");
    assert.equal(typeof english.conversationNotice.routeDetail, "function");
    assert.equal(typeof english.stageOperationPlan.title, "string");
    assert.equal(typeof english.stageOperationPlan.executionResult, "function");

    for (const { locale, card, phase, route, durable, stagePlan } of localeExpectations) {
      const labels = getReportLabels(locale);
      assertStringLabelSet(labels, requiredReportLabelFields);
      assert.match(labels.cardPlanTitle, card);
      assert.match(labels.businessPhasePlanTitle, phase);
      assert.match(labels.capabilityRouteTitle, route);
      assert.match(labels.durableAgentPolicyTitle, durable);
      assert.match(labels.stageOperationPlan.title, stagePlan);
      assert.notEqual(labels.cardPlanTitle, english.cardPlanTitle);
      assert.notEqual(labels.businessPhasePlanTitle, english.businessPhasePlanTitle);
      assert.notEqual(labels.capabilityRouteTitle, english.capabilityRouteTitle);
      assert.notEqual(labels.durableAgentPolicyTitle, english.durableAgentPolicyTitle);
      assert.notEqual(labels.stageOperationPlan.title, english.stageOperationPlan.title);
      assert.notEqual(
        labels.stageOperationPlan.executionTitle,
        english.stageOperationPlan.executionTitle,
      );
      assert.equal(typeof labels.stageSummaries.critical, "function");
      assert.equal(typeof labels.stageSummaries.review, "function");
      assert.equal(typeof labels.userExperienceNotice.title, "string");
      assert.equal(typeof labels.userExperienceNotice.expectation, "string");
      assert.equal(typeof labels.userExperienceNotice.signals.ownerHandoff, "function");
      assert.equal(typeof labels.userExperienceNotice.partialStatusReason, "string");
      assert.equal(typeof labels.userExperienceNotice.emittedStatusReason, "function");
      assert.equal(typeof labels.conversationNotice.title, "string");
      assert.equal(typeof labels.conversationNotice.stageProgressDetail, "string");
      assert.equal(typeof labels.conversationNotice.routeDetail, "function");
      assert.equal(typeof labels.stageOperationPlan.title, "string");
      assert.equal(typeof labels.stageOperationPlan.stages.execution.whatHappens, "string");
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
      assert.equal(runArtifact.cardPlanPacket.schemaVersion, "card-plan-v0.2");
      assert.equal(
        runArtifact.userExperienceNotice.schemaVersion,
        "user-experience-notice-v0.1"
      );
      assert.equal(runArtifact.conversationNotice.schemaVersion, "conversation-notice-v0.1");
      assert.equal(runArtifact.conversationNotice.status, "not_emitted");
      assert.equal(runArtifact.conversationNotice.emitted, false);
      assert.equal(runArtifact.conversationNotice.emittedTextSha256, null);
      assert.equal(runArtifact.userExperienceNotice.status, "partial");
      assert.equal(runArtifact.userExperienceNotice.primarySurface, "user_readable_run_report");
      assert.equal(
        runArtifact.userExperienceNotice.pendingPrimarySurface,
        "localized_conversation_notice"
      );
      assert.equal(runArtifact.userExperienceNotice.secondarySurface, "user_readable_run_report");
      assert.equal(runArtifact.userExperienceNotice.conversationNoticeEmitted, false);
      assert.equal(runArtifact.userExperienceNotice.conversationNoticeEvidence, null);
      assert.match(
        runArtifact.userExperienceNotice.statusReason,
        /还没有发出 runtime conversation notice|no runtime conversation notice/i
      );
      assert.ok(
        runArtifact.userExperienceNotice.internalOnlySignals.includes(
          "orchestrationTaskBoardPacket"
        )
      );
      assert.match(
        runArtifact.userExperienceNotice.accuracyBoundary,
        /artifact|运行时 notice|可读报告/i
      );
      assert.match(
        runArtifact.userExperienceNotice.mustNotClaim,
        /内部 artifact|internal artifact/i
      );
      assert.equal(
        runArtifact.stageOperationPlan.schemaVersion,
        "stage-operation-plan-v0.1"
      );
      assert.deepEqual(
        runArtifact.stageOperationPlan.stages.map((item) => item.stage),
        ["Critical", "Fetch", "Thinking", "Execution", "Review"]
      );
      const executionStage = runArtifact.stageOperationPlan.stages.find(
        (item) => item.stage === "Execution"
      );
      assert.equal(
        executionStage.workerTasks.length,
        runArtifact.runReportPanelContract.ownerHandoff.length
      );
      assert.ok(
        executionStage.workerTasks.every(
          (item) => item.owner && item.skill && item.mcp && item.command && item.resultReport
        )
      );
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
      assert.equal(runArtifact.cardPlanPacket.dealStandard.coveragePass, true);
      assert.equal(runArtifact.cardPlanPacket.dealStandard.passThreshold, 80);
      assert.ok(runArtifact.cardPlanPacket.dealStandard.minimumScore >= 80);
      assert.ok(runArtifact.cardPlanPacket.dealStandard.activeCount >= 1);
      assert.ok(runArtifact.cardPlanPacket.dealStandard.suppressedCount >= 1);
      for (const card of runArtifact.cardPlanPacket.cards) {
        assert.equal(typeof card.decisionEvaluation.activationRule, "string");
        assert.notEqual(card.decisionEvaluation.activationRule.trim(), "");
        assert.ok(
          card.decisionEvaluation.accuracyScore >= card.decisionEvaluation.passThreshold,
          `${card.cardKey} card decision should pass`
        );
        assert.ok(
          Array.isArray(card.decisionEvaluation.quantitativeSignals),
          `${card.cardKey} should expose quantitative signals`
        );
        assert.ok(
          card.decisionEvaluation.quantitativeSignals.length >= 3,
          `${card.cardKey} should expose at least 3 quantitative signals`
        );
        assert.ok(
          card.decisionEvaluation.quantitativeSignals.every(
            (signal) =>
              typeof signal.signal === "string" &&
              "observed" in signal &&
              "expected" in signal &&
              typeof signal.pass === "boolean"
          ),
          `${card.cardKey} should expose signal/observed/expected/pass fields`
        );
        assert.ok(card.decisionEvaluation.evidenceRefs.length >= 1);
        assert.ok(card.decisionEvaluation.falsificationChecks.length >= 1);
      }
      assert.equal(
        runArtifact.cardPlanPacket.cards.find((item) => item.cardKey === "risk")
          .decisionEvaluation.decisionState,
        "accurate_interrupt"
      );
      assert.equal(
        runArtifact.cardPlanPacket.cards.find((item) => item.cardKey === "fix")
          .decisionEvaluation.decisionState,
        "accurate_suppress"
      );
      assert.equal(
        runArtifact.governanceStartReasonPacket.schemaVersion,
        "governance-start-reason-v0.1"
      );
      assert.equal(runArtifact.governanceStartReasonPacket.placement, "run_start");
      assert.match(runArtifact.governanceStartReasonPacket.summary, /进入 Meta-Theory/);
      assert.match(runArtifact.governanceStartReasonPacket.spineReason, /触发 8 阶段/);
      assert.match(runArtifact.governanceStartReasonPacket.workflowReason, /触发 11 阶段/);
      assert.match(runArtifact.governanceStartReasonPacket.cardReason, /触发发牌/);
      for (const line of [
        runArtifact.governanceStartReasonPacket.summary,
        runArtifact.governanceStartReasonPacket.spineReason,
        runArtifact.governanceStartReasonPacket.workflowReason,
        runArtifact.governanceStartReasonPacket.cardReason,
      ]) {
        assert.ok(line.length <= 120, `start reason should stay concise: ${line}`);
      }
      assert.equal(
        runArtifact.businessPhasePlanPacket.schemaVersion,
        "business-phase-plan-v0.2"
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
      assert.equal(runArtifact.businessPhasePlanPacket.triggerStandard.coveragePass, true);
      assert.equal(runArtifact.businessPhasePlanPacket.triggerStandard.passThreshold, 80);
      assert.ok(runArtifact.businessPhasePlanPacket.triggerStandard.minimumScore >= 80);
      for (const phase of runArtifact.businessPhasePlanPacket.phases) {
        assert.equal(typeof phase.triggerEvaluation.activationRule, "string");
        assert.notEqual(phase.triggerEvaluation.activationRule.trim(), "");
        assert.ok(
          phase.triggerEvaluation.triggerScore >= phase.triggerEvaluation.passThreshold,
          `${phase.phase} trigger score should pass`
        );
        assert.ok(
          Array.isArray(phase.triggerEvaluation.quantitativeSignals),
          `${phase.phase} should expose quantitative signals`
        );
        assert.ok(
          phase.triggerEvaluation.quantitativeSignals.length >= 3,
          `${phase.phase} should expose at least 3 quantitative signals`
        );
        assert.ok(
          phase.triggerEvaluation.quantitativeSignals.every(
            (signal) =>
              typeof signal.signal === "string" &&
              "observed" in signal &&
              "expected" in signal &&
              typeof signal.pass === "boolean"
          ),
          `${phase.phase} should expose signal/observed/expected/pass fields`
        );
        assert.ok(
          phase.triggerEvaluation.evidenceRefs.length >= 1,
          `${phase.phase} should cite evidence refs`
        );
        assert.ok(
          phase.triggerEvaluation.falsificationChecks.length >= 1,
          `${phase.phase} should expose falsification checks`
        );
      }
      assert.equal(
        runArtifact.businessPhasePlanPacket.phases.find((item) => item.phase === "revision")
          .triggerEvaluation.activationState,
        "accurate_skip"
      );
      assert.equal(
        runArtifact.businessPhasePlanPacket.phases.find((item) => item.phase === "feedback")
          .triggerEvaluation.activationState,
        "pending_external_input"
      );
      assert.equal(
        runArtifact.businessFlowBlueprintPacket.coverageJudgment,
        "complete"
      );
      assert.equal(
        runArtifact.businessFlowBlueprintPacket.coverageDetail,
        "pass_all_11_business_phases_trigger_evaluated"
      );
      assert.equal(
        runArtifact.businessFlowBlueprintPacket.phaseTriggerStandard.coveragePass,
        true
      );
      const markdown = await readFile(path.join(tempDir, "test-run-deliverables.zh-CN.md"), "utf8");
      assert.match(markdown, /Critical \/ Fetch \/ Thinking \/ Review/);
      assert.match(markdown, /## 开始原因/);
      assert.match(markdown, /触发 8 阶段/);
      assert.match(markdown, /触发 11 阶段/);
      assert.match(markdown, /触发发牌/);
      assert.match(markdown, /## 发牌/);
      assert.match(markdown, /Deal standard/);
      assert.match(markdown, /accurate_interrupt/);
      assert.match(markdown, /accurate_suppress/);
      assert.match(markdown, /## 用户体验提示/);
      assert.match(markdown, /用户只用普通自然语言输入/);
      assert.match(markdown, /还没有发出 runtime conversation notice/);
      assert.match(markdown, /内部 artifact/);
      assert.match(markdown, /## Meta-Theory 可见编排面/);
      assert.match(markdown, /Dynamic Workflow/);
      assert.match(markdown, /能力发现/);
      assert.match(markdown, /Peer Agent Mesh/);
      assert.match(markdown, /LangGraph-style/);
      assert.match(markdown, /能力发现矩阵/);
      assert.match(markdown, /真实能力调用状态/);
      assert.match(markdown, /agent_subagent/);
      assert.match(markdown, /app_visible_subagent/);
      assert.match(markdown, /selected_not_invoked/);
      assert.match(markdown, /## 阶段执行说明/);
      assert.match(markdown, /要做什么/);
      assert.match(markdown, /结果长什么样/);
      assert.match(markdown, /## 三目标产品验收/);
      assert.match(markdown, /P-102/);
      assert.match(markdown, /P-103/);
      assert.match(markdown, /P-104/);
      assert.match(markdown, /P-105/);
      assert.match(markdown, /P-106/);
      assert.match(markdown, /P-107/);
      assert.match(markdown, /P-108/);
      assert.match(markdown, /P-109/);
      assert.match(markdown, /## 执行编排明细/);
      assert.match(markdown, /Agent/);
      assert.match(markdown, /Skill/);
      assert.match(markdown, /MCP/);
      assert.match(markdown, /npm run meta:gap:orchestrate/);
      assert.match(markdown, /11 阶段业务流/);
      assert.match(markdown, /Trigger standard/);
      assert.match(markdown, /accurate_skip/);
      assert.match(markdown, /pending_external_input/);
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

  test("natural-language meta-theory trigger still shows stage and execution handoff", async () => {
    assert.doesNotMatch(naturalUserTask, /agent|skill|MCP|command|阶段|packet|JSON/i);
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-natural-user-"));
    try {
      await runMetaTheoryGovernedExecution({
        task: naturalUserTask,
        runId: "natural-user-task",
        stateDir: tempDir,
        dbPath: path.join(tempDir, "runs.sqlite"),
      });
      const runArtifact = JSON.parse(
        await readFile(path.join(tempDir, "natural-user-task.json"), "utf8")
      );
      assert.equal(runArtifact.task, naturalUserTask);
      assert.equal(
        runArtifact.stageOperationPlan.schemaVersion,
        "stage-operation-plan-v0.1"
      );
      assert.equal(
        runArtifact.stageOperationPlan.stages.find((item) => item.stage === "Execution")
          .workerTasks.length,
        runArtifact.runReportPanelContract.ownerHandoff.length
      );
      assert.equal(runArtifact.visibleMetaTheorySurfacePacket.status, "partial");
      assert.equal(runArtifact.visibleMetaTheorySurfacePacket.capabilityInventory.notSkillOnly, true);
      assert.equal(runArtifact.capabilityInvocationTruthPacket.status, "partial");
      const invocationByFamily = new Map(
        runArtifact.capabilityInvocationTruthPacket.rows.map((row) => [row.family, row])
      );
      assert.equal(runArtifact.runtimeSubagentInvocationPacket.status, "unavailable");
      assert.equal(invocationByFamily.get("agent_subagent").state, "unavailable");
      assert.equal(invocationByFamily.get("app_visible_subagent").state, "not_required");
      assert.equal(invocationByFamily.get("worker_task").state, "invoked");
      assert.equal(invocationByFamily.get("prompt_rule").state, "applied");
      assert.equal(invocationByFamily.get("agent_teams_playbook").state, "selected_not_invoked");
      assert.equal(invocationByFamily.get("mcp").state, "selected_not_invoked");
      assert.equal(runArtifact.capabilityInvocationProbePacket.status, "not_run");
      assert.equal(runArtifact.capabilityInvocationTruthPacket.realInvocationCoverage.status, "partial");
      assert.equal(runArtifact.agentTeamsPlaybookPacket.status, "pass");
      assert.equal(runArtifact.agentTeamsPlaybookPacket.selected, true);
      assert.equal(runArtifact.agentTeamsPlaybookPacket.fanoutSafetyPacket.safeForParallelFanout, true);
      assert.equal(runArtifact.agentTeamsPlaybookPacket.acceptance.independentLanesProven, true);
      assert.equal(runArtifact.agentTeamsPlaybookPacket.acceptance.parallelWaveExists, true);
      assert.equal(runArtifact.agentTeamsPlaybookPacket.acceptance.dagAndCollisionSafe, true);
      assert.equal(runArtifact.agentTeamsPlaybookPacket.acceptance.waveSizeWithinRuntimeCapacity, true);
      assert.equal(runArtifact.agentTeamsPlaybookPacket.acceptance.noArbitraryMetaKimCap, true);
      assert.equal(runArtifact.visibleMetaTheorySurfacePacket.capabilityInvocationTruth.status, "partial");
      assert.equal(runArtifact.visibleMetaTheorySurfacePacket.dynamicWorkflow.status, "pass");
      assert.equal(runArtifact.visibleMetaTheorySurfacePacket.agentTeamsPlaybook.status, "pass");
      assert.equal(runArtifact.visibleMetaTheorySurfacePacket.peerAgentMesh.status, "pass");
      assert.equal(runArtifact.visibleMetaTheorySurfacePacket.langGraph.status, "pass");
      assert.deepEqual(
        runArtifact.productExperiencePacket.goals.map((goal) => goal.id),
        ["P-102", "P-103", "P-104"]
      );
      assert.deepEqual(
        runArtifact.productExperiencePacket.supportGates.map((gate) => gate.id),
        ["P-105", "P-106", "P-107", "P-108", "P-109", "P-110"]
      );
      assert.equal(runArtifact.productExperiencePacket.noOverclaimGate.status, "pass");
      assert.equal(
        runArtifact.productExperiencePacket.nativeChoiceSurfaceGate.liveRuntimeBoundary.status,
        "not_claimed_by_structural_runner"
      );
      assert.equal(
        runArtifact.productExperiencePacket.repeatFailureDesignGate.actionOnSecondOccurrence,
        "bottom_design_failure_return_to_critical_fetch_thinking"
      );
      assert.equal(runArtifact.productExperiencePacket.generalizationGate.status, "pass");
      assert.equal(runArtifact.productExperiencePacket.capabilityInvocationTruthGate.status, "partial");
      assert.equal(runArtifact.productExperiencePacket.agentTeamsPlaybookGate.status, "pass");
      const markdown = await readFile(path.join(tempDir, "natural-user-task.zh-CN.md"), "utf8");
      assert.match(markdown, /## Meta-Theory 可见编排面/);
      assert.match(markdown, /Dynamic Workflow/);
      assert.match(markdown, /能力发现/);
      assert.match(markdown, /Agent Teams Playbook/);
      assert.match(markdown, /Peer Agent Mesh/);
      assert.match(markdown, /LangGraph-style/);
      assert.match(markdown, /## 阶段执行说明/);
      assert.match(markdown, /## 执行编排明细/);
      assert.match(markdown, /## 三目标产品验收/);
      assert.match(markdown, /用户只用普通自然语言输入/);
      assert.match(markdown, /要做什么/);
      assert.match(markdown, /结果长什么样/);
      assert.match(markdown, /下一项工作/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("CLI emits a localized conversation notice for wish-style human input", async () => {
    assert.equal(naturalUserTask, "帮我做个小红书营销自动发布器");
    assert.doesNotMatch(naturalUserTask, /Critical|Fetch|Thinking|Review|agent|skill|MCP|packet|JSON/i);
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-conversation-notice-"));
    try {
      const result = spawnSync(
        process.execPath,
        [
          "scripts/run-meta-theory-governed-execution.mjs",
          "--task",
          naturalUserTask,
          "--run-id",
          "wish-style-conversation-notice",
          "--state-dir",
          tempDir,
          "--db",
          path.join(tempDir, "runs.sqlite"),
          "--emit-conversation-notice",
        ],
        { cwd: process.cwd(), encoding: "utf8" }
      );
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stdout, /^Meta_Kim 对话提示:/u);
      assert.match(result.stdout, /开始原因: 进入 Meta-Theory/u);
      assert.match(result.stdout, /8 阶段: 触发 8 阶段/u);
      assert.match(result.stdout, /11 阶段: 触发 11 阶段/u);
      assert.match(result.stdout, /发牌: 触发发牌/u);
      assert.match(result.stdout, /许愿式自然语言需求/u);
      assert.match(result.stdout, /阶段进度/u);
      assert.match(result.stdout, /能力路线/u);
      assert.match(result.stdout, /产品定义/u);
      assert.match(result.stdout, /市场与平台规则研究/u);
      assert.match(result.stdout, /内容策略与生成/u);
      assert.match(result.stdout, /前端界面/u);
      assert.match(result.stdout, /后端 API/u);
      assert.match(result.stdout, /测试验收/u);
      assert.match(result.stdout, /验证/u);
      assert.doesNotMatch(
        result.stdout,
        /ownerDiscoveryPacket|orchestrationTaskBoardPacket|workerTaskPackets|cardPlanPacket/u
      );

      const emittedText = result.stdout.split("\n\n")[0];
      const artifact = JSON.parse(
        await readFile(path.join(tempDir, "wish-style-conversation-notice.json"), "utf8")
      );
      assert.equal(
        artifact.governanceStartReasonPacket.schemaVersion,
        "governance-start-reason-v0.1"
      );
      assert.ok(artifact.governanceStartReasonPacket.spineReason.length <= 120);
      assert.ok(artifact.governanceStartReasonPacket.workflowReason.length <= 120);
      assert.match(artifact.governanceStartReasonPacket.cardReason, /触发发牌/);
      assert.ok(artifact.governanceStartReasonPacket.cardReason.length <= 120);
      assert.equal(artifact.cardPlanPacket.dealStandard.coveragePass, true);
      assert.ok(artifact.cardPlanPacket.dealStandard.minimumScore >= 80);
      const emittedHash = createHash("sha256").update(emittedText, "utf8").digest("hex");
      assert.equal(artifact.conversationNotice.status, "emitted");
      assert.equal(artifact.conversationNotice.routeSummary.workerTaskCount, 11);
      assert.equal(artifact.conversationNotice.emitted, true);
      assert.equal(artifact.conversationNotice.channel, "stdout");
      assert.equal(artifact.conversationNotice.adapter, "meta-theory-governed-execution-cli");
      assert.equal(artifact.conversationNotice.text, emittedText);
      assert.equal(artifact.conversationNotice.textSha256, emittedHash);
      assert.equal(artifact.conversationNotice.emittedTextSha256, emittedHash);
      assert.equal(artifact.conversationNotice.evidenceKind, "adapter_emitted_notice");
      assert.equal(artifact.userExperienceNotice.status, "ready");
      assert.equal(artifact.userExperienceNotice.primarySurface, "localized_conversation_notice");
      assert.equal(artifact.userExperienceNotice.pendingPrimarySurface, null);
      assert.equal(artifact.userExperienceNotice.conversationNoticeEmitted, true);
      assert.equal(artifact.defaultRuntimePath.workerTaskPackets.length, 11);
      assert.equal(artifact.defaultRuntimePath.agentTeamsPlaybookPacket.status, "pass");
      assert.equal(artifact.defaultRuntimePath.agentTeamsPlaybookPacket.selected, true);
      assert.equal(
        artifact.defaultRuntimePath.agentTeamsPlaybookPacket.fanoutSafetyPacket.safeForParallelFanout,
        true
      );
      assert.equal(
        artifact.defaultRuntimePath.agentTeamsPlaybookPacket.acceptance.independentLanesProven,
        true
      );
      assert.equal(
        artifact.defaultRuntimePath.agentTeamsPlaybookPacket.acceptance.parallelWaveExists,
        true
      );
      assert.equal(
        artifact.defaultRuntimePath.agentTeamsPlaybookPacket.acceptance.dagAndCollisionSafe,
        true
      );
      assert.equal(
        artifact.defaultRuntimePath.agentTeamsPlaybookPacket.acceptance.waveSizeWithinRuntimeCapacity,
        true
      );
      assert.equal(
        artifact.defaultRuntimePath.agentTeamsPlaybookPacket.acceptance.noArbitraryMetaKimCap,
        true
      );
      assert.deepEqual(
        artifact.defaultRuntimePath.workerTaskPackets.map((packet) => packet.businessFlowLaneId),
        [
          "product-definition",
          "market-research",
          "content-strategy",
          "ux-flow",
          "frontend-ui",
          "backend-api",
          "data-model",
          "platform-integration",
          "security-approval",
          "test-qa",
          "release-ops",
        ]
      );
      assert.equal(
        artifact.userExperienceNotice.conversationNoticeEvidence.textSha256,
        emittedHash
      );
      assert.match(
        artifact.userExperienceNotice.statusReason,
        /conversation notice 已通过 stdout/
      );
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
