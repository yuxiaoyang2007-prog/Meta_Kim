import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("strict intent validator rejects incomplete real run", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "meta-kim-intent-"));
  const file = path.join(dir, "run.json");
  writeFileSync(file, JSON.stringify({ realIntent: "", successCriteria: [], evidence: { confirmed: [], userProvided: [], inference: [], unconfirmed: [] }, pathCandidates: [] }));
  const result = spawnSync(process.execPath, ["scripts/validate-intent-amplification.mjs", "--strict", "--input", file], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  rmSync(dir, { recursive: true, force: true });
});
