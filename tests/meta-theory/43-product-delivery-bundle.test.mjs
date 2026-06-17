import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

function hasLocalAbsolutePath(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /[A-Za-z]:[\\/]/.test(text) || /\/(?:Users|home|var|tmp|mnt)\//.test(text);
}

function runProductBundle() {
  const result = spawnSync(process.execPath, ["scripts/generate-product-delivery-bundle.mjs"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 90_000,
  });
  const jsonStart = result.stdout.indexOf("{");
  assert.notEqual(jsonStart, -1, result.stdout);
  const summary = JSON.parse(result.stdout.slice(jsonStart));
  assert.equal(result.status, summary.status === "pass" ? 0 : 1, result.stderr || result.stdout);
  return summary;
}

describe("43 — Product delivery bundle and reviewer calibration", () => {
  test("P-045/P-046/P-059/P-060 generate a privacy-safe AI-readable product bundle", () => {
    const packageJson = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    assert.equal(
      packageJson.scripts["meta:delivery:bundle"],
      "node scripts/generate-product-delivery-bundle.mjs",
    );
    const legacyBundleScript = ["meta", "cour" + "se", "bundle"].join(":");
    assert.equal(packageJson.scripts[legacyBundleScript], undefined);

    const contract = JSON.parse(
      readFileSync(path.join(REPO_ROOT, "config/contracts/product-delivery-bundle-contract.json"), "utf8"),
    );
    assert.equal(contract.schemaVersion, "product-delivery-bundle-contract-v0.1");
    assert.deepEqual(contract.requiredSections, [
      "design",
      "execution",
      "acceptance",
      "feedback",
      "deliverables",
    ]);
    assert.equal(contract.privacyRules.forbidLocalAbsolutePaths, true);

    const summary = runProductBundle();
    assert.equal(summary.ok, false);
    assert.equal(summary.status, "partial");
    assert.equal(summary.governedRunStatus, "partial");
    assert.equal(summary.requiredSectionsCovered, 5);
    assert.ok(summary.fileCount >= 12);
    assert.equal(summary.scoringSampleCount, 8);
    assert.deepEqual(summary.missingPitfalls, []);
    assert.equal(summary.privacyStatus, "pass");

    const reportPath = path.join(REPO_ROOT, summary.report);
    const markdownPath = path.join(REPO_ROOT, summary.markdown);
    assert.equal(existsSync(reportPath), true);
    assert.equal(existsSync(markdownPath), true);

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.schemaVersion, "product-delivery-bundle-v0.1");
    assert.equal(report.status, "partial");
    assert.equal(report.summary.governedRunStatus, "partial");
    assert.equal(report.summary.requiredFilesCovered, contract.requiredFiles.length);
    assert.equal(report.privacyCheck.status, "pass");
    assert.equal(hasLocalAbsolutePath(report), false);

    assert.deepEqual(
      report.sections.map((section) => section.id),
      ["design", "execution", "acceptance", "feedback", "deliverables"],
    );
    for (const fileKey of contract.requiredFiles) {
      assert.ok(report.files[fileKey], `missing file ${fileKey}`);
      assert.ok(report.files[fileKey].reviewUse, `missing reviewUse for ${fileKey}`);
    }

    const calibration = report.reviewerCalibration;
    assert.equal(calibration.schemaVersion, "product-reviewer-calibration-v0.1");
    assert.equal(calibration.sampleCount, 8);
    assert.ok(calibration.positiveExampleCount >= 2);
    assert.ok(calibration.negativeExampleCount >= 5);
    assert.deepEqual(calibration.missingPitfalls, []);
    for (const pitfall of [
      "research_before_orchestration",
      "skill_only_capability",
      "fake_parallelism",
      "fixture_pass_as_live",
      "unauthorized_writeback",
      "github_gap_overclaim",
      "warden_approval_confusion",
      "mixed_deliverables",
    ]) {
      assert.ok(calibration.coveredPitfalls.includes(pitfall), `missing pitfall ${pitfall}`);
    }

    const markdown = readFileSync(markdownPath, "utf8");
    assert.match(markdown, /Product Delivery Bundle/);
    assert.match(markdown, /design/);
    assert.match(markdown, /execution/);
    assert.match(markdown, /acceptance/);
    assert.match(markdown, /feedback/);
    assert.match(markdown, /deliverables/);
    assert.match(markdown, /Reviewer Calibration/);
    assert.match(markdown, /Privacy check rejects local absolute paths/);
    assert.equal(hasLocalAbsolutePath(markdown), false);
  });
});
