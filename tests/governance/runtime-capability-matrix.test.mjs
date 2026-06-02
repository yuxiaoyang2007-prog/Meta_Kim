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
  const capabilityMap = (platform) =>
    new Map((platform.capabilities ?? []).map((capability) => [capability.capability, capability]));
  const cursor = capabilityMap(platforms.get("cursor"));
  assert.equal(cursor.get("hook")?.support, "native");
  assert.equal(cursor.get("hook")?.confidence, "verified_docs");
  assert.equal(cursor.get("subagent")?.support, "native");
  assert.equal(cursor.get("subagent")?.confidence, "verified_docs");
  assert.notEqual(cursor.get("native choice surface")?.support, "native");
  const openclaw = capabilityMap(platforms.get("openclaw"));
  assert.notEqual(openclaw.get("popup / overlay / approval UI")?.support, "native");
  assert.match(JSON.stringify(platforms.get("codex")), /explicitly requested/);
  assert.match(JSON.stringify(platforms.get("codex")), /trust review/);
  assert.match(JSON.stringify(platforms.get("openclaw")), /Third-party skills/);
  assert.match(JSON.stringify(platforms.get("openclaw")), /typed plugin hooks/);
  assert.match(JSON.stringify(platforms.get("openclaw")), /not a hard sandbox/);
});
