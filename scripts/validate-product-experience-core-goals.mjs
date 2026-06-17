#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { runMetaTheoryGovernedExecution } from "./run-meta-theory-governed-execution.mjs";

const PRODUCT_EXPERIENCE_TASK =
  "帮我做个小红书营销自动发布器，需要动态规划、平台规则研究、内容策略、前端界面、后端 API、数据模型、平台集成、权限风控、测试验收和发布运维，但不要真实发布或使用生产凭证。";

const REQUIRED_GOAL_IDS = ["P-102", "P-103", "P-104"];
const REQUIRED_SUPPORT_GATE_IDS = ["P-105", "P-106", "P-107", "P-108", "P-109", "P-110"];
const REQUIRED_INVOCATION_FAMILIES = [
  "agent_subagent",
  "app_visible_subagent",
  "worker_task",
  "skill",
  "mcp",
  "hook",
  "prompt_rule",
  "command_script",
  "runtime_tool",
  "agent_teams_playbook",
];
const REQUIRED_BINDING_COVERAGE = [
  "skill",
  "mcp",
  "command",
  "tools",
  "hooks",
  "abstractPromptCapability",
  "agentTeamsPlaybook",
  "workerResults",
];

function assertPacketStatus(report) {
  assert.equal(report.coreLoop.goalContractPacket.status, "pass");
  assert.equal(report.coreLoop.langGraphRunPacket.status, "pass");
  assert.equal(report.coreLoop.dynamicWorkflowRuntimePacket.status, "pass");
  assert.equal(report.coreLoop.peerAgentMeshPacket.status, "pass");
  assert.equal(report.coreLoop.agentTeamsPlaybookPacket.status, "pass");
  assert.equal(report.coreLoop.capabilityInvocationTruthPacket.status, "partial");
  assert.equal(report.coreLoop.userPerceptionPacket.status, "partial");
  assert.equal(report.coreLoop.productExperiencePacket.status, "partial");
  assert.equal(report.productExperiencePacket.status, "partial");
}

function assertLangGraphStyle(report) {
  const packet = report.coreLoop.langGraphRunPacket;
  assert.ok(packet.nodes.length >= 8, "LangGraph-style run must have stage nodes");
  assert.ok(packet.edges.length >= 7, "LangGraph-style run must have edges");
  assert.ok(packet.conditionalEdges.length > 0, "dynamic/conditional edges must exist");
  assert.ok(packet.state.sharedStateFields.includes("workerResultPackets"));
  assert.ok(packet.stateTransition.length >= 8);
  assert.ok(packet.eventLog.length >= 8);
  assert.equal(packet.checkpoint.count, packet.nodes.length);
  assert.equal(packet.replay.supported, true);
}

function assertDynamicWorkflow(report) {
  const packet = report.coreLoop.dynamicWorkflowRuntimePacket;
  for (const field of REQUIRED_BINDING_COVERAGE) {
    assert.equal(
      packet.capabilityBindingCoverage[field],
      true,
      `dynamic workflow missing ${field} coverage`,
    );
  }
  assert.ok(packet.capabilityBindingRows.length > 0);
  assert.ok(
    packet.capabilityBindingRows.some((row) => row.commands.length > 0),
    "commands must be bound",
  );
  assert.ok(
    packet.capabilityBindingRows.some((row) => row.mcp.length > 0),
    "MCP provider/tool must be bound",
  );
  assert.ok(
    packet.capabilityBindingRows.every((row) => row.hookMatches.length > 0),
    "hooks must be matched",
  );
  assert.ok(
    packet.capabilityBindingRows.every((row) => row.abstractPromptCapability.status),
    "abstract prompt capability must be recorded",
  );
}

function assertPeerMesh(report) {
  const packet = report.coreLoop.peerAgentMeshPacket;
  assert.ok(packet.peers.length > 0, "peer mesh must include peers");
  assert.ok(packet.handoffs.length >= packet.peers.length, "peer mesh must include handoffs");
  assert.equal(packet.acceptance.noGenericOwner, true);
  assert.equal(packet.acceptance.everyPeerHasResult, true);
  assert.equal(packet.acceptance.everyPeerHasMergeOwner, true);
}

