#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { assert, exists, readJson, repoPath } from "./governance-lib.mjs";

const CONTRACT_PATH = "config/contracts/prompt-first-full-flow-stage-contract.json";
const contract = await readJson(CONTRACT_PATH);
const coreLoop = await readJson("config/contracts/core-loop-contract.json");
const pkg = await readJson("package.json");
if (!(await exists(repoPath("docs/ai-native-capability-gap-mvp-prd.zh-CN.md")))) {
  console.log(JSON.stringify({
    status: "pass",
    validationStatus: "private_evidence_not_attached",
    requiredForPublicValidation: false,
    privateEvidenceMissing: ["docs/ai-native-capability-gap-mvp-prd.zh-CN.md"],
  }, null, 2));
  process.exit(0);
}
const prd = await fs.readFile(repoPath("docs/ai-native-capability-gap-mvp-prd.zh-CN.md"), "utf8");

const EXPECTED_STAGE_IDS = [
  "prompt_intake",
  "critical",
  "fetch",
  "thinking",
  "execution",
  "review",
  "meta_review",
  "verification",
  "evolution",
];

const REQUIRED_GLOBAL_RULES = [
  "sameFrameworkPromptRequired",
  "missingRequiredContentTarget",
  "commandPassIsNotUserGoalDone",
  "configSmokeOrBoardIsNotLiveProof",
  "planningFilesUpdateOnly",
  "capabilityDiscoveryBeforeExecution",
  "reviewBeforeVerification",
  "noOverclaimBeforeLiveEvidence",
  "mustPreserveRuntimeNativeAbilities",
];

const REQUIRED_CONFLICT_RULES = [
  "same-framework-prompt",
  "planning-files-update-only",
  "capability-discovery-before-execution",
  "board-not-live-proof",
  "worker-evidence-required",
  "review-meta-review-required",
];

function hasAll(text, markers, label) {
  for (const marker of markers) {
    assert(text.includes(marker), `${label} missing ${marker}`);
  }
}

assert(contract.contractId === "prompt-first-full-flow-stage-contract", "wrong contract id");
assert(contract.prdTaskId === "P-086", "P-086 must own prompt-first full-flow stage contract");
assert(contract.status === "contract_ready", "P-086 contract must be contract_ready");
assert(contract.owner === "meta-genesis", "P-086 owner must be meta-genesis");
assert(contract.reviewOwner === "meta-prism", "P-086 review owner must be meta-prism");
assert(contract.verificationOwner === "verify", "P-086 verification owner must be verify");
assert(Array.isArray(contract.primaryRuntimeTier) && contract.primaryRuntimeTier.includes("claude_code") && contract.primaryRuntimeTier.includes("codex"), "P-086 must keep Claude Code and Codex primary");
assert(Array.isArray(contract.compatibilityRuntimeTier) && contract.compatibilityRuntimeTier.includes("cursor") && contract.compatibilityRuntimeTier.includes("openclaw"), "P-086 must keep Cursor/OpenClaw compatibility tier");

for (const rule of REQUIRED_GLOBAL_RULES) {
  assert(Object.hasOwn(contract.globalRules ?? {}, rule), `globalRules missing ${rule}`);
}
assert(contract.globalRules.missingRequiredContentTarget === 0, "missingRequiredContentTarget must be 0");
assert(contract.globalRules.sameFrameworkPromptRequired === true, "sameFrameworkPromptRequired must be true");
assert(contract.globalRules.configSmokeOrBoardIsNotLiveProof === true, "config/smoke/board cannot be live proof");

const conflictIds = new Set((contract.hardConflictRules ?? []).map((rule) => rule.id));
for (const ruleId of REQUIRED_CONFLICT_RULES) {
  assert(conflictIds.has(ruleId), `hardConflictRules missing ${ruleId}`);
}

