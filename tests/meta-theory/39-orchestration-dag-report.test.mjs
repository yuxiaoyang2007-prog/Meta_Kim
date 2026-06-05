import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

function runDagReport() {
  const result = spawnSync(process.execPath, ["scripts/generate-orchestration-dag-report.mjs"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const jsonStart = result.stdout.indexOf("{");
  assert.notEqual(jsonStart, -1, result.stdout);
  return JSON.parse(result.stdout.slice(jsonStart));
}

describe("39 — Orchestration DAG report", () => {
  test("P-039 renders orchestrationTaskBoardPacket as auditable DAGs", () => {
    const packageJson = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    assert.equal(
      packageJson.scripts["meta:orchestration:dag"],
      "node scripts/generate-orchestration-dag-report.mjs",
    );

    const summary = runDagReport();
    assert.equal(summary.ok, true);
    assert.equal(summary.caseCount, 3);
    assert.equal(summary.fakeParallelismCount, 0);
    assert.ok(summary.blockedNodeCount >= 1);

    const reportPath = path.join(REPO_ROOT, summary.report);
    const markdownPath = path.join(REPO_ROOT, summary.markdown);
    assert.equal(existsSync(reportPath), true);
    assert.equal(existsSync(markdownPath), true);

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.schemaVersion, "orchestration-dag-report-v0.1");
    assert.equal(report.status, "pass");
    assert.equal(report.summary.fakeParallelismCount, 0);
    assert.deepEqual(report.summary.requiredFields, [
      "dependsOn",
      "parallelGroup",
      "mergeOwner",
      "roleInstanceId",
      "shardScope",
    ]);

    for (const dag of report.dags) {
      assert.equal(dag.status, "pass");
      assert.equal(dag.synthesisOwner, "meta-conductor");
      assert.ok(dag.nodeCount > 0);
      assert.match(dag.mermaid, /^flowchart TD/);
      assert.ok(dag.parallelGroups.length > 0);
      assert.deepEqual(dag.fakeParallelismFindings, []);
      assert.deepEqual(dag.orphanDependencies, []);
      for (const node of dag.nodes) {
        assert.ok(Array.isArray(node.dependsOn));
        assert.ok(node.parallelGroup);
        assert.equal(node.mergeOwner, "meta-conductor");
        assert.ok(node.roleInstanceId);
        assert.ok(node.shardScope);
      }
    }

    assert.ok(report.dags.some((dag) => dag.blockedNodes.length > 0));
    const markdown = readFileSync(markdownPath, "utf8");
    assert.match(markdown, /```mermaid/);
    assert.match(markdown, /Fake parallelism count must stay 0/);
    assert.match(markdown, /Blocked tasks remain visible/);
  });
});
