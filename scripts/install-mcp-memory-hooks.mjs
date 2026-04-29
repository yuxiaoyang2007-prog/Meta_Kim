/**
 * install-mcp-memory-hooks.mjs
 *
 * Installs MCP Memory Service hooks and commands.
 *
 * What this script does (in order):
 *   1. Copy the canonical Python hook from canonical/runtime-assets/claude/memory-hooks/
 *      to ~/.claude/hooks/mcp_memory_global.py
 *   2. Seed ~/.claude/hooks/config.json from config.template.json if not present
 *      (NEVER overwrite an existing config — user customizations are preserved)
 *   3. Copy stop-save-progress.mjs and stop-memory-save.mjs from canonical/runtime-assets/claude/hooks/
 *      to ~/.claude/hooks/meta-kim/
 *   4. Copy commands from canonical/runtime-assets/claude/commands/ to ~/.claude/commands/
 *      (e.g., save-progress command)
 *   5. Register the SessionStart hook in ~/.claude/settings.json
 *   6. Register the Stop hook in ~/.claude/settings.json (stop-save-progress.mjs + stop-memory-save.mjs)
 *   7. Install lifecycle memory bridges for Codex, Cursor, and OpenClaw
 *   8. Warn if MCP server not responding on http://localhost:8000
 *
 * Usage:
 *   node scripts/install-mcp-memory-hooks.mjs           # Install (idempotent)
 *   node scripts/install-mcp-memory-hooks.mjs --check   # Dry-run: verify only, no side effects
 *   node scripts/install-mcp-memory-hooks.mjs --remove  # Uninstall hooks (keeps files)
 *
 * Exit codes:
 *   0  success
 *   1  non-fatal warnings occurred (hook copied but registration failed)
 *   2  fatal: canonical source asset missing
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

// ── Paths ──────────────────────────────────────────────

const CANONICAL_HOOK_DIR = join(
  REPO_ROOT,
  "canonical",
  "runtime-assets",
  "claude",
  "memory-hooks",
);
const CANONICAL_HOOK_SOURCE = join(CANONICAL_HOOK_DIR, "mcp_memory_global.py");
const CANONICAL_CONFIG_TEMPLATE = join(
  CANONICAL_HOOK_DIR,
  "config.template.json",
);
const CANONICAL_HOOKS_DIR = join(
  REPO_ROOT,
  "canonical",
  "runtime-assets",
  "claude",
  "hooks",
);
const CANONICAL_STOP_HOOK_SOURCE = join(
  CANONICAL_HOOKS_DIR,
  "stop-save-progress.mjs",
);
const CANONICAL_MEMORY_SAVE_HOOK_SOURCE = join(
  CANONICAL_HOOKS_DIR,
  "stop-memory-save.mjs",
);
const CANONICAL_COMMANDS_DIR = join(
  REPO_ROOT,
  "canonical",
  "runtime-assets",
  "claude",
  "commands",
);
const CANONICAL_SHARED_MEMORY_SAVE_HOOK_SOURCE = join(
  REPO_ROOT,
  "canonical",
  "runtime-assets",
  "shared",
  "hooks",
  "meta-kim-memory-save.mjs",
);
const CANONICAL_OPENCLAW_MEMORY_HOOK_DIR = join(
  REPO_ROOT,
  "canonical",
  "runtime-assets",
  "openclaw",
  "hooks",
  "mcp-memory-service",
);

const HOOKS_TARGET_DIR = join(homedir(), ".claude", "hooks");
const HOOK_TARGET = join(HOOKS_TARGET_DIR, "mcp_memory_global.py");
const CONFIG_TARGET = join(HOOKS_TARGET_DIR, "config.json");
const META_KIM_HOOKS_DIR = join(HOOKS_TARGET_DIR, "meta-kim");
const STOP_HOOK_TARGET = join(META_KIM_HOOKS_DIR, "stop-save-progress.mjs");
const MEMORY_SAVE_HOOK_TARGET = join(
  META_KIM_HOOKS_DIR,
  "stop-memory-save.mjs",
);
const COMMANDS_TARGET_DIR = join(homedir(), ".claude", "commands");
const CLAUDE_SETTINGS = join(homedir(), ".claude", "settings.json");
const CODEX_HOME = join(homedir(), ".codex");
const CURSOR_HOME = join(homedir(), ".cursor");
const OPENCLAW_HOME = join(homedir(), ".openclaw");
const CROSS_RUNTIME_HOOK_FILE = "meta-kim-memory-save.mjs";

// ── Formatting helpers ──────────────────────────────────

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

function info(msg) {
  console.log(`${dim("→")} ${msg}`);
}
function ok(msg) {
  console.log(`${green("✓")} ${msg}`);
}
function warn(msg) {
  console.log(`${yellow("⚠")} ${msg}`);
}
function fail(msg) {
  console.log(`${red("✗")} ${msg}`);
}

// ── Core helpers ────────────────────────────────────────

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    encoding: "utf8",
    shell: false,
    ...opts,
  });
}

function isMemoryProcessRunning() {
  if (process.platform !== "win32") return false;
  try {
    const ps = run("pwsh.exe", [
      "-NoProfile",
      "-Command",
      "if (Get-Process -Name memory -ErrorAction SilentlyContinue) { 'running' }",
    ]);
    if (ps.status === 0 && ps.stdout.includes("running")) return true;
  } catch {
    // fall through
  }
  try {
    const result = run("tasklist", ["/FI", "IMAGENAME eq memory.exe"]);
    return result.status === 0 && /\bmemory\.exe\b/iu.test(result.stdout);
  } catch {
    return false;
  }
}

function checkServerHealthStatus(url = "http://localhost:8000/api/health") {
  const curl = process.platform === "win32" ? "curl.exe" : "curl";
  try {
    const result = run(curl, ["--noproxy", "*", "-s", "--max-time", "2", url]);
    if (result.status === 0 && result.stdout) {
      const data = JSON.parse(result.stdout);
      return data.status === "healthy" ? "healthy" : "down";
    }
  } catch {
    // fall through
  }
  return isMemoryProcessRunning() ? "unknown" : "down";
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    info(`Created ${dir}`);
  }
}

function filesEqual(a, b) {
  if (!existsSync(a) || !existsSync(b)) return false;
  try {
    return readFileSync(a, "utf8") === readFileSync(b, "utf8");
  } catch {
    return false;
  }
}

function copyDir(src, dest) {
  if (!existsSync(src)) return false;
  ensureDir(dest);
  for (const entry of readdirSyncCompat(src)) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (!existsSync(destPath) || !filesEqual(srcPath, destPath)) {
      copyFileSync(srcPath, destPath);
    }
  }
  return true;
}

function readdirSyncCompat(dir) {
  return statSync(dir).isDirectory()
    ? readdirSync(dir, { withFileTypes: true })
    : [];
}

function commandToken(value) {
  return /[\s"]/u.test(value) ? JSON.stringify(value) : value;
}

function nodeHookCommand(hookPath, args = []) {
  return [process.execPath, hookPath, ...args].map(commandToken).join(" ");
}

function copyStopHookFile() {
  if (!existsSync(CANONICAL_STOP_HOOK_SOURCE)) {
    warn(`Canonical stop hook source missing: ${CANONICAL_STOP_HOOK_SOURCE}`);
    info("stop-save-progress.mjs will not be installed.");
    return false;
  }

  ensureDir(META_KIM_HOOKS_DIR);

  if (
    existsSync(STOP_HOOK_TARGET) &&
    filesEqual(CANONICAL_STOP_HOOK_SOURCE, STOP_HOOK_TARGET)
  ) {
    ok(`Stop hook already up-to-date: ${STOP_HOOK_TARGET}`);
  } else {
    try {
      copyFileSync(CANONICAL_STOP_HOOK_SOURCE, STOP_HOOK_TARGET);
      ok(`Stop hook copied → ${STOP_HOOK_TARGET}`);
    } catch (err) {
      warn(`Failed to copy stop hook: ${err.message}`);
    }
  }

  // Also copy the MCP Memory save hook
  if (!existsSync(CANONICAL_MEMORY_SAVE_HOOK_SOURCE)) {
    warn(
      `Memory save hook source missing: ${CANONICAL_MEMORY_SAVE_HOOK_SOURCE}`,
    );
  } else if (
    existsSync(MEMORY_SAVE_HOOK_TARGET) &&
    filesEqual(CANONICAL_MEMORY_SAVE_HOOK_SOURCE, MEMORY_SAVE_HOOK_TARGET)
  ) {
    ok(`Memory save hook already up-to-date: ${MEMORY_SAVE_HOOK_TARGET}`);
  } else {
    try {
      copyFileSync(CANONICAL_MEMORY_SAVE_HOOK_SOURCE, MEMORY_SAVE_HOOK_TARGET);
      ok(`Memory save hook copied → ${MEMORY_SAVE_HOOK_TARGET}`);
    } catch (err) {
      warn(`Failed to copy memory save hook: ${err.message}`);
    }
  }

  return true;
}

async function copyCommandsDir() {
  if (!existsSync(CANONICAL_COMMANDS_DIR)) {
    ok("No commands to install (canonical/commands/ not found)");
    return true;
  }

  try {
    const entries = await readdir(CANONICAL_COMMANDS_DIR, {
      withFileTypes: true,
    });
    if (entries.length === 0) {
      ok("No commands to install (canonical/commands/ is empty)");
      return true;
    }

    ensureDir(COMMANDS_TARGET_DIR);
    let installed = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const srcDir = join(CANONICAL_COMMANDS_DIR, entry.name);
      const destDir = join(COMMANDS_TARGET_DIR, entry.name);

      // Read SKILL.md from source
      const srcSkill = join(srcDir, "SKILL.md");
      if (!existsSync(srcSkill)) {
        warn(`Skipping ${entry.name}: SKILL.md not found`);
        continue;
      }

      ensureDir(destDir);
      const destSkill = join(destDir, "SKILL.md");

      if (existsSync(destSkill) && filesEqual(srcSkill, destSkill)) {
        ok(`Command "${entry.name}" already up-to-date`);
      } else {
        copyFileSync(srcSkill, destSkill);
        ok(`Command "${entry.name}" installed → ${destSkill}`);
      }
      installed++;
    }

    if (installed > 0) {
      info(
        `${installed} command(s) available: ${entries.map((e) => "/" + e.name).join(", ")}`,
      );
    }
    return true;
  } catch (err) {
    warn(`Failed to install commands: ${err.message}`);
    return false;
  }
}

function copyHookFile() {
  if (!existsSync(CANONICAL_HOOK_SOURCE)) {
    fail(`Canonical hook source missing: ${CANONICAL_HOOK_SOURCE}`);
    info(
      "This is a Meta_Kim packaging bug — canonical/runtime-assets/claude/memory-hooks/ should ship with the repo.",
    );
    return false;
  }

  if (filesEqual(CANONICAL_HOOK_SOURCE, HOOK_TARGET)) {
    ok(`Hook already up-to-date: ${HOOK_TARGET}`);
    return true;
  }

  try {
    copyFileSync(CANONICAL_HOOK_SOURCE, HOOK_TARGET);
    ok(`Hook copied → ${HOOK_TARGET}`);
    return true;
  } catch (err) {
    fail(`Failed to copy hook: ${err.message}`);
    return false;
  }
}

function seedConfigIfMissing() {
  if (existsSync(CONFIG_TARGET)) {
    ok(`Config already present (preserved): ${CONFIG_TARGET}`);
    return true;
  }

  if (!existsSync(CANONICAL_CONFIG_TEMPLATE)) {
    warn(`Config template missing: ${CANONICAL_CONFIG_TEMPLATE}`);
    info("Hook will use defaults from environment variables.");
    return false;
  }

  try {
    copyFileSync(CANONICAL_CONFIG_TEMPLATE, CONFIG_TARGET);
    ok(`Config seeded → ${CONFIG_TARGET}`);
    return true;
  } catch (err) {
    warn(`Failed to seed config: ${err.message}`);
    return false;
  }
}

function pickPythonCommand() {
  // Prefer explicit python3, fall back to python. The hook itself targets 3.10+.
  const candidates =
    process.platform === "win32"
      ? ["python", "python3"]
      : ["python3", "python"];
  for (const cmd of candidates) {
    try {
      const result = run(cmd, ["--version"]);
      if (result.status === 0) return cmd;
    } catch {
      // try next
    }
  }
  return "python"; // last resort
}

function registerSessionStartHook() {
  if (!existsSync(CLAUDE_SETTINGS)) {
    warn(`${CLAUDE_SETTINGS} not found — skipping hook registration`);
    return false;
  }

  try {
    const settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf8"));
    const pythonCmd = pickPythonCommand();

    const existingBlocks = settings.hooks?.SessionStart ?? [];
    const alreadyRegistered = existingBlocks.some((b) =>
      b?.hooks?.some((h) => h?.command?.includes("mcp_memory_global.py")),
    );

    if (alreadyRegistered) {
      ok("SessionStart hook already registered");
      return true;
    }

    const nextSettings = {
      ...settings,
      hooks: {
        ...(settings.hooks ?? {}),
        SessionStart: [
          ...existingBlocks,
          {
            matcher: "*",
            hooks: [
              {
                type: "command",
                command: `${pythonCmd} "${HOOK_TARGET}"`,
              },
            ],
          },
        ],
      },
    };

    writeFileSync(
      CLAUDE_SETTINGS,
      JSON.stringify(nextSettings, null, 2) + "\n",
    );
    ok("SessionStart hook registered in settings.json");
    return true;
  } catch (err) {
    warn(`Failed to register hook: ${err.message}`);
    return false;
  }
}

function removeSessionStartHook() {
  if (!existsSync(CLAUDE_SETTINGS)) return;
  try {
    const settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf8"));
    if (!settings.hooks?.SessionStart) return;

    const filteredBlocks = settings.hooks.SessionStart.map((block) => ({
      ...block,
      hooks: (block?.hooks ?? []).filter(
        (h) => !h?.command?.includes("mcp_memory_global.py"),
      ),
    })).filter((block) => (block.hooks ?? []).length > 0);

    const nextHooks = { ...settings.hooks };
    if (filteredBlocks.length === 0) {
      delete nextHooks.SessionStart;
    } else {
      nextHooks.SessionStart = filteredBlocks;
    }

    const nextSettings = { ...settings, hooks: nextHooks };
    if (Object.keys(nextHooks).length === 0) delete nextSettings.hooks;

    writeFileSync(
      CLAUDE_SETTINGS,
      JSON.stringify(nextSettings, null, 2) + "\n",
    );
    ok("SessionStart hook removed from settings.json");
  } catch (err) {
    warn(`Failed to remove hook: ${err.message}`);
  }
}

function registerStopHook() {
  if (!existsSync(CLAUDE_SETTINGS)) {
    warn(`${CLAUDE_SETTINGS} not found — skipping Stop hook registration`);
    return false;
  }

  try {
    const settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf8"));

    const existingBlocks = settings.hooks?.Stop ?? [];
    const hasSaveProgress = existingBlocks.some((b) =>
      b?.hooks?.some((h) => h?.command?.includes("stop-save-progress.mjs")),
    );
    const hasMemorySave = existingBlocks.some((b) =>
      b?.hooks?.some((h) => h?.command?.includes("stop-memory-save.mjs")),
    );

    if (hasSaveProgress && hasMemorySave) {
      ok("Stop hooks already registered");
      return true;
    }

    const newHooks = [];
    if (!hasMemorySave) {
      newHooks.push({
        type: "command",
        command: `node "${MEMORY_SAVE_HOOK_TARGET}"`,
      });
    }
    if (!hasSaveProgress) {
      newHooks.push({
        type: "command",
        command: `node "${STOP_HOOK_TARGET}"`,
      });
    }

    const nextSettings = {
      ...settings,
      hooks: {
        ...(settings.hooks ?? {}),
        Stop: [
          ...existingBlocks,
          {
            matcher: "*",
            hooks: newHooks,
          },
        ],
      },
    };

    writeFileSync(
      CLAUDE_SETTINGS,
      JSON.stringify(nextSettings, null, 2) + "\n",
    );
    ok(`Stop hook(s) registered in settings.json (+${newHooks.length})`);
    return true;
  } catch (err) {
    warn(`Failed to register Stop hook: ${err.message}`);
    return false;
  }
}

function removeStopHook() {
  if (!existsSync(CLAUDE_SETTINGS)) return;
  try {
    const settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf8"));
    if (!settings.hooks?.Stop) return;

    const filteredBlocks = settings.hooks.Stop.map((block) => ({
      ...block,
      hooks: (block?.hooks ?? []).filter(
        (h) =>
          !h?.command?.includes("stop-save-progress.mjs") &&
          !h?.command?.includes("stop-memory-save.mjs"),
      ),
    })).filter((block) => (block.hooks ?? []).length > 0);

    const nextHooks = { ...settings.hooks };
    if (filteredBlocks.length === 0) {
      delete nextHooks.Stop;
    } else {
      nextHooks.Stop = filteredBlocks;
    }

    const nextSettings = { ...settings, hooks: nextHooks };
    if (Object.keys(nextHooks).length === 0) delete nextSettings.hooks;

    writeFileSync(
      CLAUDE_SETTINGS,
      JSON.stringify(nextSettings, null, 2) + "\n",
    );
    ok("Stop hook removed from settings.json");
  } catch (err) {
    warn(`Failed to remove Stop hook: ${err.message}`);
  }
}

function readJsonFile(filePath, fallback = {}) {
  if (!existsSync(filePath)) return fallback;
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function copyCrossRuntimeMemoryHook(runtimeHome) {
  if (!existsSync(CANONICAL_SHARED_MEMORY_SAVE_HOOK_SOURCE)) {
    warn(
      `Cross-runtime memory hook source missing: ${CANONICAL_SHARED_MEMORY_SAVE_HOOK_SOURCE}`,
    );
    return null;
  }

  const hooksDir = join(runtimeHome, "hooks");
  ensureDir(hooksDir);
  const target = join(hooksDir, CROSS_RUNTIME_HOOK_FILE);
  if (existsSync(target) && filesEqual(CANONICAL_SHARED_MEMORY_SAVE_HOOK_SOURCE, target)) {
    ok(`Cross-runtime memory hook already up-to-date: ${target}`);
  } else {
    copyFileSync(CANONICAL_SHARED_MEMORY_SAVE_HOOK_SOURCE, target);
    ok(`Cross-runtime memory hook copied -> ${target}`);
  }
  return target;
}

function registerCodexMemoryHook(hookPath) {
  const hooksJson = join(CODEX_HOME, "hooks.json");
  const settings = readJsonFile(hooksJson, { hooks: {} });
  if (!settings.hooks) settings.hooks = {};

  const withoutMemoryBlocks = (eventName) =>
    (Array.isArray(settings.hooks[eventName]) ? settings.hooks[eventName] : [])
      .map((block) => {
        const hooks = (block?.hooks ?? []).filter(
          (hook) => !String(hook?.command ?? "").includes(CROSS_RUNTIME_HOOK_FILE),
        );
        return hooks.length > 0 ? { ...block, hooks } : null;
      })
      .filter(Boolean);

  settings.hooks.SessionStart = [{
    matcher: "startup|resume",
    hooks: [
      {
        type: "command",
        command: nodeHookCommand(hookPath, ["--event", "session-start"]),
        timeout: 10,
        statusMessage: "Loading Meta_Kim memory",
      },
    ],
  }, ...withoutMemoryBlocks("SessionStart")];
  settings.hooks.UserPromptSubmit = [{
    hooks: [
      {
        type: "command",
        command: nodeHookCommand(hookPath, ["--event", "user-prompt"]),
        timeout: 10,
      },
    ],
  }, ...withoutMemoryBlocks("UserPromptSubmit")];
  settings.hooks.Stop = [{
    hooks: [
      {
        type: "command",
        command: nodeHookCommand(hookPath, ["--event", "stop"]),
        timeout: 10,
      },
    ],
  }, ...withoutMemoryBlocks("Stop")];
  writeFileSync(hooksJson, JSON.stringify(settings, null, 2) + "\n");
  ok(`Codex lifecycle memory hooks registered first in ${hooksJson}`);
  return true;
}

function registerCursorMemoryHook(hookPath) {
  const hooksJson = join(CURSOR_HOME, "hooks.json");
  const settings = readJsonFile(hooksJson, { version: 1, hooks: {} });
  if (!settings.hooks) settings.hooks = {};

  const withoutMemoryHooks = (eventName) =>
    (Array.isArray(settings.hooks[eventName]) ? settings.hooks[eventName] : [])
      .filter((hook) => !String(hook?.command ?? "").includes(CROSS_RUNTIME_HOOK_FILE));

  settings.hooks.beforeSubmitPrompt = [{
    command: nodeHookCommand(hookPath, ["--event", "user-prompt"]),
    timeout: 10,
  }, ...withoutMemoryHooks("beforeSubmitPrompt")];
  settings.hooks.stop = [{
    command: nodeHookCommand(hookPath, ["--event", "stop"]),
    timeout: 10,
  }, ...withoutMemoryHooks("stop")];
  writeFileSync(hooksJson, JSON.stringify(settings, null, 2) + "\n");
  ok(`Cursor prompt/stop memory hooks registered first in ${hooksJson}`);
  return true;
}

function installOpenClawMemoryHook() {
  if (!existsSync(CANONICAL_OPENCLAW_MEMORY_HOOK_DIR)) {
    warn(`OpenClaw memory hook source missing: ${CANONICAL_OPENCLAW_MEMORY_HOOK_DIR}`);
    return false;
  }
  const targetDir = join(OPENCLAW_HOME, "hooks", "mcp-memory-service");
  copyDir(CANONICAL_OPENCLAW_MEMORY_HOOK_DIR, targetDir);
  ok(`OpenClaw MCP memory hook installed -> ${targetDir}`);
  return true;
}

function installCrossRuntimeMemoryHooks() {
  const codexHook = copyCrossRuntimeMemoryHook(CODEX_HOME);
  const cursorHook = copyCrossRuntimeMemoryHook(CURSOR_HOME);
  const codexOk = codexHook ? registerCodexMemoryHook(codexHook) : false;
  const cursorOk = cursorHook ? registerCursorMemoryHook(cursorHook) : false;
  const openclawOk = installOpenClawMemoryHook();
  return codexOk && cursorOk && openclawOk;
}

function removeCrossRuntimeMemoryHooks() {
  for (const [runtimeHome, hooksFile, eventNames] of [
    [CODEX_HOME, "hooks.json", ["SessionStart", "UserPromptSubmit", "Stop"]],
    [CURSOR_HOME, "hooks.json", ["beforeSubmitPrompt", "stop"]],
  ]) {
    const hooksJson = join(runtimeHome, hooksFile);
    if (!existsSync(hooksJson)) continue;
    const settings = readJsonFile(hooksJson, null);
    if (!settings?.hooks) continue;
    for (const eventName of eventNames) {
      if (!settings.hooks[eventName]) continue;
      settings.hooks[eventName] = settings.hooks[eventName]
        .map((block) => {
          if (block?.command) {
            return String(block.command).includes(CROSS_RUNTIME_HOOK_FILE) ? null : block;
          }
          const hooks = (block?.hooks ?? []).filter(
            (hook) => !String(hook?.command ?? "").includes(CROSS_RUNTIME_HOOK_FILE),
          );
          return hooks.length > 0 ? { ...block, hooks } : null;
        })
        .filter(Boolean);
      if (settings.hooks[eventName].length === 0) delete settings.hooks[eventName];
    }
    writeFileSync(hooksJson, JSON.stringify(settings, null, 2) + "\n");
  }

  const openclawHookDir = join(OPENCLAW_HOME, "hooks", "mcp-memory-service");
  if (existsSync(openclawHookDir)) {
    rmSync(openclawHookDir, { recursive: true, force: true });
  }
}

// ── Commands ────────────────────────────────────────────

async function install() {
  console.log(`\n${bold("Installing MCP Memory runtime hooks...")}\n`);

  ensureDir(HOOKS_TARGET_DIR);

  const hookCopied = copyHookFile();
  if (!hookCopied) {
    console.log(
      `\n${red("Installation aborted: hook file could not be placed.")}\n`,
    );
    process.exit(2);
  }

  seedConfigIfMissing();
  copyStopHookFile();
  await copyCommandsDir();
  const sessionStartOk = registerSessionStartHook();
  const stopOk = registerStopHook();
  const crossRuntimeOk = installCrossRuntimeMemoryHooks();

  console.log("");
  info("Checking MCP Memory Service health...");
  const health = checkServerHealthStatus();
  if (health === "healthy") {
    ok("MCP Memory Service is running on http://localhost:8000");
  } else if (health === "unknown") {
    warn("Could not verify http://localhost:8000 from this shell, but memory.exe is running");
  } else {
    warn("MCP Memory Service is NOT responding on http://localhost:8000");
    info("Start it with: python -m mcp_memory_service");
    info("Or:            uv run memory server -s hybrid");
  }

  if (!sessionStartOk || !stopOk || !crossRuntimeOk) {
    warn(
      "Some hooks were not registered — restart runtimes or review hook config",
    );
    console.log(
      `\n${yellow("Done with warnings.")} Restart Claude Code / Codex / Cursor / OpenClaw to load hooks.\n`,
    );
    process.exit(1);
  }

  console.log(
    `\n${green("Done!")} Restart Claude Code / Codex / Cursor / OpenClaw for hooks to take effect.\n`,
  );
}

function check() {
  console.log(`\n${bold("Checking MCP Memory hook installation...")}\n`);

  const sourceExists = existsSync(CANONICAL_HOOK_SOURCE);
  sourceExists
    ? ok(`Canonical source present: ${CANONICAL_HOOK_SOURCE}`)
    : fail(`Canonical source MISSING: ${CANONICAL_HOOK_SOURCE}`);

  const targetExists = existsSync(HOOK_TARGET);
  targetExists
    ? ok(`Hook installed: ${HOOK_TARGET}`)
    : warn(`Hook not installed at ${HOOK_TARGET}`);

  if (sourceExists && targetExists) {
    const inSync = filesEqual(CANONICAL_HOOK_SOURCE, HOOK_TARGET);
    inSync
      ? ok("Hook content in sync with canonical")
      : warn("Hook content DIFFERS from canonical (run install to update)");
  }

  const configExists = existsSync(CONFIG_TARGET);
  configExists
    ? ok(`Config present: ${CONFIG_TARGET}`)
    : warn(`Config missing: ${CONFIG_TARGET}`);

  const settingsExists = existsSync(CLAUDE_SETTINGS);
  if (settingsExists) {
    try {
      const settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf8"));
      const registered = (settings.hooks?.SessionStart ?? []).some((b) =>
        b?.hooks?.some((h) => h?.command?.includes("mcp_memory_global.py")),
      );
      registered
        ? ok("SessionStart hook registered in settings.json")
        : warn("SessionStart hook NOT registered");
    } catch {
      warn("Could not parse settings.json");
    }
  } else {
    warn(`settings.json not found: ${CLAUDE_SETTINGS}`);
  }

  for (const [label, runtimeHome, hooksFile, eventNames] of [
    ["Codex", CODEX_HOME, "hooks.json", ["SessionStart", "UserPromptSubmit", "Stop"]],
    ["Cursor", CURSOR_HOME, "hooks.json", ["beforeSubmitPrompt", "stop"]],
  ]) {
    const hookFile = join(runtimeHome, "hooks", CROSS_RUNTIME_HOOK_FILE);
    existsSync(hookFile)
      ? ok(`${label} memory hook installed: ${hookFile}`)
      : warn(`${label} memory hook missing: ${hookFile}`);
    const cfg = readJsonFile(join(runtimeHome, hooksFile), null);
    for (const eventName of eventNames) {
      const entries = cfg?.hooks?.[eventName] ?? [];
      const registered = Array.isArray(entries)
        ? entries.some((entry) => {
            if (entry?.command) {
              return String(entry.command).includes(CROSS_RUNTIME_HOOK_FILE);
            }
            return (entry?.hooks ?? []).some((hook) =>
              String(hook?.command ?? "").includes(CROSS_RUNTIME_HOOK_FILE),
            );
          })
        : false;
      registered
        ? ok(`${label} ${eventName} memory hook registered`)
        : warn(`${label} ${eventName} memory hook NOT registered`);
    }
  }

  const openclawHookDir = join(OPENCLAW_HOME, "hooks", "mcp-memory-service");
  existsSync(join(openclawHookDir, "HOOK.md")) &&
  existsSync(join(openclawHookDir, "handler.ts"))
    ? ok(`OpenClaw MCP memory hook installed: ${openclawHookDir}`)
    : warn(`OpenClaw MCP memory hook missing: ${openclawHookDir}`);

  const health = checkServerHealthStatus();
  if (health === "healthy") {
    ok("MCP Memory Service responding on :8000");
  } else if (health === "unknown") {
    warn("MCP Memory Service health could not be verified from this shell, but memory.exe is running");
  } else {
    warn("MCP Memory Service NOT responding on :8000");
  }

  console.log("");
}

function remove() {
  console.log(
    `\n${bold("Removing MCP Memory Claude Code hook registration...")}\n`,
  );

  removeSessionStartHook();
  removeStopHook();
  removeCrossRuntimeMemoryHooks();
  info(`Hook file retained (manual delete: rm "${HOOK_TARGET}")`);
  info(
    `Stop hook files retained (manual delete: rm "${STOP_HOOK_TARGET}" "${MEMORY_SAVE_HOOK_TARGET}")`,
  );
  info("Cross-runtime hook files retained in ~/.codex/hooks, ~/.cursor/hooks, and ~/.openclaw/hooks");
  info(`Config retained (manual delete: rm "${CONFIG_TARGET}")`);
  ok("Done.\n");
}

// ── Main ────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--check")) {
  check();
} else if (args.includes("--remove")) {
  remove();
} else {
  install().catch((err) => {
    console.error(`Installation failed: ${err.message}`);
    process.exit(1);
  });
}
