---
name: mcp-memory-service
description: Save OpenClaw lifecycle checkpoints to the MCP Memory Service HTTP API.
version: 1.0.0
events:
  - command:new
  - command:reset
  - command:stop
  - session:compact:after
always: true
---

# MCP Memory Service Bridge

Writes compact OpenClaw lifecycle checkpoints to `MCP_MEMORY_URL` or
`http://localhost:8000` using `/api/memories`. The hook records start
(`command:new`), in-progress/reset (`command:reset`, `session:compact:after`),
and end (`command:stop`) memory events.

This hook complements OpenClaw's local `session-memory` store. It does not
replace OpenClaw sqlite memory files.
