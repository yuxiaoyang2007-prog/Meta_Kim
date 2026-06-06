#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { GOVERNANCE_OWNERS, OS_TARGETS, RUNTIMES, classifyTaskShape, exists, readJson, repoPath, scoreRoute, stateDir, supportScore, toPosix } from "./governance-lib.mjs";
import { CAPABILITY_GAP_DECISION_CONTRACT, decideCapabilityGap } from "./capability-gap-mvp.mjs";

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function readStateJson(name, fallback) {
  const file = path.join(stateDir, name);
  return (await exists(file)) ? JSON.parse(await fs.readFile(file, "utf8")) : fallback;
}

const task = argValue("--task", "");
const runtimeArg = argValue("--runtime", "auto");
const osArg = argValue("--os", "auto");
const json = process.argv.includes("--json");
const runtime = runtimeArg === "auto" ? "codex" : runtimeArg;
const osTarget = osArg === "auto" ? "windows" : osArg;
const taskShape = classifyTaskShape(task);
const taskText = String(task ?? "").toLowerCase();

const weapons = (await readJson("config/capability-index/weapon-registry.json")).weapons ?? [];
const registryDependencies = (await readJson("config/capability-index/dependency-project-registry.json")).projects ?? [];
const repoCapabilityIndex = await readJson("config/capability-index/meta-kim-capabilities.json");
const workflowContract = await readJson("config/contracts/workflow-contract.json");
const capabilityInventory = await readStateJson("capability-inventory.json", { capabilities: [] });
const globalCapabilityInventory = await readStateJson(path.join("capability-index", "global-capabilities.json"), { byCapabilityType: { agents: {} }, byPlatform: {} });
const dependencyIndex = await readStateJson("dependency-capability-index.json", { discoveredDependencyProjects: [] });
const choicePolicy = await readJson("config/governance/choice-surface-policy.json");
const intentContract = await readJson("config/governance/intent-amplification-contract.json");

function textContains(entry, terms) {
  const text = JSON.stringify(entry).toLowerCase();
  return terms.some((term) => text.includes(term));
}

function taskContainsAny(terms) {
  return terms.some((term) => taskText.includes(term));
}

function implicitScriptCapabilityGapRequested() {
  const recurrenceSignal = taskContainsAny([
    "repeat",
    "recurring",
    "repeatedly",
    "every time",
    "stable",
    "每次",
    "反复",
    "重复",
    "稳定",
  ]);
  const deterministicSignal = taskContainsAny([
    "mechanical",
    "testable",
    "local",
    "deterministic",
    "json summary",
    "json report",
    "stage outputs",
    "verification owner",
    "decision output",
    "blocked gate reason",
    "机械",
    "可测试",
    "本地",
    "自动整理",
    "检测缺失",
  ]);
  const noAgentSignal = taskContainsAny([
    "no new agent",
    "no agent identity",
    "不需要新 agent",
    "不需要新agent",
    "不需要新 agent 身份",
    "不需要新长期身份",
  ]);
  return recurrenceSignal && deterministicSignal && noAgentSignal;
}

function explicitCapabilityGapRequested() {
  return [
    "capability gap",
    "missing capability",
    "missing dependency",
    "imaginary provider",
    "unknown provider",
    "no provider",
    "create skill",
    "create agent",
    "create script",
    "create mcp",
    "缺能力",
    "能力缺口",
    "缺少能力",
    "缺少依赖",
    "不存在的 provider",
    "创建 skill",
    "创建 agent",
    "创建 script",
    "创建 mcp",
  ].some((term) => taskText.includes(term)) || implicitScriptCapabilityGapRequested();
}

function taskTerms() {
  if (taskShape === "strategy_product_decision") return ["strategy", "product", "decision", "monetization", "策略", "产品", "商业化", "变现"];
  if (taskShape === "platform_governance") return ["runtime", "platform", "hook", "os", "codex", "cursor", "openclaw", "claude", "平台", "钩子"];
  if (taskShape === "engineering_execution") return ["code", "test", "refactor", "engineering", "代码", "测试", "重构"];
  return ["governance", "capability", "workflow", "治理", "能力"];
}

function fitsTask(entry) {
  const terms = taskTerms();
  if (taskShape === "fuzzy_complex_task") return true;
  return textContains(entry, terms) || /fuzzy|complex|governance|治理|复杂/.test(taskText);
}

function capabilityEntries(index, type) {
  return Object.values(index?.byCapabilityType?.[type] ?? {});
}

function uniqueById(items) {
  const seen = new Set();
  const unique = [];
  for (const item of items) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
  }
  return unique;
}

function compactAgent(entry, source) {
  const layer = entry.layer ?? (String(entry.id ?? "").startsWith("meta-") ? "meta" : "execution");
  const sourceRef = entry.sourcePath ?? entry.relativePath ?? (entry.platformId ? `${entry.platformId}:${entry.id}` : entry.id);
  return {
    id: entry.id,
    layer,
    source,
    sourceRef: toPosix(sourceRef),
    executionBlock: entry.executionBlock ?? layer === "meta",
  };
}

