import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import {
  extractMetaKimBinding,
  observeClaudeAssistantMessages,
  observeClaudeJsonl,
  observeCodexAssistantMessages,
  observeCodexJsonl,
} from "../../scripts/live-acceptance/observe-host-events.mjs";

const sha256 = (value) => createHash("sha256").update(value, "utf8").digest("hex");
const jsonl = (records) => records.map(JSON.stringify).join("\n");
const binding = Object.freeze({
  runId: "run-2026-07-12",
  family: "agent_subagent",
  providerId: "global:code-architect",
  bindingRef: "task-runtime:agent_subagent:global:code-architect",
  taskPacketId: "task-runtime",
  roleInstanceId: "assistant-relay",
  occurredAt: "2026-07-12T06:00:00.000Z",
  evidenceKind: "spawn_agent_result",
});
const marker = `<metaKimBinding>${JSON.stringify(binding)}</metaKimBinding>`;

test("Codex CLI main-thread completed agent_message exposes exact session, message, and text hash fields", () => {
  const text = "Route selected before execution.";
  const raw = jsonl([
    { type: "thread.started", thread_id: "thread-1" },
    {
      type: "item.completed",
      item: { id: "message-1", type: "agent_message", status: "completed", text },
    },
  ]);
  const [observation] = observeCodexAssistantMessages(raw, {
    sessionId: "thread-1",
    messageId: "message-1",
    textSha256: sha256(text),
  });
  assert.equal(observation.observationKind, "assistant_message");
  assert.equal(observation.mainThreadChat, true);
  assert.equal(observation.text, text);
  assert.equal(observation.textSha256, sha256(text));
  assert.deepEqual(
    observeCodexAssistantMessages(raw, { textSha256: sha256("different") }),
    [],
  );
});

test("Codex stderr, system records, and incomplete agent messages never count", () => {
  const raw = jsonl([
    { type: "thread.started", thread_id: "thread-2" },
    { type: "stderr", text: "pretend assistant text" },
    { type: "system", message: "pretend assistant text" },
    { type: "item.started", item: { id: "message-started", type: "agent_message", text: "partial" } },
    { type: "item.completed", item: { id: "message-failed", type: "agent_message", status: "failed", text: "failed", error: "boom" } },
  ]);
  assert.deepEqual(observeCodexAssistantMessages(raw), []);
});

test("Codex Desktop committed main-thread event_msg commentary is session-bound assistant chat evidence", () => {
  const text = "Fetch completed; the route changed.";
  const raw = jsonl([
    { type: "session_meta", payload: { id: "desktop-session-1" } },
    { type: "event_msg", payload: { type: "agent_message", phase: "commentary", message: text } },
    {
      type: "response_item",
      payload: {
        type: "agent_message",
        author: "/root/child",
        recipient: "/root",
        content: [{ type: "input_text", text: "child result is not user chat" }],
      },
    },
  ]);
  const observations = observeCodexAssistantMessages(raw);
  assert.equal(observations.length, 1);
  assert.equal(observations[0].sessionId, "desktop-session-1");
  assert.equal(observations[0].phase, "commentary");
  assert.equal(observations[0].mainThreadChat, true);
  assert.equal(observations[0].textSha256, sha256(text));
});

test("Claude main-thread completed assistant text exposes exact session, message, and text hash fields", () => {
  const text = "已选择路线。";
  const raw = jsonl([
    {
      type: "assistant",
      session_id: "claude-session-1",
      message: {
        id: "claude-message-1",
        stop_reason: "end_turn",
        content: [{ type: "text", text }],
      },
    },
  ]);
  const [observation] = observeClaudeAssistantMessages(raw, {
    sessionId: "claude-session-1",
    messageId: "claude-message-1",
    textSha256: sha256(text),
  });
  assert.equal(observation.stopReason, "end_turn");
  assert.equal(observation.mainThreadChat, true);
  assert.equal(observation.textSha256, sha256(text));
});

