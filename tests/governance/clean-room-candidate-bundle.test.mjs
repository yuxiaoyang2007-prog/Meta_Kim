import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";

import {
  buildUnsignedCandidateBundle,
  selectSingleNewGovernedArtifact,
  snapshotGovernedArtifacts,
} from "../../scripts/live-acceptance/run-clean-room-live-acceptance.mjs";

const runId = "governed-clean-room-run-001";
const sessionId = "session-1";
const noticeText = "[Fetch] 已完成证据核对，下一步进入路线选择。";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const binding = {
  family: "runtime_tool",
  providerId: "functions.shell_command",
  bindingRef: "task-1:runtime_tool:functions.shell_command",
  taskPacketId: "task-1",
};
const artifact = {
  runId,
  coreLoop: { runtimeInvocationPlanPacket: { requiredBindings: [binding] } },
  workerTaskPackets: [{ taskPacketId: "task-1", roleInstanceId: "review-1" }],
  conversationNotice: {
    hostObservationExpectations: [{
      stage: "Fetch",
      textSha256: sha256(noticeText),
    }],
  },
};
const marker = {
  ...binding,
  roleInstanceId: "review-1",
  runId,
  occurredAt: "2026-07-12T00:00:00.000Z",
  evidenceKind: "runtime_tool_call",
};
const rawHostJsonl = [
  { type: "session_meta", payload: { id: sessionId } },
  { type: "event_msg", payload: { type: "agent_message", phase: "commentary", id: "notice-1", message: noticeText } },
  { type: "response_item", payload: { type: "function_call", name: "shell_command", namespace: "functions", call_id: "tool-call-1", session_id: sessionId, arguments: JSON.stringify({ command: "pwd", metaKimBinding: marker }) } },
  { type: "response_item", timestamp: "2026-07-12T00:00:01.000Z", payload: { type: "function_call_output", call_id: "tool-call-1", session_id: sessionId, output: "Exit code: 0\nok" } },
].map(JSON.stringify).join("\n");