function compactCapabilityProvider(entry, source, type = entry.type ?? "skills") {
  const sourceRef = entry.sourcePath ?? entry.relativePath ?? (entry.platformId ? `${entry.platformId}:${entry.id}` : entry.path ?? entry.id);
  return {
    id: entry.id,
    type,
    source,
    platformId: entry.platformId ?? null,
    sourceRef: toPosix(sourceRef),
  };
}

async function scanProjectFiles({ runtime: runtimeName, dir, type, source, extensions, recursive = false, maxDepth = 2 }) {
  const providers = [];
  const root = repoPath(dir);
  if (!(await exists(root))) return providers;

  async function visit(absDir, relDir, depth) {
    const entries = await fs.readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      const absPath = path.join(absDir, entry.name);
      const relPath = path.join(relDir, entry.name);
      if (entry.isDirectory()) {
        if (recursive && depth < maxDepth) await visit(absPath, relPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!extensions.some((extension) => entry.name.endsWith(extension))) continue;
      const id = relPath.replace(/\.[^.]+$/, "").replace(/\\/g, "/");
      providers.push({
        id,
        type,
        source,
        runtime: runtimeName,
        sourceRef: toPosix(path.join(dir, relPath)),
      });
    }
  }

  await visit(root, "", 0);
  return providers;
}

async function projectRuntimeAgents() {
  const dirs = [
    { runtime: "claude_code", dir: ".claude/agents", extension: ".md" },
    { runtime: "codex", dir: ".codex/agents", extension: ".toml" },
    { runtime: "cursor", dir: ".cursor/agents", extension: ".md" },
  ];
  const agents = [];
  for (const { runtime: runtimeName, dir, extension } of dirs) {
    const absDir = repoPath(dir);
    if (!(await exists(absDir))) continue;
    const entries = await fs.readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(extension)) continue;
      const id = entry.name.slice(0, -extension.length);
      const layer = id.startsWith("meta-") ? "meta" : "execution";
      agents.push({
        id,
        layer,
        source: "project_runtime_agent_inventory",
        runtime: runtimeName,
        sourceRef: toPosix(path.join(dir, entry.name)),
        executionBlock: layer === "meta",
      });
    }
  }
  return agents;
}

async function projectSkillProviders() {
  const dirs = [
    { runtime: "codex", dir: ".agents/skills", marker: "SKILL.md" },
    { runtime: "claude_code", dir: ".claude/skills", marker: "SKILL.md" },
    { runtime: "cursor", dir: ".cursor/skills", marker: "SKILL.md" },
    { runtime: "openclaw", dir: "openclaw/skills", marker: "SKILL.md" },
  ];
  const providers = [];
  for (const { runtime: runtimeName, dir, marker } of dirs) {
    const absDir = repoPath(dir);
    if (!(await exists(absDir))) continue;
    const entries = await fs.readdir(absDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(dir, entry.name, marker);
      if (!(await exists(repoPath(skillFile)))) continue;
      providers.push({
        id: entry.name,
        type: "skills",
        source: "project_runtime_skill_inventory",
        runtime: runtimeName,
        sourceRef: toPosix(skillFile),
      });
    }
  }
  return providers;
}

async function projectCapabilityProviders() {
  const providerSpecs = [
    { runtime: "claude_code", dir: ".claude/hooks", type: "hooks", source: "project_runtime_hook_inventory", extensions: [".js", ".mjs", ".cjs", ".ts", ".py", ".sh"] },
    { runtime: "codex", dir: ".codex/hooks", type: "hooks", source: "project_runtime_hook_inventory", extensions: [".js", ".mjs", ".cjs", ".ts", ".py", ".sh"] },
    { runtime: "cursor", dir: ".cursor/hooks", type: "hooks", source: "project_runtime_hook_inventory", extensions: [".js", ".mjs", ".cjs", ".ts", ".py", ".sh"] },
    { runtime: "openclaw", dir: "openclaw/hooks", type: "hooks", source: "project_runtime_hook_inventory", extensions: [".js", ".mjs", ".cjs", ".ts", ".py", ".sh"] },
    { runtime: "claude_code", dir: ".claude/commands", type: "commands", source: "project_runtime_command_inventory", extensions: [".md", ".toml", ".yaml", ".yml"], recursive: true },
    { runtime: "codex", dir: ".codex/commands", type: "commands", source: "project_runtime_command_inventory", extensions: [".md", ".toml", ".yaml", ".yml"], recursive: true },
    { runtime: "cursor", dir: ".cursor/rules", type: "rules", source: "project_runtime_rule_inventory", extensions: [".mdc", ".md"], recursive: true },
    { runtime: "codex", dir: ".codex/prompts", type: "prompts", source: "project_runtime_prompt_inventory", extensions: [".md", ".txt", ".yaml", ".yml"], recursive: true },
    { runtime: "claude_code", dir: ".claude/prompts", type: "prompts", source: "project_runtime_prompt_inventory", extensions: [".md", ".txt", ".yaml", ".yml"], recursive: true },
    { runtime: "cursor", dir: ".cursor/prompts", type: "prompts", source: "project_runtime_prompt_inventory", extensions: [".md", ".txt", ".yaml", ".yml"], recursive: true },
  ];
  const providers = [];
  for (const spec of providerSpecs) {
    providers.push(...await scanProjectFiles(spec));
  }
  for (const file of [
    { id: "repo-mcp", type: "mcpServers", source: "project_runtime_mcp_inventory", runtime: "shared", sourceRef: ".mcp.json" },
    { id: "cursor-mcp", type: "mcpServers", source: "project_runtime_mcp_inventory", runtime: "cursor", sourceRef: ".cursor/mcp.json" },
    { id: "codex-config-mcp", type: "mcpServers", source: "project_runtime_mcp_inventory", runtime: "codex", sourceRef: ".codex/config.toml" },
  ]) {
    if (await exists(repoPath(file.sourceRef))) providers.push(file);
  }
  return providers;
}

