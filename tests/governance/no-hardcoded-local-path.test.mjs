import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const MAINTAINER_PATH_PATTERNS = [
  /\b[A-Za-z]:[/\\]KimProject(?:[/\\]|$)/iu,
  /\b[A-Za-z]:[/\\]Users[/\\]Kim(?:[/\\]|$)/iu,
];

function collectMaintainerPaths(value, location = "$") {
  if (typeof value === "string") {
    return MAINTAINER_PATH_PATTERNS.some((pattern) => pattern.test(value))
      ? [{ location, value }]
      : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectMaintainerPaths(entry, `${location}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) =>
      collectMaintainerPaths(entry, `${location}.${key}`),
    );
  }
  return [];
}

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

test("dependency registry contains no maintainer drive paths", () => {
  const registry = JSON.parse(
    readFileSync("config/capability-index/dependency-project-registry.json", "utf8"),
  );
  assert.deepEqual(
    collectMaintainerPaths(registry),
    [],
    "use repository URI/revision evidence instead of a maintainer workspace path",
  );
  assert.deepEqual(
    collectMaintainerPaths({ examples: ["C:/path/to/project", "D:/Project/example"] }),
    [],
    "generic Windows path examples are documentation, not maintainer path leakage",
  );
});
