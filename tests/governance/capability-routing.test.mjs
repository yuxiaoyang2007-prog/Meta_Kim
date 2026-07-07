import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";
import test from "node:test";

function route(task, runtime = "auto", os = "auto", extraArgs = []) {
  const result = spawnSync(process.execPath, ["scripts/select-execution-route.mjs", "--task", task, "--runtime", runtime, "--os", os, "--json", ...extraArgs], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("routing fixtures recall internal patterns and platform/OS matrices", () => {
  const fuzzy = route("fuzzy strategy task");
  assert.ok(fuzzy.candidateWeapons.includes("meta-kim-decision-patterns"));
  assert.ok(
    fuzzy.ownerDiscoveryPacket?.governanceStages?.Critical?.requiredAgents?.includes("meta-warden"),
    "Critical stage governance owner discovery must be visible",
  );
  assert.ok(
    fuzzy.ownerDiscoveryPacket?.governanceStages?.Fetch?.requiredAgents?.includes("meta-artisan"),
    "Fetch stage governance owner discovery must be visible",
  );
  assert.ok(
    Array.isArray(fuzzy.ownerDiscoveryPacket?.projectRuntimeAgents),
    "project runtime agents must be listed even when none are selected",
  );
  assert.ok(
    fuzzy.ownerDiscoveryPacket?.discoveryPrinciple === "canonical_index_first_capability_discovery_owner_last_binding",
    "route discovery must expose canonical/index-first discovery and owner-last binding principle",
  );
  assert.equal(
    fuzzy.ownerDiscoveryPacket?.searchOrder?.[0],
    "repo_canonical_capability_index",
    "canonical capability index must be collected before provider matching",
  );
  assert.ok(
    fuzzy.ownerDiscoveryPacket?.ownerBindingOrder?.includes("local_global_agent_inventory"),
    "local global inventory must be part of owner binding",
  );
  assert.ok(
    fuzzy.ownerDiscoveryPacket?.searchOrder?.includes("available_capability_providers_skills_tools_mcp"),
    "skill/tool/MCP providers must still be checked before agent creation",
  );
  const projectProjectionPolicy = fuzzy.ownerDiscoveryPacket?.projectProjectionPolicy ?? {};
  const projectRuntimeProvidersExpected = projectProjectionPolicy.projectRuntimeProvidersExpected !== false;
  assert.equal(typeof projectProjectionPolicy.projectProjectionMode, "string");
  assert.ok(
    ["project_runtime_inventory", "local_global_runtime_inventory"].includes(projectProjectionPolicy.validationProviderLayer),
    "route output must name the runtime provider validation layer",
  );
  if (projectRuntimeProvidersExpected) {
    assert.ok(
      fuzzy.ownerDiscoveryPacket?.projectRuntimeSkillProviders?.some((provider) => provider.id === "meta-theory"),
      "project-local skill providers must be visible in owner discovery",
    );
    assert.ok(
      fuzzy.ownerDiscoveryPacket?.projectRuntimeCapabilityProviders?.some((provider) => provider.type === "hooks"),
      "project-local hook providers must be visible in owner discovery",
    );
    assert.ok(
      fuzzy.ownerDiscoveryPacket?.projectRuntimeCapabilityProviders?.some((provider) => provider.type === "rules"),
      "project-local rule/prompt providers must be visible in owner discovery",
    );
  } else {
    const routeSearchRefs = fuzzy.ownerDiscoveryPacket.capabilityDiscoverySearchLog
      .map((entry) => `${entry.source}:${entry.sourceRef}`)
      .join("\n");
    assert.equal(projectProjectionPolicy.projectProjectionMode, "global_only");
    assert.equal(projectProjectionPolicy.validationProviderLayer, "local_global_runtime_inventory");
    assert.match(routeSearchRefs, /\.meta-kim\/local\.overrides\.json#projectProjectionMode=global_only/);
    assert.match(routeSearchRefs, /~\/\.codex\/hooks\.json/);
    assert.ok(
      fuzzy.ownerDiscoveryPacket?.capabilityProviderCoverage?.localGlobalCached?.hooks >= 1,
      "global_only route validation must rely on cached global hook providers",
    );
  }
  assert.ok(
    fuzzy.ownerDiscoveryPacket?.capabilityProviderCoverage?.localGlobalCached?.plugins >= 1,
    "cached global plugin providers must be counted without per-run full scan",
  );
  assert.ok(
    fuzzy.ownerDiscoveryPacket?.runtimeToolProviders?.some((provider) => provider.type === "runtimeTools"),
    "runtime tool providers must be visible as reusable provider evidence",
  );
  assert.ok(
    fuzzy.ownerDiscoveryPacket?.capabilityProviderCoverage?.projectRuntimeLightScan?.runtimeTools >= 1,
    "runtime tool coverage must be exposed alongside skills, commands, hooks, MCP, plugins, rules, and prompts",
  );
  assert.equal(
    fuzzy.ownerDiscoveryPacket?.globalInventoryFreshness?.mode,
    "cached_global_inventory_plus_project_light_scan",
    "per-run routing must use cached global inventory plus light project scan",
  );
  assert.equal(fuzzy.ownerDiscoveryPacket?.globalInventoryFreshness?.staleAfterMinutes, 20160);
  assert.equal(fuzzy.ownerDiscoveryPacket?.globalInventoryFreshness?.staleAfterDays, 14);
  assert.equal(typeof fuzzy.ownerDiscoveryPacket?.globalInventoryFreshness?.refreshRequiredBeforeExecution, "boolean");
  assert.equal(fuzzy.routeExecutionGate?.canPreviewRoute, true);
  assert.equal(typeof fuzzy.routeExecutionGate?.canEnterExecution, "boolean");
  assert.ok(
    fuzzy.ownerDiscoveryPacket?.candidateReusableCapabilityProviders?.length > 0,
    "reusable capability providers must be listed before create/upgrade",
  );
  if (fuzzy.candidateDependencyProjects.includes("kim-decision")) {
    assert.equal(fuzzy.rankedRoutes.some((route) => route.dependencyProject === "kim-decision" && route.scoreBand === "execute"), false);
  }

  const product = route("product monetization task");
  assert.ok(product.internalDecisionPatterns.includes("thinking-minimum-test"));

  const chineseProduct = route("模糊目标：帮我把一个产品商业化，但我不知道先做增长、定价还是转化", "codex", "windows");
  assert.equal(chineseProduct.taskShape, "strategy_product_decision");
  assert.equal(chineseProduct.intentAmplificationPrecheck.needsIntentAmplification, true);
  assert.equal(chineseProduct.recommendedRoute?.weapon, "meta-kim-decision-patterns");
  assert.equal(chineseProduct.recommendedRoute?.dependencyProject, null);

  const subjectiveQuality = route("这个页面不好看，帮我弄高级一点", "codex", "windows");
  assert.equal(subjectiveQuality.entryClassification?.ambiguityPacket?.choicePolicy, "must_ask");
  assert.equal(subjectiveQuality.routeExecutionGate?.canEnterExecution, false);
  assert.equal(subjectiveQuality.recommendedRoute?.id, "subjective-ui-design-orchestration:codex:windows");
  assert.equal(
    subjectiveQuality.autonomousCapabilityDiscovery?.trigger,
    "entry_classifier_auto_governed_entry",
    "ordinary vague product/UI input must self-start capability discovery",
  );
  assert.equal(
    subjectiveQuality.autonomousCapabilityDiscovery?.requiredByDefault,
    true,
    "capability discovery must be a default entry behavior, not a user-reminder side effect",
  );
  assert.equal(
    subjectiveQuality.autonomousCapabilityDiscovery?.userReminderDetected,
    false,
    "the no-keyword subjective request fixture proves discovery was not triggered by the user's stage words",
  );
  for (const family of ["execution_agents", "skills", "mcp_servers", "commands", "runtime_tools", "verification_owner"]) {
    assert.ok(
      subjectiveQuality.autonomousCapabilityDiscovery?.familiesChecked?.includes(family),
      `autonomous capability discovery must check ${family}`,
    );
  }
  for (const source of [
    "project_runtime_inventory",
    "claude_global_inventory_cache",
    "codex_global_inventory_cache",
    "cursor_global_inventory_cache",
    "openclaw_global_inventory_cache",
    "codex_global_skill_filesystem_light_scan",
    "mcp_inventory",
    "package_json_scripts",
  ]) {
    assert.ok(
      subjectiveQuality.autonomousCapabilityDiscovery?.sourcesChecked?.includes(source),
      `autonomous capability discovery must check ${source}`,
    );
  }
  assert.match(
    subjectiveQuality.autonomousCapabilityDiscovery?.sourceRefPolicy ?? "",
    /~\/\.codex.*~\/\.claude.*~\/\.cursor.*~\/\.openclaw.*~\/\.agents/i,
    "reportable source refs must use a cross-runtime home-relative policy",
  );
  assert.equal(
    subjectiveQuality.typeFirstRoutePolicy?.policyKind,
    "route_selection_invariant",
    "route output must expose type-first classification as an invariant",
  );
  assert.equal(
    subjectiveQuality.typeFirstRoutePolicy?.mustNotBecomeChecklist,
    true,
    "type-first routing must not become another acceptance checklist",
  );
  assert.equal(
    subjectiveQuality.typeFirstRoutePolicy?.axes?.objectType?.forbiddenFallback,
    "guess_executable_route_from_shape_only",
    "route-critical object types must not be guessed from shape alone",
  );
  assert.equal(
    subjectiveQuality.typeFirstRoutePolicy?.axes?.evidenceType?.forbiddenFallback,
    "validator_pass_as_runtime_truth",
    "evidence typing must keep validator pass separate from runtime truth",
  );
  assert.equal(
    subjectiveQuality.typeFirstRoutePolicy?.axes?.ownershipType?.unclearAction,
    "preserve_or_block_until_owner_is_known",
    "unknown ownership must preserve or block instead of overwriting local state",
  );
  assert.equal(subjectiveQuality.routeExecutionGate?.typeFirstPolicyRef, "typeFirstRoutePolicy");
  assert.equal(subjectiveQuality.routeTypeClassification?.policyRef, "typeFirstRoutePolicy");
  assert.equal(
    subjectiveQuality.routeTypeClassification?.evidenceType?.claimLimit,
    "route_preview_not_runtime_truth",
    "structural route output must not claim runtime truth",
  );
  assert.equal(
    subjectiveQuality.routeTypeClassification?.objectType?.forbiddenFallbackAvoided,
    true,
    "route type classification must avoid object-shape guessing",
  );
  assert.ok(subjectiveQuality.decisionCheckpoints?.length >= 3);
  assert.ok(
    subjectiveQuality.decisionCheckpoints.some((checkpoint) => checkpoint.stage === "Thinking"),
    "subjective UI work must ask again after Fetch/Thinking when route choices diverge",
  );
  assert.ok(
    subjectiveQuality.workerTaskPacketDrafts?.some((packet) => packet.roleDisplayName === "frontend"),
    "subjective UI route must create frontend work lanes",
  );
  assert.ok(
    subjectiveQuality.workerTaskPacketDrafts?.some((packet) => packet.roleDisplayName === "test"),
    "subjective UI route must create browser/test verification lanes",
  );
  assert.ok(
    subjectiveQuality.workerTaskPacketDrafts?.some((packet) => packet.roleDisplayName === "review"),
    "subjective UI route must create a real review lane",
  );
  assert.ok(
    /read target page\/component\/style files/i.test(
      subjectiveQuality.subjectiveUiCapabilityAmplification?.readBeforeEditPolicy ?? "",
    ),
    "subjective UI implementation lane must preserve read-before-edit behavior",
  );
  assert.ok(
    JSON.stringify(subjectiveQuality.recommendedRoute?.selectedCapabilityProviders ?? {}).match(
      /product-design|design-review|design-html|e2e|browser/i,
    ),
    "subjective UI route must bind concrete design/frontend/browser/review capabilities",
  );
  assert.equal(subjectiveQuality.recommendedRoute?.blockedReasons?.length, 0);
  assert.equal(
    JSON.stringify(subjectiveQuality.recommendedRoute?.selectedCapabilityProviders ?? {}).includes("C:/Users/"),
    false,
    "route provider refs should not leak local absolute home paths into reportable route JSON",
  );
  assert.ok(
    subjectiveQuality.routeExecutionGate?.blockedBy.includes(
      "native_choice_surface_required_before_execution",
    ),
  );
  assert.equal(subjectiveQuality.routeExecutionGate?.returnToStage, "Critical");
  assert.notEqual(
    subjectiveQuality.recommendedRoute?.weapon,
    "dependency-project-registry",
    "subjective quality choices must stay on the internal decision/route path unless dependency discovery is explicit",
  );

  const subjectiveQualityWithReminder = route(
    "这个页面不好看，帮我弄高级一点 critical and fetch thinking and review",
    "codex",
    "windows",
  );
  assert.equal(
    subjectiveQualityWithReminder.recommendedRoute?.id,
    subjectiveQuality.recommendedRoute?.id,
    "explicit stage words must not be required to reach the subjective UI orchestration route",
  );
  assert.equal(subjectiveQualityWithReminder.autonomousCapabilityDiscovery?.userReminderDetected, true);
  assert.deepEqual(
    subjectiveQualityWithReminder.workerTaskPacketDrafts?.map((packet) => packet.roleInstanceId),
    subjectiveQuality.workerTaskPacketDrafts?.map((packet) => packet.roleInstanceId),
    "the no-keyword route must get the same lane amplification as the explicit stage-word route",
  );

  const subjectiveQualityConfirmed = route(
    "这个页面不好看，帮我弄高级一点",
    "codex",
    "windows",
    [
      "--native-choice-evidence",
      JSON.stringify({
        surface: "request_user_input",
        choices: [
          {
            stage: "Critical",
            status: "completed",
            evidenceRef: "codex:request_user_input:critical-answer",
          },
        ],
      }),
    ],
  );
  assert.equal(subjectiveQualityConfirmed.routeExecutionGate?.canEnterExecution, false);
  assert.ok(
    subjectiveQualityConfirmed.routeExecutionGate?.blockedBy.includes(
      "thinking_route_choice_required_before_execution",
    ),
  );
  assert.equal(subjectiveQualityConfirmed.routeExecutionGate?.returnToStage, "Thinking");
  assert.equal(subjectiveQualityConfirmed.routeExecutionGate?.nativeChoiceSurface?.evidence?.trusted, true);

  const subjectiveQualityFullyConfirmed = route(
    "这个页面不好看，帮我弄高级一点",
    "codex",
    "windows",
    [
      "--native-choice-evidence",
      JSON.stringify({
        surface: "request_user_input",
        choices: [
          {
            stage: "Critical",
            status: "completed",
            evidenceRef: "codex:request_user_input:critical-answer",
          },
          {
            stage: "Thinking",
            status: "completed",
            evidenceRef: "codex:request_user_input:thinking-answer",
          },
        ],
      }),
    ],
  );
  assert.equal(subjectiveQualityFullyConfirmed.routeExecutionGate?.canEnterExecution, true);
  assert.equal(subjectiveQualityFullyConfirmed.routeExecutionGate?.thinkingChoiceSurface?.evidenceTrusted, true);

  const subjectiveQualityForgedChoice = route(
    "这个页面不好看，帮我弄高级一点",
    "codex",
    "windows",
    ["--native-choice-evidence", "completed"],
  );
  assert.equal(subjectiveQualityForgedChoice.routeExecutionGate?.canEnterExecution, false);
  assert.equal(
    subjectiveQualityForgedChoice.routeExecutionGate?.nativeChoiceSurface?.evidence?.trusted,
    false,
  );
  assert.equal(
    subjectiveQualityForgedChoice.routeExecutionGate?.nativeChoiceSurface?.evidence?.status,
    "invalid",
  );

  const subjectiveQualityUnreferencedChoice = route(
    "这个页面不好看，帮我弄高级一点",
    "codex",
    "windows",
    [
      "--native-choice-evidence",
      JSON.stringify({
        surface: "request_user_input",
        choices: [
          { stage: "Critical", status: "completed" },
          { stage: "Thinking", status: "completed" },
        ],
      }),
    ],
  );
  assert.equal(subjectiveQualityUnreferencedChoice.routeExecutionGate?.canEnterExecution, false);
  assert.equal(
    subjectiveQualityUnreferencedChoice.routeExecutionGate?.nativeChoiceSurface?.evidence?.trusted,
    false,
  );

  const refactor = route("complex code refactor");
  assert.ok(refactor.recommendedRoute || refactor.capabilityGapPacket);
  assert.ok(refactor.capabilityGapPacket || !/^meta-/.test(refactor.recommendedRoute?.owner ?? ""), "Pure code execution must not route governance agent as implementation worker");
  if (!refactor.recommendedRoute) {
    assert.equal(refactor.routeExecutionGate?.canEnterExecution, false, "Execution gate must block when no route is recommended");
  }

  const smoke = route(
    "Create a provider smoke test that discovers an execution agent, finds a skill provider, finds an MCP provider, and emits a verification command",
    "codex",
    "windows",
  );
  assert.equal(smoke.taskShape, "engineering_execution");
  assert.equal(smoke.recommendedRoute?.id, "execution-capability-discovery:codex:windows");
  assert.ok(!/^meta-/.test(smoke.recommendedRoute?.owner ?? ""), "Engineering smoke route must use an execution owner");
  assert.equal(smoke.recommendedRoute?.selectedCapabilityProviders?.skillDiscovery?.id, "findskill");
  assert.equal(smoke.recommendedRoute?.selectedCapabilityProviders?.skillCreation?.id, "skill-creator");
  assert.equal(
    smoke.recommendedRoute?.selectedCapabilityProviders?.skillDiscovery?.platformId,
    "codex",
    "Codex smoke route must prefer the Codex-installed findskill provider over same-name Claude Code skills",
  );
  assert.equal(
    smoke.recommendedRoute?.selectedCapabilityProviders?.skillCreation?.platformId,
    "codex",
    "Codex smoke route must prefer the Codex-installed skill-creator provider over same-name Claude Code skills",
  );
  assert.ok(smoke.recommendedRoute?.selectedCapabilityProviders?.agent, "Engineering smoke route must bind an execution agent provider");
  assert.notEqual(
    smoke.recommendedRoute?.selectedCapabilityProviders?.agent?.platformId,
    "claudeCode",
    "Codex smoke route must not bind Claude Code global agents as execution owners",
  );
  assert.equal(smoke.recommendedRoute?.selectedCapabilityProviders?.agentCreation?.id, "create-agent");
  assert.ok(smoke.recommendedRoute?.selectedCapabilityProviders?.skill, "Engineering smoke route must bind a skill provider");
  assert.ok(
    smoke.recommendedRoute?.selectedCapabilityProviders?.mcpServer || smoke.recommendedRoute?.selectedCapabilityProviders?.mcpTool,
    "Engineering smoke route must bind an MCP provider",
  );
  assert.ok(smoke.recommendedRoute?.selectedCapabilityProviders?.command || smoke.recommendedRoute?.selectedCapabilityProviders?.runtimeTool);
  assert.equal(smoke.routeExecutionGate?.canEnterExecution, true);

  const claudeAgentSearch = route(
    "在 Claude Code 里运行 agent 搜索不对 critical and fetch thinking and review",
    "claude_code",
    "windows",
  );
  assert.equal(
    claudeAgentSearch.recommendedRoute?.id,
    "execution-capability-discovery:claude_code:windows",
    "Claude Code agent-search complaints must route to execution capability discovery",
  );
  assert.notEqual(
    claudeAgentSearch.recommendedRoute?.selectedCapabilityProviders?.agent?.runtime,
    "codex",
    "Claude Code must not bind Codex project agent adapters as execution owners",
  );
  assert.ok(
    !String(claudeAgentSearch.recommendedRoute?.selectedCapabilityProviders?.agent?.sourceRef ?? "").startsWith(".codex/agents/"),
    "Claude Code agent search must not select .codex/agents adapters as callable Claude agents",
  );

  const codexAgentReuseComplaint = route(
    "Critical Thinking Fetch Deep Thinking Review 为什么 Codex 一直创建 agent 而不是找全局 agent",
    "codex",
    "windows",
  );
  assert.equal(
    codexAgentReuseComplaint.recommendedRoute?.id,
    "execution-capability-discovery:codex:windows",
    "Codex agent-creation complaints must route to execution capability discovery before dependency/project registry",
  );
  assert.equal(
    codexAgentReuseComplaint.recommendedRoute?.selectedCapabilityProviders?.agent?.platformId,
    "codex",
    "Codex owner discovery must bind a Codex-callable global/project agent provider",
  );
  assert.equal(
    codexAgentReuseComplaint.recommendedRoute?.codexSpawnBinding?.spawnMode,
    "typed_spawn",
    "Codex global agent reuse must produce a typed spawn binding",
  );
  assert.equal(
    codexAgentReuseComplaint.recommendedRoute?.codexSpawnBinding?.agent_type,
    codexAgentReuseComplaint.recommendedRoute?.owner,
    "Codex typed spawn must use the selected owner as agent_type",
  );
  assert.equal(
    codexAgentReuseComplaint.recommendedRoute?.codexSpawnBinding?.fork_context,
    false,
    "Codex typed global agent reuse must not request a full-context fork",
  );
  assert.equal(
    codexAgentReuseComplaint.workerTaskPacketDrafts?.[0]?.codexSpawnBinding?.agent_type,
    codexAgentReuseComplaint.recommendedRoute?.owner,
    "Worker task packets must carry the same Codex typed agent binding",
  );
  assert.equal(
    codexAgentReuseComplaint.capabilityGapDetected,
    false,
    "A complaint about repeated agent creation must not be misread as a create-agent capability gap request",
  );

  const codexExplicitParallelDispatch = route(
    "我要的是派发啊 并行啊：检查 meta-theory 规则、Codex runtime、测试缺口",
    "codex",
    "windows",
  );
  assert.equal(
    codexExplicitParallelDispatch.recommendedRoute?.id,
    "execution-capability-discovery:codex:windows",
    "Direct parallel dispatch requests must route to execution capability discovery",
  );
  assert.ok(
    codexExplicitParallelDispatch.workerTaskPacketDrafts.length >= 2,
    "Direct parallel dispatch requests with separable scopes must produce multiple worker task packets",
  );
  assert.ok(
    codexExplicitParallelDispatch.workerTaskPacketDrafts.every((packet) => packet.ownerKind === "agent"),
    "Direct parallel dispatch worker lanes must bind reusable agent owners instead of replacing owners with skills",
  );
  assert.ok(
    codexExplicitParallelDispatch.workerTaskPacketDrafts.every(
      (packet) => packet.codexSpawnBinding?.spawnMode === "typed_spawn" && packet.codexSpawnBinding?.agent_type === packet.ownerAgent,
    ),
    "Every Codex parallel dispatch worker must carry a typed spawn_agent binding for its selected owner",
  );
  assert.ok(
    codexExplicitParallelDispatch.dispatchBoardDraft?.orchestratorKinds?.includes("agentTeamsPlaybook"),
    "Multiple Codex agent lanes must select the agent teams fan-out adapter",
  );

  const codexStructuredChainFanout = route(
    "Critical Thinking → Fetch → Deep Thinking → Review 检查 meta-theory 规则、Codex runtime、测试缺口",
    "codex",
    "windows",
  );
  assert.equal(
    codexStructuredChainFanout.entryClassification?.subagentAuthorizationSource,
    "meta_theory_trigger_request",
    "Structured Critical/Fetch/Thinking/Review chains are meta-theory activations that must authorize safe fan-out without extra dispatch wording",
  );
  assert.equal(
    codexStructuredChainFanout.recommendedRoute?.id,
    "execution-capability-discovery:codex:windows",
    "Structured chain fan-out must route through execution capability discovery",
  );
  assert.ok(
    codexStructuredChainFanout.workerTaskPacketDrafts.length >= 2,
    "Structured chain fan-out with separable scopes must produce multiple worker task packets",
  );
  assert.ok(
    codexStructuredChainFanout.workerTaskPacketDrafts.every(
      (packet) => packet.ownerKind === "agent" && packet.codexSpawnBinding?.agent_type === packet.ownerAgent,
    ),
    "Structured chain fan-out worker lanes must bind reusable Codex agent owners",
  );

  const codexMetaTriggerFanout = route(
    "meta-theory 检查 meta-theory 规则、Codex runtime、测试缺口",
    "codex",
    "windows",
  );
  assert.equal(
    codexMetaTriggerFanout.entryClassification?.subagentAuthorizationSource,
    "meta_theory_trigger_request",
    "A meta-theory trigger itself must authorize safe fan-out once scopes are separable",
  );
  assert.equal(
    codexMetaTriggerFanout.recommendedRoute?.id,
    "execution-capability-discovery:codex:windows",
    "Meta-theory fan-out must route through execution capability discovery when there are separable scopes",
  );
  assert.ok(
    codexMetaTriggerFanout.workerTaskPacketDrafts.length >= 2,
    "Meta-theory fan-out with separable scopes must produce multiple worker task packets",
  );
  assert.ok(
    codexMetaTriggerFanout.workerTaskPacketDrafts.every(
      (packet) => packet.ownerKind === "agent" && packet.codexSpawnBinding?.agent_type === packet.ownerAgent,
    ),
    "Meta-theory fan-out worker lanes must bind reusable Codex agent owners",
  );

  const codexWhitespaceFanout = route(
    "Critical Thinking → Fetch → Deep Thinking → Review 检查平台 key adapter 注册 能力账本 第二批平台路由 上传证据",
    "codex",
    "windows",
  );
  assert.ok(
    codexWhitespaceFanout.workerTaskPacketDrafts.length >= 2,
    "Structured fan-out must split whitespace-separated capability anchors instead of collapsing to one worker",
  );
  assert.ok(
    codexWhitespaceFanout.workerTaskPacketDrafts.every(
      (packet) => packet.ownerKind === "agent" && packet.codexSpawnBinding?.agent_type === packet.ownerAgent,
    ),
    "Whitespace fan-out worker lanes must reuse discovered Codex agent owners through typed spawn bindings",
  );

  const hook = route("platform hook install");
  assert.ok(hook.candidateWeapons.includes("runtime-capability-matrix"));

  const windows = route("windows setup task", "codex", "windows");
  assert.equal(windows.osFilterResult.applied, "windows");

  const cursor = route("cursor unknown capability task", "cursor", "windows");
  assert.ok(cursor.recommendedRoute || cursor.capabilityGapPacket);

  const missing = route("missing dependency task");
  assert.ok(missing.recommendedRoute || missing.capabilityGapPacket);
  assert.ok(
    ["classified_route_can_be_scored", "blocked_with_reason", "capabilityGapPacket"].includes(
      missing.routeExecutionGate?.typeFirstDisposition,
    ),
    "missing providers must classify or degrade instead of guessing an executable route",
  );
  assert.equal(
    missing.routeTypeClassification?.gapDecisionRef,
    "capabilityGapDecision",
    "capability-gap routing must link type classification to the blocking decision",
  );
});
