#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { assert, readJson, repoPath } from "./governance-lib.mjs";

const args = process.argv.slice(2);
const inputIndex = args.indexOf("--input");
const inputPath = inputIndex >= 0 ? args[inputIndex + 1] : null;

const REQUIRED_BLOCK_FIELDS = [
  "hookId",
  "blockReason",
  "severity",
  "blockedAction",
  "blockedStage",
  "missingRequirement",
  "requiredPacket",
  "returnToStage",
  "repairOwner",
  "repairAction",
  "allowedNextAction",
  "forbiddenRetry",
  "exampleFix",
  "whetherUserApprovalCanOverride",
  "whetherThisBlocksPublicReady",
];

const REQUIRED_WARNING_CLASSES = [
  "BLOCKING_WARNING",
  "FIXABLE_WARNING",
  "ENVIRONMENT_WARNING",
  "EXPECTED_WARNING",
  "DEPRECATED_WARNING",
  "NOISE_WARNING",
];

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasAll(container, required, label) {
  for (const item of required) {
    assert(container?.includes(item), `${label} missing ${item}`);
  }
}

function validatePolicy(policy) {
  assert(policy.role === "last_resort_fuse", "Hook policy must define hooks as last_resort_fuse");
  assert(policy.preflightFirst === true, "Preflight must run before Hook");
  assert(policy.hookMustNotReplacePreflight === true, "Hook must not replace preflight");
  assert(policy.readOnlyFetchPolicy?.mustNotBlock === true, "Read-only Fetch must not be blocked");
  hasAll(policy.readOnlyFetchPolicy?.allowedActions ?? [], ["read_file", "repo_search", "git_status", "config_scan", "capability_scan", "dependency_discovery"], "readOnlyFetchPolicy.allowedActions");
  hasAll(policy.requiredPreflightChecks ?? [], ["realIntent", "successCriteria", "fetchEvidence", "capabilityDiscovery", "owner", "ownerLoadout", "abstractPrompt", "memoryStrategy", "runtimeMatrix", "osMatrix", "reviewStandard"], "requiredPreflightChecks");
  hasAll(policy.optionalValidatorChecks ?? [], ["nonGoals", "dependencyRegistry", "weaponRegistry", "weapon", "verificationOwner", "verificationPlan", "rollbackPath", "warningsClassified", "writebackDecisionReserved"], "optionalValidatorChecks");
  hasAll(policy.blockOutputRequiredFields ?? [], REQUIRED_BLOCK_FIELDS, "blockOutputRequiredFields");
  assert(policy.warningClassificationRequired === true, "Hook warning classification must be required");
  hasAll(policy.warningClasses ?? [], REQUIRED_WARNING_CLASSES, "warningClasses");

  const progression = policy.progression ?? {};
  assert(progression.maxSameReasonConsecutiveBlocksBeforeRepairMode === 1, "Second same-reason block must enter repair mode");
  assert(progression.sameReasonSecondBlockAction === "enter_hookRepairMode", "Repeated block must trigger hookRepairMode");
  assert(progression.maxSameHookBlocksBeforeStop <= 2, "Same Hook may not block more than twice before stop");
  assert(progression.maxRunHookBlocksBeforeGovernanceFailure <= 3, "Run must fail governance after more than three Hook blocks");
  assert(progression.unchangedRetryForbidden === true, "Unchanged retry after Hook block must be forbidden");
  assert(progression.hookBlockMustNotBeSilent === true, "Hook block must not be silent");

  const repair = policy.hookRepairMode ?? {};
  assert(repair.required === true, "hookRepairMode is required");
  hasAll(repair.steps ?? [], ["read_hook_output", "identify_root_cause", "return_to_stage", "modify_preflight_or_packet", "retry_with_changed_action_only"], "hookRepairMode.steps");
  hasAll(repair.forbidden ?? [], ["retry_same_command_unchanged", "ignore_block_reason"], "hookRepairMode.forbidden");

  hasAll(policy.hookFailurePacket?.requiredFields ?? [], ["hookId", "repeatedReason", "attemptedActions", "returnToStage", "repairOwner", "repairAction", "publicReadyImpact"], "hookFailurePacket.requiredFields");

  const rate = policy.hookBlockRate ?? {};
  assert(rate.acceptableMax <= 0.05, "hookBlockRate acceptableMax must be <= 5%");
  assert(rate.publicReadyBlockAbove <= 0.15, "hookBlockRate above 15% must block public-ready");
  assert(rate.publicReadyBlockWhenUnresolvedRepeatedBlock === true, "Unresolved repeated Hook block must block public-ready");
  assert(rate.publicReadyBlockWhenWarningsUnclassified === true, "Unclassified Hook warning must block public-ready");
  hasAll(policy.publicReadyGate?.blocksWhen ?? [], ["hookBlockRateAboveThreshold", "unresolvedHookBlock", "unchangedRetryAfterHookBlock", "hookWarningUnclassified", "preflightMissingOrBypassed"], "publicReadyGate.blocksWhen");
}

