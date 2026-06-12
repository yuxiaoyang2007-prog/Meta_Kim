import { describe, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile as readFsFile } from "node:fs/promises";

import {
  CODEX_BUSINESS_ROLE_AGENTS,
  CODEX_RUNTIME_ADAPTER_AGENTS,
  applyRuntimePaths,
  buildCodexAgent,
  buildCodexBusinessRoleAgent,
  buildCodexRuntimeAdapterAgent,
  buildCodexSkillContent,
  buildCursorAgent,
  buildCursorProjectHooksJson,
  buildCodexGraphifyContextHook,
  buildCodexProjectHooksJson,
  inferProjectCategory,
  inferProjectPurpose,
} from "../../scripts/sync-runtimes.mjs";
import { mergeRepoClaudeSettings } from "../../scripts/claude-settings-merge.mjs";
import { CATEGORIES } from "../../scripts/install-manifest.mjs";
import {
  buildCodexHooksJson,
  buildHookPromptAdapterSource,
} from "../../scripts/runtime-hook-mapping.mjs";

const REPO = path.resolve("/fake/repo");

function p(...bits) {
  return path.join(REPO, ...bits);
}

describe("sync-runtimes / inferProjectCategory", () => {
  test("maps .claude/settings.json to category G", () => {
    assert.equal(
      inferProjectCategory(p(".claude/settings.json"), REPO),
      CATEGORIES.G,
    );
  });

  test("maps .mcp.json to category G", () => {
    assert.equal(inferProjectCategory(p(".mcp.json"), REPO), CATEGORIES.G);
  });

  test("maps openclaw template json to category G", () => {
    assert.equal(
      inferProjectCategory(p("openclaw/openclaw.template.json"), REPO),
      CATEGORIES.G,
    );
  });

  test("maps any .codex/ config file to category G", () => {
    assert.equal(
      inferProjectCategory(p(".codex/config.toml"), REPO),
      CATEGORIES.G,
    );
  });

  test("maps Codex slash commands to project settings category", () => {
    assert.equal(
      inferProjectCategory(p(".codex/commands/meta-theory.md"), REPO),
      CATEGORIES.G,
    );
  });

  test("maps .claude/hooks/*.mjs to category E", () => {
    assert.equal(
      inferProjectCategory(p(".claude/hooks/stop-compaction.mjs"), REPO),
      CATEGORIES.E,
    );
    assert.equal(
      inferProjectCategory(p(".codex/hooks/meta-kim-memory-save.mjs"), REPO),
      CATEGORIES.E,
    );
    assert.equal(
      inferProjectCategory(p(".cursor/hooks/meta-kim-memory-save.mjs"), REPO),
      CATEGORIES.E,
    );
    assert.equal(
      inferProjectCategory(p("openclaw/hooks/mcp-memory-service/HOOK.md"), REPO),
      CATEGORIES.E,
    );
  });

  test("maps runtime agents to category F across runtimes", () => {
    assert.equal(
      inferProjectCategory(p(".claude/agents/meta-warden.md"), REPO),
      CATEGORIES.F,
    );
    assert.equal(
      inferProjectCategory(p(".codex/agents/meta-warden.toml"), REPO),
      CATEGORIES.F,
    );
    assert.equal(
      inferProjectCategory(p(".cursor/agents/meta-warden.md"), REPO),
      CATEGORIES.F,
    );
  });

  test("maps runtime skills to category D across runtimes", () => {
    assert.equal(
      inferProjectCategory(p(".claude/skills/meta-theory/SKILL.md"), REPO),
      CATEGORIES.D,
    );
    assert.equal(
      inferProjectCategory(p(".cursor/skills/meta-theory/SKILL.md"), REPO),
      CATEGORIES.D,
    );
    assert.equal(
      inferProjectCategory(p("openclaw/skills/meta-theory/SKILL.md"), REPO),
      CATEGORIES.D,
    );
    assert.equal(
      inferProjectCategory(p(".agents/skills/meta-theory/SKILL.md"), REPO),
      CATEGORIES.D,
    );
    assert.equal(
      inferProjectCategory(p(".codex/skills/meta-theory/SKILL.md"), REPO),
      null,
    );
  });

  test("maps capability index mirrors to project settings category", () => {
    assert.equal(
      inferProjectCategory(
        p(".claude/capability-index/meta-kim-capabilities.json"),
        REPO,
      ),
      CATEGORIES.G,
    );
    assert.equal(
      inferProjectCategory(
        p(".codex/capability-index/meta-kim-capabilities.json"),
        REPO,
      ),
      CATEGORIES.G,
    );
    assert.equal(
      inferProjectCategory(
        p("openclaw/capability-index/meta-kim-capabilities.json"),
        REPO,
      ),
      CATEGORIES.G,
    );
    assert.equal(
      inferProjectCategory(
        p(".cursor/capability-index/meta-kim-capabilities.json"),
        REPO,
      ),
      CATEGORIES.G,
    );
  });

  test("maps openclaw workspaces to category D", () => {
    assert.equal(
      inferProjectCategory(p("openclaw/workspaces/meta-warden/SOUL.md"), REPO),
      CATEGORIES.D,
    );
  });

  test("returns null for paths outside the repo", () => {
    const outside = path.resolve("/tmp/not-in-repo/.claude/settings.json");
    assert.equal(inferProjectCategory(outside, REPO), null);
  });

  test("returns null for repo-local paths that are not projection targets", () => {
    assert.equal(inferProjectCategory(p("README.md"), REPO), null);
    assert.equal(
      inferProjectCategory(p("scripts/sync-runtimes.mjs"), REPO),
      null,
    );
    assert.equal(inferProjectCategory(p("docs/guide.md"), REPO), null);
  });

  test("returns null for empty / invalid input", () => {
    assert.equal(inferProjectCategory("", REPO), null);
    assert.equal(inferProjectCategory(null, REPO), null);
    assert.equal(inferProjectCategory(undefined, REPO), null);
    assert.equal(inferProjectCategory(123, REPO), null);
  });

  test("distinguishes .claude/settings.json (G) from .claude/hooks/ (E)", () => {
    const settings = inferProjectCategory(p(".claude/settings.json"), REPO);
    const hook = inferProjectCategory(p(".claude/hooks/anything.mjs"), REPO);
    assert.notEqual(settings, hook);
    assert.equal(settings, CATEGORIES.G);
    assert.equal(hook, CATEGORIES.E);
  });
});

