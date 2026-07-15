import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  collectProtectedProjectCapabilityPaths,
  loadProjectCapabilityOwnershipPolicy,
  protectedProjectCapabilityIntersects,
} from "../../scripts/project-capability-ownership.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
const PROJECT_ROOT = path.resolve("/tmp/meta-kim-project-capability-owner");
const policy = loadProjectCapabilityOwnershipPolicy(REPO_ROOT);

function manifest(capability) {
  return {
    schemaVersion: "meta-kim-project-capabilities-v0.1",
    capabilities: [
      {
        runtime: "codex",
        type: "skill",
        id: "custom-skill",
        files: [{ relPath: ".agents/skills/custom-skill/SKILL.md" }],
        ...capability,
      },
    ],
  };
}

test("project capability ownership class protects Agent/Skill/Command paths", () => {
  const result = collectProtectedProjectCapabilityPaths(
    manifest({ ownershipClass: "runtime_sedimented_project_copy" }),
    PROJECT_ROOT,
    policy,
  );
  assert.equal(result.relativePaths.has(".agents/skills/custom-skill/SKILL.md"), true);
  assert.equal(
    protectedProjectCapabilityIntersects(".agents/skills/custom-skill", result),
    true,
  );
  assert.equal(
    protectedProjectCapabilityIntersects(".agents/skills/custom-skill/references/user-note.md", result),
    true,
  );
});

test("preserve_project_copy protects a path even when ownershipClass is legacy", () => {
  const result = collectProtectedProjectCapabilityPaths(
    manifest({
      ownershipClass: "legacy_project_copy",
      dependencyUpdatePolicy: "preserve_project_copy",
    }),
    PROJECT_ROOT,
    policy,
  );
  assert.equal(result.relativePaths.has(".agents/skills/custom-skill/SKILL.md"), true);
});

test("unrelated and unknown files are outside Meta_Kim project capability ownership", () => {
  const result = collectProtectedProjectCapabilityPaths(
    manifest({ ownershipClass: "global_reuse_reference" }),
    PROJECT_ROOT,
    policy,
  );
  assert.equal(result.relativePaths.size, 0);
  assert.equal(protectedProjectCapabilityIntersects(".agents/skills/user-owned", result), false);
});

test("project capability ownership rejects paths outside the project", () => {
  assert.throws(
    () =>
      collectProtectedProjectCapabilityPaths(
        {
          schemaVersion: "meta-kim-project-capabilities-v0.1",
          capabilities: [
            {
              type: "command",
              ownershipClass: "runtime_sedimented_project_copy",
              files: [{ relPath: "../outside.md" }],
            },
          ],
        },
        PROJECT_ROOT,
        policy,
      ),
    /Invalid protected project capability path/,
  );
});

test("one unknown capability type invalidates the whole ownership manifest", () => {
  assert.throws(
    () => collectProtectedProjectCapabilityPaths({
      schemaVersion: "meta-kim-project-capabilities-v0.1",
      capabilities: [
        manifest({ ownershipClass: "runtime_sedimented_project_copy" }).capabilities[0],
        { type: "plugin", files: [{ relPath: ".agents/plugins/unsafe" }] },
      ],
    }, PROJECT_ROOT, policy),
    /Invalid project capability ownership type/,
  );
});
