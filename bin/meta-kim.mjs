#!/usr/bin/env node
/** Stable CLI for npx / npm i -g. All paths resolve from the package root. */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSetupCliArgs } from "../scripts/setup-cli-policy.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const rawArgs = process.argv.slice(2);
while (["meta-kim", "--"].includes(rawArgs[0])) rawArgs.shift();

const HELP = `Meta_Kim ${packageJson.version}

Usage:
  meta-kim [install] [options]
  meta-kim update [options]
  meta-kim check [options]
  meta-kim status [--json|--diff|--scope=global|project|both]
  meta-kim doctor
  meta-kim uninstall [--yes] [--deep] [--scope=global|project|both]
  meta-kim project bootstrap [--project-dir <dir>] [--dry-run|--apply] [--json]

Global hooks are opt-in. Pass --with-global-hooks only when Meta_Kim may update
Claude Code, Codex, or Cursor user-level hook wiring.

Options:
  -h, --help       Show this help without changing files
  -v, --version    Show the installed package version
`;

const commands = new Set(["install", "update", "check", "status", "doctor", "uninstall", "project"]);

function fail(message) {
  console.error(`meta-kim: ${message}`);
  console.error("Run 'meta-kim --help' for usage.");
  process.exit(2);
}

function validateSetupOptions(args) {
  try {
    validateSetupCliArgs(args);
  } catch (error) {
    fail(error.message);
  }
}

function validateScopeOptions(args) {
  for (const arg of args) {
    if (!arg.startsWith("--scope=")) continue;
    const scope = arg.slice("--scope=".length);
    if (!["global", "project", "both"].includes(scope)) {
      fail(`invalid scope '${scope}'; expected global, project, or both`);
    }
  }
}

function run(relativeScript, args = []) {
  const result = spawnSync(process.execPath, [join(root, relativeScript), ...args], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  process.exit(result.status === null ? 1 : result.status);
}

if (rawArgs.length === 1 && ["-h", "--help", "help"].includes(rawArgs[0])) {
  console.log(HELP);
  process.exit(0);
}
if (rawArgs.length === 1 && ["-v", "--version", "version"].includes(rawArgs[0])) {
  console.log(packageJson.version);
  process.exit(0);
}

const first = rawArgs[0];
const command = commands.has(first) ? first : "install";
const commandArgs = command === "install" && first !== "install" ? rawArgs : rawArgs.slice(1);

switch (command) {
  case "install":
    validateSetupOptions(commandArgs);
    run("setup.mjs", commandArgs);
    break;
  case "update":
    validateSetupOptions(commandArgs);
    run("setup.mjs", ["--update", ...commandArgs]);
    break;
  case "check":
    validateSetupOptions(commandArgs);
    run("setup.mjs", ["--check", ...commandArgs]);
    break;
  case "status":
    if (commandArgs.some((arg) => !["--json", "--diff"].includes(arg) && !arg.startsWith("--scope="))) {
      fail(`unknown status option '${commandArgs.find((arg) => !["--json", "--diff"].includes(arg) && !arg.startsWith("--scope="))}'`);
    }
    validateScopeOptions(commandArgs);
    run("scripts/footprint.mjs", commandArgs);
    break;
  case "doctor":
    if (commandArgs.length > 0) fail(`unknown doctor option '${commandArgs[0]}'`);
    run("scripts/doctor-interactive.mjs");
    break;
  case "uninstall":
    if (commandArgs.some((arg) => !["--yes", "--deep"].includes(arg) && !arg.startsWith("--scope="))) {
      fail(`unknown uninstall option '${commandArgs.find((arg) => !["--yes", "--deep"].includes(arg) && !arg.startsWith("--scope="))}'`);
    }
    validateScopeOptions(commandArgs);
    run("scripts/uninstall.mjs", commandArgs);
    break;
  case "project":
    if (commandArgs[0] !== "bootstrap") fail("the only project subcommand is 'bootstrap'");
    validateSetupOptions(commandArgs.slice(1));
    run("setup.mjs", ["--project-bootstrap", ...commandArgs.slice(1)]);
    break;
}