test("Claude system/config records and incomplete assistant messages never count", () => {
  const raw = jsonl([
    { type: "system", session_id: "s1", message: { id: "sys", content: [{ type: "text", text: "system" }] } },
    { type: "assistant", session_id: "s1", message: { id: "partial", stop_reason: null, content: [{ type: "text", text: "partial" }] } },
    { type: "assistant", session_id: "s1", message: { id: "tools-only", stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "Bash" }] } },
  ]);
  assert.deepEqual(observeClaudeAssistantMessages(raw), []);
});

for (const requestName of ["spawn_agent", "followup_task"]) {
  test(`Codex Desktop ${requestName} requires accepted request output, child activity, and returned child final`, () => {
    const childId = `child-${requestName}`;
    const taskPath = `/root/${requestName}`;
    const callId = `call-${requestName}`;
    const finalText = `${requestName} final result`;
    const records = [
      { type: "thread.started", thread_id: "desktop-parent-thread" },
      { type: "response_item", payload: { type: "function_call", name: requestName, namespace: "collaboration", call_id: callId, arguments: "{}" } },
      { type: "response_item", payload: { type: "function_call_output", call_id: callId, output: "request accepted" } },
      { type: "event_msg", payload: { type: "sub_agent_activity", event_id: callId, kind: requestName === "followup_task" ? "interacted" : "started", agent_thread_id: childId, task_path: taskPath } },
      { type: "event_msg", payload: { type: "sub_agent_activity", event_id: callId, kind: "completed", status: "success", agent_thread_id: childId, task_path: taskPath } },
      { type: "item.completed", item: { id: `message-${requestName}`, type: "agent_message", status: "completed", agent_thread_id: childId, task_path: taskPath, text: finalText } },
    ];
    assert.deepEqual(observeCodexJsonl(jsonl(records.slice(0, -1))), []);
    const [event] = observeCodexJsonl(jsonl(records));
    assert.equal(event.family, "agent_subagent");
    assert.equal(event.childSessionId, childId);
    assert.equal(event.taskPath, taskPath);
    assert.equal(event.outputDigest, sha256(finalText));
    assert.equal(event.resultMessageId, `message-${requestName}`);
    assert.equal(event.resultTextSha256, sha256(finalText));
    assert.equal(event.lifecycleEvidence, "desktop_collaboration_returned_agent_message");
    assert.equal(event.sessionId, "desktop-parent-thread");
  });
}

test("Codex Desktop collaboration rejects a returned message from the wrong child", () => {
  const raw = jsonl([
    { type: "thread.started", thread_id: "parent" },
    { type: "response_item", payload: { type: "function_call", name: "followup_task", namespace: "collaboration", call_id: "call-1", arguments: "{}" } },
    { type: "response_item", payload: { type: "function_call_output", call_id: "call-1", output: "accepted" } },
    { type: "event_msg", payload: { type: "sub_agent_activity", event_id: "call-1", kind: "started", agent_thread_id: "child-1", task_path: "/root/task-1" } },
    { type: "event_msg", payload: { type: "sub_agent_activity", event_id: "call-1", kind: "completed", status: "success", agent_thread_id: "child-1", task_path: "/root/task-1" } },
    { type: "item.completed", item: { id: "wrong-message", type: "agent_message", status: "completed", agent_thread_id: "child-2", task_path: "/root/task-2", text: "wrong child" } },
  ]);
  assert.deepEqual(observeCodexJsonl(raw), []);
});

