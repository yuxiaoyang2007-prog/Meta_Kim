// spine-state-utils.mjs — atomic write + file lock helpers for spine-state.
//
// Why: spine-state.mjs writeSpineState currently uses a direct write, which can
// race when the host fan-out pattern forks multiple agents that each transition
// the same run. team-core in oh-my-openagent uses temp-file + rename + file
// lock to make state transitions atomic across concurrent subagents.
//
// Usage:
//   import { atomicWriteJson, withFileLock } from "./spine-state-utils.mjs";
//   await atomicWriteJson(targetPath, payloadObject);
//   await withFileLock(lockPath, async () => { ... });

import { writeFile, rename, mkdir, open, readFile, unlink } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { randomBytes } from "node:crypto";

const LOCK_RETRIES = 25;
const LOCK_BASE_BACKOFF_MS = 12;
const LOCK_MAX_BACKOFF_MS = 200;

function randomSuffix() {
  return randomBytes(6).toString("hex");
}

async function sleep(ms) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
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
  const owner = `${process.pid}.${randomSuffix()}`;
  let attempt = 0;
  let handle = null;
  while (attempt < LOCK_RETRIES) {
    try {
      handle = await open(lockPath, "wx");
      await handle.writeFile(owner, { encoding: "utf8" });
      break;
    } catch (err) {
      if (err && err.code === "EEXIST") {
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