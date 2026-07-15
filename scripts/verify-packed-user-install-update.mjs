#!/usr/bin/env node
/**
 * Release acceptance for the public package CLI.
 *
 * This deliberately runs the packed candidate instead of repository scripts:
 *   pack -> extract -> isolated npm materialization -> bin/meta-kim.mjs install
 *   -> update -> second update.
 *
 * It proves the default global-only user path without writing to the caller's
 * HOME, runtime homes, temp directory, or ordinary working directory.
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const PACKED_USER_TARGETS = Object.freeze([
  "claude",
  "codex",
  "openclaw",
  "cursor",
]);
export const HISTORICAL_UPDATE_REF = "v2.8.85";
export const PACKED_USER_ACCEPTANCE_EXPECTED_DURATION_MS = 900_000;
const ACCEPTANCE_SKILL_FILTER = "planning-with-files";
const DEFAULT_TIMEOUT_MS = 300_000;
const PROJECT_PROJECTION_NAMES = Object.freeze([
  ".claude",
  ".codex",
  ".agents",
  ".cursor",
  "openclaw",
  ".mcp.json",
  "AGENTS.md",
  "CLAUDE.md",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    windowsHide: true,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function resolveWindowsCmdShim(cmdPath) {
  const source = readFileSync(cmdPath, "utf8");
  const targetPattern = /"%(?:dp0%|~dp0)[\\/]([^"\r\n]+?\.(?:exe|com|cjs|mjs|js))"\s+%\*/giu;
  let match;
  let target = null;
  while ((match = targetPattern.exec(source)) !== null) {
    target = path.resolve(path.dirname(cmdPath), match[1]);
  }
  if (!target && /^npm(?:\.cmd)?$/iu.test(path.basename(cmdPath))) {
    target = path.join(path.dirname(cmdPath), "node_modules", "npm", "bin", "npm-cli.js");
  }
  if (!target || !existsSync(target)) return null;
  return /\.(?:exe|com)$/iu.test(target)
    ? { command: target, argsPrefix: [] }
    : { command: process.execPath, argsPrefix: [target] };
}

function resolveWindowsCli(command, args, env) {
  const text = String(command);
  const hasPath = path.win32.isAbsolute(text) || /[\\/]/u.test(text);
  const searchDirs = hasPath
    ? [""]
    : String(env.PATH ?? env.Path ?? "")
        .split(";")
        .map((entry) => entry.replace(/^"|"$/gu, "").trim())
        .filter(Boolean);
  const extensions = path.win32.extname(text) ? [""] : [".exe", ".com", ".cmd", ".bat"];
  const candidates = [];
  for (const directory of searchDirs) {
    for (const extension of extensions) {
      const candidate = hasPath ? `${text}${extension}` : path.join(directory, `${text}${extension}`);
      if (existsSync(candidate)) candidates.push(candidate);
    }
  }
  for (const candidate of candidates) {
    if (/\.(?:exe|com)$/iu.test(candidate)) return { command: candidate, args };
  }
  for (const candidate of candidates) {
    if (!/\.(?:cmd|bat)$/iu.test(candidate)) continue;
    const shim = resolveWindowsCmdShim(candidate);
    if (shim) return { command: shim.command, args: [...shim.argsPrefix, ...args] };
  }
  throw new Error(`No shell-free Windows invocation found for ${text}`);
}

function runCli(command, args, options = {}) {
  if (process.platform !== "win32") return run(command, args, options);
  const invocation = resolveWindowsCli(command, args, options.env ?? process.env);
  return run(invocation.command, invocation.args, options);
}

function commandFailure(label, result) {
  const streams = [
    result.stdout ? `stdout:\n${result.stdout}` : null,
    result.stderr ? `stderr:\n${result.stderr}` : null,
  ].filter(Boolean).join("\n");
  const detail = result.error?.message || streams || `exit ${result.status}`;
  return new Error(`${label} failed: ${String(detail).trim()}`);
}

function requireSuccess(label, result) {
  if (result.status !== 0 || result.error) throw commandFailure(label, result);
  return result;
}

function parsePackResult(result) {
  const parsed = JSON.parse(result.stdout);
  if (!Array.isArray(parsed) || !parsed[0]?.filename) {
    throw new Error("npm pack did not return a tarball filename");
  }
  return parsed[0].filename;
}

function packAndExtract({ sourceRoot, destinationRoot, environment, timeoutMs }) {
  const packDir = path.join(destinationRoot, "pack");
  const extractDir = path.join(destinationRoot, "extract");
  mkdirSync(packDir, { recursive: true });
  mkdirSync(extractDir, { recursive: true });
  const packed = requireSuccess(
    "npm pack",
    runCli("npm", ["pack", "--json", "--pack-destination", packDir], {
      cwd: sourceRoot,
      env: environment,
      timeoutMs,
    }),
  );
  const tarball = path.join(packDir, parsePackResult(packed));
  requireSuccess(
    "candidate tar extraction",
    run("tar", ["-xf", tarball, "-C", extractDir], {
      cwd: sourceRoot,
      env: environment,
      timeoutMs,
    }),
  );
  const workspace = path.join(extractDir, "package");
  if (!existsSync(path.join(workspace, "bin", "meta-kim.mjs"))) {
    throw new Error("packed candidate is missing bin/meta-kim.mjs");
  }
  return {
    workspace,
    tarballSha256: sha256(readFileSync(tarball)),
  };
}

