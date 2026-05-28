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

## AskUserQuestion Schema

```json
{
  "questions": [{
    "question": "{Brief question describing the decision needed}",
    "header": "{Short tag (max 12 chars)}",
    "options": [
      {
        "label": "{Option A}",
        "description": "{What changes}: {description}. {Problem solved}: {description}. {Expected result}: {description}. {Advantages}: {description}. {Disadvantages}: {description}"
      },
      {
        "label": "{Option B}",
        "description": "{Same product-readable format}"
      },
      {
        "label": "{Option C}",
        "description": "{Same product-readable format}"
      }
    ],
    "multiSelect": false
  }]
}
```

## Example

```json
{
  "questions": [{
    "question": "How should Meta_Kim ask for decisions before work begins?",
    "header": "Decision",
    "options": [
      {
        "label": "Ask once before action",
        "description": "What changes: The assistant gathers facts first, then asks one clear set of questions before changing anything. Problem solved: Avoids repeated interruptions. Expected result: The user sees the plan, choices, likely outcome, benefits, and trade-offs in one place. Advantages: Clear and efficient. Disadvantages: Some early assumptions may need correction."
      },
      {
        "label": "Ask early if blocked",
        "description": "What changes: The assistant asks immediately only when it cannot understand the goal or risk. Problem solved: Prevents work from starting on a wrong target. Expected result: Unclear requests are clarified before planning. Advantages: Safer for ambiguous work. Disadvantages: Can interrupt more often."
      },
      {
        "label": "Ask in milestones",
        "description": "What changes: The assistant pauses at major checkpoints for user choice. Problem solved: Gives more control during risky work. Expected result: The user can redirect before each large step. Advantages: Strong oversight. Disadvantages: Slower completion."
      }
    ],
    "multiSelect": false
  }]
}
```

## When to Use

- 2+ viable solutions exist with clear trade-offs
- Product/Business direction must be clarified
- Security or rollback risk requires explicit acknowledgment

## When Not to Use

- The answer would not change the deliverable, owner, scope, risk, or acceptance
- The assistant can proceed with an explicit assumption and document it
- The question exists only to satisfy a question count
