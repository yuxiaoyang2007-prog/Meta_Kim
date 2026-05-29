import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("evolution reference requires scar prevention rule and test", () => {
  const text = readFileSync("canonical/skills/meta-theory/references/evolution-writeback.md", "utf8");
  assert.match(text, /failurePattern/);
  assert.match(text, /preventionRule/);
  assert.match(text, /test/);
  assert.match(text, /nextRunReuseKey/);
});
