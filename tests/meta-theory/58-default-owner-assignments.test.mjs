import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const doc = readFileSync(
  resolve(repoRoot, "canonical/skills/meta-theory/references/dev-governance.md"),
  "utf8",
);

test("58 — Default Owner Assignments section exists", () => {
  assert.match(
    doc,
    /## Default Owner Assignments/,
    "dev-governance.md must contain the Default Owner Assignments section header",
  );
});

test("58 — table names all required wave rows with the right owner", () => {
  // Each required (row-substring, owner) must co-occur in the table block.
  const required = [
    ["Fetch — capability discovery", "meta-scout"],
    ["Fetch — graph + memory", "meta-librarian"],
    ["Thinking — owner match", "meta-conductor"],
    ["Thinking — capability loadout", "meta-artisan"],
    ["Execution — worker task", "runtime-discovered professional owner"],
    ["Review — adversarial correctness", "meta-prism"],
    ["Review — adversarial security", "meta-prism"],
    ["Review — adversarial completeness", "meta-prism"],
    ["Meta-Review — gate approval", "meta-warden"],
    ["Evolution — writeback coordination", "meta-chrysalis"],
  ];
  const sectionStart = doc.indexOf("## Default Owner Assignments");
  const sectionEnd = doc.indexOf("\n### Wave Hard Rules", sectionStart);
  assert.notEqual(sectionStart, -1);
  assert.notEqual(sectionEnd, -1, "Wave Hard Rules must come after Default Owner Assignments");
  const tableBlock = doc.slice(sectionStart, sectionEnd);

  // Each row substring AND its owner must appear in the table block.
  for (const [rowSubstring, owner] of required) {
    assert.ok(
      tableBlock.includes(rowSubstring),
      `table must contain row "${rowSubstring}"`,
    );
    assert.ok(
      tableBlock.includes(owner),
      `table row "${rowSubstring}" must bind to owner ${owner}`,
    );
  }
});

test("58 — hard rule forbids general-purpose fallback for every execution owner", () => {
  assert.match(
    doc,
    /A dispatch that picks `?general-purpose`? as an execution owner is a protocol violation/,
    "Wave Hard Rules must ban general-purpose execution owners",
  );
});

test("58 — history note records the structural fix at v2.8.63", () => {
  assert.match(
    doc,
    /From v2\.8\.63 onward named governance roles became the default/,
    "history note must preserve v2.8.63 while documenting the current professional-owner rule",
  );
});
