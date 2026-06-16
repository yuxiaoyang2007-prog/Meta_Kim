import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

function runResearchExecution() {
  const result = spawnSync(
    process.execPath,
    ["scripts/generate-research-execution-report.mjs", "--refresh"],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 120_000,
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const jsonStart = result.stdout.indexOf("{");
  assert.notEqual(jsonStart, -1, result.stdout);
  return JSON.parse(result.stdout.slice(jsonStart));
}

describe("44 — Research execution, freshness, and innovation sandbox", () => {
  test("P-047/P-048/P-049 fetch live sources, record freshness, and keep innovation candidate-only", () => {
    const packageJson = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    assert.equal(
      packageJson.scripts["meta:research:execute"],
      "node scripts/generate-research-execution-report.mjs --refresh",
    );

    const contract = JSON.parse(
      readFileSync(path.join(REPO_ROOT, "config/contracts/research-execution-contract.json"), "utf8"),
    );
    assert.equal(contract.schemaVersion, "research-execution-contract-v0.1");
    assert.ok(contract.requiredSourceCategories.includes("official_docs"));
    assert.ok(contract.requiredSourceCategories.includes("news_version"));
    assert.ok(contract.requiredSourceCategories.includes("third_party_tool"));
    assert.ok(contract.requiredResearchExecutionFields.includes("queryIterationCount"));
    assert.ok(contract.requiredResearchExecutionFields.includes("falsificationAttempt"));
    assert.ok(contract.iterationQualityGate.confidenceEnum.includes("high"));
    assert.equal(contract.innovationCandidatePacket.canonicalWritesMustEqual, 0);

    const summary = runResearchExecution();
    assert.equal(summary.ok, true);
    assert.equal(summary.caseCount, 6);
    assert.ok(summary.liveFetchCount >= 4);
    assert.ok(summary.blockedCount >= 2);
    assert.ok(summary.staleRefreshCount >= 1);
    assert.equal(summary.innovationCandidateCount, 2);
    assert.equal(summary.canonicalWrites, 0);

    const reportPath = path.join(REPO_ROOT, summary.report);
    const markdownPath = path.join(REPO_ROOT, summary.markdown);
    assert.equal(existsSync(reportPath), true);
    assert.equal(existsSync(markdownPath), true);

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.schemaVersion, "research-execution-report-v0.1");
    assert.equal(report.status, "pass");
    assert.equal(report.summary.allRequiredTypesCovered, true);
    assert.ok(report.summary.sourceTypes.includes("official_docs"));
    assert.ok(report.summary.sourceTypes.includes("news_version"));
    assert.ok(report.summary.sourceTypes.includes("third_party_tool"));
    assert.ok(report.summary.sourceTypes.includes("credential_blocked"));
    assert.ok(report.summary.sourceTypes.includes("network_blocked"));

    const livePackets = report.results
      .map((item) => item.researchExecutionPacket)
      .filter((packet) => ["fetched_live", "stale_refreshed"].includes(packet.executionStatus));
    assert.ok(livePackets.length >= 4);
    for (const packet of livePackets) {
      assert.equal(packet.preparationStatus, "prepared");
      assert.equal(packet.httpStatus, 200);
      assert.ok(packet.byteLength > 500);
      assert.match(packet.contentHash, /^[a-f0-9]{64}$/);
      assert.equal(packet.freshnessPolicy.state, "fresh");
      assert.ok(packet.queryIterationCount >= 1);
      assert.equal(packet.evidenceGapClosed, true);
      assert.notEqual(packet.confidenceBefore, packet.confidenceAfter);
      assert.equal(packet.falsificationAttempt.status, "tested_survived");
      assert.equal(packet.thinkingHandoff.readyForThinking, true);
      assert.ok(packet.decisionImpactMap.every((impact) => impact.changesThinkingRoute));
    }

    const blockedPackets = report.results
      .map((item) => item.researchExecutionPacket)
      .filter((packet) => packet.executionStatus === "blocked");
    assert.equal(blockedPackets.length, 2);
    assert.ok(blockedPackets.every((packet) => packet.thinkingHandoff.returnToStage === "Fetch"));
    assert.ok(blockedPackets.every((packet) => packet.evidenceGapClosed === false));
    assert.ok(blockedPackets.every((packet) => packet.falsificationAttempt.status === "blocked"));

    assert.ok(
      report.freshnessExamples.some((item) => item.state === "stale_refresh_required"),
      "freshness examples must show stale evidence returning to Fetch",
    );

    for (const item of report.innovationCandidates) {
      assert.equal(item.validation.status, "pass");
      assert.equal(item.candidate.schemaVersion, "innovation-candidate-packet-v0.1");
      assert.equal(item.candidate.canonicalWrites, 0);
      assert.equal(item.candidate.wardenApprovalRequirement, "required_before_any_canonical_write");
      assert.ok(item.candidate.alternativePaths.length >= 2);
      assert.ok(item.candidate.existingCapabilitiesChecked.length >= 6);
    }

    const markdown = readFileSync(markdownPath, "utf8");
    assert.match(markdown, /prepared research, live fetched evidence, stale evidence refresh/);
    assert.match(markdown, /iteration\/confidence updates/);
    assert.match(markdown, /canonical/i);
  });
});
