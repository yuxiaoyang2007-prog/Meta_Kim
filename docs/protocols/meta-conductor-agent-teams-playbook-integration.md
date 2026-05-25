# Meta-Conductor / Agent Teams Playbook Integration

This protocol defines how `meta-conductor` consumes the `agent-teams-playbook` provider output and converts it into Meta_Kim task-board packets.

The integration is intentionally **English-first** in durable repository files. Localized playbook output may still be parsed through Unicode-escaped compatibility regexes, but canonical examples, field names, and documentation stay English.

## 1. Integration Point

Stage 4 Execution is where the playbook is consulted, but Conductor must finish Critical, Fetch, and Thinking evidence first:

```text
Critical -> Fetch -> Thinking -> Agent Teams Playbook -> Dispatch Board -> Execution
```

The playbook does not replace Meta_Kim packets. It provides an orchestration suggestion that Conductor must normalize into:

- `businessFlowBlueprintPacket`
- `agentBlueprintPacket`
- `dispatchEnvelopePacket`
- `dispatchBoard`
- `workerTaskPackets`

## 2. Required Playbook Sections

### Scenario Decision

Canonical output:

```text
Selected scenario: Scenario 3 (Plan + Review)
```

Accepted canonical patterns:

- `Scenario 1`
- `Scenario 2`
- `Scenario 3`
- `Scenario 4`
- `Scenario 5`

Compatibility parser may also accept localized scenario labels through Unicode escapes.

### Team Blueprint

Canonical table:

```text
| ID | Role | Responsibility | Model | subagent_type | Skill/Type |
|----|------|----------------|-------|---------------|------------|
| 1 | backend | implement OAuth2 endpoints and JWT generation | sonnet | general-purpose | Type: general-purpose |
| 2 | security | audit authentication and token handling | opus | general-purpose | Type: general-purpose |
| 3 | database | design user tables and indexes | sonnet | general-purpose | Skill: supabase-admin-rls-auth-mismatch |
```

Parsing requirements:

| Field | Parser requirement | Example |
| --- | --- | --- |
| ID | row starts with `| 1 |`, `| 2 |`, etc. | `1` |
| Role | second table cell | `backend` |
| Responsibility | third table cell | `implement OAuth2 endpoints` |
| Model | `opus`, `sonnet`, or `haiku` | `sonnet` |
| subagent_type | `general-purpose` or `skill-based` | `general-purpose` |
| Skill/Type | `Skill: <name>` or `Type: general-purpose` | `Skill: supabase-admin-rls-auth-mismatch` |

### Dispatch Board

Canonical output:

```text
Collaboration mode: Subagent
Expected agent count: 3
Selected scenario: Scenario 3 (Plan + Review)
```

Accepted canonical collaboration modes:

- `Subagent`
- `Agent Team`

## 3. Strict Parser Shape

```javascript
function parseScenario(nlOutput) {
  const match =
    nlOutput.match(/Selected scenario[：:]\s*(Scenario\s*\d+)/i) ||
    nlOutput.match(/(Scenario\s*\d+)/i) ||
    nlOutput.match(/\u9009\u5b9a\u573a\u666f[：:]\s*(\u573a\u666f?\s*\d+)/i);

  if (!match) {
    throw new ParseError("SCENARIO_MISSING", "Cannot determine playbook scenario");
  }

  return normalizeScenario(match[1]);
}
```

```javascript
function parseTeamBlueprint(tableSection) {
  const rows = tableSection
    .split("\n")
    .filter((line) => line.match(/^\|\s*\d+\s*\|/));

  if (rows.length === 0) {
    throw new ParseError("BLUEPRINT_EMPTY", "No team blueprint rows found");
  }

  return rows.map((row) => {
    const cols = row.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cols.length !== 6) {
      throw new ParseError(
        "BLUEPRINT_COLUMN_MISMATCH",
        `Expected 6 columns, got ${cols.length}`,
      );
    }
    return {
      id: Number.parseInt(cols[0], 10),
      role: cols[1],
      responsibility: cols[2],
      model: parseModel(cols[3]),
      subagentType: parseSubagentType(cols[4]),
      skillOrType: parseSkillOrType(cols[5]),
    };
  });
}
```

