#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { assert, exists, readJson, repoPath } from "./governance-lib.mjs";

const contract = await readJson("config/contracts/prd-category-source-map-contract.json");
const pkg = await readJson("package.json");

const REQUIRED_TASK_IDS = ["P-095", "P-096", "P-097", "P-098", "P-099", "P-100"];
const ALLOWED_CONTRACT_STATUSES = ["source_map_ready_dossiers_pending", "partial_dossiers_ready", "all_dossiers_ready"];
const ALLOWED_CATEGORY_STATUSES = ["source_map_ready_dossier_pending", "dossier_ready"];
const HIGH_RISK_CATEGORY_IDS = [
  "mcp-tools-providers",
  "security-safety-red-team",
  "eval-verification-observability",
  "architecture-performance-i18n-release",
];
const REQUIRED_DECISION_IMPACTS = ["metrics", "definition_of_done"];

async function readText(relativePath) {
  return fs.readFile(repoPath(relativePath), "utf8");
}

async function missingPrivateDocs(paths) {
  const missing = [];
  for (const relativePath of paths) {
    if (!(await exists(repoPath(relativePath)))) missing.push(relativePath);
  }
  return missing;
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")) && !Number.isNaN(Date.parse(value));
}

function includesImpact(values, expected) {
  return values.some((value) => String(value).includes(expected));
}

