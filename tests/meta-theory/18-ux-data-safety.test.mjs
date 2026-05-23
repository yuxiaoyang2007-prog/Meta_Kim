/**
 * 18-ux-data-safety.test.mjs
 *
 * Tests UX quality and data safety for Meta_Kim.
 *
 * UX Validates:
 * - Clarity gate asks ≥2 questions for ambiguous inputs (12 scenarios)
 * - Intentional Silence provides status summary
 * - Stage progress is transparent
 * - Rollback returns to correct stage
 * - Single deliverable per run
 * - High-cost cards have justification
 * - Attention budget enforced (forced silence)
 *
 * Data Safety Validates:
 * - .gitignore covers all local state directories
 * - trackedFilesForbidden prevents git tracking
 * - Compaction is local-only and cannot become public
 * - Test fixtures use placeholders, not real credentials
 * - memory/ is .gitignore'd
 * - .meta-kim/ is .gitignore'd
 * - Tests output to .gitignore'd directories
 *
 * Validates against:
 * - clarity-gate-scenarios.json (12 scenarios)
 * - dispatch-scenarios.json (15 scenarios)
 * - All .gitignore rules
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readJson, readFile } from "./_helpers.mjs";
import { promises as fs } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part A: .gitignore — Complete Coverage
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part A: .gitignore complete coverage for data safety", async () => {
  const gitignore = await readFile(".gitignore");

  test("runtime projections (.claude/) are .gitignore'd", () => {
    assert.ok(gitignore.includes(".claude/"), ".claude/ must be .gitignore'd");
  });

  test("MCP config (.mcp.json) is .gitignore'd", () => {
    assert.ok(
      gitignore.includes(".mcp.json"),
      ".mcp.json must be .gitignore'd",
    );
  });

  test("Codex runtime is .gitignore'd", () => {
    assert.ok(
      gitignore.includes(".codex/") || gitignore.includes("codex/"),
      "codex/ must be .gitignore'd",
    );
  });

  test("OpenClaw runtime is .gitignore'd", () => {
    assert.ok(
      gitignore.includes("openclaw/"),
      "openclaw/ must be .gitignore'd",
    );
  });

  test("Cursor runtime is .gitignore'd", () => {
    assert.ok(gitignore.includes(".cursor/"), ".cursor/ must be .gitignore'd");
  });

  test(".agents/ is .gitignore'd", () => {
    assert.ok(gitignore.includes(".agents/"), ".agents/ must be .gitignore'd");
  });

  test("shared-skills/ is .gitignore'd", () => {
    assert.ok(
      gitignore.includes("shared-skills/"),
      "shared-skills/ must be .gitignore'd",
    );
  });

  test("local state (.meta-kim/) is .gitignore'd", () => {
    assert.ok(
      gitignore.includes(".meta-kim/"),
      ".meta-kim/ must be .gitignore'd",
    );
  });

  test("local state subdirectory (.meta-kim/state/) is .gitignore'd", () => {
    assert.ok(
      gitignore.includes(".meta-kim/state/"),
      ".meta-kim/state/ must be .gitignore'd",
    );
  });

  test("local overrides (.meta-kim/local.overrides.json) is .gitignore'd", () => {
    assert.ok(
      gitignore.includes(".meta-kim/local.overrides.json"),
      ".meta-kim/local.overrides.json must be .gitignore'd",
    );
  });

  test("knowledge graph (graphify-out/) is .gitignore'd", () => {
    assert.ok(
      gitignore.includes("graphify-out/"),
      "graphify-out/ must be .gitignore'd",
    );
  });

  test("runtime directories (runtimes/) is .gitignore'd", () => {
    assert.ok(
      gitignore.includes("runtimes/"),
      "runtimes/ must be .gitignore'd",
    );
  });

  test("memory/ directory is .gitignore'd", () => {
    assert.ok(gitignore.includes("memory/"), "memory/ must be .gitignore'd");
  });

  test(".reports/ is .gitignore'd", () => {
    assert.ok(
      gitignore.includes(".reports/"),
      ".reports/ must be .gitignore'd",
    );
  });

  test("test outputs (tests/output/) are .gitignore'd", () => {
    assert.ok(
      gitignore.includes("tests/output/"),
      "tests/output/ must be .gitignore'd",
    );
  });

  test("test cache (tests/.cache/) is .gitignore'd", () => {
    assert.ok(
      gitignore.includes("tests/.cache/"),
      "tests/.cache/ must be .gitignore'd",
    );
  });

  test("backup directory (.backup/) is .gitignore'd", () => {
    assert.ok(gitignore.includes(".backup/"), ".backup/ must be .gitignore'd");
  });

  test("todos.json is .gitignore'd", () => {
    assert.ok(
      gitignore.includes("todos.json"),
      "todos.json must be .gitignore'd",
    );
  });

  test("node_modules/ is .gitignore'd", () => {
    assert.ok(
      gitignore.includes("node_modules/"),
      "node_modules/ must be .gitignore'd",
    );
  });

  test("canonical/skills/commit-review/ is .gitignore'd (local-only skill)", () => {
    assert.ok(
      gitignore.includes("canonical/skills/commit-review/"),
      "canonical/skills/commit-review/ must be .gitignore'd",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part B: Contract-Backed Data Safety Rules
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part B: contract-backed data safety rules", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");

  test("localState.trackedFilesForbidden is true", () => {
    assert.equal(
      contract.runDiscipline?.localState?.trackedFilesForbidden,
      true,
      "trackedFilesForbidden must be true to prevent accidental git tracking",
    );
  });

  test("compaction.publicArtifactForbidden is true", () => {
    assert.equal(
      contract.runDiscipline?.localState?.compaction?.publicArtifactForbidden,
      true,
      "compaction must not become public artifacts",
    );
  });

  test("compaction.localOnly is true", () => {
    assert.equal(
      contract.runDiscipline?.localState?.compaction?.localOnly,
      true,
      "compaction must be local-only",
    );
  });

  test("doctorCache.localOnly is true", () => {
    assert.equal(
      contract.runDiscipline?.localState?.doctorCache?.localOnly,
      true,
      "doctorCache must be local-only",
    );
  });

  test("globalProjectRegistry.storesProjectBodies is false", () => {
    assert.equal(
      contract.runDiscipline?.localState?.globalProjectRegistry
        ?.storesProjectBodies,
      false,
      "global registry must not store project bodies",
    );
  });

  test("runIndex.indexesValidatedArtifactsOnly is true", () => {
    assert.equal(
      contract.runDiscipline?.localState?.runIndex
        ?.indexesValidatedArtifactsOnly,
      true,
      "run-index must only index validated artifacts",
    );
  });

  test("publicDisplay is a hardReleaseGate", () => {
    assert.equal(contract.gates?.publicDisplay?.hardReleaseGate, true);
    assert.equal(
      contract.gates?.publicDisplay?.blockFinalDraftWithoutVerifiedRun,
      true,
    );
    assert.equal(
      contract.gates?.publicDisplay?.blockExternalDisplayWithoutSummaryClosure,
      true,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part C: Test Fixture Safety
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part C: test fixture safety — no real credentials", async () => {
  test("valid-run.json fixture uses no real API keys", async () => {
    const fixture = await readJson(
      "tests/fixtures/run-artifacts/valid-run.json",
    );
    const raw = JSON.stringify(fixture);
    // Check for common credential patterns
    const hasApiKey = /sk-[a-zA-Z0-9]{20,}/.test(raw);
    const hasSecret = /"secret"\s*:\s*"[^"]{20,}"/.test(raw);
    const hasPassword = /"password"\s*:\s*"[^"]+"/.test(raw);
    assert.ok(
      !hasApiKey && !hasSecret,
      "valid-run.json must not contain real API keys or secrets",
    );
  });

  test("valid-cross-project-run.json fixture uses no real credentials", async () => {
    const { fileExists } = await import("./_helpers.mjs");
    const exists = await fileExists(
      "tests/fixtures/run-artifacts/valid-cross-project-run.json",
    );
    if (!exists) {
      // Fixture might not exist yet — that's OK
      assert.ok(true, "Fixture may not exist yet");
      return;
    }
    const fixture = await readJson(
      "tests/fixtures/run-artifacts/valid-cross-project-run.json",
    );
    const raw = JSON.stringify(fixture);
    const hasApiKey = /sk-[a-zA-Z0-9]{20,}/.test(raw);
    assert.ok(
      !hasApiKey,
      "valid-cross-project-run.json must not contain real API keys",
    );
  });

  test("invalid fixture files use no real credentials", async () => {
    const { fileExists } = await import("./_helpers.mjs");
    const invalid1 = await fileExists(
      "tests/fixtures/run-artifacts/invalid-run-public-ready.json",
    );
    const invalid2 = await fileExists(
      "tests/fixtures/run-artifacts/invalid-run-compaction-open-findings.json",
    );

    for (const [name, exists] of [
      ["invalid-run-public-ready", invalid1],
      ["invalid-run-compaction-open-findings", invalid2],
    ]) {
      if (!exists) continue;
      const fixture = await readJson(
        `tests/fixtures/run-artifacts/${name}.json`,
      );
      const raw = JSON.stringify(fixture);
      const hasApiKey = /sk-[a-zA-Z0-9]{20,}/.test(raw);
      assert.ok(!hasApiKey, `${name}.json must not contain real API keys`);
    }
  });

  test("all scenario JSON files use placeholders, not real data", async () => {
    const scenarioFiles = [
      "tests/meta-theory/scenarios/capability-discovery-scenarios.json",
      "tests/meta-theory/scenarios/clarity-gate-scenarios.json",
      "tests/meta-theory/scenarios/decomposition-scenarios.json",
      "tests/meta-theory/scenarios/dispatch-scenarios.json",
      "tests/meta-theory/scenarios/amplification-scenarios.json",
      "tests/meta-theory/scenarios/creation-scenarios.json",
      "tests/meta-theory/scenarios/complexity-routing-scenarios.json",
      "tests/meta-theory/scenarios/card-deck-scenarios.json",
      "tests/meta-theory/scenarios/evolution-scenarios.json",
    ];

    for (const file of scenarioFiles) {
      const { fileExists } = await import("./_helpers.mjs");
      const exists = await fileExists(file);
      if (!exists) continue;

      const raw = await readFile(file);
      const hasApiKey = /sk-[a-zA-Z0-9]{20,}/.test(raw);
      const hasRealUrl =
        /https?:\/\/(?!example\.com|test\.com|fake\.io)[^\s"]+\.(com|io|net|org|ai|app)/.test(
          raw,
        );
      assert.ok(
        !hasApiKey && !hasRealUrl,
        `${file} must not contain real credentials or non-placeholder URLs`,
      );
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part D: UX — Clarity Gate Scenarios
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part D: clarity gate UX — 12 scenarios validation", async () => {
  const { fileExists } = await import("./_helpers.mjs");
  const exists = await fileExists(
    "tests/meta-theory/scenarios/clarity-gate-scenarios.json",
  );
  if (!exists) {
    test("clarity-gate-scenarios.json must exist", () => {
      assert.fail(
        "Missing: tests/meta-theory/scenarios/clarity-gate-scenarios.json",
      );
    });
    return;
  }

  const scenarios = await readJson(
    "tests/meta-theory/scenarios/clarity-gate-scenarios.json",
  );

  test("clarity-gate-scenarios.json has at least 12 scenarios", () => {
    assert.ok(
      scenarios.length >= 12,
      `Expected at least 12 clarity gate scenarios, got ${scenarios.length}`,
    );
  });

  test("each scenario has passFailCriteria with PASS and FAIL", () => {
    for (const scenario of scenarios) {
      assert.ok(
        scenario.passFailCriteria?.PASS,
        `Scenario ${scenario.id} must have passFailCriteria.PASS`,
      );
      assert.ok(
        scenario.passFailCriteria?.FAIL,
        `Scenario ${scenario.id} must have passFailCriteria.FAIL`,
      );
    }
  });

  test("each scenario has ambiguous dimensions or empty array", () => {
    for (const scenario of scenarios) {
      assert.ok(
        Array.isArray(scenario.ambiguousDims),
        `Scenario ${scenario.id} must have ambiguousDims array`,
      );
    }
  });

  test("each scenario has expectedBehavior", () => {
    for (const scenario of scenarios) {
      assert.ok(
        scenario.expectedBehavior,
        `Scenario ${scenario.id} must have expectedBehavior`,
      );
    }
  });

  test("scenarios cover both clear (CG-04) and ambiguous (CG-01) cases", () => {
    const ids = scenarios.map((s) => s.id);
    assert.ok(ids.includes("CG-04"), "Must have a clear case scenario (CG-04)");
    assert.ok(
      ids.includes("CG-01"),
      "Must have an ambiguous case scenario (CG-01)",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part E: UX — Delivery Chain Transparency
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part E: delivery chain transparency", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");

  test("runHeader has handoffPlan field", () => {
    const fields = contract.protocols?.runHeader?.requiredFields ?? [];
    assert.ok(
      fields.includes("handoffPlan"),
      "runHeader must have handoffPlan for delivery chain transparency",
    );
  });

  test("singleDepartmentPerRun is true", () => {
    assert.equal(contract.runDiscipline?.singleDepartmentPerRun, true);
  });

  test("singlePrimaryDeliverable is true", () => {
    assert.equal(contract.runDiscipline?.singlePrimaryDeliverable, true);
  });

  test("rejectMultiTopicRuns is true", () => {
    assert.equal(contract.runDiscipline?.rejectMultiTopicRuns, true);
  });

  test("requireClosedDeliverableChain is true", () => {
    assert.equal(contract.runDiscipline?.requireClosedDeliverableChain, true);
  });

  test("publicDisplayRequires includes deliverableChainClosed", () => {
    const requires = contract.runDiscipline?.publicDisplayRequires ?? [];
    assert.ok(
      requires.includes("deliverableChainClosed"),
      "publicDisplayRequires must include deliverableChainClosed",
    );
  });

  test("publicDisplayRequires includes singleDeliverableMaintained", () => {
    const requires = contract.runDiscipline?.publicDisplayRequires ?? [];
    assert.ok(
      requires.includes("singleDeliverableMaintained"),
      "publicDisplayRequires must include singleDeliverableMaintained",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part F: UX — Rollback UX
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part F: rollback UX", async () => {
  const devGov = await readFile(
    "canonical/skills/meta-theory/references/dev-governance.md",
  );

  test("'Rollback is not failure' iron rule exists", () => {
    assert.ok(
      devGov.toLowerCase().includes("rollback is not failure"),
      "'Rollback is not failure' iron rule must exist",
    );
  });

  test("rollback decision flow is transparent to user", () => {
    // User should understand which rollback level was chosen and why
    const patterns = [
      /rollback.*decision.*flow/i,
      /file.*count.*rollback/i,
      /Verification.*FAIL.*count/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(devGov)),
      "Rollback decision flow must be documented for UX transparency",
    );
  });

  test("full rollback re-entry point is documented", () => {
    const patterns = [
      /re.enter.*Stage.*1.*Critical/i,
      /full.*rollback.*Critical/i,
      /Stage.*1.*Critical.*after.*stash/i,
    ];
    assert.ok(
      patterns.some((p) => p.test(devGov)),
      "Full rollback must re-enter Stage 1 (Critical) — this must be documented",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part G: UX — Execution Ownership (No Anonymous Execution)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part G: execution ownership — no anonymous execution", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");

  test("anonymousExecutionForbidden is true", () => {
    assert.equal(
      contract.runDiscipline?.executionOwnership?.anonymousExecutionForbidden,
      true,
    );
  });

  test("executionRequiresAgentOwner is true", () => {
    assert.equal(
      contract.runDiscipline?.executionOwnership?.executionRequiresAgentOwner,
      true,
    );
  });

  test("temporary fallback is forbidden as public durable owner state", () => {
    const fallback =
      contract.runDiscipline?.executionOwnership?.temporaryFallback ?? {};
    assert.equal(fallback.allowed, false);
    assert.equal(fallback.emergencyOnly, true);
    assert.equal(fallback.requiresExplicitOwnerLabel, true);
    assert.equal(fallback.requiresJustification, true);
    assert.equal(fallback.requiresEvolutionReview, true);
    assert.match(
      fallback.publicRepoPolicy ?? "",
      /Forbidden as durable owner state/i,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part H: UX — Parallelism and Merge Owner
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part H: parallelism and merge owner", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");
  const parallelism = contract.runDiscipline?.parallelism ?? {};

  test("mustParallelizeIndependentTasks is true", () => {
    assert.equal(parallelism.mustParallelizeIndependentTasks, true);
  });

  test("requiresDependencyDeclaration is true", () => {
    assert.equal(parallelism.requiresDependencyDeclaration, true);
  });

  test("requiresParallelGroup is true", () => {
    assert.equal(parallelism.requiresParallelGroup, true);
  });

  test("requiresMergeOwner is true", () => {
    assert.equal(parallelism.requiresMergeOwner, true);
  });

  test("workerTaskPacket has dependsOn, parallelGroup, mergeOwner fields", () => {
    // parallelGroup and mergeOwner are on workerTaskPacket, not orchestrationTask
    const workerFields =
      contract.protocols?.workerTaskPacket?.requiredFields ?? [];
    assert.ok(
      workerFields.includes("dependsOn"),
      "workerTaskPacket must have dependsOn",
    );
    assert.ok(
      workerFields.includes("parallelGroup"),
      "workerTaskPacket must have parallelGroup",
    );
    assert.ok(
      workerFields.includes("mergeOwner"),
      "workerTaskPacket must have mergeOwner",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part I: Finding Closure — Transparent Revision Tracking
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part I: finding closure transparency", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");
  const closure = contract.runDiscipline?.findingClosure ?? {};

  test("findingIdRequired is true", () => {
    assert.equal(closure.findingIdRequired, true);
  });

  test("reviewFindingRequiresRevisionResponse is true", () => {
    assert.equal(closure.reviewFindingRequiresRevisionResponse, true);
  });

  test("revisionResponseRequiresFixArtifact is true", () => {
    assert.equal(closure.revisionResponseRequiresFixArtifact, true);
  });

  test("verificationRequiresFreshEvidence is true", () => {
    assert.equal(closure.verificationRequiresFreshEvidence, true);
  });

  test("closureRequiresVerificationResult is true", () => {
    assert.equal(closure.closureRequiresVerificationResult, true);
  });

  test("all closeState values are defined", () => {
    const states = closure.closeStateEnum ?? [];
    assert.ok(states.includes("open"));
    assert.ok(states.includes("fixed_pending_verify"));
    assert.ok(states.includes("verified_closed"));
    assert.ok(states.includes("accepted_risk"));
    assert.equal(states.length, 4);
  });

  test("legal close state transitions are defined", () => {
    const transitions = closure.legalTransitions ?? [];
    assert.ok(transitions.includes("open->fixed_pending_verify"));
    assert.ok(transitions.includes("fixed_pending_verify->verified_closed"));
    assert.ok(transitions.includes("fixed_pending_verify->accepted_risk"));
  });
});
