import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

async function readText(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

test("choice surface policy requires trigger proof rather than artifact-only completion", async () => {
  const policy = await readJson("config/governance/choice-surface-policy.json");
  assert.equal(policy.triggerProofPolicy?.nativeSurfaceAvailableMeansCallIt, true);
  assert.deepEqual(policy.triggerProofPolicy?.primaryRuntimesNoDowngrade, [
    "codex",
    "claude_code",
  ]);
  assert.equal(policy.triggerProofPolicy?.primaryRuntimeUnavailableAction, "block_before_execution");
  assert.equal(policy.triggerProofPolicy?.artifactOnlyIsNotTriggered, true);
  assert.ok(policy.triggerProofPolicy?.completionEvidence.includes("native_tool_answer"));
  assert.ok(policy.triggerProofPolicy?.completionEvidence.includes("deferred_native_tool_call"));
  assert.ok(!policy.triggerProofPolicy?.completionEvidence.includes("conversation_fallback_reason"));
  assert.ok(policy.triggerProofPolicy?.compatibilityOnlyEvidence.includes("conversation_fallback_reason"));
  assert.ok(policy.triggerProofPolicy?.artifactOnlySignals.includes("cardPlanPacket"));
  assert.ok(policy.triggerProofPolicy?.artifactOnlySignals.includes("conversationNotice"));
});

test("runtime contract distinguishes native choice trigger from generated artifacts", async () => {
  const contract = await readJson("config/contracts/workflow-contract.json");
  const policy = contract.runDiscipline?.userInteractionPolicy?.triggerProofPolicy;
  assert.equal(policy?.nativeSurfaceAvailableMeansCallIt, true);
  assert.deepEqual(policy?.primaryRuntimesNoDowngrade, ["codex", "claude_code"]);
  assert.equal(policy?.primaryRuntimeUnavailableAction, "block_before_execution");
  assert.equal(policy?.artifactOnlyIsNotTriggered, true);

  const surfaces = contract.runDiscipline?.runtimeNativeChoiceSurfaces ?? {};
  assert.match(surfaces.codex?.implementation ?? "", /request_user_input/);
  assert.equal(surfaces.codex?.unavailableAction, "block_before_execution");
  assert.deepEqual(surfaces.codex?.fallbackSurfaces, []);
  assert.match(surfaces.codex?.implementation ?? "", /artifact-only|cardPlanPacket/i);
  assert.match(surfaces.claude?.implementation ?? "", /AskUserQuestion/);
  assert.equal(surfaces.claude?.unavailableAction, "block_before_execution");
  assert.deepEqual(surfaces.claude?.fallbackSurfaces, []);
  assert.match(surfaces.claude?.implementation ?? "", /deferred/i);
  assert.doesNotMatch(surfaces.claude?.implementation ?? "", /render a localized chat decision card/i);
  assert.doesNotMatch(surfaces.codex?.implementation ?? "", /render a localized chat decision card/i);
  assert.match(surfaces.codex?.implementation ?? "", /do not continue with conversation_fallback/i);
});

test("Codex and Claude adapters require real native calls and block instead of downgrading", async () => {
  const codex = await readText("canonical/skills/meta-theory/references/runtime-codex.md");
  const claude = await readText("canonical/skills/meta-theory/references/runtime-claude.md");

  assert.match(codex, /must call `request_user_input`/);
  assert.match(codex, /block instead of treating a chat card as an accepted Codex decision/);
  assert.match(codex, /cardPlanPacket[\s\S]*not evidence/i);
  assert.match(claude, /must call `AskUserQuestion`/);
  assert.match(claude, /deferred `AskUserQuestion` tool call/i);
  assert.match(claude, /Missing native proof blocks the run/);
  assert.doesNotMatch(codex, /fall back once/i);
  assert.doesNotMatch(claude, /Fall back to `conversation_fallback`/i);
});

test("generated card plans mark choice cards as adapter-required, not native-triggered", async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "meta-kim-choice-surface-"));
  const runId = "choice-surface-trigger-test";
  try {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/run-meta-theory-governed-execution.mjs",
        "Build a governed feature and choose between two implementation scopes.",
        runId,
        "--state-dir",
        tempDir,
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);

    const artifact = JSON.parse(await readFile(path.join(tempDir, `${runId}.json`), "utf8"));
    const choiceCards = artifact.cardPlanPacket.cards.filter((card) =>
      ["clarify", "options"].includes(card.cardKey),
    );

    assert.ok(choiceCards.length >= 2);
    for (const card of choiceCards) {
      assert.equal(card.choiceSurfaceDelivery, "adapter_required_not_triggered_by_artifact");
      assert.match(card.choiceSurfaceTriggerProof, /not a native popup/i);
      assert.match(card.choiceSurfaceTriggerProof, /native tool call/i);
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
