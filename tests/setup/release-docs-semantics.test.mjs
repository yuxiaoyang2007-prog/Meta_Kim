import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("release documentation semantics", () => {
  const readmeFiles = [
    "README.md",
    "README.zh-CN.md",
    "README.ja-JP.md",
    "README.ko-KR.md",
  ];

  test("clone users are told to pull source updates before running setup --update", () => {
    for (const file of readmeFiles) {
      const raw = readFileSync(path.join(root, file), "utf8");

      assert.match(raw, /git pull --ff-only/);
      assert.match(raw, /setup\.mjs --update/);
      assert.doesNotMatch(
        raw,
        /\| `node setup\.mjs --update` \| (?:Update all skills and dependencies|更新所有技能和依赖|すべての skill と依存関係を更新|모든 스킬과 의존성 업데이트) \|/,
      );
    }
  });

  test("runtime coverage guidance uses current Codex and Cursor skill paths", () => {
    const agents = readFileSync(path.join(root, "AGENTS.md"), "utf8");
    const syncConfig = readFileSync(
      path.join(root, "config", "sync.json"),
      "utf8",
    );
    const raw = `${agents}\n${syncConfig}`;

    assert.match(raw, /`\.agents\/skills\/`/);
    assert.match(raw, /`\.codex\/skills\/`/);
    assert.match(raw, /`\.cursor\/skills\/meta-theory\/`|"\.cursor\/skills"/);
    assert.match(raw, /`\.agents\/skills\/meta-theory\/SKILL\.md`/);
    assert.doesNotMatch(raw, /docs\/runtime-coverage-audit\.md/);
  });
});
