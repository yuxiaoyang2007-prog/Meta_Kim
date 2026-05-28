import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { SKILL_PATH, REFERENCE_DIR, ALL_TYPES, readFile } from "./_helpers.mjs";
import path from "node:path";

const skillContent = await readFile(
  path.relative(
    path.resolve(import.meta.dirname, "..", ".."),
    SKILL_PATH
  )
);

describe("Mixed-type inputs", () => {
  test("Architecture type pre-judgment section exists", () => {
    assert.ok(
      skillContent.includes("Architecture Type Pre-judgment"),
      "SKILL.md should document the architecture type pre-judgment step"
    );
  });

  test("Dynamic Flow Selection section exists with all 5 types", () => {
    assert.ok(
      skillContent.includes("Dynamic Flow Selection"),
      "SKILL.md should have a Dynamic Flow Selection section"
    );
    for (const type of ALL_TYPES) {
      assert.ok(
        skillContent.includes(`Type ${type}:`),
        `SKILL.md should list Type ${type} in flow selection`
      );
    }
  });
});

describe("Architecture type ambiguity", () => {
  test("Meta Architecture signals documented", () => {
    const metaSignals = ["agent governance", "collaboration relationships", "responsibility boundaries"];
    for (const signal of metaSignals) {
      assert.ok(
        skillContent.toLowerCase().includes(signal.toLowerCase()),
        `Meta Architecture signal "${signal}" not found in SKILL.md`
      );
    }
  });

  test("Project Technical Architecture signals documented", () => {
    const techSignals = ["code organization", "tech stack", "design patterns"];
    for (const signal of techSignals) {
      assert.ok(
        skillContent.toLowerCase().includes(signal.toLowerCase()),
        `Project Technical Architecture signal "${signal}" not found in SKILL.md`
      );
    }
  });

  test("pre-judgment recommends redirect for technical architecture", () => {
    assert.ok(
      skillContent.includes("architect") || skillContent.includes("backend-architect"),
      "SKILL.md should recommend architect or backend-architect for technical architecture"
    );
  });

  test("SKILL.md contains the Important note about Architecture Type Distinction", () => {
    assert.ok(
      skillContent.includes("Architecture Type Distinction"),
      "SKILL.md should contain the Important note about Architecture Type Distinction"
    );
  });
});

describe("No-Agent Exception", async () => {
  const devGov = await readFile(
    path.relative(
      path.resolve(import.meta.dirname, "..", ".."),
      path.join(REFERENCE_DIR, "dev-governance.md")
    )
  );

  test("pure Q exception has 4 conditions", () => {
    const markers = [
      "file/code/config change",
      "external side effect",
      "durable artifact",
      "handoff",
    ];
    let matchCount = 0;
    for (const marker of markers) {
      if (devGov.toLowerCase().includes(marker.toLowerCase())) {
        matchCount++;
      }
    }
    assert.ok(
      matchCount >= 4,
      `Expected 4 no-agent exception condition markers, found evidence for ${matchCount}`
    );
  });

  test("taskClass categories documented (Q, A, P, S)", () => {
    const categories = ["Q", "A", "P", "S"];
    for (const cat of categories) {
      assert.ok(
        devGov.includes(`\`${cat}\``) ||
          devGov.includes(`**${cat}**`) ||
          devGov.includes(`| **${cat}**`) ||
          devGov.includes(`"${cat}"`),
        `taskClass category "${cat}" not documented in dev-governance.md`
      );
    }
  });
});

describe("Capability gap", async () => {
  const devGov = await readFile(
    path.relative(
      path.resolve(import.meta.dirname, "..", ".."),
      path.join(REFERENCE_DIR, "dev-governance.md")
    )
  );

  test("Fetch capability discovery path documented", () => {
    const chainSteps = [
      "local",
      "capability index",
      "external search",
      "specialist ecosystem",
      "owner-resolution",
    ];
    let matchCount = 0;
    for (const step of chainSteps) {
      if (devGov.toLowerCase().includes(step.toLowerCase())) {
        matchCount++;
      }
    }
    assert.ok(
      matchCount >= 4,
      `Fetch capability discovery path should document at least 4 of 5 steps, found ${matchCount}`
    );
  });

  test("owner-resolution branches documented", () => {
    const branches = [
      "existing owner",
      "upgrade",
      "capability gap",
    ];
    let matchCount = 0;
    for (const branch of branches) {
      if (devGov.toLowerCase().includes(branch.toLowerCase())) {
        matchCount++;
      }
    }
    assert.ok(
      matchCount >= 3,
      `Expected owner-resolution branches without temporary fallback, found evidence for ${matchCount}`
    );
  });
});

describe("Rollback", async () => {
  const devGov = await readFile(
    path.relative(
      path.resolve(import.meta.dirname, "..", ".."),
      path.join(REFERENCE_DIR, "dev-governance.md")
    )
  );

  test("4-level rollback protocol documented", () => {
    const levels = ["file-level", "sub-task", "partial", "full"];
    let matchCount = 0;
    for (const level of levels) {
      if (devGov.toLowerCase().includes(level.toLowerCase())) {
        matchCount++;
      }
    }
    assert.ok(
      matchCount >= 4,
      `Expected all 4 rollback levels documented, found ${matchCount}`
    );
  });

  test("full rollback triggers on cross-contamination >3 files", () => {
    assert.ok(
      devGov.includes(">3 file") || devGov.includes(">3 files"),
      "dev-governance.md should document that full rollback triggers on cross-contamination >3 files"
    );
  });

  test('"Rollback is not failure" iron rule documented', () => {
    assert.ok(
      devGov.toLowerCase().includes("rollback is not failure"),
      'dev-governance.md should contain the "Rollback is not failure" iron rule'
    );
  });

  test("rollback re-enters Stage 3 Thinking on full rollback", () => {
    const mentionsThinkingReentry =
      (devGov.includes("Stage 3") || devGov.includes("Thinking")) &&
      (devGov.includes("re-enter") ||
        devGov.includes("return to") ||
        devGov.includes("re-decompose"));
    assert.ok(
      mentionsThinkingReentry,
      "dev-governance.md should document that full rollback re-enters Stage 3 Thinking"
    );
  });
});
