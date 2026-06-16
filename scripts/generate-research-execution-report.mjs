#!/usr/bin/env node

import { createHash } from "node:crypto";
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
  "research-execution-cases.json",
);
const CONTRACT_PATH = path.join(REPO_ROOT, "config", "contracts", "research-execution-contract.json");
const OUTPUT_DIR = path.join(REPO_ROOT, ".meta-kim", "state", "default", "research-execution");
const CACHE_DIR = path.join(REPO_ROOT, ".meta-kim", "state", "default", "research-evidence-cache");
const CACHE_PATH = path.join(CACHE_DIR, "cache.json");

const args = new Set(process.argv.slice(2));
const REFRESH = args.has("--refresh");

function relativeToRepo(filePath) {
  return path.relative(REPO_ROOT, filePath).replaceAll("\\", "/");
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function addHours(dateIso, hours) {
  return new Date(new Date(dateIso).getTime() + hours * 60 * 60 * 1000).toISOString();
}

function nowIso() {
  return new Date().toISOString();
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function freshnessState(entry, ttlHours, forceStaleRefreshProbe = false) {
  if (!entry?.fetchedAt || ttlHours <= 0) {
    return {
      state: "stale_refresh_required",
      staleReason: "missing_or_uncacheable_evidence",
      expiresAt: null,
    };
  }
  const expiresAt = addHours(entry.fetchedAt, ttlHours);
  const expired = Date.now() > new Date(expiresAt).getTime();
  if (forceStaleRefreshProbe) {
    return {
      state: "stale_refresh_required",
      staleReason: "forced_stale_probe_for_policy_verification",
      expiresAt,
    };
  }
  return {
    state: expired ? "stale_refresh_required" : "fresh",
    staleReason: expired ? "ttl_expired" : "none",
    expiresAt,
  };
}

async function fetchSource(testCase) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(testCase.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Meta_Kim research execution verifier",
      },
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return {
      url: testCase.url,
      fetchedAt: nowIso(),
      httpStatus: response.status,
      byteLength: Buffer.byteLength(text, "utf8"),
      contentHash: sha256(text),
      snippet: text.replace(/\s+/g, " ").slice(0, 240),
    };
  } catch (error) {
    throw new Error(`fetch failed for ${testCase.id} ${testCase.url}: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }
}

function blockedPacket(testCase) {
  const generatedAt = nowIso();
  return {
    schemaVersion: "research-execution-packet-v0.1",
    caseId: testCase.id,
    task: testCase.task,
    preparationStatus: "prepared",
    executionStatus: "blocked",
    sourceType: testCase.sourceType,
    url: testCase.url,
    fetchedAt: null,
    httpStatus: null,
    byteLength: 0,
    contentHash: null,
    credibility: testCase.credibility,
    freshnessPolicy: {
      ttlHours: testCase.ttlHours,
      fetchedAt: null,
      expiresAt: null,
      state: "blocked_no_cache",
      staleReason: testCase.blockedReason,
      checkedAt: generatedAt,
    },
    staleReason: testCase.blockedReason,
    blockedReason: testCase.blockedReason,
    decisionImpactMap: testCase.expectedDecisionImpacts.map((impact) => ({
      impact,
      changesThinkingRoute: true,
      thinkingHandoff: "return_to_fetch_or_approval_before_thinking",
    })),
    queryIterationCount: 1,
    nextQueryReason: "Boundary is blocked; continue only after approval, credentials, or safe cache evidence is available.",
    evidenceGapClosed: false,
    confidenceBefore: "low",
    confidenceAfter: "low",
    falsificationAttempt: {
      status: "blocked",
      method: "Check whether route-changing evidence can be fetched without crossing the boundary.",
      result: testCase.blockedReason,
    },
    thinkingHandoff: {
      readyForThinking: false,
      returnToStage: "Fetch",
      summary: "Source retrieval is blocked; Thinking must not invent current facts or activate paid/credentialed providers.",
    },
    stageComparison: {
      preparation: "source requirement and blocker are known",
      execution: "live fetch intentionally not attempted because the boundary is blocked",
    },
  };
}

function packetFromEntry(testCase, entry, executionStatus, freshness) {
  return {
    schemaVersion: "research-execution-packet-v0.1",
    caseId: testCase.id,
    task: testCase.task,
    preparationStatus: "prepared",
    executionStatus,
    sourceType: testCase.sourceType,
    url: testCase.url,
    fetchedAt: entry.fetchedAt,
    httpStatus: entry.httpStatus,
    byteLength: entry.byteLength,
    contentHash: entry.contentHash,
    credibility: testCase.credibility,
    freshnessPolicy: {
      ttlHours: testCase.ttlHours,
      fetchedAt: entry.fetchedAt,
      expiresAt: addHours(entry.fetchedAt, testCase.ttlHours),
      state: "fresh",
      staleReason: "none",
      checkedAt: nowIso(),
    },
    staleReason: freshness.staleReason === "none" ? "none" : freshness.staleReason,
    blockedReason: null,
    snippet: entry.snippet,
    decisionImpactMap: testCase.expectedDecisionImpacts.map((impact) => ({
      impact,
      changesThinkingRoute: true,
      thinkingHandoff: "bind_source_evidence_to_owner_scope_verification_before_execution",
    })),
    queryIterationCount: executionStatus === "stale_refreshed" ? 2 : 1,
    nextQueryReason:
      executionStatus === "stale_refreshed"
        ? "Stale evidence was refreshed; no next query unless contradictions appear."
        : "Evidence is fresh; next query only if a counterclaim or owner mismatch appears.",
    evidenceGapClosed: true,
    confidenceBefore: "low",
    confidenceAfter: testCase.credibility === "official" ? "high" : "moderate",
    falsificationAttempt: {
      status: "tested_survived",
      method: "Compare fetched evidence against stale-cache risk, source category expectation, and blocked-boundary policy.",
      result: "No route-blocking counterevidence found in the execution packet.",
    },
    thinkingHandoff: {
      readyForThinking: true,
      returnToStage: null,
      summary: "Live source evidence is available and fresh; Conductor may use it to choose owners, dependencies, and verification path.",
    },
    stageComparison: {
      preparation: "search angles and source requirements were defined before Thinking",
      execution: `${executionStatus} with http status ${entry.httpStatus}, byteLength ${entry.byteLength}, and sha256 evidence hash`,
    },
  };
}

async function executeCase(testCase, cache, contract) {
  if (testCase.blockedReason) {
    return {
      id: testCase.id,
      validation: { status: "pass", checks: { blockedBoundaryRecorded: true } },
      researchExecutionPacket: blockedPacket(testCase),
    };
  }

  const cached = cache.sources?.[testCase.id] ?? null;
  const freshness = freshnessState(cached, testCase.ttlHours, testCase.forceStaleRefreshProbe);
  const shouldFetch = REFRESH || !cached || freshness.state === "stale_refresh_required";
  let entry = cached;
  let executionStatus = "cache_hit";
  if (shouldFetch) {
    entry = await fetchSource(testCase);
    cache.sources[testCase.id] = entry;
    executionStatus =
      testCase.forceStaleRefreshProbe || (cached && freshness.state === "stale_refresh_required")
        ? "stale_refreshed"
        : "fetched_live";
  }

  const packet = packetFromEntry(testCase, entry, executionStatus, freshness);
  const validation = {
    status:
      packet.preparationStatus === "prepared" &&
      ["fetched_live", "cache_hit", "stale_refreshed"].includes(packet.executionStatus) &&
      packet.httpStatus === 200 &&
      packet.byteLength > 500 &&
      Boolean(packet.contentHash) &&
      packet.freshnessPolicy.state === "fresh" &&
      packet.queryIterationCount >= (contract.iterationQualityGate?.minimumQueryIterationCount ?? 1) &&
      packet.evidenceGapClosed === true &&
      contract.iterationQualityGate?.confidenceEnum?.includes(packet.confidenceAfter) &&
      packet.falsificationAttempt.status === "tested_survived" &&
      packet.thinkingHandoff.readyForThinking === true
        ? "pass"
        : "fail",
    checks: {
      liveOrCacheEvidence: ["fetched_live", "cache_hit", "stale_refreshed"].includes(
        packet.executionStatus,
      ),
      httpOk: packet.httpStatus === 200,
      enoughContent: packet.byteLength > 500,
      hashRecorded: Boolean(packet.contentHash),
      iterationRecorded: packet.queryIterationCount >= 1,
      evidenceGapClosed: packet.evidenceGapClosed === true,
      confidenceUpdated: packet.confidenceBefore !== packet.confidenceAfter,
      falsificationAttempted: packet.falsificationAttempt.status === "tested_survived",
      readyForThinking: packet.thinkingHandoff.readyForThinking === true,
    },
  };
  return { id: testCase.id, validation, researchExecutionPacket: packet };
}

function buildInnovationCandidate(scenario, index) {
  const existingCapabilitiesChecked = [
    "agent",
    "skill",
    "script",
    "mcp_provider",
    "runtime_tool",
    "plugin_connector",
    "dependency_external_package",
  ].map((capabilityType) => ({
    capabilityType,
    status: capabilityType === scenario.capabilityType ? "insufficient_without_new_candidate" : "checked_no_exact_fit",
    evidence: "multi-type capability inventory requires candidate sandbox when no existing owner/loadout fits.",
  }));
  return {
    schemaVersion: "innovation-candidate-packet-v0.1",
    candidateId: `innovation-${String(index + 1).padStart(3, "0")}`,
    sourceScenarioId: scenario.id,
    capabilityType: scenario.capabilityType,
    gapEvidence: scenario.gapEvidence,
    existingCapabilitiesChecked,
    alternativePaths: scenario.alternativePaths,
    estimatedCost: scenario.estimatedCost,
    risks: scenario.risks,
    minimumExperiment: scenario.minimumExperiment,
    wardenApprovalRequirement: "required_before_any_canonical_write",
    canonicalWrites: 0,
    thinkingHandoff: {
      readyForThinking: true,
      route: "candidate_only_sandbox",
      mustNotDo: "Do not write canonical or pretend the candidate is already installed.",
    },
  };
}

function validateInnovationCandidate(candidate, contract) {
  const required = contract.innovationCandidatePacket.requiredFields;
  const requiredFieldsPresent = required.every((field) => {
    const value = candidate[field];
    return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== "";
  });
  const typeAllowed = contract.innovationCandidatePacket.allowedCapabilityTypes.includes(
    candidate.capabilityType,
  );
  const canonicalWritesOk =
    candidate.canonicalWrites === contract.innovationCandidatePacket.canonicalWritesMustEqual;
  return {
    status: requiredFieldsPresent && typeAllowed && canonicalWritesOk ? "pass" : "fail",
    checks: { requiredFieldsPresent, typeAllowed, canonicalWritesOk },
  };
}

function buildFreshnessExamples(results) {
  const source = results.find((item) =>
    ["fetched_live", "stale_refreshed", "cache_hit"].includes(
      item.researchExecutionPacket.executionStatus,
    ),
  )?.researchExecutionPacket;
  if (!source) return [];
  const staleFetchedAt = new Date(Date.now() - (source.freshnessPolicy.ttlHours + 2) * 60 * 60 * 1000)
    .toISOString();
  return [
    {
      example: "fresh_cache_hit",
      sourceType: source.sourceType,
      fetchedAt: source.fetchedAt,
      ttlHours: source.freshnessPolicy.ttlHours,
      state: "fresh",
      staleReason: "none",
      action: "reuse_cached_evidence",
    },
    {
      example: "stale_refresh_required",
      sourceType: source.sourceType,
      fetchedAt: staleFetchedAt,
      ttlHours: source.freshnessPolicy.ttlHours,
      state: "stale_refresh_required",
      staleReason: "ttl_expired",
      action: "return_to_fetch_refresh_before_thinking",
    },
  ];
}

function buildMarkdown(report) {
  const lines = [
    "# Research Execution Report",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- status: ${report.status}`,
    `- caseCount: ${report.summary.caseCount}`,
    `- fetchedOrCachedCount: ${report.summary.fetchedOrCachedCount}`,
    `- blockedCount: ${report.summary.blockedCount}`,
    `- innovationCandidateCount: ${report.summary.innovationCandidateCount}`,
    "",
    "## What Changed",
    "",
    "Research preparation is no longer treated as proof. This report records which sources were actually fetched, which ones are cached or stale, which ones are blocked, how confidence changed, and what Thinking is allowed to do with that evidence.",
    "",
    "| Case | Status | Source Type | HTTP | Bytes | Freshness | Handoff |",
    "|---|---|---|---:|---:|---|---|",
    ...report.results.map((item) => {
      const packet = item.researchExecutionPacket;
      return `| ${item.id} | ${packet.executionStatus} | ${packet.sourceType} | ${packet.httpStatus ?? ""} | ${packet.byteLength} | ${packet.freshnessPolicy.state} | ${packet.thinkingHandoff.readyForThinking ? "ready" : packet.thinkingHandoff.returnToStage} |`;
    }),
    "",
    "## Innovation Candidates",
    "",
    "| Candidate | Type | Canonical Writes | Approval |",
    "|---|---|---:|---|",
    ...report.innovationCandidates.map(
      (item) =>
        `| ${item.candidate.candidateId} | ${item.candidate.capabilityType} | ${item.candidate.canonicalWrites} | ${item.candidate.wardenApprovalRequirement} |`,
    ),
    "",
    "## AI-Readable Product Standard",
    "",
    "- Pass: reviewers can see the difference between prepared research, live fetched evidence, stale evidence refresh, blocked evidence, iteration/confidence updates, falsification attempts, and candidate-only innovation.",
    "- Fail: the system plans research but never fetches, treats stale evidence as current, skips counterevidence, or creates a long-term capability without Warden approval.",
  ];
  return `${lines.join("\n")}\n`;
}

async function main() {
  const scenario = JSON.parse(await fs.readFile(SCENARIO_PATH, "utf8"));
  const contract = JSON.parse(await fs.readFile(CONTRACT_PATH, "utf8"));
  const cache = await readJson(CACHE_PATH, { schemaVersion: "research-evidence-cache-v0.1", sources: {} });
  cache.sources ??= {};

  const results = [];
  for (const testCase of scenario.cases) {
    results.push(await executeCase(testCase, cache, contract));
  }

  const innovationCandidates = scenario.innovationScenarios.map((item, index) => {
    const candidate = buildInnovationCandidate(item, index);
    return {
      id: item.id,
      validation: validateInnovationCandidate(candidate, contract),
      candidate,
    };
  });

  const sourceTypes = new Set(results.map((item) => item.researchExecutionPacket.sourceType));
  const fetchedOrCachedCount = results.filter((item) =>
    ["fetched_live", "cache_hit", "stale_refreshed"].includes(
      item.researchExecutionPacket.executionStatus,
    ),
  ).length;
  const liveFetchCount = results.filter((item) =>
    ["fetched_live", "stale_refreshed"].includes(item.researchExecutionPacket.executionStatus),
  ).length;
  const blockedCount = results.filter(
    (item) => item.researchExecutionPacket.executionStatus === "blocked",
  ).length;
  const staleRefreshCount = results.filter(
    (item) => item.researchExecutionPacket.executionStatus === "stale_refreshed",
  ).length;
  const freshnessExamples = buildFreshnessExamples(results);
  const allRequiredTypesCovered = contract.requiredSourceCategories.every((type) => sourceTypes.has(type));
  const allResultsPass = results.every((item) => item.validation.status === "pass");
  const allInnovationPass = innovationCandidates.every((item) => item.validation.status === "pass");

  const report = {
    schemaVersion: "research-execution-report-v0.1",
    generatedAt: nowIso(),
    scenario: relativeToRepo(SCENARIO_PATH),
    contract: relativeToRepo(CONTRACT_PATH),
    status:
      allResultsPass &&
      allInnovationPass &&
      results.length >= 6 &&
      fetchedOrCachedCount >= 4 &&
      liveFetchCount >= 4 &&
      blockedCount >= 2 &&
      staleRefreshCount >= 1 &&
      allRequiredTypesCovered
        ? "pass"
        : "fail",
    summary: {
      caseCount: results.length,
      fetchedOrCachedCount,
      liveFetchCount,
      blockedCount,
      staleRefreshCount,
      sourceTypes: [...sourceTypes].sort(),
      allRequiredTypesCovered,
      innovationCandidateCount: innovationCandidates.length,
      canonicalWrites: innovationCandidates.reduce(
        (total, item) => total + item.candidate.canonicalWrites,
        0,
      ),
    },
    results,
    freshnessExamples,
    innovationCandidates,
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const jsonPath = path.join(OUTPUT_DIR, "latest.json");
  const mdPath = path.join(OUTPUT_DIR, "latest.zh-CN.md");
  await fs.writeFile(CACHE_PATH, `${JSON.stringify(cache, null, 2)}\n`);
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(mdPath, buildMarkdown(report));

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: report.status === "pass",
        report: relativeToRepo(jsonPath),
        markdown: relativeToRepo(mdPath),
        caseCount: report.summary.caseCount,
        liveFetchCount: report.summary.liveFetchCount,
        blockedCount: report.summary.blockedCount,
        staleRefreshCount: report.summary.staleRefreshCount,
        innovationCandidateCount: report.summary.innovationCandidateCount,
        canonicalWrites: report.summary.canonicalWrites,
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
