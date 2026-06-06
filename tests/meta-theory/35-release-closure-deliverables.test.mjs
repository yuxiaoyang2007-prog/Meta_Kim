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
    assert.equal(summary.cannotClaimGithubComplete, true);

    const reportPath = path.join(REPO_ROOT, summary.report);
    const markdownPath = path.join(REPO_ROOT, summary.markdown);
    assert.equal(existsSync(reportPath), true);
    assert.equal(existsSync(markdownPath), true);

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.schemaVersion, "github-gap-report-v0.1");
    assert.equal(report.prd.productSettingsSource, "docs/ai-native-capability-gap-mvp-prd.zh-CN.md");
    assert.equal(report.prd.singleSourceOfTruth, true);
    assert.equal(report.releaseBoundary.cannotClaimGithubComplete, true);
    assert.match(report.releaseBoundary.reason, /P-024 Cursor native live pass remains blocked/);
    assert.equal(typeof report.git.hasWorkingTreeDelta, "boolean");
    assert.ok(
      report.git.aheadOfOriginMain >= 1 || report.git.hasWorkingTreeDelta,
      "expected either unpushed commits or working tree delta in the GitHub gap report",
    );
    if (report.git.hasWorkingTreeDelta) {
      assert.ok(Array.isArray(report.git.workingTreeEntries));
      assert.ok(report.git.workingTreeEntries.length >= 1);
    }
    assert.ok(report.tasks.blockedOrNotDone.some((task) => task.id === "P-024"));
    assert.ok(report.tasks.completedParallelBacklog.some((task) => task.id === "P-028"));
  });

  test("P-034 generates read-only subwindow verification packets", () => {
    const summary = runNodeScript("scripts/generate-subwindow-verification-packets.mjs");
    assert.equal(summary.ok, true);
    assert.ok(summary.packetCount >= 5);

    const reportPath = path.join(REPO_ROOT, summary.report);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.schemaVersion, "subwindow-verification-packets-v0.1");
    assert.equal(report.mainWindowName, "主窗口");

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
