#!/usr/bin/env node
/**
 * Narrow governance health check: contract readable, Claude hook commands match
 * expected set, runtime mirrors in sync, sample run artifact passes meta:validate:run.
 *
 * Keep EXPECTED_CLAUDE_HOOK_COMMANDS in sync with scripts/validate-project.mjs.
 */

import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  detectProfileCollision,
  ensureProfileState,
  getProfilePaths,
  toRepoRelative,
} from "./meta-kim-local-state.mjs";
import { resolveTargetContext } from "./meta-kim-sync-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const execFileAsync = promisify(execFile);

/** @type {string[]} Same order as validate-project.mjs EXPECTED_CLAUDE_HOOK_COMMANDS */
const EXPECTED_CLAUDE_HOOK_COMMANDS = [
  "node .claude/hooks/block-dangerous-bash.mjs",
  "node .claude/hooks/pre-git-push-confirm.mjs",
  "node .claude/hooks/post-format.mjs",
  "node .claude/hooks/post-typecheck.mjs",
  "node .claude/hooks/post-console-log-warn.mjs",
  "node .claude/hooks/subagent-context.mjs",
  "node .claude/hooks/stop-compaction.mjs",
  "node .claude/hooks/stop-memory-save.mjs",
  "node .claude/hooks/stop-console-log-audit.mjs",
  "node .claude/hooks/stop-completion-guard.mjs",
];

const CONTRACT = path.join(
  repoRoot,
  "config",
  "contracts",
  "workflow-contract.json",
);
const SETTINGS = path.join(repoRoot, ".claude", "settings.json");
const FIXTURE = path.join(
  repoRoot,
  "tests",
  "fixtures",
  "run-artifacts",
  "valid-run.json",
);

/**
 * Normalize a hook command to its canonical hook name (e.g. "block-dangerous-bash").
 * Handles both relative paths ("node .claude/hooks/block-dangerous-bash.mjs")
 * and absolute Windows paths (node "C:\...\block-dangerous-bash.mjs").
 */
