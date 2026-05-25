/**
 * 03-gate-dispatcher.test.mjs
 * Verifies GateDispatcher 4-level severity model (Q2).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchGate, dispatchProfileGates } from '../../canonical/runtime-assets/shared/lib/gate-dispatcher.mjs';

test('Q2: required-strict + not met -> block', () => {
  const result = dispatchGate({ severity: 'required-strict' }, { requirementMet: false });
  assert.equal(result.decision, 'block');
  assert.equal(result.evidence.reason, 'strict_requirement_not_met');
});

test('Q2: required-strict + met -> pass', () => {
  const result = dispatchGate({ severity: 'required-strict' }, { requirementMet: true });
  assert.equal(result.decision, 'pass');
});

test('Q2: required-warn + not met -> warn', () => {
  const result = dispatchGate({ severity: 'required-warn' }, { requirementMet: false });
  assert.equal(result.decision, 'warn');
});

test('Q2: required-warn + met -> pass', () => {
  const result = dispatchGate({ severity: 'required-warn' }, { requirementMet: true });
  assert.equal(result.decision, 'pass');
});

test('Q2: not_applicable_with_reason + reason -> skip', () => {
  const result = dispatchGate(
    { severity: 'not_applicable_with_reason' },
    { requirementMet: false, skipReason: 'docs do not need rollback' }
  );
  assert.equal(result.decision, 'skip');
});

test('Q2: not_applicable_with_reason + NO reason -> block', () => {
  const result = dispatchGate(
    { severity: 'not_applicable_with_reason' },
    { requirementMet: false }
  );
  assert.equal(result.decision, 'block');
});

test('Q2: not_applicable_with_reason + empty reason -> block', () => {
  const result = dispatchGate(
    { severity: 'not_applicable_with_reason' },
    { requirementMet: false, skipReason: '   ' }
  );
  assert.equal(result.decision, 'block');
});

test('Q2: off -> pass always', () => {
  assert.equal(dispatchGate({ severity: 'off' }, { requirementMet: false }).decision, 'pass');
  assert.equal(dispatchGate({ severity: 'off' }, { requirementMet: true }).decision, 'pass');
});

test('dispatchGate: invalid rule -> block', () => {
  const result = dispatchGate(null);
  assert.equal(result.decision, 'block');
});

test('dispatchGate: unknown severity -> block', () => {
  const result = dispatchGate({ severity: 'maybe' }, {});
  assert.equal(result.decision, 'block');
});

test('dispatchProfileGates: block dominates', () => {
  const rules = [
    { id: 'r1', severity: 'off' },
    { id: 'r2', severity: 'required-warn' },
    { id: 'r3', severity: 'required-strict' }
  ];
  const ctx = { r1: {}, r2: { requirementMet: false }, r3: { requirementMet: false } };
  const result = dispatchProfileGates(rules, ctx);
  assert.equal(result.decision, 'block');
  assert.equal(result.perRule.length, 3);
});

test('dispatchProfileGates: all-pass yields pass', () => {
  const rules = [
    { id: 'r1', severity: 'off' },
    { id: 'r2', severity: 'required-warn' }
  ];
  const ctx = { r1: {}, r2: { requirementMet: true } };
  assert.equal(dispatchProfileGates(rules, ctx).decision, 'pass');
});

test('dispatchProfileGates: warn dominates pass+skip', () => {
  const rules = [
    { id: 'r1', severity: 'off' },
    { id: 'r2', severity: 'not_applicable_with_reason' },
    { id: 'r3', severity: 'required-warn' }
  ];
  const ctx = {
    r1: {},
    r2: { requirementMet: false, skipReason: 'n/a' },
    r3: { requirementMet: false }
  };
  assert.equal(dispatchProfileGates(rules, ctx).decision, 'warn');
});

test('dispatchProfileGates: non-array input returns block', () => {
  assert.equal(dispatchProfileGates(null, {}).decision, 'block');
});
