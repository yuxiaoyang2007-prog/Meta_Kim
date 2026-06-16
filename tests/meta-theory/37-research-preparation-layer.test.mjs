import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

function runResearchPreparation() {
  const result = spawnSync(process.execPath, ["scripts/generate-research-preparation-report.mjs"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const jsonStart = result.stdout.indexOf("{");
  assert.notEqual(jsonStart, -1, result.stdout);
  return JSON.parse(result.stdout.slice(jsonStart));
}

describe("37 — Research preparation layer", () => {
  test("P-037 generates source-backed research preparation packets before Thinking", () => {
    const packageJson = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    assert.equal(
      packageJson.scripts["meta:research:prepare"],
      "node scripts/generate-research-preparation-report.mjs",
    );

    const summary = runResearchPreparation();
    assert.equal(summary.ok, true);
    assert.equal(summary.caseCount, 4);
    assert.equal(summary.passRate, 1);
    assert.ok(summary.coverage.researchRequired >= 2);
    assert.ok(summary.coverage.localOnly >= 1);
    assert.ok(summary.coverage.blocked >= 1);
    assert.ok(summary.coverage.officialDocs >= 1);

    const reportPath = path.join(REPO_ROOT, summary.report);
    const markdownPath = path.join(REPO_ROOT, summary.markdown);
    assert.equal(existsSync(reportPath), true);
    assert.equal(existsSync(markdownPath), true);

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.schemaVersion, "research-preparation-report-v0.1");
    assert.equal(report.status, "pass");
    assert.ok(report.results.every((item) => item.validation.status === "pass"));

    for (const item of report.results) {
      const packet = item.researchPreparationPacket;
      assert.equal(packet.schemaVersion, "research-preparation-packet-v0.1");
      assert.equal(packet.owner, "meta-scout");
      assert.equal(packet.orchestrationOwner, "meta-conductor");
      assert.ok(packet.searchAngles.length >= 3);
      assert.ok(packet.sourceList.length >= 3);
      assert.ok(packet.sourceList.every((source) => source.credibility && source.freshness));
      assert.ok(packet.sourceQualityLadder.includes("primary_official_docs"));
      assert.ok(
        packet.sourceQualityLadder.includes("community_or_forum_evidence_only_with_label"),
      );
      assert.ok(packet.deepReadTargets.length >= 3);
      assert.ok(packet.keyInformationTargets.length >= 2);
      assert.ok(packet.iterationPlan.length >= 2);
      assert.ok(packet.iterationLog.length >= 1);
      assert.ok(packet.claimEvidenceCards.length >= 1);
      assert.match(packet.stopCondition, /Stop/);
      assert.match(packet.decisionUpdateRule, /decisionImpactMap/);
      assert.equal(packet.claimAttributionPolicy.materialClaimsNeedSource, true);
      assert.equal(packet.claimAttributionPolicy.singleSourceClaims, "flag_unverified");
      assert.equal(packet.claimAttributionPolicy.snippetsOnly, "candidate_discovery_only");
      assert.ok(
        packet.originalSynthesisPolicy.required.includes(
          "rename to Meta_Kim-native packet language",
        ),
      );
      assert.ok(
        packet.originalSynthesisPolicy.forbidden.includes("copying third-party prompt text"),
      );
      assert.ok(packet.decisionImpactMap.every((impact) => impact.changesThinkingRoute));
      assert.ok(
        item.validation.checks.keyInfoOk &&
          item.validation.checks.iterationOk &&
          item.validation.checks.claimCardsOk &&
          item.validation.checks.decisionUpdateOk,
      );
      assert.match(packet.plainLanguageSummary, /研究/);
    }

    const cursorCase = report.results.find((item) => item.id === "cursor-native-live-current-docs");
    assert.equal(cursorCase.researchPreparationPacket.stageGate, "must_complete_before_thinking");
    assert.ok(
      cursorCase.researchPreparationPacket.sourceList.some(
        (source) =>
          source.sourceType === "official_docs" &&
          source.url === "https://docs.cursor.com/en/cli/reference/output-format",
      ),
    );
    assert.ok(
      cursorCase.researchPreparationPacket.decisionImpactMap.some(
        (impact) => impact.impact === "cursor_native_live_blocker",
      ),
    );

    const localCase = report.results.find((item) => item.id === "local-prd-only-review");
    assert.equal(localCase.researchPreparationPacket.researchRequired, false);
    assert.equal(localCase.researchPreparationPacket.stageGate, "recorded_before_thinking");
    assert.equal(localCase.researchPreparationPacket.thinkingHandoff.readyForThinking, true);

    const blockedCase = report.results.find((item) => item.id === "blocked-paid-web-research");
    assert.equal(blockedCase.researchPreparationPacket.blocked, true);
    assert.equal(blockedCase.researchPreparationPacket.stageGate, "blocked_return_to_fetch");
    assert.equal(blockedCase.researchPreparationPacket.thinkingHandoff.readyForThinking, false);
    assert.equal(blockedCase.researchPreparationPacket.thinkingHandoff.returnToStage, "Fetch");
  });
});
