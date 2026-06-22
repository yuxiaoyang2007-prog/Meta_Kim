#!/usr/bin/env node
import { spawnSync as nativeSpawnSync } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { run } from "node:test";
import { spec } from "node:test/reporters";
import { Worker } from "node:worker_threads";

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();

function expandPattern(pattern) {
  const normalized = String(pattern)
    .replace(/^["']|["']$/g, "")
    .replace(/\\/g, "/");
  const starIndex = normalized.indexOf("*");
  if (starIndex === -1) {
    return [normalized];
  }

  const slashIndex = normalized.lastIndexOf("/", starIndex);
  const dir = slashIndex === -1 ? "." : normalized.slice(0, slashIndex);
  const filePattern = normalized.slice(slashIndex + 1);
  const escapedPattern = filePattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  const regex = new RegExp("^" + escapedPattern + "$");

  return readdirSync(dir)
    .filter((entry) => regex.test(entry))
    .sort()
    .map((entry) => dir + "/" + entry);
}

const patterns = process.argv.slice(2);
const files = patterns.flatMap(expandPattern);

if (files.length === 0) {
  console.error("No test files matched.");
  process.exit(1);
}

function isNodeCommand(command) {
  const commandText = String(command ?? "").toLowerCase();
  const base = path.basename(commandText);
  return commandText === process.execPath.toLowerCase() || base === "node" || base === "node.exe";
}

function localScriptRequest(command, args = [], options = {}) {
  if (!isNodeCommand(command) || !Array.isArray(args) || args.includes("--test")) return null;
  const cwd = path.resolve(options.cwd ?? repoRoot);
  const scriptIndex = args.findIndex((arg) => {
    if (typeof arg !== "string" || !/\.(mjs|js|cjs)$/i.test(arg)) return false;
    const resolved = path.resolve(cwd, arg);
    return resolved.startsWith(repoRoot) && existsSync(resolved);
  });
  if (scriptIndex === -1) return null;
  const scriptPath = path.resolve(cwd, args[scriptIndex]);
  return {
    cwd,
    scriptPath,
    scriptArgs: args.slice(scriptIndex + 1),
  };
}

function outputValue(text, options = {}) {
  if (options.encoding && options.encoding !== "buffer") return text;
  return Buffer.from(text, "utf8");
}

function runLocalNodeScriptInWorker(request, options = {}, spawnError) {
  const tempDir = mkdtempSync(path.join(tmpdir(), "meta-kim-spawn-fallback-"));
  const outputPath = path.join(tempDir, "result.json");
  const sab = new SharedArrayBuffer(4);
  const signal = new Int32Array(sab);
  const workerSource = String.raw`
const { writeFileSync } = require("node:fs");
const { pathToFileURL } = require("node:url");
const { workerData } = require("node:worker_threads");

function captureWrite(chunks) {
  return (chunk, encoding, callback) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
    if (typeof encoding === "function") encoding();
    if (typeof callback === "function") callback();
    return true;
  };
}

(async () => {
  const stdout = [];
  const stderr = [];
  let status = 0;
  const originalArgv = process.argv;
  const originalExit = process.exit;
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const previousExitCode = process.exitCode;
  const envKeys = Object.keys(workerData.env ?? {});
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  try {
    for (const key of envKeys) process.env[key] = workerData.env[key];
    process.argv = [process.execPath, workerData.scriptPath, ...workerData.scriptArgs];
    process.stdout.write = captureWrite(stdout);
    process.stderr.write = captureWrite(stderr);
    process.exitCode = undefined;
    process.exit = (code = 0) => {
      const error = new Error("process.exit(" + code + ")");
      error.metaKimProcessExit = true;
      error.exitCode = Number(code) || 0;
      throw error;
    };
    await import(pathToFileURL(workerData.scriptPath).href);
    const settleStartedAt = Date.now();
    let stableTicks = 0;
    while (Date.now() - settleStartedAt < workerData.settleTimeout) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      const activeRequests = typeof process._getActiveRequests === "function"
        ? process._getActiveRequests().length
        : 0;
      if (activeRequests === 0) {
        stableTicks += 1;
        if (stableTicks >= 4) break;
      } else {
        stableTicks = 0;
      }
    }
    status = typeof process.exitCode === "number" ? process.exitCode : 0;
  } catch (error) {
    if (error?.metaKimProcessExit) {
      status = error.exitCode;
    } else {
      status = 1;
      stderr.push((error && (error.stack || error.message)) || String(error));
    }
  } finally {
    process.argv = originalArgv;
    process.exit = originalExit;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    process.exitCode = previousExitCode;
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
    writeFileSync(
      workerData.outputPath,
      JSON.stringify({ status, stdout: stdout.join(""), stderr: stderr.join("") }),
      "utf8",
    );
    Atomics.store(new Int32Array(workerData.sab), 0, 1);
    Atomics.notify(new Int32Array(workerData.sab), 0);
  }
})().catch((error) => {
  writeFileSync(
    workerData.outputPath,
    JSON.stringify({ status: 1, stdout: "", stderr: (error && (error.stack || error.message)) || String(error) }),
    "utf8",
  );
  Atomics.store(new Int32Array(workerData.sab), 0, 1);
  Atomics.notify(new Int32Array(workerData.sab), 0);
});`;
  const timeout = typeof options.timeout === "number" ? options.timeout : 60_000;
  const worker = new Worker(workerSource, {
    eval: true,
    workerData: {
      cwd: request.cwd,
      env: options.env ?? process.env,
      outputPath,
      sab,
      scriptArgs: request.scriptArgs,
      scriptPath: request.scriptPath,
      spawnErrorMessage: spawnError?.message ?? null,
      settleTimeout: Math.min(timeout, 10_000),
    },
  });
  const waitResult = Atomics.wait(signal, 0, 0, timeout);
  if (waitResult === "timed-out") {
    worker.terminate();
    rmSync(tempDir, { recursive: true, force: true });
    const error = new Error("worker fallback timed out after " + timeout + "ms");
    error.code = "ETIMEDOUT";
    return {
      error,
      output: [null, outputValue("", options), outputValue(error.message, options)],
      pid: 0,
      signal: "SIGTERM",
      status: null,
      stderr: outputValue(error.message, options),
      stdout: outputValue("", options),
    };
  }
  worker.unref();
  const payload = JSON.parse(readFileSync(outputPath, "utf8"));
  rmSync(tempDir, { recursive: true, force: true });
  const stdout = outputValue(payload.stdout ?? "", options);
  const stderr = outputValue(payload.stderr ?? "", options);
  return {
    output: [null, stdout, stderr],
    pid: 0,
    signal: null,
    status: payload.status ?? 0,
    stderr,
    stdout,
  };
}

function installLocalNodeSpawnFallback() {
  const childProcess = require("node:child_process");
  if (childProcess.spawnSync.__metaKimWorkerFallback) return;
  const original = childProcess.spawnSync;
  const patched = (command, args = [], options = {}) => {
    const result = original(command, args, options);
    const request = result?.error ? localScriptRequest(command, args, options) : null;
    if (!request) return result;
    return runLocalNodeScriptInWorker(request, options, result.error);
  };
  patched.__metaKimWorkerFallback = true;
  patched.__metaKimOriginal = original;
  childProcess.spawnSync = patched;
  syncBuiltinESMExports();
}

async function runInProcessWhenSpawnUnavailable(spawnError) {
  console.error(
    "node --test child process unavailable (" +
      spawnError.message +
      "); using in-process node:test fallback with local-script worker spawnSync.",
  );
  installLocalNodeSpawnFallback();
  const stream = run({ files, concurrency: 1, isolation: "none" });
  let failed = 0;
  stream.on("test:fail", () => {
    failed += 1;
  });
  const reporter = stream.compose(spec);
  reporter.pipe(process.stdout);
  await once(reporter, "end");
  if (failed > 0) {
    console.error("node:test in-process fallback failed " + failed + " test event(s).");
  }
  return failed === 0 ? 0 : 1;
}

const result = nativeSpawnSync(process.execPath, ["--test", "--test-concurrency=1", ...files], {
  encoding: "utf8",
  maxBuffer: 1024 * 1024 * 64,
  stdio: ["ignore", "pipe", "pipe"],
});

if (result.error) {
  process.exitCode = await runInProcessWhenSpawnUnavailable(result.error);
} else {
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    console.error(
      "node --test exited " + (result.status ?? "unknown") + " for " + files.length + " file(s).",
    );
  }
  process.exitCode = result.status ?? 1;
}