const repoCanonicalAgents = capabilityEntries(repoCapabilityIndex, "agents").map((entry) => compactAgent(entry, "repo_canonical_capability_index"));
const localGlobalAgents = capabilityEntries(globalCapabilityInventory, "agents").map((entry) => compactAgent(entry, "local_global_agent_inventory"));
const projectRuntimeAgentCandidates = await projectRuntimeAgents();
const repoCanonicalSkillProviders = capabilityEntries(repoCapabilityIndex, "skills").map((entry) => compactCapabilityProvider(entry, "repo_canonical_capability_index", "skills"));
const projectRuntimeSkillProviders = await projectSkillProviders();
const repoCanonicalCapabilityProviders = [
  ...repoCanonicalSkillProviders,
  ...["commands", "hooks", "mcpServers", "mcpTools", "plugins", "rules", "prompts"].flatMap((type) =>
    capabilityEntries(repoCapabilityIndex, type).map((entry) => compactCapabilityProvider(entry, "repo_canonical_capability_index", type)),
  ),
];
const projectRuntimeCapabilityProviders = [
  ...projectRuntimeSkillProviders,
  ...await projectCapabilityProviders(),
];
const localGlobalCapabilityProvidersAll = ["skills", "commands", "hooks", "plugins", "mcpServers", "mcpTools", "rules", "prompts"].flatMap((type) =>
  capabilityEntries(globalCapabilityInventory, type)
    .map((entry) => compactCapabilityProvider(entry, `local_global_${type}_inventory`, type)),
);
const localGlobalCapabilityProviders = localGlobalCapabilityProvidersAll.slice(0, 120);
const localGlobalSkillProviders = localGlobalCapabilityProvidersAll
  .filter((provider) => provider.type === "skills")
  .slice(0, 60);
const discoveredRuntimeToolProviders = (capabilityInventory.capabilities ?? [])
  .filter((capability) => capability.type === "runtime_tool")
  .map((entry) => compactCapabilityProvider(entry, "local_runtime_capability_inventory", "runtimeTools"));
const runtimeToolProviders = uniqueById([
  ...discoveredRuntimeToolProviders,
  ...[
    {
      id: "shell_command",
      type: "runtimeTools",
      source: "runtime_tool_provider_inventory",
      platformId: runtime,
      sourceRef: `${runtime}:shell_command`,
    },
    {
      id: "apply_patch",
      type: "runtimeTools",
      source: "runtime_tool_provider_inventory",
      platformId: runtime,
      sourceRef: `${runtime}:apply_patch`,
    },
    {
      id: "filesystem",
      type: "runtimeTools",
      source: "runtime_tool_provider_inventory",
      platformId: runtime,
      sourceRef: `${runtime}:filesystem`,
    },
  ],
]);
const capabilityProviderCoverage = {
  repoCanonical: Object.fromEntries(["skills", "commands", "hooks", "mcpServers", "mcpTools", "plugins", "rules", "prompts", "runtimeTools"].map((type) => [type, capabilityEntries(repoCapabilityIndex, type).length])),
  projectRuntimeLightScan: Object.fromEntries(["skills", "commands", "hooks", "mcpServers", "rules", "prompts", "runtimeTools"].map((type) => [type, type === "runtimeTools" ? runtimeToolProviders.length : projectRuntimeCapabilityProviders.filter((provider) => provider.type === type).length])),
  localGlobalCached: Object.fromEntries(["agents", "skills", "commands", "hooks", "plugins", "mcpServers", "mcpTools", "rules", "prompts", "runtimeTools"].map((type) => [type, type === "runtimeTools" ? runtimeToolProviders.length : capabilityEntries(globalCapabilityInventory, type).length])),
};
const globalInventoryGeneratedAt = globalCapabilityInventory.generatedAt ?? null;
const globalInventoryAgeMinutes = globalInventoryGeneratedAt
  ? Math.max(0, Math.round((Date.now() - Date.parse(globalInventoryGeneratedAt)) / 60000))
  : null;
const GLOBAL_INVENTORY_STALE_AFTER_MINUTES = 14 * 24 * 60;
const globalInventoryStale =
  globalInventoryAgeMinutes === null || globalInventoryAgeMinutes > GLOBAL_INVENTORY_STALE_AFTER_MINUTES;
