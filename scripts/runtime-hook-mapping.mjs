/**
 * Runtime hook mapping helpers.
 *
 * The goal is explicit capability mapping, not pretending every runtime has
 * Claude Code's hook surface. Keep commands in the portable subset:
 * `node <script> ...` with JSON-quoted arguments when needed.
 */

export const RUNTIME_HOOK_CAPABILITIES = {
  claude: {
    configPath: ".claude/settings.json",
    hookDir: ".claude/hooks",
    projectHooks: true,
    globalHooks: true,
    events: {
      promptSubmit: "UserPromptSubmit",
      sessionStart: "SessionStart",
      preToolUse: "PreToolUse",
      postToolUse: "PostToolUse",
      subagentStart: "SubagentStart",
      stop: "Stop",
    },
  },
  codex: {
    configPath: ".codex/hooks.json",
    hookDir: ".codex/hooks",
    projectHooks: true,
    globalHooks: true,
    events: {
      promptSubmit: "UserPromptSubmit",
      sessionStart: "SessionStart",
      preToolUse: "PreToolUse",
      postToolUse: "PostToolUse",
      skill: "Skill",
      stop: "Stop",
    },
  },
  openclaw: {
    configPath: "openclaw/openclaw.template.json",
    hookDir: "openclaw/hooks",
    projectHooks: true,
    globalHooks: true,
    events: {
      promptSubmit: "command:new",
      sessionStart: "command:new",
      compactAfter: "session:compact:after",
      stop: "command:stop",
    },
  },
  cursor: {
    configPath: ".cursor/hooks.json",
    hookDir: ".cursor/hooks",
    projectHooks: true,
    globalHooks: true,
    events: {
      promptSubmit: "beforeSubmitPrompt",
      sessionStart: "sessionStart",
      preToolUse: "preToolUse",
      postToolUse: "postToolUse",
      stop: "stop",
    },
  },
};

export const HOOKPROMPT_PLATFORM_SUPPORT = {
  claude: {
    status: "native",
    event: "UserPromptSubmit",
    adapter: "claude-settings-hook",
  },
  codex: {
    status: "adapter-required",
    event: "UserPromptSubmit",
    adapter: "codex-hookprompt-adapter",
  },
  cursor: {
    status: "adapter-required",
    event: "beforeSubmitPrompt",
    adapter: "cursor-hookprompt-adapter",
  },
  openclaw: {
    status: "degraded",
    event: "command:new",
    adapter: "openclaw-workspace-instruction",
  },
};

