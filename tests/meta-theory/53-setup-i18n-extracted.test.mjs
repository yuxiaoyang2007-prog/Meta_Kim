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

  test("localized formatters receive runtime counts instead of reading setup globals", () => {
    const stringsSrc = readFileSync(STRINGS_FILE, "utf8");
    const setupSrc = readFileSync(SETUP_FILE, "utf8");
    assert.doesNotMatch(
      stringsSrc,
      /\bMETA_AGENTS\b/,
      "the standalone packed i18n module must not close over setup.mjs globals",
    );
    assert.match(setupSrc, /syncClaudeAgents\(summary\.presentCount, META_AGENTS\.length\)/);
    assert.match(setupSrc, /syncOpenclawWorkspaces\(wsCount, META_AGENTS\.length\)/);
    assert.match(setupSrc, /syncCursorAgents\(summary\.presentCount, META_AGENTS\.length\)/);
  });

  test("setup.mjs is a CLI façade over domain modules instead of using an arbitrary line quota", () => {
    const setupSrc = readFileSync(SETUP_FILE, "utf8");
    for (const domainModule of [
      "./scripts/setup-cli-policy.mjs",
      "./scripts/install-status-semantics.mjs",
      "./scripts/safe-managed-file-operations.mjs",
      "./scripts/project-bootstrap-file-safety.mjs",
      "./scripts/node-spawn-config.mjs",
    ]) {
      assert.ok(
        setupSrc.includes(`from \"${domainModule}\"`),
        `setup.mjs must delegate its domain boundary to ${domainModule}`,
      );
    }
    assert.match(setupSrc, /async function main\(\)/);
    for (const modeRunner of [
      "runProjectBootstrapCli",
      "runProjectCleanupCli",
      "runInstall",
      "runUpdate",
      "runCheck",
    ]) {
      assert.match(setupSrc, new RegExp(`\\b${modeRunner}\\b`));
    }
  });
});
