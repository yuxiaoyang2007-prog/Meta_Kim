import { describe, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  inferProjectCategory,
  inferProjectPurpose,
} from "../../scripts/sync-runtimes.mjs";
import { CATEGORIES } from "../../scripts/install-manifest.mjs";

const REPO = path.resolve("/fake/repo");

function p(...bits) {
  return path.join(REPO, ...bits);
}

describe("sync-runtimes / inferProjectCategory", () => {
  test("maps .claude/settings.json to category G", () => {
    assert.equal(
      inferProjectCategory(p(".claude/settings.json"), REPO),
      CATEGORIES.G,
    );
  });

  test("maps .mcp.json to category G", () => {
    assert.equal(inferProjectCategory(p(".mcp.json"), REPO), CATEGORIES.G);
  });

  test("maps openclaw template json to category G", () => {
    assert.equal(
      inferProjectCategory(p("openclaw/openclaw.template.json"), REPO),
      CATEGORIES.G,
    );
  });

  test("maps any .codex/ config file to category G", () => {
    assert.equal(
      inferProjectCategory(p(".codex/config.toml"), REPO),
      CATEGORIES.G,
    );
  });

  test("maps .claude/hooks/*.mjs to category E", () => {
    assert.equal(
      inferProjectCategory(p(".claude/hooks/stop-compaction.mjs"), REPO),
      CATEGORIES.E,
    );
  });

  test("maps runtime agents to category F across runtimes", () => {
    assert.equal(
      inferProjectCategory(p(".claude/agents/meta-warden.md"), REPO),
      CATEGORIES.F,
    );
    assert.equal(
      inferProjectCategory(p(".codex/agents/meta-warden.toml"), REPO),
      CATEGORIES.F,
    );
    assert.equal(
      inferProjectCategory(p(".cursor/agents/meta-warden.md"), REPO),
      CATEGORIES.F,
    );
  });

  test("maps runtime skills to category D across runtimes", () => {
    assert.equal(
      inferProjectCategory(p(".claude/skills/meta-theory/SKILL.md"), REPO),
      CATEGORIES.D,
    );
    assert.equal(
      inferProjectCategory(p(".codex/skills/meta-theory/SKILL.md"), REPO),
      CATEGORIES.D,
    );
    assert.equal(
      inferProjectCategory(p(".cursor/skills/meta-theory/SKILL.md"), REPO),
      CATEGORIES.D,
    );
    assert.equal(
      inferProjectCategory(p(".agents/skills/meta-theory/SKILL.md"), REPO),
      CATEGORIES.D,
    );
    assert.equal(
      inferProjectCategory(p("openclaw/skills/meta-theory/SKILL.md"), REPO),
      CATEGORIES.D,
    );
  });

  test("maps openclaw workspaces to category D", () => {
    assert.equal(
      inferProjectCategory(p("openclaw/workspaces/meta-warden/SOUL.md"), REPO),
      CATEGORIES.D,
    );
  });

  test("returns null for paths outside the repo", () => {
    const outside = path.resolve("/tmp/not-in-repo/.claude/settings.json");
    assert.equal(inferProjectCategory(outside, REPO), null);
  });

  test("returns null for repo-local paths that are not projection targets", () => {
    assert.equal(inferProjectCategory(p("README.md"), REPO), null);
    assert.equal(
      inferProjectCategory(p("scripts/sync-runtimes.mjs"), REPO),
      null,
    );
    assert.equal(inferProjectCategory(p("docs/guide.md"), REPO), null);
  });

  test("returns null for empty / invalid input", () => {
    assert.equal(inferProjectCategory("", REPO), null);
    assert.equal(inferProjectCategory(null, REPO), null);
    assert.equal(inferProjectCategory(undefined, REPO), null);
    assert.equal(inferProjectCategory(123, REPO), null);
  });

  test("distinguishes .claude/settings.json (G) from .claude/hooks/ (E)", () => {
    const settings = inferProjectCategory(p(".claude/settings.json"), REPO);
    const hook = inferProjectCategory(p(".claude/hooks/anything.mjs"), REPO);
    assert.notEqual(settings, hook);
    assert.equal(settings, CATEGORIES.G);
    assert.equal(hook, CATEGORIES.E);
  });
});

describe("sync-runtimes / inferProjectPurpose", () => {
  test("maps each category to its purpose tag", () => {
    assert.equal(inferProjectPurpose(CATEGORIES.D), "project-skill");
    assert.equal(inferProjectPurpose(CATEGORIES.E), "project-hook");
    assert.equal(inferProjectPurpose(CATEGORIES.F), "project-agent");
    assert.equal(inferProjectPurpose(CATEGORIES.G), "project-settings");
  });

  test("returns null for non-project categories", () => {
    assert.equal(inferProjectPurpose(CATEGORIES.A), null);
    assert.equal(inferProjectPurpose(CATEGORIES.B), null);
    assert.equal(inferProjectPurpose(CATEGORIES.C), null);
    assert.equal(inferProjectPurpose(CATEGORIES.H), null);
    assert.equal(inferProjectPurpose(CATEGORIES.I), null);
  });

  test("returns null for unknown / missing input", () => {
    assert.equal(inferProjectPurpose(null), null);
    assert.equal(inferProjectPurpose(undefined), null);
    assert.equal(inferProjectPurpose("Z"), null);
  });
});