function assertUserPerception(report) {
  const packet = report.coreLoop.userPerceptionPacket;
  const cues = packet.plainLanguageCues.map((cue) => cue.cue);
  for (const cue of [
    "要做什么",
    "正在做什么",
    "准备怎么做",
    "怎么算验收通过",
    "什么时候暂停",
    "编排和真实能力调用在哪里看",
  ]) {
    assert.ok(cues.includes(cue), `missing user perception cue ${cue}`);
  }
  assert.ok(
    packet.surfaces.some(
      (surface) => surface.surface === "user_readable_run_report" && surface.status === "pass",
    ),
  );
  assert.equal(packet.antiPacketDump.packetDumpPrevented, true);
}

function assertVisibleMetaTheorySurface(report) {
  const packet = report.coreLoop.visibleMetaTheorySurfacePacket;
  assert.equal(packet.status, "partial");
  assert.ok(packet.requiredVisibleTopics.includes("orchestration"));
  assert.ok(packet.requiredVisibleTopics.includes("dynamic_workflow"));
  assert.ok(packet.requiredVisibleTopics.includes("capability_inventory_not_skill_only"));
  assert.ok(packet.requiredVisibleTopics.includes("capability_invocation_truth"));
  assert.ok(packet.requiredVisibleTopics.includes("agent_teams_playbook"));
  assert.ok(packet.requiredVisibleTopics.includes("peer_agent_mesh"));
  assert.ok(packet.requiredVisibleTopics.includes("langgraph_style_control_graph"));
  assert.equal(packet.capabilityInventory.notSkillOnly, true);
  assert.ok(packet.capabilityInventory.nonSkillCapabilityTypeCount > 0);
  assert.equal(packet.dynamicWorkflow.status, "pass");
  assert.ok(packet.dynamicWorkflow.visibleRows.length > 0);
  assert.equal(packet.capabilityInvocationTruth.status, "partial");
  assert.ok(packet.capabilityInvocationTruth.visibleRows.length >= REQUIRED_INVOCATION_FAMILIES.length);
  assert.equal(packet.agentTeamsPlaybook.status, "pass");
  assert.equal(packet.agentTeamsPlaybook.selected, true);
  assert.ok(packet.agentTeamsPlaybook.waveCount >= 1);
  assert.equal(packet.peerAgentMesh.status, "pass");
  assert.ok(packet.peerAgentMesh.peerCount > 0);
  assert.equal(packet.langGraph.status, "pass");
  assert.ok(packet.langGraph.nodeCount >= 8);
  assert.ok(packet.langGraph.edgeCount >= 7);
  assert.ok(packet.langGraph.checkpointCount >= 8);
  assert.equal(report.runReportPanelContract.visibleMetaTheorySurface.status, "partial");
}

