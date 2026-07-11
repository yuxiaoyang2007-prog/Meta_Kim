#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  lintBlindPrompt,
  observeClaudeJsonl,
  observeCodexJsonl,
  observeMcpClientJsonl,
} from "./observe-host-events.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const sha256 = (value) => createHash("sha256").update(String(value), "utf8").digest("hex");
const EXPECTED_AGENT_TEAMS_PLAYBOOK_REF = "v4.8.0";
const EXPECTED_AGENT_TEAMS_PLAYBOOK_COMMIT = "753ff43bd9b1f9aee4d184c4f21e7f494af5a79f";
const EXPECTED_AGENT_TEAMS_PLAYBOOK_SKILL_SHA256 =
  "0c61f80b3e0616e3b6c6611e03c230e8eb26fbda65d4a7cc9477a9370e7d5fb4";
const FAST_PATH_CONTROL_PROMPT =
  "请对这个刚安装的项目做一次只读的发布前维护审计。核对依赖来源、跨运行环境兼容性和发布安全。最多查看 8 个最相关文件，最后用 10 行以内列出风险和证据。不得修改源码、安装依赖、提交、推送或访问工作区外文件。";
const GOVERNED_EXECUTION_PROMPT =
  "请为这个刚安装的项目制定并落地一份发布就绪改进方案。基于现有文件核对依赖来源、跨运行环境兼容性和发布安全，创建 release-readiness-plan.md，写清优先级、每项修改建议、验收方法和不做事项。最多查看 12 个最相关文件；只允许新增这一个报告文件，不得修改源码、安装依赖、提交、推送或访问工作区外文件。";

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    input: options.input,
    encoding: "utf8",
    windowsHide: true,
    timeout: options.timeoutMs ?? 600_000,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function resolveWindowsCmdShim(cmdPath) {
  const source = readFileSync(cmdPath, "utf8");
  const targetPattern = /"%(?:dp0%|~dp0)[\\/]([^"\r\n]+?\.(?:exe|com|cjs|mjs|js))"\s+%\*/gi;
  let match;
  let target = null;
  while ((match = targetPattern.exec(source)) !== null) {
    target = path.resolve(path.dirname(cmdPath), match[1]);
  }
  if (!target && /^npm(?:\.cmd)?$/i.test(path.basename(cmdPath))) {
    target = path.join(
      path.dirname(cmdPath),
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    );
  }
  if (!target || !existsSync(target)) return null;
  if (/\.(?:exe|com)$/i.test(target)) {
    return { command: target, argsPrefix: [] };
  }
  return { command: process.execPath, argsPrefix: [target] };
}

function resolveWindowsCliInvocation(
  command,
  args = [],
  { env = process.env, pathValue = null } = {},
) {
  const commandText = String(command);
  const hasPath =
    path.win32.isAbsolute(commandText) || /[\\/]/.test(commandText);
  const searchDirs = hasPath
    ? [""]
    : String(pathValue ?? env.PATH ?? env.Path ?? "")
        .split(";")
        .map((entry) => entry.replace(/^"|"$/g, "").trim())
        .filter(Boolean);
  const extensions = path.win32.extname(commandText)
    ? [""]
    : [".exe", ".com", ".cmd", ".bat"];
  const candidates = [];
  for (const directory of searchDirs) {
    for (const extension of extensions) {
      const candidate = hasPath
        ? `${commandText}${extension}`
        : path.join(directory, `${commandText}${extension}`);
      if (existsSync(candidate)) candidates.push(candidate);
    }
  }

  for (const candidate of candidates) {
    if (/\.(?:exe|com)$/i.test(candidate)) {
      return { command: candidate, args: [...args], source: "native_executable" };
    }
  }
  for (const candidate of candidates) {
    if (!/\.(?:cmd|bat)$/i.test(candidate)) continue;
    const shim = resolveWindowsCmdShim(candidate);
    if (shim) {
      return {
        command: shim.command,
        args: [...shim.argsPrefix, ...args],
        source: "node_or_native_shim_without_cmd",
      };
    }
  }
  throw new Error(
    `No shell-free Windows executable or supported Node shim found for ${commandText}`,
  );
}

