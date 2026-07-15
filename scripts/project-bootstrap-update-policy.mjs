const SHA256_RE = /^[a-f0-9]{64}$/iu;

export function trustedInstalledHash(manifestEntry) {
  const value = String(manifestEntry?.contentHash ?? "").toLowerCase();
  return SHA256_RE.test(value) ? value : null;
}

/**
 * Classify one generated project projection using the three relevant hashes:
 * current disk content, the last installed content, and the new package source.
 */
export function classifyProjectProjectionUpdate({
  exists,
  currentHash,
  sourceHash,
  previousManifestEntry,
  protectedProjectCapability = false,
  mergeOwnedConfig = false,
  managedProjectionUpdate = "preserve_hash_drift",
}) {
  if (protectedProjectCapability) {
    return { action: "unchanged", ownership: "project_capability", reason: "runtime_sedimented_project_copy" };
  }
  if (!exists) {
    return { action: "create", ownership: "new_file", reason: "missing" };
  }
  if (currentHash && sourceHash && currentHash === sourceHash) {
    return { action: "unchanged", ownership: previousManifestEntry ? "manifest_managed" : "identical_existing", reason: "already_current" };
  }
  if (mergeOwnedConfig) {
    return { action: "merge", ownership: "shared_config_merge", reason: "preserve_user_configuration" };
  }
  const oldInstalledHash = trustedInstalledHash(previousManifestEntry);
  if (oldInstalledHash && currentHash === oldInstalledHash) {
    return { action: "replace", ownership: "manifest_managed", reason: "unchanged_since_last_install", oldInstalledHash };
  }
  if (oldInstalledHash) {
    if (managedProjectionUpdate === "replace_with_transaction_backup") {
      return {
        action: "replace",
        ownership: "manifest_managed",
        reason: "managed_projection_merge_delta_refresh",
        oldInstalledHash,
        localDriftBackedUp: true,
      };
    }
    return { action: "conflict", ownership: "user_modified_managed", reason: "hash_drift_preserved", oldInstalledHash };
  }
  return { action: "conflict", ownership: "unknown_existing", reason: "no_trusted_install_hash_preserved" };
}

export function validateBootstrapManifest(manifest, schemaVersion = "meta-kim-project-bootstrap-v0.1") {
  if (!manifest || typeof manifest !== "object" || manifest.schemaVersion !== schemaVersion) return null;
  if (manifest.managedFiles !== undefined && !Array.isArray(manifest.managedFiles)) return null;
  const managedFiles = [];
  const seen = new Set();
  for (const entry of manifest.managedFiles ?? []) {
    const relPath = String(entry?.relPath ?? "").replace(/\\/gu, "/").replace(/^\.\//u, "");
    const contentHash = trustedInstalledHash(entry);
    if (!relPath || relPath.startsWith("/") || relPath.split("/").some((part) => !part || part === "." || part === "..") || !contentHash || seen.has(relPath)) {
      return null;
    }
    seen.add(relPath);
    managedFiles.push({ ...entry, relPath, contentHash });
  }
  return { ...manifest, managedFiles };
}
