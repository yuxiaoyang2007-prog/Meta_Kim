import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const doc = readFileSync(
  resolve(repoRoot, "canonical/skills/meta-theory/references/dev-governance.md"),
  "utf8",
);

test("59 — Stage 0 Global-First Discovery section exists", () => {
  assert.match(
    doc,
    /## Stage 0 — Global-First Discovery Pre-Dispatch Checklist/,
    "dev-governance.md must contain the Stage 0 section header",
  );
});

test("59 — Stage 0 lists 7 ordered steps", () => {
  const sectionStart = doc.indexOf("## Stage 0 — Global-First Discovery");
  const sectionEnd = doc.indexOf("## 4-Stage Parallel Fan-out Protocol", sectionStart);
  assert.notEqual(sectionStart, -1);
  assert.notEqual(sectionEnd, -1, "Stage 0 must come before the 4-Stage Protocol");
  const block = doc.slice(sectionStart, sectionEnd);

  const requiredSteps = [
    "Read capability indexes",
    "Scan canonical sources",
    "Scan global runtime homes",
    "Scan runtime package providers",
    "Scan MCP and hook config",
    "Match owner",
    "Record the inventory",
  ];
  for (const step of requiredSteps) {
    assert.ok(block.includes(step), `Stage 0 must list step: ${step}`);
  }
});

test("59 — Stage 0 hard rules forbid hardcoded owners and silent general-purpose fallback", () => {
  const hardRules = [
    "Stage 0 is mandatory",
    "No hardcoded owner names",
    "No silent general-purpose fallback",
    "Inventory must be auditable",
    "Skipping a source requires a reason",
  ];
  for (const rule of hardRules) {
    assert.ok(doc.includes(rule), `Stage 0 must list hard rule: ${rule}`);
  }
});

test("59 — Stage 0 names the required inventory fields", () => {
  const required = ["scannedAt", "sources", "candidates", "selected", "gap"];
  for (const f of required) {
    assert.ok(doc.includes(`\`${f}\``), `inventory schema must mention field: ${f}`);
  }
});

test("59 — Stage 0 hard rule links to the 4-Stage Protocol below it", () => {
  const stage0Start = doc.indexOf("## Stage 0 — Global-First Discovery");
  const stage4Start = doc.indexOf("## 4-Stage Parallel Fan-out Protocol");
  assert.ok(stage0Start > -1 && stage4Start > -1);
  assert.ok(stage0Start < stage4Start, "Stage 0 must precede the 4-Stage Protocol");
});

test("59 — every capability-index source the protocol asks the dispatcher to read is real on disk", () => {
  const requiredSources = [
    "config/capability-index/meta-kim-capabilities.json",
    "config/capability-index/provider-registry.json",
    "config/capability-index/weapon-registry.json",
    "config/capability-index/dependency-project-registry.json",
  ];
  for (const rel of requiredSources) {
    const abs = resolve(repoRoot, rel);
    assert.ok(existsSync(abs), `Stage 0 promises this source exists: ${rel}`);
  }
});