```javascript
function parseDispatchBoard(nlOutput) {
  const match =
    nlOutput.match(/Collaboration mode[：:]\s*(Subagent|Agent Team)/i) ||
    nlOutput.match(/(Subagent|Agent Team)/i) ||
    nlOutput.match(/\u534f\u4f5c\u6a21\u5f0f[：:]\s*(Subagent|Agent Team)/i);

  if (!match) {
    throw new ParseError("DISPATCH_BOARD_MISSING", "Cannot determine collaboration mode");
  }

  return { mode: normalizeCollaborationMode(match[1]) };
}
```

## 4. Error Handling

| Error code | Trigger | Recovery |
| --- | --- | --- |
| `SCENARIO_MISSING` | no scenario match | re-invoke the playbook with explicit scenario-output instructions |
| `BLUEPRINT_EMPTY` | no table rows | request a table with the canonical columns |
| `BLUEPRINT_COLUMN_MISMATCH` | row has a column count other than 6 | request corrected table formatting |
| `DISPATCH_BOARD_MISSING` | no collaboration mode | default to `Subagent` only when the task is parallelizable and the skip reason is recorded |
| `PARSE_COMPLETE_FAILURE` | strict and tolerant parsing both fail | escalate to Warden for manual intervention |

Fallback chain:

1. strict parse
2. tolerant parse with warning log
3. default values only when they are safe and auditable
4. `capabilityGapPacket` when defaults are insufficient

## 5. Mapping To Meta_Kim Packets

| Playbook field | Meta_Kim target | Notes |
| --- | --- | --- |
| scenario | `parallelGroup` / route hint | scenario 3-5 usually implies multi-worker coordination |
| role | `roleDisplayName` / `owner` | normalize to a short English business role-family name |
| responsibility | `assignedResponsibilitySlice` and `Today's Task` | preserve work scope here, not in `roleDisplayName` |
| model | task constraints | never expose as user-visible role name |
| subagent_type | `ownerResolution` hint and Owner Mode | still validated by Fetch evidence |
| Skill/Type | `matchedCapabilities` and `capabilityBindings` | legacy `candidateSkills` is compatibility evidence only |
| runtime nickname | `runtimeInstanceAlias` | never replace `roleDisplayName` |

Conversion rules:

- Build or update `businessFlowBlueprintPacket` before worker packets.
- Every lane must include `capabilitySearchQuery`, `candidateOwners`, `matchedCapabilities`, `capabilityBindings`, `selectedOwner`, `selectionReason`, and `coverageStatus`.
- Role names in durable packets must be short English business role families such as `frontend`, `backend`, `test`, `review`, `analysis`, `verify`, or `docs`.
- Scoped work details belong in `roleInstanceId`, `shardScope`, `assignedResponsibilitySlice`, or task text.
- If `roleCoverageGate` fails, or any role resolves to `upgrade_existing_owner` / `create_owner_first`, emit `capabilityGapPacket` and require a Warden-approved governance-owner decision before dispatch.
- For repeated `ownerAgent` parallel instances, assign unique `roleInstanceId`, `shardKey`, `shardScope`, `workspaceIsolation`, `artifactNamespace`, `collisionPolicy`, and a unified `mergeOwner`.

## 6. Responsibilities Preserved

Conductor retains:

- rhythm control
- card-deck sequencing
- delivery shell selection
- parallel lane design
- merge-owner assignment
- dispatch-board validation

Conductor does not:

- execute worker tasks directly
- patch files as a worker
- choose durable long-term concrete skill loadouts for an agent identity
- treat playbook output as final without Fetch evidence and packet validation

## 7. Review And Verification Owners

| Assignment | Owner | Reason |
| --- | --- | --- |
| Review owner | `meta-prism` | quality audit of parsed results and task-board completeness |
| Dispatch board validation | schema / validator | machine validation before card dealing resumes |
| Verification owner | `meta-warden + meta-prism` | closure of Stage 7 Verification |
| Synthesis owner | `meta-warden` | final approval before card dealing resumes |

## 8. Minimal Valid Output

```text
Selected scenario: Scenario 3 (Plan + Review)

| ID | Role | Responsibility | Model | subagent_type | Skill/Type |
|----|------|----------------|-------|---------------|------------|
| 1 | backend | implement API endpoints | sonnet | general-purpose | Type: general-purpose |
| 2 | test | validate API contract and regression path | sonnet | general-purpose | Type: general-purpose |

Collaboration mode: Subagent
Expected agent count: 2
```

The canonical file must remain English. Localized input examples belong in tests or explicit trigger corpora, not durable governance prose.
