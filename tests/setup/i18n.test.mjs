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

describe("setup failure guidance prioritizes exact errors", () => {
  const expectedCopy = {
    en: {
      exactError: /first exact error printed above/,
      conditional: /only when the log explicitly shows the matching condition/,
      ebusy: /If the log contains EBUSY/,
      network: /If the log reports (?:a )?(?:Git fetch or network|network or Git fetch|network) error/,
    },
    "zh-CN": {
      exactError: /以上方第一条精确错误为准/,
      conditional: /仅当日志明确出现对应情况时/,
      ebusy: /若日志含 EBUSY/,
      network: /若日志明确提示(?: Git fetch 或)?网络错误|若日志明确提示网络错误或 Git fetch 失败/,
    },
    "ja-JP": {
      exactError: /最初の正確なエラーを基準にしてください/,
      conditional: /ログに該当する状態が明示されている場合に限り/,
      ebusy: /ログに EBUSY/,
      network: /ログに(?: Git fetch 失敗または)?ネットワークエラー|ログにネットワークエラーまたは Git fetch 失敗/,
    },
    "ko-KR": {
      exactError: /첫 번째 정확한 오류를 기준으로 판단하세요/,
      conditional: /로그에 해당 상태가 명시된 경우에만/,
      ebusy: /로그에 EBUSY/,
      network: /로그에(?: Git fetch 실패 또는)? 네트워크 오류|로그에 네트워크 오류 또는 Git fetch 실패/,
    },
  };

  for (const code of LANG_CODES) {
    test(`${code} install and update guidance uses exact-error-first conditional recovery`, () => {
      const locale = I18N[code];
      const expected = expectedCopy[code];

      for (const key of ["warnSkillsInstallFailed", "warnSkillsUpdateFailed"]) {
        const message = locale[key];
        assert.match(message, expected.exactError, `${code}.${key} must prioritize the exact error`);
        assert.match(message, expected.conditional, `${code}.${key} must make fallback guidance conditional`);
        assert.match(message, expected.ebusy, `${code}.${key} must preserve conditional EBUSY recovery`);
        assert.match(message, expected.network, `${code}.${key} must preserve conditional network recovery`);
        assert.match(message, /Meta_Kim/, `${code}.${key} must bind cleanup to Meta_Kim's reported path`);
        assert.match(message, /skills\/plugins/, `${code}.${key} must constrain cleanup to the selected runtime root`);
        assert.match(
          message,
          /not user-owned|不属于用户资产|ユーザー所有データではない|사용자 소유 데이터가 아닌/,
          `${code}.${key} must protect user-owned content`,
        );
        assert.match(
          message,
          /wildcard|通配符|ワイルドカード|와일드카드/,
          `${code}.${key} must prohibit wildcard cleanup`,
        );
        assert.doesNotMatch(message, /\*\.staged-\*/, `${code}.${key} must not recommend wildcard deletion`);
        assert.match(message, /node setup\.mjs --update/, `${code}.${key} must preserve the retry command`);
      }

      assert.doesNotMatch(locale.warnSkillsUpdateFailedHint, /\*\.staged-\*/);
      assert.match(locale.warnSkillsUpdateFailedHint, /Meta_Kim/);
      assert.match(locale.warnSkillsUpdateFailedHint, /skills\/plugins/);
      assert.match(locale.warnSkillsUpdateFailedHint, /wildcard|通配符|ワイルドカード|와일드카드/);

      for (const key of ["warnMetaTheorySyncFailed", "warnMetaTheoryUpdateFailed"]) {
        const message = locale[key];
        assert.match(message, expected.exactError, `${code}.${key} must prioritize the exact error`);
        assert.match(message, expected.conditional, `${code}.${key} must make fallback guidance conditional`);
        assert.match(message, /EBUSY/, `${code}.${key} must preserve conditional lock recovery`);
        assert.match(message, /permission|权限|権限|권한/, `${code}.${key} must preserve permission recovery`);
        assert.match(message, /network|网络|ネットワーク|네트워크/, `${code}.${key} must preserve network recovery`);
        assert.match(message, /skills\/plugins/, `${code}.${key} must refer to the selected runtime root`);
        assert.match(message, /node setup\.mjs --update/, `${code}.${key} must provide a runtime-aware retry`);
        assert.doesNotMatch(message, /~\/\.claude\/skills|--targets claude/);
      }
    });
  }
});