function runCli(command, args, options = {}) {
  if (process.platform !== "win32") return run(command, args, options);
  const invocation = resolveWindowsCliInvocation(command, args, {
    env: options.env ?? process.env,
  });
  return run(invocation.command, invocation.args, options);
}

function baseIsolatedEnv(home, runtimeHome, tempDir) {
  const allowed = [
    "PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec",
    "LANG", "LC_ALL", "TERM", "NODE_EXTRA_CA_CERTS",
    "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
  ];
  const env = Object.fromEntries(
    allowed.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]),
  );
  return {
    ...env,
    HOME: home,
    USERPROFILE: home,
    CODEX_HOME: runtimeHome,
    CLAUDE_CONFIG_DIR: runtimeHome,
    CLAUDE_HOME: runtimeHome,
    TMP: tempDir,
    TEMP: tempDir,
    CODEX_SKILLS_DIR: path.join(runtimeHome, "skills"),
    CLAUDE_SKILLS_DIR: path.join(runtimeHome, "skills"),
    META_KIM_DEP_ROOTS: "",
    META_KIM_HOST_INVOCATION_EVIDENCE: "",
    META_KIM_HOST_INVOCATION_EVIDENCE_TRUSTED: "",
    META_KIM_NATIVE_CHOICE_EVIDENCE: "",
    META_KIM_NATIVE_CHOICE_EVIDENCE_TRUSTED: "",
  };
}

async function copyCodexAuthOnly(runtimeHome) {
  const sourceHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
  const source = path.join(sourceHome, "auth.json");
  if (!existsSync(source)) return { copied: false, reason: "auth_json_missing" };
  const content = await fs.readFile(source, "utf8");
  await fs.mkdir(runtimeHome, { recursive: true });
  await fs.writeFile(path.join(runtimeHome, "auth.json"), content, { encoding: "utf8", mode: 0o600 });
  return { copied: true, sourceKind: "codex_auth_json_only", credentialMaterialRecorded: false };
}

async function copiedCredentialAbsent(filePath) {
  try {
    await fs.access(filePath);
    return false;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}

async function scrubAndRemoveCopiedCredential(filePath, { retries = 8 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    if (await copiedCredentialAbsent(filePath)) return;
    try {
      const stat = await fs.lstat(filePath);
      if (stat.isFile()) {
        const handle = await fs.open(filePath, "r+");
        try {
          const zeros = Buffer.alloc(Math.min(64 * 1024, Math.max(1, stat.size)));
          for (let offset = 0; offset < stat.size; offset += zeros.length) {
            const length = Math.min(zeros.length, stat.size - offset);
            await handle.write(zeros, 0, length, offset);
          }
          await handle.sync();
          await handle.truncate(0);
          await handle.sync();
        } finally {
          await handle.close();
        }
      }
      await fs.rm(filePath, { force: true });
      if (await copiedCredentialAbsent(filePath)) return;
      lastError = new Error("copied credential still exists after removal");
    } catch (error) {
      lastError = error;
      await fs.chmod(filePath, 0o600).catch(() => {});
    }
    await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
  }
  throw new Error(
    `Unable to scrub and remove copied Codex credential: ${lastError?.message ?? "unknown error"}`,
    { cause: lastError },
  );
}

async function cleanupCleanRoomTemp(
  tempRoot,
  { preserveTemp = false, removeTree = fs.rm } = {},
) {
  const codexHome = path.join(tempRoot, "user-home", "codex-home");
  const copiedAuthPath = path.join(codexHome, "auth.json");
  try {
    await scrubAndRemoveCopiedCredential(copiedAuthPath);
  } catch (credentialError) {
    // Diagnostic preservation never takes precedence over credential removal.
    await fs.rm(codexHome, {
      recursive: true,
      force: true,
      maxRetries: 8,
      retryDelay: 250,
    }).catch(() => {});
    if (!(await copiedCredentialAbsent(copiedAuthPath))) {
      throw credentialError;
    }
  }
  if (preserveTemp) return;
  try {
    await removeTree(tempRoot, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 500,
    });
  } catch (error) {
    if (!["EBUSY", "EPERM"].includes(error?.code)) throw error;
    process.stderr.write(
      `clean-room temp cleanup deferred because a runtime still holds a file: ${tempRoot}\n`,
    );
  }
}

