import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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
      const claudeHooksDir = path.join(root, "claude", "hooks");
      await mkdir(claudeHooksDir, { recursive: true });
      await writeFile(
        path.join(claudeHooksDir, "user-prompt-submit.js"),
        "process.stdout.write(JSON.stringify({}));\n",
        "utf8",
      );

      await runScript(["--targets", "claude", "--with-global-hooks"], env);

      const hookDir = path.join(root, "claude", "hooks", "meta-kim");
      for (const fileName of [
        "activate-meta-theory-spine.mjs",
        "block-dangerous-bash.mjs",
        "spine-state.mjs",
        "stop-save-progress.mjs",
        "stop-memory-save.mjs",
        "utils.mjs",
      ]) {
        await readFile(path.join(hookDir, fileName), "utf8");
      }
      for (const fileName of [
        "enforce-agent-dispatch.mjs",
        "stop-compaction.mjs",
        "stop-spine-cleanup.mjs",
      ]) {
        const source = await readFile(path.join(hookDir, fileName), "utf8");
        assert.doesNotMatch(
          source,
          /\.\.\/\.\.\/shared\/hooks\//,
          `${fileName} must resolve shared dependencies from the flattened global hook package`,
        );
      }
      for (const fileName of ["stop-compaction.mjs", "stop-spine-cleanup.mjs"]) {
        const result = spawnSync(
          process.execPath,
          [path.join(hookDir, fileName)],
          {
            cwd: root,
            env,
            input: "{}\n",
            encoding: "utf8",
            timeout: 5000,
          },
        );
        assert.equal(result.status, 0, result.stderr || result.stdout);
        assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND|shared[\\/]hooks/);
      }

      const settings = JSON.parse(
        await readFile(path.join(root, "claude", "settings.json"), "utf8"),
      );
      const promptHooks = settings.hooks?.UserPromptSubmit?.flatMap(
        (block) => block.hooks ?? [],
      ) ?? [];
      assert.match(
        promptHooks[0]?.command ?? "",
        /user-prompt-submit\.js/,
        "Claude should use HookPrompt native hook before Meta_Kim spine",
      );
      assert.ok(
        promptHooks.some(
          (hook) =>
            hook.command.includes("activate-meta-theory-spine.mjs") &&
            hook.command.includes("--package-root"),
        ),
        "global Claude settings must register prompt-entry project bootstrap hook with package-root evidence",
      );
      assert.doesNotMatch(
        JSON.stringify(promptHooks),
        /hookprompt-adapter\.mjs/,
        "Claude must not wrap native HookPrompt through the Meta_Kim adapter",
      );
      const stopHooks = settings.hooks?.Stop?.flatMap(
        (block) => block.hooks ?? [],
      ) ?? [];
      assert.ok(
        stopHooks.some((hook) => hook.command.includes("stop-save-progress.mjs")),
        "global Claude settings must register the continuation progress Stop hook",
      );
      assert.ok(
        stopHooks.some((hook) => hook.command.includes("stop-compaction.mjs")),
        "global Claude settings must register governed compaction Stop hook",
      );
    });
  });

  test("--with-global-hooks backs up and removes legacy root Meta_Kim hook files", async () => {
    await withTempRuntimeHomes(async ({ env, root }) => {
      const rootHookDir = path.join(root, "claude", "hooks");
      await mkdir(rootHookDir, { recursive: true });
      await writeFile(
        path.join(rootHookDir, "post-format.mjs"),
        "// locally modified legacy Meta_Kim hook\n",
        "utf8",
      );

      await runScript(["--targets", "claude", "--with-global-hooks"], env);

      await assert.rejects(() => readFile(path.join(rootHookDir, "post-format.mjs")));
      const backupRoot = path.join(rootHookDir, ".meta-kim-legacy-backup");
      const backupDirs = await readdir(backupRoot);
      assert.ok(backupDirs.length > 0);
      await readFile(
        path.join(backupRoot, backupDirs[0], "post-format.mjs"),
        "utf8",
      );
    });
  });

  test("target filtering does not touch Claude home when only Codex is selected", async () => {
    await withTempRuntimeHomes(async ({ env, root }) => {
      const claudeHome = path.join(root, "claude");
      await mkdir(path.join(claudeHome, "hooks"), { recursive: true });
      const sentinelPath = path.join(claudeHome, "settings.json");
      const sentinel = `${JSON.stringify(
        { hooks: { UserPromptSubmit: [{ hooks: [{ command: "node user-only.js" }] }] } },
        null,
        2,
      )}\n`;
      await writeFile(sentinelPath, sentinel, "utf8");

      await runScript(["--targets", "codex", "--with-global-hooks"], env);

      assert.equal(await readFile(sentinelPath, "utf8"), sentinel);
      await assert.rejects(() =>
        readFile(path.join(claudeHome, "hooks", "meta-kim", "activate-meta-theory-spine.mjs")),
      );
      await readFile(path.join(root, "codex", "skills", "meta-theory", "SKILL.md"), "utf8");
      const codexHookDir = path.join(root, "codex", "hooks", "meta-kim");
      for (const fileName of [
        "activate-meta-theory-spine.mjs",
        "bash-readonly-whitelist.mjs",
        "enforce-agent-dispatch.mjs",
      ]) {
        await readFile(path.join(codexHookDir, fileName), "utf8");
      }
      const hooksJson = JSON.parse(
        await readFile(path.join(root, "codex", "hooks.json"), "utf8"),
      );
      const promptHooks = hooksJson.hooks?.UserPromptSubmit?.flatMap(
        (block) => block.hooks ?? [],
      ) ?? [];
      assert.ok(
        promptHooks.some(
          (hook) =>
            hook.command.includes("activate-meta-theory-spine.mjs") &&
            hook.command.includes("--package-root") &&
            hook.command.includes(REPO_ROOT),
        ),
        "global Codex hooks.json must register prompt-entry project bootstrap hook with package-root evidence",
      );
    });
  });

  test("Codex global skill sync/check uses the Codex skill projection", async () => {
    await withTempRuntimeHomes(async ({ env, root }) => {
      await runScript(["--targets", "codex"], env);

      const skillPath = path.join(
        root,
        "codex",
        "skills",
        "meta-theory",
        "SKILL.md",
      );
      const skill = await readFile(skillPath, "utf8");
      const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";

      assert.match(frontmatter, /^name: meta-theory$/m);
      assert.match(frontmatter, /^description: /m);
      assert.doesNotMatch(frontmatter, /^trigger:/m);
      assert.match(skill, /\.agents\/skills\/<skill>\//);
      assert.match(skill, /Claude Code 用 `\.claude\/agents\/`/);
      assert.match(skill, /`\.claude\/hooks\/`/);
      assert.doesNotMatch(skill, /Claude Code 用[\s\S]{0,120}`\.codex\/hooks\/`/);

      const check = await runScript(["--check", "--targets", "codex"], env);
      assert.match(check.stdout, /Codex global skill/);
      assert.match(check.stdout, /Codex global hooks skipped/);

      await runScript(["--targets", "codex", "--with-global-hooks"], env);
      const hookCheck = await runScript(
        ["--check", "--targets", "codex", "--with-global-hooks"],
        env,
      );
      assert.match(hookCheck.stdout, /Codex global hooks \(meta-kim\)/);
      assert.match(hookCheck.stdout, /Codex global hooks\.json/);

      const hooksJson = JSON.parse(
        await readFile(path.join(root, "codex", "hooks.json"), "utf8"),
      );
      await readFile(
        path.join(root, "codex", "hooks", "hookprompt-adapter.mjs"),
        "utf8",
      );
      assert.ok(
        JSON.stringify(hooksJson).includes("activate-meta-theory-spine.mjs"),
      );
      assert.ok(JSON.stringify(hooksJson).includes("meta-kim-memory-save.mjs"));
      assert.ok(JSON.stringify(hooksJson).includes("hookprompt-adapter.mjs"));
      assert.ok(JSON.stringify(hooksJson).includes("--package-root"));
    });
  });

  test("Codex global hooks merge preserves user hooks and repairs stale Meta_Kim entries", async () => {
    await withTempRuntimeHomes(async ({ env, root }) => {
      const codexHome = path.join(root, "codex");
      await mkdir(codexHome, { recursive: true });
      const hooksPath = path.join(codexHome, "hooks.json");
      await writeFile(
        hooksPath,
        `${JSON.stringify(
          {
            hooks: {
              UserPromptSubmit: [
                {
                  hooks: [
                    { type: "command", command: "node user-only.js" },
                    {
                      type: "command",
                      command: `node "${path.join(codexHome, "hooks", "meta-kim", "old-spine.mjs")}"`,
                    },
                  ],
                },
              ],
            },
          },
          null,
          2,
        )}\n`,
        "utf8",
      );

      await runScript(["--targets", "codex", "--with-global-hooks"], env);

      const merged = JSON.parse(await readFile(hooksPath, "utf8"));
      const rendered = JSON.stringify(merged);
      assert.match(rendered, /node user-only\.js/);
      assert.doesNotMatch(rendered, /old-spine\.mjs/);
      assert.match(rendered, /activate-meta-theory-spine\.mjs/);
      assert.match(rendered, /--package-root/);

      await assert.rejects(
        async () => {
          const broken = JSON.parse(await readFile(hooksPath, "utf8"));
          broken.hooks.UserPromptSubmit[0].hooks.push({
            type: "command",
            command: `node "${path.join(codexHome, "hooks", "meta-kim", "missing-retired-hook.mjs")}"`,
          });
          await writeFile(hooksPath, `${JSON.stringify(broken, null, 2)}\n`, "utf8");
          await runScript(
            ["--check", "--targets", "codex", "--with-global-hooks"],
            env,
          );
        },
        (error) => {
          assert.match(error.stdout, /Codex global hooks\.json/);
          assert.match(error.stdout, /Missing registered Meta_Kim Codex hook scripts: 1/);
          return true;
        },
      );
    });
  });

  test("target filtering does not touch Codex home when only Claude is selected", async () => {
    await withTempRuntimeHomes(async ({ env, root }) => {
      const codexHome = path.join(root, "codex");
      await mkdir(codexHome, { recursive: true });
      const sentinelPath = path.join(codexHome, "hooks.json");
      const sentinel = `${JSON.stringify(
        { hooks: { UserPromptSubmit: [{ hooks: [{ command: "node user-only.js" }] }] } },
        null,
        2,
      )}\n`;
      await writeFile(sentinelPath, sentinel, "utf8");

      await runScript(["--targets", "claude", "--with-global-hooks"], env);

      assert.equal(await readFile(sentinelPath, "utf8"), sentinel);
      await assert.rejects(() =>
        readFile(path.join(codexHome, "skills", "meta-theory", "SKILL.md")),
      );
      await assert.rejects(() =>
        readFile(path.join(codexHome, "hooks", "meta-kim", "activate-meta-theory-spine.mjs")),
      );
      await readFile(
        path.join(root, "claude", "hooks", "meta-kim", "activate-meta-theory-spine.mjs"),
        "utf8",
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
              command: `node "${path.join(root, "claude", "hooks", "meta-kim", "missing-retired-hook.mjs")}"`,
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
      const repairedStop = JSON.stringify(repaired.hooks.Stop ?? []);
      assert.doesNotMatch(repairedStop, /missing-retired-hook\.mjs/);
      assert.match(repairedStop, /stop-save-progress\.mjs/);
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
