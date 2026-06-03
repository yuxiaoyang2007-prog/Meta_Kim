import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.join(import.meta.dirname, "..", "..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "sync-global-meta-theory.mjs");

async function withTempRuntimeHomes(fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), "meta-kim-global-sync-"));
  const env = {
    ...process.env,
    META_KIM_CLAUDE_HOME: path.join(root, "claude"),
    META_KIM_CODEX_HOME: path.join(root, "codex"),
    META_KIM_OPENCLAW_HOME: path.join(root, "openclaw"),
    META_KIM_CURSOR_HOME: path.join(root, "cursor"),
  };
  try {
    return await fn({ env, root });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function runScript(args, env) {
  return execFileAsync(process.execPath, [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    env,
    maxBuffer: 1024 * 1024 * 8,
  });
}

describe("sync-global-meta-theory hook policy", () => {
  test("default global sync/check does not require Claude global hooks", async () => {
    await withTempRuntimeHomes(async ({ env }) => {
      const sync = await runScript(["--targets", "claude"], env);
      assert.match(sync.stdout, /Skipped Claude Code global hooks/);

      const check = await runScript(["--check", "--targets", "claude"], env);
      assert.match(check.stdout, /global hooks skipped/);
    });
  });

  test("--with-global-hooks is the explicit hard gate for Claude global hooks", async () => {
    await withTempRuntimeHomes(async ({ env }) => {
      await runScript(["--targets", "claude"], env);

      try {
        await runScript(
          ["--check", "--with-global-hooks", "--targets", "claude"],
          env,
        );
        assert.fail("--with-global-hooks check should fail when hooks are missing");
      } catch (error) {
        assert.match(error.stdout, /Claude Code global hooks/);
      }
    });
  });

  test("release verification uses the global hook hard gate without making live eval a full release gate", async () => {
    const pkg = JSON.parse(
      await readFile(path.join(REPO_ROOT, "package.json"), "utf8"),
    );
    assert.match(
      pkg.scripts["meta:check:global:release"],
      /--check.*--with-global-hooks|--with-global-hooks.*--check/,
    );
    assert.match(pkg.scripts["meta:verify:all"], /meta:check:global:release/);
    assert.match(pkg.scripts["meta:verify:all:live"], /eval-meta-agents\.mjs/);
    assert.match(pkg.scripts["meta:verify:all:live"], /--require-all-runtimes/);
    assert.match(pkg.scripts["meta:verify:all:live"], /--live/);
    assert.doesNotMatch(
      pkg.scripts["meta:verify:all:live"],
      /meta:check:global:release|meta:test:setup|meta:test:meta-theory/,
    );
  });
});