describe("sync-runtimes / inferProjectPurpose", () => {
  test("maps each category to its purpose tag", () => {
    assert.equal(inferProjectPurpose(CATEGORIES.D), "project-skill");
    assert.equal(inferProjectPurpose(CATEGORIES.E), "project-hook");
    assert.equal(inferProjectPurpose(CATEGORIES.F), "project-agent");
    assert.equal(inferProjectPurpose(CATEGORIES.G), "project-settings");
  });

  test("returns null for non-project categories", () => {
    assert.equal(inferProjectPurpose(CATEGORIES.A), null);
    assert.equal(inferProjectPurpose(CATEGORIES.B), null);
    assert.equal(inferProjectPurpose(CATEGORIES.C), null);
    assert.equal(inferProjectPurpose(CATEGORIES.H), null);
    assert.equal(inferProjectPurpose(CATEGORIES.I), null);
  });

  test("returns null for unknown / missing input", () => {
    assert.equal(inferProjectPurpose(null), null);
    assert.equal(inferProjectPurpose(undefined), null);
    assert.equal(inferProjectPurpose("Z"), null);
  });
});

describe("sync-runtimes / Codex project hooks", () => {
  test("registers the enforce-agent-dispatch deny gate before context hooks", () => {
    const config = buildCodexProjectHooksJson();
    const preToolUse = config.hooks.PreToolUse;

    const enforceEntry = preToolUse.find((entry) =>
      entry.hooks?.some((cmd) =>
        cmd.command?.includes("enforce-agent-dispatch.mjs"),
      ),
    );
    assert(enforceEntry, "enforce-agent-dispatch should be registered");
    assert.equal(
      preToolUse[0],
      enforceEntry,
      "enforce-agent-dispatch must run before any other PreToolUse hook",
    );
    assert.match(
      enforceEntry.matcher,
      /Bash\|apply_patch\|Edit\|Write\|MultiEdit\|NotebookEdit\|Agent/,
    );
    assert.match(enforceEntry.matcher, /spawn_agent/);

    const graphifyEntry = preToolUse.find((entry) =>
      entry.hooks?.some((cmd) =>
        cmd.command?.includes("graphify-context.mjs"),
      ),
    );
    assert(graphifyEntry, "graphify-context should still be registered");
  });

  test("uses a cross-platform Node command instead of Unix shell syntax", () => {
    const config = buildCodexProjectHooksJson();
    const graphifyEntry = config.hooks.PreToolUse.find((entry) =>
      entry.hooks?.some((cmd) =>
        cmd.command?.includes("graphify-context.mjs"),
      ),
    );
    assert(graphifyEntry, "graphify-context entry should be present");
    const command = graphifyEntry.hooks[0].command;

    assert.match(command, /node(\.exe)?/);
    assert.match(command, /\.codex\/hooks\/graphify-context\.mjs/);
    assert.doesNotMatch(command, /\[ -f|\|\| true|2>\/dev\/null/);
  });

  test("repo Claude settings replace retired inline graphify shell hook with Node hook", () => {
    const retiredInlineHook =
      'CMD=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get(\'tool_input\',d).get(\'command\',\'\'))" 2>/dev/null || true); case "$CMD" in *rg\\ *) [ -f graphify-out/graph.json ] && echo "{}" || true ;; esac';
    const canonical = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command",
                command: "node .claude/hooks/graphify-context.mjs",
              },
              {
                type: "command",
                command: "node .claude/hooks/enforce-agent-dispatch.mjs",
              },
            ],
          },
        ],
      },
    };
    const merged = mergeRepoClaudeSettings(
      {
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [
                {
                  type: "command",
                  command: retiredInlineHook,
                },
              ],
            },
          ],
        },
      },
      canonical,
      REPO
    );
    const commands = merged.hooks.PreToolUse.flatMap((block) =>
      block.hooks.map((hook) => hook.command)
    );

    assert.ok(commands.includes("node .claude/hooks/graphify-context.mjs"));
    assert.ok(commands.includes("node .claude/hooks/enforce-agent-dispatch.mjs"));
    assert.equal(commands.some((command) => command.includes("CMD=$(python3")), false);
  });

  test("project Codex hooks leave global-only packages out", () => {
    const config = buildCodexProjectHooksJson();

    assert.equal(config.hooks.SessionStart, undefined);
    assert.equal(config.hooks.UserPromptSubmit, undefined);
    assert.equal(config.hooks.Stop, undefined);
    const allCommands = JSON.stringify(config);
    assert.doesNotMatch(allCommands, /meta-kim-memory-save\.mjs/);
    assert.doesNotMatch(allCommands, /hookprompt-adapter\.mjs/);
    assert.doesNotMatch(allCommands, /planning-with-files-adapter\.mjs/);
  });

  test("wires meta-theory Skill activation to the spine hook", () => {
    const config = buildCodexProjectHooksJson();
    const skillEntry = config.hooks.Skill.find((entry) =>
      entry.hooks?.some((hook) =>
        hook.command?.includes("activate-meta-theory-spine.mjs"),
      ),
    );

    assert(skillEntry, "meta-theory spine hook should be registered");
    assert.equal(skillEntry.matcher, "meta-theory");
    assert.equal(skillEntry.hooks[0].timeout, 5);
  });

  test("Cursor prompt hooks can bootstrap explicit meta-theory prompts", () => {
    const config = buildCursorProjectHooksJson();
    const beforeSubmit = config.hooks.beforeSubmitPrompt;

    assert.match(beforeSubmit[0].command, /activate-meta-theory-spine\.mjs/);
    assert.equal(beforeSubmit[0].timeout, 5);
    assert.doesNotMatch(JSON.stringify(config), /meta-kim-memory-save\.mjs/);
    assert.doesNotMatch(JSON.stringify(config), /hookprompt-adapter\.mjs/);
    assert.doesNotMatch(JSON.stringify(config), /planning-with-files-adapter\.mjs/);
  });

  test("can wire HookPrompt through a global Codex adapter", () => {
    const config = buildCodexHooksJson({
      hookPromptAdapterPath: ".codex/hooks/hookprompt-adapter.mjs",
    });

    assert.match(
      config.hooks.UserPromptSubmit[0].hooks[1].command,
      /hookprompt-adapter\.mjs/,
    );
  });

  test("Codex HookPrompt adapter injects model-visible additionalContext", () => {
    const codexSource = buildHookPromptAdapterSource("codex");
    const cursorSource = buildHookPromptAdapterSource("cursor");

    assert.match(codexSource, /hookSpecificOutput/);
    assert.match(codexSource, /hookEventName:\s*"UserPromptSubmit"/);
    assert.match(codexSource, /additionalContext/);
    assert.doesNotMatch(codexSource, /systemMessage:\s*additionalContext/);
    assert.match(cursorSource, /prompt:\s*additionalContext/);
  });

  test("does not emit quoted absolute Node paths that fail in PowerShell", () => {
    const hookPath = "C:\\Users\\Example\\Path With Spaces\\meta-kim-memory-save.mjs";
    const config = buildCodexProjectHooksJson({
      memoryHookPath: hookPath,
    });
    const command = config.hooks.SessionStart[0].hooks[0].command;

    assert.equal(command, `node ${JSON.stringify(hookPath)} --event session-start`);
    assert.doesNotMatch(command, /Program Files/);
    assert.doesNotMatch(command, /^"/);
  });

  test("graphify hook script exits cleanly when no graph exists", () => {
    const source = buildCodexGraphifyContextHook();

    assert.match(source, /existsSync\(graphPath\)/);
    assert.match(source, /systemMessage/);
    assert.doesNotMatch(source, /\[ -f|\|\| true|2>\/dev\/null/);
  });
});

