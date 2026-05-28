# Validation Contract Design Document

**Version**: 1.0.0
**Status**: Draft
**Authors**: Meta_Kim Governance Team
**Closes**: EB-005, EB-008, EB-004

## 1. Problem Statement

Currently, 60% of validation rules are **hardcoded in agent prompts**:

1. **High maintenance cost**: Rule changes require editing multiple agent definitions
2. **Token overhead**: Every agent repeats validation rules in their context
3. **Untestable**: Validation logic lives in prompts, not executable code
4. **Inconsistency**: Different agents may have slightly different rule interpretations
5. **No single source of truth**: Rules scattered across `meta-prism.md`, `workflow-contract.json`, agent prompts, and validator scripts

## 2. Solution: Declarative Validation Contract

Extract validation rules into a **single JSON contract** that:

- Defines rules declaratively with conditions and error messages
- Supports multi-language error messages
- Enables automated validation without LLM involvement
- Provides clear extension mechanism for new rules
- Maintains backward compatibility with existing validators

## 3. Contract Structure

### 3.1 Root Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://meta-kim.dev/contracts/validation-contract.schema.json",
  "title": "Meta_Kim Validation Contract",
  "version": "1.0.0",
  "ruleRegistry": { ... },
  "errorMessages": { ... },
  "severityLevels": { ... },
  "ruleCategories": { ... },
  "extensionMechanism": { ... },
  "validatorBindings": { ... }
}
```

### 3.2 Rule Definition

Each rule in `ruleRegistry.rules` contains:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (e.g., "EB-005-fabricated-verification") |
| `severity` | enum | "critical", "high", "medium", "low" |
| `category` | string | Grouping (evidence-integrity, protocol-compliance, etc.) |
| `source` | string | Origin document/agent |
| `condition` | object | Validation condition definition |
| `errorMessageKey` | string | Key in `errorMessages.messages` |
| `fixAction` | string | Human-readable fix instruction |

### 3.3 Condition Types

| Type | Purpose | Example |
|------|---------|---------|
| `field-array-check` | Validate array elements | Check all `workerExecutionEvidence` entries |
| `enum-value` | Check allowed values | `successMarkerFormat` must be in enum |
| `structural` | Check structure | No nested `preDecisionOptionFrame` |
| `pattern-scan` | Regex forbidden patterns | Detect hardcoded values |
| `duplication-check` | Find duplicate definitions | Single source principle |
| `required-fields` | Ensure field presence | `dispatchEnvelopePacket` completeness |
| `format-check` | Regex validation | `roleDisplayName` format |
| `coverage-check` | List coverage | `fileCompletionList` covers `scopeFiles` |
| `conditional-required` | Trigger-based requirement | `capabilityGapPacket` when owner creation needed |
| `json-parseable` | Valid JSON check | `actualOutput` is parseable JSON |

## 4. Example Rules

### 4.1 EB-005: Fabricated Verification Claim

**Problem**: Workers report "20/20 tests pass" without evidence.

**Rule**:
```json
{
  "id": "EB-005-fabricated-verification",
  "severity": "critical",
  "category": "evidence-integrity",
  "condition": {
    "type": "field-array-check",
    "targetField": "workerExecutionEvidence",
    "predicate": "all",
    "checks": [
      {
        "field": "status",
        "operator": "eq",
        "value": "verified"
      },
      {
        "type": "conditional",
        "condition": {
          "field": "successMarkerFormat",
          "operator": "eq",
          "value": "stdout-text"
        },
        "then": {
          "field": "actualOutput",
          "operator": "notEmpty"
        }
      }
    ]
  }
}
```

**Enforcement**: 
- `validate-run-artifact.mjs`: Narrative tier (current)
- `meta-prism` Decision Rule 16: Review stage
- Future: Automated validator in v2.4.0-R8

### 4.2 EB-008: Silent Success Ambiguity

**Problem**: Cannot distinguish silent-success commands (`node --check`) from fabricated empty evidence.

**Rule**:
```json
{
  "id": "EB-008-silent-success-ambiguity",
  "severity": "high",
  "condition": {
    "type": "enum-value",
    "targetField": "workerExecutionEvidence[*].successMarkerFormat",
    "allowedValues": ["stdout-text", "exit-code-only", "json-output"]
  }
}
```

**Key Innovation**: `successMarkerFormat` enum explicitly declares how commands signal success, eliminating ambiguity.

### 4.3 EB-004: Nested Pre-Decision Frame

**Problem**: `choiceSurfaceState` duplicated in spine state and `preDecisionOptionFrame`.

**Rule**:
```json
{
  "id": "EB-004-nested-pre-decision-frame",
  "severity": "low",
  "condition": {
    "type": "structural",
    "check": "no-nested-choice-surface",
    "canonicalLocation": "spine.state.choiceSurfaceState"
  }
}
```

**Enforcement**: `scripts/migrate-spine-state-eb004.mjs` migration helper.

## 5. Multi-Language Error Messages

Error messages support localization via `errorMessages.messages`:

```json
{
  "EB-005-fabricated-verification": {
    "en-US": "Fabricated verification claim detected. Command: {command}",
    "zh-CN": "检测到伪造验证声明。命令：{command}",
    "technical": "workerExecutionEvidence missing entry with command='{command}'"
  }
}
```

**Message Types**:
- `en-US` / `zh-CN`: User-facing natural language
- `technical`: Precise technical description for developers

## 6. Extension Mechanism

New rules added without modifying core contract:

1. Create `config/contracts/validation-rules/{rule-id}.json`
2. Follow `extensionMechanism.ruleFileSchema`
3. Register in `ruleRegistry.rules` (or auto-discovery)

**Example extension**:
```json
{
  "ruleId": "PRIN-03-layering-violation",
  "severity": "medium",
  "category": "principle-violation",
  "condition": {
    "type": "pattern-scan",
    "forbiddenPatterns": [
      {
        "pattern": "import.*from.*infrastructure/.*db",
        "description": "Domain layer importing from infrastructure",
        "allowedContexts": ["repository-implementation", "data-mapper"]
      }
    ]
  },
  "errorMessageKey": "PRIN-03-layering-violation"
}
```

## 7. Validator Bindings

| Validator | Type | Enforces | Phase |
|-----------|------|----------|-------|
| `validate-run-artifact.mjs` | Script | EB-005, EB-008, file-completion-list | Artifact validation |
| `meta-prism` | Agent | All principle violations, evidence rules | Review stage |
| `enforce-agent-dispatch.mjs` | Hook | Dispatch envelope, role naming | Pre-dispatch |
| `migrate-spine-state-eb004.mjs` | Script | EB-004 normalization | Migration helper |

## 8. Migration Path

### Phase 1: Contract Creation (v2.4.0)
- [x] Create `validation-contract.json`
- [x] Document rule schema
- [x] Define EB-005/EB-008/EB-004 rules

### Phase 2: Rule Migration (v2.4.0)
- [ ] Migrate `meta-prism.md` Decision Rules to contract
- [ ] Migrate `workflow-contract.json` validation rules
- [ ] Update `validate-run-artifact.mjs` to read from contract

### Phase 3: Testing Framework (v2.4.1)
- [ ] Create `tests/contract/validation-rules.test.mjs`
- [ ] Add rule coverage tests
- [ ] Add rule execution tests

### Phase 4: Runtime Enforcement (v2.5.0)
- [ ] Hook-based rule enforcement
- [ ] Real-time validation during workflow
- [ ] Rule violation telemetry

## 9. Benefits

| Before | After |
|--------|-------|
| Rules in 10+ agent prompts | Single contract file |
| Edit 5 files to change 1 rule | Edit 1 rule definition |
| Cannot test without LLM | Unit testable conditions |
| Inconsistent enforcement | Consistent across validators |
| No extension mechanism | Drop-in rule files |

## 10. Appendix: Rule Catalog

| Rule ID | Category | Severity | Status |
|---------|----------|----------|--------|
| EB-005-fabricated-verification | evidence-integrity | critical | Migrated |
| EB-008-silent-success-ambiguity | evidence-integrity | high | Migrated |
| EB-004-nested-pre-decision-frame | protocol-compliance | low | Migrated |
| PRIN-01-configurable | principle-violation | medium | Draft |
| PRIN-02-single-source | principle-violation | medium | Draft |
| dispatch-envelope-completeness | protocol-compliance | high | Draft |
| role-display-name-business-readable | naming-convention | medium | Draft |
| worker-task-file-completion-list | evidence-integrity | high | Migrated |
| capability-gap-packet-required | protocol-compliance | high | Draft |

## 11. References

- `workflow-contract.json`: Protocol definitions
- `meta-prism.md`: Decision Rules 1-18
- `validate-run-artifact.mjs`: Current validator implementation
- `CHANGELOG.md`: EB-005 (v2.2.5), EB-008 (v2.3.0), EB-004 (v2.3.0)
