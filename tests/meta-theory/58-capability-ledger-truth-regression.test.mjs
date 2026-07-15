import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { getGovernedRunSurfaceLabels } from "../../scripts/meta-kim-i18n.mjs";

const runnerSource = readFileSync(
  path.resolve("scripts/run-meta-theory-governed-execution.mjs"),
  "utf8",
);

function sourceBetween(startMarker, endMarker) {
  const start = runnerSource.indexOf(startMarker);
  const end = runnerSource.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `${startMarker} must remain extractable`);
  return runnerSource.slice(start, end).replace(/^export\s+/gmu, "");
}

function loadPresentationClassifier() {
  const source = sourceBetween(
    "function buildCapabilityInvocationPresentation(",
    "\nfunction buildVisibleMetaTheorySurfacePacket(",
  );
  return new Function(
    "getGovernedRunSurfaceLabels",
    `${source}; return buildCapabilityInvocationPresentation;`,
  )(getGovernedRunSurfaceLabels);
}

function loadRuntimeInvocationPlanner() {
  const source = sourceBetween(
    "export function exactInvocationBindingMatches(",
    "\nfunction hostInvocationActionForFamily(",
  );
  return ({ requiredBindings, evidence }) =>
    new Function(
      "normalizeHostInvocationEvidence",
      "buildSelectedInvocationBindings",
      `${source}; return buildRuntimeInvocationPlanPacket;`,
    )(
      () => evidence,
      () => requiredBindings,
    );
}

function loadCapabilityLedgerBuilder() {
  const source = sourceBetween(
    "function buildCapabilityLedgerPacket(",
    "\nfunction buildVisibleMetaTheorySurfacePacket(",
  );
  const stateMatch = runnerSource.match(
    /const CAPABILITY_INVOCATION_STATES = (\[[\s\S]*?\]);/u,
  );
  assert.ok(stateMatch, "capability invocation state taxonomy must remain readable");
  const states = new Function(`return ${stateMatch[1]};`)();
  const uniqueStrings = (items) => [
    ...new Set(items.filter(Boolean).map((item) => String(item))),
  ];
  return new Function(
    "getGovernedRunSurfaceLabels",
    "uniqueStrings",
    "CAPABILITY_INVOCATION_STATES",
    `${source}; return buildCapabilityLedgerPacket;`,
  )(getGovernedRunSurfaceLabels, uniqueStrings, states);
}

test("a successful non-Agent command contributes to the primary user summary", () => {
  const classify = loadPresentationClassifier();
  const command = {
    family: "command_script",
    bindingRef: "task-command:command_script:setup",
    providerId: "setup",
  };
  const result = classify({
    capabilityInvocationTruthPacket: {
      rows: [
        { family: "agent_subagent", state: "not_required", selectedCount: 0, invokedCount: 0 },
        { family: "app_visible_subagent", state: "not_required", selectedCount: 0 },
        { family: "command_script", state: "invoked", selectedCount: 1, invokedCount: 1 },
      ],
      realInvocationCoverage: {
        status: "pass",
        requiredBindings: [command],
        invokedBindings: [command],
        failedBindings: [],
        missingBindings: [],
      },
    },
    runtimeSubagentInvocationPacket: { status: "not_required" },
    outputLanguage: "zh-CN",
  });

  assert.ok(["called", "completed"].includes(result.executionState));
  assert.equal(result.evidenceBoundary.successfulBindingCount, 1);
  assert.doesNotMatch(result.userSummary, /尚未关联到成功|没有成功的调用结果/u);
});

test("failed Skill, MCP, Command, runtime tool, and Hook bindings remain explicit failures", () => {
  const families = ["skill", "mcp", "command_script", "runtime_tool", "hook"];
  const requiredBindings = families.map((family) => ({
    family,
    providerId: `${family}-provider`,
    bindingRef: `task-failure:${family}:${family}-provider`,
    taskPacketId: "task-failure",
    source: "project_runtime_inventory",
    sourceRef: `.meta-kim/${family}-provider`,
  }));
  const evidence = requiredBindings.map((binding) => ({
    ...binding,
    state: "failed",
    resultStatus: "failed",
    passEligible: false,
    rejectionReason: "host call returned a failure result",
  }));
  const buildPlan = loadRuntimeInvocationPlanner();
  const plan = buildPlan({ requiredBindings, evidence })({
    dynamicWorkflowRuntimePacket: { capabilityBindingRows: [] },
    agentTeamsPlaybookPacket: null,
    runtimeSubagentInvocationPacket: { status: "not_required" },
    capabilityInvocationProbePacket: { requiredFamilies: families },
    hostInvocationEvidence: evidence,
    runId: "failed-capability-run",
  });

  assert.deepEqual(
    new Set((plan.failedBindings ?? []).map((binding) => binding.family)),
    new Set(families),
  );

  const buildLedger = loadCapabilityLedgerBuilder();
  const ledger = buildLedger({
    capabilityInvocationTruthPacket: {
      rows: families.map((family) => ({
        family,
        state: "failed",
        selectedCount: 1,
        invokedCount: 0,
        truthBoundary: "The exact host call returned a failure result.",
      })),
    },
    runtimeInvocationPlanPacket: {
      requiredBindings,
      failedBindings: plan.failedBindings,
    },
    projectCustomizationPacket: {
      decision: "use_global_directly",
      userSummary: "No project copy is required.",
    },
    outputLanguage: "zh-CN",
  });

  for (const family of families) {
    const row = ledger.families.find((candidate) => candidate.family === family);
    assert.equal(row?.state, "failed", family);
    assert.match(row?.stateLabel ?? "", /失败/u, family);
    assert.doesNotMatch(row?.displayLine ?? "", /已选中，但尚未实际调用/u, family);
  }
});

test("run-scoped and native Agent bindings have different plain-language chat lines", () => {
  const buildLedger = loadCapabilityLedgerBuilder();
  const build = (ownerBindingMode, nativeAgentType) => buildLedger({
    capabilityInvocationTruthPacket: {
      rows: [{
        family: "agent_subagent",
        state: "invoked",
        selectedCount: 1,
        invokedCount: 1,
        truthBoundary: "The exact host result returned.",
      }],
    },
    runtimeInvocationPlanPacket: {
      requiredBindings: [{
        family: "agent_subagent",
        providerId: "search-specialist",
        bindingRef: "task-agent:agent_subagent:search-specialist",
        source: "local_global_agent_inventory",
        sourceRef: "~/.codex/agents/search-specialist.toml",
        ownerBindingMode,
        nativeAgentType,
      }],
    },
    projectCustomizationPacket: {
      decision: "use_global_directly",
      userSummary: "No project copy is required.",
    },
    outputLanguage: "zh-CN",
  }).families.find((family) => family.family === "agent_subagent");

  const runScoped = build("run_scoped_owner_contract", null);
  const native = build("native_custom_agent", "search-specialist");

  assert.notEqual(runScoped.displayLine, native.displayLine);
  assert.match(runScoped.displayLine, /运行级|运行范围|不是.*原生|非宿主原生/u);
  assert.match(native.displayLine, /宿主原生|原生自定义/u);
  assert.doesNotMatch(runScoped.displayLine, /已加载宿主原生自定义/u);
});
