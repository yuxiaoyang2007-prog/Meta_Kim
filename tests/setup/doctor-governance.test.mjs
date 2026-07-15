import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import { buildDoctorSyncCheckPlan } from "../../scripts/doctor-governance.mjs";

const repoRoot = join(import.meta.dirname, "..", "..");

test("the default runtime check respects configured projection mode", () => {
  const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  const command = packageJson.scripts["meta:check:runtimes"];
  assert.match(command, /sync-runtimes\.mjs --check --scope project$/u);
  assert.doesNotMatch(command, /--targets/u);
});

test("doctor-governance checks the minimal project Hook closure in global_only mode", () => {
  const plan = buildDoctorSyncCheckPlan({
    localOverrides: { projectProjectionMode: "global_only" },
    activeTargets: ["claude", "codex"],
  });

  assert.equal(plan.skipped, false);
  assert.equal(plan.projectProjectionMode, "global_only");
  assert.equal(plan.checkKind, "minimal_hook_closure");
  assert.deepEqual(plan.args.slice(-3), ["--check", "--scope", "project"]);
  assert.equal(plan.args.includes("--targets"), false);
});

test("doctor-governance checks only the active project targets", () => {
  const plan = buildDoctorSyncCheckPlan({
    localOverrides: { projectProjectionMode: "project" },
    activeTargets: ["cursor"],
  });

  assert.equal(plan.skipped, false);
  assert.equal(plan.checkKind, "full_project_projection");
  assert.deepEqual(plan.args.slice(-2), ["--targets", "cursor"]);
  assert.doesNotMatch(plan.args.join(" "), /claude,codex/);
});

test("doctor-governance accepts healthy global hooks when project hooks are intentionally empty", () => {
  const root = mkdtempSync(join(os.tmpdir(), "meta-kim-doctor-global-hooks-"));
  try {
    const claudeHome = join(root, ".claude");
    const hooksDir = join(claudeHome, "hooks", "meta-kim");
    const projectSettingsPath = join(root, "project-settings.json");
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(projectSettingsPath, '{"hooks":{}}\n', "utf8");

    for (const fileName of [
      "activate-meta-theory-spine.mjs",
      "block-dangerous-bash.mjs",
      "hookprompt-adapter.mjs",
    ]) {
      writeFileSync(join(hooksDir, fileName), "// test hook\n", "utf8");
    }

    writeFileSync(
      join(claudeHome, "settings.json"),
      `${JSON.stringify(
        {
          hooks: {
            UserPromptSubmit: [
              {
                hooks: [
                  {
                    type: "command",
                    command: `node "${join(hooksDir, "activate-meta-theory-spine.mjs").replace(/\\/g, "/")}"`,
                  },
                  {
                    type: "command",
                    command: `node "${join(hooksDir, "hookprompt-adapter.mjs").replace(/\\/g, "/")}"`,
                  },
                ],
              },
            ],
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [
                  {
                    type: "command",
                    command: `node "${join(hooksDir, "block-dangerous-bash.mjs").replace(/\\/g, "/")}"`,
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

    const result = spawnSync(
      process.execPath,
      ["scripts/doctor-governance.mjs"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          META_KIM_CLAUDE_HOME: claudeHome,
          META_KIM_DOCTOR_PROJECT_SETTINGS: projectSettingsPath,
        },
        timeout: 120_000,
      },
    );

    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    assert.match(result.stdout, /Claude global Meta_Kim hooks/);
    assert.doesNotMatch(result.stdout, /missing PreToolUse or PostToolUse/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("doctor-governance accepts native Claude HookPrompt before Meta_Kim spine", () => {
  const root = mkdtempSync(join(os.tmpdir(), "meta-kim-doctor-native-hookprompt-"));
  try {
    const claudeHome = join(root, ".claude");
    const hooksDir = join(claudeHome, "hooks");
    const metaKimHooksDir = join(hooksDir, "meta-kim");
    const projectSettingsPath = join(root, "project-settings.json");
    mkdirSync(metaKimHooksDir, { recursive: true });
    writeFileSync(projectSettingsPath, '{"hooks":{}}\n', "utf8");

    writeFileSync(join(hooksDir, "user-prompt-submit.js"), "// native hookprompt\n", "utf8");
    for (const fileName of [
      "activate-meta-theory-spine.mjs",
      "block-dangerous-bash.mjs",
    ]) {
      writeFileSync(join(metaKimHooksDir, fileName), "// test hook\n", "utf8");
    }

    writeFileSync(
      join(claudeHome, "settings.json"),
      `${JSON.stringify(
        {
          hooks: {
            UserPromptSubmit: [
              {
                hooks: [
                  {
                    type: "command",
                    command: `node "${join(hooksDir, "user-prompt-submit.js").replace(/\\/g, "/")}"`,
                  },
                  {
                    type: "command",
                    command: `node "${join(metaKimHooksDir, "activate-meta-theory-spine.mjs").replace(/\\/g, "/")}"`,
                  },
                ],
              },
            ],
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [
                  {
                    type: "command",
                    command: `node "${join(metaKimHooksDir, "block-dangerous-bash.mjs").replace(/\\/g, "/")}"`,
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

    const result = spawnSync(
      process.execPath,
      ["scripts/doctor-governance.mjs"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          META_KIM_CLAUDE_HOME: claudeHome,
          META_KIM_DOCTOR_PROJECT_SETTINGS: projectSettingsPath,
        },
        timeout: 120_000,
      },
    );

    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    assert.match(result.stdout, /Claude global Meta_Kim hooks/);
    assert.doesNotMatch(result.stdout, /prompt entry hook/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