const globalInventoryFreshness = {
  mode: "cached_global_inventory_plus_project_light_scan",
  fullScanWhen: [
    "install",
    "update",
    "explicit_user_refresh",
    "missing_required_provider",
    "stale_cache",
    "scheduled_refresh_older_than_14_days",
    "high_risk_provider_route",
  ],
  perRunBehavior: "read cached global inventory, do lightweight project scan, require full refresh when cache is missing or older than 14 days",
  generatedAt: globalInventoryGeneratedAt,
  ageMinutes: globalInventoryAgeMinutes,
  staleAfterMinutes: GLOBAL_INVENTORY_STALE_AFTER_MINUTES,
  staleAfterDays: 14,
  stale: globalInventoryStale,
  refreshRequiredBeforeExecution: globalInventoryStale,
  refreshCommand: "npm run discover:global",
  userHint: globalInventoryAgeMinutes === null
    ? "Capability cache is missing; this run should first update with npm run discover:global so newly added capabilities can be matched."
    : globalInventoryStale
      ? "The last full capability scan is over 2 weeks old; this run should first update with npm run discover:global to match newly added user content and reach the best capability route."
      : null,
};
const governanceStagePolicy = workflowContract.protocols?.agentBlueprintPacket?.governanceStageCoveragePolicy ?? {};
const governanceStages = Object.fromEntries(
  ["Critical", "Fetch", "Thinking", "Review"].map((stage) => [
    stage,
    {
      requiredAgents: governanceStagePolicy.stageRequiredAgents?.[stage] ?? [],
      allowedAgents: governanceStagePolicy.stageAllowedAgents?.[stage] ?? [],
      evidenceSource: "config/contracts/workflow-contract.json#/protocols/agentBlueprintPacket/governanceStageCoveragePolicy",
    },
  ]),
);
const governanceStageOwners = [...new Set(Object.values(governanceStages).flatMap((stage) => [...stage.requiredAgents, ...stage.allowedAgents]))];
const candidateExistingExecutionOwners = [
  ...projectRuntimeAgentCandidates,
  ...localGlobalAgents,
]
  .filter((agent) => agent.layer !== "meta" && agent.executionBlock !== true)
  .map((agent) => agent.id);
const ownerDiscoveryPacket = {
  discoveryPrinciple: "provider_first_evidence_owner_last_binding",
  searchOrder: [
    "available_capability_providers_skills_tools_mcp",
    "runtime_tool_provider_inventory",
    "repo_canonical_capability_index",
    "runtime_mirror_indexes",
    "project_runtime_agent_inventory",
    "local_global_agent_inventory",
  ],
  ownerBindingOrder: workflowContract.runDiscipline?.executionOwnership?.existingOwnerEvidenceOrder ?? [
    "repo_canonical_capability_index",
    "runtime_mirror_indexes",
    "project_runtime_agent_inventory",
    "local_global_agent_inventory",
  ],
  governanceStages,
  repoCanonicalAgents: repoCanonicalAgents.slice(0, 20),
  projectRuntimeAgents: projectRuntimeAgentCandidates.slice(0, 30),
  localGlobalAgents: localGlobalAgents.slice(0, 30),
  repoCanonicalSkillProviders: repoCanonicalSkillProviders.slice(0, 30),
  projectRuntimeSkillProviders: projectRuntimeSkillProviders.slice(0, 40),
  localGlobalSkillProviders,
  repoCanonicalCapabilityProviders: repoCanonicalCapabilityProviders.slice(0, 60),
  projectRuntimeCapabilityProviders: projectRuntimeCapabilityProviders.slice(0, 80),
  localGlobalCapabilityProviders,
  runtimeToolProviders: runtimeToolProviders.slice(0, 40),
  capabilityProviderCoverage,
  globalInventoryFreshness,
  candidateReusableCapabilityProviders: uniqueById([
    ...repoCanonicalCapabilityProviders,
    ...projectRuntimeCapabilityProviders,
    ...localGlobalCapabilityProvidersAll,
    ...runtimeToolProviders,
  ]).map((provider) => provider.id).slice(0, 100),
  candidateExistingExecutionOwners: [...new Set(candidateExistingExecutionOwners)].slice(0, 40),
  governanceStageOwners,
  evidenceRefs: [
    "config/capability-index/meta-kim-capabilities.json",
    ".codex/agents",
    ".claude/agents",
    ".cursor/agents",
    ".agents/skills",
    ".claude/skills",
    ".cursor/skills",
    "openclaw/skills",
    ".claude/hooks",
    ".codex/hooks",
    ".cursor/rules",
    "config/runtime-capability-matrix.json",
    ".meta-kim/state/default/capability-inventory.json",
    ".mcp.json",
    ".cursor/mcp.json",
    ".codex/config.toml",
    ".meta-kim/state/default/capability-index/global-capabilities.json",
    "config/contracts/workflow-contract.json",
  ],
};

const dependencyRecords = [
  ...registryDependencies.map((dep) => ({
    id: dep.id,
    name: dep.name,
    routeEligibility: dep.capabilityCard?.routeEligibility ?? "unknown",
    invokeAs: dep.interface?.invokeAs ?? "reference",
    runtimeSupport: dep.runtimeSupport ?? {},
    osSupport: dep.osSupport ?? {},
    invocationPath: dep.interface?.invocationPath ?? null,
    verificationMethod: dep.capabilityCard?.verificationMethod ?? null,
    reuseScore: dep.scoring?.overall ?? 50,
    taskShapes: dep.capabilityCard?.taskShapes ?? dep.capabilityCard?.canDo ?? [],
    triggerConditions: dep.capabilityCard?.triggerConditions ?? [],
    risk: dep.capabilityCard?.risk ?? dep.capabilityCard?.knownRisks ?? [],
  })),
  ...(dependencyIndex.discoveredDependencyProjects ?? []),
].filter((dep, index, all) => all.findIndex((item) => item.id === dep.id) === index);

