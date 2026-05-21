import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  SKILL_PATH,
  AGENTS_DIR,
  REFERENCE_DIR,
  ALL_AGENTS,
  ALL_TYPES,
  EIGHT_STAGES,
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

function extractSecondLevelSection(markdown, heading) {
  const startToken = `## ${heading}`;
  const start = markdown.indexOf(startToken);
  if (start === -1) return null;

  const bodyStart = markdown.indexOf("\n", start);
  if (bodyStart === -1) return "";

  const rest = markdown.slice(bodyStart + 1);
  const nextHeading = rest.search(/\r?\n##[ \t]+/);
  const section =
    nextHeading === -1 ? rest : rest.slice(0, nextHeading);
  return section.trim();
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

describe("Canonical meta-agent boundary structure", () => {
  const longTermProviders = [
    "meta-theory",
    "agent-teams-playbook",
    "findskill",
    "superpowers",
    "ecc",
  ];

  for (const agent of ALL_AGENTS) {
    test(`${agent} declares the unified 8-stage position matrix`, async () => {
      const rawAgent = await readFile(`canonical/agents/${agent}.md`);
      const matrix = extractSecondLevelSection(
        rawAgent,
        "8-Stage Position Matrix",
      );

      assert.ok(matrix, `${agent} must contain ## 8-Stage Position Matrix`);

      for (const field of [
        "Primary stage",
        "Conditional stages",
        "Must not execute in",
        "Handoff owner",
      ]) {
        assert.ok(matrix.includes(field), `${agent} matrix missing ${field}`);
      }

      assert.ok(
        EIGHT_STAGES.some((stage) => matrix.includes(stage)),
        `${agent} matrix must reference at least one canonical 8-stage label`,
      );
    });

  }

  test("Long-term capability policy uses abstract slots and run-only concrete skill selection", async () => {
    const contract = await readJson("config/contracts/workflow-contract.json");
    const index = await readJson("config/capability-index/meta-kim-capabilities.json");
    const policy =
      contract.protocols?.agentBlueprintPacket?.longTermCapabilityPolicy ?? {};

    assert.equal(policy.abstractCapabilitySlotsRequired, true);
    assert.equal(policy.forbidConcreteSkillInLongTermAgentIdentity, true);
    assert.equal(policy.selectedSkillScope, "run_only");
    assert.equal(index.runtimeSelectedSkills?.selectedSkillScope, "run_only");
    assert.ok(Array.isArray(index.abstractCapabilitySlots));
    assert.ok(index.abstractCapabilitySlots.length >= 1);

    for (const provider of longTermProviders) {
      assert.ok(
        policy.allowedMetaSkillProviders?.includes(provider),
        `workflow contract must allow provider package ${provider}`,
      );
      assert.equal(
        index.metaSkillProviders?.[provider]?.allowedForLongTermAgentIdentity,
        true,
        `capability index must allow provider package ${provider}`,
      );
    }
  });

  test("Long-term identity policy rejects concrete child skills while allowing provider packages", async () => {
    const index = await readJson("config/capability-index/meta-kim-capabilities.json");
    const forbiddenConcreteBindings = [
      /superpowers\/[a-z0-9_-]+/i,
      /gstack\/[a-z0-9_-]+/i,
      /everything-claude-code:[a-z0-9_-]+/i,
    ];
    const allowedProviderIdentity =
      "Allowed meta-skill package providers: meta-theory, agent-teams-playbook, findskill, superpowers, ecc";
    const fixedConcreteIdentity =
      "Dependency Skill Invocations: superpowers/test-driven-development, gstack/qa, everything-claude-code:code-reviewer";

    for (const provider of longTermProviders) {
      assert.ok(
        allowedProviderIdentity.includes(provider),
        `provider package ${provider} should be allowed in long-term identity`,
      );
    }
    for (const pattern of forbiddenConcreteBindings) {
      assert.ok(
        !pattern.test(allowedProviderIdentity),
        `provider-only identity must not match concrete child-skill pattern ${pattern}`,
      );
      assert.ok(
        pattern.test(fixedConcreteIdentity),
        `concrete child-skill identity must be rejected by ${pattern}`,
      );
    }
    assert.equal(
      index.longTermAgentIdentityPolicy?.forbidConcreteSkillInLongTermAgentIdentity,
      true,
    );
  });

  test("Warden boundary uses decision/arbitration language, not Prism review language", async () => {
    const warden = await readFile("canonical/agents/meta-warden.md");
    assert.ok(
      warden.includes("Quality Gate decision / arbitration"),
      "meta-warden must own Quality Gate decision / arbitration",
    );
    assert.ok(
      !warden.includes("Quality Gate review"),
      "meta-warden must not claim Quality Gate review",
    );
  });

  test("Conductor assigns dispatch board schema validation without taking Stage 7 ownership", async () => {
    const conductor = await readFile("canonical/agents/meta-conductor.md");
    assert.ok(
      conductor.includes("dispatch board schema validation"),
      "meta-conductor must assign dispatch board schema validation",
    );
    assert.ok(
      conductor.includes("Stage 7 Verification owner remains `meta-warden + meta-prism`"),
      "meta-conductor must preserve Warden + Prism as Stage 7 Verification owner",
    );
    assert.ok(
      !conductor.includes("| **Verification Owner** | `npm run meta:validate` |"),
      "meta-conductor must not name npm run meta:validate as the Verification Owner",
    );
  });

  test("Evolution writeback authority is uniform across canonical agents", async () => {
    const files = await fs.readdir(AGENTS_DIR);
    const agentFiles = files.filter((file) => file.endsWith(".md"));
    const bad = [];

    for (const file of agentFiles) {
      const rawAgent = await readFile(`canonical/agents/${file}`);
      if (
        rawAgent.includes("write back directly to this agent") ||
        rawAgent.includes("directly to canonical") ||
        rawAgent.includes("直接写back")
      ) {
        bad.push(file);
      }
      assert.ok(
        rawAgent.includes(
          "Warden approves; Chrysalis coordinates; target specialist performs writeback",
        ),
        `${file} must state the uniform evolution writeback authority`,
      );
    }

    assert.deepEqual(bad, [], `Direct-writeback wording remains in: ${bad.join(", ")}`);
  });
});
