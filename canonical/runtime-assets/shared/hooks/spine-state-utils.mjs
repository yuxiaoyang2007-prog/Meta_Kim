// spine-state-utils.mjs — atomic write + file lock helpers for spine-state.
//
// Why: spine-state.mjs writeSpineState currently uses a direct write, which can
// race when the host fan-out pattern forks multiple agents that each transition
// the same run. Temp-file + rename + file lock make state transitions atomic
// across concurrent subagents.
//
// Usage:
//   import { atomicWriteJson, withFileLock } from "./spine-state-utils.mjs";
//   await atomicWriteJson(targetPath, payloadObject);
//   await withFileLock(lockPath, async () => { ... });

import { writeFile, rename, mkdir, open, readFile, unlink, stat } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { randomBytes } from "node:crypto";

const LOCK_RETRIES = 25;
const LOCK_BASE_BACKOFF_MS = 12;
const LOCK_MAX_BACKOFF_MS = 200;
const LOCK_STALE_AFTER_MS = 5 * 60 * 1000;

function randomSuffix() {
  return randomBytes(6).toString("hex");
}

async function sleep(ms) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function reclaimStaleLock(lockPath) {
  let content;
  let lockStat;
  try {
    [content, lockStat] = await Promise.all([
      readFile(lockPath, "utf8"),
      stat(lockPath),
    ]);
  } catch {
    return false;
  }
  let ownerPid = null;
  try {
    ownerPid = Number.parseInt(JSON.parse(content)?.pid, 10);
  } catch {
    ownerPid = Number.parseInt(String(content).split(".")[0], 10);
  }
  const oldEnough = Date.now() - lockStat.mtimeMs > LOCK_STALE_AFTER_MS;
  if (!oldEnough && (processIsAlive(ownerPid) || !Number.isInteger(ownerPid))) return false;
  try {
    if ((await readFile(lockPath, "utf8")) !== content) return false;
    await unlink(lockPath);
    return true;
  } catch {
    return false;
  }
}

export async function atomicWriteJson(targetPath, payload) {
  const dir = dirname(targetPath);
  await mkdir(dir, { recursive: true });
  const tmpPath = join(
    dir,
    `.${targetPath.split(sep).pop()}.${process.pid}.${randomSuffix()}.tmp`,
  );
  const body = JSON.stringify(payload, null, 2);
  await writeFile(tmpPath, body, { encoding: "utf8", flag: "wx" });
  try {
    await rename(tmpPath, targetPath);
  } catch (err) {
    try {
      await unlink(tmpPath);
    } catch {
      // best effort
    }
    throw err;
  }
}

export async function withFileLock(lockPath, fn) {
  const dir = dirname(lockPath);
  await mkdir(dir, { recursive: true });
  const owner = `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString(), nonce: randomSuffix() })}\n`;
  let attempt = 0;
  let handle = null;
  while (attempt < LOCK_RETRIES) {
    try {
      handle = await open(lockPath, "wx");
      await handle.writeFile(owner, { encoding: "utf8" });
      break;
    } catch (err) {
      if (err && err.code === "EEXIST") {
        if (await reclaimStaleLock(lockPath)) continue;
        const backoff = Math.min(
          LOCK_MAX_BACKOFF_MS,
          LOCK_BASE_BACKOFF_MS * 2 ** attempt + Math.floor(Math.random() * LOCK_BASE_BACKOFF_MS),
        );
        await sleep(backoff);
        attempt += 1;
        continue;
      }
      throw err;
    }
  }
  if (!handle) {
    throw new Error(`Failed to acquire file lock at ${lockPath} after ${LOCK_RETRIES} attempts.`);
  }
  try {
    return await fn();
  } finally {
    try {
      await handle.close();
    } catch {
      // ignore
    }
    try {
      const current = await readFile(lockPath, "utf8").catch(() => null);
      if (current === owner) await unlink(lockPath);
    } catch {
      // best effort
    }
  }
}