describe("sync-runtimes / OpenClaw template portability", () => {
  test("canonical OpenClaw template uses forward-slash placeholders", async () => {
    const templateRaw = await readFsFile(
      "canonical/runtime-assets/openclaw/openclaw.template.json",
      "utf8",
    );

    assert.doesNotMatch(templateRaw, /__REPO_ROOT__\\/);
    assert.match(templateRaw, /__REPO_ROOT__\/openclaw\/workspaces/);
    assert.match(templateRaw, /__REPO_ROOT__\/openclaw\/skills/);
    assert.doesNotMatch(templateRaw, /before_tool_call/);
  });
});

describe("sync-runtimes / Codex skills", () => {
  test("emits Codex-compatible skill frontmatter with only name and description", () => {
    const rendered = buildCodexSkillContent(`---
name: meta-theory
version: 3.0.0
author: KimYx0207
user-invocable: true
trigger: "meta theory"
tools:
  - shell
description: Meta Arsenal dispatcher
---

# Meta Arsenal

Body content.
`);

    const frontmatter = rendered.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    assert.match(frontmatter, /^name: meta-theory$/m);
    assert.match(frontmatter, /^description: Meta Arsenal dispatcher$/m);
    assert.doesNotMatch(frontmatter, /^version:/m);
    assert.doesNotMatch(frontmatter, /^author:/m);
    assert.doesNotMatch(frontmatter, /^user-invocable:/m);
    assert.doesNotMatch(frontmatter, /^trigger:/m);
    assert.doesNotMatch(frontmatter, /^tools:/m);
  });

  test("rewrites canonical agent references with runtime-native extensions", () => {
    const source =
      "Agent source: canonical/agents/meta-warden.md, canonical/agents/*.md, and canonical/agents/{name}.md";

    assert.equal(
      applyRuntimePaths(source, "claude"),
      "Agent source: .claude/agents/meta-warden.md, .claude/agents/*.md, and .claude/agents/{name}.md",
    );
    assert.equal(
      applyRuntimePaths(source, "codex"),
      "Agent source: .codex/agents/meta-warden.toml, .codex/agents/*.toml, and .codex/agents/{name}.toml",
    );
    assert.equal(
      applyRuntimePaths(source, "cursor"),
      "Agent source: .cursor/agents/meta-warden.md, .cursor/agents/*.md, and .cursor/agents/{name}.md",
    );
    assert.equal(
      applyRuntimePaths(source, "openclaw"),
      "Agent source: openclaw/workspaces/meta-warden/SOUL.md, openclaw/workspaces/*/SOUL.md, and openclaw/workspaces/{name}/SOUL.md",
    );
  });

  test("keeps cross-runtime Fetch checklist paths literal in runtime skill mirrors", () => {
    const source = `Fetch discovery minimum checklist: before Thinking, search at least these locations (even if results are empty):
- canonical sources and capability indexes: \`canonical/agents/\`, \`canonical/skills/\`, \`canonical/runtime-assets/\`, \`config/capability-index/*.json\`, and runtime capability-index mirrors
- Claude Code project and global inventories: \`.claude/agents/\`, \`.claude/skills/\`, \`.claude/commands/\`, \`.claude/hooks/\`, \`.claude/settings.json\`, \`~/.claude/agents/\`, \`~/.claude/skills/\`, \`~/.claude/commands/\`, \`~/.claude/hooks/\`, and \`~/.claude/settings.json\`
- Cursor project and global inventories: \`.cursor/agents/\`, \`.cursor/skills/\`, \`.cursor/rules/\`, \`.cursor/prompts/\`, \`.cursor/hooks/\`, \`.cursor/hooks.json\`, \`.cursor/mcp.json\`, \`~/.cursor/agents/\`, \`~/.cursor/skills/\`, \`~/.cursor/rules/\`, \`~/.cursor/prompts/\`, \`~/.cursor/hooks/\`, and \`~/.cursor/hooks.json\`
- OpenClaw project and global inventories: \`openclaw/workspaces/\`, \`openclaw/skills/\`, \`openclaw/hooks/\`, \`openclaw/openclaw.template.json\`, \`~/.openclaw/openclaw.json\`, \`~/.openclaw/workspace-*\`, \`~/.openclaw/skills/\`, \`~/.openclaw/hooks/\`, and \`~/.agents/skills/\`

Pass condition: searchLog exists.
`;

    for (const target of ["claude", "codex", "cursor", "openclaw"]) {
      assert.equal(applyRuntimePaths(source, target), source);
    }
  });
});

