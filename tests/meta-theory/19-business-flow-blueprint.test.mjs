import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  REPO_ROOT,
  loadMetaTheoryCorpus,
  readFile,
  readJson,
} from "./_helpers.mjs";

const execFileAsync = promisify(execFile);

const businessRoleExamples = [
  "frontend",
  "backend",
  "test",
  "review",
  "analysis",
  "verify",
  "docs",
];

function lane(laneId, owner = "meta-conductor") {
  return {
    laneId,
    businessLane: laneId,
    capabilityNeed: `${laneId} capability`,
    capabilitySearchQuery: `${laneId} capability owner`,
    candidateOwners: [owner],
    candidateSkills: ["meta-theory"],
    matchedCapabilities: [
      {
        matchId: `${laneId}-capability-match`,
        capabilitySlot: `${laneId}_capability`,
        bindingType: "skill",
        bindingRef: "meta-theory",
        source: "config/capability-index/meta-kim-capabilities.json",
        confidenceScore: 0.91,
        selectionReason: `${owner} is selected by capability-first scan`,
        selectionScope: "run_scoped",
        persistencePolicy: "do_not_persist_to_agent_identity",
        fallback: "capabilityGapPacket",
      },
    ],
    capabilityBindings: [
      {
        bindingId: `${laneId}-capability-binding`,
        capabilitySlot: `${laneId}_capability`,
        bindingType: "skill",
        bindingRef: "meta-theory",
        source: "config/capability-index/meta-kim-capabilities.json",
        evidenceRef: `${laneId}-capability-match`,
      },
    ],
    selectedOwner: owner,
    selectionReason: `${owner} is selected by capability-first scan`,
    coverageStatus: "covered",
  };
}

async function writeTempArtifact(mutator) {
  const artifact = await readJson("tests/fixtures/run-artifacts/valid-run.json");
  mutator(artifact);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "meta-kim-run-artifact-"));
  const file = path.join(dir, "artifact.json");
  await fs.writeFile(file, JSON.stringify(artifact, null, 2));
  return { dir, file };
}

async function validateRunArtifact(file) {
  return execFileAsync("node", ["scripts/validate-run-artifact.mjs", file], {
    cwd: REPO_ROOT,
  });
}

