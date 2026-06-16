import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

  test("--with-global-hooks installs prompt-entry bootstrap hook package", async () => {
    await withTempRuntimeHomes(async ({ env, root }) => {
      await runScript(["--targets", "claude", "--with-global-hooks"], env);

      const hookDir = path.join(root, "claude", "hooks", "meta-kim");
      for (const fileName of [
        "activate-meta-theory-spine.mjs",
        "block-dangerous-bash.mjs",
        "spine-state.mjs",
        "utils.mjs",
      ]) {
        await readFile(path.join(hookDir, fileName), "utf8");
      }

      const settings = JSON.parse(
        await readFile(path.join(root, "claude", "settings.json"), "utf8"),
      );
      const promptHooks = settings.hooks?.UserPromptSubmit?.flatMap(
        (block) => block.hooks ?? [],
      ) ?? [];
      assert.ok(
        promptHooks.some(
          (hook) =>
            hook.command.includes("activate-meta-theory-spine.mjs") &&
            hook.command.includes("--package-root"),
        ),
        "global Claude settings must register prompt-entry project bootstrap hook with package-root evidence",
      );
    });
  });

  test("--with-global-hooks check rejects stale settings entries for missing Meta_Kim hook files", async () => {
    await withTempRuntimeHomes(async ({ env, root }) => {
      await runScript(["--targets", "claude", "--with-global-hooks"], env);

      const settingsPath = path.join(root, "claude", "settings.json");
      const settings = JSON.parse(await readFile(settingsPath, "utf8"));
      settings.hooks.Stop = [
        {
          matcher: "*",
          hooks: [
            {
              type: "command",
              command: `node "${path.join(root, "claude", "hooks", "meta-kim", "stop-compaction.mjs")}"`,
            },
          ],
        },
      ];
      await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");

      await assert.rejects(
        () => runScript(["--check", "--with-global-hooks", "--targets", "claude"], env),
        (error) => {
          assert.match(error.stdout, /Claude Code global settings hooks/);
          assert.match(error.stdout, /Missing registered Meta_Kim hook scripts: 1/);
          return true;
        },
      );

      await runScript(["--targets", "claude", "--with-global-hooks"], env);
      const repaired = JSON.parse(await readFile(settingsPath, "utf8"));
      assert.equal(repaired.hooks.Stop, undefined);
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
