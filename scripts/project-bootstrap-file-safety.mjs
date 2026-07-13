import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import {
  inspectTrustedPath,
  sha256ManagedFile,
} from "./safe-managed-file-operations.mjs";

function normalizeProjectRelPath(value) {
  return String(value ?? "").replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
}

export function projectFileHash(filePath) {
  return sha256ManagedFile(filePath);
}

export function isPathInsideDir(absPath, absDir) {
  const rel = relative(absDir, absPath);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function safeProjectPathInfo(targetDir, relPath, options = {}) {
  const rel = normalizeProjectRelPath(relPath);
  return rel ? inspectTrustedPath(targetDir, rel, options) : null;
}

export function ensureSafeProjectDirectory(targetDir, absDir) {
  const root = resolve(targetDir);
  const target = resolve(absDir);
  if (!isPathInsideDir(target, root)) return false;
  const segments = relative(root, target).split(/[\\/]+/u).filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    if (!existsSync(current)) mkdirSync(current);
    const info = safeProjectPathInfo(targetDir, relative(root, current));
    if (!info || !lstatSync(current).isDirectory()) return false;
  }
  return true;
}

export function projectPathDigest(targetDir, relPath) {
  const info = safeProjectPathInfo(targetDir, relPath);
  if (!info) return null;
  const visit = (absPath) => {
    const stats = lstatSync(absPath);
    if (stats.isSymbolicLink()) return null;
    if (stats.isFile()) {
      return createHash("sha256").update(readFileSync(absPath)).digest("hex");
    }
    if (!stats.isDirectory()) return null;
    const parts = [];
    for (const entry of readdirSync(absPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) return null;
      const digest = visit(join(absPath, entry.name));
      if (!digest) return null;
      parts.push(`${entry.isDirectory() ? "d" : "f"}:${entry.name}:${digest}`);
    }
    return createHash("sha256").update(parts.join("\n")).digest("hex");
  };
  return visit(info.target);
}

export function projectRemovalProofForManifestEntry(targetDir, relPath, manifestEntry) {
  const safePath = safeProjectPathInfo(targetDir, relPath);
  if (!safePath || !lstatSync(safePath.target).isFile()) return null;
  const actualHash = projectFileHash(safePath.target);
  if (manifestEntry?.contentHash && actualHash === manifestEntry.contentHash) {
    return { source: "manifest_hash", contentHash: actualHash };
  }
  return null;
}

export function projectRemovalUnprovenReasonForManifestEntry(manifestEntry, fallback) {
  if (manifestEntry && !manifestEntry.contentHash) {
    return "legacy_manifest_missing_hash_preserved";
  }
  if (manifestEntry?.contentHash) {
    return "manifest_hash_mismatch_preserved";
  }
  return fallback;
}

function projectAssetCleanupBucket(relPath) {
  const rel = normalizeProjectRelPath(relPath);
  const runtime = rel.startsWith(".claude/")
    ? "Claude Code"
    : rel.startsWith(".codex/") || rel.startsWith(".agents/")
      ? "Codex"
      : rel.startsWith(".cursor/")
        ? "Cursor"
        : rel.startsWith("openclaw/")
          ? "OpenClaw"
          : "Other";
  const type = rel.includes("/agents/") || rel.startsWith("openclaw/workspaces/")
    ? "agents"
    : rel.includes("/skills/")
      ? "skills"
      : rel.includes("/commands/")
        ? "Commands"
        : rel.includes("/hooks/")
          ? "hooks"
          : rel.includes("/rules/")
            ? "rules"
            : rel.includes("/capability-index/")
              ? "capability-index"
              : "assets";
  return `${runtime} ${type}`;
}

export function summarizeProjectAssetCleanup(removed) {
  const counts = new Map();
  for (const relPath of removed) {
    const bucket = projectAssetCleanupBucket(relPath);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([bucket, count]) => `${bucket}: ${count}`);
}

export function mergeProjectCleanupResults(...cleanups) {
  return {
    removed: cleanups.flatMap((cleanup) => cleanup?.removed ?? []),
    skipped: cleanups.flatMap((cleanup) => cleanup?.skipped ?? []),
    backups: cleanups.flatMap((cleanup) => cleanup?.backups ?? []),
  };
}

const PROJECT_CLEANUP_RETRYABLE_REASONS = new Map([
  ["backup_failed_preserved", "partial"],
  ["backup_or_atomic_write_failed_preserved", "partial"],
  ["manifest_hash_mismatch_preserved", "partial"],
  ["legacy_manifest_missing_hash_preserved", "partial"],
  ["outside_target_dir", "blocked"],
  ["unsafe_realpath_or_link_preserved", "blocked"],
  ["unsafe_realpath_changed_preserved", "blocked"],
  ["not_a_file", "blocked"],
]);

export function projectCleanupRetryableIssues(cleanup) {
  return (cleanup?.skipped ?? [])
    .filter((item) => PROJECT_CLEANUP_RETRYABLE_REASONS.has(item?.reason))
    .map((item) => ({
      ...item,
      status: PROJECT_CLEANUP_RETRYABLE_REASONS.get(item.reason),
    }));
}

export function projectCleanupStatus(cleanup) {
  const issues = projectCleanupRetryableIssues(cleanup);
  if (issues.some((item) => item.status === "blocked")) return "blocked";
  if (issues.length > 0) return "partial";
  return "ok";
}