test("sanitized real Codex Desktop followup shape correlates interacted handoff to later child-authored input_text", () => {
  const resultText = "Child final review result.";
  const raw = jsonl([
    { timestamp: "2026-07-12T06:00:01.000Z", type: "session_meta", payload: { id: "desktop-real-session" } },
    {
      timestamp: "2026-07-12T06:00:02.000Z",
      type: "response_item",
      payload: {
        type: "function_call",
        id: "fc-1",
        name: "followup_task",
        namespace: "collaboration",
        arguments: JSON.stringify({ target: "/root/review", message: `Review the surface. ${marker}` }),
        call_id: "call-real-1",
      },
    },
    {
      timestamp: "2026-07-12T06:00:03.000Z",
      type: "event_msg",
      payload: {
        type: "sub_agent_activity",
        kind: "interacted",
        event_id: "call-real-1",
        agent_thread_id: "child-real-1",
        agent_path: "/root/review",
      },
    },
    {
      timestamp: "2026-07-12T06:00:04.000Z",
      type: "response_item",
      payload: { type: "function_call_output", call_id: "call-real-1", output: "delivered" },
    },
    {
      type: "event_msg",
      payload: { type: "agent_message", phase: "commentary", message: "Main-thread progress." },
    },
    {
      timestamp: "2026-07-12T06:00:05.1234567Z",
      type: "response_item",
      payload: {
        type: "agent_message",
        author: "/root/review",
        recipient: "/root",
        content: [{ type: "input_text", text: resultText }],
        internal_chat_message_metadata_passthrough: { turn_id: "turn-child-1" },
      },
    },
  ]);
  const [event] = observeCodexJsonl(raw);
  assert.equal(event.family, "agent_subagent");
  assert.equal(event.sessionId, "desktop-real-session");
  assert.equal(event.childSessionId, "child-real-1");
  assert.equal(event.taskPath, "/root/review");
  assert.equal(event.resultTextSha256, sha256(resultText));
  assert.deepEqual(event.metaKimBinding, binding);
  assert.equal(event.bindingRef, binding.bindingRef);
  assert.equal(event.providerId, binding.providerId);
  assert.equal(event.hostSurface, "collaboration.followup_task");
  assert.equal(event.occurredAt, "2026-07-12T06:00:05.1234567Z");
  assert.equal(event.markerOccurredAt, binding.occurredAt);
  assert.equal(event.resultStatus, "returned");
  assert.equal(event.completionBoundary, "returned_child_final");
  assert.equal(event.activityCompletionObserved, false);
  assert.equal(event.parentAgentPath, "/root");
  assert.match(event.resultMessageId, /^message-[a-f0-9]{24}$/u);
  assert.equal(event.sourceLines.length, 4);
});

test("strict metaKimBinding rejects partial, extra, malformed, and CLI-flag-like markers", () => {
  assert.deepEqual(extractMetaKimBinding({ metaKimBinding: binding }), binding);
  assert.equal(extractMetaKimBinding({ metaKimBinding: { ...binding, bindingRef: undefined } }), null);
  assert.equal(extractMetaKimBinding({ metaKimBinding: { ...binding, extra: "no" } }), null);
  assert.equal(
    extractMetaKimBinding({ metaKimBinding: { ...binding, family: "mcp" } }),
    null,
  );
  assert.equal(extractMetaKimBinding(`<metaKimBinding>{bad}</metaKimBinding>`), null);
  assert.equal(extractMetaKimBinding(`--meta-kim-binding '${JSON.stringify(binding)}'`), null);
  assert.equal(
    extractMetaKimBinding({ metaKimBinding: { ...binding, occurredAt: "2026-07-12T08:47:28.9231567Z" } })?.occurredAt,
    "2026-07-12T08:47:28.9231567Z",
  );
  const runScopedTeamBinding = {
    ...binding,
    family: "agent_teams_playbook",
    evidenceKind: "agent_team_result",
    taskPacketId: null,
    roleInstanceId: null,
  };
  assert.deepEqual(extractMetaKimBinding({ metaKimBinding: runScopedTeamBinding }), runScopedTeamBinding);
  assert.equal(
    extractMetaKimBinding({ metaKimBinding: { ...binding, taskPacketId: null, roleInstanceId: null } }),
    null,
  );
  assert.equal(
    extractMetaKimBinding({ metaKimBinding: { ...runScopedTeamBinding, roleInstanceId: "mixed" } }),
    null,
  );
});

