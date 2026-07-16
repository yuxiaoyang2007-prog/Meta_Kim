import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  loadRuntimeProfiles,
  loadSyncManifest,
  resolveGlobalAgentProjectionTargets,
} from "../../scripts/meta-kim-sync-config.mjs";

const REPO_ROOT = path.join(import.meta.dirname, "..", "..");
const GENERATOR_PATH = path.join(
  REPO_ROOT,
  "scripts",
  "generate-global-agent-migration-catalog.mjs",
);
const CATALOG_PATH = path.join(
  REPO_ROOT,
  "config",
  "migrations",
  "global-agent-projection-fingerprints.json",
);

function git(args) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

test("migration catalog includes tracked legacy Agent projection blobs from profile paths", async (t) => {
  const manifest = await loadSyncManifest();
  const profiles = await loadRuntimeProfiles(manifest);
  const targets = resolveGlobalAgentProjectionTargets(
    profiles,
    manifest.supportedTargets,
    { requireMigrationSupport: true },
  );
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  let checked = 0;

  for (const target of targets) {
    const agentsDir = profiles[target.targetId].projection.outputPaths.agentsDir;
    const firstProjectionCommit = git([
      "log",
      "--reverse",
      "--diff-filter=A",
      "--format=%H",
      "--",
      agentsDir,
    ]).split(/\r?\n/u).find(Boolean);
    if (!firstProjectionCommit) continue;
    const historicalPath = git([
      "ls-tree",
      "-r",
      "--name-only",
      firstProjectionCommit,
      "--",
      agentsDir,
    ]).split(/\r?\n/u).find((filePath) => {
      const normalized = filePath.replaceAll("\\", "/");
      const normalizedRoot = agentsDir.replaceAll("\\", "/").replace(/\/+$/u, "");
      const relative = normalized.startsWith(`${normalizedRoot}/`)
        ? normalized.slice(normalizedRoot.length + 1)
        : "";
      return relative && !relative.includes("/") && relative.endsWith(target.fileExtension);
    });
    if (!historicalPath) continue;

    const agentId = path.posix.basename(
      historicalPath.replaceAll("\\", "/"),
      target.fileExtension,
    );
    const historicalContent = git([
      "show",
      `${firstProjectionCommit}:${historicalPath.replaceAll("\\", "/")}`,
    ]);
    const entry = catalog.projections.find((projection) =>
      projection.targetId === target.targetId && projection.agentId === agentId
    );
    assert.ok(entry, `${target.targetId}:${agentId} must have a migration entry`);
    assert.ok(
      entry.fingerprints.includes(sha256(historicalContent)),
      `${target.targetId}:${agentId} must include its real tracked legacy projection bytes`,
    );
    checked += 1;
  }

  if (checked === 0) {
    t.skip("Git history does not contain legacy runtime Agent projections in this checkout");
  }
});

test("migration catalog check uses bounded batch Git reads and completes inside its release stage budget", () => {
  const generatorSource = readFileSync(GENERATOR_PATH, "utf8");
  assert.match(generatorSource, /"--raw"/u);
  assert.match(generatorSource, /\["cat-file", "--batch"\]/u);
  assert.doesNotMatch(generatorSource, /\["show",/u);

  const policy = JSON.parse(readFileSync(
    path.join(REPO_ROOT, "config", "contracts", "release-verification-policy.json"),
    "utf8",
  ));
  const timeout = policy.stageTimeoutsMs?.["meta:agents:migration-catalog:check"];
  assert.ok(Number.isSafeInteger(timeout) && timeout > 0);
  const result = spawnSync(process.execPath, [GENERATOR_PATH, "--check"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout,
  });
  assert.equal(result.error?.code, undefined, result.error?.message);
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
});
