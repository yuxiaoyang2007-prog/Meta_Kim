import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const REQUIRED_TYPES = [
  "agent",
  "skill",
  "script",
  "command",
  "mcp_provider_tool",
  "runtime_tool",
  "plugin_connector",
  "retrieval_capability",
  "dependency_external_package",
  "worker_task_only",
];

function runBrowser() {
  const result = spawnSync(process.execPath, ["scripts/generate-multi-type-capability-browser.mjs"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const jsonStart = result.stdout.indexOf("{");
  assert.notEqual(jsonStart, -1, result.stdout);
  return JSON.parse(result.stdout.slice(jsonStart));
}

describe("38 — Multi-type capability browser", () => {
  test("P-038 renders capabilities as a multi-type function stack, not skill-only", () => {
    const packageJson = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    assert.equal(
      packageJson.scripts["meta:capabilities:browser"],
      "node scripts/generate-multi-type-capability-browser.mjs",
    );

    const summary = runBrowser();
    assert.equal(summary.ok, true);
    assert.equal(summary.requiredTypes, REQUIRED_TYPES.length);
    assert.equal(summary.coveredTypes, REQUIRED_TYPES.length);
    assert.equal(summary.skillOnly, false);
    assert.ok(summary.totalCandidates > REQUIRED_TYPES.length);

    const reportPath = path.join(REPO_ROOT, summary.report);
    const markdownPath = path.join(REPO_ROOT, summary.markdown);
    assert.equal(existsSync(reportPath), true);
    assert.equal(existsSync(markdownPath), true);

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.schemaVersion, "multi-type-capability-browser-v0.1");
    assert.equal(report.status, "pass");
    assert.equal(report.summary.skillOnly, false);
    assert.equal(report.summary.skillIsOneTypeOnly, true);
    assert.deepEqual(
      report.categories.map((item) => item.capabilityType),
      REQUIRED_TYPES,
    );

    for (const category of report.categories) {
      assert.ok(category.count > 0, `${category.capabilityType} should have candidates`);
      assert.ok(category.topCandidates.length > 0, `${category.capabilityType} needs top candidates`);
      assert.ok(
        Object.hasOwn(category, "innovationNeeded"),
        `${category.capabilityType} needs innovationNeeded`,
      );
      assert.ok(
        category.topCandidates.every((candidate) => candidate.sourceRef && !/^[A-Z]:\//.test(candidate.sourceRef)),
        `${category.capabilityType} should not leak Windows absolute paths`,
      );
    }

    const byType = Object.fromEntries(report.categories.map((item) => [item.capabilityType, item]));
    assert.ok(byType.skill.count < report.summary.totalCandidates);
    assert.ok(byType.mcp_provider_tool.unavailableReasons.some((reason) => /permission/.test(reason)));
    assert.ok(byType.plugin_connector.unavailableReasons.some((reason) => /trust_review/.test(reason)));
    assert.ok(byType.retrieval_capability.unavailableReasons.some((reason) => /source_backed_fetch/.test(reason)));
    assert.ok(byType.worker_task_only.unavailableReasons.some((reason) => /run_scoped/.test(reason)));

    const markdown = readFileSync(markdownPath, "utf8");
    assert.match(markdown, /Skill is one capability type/);
    assert.match(markdown, /mcp_provider_tool/);
    assert.match(markdown, /worker_task_only/);
  });
});
