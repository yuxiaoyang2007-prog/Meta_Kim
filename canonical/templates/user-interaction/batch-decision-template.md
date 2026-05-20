# Batch Decision Template

Use this template when multiple independent questions can be decided together.

Every question must offer 3-4 options. Each option must state what changes, what problem it solves, the expected result, advantages, and disadvantages in product language a non-technical user can understand.

## Dependency Detection

```python
# Pseudocode: dependency detection
def detect_dependency(questions):
    """
    Returns: linear_groups (list of lists, each inner list is a linear dependency chain)
    """
    dependency_graph = build_dependency_graph(questions)
    linear_groups = topological_sort(dependency_graph)
    return linear_groups

# Example
questions = [
    {"id": "tech_stack", "depends_on": []},
    {"id": "framework", "depends_on": ["tech_stack"]},  # Linear: depends on tech_stack
    {"id": "ui_style", "depends_on": []},               # Independent
    {"id": "deploy_method", "depends_on": []},          # Independent
]
# Result: [[tech_stack, framework], [ui_style], [deploy_method]]
#       → First group: sequential questions, last two: can be batched
```

## Linear vs Parallel判定

| Type | Characteristic | Question Format | Example |
|------|----------------|-----------------|---------|
| **Linear** | Later options depend on earlier choice | Sequential questions | Tech stack → Framework → Tool |
| **Parallel** | Independent decisions | Batch list, one-time selection | UI style, Deploy method, Test strategy |

## Batch Format (Markdown)

```markdown
## 📋 Batch Decision List

The following questions are independent. Please select one option for each:

---

### Question 1: {Question Title}

{Context: Why this decision is needed}

| Option | What Changes | Problem Solved | Expected Result | Advantages | Disadvantages |
|--------|--------------|----------------|-----------------|------------|---------------|
| **A** | {description} | {description} | {description} | {description} | {description} |
| **B** | {description} | {description} | {description} | {description} | {description} |
| **C** | {description} | {description} | {description} | {description} | {description} |

**Your choice:** [ ] A [ ] B [ ] C

---

### Question 2: {Question Title}

{Context: Why this decision is needed}

| Option | What Changes | Problem Solved | Expected Result | Advantages | Disadvantages |
|--------|--------------|----------------|-----------------|------------|---------------|
| **A** | {description} | {description} | {description} | {description} | {description} |
| **B** | {description} | {description} | {description} | {description} | {description} |
| **C** | {description} | {description} | {description} | {description} | {description} |

**Your choice:** [ ] A [ ] B [ ] C

---

Please respond with your choices, e.g., "1A, 2B" or "Question 1: A, Question 2: B"
```

## AskUserQuestion Schema (Batch)

For platforms that support multi-question AskUserQuestion:

```json
{
  "questions": [
    {
      "question": "{Question 1}",
      "header": "{Q1 Tag}",
      "options": [
        {"label": "A", "description": "{4-dimension format}"},
        {"label": "B", "description": "{4-dimension format}"},
        {"label": "C", "description": "{4-dimension format}"}
      ],
      "multiSelect": false
    },
    {
      "question": "{Question 2}",
      "header": "{Q2 Tag}",
      "options": [
        {"label": "A", "description": "{4-dimension format}"},
        {"label": "B", "description": "{4-dimension format}"},
        {"label": "C", "description": "{4-dimension format}"}
      ],
      "multiSelect": false
    }
  ]
}
```

## When to Use

- Multiple independent decisions need to be made
- Questions do not have dependency relationships
- User attention budget is limited (prefer one interaction over N)
