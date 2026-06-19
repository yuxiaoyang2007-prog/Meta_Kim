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

  test("Claude global hook template keeps native HookPrompt before Meta_Kim spine", () => {
    const template = buildMetaKimHooksTemplate(
      "C:\\Users\\Example\\.claude\\hooks\\meta-kim",
      "D:\\KimProject\\Meta_Kim",
      {
        hookPromptCommand:
          'node "C:/Users/Example/.claude/hooks/user-prompt-submit.js"',
      },
    );
    const promptHooks = template.UserPromptSubmit[0].hooks;

    assert.match(promptHooks[0].command, /user-prompt-submit\.js/);
    assert.match(promptHooks[1].command, /activate-meta-theory-spine\.mjs/);
    assert.doesNotMatch(
      JSON.stringify(promptHooks),
      /hookprompt-adapter\.mjs/,
    );
  });

  test("global settings merge keeps native HookPrompt block before existing prompt hooks", () => {
    const base = {
      hooks: {
        UserPromptSubmit: [
          {
            matcher: ".*",
            hooks: [
              {
                type: "command",
                command: 'node "C:/Users/Example/.claude/hooks/optional.js"',
              },
            ],
          },
        ],
      },
    };
    const template = buildMetaKimHooksTemplate(
      "C:\\Users\\Example\\.claude\\hooks\\meta-kim",
      "D:\\KimProject\\Meta_Kim",
      {
        hookPromptCommand:
          'node "C:/Users/Example/.claude/hooks/user-prompt-submit.js"',
      },
    );

    const merged = mergeGlobalMetaKimHooksIntoSettings(base, template);
    const promptHooks = merged.hooks.UserPromptSubmit.flatMap(
      (block) => block.hooks ?? [],
    );

    assert.match(promptHooks[0].command, /user-prompt-submit\.js/);
    assert.match(promptHooks[1].command, /activate-meta-theory-spine\.mjs/);
    assert.match(promptHooks[2].command, /optional\.js/);
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

  test("global settings merge replaces legacy root Meta_Kim hook commands", () => {
    const base = {
      hooks: {
        UserPromptSubmit: [
          {
            hooks: [
              {
                type: "command",
                command:
                  'node ".claude/hooks/activate-meta-theory-spine.mjs"',
              },
            ],
          },
        ],
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command",
                command:
                  'node "C:/Users/Example/.claude/hooks/block-dangerous-bash.mjs"',
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
      commands.some((entry) => entry.includes(".claude/hooks/activate-meta-theory-spine.mjs")),
      false,
    );
    assert.equal(
      commands.some((entry) => entry.includes(".claude/hooks/block-dangerous-bash.mjs")),
      false,
    );
    assert.ok(
      commands.includes(
        'node "C:/Users/Example/.claude/hooks/meta-kim/activate-meta-theory-spine.mjs"',
      ),
    );
    assert.ok(
      commands.includes(
        'node "C:/Users/Example/.claude/hooks/meta-kim/block-dangerous-bash.mjs"',
      ),
    );
  });

  test("repo settings merge does not re-add project hook commands", () => {
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

    assert.deepEqual(merged.hooks, {});
  });

  test("repo settings merge removes legacy Meta_Kim hook entries", () => {
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

    assert.deepEqual(commands, []);
  });

  test("repo settings merge keeps user hooks while removing managed hooks", () => {
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
                {
                  type: "command",
                  command: "node .claude/hooks/user-session-start.mjs",
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

    assert.match(JSON.stringify(merged.hooks), /user-session-start\.mjs/);
    assert.doesNotMatch(JSON.stringify(merged.hooks), /meta-kim-memory-save\.mjs/);
    assert.doesNotMatch(JSON.stringify(merged.hooks), /graphify-context\.mjs/);
  });
});
