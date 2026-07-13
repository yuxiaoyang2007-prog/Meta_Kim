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
 *      - Automatically detects and validates Python paths
 *      - On Windows: skips WindowsApps shim, prefers explicit Python executable
 *      - Auto-fixes invalid Python paths (e.g., bare "python" on Windows)
 *   6. Register the Stop hook in ~/.claude/settings.json (stop-save-progress.mjs + stop-memory-save.mjs)
 *   7. Install lifecycle memory bridges for Codex, Cursor, and OpenClaw
 *   8. Warn if MCP server is not responding on the configured endpoint
 *      (MCP_MEMORY_URL, META_KIM_MEMORY_PORT, or http://localhost:8000)
 *
 * Usage:
 *   node scripts/install-mcp-memory-hooks.mjs                         # Install all runtime hooks
 *   node scripts/install-mcp-memory-hooks.mjs --targets codex,cursor   # Install selected runtime hooks
 *   node scripts/install-mcp-memory-hooks.mjs --check                  # Dry-run: verify only, no side effects
 *   node scripts/install-mcp-memory-hooks.mjs --force                  # Force-update Python paths even if current is valid
 *   node scripts/install-mcp-memory-hooks.mjs --remove                 # Uninstall hooks (keeps files)
 *
 * Exit codes:
 *   0  success
 *   1  non-fatal warnings occurred (hook copied but registration failed)
 *   2  fatal: canonical source asset missing
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  rmSync,
  statSync,
  lstatSync,
  realpathSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { readdir } from "node:fs/promises";
import { join, dirname, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { resolveMemoryEndpoint } from "./memory-endpoint.mjs";
import {
  executeSafeManagedFileTransaction,
  normalizeManagedRelPath,
  sha256Buffer,
  sha256ManagedFile,
  validateManagedManifest,
} from "./safe-managed-file-operations.mjs";

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
const RUNTIME_MANIFEST_DIR = join(
  homedir(),
  ".meta-kim",
  "manifests",
  "mcp-memory-hooks",
);
const RUNTIME_MANIFEST_SCHEMA = "meta-kim-memory-hook-files-v2";
const CROSS_RUNTIME_HOOK_FILE = "meta-kim-memory-save.mjs";
const VALID_TARGETS = new Set(["claude", "codex", "cursor", "openclaw"]);
const DEFAULT_TARGETS = ["claude", "codex", "cursor", "openclaw"];

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

// Global flag for force-update mode
let FORCE_UPDATE = false;
let claudeConsentWarningShown = false;

function requireClaudeGlobalSettingsConsent({ explicitRemove = false } = {}) {
  const allowed =
    explicitRemove ||
    FORCE_UPDATE ||
    process.env.META_KIM_CONFIRM_GLOBAL === "1";
  if (allowed) return true;
  if (!claudeConsentWarningShown) {
    warn(
      "Refusing to write to user-global Claude settings without explicit consent. " +
      "Pass --force or set META_KIM_CONFIRM_GLOBAL=1 to allow global mutation. " +
      `Target: ${CLAUDE_SETTINGS}`,
    );
    claudeConsentWarningShown = true;
  }
  return false;
}

function parseTargets(argv) {
  const valueFromEquals = argv.find((arg) => arg.startsWith("--targets="));
  const equalsValue = valueFromEquals ? valueFromEquals.slice("--targets=".length) : "";
  const targetIndex = argv.indexOf("--targets");
  const flagValue =
    targetIndex >= 0 && argv[targetIndex + 1] && !argv[targetIndex + 1].startsWith("--")
      ? argv[targetIndex + 1]
      : "";
  const raw = equalsValue || flagValue;
  if (!raw) return DEFAULT_TARGETS;
  const parsed = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => VALID_TARGETS.has(item));
  return parsed.length > 0 ? [...new Set(parsed)] : DEFAULT_TARGETS;
}

function targetListText(targets) {
  return targets.join(", ");
}

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

function configuredMemoryEndpoint() {
  return resolveMemoryEndpoint().endpointUrl;
}

function memoryHealthUrl(endpoint = configuredMemoryEndpoint()) {
  return resolveMemoryEndpoint({ MCP_MEMORY_URL: endpoint }).healthUrl;
}

function endpointPort(endpoint = configuredMemoryEndpoint()) {
  return resolveMemoryEndpoint({ MCP_MEMORY_URL: endpoint }).port;
}

function findProcessUsingPort(port) {
  if (!port) return null;
  if (process.platform === "win32") {
    const netstat = run("netstat", ["-ano", "-p", "tcp"]);
    if (netstat.status === 0) {
      const lines = netstat.stdout.split(/\r?\n/);
      const listeningLine = lines.find((line) => {
        const parts = line.trim().split(/\s+/);
        return (
          /LISTENING/i.test(line) &&
          parts.some((part) => part.endsWith(`:${port}`))
        );
      });
      const pid = listeningLine?.trim().split(/\s+/).pop();
      if (pid && /^\d+$/.test(pid)) {
        const task = run("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]);
        const name = task.stdout.match(/^"([^"]+)"/)?.[1] || "unknown";
        return { pid, name };
      }
    }
    return null;
  }

  const lsof = run("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]);
  if (lsof.status === 0 && lsof.stdout) {
    const line = lsof.stdout.split(/\r?\n/).find((entry) => /^\S+\s+\d+\s/u.test(entry));
    if (line) {
      const parts = line.trim().split(/\s+/);
      return { pid: parts[1], name: parts[0] };
    }
  }
  return null;
}

function printMemoryPortDiagnostic(endpoint = configuredMemoryEndpoint()) {
  const port = endpointPort(endpoint);
  const owner = findProcessUsingPort(port);
  if (!owner) {
    info(`Endpoint checked: ${endpoint}`);
    info("Use MCP_MEMORY_URL or META_KIM_MEMORY_PORT to point hooks at a different service.");
    return;
  }
  warn(`Port ${port} is already used by PID ${owner.pid} (${owner.name}).`);
  info(
    `Choose another endpoint, for example: set META_KIM_MEMORY_PORT=8001 or set MCP_MEMORY_URL=http://localhost:8001`,
  );
}

function checkServerHealthStatus(endpoint = configuredMemoryEndpoint()) {
  const curl = process.platform === "win32" ? "curl.exe" : "curl";
  const url = memoryHealthUrl(endpoint);
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

function filesEqual(a, b) {
  if (!existsSync(a) || !existsSync(b)) return false;
  try {
    return readFileSync(a, "utf8") === readFileSync(b, "utf8");
  } catch {
    return false;
  }
}

function commandToken(value) {
  const normalized = String(value).replace(/\\/g, "/");
  return /[\s"]/u.test(normalized) ? JSON.stringify(normalized) : normalized;
}

function nodeHookCommand(hookPath, args = []) {
  // Hooks are stored as shell command strings and may be executed by
  // PowerShell, cmd.exe, bash, or zsh depending on the host runtime. A quoted
  // absolute Windows Node path works in cmd.exe but fails in PowerShell without
  // the call operator. Use the PATH-resolved `node` binary and quote only
  // script/argument tokens that require it.
  return ["node", hookPath, ...args].map(commandToken).join(" ");
}

function isValidPythonCommand(cmd) {
  // Check if the Python command looks like a WindowsApps shim
  // or is a bare "python" on Windows (which often points to the shim)
  const isWin = process.platform === "win32";
  const normalized = cmd?.trim().replace(/\\/g, "/").toLowerCase() || "";

  // Bare "python" or "python3" on Windows is suspicious
  if (isWin && /^(python|python3)$/i.test(normalized)) {
    return false;
  }

  // WindowsApps paths are definitely shims
  if (/windowsapps[\\/]+python/.test(normalized)) {
    return false;
  }

  // Explicit absolute path is good
  if (/^[a-z]:\/|^\/\//i.test(normalized)) {
    return true;
  }

  // On non-Windows, "python3" is usually safe
  if (!isWin && /^python3/.test(normalized)) {
    return true;
  }

  return false;
}

function pickPythonCommand() {
  // Cross-platform Python resolver.
  // Windows: the Microsoft Store WindowsApps shim intercepts bare `python`
  // and returns exit code 49 without stderr — must be filtered out at every stage.
  const isWin = process.platform === "win32";
  const candidates = [];

  // 1. Explicit PYTHON env var (highest priority)
  if (process.env.PYTHON) candidates.push(process.env.PYTHON);

  // 2. System discovery via where/which — finds all versions in PATH
  const finder = isWin ? "where.exe" : "which";
  for (const name of ["python3", "python"]) {
    try {
      const result = run(finder, [name]);
      if (result.status === 0 && result.stdout) {
        const paths = result.stdout
          .trim()
          .split(/\r?\n/)
          .map((p) => p.trim())
          .filter(Boolean);
        candidates.push(...paths);
      }
    } catch {
      // not found
    }
  }

  // 3. Dynamic Windows install paths (no hardcoded version numbers)
  if (isWin) {
    const programsDir = process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "Programs")
      : join(homedir(), "AppData", "Local", "Programs");
    if (existsSync(programsDir)) {
      try {
        const entries = readdirSync(programsDir);
        const pythonDirs = entries
          .filter((e) => /^Python\d+$/i.test(e))
          .sort((a, b) => {
            const va = parseInt(a.replace(/\D/g, ""), 10);
            const vb = parseInt(b.replace(/\D/g, ""), 10);
            return vb - va; // highest version first
          });
        for (const dir of pythonDirs) {
          candidates.push(join(programsDir, dir, "python.exe"));
        }
      } catch {
        // can't read directory
      }
    }
  }

  // 4. Validate each candidate (dedup + skip WindowsApps shim + verify --version)
  const seen = new Set();
  for (const cmd of candidates) {
    if (!cmd) continue;
    const normalized = cmd.replace(/\\/g, "/").toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    if (isWin && /WindowsApps[\\/]+python(?:3)?\.exe$/iu.test(cmd)) {
      continue;
    }

    try {
      const result = run(cmd, ["--version"]);
      if (result.status === 0) return cmd.replace(/\\/g, "/");
    } catch {
      // try next
    }
  }

  warn("No working Python found — hook will likely fail at runtime");
  return "python3"; // python3 is less likely to be a Store shim on Windows
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

function isJsonObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readExistingJsonObjectStrict(filePath, fallback) {
  if (!existsSync(filePath)) return { ok: true, value: fallback, existed: false };
  try {
    const value = JSON.parse(readFileSync(filePath, "utf8"));
    if (!isJsonObject(value)) {
      return { ok: false, path: filePath, reason: "existing_json_root_not_object" };
    }
    return { ok: true, value, existed: true };
  } catch (error) {
    return {
      ok: false,
      path: filePath,
      reason: "existing_json_malformed",
      detail: error.message,
    };
  }
}

function readSelectedRuntimeSettingsStrict(targets) {
  const specs = [
    ["claude", CLAUDE_SETTINGS, { hooks: {} }],
    ["codex", join(CODEX_HOME, "hooks.json"), { hooks: {} }],
    ["cursor", join(CURSOR_HOME, "hooks.json"), { version: 1, hooks: {} }],
  ];
  const values = {};
  for (const [runtime, filePath, fallback] of specs) {
    if (!targets.includes(runtime)) continue;
    const parsed = readExistingJsonObjectStrict(filePath, fallback);
    if (!parsed.ok) return { ...parsed, runtime };
    values[runtime] = parsed.value;
  }
  return { ok: true, values };
}

function crossRuntimeMemoryHookDir(runtimeHome) {
  const globalMetaKimHooksDir = join(runtimeHome, "hooks", "meta-kim");
  if (existsSync(globalMetaKimHooksDir)) {
    return globalMetaKimHooksDir;
  }
  return join(runtimeHome, "hooks");
}

function crossRuntimeMemoryHookCandidates(runtimeHome) {
  return [
    join(runtimeHome, "hooks", "meta-kim", CROSS_RUNTIME_HOOK_FILE),
    join(runtimeHome, "hooks", CROSS_RUNTIME_HOOK_FILE),
  ];
}

function findInstalledCrossRuntimeMemoryHook(runtimeHome) {
  return crossRuntimeMemoryHookCandidates(runtimeHome).find((candidate) =>
    existsSync(candidate),
  ) ?? null;
}

function listRegularFiles(rootDir) {
  if (!existsSync(rootDir) || lstatSync(rootDir).isSymbolicLink()) return null;
  const files = [];
  const visit = (dirPath) => {
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) return false;
      const entryPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        if (!visit(entryPath)) return false;
      } else if (entry.isFile()) {
        files.push(relative(rootDir, entryPath).replace(/\\/g, "/"));
      } else return false;
    }
    return true;
  };
  return visit(rootDir) ? files.sort() : null;
}

function homeRel(filePath) {
  return normalizeManagedRelPath(relative(homedir(), filePath));
}

function runtimeManifestPath(runtime) {
  return join(RUNTIME_MANIFEST_DIR, `${runtime}.json`);
}

function readRuntimeManagedManifest(runtime) {
  const path = runtimeManifestPath(runtime);
  if (!existsSync(path)) return null;
  return validateManagedManifest(readJsonFile(path, null), {
    schemaVersion: RUNTIME_MANIFEST_SCHEMA,
  });
}

function canonicalFileSpecs(runtime) {
  const specs = [];
  const add = (source, target) => specs.push({ source, target, relPath: homeRel(target) });
  if (runtime === "claude") {
    add(CANONICAL_HOOK_SOURCE, HOOK_TARGET);
    add(CANONICAL_STOP_HOOK_SOURCE, STOP_HOOK_TARGET);
    add(CANONICAL_MEMORY_SAVE_HOOK_SOURCE, MEMORY_SAVE_HOOK_TARGET);
    const commandFiles = listRegularFiles(CANONICAL_COMMANDS_DIR) ?? [];
    for (const relPath of commandFiles) {
      add(join(CANONICAL_COMMANDS_DIR, relPath), join(COMMANDS_TARGET_DIR, relPath));
    }
  } else if (runtime === "codex") {
    add(CANONICAL_SHARED_MEMORY_SAVE_HOOK_SOURCE, join(crossRuntimeMemoryHookDir(CODEX_HOME), CROSS_RUNTIME_HOOK_FILE));
  } else if (runtime === "cursor") {
    add(CANONICAL_SHARED_MEMORY_SAVE_HOOK_SOURCE, join(crossRuntimeMemoryHookDir(CURSOR_HOME), CROSS_RUNTIME_HOOK_FILE));
  } else if (runtime === "openclaw") {
    for (const relPath of listRegularFiles(CANONICAL_OPENCLAW_MEMORY_HOOK_DIR) ?? []) {
      add(
        join(CANONICAL_OPENCLAW_MEMORY_HOOK_DIR, relPath),
        join(OPENCLAW_HOME, "hooks", "mcp-memory-service", relPath),
      );
    }
  }
  return specs.filter((spec) => spec.relPath && existsSync(spec.source));
}

function isSeedOnlyRetainedPath(runtime, relPath) {
  return runtime === "claude" && relPath === homeRel(CONFIG_TARGET);
}

function seedOnlyOperations(runtime) {
  if (
    runtime !== "claude" ||
    existsSync(CONFIG_TARGET) ||
    !existsSync(CANONICAL_CONFIG_TEMPLATE)
  ) return [];
  return [{
    kind: "write",
    phase: "auxiliary",
    relPath: homeRel(CONFIG_TARGET),
    content: readFileSync(CANONICAL_CONFIG_TEMPLATE),
    expectedOldHash: null,
  }];
}

function buildClaudeSettingsValue(settings) {
  const pythonCmd = pickPythonCommand();
  const without = (eventName, needles) => (settings.hooks?.[eventName] ?? [])
    .map((block) => ({
      ...block,
      hooks: (block?.hooks ?? []).filter(
        (hook) => !needles.some((needle) => String(hook?.command ?? "").includes(needle)),
      ),
    }))
    .filter((block) => (block.hooks ?? []).length > 0);
  return {
    ...settings,
    hooks: {
      ...(settings.hooks ?? {}),
      SessionStart: [
        ...without("SessionStart", ["mcp_memory_global.py"]),
        { matcher: "*", hooks: [{ type: "command", command: `${pythonCmd} "${HOOK_TARGET}"` }] },
      ],
      Stop: [
        ...without("Stop", ["stop-save-progress.mjs", "stop-memory-save.mjs"]),
        {
          matcher: "*",
          hooks: [
            { type: "command", command: `node "${MEMORY_SAVE_HOOK_TARGET}"` },
            { type: "command", command: `node "${STOP_HOOK_TARGET}"` },
          ],
        },
      ],
    },
  };
}

function buildCodexSettingsValue(settings) {
  const hookPath = join(crossRuntimeMemoryHookDir(CODEX_HOME), CROSS_RUNTIME_HOOK_FILE);
  const without = (eventName) => (settings.hooks?.[eventName] ?? [])
    .map((block) => {
      const hooks = (block?.hooks ?? []).filter(
        (hook) => !String(hook?.command ?? "").includes(CROSS_RUNTIME_HOOK_FILE),
      );
      return hooks.length > 0 ? { ...block, hooks } : null;
    })
    .filter(Boolean);
  return {
    ...settings,
    hooks: {
      ...(settings.hooks ?? {}),
      SessionStart: [{ matcher: "startup|resume", hooks: [{ type: "command", command: nodeHookCommand(hookPath, ["--event", "session-start"]), timeout: 10, statusMessage: "Loading Meta_Kim memory" }] }, ...without("SessionStart")],
      UserPromptSubmit: [{ hooks: [{ type: "command", command: nodeHookCommand(hookPath, ["--event", "user-prompt"]), timeout: 10 }] }, ...without("UserPromptSubmit")],
      Stop: [{ hooks: [{ type: "command", command: nodeHookCommand(hookPath, ["--event", "stop"]), timeout: 10 }] }, ...without("Stop")],
    },
  };
}

function buildCursorSettingsValue(settings) {
  const hookPath = join(crossRuntimeMemoryHookDir(CURSOR_HOME), CROSS_RUNTIME_HOOK_FILE);
  const without = (eventName) => (settings.hooks?.[eventName] ?? []).filter(
    (hook) => !String(hook?.command ?? "").includes(CROSS_RUNTIME_HOOK_FILE),
  );
  return {
    ...settings,
    hooks: {
      ...(settings.hooks ?? {}),
      beforeSubmitPrompt: [{ command: nodeHookCommand(hookPath, ["--event", "user-prompt"]), timeout: 10 }, ...without("beforeSubmitPrompt")],
      stop: [{ command: nodeHookCommand(hookPath, ["--event", "stop"]), timeout: 10 }, ...without("stop")],
    },
  };
}

function jsonOperation(filePath, value, phase = "content") {
  const content = JSON.stringify(value, null, 2) + "\n";
  const currentHash = sha256ManagedFile(filePath);
  if (currentHash === sha256Buffer(Buffer.from(content))) return null;
  return {
    kind: "write",
    relPath: homeRel(filePath),
    content,
    expectedOldHash: currentHash,
    phase,
  };
}

function blockedTransaction(reason, nextAction, relPath = null) {
  return {
    ok: false,
    status: "blocked",
    reason,
    nextAction,
    ...(relPath ? { relPath } : {}),
  };
}

function blockedExistingSettingsTransaction(existingSettings) {
  const relPath = homeRel(existingSettings.path) ?? existingSettings.path;
  warn(
    `Preserved ${existingSettings.runtime} settings: existing JSON is malformed or is not an object (${existingSettings.path})`,
  );
  const result = blockedTransaction(
    `${existingSettings.reason}:${existingSettings.runtime}`,
    `Fix the JSON syntax so the root value is an object, then retry. Meta_Kim did not change any selected file. Target: ${existingSettings.path}`,
    relPath,
  );
  info(`Recovery: ${result.nextAction}`);
  return result;
}

function reportTransactionResult(label, result) {
  if (result.recovery && result.recovery !== "none") {
    ok(`${label}: recovered interrupted transaction state (${result.recovery}).`);
  }
  if (result.ok && result.status === "noop") {
    ok(`${label}: already up to date; no managed files were rewritten.`);
    return;
  }
  if (result.ok) return;

  const location = result.relPath ? ` (${result.relPath})` : "";
  if (result.status === "locked") {
    warn(`${label} is waiting on another installer: ${result.reason}${location}`);
  } else if (result.status === "recovery_required") {
    warn(`${label} needs transaction recovery before it can continue: ${result.reason}${location}`);
  } else {
    warn(`${label} preserved all targets: ${result.reason}${location}`);
  }
  if (result.nextAction) info(`Recovery: ${result.nextAction}`);
}

function installSelectedRuntimeFilesTransactional(targets) {
  if (targets.includes("claude") && !requireClaudeGlobalSettingsConsent()) {
    return blockedTransaction(
      "claude_global_consent_required",
      "Pass --force or set META_KIM_CONFIRM_GLOBAL=1, then retry.",
    );
  }
  const existingSettings = readSelectedRuntimeSettingsStrict(targets);
  if (!existingSettings.ok) {
    return blockedExistingSettingsTransaction(existingSettings);
  }
  const operations = [];
  const manifestOperations = [];
  for (const runtime of targets) {
    const specs = canonicalFileSpecs(runtime);
    if (specs.length === 0) continue;
    const oldManifestPath = runtimeManifestPath(runtime);
    const oldManifestRaw = existsSync(oldManifestPath) ? readJsonFile(oldManifestPath, null) : null;
    const oldManifest = oldManifestRaw
      ? validateManagedManifest(oldManifestRaw, { schemaVersion: RUNTIME_MANIFEST_SCHEMA })
      : null;
    if (oldManifestRaw && !oldManifest) {
      warn(`Preserved runtime ${runtime}: ownership manifest is invalid or empty`);
      return blockedTransaction(
        `invalid_runtime_manifest:${runtime}`,
        "Preserve the runtime files and repair or remove only the invalid ownership manifest after inspection.",
      );
    }
    const oldMap = new Map((oldManifest?.files ?? []).map((entry) => [entry.relPath, entry.contentHash]));
    const nextFiles = [];
    const nextPaths = new Set(specs.map((spec) => spec.relPath));
    for (const entry of oldManifest?.files ?? []) {
      if (nextPaths.has(entry.relPath) || isSeedOnlyRetainedPath(runtime, entry.relPath)) {
        continue;
      }
      operations.push({
        kind: "remove",
        phase: "content",
        relPath: entry.relPath,
        expectedOldHash: entry.contentHash,
        allowManagedMissingRemove: true,
      });
    }
    for (const spec of specs) {
      const content = readFileSync(spec.source);
      const contentHash = sha256Buffer(content);
      nextFiles.push({ relPath: spec.relPath, contentHash });
      operations.push({
        kind: "write",
        phase: "content",
        relPath: spec.relPath,
        content,
        expectedOldHash: oldMap.get(spec.relPath) ?? null,
        authorizedAdoptIdentical: true,
        allowManagedMissingCreate: true,
      });
    }
    operations.push(...seedOnlyOperations(runtime));
    const manifestValue = {
      schemaVersion: RUNTIME_MANIFEST_SCHEMA,
      runtime,
      files: nextFiles,
    };
    const manifestOperation = jsonOperation(oldManifestPath, manifestValue, "manifest");
    if (manifestOperation) manifestOperations.push(manifestOperation);
  }

  if (targets.includes("claude")) {
    const operation = jsonOperation(
      CLAUDE_SETTINGS,
      buildClaudeSettingsValue(existingSettings.values.claude),
      "auxiliary",
    );
    if (operation) operations.push(operation);
  }
  if (targets.includes("codex")) {
    const operation = jsonOperation(
      join(CODEX_HOME, "hooks.json"),
      buildCodexSettingsValue(existingSettings.values.codex),
      "auxiliary",
    );
    if (operation) operations.push(operation);
  }
  if (targets.includes("cursor")) {
    const operation = jsonOperation(
      join(CURSOR_HOME, "hooks.json"),
      buildCursorSettingsValue(existingSettings.values.cursor),
      "auxiliary",
    );
    if (operation) operations.push(operation);
  }
  operations.push(...manifestOperations);

  const result = executeSafeManagedFileTransaction({
    trustedRoot: homedir(),
    backupRoot: join(homedir(), ".meta-kim", "backups"),
    operations,
    transactionLabel: "mcp-memory-install",
    lockKey: "mcp-memory-hooks",
  });
  reportTransactionResult("Runtime hook install", result);
  return result;
}

function stripClaudeSettingsValue(settings) {
  const hooks = { ...(settings.hooks ?? {}) };
  for (const [eventName, needles] of [
    ["SessionStart", ["mcp_memory_global.py"]],
    ["Stop", ["stop-save-progress.mjs", "stop-memory-save.mjs"]],
  ]) {
    hooks[eventName] = (hooks[eventName] ?? [])
      .map((block) => ({
        ...block,
        hooks: (block?.hooks ?? []).filter(
          (hook) => !needles.some((needle) => String(hook?.command ?? "").includes(needle)),
        ),
      }))
      .filter((block) => (block.hooks ?? []).length > 0);
    if (hooks[eventName].length === 0) delete hooks[eventName];
  }
  const next = { ...settings, hooks };
  if (Object.keys(hooks).length === 0) delete next.hooks;
  return next;
}

function stripCrossRuntimeSettingsValue(runtime, settings) {
  const home = runtime === "codex" ? CODEX_HOME : CURSOR_HOME;
  const eventNames = runtime === "codex"
    ? ["SessionStart", "UserPromptSubmit", "Stop"]
    : ["beforeSubmitPrompt", "stop"];
  const hooks = { ...(settings.hooks ?? {}) };
  for (const eventName of eventNames) {
    hooks[eventName] = (hooks[eventName] ?? [])
      .map((block) => {
        if (block?.command) return String(block.command).includes(CROSS_RUNTIME_HOOK_FILE) ? null : block;
        const nested = (block?.hooks ?? []).filter(
          (hook) => !String(hook?.command ?? "").includes(CROSS_RUNTIME_HOOK_FILE),
        );
        return nested.length > 0 ? { ...block, hooks: nested } : null;
      })
      .filter(Boolean);
    if (hooks[eventName].length === 0) delete hooks[eventName];
  }
  return { ...settings, hooks };
}

function removeSelectedRuntimeFilesTransactional(targets) {
  const existingSettings = readSelectedRuntimeSettingsStrict(targets);
  if (!existingSettings.ok) {
    return blockedExistingSettingsTransaction(existingSettings);
  }
  const operations = [];
  const manifestOperations = [];
  for (const runtime of targets) {
    const manifestPath = runtimeManifestPath(runtime);
    const raw = existsSync(manifestPath) ? readJsonFile(manifestPath, null) : null;
    const manifest = raw
      ? validateManagedManifest(raw, { schemaVersion: RUNTIME_MANIFEST_SCHEMA })
      : null;
    if (raw && !manifest) {
      warn(`Preserved runtime ${runtime}: ownership manifest is invalid or empty`);
      return blockedTransaction(
        `invalid_runtime_manifest:${runtime}`,
        "Preserve the runtime files and repair or remove only the invalid ownership manifest after inspection.",
      );
    }
    if (!manifest) {
      const openClawTarget = join(OPENCLAW_HOME, "hooks", "mcp-memory-service");
      const hasManagedCandidate =
        canonicalFileSpecs(runtime).some((spec) => existsSync(spec.target)) ||
        (runtime === "openclaw" && existsSync(openClawTarget));
      if (hasManagedCandidate) {
        warn(`Preserved runtime ${runtime}: managed files exist without an ownership manifest`);
        return blockedTransaction(
          `ownership_manifest_missing:${runtime}`,
          "Run the installer to restore ownership evidence, or inspect the files before removing them manually.",
        );
      }
      continue;
    }
    for (const entry of manifest.files) {
      if (isSeedOnlyRetainedPath(runtime, entry.relPath)) continue;
      operations.push({
        kind: "remove",
        phase: "content",
        relPath: entry.relPath,
        expectedOldHash: entry.contentHash,
        allowManagedMissingRemove: true,
      });
    }
    manifestOperations.push({
      kind: "remove",
      phase: "manifest",
      relPath: homeRel(manifestPath),
      expectedOldHash: sha256ManagedFile(manifestPath),
    });
  }

  if (targets.includes("claude") && existsSync(CLAUDE_SETTINGS)) {
    const next = stripClaudeSettingsValue(existingSettings.values.claude);
    const op = next ? jsonOperation(CLAUDE_SETTINGS, next, "auxiliary") : null;
    if (op) operations.push(op);
  }
  for (const runtime of ["codex", "cursor"]) {
    const path = join(runtime === "codex" ? CODEX_HOME : CURSOR_HOME, "hooks.json");
    if (!targets.includes(runtime) || !existsSync(path)) continue;
    const next = stripCrossRuntimeSettingsValue(runtime, existingSettings.values[runtime]);
    const op = next ? jsonOperation(path, next, "auxiliary") : null;
    if (op) operations.push(op);
  }
  operations.push(...manifestOperations);
  const result = executeSafeManagedFileTransaction({
    trustedRoot: homedir(),
    backupRoot: join(homedir(), ".meta-kim", "backups"),
    operations,
    transactionLabel: "mcp-memory-remove",
    lockKey: "mcp-memory-hooks",
  });
  reportTransactionResult("Runtime hook removal", result);
  return result;
}

// ── Commands ────────────────────────────────────────────

async function install(targets) {
  console.log(`\n${bold("Installing MCP Memory runtime hooks...")}\n`);
  info(`Targets: ${targetListText(targets)}`);

  const transaction = installSelectedRuntimeFilesTransactional(targets);
  if (!targets.includes("claude")) ok("Claude MCP memory hooks skipped (claude not selected)");

  console.log("");
  info("Checking MCP Memory Service health...");
  const endpoint = configuredMemoryEndpoint();
  const health = checkServerHealthStatus(endpoint);
  if (health === "healthy") {
    ok(`MCP Memory Service is running on ${endpoint}`);
  } else if (health === "unknown") {
    warn(
      `Could not verify ${endpoint} from this shell, but memory.exe is running`,
    );
  } else {
    warn(`MCP Memory Service is NOT responding on ${endpoint}`);
    printMemoryPortDiagnostic(endpoint);
    info(
      "Start the HTTP service with: MCP_ALLOW_ANONYMOUS_ACCESS=true memory server --http",
    );
  }

  if (!transaction.ok) {
    warn(
      "Runtime hook installation did not complete; selected runtime files were preserved.",
    );
    console.log(
      `\n${yellow("Done with warnings.")} Follow the recovery guidance, retry, and restart runtimes only after installation succeeds.\n`,
    );
    process.exit(1);
  }

  console.log(
    `\n${green("Done!")} Restart selected runtimes for hooks to take effect.\n`,
  );
}

function addCheckIssue(issues, message) {
  issues.push(message);
  warn(message);
}

function verifyRuntimeManagedState(runtime, issues) {
  const manifestPath = runtimeManifestPath(runtime);
  if (!existsSync(manifestPath)) {
    addCheckIssue(issues, `${runtime}: ownership manifest is missing`);
    return null;
  }
  const manifest = readRuntimeManagedManifest(runtime);
  if (!manifest) {
    addCheckIssue(issues, `${runtime}: ownership manifest is invalid or empty`);
    return null;
  }

  const expectedSpecs = canonicalFileSpecs(runtime);
  const expected = new Map(expectedSpecs.map((spec) => [spec.relPath, spec]));
  const owned = new Map(manifest.files.map((entry) => [entry.relPath, entry]));
  for (const spec of expectedSpecs) {
    const entry = owned.get(spec.relPath);
    if (!entry) {
      addCheckIssue(issues, `${runtime}: managed file is missing from the manifest (${spec.relPath})`);
      continue;
    }
    const canonicalHash = sha256ManagedFile(spec.source);
    if (entry.contentHash !== canonicalHash) {
      addCheckIssue(issues, `${runtime}: manifest hash differs from the current canonical file (${spec.relPath})`);
      continue;
    }
    const installedHash = sha256ManagedFile(join(homedir(), spec.relPath));
    if (installedHash !== entry.contentHash) {
      addCheckIssue(issues, `${runtime}: installed managed file is missing or changed (${spec.relPath})`);
    }
  }
  for (const entry of manifest.files) {
    if (!expected.has(entry.relPath)) {
      const qualifier = isSeedOnlyRetainedPath(runtime, entry.relPath)
        ? "seed-only config is still incorrectly owned"
        : "stale managed entry remains";
      addCheckIssue(issues, `${runtime}: ${qualifier} (${entry.relPath})`);
    }
  }
  return manifest;
}

function check(targets) {
  console.log(`\n${bold("Checking MCP Memory hook installation...")}\n`);
  info(`Targets: ${targetListText(targets)}`);
  const issues = [];

  const sourceExists = existsSync(CANONICAL_HOOK_SOURCE);
  if (targets.includes("claude")) {
    sourceExists
      ? ok(`Canonical source present: ${CANONICAL_HOOK_SOURCE}`)
      : addCheckIssue(issues, `Canonical source MISSING: ${CANONICAL_HOOK_SOURCE}`);

    const targetExists = existsSync(HOOK_TARGET);
    targetExists
      ? ok(`Hook installed: ${HOOK_TARGET}`)
      : addCheckIssue(issues, `Hook not installed at ${HOOK_TARGET}`);

    if (sourceExists && targetExists) {
      const inSync = filesEqual(CANONICAL_HOOK_SOURCE, HOOK_TARGET);
      inSync
        ? ok("Hook content in sync with canonical")
        : addCheckIssue(issues, "Hook content DIFFERS from canonical (run install to update)");
    }

    const configExists = existsSync(CONFIG_TARGET);
    configExists
      ? ok(`Config present: ${CONFIG_TARGET}`)
      : addCheckIssue(issues, `Config missing: ${CONFIG_TARGET}`);

    const settingsExists = existsSync(CLAUDE_SETTINGS);
    if (settingsExists) {
      try {
        const settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf8"));
        const sessionRegistered = (settings.hooks?.SessionStart ?? []).some((b) =>
          b?.hooks?.some((h) => h?.command?.includes("mcp_memory_global.py")),
        );
        sessionRegistered
          ? ok("SessionStart hook registered in settings.json")
          : addCheckIssue(issues, "SessionStart hook NOT registered");
        for (const hookName of ["stop-save-progress.mjs", "stop-memory-save.mjs"]) {
          const registered = (settings.hooks?.Stop ?? []).some((block) =>
            block?.hooks?.some((hook) => String(hook?.command ?? "").includes(hookName)),
          );
          registered
            ? ok(`Stop hook registered: ${hookName}`)
            : addCheckIssue(issues, `Stop hook NOT registered: ${hookName}`);
        }
      } catch {
        addCheckIssue(issues, "Could not parse settings.json");
      }
    } else {
      addCheckIssue(issues, `settings.json not found: ${CLAUDE_SETTINGS}`);
    }
    verifyRuntimeManagedState("claude", issues);
  } else {
    ok("Claude MCP memory checks skipped (claude not selected)");
  }

  for (const [label, runtimeHome, hooksFile, eventNames] of [
    [
      "Codex",
      CODEX_HOME,
      "hooks.json",
      ["SessionStart", "UserPromptSubmit", "Stop"],
    ],
    ["Cursor", CURSOR_HOME, "hooks.json", ["beforeSubmitPrompt", "stop"]],
  ]) {
    const targetId = label.toLowerCase();
    if (!targets.includes(targetId)) continue;
    const hookFile = findInstalledCrossRuntimeMemoryHook(runtimeHome);
    hookFile
      ? ok(`${label} memory hook installed: ${hookFile}`)
      : addCheckIssue(
          issues,
          `${label} memory hook missing: ${crossRuntimeMemoryHookCandidates(runtimeHome).join(" or ")}`,
        );
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
        : addCheckIssue(issues, `${label} ${eventName} memory hook NOT registered`);
    }
    verifyRuntimeManagedState(targetId, issues);
  }

  const openclawHookDir = join(OPENCLAW_HOME, "hooks", "mcp-memory-service");
  if (targets.includes("openclaw")) {
    const before = issues.length;
    const manifest = verifyRuntimeManagedState("openclaw", issues);
    if (manifest && issues.length === before) {
      ok(`OpenClaw MCP memory hook manifest and hashes verified: ${openclawHookDir}`);
    }
  }

  const endpoint = configuredMemoryEndpoint();
  const health = checkServerHealthStatus(endpoint);
  if (health === "healthy") {
    ok(`MCP Memory Service responding on ${endpoint}`);
  } else if (health === "unknown") {
    warn(
      `MCP Memory Service health could not be verified at ${endpoint}, but memory.exe is running`,
    );
  } else {
    warn(`MCP Memory Service NOT responding on ${endpoint}`);
    printMemoryPortDiagnostic(endpoint);
  }

  if (issues.length > 0) {
    warn(`${issues.length} hook installation issue(s) found.`);
    info(
      `Repair: node scripts/install-mcp-memory-hooks.mjs --targets ${targets.join(",")}` +
      (targets.includes("claude") ? " --force" : ""),
    );
    info("Then rerun this --check command. User files and drifted managed files will be preserved.");
  } else {
    ok("All selected runtime hook files, manifests, and registrations match.");
  }
  console.log("");
  return { ok: issues.length === 0, issueCount: issues.length, issues };
}

function remove(targets) {
  console.log(
    `\n${bold("Removing MCP Memory hook registration...")}\n`,
  );
  info(`Targets: ${targetListText(targets)}`);

  const transaction = removeSelectedRuntimeFilesTransactional(targets);
  info("Only exact manifest-managed files were removed; unknown or drifted files were preserved.");
  if (transaction.ok) ok("Done.\n");
  else warn("Removal was partial; preserved files require ownership or backup repair.\n");
  return transaction;
}

// ── Main ────────────────────────────────────────────────

const args = process.argv.slice(2);
const targets = parseTargets(args);

// Handle --force flag (must be checked before other flags)
if (args.includes("--force")) {
  FORCE_UPDATE = true;
  // Remove --force from args so it doesn't interfere with other checks
  const forceIndex = args.indexOf("--force");
  args.splice(forceIndex, 1);
}

async function main() {
  if (args.includes("--check")) {
    if (!check(targets).ok) process.exitCode = 1;
  }
  else if (args.includes("--remove")) {
    if (!remove(targets).ok) process.exitCode = 1;
  }
  else await install(targets);
}

main().catch((err) => {
  console.error(`Installation failed: ${err.message}`);
  process.exit(1);
});
