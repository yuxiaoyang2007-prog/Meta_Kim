import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import path from "node:path";
import { REPO_ROOT } from "./_helpers.mjs";

const execFileAsync = promisify(execFile);

describe("validate-run-artifact.mjs", () => {
  const validFixture = path.join(
    REPO_ROOT,
    "tests",
    "fixtures",
    "run-artifacts",
    "valid-run.json",
  );
  const invalidFixture = path.join(
    REPO_ROOT,
    "tests",
    "fixtures",
    "run-artifacts",
    "invalid-run-public-ready.json",
  );
  const invalidCompactionFixture = path.join(
    REPO_ROOT,
    "tests",
    "fixtures",
    "run-artifacts",
    "invalid-run-compaction-open-findings.json",
  );

  async function validateFixture(fixturePath) {
    const { stdout } = await execFileAsync(
      "node",
      ["scripts/validate-run-artifact.mjs", fixturePath],
      { cwd: REPO_ROOT },
    );
    return JSON.parse(stdout);
  }

  async function writeTempFixture(t, mutate) {
    const raw = await fs.readFile(validFixture, "utf8");
    const artifact = JSON.parse(raw);
    mutate(artifact);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "meta-kim-validate-"));
    const file = path.join(dir, "fixture.json");
    await fs.writeFile(file, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    t.after(async () => {
      await fs.rm(dir, { recursive: true, force: true });
    });
    return file;
  }

  test("accepts a valid run artifact with full finding lineage", async () => {
    const result = await validateFixture(validFixture);
    assert.equal(result.ok, true);
    assert.ok(result.validatedPackets.includes("fetchPacket"));
    assert.ok(result.validatedPackets.includes("dispatchEnvelopePacket"));
    assert.ok(result.validatedPackets.includes("orchestrationTaskBoardPacket"));
    assert.ok(result.validatedPackets.includes("cardPlanPacket"));
    assert.ok(result.validatedPackets.includes("summaryPacket"));
  });

  test("rejects an invalid public-ready run artifact", async () => {
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", invalidFixture],
        {
          cwd: REPO_ROOT,
        },
      ),
    );
  });

  test("rejects compaction packets that drop open findings", async () => {
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", invalidCompactionFixture],
        {
          cwd: REPO_ROOT,
        },
      ),
    );
  });

  test("rejects Evolution writeback targets that use local memory or continuity storage", async (t) => {
    for (const target of [
      "memory/capability-gaps.md",
      ".meta-kim/state/default/compaction/latest.json",
      "compaction/latest.json",
      "run-index.sqlite",
    ]) {
      const tempFixture = await writeTempFixture(t, (artifact) => {
        artifact.evolutionWritebackPacket.writebacks = [
          {
            target,
            reason: "invalid local continuity target for Evolution writeback",
          },
        ];
      });
      await assert.rejects(
        execFileAsync(
          "node",
          ["scripts/validate-run-artifact.mjs", tempFixture],
          { cwd: REPO_ROOT },
        ),
        /must not use memory, compaction, or run-index storage/,
      );
    }
  });

  test("rejects forbidden Evolution writeback targets even when writebackDecision is none", async (t) => {
    const tempFixture = await writeTempFixture(t, (artifact) => {
      artifact.evolutionWritebackPacket.writebackDecision = "none";
      artifact.evolutionWritebackPacket.writebacks = [
        {
          target: "memory/patterns/session.md",
          reason: "invalid hidden writeback target",
        },
      ];
    });
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", tempFixture],
        { cwd: REPO_ROOT },
      ),
      /must not use memory, compaction, or run-index storage/,
    );
  });

  test("rejects Evolution writeback targets that traverse out of allowed roots", async (t) => {
    for (const target of [
      "canonical/skills/../runtime-assets/codex/config.toml.example",
      "config/contracts/../capability-index/meta-kim-capabilities.json",
    ]) {
      const tempFixture = await writeTempFixture(t, (artifact) => {
        artifact.evolutionWritebackPacket.writebacks = [
          {
            target,
            reason: "traversal must not bypass writeback target roots",
          },
        ];
      });
      await assert.rejects(
        execFileAsync(
          "node",
          ["scripts/validate-run-artifact.mjs", tempFixture],
          { cwd: REPO_ROOT },
        ),
        /must not contain path traversal/,
      );
    }
  });

  test("rejects Evolution writeback targets with Windows-style traversal", async (t) => {
    const tempFixture = await writeTempFixture(t, (artifact) => {
      artifact.evolutionWritebackPacket.writebacks = [
        {
          target:
            "canonical\\skills\\..\\runtime-assets\\codex\\config.toml.example",
          reason: "backslash traversal must not bypass writeback target roots",
        },
      ];
    });
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", tempFixture],
        { cwd: REPO_ROOT },
      ),
      /must not contain path traversal/,
    );
  });

  test("accepts canonical Evolution writeback targets from the workflow contract", async (t) => {
    const tempFixture = await writeTempFixture(t, (artifact) => {
      artifact.evolutionWritebackPacket.writebacks = [
        {
          target: "canonical/agents/meta-warden.md",
          reason: "agent boundary lesson belongs in the agent definition",
        },
        {
          target: "canonical/skills/meta-theory/SKILL.md",
          reason: "reusable governance rule belongs in the skill source",
        },
        {
          target: "config/capability-index/meta-kim-capabilities.json",
          reason: "capability ownership update belongs in the capability index",
        },
        {
          target: "config/contracts/workflow-contract.json",
          reason: "workflow gate updates belong in the workflow contract",
        },
      ];
    });
    const result = await validateFixture(tempFixture);
    assert.equal(result.ok, true);
  });

  test("rejects dispatch envelopes without ownerAgent", async (t) => {
    const tempFixture = await writeTempFixture(t, (artifact) => {
      artifact.dispatchEnvelopePacket.ownerAgent = "";
    });
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", tempFixture],
        { cwd: REPO_ROOT },
      ),
    );
  });

  test("rejects dispatch envelopes with overlapping allowed/blocked capabilities", async (t) => {
    const tempFixture = await writeTempFixture(t, (artifact) => {
      artifact.dispatchEnvelopePacket.blockedCapabilities = [
        ...artifact.dispatchEnvelopePacket.blockedCapabilities,
        artifact.dispatchEnvelopePacket.allowedCapabilities[0],
      ];
    });
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", tempFixture],
        { cwd: REPO_ROOT },
      ),
    );
  });

  test("rejects dispatch envelopes with illegal memoryMode", async (t) => {
    const tempFixture = await writeTempFixture(t, (artifact) => {
      artifact.dispatchEnvelopePacket.memoryMode = "inherit_random_context";
    });
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", tempFixture],
        { cwd: REPO_ROOT },
      ),
    );
  });

  test("rejects missing fetchPacket for governed runs", async (t) => {
    const tempFixture = await writeTempFixture(t, (artifact) => {
      delete artifact.fetchPacket;
    });
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", tempFixture],
        {
          cwd: REPO_ROOT,
        },
      ),
    );
  });

  test("rejects content evidence without research capability discovery", async (t) => {
    const tempFixture = await writeTempFixture(t, (artifact) => {
      delete artifact.contentEvidencePacket.researchCapabilityDiscovery;
    });
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", tempFixture],
        {
          cwd: REPO_ROOT,
        },
      ),
      /researchCapabilityDiscovery/,
    );
  });

  test("rejects platformSurface as a research capability signal", async (t) => {
    const tempFixture = await writeTempFixture(t, (artifact) => {
      artifact.contentEvidencePacket.researchCapabilityDiscovery.platformSurface =
        "desktop";
    });
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", tempFixture],
        {
          cwd: REPO_ROOT,
        },
      ),
      /platformSurface/,
    );
  });

  test("rejects current-project fetch packets that check other projects", async (t) => {
    const tempFixture = await writeTempFixture(t, (artifact) => {
      artifact.fetchPacket.projectsChecked = [
        ...artifact.fetchPacket.projectsChecked,
        {
          projectRef: "project-other",
          checkMode: "global_registry_hit",
          reason: "unexpected cross-project fetch",
        },
      ];
    });
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", tempFixture],
        {
          cwd: REPO_ROOT,
        },
      ),
    );
  });

  test("rejects review findings that do not name a source project", async (t) => {
    const tempFixture = await writeTempFixture(t, (artifact) => {
      delete artifact.reviewPacket.findings[0].sourceProject;
    });
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", tempFixture],
        {
          cwd: REPO_ROOT,
        },
      ),
    );
  });

  test("rejects dispatch envelopes missing reviewOwner", async (t) => {
    const tempFixture = await writeTempFixture(t, (artifact) => {
      artifact.dispatchEnvelopePacket.reviewOwner = "";
    });
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", tempFixture],
        { cwd: REPO_ROOT },
      ),
    );
  });

  test("rejects dispatch envelopes missing verificationOwner", async (t) => {
    const tempFixture = await writeTempFixture(t, (artifact) => {
      artifact.dispatchEnvelopePacket.verificationOwner = "";
    });
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", tempFixture],
        { cwd: REPO_ROOT },
      ),
    );
  });

  test("rejects missing orchestration task board for non-query flows", async (t) => {
    const tempFixture = await writeTempFixture(t, (artifact) => {
      delete artifact.orchestrationTaskBoardPacket;
    });
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", tempFixture],
        {
          cwd: REPO_ROOT,
        },
      ),
    );
  });

  test("rejects missing capability gap packet when owner creation is required", async (t) => {
    const tempFixture = await writeTempFixture(t, (artifact) => {
      artifact.taskClassification.upgradeReasons = [
        ...artifact.taskClassification.upgradeReasons,
        "owner_creation_required",
      ];
      delete artifact.capabilityGapPacket;
    });
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", tempFixture],
        {
          cwd: REPO_ROOT,
        },
      ),
    );
  });

  test("rejects execution agent card gaps when factory action is create_execution_agent", async (t) => {
    const tempFixture = await writeTempFixture(t, (artifact) => {
      artifact.taskClassification.upgradeReasons = [
        ...artifact.taskClassification.upgradeReasons,
        "owner_creation_required",
      ];
      artifact.capabilityGapPacket = {
        gapId: "gap-001",
        requestedCapability: "topic-analysis",
        currentAgentsChecked: ["meta-prism", "meta-artisan"],
        insufficiencyReason:
          "No execution agent currently owns this business capability.",
        resolutionAction: "create_execution_agent",
        requestedBy: "meta-conductor",
        approvedBy: "meta-warden",
      };
      artifact.executionAgentCard = {
        agentId: "topic-analyst",
        purpose: "Owns topic analysis execution for growth workflows.",
        capabilities: ["topic-clustering", "trend-prioritization"],
        nonCapabilities: ["article-writing"],
        dependencies: ["findskill:topic-analysis"],
        inputs: ["growth goal", "candidate topics"],
        outputs: [],
      };
    });
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", tempFixture],
        {
          cwd: REPO_ROOT,
        },
      ),
    );
  });

  // ── Cross-project flow tests ─────────────────────────────────────────

  test("accepts a valid cross-project run artifact (queryScope=all_projects)", async () => {
    const crossProjectFixture = path.join(
      REPO_ROOT,
      "tests",
      "fixtures",
      "run-artifacts",
      "valid-cross-project-run.json",
    );
    const result = await validateFixture(crossProjectFixture);
    assert.equal(result.ok, true);
  });

  test("rejects cross-project runs that use project_only route", async (t) => {
    const tempFixture = await writeTempFixture(t, (artifact) => {
      artifact.taskClassification.queryScope = "all_projects";
      artifact.taskClassification.crossProjectReason =
        "user_explicit_cross_project_request";
      artifact.dispatchEnvelopePacket.route = "project_only";
      artifact.dispatchEnvelopePacket.memoryMode = "cross_project_readonly";
    });
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", tempFixture],
        {
          cwd: REPO_ROOT,
        },
      ),
    );
  });

  test("rejects cross-project runs that use project_only memoryMode", async (t) => {
    const tempFixture = await writeTempFixture(t, (artifact) => {
      artifact.taskClassification.queryScope = "all_projects";
      artifact.taskClassification.crossProjectReason =
        "user_explicit_cross_project_request";
      artifact.dispatchEnvelopePacket.route = "cross_project";
      artifact.dispatchEnvelopePacket.memoryMode = "project_only";
    });
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", tempFixture],
        {
          cwd: REPO_ROOT,
        },
      ),
    );
  });

  test("rejects current-project runs with cross_project route", async (t) => {
    const tempFixture = await writeTempFixture(t, (artifact) => {
      artifact.dispatchEnvelopePacket.route = "cross_project";
      artifact.dispatchEnvelopePacket.memoryMode = "cross_project_readonly";
    });
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", tempFixture],
        {
          cwd: REPO_ROOT,
        },
      ),
    );
  });

  // ── Cross-project contamination check tests ──────────────────────────

  test("rejects review with crossProjectContaminationCheck=fail but revisionNeeded=false", async (t) => {
    const tempFixture = await writeTempFixture(t, (artifact) => {
      artifact.reviewPacket.crossProjectContaminationCheck = "fail";
      artifact.reviewPacket.revisionNeeded = false;
    });
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", tempFixture],
        {
          cwd: REPO_ROOT,
        },
      ),
    );
  });

  test("rejects summaryPacket.sourceProjects missing a review source project", async (t) => {
    const tempFixture = await writeTempFixture(t, (artifact) => {
      artifact.reviewPacket.sourceProjects = [
        "project-auth-refresh-hardening",
        "project-other",
      ];
      artifact.fetchPacket.projectsChecked = [
        ...artifact.fetchPacket.projectsChecked,
        {
          projectRef: "project-other",
          checkMode: "global_registry_hit",
          reason: "cross-project reference",
        },
      ];
      artifact.summaryPacket.sourceProjects = [
        "project-auth-refresh-hardening",
      ];
    });
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", tempFixture],
        {
          cwd: REPO_ROOT,
        },
      ),
    );
  });

  test("rejects summaryPacket.sourceProjects referencing unchecked projects", async (t) => {
    const tempFixture = await writeTempFixture(t, (artifact) => {
      artifact.summaryPacket.sourceProjects = [
        "project-auth-refresh-hardening",
        "project-never-checked",
      ];
    });
    await assert.rejects(
      execFileAsync(
        "node",
        ["scripts/validate-run-artifact.mjs", tempFixture],
        {
          cwd: REPO_ROOT,
        },
      ),
    );
  });
});
