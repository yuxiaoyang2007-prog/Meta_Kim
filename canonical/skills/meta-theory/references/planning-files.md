# Planning Files (Dual-Workflow Support)

When file-based planning is enabled and the task is not a pure query, planning files track workflow progress:

- `task_plan.md`: goal, phases, dependencies, status checkpoints
- `findings.md`: evidence, decisions, contradictions, open issues
- `progress.md`: stage-by-stage progress, completed checks, current state

## Two Workflow Modes

Meta_Kim supports two workflow models:

1. **8-Stage Spine** (canonical meta-theory spine)
2. **11-Phase Business Workflow** (department workflow, legacy alias: ten-step-governance)

The planning files adapt to whichever mode is active.

---

## 8-Stage Spine Coverage

| Stage | Updates | Content |
|-------|---------|---------|
| Critical | `task_plan.md` | Initialize: goal, context, phases, dependencies |
| Fetch | `findings.md` | Evidence collected, decision impact map, contradictions |
| Thinking | `task_plan.md`, `findings.md` | Solution paths, chosen rationale, capability gaps |
| Execution | `progress.md` | Worker progress, file completion list, execution evidence |
| Review | `findings.md`, `progress.md` | Quality findings, boundary checks, review decisions |
| Meta-Review | `findings.md` | Review standard evaluation, review quality assessment |
| Verification | `progress.md` | Verification results, evidence binding, closure status |
| Evolution | `task_plan.md`, `progress.md` | Final status, writeback decision, lessons learned |

---

## 11-Phase Business Workflow Coverage

| Phase | Updates | Content |
|-------|---------|---------|
| Direction (1) | `task_plan.md` | Initialize: intent core, complexity class |
| Planning (2) | `task_plan.md`, `findings.md` | Task decomposition, meta assignments, dependencies |
| Execute (3) | `progress.md` | Execution progress, artifacts created |
| Review (4) | `findings.md`, `progress.md` | Prism report findings, grade, assertions |
| Meta-review (5) | `findings.md` | Standard evaluation, drift detection |
| Revision (6) | `progress.md` | Revision rounds, fixes applied |
| Verify (7) | `progress.md` | Re-verification results, fresh evidence |
| Summary (8) | `task_plan.md`, `progress.md` | Exec memo, learning log |
| Feedback (9) | `task_plan.md` | User acceptance, change requests |
| Evolve (10) | `task_plan.md`, `findings.md` | Five-dimension scan, amplification actions |
| Mirror (11) | `progress.md` | Runtime sync status, projection evidence |

---

## Workflow Mapping

8-stage spine and 11-phase business workflow map as follows:

| 8-Stage Spine | 11-Phase Business Workflow | Planning Files |
|---------------|---------------------------|----------------|
| Critical | Direction | task_plan.md |
| Fetch + Thinking | Planning | task_plan.md + findings.md |
| Execution | Execute | progress.md |
| Review | Review | findings.md + progress.md |
| Meta-Review | Meta-review | findings.md |
| Verification | Verify | progress.md |
| Evolution | Summary + Feedback + Evolve + Mirror | task_plan.md + progress.md |

These files are supplemental. Packets in `config/contracts/workflow-contract.json` remain canonical.

Only the conductor/main coordinator writes these planning files unless the run explicitly delegates ownership.