function assertCapabilityInvocationTruth(report) {
  const packet = report.coreLoop.capabilityInvocationTruthPacket;
  assert.equal(packet.status, "partial");
  for (const state of [
    "invoked",
    "applied",
    "host_visible_observed",
    "selected_not_invoked",
    "discovered_not_selected",
    "unavailable",
    "blocked",
    "not_required",
  ]) {
    assert.ok(packet.stateTaxonomy.includes(state), `missing invocation state ${state}`);
  }
  const byFamily = new Map(packet.rows.map((row) => [row.family, row]));
  for (const family of REQUIRED_INVOCATION_FAMILIES) {
    assert.ok(byFamily.has(family), `missing invocation family ${family}`);
  }
  assert.equal(report.coreLoop.runtimeSubagentInvocationPacket.status, "unavailable");
  assert.equal(byFamily.get("agent_subagent").state, "unavailable");
  assert.equal(byFamily.get("app_visible_subagent").state, "not_required");
  assert.equal(byFamily.get("worker_task").state, "invoked");
  assert.equal(byFamily.get("mcp").state, "invoked");
  assert.equal(byFamily.get("hook").state, "selected_not_invoked");
  assert.equal(byFamily.get("skill").state, "selected_not_invoked");
  assert.equal(byFamily.get("prompt_rule").state, "applied");
  assert.equal(byFamily.get("command_script").state, "invoked");
  assert.equal(byFamily.get("runtime_tool").state, "invoked");
  assert.equal(byFamily.get("agent_teams_playbook").state, "selected_not_invoked");
  assert.equal(packet.realInvocationCoverage.status, "partial");
  assert.deepEqual(packet.realInvocationCoverage.missingFamilies.sort(), [
    "agent_subagent",
    "agent_teams_playbook",
    "skill",
  ]);
  assert.deepEqual(packet.callableInvocationCoverage.missingFamilies, []);
  assert.ok(packet.callableInvocationCoverage.invokedFamilies.includes("mcp"));
  assert.ok(packet.callableInvocationCoverage.invokedFamilies.includes("command_script"));
  assert.ok(packet.callableInvocationCoverage.invokedFamilies.includes("runtime_tool"));
  assert.equal(packet.truthAssertions.noLiveSubagentOverclaim, true);
  assert.equal(packet.truthAssertions.noHostUiSubagentOverclaim, true);
  assert.equal(packet.truthAssertions.noAgentTeamsPlaybookOverclaim, true);
  assert.equal(packet.truthAssertions.noMcpCallOverclaim, true);
  assert.equal(packet.truthAssertions.noCommandCallOverclaim, true);
  assert.equal(packet.truthAssertions.noRuntimeToolOverclaim, true);
  assert.equal(packet.truthAssertions.noHookTriggerOverclaim, true);
  assert.equal(packet.truthAssertions.selectedIsNotInvoked, true);
  assert.equal(packet.truthAssertions.appliedIsNotInvoked, true);
  assert.equal(packet.truthAssertions.hostVisibleIsNotInvoked, true);
  assert.ok(byFamily.get("agent_subagent").mustNotClaimAs.includes("live_subagent_invocation"));
  assert.ok(
    byFamily
      .get("app_visible_subagent")
      .mustNotClaimAs.includes("runner_agent_subagent_invocation"),
  );
  assert.ok(byFamily.get("hook").mustNotClaimAs.includes("hook_triggered"));
  assert.ok(
    byFamily
      .get("agent_teams_playbook")
      .mustNotClaimAs.includes("live_agent_team_created"),
  );
  assert.equal(report.runReportPanelContract.capabilityInvocationTruth.status, "partial");
}

function assertInvocationProbes(report) {
  const packet = report.coreLoop.capabilityInvocationProbePacket;
  assert.equal(packet.status, "pass");
  assert.deepEqual(packet.missingFamilies, []);
  const byFamily = new Map(packet.probes.map((probe) => [probe.family, probe]));
  for (const family of ["mcp", "command_script", "runtime_tool"]) {
    assert.equal(byFamily.get(family)?.status, "pass", `${family} probe did not pass`);
    assert.equal(byFamily.get(family)?.exitCode, 0, `${family} probe exitCode was not 0`);
  }
}

function assertAgentTeamsPlaybook(report) {
  const packet = report.coreLoop.agentTeamsPlaybookPacket;
  assert.equal(packet.status, "pass");
  assert.equal(packet.triggered, true);
  assert.equal(packet.selected, true);
  assert.equal(packet.providerId, "agent-teams-playbook");
  assert.ok(packet.executableLaneCount >= 2);
  assert.ok(packet.waves.length >= 1);
  assert.equal(packet.fanoutSafetyPacket.safeForParallelFanout, true);
  assert.equal(packet.acceptance.selectedWhenParallelLanes, true);
  assert.equal(packet.acceptance.independentLanesProven, true);
  assert.equal(packet.acceptance.parallelWaveExists, true);
  assert.equal(packet.acceptance.dagAndCollisionSafe, true);
  assert.equal(packet.acceptance.waveSizeWithinCap, true);
  assert.equal(packet.acceptance.waveSizeWithinRuntimeCapacity, true);
  assert.equal(packet.acceptance.noArbitraryMetaKimCap, true);
  assert.ok(packet.runtimeCapacity >= 2);
  assert.ok(packet.capacitySource);
  assert.equal(packet.acceptance.workerPacketsPreserved, true);
  assert.equal(packet.acceptance.noLiveSubagentOverclaim, true);
  assert.ok(
    packet.providerResolution.configuredInSkills || packet.providerResolution.found,
    "agent-teams-playbook must be found by config or local/global skill resolver",
  );
}

async function assertReadableReportShowsVisibleSurface(report) {
  const markdown = await readFile(report.paths.markdown, "utf8");
  for (const marker of [
    "## Meta-Theory 可见编排面",
    "Dynamic Workflow",
    "能力发现",
    "Agent Teams Playbook",
    "Peer Agent Mesh",
    "LangGraph-style",
    "能力发现矩阵",
    "真实能力调用状态",
    "agent_subagent",
    "agent_teams_playbook",
    "selected_not_invoked",
  ]) {
    assert.match(markdown, new RegExp(marker), `readable report missing ${marker}`);
  }
}

