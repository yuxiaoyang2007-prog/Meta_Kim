import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { runMetaTheoryGovernedExecution } from "../../scripts/run-meta-theory-governed-execution.mjs";

const naturalUserTask = "帮我做个小红书营销自动发布器";

describe("49 - 11-phase business workflow visibility", () => {
  test("programmatic governed run records phase reasons and report-visible current phase", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-11-phase-api-"));
    try {
      await runMetaTheoryGovernedExecution({
        task: naturalUserTask,
        runId: "api-phase-visibility",
        stateDir: tempDir,
        dbPath: path.join(tempDir, "runs.sqlite"),
      });

      const artifact = JSON.parse(
        await readFile(path.join(tempDir, "api-phase-visibility.json"), "utf8")
      );
      assert.equal(artifact.conversationNotice.status, "not_emitted");
      assert.equal(artifact.businessPhasePlanPacket.phaseCount, 11);
      for (const phase of artifact.businessPhasePlanPacket.phases) {
        assert.ok(["done", "skipped", "blocked", "pending"].includes(phase.status));
        assert.equal(typeof phase.statusReason, "string");
        assert.notEqual(phase.statusReason.trim(), "");
        assert.equal(typeof phase.nextAction, "string");
        assert.notEqual(phase.nextAction.trim(), "");
      }
      assert.equal(artifact.businessPhasePlanPacket.closure.currentPhase, "feedback");
      assert.equal(artifact.businessPhasePlanPacket.closure.currentStatus, "pending");
      assert.match(artifact.businessPhasePlanPacket.closure.currentReason, /用户验收或反馈/);
      assert.match(artifact.businessPhasePlanPacket.closure.currentNextAction, /等待用户确认/);

      const markdown = await readFile(path.join(tempDir, "api-phase-visibility.zh-CN.md"), "utf8");
      assert.match(markdown, /11 阶段业务流/u);
      assert.match(markdown, /Reason \| Next/u);
      assert.match(markdown, /已完成：/u);
      assert.match(markdown, /等待：需要用户验收或反馈/u);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("CLI emits 11-phase status notice when explicitly requested", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-11-phase-cli-"));
    try {
      const result = spawnSync(
        process.execPath,
        [
          "scripts/run-meta-theory-governed-execution.mjs",
          "--task",
          naturalUserTask,
          "--run-id",
          "cli-phase-visibility",
          "--state-dir",
          tempDir,
          "--db",
          path.join(tempDir, "runs.sqlite"),
          "--emit-conversation-notice",
        ],
        { cwd: process.cwd(), encoding: "utf8" }
      );

      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /^Meta_Kim 对话提示:/u);
      assert.match(result.stdout, /11阶段状态: done=/u);
      assert.match(result.stdout, /skipped=revision\/evolve/u);
      assert.match(result.stdout, /blocked=none/u);
      assert.match(result.stdout, /pending=feedback/u);
      assert.match(result.stdout, /当前阶段: feedback=pending/u);
      assert.match(result.stdout, /阻塞阶段: none/u);
      assert.doesNotMatch(
        result.stdout,
        /businessPhasePlanPacket|workerTaskPackets|cardPlanPacket/u
      );

      const artifact = JSON.parse(
        await readFile(path.join(tempDir, "cli-phase-visibility.json"), "utf8")
      );
      assert.equal(artifact.conversationNotice.status, "emitted");
      assert.equal(artifact.conversationNotice.evidenceKind, "adapter_emitted_notice");
      assert.match(
        artifact.conversationNotice.routeSummary.businessPhaseSummary.groupLine,
        /blocked=none/u
      );
      assert.match(
        artifact.conversationNotice.routeSummary.businessPhaseSummary.currentLine,
        /feedback=pending/u
      );
      assert.equal(artifact.userExperienceNotice.status, "ready");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("CLI can still suppress conversation notice for machine-readable runs", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-11-phase-cli-quiet-"));
    try {
      const result = spawnSync(
        process.execPath,
        [
          "scripts/run-meta-theory-governed-execution.mjs",
          "--task",
          naturalUserTask,
          "--run-id",
          "cli-phase-quiet",
          "--state-dir",
          tempDir,
          "--db",
          path.join(tempDir, "runs.sqlite"),
          "--no-emit-conversation-notice",
        ],
        { cwd: process.cwd(), encoding: "utf8" }
      );

      assert.equal(result.status, 0, result.stderr);
      assert.doesNotMatch(result.stdout, /^Meta_Kim 对话提示:/u);
      assert.match(result.stdout, /"runId": "cli-phase-quiet"/u);
      const artifact = JSON.parse(
        await readFile(path.join(tempDir, "cli-phase-quiet.json"), "utf8")
      );
      assert.equal(artifact.conversationNotice.status, "not_emitted");
      assert.equal(artifact.userExperienceNotice.status, "partial");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
