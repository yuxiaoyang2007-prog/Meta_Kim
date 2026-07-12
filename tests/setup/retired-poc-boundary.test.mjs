import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const retiredValidator = join(
  REPO_ROOT,
  "canonical",
  "runtime-assets",
  "shared",
  "lib",
  "validator.mjs",
);
const retiredResults = join(
  REPO_ROOT,
  "tests",
  "poc-design-gate",
  "RESULTS.md",
);

const EXECUTABLE_EXTENSIONS = new Set([
  ".cjs",
  ".js",
  ".jsx",
  ".json",
  ".mjs",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
]);

const RETIRED_VALIDATOR_REPO_PATH =
  "canonical/runtime-assets/shared/lib/validator.mjs";
const CONSUMPTION_SPECIFIER_PATTERNS = [
  /\b(?:import|export)\s+(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']/gu,
  /\b(?:import|require)\s*\(\s*["']([^"']+)["']/gu,
  /\b(?:[\w$]+\.)?(?:readFile|readFileSync|loadValidationContract)\s*\(\s*["']([^"']+)["']/gu,
  /\bnew\s+URL\s*\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url/gu,
];

function isRetiredValidatorSpecifier(specifier, sourceFile) {
  const normalized = String(specifier).split(/[?#]/u, 1)[0].replaceAll("\\", "/");
  if (
    normalized === RETIRED_VALIDATOR_REPO_PATH ||
    normalized.endsWith(`/${RETIRED_VALIDATOR_REPO_PATH}`)
  ) {
    return true;
  }
  if (!normalized.startsWith(".")) return false;
  return resolve(dirname(sourceFile), normalized) === retiredValidator;
}

function findRetiredValidatorConsumption(content, sourceFile) {
  const matches = [];
  for (const pattern of CONSUMPTION_SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      if (isRetiredValidatorSpecifier(match[1], sourceFile)) {
        matches.push(match[0]);
      }
    }
  }
  return matches;
}

test("retired incomplete validator and stale result report cannot silently return", () => {
  assert.equal(
    existsSync(retiredValidator),
    false,
    "the incomplete shared validator must stay absent until it has a real consumer and tests",
  );
  assert.equal(
    existsSync(retiredResults),
    false,
    "the stale point-in-time PoC result report must stay absent",
  );
});

test("negative package assertions are allowed while executable consumption is rejected", () => {
  const sourceFile = join(REPO_ROOT, "tests", "setup", "example.test.mjs");
  assert.deepEqual(
    findRetiredValidatorConsumption(
      `const retiredFile = "${RETIRED_VALIDATOR_REPO_PATH}";\n` +
        "assert.equal(packageFiles.has(retiredFile), false);",
      sourceFile,
    ),
    [],
  );

  for (const executableSource of [
    `import retired from "../../${RETIRED_VALIDATOR_REPO_PATH}";`,
    `await import("../../${RETIRED_VALIDATOR_REPO_PATH}");`,
    `require("../../${RETIRED_VALIDATOR_REPO_PATH}");`,
    `readFileSync("../../${RETIRED_VALIDATOR_REPO_PATH}", "utf8");`,
    `new URL("../../${RETIRED_VALIDATOR_REPO_PATH}", import.meta.url);`,
  ]) {
    assert.notDeepEqual(
      findRetiredValidatorConsumption(executableSource, sourceFile),
      [],
      executableSource,
    );
  }
});

test("tracked and untracked executable sources cannot consume the retired validator", () => {
  const currentFile = fileURLToPath(import.meta.url);
  const offenders = [];
  const sourceFiles = execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
    ],
    { cwd: REPO_ROOT, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean)
    .map((file) => join(REPO_ROOT, file))
    .filter((file) => EXECUTABLE_EXTENSIONS.has(extname(file).toLowerCase()));

  for (const file of sourceFiles) {
    if (file === currentFile || !existsSync(file)) continue;
    const content = readFileSync(file, "utf8");
    const matches = findRetiredValidatorConsumption(content, file);
    if (matches.length > 0) {
      offenders.push(`${relative(REPO_ROOT, file)} -> ${matches.join(" | ")}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `retired validator executable references found:\n${offenders.join("\n")}`,
  );
});
