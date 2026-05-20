# Notice Template (No Popup)

Use this template for informational updates that do not require user choice.

## Format

```markdown
## 📋 Stage: {Stage Name}

**Progress:**
- Current Stage: {Critical | Fetch | Thinking | Execution | Review | Meta-Review | Verification | Evolution}
- Inferred Type: {A | B | C | D | E}
- Scope: {brief description}

**Next Steps:**
- {Next action 1}
- {Next action 2}

*Proceeding without confirmation unless multiple viable options are detected.*
```

## Example

```markdown
## 📋 Stage: Thinking → Execution Plan

**Progress:**
- Current Stage: Thinking
- Inferred Type: C (Development Governance)
- Scope: Optimize AskUserQuestion usage patterns

**Next Steps:**
- Modify canonical/skills/meta-theory/SKILL.md
- Create user interaction templates
- Update workflow-contract.json

*Proceeding without confirmation unless multiple viable options are detected.*
```

## When to Use

- Stage transitions (Critical → Fetch → Thinking → ...)
- Progress updates during long-running operations
- Informational status that does not require branching logic
