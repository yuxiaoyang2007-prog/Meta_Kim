# Decision Template (Outcome-Branching Options)

Use this template when multiple viable solutions exist with distinct trade-offs. Ask only questions whose answer changes execution, scope, risk, owner, or acceptance. Each visible question must have at least two materially different options, and each option must be understandable to non-technical users.

## Format

| Dimension | Description | Required |
|-----------|-------------|----------|
| **What changes** | Specific scope of modification | ✅ |
| **What problem it solves** | Corresponding requirement or pain point | ✅ |
| **Expected result** | What the user will get after choosing this option | ✅ |
| **Advantages** | Why choose this approach | ✅ |
| **Disadvantages** | Costs or risks | ✅ |

## Runtime Adapter Payload

The canonical template defines the semantic card only. Runtime adapters may compact or reshape it for a native choice surface, but they must preserve the decision purpose, route-changing dimension, recommended default, option count, option trade-offs, selection result, fallback reason, and writeback target.

Renderer-specific payload schemas belong in runtime references, not in this generic template.

## Example

| Option | What Changes | Problem Solved | Expected Result | Advantages | Disadvantages |
|--------|--------------|----------------|-----------------|------------|---------------|
| Recommended | The assistant gathers facts first, then asks one clear decision before changing anything. | Avoids repeated interruptions. | The user sees the plan, choices, likely outcome, benefits, and trade-offs in one place. | Clear and efficient. | Some early assumptions may need correction. |
| Early clarification | The assistant asks immediately only when it cannot understand the goal or risk. | Prevents work from starting on a wrong target. | Unclear requests are clarified before planning. | Safer for ambiguous work. | Can interrupt more often. |
| Milestone control | The assistant pauses at major checkpoints for user choice. | Gives more control during risky work. | The user can redirect before each large step. | Strong oversight. | Slower completion. |

## When to Use

- 2+ viable solutions exist with clear trade-offs
- Product/Business direction must be clarified
- Security or rollback risk requires explicit acknowledgment

## When Not to Use

- The answer would not change the deliverable, owner, scope, risk, or acceptance
- The assistant can proceed with an explicit assumption and document it
- The question exists only to satisfy a question count