describe("sync-runtimes / Codex agents", () => {
  test("emits Codex TOML nickname candidates for canonical meta agents", () => {
    const rendered = buildCodexAgent({
      id: "meta-warden",
      description: "Coordinates dispatch and final synthesis",
      body: "Body instructions",
    });

    assert.match(rendered, /^name = "meta-warden"$/m);
    assert.match(
      rendered,
      /^nickname_candidates = \["Meta Warden", "Warden", "meta-warden"\]$/m,
    );
    assert.match(rendered, /^developer_instructions = """$/m);
    assert.doesNotMatch(rendered, /代码库分析|执行|审查|验证/);
  });

  test("emits Codex runtime adapter agents for built-in worker and explorer names", () => {
    const adapterIds = CODEX_RUNTIME_ADAPTER_AGENTS.map((agent) => agent.id);
    assert.deepEqual(adapterIds, ["worker", "explorer"]);

    for (const agent of CODEX_RUNTIME_ADAPTER_AGENTS) {
      const rendered = buildCodexRuntimeAdapterAgent(agent);
      assert.match(rendered, new RegExp(`^name = "${agent.id}"$`, "m"));
      assert.match(rendered, /^nickname_candidates = \[/m);
      assert.match(rendered, /runtimeInstanceAlias/);
      assert.match(rendered, /roleDisplayName/);
      assert.match(rendered, /not a canonical durable Meta_Kim owner|Do not edit files/);
    }
  });

  test("emits Codex business-role custom agents with stable role names", () => {
    const roleIds = CODEX_BUSINESS_ROLE_AGENTS.map((agent) => agent.id);
    assert.deepEqual(roleIds, [
      "frontend",
      "backend",
      "test",
      "review",
      "analysis",
      "verify",
      "docs",
    ]);

    for (const agent of CODEX_BUSINESS_ROLE_AGENTS) {
      const rendered = buildCodexBusinessRoleAgent(agent);
      assert.match(rendered, new RegExp(`^name = "${agent.id}"$`, "m"));
      assert.match(
        rendered,
        new RegExp(`Use this role only when the task packet's roleDisplayName is ${agent.roleDisplayName}`),
      );
      assert.match(rendered, /^nickname_candidates = \[/m);
      assert.match(rendered, /runtimeInstanceAlias/);
      assert.doesNotMatch(rendered, /Popper|Zeno|agent-019e/);
    }
  });

  test("treats generated Codex adapter files as runtime agent projections", () => {
    assert.equal(
      inferProjectCategory(p(".codex", "agents", "worker.toml"), REPO),
      CATEGORIES.F,
    );
    assert.equal(
      inferProjectCategory(p(".codex", "agents", "explorer.toml"), REPO),
      CATEGORIES.F,
    );
    assert.equal(
      inferProjectCategory(p(".codex", "agents", "frontend.toml"), REPO),
      CATEGORIES.F,
    );
  });
});

describe("sync-runtimes / Cursor agents", () => {
  test("emits Cursor-required YAML frontmatter", () => {
    const rendered = buildCursorAgent({
      id: "meta-warden",
      title: "Meta-Warden",
      summary: "Coordinates the team",
      sourceFile: "canonical/agents/meta-warden.md",
      description: "Coordinates dispatch and final synthesis",
      body: "Body instructions",
    });

    assert.match(rendered, /^---\nname: meta-warden\n/);
    assert.match(
      rendered,
      /description: "Coordinates dispatch and final synthesis"\n---\n\n# Meta-Warden/,
    );
    assert.doesNotMatch(rendered, /nickname_candidates/);
    assert.doesNotMatch(rendered, /^name = /m);
  });

  test("does not duplicate Cursor mirror preamble when canonical body already carries it", () => {
    const body = `# Meta-Warden

> ⚠️ **GOVERNANCE LAYER AGENT — NOT FOR DIRECT EXECUTION**

Body instructions`;
    const rendered = buildCursorAgent({
      id: "meta-warden",
      title: "Meta-Warden",
      summary: "Coordinates the team",
      sourceFile: "canonical/agents/meta-warden.md",
      description: "Coordinates dispatch and final synthesis",
      body,
    });

    assert.equal((rendered.match(/^# Meta-Warden$/gm) ?? []).length, 1);
    assert.equal(
      (rendered.match(/GOVERNANCE LAYER AGENT — NOT FOR DIRECT EXECUTION/g) ?? []).length,
      1,
    );
  });
});

describe("sync-runtimes / Cursor project hooks", () => {
  test("uses Cursor native lowerCamel lifecycle hooks", () => {
    const config = buildCursorProjectHooksJson();

    assert.equal(config.hooks.sessionStart, undefined);
    assert.match(
      config.hooks.beforeSubmitPrompt[0].command,
      /activate-meta-theory-spine\.mjs/,
    );
    assert.equal(config.hooks.beforeSubmitPrompt.length, 1);

    const preToolUse = config.hooks.preToolUse;

    const enforceEntry = preToolUse.find((entry) =>
      entry.command?.includes("enforce-agent-dispatch.mjs"),
    );
    assert(enforceEntry, "enforce-agent-dispatch should be registered");
    assert.equal(
      preToolUse[0],
      enforceEntry,
      "enforce-agent-dispatch must run before any other preToolUse hook",
    );
    assert.equal(
      enforceEntry.failClosed,
      true,
      "enforce-agent-dispatch must be failClosed so the deny payload is honored",
    );

    const graphifyEntry = preToolUse.find((entry) =>
      entry.command?.includes("graphify-context.mjs"),
    );
    assert(graphifyEntry, "graphify-context should still be registered");

    assert.equal(config.hooks.stop, undefined);
    assert.doesNotMatch(JSON.stringify(config), /meta-kim-memory-save\.mjs/);
    assert.doesNotMatch(JSON.stringify(config), /hookprompt-adapter\.mjs/);
    assert.doesNotMatch(JSON.stringify(config), /planning-with-files-adapter\.mjs/);
  });
});
