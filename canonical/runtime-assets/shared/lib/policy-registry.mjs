/**
 * policy-registry.mjs
 *
 * Abstraction: PolicyRegistry
 * Purpose: Single bootstrap-time loader of governance rules; runtime read-only.
 *
 * Implements user decisions:
 *   - serves all 4 decisions by being the single source of truth at runtime
 *
 * Ironclad rules served:
 *   - No hardcoding: rules registered from external contract
 *   - Best-practice case: Zod schema registry (compile-time build, runtime read-only)
 */

export class PolicyRegistry {
  #policies = new Map();
  #frozen = false;
  #metadata = { createdAt: new Date().toISOString(), source: null };

  register(policyName, policyDef) {
    if (this.#frozen) {
      throw new Error(`PolicyRegistry frozen: cannot register "${policyName}" after freeze()`);
    }
    if (typeof policyName !== 'string' || !policyName) {
      throw new Error('policyName must be a non-empty string');
    }
    if (this.#policies.has(policyName)) {
      throw new Error(`Duplicate policy registration: "${policyName}"`);
    }
    if (policyDef === undefined || policyDef === null) {
      throw new Error(`policyDef for "${policyName}" must not be null/undefined`);
    }
    this.#policies.set(policyName, Object.freeze({ ...policyDef }));
    return this;
  }

  freeze() {
    this.#frozen = true;
    return this;
  }

  isFrozen() {
    return this.#frozen;
  }

  getPolicy(policyName) {
    return this.#policies.get(policyName) ?? null;
  }

  hasPolicy(policyName) {
    return this.#policies.has(policyName);
  }

  listPolicies(filter) {
    const entries = Array.from(this.#policies.entries());
    if (typeof filter === 'function') {
      return entries.filter(([name, def]) => filter(name, def)).map(([name]) => name);
    }
    return entries.map(([name]) => name);
  }

  size() {
    return this.#policies.size;
  }

  withSource(source) {
    this.#metadata.source = source;
    return this;
  }

  describe() {
    return Object.freeze({
      size: this.#policies.size,
      frozen: this.#frozen,
      source: this.#metadata.source,
      createdAt: this.#metadata.createdAt,
      policies: this.listPolicies()
    });
  }
}

export function createRegistryFromContract({ workflowContract, deliverableTypeProfilesConfig }) {
  const registry = new PolicyRegistry().withSource('contract');

  if (workflowContract && typeof workflowContract === 'object') {
    if (workflowContract.stageRequirements) {
      registry.register('stageRequirements', workflowContract.stageRequirements);
    }
    if (workflowContract.packetStatusVocabulary) {
      registry.register('packetStatusVocabulary', workflowContract.packetStatusVocabulary);
    }
    if (workflowContract.allowedOwnerAgents) {
      registry.register('allowedOwnerAgents', workflowContract.allowedOwnerAgents);
    }
    if (workflowContract.namingPolicy) {
      registry.register('namingPolicy', workflowContract.namingPolicy);
    }
  }

  if (deliverableTypeProfilesConfig && typeof deliverableTypeProfilesConfig === 'object') {
    if (deliverableTypeProfilesConfig.defaultBehavior) {
      registry.register('defaultBehavior', deliverableTypeProfilesConfig.defaultBehavior);
    }
    if (deliverableTypeProfilesConfig.severityModel) {
      registry.register('severityModel', deliverableTypeProfilesConfig.severityModel);
    }
    if (deliverableTypeProfilesConfig.i18n) {
      registry.register('i18n', deliverableTypeProfilesConfig.i18n);
    }
    if (deliverableTypeProfilesConfig.inferenceStrategy) {
      registry.register('inferenceStrategy', deliverableTypeProfilesConfig.inferenceStrategy);
    }
    if (deliverableTypeProfilesConfig.intentLexicon) {
      registry.register('intentLexicon', deliverableTypeProfilesConfig.intentLexicon);
    }
    if (Array.isArray(deliverableTypeProfilesConfig.profiles)) {
      registry.register('deliverableTypeProfiles', deliverableTypeProfilesConfig.profiles);
    }
  }

  return registry.freeze();
}
