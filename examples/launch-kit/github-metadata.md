# GitHub Metadata Draft

These are local drafts for the repository settings page. Applying them changes GitHub state, so do it only after maintainer approval.

## Repository Description

Recommended:

> Governed execution layer for AI coding assistants: clarify intent, route capabilities, review evidence, verify results, and write back lessons across Claude Code, Codex, OpenClaw, and Cursor.

Shorter:

> AI coding governance layer for capability-first dispatch, evidence review, and cross-runtime agent workflows.

## Website

```text
https://www.aiking.dev/
```

## Topics

```text
ai-coding
agent-governance
ai-agents
codex
claude-code
cursor
openclaw
mcp
skills
workflow
verification
developer-tools
```

## Suggested Command

Run only after explicit approval:

```bash
gh repo edit KimYx0207/Meta_Kim \
  --description "Governed execution layer for AI coding assistants: clarify intent, route capabilities, review evidence, verify results, and write back lessons across Claude Code, Codex, OpenClaw, and Cursor." \
  --homepage "https://www.aiking.dev/"

gh repo edit KimYx0207/Meta_Kim \
  --add-topic ai-coding \
  --add-topic agent-governance \
  --add-topic ai-agents \
  --add-topic codex \
  --add-topic claude-code \
  --add-topic cursor \
  --add-topic openclaw \
  --add-topic mcp \
  --add-topic skills \
  --add-topic workflow \
  --add-topic verification \
  --add-topic developer-tools
```

## Launch Post Hook

Use this as the first sentence in a launch post:

> AI coding does not need only stronger hands. It needs a governance layer that decides what should happen, who should do it, how it gets reviewed, and what evidence proves it worked.
