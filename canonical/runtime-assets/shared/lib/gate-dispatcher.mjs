/**
 * gate-dispatcher.mjs
 *
 * Abstraction: GateDispatcher
 * Purpose: Pure function mapping severity rule + context to gate decision.
 *
 * Implements user decisions:
 *   Q2 - 4-tier severity model (required-strict / required-warn / not_applicable_with_reason / off)
 *
 * Ironclad rules served:
 *   - No hardcoding: severity levels read from rule input
 *   - No compromise: not_applicable_with_reason requires explicit reason or it blocks
 *   - Best-practice case: OpenAPI 3.1 discriminator.mapping
 */

const KNOWN_DECISIONS = Object.freeze(['pass', 'warn', 'block', 'skip']);

export function dispatchGate(severityRule, context = {}) {
  if (!severityRule || typeof severityRule !== 'object') {
    return Object.freeze({
      decision: 'block',
      evidence: {
        reason: 'invalid_rule',
        rule: severityRule ?? null,
        context: { ...context }
      }
    });
  }

  const severity = severityRule.severity;
  const requirementMet = Boolean(context.requirementMet);
  const reasonProvided = typeof context.skipReason === 'string' && context.skipReason.trim().length > 0;

  if (severity === 'off') {
    return decide('pass', 'severity_off', severityRule, context);
  }

  if (severity === 'required-strict') {
    return requirementMet
      ? decide('pass', 'requirement_met', severityRule, context)
      : decide('block', 'strict_requirement_not_met', severityRule, context);
  }

  if (severity === 'required-warn') {
    return requirementMet
      ? decide('pass', 'requirement_met', severityRule, context)
      : decide('warn', 'warn_requirement_not_met_but_continue', severityRule, context);
  }

  if (severity === 'not_applicable_with_reason') {
    if (requirementMet) {
      return decide('pass', 'requirement_met', severityRule, context);
    }
    if (reasonProvided) {
      return decide('skip', 'skipped_with_reason', severityRule, context);
    }
    return decide('block', 'skip_attempt_without_reason', severityRule, context);
  }

  return decide('block', 'unknown_severity_level', severityRule, context);
}

function decide(decision, reason, rule, context) {
  if (!KNOWN_DECISIONS.includes(decision)) {
    return Object.freeze({
      decision: 'block',
      evidence: {
        reason: 'internal_unknown_decision',
        attempted: decision,
        rule,
        context: { ...context }
      }
    });
  }
  return Object.freeze({
    decision,
    evidence: {
      reason,
      rule,
      context: { ...context }
    }
  });
}

export function dispatchProfileGates(profileRules, contextByRuleId) {
  if (!Array.isArray(profileRules)) {
    return Object.freeze({
      decision: 'block',
      perRule: [],
      reason: 'profile_rules_not_array'
    });
  }
  const perRule = [];
  let worst = 'pass';
  const order = { pass: 0, skip: 1, warn: 2, block: 3 };
  for (const rule of profileRules) {
    const ctx = (contextByRuleId && contextByRuleId[rule.id]) || {};
    const outcome = dispatchGate(rule, ctx);
    perRule.push({ ruleId: rule.id, ...outcome });
    if (order[outcome.decision] > order[worst]) worst = outcome.decision;
  }
  return Object.freeze({
    decision: worst,
    perRule: Object.freeze(perRule),
    reason: `aggregate_${worst}`
  });
}
