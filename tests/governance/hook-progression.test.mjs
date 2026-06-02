import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const requiredBlock = {
  hookId: "enforce-agent-dispatch",
  blockReason: "missing dispatchBoard",
  severity: "high",
  blockedAction: "apply_patch",
  blockedStage: "Execution",
  missingRequirement: "dispatchBoard",
  requiredPacket: "dispatchBoard",
  returnToStage: "Thinking",
  repairOwner: "meta-conductor",
  repairAction: "complete owner + weapon + verification route before mutation",
  allowedNextAction: "read files and update dispatchBoard",
  forbiddenRetry: "retry apply_patch unchanged",
  exampleFix: "add dispatchBoard with owner, weapon, runtime, OS, verificationOwner",
  whetherUserApprovalCanOverride: false,
  whetherThisBlocksPublicReady: true,
};

function validPolicy(overrides = {}) {
  return {
    role: "last_resort_fuse",
    preflightFirst: true,
    hookMustNotReplacePreflight: true,
    readOnlyFetchPolicy: {
      mustNotBlock: true,
      allowedActions: ["read_file", "repo_search", "git_status", "config_scan", "capability_scan", "dependency_discovery"],
    },
    requiredPreflightChecks: ["realIntent", "successCriteria", "fetchEvidence", "capabilityDiscovery", "owner", "ownerLoadout", "abstractPrompt", "memoryStrategy", "runtimeMatrix", "osMatrix", "reviewStandard"],
    optionalValidatorChecks: ["nonGoals", "dependencyRegistry", "weaponRegistry", "weapon", "verificationOwner", "verificationPlan", "rollbackPath", "warningsClassified", "writebackDecisionReserved"],
    blockOutputRequiredFields: Object.keys(requiredBlock),
    warningClassificationRequired: true,
    warningClasses: ["BLOCKING_WARNING", "FIXABLE_WARNING", "ENVIRONMENT_WARNING", "EXPECTED_WARNING", "DEPRECATED_WARNING", "NOISE_WARNING"],
    progression: {
      maxSameReasonConsecutiveBlocksBeforeRepairMode: 1,
      sameReasonSecondBlockAction: "enter_hookRepairMode",
      maxSameHookBlocksBeforeStop: 2,
      maxRunHookBlocksBeforeGovernanceFailure: 3,
      unchangedRetryForbidden: true,
      hookBlockMustNotBeSilent: true,
    },
    hookRepairMode: {
      required: true,
      steps: ["read_hook_output", "identify_root_cause", "return_to_stage", "modify_preflight_or_packet", "retry_with_changed_action_only"],
      forbidden: ["retry_same_command_unchanged", "ignore_block_reason"],
    },
    hookFailurePacket: {
      requiredFields: ["hookId", "repeatedReason", "attemptedActions", "returnToStage", "repairOwner", "repairAction", "publicReadyImpact"],
    },
    hookBlockRate: {
      acceptableMax: 0.05,
      publicReadyBlockAbove: 0.15,
      publicReadyBlockWhenUnresolvedRepeatedBlock: true,
      publicReadyBlockWhenWarningsUnclassified: true,
    },
    publicReadyGate: {
      blocksWhen: ["hookBlockRateAboveThreshold", "unresolvedHookBlock", "unchangedRetryAfterHookBlock", "hookWarningUnclassified", "preflightMissingOrBypassed"],
    },
    ...overrides,
  };
}

function runWith(policy) {
  const dir = mkdtempSync(path.join(tmpdir(), "meta-kim-hook-"));
  const file = path.join(dir, "policy.json");
  writeFileSync(file, JSON.stringify(policy));
  const result = spawnSync(process.execPath, ["scripts/validate-hook-progression.mjs", "--input", file], { encoding: "utf8" });
  rmSync(dir, { recursive: true, force: true });
  return result;
}

test("good hook output passes", () => {
  const result = runWith(validPolicy({ sampleHookOutput: requiredBlock }));
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("vague hook output fails", () => {
  const result = runWith(validPolicy({ sampleHookOutput: { hookId: "x", blockReason: "blocked" } }));
  assert.notEqual(result.status, 0);
});

test("repeated block requires hookRepairMode", () => {
  const result = runWith(validPolicy({
    sampleRun: {
      attemptedMutatingActions: 10,
      blocks: [requiredBlock, requiredBlock],
      hookRepairModeEntered: false,
      publicReady: false,
      warnings: [],
    },
  }));
  assert.notEqual(result.status, 0);
});

test("hookBlockRate above threshold blocks public-ready", () => {
  const result = runWith(validPolicy({
    sampleRun: {
      attemptedMutatingActions: 4,
      blocks: [requiredBlock],
      hookRepairModeEntered: false,
      publicReady: true,
      warnings: [],
    },
  }));
  assert.notEqual(result.status, 0);
});

test("read-only Fetch should not be blocked by policy", () => {
  const result = runWith(validPolicy());
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("same blocked action cannot be retried unchanged", () => {
  const result = runWith(validPolicy({
    sampleRun: {
      attemptedMutatingActions: 10,
      blocks: [requiredBlock, requiredBlock],
      hookRepairModeEntered: true,
      unchangedRetryAttempted: true,
      publicReady: false,
      warnings: [],
    },
  }));
  assert.notEqual(result.status, 0);
});

test("hook warning without classification blocks public-ready", () => {
  const result = runWith(validPolicy({
    sampleRun: {
      attemptedMutatingActions: 10,
      blocks: [],
      publicReady: true,
      warnings: [{ id: "w1", message: "warning" }],
    },
  }));
  assert.notEqual(result.status, 0);
});

test("preflight fail returns to stage instead of Hook loop", () => {
  const result = runWith(validPolicy({
    sampleRun: {
      attemptedMutatingActions: 0,
      blocks: [],
      preflightFailed: true,
      hookLoopAttempted: true,
      publicReady: false,
      warnings: [],
    },
  }));
  assert.notEqual(result.status, 0);
});