test("assistant-message observers exclude child-thread messages from the main chat surface", () => {
  const codexRaw = jsonl([
    { type: "session_meta", payload: { id: "root-session" } },
    { type: "event_msg", payload: { type: "agent_message", phase: "commentary", agent_thread_id: "child-session", message: "child commentary" } },
    { type: "item.completed", item: { id: "child-final", type: "agent_message", status: "completed", agent_thread_id: "child-session", text: "child final" } },
  ]);
  assert.deepEqual(observeCodexAssistantMessages(codexRaw), []);

  const claudeRaw = jsonl([
    { type: "assistant", session_id: "root-session", message: { id: "root-message", stop_reason: "end_turn", content: [{ type: "text", text: "root" }] } },
    { type: "assistant", session_id: "root-session", agent_id: "child-agent", message: { id: "child-message", stop_reason: "end_turn", content: [{ type: "text", text: "child" }] } },
  ]);
  const observations = observeClaudeAssistantMessages(claudeRaw);
  assert.equal(observations.length, 1);
  assert.equal(observations[0].messageId, "root-message");
  assert.equal(observations[0].mainThreadChat, true);
});

test("command_script binding requires a simple direct provider invocation", () => {
  const commandBinding = {
    ...binding,
    family: "command_script",
    providerId: "scripts/provider.mjs",
    bindingRef: "task-runtime:command_script:scripts/provider.mjs",
    evidenceKind: "command_output",
  };
  const observe = (command) => observeCodexJsonl(jsonl([
    { timestamp: "2026-07-12T07:10:00.000Z", type: "thread.started", thread_id: "command-session" },
    { timestamp: "2026-07-12T07:10:01.000Z", type: "response_item", payload: { type: "function_call", name: "shell_command", namespace: "functions", call_id: "command-call", arguments: JSON.stringify({ command, prompt: marker.replace(JSON.stringify(binding), JSON.stringify(commandBinding)) }) } },
    { timestamp: "2026-07-12T07:10:02.000Z", type: "response_item", payload: { type: "function_call_output", call_id: "command-call", output: "ok", exit_code: 0 } },
  ]))[0];
  for (const command of [
    "node scripts/provider.mjs --verify",
    "node.exe .\\scripts\\provider.mjs --verify",
    "/usr/bin/node ./scripts/provider.mjs --verify",
    '"scripts/provider.mjs" --verify',
    ["node.exe", ".\\scripts\\provider.mjs", "--verify"],
    ["/usr/bin/node", "./scripts/provider.mjs", "--verify"],
  ]) {
    const matched = observe(command);
    assert.equal(matched.family, "command_script", command);
    assert.equal(matched.hostObservedFamily, "runtime_tool", command);
    assert.equal(matched.bindingRef, commandBinding.bindingRef, command);
  }

  for (const command of [
    "node scripts/provider.mjs.evil --verify",
    "if ($false) { node scripts/provider.mjs }; pwd",
    'Write-Output "scripts/provider.mjs"',
    "node other.mjs # scripts/provider.mjs",
    "node scripts/provider.mjs | Out-String",
    "node scripts/provider.mjs; pwd",
    "node scripts/provider.mjs > result.txt",
    "$(node scripts/provider.mjs)",
    ["sh", "-c", "node scripts/provider.mjs"],
  ]) {
    const rejected = observe(command);
    assert.equal(rejected.family, "runtime_tool", command);
    assert.equal(rejected.hostObservedFamily, "runtime_tool", command);
    assert.equal(rejected.bindingRef, undefined, command);
    assert.equal(
      rejected.bindingUnavailableReason,
      "command_script_provider_not_in_executed_argv",
      command,
    );
  }
});

