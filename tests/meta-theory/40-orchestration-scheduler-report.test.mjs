import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

function runScheduleReport() {
  const result = spawnSync(process.execPath, ["scripts/generate-orchestration-scheduler-report.mjs"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const jsonStart = result.stdout.indexOf("{");
  assert.notEqual(jsonStart, -1, result.stdout);
  return JSON.parse(result.stdout.slice(jsonStart));
}

describe("40 — Orchestration scheduler report", () => {
  test("P-050/P-051 simulate serial dependencies, safe parallelism, and critical path", () => {
    const packageJson = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    assert.equal(
      packageJson.scripts["meta:orchestration:schedule"],
      "node scripts/generate-orchestration-scheduler-report.mjs",
    );

    const summary = runScheduleReport();
    assert.equal(summary.ok, true);
    assert.equal(summary.caseCount, 5);
    assert.ok(summary.casesWithDependencies >= 3);
    assert.ok(summary.totalEdges >= 7);
    assert.equal(summary.cycleCount, 0);
    assert.equal(summary.orphanDependencyCount, 0);
    assert.equal(summary.blockedDependencyViolationCount, 0);

    const reportPath = path.join(REPO_ROOT, summary.report);
    const markdownPath = path.join(REPO_ROOT, summary.markdown);
    assert.equal(existsSync(reportPath), true);
    assert.equal(existsSync(markdownPath), true);

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.schemaVersion, "orchestration-scheduler-report-v0.1");
    assert.equal(report.status, "pass");
    assert.equal(report.summary.caseCount, 5);
    assert.ok(report.summary.casesWithDependencies >= 3);
    assert.equal(report.summary.cycleCount, 0);
    assert.equal(report.summary.orphanDependencyCount, 0);
    assert.equal(report.summary.blockedDependencyViolationCount, 0);
    assert.deepEqual(report.summary.requiredScheduleFields, [
      "criticalPath",
      "parallelUtilization",
      "serialBottleneck",
      "blockedWaitReason",
    ]);

    const dependencyCases = report.cases.filter((testCase) => testCase.edgeCount > 0);
    assert.ok(dependencyCases.length >= 3);
    assert.ok(report.cases.some((testCase) => testCase.schedule.blockedWaitReason));

    for (const testCase of report.cases) {
      assert.equal(testCase.status, "pass");
      assert.ok(testCase.nodeCount > 0);
      assert.deepEqual(testCase.orphanDependencies, []);
      assert.deepEqual(testCase.cycles, []);
      assert.deepEqual(testCase.blockedDependencyViolations, []);
      assert.ok(Array.isArray(testCase.schedule.criticalPath));
      assert.ok(testCase.schedule.criticalPath.length > 0);
      assert.equal(typeof testCase.schedule.parallelUtilization, "number");
      assert.ok(testCase.schedule.serialBottleneck);
      assert.match(testCase.mermaid, /^flowchart TD/);
      for (const node of testCase.nodes) {
        assert.ok(Array.isArray(node.dependsOn));
        assert.ok(node.parallelGroup);
        assert.equal(node.mergeOwner, "meta-conductor");
        assert.ok(node.roleInstanceId);
        assert.ok(node.shardScope);
      }
    }

    const markdown = readFileSync(markdownPath, "utf8");
    assert.match(markdown, /```mermaid/);
    assert.match(markdown, /At least five DAG cases are simulated/);
    assert.match(markdown, /Blocked nodes must stay visible/);
    assert.match(markdown, /criticalPath, parallelUtilization, serialBottleneck, and blockedWaitReason/);
  });
});
