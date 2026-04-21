---
description: Save current project task progress to local task state file for cross-session continuity. Use when: user says "save progress", "记一下", "保存进度", session is interrupted, or user wants to resume work later. Writes to .claude/project-task-state.json so next session can load it via SessionStart hook.
---

# Save Progress

Saves current task progress to `.claude/project-task-state.json` in the project directory so the next session can automatically load it and resume where you left off.

## What to Save

Before invoking this command, you should know:
- **Current task**: What are you working on RIGHT NOW?
- **Completed tasks**: What has been finished in this session? (Be specific, not "various things")
- **Remaining tasks**: What still needs to be done?

## How to Invoke

```bash
# Detect the Python hook path — it lives in ~/.claude/hooks/
python "$HOME/.claude/hooks/mcp_memory_global.py" \
  --mode save \
  --task "Describe current task in one sentence" \
  --done "Task 1 completed" "Task 2 completed" \
  --remaining "Next task to do" "Another remaining task"
```

Or use the Claude Code hooks path if HOME is not set:

```bash
python "C:/Users/admin/.claude/hooks/mcp_memory_global.py" \
  --mode save \
  --task "..." \
  --done "..." \
  --remaining "..."
```

## When to Save

Trigger this when:
- User explicitly asks to save progress
- Session is being interrupted (detected via hook or user signal)
- A major milestone is completed
- Before switching to a different project
- End of a work session

## What NOT to Save

- Generic "worked on project" — be specific: "completed dependency license audit for 4 READMEs"
- Session noise — only save meaningful task state
- Duplicate entries — if nothing meaningful changed, don't overwrite

## Output

The command returns JSON with:
- `saved`: boolean
- `file`: path to the state file
- `total_sessions`: number of sessions recorded
- `total_completed`: total completed tasks across all sessions
- `last_session_completed`: how many tasks completed this session
- `last_session_remaining`: remaining tasks as of this save

Show the user a brief summary after saving.

## Example

User says: "保存一下进度"

```bash
python "C:/Users/admin/.claude/hooks/mcp_memory_global.py" \
  --mode save \
  --task "审计Meta_Kim依赖并更新4个README" \
  --done "审计npm依赖license" "审计GitHub skill repos" "写英文README依赖章节" \
  --remaining "更新中文/日文/韩文README" "推送GitHub" \
  --note "发现CLI-Anything是Apache 2.0，不是MIT"
```

Output: Show the user "✅ 进度已保存：2件事完成，2件事待做，共5个会话"

## Layered Session Context (how it works)

The SessionStart hook outputs context in 3 layers to avoid context explosion:

| Layer | Trigger | Size | Content |
|-------|---------|------|---------|
| **L1 compact** | Always | ~120 chars | Task state: "doing X, N done, M left" |
| **L2 filtered** | Project tag matched | ~400 chars | Project memories with relevance > 0.55 |
| **L3 full** | User queries manually | ~800 chars | Full memories + recent |

**User can query on demand:**

```bash
# Query task state only (no MCP calls)
python mcp_memory_global.py --mode query-project

# Query all memories (full dump)
python mcp_memory_global.py --mode query-memories
```

If the user asks "还有什么上下文"、"查一下历史"、"看看之前的记忆"，use `--mode query-memories`.
If the user asks "项目进度呢"、"上次做到哪了"，use `--mode query-project`."
