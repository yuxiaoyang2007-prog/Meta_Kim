import assert from "node:assert/strict";
import test from "node:test";
import { readJson } from "../meta-theory/_helpers.mjs";

test("runtime matrix covers platforms and critical constraints", async () => {
  const matrix = await readJson("config/runtime-capability-matrix.json");
  const platforms = new Map(matrix.platforms.map((entry) => [entry.platform, entry]));
  for (const runtime of ["claude_code", "codex", "openclaw", "cursor"]) {
    assert.ok(platforms.has(runtime), `missing ${runtime}`);
  }
  const raw = JSON.stringify(matrix);
  for (const osName of ["macos", "windows", "wsl2"]) assert.match(raw, new RegExp(osName));
  for (const platform of matrix.platforms) {
    for (const capability of platform.capabilities ?? []) {
      assert.notEqual(capability.support === "native" && capability.confidence === "unverified", true);
    }
  }
  const cursor = JSON.stringify(platforms.get("cursor"));
  assert.doesNotMatch(cursor, /"native"\s*,\s*"hook"/);
  assert.match(JSON.stringify(platforms.get("codex")), /explicitly requested/);
  assert.match(JSON.stringify(platforms.get("codex")), /trust review/);
  assert.match(JSON.stringify(platforms.get("openclaw")), /Third-party skills/);
});
