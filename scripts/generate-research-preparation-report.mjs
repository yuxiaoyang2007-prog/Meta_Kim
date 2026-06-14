#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(scriptDir, "..");
const SCENARIO_PATH = path.join(
  REPO_ROOT,
  "tests",
  "meta-theory",
  "scenarios",
  "research-preparation-cases.json",
);
const CURSOR_CONTRACT_PATH = path.join(
  REPO_ROOT,
  "config",
  "contracts",
  "cursor-live-turn-harness-contract.json",
);
const OUTPUT_DIR = path.join(REPO_ROOT, ".meta-kim", "state", "default", "research-preparation");

const RETRIEVAL_CAPABILITIES = [
  {
    name: "web_search",
    status: "requires_runtime_proof",
    role: "current public facts and ecosystem discovery",
  },
  {
    name: "url_fetch",
    status: "requires_runtime_proof",
    role: "direct source retrieval when a URL is known",
  },
  {
    name: "docs_lookup",
    status: "requires_runtime_proof",
    role: "official documentation verification",
  },
  {
    name: "browser_open",
    status: "requires_runtime_proof",
    role: "rendered page or UI inspection",
  },
  {
    name: "mcp_search",
    status: "requires_runtime_proof",
    role: "MCP provider and tool inventory",
  },
  {
    name: "plugin_search",
    status: "requires_runtime_proof",
    role: "runtime plugin or connector discovery",
  },
  {
    name: "local_only",
    status: "available",
    role: "repo, canonical, contracts, package scripts, and tests",
  },
  {
    name: "user_supplied_sources",
    status: "available_if_provided",
    role: "pasted text, attachments, or explicit source files",
  },
];

const SOURCE_QUALITY_LADDER = [
  "primary_official_docs",
  "source_code_or_release_notes",
  "standards_or_regulatory_sources",
  "peer_reviewed_or_benchmark_sources",
  "reputable_news_or_analysis",
  "community_or_forum_evidence_only_with_label",
];

const ORIGINAL_SYNTHESIS_POLICY = {
  required: [
    "extract abstract invariant",
    "rename to Meta_Kim-native packet language",
    "bind to Critical -> Fetch -> Thinking handoff",
    "state what evidence changes the decision",
  ],
  forbidden: [
    "copying third-party prompt text",
    "copying third-party report template structure",
    "copying provider-specific command examples into canonical governance",
    "using cosmetic rewrites to disguise copied wording",
  ],
};

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath).replaceAll("\\", "/");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildSearchAngles(testCase) {
  const required = testCase.requiredSearchAngles ?? [];
  const fallback = testCase.researchRequired
    ? [
        "official documentation and version surface",
        "runtime capability and permission boundary",
        "decision impact on owner and verification route",
      ]
    : [
        "local source of truth",
        "contract coverage",
        "status and verification evidence",
      ];
  return unique([...required, ...fallback]).slice(0, Math.max(3, required.length)).map(
    (angle, index) => ({
      angle,
      keywords: angle
        .split(/\s+/)
        .map((word) => word.replace(/[^a-zA-Z0-9_-]/g, ""))
        .filter(Boolean)
        .slice(0, 5),
      expectedCoverage:
        index === 0
          ? "route-changing evidence"
          : "risk, owner, verification, or blocked-boundary evidence",
    }),
  );
}

function cursorOfficialSources(cursorContract) {
  return (cursorContract.officialEvidence ?? []).map((item) => ({
    sourceId: item.source.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    sourceType: "official_docs",
    sourceName: item.source,
    url: item.url,
    credibility: "official",
    freshness: cursorContract.officialEvidenceRefreshedAt,
    claimUse: "Cursor native live pass and blocked boundary conditions",
    routeImpact: "runtime_release_boundary",
  }));
}

function localSources() {
  return [
    {
      sourceId: "meta-theory-skill",
      sourceType: "canonical_source",
      sourceName: "canonical/skills/meta-theory/SKILL.md",
      url: null,
      credibility: "canonical",
      freshness: "repo_current",
      claimUse: "governed trigger, Warden entry, Conductor orchestration, Fetch before Thinking",
      routeImpact: "default_meta_theory_route",
    },
    {
      sourceId: "workflow-contract",
      sourceType: "contract",
      sourceName: "config/contracts/workflow-contract.json",
      url: null,
      credibility: "canonical_contract",
      freshness: "repo_current",
      claimUse: "content evidence and research capability discovery requirements",
      routeImpact: "research_packet_shape",
    },
    {
      sourceId: "capability-gap-prd",
      sourceType: "prd",
      sourceName: "docs/ai-native-capability-gap-mvp-prd.zh-CN.md",
      url: null,
      credibility: "single_product_source",
      freshness: "repo_current",
      claimUse: "product status, remaining backlog, AI-readable product standards",
      routeImpact: "prd_status_guard",
    },
  ];
}

