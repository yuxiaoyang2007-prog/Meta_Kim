import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

function runNodeScript(scriptPath) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const jsonStart = result.stdout.indexOf("{");
  assert.notEqual(jsonStart, -1, result.stdout);
  return JSON.parse(result.stdout.slice(jsonStart));
}

describe("36 — Runtime shard matrix and complex inputs", () => {
  test("P-033 generates runtime live shard matrix for all runtimes", () => {
    const packageJson = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    assert.equal(
      packageJson.scripts["meta:runtime:shard-matrix"],
      "node scripts/generate-runtime-live-shard-matrix.mjs",
    );
    const summary = runNodeScript("scripts/generate-runtime-live-shard-matrix.mjs");
    assert.equal(summary.ok, true);
    assert.equal(summary.runtimeCount, 4);
    assert.deepEqual(summary.blockedRuntimes, ["cursor"]);

    const reportPath = path.join(REPO_ROOT, summary.report);
    const markdownPath = path.join(REPO_ROOT, summary.markdown);
    assert.equal(existsSync(reportPath), true);
    assert.equal(existsSync(markdownPath), true);

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.schemaVersion, "runtime-live-shard-matrix-v0.1");
    assert.equal(report.summary.releaseGrade, false);
    assert.deepEqual(
      report.records.map((row) => row.runtime),
      ["claude", "codex", "openclaw", "cursor"],
    );
    assert.ok(report.records.find((row) => row.runtime === "openclaw").command.includes("--agent=meta-warden"));
    assert.ok(report.records.find((row) => row.runtime === "cursor").fixtureCommand.includes("META_KIM_CURSOR_LIVE_SUCCESS_FIXTURE"));
    assert.match(report.records.find((row) => row.runtime === "cursor").remainingAction, /Cursor Agent CLI/);
  });

  test("P-035 replays ten complex capability-gap inputs", () => {
    const packageJson = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    assert.equal(
      packageJson.scripts["meta:gap:complex-inputs"],
      "node scripts/run-complex-capability-gap-inputs.mjs",
    );
    const summary = runNodeScript("scripts/run-complex-capability-gap-inputs.mjs");
    assert.equal(summary.ok, true);
    assert.equal(summary.caseCount, 10);
    assert.equal(summary.passRate, 1);

    const reportPath = path.join(REPO_ROOT, summary.report);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.schemaVersion, "complex-capability-gap-input-replay-v0.1");
    assert.equal(report.status, "pass");
    assert.equal(report.summary.caseCount, 10);
    for (const trait of [
      "research-first",
      "multi-capability",
      "approval-blocked",
      "worker-task-only",
      "create-agent",
      "create-script",
      "mcp-provider",
      "same-type-repeat",
      "multi-runtime",
      "reviewer-feedback",
    ]) {
      assert.ok(report.summary.traitCoverage[trait] > 0, `missing trait ${trait}`);
    }
    assert.ok(
      report.results.every(
        (item) =>
          item.validation.status === "pass" &&
          item.validation.inventoryCovered === true &&
          item.validation.noFakeParallelism === true,
      ),
    );
    assert.ok(
      report.results.some((item) => item.validation.decisions.blocked_or_needs_approval > 0),
    );
  });

  test("P-030 replays external product reviewer samples", () => {
    const packageJson = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    assert.equal(
      packageJson.scripts["meta:reviewer:replay"],
      "node scripts/run-product-reviewer-replay.mjs",
    );
    const summary = runNodeScript("scripts/run-product-reviewer-replay.mjs");
    assert.equal(summary.ok, true);
    assert.equal(summary.sampleCount, 3);
    assert.ok(summary.recommendationCount >= 6);

    const reportPath = path.join(REPO_ROOT, summary.report);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.schemaVersion, "product-reviewer-replay-v0.1");
    assert.equal(report.status, "pass");
    assert.deepEqual(report.summary.requiredDimensions, [
      "design",
      "execution",
      "acceptance",
      "feedback",
      "deliverables",
    ]);
    assert.ok(report.results.every((item) => item.averageScore >= 3));
    assert.ok(
      report.results.some((item) =>
        item.misunderstandingReview.some((review) => /fixture pass/.test(review.recommendation)),
      ),
    );
    assert.ok(
      report.results.some((item) =>
        item.misunderstandingReview.some((review) => /Warden approval/.test(review.recommendation)),
      ),
    );
  });
});
