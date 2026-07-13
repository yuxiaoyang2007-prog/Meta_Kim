/**
 * Runtime coverage for setup i18n data.
 *
 * Import the same factory setup.mjs uses. Do not parse source text: this module
 * may export other localized objects before or after buildI18N().
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildI18N } from "../../config/i18n/setup-strings.mjs";

const LANG_CODES = ["en", "zh-CN", "ja-JP", "ko-KR"];
const I18N = buildI18N({ MIN_NODE_VERSION: "20.0.0" });

function valueKind(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function assertRuntimeShape(reference, candidate, path = "") {
  assert.notEqual(candidate, undefined, `${path || "value"} is undefined`);
  assert.notEqual(candidate, null, `${path || "value"} is null`);
  assert.equal(
    valueKind(candidate),
    valueKind(reference),
    `${path || "value"} has a different runtime type`,
  );

  if (
    reference &&
    candidate &&
    typeof reference === "object" &&
    !Array.isArray(reference)
  ) {
    assert.deepEqual(
      Object.keys(candidate).sort(),
      Object.keys(reference).sort(),
      `${path || "object"} has different keys`,
    );
    for (const key of Object.keys(reference)) {
      assertRuntimeShape(reference[key], candidate[key], path ? `${path}.${key}` : key);
    }
  }
}

describe("setup i18n runtime factory", () => {
  for (const code of LANG_CODES) {
    test(`buildI18N returns a populated ${code} locale`, () => {
      assert.ok(I18N[code], `Missing runtime locale: ${code}`);
      assert.ok(Object.keys(I18N[code]).length > 0, `${code} locale is empty`);
    });
  }
});

describe("i18n runtime shape across all languages", () => {
  for (const code of ["zh-CN", "ja-JP", "ko-KR"]) {
    test(`${code} matches the EN key and value/function shape`, () => {
      assertRuntimeShape(I18N.en, I18N[code], code);
    });
  }
});

describe("critical setup i18n behavior", () => {
  const criticalKeys = [
    "globalDirCreateFailed",
    "skillUpdateFailed",
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
    "graphifyInstallFailed",
  ];

  for (const key of criticalKeys) {
    test(`${key} exists in every runtime locale`, () => {
      for (const code of LANG_CODES) {
        assert.notEqual(I18N[code][key], undefined, `${code}.${key} is missing`);
        assert.notEqual(I18N[code][key], null, `${code}.${key} is null`);
      }
    });
  }

  test("globalDirCreateFailed consumes the provided error message", () => {
    for (const code of LANG_CODES) {
      assert.match(I18N[code].globalDirCreateFailed("SENTINEL_ERROR"), /SENTINEL_ERROR/);
    }
  });

  test("skillUpdateFailed consumes the provided skill name", () => {
    for (const code of LANG_CODES) {
      assert.match(I18N[code].skillUpdateFailed("SENTINEL_SKILL"), /SENTINEL_SKILL/);
    }
  });
});
