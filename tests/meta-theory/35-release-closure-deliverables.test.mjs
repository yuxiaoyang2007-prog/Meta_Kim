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
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

describe("35 — Release closure deliverables", () => {
  test("P-028 generates a machine-readable GitHub gap report", () => {
    const summary = runNodeScript("scripts/generate-github-gap-report.mjs");
    assert.equal(summary.ok, true);
    assert.equal(typeof summary.cannotClaimGithubComplete, "boolean");
    assert.equal(summary.cannotClaimAllToolCompatibility, true);

    const reportPath = path.join(REPO_ROOT, summary.report);
    const markdownPath = path.join(REPO_ROOT, summary.markdown);
    assert.equal(existsSync(reportPath), true);
    assert.equal(existsSync(markdownPath), true);

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.schemaVersion, "github-gap-report-v0.1");
    assert.equal(report.prd.productSettingsSource, "docs/ai-native-capability-gap-mvp-prd.zh-CN.md");
    if (report.prd.evidenceStatus === "private_evidence_not_attached") {
      assert.equal(report.prd.privateEvidence.requiredForPublicValidation, false);
    } else {
      assert.equal(report.prd.singleSourceOfTruth, true);
    }
    assert.equal(summary.cannotClaimGithubComplete, report.releaseBoundary.cannotClaimGithubComplete);
    assert.equal(report.releaseBoundary.cannotClaimAllToolCompatibility, true);
    assert.equal(report.releaseBoundary.cursorIsPrimaryReleaseBlocker, false);
    assert.match(
      report.releaseBoundary.reason,
      /Cursor compatibility|all-tool compatibility|Private product PRD is not attached/,
    );
    assert.equal(typeof report.git.hasWorkingTreeDelta, "boolean");
    assert.match(
      report.git.deltaState,
      /^(clean_synced|ahead|dirty|ahead_and_dirty)$/,
      "expected Git delta state to classify current repo state",
    );
    if (report.git.deltaState === "clean_synced") {
      assert.equal(report.git.aheadOfOriginMain, 0);
      assert.equal(report.git.hasWorkingTreeDelta, false);
    }
    if (report.git.hasWorkingTreeDelta) {
      assert.ok(Array.isArray(report.git.workingTreeEntries));
      assert.ok(report.git.workingTreeEntries.length >= 1);
    }
    if (report.prd.evidenceStatus !== "private_evidence_not_attached") {
      assert.equal(report.tasks.blockedOrNotDone.some((task) => task.id === "P-024"), false);
      assert.ok(report.tasks.compatibilityFollowUp.some((task) => task.id === "P-024"));
      assert.ok(report.tasks.completedParallelBacklog.some((task) => task.id === "P-028"));
    }
  });

  test("P-034 generates read-only subwindow verification packets", () => {
    const summary = runNodeScript("scripts/generate-subwindow-verification-packets.mjs");
    assert.equal(summary.ok, true);
    assert.ok(summary.packetCount >= 5);

    const reportPath = path.join(REPO_ROOT, summary.report);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.schemaVersion, "subwindow-verification-packets-v0.1");
    assert.equal(report.mainWindowName, "主窗口");
    if (report.privateEvidence.status === "private_evidence_not_attached") {
      assert.equal(report.privateEvidence.requiredForPublicValidation, false);
    }

    for (const taskId of ["P-026", "P-027", "P-028", "P-034", "P-036"]) {
      const packet = report.packets.find((item) => item.taskId === taskId);
      assert.ok(packet, `missing ${taskId} packet`);
      assert.equal(packet.mode, "read_only_verification");
      assert.match(packet.expectedOutput, /PASS or FAIL/);
      assert.ok(packet.allowedCommands.length > 0);
      assert.ok(packet.forbiddenActions.some((action) => /Do not edit files/.test(action)));
      assert.match(packet.mergePolicy, /main window/i);
    }
  });
});
