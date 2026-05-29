import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("runtime matrix preserves native and partial capabilities honestly", () => {
  const matrix = JSON.parse(readFileSync("config/runtime-capability-matrix.json", "utf8"));
  for (const platform of matrix.platforms) {
    const caps = new Map(platform.capabilities.map((cap) => [cap.capability, cap]));
    for (const required of ["skill", "shell", "filesystem", "apply_patch / edit", "MCP", "memory", "graph", "hook"]) {
      assert.notEqual(caps.get(required)?.support, "unsupported", `${platform.platform}.${required}`);
    }
  }
  const cursor = matrix.platforms.find((item) => item.platform === "cursor");
  assert.notEqual(cursor.capabilities.find((cap) => cap.capability === "hook")?.support, "native");
});