function assertProductExperience(report) {
  const packet = report.coreLoop.productExperiencePacket;
  assert.deepEqual(packet.coreGoalIds, REQUIRED_GOAL_IDS);
  assert.deepEqual(packet.supportGateIds, REQUIRED_SUPPORT_GATE_IDS);
  assert.deepEqual(
    packet.goals.map((goal) => goal.id),
    REQUIRED_GOAL_IDS,
  );
  const goalById = new Map(packet.goals.map((goal) => [goal.id, goal]));
  assert.equal(goalById.get("P-102").status, "pass");
  assert.equal(goalById.get("P-103").status, "partial");
  assert.equal(goalById.get("P-104").status, "partial");
  assert.deepEqual(
    packet.supportGates.map((gate) => gate.id),
    REQUIRED_SUPPORT_GATE_IDS,
  );
  const supportGateById = new Map(packet.supportGates.map((gate) => [gate.id, gate]));
  assert.equal(supportGateById.get("P-105").status, "pass");
  assert.equal(supportGateById.get("P-106").status, "pass");
  assert.equal(supportGateById.get("P-107").status, "pass");
  assert.equal(supportGateById.get("P-108").status, "pass");
  assert.equal(supportGateById.get("P-109").status, "partial");
  assert.equal(supportGateById.get("P-110").status, "pass");
  assert.equal(packet.noOverclaimGate.status, "pass");
  assert.equal(packet.noOverclaimGate.acceptedEvidenceTier, "product_experience_pass");
  assert.ok(packet.noOverclaimGate.forbiddenAsProductPass.includes("chat_card_as_native_popup"));
  assert.ok(packet.noOverclaimGate.forbiddenAsProductPass.includes("demo_fixture_as_framework_goal"));
  assert.ok(packet.noOverclaimGate.forbiddenAsProductPass.includes("hidden orchestration artifacts"));
  assert.ok(packet.noOverclaimGate.forbiddenAsProductPass.includes("selected_capability_as_invoked_tool"));
  assert.ok(packet.noOverclaimGate.forbiddenAsProductPass.includes("configured_mcp_as_called_tool"));
  assert.ok(packet.noOverclaimGate.forbiddenAsProductPass.includes("run_scoped_worker_as_live_subagent"));
  assert.ok(
    packet.noOverclaimGate.forbiddenAsProductPass.includes(
      "agent_teams_playbook_selected_as_live_agent_team",
    ),
  );
  assert.equal(packet.nativeChoiceSurfaceGate.status, "pass");
  assert.equal(
    packet.nativeChoiceSurfaceGate.liveRuntimeBoundary.status,
    "not_claimed_by_structural_runner",
  );
  assert.equal(packet.nativeChoiceSurfaceGate.liveRuntimeBoundary.requiredForNativePass, true);
  assert.ok(
    packet.nativeChoiceSurfaceGate.forbiddenSubstitutes.includes("after-the-fact user insertion"),
    "native choice gate must reject after-the-fact insertion as popup evidence",
  );
  assert.equal(
    packet.repeatFailureDesignGate.actionOnSecondOccurrence,
    "bottom_design_failure_return_to_critical_fetch_thinking",
  );
  assert.equal(packet.repeatFailureDesignGate.sameFailureOccurrenceThreshold, 2);
  assert.ok(
    packet.repeatFailureDesignGate.trackedFailureClasses.includes(
      "native_choice_surface_missing_before_execution",
    ),
  );
  assert.equal(packet.generalizationGate.status, "pass");
  assert.equal(packet.capabilityInvocationTruthGate.status, "partial");
  assert.equal(packet.agentTeamsPlaybookGate.status, "pass");
  assert.ok(
    packet.capabilityInvocationTruthGate.forbiddenRelabels.includes(
      "selected_not_invoked_as_invoked",
    ),
  );
  assert.deepEqual(packet.generalizationGate.detectedForbiddenBindings, []);
  assert.ok(
    packet.generalizationGate.forbiddenFixtureBindings.includes("桌面便签"),
    "fixture non-hardcoding gate must include the desktop sticky-notes fixture class",
  );
  assert.match(packet.nativeRuntimeBoundary, /does not claim Claude Code\/Codex native live UI/);
  assert.match(report.runReportPanelContract.productExperience.status, /partial/);
  assert.equal(report.runReportPanelContract.productExperience.supportGates.length, 6);
  assert.equal(report.runReportPanelContract.productExperience.agentTeamsPlaybookGate.status, "pass");
}

