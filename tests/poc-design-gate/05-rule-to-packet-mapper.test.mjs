/**
 * 05-rule-to-packet-mapper.test.mjs
 *
 * Verifies:
 *   H1 - Rule-ID to packet-name mapper added to deliverable-type-profiles contract
 *        and exposed via `resolvePacketName(registry, ruleId)` helper.
 *   H3 - `inferDeliverableTypeFromWorkType` consumes contract-driven confidence
 *        thresholds via a normalized [0,1] ratio (backwards compatible: optional
 *        4th parameter, falls back to v2.2.0 defaults).
 *
 * References:
 *   - docs/v2.2.0-prism-review.md findings H1 and H3
 *   - config/contracts/deliverable-type-profiles.json#ruleToPacketMap (schemaVersion 1.1.0)
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  createRegistryFromContract,
  resolvePacketName
} from '../../canonical/runtime-assets/shared/lib/policy-registry.mjs';
import {
  loadDeliverableTypeProfiles,
  inferDeliverableTypeFromWorkType
} from '../../canonical/runtime-assets/shared/lib/deliverable-type-profile.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACT_PATH = resolve(__dirname, '../../config/contracts/deliverable-type-profiles.json');
const WORKFLOW_CONTRACT_PATH = resolve(__dirname, '../../config/contracts/workflow-contract.json');

const profilesConfig = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));
const workflowContract = JSON.parse(readFileSync(WORKFLOW_CONTRACT_PATH, 'utf8'));

describe('H1: Rule-ID to Packet-Name Mapper', () => {
  it('contract declares ruleToPacketMap block', () => {
    assert.ok(profilesConfig.ruleToPacketMap, 'ruleToPacketMap block must exist');
    assert.equal(typeof profilesConfig.ruleToPacketMap.mappings, 'object');
    assert.equal(profilesConfig.ruleToPacketMap.unmappedRulePolicy, 'fallback_to_rule_id');
  });

  it('contract bumped to schemaVersion 1.1.0', () => {
    assert.equal(profilesConfig.schemaVersion, '1.1.0');
  });

  it('all 7 core rule IDs are mapped to *Packet names', () => {
    const expected = [
      'testStrategyDefined',
      'rollbackPlanDefined',
      'structureHygiene',
      'interfaceContract',
      'sideEffectLedger',
      'permissionMatrix',
      'linkValidation'
    ];
    for (const ruleId of expected) {
      const mapped = profilesConfig.ruleToPacketMap.mappings[ruleId];
      assert.ok(mapped, `${ruleId} must have a mapping entry`);
      assert.ok(mapped.endsWith('Packet'), `${ruleId} -> ${mapped} must end with "Packet"`);
    }
  });

  it('resolvePacketName returns mapped packet for known rule ID', () => {
    const registry = createRegistryFromContract({
      workflowContract,
      deliverableTypeProfilesConfig: profilesConfig
    });
    assert.equal(resolvePacketName(registry, 'testStrategyDefined'), 'testStrategyPacket');
    assert.equal(resolvePacketName(registry, 'rollbackPlanDefined'), 'rollbackPlanPacket');
    assert.equal(resolvePacketName(registry, 'linkValidation'), 'linkValidationPacket');
  });

  it('resolvePacketName fallback returns rule ID when unmapped (forward-compatible)', () => {
    const registry = createRegistryFromContract({
      workflowContract,
      deliverableTypeProfilesConfig: profilesConfig
    });
    assert.equal(resolvePacketName(registry, 'someNewRuleNotYetMapped'), 'someNewRuleNotYetMapped');
  });

  it('resolvePacketName returns null for invalid input', () => {
    const registry = createRegistryFromContract({
      workflowContract,
      deliverableTypeProfilesConfig: profilesConfig
    });
    assert.equal(resolvePacketName(registry, null), null);
    assert.equal(resolvePacketName(registry, ''), null);
    assert.equal(resolvePacketName(registry, 123), null);
    assert.equal(resolvePacketName(null, 'testStrategyDefined'), null);
    assert.equal(resolvePacketName(undefined, 'testStrategyDefined'), null);
  });

  it('resolvePacketName returns null when registry has no ruleToPacketMap', () => {
    const emptyRegistry = { ruleToPacketMap: null };
    assert.equal(resolvePacketName(emptyRegistry, 'testStrategyDefined'), null);
  });

  it('every rule in every profile.rules resolves to a packet name (mapping or fallback)', () => {
    const registry = createRegistryFromContract({
      workflowContract,
      deliverableTypeProfilesConfig: profilesConfig
    });
    for (const profile of profilesConfig.profiles) {
      for (const rule of profile.rules) {
        const packetName = resolvePacketName(registry, rule.id);
        assert.ok(packetName, `${profile.type} :: ${rule.id} must resolve to a packet name`);
        assert.equal(typeof packetName, 'string');
      }
    }
  });
});

describe('H3: Inference consumes contract confidence thresholds', () => {
  it('inferDeliverableTypeFromWorkType honors custom thresholds via 4th parameter', () => {
    const { profiles } = loadDeliverableTypeProfiles(CONTRACT_PATH);
    const customThresholds = {
      confidenceThresholds: { high: 0.5, medium: 0.3, low: 0.0 }
    };
    const result = inferDeliverableTypeFromWorkType(
      'implement new feature in src/components/Button.tsx',
      { fileExtensions: ['.tsx'], pathPatterns: ['src/'] },
      profiles,
      customThresholds
    );
    assert.ok(['high', 'medium', 'low'].includes(result.confidence));
    assert.equal(typeof result.ratio, 'number');
    assert.ok(result.ratio >= 0 && result.ratio <= 1, 'ratio must be in [0,1]');
    assert.deepEqual(result.thresholds, customThresholds.confidenceThresholds);
  });

  it('inferDeliverableTypeFromWorkType uses contract defaults when thresholds omitted', () => {
    const { profiles } = loadDeliverableTypeProfiles(CONTRACT_PATH);
    const result = inferDeliverableTypeFromWorkType(
      'implement new feature in src/components/Button.tsx',
      { fileExtensions: ['.tsx'], pathPatterns: ['src/'] },
      profiles
    );
    assert.equal(typeof result.ratio, 'number');
    assert.equal(result.thresholds.high, 0.85);
    assert.equal(result.thresholds.medium, 0.6);
    assert.equal(result.thresholds.low, 0.0);
  });

  it('custom low thresholds promote ambiguous input to medium/high', () => {
    const { profiles } = loadDeliverableTypeProfiles(CONTRACT_PATH);
    const permissiveThresholds = {
      confidenceThresholds: { high: 0.1, medium: 0.05, low: 0.0 }
    };
    const result = inferDeliverableTypeFromWorkType(
      'write a tutorial guide',
      { fileExtensions: ['.md'] },
      profiles,
      permissiveThresholds
    );
    assert.notEqual(result.confidence, 'low');
    assert.ok(['medium', 'high'].includes(result.confidence));
  });
});
