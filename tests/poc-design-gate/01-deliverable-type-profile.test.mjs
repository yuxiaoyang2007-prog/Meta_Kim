/**
 * 01-deliverable-type-profile.test.mjs
 * Verifies DeliverableTypeProfile module against user decisions Q1 + Q4.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  loadDeliverableTypeProfiles,
  resolveProfile,
  inferDeliverableTypeFromWorkType
} from '../../canonical/runtime-assets/shared/lib/deliverable-type-profile.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '../../config/contracts/deliverable-type-profiles.json');

test('loadDeliverableTypeProfiles: loads all 5 standard profiles', () => {
  const { profiles, errors } = loadDeliverableTypeProfiles(CONFIG_PATH);
  assert.equal(errors.length, 0, `unexpected errors: ${JSON.stringify(errors)}`);
  assert.equal(profiles.size, 5);
  for (const t of ['code_implementation', 'documentation', 'governance_contract', 'config_change', 'audit_readonly']) {
    assert.ok(profiles.has(t), `missing profile ${t}`);
  }
});

test('loadDeliverableTypeProfiles: returns errors for missing file', () => {
  const { profiles, errors } = loadDeliverableTypeProfiles('/nonexistent/path.json');
  assert.equal(profiles.size, 0);
  assert.ok(errors.length > 0);
  assert.equal(errors[0].kind, 'read_error');
});

test('Q1 decision: resolveProfile for unknown type returns isUnknown=true', () => {
  const { profiles } = loadDeliverableTypeProfiles(CONFIG_PATH);
  const result = resolveProfile(profiles, 'mystery_deliverable_type');
  assert.equal(result.isUnknown, true);
  assert.equal(result.profile, null);
  assert.equal(result.requiresIntentClarification, true);
  assert.equal(result.fallbackReason, 'unknown_type_requires_user_intent');
  assert.ok(Array.isArray(result.knownTypes));
  assert.ok(result.knownTypes.length >= 5);
});

test('Q1 decision: resolveProfile for missing input returns isUnknown=true', () => {
  const { profiles } = loadDeliverableTypeProfiles(CONFIG_PATH);
  const result = resolveProfile(profiles, null);
  assert.equal(result.isUnknown, true);
  assert.equal(result.requiresIntentClarification, true);
});

test('resolveProfile for known type returns profile + flags', () => {
  const { profiles } = loadDeliverableTypeProfiles(CONFIG_PATH);
  const result = resolveProfile(profiles, 'code_implementation');
  assert.equal(result.isUnknown, false);
  assert.equal(result.requiresIntentClarification, false);
  assert.ok(result.profile);
  assert.equal(result.profile.type, 'code_implementation');
});

test('Q4 decision: infer returns confidence + candidates (high signal)', () => {
  const { profiles } = loadDeliverableTypeProfiles(CONFIG_PATH);
  const result = inferDeliverableTypeFromWorkType(
    'implement new feature in src/components/Button.tsx',
    { fileExtensions: ['.tsx'], pathPatterns: ['src/'] },
    profiles
  );
  assert.equal(result.inferred, 'code_implementation');
  assert.ok(['high', 'medium'].includes(result.confidence));
  assert.ok(result.candidates.length > 0);
});

test('Q4 decision: infer with ambiguous input requires confirmation', () => {
  const { profiles } = loadDeliverableTypeProfiles(CONFIG_PATH);
  const result = inferDeliverableTypeFromWorkType('xyzzy nothingburger', {}, profiles);
  assert.equal(result.confidence, 'low');
  assert.equal(result.inferred, null);
});

test('Q4 decision: documentation inference picks documentation profile', () => {
  const { profiles } = loadDeliverableTypeProfiles(CONFIG_PATH);
  const result = inferDeliverableTypeFromWorkType('write documentation guide', {
    fileExtensions: ['.md'],
    pathPatterns: ['docs/'],
    description: 'tutorial'
  }, profiles);
  assert.equal(result.inferred, 'documentation');
});

test('Q4 decision: infer with empty profiles returns low confidence', () => {
  const result = inferDeliverableTypeFromWorkType('implement', {}, new Map());
  assert.equal(result.confidence, 'low');
  assert.equal(result.inferred, null);
  assert.equal(result.reason, 'no_profiles_loaded');
});
