import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const STRINGS_FILE = "config/i18n/setup-strings.mjs";
const SETUP_FILE = "setup.mjs";

describe("53 — setup.mjs i18n extracted to single source (config/i18n/setup-strings.mjs)", () => {
  test("setup-strings.mjs exists and exports buildI18N closure", () => {
    assert.ok(existsSync(STRINGS_FILE), `${STRINGS_FILE} must exist`);
    const src = readFileSync(STRINGS_FILE, "utf8");
    assert.match(src, /export\s+function\s+buildI18N\s*\(/, "must export buildI18N");
    assert.match(src, /return\s*\{/, "buildI18N must return the I18N object");
  });

  test("setup.mjs imports buildI18N and no longer defines I18N inline", () => {
    const setupSrc = readFileSync(SETUP_FILE, "utf8");
    const setupStringsImport = setupSrc.match(
      /import\s*\{([^}]*)\}\s*from\s*["']\.\/config\/i18n\/setup-strings\.mjs["']/,
    );
    assert.ok(
      setupStringsImport,
      "setup.mjs must import the shared config/i18n/setup-strings.mjs module",
    );
    assert.match(
      setupStringsImport[1],
      /(?:^|,)\s*buildI18N\s*(?:,|$)/,
      "the shared setup strings import must include buildI18N",
    );
    assert.match(setupSrc, /const\s+I18N\s*=\s*buildI18N\s*\(/, "setup.mjs must call buildI18N to construct I18N");
    assert.doesNotMatch(
      setupSrc,
      /^const\s+I18N\s*=\s*\{/m,
      "setup.mjs must not still define a top-level I18N object literal"
    );
  });

  test("strings file covers all 4 supported languages (en, zh-CN, ja-JP, ko-KR)", () => {
    const src = readFileSync(STRINGS_FILE, "utf8");
    for (const lang of ["en:", '"zh-CN":', '"ja-JP":', '"ko-KR":']) {
      assert.ok(src.includes(lang), `strings file must include ${lang} block`);
    }
  });

  test("setup.mjs shrank after extraction (smaller than the 9000-line pre-extraction size)", () => {
    const lines = readFileSync(SETUP_FILE, "utf8").split("\n").length;
    assert.ok(lines < 7500, `setup.mjs should shrink after extraction; got ${lines} lines`);
  });
});
