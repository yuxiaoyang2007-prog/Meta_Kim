import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  ensureCodexRequestUserInputFeature,
  hasCodexRequestUserInputFeature,
} from "../../scripts/codex-config-merge.mjs";

describe("Codex config merge", () => {
  test("adds features section when missing", () => {
    const out = ensureCodexRequestUserInputFeature('model = "gpt-5.5"\n');
    assert.match(out, /\[features\]\ndefault_mode_request_user_input = true/);
    assert.equal(hasCodexRequestUserInputFeature(out), true);
  });

  test("enables existing false value without changing unrelated settings", () => {
    const input = [
      'model = "gpt-5.5"',
      "",
      "[features]",
      "multi_agent = true",
      "default_mode_request_user_input = false",
      "",
      "[agents]",
      "max_threads = 6",
      "",
    ].join("\n");

    const out = ensureCodexRequestUserInputFeature(input);
    assert.match(out, /multi_agent = true/);
    assert.match(out, /default_mode_request_user_input = true/);
    assert.match(out, /\[agents\]\nmax_threads = 6/);
    assert.equal(hasCodexRequestUserInputFeature(out), true);
  });

  test("inserts into existing features section before the next table", () => {
    const input = [
      "[features]",
      "multi_agent = true",
      "[mcp_servers.github]",
      'command = "npx"',
      "",
    ].join("\n");

    const out = ensureCodexRequestUserInputFeature(input);
    assert.match(
      out,
      /\[features\]\nmulti_agent = true\ndefault_mode_request_user_input = true\n\[mcp_servers\.github\]/,
    );
  });
});
