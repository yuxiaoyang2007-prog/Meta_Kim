import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("node test wrapper streams child output instead of buffering the suite", () => {
  const source = readFileSync("scripts/run-node-tests.mjs", "utf8");

  assert.match(source, /import \{ spawn as nativeSpawn \} from "node:child_process";/u);
  assert.match(source, /stdio: \["ignore", "inherit", "inherit"\]/u);
  assert.match(source, /--exclude-import/u);
  assert.match(source, /--include-import/u);
  assert.doesNotMatch(source, /const result = nativeSpawnSync\(/u);
});
