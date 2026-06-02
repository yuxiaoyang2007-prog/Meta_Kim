import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildMetaKimHooksTemplate,
  hookCommandNode,
  mergeGlobalMetaKimHooksIntoSettings,
  mergeRepoClaudeSettings,
  rewriteRepoHookCommandsToAbsolute,
} from "../../scripts/claude-settings-merge.mjs";

describe("Claude settings hook command rendering", () => {
  test("normalizes Windows paths to slash form before writing shell commands", () => {
    const command = hookCommandNode(
      "C:\\Users\\Example\\.claude\\hooks\\meta-kim\\stop-compaction.mjs",
    );

    assert.equal(command, 'node "C:/Users/Example/.claude/hooks/meta-kim/stop-compaction.mjs"');
    assert.doesNotMatch(command, /\\/);
  });

  test("global hook template emits slash-normalized absolute paths", () => {
    const template = buildMetaKimHooksTemplate("C:\\Users\\Example\\.claude\\hooks\\meta-kim");
    const command = template.Stop[0].hooks[0].command;

    assert.equal(command, 'node "C:/Users/Example/.claude/hooks/meta-kim/stop-compaction.mjs"');
    const commands = Object.values(template)
      .flatMap((blocks) => blocks.flatMap((block) => block.hooks ?? []))
      .map((hook) => hook.command);
    assert.equal(
      commands.some((entry) => entry.includes("pre-git-push-confirm.mjs")),
      false,
    );
  });

  test("global settings merge strips retired git push confirmation hooks", () => {
    const base = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command",
                command:
                  'node "C:/Users/Example/.claude/hooks/pre-git-push-confirm.mjs"',
              },
              {
                type: "command",
                command: 'node "C:/Users/Example/.claude/hooks/custom.mjs"',
              },
            ],
          },
        ],
      },
    };
    const template = buildMetaKimHooksTemplate(
      "C:\\Users\\Example\\.claude\\hooks\\meta-kim",
    );

    const merged = mergeGlobalMetaKimHooksIntoSettings(base, template);
    const commands = Object.values(merged.hooks)
      .flatMap((blocks) => blocks.flatMap((block) => block.hooks ?? []))
      .map((hook) => hook.command);

    assert.equal(
      commands.some((entry) => entry.includes("pre-git-push-confirm.mjs")),
      false,
    );
    assert.ok(commands.includes('node "C:/Users/Example/.claude/hooks/custom.mjs"'));
  });

  test("repo hook rewrite keeps Windows absolute paths shell portable", () => {
    const settings = {
      hooks: {
        SessionStart: [
          {
            matcher: "startup|resume",
            hooks: [
              {
                type: "command",
                command: "node .claude/hooks/meta-kim-memory-save.mjs --event session-start",
              },
            ],
          },
        ],
        Stop: [
          {
            hooks: [
              {
                type: "command",
                command: "node .claude/hooks/stop-memory-save.mjs",
              },
            ],
          },
        ],
      },
    };

    rewriteRepoHookCommandsToAbsolute(settings, "D:\\Projects\\Meta_Kim");

    assert.equal(
      settings.hooks.SessionStart[0].hooks[0].command,
      'node "D:/Projects/Meta_Kim/.claude/hooks/meta-kim-memory-save.mjs" --event session-start',
    );
    assert.equal(
      settings.hooks.Stop[0].hooks[0].command,
      'node "D:/Projects/Meta_Kim/.claude/hooks/stop-memory-save.mjs"',
    );
  });

  test("repo settings merge emits absolute hook paths for any launch cwd", () => {
    const canonical = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command",
                command: "node .claude/hooks/block-dangerous-bash.mjs",
              },
            ],
          },
        ],
      },
    };

    const merged = mergeRepoClaudeSettings({}, canonical, "/Users/delphi/work/Finance");
    const command = merged.hooks.PreToolUse[0].hooks[0].command;

    assert.equal(
      command,
      'node "/Users/delphi/work/Finance/.claude/hooks/block-dangerous-bash.mjs"',
    );
    assert.doesNotMatch(command, /^node \.claude\/hooks\//);
  });

  test("repo settings merge removes legacy relative Meta_Kim hook entries", () => {
    const base = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command",
                command: "node .claude/hooks/activate-meta-theory-spine.mjs",
              },
              {
                type: "command",
                command: "node .claude/hooks/enforce-agent-dispatch.mjs",
              },
            ],
          },
        ],
        Stop: [
          {
            matcher: "*",
            hooks: [
              {
                type: "command",
                command: "node .claude/hooks/stop-spine-cleanup.mjs",
              },
            ],
          },
        ],
      },
    };
    const canonical = {
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command",
                command: "node .claude/hooks/enforce-agent-dispatch.mjs",
              },
            ],
          },
        ],
        Stop: [
          {
            matcher: "*",
            hooks: [
              {
                type: "command",
                command: "node .claude/hooks/stop-spine-cleanup.mjs",
              },
            ],
          },
        ],
      },
    };

    const merged = mergeRepoClaudeSettings(base, canonical, "/Users/delphi/work/Finance");
    const commands = Object.values(merged.hooks)
      .flatMap((blocks) => blocks.flatMap((block) => block.hooks ?? []))
      .map((hook) => hook.command);

    assert.deepEqual(commands, [
      'node "/Users/delphi/work/Finance/.claude/hooks/enforce-agent-dispatch.mjs"',
      'node "/Users/delphi/work/Finance/.claude/hooks/stop-spine-cleanup.mjs"',
    ]);
  });
});
