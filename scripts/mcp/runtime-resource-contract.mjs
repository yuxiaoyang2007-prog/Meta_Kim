import { promises as fs } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

const unsafeObjectKeys = new Set(["__proto__", "prototype", "constructor"]);

function assertNoUnsafeObjectKeys(value, sourceLabel) {
  if (Array.isArray(value)) {
    value.forEach((entry) => assertNoUnsafeObjectKeys(entry, sourceLabel));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (unsafeObjectKeys.has(key)) {
      throw new Error(`${sourceLabel} contains an unsafe object key.`);
    }
    assertNoUnsafeObjectKeys(entry, sourceLabel);
  }
}

function assertInsideRoot(filePath, packageRoot) {
  const absolutePath = path.resolve(filePath);
  const absoluteRoot = path.resolve(packageRoot);
  const relative = path.relative(absoluteRoot, absolutePath);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Required MCP resource escapes its package root: ${filePath}`);
  }
  return absolutePath;
}

export async function readRequiredPackagedText(filePath, {
  packageRoot,
  label = "MCP resource",
} = {}) {
  const absolutePath = assertInsideRoot(filePath, packageRoot);
  const stat = await fs.lstat(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${label} must be a regular packaged file: ${absolutePath}`);
  }
  const text = await fs.readFile(absolutePath, "utf8");
  if (!text.trim() || text.includes("\0")) {
    throw new Error(`${label} is empty or invalid: ${absolutePath}`);
  }
  return text;
}

export function validateRequiredMarkdown(text, {
  label = "MCP Markdown resource",
  requireFrontmatter = false,
  expectedFrontmatterName = null,
} = {}) {
  if (!nonEmptyString(text) || text.includes("\0") || !/^#\s+\S+/mu.test(text)) {
    throw new Error(`${label} is not valid non-empty Markdown.`);
  }
  if (requireFrontmatter) {
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u)?.[1];
    if (!frontmatter) {
      throw new Error(`${label} is missing YAML frontmatter.`);
    }
    if (expectedFrontmatterName) {
      const name = frontmatter.match(/^name:\s*([^\r\n]+)\s*$/mu)?.[1]?.trim();
      if (name !== expectedFrontmatterName) {
        throw new Error(`${label} has an unexpected frontmatter name.`);
      }
    }
  }
  return text;
}

export function validateRuntimeCapabilityMatrix(matrix, sourceLabel = "runtime capability matrix") {
  assertNoUnsafeObjectKeys(matrix, sourceLabel);
  if (
    !isPlainObject(matrix) ||
    !Number.isInteger(matrix.schemaVersion) ||
    matrix.schemaVersion < 1 ||
    !Array.isArray(matrix.generatedFrom) ||
    matrix.generatedFrom.length === 0 ||
    matrix.generatedFrom.some((entry) => !nonEmptyString(entry)) ||
    !nonEmptyString(matrix.lastVerifiedAt) ||
    !Array.isArray(matrix.capabilityNames) ||
    matrix.capabilityNames.length === 0 ||
    matrix.capabilityNames.some((entry) => !nonEmptyString(entry)) ||
    new Set(matrix.capabilityNames).size !== matrix.capabilityNames.length ||
    !Array.isArray(matrix.platforms) ||
    matrix.platforms.length === 0 ||
    !isPlainObject(matrix.knownConstraints)
  ) {
    throw new Error(`${sourceLabel} is not a valid Meta_Kim runtime capability matrix.`);
  }

  const expectedCapabilities = new Set(matrix.capabilityNames);
  const seenPlatforms = new Set();
  for (const platform of matrix.platforms) {
    if (
      !isPlainObject(platform) ||
      !nonEmptyString(platform.platform) ||
      seenPlatforms.has(platform.platform) ||
      !nonEmptyString(platform.summary) ||
      !Array.isArray(platform.capabilities)
    ) {
      throw new Error(`${sourceLabel} contains an invalid or duplicate platform.`);
    }
    seenPlatforms.add(platform.platform);
    const seenCapabilities = new Set();
    for (const capability of platform.capabilities) {
      if (
        !isPlainObject(capability) ||
        capability.platform !== platform.platform ||
        !expectedCapabilities.has(capability.capability) ||
        seenCapabilities.has(capability.capability) ||
        !nonEmptyString(capability.support) ||
        !nonEmptyString(capability.confidence) ||
        !isPlainObject(capability.trigger) ||
        !isPlainObject(capability.configLocations) ||
        !isPlainObject(capability.installLocations) ||
        !isPlainObject(capability.osSupport) ||
        !isPlainObject(capability.automationBoundary) ||
        !isPlainObject(capability.evidence)
      ) {
        throw new Error(
          `${sourceLabel} contains an invalid or duplicate capability for ${platform.platform}.`,
        );
      }
      seenCapabilities.add(capability.capability);
    }
    if (seenCapabilities.size !== expectedCapabilities.size) {
      throw new Error(`${sourceLabel} is missing capabilities for ${platform.platform}.`);
    }
  }
  for (const constraints of Object.values(matrix.knownConstraints)) {
    if (!Array.isArray(constraints) || constraints.some((entry) => !nonEmptyString(entry))) {
      throw new Error(`${sourceLabel} contains invalid known constraints.`);
    }
  }
  return matrix;
}

export function parseRuntimeCapabilityMatrix(text, sourceLabel) {
  let matrix;
  try {
    matrix = JSON.parse(text);
  } catch (error) {
    throw new Error(`${sourceLabel} is not valid JSON: ${error.message}`);
  }
  return validateRuntimeCapabilityMatrix(matrix, sourceLabel);
}

export function assertExactRuntimeCapabilityMatrix(actual, expected, label = "runtime capability matrix") {
  validateRuntimeCapabilityMatrix(actual, `${label} response`);
  validateRuntimeCapabilityMatrix(expected, `${label} source`);
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error(`${label} does not exactly match its packaged canonical source.`);
  }
  return actual;
}
