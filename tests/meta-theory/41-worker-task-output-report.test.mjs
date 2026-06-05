import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

function runWorkerOutputReport() {
  const result = spawnSync(process.execPath, ["scripts/generate-worker-task-output-report.mjs"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const jsonStart = result.stdout.indexOf("{");
  assert.notEqual(jsonStart, -1, result.stdout);
  return JSON.parse(result.stdout.slice(jsonStart));
}

describe("41 — WorkerTask output contract and retry report", () => {
  test("P-040/P-052/P-053 validate worker outputs, retry, returnToStage, and blocked actions", () => {
    const packageJson = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    assert.equal(
      packageJson.scripts["meta:worker:outputs"],
      "node scripts/generate-worker-task-output-report.mjs",
    );

    const contract = JSON.parse(
      readFileSync(path.join(REPO_ROOT, "config/contracts/worker-task-output-contract.json"), "utf8"),
    );
    assert.equal(contract.schemaVersion, "worker-task-output-contract-v0.1");
    assert.deepEqual(Object.keys(contract.workerTypes).sort(), [
      "deliverable",
      "implementation",
      "research",
      "review",
      "verification",
      "writeback",
    ]);
    assert.equal(contract.retryPolicy.missingEvidenceAction, "retry");
    assert.equal(contract.retryPolicy.schemaMismatchAction, "return_to_stage");
    assert.equal(contract.retryPolicy.ownerBoundaryAction, "blocked");

    const summary = runWorkerOutputReport();
    assert.equal(summary.ok, true);
    assert.equal(summary.schemaTypesCovered, 6);
    assert.ok(summary.sampleCount >= 9);
    assert.ok(summary.retryCount >= 1);
    assert.ok(summary.returnToStageCount >= 1);
    assert.ok(summary.blockedCount >= 1);

    const reportPath = path.join(REPO_ROOT, summary.report);
    const markdownPath = path.join(REPO_ROOT, summary.markdown);
    assert.equal(existsSync(reportPath), true);
    assert.equal(existsSync(markdownPath), true);

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.schemaVersion, "worker-task-output-report-v0.1");
    assert.equal(report.status, "pass");
    assert.equal(report.summary.schemaTypesCovered, 6);
    assert.equal(report.summary.passCount, report.samples.length);
    assert.ok(report.summary.acceptedCount >= 6);
    assert.ok(report.summary.retryCount >= 1);
    assert.ok(report.summary.returnToStageCount >= 1);
    assert.ok(report.summary.blockedCount >= 1);
    assert.ok(report.summary.reviewRejectedCount >= 3);
    assert.deepEqual(report.summary.actionsCovered, [
      "accept",
      "blocked",
      "retry",
      "return_to_stage",
    ]);

    const missingEvidence = report.samples.find((sample) => sample.id === "missing-evidence-retry");
    assert.equal(missingEvidence.action, "retry");
    assert.equal(missingEvidence.returnToStage, "Fetch");
    assert.equal(missingEvidence.reviewAcceptance.acceptedByReview, false);

    const ownerBoundary = report.samples.find((sample) => sample.id === "owner-boundary-blocked");
    assert.equal(ownerBoundary.action, "blocked");
    assert.equal(ownerBoundary.returnToStage, "Thinking");
    assert.equal(ownerBoundary.reviewAcceptance.ownerBoundaryStatus, "fail");

    const schemaInvalid = report.samples.find((sample) => sample.id === "schema-invalid-return");
    assert.equal(schemaInvalid.action, "return_to_stage");
    assert.equal(schemaInvalid.returnToStage, "Summary");
    assert.equal(schemaInvalid.reviewAcceptance.schemaStatus, "fail");

    const markdown = readFileSync(markdownPath, "utf8");
    assert.match(markdown, /Six worker output schemas are covered/);
    assert.match(markdown, /Missing evidence produces retry/);
    assert.match(markdown, /Owner boundary violations produce blocked/);
    assert.match(markdown, /Schema mismatch produces return_to_stage/);
    assert.match(markdown, /Review accepts only outputs/);
  });
});
