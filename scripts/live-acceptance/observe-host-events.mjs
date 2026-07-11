#!/usr/bin/env node

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const sha256 = (value) => createHash("sha256").update(String(value), "utf8").digest("hex");

export function parseJsonl(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return { line: index + 1, value: JSON.parse(line) };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function payloadOf(record) {
  return record?.payload ?? record;
}

function classifyTool(name, namespace = "") {
  const normalized = `${namespace}:${name}`.toLowerCase();
  if (["spawn_agent", "agent", "task"].includes(String(name).toLowerCase())) {
    return "agent_subagent";
  }
  if (String(name).toLowerCase() === "skill") return "skill";
  if (normalized.includes("mcp") || String(namespace).startsWith("mcp__")) return "mcp";
  if (["bash", "shell_command", "exec_command"].includes(String(name).toLowerCase())) {
    // A generic shell call is only a runtime tool observation. It becomes
    // command_script evidence later, after an exact argv/provider/binding join.
    return "runtime_tool";
  }
  return "runtime_tool";
}

export function observeCodexJsonl(text) {
  const records = parseJsonl(text);
  const calls = new Map();
  const outputs = new Map();
  const agentStarts = new Map();
  const agentCompletions = new Map();
  let threadId = null;
  for (const record of records) {
    const payload = payloadOf(record.value);
    if (record.value?.type === "thread.started") threadId = record.value.thread_id ?? null;
    if (record.value?.type === "item.started" && record.value?.item?.id) {
      const item = record.value.item;
      const mappedName = item.type === "command_execution"
        ? "shell_command"
        : item.name ?? item.tool_name ?? item.type;
      calls.set(item.id, {
        line: record.line,
        payload: {
          type: "function_call",
          call_id: item.id,
          name: mappedName,
          namespace: item.namespace ?? "codex_cli",
          arguments: item.command ?? item.arguments ?? item.input ?? "",
          session_id: threadId,
          itemType: item.type,
        },
      });
    }
    if (record.value?.type === "item.completed" && record.value?.item?.id) {
      const item = record.value.item;
      const commandCompletedSuccessfully =
        item.type !== "command_execution" ||
        (Number.isInteger(item.exit_code) && item.exit_code === 0);
      if (["completed", "success"].includes(item.status) && commandCompletedSuccessfully) {
        outputs.set(item.id, {
          line: record.line,
          payload: {
            type: "function_call_output",
            call_id: item.id,
            output: item.aggregated_output ?? item.result ?? item.output ?? "",
            session_id: threadId,
            exit_code: item.exit_code,
          },
        });
      }
    }
    if (payload?.type === "function_call") {
      const callId = payload.call_id ?? payload.callId;
      if (callId) calls.set(callId, { line: record.line, payload });
    }
    if (payload?.type === "function_call_output") {
      const callId = payload.call_id ?? payload.callId;
      const outputText = typeof payload.output === "string"
        ? payload.output
        : JSON.stringify(payload.output ?? payload.result ?? "");
      const call = callId ? calls.get(callId) : null;
      const callName = String(call?.payload?.name ?? "").toLowerCase();
      const commandLike =
        call?.payload?.itemType === "command_execution" ||
        ["bash", "shell_command", "exec_command"].includes(callName);
      const explicitExitCode = payload.exit_code ?? payload.exitCode;
      const parsedExitCode = outputText.match(
        /(?:^|\n)\s*(?:exit code|exit_code)\s*[:=]\s*(-?\d+)\b/i,
      );
      const hasSuccessfulCommandExit =
        !commandLike ||
        (explicitExitCode !== undefined && Number(explicitExitCode) === 0) ||
        (parsedExitCode && Number(parsedExitCode[1]) === 0);
      const failed =
        payload.is_error === true ||
        payload.error != null ||
        !hasSuccessfulCommandExit ||
        (explicitExitCode !== undefined && Number(explicitExitCode) !== 0) ||
        /(?:^|\n)\s*(?:exit code|exit_code)\s*[:=]\s*[1-9]\d*\b/i.test(outputText) ||
        /(?:^|\n)\s*(?:error|failed)\s*:/i.test(outputText);
      if (callId && !failed) outputs.set(callId, { line: record.line, payload });
    }
    if (payload?.type === "sub_agent_activity" && payload?.kind === "started") {
      const callId = payload.event_id ?? payload.call_id;
      if (callId) agentStarts.set(callId, { line: record.line, payload });
    }
    if (
      payload?.type === "sub_agent_activity" &&
      ["completed", "task_complete", "result", "returned"].includes(payload?.kind)
    ) {
      const callId = payload.event_id ?? payload.call_id;
      const childId = payload.agent_thread_id ?? payload.child_thread_id;
      const completionStatus = payload.status ?? payload.result_status ?? payload.outcome;
      const completionSucceeded =
        payload.success === true ||
        ["success", "completed", "returned", "verified"].includes(completionStatus);
      if (!completionSucceeded || payload.error != null || payload.is_error === true) continue;
      if (callId) agentCompletions.set(callId, { line: record.line, payload });
      if (childId) agentCompletions.set(`child:${childId}`, { line: record.line, payload });
    }
  }
  const events = [];
  for (const [callId, call] of calls) {
    const output = outputs.get(callId);
    if (!output) continue;
    const name = call.payload.name ?? "unknown";
    const namespace = call.payload.namespace ?? "";
    const family = call.payload.itemType === "mcp_tool_call"
      ? "mcp"
      : classifyTool(name, namespace);
    const agentStart = agentStarts.get(callId);
    const childSessionId = agentStart?.payload?.agent_thread_id ?? null;
    const agentCompletion = agentCompletions.get(callId) ??
      (childSessionId ? agentCompletions.get(`child:${childSessionId}`) : null);
    if (family === "agent_subagent" && (!childSessionId || !agentCompletion)) continue;
    events.push({
      observerFormat: "codex_host_jsonl_v1",
      family,
      eventId: callId,
      parentEventId: null,
      hostSurface: namespace ? `${namespace}.${name}` : name,
      providerId: namespace ? `${namespace}.${name}` : name,
      resultStatus: "completed",
      inputDigest: sha256(call.payload.arguments ?? call.payload.input ?? ""),
      outputDigest: sha256(output.payload.output ?? output.payload.result ?? ""),
      childSessionId,
      sessionId: call.payload.session_id ?? output.payload.session_id ?? null,
      sourceLines: [call.line, output.line, agentStart?.line, agentCompletion?.line].filter(Boolean),
    });
  }
  return events;
}

function claudeContentRecords(records) {
  const result = [];
  for (const record of records) {
    const payload = payloadOf(record.value);
    const content = payload?.message?.content ?? payload?.content ?? [];
    if (!Array.isArray(content)) continue;
    for (const item of content) result.push({ line: record.line, item, payload });
  }
  return result;
}

export function observeClaudeJsonl(text) {
  const records = parseJsonl(text);
  const content = claudeContentRecords(records);
  const calls = new Map();
  const results = new Map();
  const events = [];
  for (const entry of content) {
    if (entry.item?.type === "tool_use" && entry.item?.id) calls.set(entry.item.id, entry);
    if (entry.item?.type === "tool_result" && entry.item?.tool_use_id) {
      results.set(entry.item.tool_use_id, entry);
    }
  }
  for (const [callId, call] of calls) {
    const output = results.get(callId);
    if (!output || output.item?.is_error === true) continue;
    const name = call.item.name ?? "unknown";
    events.push({
      observerFormat: "claude_stream_json_v1",
      family: classifyTool(name),
      eventId: callId,
      parentEventId: null,
      hostSurface: name,
      providerId: name,
      resultStatus: "completed",
      inputDigest: sha256(JSON.stringify(call.item.input ?? {})),
      outputDigest: sha256(JSON.stringify(output.item.content ?? output.item)),
      childSessionId:
        output.payload?.tool_use_result?.agentId ??
        output.payload?.tool_use_result?.agent_id ??
        output.item?.agentId ??
        output.item?.agent_id ??
        null,
      batchId: call.payload?.message?.id ?? null,
      sessionId: call.payload?.session_id ?? output.payload?.session_id ?? null,
      sourceLines: [call.line, output.line],
    });
  }
  const hookStarts = new Map();
  for (const record of records) {
    const payload = payloadOf(record.value);
    if (record.value?.type === "system" && record.value?.subtype === "hook_started") {
      const hookId = record.value.hook_id ?? payload?.hook_id;
      if (hookId) hookStarts.set(hookId, { line: record.line, payload: record.value });
      continue;
    }
    if (record.value?.type === "system" && record.value?.subtype === "hook_response") {
      const hookId = record.value.hook_id ?? payload?.hook_id;
      const started = hookStarts.get(hookId);
      const exitCode = Number(record.value.exit_code ?? payload?.exit_code ?? 1);
      const outcome = record.value.outcome ?? payload?.outcome;
      if (!hookId || !started || exitCode !== 0 || outcome !== "success") continue;
      const hookName = record.value.hook_name ?? started.payload?.hook_name ?? "hook";
      const parentEventId =
        record.value.tool_use_id ?? started.payload?.tool_use_id ?? null;
      events.push({
        observerFormat: "claude_hook_event_v1",
        family: "hook",
        eventId: `hook:${hookId}`,
        parentEventId,
        hostSurface: hookName,
        providerId: hookName,
        resultStatus: "completed",
        inputDigest: sha256(JSON.stringify(started.payload ?? {})),
        outputDigest: sha256(JSON.stringify(record.value ?? {})),
        childSessionId: null,
        sessionId: record.value.session_id ?? started.payload?.session_id ?? null,
        sourceLines: [started.line, record.line],
        correlationScope: parentEventId ? "tool_call" : "session",
      });
      continue;
    }
    const hook = payload?.hook_event ?? payload?.hookEvent ?? payload;
    if (!["hook_success", "hook_additional_context"].includes(hook?.type)) continue;
    const eventId = hook.tool_use_id ?? hook.toolUseID ?? hook.event_id;
    if (!eventId) continue;
    events.push({
      observerFormat: "claude_hook_event_v1",
      family: "hook",
      eventId: `hook:${eventId}:${hook.hookName ?? hook.hook_name ?? "unknown"}`,
      parentEventId: eventId,
      hostSurface: hook.hookName ?? hook.hook_name ?? "hook",
      providerId: hook.hookName ?? hook.hook_name ?? "hook",
      resultStatus: "completed",
      inputDigest: sha256(JSON.stringify(hook.input ?? {})),
      outputDigest: sha256(JSON.stringify(hook.output ?? {})),
      childSessionId: null,
      sessionId: payload?.session_id ?? null,
      sourceLines: [record.line],
    });
  }
  return events;
}

export function observeMcpClientJsonl(text) {
  const records = parseJsonl(text).map((entry) => entry.value);
  const initialize = records.find((record) => record.phase === "initialize" && record.status === "success");
  const listed = records.find((record) => record.phase === "tools/list" && record.status === "success");
  const called = records.find((record) => record.phase === "tools/call" && record.status === "success");
  if (!initialize || !listed || !called || !called.callId || !called.toolName) return [];
  return [{
    observerFormat: "mcp_stdio_client_v1",
    family: "mcp",
    eventId: called.callId,
    parentEventId: initialize.sessionId ?? null,
    hostSurface: `mcp.${called.toolName}`,
    providerId: called.providerId ?? called.toolName,
    resultStatus: "completed",
    inputDigest: called.inputDigest ?? sha256(JSON.stringify(called.arguments ?? {})),
    outputDigest: called.outputDigest ?? sha256(JSON.stringify(called.result ?? {})),
    childSessionId: null,
    sourceLines: [],
  }];
}

export function lintBlindPrompt(prompt) {
  const forbidden = [
    /\bagents?\b/i, /subagent/i, /spawn[_ -]?agent/i, /\bskills?\b/i,
    /\bmcp\b/i, /\bhooks?\b/i, /\bcommands?\b/i, /\btools?\b/i, /\bparallel\b/i,
    /智能体|子代理|技能|钩子|命令|工具|并行|同时推进|并发|分头/g,
  ];
  const hits = forbidden.filter((pattern) => pattern.test(prompt)).map((pattern) => pattern.source);
  return { pass: hits.length === 0, hits };
}

async function main() {
  const args = process.argv.slice(2);
  const value = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : null;
  };
  const runtime = value("--runtime");
  const inputPath = value("--input");
  const outputPath = value("--output");
  if (!runtime || !inputPath || !outputPath) {
    throw new Error("Usage: observe-host-events.mjs --runtime codex|claude|mcp --input <raw.jsonl> --output <observed.json>");
  }
  const raw = await fs.readFile(path.resolve(inputPath), "utf8");
  const events = runtime === "codex"
    ? observeCodexJsonl(raw)
    : runtime === "claude"
      ? observeClaudeJsonl(raw)
      : observeMcpClientJsonl(raw);
  const report = {
    schemaVersion: "clean-room-host-observation-v0.1",
    runtime,
    sourceArtifact: path.resolve(inputPath),
    sourceSha256: sha256(raw),
    events,
  };
  await fs.writeFile(path.resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ status: events.length > 0 ? "observed" : "no_events", eventCount: events.length })}\n`);
  if (events.length === 0) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exit(1);
  });
}