function dependencyExecutable(dep) {
  const eligibility = dep?.routeEligibility ?? "unknown";
  if (["reference_only", "external_reference", "blocked", "blocked_for_execution", "needs_probe", "unknown"].includes(eligibility)) return false;
  if (dep?.invokeAs === "reference" || dep?.invokeAs === "notInvokable") return false;
  if (!dep?.invocationPath || !dep?.verificationMethod) return false;
  if (dep?.runtimeSupport?.[runtime] === "unsupported") return false;
  if (dep?.osSupport?.[osTarget] === "unsupported") return false;
  return true;
}

const candidateWeapons = weapons.filter(fitsTask);
const candidateDependencies = dependencyRecords.filter((dep) => fitsTask(dep));
const candidateFoundationalCapabilities = (capabilityInventory.capabilities ?? [])
  .filter((cap) => cap.mustPreserve && fitsTask(cap))
  .slice(0, 20)
  .map((cap) => cap.id);

function routeForWeapon(weapon) {
  const dependencyIds = weapon.dependencyProjects ?? [];
  const dep = dependencyIds.length ? candidateDependencies.find((candidate) => dependencyIds.includes(candidate.id)) ?? null : null;
  const runtimeValue = weapon.runtimeSupport?.[runtime] ?? "unknown";
  const osValue = weapon.osSupport?.[osTarget] ?? "unknown";
  const selectedOwner = weapon.ownerCandidates?.[0] ?? null;
  const existingOwnerMatched = selectedOwner
    ? ownerDiscoveryPacket.candidateExistingExecutionOwners.includes(selectedOwner) ||
      ownerDiscoveryPacket.governanceStageOwners.includes(selectedOwner)
    : false;
  const blockedReasons = [];
  if (!weapon.ownerCandidates?.length) blockedReasons.push("owner missing");
  if (!weapon.id) blockedReasons.push("weapon missing");
  if (runtimeValue === "unsupported") blockedReasons.push("runtime unsupported");
  if (osValue === "unsupported") blockedReasons.push("OS unsupported");
  if (weapon.ownerCandidates?.some((owner) => owner === "general-purpose")) blockedReasons.push("general-purpose fallback");
  if (weapon.ownerCandidates?.some((owner) => /runtimeInstanceAlias|nickname/i.test(owner))) blockedReasons.push("runtime alias as durable owner");
  if (taskShape === "engineering_execution" && selectedOwner && GOVERNANCE_OWNERS.includes(selectedOwner)) blockedReasons.push("governance agent as implementation worker");
  if (dep && !dependencyExecutable(dep)) {
    if (dep.routeEligibility === "reference_only" || dep.invokeAs === "reference") blockedReasons.push("dependency reference_only");
    if (!dep.invocationPath) blockedReasons.push("dependency missing invocationPath");
    if (!dep.verificationMethod) blockedReasons.push("dependency missing verificationMethod");
    if (dep.runtimeSupport?.[runtime] === "unsupported") blockedReasons.push("dependency runtime unsupported");
    if (dep.osSupport?.[osTarget] === "unsupported") blockedReasons.push("dependency OS unsupported");
  }
  const dependencyFit = dep ? (dependencyExecutable(dep) ? dep.reuseScore ?? 70 : 20) : 70;
  const intentFit = (taskShape === "strategy_product_decision" && weapon.id === "meta-kim-decision-patterns") ? 100 : fitsTask(weapon) ? 85 : 50;
  const weaponFit = (taskShape === "strategy_product_decision" && weapon.id === "meta-kim-decision-patterns") ? 100 : 90;
  const routeScore = blockedReasons.length ? Math.min(49, scoreRoute({
    intentFit,
    ownerFit: weapon.ownerCandidates?.length ? 85 : 0,
    weaponFit,
    dependencyFit,
    runtimeSupport: supportScore(runtimeValue),
    osSupport: supportScore(osValue),
    verification: weapon.verification?.command ? 85 : 20,
    riskClarity: weapon.risk ? 80 : 20,
  })) : scoreRoute({
    intentFit,
    ownerFit: weapon.ownerCandidates?.length ? 85 : 0,
    weaponFit,
    dependencyFit,
    runtimeSupport: supportScore(runtimeValue),
    osSupport: supportScore(osValue),
    verification: weapon.verification?.command ? 85 : 20,
    riskClarity: weapon.risk ? 80 : 20,
  });
  return {
    id: `${weapon.id}:${runtime}:${osTarget}`,
    owner: selectedOwner,
    weapon: weapon.id,
    dependency: dep?.id ?? null,
    dependencyProject: dep?.id ?? null,
    runtime,
    os: osTarget,
    verificationOwner: weapon.verification?.command ? "meta-prism" : null,
    verificationMethod: weapon.verification?.command ?? null,
    verification: weapon.verification,
    score: routeScore,
    scoreBand: routeScore >= 85 ? "execute" : routeScore >= 70 ? "confirm_or_fetch_more" : routeScore >= 50 ? "upgrade_owner_weapon_dependency" : "blocked",
    routeScoreBreakdown: {
      intentFitWeight: 20,
      ownerFitWeight: 15,
      weaponFitWeight: 15,
      dependencyFitWeight: 15,
      runtimeSupportWeight: 10,
      osSupportWeight: 10,
      verificationStrengthWeight: 10,
      riskRollbackClarityWeight: 5,
      runtimeSupport: runtimeValue,
      osSupport: osValue,
      dependencyFit,
    },
    ownerBinding: {
      selectedOwner,
      source: "weapon_owner_candidates",
      existingOwnerMatched,
      bindingStage: "Thinking",
      providerEvidenceRef: "ownerDiscoveryPacket.candidateReusableCapabilityProviders",
      ownerDiscoveryRef: "ownerDiscoveryPacket",
    },
    blockedReasons,
  };
}

