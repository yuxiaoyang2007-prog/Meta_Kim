import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHostInvocationEvidence } from "../../scripts/run-meta-theory-governed-execution.mjs";
import {
  lintBlindPrompt,
  observeClaudeJsonl,
  observeCodexJsonl,
  observeMcpClientJsonl,
} from "../../scripts/live-acceptance/observe-host-events.mjs";
import {
  buildPrivateAttestationPayload,
  verifyPrivateAttestedExactBindingReport,
} from "../../scripts/live-acceptance/require-clean-room-live-evidence.mjs";

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");

test("synthetic evidence cannot self-promote with trusted=true", () => {
  const [evidence] = normalizeHostInvocationEvidence([{
    family: "agent_subagent",
    state: "invoked",
    providerId: "reviewer",
    hostSurface: "spawn_agent",
    evidenceKind: "spawn_agent_result",
    evidenceRef: "self-test:spawn_agent:done",
  }], { trusted: true, expectedRunId: "run-1" });
  assert.equal(evidence.proofValid, false);
  assert.equal(evidence.passEligible, false);
});

test("caller-authored observer JSON cannot promote itself even with matching hash and binding", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "meta-kim-observer-boundary-"));
  try {
    const observerArtifactPath = path.join(temp, "observed.jsonl");
    const event = {
      observerFormat: "codex_host_jsonl_v1",
      eventId: "call-1",
      runId: "run-1",
      sessionId: "session-1",
      providerId: "reviewer",
      bindingRef: "task-1:agent_subagent:reviewer",
      resultStatus: "completed",
    };
    const content = `${JSON.stringify(event)}\n`;
    await writeFile(observerArtifactPath, content, "utf8");
    const base = {
      family: "agent_subagent",
      state: "invoked",
      providerId: "reviewer",
      hostSurface: "spawn_agent",
      evidenceKind: "spawn_agent_result",
      evidenceRef: "observer:call-1",
      evidenceOrigin: "external_runtime_observer",
      observerSource: "stdout_jsonl",
      eventId: "call-1",
      sessionId: "session-1",
      runId: "run-1",
      occurredAt: new Date().toISOString(),
      resultStatus: "completed",
      bindingRef: "task-1:agent_subagent:reviewer",
      observerArtifactPath,
      observerArtifactSha256: sha256(content),
      synthetic: false,
    };
    const [generic] = normalizeHostInvocationEvidence([base], {
      trusted: true,
      expectedRunId: "run-1",
    });
    assert.equal(generic.passEligible, false, "generic caller-authored JSONL must not pass");

    const [observed] = normalizeHostInvocationEvidence([{
      ...base,
      observerFormat: "codex_host_jsonl_v1",
    }], { trusted: true, expectedRunId: "run-1" });
    assert.equal(observed.passEligible, false);
    assert.match(observed.rejectionReason, /cannot promote itself/);

    const [wrongBinding] = normalizeHostInvocationEvidence([{
      ...base,
      observerFormat: "codex_host_jsonl_v1",
      bindingRef: "task-2:agent_subagent:reviewer",
    }], { trusted: true, expectedRunId: "run-1" });
    assert.equal(wrongBinding.passEligible, false);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("Codex agent proof requires call, result, correlated child start, and child completion", () => {
  const withoutStart = [
    { type: "response_item", payload: { type: "function_call", name: "spawn_agent", namespace: "collaboration", call_id: "c1", arguments: "{}" } },
    { type: "response_item", payload: { type: "function_call_output", call_id: "c1", output: "ok" } },
  ].map(JSON.stringify).join("\n");
  assert.deepEqual(observeCodexJsonl(withoutStart), []);

  const withStart = `${withoutStart}\n${JSON.stringify({
    type: "event_msg",
    payload: { type: "sub_agent_activity", event_id: "c1", kind: "started", agent_thread_id: "child-1" },
  })}\n`;
  assert.deepEqual(observeCodexJsonl(withStart), []);
  const withCompletion = `${withStart}${JSON.stringify({
    type: "event_msg",
    payload: { type: "sub_agent_activity", event_id: "c1", kind: "completed", status: "success", agent_thread_id: "child-1" },
  })}\n`;
  const events = observeCodexJsonl(withCompletion);
  assert.equal(events.length, 1);
  assert.equal(events[0].family, "agent_subagent");
  assert.equal(events[0].childSessionId, "child-1");
});

test("Codex failed child completion does not prove Agent execution", () => {
  const raw = [
    { type: "response_item", payload: { type: "function_call", name: "spawn_agent", namespace: "collaboration", call_id: "c-fail", arguments: "{}" } },
    { type: "response_item", payload: { type: "function_call_output", call_id: "c-fail", output: "started" } },
    { type: "event_msg", payload: { type: "sub_agent_activity", event_id: "c-fail", kind: "started", agent_thread_id: "child-fail" } },
    { type: "event_msg", payload: { type: "sub_agent_activity", event_id: "c-fail", kind: "completed", status: "failed", error: "boom", agent_thread_id: "child-fail" } },
  ].map(JSON.stringify).join("\n");
  assert.deepEqual(observeCodexJsonl(raw), []);
});

test("Codex CLI command execution requires a successful started/completed item pair", () => {
  const raw = [
    { type: "thread.started", thread_id: "thread-1" },
    { type: "item.started", item: { id: "item-1", type: "command_execution", command: "node -v", status: "in_progress" } },
    { type: "item.completed", item: { id: "item-1", type: "command_execution", command: "node -v", status: "completed", exit_code: 0, aggregated_output: "v24" } },
  ].map(JSON.stringify).join("\n");
  const events = observeCodexJsonl(raw);
  assert.equal(events.length, 1);
  assert.equal(events[0].family, "runtime_tool");
  assert.equal(events[0].sessionId, "thread-1");
});

test("Codex CLI command completion without exit_code is not accepted", () => {
  const raw = [
    { type: "thread.started", thread_id: "thread-missing-exit" },
    { type: "item.started", item: { id: "item-missing-exit", type: "command_execution", command: "node -v", status: "in_progress" } },
    { type: "item.completed", item: { id: "item-missing-exit", type: "command_execution", command: "node -v", status: "completed", aggregated_output: "v24" } },
  ].map(JSON.stringify).join("\n");
  assert.deepEqual(observeCodexJsonl(raw), []);
});

test("Codex failed function output is never accepted as a completed event", () => {
  const raw = [
    { type: "response_item", payload: { type: "function_call", name: "shell_command", namespace: "functions", call_id: "failed-1", arguments: "{}" } },
    { type: "response_item", payload: { type: "function_call_output", call_id: "failed-1", output: "Exit code: 1\nfailed" } },
  ].map(JSON.stringify).join("\n");
  assert.deepEqual(observeCodexJsonl(raw), []);
});

test("Claude Agent proof preserves the child agent id from tool_use_result", () => {
  const raw = [
    { type: "assistant", session_id: "session-1", message: { id: "message-batch-1", content: [{ type: "tool_use", id: "agent-call-1", name: "Agent", input: { prompt: "audit" } }] } },
    { type: "user", session_id: "session-1", message: { content: [{ type: "tool_result", tool_use_id: "agent-call-1", content: "done" }] }, tool_use_result: { agentId: "child-agent-1" } },
  ].map(JSON.stringify).join("\n");
  const events = observeClaudeJsonl(raw);
  assert.equal(events.length, 1);
  assert.equal(events[0].family, "agent_subagent");
  assert.equal(events[0].childSessionId, "child-agent-1");
  assert.equal(events[0].batchId, "message-batch-1");
});

test("Claude hook proof requires a correlated successful hook response", () => {
  const raw = [
    { type: "system", subtype: "hook_started", hook_id: "h1", hook_name: "PreToolUse", hook_event: "PreToolUse", session_id: "s1" },
    { type: "system", subtype: "hook_response", hook_id: "h1", hook_name: "PreToolUse", hook_event: "PreToolUse", exit_code: 0, outcome: "success", session_id: "s1" },
  ].map(JSON.stringify).join("\n");
  const events = observeClaudeJsonl(raw);
  assert.equal(events.length, 1);
  assert.equal(events[0].family, "hook");
  assert.equal(events[0].correlationScope, "session");
});

test("MCP --self-test/catalog output is not a transport tool call", () => {
  const catalog = `${JSON.stringify({ ok: true, tools: ["get_meta_runtime_capabilities"] })}\n`;
  assert.deepEqual(observeMcpClientJsonl(catalog), []);
  assert.equal(
    lintBlindPrompt("请只读检查这个项目的依赖来源和发布安全，不修改任何文件。").pass,
    true,
  );
  assert.equal(lintBlindPrompt("请调用 MCP tool 并行检查").pass, false);
  assert.equal(lintBlindPrompt("这些检查可以同时推进").pass, false);
});

test("caller-generated Ed25519 key and signature cannot replace the pinned observer trust root", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "meta-kim-caller-key-reject-"));
  try {
    const artifactPath = path.join(temp, "observer.jsonl");
    const artifact = `${JSON.stringify({ eventId: "event-1" })}\n`;
    await writeFile(artifactPath, artifact, "utf8");
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const report = {
      schemaVersion: "clean-room-live-acceptance-v0.1",
      runId: "caller-signed-run-0001",
      target: "claude_code",
      status: "release_attested",
      promotionEligible: true,
      exactBindingCoverage: true,
      requiredBindings: [{ family: "mcp", providerId: "mcp.selected_tool", bindingRef: "task:mcp:mcp.selected_tool" }],
      observedBindings: [{
        family: "mcp",
        providerId: "mcp.selected_tool",
        hostSurface: "mcp.selected_tool",
        bindingRef: "task:mcp:mcp.selected_tool",
        evidenceKind: "mcp_tool_result",
        runId: "caller-signed-run-0001",
        sessionId: "session-1",
        eventId: "event-1",
        occurredAt: new Date().toISOString(),
        resultStatus: "completed",
        observerArtifactPath: artifactPath,
        observerArtifactSha256: sha256(artifact),
      }],
      attestation: {
        algorithm: "Ed25519",
        keyId: "caller-key",
        publicKey: publicKey.export({ type: "spki", format: "pem" }),
        signatureBase64: "pending",
        signedPayloadSha256: "pending",
      },
    };
    const payload = buildPrivateAttestationPayload(report);
    report.attestation.signedPayloadSha256 = sha256(payload);
    const signedPayload = buildPrivateAttestationPayload(report);
    report.attestation.signedPayloadSha256 = sha256(signedPayload);
    report.attestation.signatureBase64 = sign(
      null,
      Buffer.from(signedPayload, "utf8"),
      privateKey,
    ).toString("base64");

    const result = verifyPrivateAttestedExactBindingReport(report);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("untrusted_key_id"));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
