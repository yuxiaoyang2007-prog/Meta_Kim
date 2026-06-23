import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  gateDecision,
  processEvolutionPacket,
  validateFiveCriteria,
  validatePrinStPrinciples,
} from "../../scripts/evolution-writeback-gate.mjs";

describe("evolution writeback gate", () => {
  test("approves a valid writeback packet", async () => {
    const packet = {
      writebackDecision: "writeback",
      decisionReason: "durable pattern should be captured",
      writebacks: ["meta-warden"],
      signalSummary: { totalSignals: 1 },
    };

    const five = await validateFiveCriteria(packet);
    const prin = await validatePrinStPrinciples(packet);
    const decision = await gateDecision(packet);

    assert.equal(five.all, true);
    assert.equal(prin.all, true);
    assert.equal(decision.decision, "approve");
    assert.equal(decision.riskLevel, "low");
  });

  test("accepts none-with-reason as a no-writeback closure", async () => {
    const packet = {
      writebackDecision: "none-with-reason",
      decisionReason: "one-off run; no reusable governance pattern",
      writebacks: [],
      signalSummary: { totalSignals: 0 },
    };

    const decision = await processEvolutionPacket(packet);

    assert.equal(decision.decision, "approve");
    assert.equal(decision.noWriteback, true);
    assert.equal(decision.fiveCriteria.all, true);
    assert.equal(decision.prinSt.all, true);
  });

  test("rejects no-writeback decisions that still include writeback targets", async () => {
    const packet = {
      writebackDecision: "none-with-reason",
      decisionReason: "one-off run; no reusable governance pattern",
      writebacks: ["meta-warden"],
      signalSummary: { totalSignals: 0 },
    };

    const five = await validateFiveCriteria(packet);
    const decision = await gateDecision(packet);

    assert.equal(five.all, false);
    assert.equal(five.independent.pass, false);
    assert.equal(five.clearBoundaries.pass, false);
    assert.equal(decision.decision, "reject");
    assert.equal(decision.riskLevel, "high");
    assert.match(decision.reason, /No-writeback decisions cannot include writeback targets/u);
    await assert.rejects(
      processEvolutionPacket(packet),
      /No-writeback decisions cannot include writeback targets/u
    );
  });

  test("rejects self-evolution writebacks even when target is object-shaped", async () => {
    const packet = {
      writebackDecision: "writeback",
      decisionReason: "self evolution should not be allowed",
      writebacks: [{ target: "meta-chrysalis" }],
      signalSummary: { totalSignals: 1 },
    };

    const decision = await gateDecision(packet);

    assert.equal(decision.decision, "reject");
    assert.equal(decision.riskLevel, "critical");
    assert.equal(decision.recursiveRisk.selfEvolution.detected, true);
  });

  test("escalates duplicate writeback targets", async () => {
    const packet = {
      writebackDecision: "writeback",
      decisionReason: "duplicate targets should be merged first",
      writebacks: ["meta-warden", { target: "meta-warden" }],
      signalSummary: { totalSignals: 2 },
    };

    const decision = await gateDecision(packet);

    assert.equal(decision.decision, "escalate");
    assert.equal(decision.prinSt.prinSt02.pass, false);
  });
});
