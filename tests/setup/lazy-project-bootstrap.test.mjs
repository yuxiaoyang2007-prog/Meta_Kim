import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

function tempProject() {
  return mkdtempSync(path.join(os.tmpdir(), "meta-kim-lazy-bootstrap-"));
}

function runSetup(args, options = {}) {
  return spawnSync(process.execPath, ["setup.mjs", ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 120_000,
    ...options,
  });
}

function runBin(args, options = {}) {
  return spawnSync(process.execPath, ["bin/meta-kim.mjs", ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 120_000,
    ...options,
  });
}

function runBootstrap(projectDir, extraArgs = []) {
  const result = runSetup([
    "--project-bootstrap",
    "--targets",
    "claude,codex",
    "--project-dir",
    projectDir,
    "--json",
    ...extraArgs,
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function runBootstrapForTargets(projectDir, targets, extraArgs = []) {
  const result = runSetup([
    "--project-bootstrap",
    "--targets",
    targets,
    "--project-dir",
    projectDir,
    "--json",
    ...extraArgs,
  ]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

test("lazy project bootstrap dry-run exposes source chain and writes nothing", () => {
  const projectDir = tempProject();
  try {
    const before = new Set([]);
    const summary = runBootstrap(projectDir, ["--dry-run"]);
    assert.equal(summary.mode, "dry-run");
    assert.equal(summary.ok, true);
    assert.equal(summary.resultCount, 1);

    const plan = summary.results[0];
    assert.equal(plan.schemaVersion, "meta-kim-project-bootstrap-plan-v0.1");
    assert.equal(plan.state.status, "missing");
    assert.deepEqual(plan.state.activeTargets, ["claude", "codex"]);
    assert.equal(plan.sourceChain.binEntrypoint, "bin/meta-kim.mjs");
    assert.equal(plan.sourceChain.setupEntrypoint, "setup.mjs --project-bootstrap");
    assert.equal(plan.sourceChain.syncManifest, "config/sync.json");
    assert.equal(plan.sourceChain.canonicalRoots.skills, "canonical/skills");
    assert.ok(plan.sourceChain.generatedTargets.claude.includes(".claude/skills"));
    assert.ok(plan.sourceChain.generatedTargets.codex.includes(".agents/skills"));
    assert.deepEqual(plan.writePreview.globalWrites, []);
    assert.ok(plan.writePreview.projectWrites.some((file) => file.relPath === "AGENTS.md"));
    assert.equal(plan.writePreview.backup.requiredBeforeApply, false);
    assert.equal(plan.writePreview.backup.backupRootPattern, ".meta-kim/backups/project-bootstrap/<timestamp>");
    assert.equal(plan.writePreview.rollbackPlan.availableAfterApply, true);
    assert.equal(
      plan.writePreview.rollbackPlan.stateManifest,
      ".meta-kim/state/default/project-bootstrap.json",
    );
    assert.equal(plan.choiceSurface.required, true);
    assert.equal(plan.choiceSurface.trigger, "runtime_native_choice_required_before_apply");
    assert.match(plan.choiceSurface.runtimeRequirement, /AskUserQuestion/);
    assert.match(plan.choiceSurface.runtimeRequirement, /request_user_input/);
    assert.equal(plan.choiceSurface.recommendedOptionId, "apply_project_bootstrap");
    assert.ok(plan.choiceSurface.options.length >= 3);
    assert.match(plan.decisions.defaultTargets, /Claude Code \+ Codex/);
    assert.match(plan.decisions.defaultTargets, /--targets/);
    assert.match(plan.decisions.defaultTargets, /\.meta-kim\/local\.overrides\.json/);
    for (const id of [
      "apply_project_bootstrap",
      "inspect_dry_run_only",
      "skip_this_project",
    ]) {
      const option = plan.choiceSurface.options.find((entry) => entry.id === id);
      assert.ok(option, `${id} option should be present`);
      assert.ok(option.label);
      assert.ok(option.expectedResult);
      assert.ok(option.advantage);
      assert.ok(option.risk);
      assert.ok(option.verificationImpact);
    }

    const byRel = new Map(plan.files.map((file) => [file.relPath, file]));
    assert.equal(
      plan.files.some((file) =>
        file.relPath.includes("same-set-reusable-flow-for-project-file-inventor"),
      ),
      false,
      "project bootstrap must not project internal canonical skills into runtime skill mirrors",
    );
    assert.equal(byRel.get("AGENTS.md")?.mergePolicy, "generated_projection_create");
    assert.equal(
      byRel.get(".agents/skills/meta-theory/SKILL.md")?.mergePolicy,
      "generated_projection_create",
    );
    assert.equal(
      byRel.get(".claude/settings.json")?.mergePolicy,
      "additive_preserve_user_state_json",
    );
    assert.equal(
      byRel.get(".codex/hooks.json")?.mergePolicy,
      "additive_preserve_user_state_json",
    );
    assert.equal(byRel.get(".codex/config.toml")?.mergePolicy, "never_touch");
    assert.equal(
      byRel.get("meta-kim-post-copy.mjs")?.mergePolicy,
      "generated_projection_create",
    );

    assert.deepEqual(new Set([]), before);
    assert.equal(existsSync(path.join(projectDir, ".meta-kim")), false);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("lazy project bootstrap dry-run previews backup and rollback without writing", () => {
  const projectDir = tempProject();
  try {
    writeFileSync(path.join(projectDir, "AGENTS.md"), "# User Project\n\nKeep this local note.\n");
    mkdirSync(path.join(projectDir, ".codex"), { recursive: true });
    mkdirSync(path.join(projectDir, ".codex", "hooks"), { recursive: true });
    writeFileSync(
      path.join(projectDir, ".codex", "hooks", "user-custom-hook.mjs"),
      "console.log('custom hook');\n",
    );
    writeFileSync(
      path.join(projectDir, ".codex", "hooks.json"),
      JSON.stringify(
        {
          hooks: {
            UserPromptSubmit: [{ hooks: [{ command: "node user-hook.mjs" }] }],
          },
        },
        null,
        2,
      ) + "\n",
    );

    const summary = runBootstrap(projectDir, ["--dry-run"]);
    const plan = summary.results[0];
    assert.equal(summary.mode, "dry-run");
    assert.deepEqual(plan.writePreview.globalWrites, []);
    assert.ok(
      plan.writePreview.projectWrites.some(
        (file) => file.relPath === "AGENTS.md" && file.backupBeforeApply === true,
      ),
    );
    assert.ok(
      plan.writePreview.backup.entries.some((entry) => entry.relPath === "AGENTS.md"),
    );
    assert.ok(
      plan.writePreview.backup.entries.some(
        (entry) => entry.relPath === ".codex/hooks.json",
      ),
    );
    assert.match(plan.writePreview.rollbackPlan.policy, /Restore backed-up files/);
    assert.equal(existsSync(path.join(projectDir, ".meta-kim")), false);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("meta-kim CLI exposes project bootstrap subcommand for global-first skill use", () => {
  const projectDir = tempProject();
  try {
    const result = runBin([
      "project",
      "bootstrap",
      "--targets",
      "claude,codex",
      "--project-dir",
      projectDir,
      "--dry-run",
      "--json",
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.mode, "dry-run");
    assert.equal(summary.results[0].sourceChain.binEntrypoint, "bin/meta-kim.mjs");
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("lazy project bootstrap apply preserves user text/config, skips Codex project config, and records backup manifest", () => {
  const projectDir = tempProject();
  try {
    writeFileSync(path.join(projectDir, "AGENTS.md"), "# User Project\n\nKeep this local note.\n");
    mkdirSync(path.join(projectDir, ".claude"), { recursive: true });
    writeFileSync(
      path.join(projectDir, ".claude", "settings.json"),
      JSON.stringify(
        {
          hooks: {
            PreToolUse: [{ matcher: "Bash", hooks: [{ command: "node user-claude-hook.mjs" }] }],
          },
          permissions: { allow: ["Bash(npm test)"] },
        },
        null,
        2,
      ) + "\n",
    );
    mkdirSync(path.join(projectDir, ".codex"), { recursive: true });
    mkdirSync(path.join(projectDir, ".codex", "hooks"), { recursive: true });
    writeFileSync(
      path.join(projectDir, ".codex", "hooks", "user-custom-hook.mjs"),
      "console.log('custom hook');\n",
    );
    writeFileSync(
      path.join(projectDir, ".codex", "hooks.json"),
      JSON.stringify(
        {
          hooks: {
            UserPromptSubmit: [{ hooks: [{ command: "node user-hook.mjs" }] }],
          },
        },
        null,
        2,
      ) + "\n",
    );
    writeFileSync(
      path.join(projectDir, ".mcp.json"),
      JSON.stringify({ mcpServers: { custom: { command: "custom-mcp" } } }, null, 2) + "\n",
    );

    const summary = runBootstrap(projectDir, ["--apply"]);
    assert.equal(summary.mode, "apply");
    assert.equal(summary.results[0].applied, true);

    const agents = readFileSync(path.join(projectDir, "AGENTS.md"), "utf8");
    assert.match(agents, /# User Project/);
    assert.match(agents, /Keep this local note/);
    assert.match(agents, /BEGIN META_KIM MANAGED BLOCK: AGENTS\.md/);
    assert.match(agents, /# Meta_Kim for Codex/);

    const codexHooks = readJson(path.join(projectDir, ".codex", "hooks.json"));
    assert.match(JSON.stringify(codexHooks), /node user-hook\.mjs/);
    assert.match(JSON.stringify(codexHooks), /hookprompt-adapter|meta-kim-memory-save|enforce-agent-dispatch|graphify-context/);
    assert.equal(
      readFileSync(path.join(projectDir, ".codex", "hooks", "user-custom-hook.mjs"), "utf8"),
      "console.log('custom hook');\n",
    );

    const claudeSettings = readJson(path.join(projectDir, ".claude", "settings.json"));
    assert.match(JSON.stringify(claudeSettings), /node user-claude-hook\.mjs/);
    assert.deepEqual(claudeSettings.permissions.allow, ["Bash(npm test)"]);

    const mcp = readJson(path.join(projectDir, ".mcp.json"));
    assert.equal(mcp.mcpServers.custom.command, "custom-mcp");
    assert.equal(existsSync(path.join(projectDir, ".codex", "config.toml")), false);

    const manifestPath = path.join(
      projectDir,
      ".meta-kim",
      "state",
      "default",
      "project-bootstrap.json",
    );
    const manifest = readJson(manifestPath);
    assert.equal(manifest.schemaVersion, "meta-kim-project-bootstrap-v0.1");
    assert.deepEqual(manifest.activeTargets, ["claude", "codex"]);
    assert.equal(manifest.sourceChain.setupEntrypoint, "setup.mjs --project-bootstrap");
    assert.equal(manifest.protectedMergeDecisions.protectedMerge.includes(".codex/config.toml"), true);
    assert.equal(manifest.backup.created, true);
    assert.ok(manifest.backup.entries.some((entry) => entry.relPath === "AGENTS.md"));
    assert.ok(manifest.backup.entries.some((entry) => entry.relPath === ".codex/hooks.json"));
    assert.ok(manifest.managedFiles.some((entry) => entry.relPath === "meta-kim-post-copy.mjs"));

    const postCopyBootstrap = path.join(projectDir, "meta-kim-post-copy.mjs");
    assert.equal(existsSync(postCopyBootstrap), true);

    const currentSummary = runBootstrap(projectDir, ["--dry-run"]);
    const currentPlan = currentSummary.results[0];
    assert.equal(currentPlan.state.status, "ready");
    assert.equal(currentPlan.state.requiresConfirmation, false);
    assert.equal(currentPlan.state.counts.pending, 0);
    assert.equal(currentPlan.writePreview.projectWrites.length, 0);
    assert.equal(currentPlan.writePreview.confirmation.required, false);
    assert.equal(currentPlan.writePreview.backup.requiredBeforeApply, false);
    assert.equal(currentPlan.choiceSurface.required, false);
    assert.equal(currentPlan.choiceSurface.trigger, "no_choice_needed_current");
    assert.equal(
      currentPlan.files.find((file) => file.relPath === "meta-kim-post-copy.mjs")?.effectiveAction,
      "unchanged",
    );

    const noOpApply = runBootstrap(projectDir, ["--apply"]);
    assert.equal(noOpApply.results[0].applied, false);
    assert.equal(noOpApply.results[0].noOp, true);
    assert.equal(noOpApply.results[0].backup.created, false);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("lazy project bootstrap blocks unknown existing generated-path files instead of overwriting them", () => {
  const projectDir = tempProject();
  const userHookPath = path.join(
    projectDir,
    ".codex",
    "hooks",
    "activate-meta-theory-spine.mjs",
  );
  try {
    mkdirSync(path.dirname(userHookPath), { recursive: true });
    writeFileSync(userHookPath, "console.log('user hook stays');\n", "utf8");

    const dryRun = runBootstrapForTargets(projectDir, "codex", ["--dry-run"]);
    const plan = dryRun.results[0];
    assert.equal(plan.state.status, "conflict");
    assert.equal(plan.state.counts.conflict, 1);
    assert.ok(
      plan.writePreview.projectConflicts.some(
        (file) => file.relPath === ".codex/hooks/activate-meta-theory-spine.mjs",
      ),
    );
    assert.equal(
      plan.writePreview.projectWrites.some(
        (file) => file.relPath === ".codex/hooks/activate-meta-theory-spine.mjs",
      ),
      false,
    );
    assert.equal(plan.choiceSurface.recommendedOptionId, "inspect_dry_run_only");

    const apply = runSetup([
      "--project-bootstrap",
      "--targets",
      "codex",
      "--project-dir",
      projectDir,
      "--json",
      "--apply",
    ]);
    assert.notEqual(apply.status, 0, "apply must refuse unknown existing conflicts");
    const summary = JSON.parse(apply.stdout);
    assert.equal(summary.ok, false);
    assert.match(summary.results[0].error.message, /user-owned file conflict/);
    assert.equal(readFileSync(userHookPath, "utf8"), "console.log('user hook stays');\n");
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("lazy project bootstrap updates files previously recorded in the project manifest", () => {
  const projectDir = tempProject();
  const managedHookPath = path.join(
    projectDir,
    ".codex",
    "hooks",
    "activate-meta-theory-spine.mjs",
  );
  try {
    runBootstrapForTargets(projectDir, "codex", ["--apply"]);
    writeFileSync(managedHookPath, "console.log('old generated hook');\n", "utf8");

    const dryRun = runBootstrapForTargets(projectDir, "codex", ["--dry-run"]);
    const plan = dryRun.results[0];
    const hookPlan = plan.files.find(
      (file) => file.relPath === ".codex/hooks/activate-meta-theory-spine.mjs",
    );
    assert.equal(plan.state.status, "repair_required");
    assert.equal(hookPlan.ownership, "manifest_managed");
    assert.equal(hookPlan.effectiveAction, "replace");
    assert.equal(hookPlan.mergePolicy, "manifest_managed_projection_replace");
    assert.equal(plan.writePreview.projectConflicts.length, 0);

    runBootstrapForTargets(projectDir, "codex", ["--apply"]);
    assert.doesNotMatch(readFileSync(managedHookPath, "utf8"), /old generated hook/);
    const current = runBootstrapForTargets(projectDir, "codex", ["--dry-run"]);
    assert.equal(current.results[0].state.status, "ready");
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("lazy project bootstrap replaces existing managed text block without duplicating user content", () => {
  const projectDir = tempProject();
  try {
    writeFileSync(
      path.join(projectDir, "AGENTS.md"),
      [
        "# User Project",
        "",
        "Keep this local note.",
        "",
        "<!-- BEGIN META_KIM MANAGED BLOCK: AGENTS.md -->",
        "# Old Meta Kim Block",
        "<!-- END META_KIM MANAGED BLOCK: AGENTS.md -->",
        "",
        "Keep this tail.",
        "",
      ].join("\n"),
    );

    const summary = runBootstrap(projectDir, ["--apply"]);
    assert.equal(summary.mode, "apply");

    const agents = readFileSync(path.join(projectDir, "AGENTS.md"), "utf8");
    const managedBlockCount = agents.match(/BEGIN META_KIM MANAGED BLOCK: AGENTS\.md/g)?.length ?? 0;
    assert.equal(managedBlockCount, 1);
    assert.match(agents, /Keep this local note/);
    assert.match(agents, /Keep this tail/);
    assert.match(agents, /# Meta_Kim for Codex/);
    assert.doesNotMatch(agents, /# Old Meta Kim Block/);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("lazy project bootstrap does not report success for a read-only project target", () => {
  const projectDir = tempProject();
  const agentsPath = path.join(projectDir, "AGENTS.md");
  try {
    writeFileSync(agentsPath, "# User Project\n\nRead-only local note.\n");
    chmodSync(agentsPath, 0o444);

    const result = runSetup([
      "--project-bootstrap",
      "--targets",
      "claude,codex",
      "--project-dir",
      projectDir,
      "--json",
      "--apply",
    ]);
    assert.notEqual(result.status, 0, "read-only target must not be reported as apply success");
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.ok, false);
    assert.match(summary.results[0].error.message, /EACCES|EPERM|permission|read-only/i);
    assert.match(summary.results[0].error.status, /blocked|failed/);
  } finally {
    try {
      chmodSync(agentsPath, 0o666);
    } catch {}
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("lazy project bootstrap respects target-conditional project projection boundaries", () => {
  const cases = [
    {
      targets: "claude",
      present: ["CLAUDE.md", ".claude/settings.json", ".mcp.json"],
      absent: ["AGENTS.md", ".codex", ".agents", ".cursor", "openclaw"],
    },
    {
      targets: "codex",
      present: ["AGENTS.md", ".codex/hooks.json", ".agents/skills/meta-theory/SKILL.md"],
      absent: ["CLAUDE.md", ".claude", ".cursor", "openclaw"],
    },
    {
      targets: "cursor",
      present: [
        "AGENTS.md",
        ".cursor/hooks.json",
        ".cursor/mcp.json",
        ".cursor/rules",
        ".cursor/skills/meta-theory/SKILL.md",
      ],
      absent: ["CLAUDE.md", ".claude", ".codex", ".agents", "openclaw"],
    },
    {
      targets: "openclaw",
      present: [
        "AGENTS.md",
        "openclaw/openclaw.template.json",
        "openclaw/skills/meta-theory/SKILL.md",
        "openclaw/workspaces",
      ],
      absent: ["CLAUDE.md", ".claude", ".codex", ".agents", ".cursor"],
    },
    {
      targets: "claude,codex",
      present: [
        "CLAUDE.md",
        "AGENTS.md",
        ".claude/settings.json",
        ".codex/hooks.json",
        ".agents/skills/meta-theory/SKILL.md",
        ".mcp.json",
      ],
      absent: [".cursor", "openclaw"],
    },
  ];

  for (const entry of cases) {
    const projectDir = tempProject();
    try {
      const expectedTargets = entry.targets.split(",");
      const dryRun = runBootstrapForTargets(projectDir, entry.targets, ["--dry-run"]);
      assert.equal(dryRun.mode, "dry-run");
      assert.deepEqual(dryRun.results[0].state.activeTargets, expectedTargets);
      assert.deepEqual(dryRun.results[0].writePreview.globalWrites, []);
      assert.equal(existsSync(path.join(projectDir, ".meta-kim")), false);

      runBootstrapForTargets(projectDir, entry.targets, ["--apply"]);
      const manifest = readJson(
        path.join(projectDir, ".meta-kim", "state", "default", "project-bootstrap.json"),
      );
      assert.deepEqual(manifest.activeTargets, expectedTargets);

      for (const relPath of entry.present) {
        assert.equal(
          existsSync(path.join(projectDir, ...relPath.split("/"))),
          true,
          `${entry.targets} should project ${relPath}`,
        );
      }
      for (const relPath of entry.absent) {
        assert.equal(
          existsSync(path.join(projectDir, ...relPath.split("/"))),
          false,
          `${entry.targets} should not project ${relPath}`,
        );
      }
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  }
});

test("lazy project bootstrap can project the full compatibility runtime surface when explicitly selected", () => {
  const projectDir = tempProject();
  try {
    runBootstrapForTargets(projectDir, "claude,codex,openclaw,cursor", ["--apply"]);
    assert.equal(existsSync(path.join(projectDir, "CLAUDE.md")), true);
    assert.equal(existsSync(path.join(projectDir, "AGENTS.md")), true);
    assert.equal(existsSync(path.join(projectDir, ".claude", "settings.json")), true);
    assert.equal(existsSync(path.join(projectDir, ".codex", "hooks.json")), true);
    assert.equal(existsSync(path.join(projectDir, ".agents", "skills", "meta-theory")), true);
    assert.equal(existsSync(path.join(projectDir, ".cursor", "hooks.json")), true);
    assert.equal(existsSync(path.join(projectDir, "openclaw", "openclaw.template.json")), true);
    assert.equal(
      existsSync(path.join(projectDir, ".meta-kim", "state", "default", "project-bootstrap.json")),
      true,
    );
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("lazy project bootstrap detects stale previous manifest before update", () => {
  const projectDir = tempProject();
  try {
    const manifestDir = path.join(projectDir, ".meta-kim", "state", "default");
    mkdirSync(manifestDir, { recursive: true });
    writeFileSync(
      path.join(manifestDir, "project-bootstrap.json"),
      JSON.stringify(
        {
          schemaVersion: "meta-kim-project-bootstrap-v0.1",
          metaKimVersion: "0.0.0",
          appliedAt: "2026-01-01T00:00:00.000Z",
          activeTargets: ["claude"],
        },
        null,
        2,
      ) + "\n",
    );

    const summary = runBootstrap(projectDir, ["--dry-run"]);
    assert.equal(summary.results[0].state.status, "stale");
    assert.equal(summary.results[0].state.requiresConfirmation, true);
    assert.equal(summary.results[0].state.previousManifest.metaKimVersion, "0.0.0");

    const update = runBootstrap(projectDir, ["--apply"]);
    assert.equal(update.mode, "apply");
    assert.equal(update.results[0].applied, true);

    const current = runBootstrap(projectDir, ["--dry-run"]);
    assert.equal(current.results[0].state.status, "ready");
    assert.equal(current.results[0].state.requiresConfirmation, false);
    assert.equal(current.results[0].state.counts.pending, 0);
    assert.equal(current.results[0].writePreview.projectWrites.length, 0);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("lazy project bootstrap treats equivalent files without manifest as confirmation-only", () => {
  const projectDir = tempProject();
  try {
    runBootstrap(projectDir, ["--apply"]);
    rmSync(path.join(projectDir, ".meta-kim", "state"), {
      recursive: true,
      force: true,
    });

    const summary = runBootstrap(projectDir, ["--dry-run"]);
    const plan = summary.results[0];
    assert.equal(plan.state.status, "ready_with_existing_config");
    assert.equal(plan.state.requiresConfirmation, true);
    assert.equal(plan.state.counts.pending, 0);
    assert.equal(plan.writePreview.projectWrites.length, 0);
    assert.equal(plan.writePreview.manifestWrite.requiredBeforeReady, true);
    assert.equal(plan.choiceSurface.required, true);
    assert.match(plan.choiceSurface.question, /Pending project writes: 0/);

    const rewriteManifest = runBootstrap(projectDir, ["--apply"]);
    assert.equal(rewriteManifest.results[0].applied, true);
    const current = runBootstrap(projectDir, ["--dry-run"]);
    assert.equal(current.results[0].state.status, "ready");
    assert.equal(current.results[0].state.requiresConfirmation, false);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("lazy project bootstrap detects missing post-copy generated script", () => {
  const projectDir = tempProject();
  try {
    runBootstrap(projectDir, ["--apply"]);
    rmSync(path.join(projectDir, "meta-kim-post-copy.mjs"), { force: true });

    const summary = runBootstrap(projectDir, ["--dry-run"]);
    const plan = summary.results[0];
    assert.equal(plan.state.status, "repair_required");
    assert.equal(plan.state.requiresConfirmation, true);
    assert.ok(
      plan.writePreview.projectWrites.some(
        (file) => file.relPath === "meta-kim-post-copy.mjs" && file.action === "create",
      ),
    );

    runBootstrap(projectDir, ["--apply"]);
    const current = runBootstrap(projectDir, ["--dry-run"]);
    assert.equal(current.results[0].state.status, "ready");
    assert.equal(current.results[0].writePreview.projectWrites.length, 0);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("lazy project bootstrap detects active target changes separately from version updates", () => {
  const projectDir = tempProject();
  try {
    runBootstrapForTargets(projectDir, "claude", ["--apply"]);

    const summary = runBootstrapForTargets(projectDir, "claude,codex", ["--dry-run"]);
    const plan = summary.results[0];
    assert.equal(plan.state.status, "target_scope_changed");
    assert.equal(plan.state.requiresConfirmation, true);
    assert.deepEqual(plan.state.previousManifest.activeTargets, ["claude"]);
    assert.equal(plan.state.previousManifest.targetChanged, true);
    assert.ok(plan.writePreview.projectWrites.some((file) => file.relPath === "AGENTS.md"));

    runBootstrapForTargets(projectDir, "claude,codex", ["--apply"]);
    const current = runBootstrapForTargets(projectDir, "claude,codex", ["--dry-run"]);
    assert.equal(current.results[0].state.status, "ready");
    assert.equal(current.results[0].state.requiresConfirmation, false);
    assert.equal(current.results[0].state.counts.pending, 0);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("lazy project bootstrap detects generated file drift even with current manifest", () => {
  const projectDir = tempProject();
  try {
    runBootstrap(projectDir, ["--apply"]);
    const skillPath = path.join(
      projectDir,
      ".agents",
      "skills",
      "meta-theory",
      "SKILL.md",
    );
    writeFileSync(skillPath, "# drifted local skill mirror\n", "utf8");

    const summary = runBootstrap(projectDir, ["--dry-run"]);
    const plan = summary.results[0];
    assert.equal(plan.state.status, "repair_required");
    assert.equal(plan.state.requiresConfirmation, true);
    assert.ok(
      plan.writePreview.projectWrites.some(
        (file) =>
          file.relPath === ".agents/skills/meta-theory/SKILL.md" &&
          file.action === "replace",
      ),
    );

    runBootstrap(projectDir, ["--apply"]);
    const current = runBootstrap(projectDir, ["--dry-run"]);
    assert.equal(current.results[0].state.status, "ready");
    assert.equal(current.results[0].writePreview.projectWrites.length, 0);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test("lazy project bootstrap treats corrupt manifest as needing confirmation but not file rewrites", () => {
  const projectDir = tempProject();
  try {
    runBootstrap(projectDir, ["--apply"]);
    const manifestPath = path.join(
      projectDir,
      ".meta-kim",
      "state",
      "default",
      "project-bootstrap.json",
    );
    writeFileSync(manifestPath, "{not json\n", "utf8");

    const summary = runBootstrap(projectDir, ["--dry-run"]);
    const plan = summary.results[0];
    assert.equal(plan.state.status, "ready_with_existing_config");
    assert.equal(plan.state.requiresConfirmation, true);
    assert.equal(plan.state.previousManifest, null);
    assert.equal(plan.state.counts.pending, 0);
    assert.equal(plan.writePreview.projectWrites.length, 0);

    runBootstrap(projectDir, ["--apply"]);
    const current = runBootstrap(projectDir, ["--dry-run"]);
    assert.equal(current.results[0].state.status, "ready");
    assert.equal(current.results[0].state.requiresConfirmation, false);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});