function normalizeHookName(command) {
  const trimmed = command.trim();
  // Strip the leading "node" and any quotes around the path
  const withoutNode = trimmed
    .replace(/^node\s+/, "")
    .replace(/^["']|["']$/g, "");
  // Strip leading dots and slashes, then extract the filename without .mjs
  const normalized = path.normalize(withoutNode);
  const basename = path.basename(normalized, ".mjs");
  return basename;
}

function collectClaudeHookCommands(hooksRoot) {
  const commands = [];
  if (!hooksRoot || typeof hooksRoot !== "object") {
    return commands;
  }
  for (const entries of Object.values(hooksRoot)) {
    if (!Array.isArray(entries)) {
      continue;
    }
    for (const entry of entries) {
      for (const hook of entry.hooks ?? []) {
        if (hook?.type === "command" && typeof hook.command === "string") {
          commands.push(hook.command.trim());
        }
      }
    }
  }
  return commands;
}

async function checkContract() {
  const raw = await fs.readFile(CONTRACT, "utf8");
  const json = JSON.parse(raw);
  const v = json.schemaVersion;
  if (typeof v !== "number") {
    throw new Error(
      "workflow-contract.json: schemaVersion missing or not a number",
    );
  }
  return v;
}

async function checkHooks() {
  const settings = JSON.parse(await fs.readFile(SETTINGS, "utf8"));
  const hooks = settings.hooks;
  if (!hooks?.PreToolUse?.length || !hooks?.PostToolUse?.length) {
    throw new Error(
      ".claude/settings.json: missing PreToolUse or PostToolUse hooks",
    );
  }
  // Compare by hook name: normalize both relative paths and absolute paths
  const found = collectClaudeHookCommands(hooks).map(normalizeHookName).sort();
  const expected = [...EXPECTED_CLAUDE_HOOK_COMMANDS]
    .map(normalizeHookName)
    .sort();
  if (JSON.stringify(found) !== JSON.stringify(expected)) {
    throw new Error(
      `Hook command set mismatch.\n  expected (${expected.length}): ${expected.join(", ")}\n  found (${found.length}): ${found.join(", ")}`,
    );
  }
}

async function checkSync() {
  const { stderr, stdout } = await execFileAsync(
    process.execPath,
    [path.join(repoRoot, "scripts", "sync-runtimes.mjs"), "--check"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  if (stderr && stderr.trim()) {
    process.stderr.write(stderr);
  }
  if (process.env.DOCTOR_GOVERNANCE_VERBOSE === "1" && stdout?.trim()) {
    process.stdout.write(stdout);
  }
}

async function checkValidateRun() {
  const artifactRel = path.relative(repoRoot, FIXTURE).replace(/\\/g, "/");
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [path.join(repoRoot, "scripts", "validate-run-artifact.mjs"), artifactRel],
    { cwd: repoRoot, encoding: "utf8" },
  );
  if (stderr?.trim()) {
    process.stderr.write(stderr);
  }
  let parsed;
  try {
    parsed = JSON.parse((stdout ?? "").trim() || "{}");
  } catch {
    throw new Error(
      `meta:validate:run output was not JSON: ${String(stdout).slice(0, 240)}`,
    );
  }
  if (!parsed.ok) {
    throw new Error("meta:validate:run reported ok: false");
  }
  if (process.env.DOCTOR_GOVERNANCE_VERBOSE === "1" && stdout?.trim()) {
    process.stdout.write(stdout);
  }
}

async function checkLocalState() {
  const state = await ensureProfileState();
  const targetContext = await resolveTargetContext();
  const collision = await detectProfileCollision({
    profile: state.profile,
    runtimeFamily: state.runtimeFamily,
  });
  if (collision.collision) {
    throw new Error(
      `profile collision detected for ${state.profile}: expected ${collision.expectedProfileKey}, found ${collision.existing?.profileKey}`,
    );
  }
  let runIndexReady = false;
  try {
    await fs.access(state.runIndexPath);
    runIndexReady = true;
  } catch {
    runIndexReady = false;
  }

  return {
    profile: state.profile,
    profileKey: state.metadata.profileKey,
    runtimeFamily: state.runtimeFamily,
    activeTargets: targetContext.activeTargets,
    supportedTargets: targetContext.supportedTargets,
    runIndexReady,
    runIndexPath: toRepoRelative(state.runIndexPath),
    compactionDir: toRepoRelative(state.compactionDir),
  };
}

async function writeDoctorCache({
  profile,
  failed,
  canonicalLines,
  mirrorLines,
  runtimeLines,
  localLines,
}) {
  const state = getProfilePaths({ profile });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const cacheFile = path.join(state.doctorCacheDir, `${timestamp}.json`);
  const cache = {
    timestamp,
    nodeVersion: process.version,
    passed: !failed,
    sections: {
      canonical: canonicalLines.join("\n"),
      mirror: mirrorLines.join("\n"),
      runtime: runtimeLines.join("\n"),
      local: localLines.join("\n"),
    },
    profile,
    profileKey: state.profileKey,
  };
  await fs.writeFile(cacheFile, JSON.stringify(cache, null, 2), "utf8");
  // Also write latest.json symlink-equivalent (overwrite)
  const latest = path.join(state.doctorCacheDir, "latest.json");
  await fs.writeFile(latest, JSON.stringify(cache, null, 2), "utf8");
  console.log(`  [cache] written to ${toRepoRelative(cacheFile)}`);
}

async function main() {
  console.log("meta-kim doctor:governance");
  const canonicalLines = [];
  const mirrorLines = [];
  const runtimeLines = [];
  const localLines = [];
  let failed = false;
  let profile = "default";

  try {
    const schemaVersion = await checkContract();
    canonicalLines.push(
      `  [ok] workflow-contract.json schemaVersion=${schemaVersion}`,
    );
  } catch (e) {
    failed = true;
    canonicalLines.push(`  [fail] contract: ${e.message}`);
  }

  try {
    await checkValidateRun();
    canonicalLines.push(
      `  [ok] meta:validate:run on ${path.relative(repoRoot, FIXTURE).replace(/\\/g, "/")}`,
    );
  } catch (e) {
    failed = true;
    canonicalLines.push(`  [fail] meta:validate:run: ${e.message}`);
    if (e.stderr) {
      canonicalLines.push(String(e.stderr).trim());
    }
  }

  try {
    await checkSync();
    mirrorLines.push(
      "  [ok] npm run meta:check:runtimes (mirrors match canonical)",
    );
  } catch (e) {
    failed = true;
    mirrorLines.push(`  [fail] sync: ${e.message}`);
    if (e.stderr) {
      mirrorLines.push(String(e.stderr).trim());
    }
  }

  try {
    await checkHooks();
    runtimeLines.push(
      `  [ok] .claude/settings.json hook commands (${EXPECTED_CLAUDE_HOOK_COMMANDS.length} commands)`,
    );
  } catch (e) {
    failed = true;
    runtimeLines.push(`  [fail] hooks: ${e.message}`);
    if (e.stderr) {
      runtimeLines.push(String(e.stderr).trim());
    }
  }

  try {
    const localState = await checkLocalState();
    profile = localState.profile;
    localLines.push(
      `  [ok] profile=${localState.profile} runtime=${localState.runtimeFamily} key=${localState.profileKey}`,
    );
    localLines.push(
      `  [ok] activeTargets=${localState.activeTargets.join(", ")} supportedTargets=${localState.supportedTargets.join(", ")}`,
    );
    localLines.push(
      `  [ok] run index ${localState.runIndexReady ? "ready" : "not-built-yet"}: ${localState.runIndexPath}`,
    );
    localLines.push(`  [ok] compaction dir: ${localState.compactionDir}`);
  } catch (e) {
    failed = true;
    localLines.push(`  [fail] local state: ${e.message}`);
  }

  console.log("Canonical health");
  console.log(canonicalLines.join("\n"));
  console.log("Mirror health");
  console.log(mirrorLines.join("\n"));
  console.log("Runtime health");
  console.log(runtimeLines.join("\n"));
  console.log("Local index health");
  console.log(localLines.join("\n"));

  // Write cache last (non-blocking for the overall result)
  try {
    await writeDoctorCache({
      profile,
      failed,
      canonicalLines,
      mirrorLines,
      runtimeLines,
      localLines,
    });
  } catch (e) {
    console.error(`  [warn] failed to write doctor cache: ${e.message}`);
  }

  if (failed) {
    console.error(
      "\nDoctor finished with failures. Fix the items above, then run: npm run meta:sync && npm run meta:validate",
    );
    process.exitCode = 1;
  } else {
    console.log("\nAll governance doctor checks passed.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