const stages = contract.stages ?? [];
assert(stages.length === EXPECTED_STAGE_IDS.length, `expected ${EXPECTED_STAGE_IDS.length} prompt-first stages`);
const stageIds = stages.map((stage) => stage.stageId);
for (const stageId of EXPECTED_STAGE_IDS) {
  assert(stageIds.includes(stageId), `missing stage ${stageId}`);
}
assert(stageIds.join("|") === EXPECTED_STAGE_IDS.join("|"), "stage order must be Prompt intake then Critical..Evolution");

for (const stage of stages) {
  for (const field of ["stageId", "stageName", "owner", "requiredInputs", "requiredOutputs", "passCondition", "failConditions", "returnToStage", "evidenceRequirements"]) {
    assert(stage[field] !== undefined && stage[field] !== "", `${stage.stageId ?? "stage"} missing ${field}`);
  }
  assert(Array.isArray(stage.requiredInputs) && stage.requiredInputs.length > 0, `${stage.stageId} missing requiredInputs`);
  assert(Array.isArray(stage.requiredOutputs) && stage.requiredOutputs.length > 0, `${stage.stageId} missing requiredOutputs`);
  assert(Array.isArray(stage.failConditions) && stage.failConditions.length > 0, `${stage.stageId} missing failConditions`);
  assert(Array.isArray(stage.evidenceRequirements) && stage.evidenceRequirements.length > 0, `${stage.stageId} missing evidenceRequirements`);
  assert(stage.returnToStage, `${stage.stageId} missing returnToStage`);
}

const promptIntake = stages.find((stage) => stage.stageId === "prompt_intake");
hasAll(promptIntake.requiredOutputs.join("\n"), [
  "frameworkPromptPacket.promptId",
  "frameworkPromptPacket.userOutcome",
  "frameworkPromptPacket.contextPolicy",
  "frameworkPromptPacket.outputContract",
  "frameworkPromptPacket.toolAndDataPolicy",
  "frameworkPromptPacket.runtimeTargets",
  "frameworkPromptPacket.evalPlan",
], "Prompt intake required outputs");

const coreStages = new Set((coreLoop.defaultEntry?.spine ?? []).map((stage) => stage.toLowerCase().replace(/-/g, "_")));
for (const stageId of EXPECTED_STAGE_IDS.slice(1)) {
  assert(coreStages.has(stageId), `core-loop contract missing ${stageId}`);
}

hasAll(JSON.stringify(contract), [
  "intentPacket.realIntent",
  "fetchPacket.capabilityDiscovery.searchLog",
  "thinkingPacket.workerTaskPackets",
  "executionResult.workerResultPackets",
  "executionResult.workerExecutionEvidence",
  "reviewPacket.upstreamQuality",
  "metaReviewPacket.overclaimCheck",
  "verificationResult.userGoalDone",
  "evolutionWritebackDecision",
], "P-086 contract packet coverage");

assert(pkg.scripts?.["meta:prd:prompt-first-flow:validate"]?.includes("validate-prompt-first-full-flow-stage-contract.mjs"), "package.json missing meta:prd:prompt-first-flow:validate");
assert(`${pkg.scripts?.["meta:verify:governance"] ?? ""} ${pkg.scripts?.["meta:verify:governance:core"] ?? ""}`.includes("meta:prd:prompt-first-flow:validate"), "meta:verify:governance must include P-086 validator");

hasAll(prd, [
  "版本：v0.46",
  "v0.46 P-086 Prompt-First Full-Flow Stage Requirement Contract",
  "promptFirstFullFlowStageRequirementPacket",
  CONTRACT_PATH,
  "meta:prd:prompt-first-flow:validate",
  "P-086 已测通",
  "contract_ready",
  "Prompt intake",
  "frameworkPromptPacket",
  "missingRequiredContentCount = 0",
  "sameFrameworkPromptRequired",
  "P-087",
  "P-088",
  "仍不能宣称 Claude Code + Codex prompt-first full-flow live execution 已 release-grade 完成",
], "unique PRD v0.46");

console.log(`prompt-first full-flow stage contract valid: ${stages.length} stages, missingRequiredContentTarget=${contract.globalRules.missingRequiredContentTarget}`);
