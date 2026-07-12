import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {
  buildCapabilityGapOrchestration,
  decomposeCapabilityGapRequests,
} from "../../scripts/run-capability-gap-orchestration.mjs";

describe("31 — Capability Gap orchestration through meta-theory Conductor", () => {
  test("decomposes a meta-theory request into multiple independently decided gaps", () => {
    const input = [
      "同一套 PRD review standard 已经多次出现，需要流程包和触发条件。",
      "项目长期缺 test coverage strategy owner，要稳定 owner、verifier 和输入输出。",
      "release summary JSON 需要脚本。",
      "内部知识库需要 MCP provider 边界，明确权限边界、凭证隔离、只读查询。",
      "这次只整理一个标题的措辞，已有编辑能力足够。",
      "请直接给远程 GitHub PR 加 label，但当前没有授权。",
    ].join("\n");

    const report = buildCapabilityGapOrchestration(input);

    assert.equal(report.status, "pass");
    assert.equal(report.capabilityGaps.length, 6);
    assert.equal(report.orchestrationTaskBoardPacket.synthesisOwner, "meta-conductor");
    assert.deepEqual(report.orchestrationTaskBoardPacket.triggerChain, [
      "meta-theory-skill-adapter",
      "meta-warden-entry-gate",
      "meta-conductor-orchestration",
      "capability-gap-decision-kernel",
    ]);
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(report.decisionCounts).filter(([, count]) => count > 0)
      ),
      {
        create_skill: 1,
        create_agent: 1,
        create_script: 1,
        create_mcp_provider: 1,
        worker_task_only: 1,
        blocked_or_needs_approval: 1,
      }
    );
    assert.equal(report.workerTaskPackets.length, 6);
    assert.ok(
      report.workerTaskPackets.every(
        (packet) =>
          packet.mergeOwner === "meta-conductor" &&
          ["primary_execution", "factory_then_dispatch", "approval_gate"].includes(
            packet.executionMode
          ) &&
          packet.parallelGroup &&
          packet.roleInstanceId &&
          packet.shardScope &&
          packet.capabilityInventoryRefs.includes("retrieval_capability")
      )
    );
    assert.ok(
      report.orchestrationTaskBoardPacket.tasks.every((task) => {
        const packet = report.workerTaskPackets.find(
          (candidate) => candidate.taskPacketId === task.taskPacketId
        );
        return packet && task.executionMode === packet.executionMode;
      })
    );
    assert.deepEqual(
      report.fetchEvidence.capabilityInventory.map((item) => item.capabilityType),
      [
        "agent",
        "skill",
        "script",
        "command",
        "mcp_provider_tool",
        "runtime_tool",
        "plugin_connector",
        "retrieval_capability",
        "dependency_external_package",
        "worker_task",
      ]
    );
    assert.ok(
      report.fetchEvidence.capabilityInventory.every((item) => item.checkedBeforeThinking),
      "multi-type capability inventory must complete before Thinking"
    );
    assert.deepEqual(
      report.fetchEvidence.researchCapabilityDiscovery.retrievalCapabilities.map(
        (capability) => capability.name
      ),
      [
        "web_search",
        "url_fetch",
        "docs_lookup",
        "browser_open",
        "mcp_search",
        "plugin_search",
        "local_only",
        "user_supplied_sources",
      ]
    );
    assert.equal(report.fetchEvidence.deepResearchPlan.decisionImpactRequired, true);
    assert.equal(report.reviewResult.checks.skillIsNotPlanner, true);
    assert.equal(report.reviewResult.checks.conductorOwnsBoard, true);
    assert.equal(report.reviewResult.checks.multiTypeCapabilityInventoryPresent, true);
    assert.equal(report.reviewResult.checks.researchCapabilityDiscoveryRecorded, true);
    assert.equal(report.reviewResult.checks.deepResearchPlanRecorded, true);
    assert.equal(report.reviewResult.checks.fetchBeforeThinking, true);
  });

  test("marks external/current capability claims as deep research gated before Thinking", () => {
    const report = buildCapabilityGapOrchestration(
      "需要根据最新 API 和外部生态判断 MCP provider 是否足够，并联网搜索官方资料。"
    );

    assert.equal(report.status, "pass");
    assert.equal(report.fetchEvidence.researchCapabilityDiscovery.researchRequired, true);
    assert.equal(
      report.fetchEvidence.researchCapabilityDiscovery.selectedPath,
      "mixed_source_backed_research"
    );
    assert.equal(report.fetchEvidence.deepResearchPlan.required, true);
    assert.equal(report.fetchEvidence.deepResearchPlan.stageGate, "must_complete_before_thinking");
  });

  test("wish-style product build input expands into dynamic business-flow worker lanes", () => {
    const report = buildCapabilityGapOrchestration("帮我做个小红书营销自动发布器");
    const laneIds = report.workerTaskPackets.map((packet) => packet.businessFlowLaneId);
    const laneLabels = report.workerTaskPackets.map((packet) => packet.businessFlowLaneLabel);
    const roles = new Set(report.workerTaskPackets.map((packet) => packet.roleDisplayName));
    const testLane = report.workerTaskPackets.find(
      (packet) => packet.businessFlowLaneId === "test-qa"
    );
    const frontendLane = report.workerTaskPackets.find(
      (packet) => packet.businessFlowLaneId === "frontend-ui"
    );
    const integrationLane = report.workerTaskPackets.find(
      (packet) => packet.businessFlowLaneId === "platform-integration"
    );

    assert.equal(report.status, "pass");
    assert.equal(report.fetchEvidence.dynamicWorkflowPlan.applied, true);
    assert.equal(report.fetchEvidence.dynamicWorkflowPlan.notFixedTemplate, true);
    assert.equal(report.fetchEvidence.dynamicWorkflowPlan.intentSignals.requiresExternalResearch, true);
    assert.equal(report.fetchEvidence.dynamicWorkflowPlan.intentSignals.requiresContentGeneration, true);
    assert.equal(report.capabilityGaps.length, 11);
    assert.equal(report.workerTaskPackets.length, 11);
    assert.deepEqual(laneIds, [
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
    ]);
    assert.ok(laneLabels.includes("产品定义"));
    assert.ok(laneLabels.includes("市场与平台规则研究"));
    assert.ok(laneLabels.includes("内容策略与生成"));
    assert.ok(laneLabels.includes("前端界面"));
    assert.ok(laneLabels.includes("后端 API"));
    assert.ok(laneLabels.includes("测试验收"));
    assert.ok(roles.has("product"));
    assert.ok(roles.has("research"));
    assert.ok(roles.has("content"));
    assert.ok(roles.has("frontend"));
    assert.ok(roles.has("backend"));
    assert.ok(roles.has("data"));
    assert.ok(roles.has("integration"));
    assert.ok(roles.has("test"));
    assert.ok(
      report.workerTaskPackets.every((packet) => packet.ownerMode === "project-agent-profile")
    );
    assert.ok(
      report.workerTaskPackets.every(
        (packet) =>
          packet.workerInstanceMode === "run-scoped-instance" &&
          packet.durableIdentityStatus === "project_agent_profile_synthesized_and_capability_pinned_for_run"
      )
    );
    assert.ok(
      report.workerTaskPackets.every(
        (packet) =>
          packet.roleSoulPolicy?.savedIn === "projectAgentBlueprintPacket" &&
          packet.roleSoulPolicy?.identityKind === "project_scoped_agent_profile" &&
          packet.roleSoulPolicy?.durableAgentCreated === false
      )
    );
    assert.ok(
      report.workerTaskPackets.every(
        (packet) =>
          packet.capabilityLoadout?.repoSkills.includes("meta-theory") &&
          packet.capabilityLoadout?.fixedForRun === true &&
          packet.capabilityLoadout?.capabilityProfileId &&
          packet.capabilityLoadout?.commands.length > 0 &&
          packet.capabilityLoadout?.runtimeTools.length > 0
      )
    );
    assert.ok(
      report.projectAgentBlueprintPacket.agents.every(
        (agent) =>
          agent.ownerMode === "project-agent-profile" &&
          agent.fixedForRun === true &&
          agent.capabilityProfileId &&
          agent.memoryStrategy.scope === "project" &&
          agent.localBaselineComparison?.required === true &&
          agent.localBaselineComparison?.noProviderClaimWithoutLocalCheck === true &&
          agent.evidenceContract?.localComparisonBeforeDispatch === true &&
          agent.knowledgeGraphPolicy?.equipped === true &&
          agent.knowledgeGraphPolicy?.runStartPolicy?.existenceCheckOnly === true &&
          agent.knowledgeGraphPolicy?.runStartPolicy?.noStartupFreshnessGate === true &&
          agent.knowledgeGraphPolicy?.runStartPolicy?.noStartupRebuild === true &&
          agent.knowledgeGraphPolicy?.contextInjectionPolicy?.allowed.includes(
            "worker_relevant_graph_slice"
          ) &&
          agent.knowledgeGraphPolicy?.contextInjectionPolicy?.forbidden.includes(
            "full_graph_json"
          ) &&
          agent.knowledgeGraphPolicy?.truthPolicy?.finalTruthSource === "target_source_files" &&
          agent.knowledgeGraphPolicy?.afterMutationPolicy?.rebuildCommand ===
            "npm run meta:graphify:rebuild"
      )
    );
    const blueprintByRole = new Map(
      report.projectAgentBlueprintPacket.agents.map((agent) => [
        agent.roleDisplayName,
        agent,
      ])
    );
    for (const role of ["research", "integration", "security", "ops"]) {
      const agent = blueprintByRole.get(role);
      assert.ok(agent, `missing ${role} project agent profile`);
      assert.equal(agent.externalEvidencePolicy?.required, true);
      assert.equal(agent.externalEvidencePolicy?.noCurrentFactWithoutSource, true);
      assert.ok(agent.externalEvidencePolicy?.preferredRetrieval.includes("web_search"));
      assert.ok(agent.externalEvidencePolicy?.preferredRetrieval.includes("url_fetch"));
      assert.equal(agent.externalEvidencePolicy?.loadoutHasRetrieval, true);
    }
    assert.ok(report.projectAgentBlueprintPacket.agents.length >= 9);
    assert.ok(frontendLane.projectAgentId.includes("marketing-automation"));
    assert.ok(frontendLane.capabilityLoadout.runtimeSkillCandidates.includes("frontend-patterns"));
    assert.ok(integrationLane.capabilityLoadout.runtimeMcpCandidates.includes("exa"));
    assert.ok(
      integrationLane.roleSoulPolicy.durableAgentEscalation.includes(
        "GapDecision=create_agent"
      )
    );
    assert.ok(testLane.dependsOn.length >= 4);
    assert.ok(frontendLane.dependsOn.length >= 2);
    assert.ok(
      integrationLane.nonGoals.includes(
        "Do not perform real third-party publish actions without explicit user approval."
      )
    );
    assert.equal(report.thinkingRoute.businessFlowLaneCount, 11);
    assert.equal(report.fetchEvidence.businessFlowCapabilityMatrix.length, 11);
    assert.ok(
      report.fetchEvidence.businessFlowCapabilityMatrix.every(
        (lane) =>
          lane.ownerMode === "project-agent-profile" &&
          lane.workerInstanceMode === "run-scoped-instance" &&
          lane.durableIdentityStatus === "project_agent_profile_synthesized_and_capability_pinned_for_run"
      )
    );
    assert.equal(
      report.reviewResult.checks.dynamicLanesHaveLoadoutAndSoulPolicy,
      true
    );
    assert.equal(report.reviewResult.checks.dynamicProjectAgentsAreSynthesizedAndPinned, true);
    assert.equal(report.reviewResult.checks.dynamicProjectAgentsHaveEvidencePolicies, true);
    assert.equal(report.reviewResult.checks.dynamicProjectAgentsHaveGraphPolicies, true);
    assert.deepEqual(report.fetchEvidence.dynamicWorkflowPlan.omittedLanes, []);
  });

  test("dynamic workflow does not force every product request through the same lane set", () => {
    const report = buildCapabilityGapOrchestration("帮我做个本地待办看板");
    const laneIds = report.workerTaskPackets.map((packet) => packet.businessFlowLaneId);
    const omittedLaneIds = report.fetchEvidence.dynamicWorkflowPlan.omittedLanes.map(
      (lane) => lane.laneId
    );

    assert.equal(report.status, "pass");
    assert.equal(report.fetchEvidence.dynamicWorkflowPlan.applied, true);
    assert.equal(report.fetchEvidence.dynamicWorkflowPlan.notFixedTemplate, true);
    assert.deepEqual(laneIds, [
      "product-definition",
      "ux-flow",
      "frontend-ui",
      "data-model",
      "test-qa",
      "release-ops",
    ]);
    assert.ok(
      report.workerTaskPackets.every((packet) => packet.ownerMode === "project-agent-profile")
    );
    assert.ok(
      report.workerTaskPackets.every(
        (packet) =>
          packet.workerInstanceMode === "run-scoped-instance" &&
          packet.roleSoulPolicy?.identityKind === "project_scoped_agent_profile" &&
          packet.projectAgentId.startsWith("local-todo-dashboard.") &&
          packet.capabilityLoadout?.fixedForRun === true
      )
    );
    assert.ok(omittedLaneIds.includes("market-research"));
    assert.ok(omittedLaneIds.includes("content-strategy"));
    assert.ok(omittedLaneIds.includes("platform-integration"));
    assert.ok(omittedLaneIds.includes("security-approval"));
    assert.equal(report.fetchEvidence.dynamicWorkflowPlan.intentSignals.requiresExternalIntegration, false);
    assert.equal(report.fetchEvidence.dynamicWorkflowPlan.intentSignals.requiresBackend, false);
  });

  test("groups same-type same-repeatKey needs without collapsing worker instances", () => {
    const input = [
      "同一套 PRD review standard 已经多次出现，需要流程包和触发条件。",
      "每次 PRD review 都要 same Critical Fetch Thinking Review，可复用流程要沉淀。",
      "另一个 coverage strategy owner 需求需要长期 owner 和 verifier。",
    ].join("\n");

    const report = buildCapabilityGapOrchestration(input);
    const skillGroup = report.groupedGaps.find(
      (group) => group.decision === "create_skill" && group.repeatKey === "prd-review-flow"
    );
    const skillTasks = report.workerTaskPackets.filter(
      (packet) => packet.shardScope === "prd-review-flow"
    );

    assert.equal(report.status, "pass");
    assert.ok(skillGroup, "same-type PRD review gaps should share a group");
    assert.equal(skillGroup.items.length, 2);
    assert.equal(skillGroup.duplicatePolicy, "same_type_same_repeat_key_grouped");
    assert.equal(skillTasks.length, 2);
    assert.equal(new Set(skillTasks.map((packet) => packet.roleInstanceId)).size, 2);
    assert.equal(new Set(skillTasks.map((packet) => packet.mergeOwner)).size, 1);
    assert.equal([...new Set(skillTasks.map((packet) => packet.mergeOwner))][0], "meta-conductor");
    assert.equal(report.decisionCounts.create_skill, 2);
    assert.equal(report.decisionCounts.create_agent, 1);
  });

  test("CLI writes an orchestration report for a child-session test window", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-gap-orchestration-"));
    try {
      const outputPath = path.join(tempDir, "orchestration.json");
      const result = spawnSync(
        process.execPath,
        [
          "scripts/run-capability-gap-orchestration.mjs",
          "--task",
          "同一套 PRD review standard 需要 skill；长期 test coverage owner 需要 agent。",
          "--json-out",
          outputPath,
        ],
        { cwd: process.cwd(), encoding: "utf8" }
      );
      assert.equal(result.status, 0, result.stderr);
      const summary = JSON.parse(result.stdout);
      assert.equal(summary.status, "pass");
      assert.equal(summary.boardMode, "factory_then_dispatch");
      const report = JSON.parse(await readFile(outputPath, "utf8"));
      assert.equal(report.orchestrationTaskBoardPacket.synthesisOwner, "meta-conductor");
      assert.ok(report.workerTaskPackets.length >= 2);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("CLI supports stdout-only dynamic workflow inspection without writing a report", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-gap-orchestration-"));
    try {
      const outputPath = path.join(tempDir, "should-not-exist.json");
      const result = spawnSync(
        process.execPath,
        [
          "scripts/run-capability-gap-orchestration.mjs",
          "--task",
          "帮我做个小红书营销自动发布器",
          "--json-out",
          outputPath,
          "--stdout-only",
        ],
        { cwd: process.cwd(), encoding: "utf8" }
      );
      assert.equal(result.status, 0, result.stderr);
      const summary = JSON.parse(result.stdout);
      assert.equal(summary.status, "pass");
      assert.equal(summary.outputMode, "stdout-only");
      assert.equal(summary.report, null);
      assert.equal(summary.workerTaskPackets.length, 11);
      assert.equal(summary.reviewChecks.dynamicProjectAgentsAreSynthesizedAndPinned, true);
      assert.equal(summary.reviewChecks.dynamicProjectAgentsHaveEvidencePolicies, true);
      assert.equal(summary.reviewChecks.dynamicProjectAgentsHaveGraphPolicies, true);
      assert.equal(summary.reviewChecks.dynamicLanesHaveLoadoutAndSoulPolicy, true);
      assert.equal(summary.reviewChecks.workerTasksDeclareExecutionMode, true);
      assert.equal(summary.reviewChecks.executionWorkersAreNotSidecars, true);
      assert.ok(summary.projectAgentBlueprintPacket.agentCount >= 9);
      assert.ok(
        summary.projectAgentBlueprintPacket.externalEvidenceRequiredAgentIds.some((agentId) =>
          agentId.endsWith(".research")
        )
      );
      assert.ok(
        summary.projectAgentBlueprintPacket.externalEvidenceRequiredAgentIds.some((agentId) =>
          agentId.endsWith(".integration")
        )
      );
      assert.ok(
        summary.projectAgentBlueprintPacket.localBaselineRequiredAgentIds.length >=
          summary.projectAgentBlueprintPacket.agentCount
      );
      assert.ok(
        summary.projectAgentBlueprintPacket.knowledgeGraphEquippedAgentIds.length >=
          summary.projectAgentBlueprintPacket.agentCount
      );
      assert.ok(
        summary.workerTaskPackets.every(
          (packet) =>
            packet.ownerMode === "project-agent-profile" &&
            packet.executionMode === "primary_execution" &&
            packet.workerInstanceMode === "run-scoped-instance" &&
            packet.savedIn === "projectAgentBlueprintPacket" &&
            packet.fixedForRun === true &&
            packet.capabilityProfileId &&
            packet.commands.length > 0 &&
            packet.localBaselineRequired === true &&
            packet.knowledgeGraphEquipped === true
        )
      );
      await assert.rejects(() => access(outputPath), /ENOENT/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("CLI accepts positional task text when an npm runner strips --task", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-gap-orchestration-"));
    try {
      const outputPath = path.join(tempDir, "orchestration-positional.json");
      const result = spawnSync(
        process.execPath,
        [
          "scripts/run-capability-gap-orchestration.mjs",
          "同一套 PRD review standard 需要 skill；长期 test coverage owner 需要 agent。",
          "--json-out",
          outputPath,
        ],
        { cwd: process.cwd(), encoding: "utf8" }
      );
      assert.equal(result.status, 0, result.stderr);
      const summary = JSON.parse(result.stdout);
      assert.equal(summary.status, "pass");
      assert.equal(summary.gaps, 2);
      const report = JSON.parse(await readFile(outputPath, "utf8"));
      assert.equal(report.decisionCounts.create_skill, 1);
      assert.equal(report.decisionCounts.create_agent, 1);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("CLI preserves the child-window requested decision counts", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-gap-orchestration-"));
    try {
      const outputPath = path.join(tempDir, "orchestration-child-window.json");
      const result = spawnSync(
        process.execPath,
        [
          "scripts/run-capability-gap-orchestration.mjs",
          "同一套 PRD review standard 需要 skill；长期 test coverage owner 需要 agent；release summary JSON 需要脚本；外部知识库需要 MCP provider；没有授权的 GitHub PR 发布动作要阻塞。",
          "--json-out",
          outputPath,
        ],
        { cwd: process.cwd(), encoding: "utf8" }
      );
      assert.equal(result.status, 0, result.stderr);
      const report = JSON.parse(await readFile(outputPath, "utf8"));
      assert.deepEqual(
        Object.fromEntries(
          Object.entries(report.decisionCounts).filter(([, count]) => count > 0)
        ),
        {
          create_skill: 1,
          create_agent: 1,
          create_script: 1,
          create_mcp_provider: 1,
          blocked_or_needs_approval: 1,
        }
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("decomposition preserves explicit list items before decisions are made", () => {
    const requests = decomposeCapabilityGapRequests("- first gap\n- second gap");
    assert.equal(requests.length, 2);
    assert.equal(requests[0].index, 0);
    assert.equal(requests[1].index, 1);
  });
});