function syntheticExternalSources(testCase) {
  const sources = [];
  if (testCase.requiredSourceCategories?.includes("external_ecosystem")) {
    sources.push({
      sourceId: `${testCase.id}-external-ecosystem`,
      sourceType: "external_ecosystem",
      sourceName: "external ecosystem search plan",
      url: null,
      credibility: "requires_source_backed_fetch",
      freshness: "must_refresh_during_fetch",
      claimUse: "candidate provider discovery before Thinking",
      routeImpact: "provider_reuse_or_creation",
    });
  }
  if (testCase.requiredSourceCategories?.includes("mcp_inventory")) {
    sources.push({
      sourceId: `${testCase.id}-mcp-inventory`,
      sourceType: "mcp_inventory",
      sourceName: "MCP provider and tool inventory",
      url: null,
      credibility: "runtime_inventory",
      freshness: "repo_current_or_runtime_current",
      claimUse: "prove whether an MCP provider already exists",
      routeImpact: "create_mcp_provider_or_reuse",
    });
  }
  if (testCase.requiredSourceCategories?.includes("pricing")) {
    sources.push({
      sourceId: `${testCase.id}-pricing-boundary`,
      sourceType: "pricing",
      sourceName: "pricing and billing evidence plan",
      url: null,
      credibility: "requires_current_official_source",
      freshness: "must_refresh_during_fetch",
      claimUse: "prevent paid activation without approval",
      routeImpact: "blocked_or_needs_approval",
    });
  }
  return sources;
}

function buildSourceList(testCase, cursorContract) {
  const sources = [...localSources(), ...syntheticExternalSources(testCase)];
  if (testCase.requiredSourceCategories?.includes("official_docs")) {
    sources.unshift(...cursorOfficialSources(cursorContract));
  }
  return sources;
}

function buildDecisionImpactMap(testCase, sourceList) {
  const explicit = testCase.expectedDecisionImpacts ?? [];
  const sourceImpacts = sourceList.map((source) => source.routeImpact);
  return unique([...explicit, ...sourceImpacts]).map((impact) => ({
    impact,
    changesThinkingRoute: true,
    thinkingHandoff:
      impact === "blocked_or_needs_approval" || impact === "no_external_write"
        ? "return_to_fetch_or_approval_before_thinking"
        : "bind_owner_scope_verification_before_execution",
  }));
}

function buildDeepReadTargets(sourceList) {
  return sourceList
    .filter((source) =>
      [
        "official_docs",
        "canonical_source",
        "contract",
        "prd",
        "external_ecosystem",
        "mcp_inventory",
        "pricing",
      ].includes(source.sourceType),
    )
    .slice(0, 5)
    .map((source) => ({
      sourceId: source.sourceId,
      sourceName: source.sourceName,
      reason: source.routeImpact,
      requiredForRouteChangingClaim: true,
    }));
}

