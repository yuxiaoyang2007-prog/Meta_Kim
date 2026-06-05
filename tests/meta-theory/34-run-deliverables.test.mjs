import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { generateRunDeliverables } from "../../scripts/generate-meta-theory-run-deliverables.mjs";
import { runMetaTheoryGovernedExecution } from "../../scripts/run-meta-theory-governed-execution.mjs";

const task = [
  "同一套 PRD review standard 需要 skill。",
  "长期 test coverage owner 需要 agent。",
  "release summary JSON 需要脚本。",
  "内部知识库需要 MCP provider 边界。",
].join("\n");

function hasLocalAbsolutePath(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /[A-Za-z]:[\\/]/.test(text) || /\/(?:Users|home|var|tmp|mnt)\//.test(text);
}

describe("34 — Meta-theory run deliverables", () => {
  test("generates separate UI, readability, rubric, and case-pack deliverables", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-deliverables-"));
    try {
      await runMetaTheoryGovernedExecution({
        task,
        runId: "test-run-deliverables",
        stateDir: tempDir,
        dbPath: path.join(tempDir, "runs.sqlite"),
      });
      const manifest = await generateRunDeliverables({
        runId: "test-run-deliverables",
        stateDir: tempDir,
        outDir: path.join(tempDir, "deliverables"),
      });

      assert.equal(manifest.schemaVersion, "meta-theory-run-deliverables-v0.1");
      assert.equal(manifest.status, "pass");
      assert.deepEqual(
        manifest.productTasks.map((item) => `${item.id}:${item.status}`),
        ["P-012:pass", "P-013:pass", "P-014:pass", "P-023:pass"]
      );
      assert.equal(hasLocalAbsolutePath(manifest), false);

      const filePaths = Object.fromEntries(
        Object.entries(manifest.files).map(([key, relativePath]) => [
          key,
          path.join(tempDir, "deliverables", path.basename(relativePath)),
        ])
      );
      for (const filePath of Object.values(filePaths)) {
        await stat(filePath);
      }

      const panel = await readFile(filePaths.panelHtml, "utf8");
      assert.match(panel, /Meta_Kim Run Panel/);
      assert.match(panel, /判定摘要/);
      assert.match(panel, /下一步交给谁/);
      assert.match(panel, /Runtime 证据/);
      assert.match(panel, /AI 可读评分标准/);
      assert.equal(hasLocalAbsolutePath(panel), false);

      const readability = await readFile(filePaths.readabilityReview, "utf8");
      assert.match(readability, /字段翻译表/);
      assert.match(readability, /机器字段/);
      assert.match(readability, /人话标签/);
      assert.equal(hasLocalAbsolutePath(readability), false);

      const rubricJson = JSON.parse(await readFile(filePaths.rubricJson, "utf8"));
      assert.equal(rubricJson.schemaVersion, "ai-readable-run-rubric-v0.1");
      assert.deepEqual(
        rubricJson.criteria.map((item) => item.id),
        ["design", "execution", "acceptance", "feedback", "deliverables"]
      );
      assert.equal(hasLocalAbsolutePath(rubricJson), false);

      const rubricMarkdown = await readFile(filePaths.rubricMarkdown, "utf8");
      assert.match(rubricMarkdown, /设计标准/);
      assert.match(rubricMarkdown, /执行标准/);
      assert.match(rubricMarkdown, /验收标准/);
      assert.match(rubricMarkdown, /反馈标准/);
      assert.match(rubricMarkdown, /交付内容标准/);

      const casePack = await readFile(filePaths.casePack, "utf8");
      assert.match(casePack, /reviewer 该看到什么/);
      assert.match(casePack, /reviewer 怎么评分/);
      assert.match(casePack, /通过 \/ 失败样例/);
      assert.equal(hasLocalAbsolutePath(casePack), false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("CLI writes a manifest for the latest run", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-deliverables-cli-"));
    try {
      await runMetaTheoryGovernedExecution({
        task,
        runId: "test-run-deliverables-cli",
        stateDir: tempDir,
        dbPath: path.join(tempDir, "runs.sqlite"),
      });
      const result = spawnSync(
        process.execPath,
        [
          "scripts/generate-meta-theory-run-deliverables.mjs",
          "latest",
          tempDir,
          path.join(tempDir, "deliverables-cli"),
        ],
        { cwd: process.cwd(), encoding: "utf8" }
      );
      assert.equal(result.status, 0, result.stderr);
      const manifest = JSON.parse(result.stdout);
      assert.equal(manifest.runId, "test-run-deliverables-cli");
      assert.equal(manifest.files.panelHtml.endsWith("run-panel.html"), true);
      assert.equal(hasLocalAbsolutePath(manifest), false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
