import test from "node:test";
import assert from "node:assert/strict";
import { evaluateFanoutGate } from "../../canonical/runtime-assets/claude/hooks/spine-state.mjs";

// Fan-out gate root-cause fix for "/meta-theory triggers but main thread
// self-executes without dispatching any Agent". The trigger condition is a pure
// function in spine-state.mjs so it can be unit-tested without spawning the
// full PreToolUse hook (which would require satisfying every upstream gate).
// The hook layer (enforce-agent-dispatch.mjs) maps triggered → block/warn via
// META_KIM_FANOUT_GATE; these tests cover the decision condition itself.

test("evaluateFanoutGate: triggered for execution + 0 dispatches + >=2 worker lanes + not degraded", () => {
  const r = evaluateFanoutGate({
    currentStage: "execution",
    dispatchedAgents: [],
    workerTaskPackets: [{ id: "w1" }, { id: "w2" }],
    degradedMode: false,
  });
  assert.equal(r.triggered, true);
  assert.equal(r.dispatched, 0);
  assert.equal(r.workerCount, 2);
  assert.equal(r.degraded, false);
  assert.ok(r.reason && r.reason.includes("0 recorded Agent dispatches"));
});

test("evaluateFanoutGate: not triggered once an Agent dispatch is recorded", () => {
  const r = evaluateFanoutGate({
    currentStage: "execution",
    dispatchedAgents: ["frontend-developer"],
    workerTaskPackets: [{ id: "w1" }, { id: "w2" }],
  });
  assert.equal(r.triggered, false);
  assert.equal(r.dispatched, 1);
  assert.equal(r.reason, null);
});

test("evaluateFanoutGate: not triggered when degraded is declared (auditable exit stays open)", () => {
  const r = evaluateFanoutGate({
    currentStage: "execution",
    dispatchedAgents: [],
    workerTaskPackets: [{ id: "w1" }, { id: "w2" }],
    degradedMode: true,
  });
  assert.equal(r.triggered, false);
  assert.equal(r.degraded, true);
  assert.equal(r.reason, null);
});

test("evaluateFanoutGate: not triggered for single-lane work (<2 worker lanes)", () => {
  const r0 = evaluateFanoutGate({
    currentStage: "execution",
    dispatchedAgents: [],
    workerTaskPackets: [],
  });
  assert.equal(r0.triggered, false);
  assert.equal(r0.workerCount, 0);

  const r1 = evaluateFanoutGate({
    currentStage: "execution",
    dispatchedAgents: [],
    workerTaskPackets: [{ id: "w1" }],
  });
  assert.equal(r1.triggered, false);
  assert.equal(r1.workerCount, 1);
});

test("evaluateFanoutGate: not triggered outside execution stage (design-time + post-execution)", () => {
  for (const stage of [
    "critical",
    "fetch",
    "thinking",
    "review",
    "meta-review",
    "verification",
    "evolution",
  ]) {
    const r = evaluateFanoutGate({
      currentStage: stage,
      dispatchedAgents: [],
      workerTaskPackets: [{ id: "w1" }, { id: "w2" }],
    });
    assert.equal(r.triggered, false, `stage "${stage}" must not trigger`);
  }
});

test("evaluateFanoutGate: null / missing state is safe and does not throw", () => {
  assert.equal(evaluateFanoutGate(null).triggered, false);
  assert.equal(evaluateFanoutGate(undefined).triggered, false);
  assert.equal(evaluateFanoutGate({}).triggered, false);
  assert.equal(evaluateFanoutGate({ currentStage: "execution" }).triggered, false);
});