const reusableProviders = uniqueById([
  ...repoCanonicalCapabilityProviders,
  ...projectRuntimeCapabilityProviders,
  ...localGlobalCapabilityProvidersAll,
  ...runtimeToolProviders,
]);

function selectProvider(type, preferredIds = []) {
  const providers = reusableProviders.filter((provider) => provider.type === type);
  for (const preferredId of preferredIds) {
    const match = providers.find((provider) => provider.id === preferredId || provider.id?.includes(preferredId));
    if (match) return match;
  }
  return providers[0] ?? null;
}

function selectExecutionOwner() {
  const available = new Set(ownerDiscoveryPacket.candidateExistingExecutionOwners);
  const preferenceGroups = [
    { terms: ["test", "smoke", "verify", "validation", "测试", "验证"], owners: ["test", "verify", "e2e-runner", "pr-test-analyzer", "worker"] },
    { terms: ["doc", "docs", "readme", "文档"], owners: ["docs", "api-documenter", "worker"] },
    { terms: ["frontend", "ui", "react", "前端"], owners: ["frontend", "worker"] },
    { terms: ["backend", "api", "server", "后端"], owners: ["backend", "worker"] },
    { terms: ["review", "审查"], owners: ["review", "code-reviewer", "worker"] },
  ];
  for (const group of preferenceGroups) {
    if (!group.terms.some((term) => taskText.includes(term))) continue;
    const owner = group.owners.find((candidate) => available.has(candidate));
    if (owner) return owner;
  }
  return ["worker", "analysis", "backend", "test", "verify"].find((candidate) => available.has(candidate)) ?? null;
}

function engineeringExecutionRoute() {
  if (taskShape !== "engineering_execution") return null;
  const selectedOwner = selectExecutionOwner();
  const selectedAgentProvider = [
    ...projectRuntimeAgentCandidates,
    ...localGlobalAgents,
  ].find((agent) => agent.id === selectedOwner) ?? null;
  const wantsDiscovery = /find|discover|search|寻找|发现/.test(taskText);
  const wantsCreation = /create|scaffold|generate|创建|生成/.test(taskText);
  const selectedSkillDiscovery = selectProvider("skills", ["findskill", "skill-scout", "skill-stocktake"]);
  const selectedSkillCreation = selectProvider("skills", ["skill-creator", "create-agent", "agent-teams-playbook"]);
  const selectedSkill = wantsDiscovery
    ? selectedSkillDiscovery ?? selectedSkillCreation
    : wantsCreation
      ? selectedSkillCreation ?? selectedSkillDiscovery
      : selectProvider("skills", ["tdd-workflow", "verification-loop", "meta-theory"]);
  const selectedAgentCreation = selectProvider("skills", ["create-agent", "agent-teams-playbook", "skill-creator"]);
  const selectedMcpServer = selectProvider("mcpServers", ["meta-kim-runtime", "repo-mcp", "codex-config-mcp"]);
  const selectedMcpTool = selectProvider("mcpTools", ["get_meta_runtime_capabilities", "list_meta_agents", "get_meta_agent"]);
  const selectedCommand = selectProvider("commands", ["meta-theory", "save-progress"]);
  const selectedRuntimeTool = selectProvider("runtimeTools", ["apply_patch", "shell_command", "Bash"]);
  const blockedReasons = [];
  if (!selectedOwner) blockedReasons.push("execution owner missing");
  if (!selectedSkill) blockedReasons.push("skill provider missing");
  if (!selectedMcpServer && !selectedMcpTool) blockedReasons.push("MCP provider missing");
  const routeScore = blockedReasons.length ? 49 : 88;
  return {
    id: `execution-capability-discovery:${runtime}:${osTarget}`,
    owner: selectedOwner,
    weapon: "select-execution-route",
    dependency: selectedSkill?.id ?? null,
    dependencyProject: null,
    runtime,
    os: osTarget,
    verificationOwner: "meta-prism",
    verificationMethod: "npm run meta:route:validate",
    verification: {
      command: "npm run meta:route:validate",
      artifact: "route JSON",
      passCondition: "Engineering execution route has a non-governance owner plus discovered skill, MCP, command/tool, runtime, OS, and verification owner.",
    },
    score: routeScore,
    scoreBand: routeScore >= 85 ? "execute" : "blocked",
    routeScoreBreakdown: {
      intentFitWeight: 20,
      ownerFitWeight: 15,
      weaponFitWeight: 15,
      dependencyFitWeight: 15,
      runtimeSupportWeight: 10,
      osSupportWeight: 10,
      verificationStrengthWeight: 10,
      riskRollbackClarityWeight: 5,
      runtimeSupport: "native",
      osSupport: "supported",
      dependencyFit: selectedSkill ? 85 : 0,
    },
    ownerBinding: {
      selectedOwner,
      source: "existing_execution_owner_inventory",
      existingOwnerMatched: Boolean(selectedOwner),
      bindingStage: "Thinking",
      providerEvidenceRef: "ownerDiscoveryPacket.candidateReusableCapabilityProviders",
      ownerDiscoveryRef: "ownerDiscoveryPacket",
    },
    selectedCapabilityProviders: {
      agentOwner: selectedOwner,
      agent: selectedAgentProvider,
      agentCreation: selectedAgentCreation,
      skill: selectedSkill,
      skillDiscovery: selectedSkillDiscovery,
      skillCreation: selectedSkillCreation,
      mcpServer: selectedMcpServer,
      mcpTool: selectedMcpTool,
      command: selectedCommand,
      runtimeTool: selectedRuntimeTool,
    },
    blockedReasons,
  };
}