function assertMcpSelfTest() {
  const result = spawnSync(
    process.execPath,
    ["scripts/mcp/meta-runtime-server.mjs", "--self-test"],
    { cwd: process.cwd(), encoding: "utf8", timeout: 120_000 },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.tools.includes("get_meta_runtime_capabilities"));
  return parsed;
}

async function main() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-product-experience-"));
  try {
    const report = await runMetaTheoryGovernedExecution({
      task: PRODUCT_EXPERIENCE_TASK,
      runId: "validate-product-experience-core-goals",
      stateDir: tempDir,
      dbPath: path.join(tempDir, "runs.sqlite"),
      emitConversationNotice: true,
      invokeCapabilityProbes: true,
    });
    assert.equal(report.status, "partial");
    assertPacketStatus(report);
    assertLangGraphStyle(report);
    assertDynamicWorkflow(report);
    assertPeerMesh(report);
    assertInvocationProbes(report);
    assertCapabilityInvocationTruth(report);
    assertAgentTeamsPlaybook(report);
    assertVisibleMetaTheorySurface(report);
    assertUserPerception(report);
    assertProductExperience(report);
    await assertReadableReportShowsVisibleSurface(report);
    const mcp = assertMcpSelfTest();
    process.stdout.write(
      `${JSON.stringify(
        {
          status: report.status,
          validationStatus: "pass",
          evidenceTier: report.coreLoop.productExperiencePacket.evidenceTier,
          goals: report.coreLoop.productExperiencePacket.goals.map((goal) => ({
            id: goal.id,
            status: goal.status,
          })),
          supportGates: report.coreLoop.productExperiencePacket.supportGates.map((gate) => ({
            id: gate.id,
            status: gate.status,
          })),
          nativeChoiceSurface: report.coreLoop.productExperiencePacket.nativeChoiceSurfaceGate.liveRuntimeBoundary.status,
          repeatFailureDesign:
            report.coreLoop.productExperiencePacket.repeatFailureDesignGate.actionOnSecondOccurrence,
          generalizationGate: report.coreLoop.productExperiencePacket.generalizationGate.status,
          langGraph: {
            nodes: report.coreLoop.langGraphRunPacket.nodes.length,
            edges: report.coreLoop.langGraphRunPacket.edges.length,
            checkpoints: report.coreLoop.langGraphRunPacket.checkpoint.count,
          },
          dynamicWorkflow: report.coreLoop.dynamicWorkflowRuntimePacket.capabilityBindingCoverage,
          peers: report.coreLoop.peerAgentMeshPacket.peers.length,
          capabilityInvocationTruth: {
            status: report.coreLoop.capabilityInvocationTruthPacket.status,
            states: report.coreLoop.capabilityInvocationTruthPacket.stateCounts,
            callableInvocationCoverage:
              report.coreLoop.capabilityInvocationTruthPacket.callableInvocationCoverage,
            appVisibleSubagentState:
              report.coreLoop.capabilityInvocationTruthPacket.rows.find(
                (row) => row.family === "app_visible_subagent",
              )?.state ?? "missing",
            agentTeamsPlaybookState:
              report.coreLoop.capabilityInvocationTruthPacket.rows.find(
                (row) => row.family === "agent_teams_playbook",
              )?.state ?? "missing",
          },
          agentTeamsPlaybook: {
            status: report.coreLoop.agentTeamsPlaybookPacket.status,
            selected: report.coreLoop.agentTeamsPlaybookPacket.selected,
            waves: report.coreLoop.agentTeamsPlaybookPacket.waves.length,
          },
          visibleMetaTheorySurface: report.coreLoop.visibleMetaTheorySurfacePacket.status,
          userPerceptionCues: report.coreLoop.userPerceptionPacket.plainLanguageCues.length,
          mcpTools: mcp.tools,
        },
        null,
        2,
      )}\n`,
    );
    if (report.status !== "pass") process.exitCode = 1;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exit(1);
});