function buildPacket(testCase, cursorContract) {
  const sourceList = buildSourceList(testCase, cursorContract);
  const blocked = Boolean(testCase.blockedReason);
  const stageGate = blocked
    ? "blocked_return_to_fetch"
    : testCase.researchRequired
      ? "must_complete_before_thinking"
      : "recorded_before_thinking";
  const decisionImpactMap = buildDecisionImpactMap(testCase, sourceList);
  return {
    schemaVersion: "research-preparation-packet-v0.1",
    id: testCase.id,
    owner: "meta-scout",
    reviewOwner: "meta-prism",
    orchestrationOwner: "meta-conductor",
    task: testCase.task,
    researchRequired: testCase.researchRequired,
    stageGate,
    blocked,
    blockedReason: testCase.blockedReason ?? null,
    decisionUse: testCase.researchRequired
      ? "Choose owner, route, risk boundary, acceptance, and verification before Thinking."
      : "Record why local evidence is enough before Thinking.",
    searchAngles: buildSearchAngles(testCase),
    retrievalCapabilityReadiness: RETRIEVAL_CAPABILITIES,
    sourceRequirements: testCase.requiredSourceCategories ?? [],
    sourceList,
    sourceQualityLadder: SOURCE_QUALITY_LADDER,
    deepReadTargets: buildDeepReadTargets(sourceList),
    claimAttributionPolicy: {
      materialClaimsNeedSource: true,
      singleSourceClaims: "flag_unverified",
      snippetsOnly: "candidate_discovery_only",
      unsupportedClaims: "insufficient_data_found",
    },
    crossCheckStrategy: [
      "compare route-changing claims across independent sources",
      "separate fact, inference, and assumption",
      "record contradictions before Thinking",
    ],
    originalSynthesisPolicy: ORIGINAL_SYNTHESIS_POLICY,
    freshnessPolicy: testCase.researchRequired
      ? "current facts and official/provider claims must be refreshed during Fetch"
      : "repo-current local evidence is enough",
    decisionImpactMap,
    thinkingHandoff: {
      readyForThinking: !blocked,
      returnToStage: blocked ? "Fetch" : null,
      handoffSummary: blocked
        ? "Research found an approval or paid/credential boundary; Thinking must not create or activate a provider yet."
        : "Research preparation is sufficient for Thinking to choose owner, capability type, dependency policy, and verification route.",
      mustNotDo: [
        "Do not enter Thinking with current-fact claims but no source list.",
        "Do not treat search volume as evidence if it changes no decision.",
        "Do not buy, publish, activate, or credential external providers without approval.",
      ],
    },
    plainLanguageSummary: blocked
      ? "研究准备发现权限或付费边界，必须回到 Fetch 或审批，不能继续编排执行。"
      : "研究准备已经说明要查什么、凭什么可信、会影响哪条路线；研究完才编排。",
  };
}

function validatePacket(packet, testCase) {
  const sourceTypes = new Set(packet.sourceList.map((source) => source.sourceType));
  const sourceCoverage = (testCase.requiredSourceCategories ?? []).every((category) => {
    if (category === "current_runtime_inventory") {
      return packet.sourceList.some((source) =>
        ["canonical_source", "contract", "prd"].includes(source.sourceType),
      );
    }
    if (category === "local_runtime_inventory") {
      return packet.sourceList.some((source) =>
        ["canonical_source", "contract", "prd"].includes(source.sourceType),
      );
    }
    if (category === "canonical_sources") {
      return packet.sourceList.some((source) =>
        ["canonical_source", "prd"].includes(source.sourceType),
      );
    }
    if (category === "contracts") {
      return packet.sourceList.some((source) => source.sourceType === "contract");
    }
    if (category === "permission_boundary") {
      return packet.decisionImpactMap.some((item) => item.impact.includes("approval"));
    }
    if (category === "provider_registry") {
      return packet.sourceList.some((source) =>
        ["contract", "external_ecosystem", "mcp_inventory", "official_docs"].includes(
          source.sourceType,
        ),
      );
    }
    return sourceTypes.has(category);
  });
  const hasFreshness = packet.sourceList.every((source) => source.freshness);
  const hasCredibility = packet.sourceList.every((source) => source.credibility);
  const hasDecisionImpact = (testCase.expectedDecisionImpacts ?? []).every((impact) =>
    packet.decisionImpactMap.some((item) => item.impact === impact),
  );
  const searchAnglesOk = packet.searchAngles.length >= 3;
  const sourceQualityOk =
    packet.sourceQualityLadder.includes("primary_official_docs") &&
    packet.sourceQualityLadder.includes("community_or_forum_evidence_only_with_label");
  const deepReadOk = packet.deepReadTargets.length >= 3;
  const attributionOk =
    packet.claimAttributionPolicy.materialClaimsNeedSource === true &&
    packet.claimAttributionPolicy.singleSourceClaims === "flag_unverified" &&
    packet.claimAttributionPolicy.snippetsOnly === "candidate_discovery_only";
  const originalSynthesisOk =
    packet.originalSynthesisPolicy.required.includes("rename to Meta_Kim-native packet language") &&
    packet.originalSynthesisPolicy.forbidden.includes("copying third-party prompt text") &&
    packet.originalSynthesisPolicy.forbidden.includes("using cosmetic rewrites to disguise copied wording");
  const blockedOk = testCase.blockedReason
    ? packet.blocked === true &&
      packet.stageGate === "blocked_return_to_fetch" &&
      packet.thinkingHandoff.readyForThinking === false
    : packet.blocked === false && packet.stageGate === testCase.expectedStageGate;

  return {
    status:
      packet.researchRequired === testCase.researchRequired &&
      searchAnglesOk &&
      sourceCoverage &&
      hasFreshness &&
      hasCredibility &&
      hasDecisionImpact &&
      sourceQualityOk &&
      deepReadOk &&
      attributionOk &&
      originalSynthesisOk &&
      blockedOk
        ? "pass"
        : "fail",
    checks: {
      researchRequiredMatches: packet.researchRequired === testCase.researchRequired,
      searchAnglesOk,
      sourceCoverage,
      hasFreshness,
      hasCredibility,
      hasDecisionImpact,
      sourceQualityOk,
      deepReadOk,
      attributionOk,
      originalSynthesisOk,
      blockedOk,
    },
  };
}