const syntheticRoutes = [engineeringExecutionRoute()].filter(Boolean);
const rankedRoutes = [...candidateWeapons.map(routeForWeapon), ...syntheticRoutes].sort((a, b) => b.score - a.score);
const recommendedRoute = rankedRoutes.find((route) => route.score >= 85) ?? rankedRoutes.find((route) => route.score >= 70) ?? null;
const capabilityGapPacket = recommendedRoute ? null : {
  gap: "No route has enough owner + weapon + dependency + runtime + OS + verification support.",
  taskShape,
  currentAgentsChecked: [...new Set([...ownerDiscoveryPacket.candidateExistingExecutionOwners, ...ownerDiscoveryPacket.governanceStageOwners])].slice(0, 60),
  currentProvidersChecked: ownerDiscoveryPacket.candidateReusableCapabilityProviders.slice(0, 80),
  ownerDiscoveryRef: "ownerDiscoveryPacket",
  missing: rankedRoutes[0]?.blockedReasons?.length ? rankedRoutes[0].blockedReasons : ["owner_weapon_dependency_route"],
  returnToStage: "Thinking",
};
const capabilityGapDetected = !recommendedRoute || explicitCapabilityGapRequested();
const capabilityGapDecision = capabilityGapDetected
  ? (() => {
      const result = decideCapabilityGap(task, {
        currentProvidersChecked: ownerDiscoveryPacket.evidenceRefs,
        requestedCapability: task || capabilityGapPacket?.gap || "Capability gap route decision",
        insufficiencyReason: capabilityGapPacket?.gap ?? "Task explicitly asks for a capability-gap decision before Execution.",
        riskIfUnresolved:
          "A normal route may hide a missing capability, fake owner, missing verifier, or unauthorized provider path.",
        requiredEvidence: CAPABILITY_GAP_DECISION_CONTRACT.requiredEvidenceKeys,
      });
      return {
        detected: true,
        source: recommendedRoute ? "explicit_gap_signal" : "missing_recommended_route",
        decision: result.gapDecision.decision,
        gapDecision: result.gapDecision,
        decisionEvidence: result.decisionEvidence,
        decisionOutput: result.decisionOutput,
        candidateWriteback: result.candidateWriteback,
        generatedAgentSpec: result.generatedAgentSpec,
        workerTaskPacket: result.workerTaskPacket,
        blockedReason: result.blockedReason,
        graphPath: result.graphPath,
        acceptance: {
          requiredEvidenceCovered: result.decisionEvidence.status === "pass",
          missingEvidence: result.decisionEvidence.missingEvidence,
          forbiddenBehaviors: result.decisionEvidence.decisionRule.forbiddenBehaviors,
        },
      };
    })()
  : null;
