#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { assert, exists, readJson, repoPath } from "./governance-lib.mjs";

const DOSSIER_PATH = "docs/prd-category-product-requirements-discovery-dossier.zh-CN.md";
const contract = await readJson("config/contracts/prd-category-source-map-contract.json");
const pkg = await readJson("package.json");

async function readText(relativePath) {
  return fs.readFile(repoPath(relativePath), "utf8");
}

async function exitIfPrivateEvidenceMissing(paths) {
  const missing = [];
  for (const relativePath of paths) {
    if (!(await exists(repoPath(relativePath)))) missing.push(relativePath);
  }
  if (missing.length > 0) {
    console.log(JSON.stringify({
      status: "pass",
      validationStatus: "private_evidence_not_attached",
      requiredForPublicValidation: false,
      privateEvidenceMissing: missing,
    }, null, 2));
    process.exit(0);
  }
}

function hasAll(text, markers, label) {
  for (const marker of markers) {
    assert(text.includes(marker), `${label} missing ${marker}`);
  }
}

const categories = contract.categories ?? [];
const productCategory = categories.find((category) => category.categoryId === "product-requirements-discovery");
assert(productCategory, "source map missing product-requirements-discovery category");
assert(productCategory.prdTaskId === "P-095", "product requirements discovery must map to P-095");
assert(productCategory.status === "dossier_ready", "P-095 category must be dossier_ready");
assert(productCategory.dossierRef === DOSSIER_PATH, "P-095 category must point at the local-private dossier");
assert(productCategory.verificationCommand === "npm run meta:prd:product-discovery:validate", "P-095 category has wrong verificationCommand");
assert((productCategory.primarySources ?? []).length >= 5, "P-095 must keep at least five primary sources");

await exitIfPrivateEvidenceMissing([
  DOSSIER_PATH,
  "docs/ai-native-capability-gap-mvp-prd.zh-CN.md",
]);

for (const sourceId of [
  "atlassian-prd-requirements",
  "atlassian-prd-template",
  "nng-discovery-phase",
  "ieee-29148-requirements",
  "atlassian-jpd-ideas",
]) {
  assert(productCategory.primarySources.some((source) => source.sourceId === sourceId), `P-095 source map missing ${sourceId}`);
}

for (const taskId of ["P-096", "P-097", "P-098", "P-099", "P-100"]) {
  const category = categories.find((candidate) => candidate.prdTaskId === taskId);
  if (contract.status === "all_dossiers_ready") {
    assert(category?.status === "dossier_ready", `${taskId} must be dossier_ready in all_dossiers_ready state`);
  } else {
    assert(category?.status === "source_map_ready_dossier_pending", `${taskId} must remain dossier pending before all_dossiers_ready`);
  }
}

const dossier = await readText(DOSSIER_PATH);
hasAll(dossier, [
  "P-095 Product / Requirements / Discovery Research Dossier",
  "prdCategoryResearchPacket",
  "product-requirements-discovery",
  "dossier_ready",
  "Atlassian PRD",
  "Atlassian PRD template",
  "Nielsen Norman Group discovery",
  "IEEE/ISO/IEC 29148",
  "Jira Product Discovery ideas",
  "claimUsed",
  "Native Product Rules",
  "Required PRD Fields For This Category",
  "problemStatement",
  "successCriteria",
  "requirementTraceability",
  "counterevidence",
  "definitionOfDone",
  "No model-knowledge PRD decision gate",
  "P-096 到 P-100",
], "P-095 dossier");

const prd = await readText("docs/ai-native-capability-gap-mvp-prd.zh-CN.md");
hasAll(prd, [
  "版本：v0.45",
  "P-095 Product / Requirements / Discovery Dossier",
  "productRequirementsDiscoveryDossierPacket",
  "P-095 已测通",
  "P-096 到 P-100 已测通",
  "meta:prd:product-discovery:validate",
], "PRD");

assert(pkg.scripts?.["meta:prd:product-discovery:validate"]?.includes("validate-prd-product-requirements-discovery-dossier.mjs"), "package.json missing meta:prd:product-discovery:validate");
assert(pkg.scripts?.["meta:prd:all-dossiers:validate"]?.includes("meta:prd:product-discovery:validate"), "all-dossiers validator must include P-095 validator");
assert(`${pkg.scripts?.["meta:verify:governance"] ?? ""} ${pkg.scripts?.["meta:verify:governance:core"] ?? ""}`.includes("meta:prd:all-dossiers:validate"), "meta:verify:governance must include all PRD dossier validation");

console.log(`PRD product/requirements/discovery dossier valid: P-095 dossier_ready, contract ${contract.status}`);