describe("clean-room exact-binding candidate bundle", () => {
  test("selects exactly one newly created governed artifact and rejects zero or multiple", () => {
    const before = new Map([["C:/bundle/old.json", "a"]]);
    assert.throws(() => selectSingleNewGovernedArtifact(before, new Map(before)), /governed_artifact_count:0/);
    assert.equal(
      selectSingleNewGovernedArtifact(before, new Map([...before, ["C:/bundle/new.json", "b"]])),
      "C:/bundle/new.json",
    );
    assert.throws(
      () => selectSingleNewGovernedArtifact(
        before,
        new Map([...before, ["C:/bundle/a.json", "b"], ["C:/bundle/b.json", "c"]]),
      ),
      /governed_artifact_count:2/,
    );
  });

  test("rejects harness or event UUID mismatch instead of substituting the governed runId", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "meta-kim-candidate-mismatch-"));
    try {
      const governedPath = path.join(temp, "run.json");
      await writeFile(governedPath, `${JSON.stringify(artifact)}\n`);
      await assert.rejects(
        buildUnsignedCandidateBundle({
          artifactsDir: temp,
          harnessRunId: "clean-room-claude-harness-uuid",
          governedArtifactPath: governedPath,
          governedArtifactRoot: temp,
          selectedGovernedArtifactSha256: sha256(await readFile(governedPath)),
          runtime: "codex",
          rawHostJsonl: rawHostJsonl.replaceAll(runId, "clean-room-claude-harness-uuid"),
        }),
        /governed_run_id_mismatch/,
      );
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  test("discovers one governed artifact and writes a content-addressed unsigned bundle", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "meta-kim-candidate-success-"));
    try {
      const workspace = path.join(temp, "workspace");
      const stateDir = path.join(workspace, ".meta-kim", "state", "default", "runs");
      const artifactsDir = path.join(temp, "artifacts");
      await mkdir(stateDir, { recursive: true });
      await mkdir(artifactsDir, { recursive: true });
      const before = await snapshotGovernedArtifacts(workspace);
      const governedPath = path.join(stateDir, "run.json");
      await writeFile(governedPath, `${JSON.stringify(artifact, null, 2)}\n`);
      const after = await snapshotGovernedArtifacts(workspace);
      assert.equal(selectSingleNewGovernedArtifact(before, after), governedPath);

      const result = await buildUnsignedCandidateBundle({
        artifactsDir,
        harnessRunId: "clean-room-claude-harness-001",
        governedArtifactPath: governedPath,
        governedArtifactRoot: stateDir,
        selectedGovernedArtifactSha256: after.get(governedPath),
        runtime: "codex",
        rawHostJsonl,
      });
      assert.equal(result.status, "unsigned_candidate_built");
      assert.equal(result.promotionEligible, false);
      assert.equal(result.exactBindingCoverage, false);
      for (const item of [result.governedArtifact, result.rawHostJsonl, result.observation, result.candidate]) {
        assert.match(item.path, new RegExp(`^${item.sha256}\\.`));
        const evidencePath = path.join(artifactsDir, result.bundleRoot, item.path);
        await readFile(evidencePath);
        if (process.platform !== "win32") {
          assert.equal((await stat(evidencePath)).mode & 0o777, 0o600);
        }
      }
      const candidate = JSON.parse(
        await readFile(
          path.join(artifactsDir, result.bundleRoot, result.candidate.path),
          "utf8",
        ),
      );
      assert.equal(candidate.status, "unsigned_candidate");
      assert.equal(candidate.releaseAttested, false);
      assert.equal(candidate.requiredBindings[0].taskPacketId, "task-1");
      assert.equal(candidate.requiredBindings[0].roleInstanceId, "review-1");
      assert.equal(candidate.conversationNoticeObservations[0].sessionId, sessionId);
      assert.equal(candidate.sourceArtifacts.rawHostJsonl.sha256, result.rawHostJsonl.sha256);
      assert.equal(result.retentionPolicy.classification, "local_sensitive");
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  test("fails closed on stale snapshot bytes, unsafe run ids, and missing chat expectations", async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "meta-kim-candidate-guards-"));
    try {
      const governedPath = path.join(temp, "run.json");
      await writeFile(governedPath, `${JSON.stringify(artifact)}\n`);
      const digest = sha256(await readFile(governedPath));
      const base = {
        artifactsDir: temp,
        governedArtifactPath: governedPath,
        governedArtifactRoot: temp,
        selectedGovernedArtifactSha256: digest,
        runtime: "codex",
        rawHostJsonl,
      };
      await assert.rejects(
        buildUnsignedCandidateBundle({ ...base, harnessRunId: "../escape" }),
        /harness_run_id_invalid/,
      );
      await writeFile(governedPath, `${JSON.stringify({ ...artifact, changed: true })}\n`);
      await assert.rejects(
        buildUnsignedCandidateBundle({ ...base, harnessRunId: "stale-snapshot" }),
        /governed_artifact_changed_after_snapshot/,
      );
      const withoutExpectation = { ...artifact, conversationNotice: {} };
      await writeFile(governedPath, `${JSON.stringify(withoutExpectation)}\n`);
      await assert.rejects(
        buildUnsignedCandidateBundle({
          ...base,
          harnessRunId: "missing-chat-proof",
          selectedGovernedArtifactSha256: sha256(await readFile(governedPath)),
        }),
        /conversation_notice_observation_expectations_missing/,
      );
      const secondNotice = "[Thinking] 路线已锁定，准备执行。";
      const ambiguousArtifact = {
        ...artifact,
        conversationNotice: {
          hostObservationExpectations: [
            { stage: "Fetch", textSha256: sha256(noticeText) },
            { stage: "Thinking", textSha256: sha256(secondNotice) },
          ],
        },
      };
      await writeFile(governedPath, `${JSON.stringify(ambiguousArtifact)}\n`);
      const ambiguousRaw = `${rawHostJsonl}\n${[
        { type: "session_meta", payload: { id: "session-2" } },
        { type: "event_msg", payload: { type: "agent_message", phase: "commentary", id: "notice-2", message: secondNotice } },
      ].map(JSON.stringify).join("\n")}`;
      await assert.rejects(
        buildUnsignedCandidateBundle({
          ...base,
          harnessRunId: "ambiguous-chat-session",
          selectedGovernedArtifactSha256: sha256(await readFile(governedPath)),
          rawHostJsonl: ambiguousRaw,
        }),
        /top_level_host_session_count:2|conversation_notice_session_ambiguous_or_missing/,
      );
      const childNotice = "[Review] 子线程内部消息不能替代主聊天提示。";
      const childArtifact = {
        ...artifact,
        conversationNotice: {
          hostObservationExpectations: [
            { stage: "Review", textSha256: sha256(childNotice) },
          ],
        },
      };
      await writeFile(governedPath, `${JSON.stringify(childArtifact)}\n`);
      const childOnlyRaw = `${rawHostJsonl}\n${JSON.stringify({
        type: "item.completed",
        item: {
          type: "agent_message",
          id: "child-notice-1",
          agent_thread_id: "child-session-1",
          status: "completed",
          content: [{ type: "output_text", text: childNotice }],
        },
      })}`;
      await assert.rejects(
        buildUnsignedCandidateBundle({
          ...base,
          harnessRunId: "child-chat-rejected",
          selectedGovernedArtifactSha256: sha256(await readFile(governedPath)),
          rawHostJsonl: childOnlyRaw,
        }),
        /conversation_notice_not_main_thread|conversation_notice_match_count:0:0/,
      );
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  test("rejects a governed artifact symlink that escapes the selected state root", async (t) => {
    const temp = await mkdtemp(path.join(os.tmpdir(), "meta-kim-candidate-symlink-"));
    try {
      const stateRoot = path.join(temp, "state");
      const outsideRoot = path.join(temp, "outside");
      await mkdir(stateRoot);
      await mkdir(outsideRoot);
      const outsidePath = path.join(outsideRoot, "run.json");
      const linkedPath = path.join(stateRoot, "run.json");
      await writeFile(outsidePath, `${JSON.stringify(artifact)}\n`);
      try {
        await symlink(outsidePath, linkedPath, "file");
      } catch (error) {
        if (["EPERM", "EACCES"].includes(error?.code)) {
          t.skip("symlink creation is unavailable on this Windows host");
          return;
        }
        throw error;
      }
      await assert.rejects(
        buildUnsignedCandidateBundle({
          artifactsDir: temp,
          harnessRunId: "symlink-escape",
          governedArtifactPath: linkedPath,
          governedArtifactRoot: stateRoot,
          selectedGovernedArtifactSha256: sha256(await readFile(outsidePath)),
          runtime: "codex",
          rawHostJsonl,
        }),
        /governed_artifact_outside_allowed_root/,
      );
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});
