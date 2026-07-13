import { existsSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

export const PROJECT_ROOT_PAYLOAD_FIELDS = Object.freeze([
  "cwd",
  "workspaceRoot",
  "workspace_root",
  "workspaceDir",
  "workspace_dir",
  "projectRoot",
  "project_root",
  "projectDir",
  "project_dir",
]);

function existingDirectory(candidate) {
  if (typeof candidate !== "string" || !candidate.trim()) return null;
  try {
    const resolved = resolve(candidate.trim());
    return existsSync(resolved) && statSync(resolved).isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

export function findMarkedProjectRoot(candidate) {
  let dir = existingDirectory(candidate);
  if (!dir) return null;
  for (let depth = 0; depth < 40; depth += 1) {
    if (
      existsSync(join(dir, ".git")) ||
      existsSync(join(dir, ".meta-kim", "state", "default", "project-bootstrap.json"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function projectRootCandidatesFromPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  return PROJECT_ROOT_PAYLOAD_FIELDS.map((field) => payload[field]).filter(
    (value) => typeof value === "string" && value.trim(),
  );
}

// Explicit declarations come from a trusted launcher (CLI/env) and therefore
// only need to name an existing directory. Runtime payload candidates are less
// trusted: they must resolve to a marked project or an ancestor of one. A bare
// cwd is never accepted without the same marker proof. A valid cwd project
// also wins over payload fallback so an event cannot redirect writes from one
// active repository to another merely by naming a different marked path.
export function resolveProjectRoot({
  cwd = process.cwd(),
  explicitDeclarations = [],
  runtimeCandidates = [],
} = {}) {
  for (const candidate of explicitDeclarations) {
    const declared = existingDirectory(candidate);
    if (declared) return declared;
  }
  const cwdProject = findMarkedProjectRoot(cwd);
  if (cwdProject) return cwdProject;
  for (const candidate of runtimeCandidates) {
    if (!isAbsolute(candidate)) continue;
    const marked = findMarkedProjectRoot(candidate);
    if (marked) return marked;
  }
  return null;
}