function validateHookOutput(output, policy) {
  hasAll(Object.keys(output ?? {}), policy.blockOutputRequiredFields, "hook block output");
  for (const field of policy.blockOutputRequiredFields) {
    assert(output[field] !== undefined && output[field] !== null && output[field] !== "", `hook block output ${field} must be non-empty`);
  }
}

function evaluateHookRun(run, policy) {
  const blocks = run.blocks ?? [];
  const attemptedMutatingActions = run.attemptedMutatingActions ?? 0;
  const warnings = run.warnings ?? [];
  for (const block of blocks) validateHookOutput(block, policy);
  for (const warning of warnings) {
    assert(REQUIRED_WARNING_CLASSES.includes(warning.classification), `warning ${warning.id ?? ""} is unclassified or invalid`);
  }
  const blockRate = attemptedMutatingActions > 0 ? blocks.length / attemptedMutatingActions : 0;
  assert(blockRate <= policy.hookBlockRate.publicReadyBlockAbove || run.publicReady === false, "hookBlockRate > 15% must block public-ready");

  const seen = new Map();
  for (const block of blocks) {
    const key = `${block.hookId}:${block.blockReason}`;
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count >= 2) {
      assert(run.hookRepairModeEntered === true, "Repeated Hook block must enter hookRepairMode");
      assert(run.unchangedRetryAttempted !== true, "Same blocked action cannot be retried unchanged");
    }
    if (count > policy.progression.maxSameHookBlocksBeforeStop) {
      assert(run.hookFailurePacket, "Same Hook block > 2 requires hookFailurePacket");
      assert(run.executionStopped === true, "Same Hook block > 2 must stop Execution");
    }
  }
  assert(!(run.preflightFailed && run.hookLoopAttempted), "Preflight fail must return to stage, not trigger Hook loop");
}

const policy = inputPath
  ? JSON.parse(await fs.readFile(path.isAbsolute(inputPath) ? inputPath : repoPath(inputPath), "utf8"))
  : await readJson("config/governance/hook-progression-policy.json");

validatePolicy(policy);

if (policy.sampleHookOutput) validateHookOutput(policy.sampleHookOutput, policy);
if (policy.sampleRun) evaluateHookRun(policy.sampleRun, policy);

if (!inputPath) {
  const packageJson = await readJson("package.json");
  assert(packageJson.scripts?.["meta:hook:validate"], "package.json missing meta:hook:validate");
  const governanceChain = `${packageJson.scripts?.["meta:verify:governance"] ?? ""} && ${packageJson.scripts?.["meta:verify:governance:core"] ?? ""}`;
  assert(governanceChain.includes("meta:hook:validate"), "meta:verify:governance must include meta:hook:validate");
  const skillText = await fs.readFile(repoPath("canonical/skills/meta-theory/SKILL.md"), "utf8");
  for (const term of ["No Hook loop", "Real testing and warning classification"]) {
    assert(skillText.includes(term), `SKILL.md missing ${term}`);
  }
  const runtimeCodex = await fs.readFile(repoPath("canonical/skills/meta-theory/references/runtime-codex.md"), "utf8");
  assert(/hookRepairMode|hookBlockRate|preflight/i.test(runtimeCodex), "runtime-codex reference missing Hook progression contract");
}

console.log("hook progression valid");
