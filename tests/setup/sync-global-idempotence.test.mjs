import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { directoryContentEqual } from "../../scripts/install-global-skills-all-runtimes.mjs";

const repoRoot = join(import.meta.dirname, "..", "..");

function runGlobalSync(env) {
  const result = spawnSync(
    process.execPath,
    ["scripts/sync-global-meta-theory.mjs", "--targets", "claude,codex"],
    {
      cwd: repoRoot,
      env,
      encoding: "utf8",
      timeout: 120_000,
    },
  );
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
}

function mtimes(paths) {
  return Object.fromEntries(
    Object.entries(paths).map(([id, filePath]) => [id, statSync(filePath).mtimeMs]),
  );
}

test("global skill and command sync is a content-identical mtime no-op", async () => {
  const root = mkdtempSync(join(os.tmpdir(), "meta-kim-global-idempotence-"));
  try {
    const claudeHome = join(root, ".claude");
    const codexHome = join(root, ".codex");
    const env = {
      ...process.env,
      HOME: root,
      USERPROFILE: root,
      META_KIM_CLAUDE_HOME: claudeHome,
      META_KIM_CODEX_HOME: codexHome,
    };
    const files = {
      claudeSkill: join(claudeHome, "skills", "meta-theory", "SKILL.md"),
      claudeCommand: join(claudeHome, "commands", "meta-theory.md"),
      codexSkill: join(codexHome, "skills", "meta-theory", "SKILL.md"),
      codexCommand: join(codexHome, "commands", "meta-theory.md"),
    };

    runGlobalSync(env);
    const before = mtimes(files);
    await delay(100);
    runGlobalSync(env);
    const after = mtimes(files);

    assert.deepEqual(after, before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dependency skill tree comparison ignores mtimes but detects content drift", async () => {
  const root = mkdtempSync(join(os.tmpdir(), "meta-kim-skill-tree-equality-"));
  try {
    const left = join(root, "left");
    const right = join(root, "right");
    mkdirSync(join(left, "nested"), { recursive: true });
    mkdirSync(join(right, "nested"), { recursive: true });
    writeFileSync(join(left, "SKILL.md"), "same\n", "utf8");
    writeFileSync(join(right, "SKILL.md"), "same\n", "utf8");
    writeFileSync(join(left, "nested", "ref.md"), "reference\n", "utf8");
    writeFileSync(join(right, "nested", "ref.md"), "reference\n", "utf8");
    assert.equal(await directoryContentEqual(left, right), true);
    writeFileSync(join(right, "nested", "ref.md"), "changed\n", "utf8");
    assert.equal(await directoryContentEqual(left, right), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
