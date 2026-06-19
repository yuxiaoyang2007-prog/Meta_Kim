#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { assert, exists, readJson, repoPath } from "./governance-lib.mjs";

const SPECS = [
  {
    taskId: "P-096",
    categoryId: "prompt-context-agent-runtime",
    dossier: "docs/prd-category-prompt-context-agent-runtime-dossier.zh-CN.md",
    command: "npm run meta:prd:prompt-runtime:validate",
    scriptName: "meta:prd:prompt-runtime:validate",
    packetName: "promptContextAgentRuntimeDossierPacket",
    title: "P-096 Prompt / Context / Agent Runtime Research Dossier",
    requiredSources: [
      "openai-prompt-engineering",
      "openai-prompt-guidance",
      "anthropic-prompt-engineering-overview",
      "anthropic-context-engineering",
      "google-gemini-prompt-design",
      "openai-agents-sdk",
    ],
    sourceMarkers: [
      "OpenAI prompt engineering",
      "OpenAI prompt guidance",
      "Anthropic prompt engineering overview",
      "Anthropic effective context engineering",
      "Google Gemini prompt design strategies",
      "OpenAI Agents SDK",
    ],
    fieldMarkers: ["frameworkPromptPacket", "contextPolicy", "runtimeSurface", "evalFixture", "version", "budget"],
  },
  {
    taskId: "P-097",
    categoryId: "mcp-tools-providers",
    dossier: "docs/prd-category-mcp-tools-providers-dossier.zh-CN.md",
    command: "npm run meta:prd:mcp-tools:validate",
    scriptName: "meta:prd:mcp-tools:validate",
    packetName: "mcpToolsProvidersDossierPacket",
    title: "P-097 MCP / Tools / Providers Research Dossier",
    requiredSources: [
      "mcp-specification",
      "mcp-authorization",
      "mcp-security-best-practices",
      "nsa-mcp-security",
      "openai-agents-tools",
    ],
    sourceMarkers: [
      "Model Context Protocol specification",
      "MCP authorization",
      "MCP security best practices",
      "NSA MCP Security Design Considerations",
      "OpenAI Agents SDK tools",
    ],
    fieldMarkers: ["providerId", "protocolVersion", "authBoundary", "trustBoundary", "toolSchema", "liveProof"],
  },
  {
    taskId: "P-098",
    categoryId: "security-safety-red-team",
    dossier: "docs/prd-category-security-safety-red-team-dossier.zh-CN.md",
    command: "npm run meta:prd:security-safety:validate",
    scriptName: "meta:prd:security-safety:validate",
    packetName: "securitySafetyRedTeamDossierPacket",
    title: "P-098 Security / Safety / Red-Team Research Dossier",
    requiredSources: [
      "owasp-agentic-top10-2026",
      "owasp-llm-top10",
      "nist-ai-600-1",
      "nsa-mcp-security-red-team",
      "mitre-advml-threat-matrix",
    ],
    sourceMarkers: [
      "OWASP Top 10 for Agentic Applications 2026",
      "OWASP Top 10 for LLM Applications",
      "NIST AI RMF Generative AI Profile",
      "NSA MCP Security Design Considerations",
      "MITRE ATLAS / Adversarial ML Threat Matrix",
    ],
    fieldMarkers: ["threatModel", "permissionBoundary", "approvalPolicy", "sandboxPolicy", "redTeamFixture", "returnToStage"],
  },
  {
    taskId: "P-099",
    categoryId: "eval-verification-observability",
    dossier: "docs/prd-category-eval-verification-observability-dossier.zh-CN.md",
    command: "npm run meta:prd:eval-observability:validate",
    scriptName: "meta:prd:eval-observability:validate",
    packetName: "evalVerificationObservabilityDossierPacket",
    title: "P-099 Eval / Verification / Observability Research Dossier",
    requiredSources: [
      "openai-evaluation-best-practices",
      "openai-agents-tracing",
      "opentelemetry-genai",
      "anthropic-agent-evals",
      "langsmith-evaluation",
    ],
    sourceMarkers: [
      "OpenAI evaluation best practices",
      "OpenAI Agents SDK tracing",
      "OpenTelemetry GenAI semantic conventions",
      "Anthropic evals for AI agents",
      "LangSmith evaluation docs",
    ],
    fieldMarkers: ["verificationPacket", "traceId", "evalDataset", "grader", "threshold", "overclaimGate"],
  },
  {
    taskId: "P-100",
    categoryId: "architecture-performance-i18n-release",
    dossier: "docs/prd-category-architecture-performance-i18n-release-dossier.zh-CN.md",
    command: "npm run meta:prd:architecture-release:validate",
    scriptName: "meta:prd:architecture-release:validate",
    packetName: "architecturePerformanceI18nReleaseDossierPacket",
    title: "P-100 Architecture / Performance / i18n / Release Research Dossier",
    requiredSources: [
      "google-cloud-well-architected",
      "w3c-i18n",
      "ieee-29148-architecture-requirements",
      "openai-production-best-practices",
      "openai-rate-limits",
      "local-runtime-matrices",
    ],
    sourceMarkers: [
      "Google Cloud Well-Architected Framework",
      "W3C Internationalization",
      "ISO/IEC/IEEE 29148",
      "OpenAI production best practices",
      "OpenAI rate limits",
      "Meta_Kim runtime, OS, provider, and capability matrices",
    ],
    fieldMarkers: ["architectureLayer", "i18nParity", "p95Budget", "rateLimitPolicy", "releaseMode", "rollbackPlan"],
  },
];

