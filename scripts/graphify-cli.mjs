#!/usr/bin/env node

import process from "node:process";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  detectPython310,
  extractPipShowVersion,
  formatPythonLauncher,
  readProcessText,
  runPythonModule,
} from "./graphify-runtime.mjs";

const command = process.argv[2] || "check";

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function ensurePython({ requirePip = false } = {}) {
  const python = detectPython310(spawnSync, process.platform, {
    requirePip,
    bootstrapPip: requirePip,
  });
  if (!python) {
    fail(requirePip ? "Python 3.10+ with pip not found" : "Python 3.10+ not found");
    return null;
  }
  return python;
}

function extractReportCommit(reportRaw) {
  const match = reportRaw.match(/Built from commit:\s*`?([0-9a-f]{7,40})`?/i);
  return match?.[1] ?? null;
}

function commitsMatch(left, right) {
  if (!left || !right) {
    return false;
  }
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a === b || a.startsWith(b) || b.startsWith(a);
}

function readCurrentHead(cwd) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0 || result.error) {
    return null;
  }
  return readProcessText(result).split(/\r?\n/u)[0]?.trim() || null;
}

function checkGraphFreshness(cwd = process.cwd()) {
  const reportPath = path.join(cwd, "graphify-out", "GRAPH_REPORT.md");
  const graphPath = path.join(cwd, "graphify-out", "graph.json");

  if (!existsSync(reportPath) || !existsSync(graphPath)) {
    fail(
      "graphify-out/GRAPH_REPORT.md and graphify-out/graph.json are required; run npm run meta:graphify:rebuild",
    );
    return false;
  }

  let graph;
  try {
    graph = JSON.parse(readFileSync(graphPath, "utf8"));
  } catch (error) {
    fail(`graphify-out/graph.json is not valid JSON: ${error.message}`);
    return false;
  }

  const reportRaw = readFileSync(reportPath, "utf8");
  const builtCommit = graph.built_at_commit ?? extractReportCommit(reportRaw);
  if (!builtCommit) {
    fail(
      "GRAPH_REPORT.md is missing graph freshness commit metadata; run npm run meta:graphify:rebuild",
    );
    return false;
  }

  const currentHead = readCurrentHead(cwd);
  if (!currentHead) {
    fail("Unable to read current git HEAD for graphify freshness check");
    return false;
  }

  if (!commitsMatch(String(builtCommit), currentHead)) {
    fail(
      `GRAPH_REPORT.md is stale: built from ${String(builtCommit).slice(0, 12)}, current HEAD is ${currentHead.slice(0, 12)}. Run npm run meta:graphify:rebuild.`,
    );
    return false;
  }

  console.log(`graphify graph matches HEAD ${currentHead.slice(0, 8)}`);
  return true;
}

function runCheck() {
  const python = ensurePython({ requirePip: true });
  if (!python) {
    return;
  }

  console.log(python.versionText);

  const pipShow = runPythonModule(python, ["-m", "pip", "show", "graphifyy"]);
  if (pipShow.status !== 0) {
    fail("graphify not installed");
    return;
  }

  const version = extractPipShowVersion(readProcessText(pipShow)) ?? "unknown";
  console.log(`graphify ${version}`);
  checkGraphFreshness();
}

function installGraphify({ upgrade = false } = {}) {
  const python = ensurePython({ requirePip: true });
  if (!python) {
    return;
  }

  console.log(`Using ${formatPythonLauncher(python)} (${python.versionText})`);

  const pipArgs = ["-m", "pip", "install"];
  if (upgrade) {
    pipArgs.push("--upgrade");
  }
  pipArgs.push("graphifyy");

  const pipResult = runPythonModule(python, pipArgs, undefined, {
    stdio: "inherit",
  });
  if (pipResult.status !== 0) {
    process.exitCode = pipResult.status || 1;
    return;
  }

  const installResult = runPythonModule(
    python,
    ["-m", "graphify", "claude", "install"],
    undefined,
    { stdio: "inherit" },
  );
  if (installResult.status !== 0) {
    process.exitCode = installResult.status || 1;
    return;
  }

  const hookResult = runPythonModule(
    python,
    ["-m", "graphify", "hook", "install"],
    undefined,
    { stdio: "inherit" },
  );
  if (hookResult.status !== 0) {
    process.exitCode = hookResult.status || 1;
  }
}

function runRebuild() {
  const direct = spawnSync("graphify", ["update", "."], {
    stdio: "inherit",
    shell: false,
  });
  if (!direct.error) {
    process.exitCode = direct.status || 0;
    return;
  }

  const python = ensurePython({ requirePip: true });
  if (!python) {
    return;
  }

  const result = runPythonModule(
    python,
    ["-m", "graphify", "update", "."],
    undefined,
    { stdio: "inherit" },
  );
  process.exitCode = result.status || 0;
}

switch (command) {
  case "check":
    runCheck();
    break;
  case "install":
    installGraphify({ upgrade: false });
    break;
  case "update":
    installGraphify({ upgrade: true });
    break;
  case "rebuild":
    runRebuild();
    break;
  default:
    fail(`Unknown graphify command: ${command}`);
    break;
}