test("real-shaped Codex spawn request extracts a bounded marker without retaining the prompt", () => {
  const raw = jsonl([
    { timestamp: "2026-07-12T06:10:00.000Z", type: "session_meta", payload: { id: "spawn-session" } },
    { timestamp: "2026-07-12T06:10:01.000Z", type: "response_item", payload: { type: "function_call", name: "spawn_agent", namespace: "collaboration", call_id: "spawn-call", arguments: JSON.stringify({ message: `Do bounded work. ${marker}` }) } },
    { timestamp: "2026-07-12T06:10:02.000Z", type: "event_msg", payload: { type: "sub_agent_activity", kind: "started", event_id: "spawn-call", agent_thread_id: "spawn-child", agent_path: "/root/spawn-child" } },
    { timestamp: "2026-07-12T06:10:03.000Z", type: "response_item", payload: { type: "function_call_output", call_id: "spawn-call", output: "started" } },
    { timestamp: "2026-07-12T06:10:04.000Z", type: "response_item", payload: { type: "agent_message", author: "/root/spawn-child", recipient: "/root", content: [{ type: "input_text", text: "done" }] } },
  ]);
  const [event] = observeCodexJsonl(raw);
  assert.deepEqual(event.metaKimBinding, binding);
  assert.equal(event.bindingRef, binding.bindingRef);
  assert.equal(event.occurredAt, "2026-07-12T06:10:04.000Z");
  assert.equal("prompt" in event, false);
  assert.equal("arguments" in event, false);
});

test("real-shaped Claude Task extracts metaKimBinding from immutable input prompt", () => {
  const claudeBinding = {
    ...binding,
    providerId: "claude:Task",
    bindingRef: "task-runtime:agent_subagent:claude:Task",
    evidenceKind: "agent_task_result",
  };
  const raw = jsonl([
    { timestamp: "2026-07-12T06:20:01.000Z", type: "assistant", session_id: "claude-binding-session", message: { id: "batch-1", content: [{ type: "tool_use", id: "task-call", name: "Task", input: { prompt: `Audit. <metaKimBinding>${JSON.stringify(claudeBinding)}</metaKimBinding>` } }] } },
    { timestamp: "2026-07-12T06:20:02.000Z", type: "user", session_id: "claude-binding-session", message: { content: [{ type: "tool_result", tool_use_id: "task-call", content: "done" }] }, tool_use_result: { agentId: "claude-child" } },
  ]);
  const [event] = observeClaudeJsonl(raw);
  assert.deepEqual(event.metaKimBinding, claudeBinding);
  assert.equal(event.bindingRef, claudeBinding.bindingRef);
  assert.equal(event.providerId, claudeBinding.providerId);
  assert.equal(event.hostSurface, "Task");
  assert.equal(event.occurredAt, "2026-07-12T06:20:02.000Z");
});

test("Desktop child result must return to the exact derived parent agent path", () => {
  const raw = jsonl([
    { timestamp: "2026-07-12T06:30:00.000Z", type: "session_meta", payload: { id: "sibling-session" } },
    { timestamp: "2026-07-12T06:30:01.000Z", type: "response_item", payload: { type: "function_call", name: "followup_task", namespace: "collaboration", call_id: "sibling-call", arguments: JSON.stringify({ target: "/root/review", message: "continue" }) } },
    { timestamp: "2026-07-12T06:30:02.000Z", type: "event_msg", payload: { type: "sub_agent_activity", kind: "interacted", event_id: "sibling-call", agent_thread_id: "review-child", agent_path: "/root/review" } },
    { timestamp: "2026-07-12T06:30:03.000Z", type: "response_item", payload: { type: "function_call_output", call_id: "sibling-call", output: "delivered" } },
    { timestamp: "2026-07-12T06:30:04.000Z", type: "response_item", payload: { type: "agent_message", author: "/root/review", recipient: "/root/sibling", content: [{ type: "input_text", text: "wrong recipient" }] } },
  ]);
  assert.deepEqual(observeCodexJsonl(raw), []);
});

test("agent_teams_playbook marker flattens while preserving the real host surface", () => {
  const teamBinding = {
    ...binding,
    family: "agent_teams_playbook",
    providerId: "agent-teams-playbook",
    bindingRef: "task-runtime:agent_teams_playbook:agent-teams-playbook",
    evidenceKind: "agent_team_result",
  };
  const raw = jsonl([
    { timestamp: "2026-07-12T06:40:01.000Z", type: "assistant", session_id: "team-session", message: { id: "team-batch", content: [{ type: "tool_use", id: "team-call", name: "Skill", input: { prompt: `Run team. <metaKimBinding>${JSON.stringify(teamBinding)}</metaKimBinding>` } }] } },
    { timestamp: "2026-07-12T06:40:02.000Z", type: "user", session_id: "team-session", message: { content: [{ type: "tool_result", tool_use_id: "team-call", content: "done" }] } },
  ]);
  const [event] = observeClaudeJsonl(raw);
  assert.equal(event.family, "agent_teams_playbook");
  assert.equal(event.providerId, "agent-teams-playbook");
  assert.equal(event.hostSurface, "Skill");
  assert.equal(event.bindingRef, teamBinding.bindingRef);
});