export function commandToken(value) {
  return /[\s"]/u.test(String(value)) ? JSON.stringify(String(value)) : String(value);
}

export function nodeHookCommand(scriptPath, args = []) {
  return ["node", scriptPath, ...args].map(commandToken).join(" ");
}

export function hookCommand(command, timeout, extra = {}) {
  return {
    ...extra,
    type: "command",
    command,
    ...(timeout ? { timeout } : {}),
  };
}

export function buildHookPromptAdapterSource(runtimeId) {
  const outputKey = runtimeId === "cursor" ? "prompt" : "systemMessage";
  return [
    'import { spawnSync } from "node:child_process";',
    'import { existsSync, readFileSync } from "node:fs";',
    'import path from "node:path";',
    'import process from "node:process";',
    'import { fileURLToPath } from "node:url";',
    "",
    "function readPayload() {",
    "  try {",
    '    const raw = readFileSync(0, "utf8");',
    '    return raw.trim() ? JSON.parse(raw) : {};',
    "  } catch {",
    "    return {};",
    "  }",
    "}",
    "",
    "function promptFromPayload(payload) {",
    '  for (const key of ["prompt", "user_prompt", "input", "text"]) {',
    '    if (typeof payload[key] === "string" && payload[key].trim()) return payload[key];',
    "  }",
    "  const messages = payload.messages;",
    "  if (Array.isArray(messages)) {",
    "    for (let index = messages.length - 1; index >= 0; index -= 1) {",
    "      const message = messages[index];",
    '      if (message?.role !== "user") continue;',
    '      if (typeof message.content === "string") return message.content;',
    "      if (Array.isArray(message.content)) {",
    "        const parts = message.content",
    '          .map((part) => typeof part === "string" ? part : part?.text)',
    "          .filter(Boolean);",
    '        if (parts.length) return parts.join("\\n");',
    "      }",
    "    }",
    "  }",
    '  return "";',
    "}",
    "",
    "function findHookPromptScript() {",
    "  const candidates = [];",
    "  const hookDir = path.dirname(fileURLToPath(import.meta.url));",
    '  candidates.push(path.join(hookDir, "user-prompt-submit.js"));',
    '  candidates.push(path.join(hookDir, "hookprompt", "user-prompt-submit.js"));',
    '  candidates.push(path.join(hookDir, "..", "skills", "hookprompt", ".claude", "hooks", "user-prompt-submit.js"));',
    '  candidates.push(path.join(process.env.HOME || process.env.USERPROFILE || "", ".claude", "hooks", "user-prompt-submit.js"));',
    "  return candidates.find((candidate) => candidate && existsSync(candidate));",
    "}",
    "",
    "function parseClaudeAdditionalContext(stdout) {",
    "  try {",
    "    const parsed = JSON.parse(stdout);",
    '    return parsed?.hookSpecificOutput?.additionalContext || "";',
    "  } catch {",
    '    return "";',
    "  }",
    "}",
    "",
    "const payload = readPayload();",
    "const prompt = promptFromPayload(payload);",
    "const script = findHookPromptScript();",
    "if (prompt && script) {",
    '  const result = spawnSync("node", [script], {',
    '    input: JSON.stringify({ prompt }),',
    '    encoding: "utf8",',
    '    windowsHide: true,',
    '    timeout: 10000,',
    "  });",
    "  const additionalContext = parseClaudeAdditionalContext(result.stdout || '');",
    "  if (additionalContext) {",
    `    console.log(JSON.stringify({ ${JSON.stringify(outputKey)}: additionalContext }));`,
    "  }",
    "}",
    "",
  ].join("\n");
}

export function buildCodexHooksJson({
  graphifyHookPath = ".codex/hooks/graphify-context.mjs",
  memoryHookPath = ".codex/hooks/meta-kim-memory-save.mjs",
  spineHookPath = ".codex/hooks/activate-meta-theory-spine.mjs",
  hookPromptAdapterPath = null,
} = {}) {
  const userPromptHooks = [
    hookCommand(nodeHookCommand(memoryHookPath, ["--event", "user-prompt"]), 10),
  ];
  if (hookPromptAdapterPath) {
    userPromptHooks.push(hookCommand(nodeHookCommand(hookPromptAdapterPath), 10));
  }

  return {
    hooks: {
      SessionStart: [
        {
          matcher: "startup|resume",
          hooks: [
            hookCommand(nodeHookCommand(memoryHookPath, ["--event", "session-start"]), 10, {
              statusMessage: "Loading Meta_Kim memory",
            }),
          ],
        },
      ],
      UserPromptSubmit: [
        {
          hooks: userPromptHooks,
        },
      ],
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [hookCommand(nodeHookCommand(graphifyHookPath))],
        },
      ],
      Skill: [
        {
          matcher: "meta-theory",
          hooks: [hookCommand(nodeHookCommand(spineHookPath), 5)],
        },
      ],
      Stop: [
        {
          hooks: [hookCommand(nodeHookCommand(memoryHookPath, ["--event", "stop"]), 10)],
        },
      ],
    },
  };
}

export function buildCursorHooksJson({
  graphifyHookPath = ".cursor/hooks/graphify-context.mjs",
  memoryHookPath = ".cursor/hooks/meta-kim-memory-save.mjs",
  hookPromptAdapterPath = null,
} = {}) {
  const beforeSubmitPromptHooks = [
    {
      command: nodeHookCommand(memoryHookPath, ["--event", "user-prompt"]),
      timeout: 10,
    },
  ];
  if (hookPromptAdapterPath) {
    beforeSubmitPromptHooks.push({
      command: nodeHookCommand(hookPromptAdapterPath),
      timeout: 10,
    });
  }

  return {
    version: 1,
    hooks: {
      sessionStart: [
        {
          command: nodeHookCommand(memoryHookPath, ["--event", "session-start"]),
          timeout: 10,
        },
      ],
      beforeSubmitPrompt: beforeSubmitPromptHooks,
      preToolUse: [
        {
          command: nodeHookCommand(graphifyHookPath),
        },
      ],
      stop: [
        {
          command: nodeHookCommand(memoryHookPath, ["--event", "stop"]),
          timeout: 10,
        },
      ],
    },
  };
}
