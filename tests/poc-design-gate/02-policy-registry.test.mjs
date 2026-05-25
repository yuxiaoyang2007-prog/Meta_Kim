/**
 * 02-policy-registry.test.mjs
 * Verifies PolicyRegistry behavior.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PolicyRegistry, createRegistryFromContract } from '../../canonical/runtime-assets/shared/lib/policy-registry.mjs';

test('PolicyRegistry: register and read', () => {
  const r = new PolicyRegistry();
  r.register('alpha', { value: 1 });
  assert.deepEqual(r.getPolicy('alpha'), { value: 1 });
});

test('PolicyRegistry: hasPolicy returns boolean', () => {
  const r = new PolicyRegistry();
  r.register('alpha', { value: 1 });
  assert.equal(r.hasPolicy('alpha'), true);
  assert.equal(r.hasPolicy('beta'), false);
});

test('PolicyRegistry: duplicate registration throws', () => {
  const r = new PolicyRegistry();
  r.register('alpha', { value: 1 });
  assert.throws(() => r.register('alpha', { value: 2 }), /Duplicate policy registration/);
});

test('PolicyRegistry: invalid policyName throws', () => {
  const r = new PolicyRegistry();
  assert.throws(() => r.register('', { value: 1 }), /non-empty string/);
  assert.throws(() => r.register(null, { value: 1 }), /non-empty string/);
});

test('PolicyRegistry: null policyDef throws', () => {
  const r = new PolicyRegistry();
  assert.throws(() => r.register('alpha', null), /must not be null/);
});

test('PolicyRegistry: freeze prevents further registration', () => {
  const r = new PolicyRegistry();
  r.register('alpha', { value: 1 });
  r.freeze();
  assert.equal(r.isFrozen(), true);
  assert.throws(() => r.register('beta', { value: 2 }), /frozen/);
});

test('PolicyRegistry: frozen registry still readable', () => {
  const r = new PolicyRegistry();
  r.register('alpha', { value: 1 });
  r.freeze();
  assert.deepEqual(r.getPolicy('alpha'), { value: 1 });
});

test('PolicyRegistry: listPolicies + filter', () => {
  const r = new PolicyRegistry();
  r.register('alpha', { type: 'A' });
  r.register('beta', { type: 'B' });
  r.register('gamma', { type: 'A' });
  const all = r.listPolicies();
  assert.equal(all.length, 3);
  const typeA = r.listPolicies((_n, def) => def.type === 'A');
  assert.equal(typeA.length, 2);
});

test('PolicyRegistry: describe returns snapshot', () => {
  const r = new PolicyRegistry().withSource('test');
  r.register('alpha', { value: 1 });
  r.freeze();
  const snap = r.describe();
  assert.equal(snap.size, 1);
  assert.equal(snap.frozen, true);
  assert.equal(snap.source, 'test');
});

test('createRegistryFromContract: bootstraps + freezes', () => {
  const registry = createRegistryFromContract({
    workflowContract: { stageRequirements: { critical: { mandatory: true } }, namingPolicy: { rule: 'kebab' } },
    deliverableTypeProfilesConfig: {
      defaultBehavior: { unknownType: 'require_user_intent_clarification' },
      severityModel: { levels: [{ name: 'off' }] },
      i18n: { v1Languages: ['zh', 'en', 'ja', 'ko'] },
      profiles: [{ type: 'documentation' }]
    }
  });
  assert.equal(registry.isFrozen(), true);
  assert.ok(registry.getPolicy('stageRequirements'));
  assert.ok(registry.getPolicy('defaultBehavior'));
  assert.ok(registry.getPolicy('i18n'));
});

test('PolicyRegistry: returns null for unknown policy', () => {
  const r = new PolicyRegistry();
  assert.equal(r.getPolicy('nope'), null);
});
