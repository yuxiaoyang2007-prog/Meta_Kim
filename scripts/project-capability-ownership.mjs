import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { inspectTrustedPath } from "./safe-managed-file-operations.mjs";

function normalizeRelPath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//u, "");
}

function pathKey(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function requireStringArray(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`Invalid project capability ownership policy: ${label}`);
  }
  return new Set(value.map((item) => item.trim()));
}

export function loadProjectCapabilityOwnershipPolicy(configRoot) {
  const configPath = path.join(path.resolve(configRoot), "config", "sync.json");
  const syncConfig = JSON.parse(readFileSync(configPath, "utf8"));
  const policy = syncConfig?.projectMaterializationPolicy?.projectCapabilityOwnership;
  if (!policy || typeof policy !== "object") {
    throw new Error("Missing config/sync.json projectMaterializationPolicy.projectCapabilityOwnership");
  }
  const manifestPath = normalizeRelPath(policy.manifestPath);
  const schemaVersion = String(policy.schemaVersion ?? "").trim();
  if (!manifestPath || path.posix.isAbsolute(manifestPath) || path.win32.isAbsolute(manifestPath) || manifestPath.startsWith("../")) {
    throw new Error("Invalid project capability ownership manifestPath");
  }
  if (!schemaVersion) throw new Error("Invalid project capability ownership schemaVersion");
  return {
    manifestPath,
    schemaVersion,
    protectedCapabilityTypes: requireStringArray(
      policy.protectedCapabilityTypes,
      "protectedCapabilityTypes",
    ),
    preserveOwnershipClasses: requireStringArray(
      policy.preserveOwnershipClasses,
      "preserveOwnershipClasses",
    ),
    preserveDependencyUpdatePolicies: requireStringArray(
      policy.preserveDependencyUpdatePolicies,
      "preserveDependencyUpdatePolicies",
    ),
  };
}

export function collectProtectedProjectCapabilityPaths(manifest, projectRoot, policy) {
  if (manifest?.schemaVersion !== policy.schemaVersion) {
    throw new Error("Invalid project capability ownership manifest schema");
  }
  if (!Array.isArray(manifest.capabilities)) {
    throw new Error("Invalid project capability ownership manifest capabilities");
  }
  const root = path.resolve(projectRoot);
  const absolutePaths = new Set();
  const relativePaths = new Set();
  const absoluteRoots = new Set();
  const relativeRoots = new Set();
  for (const capability of manifest.capabilities) {
    const capabilityType = String(capability?.type ?? "");
    if (!policy.protectedCapabilityTypes.has(capabilityType)) {
      throw new Error(`Invalid project capability ownership type: ${capabilityType || "<empty>"}`);
    }
    const protectedByOwnership = policy.preserveOwnershipClasses.has(
      String(capability?.ownershipClass ?? ""),
    );
    const protectedByUpdatePolicy = policy.preserveDependencyUpdatePolicies.has(
      String(capability?.dependencyUpdatePolicy ?? ""),
    );
    if (!Array.isArray(capability.files)) {
      throw new Error("Invalid project capability ownership file list");
    }
    for (const file of capability.files) {
      const relPath = normalizeRelPath(file?.relPath);
      const absolutePath = path.resolve(root, relPath);
      const relativePath = normalizeRelPath(path.relative(root, absolutePath));
      if (
        !relPath ||
        path.posix.isAbsolute(relPath) ||
        path.win32.isAbsolute(relPath) ||
        relativePath === "" ||
        relativePath === ".." ||
        relativePath.startsWith("../")
      ) {
        throw new Error(`Invalid protected project capability path: ${relPath || "<empty>"}`);
      }
      if (!protectedByOwnership && !protectedByUpdatePolicy) continue;
      absolutePaths.add(pathKey(absolutePath));
      relativePaths.add(relativePath);
      if (capabilityType === "skill") {
        const marker = "/SKILL.md";
        const markerIndex = relativePath.indexOf(marker);
        const skillRoot = markerIndex >= 0
          ? relativePath.slice(0, markerIndex)
          : normalizeRelPath(path.dirname(relativePath));
        if (skillRoot) {
          relativeRoots.add(skillRoot);
          absoluteRoots.add(pathKey(path.resolve(root, skillRoot)));
        }
      }
    }
  }
  return { absolutePaths, relativePaths, absoluteRoots, relativeRoots };
}

export function readProjectCapabilityOwnershipManifest(projectRoot, policy) {
  const root = path.resolve(projectRoot);
  if (!existsSync(root)) return null;
  const info = inspectTrustedPath(root, policy.manifestPath, { allowMissing: true });
  if (!info) {
    throw new Error("Unsafe project capability ownership manifest path");
  }
  if (!existsSync(info.target)) return null;
  const manifest = JSON.parse(readFileSync(info.target, "utf8"));
  // Validate the complete manifest before any caller is allowed to trust one
  // entry. A malformed unrelated row must not weaken cleanup protection.
  collectProtectedProjectCapabilityPaths(manifest, root, policy);
  return manifest;
}

export function loadProtectedProjectCapabilityPaths(projectRoot, configRoot) {
  const policy = loadProjectCapabilityOwnershipPolicy(configRoot);
  const manifest = readProjectCapabilityOwnershipManifest(projectRoot, policy);
  if (!manifest) {
    return { absolutePaths: new Set(), relativePaths: new Set(), absoluteRoots: new Set(), relativeRoots: new Set(), policy };
  }
  return {
    ...collectProtectedProjectCapabilityPaths(manifest, projectRoot, policy),
    policy,
  };
}

export function isProtectedProjectCapabilityPath(filePath, protectedPaths) {
  const key = pathKey(filePath);
  if (protectedPaths?.absolutePaths?.has(key) === true) return true;
  for (const root of protectedPaths?.absoluteRoots ?? []) {
    const rel = path.relative(root, path.resolve(filePath));
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) return true;
  }
  return false;
}

export function protectedProjectCapabilityIntersects(relPath, protectedPaths) {
  const rel = normalizeRelPath(relPath);
  if (!rel) return false;
  for (const protectedRel of protectedPaths?.relativePaths ?? []) {
    if (protectedRel === rel || protectedRel.startsWith(`${rel}/`)) return true;
  }
  for (const protectedRoot of protectedPaths?.relativeRoots ?? []) {
    if (protectedRoot === rel || protectedRoot.startsWith(`${rel}/`) || rel.startsWith(`${protectedRoot}/`)) return true;
  }
  return false;
}
