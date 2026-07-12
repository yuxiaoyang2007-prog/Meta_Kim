import { promises as fs } from "node:fs";
import path from "node:path";
import {
  getProfilePaths,
  repoRoot,
  toRepoRelative,
} from "./meta-kim-local-state.mjs";

export function createReportContext(options = {}) {
  const profilePaths = getProfilePaths(options);
  const ensureDirectory = (directoryPath) =>
    fs.mkdir(directoryPath, { recursive: true });
  const writeJson = (filePath, value) =>
    fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  const writeText = (filePath, value) =>
    fs.writeFile(filePath, value, "utf8");
  return {
    repoRoot,
    profile: profilePaths.profile,
    profileDir: profilePaths.profileDir,
    resolveStatePath: (...segments) => path.join(profilePaths.profileDir, ...segments),
    relativeToRepo: toRepoRelative,
    ensureDirectory,
    writeJson,
    writeText,
  };
}