test("Claude hook inherits a hook marker only from its correlated parent call", () => {
  const hookBinding = {
    ...binding,
    family: "hook",
    providerId: "PreToolUse",
    bindingRef: "task-runtime:hook:PreToolUse",
    evidenceKind: "hook_trigger_event",
  };
  const raw = jsonl([
    { timestamp: "2026-07-12T06:50:01.000Z", type: "assistant", session_id: "hook-session", message: { id: "hook-batch", content: [{ type: "tool_use", id: "parent-tool-call", name: "Bash", input: { prompt: `Run. <metaKimBinding>${JSON.stringify(hookBinding)}</metaKimBinding>` } }] } },
    { timestamp: "2026-07-12T06:50:02.000Z", type: "user", session_id: "hook-session", message: { content: [{ type: "tool_result", tool_use_id: "parent-tool-call", content: "done" }] } },
    { timestamp: "2026-07-12T06:50:03.000Z", type: "system", subtype: "hook_started", hook_id: "hook-1", hook_name: "PreToolUse", tool_use_id: "parent-tool-call", session_id: "hook-session" },
    { timestamp: "2026-07-12T06:50:04.123456Z", type: "system", subtype: "hook_response", hook_id: "hook-1", hook_name: "PreToolUse", tool_use_id: "parent-tool-call", exit_code: 0, outcome: "success", session_id: "hook-session" },
  ]);
  const events = observeClaudeJsonl(raw);
  const bound = events.filter((event) => event.bindingRef === hookBinding.bindingRef);
  assert.equal(bound.length, 1);
  assert.equal(bound[0].family, "hook");
  assert.equal(bound[0].hostSurface, "PreToolUse");
  assert.equal(bound[0].parentEventId, "parent-tool-call");
  assert.equal(bound[0].occurredAt, "2026-07-12T06:50:04.123456Z");
});

test("encrypted tool payload is not decrypted and reports why binding is unavailable", () => {
  const raw = jsonl([
    { timestamp: "2026-07-12T07:00:01.000Z", type: "thread.started", thread_id: "encrypted-session" },
    { timestamp: "2026-07-12T07:00:02.000Z", type: "response_item", payload: { type: "function_call", name: "shell_command", namespace: "functions", call_id: "encrypted-call", arguments: JSON.stringify({ encrypted_content: "opaque" }) } },
    { timestamp: "2026-07-12T07:00:03.000Z", type: "response_item", payload: { type: "function_call_output", call_id: "encrypted-call", output: "success", exit_code: 0 } },
  ]);
  const [event] = observeCodexJsonl(raw);
  assert.equal(event.bindingRef, undefined);
  assert.equal(event.bindingUnavailableReason, "encrypted_payload_without_host_binding_metadata");
  assert.equal("arguments" in event, false);
});

test("Fernet-like encrypted message payload is diagnosed without attempting decryption", () => {
  const raw = jsonl([
    { timestamp: "2026-07-12T07:20:01.000Z", type: "thread.started", thread_id: "fernet-session" },
    { timestamp: "2026-07-12T07:20:02.000Z", type: "response_item", payload: { type: "function_call", name: "shell_command", namespace: "functions", call_id: "fernet-call", arguments: JSON.stringify({ message: "gAAAAABo_0123456789abcdefghijklmnop" }) } },
    { timestamp: "2026-07-12T07:20:03.000Z", type: "response_item", payload: { type: "function_call_output", call_id: "fernet-call", output: "success", exit_code: 0 } },
  ]);
  const [event] = observeCodexJsonl(raw);
  assert.equal(event.bindingUnavailableReason, "encrypted_payload_without_host_binding_metadata");
});