async function validateSource(source, categoryId, sourceIds) {
  for (const field of contract.globalRules.requiredSourceFields) {
    assert(source[field] !== undefined && source[field] !== "", `${categoryId}.${source.sourceId ?? "source"} missing ${field}`);
  }
  assert(!sourceIds.has(source.sourceId), `duplicate source id ${source.sourceId}`);
  sourceIds.add(source.sourceId);
  assert(contract.globalRules.sourceClassEnum.includes(source.sourceClass), `${source.sourceId} has unsupported sourceClass ${source.sourceClass}`);
  assert(isDate(source.currentAsOf), `${source.sourceId} must record currentAsOf as YYYY-MM-DD`);
  assert(Number.isInteger(source.freshnessWindowDays) && source.freshnessWindowDays > 0, `${source.sourceId} missing freshnessWindowDays`);
  assert(Array.isArray(source.claimUses) && source.claimUses.length > 0, `${source.sourceId} missing claimUses`);
  assert(Array.isArray(source.nativeInsertionPoints) && source.nativeInsertionPoints.length > 0, `${source.sourceId} missing nativeInsertionPoints`);

  if (source.sourceClass === "local_repo_evidence") {
    assert(await exists(repoPath(source.url)), `${source.sourceId} local source path missing ${source.url}`);
  } else {
    assert(/^https:\/\//.test(source.url), `${source.sourceId} must use an https source URL`);
  }
}

assert(contract.contractId === "prd-category-source-map-contract", "wrong contract id");
assert(contract.prdTaskId === "P-094", "P-094 must own the source map validator");
assert(ALLOWED_CONTRACT_STATUSES.includes(contract.status), "P-094 source map contract has unsupported status");
assert(contract.globalRules?.noModelKnowledgePrdDecisionGate?.defaultDecisionWithoutSource === "research_required", "missing no-model-knowledge research_required gate");
assert(contract.globalRules.noModelKnowledgePrdDecisionGate.returnToStage === "Fetch", "no-model-knowledge gate must return to Fetch");

for (const field of ["requiredCategoryFields", "requiredSourceFields", "sourceClassEnum", "minimums"]) {
  assert(contract.globalRules[field], `globalRules missing ${field}`);
}

const categories = contract.categories ?? [];
assert(categories.length === contract.globalRules.minimums.categoryCount, `expected ${contract.globalRules.minimums.categoryCount} PRD categories`);

const privateDocPaths = [
  "docs/ai-native-capability-gap-mvp-prd.zh-CN.md",
  "docs/prd-category-source-map-deep-research.zh-CN.md",
  ...categories.map((category) => category.dossierRef).filter(Boolean),
];
const missingDocs = await missingPrivateDocs(privateDocPaths);
if (missingDocs.length > 0) {
  console.log(JSON.stringify({
    status: "pass",
    validationStatus: "private_evidence_not_attached",
    requiredForPublicValidation: false,
    privateEvidenceMissing: missingDocs,
  }, null, 2));
  process.exit(0);
}

const taskIds = new Set(categories.map((category) => category.prdTaskId));
for (const taskId of REQUIRED_TASK_IDS) {
  assert(taskIds.has(taskId), `missing PRD category source map for ${taskId}`);
}

const sourceIds = new Set();
for (const category of categories) {
  for (const field of contract.globalRules.requiredCategoryFields) {
    assert(category[field] !== undefined && category[field] !== "", `${category.categoryId ?? category.prdTaskId} missing ${field}`);
  }
  assert(ALLOWED_CATEGORY_STATUSES.includes(category.status), `${category.categoryId} has unsupported dossier status`);
  if (category.status === "dossier_ready") {
    assert(category.dossierId, `${category.categoryId} dossier_ready requires dossierId`);
    assert(category.dossierRef, `${category.categoryId} dossier_ready requires dossierRef`);
    assert(await exists(repoPath(category.dossierRef)), `${category.categoryId} dossierRef missing ${category.dossierRef}`);
    assert(category.verificationCommand, `${category.categoryId} dossier_ready requires verificationCommand`);
  }
  assert(Array.isArray(category.primarySources), `${category.categoryId} primarySources must be an array`);
  assert(category.primarySources.length >= contract.globalRules.minimums.primarySourcesPerCategory, `${category.categoryId} has too few primary sources`);
  assert(category.primarySources.some((source) => source.sourceClass !== "counterevidence"), `${category.categoryId} needs at least one positive primary source`);
  assert(category.primarySources.some((source) => ["official_docs", "standards_body", "security_framework", "observability_standard", "architecture_framework"].includes(source.sourceClass)), `${category.categoryId} needs authoritative external source`);

  for (const source of category.primarySources) {
    await validateSource(source, category.categoryId, sourceIds);
  }

  assert(Array.isArray(category.counterevidenceRequirements), `${category.categoryId} missing counterevidenceRequirements`);
  assert(category.counterevidenceRequirements.length >= contract.globalRules.minimums.counterevidenceRequirementsPerCategory, `${category.categoryId} missing counterevidence requirement`);
  if (HIGH_RISK_CATEGORY_IDS.includes(category.categoryId)) {
    assert(/not|cannot|insufficient|missing|alone|config|smoke|old|only/i.test(category.counterevidenceRequirements.join(" ")), `${category.categoryId} high-risk category needs explicit negative evidence wording`);
  }

  assert(category.freshnessPolicy?.freshnessRequired === true, `${category.categoryId} must require freshness`);
  assert(category.freshnessPolicy?.returnToStageOnStale === "Fetch", `${category.categoryId} stale source must return to Fetch`);
  assert(Number.isInteger(category.freshnessPolicy?.staleIfOlderThanDays), `${category.categoryId} missing staleIfOlderThanDays`);

  assert(category.nativeInsertionPoints.length >= contract.globalRules.minimums.nativeInsertionPointsPerCategory, `${category.categoryId} missing native insertion points`);
  assert(category.decisionImpactTargets.length >= contract.globalRules.minimums.decisionImpactTargetsPerCategory, `${category.categoryId} missing decision impact targets`);
  for (const impact of REQUIRED_DECISION_IMPACTS) {
    assert(includesImpact(category.decisionImpactTargets, impact), `${category.categoryId} decisionImpactTargets must include ${impact}`);
  }
  assert(category.acceptanceMetrics.some((metric) => /100|_0$/.test(metric)), `${category.categoryId} acceptanceMetrics must be measurable`);
  assert(category.mustNotDecideWithout.length >= 3, `${category.categoryId} must name missing-source blockers`);
}

if (contract.status === "all_dossiers_ready") {
  assert(categories.every((category) => category.status === "dossier_ready"), "all_dossiers_ready requires every PRD category dossier_ready");
} else {
  assert(categories.some((category) => category.status === "source_map_ready_dossier_pending"), "partial PRD source map states must keep at least one pending dossier");
}

assert(pkg.scripts?.["meta:prd:source-map:validate"]?.includes("validate-prd-category-source-map.mjs"), "package.json missing meta:prd:source-map:validate");
assert(pkg.scripts?.["meta:verify:governance"]?.includes("meta:prd:source-map:validate"), "meta:verify:governance must include PRD source map validator");

const prd = await readText("docs/ai-native-capability-gap-mvp-prd.zh-CN.md");
for (const marker of [
  "v0.43 Major-Category Source Map Gate",
  "prd-category-source-map-contract",
  "all_dossiers_ready",
  "P-094 已测通",
  "P-096 到 P-100 已测通",
  "No model-knowledge PRD decision gate",
]) {
  assert(prd.includes(marker), `PRD missing P-094 marker ${marker}`);
}

const researchDoc = await readText("docs/prd-category-source-map-deep-research.zh-CN.md");
for (const marker of [
  "PRD Major-Category Source Map Deep Research",
  "P-094",
  "source_map_ready_dossiers_pending",
  "No model-knowledge PRD decision gate",
  "P-095 到 P-100",
]) {
  assert(researchDoc.includes(marker), `P-094 docs report missing ${marker}`);
}

console.log(`PRD category source map valid: ${categories.length} categories, ${sourceIds.size} sources`);