describe("business-flow blueprint orchestration", async () => {
  const { skill, devGov, combined } = await loadMetaTheoryCorpus();
  const contract = await readJson("config/contracts/workflow-contract.json");
  const conductor = await readFile("canonical/agents/meta-conductor.md");

  test("Fetch expands executable deliverables into a business-flow capability matrix", () => {
    assert.match(skill, /Business-flow capability matrix/i);
    assert.match(devGov, /Step 1\.7.*Business-flow capability matrix/s);
    for (const lane of [
      "product",
      "UX",
      "UI",
      "frontend",
      "backend",
      "database",
      "motion",
      "accessibility",
      "browser QA",
      "performance",
      "feedback",
      "evolution",
    ]) {
      assert.match(combined, new RegExp(lane, "i"), `missing lane ${lane}`);
    }
  });

  test("Thinking requires businessFlowBlueprintPacket before agent and worker packets", () => {
    const requiredPackets =
      contract.runDiscipline?.protocolFirst?.requiredPackets ?? [];
    assert.ok(requiredPackets.includes("businessFlowBlueprintPacket"));
    assert.ok(requiredPackets.includes("agentBlueprintPacket"));
    assert.ok(
      requiredPackets.indexOf("businessFlowBlueprintPacket") <
        requiredPackets.indexOf("workerTaskPacket"),
      "businessFlowBlueprintPacket must precede workerTaskPacket",
    );
    assert.ok(
      requiredPackets.indexOf("agentBlueprintPacket") <
        requiredPackets.indexOf("workerTaskPacket"),
      "agentBlueprintPacket must precede workerTaskPacket",
    );
    assert.ok(contract.protocols?.businessFlowBlueprintPacket);
    assert.ok(contract.protocols?.agentBlueprintPacket);
  });

  test("business flow contract covers release/install and runtime package lanes", () => {
    const protocol = contract.protocols?.businessFlowBlueprintPacket ?? {};

    for (const deliverableType of ["runtime_package", "install_release"]) {
      assert.ok(
        protocol.deliverableTypeEnum?.includes(deliverableType),
        `deliverableTypeEnum must include ${deliverableType}`,
      );
    }

    for (const laneId of ["release", "install", "runtime_package"]) {
      assert.ok(
        protocol.releaseInstallLaneIds?.includes(laneId),
        `releaseInstallLaneIds must include ${laneId}`,
      );
    }
  });

  test("business flow contract covers internal and third-party interface integration lanes", () => {
    const protocol = contract.protocols?.businessFlowBlueprintPacket ?? {};

    for (const deliverableType of [
      "internal_api_integration",
      "third_party_integration",
    ]) {
      assert.ok(
        protocol.deliverableTypeEnum?.includes(deliverableType),
        `deliverableTypeEnum must include ${deliverableType}`,
      );
    }

    for (const laneId of [
      "interface_contract",
      "provider_adapter",
      "permission",
      "contract_test",
      "observability",
      "rollout_rollback",
    ]) {
      assert.ok(
        protocol.interfaceIntegrationLaneIds?.includes(laneId),
        `interfaceIntegrationLaneIds must include ${laneId}`,
      );
    }

    assert.match(combined, /Interface Integration Contract Layer/i);
    assert.match(combined, /interfaceIntegrationContractPacket/i);
    assert.match(combined, /third_party_integration/i);
    assert.match(combined, /blocking_unknown/i);
    assert.match(combined, /auth\/signature/i);
  });

  test("product gate policy defines abstract design-time dimensions", () => {
    const policy =
      contract.runDiscipline?.productDeliverableGatePolicy ?? {};
    const catalog = policy.designDimensionCatalog ?? [];
    const dimensionIds = catalog.map((dimension) => dimension.dimensionId);

    for (const dimensionId of [
      "core_highlight",
      "feature_completeness",
      "ui_ue_ux",
      "media_audio_motion",
      "api_contract",
      "frontend_backend_contract",
      "third_party_integration",
      "file_management_extensibility",
      "directory_structure",
      "real_test_strategy",
      "evolution_path",
      "dead_redundant_cleanup",
    ]) {
      assert.ok(
        dimensionIds.includes(dimensionId),
        `designDimensionCatalog must include ${dimensionId}`,
      );
    }

    for (const dimension of catalog) {
      assert.equal(
        typeof dimension.dimensionId,
        "string",
        "dimensionId must be a stable abstract id",
      );
      assert.equal(
        typeof dimension.packet,
        "string",
        "dimension packet owner must be explicit",
      );
      assert.ok(
        Array.isArray(dimension.applicableDeliverableTypes),
        "dimension applicability must be deliverable-type driven",
      );
    }
  });

  test("agent blueprint contract forbids fixed concrete child skills in long-term identity", () => {
    const policy =
      contract.protocols?.agentBlueprintPacket?.longTermCapabilityPolicy ?? {};

    assert.equal(policy.forbidConcreteSkillInLongTermAgentIdentity, true);
    assert.equal(policy.selectedSkillScope, "run_only");
    for (const provider of [
      "agent-teams-playbook",
      "superpowers",
      "ecc",
      "findskill",
    ]) {
      assert.ok(
        policy.allowedMetaSkillProviders?.includes(provider),
        `${provider} must remain allowed as a meta-skill package provider`,
      );
    }
    assert.ok(Array.isArray(policy.forbiddenConcreteSkillPatterns));
    assert.ok(policy.forbiddenConcreteSkillPatterns.length >= 1);
  });

  test("user-visible agent names must be short business role names, not runtime nicknames", () => {
    const namingPolicy = contract.protocols?.agentBlueprintPacket?.namingPolicy;
    assert.equal(namingPolicy?.businessSemanticNamesOnly, true);
    assert.equal(namingPolicy?.shortRoleNamesRequired, true);
    assert.equal(namingPolicy?.runtimeNicknamesAreAliasesOnly, true);
    assert.match(combined, /runtimeInstanceAlias/i);
    assert.match(combined, /random personal aliases/i);
    assert.match(combined, /short business role/i);
    for (const example of businessRoleExamples) {
      assert.match(combined, new RegExp(example, "i"), `missing ${example}`);
    }
    for (const overScopedExample of ["backend-login", "test-install"]) {
      assert.doesNotMatch(
        combined,
        new RegExp(overScopedExample, "i"),
        `over-scoped roleDisplayName example should be removed: ${overScopedExample}`,
      );
    }
  });

  test("run artifact validation rejects scoped work items as visible role names", async () => {
    const { dir, file } = await writeTempArtifact((artifact) => {
      artifact.agentBlueprintPacket.roles[0].roleDisplayName = "backend-login";
      artifact.workerTaskPackets[0].roleDisplayName = "backend-login";
    });
    try {
      await assert.rejects(
        validateRunArtifact(file),
        /roleDisplayName must stay at role-family level/,
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test("workerTaskPacket separates role display name, owner agent, and runtime alias", () => {
    const fields = contract.protocols?.workerTaskPacket?.requiredFields ?? [];
    for (const field of [
      "ownerAgent",
      "businessRoleId",
      "roleDisplayName",
      "roleInstanceId",
      "runtimeInstanceAlias",
    ]) {
      assert.ok(fields.includes(field), `workerTaskPacket missing ${field}`);
    }
  });

  test("same owner multi-instance parallelism requires shard and merge evidence", () => {
    const fields = contract.protocols?.workerTaskPacket?.requiredFields ?? [];
    for (const field of [
      "shardKey",
      "shardScope",
      "workspaceIsolation",
      "artifactNamespace",
      "collisionPolicy",
      "parallelGroup",
      "mergeOwner",
    ]) {
      assert.ok(fields.includes(field), `workerTaskPacket missing ${field}`);
    }
    const policy = contract.protocols?.workerTaskPacket?.sameOwnerMultiInstancePolicy;
    assert.equal(policy?.allowed, true);
    assert.match(combined, /fake parallelism|伪并行/i);
  });

  test("run artifact validation accepts scoped web_app lane coverage without fixed lane enumeration", async () => {
    const { dir, file } = await writeTempArtifact((artifact) => {
      artifact.businessFlowBlueprintPacket.deliverableType = "web_app";
      artifact.businessFlowBlueprintPacket.requiredLanes = [
        lane("product"),
        lane("frontend", "meta-conductor"),
      ];
      artifact.businessFlowBlueprintPacket.optionalLanes = [];
      artifact.businessFlowBlueprintPacket.omittedLanes = [
        {
          laneId: "backend",
          reason: "static web surface; no server behavior changes requested",
          coverageStatus: "omitted_with_reason",
        },
      ];
      artifact.businessFlowBlueprintPacket.coverageJudgment = "intentionally_reduced";
      artifact.agentBlueprintPacket.roles[0].assignedResponsibilitySlice = [
        "product",
        "frontend",
      ];
    });
    try {
      const { stdout } = await validateRunArtifact(file);
      const result = JSON.parse(stdout);
      assert.equal(result.ok, true);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test("run artifact validation rejects string namingPolicy", async () => {
    const { dir, file } = await writeTempArtifact((artifact) => {
      artifact.agentBlueprintPacket.namingPolicy =
        "business-readable names required; runtime nicknames are aliases only";
    });
    try {
      await assert.rejects(
        validateRunArtifact(file),
        /agentBlueprintPacket\.namingPolicy must be an object/,
      );
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  test("run artifact validation accepts same owner multi-shard packets", async () => {
    const { stdout } = await validateRunArtifact(
      "tests/fixtures/run-artifacts/valid-run-same-owner-shards.json",
    );
    const result = JSON.parse(stdout);
    assert.equal(result.ok, true);
  });

  test("run artifact validation rejects overlapping same-owner shards", async () => {
    await assert.rejects(
      validateRunArtifact(
        "tests/fixtures/run-artifacts/invalid-run-same-owner-overlap.json",
      ),
      /same ownerAgent meta-conductor in parallelGroup auth-parallel must use one mergeOwner/,
    );
  });

  test("Conductor owns blueprints but not skill loadout or execution", () => {
    assert.match(conductor, /business-flow blueprint ownership/i);
    assert.match(conductor, /agent role blueprint ownership/i);
    assert.match(conductor, /named skill\/tool loadout per agent/i);
    assert.match(conductor, /does NOT perform execution work/i);
  });
});
