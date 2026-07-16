import path from "node:path";

/**
 * Build a child-process environment whose user-level state is confined to a
 * caller-owned directory. Runtime-specific overrides are preserved, while the
 * two cross-platform home variables are always pinned to the isolated root.
 */
export function buildIsolatedUserHomeEnv(
  homeDir,
  overrides = {},
  baseEnv = process.env,
) {
  if (typeof homeDir !== "string" || homeDir.trim().length === 0) {
    throw new TypeError("homeDir must be a non-empty string");
  }
  const resolvedHome = path.resolve(homeDir);
  return {
    ...baseEnv,
    ...(overrides ?? {}),
    HOME: resolvedHome,
    USERPROFILE: resolvedHome,
  };
}
