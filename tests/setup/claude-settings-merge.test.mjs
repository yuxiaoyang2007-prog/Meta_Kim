import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildMetaKimHooksTemplate,
  hookCommandNode,
  rewriteRepoHookCommandsToAbsolute,
} from "../../scripts/claude-settings-merge.mjs";

describe("Claude settings hook command rendering", () => {
  test("normalizes Windows paths to slash form before writing shell commands", () => {
    const command = hookCommandNode("C:\\Users\\Kim\\.claude\\hooks\\meta-kim\\stop-compaction.mjs");

    assert.equal(command, 'node "C:/Users/Kim/.claude/hooks/meta-kim/stop-compaction.mjs"');
    assert.doesNotMatch(command, /\\/);
  });

  test("global hook template emits slash-normalized absolute paths", () => {
    const template = buildMetaKimHooksTemplate("C:\\Users\\Kim\\.claude\\hooks\\meta-kim");
    const command = template.Stop[0].hooks[0].command;

    assert.equal(command, 'node "C:/Users/Kim/.claude/hooks/meta-kim/stop-compaction.mjs"');
  });

  test("repo hook rewrite keeps Windows absolute paths shell portable", () => {
    const settings = {
      hooks: {
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

    rewriteRepoHookCommandsToAbsolute(settings, "D:\\KimProject\\Meta_Kim");

    assert.equal(
      settings.hooks.Stop[0].hooks[0].command,
      'node "D:/KimProject/Meta_Kim/.claude/hooks/stop-memory-save.mjs"',
    );
  });
});
