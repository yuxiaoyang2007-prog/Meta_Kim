#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const keepTemp = process.argv.includes("--keep-temp");
const useRealGlobal = process.argv.includes("--real-global");
const tempRoot = mkdtempSync(path.join(os.tmpdir(), "meta-kim-cache-generation-"));

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 180_000,
    windowsHide: true,
    ...options,
  });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeProjectSeed(projectDir) {
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(
    path.join(projectDir, "README.md"),
    "# Cache Generation Smoke\n\nThis is a temporary Meta_Kim verification project.\n",
    "utf8",
  );
  writeFileSync(
    path.join(projectDir, "package.json"),
    `${JSON.stringify({ name: "meta-kim-cache-smoke", private: true }, null, 2)}\n`,
    "utf8",
  );
}

function runGlobalSync(caseRoot) {
  const userHome = path.join(caseRoot, "user-home");
  const homes = {
    claude: path.join(userHome, ".claude"),
    codex: path.join(userHome, ".codex"),
    cursor: path.join(userHome, ".cursor"),
    openclaw: path.join(userHome, ".openclaw"),
  };
  const env = {
    ...process.env,
    USERPROFILE: userHome,
    HOME: userHome,
    META_KIM_CLAUDE_HOME: homes.claude,
    META_KIM_CODEX_HOME: homes.codex,
    META_KIM_CURSOR_HOME: homes.cursor,
    META_KIM_OPENCLAW_HOME: homes.openclaw,
  };
  const result = runNode(
    [
      "scripts/sync-global-meta-theory.mjs",
      "--targets",
      "claude,codex,cursor,openclaw",
      "--with-global-hooks",
    ],
    { env },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return { userHome, homes, env };
}

function realGlobalHomes() {
  const userHome = os.homedir();
  return {
    userHome,
    homes: {
      claude: process.env.META_KIM_CLAUDE_HOME ?? path.join(userHome, ".claude"),
      codex: process.env.META_KIM_CODEX_HOME ?? path.join(userHome, ".codex"),
      cursor: process.env.META_KIM_CURSOR_HOME ?? path.join(userHome, ".cursor"),
      openclaw:
        process.env.META_KIM_OPENCLAW_HOME ?? path.join(userHome, ".openclaw"),
    },
    env: process.env,
  };
}

function globalInstallForCase(caseRoot) {
  return useRealGlobal ? realGlobalHomes() : runGlobalSync(caseRoot);
}

function runProjectBootstrap(projectDir) {
  const result = runNode([
    "setup.mjs",
    "--project-bootstrap",
    "--targets",
    "claude,codex,cursor,openclaw",
    "--project-dir",
    projectDir,
    "--json",
    "--apply",
  ]);
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return JSON.parse(result.stdout);
}

function codexSpineHookCommand(codexHome) {
  const hooksJsonPath = path.join(codexHome, "hooks.json");
  const hooksJson = readJson(hooksJsonPath);
  const hooks =
    hooksJson.hooks?.UserPromptSubmit?.flatMap((block) => block.hooks ?? []) ??
    [];
  const hook = hooks.find((entry) =>
    String(entry.command ?? "").includes("activate-meta-theory-spine.mjs"),
  );
  if (!hook) {
    throw new Error(`Missing Codex global spine hook in ${hooksJsonPath}`);
  }
  return hook.command;
}

function invokeInstalledCodexHook(projectDir, codexHome, env) {
  const hookScript = path.join(
    codexHome,
    "hooks",
    "meta-kim",
    "activate-meta-theory-spine.mjs",
  );
  const hooksCommand = codexSpineHookCommand(codexHome);
  const result = spawnSync(
    process.execPath,
    [hookScript, "--package-root", repoRoot],
    {
      cwd: projectDir,
      input: JSON.stringify({
        prompt: "critical and fetch thinking and review",
      }),
      encoding: "utf8",
      timeout: 30_000,
      windowsHide: true,
      env,
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return {
    hookScript,
    hooksCommand,
    hooksCommandHasPackageRoot:
      hooksCommand.includes("--package-root") &&
      hooksCommand.includes(repoRoot),
  };
}

function waitForPostCopy(projectDir) {
  const markerPath = path.join(
    projectDir,
    ".meta-kim",
    "state",
    "default",
    "post-copy-init.json",
  );
  const deadline = Date.now() + 180_000;
  let marker = null;
  while (Date.now() < deadline) {
    if (existsSync(markerPath)) {
      try {
        marker = readJson(markerPath);
      } catch {
        marker = null;
      }
      if (marker?.status === "passed" || marker?.status === "failed") {
        break;
      }
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  return {
    markerPath,
    marker,
  };
}

function inspectProject(projectDir, { projectBootstrap = false } = {}) {
  const projectBootstrapPath = path.join(
    projectDir,
    ".meta-kim",
    "state",
    "default",
    "project-bootstrap.json",
  );
  const postCopy = waitForPostCopy(projectDir);
  const graphPath = path.join(projectDir, "graphify-out", "graph.json");
  const graphReportPath = path.join(projectDir, "graphify-out", "GRAPH_REPORT.md");
  const projectCopies = {
    codexProjectSkill: existsSync(
      path.join(projectDir, ".agents", "skills", "meta-theory", "SKILL.md"),
    ),
    projectPostCopyScript: existsSync(
      path.join(projectDir, ".meta-kim", "meta-kim-post-copy.mjs"),
    ),
    rootPostCopyScript: existsSync(path.join(projectDir, "meta-kim-post-copy.mjs")),
  };
  return {
    projectDir,
    projectBootstrap: {
      exists: existsSync(projectBootstrapPath),
      path: projectBootstrapPath,
    },
    postCopyInit: {
      exists: existsSync(postCopy.markerPath),
      path: postCopy.markerPath,
      status: postCopy.marker?.status ?? null,
      graphPath: postCopy.marker?.graphPath ?? null,
    },
    graphify: {
      graphJson: existsSync(graphPath),
      graphReport: existsSync(graphReportPath),
      graphPath,
      graphReportPath,
    },
    projectCopies,
    unexpectedProjectCopies: {
      codexProjectSkill: !projectBootstrap && projectCopies.codexProjectSkill,
      projectPostCopyScript: projectCopies.projectPostCopyScript,
      rootPostCopyScript: projectCopies.rootPostCopyScript,
    },
  };
}

function caseOk(caseResult) {
  const generatedOk =
    caseResult.cache.postCopyInit.status === "passed" &&
    caseResult.cache.graphify.graphJson &&
    caseResult.cache.graphify.graphReport;
  const noUnexpectedCopies = Object.values(
    caseResult.cache.unexpectedProjectCopies,
  ).every((value) => value === false);
  const bootstrapOk = caseResult.expectProjectBootstrap
    ? caseResult.cache.projectBootstrap.exists
    : !caseResult.cache.projectBootstrap.exists;
  return (
    generatedOk &&
    noUnexpectedCopies &&
    bootstrapOk &&
    caseResult.hook.hooksCommandHasPackageRoot
  );
}

function runCase(id, { projectBootstrap }) {
  const caseRoot = path.join(tempRoot, id);
  const projectDir = path.join(caseRoot, "project");
  const global = globalInstallForCase(caseRoot);
  writeProjectSeed(projectDir);
  let bootstrapSummary = null;
  if (projectBootstrap) {
    bootstrapSummary = runProjectBootstrap(projectDir);
  }
  const hook = invokeInstalledCodexHook(projectDir, global.homes.codex, global.env);
  const cache = inspectProject(projectDir, { projectBootstrap });
  return {
    id,
    expectProjectBootstrap: projectBootstrap,
    status: "pending",
    projectDir,
    globalMode: useRealGlobal ? "real-global" : "temp-global",
    globalHome: global.userHome,
    bootstrapSummary: bootstrapSummary
      ? {
          ok: bootstrapSummary.ok,
          mode: bootstrapSummary.mode,
          resultCount: bootstrapSummary.resultCount,
          activeTargets:
            bootstrapSummary.results?.[0]?.state?.activeTargets ?? null,
        }
      : null,
    hook,
    cache,
  };
}

let summary;
try {
  const results = [
    runCase("global-hook-only", { projectBootstrap: false }),
    runCase("project-bootstrap-plus-global-hook", { projectBootstrap: true }),
  ].map((result) => ({
    ...result,
    status: caseOk(result) ? "pass" : "fail",
  }));
  summary = {
    schemaVersion: "meta-kim-project-cache-generation-v0.1",
    ok: results.every((result) => result.status === "pass"),
    repoRoot,
    globalMode: useRealGlobal ? "real-global" : "temp-global",
    tempRoot: keepTemp ? tempRoot : null,
    generatedAt: new Date().toISOString(),
    results,
  };
} finally {
  if (!keepTemp) {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

console.log(`${JSON.stringify(summary, null, 2)}\n`);
process.exitCode = summary?.ok ? 0 : 1;
