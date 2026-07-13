import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  REPO_ROOT,
  buildProjectInventory,
  classifyTrackedTests,
} from "../../scripts/project-inventory.mjs";

describe("project inventory and standard test-suite coverage", () => {
  test("classifies unknown tracked test directories as uncovered", () => {
    const result = classifyTrackedTests([
      "tests/unit/example.test.mjs",
      "tests/unregistered/example.test.mjs",
    ]);
    assert.equal(result.counts.unit, 1);
    assert.deepEqual(result.unmatched, ["tests/unregistered/example.test.mjs"]);
  });

  test("every tracked test belongs to an explicit standard suite", () => {
    const inventory = buildProjectInventory();
    assert.equal(
      inventory.testSuiteCoverageOk,
      true,
      `Uncovered tracked tests: ${inventory.unmatchedTrackedTests.join(", ")}; command mismatches: ${JSON.stringify(inventory.suiteCommandMismatches)}`,
    );
    assert.deepEqual(inventory.unmatchedTrackedTests, []);
    assert.deepEqual(inventory.suiteCommandMismatches, []);
    assert.ok(inventory.testSuites.unit >= 1);
  });

  test("package scripts expose unit and inventory checks in the standard full chain", () => {
    const packageJson = JSON.parse(readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    assert.equal(
      packageJson.scripts["meta:test:unit"],
      'node scripts/run-node-tests.mjs "tests/unit/*.test.mjs" && npm run meta:test:poc-design-gate',
    );
    assert.equal(
      packageJson.scripts["meta:test:poc-design-gate"],
      'node scripts/run-node-tests.mjs "tests/poc-design-gate/*.test.mjs"',
    );
    assert.equal(
      packageJson.scripts["meta:test:inventory"],
      "node scripts/project-inventory.mjs --check-tests",
    );
    assert.equal(
      packageJson.scripts["meta:test:integration"],
      'node scripts/run-node-tests.mjs "tests/integration/*.test.mjs"',
    );
    assert.match(packageJson.scripts["meta:verify:governance"], /meta:test:integration/);
    assert.match(packageJson.scripts["meta:verify:governance:core"], /meta:test:governance/);
    assert.equal(
      packageJson.scripts["meta:verify:all:chain"],
      "npm run meta:verify:all",
      "the compatibility chain must delegate to the authoritative runner instead of duplicating its stages",
    );
    assert.match(packageJson.scripts["meta:theory:run"], /--emit-conversation-notice/);
    assert.equal(
      packageJson.scripts["meta:theory:run:notice"],
      packageJson.scripts["meta:theory:run"],
    );
    assert.match(packageJson.scripts["meta:theory:run:json"], /--no-emit-conversation-notice/);
    assert.match(packageJson.scripts["meta:test:unit"], /meta:test:poc-design-gate/);
  });
});
