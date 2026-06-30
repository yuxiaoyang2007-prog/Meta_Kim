import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const DEV_GOVERNANCE_FILE = "canonical/skills/meta-theory/references/dev-governance.md";
const SKILL_FILE = "canonical/skills/meta-theory/SKILL.md";

describe("55 — 4-Stage Parallel Fan-out Protocol (dev-governance.md)", () => {
  test("dev-governance.md exists at canonical path", () => {
    assert.ok(existsSync(DEV_GOVERNANCE_FILE), `${DEV_GOVERNANCE_FILE} must exist`);
  });

  test("dev-governance.md contains the '4-Stage Parallel Fan-out Protocol' section header", () => {
    const src = readFileSync(DEV_GOVERNANCE_FILE, "utf8");
    assert.match(
      src,
      /^##\s+4-Stage Parallel Fan-out Protocol\s*$/m,
      "dev-governance.md must contain a level-2 section titled '4-Stage Parallel Fan-out Protocol'"
    );
  });

  test("dev-governance.md names all 4 waves (Wave 1, Wave 2, Wave 3, Wave 4)", () => {
    const src = readFileSync(DEV_GOVERNANCE_FILE, "utf8");
    for (const wave of ["Wave 1", "Wave 2", "Wave 3", "Wave 4"]) {
      assert.ok(src.includes(wave), `dev-governance.md must mention ${wave}`);
    }
  });

  test("Wave 1 covers Critical + Fetch", () => {
    const src = readFileSync(DEV_GOVERNANCE_FILE, "utf8");
    // Anchor on the "### Wave N" subheadings (level-3 markdown) so the
    // split is stable against other prose that mentions "Wave 1" outside
    // the 4-Stage Parallel Fan-out Protocol section.
    const wave1Block =
      src.split("### Wave 1")[1]?.split("### Wave 2")[0] ?? "";
    assert.match(wave1Block, /Critical/, "Wave 1 must cover Critical");
    assert.match(wave1Block, /Fetch/, "Wave 1 must cover Fetch");
  });

  test("Wave 2 covers Thinking + Plan / Planning", () => {
    const src = readFileSync(DEV_GOVERNANCE_FILE, "utf8");
    const wave2Block = src.split("Wave 2")[1]?.split("Wave 3")[0] ?? "";
    assert.match(wave2Block, /Thinking/, "Wave 2 must cover Thinking");
    assert.match(wave2Block, /Plan|Planning|dispatchEnvelope/, "Wave 2 must cover Plan/Planning");
  });

  test("Wave 3 covers Execution fan-out", () => {
    const src = readFileSync(DEV_GOVERNANCE_FILE, "utf8");
    const wave3Block = src.split("Wave 3")[1]?.split("Wave 4")[0] ?? "";
    assert.match(wave3Block, /Execution/, "Wave 3 must cover Execution");
    assert.match(wave3Block, /mergeOwner|parallelGroup/, "Wave 3 must require mergeOwner / parallelGroup");
  });

  test("Wave 4 covers Review + Meta-Review (Warden gate)", () => {
    const src = readFileSync(DEV_GOVERNANCE_FILE, "utf8");
    const wave4Block = src.split("Wave 4")[1] ?? "";
    assert.match(wave4Block, /Review/, "Wave 4 must cover Review");
    assert.match(wave4Block, /Meta-Review|Warden/, "Wave 4 must cover Meta-Review / Warden gate");
  });

  test("Hard rule: Meta-Review / Verification / Evolution remain strict-serial", () => {
    const src = readFileSync(DEV_GOVERNANCE_FILE, "utf8");
    const hardRulesBlock = src.split("Wave Hard Rules")[1] ?? "";
    assert.match(
      hardRulesBlock,
      /Meta-Review.*Verification.*Evolution|Verification.*Evolution/,
      "Hard rules must keep Meta-Review, Verification, and Evolution strict-serial"
    );
  });
});

describe("55b — SKILL.md cross-link to 4-Stage Parallel Fan-out Protocol", () => {
  test("SKILL.md Parallelism Boundaries section lists all 4 waves", () => {
    const src = readFileSync(SKILL_FILE, "utf8");
    for (const wave of ["Wave 1", "Wave 2", "Wave 3", "Wave 4"]) {
      assert.ok(src.includes(wave), `SKILL.md Parallelism Boundaries must mention ${wave}`);
    }
  });

  test("SKILL.md Parallelism Boundaries keeps Warden gate / Verification as single-point", () => {
    const src = readFileSync(SKILL_FILE, "utf8");
    const boundariesBlock = src.split("Parallelism Boundaries")[1]?.split("## ")[0] ?? "";
    assert.match(boundariesBlock, /Warden/i, "Parallelism Boundaries must mention Warden");
    assert.match(boundariesBlock, /Verification/i, "Parallelism Boundaries must mention Verification");
  });
});
