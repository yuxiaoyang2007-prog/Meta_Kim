import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  SKILL_PATH,
  REFERENCE_DIR,
  ALL_AGENTS,
  ALL_TYPES,
  REFERENCE_FILES,
  parseFrontmatter,
  readFile,
  readJson,
  fileExists,
} from "./_helpers.mjs";
import { promises as fs } from "node:fs";

/**
 * Extract the raw YAML block between --- delimiters, then parse
 * only the top-level scalar key: value lines. This avoids the
 * limitation of _helpers.parseFrontmatter which throws on YAML
 * list items (e.g. "  - shell" under the tools: key).
 */
function parseScalarFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (/^\s+-/.test(line)) continue;
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    if (key && value) {
      data[key] = value.replace(/^['"]|['"]$/g, "");
    }
  }
  return data;
}

let raw;
let frontmatter;

describe("SKILL.md structural integrity", async () => {
  raw = await fs.readFile(SKILL_PATH, "utf-8");
  frontmatter = parseScalarFrontmatter(raw);

  // ── 1. Frontmatter validity (7 tests) ──────────────────────────────

  describe("Frontmatter validity", () => {
    test("has valid YAML frontmatter with --- delimiters", () => {
      const hasDelimiters = /^---\r?\n[\s\S]*?\r?\n---/.test(raw);
      assert.ok(
        hasDelimiters,
        "SKILL.md must start with --- delimited YAML frontmatter",
      );
    });

    test("frontmatter.name === 'meta-theory'", () => {
      assert.equal(frontmatter.name, "meta-theory");
    });

    test("version matches semver pattern", () => {
      assert.match(
        frontmatter.version,
        /^\d+\.\d+\.\d+$/,
        `version "${frontmatter.version}" does not match semver X.Y.Z`,
      );
    });

    test("author is non-empty", () => {
      assert.ok(
        frontmatter.author && frontmatter.author.length > 0,
        "author field must be a non-empty string",
      );
    });

    test("trigger field contains both English and Chinese triggers", () => {
      const trigger = frontmatter.trigger || "";
      const hasChinese = /[\u4e00-\u9fff]/.test(trigger);
      const hasEnglish = /[a-zA-Z]/.test(trigger);
      assert.ok(
        hasChinese,
        "trigger must contain at least one Chinese trigger",
      );
      assert.ok(
        hasEnglish,
        "trigger must contain at least one English trigger",
      );
    });

    test("tools list exists", () => {
      assert.ok(
        raw.match(/^tools:\s*\r?\n(\s+-\s+\w+\r?\n?)+/m),
        "frontmatter must contain a tools list",
      );
    });

    test("description field exists", () => {
      assert.ok(
        raw.match(/^description:\s*\|?\s*\r?\n/m),
        "frontmatter must contain a description field",
      );
    });
  });

  // ── 2. Five Type flows documented (5 tests) ────────────────────────

  describe("Five Type flows documented", () => {
    for (const type of ALL_TYPES) {
      test(`Type ${type} heading exists in SKILL.md`, () => {
        const pattern = new RegExp(`^##\\s+Type\\s+${type}:`, "m");
        assert.ok(
          pattern.test(raw),
          `SKILL.md must contain a '## Type ${type}:' heading`,
        );
      });
    }
  });

  // ── 3. Both gates documented (2 tests) ─────────────────────────────

  describe("Both gates documented", () => {
    test("Gate 1: Clarity Check is documented", () => {
      assert.ok(
        raw.includes("Gate 1") && raw.includes("Clarity Check"),
        "SKILL.md must document Gate 1: Clarity Check",
      );
    });

    test("Gate 2: Dispatch-Not-Execute is documented", () => {
      assert.ok(
        raw.includes("Gate 2") && raw.includes("Dispatch-Not-Execute"),
        "SKILL.md must document Gate 2: Dispatch-Not-Execute",
      );
    });
  });

  // ── 4. Meta agent dispatch targets (1 test) ───────────────────────

  describe("Agent dispatch targets", () => {
    test("all expected meta-agents are referenced in SKILL.md", () => {
      const missing = ALL_AGENTS.filter((agent) => !raw.includes(agent));
      assert.deepEqual(
        missing,
        [],
        `SKILL.md is missing references to: ${missing.join(", ")}`,
      );
    });
  });

  // ── 5. Reference files exist (1 test with subtests) ────────────────

  describe("Reference files exist", () => {
    for (const file of REFERENCE_FILES) {
      test(`references/${file} exists`, async () => {
        const exists = await fileExists(
          `canonical/skills/meta-theory/references/${file}`,
        );
        assert.ok(exists, `Reference file references/${file} must exist`);
      });
    }
  });

  // ── 6. Contract files (3 tests) ────────────────────────────────────

  describe("Contract files", () => {
    test("workflow-contract.json exists and is valid JSON", async () => {
      const exists = await fileExists(
        "config/contracts/workflow-contract.json",
      );
      assert.ok(exists, "config/contracts/workflow-contract.json must exist");
      const data = await readJson("config/contracts/workflow-contract.json");
      assert.equal(
        typeof data,
        "object",
        "workflow-contract.json must parse to an object",
      );
      assert.ok(data !== null, "workflow-contract.json must not be null");
    });

    test("evolution-contract.json exists and is valid JSON", async () => {
      const exists = await fileExists(
        "config/contracts/evolution-contract.json",
      );
      assert.ok(exists, "config/contracts/evolution-contract.json must exist");
      const data = await readJson("config/contracts/evolution-contract.json");
      assert.equal(
        typeof data,
        "object",
        "evolution-contract.json must parse to an object",
      );
      assert.ok(data !== null, "evolution-contract.json must not be null");
    });

    test("scar-protocol.md exists", async () => {
      const exists = await fileExists("config/contracts/scar-protocol.md");
      assert.ok(exists, "config/contracts/scar-protocol.md must exist");
    });
  });
});