function isolatedEnvironment(baseEnvironment, roots) {
  const allowed = [
    "PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec",
    "LANG", "LC_ALL", "TERM", "NODE_EXTRA_CA_CERTS", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
  ];
  const env = Object.fromEntries(
    allowed
      .filter((key) => baseEnvironment[key] !== undefined)
      .map((key) => [key, baseEnvironment[key]]),
  );
  return {
    ...env,
    HOME: roots.userHome,
    USERPROFILE: roots.userHome,
    TMP: roots.tempDir,
    TEMP: roots.tempDir,
    META_KIM_CLAUDE_HOME: roots.claudeHome,
    CLAUDE_HOME: roots.claudeHome,
    CLAUDE_CONFIG_DIR: roots.claudeHome,
    CLAUDE_SKILLS_DIR: path.join(roots.claudeHome, "skills"),
    META_KIM_CODEX_HOME: roots.codexHome,
    CODEX_HOME: roots.codexHome,
    CODEX_SKILLS_DIR: path.join(roots.codexHome, "skills"),
    META_KIM_CURSOR_HOME: roots.cursorHome,
    CURSOR_HOME: roots.cursorHome,
    META_KIM_OPENCLAW_HOME: roots.openclawHome,
    OPENCLAW_HOME: roots.openclawHome,
    META_KIM_SKIP_OPTIONAL_TOOLS: "1",
    META_KIM_WITH_GLOBAL_HOOKS: "0",
    META_KIM_PREFER_LOCAL_DEPENDENCIES: "1",
    META_KIM_LOCAL_DEPENDENCY_ROOT: roots.localDependencyRoot,
  };
}

function makeIsolatedRoots(root, name) {
  const laneRoot = path.join(root, name);
  const roots = {
    laneRoot,
    userHome: path.join(laneRoot, "user-home"),
    claudeHome: path.join(laneRoot, "user-home", ".claude"),
    codexHome: path.join(laneRoot, "user-home", ".codex"),
    cursorHome: path.join(laneRoot, "user-home", ".cursor"),
    openclawHome: path.join(laneRoot, "user-home", ".openclaw"),
    tempDir: path.join(laneRoot, "tmp"),
    ordinaryCwd: path.join(laneRoot, "ordinary-project"),
    projectDir: path.join(laneRoot, "governed-project"),
    localDependencyRoot: path.join(laneRoot, "local-dependencies"),
  };
  for (const directory of Object.values(roots)) mkdirSync(directory, { recursive: true });
  const planningFixture = path.join(roots.localDependencyRoot, "planning-with-files");
  mkdirSync(path.join(planningFixture, ".git"), { recursive: true });
  mkdirSync(path.join(planningFixture, "skills", "planning-with-files"), {
    recursive: true,
  });
  writeFileSync(
    path.join(planningFixture, "skills", "planning-with-files", "SKILL.md"),
    "---\nname: planning-with-files\ndescription: Deterministic packed acceptance fixture.\n---\n\n# Planning with Files\n",
    "utf8",
  );
  writeFileSync(path.join(roots.ordinaryCwd, "user-owned.txt"), "user-owned\n", "utf8");
  return roots;
}

function expectedProjectArtifacts(projectDir) {
  return {
    agentsGuide: path.join(projectDir, "AGENTS.md"),
    claudeGuide: path.join(projectDir, "CLAUDE.md"),
    claudeSettings: path.join(projectDir, ".claude", "settings.json"),
    mcpConfig: path.join(projectDir, ".mcp.json"),
    codexHooks: path.join(projectDir, ".codex", "hooks.json"),
    projectSkill: path.join(projectDir, ".agents", "skills", "meta-theory", "SKILL.md"),
    cursorSkill: path.join(projectDir, ".cursor", "skills", "meta-theory", "SKILL.md"),
    cursorMcp: path.join(projectDir, ".cursor", "mcp.json"),
    openclawSkill: path.join(projectDir, "openclaw", "skills", "meta-theory", "SKILL.md"),
    openclawTemplate: path.join(projectDir, "openclaw", "openclaw.template.json"),
    bootstrapManifest: path.join(
      projectDir,
      ".meta-kim",
      "state",
      "default",
      "project-bootstrap.json",
    ),
  };
}

function expectedArtifacts(roots) {
  return {
    claudeSkill: path.join(roots.claudeHome, "skills", "meta-theory", "SKILL.md"),
    claudeCommand: path.join(roots.claudeHome, "commands", "meta-theory.md"),
    codexSkill: path.join(roots.codexHome, "skills", "meta-theory", "SKILL.md"),
    codexCommand: path.join(roots.codexHome, "commands", "meta-theory.md"),
    codexConfig: path.join(roots.codexHome, "config.toml"),
    cursorSkill: path.join(roots.cursorHome, "skills", "meta-theory", "SKILL.md"),
    openclawSkill: path.join(roots.openclawHome, "skills", "meta-theory", "SKILL.md"),
    claudeDependencySkill: path.join(
      roots.claudeHome,
      "skills",
      ACCEPTANCE_SKILL_FILTER,
      "SKILL.md",
    ),
    codexDependencySkill: path.join(
      roots.codexHome,
      "skills",
      ACCEPTANCE_SKILL_FILTER,
      "SKILL.md",
    ),
    manifest: path.join(roots.userHome, ".meta-kim", "install-manifest.json"),
  };
}

function assertOrdinaryCwdUntouched(ordinaryCwd) {
  const polluted = PROJECT_PROJECTION_NAMES.filter((name) => existsSync(path.join(ordinaryCwd, name)));
  if (polluted.length > 0) {
    throw new Error(`global-only CLI polluted ordinary cwd: ${polluted.join(", ")}`);
  }
  if (readFileSync(path.join(ordinaryCwd, "user-owned.txt"), "utf8") !== "user-owned\n") {
    throw new Error("global-only CLI changed the user-owned cwd sentinel");
  }
  return { pollutedPaths: [], sentinelPreserved: true };
}

