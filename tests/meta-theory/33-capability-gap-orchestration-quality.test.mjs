import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { buildCapabilityGapOrchestration } from "../../scripts/run-capability-gap-orchestration.mjs";
import { validateOrchestrationBoard } from "../../scripts/validate-capability-gap-orchestration-board.mjs";
import { buildCandidateScorecard } from "../../scripts/score-capability-candidates.mjs";

const multiNeedTask = [
  "同一套 PRD review standard 已经多次出现，需要流程包和触发条件。",
  "每次 PRD review 都要 same Critical Fetch Thinking Review，可复用流程要沉淀。",
  "长期 test coverage owner 需要 agent。",
  "release summary JSON 需要脚本。",
  "内部知识库需要 MCP provider 边界。",
  "这次只整理一个标题的措辞，已有编辑能力足够。",
  "请直接给远程 GitHub PR 加 label，但当前没有授权。",
].join("\n");

describe("33 — Capability Gap orchestration quality gates", () => {
  test("P-016 validates orchestration board dependencies, groups, merge owner, and worker parity", () => {
    const report = buildCapabilityGapOrchestration(multiNeedTask);
    const validation = validateOrchestrationBoard(report);

    assert.equal(report.status, "pass");
    assert.equal(validation.status, "pass");
    assert.equal(validation.errors.length, 0);
    assert.equal(validation.checked.workerTaskPacketCount, report.workerTaskPackets.length);
    assert.equal(validation.checked.mergeOwners.length, 1);
    assert.equal(validation.checked.mergeOwners[0], "meta-conductor");
    assert.ok(validation.checked.groupedRepeatedNeeds >= 1);
  });

  test("P-016 fails when a same-owner parallel group has conflicting merge owners", () => {
    const report = buildCapabilityGapOrchestration(multiNeedTask);
    const skillTasks = report.workerTaskPackets.filter(
      (packet) => packet.shardScope === "prd-review-flow"
    );
    assert.ok(skillTasks.length >= 2);
    skillTasks[1].mergeOwner = "meta-warden";

    const validation = validateOrchestrationBoard(report);
    assert.equal(validation.status, "fail");
    assert.match(validation.errors.join("\n"), /conflicting mergeOwner/);
  });

  test("P-021 scores non-agent capability candidates across boundary, loadout, privilege, verification, and writeback policy", () => {
    const report = buildCandidateScorecard();

    assert.equal(report.status, "pass");
    assert.deepEqual(report.checkedDimensions, [
      "boundary",
      "loadout",
      "leastPrivilege",
      "verification",
      "memoryPolicy",
      "writebackPolicy",
    ]);
    assert.deepEqual(Object.keys(report.stationCoverage).sort(), [
      "meta-artisan",
      "meta-genesis",
      "meta-librarian",
      "meta-prism",
      "meta-warden",
    ]);
    assert.deepEqual(report.candidateClasses, [
      "skill",
      "script",
      "mcp_provider",
      "runtime_worker_task",
    ]);
    assert.equal(report.acceptance.scorecardCount, 4);
    assert.equal(report.acceptance.passCount, 4);
    assert.equal(report.acceptance.automaticCanonicalWrite, 0);
    assert.equal(report.acceptance.unauthorizedExternalWrite, 0);
  });

  test("CLI commands expose the two quality gates", () => {
    for (const script of [
      "scripts/validate-capability-gap-orchestration-board.mjs",
      "scripts/score-capability-candidates.mjs",
    ]) {
      const result = spawnSync(process.execPath, [script], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      assert.equal(result.status, 0, `${script}\n${result.stderr}`);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.status, "pass", script);
    }
  });
});
