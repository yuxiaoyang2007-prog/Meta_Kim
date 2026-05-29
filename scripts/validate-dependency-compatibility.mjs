#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { OS_TARGETS, RUNTIMES, assert, exists, readJson, repoPath, stateDir } from "./governance-lib.mjs";

const registry = await readJson("config/capability-index/dependency-project-registry.json");
const skills = await readJson("config/skills.json");
const skillIds = new Set((skills.skills ?? []).map((skill) => skill.id));
const projects = registry.projects ?? [];
const projectIds = new Set(projects.map((project) => project.id));

for (const id of skillIds) {
  assert(projectIds.has(id), `config/skills.json skill ${id} missing from dependency registry`);
}

for (const project of projects) {
  const id = project.id;
  assert(project.capabilityCard, `${id} missing capabilityCard`);
  for (const field of ["canDo", "canNotDo", "inputContract", "outputContract", "triggerConditions", "verificationMethod", "risk", "routeEligibility", "notFor", "writebackKey"]) {
    assert(project.capabilityCard[field] !== undefined, `${id} missing capabilityCard.${field}`);
  }
  assert(project.interface, `${id} missing interface`);
  assert(project.interface.invokeAs, `${id} missing interface.invokeAs`);
  assert(project.interface.invocationPath !== undefined, `${id} missing interface.invocationPath`);
  for (const runtime of RUNTIMES) assert(project.runtimeSupport?.[runtime], `${id} missing runtimeSupport.${runtime}`);
  for (const osName of OS_TARGETS) assert(project.osSupport?.[osName], `${id} missing osSupport.${osName}`);
  assert(project.supportEvidence?.source, `${id} missing supportEvidence.source`);
  assert(project.supportEvidence?.confidence, `${id} missing supportEvidence.confidence`);
  const eligibility = project.capabilityCard.routeEligibility;
  const callable = ["callable", "eligible_for_route", "installed_skill_candidate", "local_inspected_protocol"].includes(eligibility);
  if (callable) {
    assert(project.interface.invocationPath, `${id} callable dependency missing invocationPath`);
    assert(project.capabilityCard.verificationMethod, `${id} callable dependency missing verificationMethod`);
  }
  if (["reference_only", "external_reference", "blocked", "unknown"].includes(eligibility)) {
    assert(project.interface.invokeAs === "reference" || project.interface.invokeAs === "notInvokable", `${id} non-callable dependency must not be invokable`);
  }
}

const registryText = await fs.readFile(repoPath("config/capability-index/dependency-project-registry.json"), "utf8");
assert(!/D:[/\\]KimProject[/\\]Kim_Decision/i.test(registryText), "dependency registry contains hardcoded Kim_Decision local path");
const decisionPatternText = await fs.readFile(repoPath("config/governance/decision-pattern-catalog.json"), "utf8");
assert(!/D:[/\\]KimProject[/\\]Kim_Decision/i.test(decisionPatternText), "decision pattern catalog contains hardcoded Kim_Decision local path");

const indexPath = path.join(stateDir, "dependency-capability-index.json");
if (await exists(indexPath)) {
  const index = JSON.parse(await fs.readFile(indexPath, "utf8"));
  const kim = (index.discoveredDependencyProjects ?? []).find((project) => project.id === "kim-decision");
  assert(kim, "dependency discovery index must include Kim_Decision state-machine record");
  assert(kim.routeEligibility !== "callable", "Kim_Decision must not be a code executor/callable dependency");
  assert(kim.canNotDo?.some((item) => /code|implementation|executor/i.test(item)), "Kim_Decision must record not_for_code_execution");
  assert(!JSON.stringify(index).match(/D:[/\\]KimProject[/\\]Kim_Decision/i), "dependency discovery index contains hardcoded personal Kim_Decision path");
  for (const route of index.rankedRoutes ?? []) {
    assert(route.routeEligibility !== "reference_only", "reference_only dependency entered rankedRoutes");
  }
}

console.log("dependency compatibility valid");
