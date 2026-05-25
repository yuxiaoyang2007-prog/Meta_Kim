#!/usr/bin/env node

import process from "node:process";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  detectPython310,
  discoverWindowsPythonPaths,
  discoverWindowsPythonPathCommands,
  extractPipShowVersion,
  formatPythonLauncher,
  parsePythonVersion,
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

function probePython(candidate) {
  let result;
  try {
    result = spawnSync(candidate.command, [...candidate.args, "--version"], {
      encoding: "utf8",
      shell: false,
    });
  } catch {
    return null;
  }
  if (result?.error || result?.status !== 0) {
    return null;
  }
  const versionText = readProcessText(result);
  const parsed = parsePythonVersion(versionText);
  if (!parsed) {
    return null;
  }
  if (parsed.major < 3 || (parsed.major === 3 && parsed.minor < 10)) {
    return null;
  }
  return { ...candidate, version: parsed, versionText };
}

function pythonKey(python) {
  return `${python.command}::${python.args.join(" ")}`;
}

function* iterateGraphifyPythonCandidates(primary) {
  const seen = new Set();
  const yieldIfNew = function* (python) {
    if (!python) return;
    const key = pythonKey(python);
    if (seen.has(key)) return;
    seen.add(key);
    yield python;
  };

  const envOverride = process.env.META_KIM_GRAPHIFY_PYTHON;
  if (envOverride && envOverride.trim()) {
    const parts = envOverride.trim().split(/\s+/u);
    const probed = probePython({ command: parts[0], args: parts.slice(1) });
    yield* yieldIfNew(probed);
  }

  yield* yieldIfNew(primary);

  if (process.platform === "win32") {
    for (const candidate of discoverWindowsPythonPathCommands(spawnSync)) {
      const probed = probePython(candidate);
      yield* yieldIfNew(probed);
    }
    for (const { major, minor, path: exePath } of discoverWindowsPythonPaths()) {
      if (major < 3 || (major === 3 && minor < 10)) continue;
      const probed = probePython({ command: exePath, args: [] });
      yield* yieldIfNew(probed);
    }
  }
}

function locateGraphifyInstallation(primaryPython) {
  for (const python of iterateGraphifyPythonCandidates(primaryPython)) {
    const pipShow = runPythonModule(python, ["-m", "pip", "show", "graphifyy"]);
    if (pipShow.status === 0) {
      return {
        python,
        pipShowText: readProcessText(pipShow),
      };
    }
  }
  return null;
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

function stampGraphFreshness(cwd = process.cwd()) {
  const currentHead = readCurrentHead(cwd);
  if (!currentHead) {
    return false;
  }

  const reportPath = path.join(cwd, "graphify-out", "GRAPH_REPORT.md");
  const graphPath = path.join(cwd, "graphify-out", "graph.json");
  let changed = false;

  if (existsSync(graphPath)) {
    const graph = JSON.parse(readFileSync(graphPath, "utf8"));
    if (!commitsMatch(String(graph.built_at_commit ?? ""), currentHead)) {
      graph.built_at_commit = currentHead;
      writeFileSync(graphPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
      changed = true;
    }
  }

  if (existsSync(reportPath)) {
    const reportRaw = readFileSync(reportPath, "utf8");
    const nextReport = reportRaw.replace(
      /Built from commit:\s*`?([0-9a-f]{7,40})`?/i,
      `Built from commit: \`${currentHead}\``,
    );
    if (nextReport !== reportRaw) {
      writeFileSync(reportPath, nextReport, "utf8");
      changed = true;
    }
  }

  if (changed) {
    console.log(`graphify freshness stamped to HEAD ${currentHead.slice(0, 8)}`);
  }
  return true;
}

function runCheck() {
  const python = ensurePython({ requirePip: true });
  if (!python) {
    return;
  }

  console.log(python.versionText);

  const located = locateGraphifyInstallation(python);
  if (!located) {
    fail("graphify not installed");
    return;
  }

  if (pythonKey(located.python) !== pythonKey(python)) {
    console.log(
      `graphifyy located via ${formatPythonLauncher(located.python)} (${located.python.versionText})`,
    );
  }

  const version = extractPipShowVersion(located.pipShowText) ?? "unknown";
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
    if ((direct.status || 0) === 0) {
      stampGraphFreshness();
    }
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
  if ((result.status || 0) === 0) {
    stampGraphFreshness();
  }
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