function buildMarkdown(report) {
  const lines = [
    "# Research Preparation Report",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- status: ${report.status}`,
    `- caseCount: ${report.summary.caseCount}`,
    `- passRate: ${report.summary.passRate}`,
    "",
    "## Why This Exists",
    "",
    "P-037 makes Fetch prove the research preparation before Thinking designs the orchestration. The point is not to collect many links; the point is to show which evidence changes owner, route, risk, dependency policy, or verification.",
    "",
    "| Case | Status | Gate | Research Required | Blocked | Decision Impacts |",
    "|---|---|---|---|---|---|",
    ...report.results.map((item) =>
      [
        item.id,
        item.validation.status,
        item.researchPreparationPacket.stageGate,
        String(item.researchPreparationPacket.researchRequired),
        String(item.researchPreparationPacket.blocked),
        item.researchPreparationPacket.decisionImpactMap.map((impact) => impact.impact).join(", "),
      ].join(" | "),
    ).map((row) => `| ${row} |`),
    "",
    "## Audit Notes",
    "",
    "- Every packet records searchAngles, sourceList, freshness, credibility, blockedReason, decisionImpactMap, and thinkingHandoff.",
    "- Every packet records a source-quality ladder, key-source deep-read targets, claim attribution policy, cross-check strategy, and original-synthesis boundary.",
    "- Blocked research returns to Fetch or approval instead of pretending Thinking can safely proceed.",
    "- Local-only work still records why external research is not needed.",
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const scenario = JSON.parse(await fs.readFile(SCENARIO_PATH, "utf8"));
  const cursorContract = JSON.parse(await fs.readFile(CURSOR_CONTRACT_PATH, "utf8"));
  const results = scenario.cases.map((testCase) => {
    const researchPreparationPacket = buildPacket(testCase, cursorContract);
    return {
      id: testCase.id,
      task: testCase.task,
      validation: validatePacket(researchPreparationPacket, testCase),
      researchPreparationPacket,
    };
  });
  const passed = results.filter((item) => item.validation.status === "pass").length;
  const coverage = {
    researchRequired: results.filter((item) => item.researchPreparationPacket.researchRequired).length,
    localOnly: results.filter((item) => !item.researchPreparationPacket.researchRequired).length,
    blocked: results.filter((item) => item.researchPreparationPacket.blocked).length,
    officialDocs: results.filter((item) =>
      item.researchPreparationPacket.sourceList.some((source) => source.sourceType === "official_docs"),
    ).length,
  };
  const report = {
    schemaVersion: "research-preparation-report-v0.1",
    generatedAt: new Date().toISOString(),
    scenario: relativeToRepo(SCENARIO_PATH),
    status:
      passed === results.length &&
      coverage.researchRequired >= 2 &&
      coverage.localOnly >= 1 &&
      coverage.blocked >= 1 &&
      coverage.officialDocs >= 1
        ? "pass"
        : "fail",
    summary: {
      caseCount: results.length,
      passed,
      passRate: results.length === 0 ? 0 : passed / results.length,
      coverage,
    },
    results,
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, "latest.json");
  const mdPath = path.join(OUTPUT_DIR, "latest.zh-CN.md");
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(mdPath, buildMarkdown(report));

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: report.status === "pass",
        report: relativeToRepo(jsonPath),
        markdown: relativeToRepo(mdPath),
        caseCount: report.summary.caseCount,
        passRate: report.summary.passRate,
        coverage: report.summary.coverage,
      },
      null,
      2,
    )}\n`,
  );
  if (report.status !== "pass") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
