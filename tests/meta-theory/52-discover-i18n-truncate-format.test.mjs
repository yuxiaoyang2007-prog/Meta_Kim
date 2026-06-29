import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";

function scan(langFlag = "--zh") {
  const args = ["scripts/discover-global-capabilities.mjs"];
  if (langFlag) args.push(langFlag);
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  if (result.status !== 0 && result.status !== null) {
    if (result.stderr && result.stderr.trim()) {
      throw new Error(`script failed: ${result.stderr}`);
    }
  }
  return result.stdout;
}

describe("52 — Discover capabilities i18n truncate format", () => {
  test("zh output uses 剩余 N 项因篇幅关系未显示 wording", () => {
    const out = scan();
    assert.match(out, /剩余 \d+ 项因篇幅关系未显示/, "zh output must use 因篇幅关系未显示 wording");
  });

  test("zh output shows at least 10 family names before truncation", () => {
    const out = scan();
    // Match the Skills-by-family line (contains "vercel" or similar short family tokens), not the by-platform total line
    const familyLine = out.split("\n").find((l) => /\bvercel\s+\d+/.test(l));
    assert.ok(familyLine, "expected a Skills family line containing 'vercel N'");
    const body = familyLine.split(/\s*等\s*|,\s*more/)[0];
    const familyNames = body.split(/,\s*/).filter((s) => /\s\d+$/.test(s));
    assert.ok(familyNames.length >= 10, `expected >=10 visible families, got ${familyNames.length}`);
  });

  test("zh output does not use old 项未显示 wording", () => {
    const out = scan();
    assert.doesNotMatch(out, /项未显示/, "old 项未显示 wording should be replaced");
  });

  test("OUTPUT_I18N covers all 4 supported languages (en, zh, ja-JP, ko-KR)", () => {
    const src = readFileSync("scripts/discover-global-capabilities.mjs", "utf8");
    for (const lang of ["en:", "zh:", '"ja-JP":', '"ko-KR":']) {
      assert.ok(src.includes(lang), `OUTPUT_I18N must include ${lang} block`);
    }
  });

  test("normalizeOutputLang maps ja and ko prefixes to the new ja-JP / ko-KR blocks", () => {
    const src = readFileSync("scripts/discover-global-capabilities.mjs", "utf8");
    assert.ok(
      src.includes('startsWith("ja")) return "ja-JP"'),
      'must map ja → ja-JP (e.g. `if (raw.startsWith("ja")) return "ja-JP"`)'
    );
    assert.ok(
      src.includes('startsWith("ko")) return "ko-KR"'),
      'must map ko → ko-KR (e.g. `if (raw.startsWith("ko")) return "ko-KR"`)'
    );
  });
});