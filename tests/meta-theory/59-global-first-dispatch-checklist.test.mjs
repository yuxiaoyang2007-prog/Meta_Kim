import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const doc = readFileSync(
  resolve(repoRoot, "canonical/skills/meta-theory/references/dev-governance.md"),
  "utf8",
);
const contract = JSON.parse(readFileSync(
  resolve(repoRoot, "config/contracts/core-loop-contract.json"),
  "utf8",
));

test("59 — capability discovery lives inside Fetch rather than a competing Stage 0", () => {
  assert.match(doc, /### Adaptive capability discovery inside Fetch/);
  assert.doesNotMatch(doc, /^## Stage 0/mu);
  assert.equal(contract.stages.find((stage) => stage.stage === "Fetch")?.parallelPolicy.effectClass, "read_only_discovery");
});

test("59 — discovery uses cached light scan, stop-on-match, and bounded full-scan triggers", () => {
  assert.equal(contract.capabilityDiscovery.normalMode, "cached_global_inventory_plus_project_light_scan");
  for (const trigger of ["install", "update", "explicit_refresh", "missing_cache", "missing_required_provider"] ) {
    assert.ok(contract.capabilityDiscovery.fullScanTriggers.includes(trigger));
  }
  assert.match(doc, /Stop on a qualified match|Stop-on-match|stop on a qualified match/iu);
});

test("59 — merged inventory remains auditable without forcing irrelevant sources", () => {
  const requiredFields = contract.capabilityDiscovery.inventoryRecordRequiredFields;
  for (const field of ["id", "providerType", "sourcePath", "runtimeSupport", "ownerBoundary"]) {
    assert.ok(requiredFields.includes(field), `inventory contract missing ${field}`);
  }
  assert.match(doc, /sources actually checked/iu);
  assert.match(doc, /why any route-relevant source was skipped|rejected alternatives/iu);
});

test("59 — hardcoded and general-purpose owner fallback stay forbidden", () => {
  assert.match(doc, /capability-first routing, not hardcoded names/iu);
  assert.match(doc, /general-purpose.*not a silent fallback/iu);
  assert.match(doc, /Missing capability blocks|capability gap/iu);
});

test("59 — capability-index sources promised by the protocol exist", () => {
  for (const rel of [
    "config/capability-index/meta-kim-capabilities.json",
    "config/capability-index/provider-registry.json",
    "config/capability-index/weapon-registry.json",
    "config/capability-index/dependency-project-registry.json",
  ]) {
    assert.ok(existsSync(resolve(repoRoot, rel)), rel);
  }
});