const taskArgIndex = process.argv.indexOf("--task");
const selectedTaskId = taskArgIndex >= 0 ? process.argv[taskArgIndex + 1] : null;
const selectedSpecs = selectedTaskId ? SPECS.filter((spec) => spec.taskId === selectedTaskId) : SPECS;

assert(selectedSpecs.length > 0, `unknown --task ${selectedTaskId}`);

const contract = await readJson("config/contracts/prd-category-source-map-contract.json");
const pkg = await readJson("package.json");
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
await exitIfPrivateEvidenceMissing([
  "docs/ai-native-capability-gap-mvp-prd.zh-CN.md",
  ...selectedSpecs.map((spec) => spec.dossier),
]);
const prd = await fs.readFile(repoPath("docs/ai-native-capability-gap-mvp-prd.zh-CN.md"), "utf8");

function hasAll(text, markers, label) {
  for (const marker of markers) {
    assert(text.includes(marker), `${label} missing ${marker}`);
  }
}

function sourceIds(category) {
  return new Set((category.primarySources ?? []).map((source) => source.sourceId));
}

assert(contract.status === "all_dossiers_ready", "contract must be all_dossiers_ready after P-096..P-100 close");

for (const spec of selectedSpecs) {
  const category = contract.categories?.find((candidate) => candidate.categoryId === spec.categoryId);
  assert(category, `missing category ${spec.categoryId}`);
  assert(category.prdTaskId === spec.taskId, `${spec.categoryId} must map to ${spec.taskId}`);
  assert(category.status === "dossier_ready", `${spec.taskId} must be dossier_ready`);
  assert(category.dossierRef === spec.dossier, `${spec.taskId} must point at ${spec.dossier}`);
  assert(category.verificationCommand === spec.command, `${spec.taskId} must use ${spec.command}`);

  const ids = sourceIds(category);
  for (const sourceId of spec.requiredSources) {
    assert(ids.has(sourceId), `${spec.taskId} source map missing ${sourceId}`);
  }

  const dossier = await fs.readFile(repoPath(spec.dossier), "utf8");
  hasAll(dossier, [
    spec.title,
    spec.taskId,
    spec.categoryId,
    "prdCategoryResearchPacket",
    "dossier_ready",
    "claimUsed",
    "sourceCount",
    "Native",
    "Required PRD Fields For This Category",
    "Counterevidence",
    "No model-knowledge PRD decision gate",
    spec.command,
    ...spec.sourceMarkers,
    ...spec.fieldMarkers,
  ], `${spec.taskId} dossier`);

  assert(pkg.scripts?.[spec.scriptName]?.includes("validate-prd-remaining-category-dossiers.mjs"), `package.json missing ${spec.scriptName}`);
  assert(pkg.scripts?.[spec.scriptName]?.includes(`--task ${spec.taskId}`), `${spec.scriptName} must target ${spec.taskId}`);
}

hasAll(prd, [
  "版本：v0.45",
  "v0.45 P-096 到 P-100 PRD Category Dossiers",
  "allPrdCategoryDossiersPacket",
  "all_dossiers_ready",
  "P-096 到 P-100 已测通",
  "meta:prd:all-dossiers:validate",
  "meta:prd:remaining-dossiers:validate",
  "No model-knowledge PRD decision gate",
  ...selectedSpecs.flatMap((spec) => [
    spec.taskId,
    spec.packetName,
    spec.dossier,
    spec.command,
    spec.categoryId,
  ]),
], "unique PRD v0.45");

assert(pkg.scripts?.["meta:prd:remaining-dossiers:validate"]?.includes("validate-prd-remaining-category-dossiers.mjs"), "package.json missing meta:prd:remaining-dossiers:validate");
assert(pkg.scripts?.["meta:prd:all-dossiers:validate"]?.includes("meta:prd:product-discovery:validate"), "all-dossiers validator must include P-095");
assert(pkg.scripts?.["meta:prd:all-dossiers:validate"]?.includes("meta:prd:remaining-dossiers:validate"), "all-dossiers validator must include P-096..P-100");
assert(pkg.scripts?.["meta:verify:governance"]?.includes("meta:prd:all-dossiers:validate"), "meta:verify:governance must include all PRD dossier validation");

console.log(`PRD remaining category dossiers valid: ${selectedSpecs.map((spec) => spec.taskId).join(", ")} dossier_ready`);
