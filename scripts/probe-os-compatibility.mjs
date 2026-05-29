#!/usr/bin/env node
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { commandProbe, detectHostOs, exists, readJson, repoPath, stateDir, writeJson } from "./governance-lib.mjs";

const args = new Set(process.argv.slice(2));
const probePath = path.join(stateDir, "os-compatibility-probe.json");

async function canWrite(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
    const testFile = path.join(dir, `.write-test-${process.pid}`);
    await fs.writeFile(testFile, "ok");
    await fs.unlink(testFile);
    return true;
  } catch {
    return false;
  }
}

async function buildProbe() {
  const host = detectHostOs();
  const commands = Object.fromEntries(
    ["node", "npm", "pnpm", "bun", "git", "python", "python3", "py", "claude", "codex", "openclaw", "cursor", "wsl"].map((cmd) => [
      cmd,
      commandProbe(cmd),
    ]),
  );
  const projectConfigWritable = await canWrite(path.join(stateDir, "probe-write"));
  const globalConfigWritable = await canWrite(path.join(os.homedir(), ".meta-kim-probe"));
  const hookPaths = [".claude/hooks", ".codex/hooks", ".cursor/hooks", "openclaw/hooks"];
  const hookPathExecutable = {};
  for (const rel of hookPaths) {
    hookPathExecutable[rel] = await exists(repoPath(rel));
  }
  return {
    generatedAt: new Date().toISOString(),
    host,
    nodeVersion: process.version,
    commands,
    pathWritability: {
      projectState: projectConfigWritable,
      globalProbe: globalConfigWritable,
    },
    configWritability: {
      project: projectConfigWritable,
      global: globalConfigWritable,
    },
    runtimeCommandAvailability: {
      claude: commands.claude.available,
      codex: commands.codex.available,
      openclaw: commands.openclaw.available,
      cursor: commands.cursor.available,
    },
    hookPathExecutable,
  };
}

async function check(probe) {
  const matrix = await readJson("config/os-compatibility-matrix.json");
  const ids = new Set(matrix.operatingSystems?.map((entry) => entry.id));
  for (const required of ["macos", "windows", "linux", "wsl2"]) {
    if (!ids.has(required)) {
      throw new Error(`os-compatibility-matrix missing ${required}`);
    }
  }
  const current = probe.host.normalized;
  if (["macos", "windows", "linux", "wsl2"].includes(current) && !ids.has(current)) {
    throw new Error(`current OS ${current} is not covered by matrix`);
  }
  if (!probe.commands.node.available || !probe.commands.git.available) {
    throw new Error("node and git must be available for Meta_Kim governance checks");
  }
}

const probe = await buildProbe();
await writeJson(probePath, probe);
if (args.has("--check")) {
  await check(probe);
}
if (args.has("--json")) {
  console.log(JSON.stringify(probe, null, 2));
} else {
  console.log(`OS compatibility probe written to ${probePath}`);
}