function artifactFingerprint(artifacts) {
  const proof = {};
  for (const [id, filePath] of Object.entries(artifacts)) {
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      throw new Error(`packed user acceptance missing ${id}: ${filePath}`);
    }
    const bytes = readFileSync(filePath);
    const stat = statSync(filePath);
    proof[id] = {
      sha256: sha256(bytes),
      bytes: bytes.length,
      mtimeMs: stat.mtimeMs,
    };
  }
  return proof;
}

function normalizedManifest(manifestPath, userHome) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.scope !== "global" || !Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    throw new Error("global install manifest is missing required entries");
  }
  return {
    schemaVersion: manifest.schemaVersion,
    scope: manifest.scope,
    metaKimVersion: manifest.metaKimVersion,
    entries: manifest.entries
      .map(({ installedAt: _installedAt, ...entry }) => ({
        ...entry,
        path: path.relative(userHome, entry.path).replaceAll("\\", "/"),
      }))
      .sort((left, right) => `${left.path}:${left.purpose ?? ""}`.localeCompare(`${right.path}:${right.purpose ?? ""}`)),
  };
}

function readValidatedProjectBootstrapManifest(projectDir) {
  const manifestPath = path.join(
    projectDir,
    ".meta-kim",
    "state",
    "default",
    "project-bootstrap.json",
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (
    manifest.schemaVersion !== "meta-kim-project-bootstrap-v0.1" ||
    !Array.isArray(manifest.managedFiles) ||
    manifest.managedFiles.length === 0
  ) {
    throw new Error("packed project bootstrap manifest is not valid");
  }
  for (const entry of manifest.managedFiles) {
    if (
      typeof entry?.relPath !== "string" ||
      !/^[a-f0-9]{64}$/iu.test(entry?.contentHash ?? "")
    ) {
      throw new Error(`packed project bootstrap manifest has an invalid entry: ${entry?.relPath ?? "missing"}`);
    }
    const managedPath = path.join(projectDir, ...entry.relPath.split("/"));
    if (!existsSync(managedPath) || sha256(readFileSync(managedPath)) !== entry.contentHash) {
      throw new Error(`packed project bootstrap manifest hash does not match ${entry.relPath}`);
    }
  }
  return { manifestPath, manifest };
}

function readProjectProjectionMode(projectRoot) {
  const overridesPath = path.join(
    projectRoot,
    ".meta-kim",
    "local.overrides.json",
  );
  const overrides = JSON.parse(readFileSync(overridesPath, "utf8"));
  return overrides.projectProjectionMode ?? null;
}

function managedTextBlock(raw, relPath) {
  const id = `META_KIM MANAGED BLOCK: ${relPath}`;
  const begin = `<!-- BEGIN ${id} -->`;
  const end = `<!-- END ${id} -->`;
  const start = raw.indexOf(begin);
  const finish = raw.indexOf(end);
  if (start < 0 || finish < start) {
    throw new Error(`packed project ${relPath} is missing its managed block`);
  }
  return raw.slice(start, finish + end.length);
}

function stableArtifactProof(before, after, { ignoreIds = [] } = {}) {
  const ignored = new Set(ignoreIds);
  const changed = [];
  for (const id of Object.keys(before)) {
    if (ignored.has(id)) continue;
    const changedFields = ["sha256", "bytes", "mtimeMs"].filter(
      (field) => before[id][field] !== after[id][field],
    );
    if (changedFields.length > 0) {
      changed.push({ id, changedFields, before: before[id], after: after[id] });
    }
  }
  return { stable: changed.length === 0, changed };
}

function formatArtifactChanges(changed) {
  return changed
    .map((entry) =>
      `${entry.id}[${entry.changedFields.join("+")}]:` +
      `before=${JSON.stringify(entry.before)};after=${JSON.stringify(entry.after)}`,
    )
    .join(", ");
}

function runPublicCli(workspace, roots, env, mode, timeoutMs) {
  const args = [
    path.join(workspace, "bin", "meta-kim.mjs"),
    mode,
    "--silent",
    "--targets",
    PACKED_USER_TARGETS.join(","),
    "--skills",
    ACCEPTANCE_SKILL_FILTER,
  ];
  return run(process.execPath, args, {
    cwd: roots.ordinaryCwd,
    env,
    timeoutMs,
  });
}

function runPublicProjectCli(workspace, roots, env, mode, timeoutMs) {
  return run(process.execPath, [
    path.join(workspace, "bin", "meta-kim.mjs"),
    mode,
    "--silent",
    "--scope",
    "project",
    "--targets",
    PACKED_USER_TARGETS.join(","),
    "--project-dir",
    roots.projectDir,
  ], {
    cwd: roots.ordinaryCwd,
    env,
    timeoutMs,
  });
}

function runPublicGlobalUpdateFromProject(workspace, roots, env, timeoutMs) {
  return run(process.execPath, [
    path.join(workspace, "bin", "meta-kim.mjs"),
    "update",
    "--silent",
    "--scope",
    "global",
    "--targets",
    PACKED_USER_TARGETS.join(","),
    "--skills",
    ACCEPTANCE_SKILL_FILTER,
  ], {
    cwd: roots.projectDir,
    env,
    timeoutMs,
  });
}

function runProjectCapabilityCopy(
  workspace,
  roots,
  env,
  { type, id, source, mode },
  timeoutMs,
) {
  return run(process.execPath, [
    path.join(workspace, "bin", "meta-kim.mjs"),
    "project",
    "capability",
    "copy",
    "--project-dir",
    roots.projectDir,
    "--runtime",
    "codex",
    "--type",
    type,
    "--id",
    id,
    "--source",
    source,
    "--mode",
    mode,
    "--apply",
    "--json",
  ], {
    cwd: roots.ordinaryCwd,
    env,
    timeoutMs,
  });
}

function runtimeSedimentationFixtures(roots) {
  const fixtures = [
    {
      type: "agent",
      id: "acceptance-runtime-agent",
      source: path.join(roots.codexHome, "agents", "acceptance-runtime-agent.toml"),
      target: path.join(roots.projectDir, ".codex", "agents", "acceptance-runtime-agent.toml"),
      first: 'name = "acceptance-runtime-agent"\ndescription = "runtime v1"\ndeveloper_instructions = "v1"\n',
      second: 'name = "acceptance-runtime-agent"\ndescription = "runtime v2"\ndeveloper_instructions = "v2"\n',
    },
    {
      type: "skill",
      id: "acceptance-runtime-skill",
      source: path.join(roots.codexHome, "skills", "acceptance-runtime-skill", "SKILL.md"),
      target: path.join(roots.projectDir, ".agents", "skills", "acceptance-runtime-skill", "SKILL.md"),
      first: "# acceptance runtime skill\n\nv1\n",
      second: "# acceptance runtime skill\n\nv2\n",
    },
    {
      type: "command",
      id: "acceptance-runtime-command",
      source: path.join(roots.codexHome, "commands", "acceptance-runtime-command.md"),
      target: path.join(roots.projectDir, ".codex", "commands", "acceptance-runtime-command.md"),
      first: "# acceptance runtime command\n\nv1\n",
      second: "# acceptance runtime command\n\nv2\n",
    },
  ];
  for (const fixture of fixtures) {
    mkdirSync(path.dirname(fixture.source), { recursive: true });
    writeFileSync(fixture.source, fixture.first, "utf8");
  }
  return fixtures;
}

function globalReuseOnlyFixtures(roots) {
  const fixtures = [
    {
      type: "agent",
      id: "acceptance-global-reuse-agent",
      source: path.join(roots.codexHome, "agents", "acceptance-global-reuse-agent.toml"),
      target: path.join(roots.projectDir, ".codex", "agents", "acceptance-global-reuse-agent.toml"),
      content: 'name = "acceptance-global-reuse-agent"\ndescription = "reuse globally"\ndeveloper_instructions = "reuse"\n',
    },
    {
      type: "skill",
      id: "acceptance-global-reuse-skill",
      source: path.join(roots.codexHome, "skills", "acceptance-global-reuse-skill", "SKILL.md"),
      target: path.join(roots.projectDir, ".agents", "skills", "acceptance-global-reuse-skill", "SKILL.md"),
      content:
        "---\nname: acceptance-global-reuse-skill\n" +
        "description: Reusable global packed acceptance skill.\n---\n\n" +
        "# Acceptance global reuse skill\n",
    },
    {
      type: "command",
      id: "acceptance-global-reuse-command",
      source: path.join(roots.codexHome, "commands", "acceptance-global-reuse-command.md"),
      target: path.join(roots.projectDir, ".codex", "commands", "acceptance-global-reuse-command.md"),
      content: "# acceptance global reuse command\n",
    },
  ];
  for (const fixture of fixtures) {
    mkdirSync(path.dirname(fixture.source), { recursive: true });
    writeFileSync(fixture.source, fixture.content, "utf8");
  }
  return fixtures;
}

function runGlobalReuseNegativeLane({ packageInfo, roots, env, fixtures, timeoutMs }) {
  const artifactDir = path.join(roots.projectDir, ".meta-kim", "acceptance", "global-reuse");
  const stateDir = path.join(roots.projectDir, ".meta-kim", "state", "acceptance-global-reuse");
  const dbPath = path.join(stateDir, "runs.sqlite");
  mkdirSync(artifactDir, { recursive: true });
  mkdirSync(stateDir, { recursive: true });
  const task = [
    "请直接复用全局 agent acceptance-global-reuse-agent，不需要迭代或修改，也不要复制到项目。",
    "请直接复用全局 skill acceptance-global-reuse-skill，不需要迭代或修改，也不要复制到项目。",
    "请直接复用全局 command acceptance-global-reuse-command，不需要迭代或修改，也不要复制到项目。",
  ].join("\n");
  const runId = "packed-global-reuse-negative";
  requireSuccess(
    "governed global reuse negative acceptance",
    run(process.execPath, [
      path.join(packageInfo.workspace, "scripts", "run-meta-theory-governed-execution.mjs"),
      "--task",
      task,
      "--run-id",
      runId,
      "--state-dir",
      stateDir,
      "--artifact-dir",
      artifactDir,
      "--db",
      dbPath,
      "--runtime",
      "codex",
      "--os",
      "windows",
      "--output-language",
      "zh-CN",
    ], {
      cwd: roots.projectDir,
      env,
      timeoutMs,
    }),
  );
  const artifact = JSON.parse(readFileSync(path.join(artifactDir, `${runId}.json`), "utf8"));
  const packet = artifact.projectCustomizationPacket;
  if (packet?.decision !== "use_global_directly") {
    const inventoryPath = path.join(
      packageInfo.workspace,
      ".meta-kim",
      "state",
      "default",
      "capability-index",
      "global-capabilities.json",
    );
    const inventory = existsSync(inventoryPath)
      ? JSON.parse(readFileSync(inventoryPath, "utf8"))
      : null;
    const acceptanceInventoryKeys = Object.fromEntries(
      ["agents", "skills", "commands"].map((type) => [
        type,
        Object.keys(inventory?.byCapabilityType?.[type] ?? {}).filter((key) =>
          key.includes("acceptance-global-reuse"),
        ),
      ]),
    );
    throw new Error(
      `global reuse request resolved to ${packet?.decision ?? "missing"} instead of use_global_directly: ` +
      JSON.stringify({ decisions: packet?.decisions ?? [], acceptanceInventoryKeys }),
    );
  }
  const requested = new Set(fixtures.map((fixture) => fixture.id));
  const relevantDecisions = (packet.decisions ?? []).filter((decision) =>
    requested.has(decision.globalCandidateChecked?.providerId),
  );
  if (
    relevantDecisions.length !== fixtures.length ||
    !relevantDecisions.every(
      (decision) =>
        decision.decision === "use_global_directly" &&
        decision.copyPolicy === "use_global_directly" &&
        requested.has(decision.globalCandidateChecked?.providerId) &&
        decision.approvalRequired === false,
    )
  ) {
    throw new Error("global reuse request did not keep all Agent/Skill/Command decisions copy-free");
  }
  const copied = fixtures.filter((fixture) => existsSync(fixture.target));
  if (copied.length > 0) {
    throw new Error(`use_global_directly created project copies: ${copied.map((item) => item.type).join(", ")}`);
  }
  const manifestPath = path.join(
    roots.projectDir,
    ".meta-kim",
    "state",
    "default",
    "project-capabilities.json",
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const unexpectedEntries = manifest.capabilities.filter((entry) => requested.has(entry.id));
  if (unexpectedEntries.length > 0) {
    throw new Error("use_global_directly added project capability ownership entries");
  }
  return {
    status: "passed",
    decision: packet.decision,
    types: fixtures.map((fixture) => fixture.type),
    projectCopiesCreated: 0,
    ownershipEntriesCreated: 0,
  };
}

function runRuntimeSedimentationLane({ packageInfo, roots, env, timeoutMs }) {
  const fixtures = runtimeSedimentationFixtures(roots);
  const reuseOnlyFixtures = globalReuseOnlyFixtures(roots);
  for (const fixture of fixtures) {
    const copied = requireSuccess(
      `project capability create ${fixture.type}`,
      runProjectCapabilityCopy(
        packageInfo.workspace,
        roots,
        env,
        { ...fixture, mode: "create" },
        timeoutMs,
      ),
    );
    const result = JSON.parse(copied.stdout);
    if (result.status !== "committed" || result.capability?.ownership !== "project") {
      throw new Error(`project capability create ${fixture.type} did not commit project ownership`);
    }
    if (readFileSync(fixture.target, "utf8") !== fixture.first) {
      throw new Error(`project capability create ${fixture.type} did not copy the runtime source`);
    }
    writeFileSync(fixture.target, `${fixture.first}\nproject-user-modification\n`, "utf8");
    writeFileSync(fixture.source, fixture.second, "utf8");
  }

  const capabilityManifestPath = path.join(
    roots.projectDir,
    ".meta-kim",
    "state",
    "default",
    "project-capabilities.json",
  );
  const capabilityManifestBefore = JSON.parse(
    readFileSync(capabilityManifestPath, "utf8"),
  );
  if (
    capabilityManifestBefore.capabilities?.length !== fixtures.length ||
    !capabilityManifestBefore.capabilities.every(
      (entry) =>
        entry.ownershipClass === "runtime_sedimented_project_copy" &&
        entry.dependencyUpdatePolicy === "preserve_project_copy",
    )
  ) {
    throw new Error("project capability manifest was not prepared before the global update");
  }

  const bootstrapBefore = readValidatedProjectBootstrapManifest(roots.projectDir);
  const projectProjectionModeBefore = readProjectProjectionMode(
    roots.projectDir,
  );
  if (projectProjectionModeBefore !== "project") {
    throw new Error("packed project install did not establish project projection mode");
  }
  const globalArtifacts = expectedArtifacts(roots);
  const projectArtifacts = expectedProjectArtifacts(roots.projectDir);
  const candidateVersion = JSON.parse(
    readFileSync(path.join(packageInfo.workspace, "package.json"), "utf8"),
  ).version;
  const globalSkillExpected = readFileSync(globalArtifacts.codexSkill, "utf8");
  const projectSkillExpected = readFileSync(projectArtifacts.projectSkill, "utf8");
  const agentsExpectedBlock = managedTextBlock(
    readFileSync(projectArtifacts.agentsGuide, "utf8"),
    "AGENTS.md",
  );
  const agentsUserNote = "packed-acceptance-user-agents-note";
  const agentsBegin = "<!-- BEGIN META_KIM MANAGED BLOCK: AGENTS.md -->";
  const agentsEnd = "<!-- END META_KIM MANAGED BLOCK: AGENTS.md -->";
  const unknownProjectFile = path.join(
    roots.projectDir,
    ".codex",
    "commands",
    "packed-user-owned-command.md",
  );
  const unknownProjectContent = "# packed user-owned command\n\nkeep me\n";

  writeFileSync(globalArtifacts.codexSkill, "stale packed global skill\n", "utf8");
  writeFileSync(projectArtifacts.projectSkill, "stale packed project skill\n", "utf8");
  writeFileSync(
    projectArtifacts.agentsGuide,
    `${agentsUserNote}\n\n${agentsBegin}\nstale packed managed block\n${agentsEnd}\n`,
    "utf8",
  );
  mkdirSync(path.dirname(unknownProjectFile), { recursive: true });
  writeFileSync(unknownProjectFile, unknownProjectContent, "utf8");

  const dependencyUpdate = requireSuccess(
    "project-aware global update after project capability copies",
    runPublicGlobalUpdateFromProject(packageInfo.workspace, roots, env, timeoutMs),
  );
  assertOrdinaryCwdUntouched(roots.ordinaryCwd);

  if (readFileSync(globalArtifacts.codexSkill, "utf8") !== globalSkillExpected) {
    throw new Error("project-aware global update did not refresh the global Codex skill");
  }
  if (readFileSync(projectArtifacts.projectSkill, "utf8") !== projectSkillExpected) {
    throw new Error("project-aware global update did not replace the manifest-managed project skill");
  }
  const agentsAfter = readFileSync(projectArtifacts.agentsGuide, "utf8");
  if (
    !agentsAfter.includes(agentsUserNote) ||
    managedTextBlock(agentsAfter, "AGENTS.md") !== agentsExpectedBlock
  ) {
    throw new Error("project-aware global update did not merge AGENTS.md while preserving user text");
  }
  if (readFileSync(unknownProjectFile, "utf8") !== unknownProjectContent) {
    throw new Error("project-aware global update changed an unknown user project file");
  }
  for (const fixture of fixtures) {
    const expected = `${fixture.first}\nproject-user-modification\n`;
    if (readFileSync(fixture.target, "utf8") !== expected) {
      throw new Error(`project-aware global update overwrote the runtime-sedimented ${fixture.type}`);
    }
  }

  const bootstrapAfter = readValidatedProjectBootstrapManifest(roots.projectDir);
  const projectProjectionModeAfter = readProjectProjectionMode(
    roots.projectDir,
  );
  if (projectProjectionModeAfter !== projectProjectionModeBefore) {
    throw new Error("project-aware global update changed the existing project projection mode");
  }
  if (bootstrapAfter.manifest.metaKimVersion !== candidateVersion) {
    throw new Error("project-aware global update did not advance the project bootstrap manifest");
  }
  const projectSkillEntry = bootstrapAfter.manifest.managedFiles.find(
    (entry) => entry.relPath === ".agents/skills/meta-theory/SKILL.md",
  );
  const agentsEntry = bootstrapAfter.manifest.managedFiles.find(
    (entry) => entry.relPath === "AGENTS.md",
  );
  if (projectSkillEntry?.mergePolicy !== "manifest_managed_projection_replace") {
    throw new Error("project-aware global update did not record project skill replace ownership");
  }
  if (agentsEntry?.mergePolicy !== "managed_block_preserve_user_text") {
    throw new Error("project-aware global update did not record AGENTS.md merge ownership");
  }

  const globalReuse = runGlobalReuseNegativeLane({
    packageInfo,
    roots,
    env,
    fixtures: reuseOnlyFixtures,
    timeoutMs,
  });

  for (const fixture of fixtures) {
    const expected = `${fixture.first}\nproject-user-modification\n`;
    if (readFileSync(fixture.target, "utf8") !== expected) {
      throw new Error(`global update overwrote the project-owned ${fixture.type}`);
    }
    const iterated = requireSuccess(
      `project capability iterate ${fixture.type}`,
      runProjectCapabilityCopy(
        packageInfo.workspace,
        roots,
        env,
        { ...fixture, mode: "iterate" },
        timeoutMs,
      ),
    );
    const result = JSON.parse(iterated.stdout);
    const entry = result.capability?.files?.find((file) => file.relPath);
    if (entry?.state !== "preserved_project_copy") {
      throw new Error(`project capability iterate ${fixture.type} did not report preserved_project_copy`);
    }
    if (readFileSync(fixture.target, "utf8") !== expected) {
      throw new Error(`global update or iterate overwrote the project-owned ${fixture.type}`);
    }
  }

  const manifest = JSON.parse(readFileSync(capabilityManifestPath, "utf8"));
  if (manifest.capabilities?.length !== fixtures.length) {
    throw new Error("project capability ownership manifest does not contain all three capability types");
  }
  if (
    !manifest.capabilities.every(
      (entry) =>
        entry.ownership === "project" &&
        entry.dependencyUpdatePolicy === "preserve_project_copy" &&
        entry.detachedFromDependencyUpdates === true,
    )
  ) {
    throw new Error("project capability ownership manifest lost preserve_project_copy policy");
  }
  return {
    status: "passed",
    publicEntry: "meta-kim project capability copy",
    types: fixtures.map((fixture) => fixture.type),
    dependencyUpdateExitCode: dependencyUpdate.status,
    projectCopiesPreserved: true,
    manifest: ".meta-kim/state/default/project-capabilities.json",
    projectAwareGlobalUpdate: {
      status: "passed",
      targets: [...PACKED_USER_TARGETS],
      publicEntry: "meta-kim update --scope global",
      cwd: "bootstrapped_project",
      bootstrapManifestValidBefore: Boolean(bootstrapBefore.manifest),
      bootstrapManifestVersionAfter: bootstrapAfter.manifest.metaKimVersion,
      globalHomesUpdated: true,
      managedProjectionReplaceVerified: true,
      managedTextMergeVerified: true,
      unknownProjectFilePreserved: true,
      runtimeSedimentedCopiesPreserved: true,
      projectProjectionModePreserved: true,
    },
    globalReuse,
  };
}

function runProjectPackageLane({ packageInfo, roots, env, timeoutMs, onProgress }) {
  writeFileSync(path.join(roots.projectDir, "user-owned-project.txt"), "project-owned\n", "utf8");
  const projectArtifacts = expectedProjectArtifacts(roots.projectDir);
  const modes = [];
  let firstProof = null;
  for (const ordinal of [1, 2]) {
    emit(onProgress, { event: "packed_project_mode_start", mode: ordinal === 1 ? "install" : "update", ordinal });
    const mode = ordinal === 1 ? "install" : "update";
    const result = runPublicProjectCli(packageInfo.workspace, roots, env, mode, timeoutMs);
    if (result.status !== 0 || result.error) throw commandFailure(`packed project ${mode}`, result);
    const proof = artifactFingerprint(projectArtifacts);
    if (readFileSync(path.join(roots.projectDir, "user-owned-project.txt"), "utf8") !== "project-owned\n") {
      throw new Error("project bootstrap changed the user-owned project sentinel");
    }
    const record = {
      mode: ordinal === 1 ? "install" : "update",
      ordinal,
      status: "passed",
      artifactCount: Object.keys(proof).length,
      outputHash: sha256(`${result.stdout ?? ""}\n${result.stderr ?? ""}`),
    };
    if (ordinal === 1) {
      firstProof = proof;
    } else {
      const idempotence = stableArtifactProof(firstProof, proof);
      if (!idempotence.stable) {
        throw new Error(
          `second packed project update changed managed artifacts: ${formatArtifactChanges(idempotence.changed)}`,
        );
      }
      record.idempotence = idempotence;
    }
    modes.push(record);
    emit(onProgress, { event: "packed_project_mode_complete", ...record });
  }
  return {
    status: "passed",
    targets: [...PACKED_USER_TARGETS],
    modes,
    projectDirOutsidePackage: true,
    userOwnedProjectContentPreserved: true,
    publicScopeSelection: "--scope project",
  };
}

function materializePackage(workspace, env, timeoutMs) {
  return requireSuccess(
    "packed candidate npm install",
    runCli("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
      cwd: workspace,
      env,
      timeoutMs,
    }),
  );
}

function emit(onProgress, payload) {
  if (typeof onProgress !== "function") return;
  try {
    onProgress(payload);
  } catch {
    // Progress is diagnostic only.
  }
}

function runCurrentPackageLane({
  packageInfo,
  root,
  environment,
  timeoutMs,
  onProgress,
  stopAfterGlobalIdempotence = false,
}) {
  const roots = makeIsolatedRoots(root, "current-package");
  const env = isolatedEnvironment(environment, roots);
  materializePackage(packageInfo.workspace, env, timeoutMs);
  const artifacts = expectedArtifacts(roots);
  const modes = [];
  let firstUpdateProof = null;
  let firstUpdateManifest = null;
  for (const mode of ["install", "update", "update"]) {
    emit(onProgress, { event: "packed_user_mode_start", mode, ordinal: modes.length + 1 });
    const result = runPublicCli(packageInfo.workspace, roots, env, mode, timeoutMs);
    const record = {
      mode,
      ordinal: modes.length + 1,
      status: result.status === 0 && !result.error ? "passed" : "failed",
      exitCode: result.status,
      outputHash: sha256(`${result.stdout ?? ""}\n${result.stderr ?? ""}`),
      error: result.error?.message ?? null,
    };
    modes.push(record);
    if (record.status !== "passed") throw commandFailure(`packed user ${mode}`, result);
    const cwdProof = assertOrdinaryCwdUntouched(roots.ordinaryCwd);
    const currentProof = artifactFingerprint(artifacts);
    const currentManifest = normalizedManifest(artifacts.manifest, roots.userHome);
    record.artifactCount = Object.keys(currentProof).length;
    record.cwdProof = cwdProof;
    if (mode === "update" && firstUpdateProof === null) {
      firstUpdateProof = currentProof;
      firstUpdateManifest = currentManifest;
    } else if (mode === "update") {
      const idempotence = stableArtifactProof(firstUpdateProof, currentProof, {
        ignoreIds: ["manifest"],
      });
      if (!idempotence.stable) {
        throw new Error(
          `second packed user update changed managed artifacts: ${formatArtifactChanges(idempotence.changed)}`,
        );
      }
      if (JSON.stringify(firstUpdateManifest) !== JSON.stringify(currentManifest)) {
        throw new Error("second packed user update changed global manifest semantics");
      }
      record.idempotence = { ...idempotence, manifestStable: true };
    }
    emit(onProgress, { event: "packed_user_mode_complete", ...record });
  }
  if (stopAfterGlobalIdempotence) {
    return {
      status: "passed",
      targets: [...PACKED_USER_TARGETS],
      modes,
      packageSha256: packageInfo.tarballSha256,
      cwdBoundary: "ordinary_cwd_untouched",
      idempotentSecondUpdate: true,
      freshGlobalUpdateCreatedProjectCopies: false,
      stoppedAfterGlobalIdempotence: true,
    };
  }
  const projectPackage = runProjectPackageLane({
    packageInfo,
    roots,
    env,
    timeoutMs,
    onProgress,
  });
  const runtimeSedimentation = runRuntimeSedimentationLane({
    packageInfo,
    roots,
    env,
    timeoutMs,
  });
  return {
    status: "passed",
    targets: [...PACKED_USER_TARGETS],
    modes,
    packageSha256: packageInfo.tarballSha256,
    cwdBoundary: "ordinary_cwd_untouched",
    idempotentSecondUpdate: true,
    freshGlobalUpdateCreatedProjectCopies: false,
    projectPackage,
    runtimeSedimentation,
  };
}

function historicalRefExists(repoRoot, historicalRef, environment, timeoutMs) {
  const result = run("git", ["rev-parse", "--verify", `${historicalRef}^{commit}`], {
    cwd: repoRoot,
    env: environment,
    timeoutMs,
  });
  return result.status === 0;
}

function extractHistoricalSource(repoRoot, root, historicalRef, environment, timeoutMs) {
  const historicalRoot = path.join(root, "historical-source");
  const archivePath = path.join(historicalRoot, "source.tar");
  const sourceRoot = path.join(historicalRoot, "source");
  mkdirSync(sourceRoot, { recursive: true });
  requireSuccess(
    `git archive ${historicalRef}`,
    run("git", ["archive", "--format=tar", `--output=${archivePath}`, historicalRef], {
      cwd: repoRoot,
      env: environment,
      timeoutMs,
    }),
  );
  requireSuccess(
    `extract ${historicalRef}`,
    run("tar", ["-xf", archivePath, "-C", sourceRoot], {
      cwd: repoRoot,
      env: environment,
      timeoutMs,
    }),
  );
  return sourceRoot;
}

function runHistoricalUpdateLane({
  repoRoot,
  packageInfo,
  root,
  environment,
  timeoutMs,
  historicalRef,
}) {
  if (!historicalRefExists(repoRoot, historicalRef, environment, timeoutMs)) {
    return {
      status: "not_available",
      historicalRef,
      completed: false,
      reason: "historical_git_ref_missing",
    };
  }
  const historicalSource = extractHistoricalSource(
    repoRoot,
    root,
    historicalRef,
    environment,
    timeoutMs,
  );
  const historicalPackage = packAndExtract({
    sourceRoot: historicalSource,
    destinationRoot: path.join(root, "historical-package"),
    environment,
    timeoutMs,
  });
  const roots = makeIsolatedRoots(root, "historical-update");
  const env = isolatedEnvironment(environment, roots);
  const artifacts = expectedArtifacts(roots);
  requireSuccess(
    `${historicalRef} global state seed`,
    run(process.execPath, [
      path.join(historicalPackage.workspace, "scripts", "sync-global-meta-theory.mjs"),
      "--targets",
      PACKED_USER_TARGETS.join(","),
    ], {
      cwd: roots.ordinaryCwd,
      env,
      timeoutMs,
    }),
  );
  const before = normalizedManifest(artifacts.manifest, roots.userHome);
  materializePackage(packageInfo.workspace, env, timeoutMs);
  const update = requireSuccess(
    `packed user update from ${historicalRef}`,
    runPublicCli(packageInfo.workspace, roots, env, "update", timeoutMs),
  );
  assertOrdinaryCwdUntouched(roots.ordinaryCwd);
  const proof = artifactFingerprint(artifacts);
  const after = normalizedManifest(artifacts.manifest, roots.userHome);
  if (before.metaKimVersion === after.metaKimVersion) {
    throw new Error(`${historicalRef} update did not advance the global manifest version`);
  }
  return {
    status: "passed",
    targets: [...PACKED_USER_TARGETS],
    historicalRef,
    completed: true,
    seedMethod: "historical_packed_global_sync",
    beforeVersion: before.metaKimVersion,
    afterVersion: after.metaKimVersion,
    exitCode: update.status,
    artifactCount: Object.keys(proof).length,
    cwdBoundary: "ordinary_cwd_untouched",
  };
}

export function runPackedUserInstallUpdateAcceptance({
  repoRoot = process.cwd(),
  environment = process.env,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  historicalRef = HISTORICAL_UPDATE_REF,
  includeHistorical = true,
  onProgress = null,
  stopAfterGlobalIdempotence = false,
} = {}) {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "meta-kim-packed-user-"));
  emit(onProgress, { event: "packed_user_acceptance_start", targets: [...PACKED_USER_TARGETS] });
  try {
    const packageInfo = packAndExtract({
      sourceRoot: repoRoot,
      destinationRoot: path.join(tempRoot, "candidate"),
      environment,
      timeoutMs,
    });
    const currentPackage = runCurrentPackageLane({
      packageInfo,
      root: tempRoot,
      environment,
      timeoutMs,
      onProgress,
      stopAfterGlobalIdempotence,
    });
    const historicalUpdate = stopAfterGlobalIdempotence
      ? {
          status: "not_requested",
          historicalRef,
          completed: false,
          reason: "stopped_after_global_idempotence",
        }
      : includeHistorical
      ? runHistoricalUpdateLane({
          repoRoot,
          packageInfo,
          root: tempRoot,
          environment,
          timeoutMs,
          historicalRef,
        })
      : {
          status: "not_requested",
          historicalRef,
          completed: false,
          reason: "historical_lane_disabled",
        };
    const result = {
      status: "passed",
      sourcePolicy: "npm_pack_extracted_public_cli",
      currentPackage,
      historicalUpdate,
      error: null,
    };
    emit(onProgress, { event: "packed_user_acceptance_complete", status: "passed" });
    return result;
  } catch (error) {
    const result = {
      status: "failed",
      sourcePolicy: "npm_pack_extracted_public_cli",
      currentPackage: null,
      historicalUpdate: null,
      error: error.message,
    };
    emit(onProgress, {
      event: "packed_user_acceptance_complete",
      status: "failed",
      error: error.message,
    });
    return result;
  } finally {
    try {
      rmSync(tempRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 500 });
    } catch (error) {
      if (!["EBUSY", "EPERM"].includes(error?.code)) throw error;
      process.stderr.write(
        `[packed-user-acceptance] temp cleanup deferred because a child still holds a file: ${tempRoot}\n`,
      );
    }
  }
}

function main() {
  const includeHistorical = !process.argv.includes("--skip-history");
  const stopAfterGlobalIdempotence = process.argv.includes("--stop-after-global-idempotence");
  const result = runPackedUserInstallUpdateAcceptance({
    includeHistorical,
    stopAfterGlobalIdempotence,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.status === "passed" ? 0 : 1);
}

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) main();