const capabilityGapBlocksExecution = Boolean(
  capabilityGapDecision &&
    (capabilityGapDecision.decision === "blocked_or_needs_approval" ||
      capabilityGapDecision.decisionEvidence?.status !== "pass"),
);
const userChoiceNeeded = Boolean(recommendedRoute && recommendedRoute.score >= 70 && recommendedRoute.score < 85);
const decisionCard = userChoiceNeeded ? {
  recommendedDefault: recommendedRoute.id,
  reason: "Route is useful but needs confirmation or more evidence because score is 70-84.",
  choicePolicy: choicePolicy.choiceRequiredWhen,
  options: rankedRoutes.slice(0, 3).map((route) => ({
    id: route.id,
    bestFor: route.scoreBand,
    benefit: "Uses discovered owner, weapon, runtime, OS, and verification route.",
    cost: "May need more evidence if score is below 85.",
    risk: route.blockedReasons.join("; ") || "partial capability support may remain.",
    expectedResult: "Bounded execution route.",
    verification: route.verificationMethod ?? "manual review"
  }))
} : null;
const routeExecutionGate = {
  canPreviewRoute: true,
  canEnterExecution:
    Boolean(recommendedRoute?.score >= 85) &&
    !globalInventoryFreshness.refreshRequiredBeforeExecution &&
    !capabilityGapBlocksExecution,
  blockedBy: [
    ...(!recommendedRoute ? ["missing_recommended_route"] : []),
    ...(recommendedRoute && recommendedRoute.score < 85 ? ["route_requires_confirmation_or_more_fetch"] : []),
    ...(globalInventoryFreshness.refreshRequiredBeforeExecution ? ["global_capability_inventory_refresh_required"] : []),
    ...(capabilityGapBlocksExecution ? ["capability_gap_decision_blocks_execution"] : []),
  ],
  returnToStage: !recommendedRoute
    ? "Thinking"
    : capabilityGapBlocksExecution
      ? "Thinking"
    : recommendedRoute.score < 85 || globalInventoryFreshness.refreshRequiredBeforeExecution
      ? "Fetch"
      : null,
  refreshCommand: globalInventoryFreshness.refreshRequiredBeforeExecution ? globalInventoryFreshness.refreshCommand : null,
  reason: !recommendedRoute
    ? "No executable route is available; Execution must not start until owner, provider, runtime, OS, and verification binding are resolved."
    : recommendedRoute.score < 85
      ? "Route preview is available, but Execution needs confirmation or stronger provider evidence before starting."
      : capabilityGapBlocksExecution
        ? "Capability-gap decision requires approval, stronger evidence, or return to Thinking before Execution."
      : globalInventoryFreshness.refreshRequiredBeforeExecution
        ? "Cached provider evidence is missing or older than 14 days; route preview is allowed, but Execution must refresh capability discovery first."
        : "Cached provider evidence is fresh enough and the route has execution-grade owner/provider/verification binding.",
};

const output = {
  taskShape,
  intentAmplificationPrecheck: {
    needsIntentAmplification: taskShape === "fuzzy_complex_task" || taskShape === "strategy_product_decision",
    scoreThreshold: intentContract.scoreBands?.find((band) => band.status?.includes("may_claim"))?.min ?? 90,
    reason: "Route may change based on real intent, success criteria, and userGoalDone evidence.",
  },
  ownerDiscoveryPacket,
  candidateOwners: [...new Set([...candidateWeapons.flatMap((weapon) => weapon.ownerCandidates ?? []), ...ownerDiscoveryPacket.candidateExistingExecutionOwners])],
  candidateWeapons: candidateWeapons.map((weapon) => weapon.id),
  candidateDependencies: candidateDependencies.map((dep) => dep.id),
  candidateDependencyProjects: candidateDependencies.map((dep) => dep.id),
  internalDecisionPatterns: candidateWeapons.some((weapon) => weapon.id === "meta-kim-decision-patterns")
    ? ["critical-real-intent-lock", "fetch-evidence-labeling", "thinking-subject-path-map", "thinking-minimum-test", "review-pass-kill-gate"]
    : [],
  candidateFoundationalCapabilities,
  runtimeFilterResult: { requested: runtimeArg, applied: runtime, unsupported: !RUNTIMES.includes(runtime) },
  osFilterResult: { requested: osArg, applied: osTarget, unsupported: !OS_TARGETS.includes(osTarget) },
  rankedRoutes,
  recommendedRoute,
  capabilityGapDetected,
  capabilityGapDecision,
  routeExecutionGate,
  userChoiceNeeded,
  decisionCard,
  dispatchBoardDraft: recommendedRoute ? { owner: "meta-conductor", route: recommendedRoute.id, mergeOwner: "meta-warden" } : null,
  workerTaskPacketDrafts: recommendedRoute ? [{
    ownerAgent: recommendedRoute.owner,
    roleDisplayName: recommendedRoute.owner?.replace(/^meta-/, "") ?? "unknown",
    weapon: recommendedRoute.weapon,
    dependency: recommendedRoute.dependency,
    runtime,
    os: osTarget,
    verificationOwner: recommendedRoute.verificationOwner,
    dependsOn: [],
    mergeOwner: "meta-warden",
  }] : [],
  capabilityGapPacket,
  verificationPlan: {
    command: "npm run meta:route:validate",
    owner: "meta-prism",
    doneCondition: "recommendedRoute has owner, weapon, runtime, OS, verification owner, verification method, and score >= 85; otherwise capabilityGapPacket exists.",
  },
  rejectedRoutes: rankedRoutes.slice(1).map((route) => ({ id: route.id, score: route.score, reasons: route.blockedReasons.length ? route.blockedReasons : [`lower score than ${recommendedRoute?.id}`] })),
  routeScoreBreakdown: recommendedRoute?.routeScoreBreakdown ?? null,
  blockedReasons: recommendedRoute?.blockedReasons ?? capabilityGapPacket?.missing ?? [],
  requiredUserChoiceIfAny: userChoiceNeeded ? decisionCard : null,
};

if (json) console.log(JSON.stringify(output, null, 2));
else console.log(JSON.stringify(output, null, 2));
