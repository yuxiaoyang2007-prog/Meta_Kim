import assert from "node:assert/strict";
import test from "node:test";
import { readJson } from "../meta-theory/_helpers.mjs";

test("dependency projects have capability cards and Kim_Decision stays reference-only", async () => {
  const registry = await readJson("config/capability-index/dependency-project-registry.json");
  assert.equal(registry.projects.some((project) => project.id === "kim-decision"), false);
  for (const project of registry.projects) {
    assert.ok(project.capabilityCard, `${project.id} missing capabilityCard`);
    assert.ok(project.capabilityCard.inputContract, `${project.id} missing inputContract`);
    assert.ok(project.capabilityCard.outputContract, `${project.id} missing outputContract`);
    assert.ok(project.capabilityCard.triggerConditions?.length, `${project.id} missing triggerConditions`);
    assert.ok(project.capabilityCard.verificationMethods?.length, `${project.id} missing verificationMethods`);
  }

  const patterns = await readJson("config/governance/decision-pattern-catalog.json");
  assert.equal(patterns.sourceBoundary.notADependency, true);
  assert.equal(patterns.sourceBoundary.notInvokable, true);
  assert.ok(patterns.stagePatterns.some((pattern) => pattern.id === "thinking-minimum-test"));
});