function inheritClaudeAuth(env) {
  const names = [
    "ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL",
    "CLAUDE_CODE_OAUTH_TOKEN", "AWS_PROFILE", "AWS_REGION",
    "ANTHROPIC_VERTEX_PROJECT_ID", "CLOUD_ML_REGION",
  ];
  const inherited = [];
  for (const name of names) {
    if (!process.env[name]) continue;
    env[name] = process.env[name];
    inherited.push(name);
  }
  return inherited;
}

async function packAndExtract(tempRoot) {
  const packDir = path.join(tempRoot, "pack");
  const extractDir = path.join(tempRoot, "user-home", "workspace");
  await fs.mkdir(packDir, { recursive: true });
  await fs.mkdir(extractDir, { recursive: true });
  const packed = runCli("npm", ["pack", "--json", "--pack-destination", packDir], {
    cwd: repoRoot,
    timeoutMs: 180_000,
  });
  if (packed.status !== 0) throw new Error(packed.stderr || packed.stdout || "npm pack failed");
  const packResult = JSON.parse(packed.stdout);
  const tarball = path.join(packDir, packResult[0].filename);
  const tarballBytes = await fs.readFile(tarball);
  const extracted = run("tar", ["-xf", tarball, "-C", extractDir], { timeoutMs: 120_000 });
  if (extracted.status !== 0) throw new Error(extracted.stderr || extracted.stdout || "tar extract failed");
  return {
    workspace: path.join(extractDir, "package"),
    tarball,
    tarballSha256: createHash("sha256").update(tarballBytes).digest("hex"),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const value = (name, fallback = null) => {
    const index = args.indexOf(name);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
  };
  const preflightOnly = args.includes("--preflight");
  const installOnly = args.includes("--install-only");
  const scenario = value("--scenario", "governed_execution");
  if (!["governed_execution", "fast_path_control"].includes(scenario)) {
    throw new Error("--scenario must be governed_execution or fast_path_control");
  }
  const runtime = value("--runtime", preflightOnly ? "preflight" : null);
  if (!runtime || !["preflight", "codex", "claude"].includes(runtime)) {
    throw new Error("Use --preflight or --runtime codex|claude");
  }
  const promptPath = value("--prompt-file");
  const timeoutMs = Number(value("--timeout-ms", "300000"));
  if (!Number.isFinite(timeoutMs) || timeoutMs < 10_000) {
    throw new Error("--timeout-ms must be a finite number >= 10000");
  }
  const prompt = promptPath
    ? await fs.readFile(path.resolve(promptPath), "utf8")
    : scenario === "fast_path_control"
      ? FAST_PATH_CONTROL_PROMPT
      : GOVERNED_EXECUTION_PROMPT;
  const promptLint = lintBlindPrompt(prompt);
  if (!promptLint.pass) throw new Error(`Blind prompt leaks capability names: ${promptLint.hits.join(", ")}`);

  const runId = `clean-room-${runtime}-${randomUUID()}`;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "meta-kim-clean-room-"));
  const artifactsDir = path.resolve(
    value("--artifact-dir", path.join(repoRoot, ".meta-kim", "state", "default", "clean-room-live")),
  );
  await fs.mkdir(artifactsDir, { recursive: true });
  let keepTemp = args.includes("--keep-temp");
  try {
    const packageInfo = await packAndExtract(tempRoot);
    const userHome = path.join(tempRoot, "user-home");
    const runtimeHome = path.join(userHome, `${runtime}-home`);
    const isolatedTemp = path.join(tempRoot, "tmp");
    await fs.mkdir(userHome, { recursive: true });
    await fs.mkdir(runtimeHome, { recursive: true });
    await fs.mkdir(isolatedTemp, { recursive: true });
    const parentEntries = await fs.readdir(path.dirname(packageInfo.workspace));
    const osSharedAgentsSkillRoot = path.join(os.homedir(), ".agents", "skills");
    const codexSharedSkillRootContaminates =
      runtime === "codex" &&
      existsSync(osSharedAgentsSkillRoot) &&
      !path.resolve(osSharedAgentsSkillRoot).startsWith(path.resolve(userHome));
    const isolation = {
      tempRoot,
      home: userHome,
      runtimeHome,
      tempDir: isolatedTemp,
      packageWorkspace: packageInfo.workspace,
      packageSha256: packageInfo.tarballSha256,
      siblingAgentTeamsPlaybookAbsent: !parentEntries.some((name) => /agent-teams-playbook/i.test(name)),
      globalInventoryInjectionConfigured: false,
      osSharedAgentsSkillRoot,
      codexSharedSkillRootContaminates,
      promptSha256: sha256(prompt),
      promptLint,
      scenario,
    };
    if (preflightOnly) {
      const report = { schemaVersion: "clean-room-live-acceptance-v0.1", runId, status: "preflight_pass", isolation };
      await fs.writeFile(path.join(artifactsDir, `${runId}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return;
    }

    const env = baseIsolatedEnv(userHome, runtimeHome, isolatedTemp);
    const runtimeTarget = runtime === "claude" ? "claude" : "codex";
    const install = runCli("npm", [
      "install", "--ignore-scripts", "--no-audit", "--no-fund",
    ], { cwd: packageInfo.workspace, env, timeoutMs });
    const dependencyInstall = install.status === 0
      ? run(process.execPath, [
          path.join(packageInfo.workspace, "scripts", "install-global-skills-all-runtimes.mjs"),
          "--targets", runtimeTarget,
          "--skills", "agent-teams-playbook",
          "--skip-inventory-refresh",
        ], { cwd: packageInfo.workspace, env, timeoutMs })
      : { status: null, stdout: "", stderr: "npm_install_failed_before_dependency_install" };
    const dependencySkillPath = path.join(
      runtimeHome,
      "skills",
      "agent-teams-playbook",
      "SKILL.md",
    );
    const dependencyDir = path.dirname(dependencySkillPath);
    const dependencySkillSha256 = existsSync(dependencySkillPath)
      ? createHash("sha256").update(await fs.readFile(dependencySkillPath)).digest("hex")
      : null;
    let dependencyArchiveMetadata = null;
    const dependencyArchiveMetadataPath = path.join(dependencyDir, ".meta-kim-source.json");
    if (existsSync(dependencyArchiveMetadataPath)) {
      try {
        dependencyArchiveMetadata = JSON.parse(
          await fs.readFile(dependencyArchiveMetadataPath, "utf8"),
        );
      } catch {
        dependencyArchiveMetadata = null;
      }
    }
    const archiveCommitPrefix = EXPECTED_AGENT_TEAMS_PLAYBOOK_COMMIT.slice(0, 7);
    const archiveRevisionVerified =
      dependencyArchiveMetadata?.source === "github_archive_fallback" &&
      String(dependencyArchiveMetadata?.rootName ?? "").toLowerCase().endsWith(`-${archiveCommitPrefix}`) &&
      dependencySkillSha256 === EXPECTED_AGENT_TEAMS_PLAYBOOK_SKILL_SHA256;
    let dependencyCommitResult = existsSync(dependencySkillPath)
      ? run("git", ["-C", dependencyDir, "rev-parse", "HEAD"], { env, timeoutMs: 30_000 })
      : { status: null, stdout: "" };
    let dependencyCommit = dependencyCommitResult.status === 0
      ? String(dependencyCommitResult.stdout).trim()
      : null;
    let dependencyPin = {
      expectedRef: EXPECTED_AGENT_TEAMS_PLAYBOOK_REF,
      expectedCommit: EXPECTED_AGENT_TEAMS_PLAYBOOK_COMMIT,
      action: dependencyCommit === EXPECTED_AGENT_TEAMS_PLAYBOOK_COMMIT
        ? "already_expected_commit"
        : archiveRevisionVerified
          ? "verified_archive_commit_prefix_and_skill_hash"
          : "not_attempted",
      exitCode:
        dependencyCommit === EXPECTED_AGENT_TEAMS_PLAYBOOK_COMMIT || archiveRevisionVerified
          ? 0
          : null,
    };
    if (
      dependencyInstall.status === 0 &&
      existsSync(dependencySkillPath) &&
      dependencyCommit !== EXPECTED_AGENT_TEAMS_PLAYBOOK_COMMIT &&
      !archiveRevisionVerified
    ) {
      const fetchTag = run("git", [
        "-C", dependencyDir, "fetch", "--depth", "1", "origin",
        `refs/tags/${EXPECTED_AGENT_TEAMS_PLAYBOOK_REF}:refs/tags/${EXPECTED_AGENT_TEAMS_PLAYBOOK_REF}`,
      ], { env, timeoutMs: 120_000 });
      const checkout = fetchTag.status === 0
        ? run("git", ["-C", dependencyDir, "checkout", "--detach", EXPECTED_AGENT_TEAMS_PLAYBOOK_COMMIT], {
            env,
            timeoutMs: 30_000,
          })
        : { status: null };
      dependencyPin = {
        expectedRef: EXPECTED_AGENT_TEAMS_PLAYBOOK_REF,
        expectedCommit: EXPECTED_AGENT_TEAMS_PLAYBOOK_COMMIT,
        action: "fetch_tag_and_detach",
        fetchExitCode: fetchTag.status,
        exitCode: checkout.status,
      };
      dependencyCommitResult = run("git", ["-C", dependencyDir, "rev-parse", "HEAD"], {
        env,
        timeoutMs: 30_000,
      });
      dependencyCommit = dependencyCommitResult.status === 0
        ? String(dependencyCommitResult.stdout).trim()
        : null;
    }
    const dependencyRevisionVerified =
      dependencyCommit === EXPECTED_AGENT_TEAMS_PLAYBOOK_COMMIT || archiveRevisionVerified;
    const dependencyReady =
      dependencyInstall.status === 0 &&
      existsSync(dependencySkillPath) &&
      dependencyPin.exitCode === 0 &&
      dependencyRevisionVerified &&
      dependencySkillSha256 === EXPECTED_AGENT_TEAMS_PLAYBOOK_SKILL_SHA256;
    const projectionSync = dependencyReady
      ? run(process.execPath, [
          path.join(packageInfo.workspace, "scripts", "sync-runtimes.mjs"),
          "--scope", "project",
          "--targets", runtimeTarget,
        ], { cwd: packageInfo.workspace, env, timeoutMs })
      : { status: null, stdout: "", stderr: "dependency_install_failed_before_projection_sync" };
    const bootstrap = projectionSync.status === 0
      ? run(process.execPath, [
          path.join(packageInfo.workspace, "setup.mjs"),
          "--project-bootstrap",
          "--project-dir", packageInfo.workspace,
          "--targets", runtimeTarget,
          "--apply",
          "--json",
        ], { cwd: packageInfo.workspace, env, timeoutMs })
      : { status: null, stdout: "", stderr: "projection_sync_failed_before_bootstrap" };
    const mcpTransportProbe = bootstrap.status === 0
      ? run(process.execPath, [
          path.join(packageInfo.workspace, "scripts", "live-acceptance", "probe-mcp-transport.mjs"),
          "--repo-root", packageInfo.workspace,
        ], { cwd: packageInfo.workspace, env, timeoutMs: 60_000 })
      : { status: null, stdout: "", stderr: "bootstrap_failed_before_mcp_transport_probe" };
    const mcpTransportEvents = mcpTransportProbe.status === 0
      ? observeMcpClientJsonl(mcpTransportProbe.stdout)
      : [];
    const installation = {
      installExitCode: install.status,
      dependencyInstallExitCode: dependencyInstall.status,
      dependencyReady,
      dependencyCommit,
      dependencyPin,
      dependencyRevisionVerified,
      dependencyArchiveMetadata,
      dependencySkillSha256,
      projectionSyncExitCode: projectionSync.status,
      bootstrapExitCode: bootstrap.status,
      mcpTransportProbeExitCode: mcpTransportProbe.status,
      mcpTransportConformanceObserved: mcpTransportEvents.length === 1,
      mcpTransportConformanceBoundary:
        "This proves the packed installation can complete MCP initialize, tools/list, and tools/call. It does not prove the blind host route selected MCP.",
      installOutputSha256: sha256(install.stdout ?? ""),
      dependencyInstallOutputSha256: sha256(dependencyInstall.stdout ?? ""),
      projectionSyncOutputSha256: sha256(projectionSync.stdout ?? ""),
      bootstrapOutputSha256: sha256(bootstrap.stdout ?? ""),
      mcpTransportProbeOutputSha256: sha256(mcpTransportProbe.stdout ?? ""),
      stderrTail: `${install.stderr ?? ""}\n${dependencyInstall.stderr ?? ""}\n${projectionSync.stderr ?? ""}\n${bootstrap.stderr ?? ""}`.slice(-2000),
      projectedAgentsPresent:
        existsSync(path.join(packageInfo.workspace, runtime === "claude" ? ".claude" : ".codex", "agents")),
      projectedSkillPresent: existsSync(
        path.join(packageInfo.workspace, runtime === "claude" ? ".claude" : ".agents", "skills", "meta-theory", "SKILL.md"),
      ),
      dependencySkillPresent: existsSync(dependencySkillPath),
    };
    if (
      install.status !== 0 ||
      !dependencyReady ||
      projectionSync.status !== 0 ||
      bootstrap.status !== 0 ||
      mcpTransportProbe.status !== 0 ||
      mcpTransportEvents.length !== 1
    ) {
      const report = {
        schemaVersion: "clean-room-live-acceptance-v0.1",
        runId,
        target: runtime === "codex" ? "codex_cli" : "claude_code",
        status: "blocked",
        blocker: "clean_install_or_project_bootstrap_failed",
        isolation,
        installation,
      };
      await fs.writeFile(path.join(artifactsDir, `${runId}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }
    if (installOnly) {
      const report = {
        schemaVersion: "clean-room-live-acceptance-v0.1",
        runId,
        target: runtime === "codex" ? "codex_cli" : "claude_code",
        status: "install_pass",
        isolation,
        installation,
      };
      await fs.writeFile(path.join(artifactsDir, `${runId}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      return;
    }
    if (codexSharedSkillRootContaminates) {
      const report = {
        schemaVersion: "clean-room-live-acceptance-v0.1",
        runId,
        target: "codex_cli",
        scenario,
        status: "blocked",
        promotionEligible: false,
        exactBindingCoverage: false,
        blocker: "codex_cli_global_agents_skills_cannot_be_isolated_in_current_host",
        isolation,
        installation,
        targetBoundary:
          "Codex CLI scans the OS-user ~/.agents/skills root even with isolated HOME, USERPROFILE, CODEX_HOME, --ignore-user-config, and explicit runtime skill roots. Use an OS-level disposable user/container or a host-supported global-skill disable switch before claiming clean-room CLI evidence. This does not describe Codex Desktop.",
      };
      await fs.writeFile(path.join(artifactsDir, `${runId}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }
    let authBoundary;
    let result;
    if (runtime === "codex") {
      authBoundary = await copyCodexAuthOnly(runtimeHome);
      result = runCli("codex", [
        "exec", "--json", "--ephemeral", "--ignore-user-config",
        "--skip-git-repo-check", "--dangerously-bypass-hook-trust",
        "-s", "workspace-write", "-C", packageInfo.workspace, "-",
      ], { cwd: packageInfo.workspace, env, input: prompt, timeoutMs });
    } else {
      authBoundary = { inheritedEnvironmentVariables: inheritClaudeAuth(env) };
      const settingsPath = path.join(tempRoot, "claude-settings.json");
      const projectedMcpPath = path.join(packageInfo.workspace, ".mcp.json");
      const mcpPath = existsSync(projectedMcpPath)
        ? projectedMcpPath
        : path.join(tempRoot, "claude-mcp.json");
      await fs.writeFile(settingsPath, "{}\n", "utf8");
      if (!existsSync(mcpPath)) await fs.writeFile(mcpPath, "{\"mcpServers\":{}}\n", "utf8");
      result = runCli("claude", [
        "-p", "--output-format", "stream-json", "--verbose", "--include-hook-events",
        "--strict-mcp-config", "--mcp-config", mcpPath, "--settings", settingsPath,
        "--permission-mode", "dontAsk", "--no-session-persistence",
      ], { cwd: packageInfo.workspace, env, input: prompt, timeoutMs });
    }
    const rawPath = path.join(artifactsDir, `${runId}.raw.jsonl`);
    await fs.writeFile(rawPath, result.stdout ?? "", "utf8");
    const events = runtime === "codex"
      ? observeCodexJsonl(result.stdout)
      : observeClaudeJsonl(result.stdout);
    const naturallyObservedFamilies = [...new Set(events.map((event) => event.family))].sort();
    // This harness observes host behavior; it deliberately cannot promote its
    // own output to route completion. Exact selected-binding coverage must be
    // joined by an external release verifier after the host exits.
    const exactBindingCoverage = false;
    const report = {
      schemaVersion: "clean-room-live-acceptance-v0.1",
      runId,
      target: runtime === "codex" ? "codex_cli" : "claude_code",
      acceptanceMode: "blind_route",
      scenario,
      status: result.status === 0 && events.length > 0 ? "orchestration_observed" : "blocked",
      promotionEligible: false,
      exactBindingCoverage,
      process: {
        exitCode: result.status,
        signal: result.signal ?? null,
        stderrTail: String(result.stderr ?? "").slice(-2000),
      },
      isolation,
      installation,
      authBoundary,
      observation: {
        rawArtifact: rawPath,
        rawSha256: sha256(result.stdout ?? ""),
        eventCount: events.length,
        naturallyObservedFamilies,
        notObservedFamilies: [
          "agent_subagent", "skill", "mcp", "hook", "command_script", "runtime_tool",
        ].filter((family) => !naturallyObservedFamilies.includes(family)),
        exactBindingCoverage,
        events,
        boundary:
          "Observed events describe what the isolated host actually did. Only events joined to route-selected bindings may be promoted to live invocation evidence.",
      },
      targetBoundary:
        runtime === "codex"
          ? "codex_cli evidence does not prove codex_desktop behavior"
          : "claude_code stream evidence applies only to this isolated CLI run",
    };
    await fs.writeFile(path.join(artifactsDir, `${runId}.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = 1;
  } finally {
    await cleanupCleanRoomTemp(tempRoot, { preserveTemp: keepTemp });
  }
}

export {
  cleanupCleanRoomTemp,
  resolveWindowsCliInvocation,
  runCli,
  scrubAndRemoveCopiedCredential,
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exit(1);
  });
}
