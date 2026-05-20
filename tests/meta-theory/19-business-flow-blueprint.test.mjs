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
  "frontend-home-page",
  "database-schema",
  "ux-flow-review",
  "browser-qa-mobile",
  "security-auth-review",
];

function lane(laneId, owner = "meta-conductor") {
  return {
    laneId,
    businessLane: laneId,
    capabilityNeed: `${laneId} capability`,
    capabilitySearchQuery: `${laneId} capability owner`,
    candidateOwners: [owner],
    candidateSkills: ["meta-theory"],
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

  test("user-visible agent names must be business-readable, not runtime nicknames", () => {
    const namingPolicy = contract.protocols?.agentBlueprintPacket?.namingPolicy;
    assert.equal(namingPolicy?.businessSemanticNamesOnly, true);
    assert.equal(namingPolicy?.runtimeNicknamesAreAliasesOnly, true);
    assert.match(combined, /runtimeInstanceAlias/i);
    assert.match(combined, /random personal aliases/i);
    for (const example of businessRoleExamples) {
      assert.match(combined, new RegExp(example, "i"), `missing ${example}`);
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

  test("run artifact validation rejects incomplete web_app lane coverage", async () => {
    const { dir, file } = await writeTempArtifact((artifact) => {
      artifact.businessFlowBlueprintPacket.deliverableType = "web_app";
      artifact.businessFlowBlueprintPacket.requiredLanes = [
        lane("product"),
        lane("frontend", "auth-specialist"),
      ];
      artifact.businessFlowBlueprintPacket.optionalLanes = [];
      artifact.businessFlowBlueprintPacket.omittedLanes = [];
      artifact.businessFlowBlueprintPacket.coverageJudgment = "complete";
      artifact.agentBlueprintPacket.roles[0].assignedResponsibilitySlice = [
        "product",
        "frontend",
      ];
    });
    try {
      await assert.rejects(
        validateRunArtifact(file),
        /web_app deliverable must cover lane "ux"/,
      );
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
      /same ownerAgent auth-specialist in parallelGroup auth-parallel must use one mergeOwner/,
    );
  });

  test("Conductor owns blueprints but not skill loadout or execution", () => {
    assert.match(conductor, /business-flow blueprint ownership/i);
    assert.match(conductor, /agent role blueprint ownership/i);
    assert.match(conductor, /named skill\/tool loadout per agent/i);
    assert.match(conductor, /does NOT perform execution work/i);
  });
});
