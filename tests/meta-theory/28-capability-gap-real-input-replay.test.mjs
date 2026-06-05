import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCapabilityGapRealInputReplay } from "../../scripts/run-capability-gap-real-input-replay.mjs";

describe("28 — Capability Gap real input replay", async () => {
  test("runs six realistic inputs in child processes and records replay evidence", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "meta-kim-real-input-"));
    try {
      const jsonPath = path.join(tempDir, "real-input-replay.json");
      const markdownPath = path.join(tempDir, "real-input-replay.md");
      const dbPath = path.join(tempDir, "real-input-replay.sqlite");
      const report = await runCapabilityGapRealInputReplay({
        jsonPath,
        markdownPath,
        dbPath,
      });

      assert.equal(report.status, "pass");
      assert.deepEqual(
        report.cases.map((item) => item.actualDecision),
        [
          "create_skill",
          "create_agent",
          "create_script",
          "create_mcp_provider",
          "worker_task_only",
          "blocked_or_needs_approval",
        ]
      );
      assert.equal(report.database.runs, 6);
      assert.equal(report.stationPacketCoverage, true);
      assert.deepEqual(report.stationPackets, [
        "agentBoundaryDecision",
        "agentLoadoutDecision",
        "agentMemoryDecision",
        "agentDesignReview",
        "agentCandidateGateDecision",
      ]);
      for (const replayCase of report.cases) {
        assert.equal(replayCase.decisionMatched, true, replayCase.id);
        assert.equal(replayCase.outputCompleteness.status, "pass", replayCase.id);
        assert.equal(replayCase.runStateStore.requiredEventsPresent, true, replayCase.id);
      }
      const createAgent = report.cases.find(
        (item) => item.actualDecision === "create_agent"
      );
      assert.equal(createAgent.stationPacketCompleteness.status, "pass");
      assert.ok(
        report.evidence.commands.every((command) =>
          command.startsWith("node scripts/")
        ),
        "evidence commands should prove child process execution"
      );
      assert.doesNotMatch(
        JSON.stringify(report.evidence.commands),
        /[A-Z]:[\\/]|Users[\\/]Kim/i
      );

      const markdown = await readFile(markdownPath, "utf8");
      assert.match(markdown, /Capability Gap Real Input Replay Report/);
      assert.match(markdown, /REAL-01/);
      assert.match(markdown, /create_mcp_provider/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
