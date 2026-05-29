#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { OS_TARGETS, RUNTIMES, classifyTaskShape, exists, readJson, repoPath, scoreRoute, stateDir, supportScore } from "./governance-lib.mjs";

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
const capabilityInventory = await readStateJson("capability-inventory.json", { capabilities: [] });
const dependencyIndex = await readStateJson("dependency-capability-index.json", { discoveredDependencyProjects: [] });
const choicePolicy = await readJson("config/governance/choice-surface-policy.json");
const intentContract = await readJson("config/governance/intent-amplification-contract.json");

function textContains(entry, terms) {
  const text = JSON.stringify(entry).toLowerCase();
  return terms.some((term) => text.includes(term));
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
  const blockedReasons = [];
  if (!weapon.ownerCandidates?.length) blockedReasons.push("owner missing");
  if (!weapon.id) blockedReasons.push("weapon missing");
  if (runtimeValue === "unsupported") blockedReasons.push("runtime unsupported");
  if (osValue === "unsupported") blockedReasons.push("OS unsupported");
  if (weapon.ownerCandidates?.some((owner) => owner === "general-purpose")) blockedReasons.push("general-purpose fallback");
  if (weapon.ownerCandidates?.some((owner) => /runtimeInstanceAlias|nickname/i.test(owner))) blockedReasons.push("runtime alias as durable owner");
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
    owner: weapon.ownerCandidates?.[0] ?? null,
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
    blockedReasons,
  };
}

const rankedRoutes = candidateWeapons.map(routeForWeapon).sort((a, b) => b.score - a.score);
const recommendedRoute = rankedRoutes.find((route) => route.score >= 85) ?? rankedRoutes[0] ?? null;
const capabilityGapPacket = recommendedRoute && recommendedRoute.score >= 50 ? null : {
  gap: "No route has enough owner + weapon + dependency + runtime + OS + verification support.",
  taskShape,
  missing: recommendedRoute?.blockedReasons?.length ? recommendedRoute.blockedReasons : ["owner_weapon_dependency_route"],
  returnToStage: "Thinking",
};
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

const output = {
  taskShape,
  intentAmplificationPrecheck: {
    needsIntentAmplification: taskShape === "fuzzy_complex_task" || taskShape === "strategy_product_decision",
    scoreThreshold: intentContract.scoreBands?.find((band) => band.status?.includes("may_claim"))?.min ?? 90,
    reason: "Route may change based on real intent, success criteria, and userGoalDone evidence.",
  },
  candidateOwners: [...new Set(candidateWeapons.flatMap((weapon) => weapon.ownerCandidates ?? []))],
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
