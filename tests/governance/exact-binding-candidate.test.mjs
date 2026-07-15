import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildExactBindingCandidate } from "../../scripts/live-acceptance/build-exact-binding-candidate.mjs";

const runId = "clean-room-claude-fixture-001";
const required = {
  family: "agent_subagent",
  providerId: "meta-prism",
  bindingRef: "task-1:agent_subagent:meta-prism",
  taskPacketId: "task-1",
  ownerBindingMode: "run_scoped_owner_contract",
  nativeAgentType: null,
};
const artifact = {
  runId,
  coreLoop: { runtimeInvocationPlanPacket: { requiredBindings: [required] } },
  workerTaskPackets: [{ taskPacketId: "task-1", roleInstanceId: "review-1" }],
};
const event = {
  ...required,
  roleInstanceId: "review-1",
  runId,
  eventId: "tool-call-1",
  sessionId: "session-1",
  occurredAt: "2026-07-12T00:00:00.000Z",
  resultStatus: "completed",
  evidenceKind: "agent_task_result",
  observerFormat: "claude_stream_json_v1",
  hostSurface: "Task",
};

function build(overrides = {}) {
  return buildExactBindingCandidate({
    governedArtifact: overrides.governedArtifact ?? artifact,
    observation: overrides.observation ?? { runId, events: [event] },
    governedArtifactPath: "C:/bundle/run.json",
    observationPath: "C:/bundle/observed.json",
    rawObservationPath: "C:/bundle/raw.jsonl",
    governedArtifactSha256: "a".repeat(64),
    observationSha256: "b".repeat(64),
    rawObservationSha256: "c".repeat(64),
    bundleRoot: "C:/bundle",
  });
}

describe("exact binding unsigned candidate", () => {
  test("builds deterministic bundle-relative candidate without attestation claims", () => {
    const first = build();
    const second = build();
    assert.deepEqual(first, second);
    assert.equal(first.status, "unsigned_candidate");
    assert.equal(first.promotionEligible, false);
    assert.equal(first.releaseAttested, false);
    assert.equal(first.attestation, undefined);
    assert.deepEqual(first.sourceArtifacts.governedArtifact, {
      path: "run.json",
      sha256: "a".repeat(64),
    });
    assert.equal(first.observedBindings[0].providerId, "meta-prism");
    assert.equal(first.observedBindings[0].roleInstanceId, "review-1");
    assert.equal(first.requiredBindings[0].ownerBindingMode, "run_scoped_owner_contract");
    assert.equal(first.requiredBindings[0].nativeAgentType, null);
    assert.equal(first.observedBindings[0].ownerBindingMode, "run_scoped_owner_contract");
    assert.equal(first.observedBindings[0].nativeAgentType, null);
    assert.deepEqual(first.sourceArtifacts.rawHostJsonl, {
      path: "raw.jsonl",
      sha256: "c".repeat(64),
    });
  });

  test("rejects run-scoped Agent evidence for a native custom Agent requirement", () => {
    const nativeRequired = {
      ...required,
      ownerBindingMode: "native_custom_agent",
      nativeAgentType: "meta-prism",
    };
    const nativeArtifact = {
      ...artifact,
      coreLoop: { runtimeInvocationPlanPacket: { requiredBindings: [nativeRequired] } },
    };
    const runScopedEvent = {
      ...event,
      ownerBindingMode: "run_scoped_owner_contract",
      nativeAgentType: null,
    };
    const nativeCandidate = build({
      governedArtifact: nativeArtifact,
      observation: {
        runId,
        events: [{
          ...event,
          ownerBindingMode: "native_custom_agent",
          nativeAgentType: "meta-prism",
        }],
      },
    });
    assert.equal(nativeCandidate.requiredBindings[0].ownerBindingMode, "native_custom_agent");
    assert.equal(nativeCandidate.observedBindings[0].nativeAgentType, "meta-prism");
    assert.throws(
      () => build({
        governedArtifact: nativeArtifact,
        observation: { runId, events: [runScopedEvent] },
      }),
      /unselected_or_mismatched_binding|owner_binding_mode_mismatch/,
    );
  });

  test("fails closed on missing, duplicate, provider, task, role, result, and run mismatches", () => {
    assert.throws(() => build({ observation: { runId, events: [] } }), /exact_binding_match_count/);
    assert.throws(() => build({ observation: { runId, events: [event, { ...event, eventId: "tool-call-2" }] } }), /exact_binding_match_count/);
    assert.throws(() => build({ observation: { runId, events: [{ ...event, providerId: "meta-warden" }] } }), /observed_provider_mismatch|unselected_or_mismatched/);
    assert.throws(() => build({ observation: { runId, events: [{ ...event, taskPacketId: "task-2" }] } }), /observed_task_mismatch/);
    assert.throws(() => build({ observation: { runId, events: [{ ...event, roleInstanceId: "review-2" }] } }), /observed_role_mismatch/);
    assert.throws(() => build({ observation: { runId, events: [{ ...event, resultStatus: "failed" }] } }), /observed_result_not_successful/);
    assert.throws(() => build({ observation: { runId: "other-run", events: [event] } }), /run_id_mismatch/);
  });

  test("rejects unselected marked bindings and paths outside the evidence bundle", () => {
    const extra = {
      ...event,
      family: "runtime_tool",
      providerId: "shell_command",
      bindingRef: "unselected:runtime_tool:shell_command",
    };
    assert.throws(() => build({ observation: { runId, events: [event, extra] } }), /unselected_or_mismatched_binding/);
    assert.throws(
      () => buildExactBindingCandidate({
        governedArtifact: artifact,
        observation: { runId, events: [event] },
        governedArtifactPath: "C:/outside/run.json",
        observationPath: "C:/bundle/observed.json",
        rawObservationPath: "C:/bundle/raw.jsonl",
        governedArtifactSha256: "a".repeat(64),
        observationSha256: "b".repeat(64),
        rawObservationSha256: "c".repeat(64),
        bundleRoot: "C:/bundle",
      }),
      /below bundleRoot/,
    );
  });
});
