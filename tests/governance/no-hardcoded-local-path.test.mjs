import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("governance scripts and registries do not hardcode personal Kim_Decision path", () => {
  for (const file of [
    "scripts/discover-dependency-capabilities.mjs",
    "config/capability-index/dependency-project-registry.json",
    "config/capability-index/weapon-registry.json",
    "config/governance/decision-pattern-catalog.json",
  ]) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /D:[/\\]KimProject[/\\]Kim_Decision/i, file);
  }
});
