/**
 * Tests for setup.mjs i18n string coverage.
 * Ensures all 4 language blocks (en, zh-CN, ja-JP, ko-KR) have matching keys.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SETUP_PATH = resolve(import.meta.dirname, "../../config/i18n/setup-strings.mjs");
const source = readFileSync(SETUP_PATH, "utf8");

// setup.mjs uses: const I18N = { en: {...}, "zh-CN": {...}, "ja-JP": {...}, "ko-KR": {...} }
const LANG_CODES = ["en", "zh-CN", "ja-JP", "ko-KR"];

// Extract all keys from a JSON-like block
function extractObjectKeys(blockText) {
  // Matches key: value patterns at the start of a line
  return [...blockText.matchAll(/^\s+(["\w]+)\s*:/gm)].map((m) =>
    m[1].replace(/^["']|["']$/g, ""),
  );
}

function extractI18nBlock(code) {
  const startPattern = code === "en" ? "en:" : `"${code}":`;
  const startIdx = source.indexOf(startPattern);
  if (startIdx === -1) return null;

  // Find the opening brace
  const braceIdx = source.indexOf("{", startIdx);
  if (braceIdx === -1) return null;

  // Walk to find matching closing brace (simple: count nesting)
  let depth = 1;
  let endIdx = braceIdx + 1;
  while (depth > 0 && endIdx < source.length) {
    if (source[endIdx] === "{") depth++;
    else if (source[endIdx] === "}") depth--;
    endIdx++;
  }
  if (depth !== 0) return null;
  return source.slice(braceIdx + 1, endIdx - 1);
}

describe("I18N block extraction", () => {
  for (const code of LANG_CODES) {
    test(`extracts ${code} block`, () => {
      const block = extractI18nBlock(code);
      assert.ok(block !== null, `Could not find ${code} block`);
      assert.ok(block.length > 0, `${code} block is empty`);
    });
  }
});

describe("i18n key coverage across all languages", () => {
  const enBlock = extractI18nBlock("en");
  assert.ok(enBlock !== null, "Could not find EN block");
  const enKeys = new Set(extractObjectKeys(enBlock));

  for (const code of ["zh-CN", "ja-JP", "ko-KR"]) {
    const langBlock = extractI18nBlock(code);
    if (!langBlock) {
      console.warn(`Warning: could not find ${code} block`);
      continue;
    }
    const langKeys = new Set(extractObjectKeys(langBlock));

    test(`${code} has no missing keys vs EN`, () => {
      const missing = [...enKeys].filter((k) => !langKeys.has(k));
      assert.deepStrictEqual(
        missing,
        [],
        `Missing in ${code}: ${missing.join(", ")}`,
      );
    });

    test(`${code} has no extra keys vs EN`, () => {
      const extra = [...langKeys].filter((k) => !enKeys.has(k));
      assert.deepStrictEqual(
        extra,
        [],
        `Extra in ${code}: ${extra.join(", ")}`,
      );
    });

    test(`${code} has no undefined/null values`, () => {
      const bad = [...langBlock.matchAll(/:\s*(undefined|null)[,\n]/g)].map(
        (m) => m[0].split(":")[0].trim(),
      );
      assert.deepStrictEqual(bad, []);
    });
  }
});

describe("Critical i18n keys present in EN", () => {
  const enBlock = extractI18nBlock("en");
  const enKeys = new Set(extractObjectKeys(enBlock));

  const CRITICAL = [
    // mkdirSync error handling
    "globalDirCreateFailed",
    // ff-only failure handling
    "skillUpdateFailed",
    // Sync check labels
    "syncClaudeAgents",
    "syncClaudeSkills",
    "syncClaudeHooks",
    "syncClaudeSettings",
    "syncClaudeMcp",
    "syncCodexAgents",
    "syncCodexSkills",
    "syncOpenclawWorkspaces",
    "syncSharedSkills",
    "syncCursorAgents",
    "syncCursorSkills",
    "syncCursorMcp",
    "syncOk",
    "syncMissing",
    // Graphify pip error
    "graphifyInstallFailed",
  ];

  for (const key of CRITICAL) {
    test(`${key} exists`, () => {
      assert.ok(enKeys.has(key), `Missing critical key: ${key}`);
    });
  }
});

describe("globalDirCreateFailed parameter", () => {
  test("EN accepts error message parameter (e)", () => {
    const enBlock = extractI18nBlock("en");
    assert.ok(/globalDirCreateFailed:\s*\([^)]*e[^)]*\)/.test(enBlock));
  });
});

describe("skillUpdateFailed parameter", () => {
  test("EN accepts skill name parameter (n)", () => {
    const enBlock = extractI18nBlock("en");
    assert.ok(/skillUpdateFailed:\s*\([^)]*n[^)]*\)/.test(enBlock));
  });
});
