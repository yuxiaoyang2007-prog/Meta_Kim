import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("Kim_Decision is state-machine routed and not code executor", () => {
  const result = spawnSync(process.execPath, ["scripts/discover-dependency-capabilities.mjs", "--json"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  const kim = output.discoveredDependencyProjects.find((project) => project.id === "kim-decision");
  assert(kim);
  assert.notEqual(kim.routeEligibility, "callable");
  assert(kim.canNotDo.some((item) => /code executor|implementation/i.test(item)));
  assert.doesNotMatch(JSON.stringify(kim), /D:[/\\]KimProject[/\\]Kim_Decision/i);
});
