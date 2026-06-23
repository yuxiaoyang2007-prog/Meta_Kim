import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function readRepoFile(...parts) {
  return readFileSync(path.join(root, ...parts), "utf8");
}

describe("open source health files", () => {
  test("repository exposes community health entrypoints", () => {
    for (const filePath of [
      "CONTRIBUTING.md",
      "SECURITY.md",
      "CODE_OF_CONDUCT.md",
      "CODEOWNERS",
      ".github/pull_request_template.md",
      ".github/dependabot.yml",
    ]) {
      assert.equal(existsSync(path.join(root, filePath)), true, `${filePath} should exist`);
    }
  });

  test("CODEOWNERS uses the repository maintainer instead of a placeholder", () => {
    const source = readRepoFile("CODEOWNERS");

    assert.match(source, /^\*\s+@KimYx0207\s*$/m);
    assert.doesNotMatch(source, /placeholder|owner-team|@owner\b/i);
  });

  test("contributing guide keeps Meta_Kim evidence layers separate", () => {
    const source = readRepoFile("CONTRIBUTING.md");

    assert.match(source, /canonical\/agents/);
    assert.match(source, /runtime folders/i);
    assert.match(source, /generated mirrors/);
    assert.match(source, /structural or schema checks/);
    assert.match(source, /user-visible output evidence/);
    assert.match(source, /public-ready or release-ready evidence/);
    assert.match(source, /Do not claim a native choice surface/);
  });

  test("security policy covers runtime and MCP sensitive areas", () => {
    const source = readRepoFile("SECURITY.md");

    assert.match(source, /private vulnerability reporting/);
    assert.match(source, /MCP Memory Service/);
    assert.match(source, /hook execution/);
    assert.match(source, /install, update, uninstall/);
    assert.match(source, /validator pass does not close/);
  });

  test("dependabot covers npm dependencies and GitHub Actions updates", () => {
    const source = readRepoFile(".github", "dependabot.yml");

    assert.match(source, /package-ecosystem:\s*npm/);
    assert.match(source, /package-ecosystem:\s*github-actions/);
    assert.match(source, /interval:\s*weekly/);
    assert.match(source, /interval:\s*monthly/);
  });
});
