import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildMetaKimHooksTemplate,
  hookCommandNode,
  mergeGlobalMetaKimHooksIntoSettings,
  mergeRepoClaudeSettings,
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
    const command = template.PreToolUse[0].hooks[0].command;

    assert.equal(command, 'node "C:/Users/Example/.claude/hooks/meta-kim/block-dangerous-bash.mjs"');
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

  test("global settings merge removes old managed events no longer in the template", () => {
    const template = buildMetaKimHooksTemplate(
      "C:\\Users\\Example\\.claude\\hooks\\meta-kim",
    );
    const merged = mergeGlobalMetaKimHooksIntoSettings(
      {
        hooks: {
          Stop: [
            {
              hooks: [
                {
                  type: "command",
                  command:
                    'node "C:/Users/Example/.claude/hooks/meta-kim/stop-compaction.mjs"',
                },
              ],
            },
          ],
        },
      },
      template,
    );

    assert.equal(merged.hooks.Stop, undefined);
    assert.match(
      JSON.stringify(merged.hooks),
      /block-dangerous-bash\.mjs/,
    );
  });

  test("repo settings merge keeps project hook commands relative", () => {
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
            ],
          },
        ],
      },
    };

    const merged = mergeRepoClaudeSettings({}, canonical, "/Users/delphi/work/Finance");
    const command = merged.hooks.PreToolUse[0].hooks[0].command;

    assert.equal(
      command,
      "node .claude/hooks/graphify-context.mjs",
    );
    assert.doesNotMatch(command, /\/Users\/delphi\/work\/Finance/);
  });

  test("repo settings merge replaces legacy Meta_Kim hook entries with relative commands", () => {
    const base = {
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
                command:
                  'node "D:/Old/Meta_Kim/.claude/hooks/stop-spine-cleanup.mjs"',
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
      "node .claude/hooks/enforce-agent-dispatch.mjs",
      "node .claude/hooks/stop-spine-cleanup.mjs",
    ]);
  });

  test("repo settings merge removes old managed events no longer in canonical settings", () => {
    const merged = mergeRepoClaudeSettings(
      {
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
        },
      },
      {
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [
                {
                  type: "command",
                  command: "node .claude/hooks/graphify-context.mjs",
                },
              ],
            },
          ],
        },
      },
      "/Users/delphi/work/Finance",
    );

    assert.equal(merged.hooks.SessionStart, undefined);
    assert.match(JSON.stringify(merged.hooks), /graphify-context\.mjs/);
  });
});
