#!/usr/bin/env node

import { createHash, verify as verifySignature } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// This trust root is part of the release verifier, not evidence input. Rotation
// requires a reviewed source change. CLI flags, environment variables, report
// fields, and sibling files cannot replace it.
const TRUSTED_OBSERVER_KEY_ID =
  "meta-kim-release-observer-ed25519-2b0848f46fe6c6d72";
const TRUSTED_OBSERVER_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAh5a8gKuKzg2X09SkDz5ApbixR038AUwEoq7wf6SGhXE=
-----END PUBLIC KEY-----
`;

const PRIVATE_ATTESTATION_SCHEMA_VERSION = "private-attested-live-evidence-v0.1";
const ALLOWED_TARGETS = new Set(["codex_cli", "codex_desktop", "claude_code"]);
const ALLOWED_SCENARIOS = new Set(["governed_execution", "fast_path_control"]);
const ALLOWED_FAMILIES = new Set([
  "agent_subagent",
  "skill",
  "mcp",
  "hook",
  "command_script",
  "runtime_tool",
  "agent_teams_playbook",
]);
const SHA256_RE = /^[a-f0-9]{64}$/u;
const MAX_BINDINGS = 256;
const MAX_EVIDENCE_BYTES = 64 * 1024 * 1024;
const ALLOWED_ASSISTANT_OBSERVER_FORMATS = new Set([
  "codex_desktop_assistant_message_v1",
  "codex_assistant_message_v1",
  "claude_assistant_message_v1",
]);

const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value, maxLength = 512) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function hasOnlyKeys(value, allowed) {
  return isRecord(value) && Object.keys(value).every((key) => allowed.has(key));
}

function relativeContainedPath(value) {
  if (
    !nonEmptyString(value, 1024) ||
    /[\u0000-\u001f]/u.test(value) ||
    /^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/u.test(value) ||
    path.isAbsolute(value)
  ) return false;
  const normalized = path.normalize(value);
  return normalized !== ".." && !normalized.startsWith(`..${path.sep}`);
}

function validateIsolation(isolation, target, errors) {
  const allowed = new Set([
    "home", "runtimeHome", "packageWorkspace", "packageSha256", "promptSha256",
    "siblingAgentTeamsPlaybookAbsent", "globalInventoryInjectionConfigured", "promptLint",
    "codexSharedSkillRootContaminates",
  ]);
  if (!hasOnlyKeys(isolation, allowed)) {
    errors.push("isolation_schema_invalid");
    return;
  }
  for (const field of ["home", "runtimeHome", "packageWorkspace"]) {
    if (!nonEmptyString(isolation[field], 2048)) errors.push(`isolation_${field}_invalid`);
  }
  if (!SHA256_RE.test(isolation.packageSha256 ?? "")) errors.push("isolation_package_sha256_invalid");
  if (!SHA256_RE.test(isolation.promptSha256 ?? "")) errors.push("isolation_prompt_sha256_invalid");
  if (isolation.siblingAgentTeamsPlaybookAbsent !== true) errors.push("isolation_sibling_dependency_present");
  if (isolation.globalInventoryInjectionConfigured !== false) errors.push("isolation_global_inventory_injected");
  if (
    !hasOnlyKeys(isolation.promptLint, new Set(["pass", "hits"])) ||
    isolation.promptLint?.pass !== true ||
    !Array.isArray(isolation.promptLint?.hits) ||
    isolation.promptLint.hits.length !== 0
  ) {
    errors.push("isolation_prompt_lint_invalid");
  }
  if (target === "codex_cli" && isolation.codexSharedSkillRootContaminates !== false) {
    errors.push("codex_cli_isolation_contaminated");
  }
}

function validateBindingShape(binding, observed, errors, index) {
  const requiredKeys = new Set([
    "family", "providerId", "bindingRef", "taskPacketId", "roleInstanceId",
  ]);
  const observedKeys = new Set([
    ...requiredKeys,
    "hostSurface", "evidenceKind", "runId", "target", "scenario", "sessionId",
    "eventId", "parentEventId", "occurredAt", "resultStatus", "packageSha256",
    "promptSha256",
  ]);
  if (!hasOnlyKeys(binding, observed ? observedKeys : requiredKeys)) {
    errors.push(`${observed ? "observed" : "required"}_binding_schema_invalid:${index}`);
    return;
  }
  if (!ALLOWED_FAMILIES.has(binding.family)) errors.push(`binding_family_invalid:${index}`);
  for (const field of ["providerId", "bindingRef"]) {
    if (!nonEmptyString(binding[field], 512)) errors.push(`binding_${field}_invalid:${index}`);
  }
  const taskPacketIdValid = binding.taskPacketId === null || nonEmptyString(binding.taskPacketId, 512);
  const roleInstanceIdValid = binding.roleInstanceId === null || nonEmptyString(binding.roleInstanceId, 512);
  if (!taskPacketIdValid) errors.push(`binding_taskPacketId_invalid:${index}`);
  if (!roleInstanceIdValid) errors.push(`binding_roleInstanceId_invalid:${index}`);
  if ((binding.taskPacketId === null) !== (binding.roleInstanceId === null)) {
    errors.push(`binding_task_role_nullability_mismatch:${index}`);
  }
  if (!observed) return;
  for (const field of [
    "hostSurface", "evidenceKind", "runId", "target", "scenario", "sessionId",
    "eventId", "occurredAt", "resultStatus", "packageSha256", "promptSha256",
  ]) {
    if (!nonEmptyString(binding[field], field.includes("Path") ? 1024 : 512)) {
      errors.push(`observed_binding_${field}_invalid:${index}`);
    }
  }
  if (binding.parentEventId != null && !nonEmptyString(binding.parentEventId, 512)) {
    errors.push(`observed_binding_parentEventId_invalid:${index}`);
  }
}

function validateArtifactReference(reference, label, errors) {
  const allowed = new Set(["relativePath", "sha256"]);
  if (!hasOnlyKeys(reference, allowed)) {
    errors.push(`${label}_schema_invalid`);
    return;
  }
  if (!relativeContainedPath(reference.relativePath)) errors.push(`${label}_path_unsafe`);
  if (!SHA256_RE.test(reference.sha256 ?? "")) errors.push(`${label}_sha256_invalid`);
}

export function validatePrivateAttestedReportShape(report) {
  const errors = [];
  const topLevelKeys = new Set([
    "schemaVersion", "runId", "target", "scenario", "status", "promotionEligible",
    "exactBindingCoverage", "isolation", "bundle", "requiredBindings", "observedBindings",
    "conversationNoticeJoin", "signerDecision", "attestation",
  ]);
  if (!hasOnlyKeys(report, topLevelKeys)) return ["report_schema_invalid"];
  if (report.schemaVersion !== PRIVATE_ATTESTATION_SCHEMA_VERSION) errors.push("schema_version_invalid");
  if (!nonEmptyString(report.runId, 256)) errors.push("run_id_invalid");
  if (!ALLOWED_TARGETS.has(report.target)) errors.push("target_invalid");
  if (!ALLOWED_SCENARIOS.has(report.scenario)) errors.push("scenario_invalid");
  if (report.status !== "release_attested") errors.push("status_not_release_attested");
  if (typeof report.promotionEligible !== "boolean") errors.push("promotion_eligible_invalid");
  if (typeof report.exactBindingCoverage !== "boolean") errors.push("exact_binding_coverage_invalid");
  validateIsolation(report.isolation, report.target, errors);
  if (!hasOnlyKeys(report.bundle, new Set([
    "artifactRoot", "governedArtifact", "unsignedCandidate", "rawHostArtifact",
    "normalizedObservation",
  ]))) {
    errors.push("bundle_schema_invalid");
  }
  if (!relativeContainedPath(report.bundle?.artifactRoot)) {
    errors.push("bundle_artifact_root_invalid");
  }
  validateArtifactReference(report.bundle?.governedArtifact, "governed_artifact", errors);
  validateArtifactReference(report.bundle?.unsignedCandidate, "unsigned_candidate", errors);
  validateArtifactReference(report.bundle?.rawHostArtifact, "raw_host_artifact", errors);
  validateArtifactReference(report.bundle?.normalizedObservation, "normalized_observation", errors);
  const noticeJoin = report.conversationNoticeJoin;
  const noticeJoinKeys = new Set([
    "expectedCount", "matchedCount", "singleSession", "sessionId",
    "textSha256Set", "textSha256SetDigest",
  ]);
  if (!hasOnlyKeys(noticeJoin, noticeJoinKeys)) errors.push("conversation_notice_join_schema_invalid");
  for (const field of ["expectedCount", "matchedCount"]) {
    if (!Number.isInteger(noticeJoin?.[field]) || noticeJoin[field] < 1 || noticeJoin[field] > 256) {
      errors.push(`conversation_notice_join_${field}_invalid`);
    }
  }
  if (noticeJoin?.singleSession !== true) errors.push("conversation_notice_join_single_session_invalid");
  if (!nonEmptyString(noticeJoin?.sessionId, 512)) errors.push("conversation_notice_join_session_id_invalid");
  if (
    !Array.isArray(noticeJoin?.textSha256Set) ||
    noticeJoin.textSha256Set.length < 1 ||
    noticeJoin.textSha256Set.length > 256 ||
    noticeJoin.textSha256Set.some((value) => !SHA256_RE.test(value)) ||
    new Set(noticeJoin.textSha256Set).size !== noticeJoin.textSha256Set.length
  ) errors.push("conversation_notice_join_hash_set_invalid");
  if (!SHA256_RE.test(noticeJoin?.textSha256SetDigest ?? "")) {
    errors.push("conversation_notice_join_hash_digest_invalid");
  }
  for (const [name, observed] of [["requiredBindings", false], ["observedBindings", true]]) {
    const bindings = report[name];
    if (!Array.isArray(bindings) || bindings.length === 0 || bindings.length > MAX_BINDINGS) {
      errors.push(`${name}_count_invalid`);
      continue;
    }
    bindings.forEach((binding, index) => validateBindingShape(binding, observed, errors, index));
  }
  const decision = report.signerDecision;
  const decisionKeys = new Set([
    "policyVersion", "decidedAt", "decision", "requiredCount", "observedCount",
    "matchedCount", "unmatchedBindingRefs", "unselectedObservedBindingRefs",
    "requiredTaskLaneCount", "observedTaskLaneCount", "matchedTaskLaneCount",
    "unmatchedTaskLanes", "unselectedObservedTaskLanes",
  ]);
  if (!hasOnlyKeys(decision, decisionKeys)) errors.push("signer_decision_schema_invalid");
  if (!nonEmptyString(decision?.policyVersion, 128)) errors.push("signer_policy_version_invalid");
  if (!Number.isFinite(Date.parse(decision?.decidedAt))) errors.push("signer_decided_at_invalid");
  if (decision?.decision !== "release_attested") errors.push("signer_decision_invalid");
  for (const field of [
    "requiredCount", "observedCount", "matchedCount", "requiredTaskLaneCount",
    "observedTaskLaneCount", "matchedTaskLaneCount",
  ]) {
    if (!Number.isInteger(decision?.[field]) || decision[field] < 0 || decision[field] > MAX_BINDINGS) {
      errors.push(`signer_${field}_invalid`);
    }
  }
  for (const field of [
    "unmatchedBindingRefs", "unselectedObservedBindingRefs", "unmatchedTaskLanes",
    "unselectedObservedTaskLanes",
  ]) {
    if (
      !Array.isArray(decision?.[field]) ||
      decision[field].length !== 0 ||
      decision[field].some((item) => !nonEmptyString(item, 512))
    ) {
      errors.push(`signer_${field}_invalid`);
    }
  }
  const attestation = report.attestation;
  const attestationKeys = new Set(["algorithm", "keyId", "signatureBase64", "signedPayloadSha256"]);
  if (!hasOnlyKeys(attestation, attestationKeys)) errors.push("attestation_schema_invalid");
  if (attestation?.algorithm !== "Ed25519") errors.push("attestation_algorithm_invalid");
  if (attestation?.keyId !== TRUSTED_OBSERVER_KEY_ID) errors.push("untrusted_key_id");
  if (!nonEmptyString(attestation?.signatureBase64, 256)) errors.push("signature_missing");
  if (!SHA256_RE.test(attestation?.signedPayloadSha256 ?? "")) errors.push("signed_payload_hash_invalid");
  return errors;
}

export function buildPrivateAttestationPayload(report) {
  const unsigned = structuredClone(report);
  if (unsigned.attestation) {
    delete unsigned.attestation.signatureBase64;
    delete unsigned.attestation.signedPayloadSha256;
    delete unsigned.attestation.publicKey;
  }
  delete unsigned.publicKey;
  delete unsigned.trustedPublicKey;
  return stableJson(unsigned);
}

function resolvedBundleRoot(report, evidenceRoot) {
  if (!relativeContainedPath(report?.bundle?.artifactRoot) || !path.isAbsolute(evidenceRoot ?? "")) {
    return null;
  }
  const root = path.resolve(evidenceRoot, report.bundle.artifactRoot);
  const relative = path.relative(evidenceRoot, root);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  if (!existsSync(root)) return null;
  try {
    const realEvidenceRoot = realpathSync(evidenceRoot);
    const realRoot = realpathSync(root);
    const realRelative = path.relative(realEvidenceRoot, realRoot);
    if (realRelative === ".." || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) return null;
    return realRoot;
  } catch {
    return null;
  }
}

function readArtifactReference(reference, bundleRoot) {
  const relativePath = reference?.relativePath;
  if (!bundleRoot || !relativeContainedPath(relativePath)) return null;
  const artifactPath = path.resolve(bundleRoot, relativePath);
  const relative = path.relative(bundleRoot, artifactPath);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  if (!existsSync(artifactPath)) return null;
  try {
    const realArtifactPath = realpathSync(artifactPath);
    const realRelative = path.relative(bundleRoot, realArtifactPath);
    if (realRelative === ".." || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) return null;
    const stats = statSync(realArtifactPath);
    if (!stats.isFile() || stats.size > MAX_EVIDENCE_BYTES) return null;
    const bytes = readFileSync(realArtifactPath);
    if (sha256(bytes) !== reference.sha256) return null;
    return { bytes, realPath: realArtifactPath };
  } catch {
    return null;
  }
}

function expectedEvidenceKind(family) {
  if (family === "mcp") return "mcp_tool_result";
  if (family === "hook") return "hook_trigger_event";
  if (family === "skill") return "skill_application";
  if (family === "command_script") return "command_output";
  if (family === "runtime_tool") return "runtime_tool_call";
  if (family === "agent_subagent") return "spawn_agent_result or agent_task_result";
  if (family === "agent_teams_playbook") return "agent_team_result";
  return null;
}

function evidenceKindMatches(family, evidenceKind) {
  if (family === "agent_subagent") {
    return ["spawn_agent_result", "agent_task_result"].includes(evidenceKind);
  }
  return evidenceKind === expectedEvidenceKind(family);
}

function exactBindingKey(binding) {
  const typed = (value) => value === null
    ? { type: "null" }
    : typeof value === "string"
      ? { type: "string", value }
      : { type: "missing" };
  return stableJson([
    binding?.family,
    binding?.providerId,
    binding?.bindingRef,
    typed(binding?.taskPacketId),
    typed(binding?.roleInstanceId),
  ]);
}

function taskLaneKey(binding) {
  const typed = (value) => value === null
    ? { type: "null" }
    : typeof value === "string"
      ? { type: "string", value }
      : { type: "missing" };
  return stableJson([
    typed(binding?.taskPacketId),
    typed(binding?.roleInstanceId),
  ]);
}

function parseJsonArtifact(record, label, errors) {
  if (!record) return null;
  try {
    const value = JSON.parse(record.bytes.toString("utf8"));
    if (!isRecord(value)) throw new Error("not_object");
    return value;
  } catch {
    errors.push(`${label}_json_invalid`);
    return null;
  }
}

function noticeExpectationsFrom(artifact) {
  const notice = artifact?.conversationNotice ?? artifact?.coreLoop?.conversationNotice ?? null;
  const expectations = notice?.hostObservationExpectations ??
    notice?.progressObservationExpectations ??
    artifact?.coreLoop?.conversationNoticeObservationPacket?.expectedMessages ??
    [];
  return Array.isArray(expectations) ? expectations : [];
}

function normalizedGovernedBindings(artifact) {
  const required = artifact?.coreLoop?.runtimeInvocationPlanPacket?.requiredBindings ??
    artifact?.runtimeInvocationPlanPacket?.requiredBindings ??
    [];
  const workers = artifact?.workerTaskPackets ??
    artifact?.sourceArtifacts?.orchestrationReport?.workerTaskPackets ??
    [];
  if (!Array.isArray(required) || !Array.isArray(workers)) return [];
  const roleByTask = new Map(
    workers
      .filter((packet) => nonEmptyString(packet?.taskPacketId, 512))
      .map((packet) => [packet.taskPacketId, packet.roleInstanceId ?? null]),
  );
  return required.map((binding) => {
    const taskPacketId = binding?.taskPacketId ?? null;
    return {
      family: binding?.family,
      providerId: binding?.providerId,
      bindingRef: binding?.bindingRef,
      taskPacketId,
      roleInstanceId: binding?.roleInstanceId ??
        (taskPacketId ? roleByTask.get(taskPacketId) ?? null : null),
    };
  });
}

function compareArtifactBinding(event, signed, key, errors) {
  for (const field of [
    "family", "providerId", "bindingRef", "taskPacketId", "roleInstanceId",
    "eventId", "sessionId", "occurredAt", "resultStatus", "evidenceKind", "hostSurface",
  ]) {
    if ((event?.[field] ?? null) !== (signed?.[field] ?? null)) {
      errors.push(`artifact_observed_binding_mismatch:${key}:${field}`);
    }
  }
}

export function verifyPrivateAttestedExactBindingReport(
  report,
  nowMs = Date.now(),
  { evidenceRoot = null } = {},
) {
  const errors = validatePrivateAttestedReportShape(report);
  if (!report || typeof report !== "object") return { ok: false, errors: ["report_missing"] };
  const bundleRoot = resolvedBundleRoot(report, evidenceRoot);
  if (!bundleRoot) errors.push("evidence_bundle_root_invalid");
  let governedArtifact = null;
  let unsignedCandidate = null;
  let normalizedObservation = null;
  if (bundleRoot) {
    const governedRecord = readArtifactReference(report?.bundle?.governedArtifact, bundleRoot);
    const candidateRecord = readArtifactReference(report?.bundle?.unsignedCandidate, bundleRoot);
    const rawRecord = readArtifactReference(report?.bundle?.rawHostArtifact, bundleRoot);
    const normalizedRecord = readArtifactReference(report?.bundle?.normalizedObservation, bundleRoot);
    if (!governedRecord) errors.push("governed_artifact_hash_invalid");
    if (!candidateRecord) errors.push("unsigned_candidate_hash_invalid");
    if (!rawRecord) errors.push("raw_host_artifact_hash_invalid");
    if (!normalizedRecord) errors.push("normalized_observation_hash_invalid");
    governedArtifact = parseJsonArtifact(governedRecord, "governed_artifact", errors);
    unsignedCandidate = parseJsonArtifact(candidateRecord, "unsigned_candidate", errors);
    normalizedObservation = parseJsonArtifact(normalizedRecord, "normalized_observation", errors);
  }
  if (governedArtifact && governedArtifact.runId !== report.runId) {
    errors.push("governed_artifact_run_mismatch");
  }
  if (normalizedObservation && normalizedObservation.runId !== report.runId) {
    errors.push("normalized_observation_run_mismatch");
  }
  if (normalizedObservation) {
    const rawSource = normalizedObservation.rawArtifact;
    const rawReference = report.bundle?.rawHostArtifact;
    if (
      rawSource?.path !== rawReference?.relativePath ||
      rawSource?.sha256 !== rawReference?.sha256
    ) errors.push("normalized_observation_raw_source_mismatch");
  }
  if (unsignedCandidate) {
    if (unsignedCandidate.runId !== report.runId) errors.push("unsigned_candidate_run_mismatch");
    if (
      unsignedCandidate.status !== "unsigned_candidate" ||
      unsignedCandidate.promotionEligible !== false ||
      unsignedCandidate.releaseAttested !== false
    ) errors.push("unsigned_candidate_trust_boundary_invalid");
    const sources = unsignedCandidate.sourceArtifacts ?? {};
    for (const [candidateName, bundleName] of [
      ["governedArtifact", "governedArtifact"],
      ["observation", "normalizedObservation"],
      ["rawHostJsonl", "rawHostArtifact"],
    ]) {
      const source = sources[candidateName];
      const reference = report.bundle?.[bundleName];
      if (
        source?.path !== reference?.relativePath ||
        source?.sha256 !== reference?.sha256
      ) errors.push(`unsigned_candidate_source_mismatch:${candidateName}`);
    }
  }
  if (governedArtifact && normalizedObservation && unsignedCandidate) {
    const expected = noticeExpectationsFrom(governedArtifact);
    const normalizedJoined = Array.isArray(normalizedObservation.conversationNoticeObservations)
      ? normalizedObservation.conversationNoticeObservations
      : [];
    const candidateJoined = Array.isArray(unsignedCandidate.conversationNoticeObservations)
      ? unsignedCandidate.conversationNoticeObservations
      : [];
    if (stableJson(normalizedJoined) !== stableJson(candidateJoined)) {
      errors.push("conversation_notice_candidate_observation_mismatch");
    }
    const expectedHashes = expected.map((item) => item?.textSha256);
    const matchedHashes = normalizedJoined.map((item) => item?.textSha256);
    if (
      expectedHashes.some((value) => !SHA256_RE.test(value ?? "")) ||
      matchedHashes.some((value) => !SHA256_RE.test(value ?? ""))
    ) errors.push("conversation_notice_artifact_hash_invalid");
    if (stableJson([...expectedHashes].sort()) !== stableJson([...matchedHashes].sort())) {
      errors.push("conversation_notice_expected_match_mismatch");
    }
    const expectedPairs = expected
      .map((item) => ({ stage: item?.stage, textSha256: item?.textSha256 }))
      .sort((a, b) => stableJson(a).localeCompare(stableJson(b)));
    const matchedPairs = normalizedJoined
      .map((item) => ({ stage: item?.stage, textSha256: item?.textSha256 }))
      .sort((a, b) => stableJson(a).localeCompare(stableJson(b)));
    if (stableJson(expectedPairs) !== stableJson(matchedPairs)) {
      errors.push("conversation_notice_stage_hash_pairs_mismatch");
    }
    for (const [index, item] of normalizedJoined.entries()) {
      if (item?.mainThreadChat !== true) {
        errors.push(`conversation_notice_not_main_thread:${index}`);
      }
      if (!["completed", "returned"].includes(item?.resultStatus)) {
        errors.push(`conversation_notice_result_not_successful:${index}`);
      }
      if (!ALLOWED_ASSISTANT_OBSERVER_FORMATS.has(item?.observerFormat)) {
        errors.push(`conversation_notice_observer_format_invalid:${index}`);
      }
    }
    const sessions = new Set(normalizedJoined.map((item) => item?.sessionId).filter(Boolean));
    const hashSet = [...new Set(matchedHashes)].sort();
    const derivedJoin = {
      expectedCount: expected.length,
      matchedCount: normalizedJoined.length,
      singleSession: sessions.size === 1 && normalizedJoined.every((item) => item?.sessionId),
      sessionId: sessions.size === 1 ? [...sessions][0] : null,
      textSha256Set: hashSet,
      textSha256SetDigest: sha256(Buffer.from(stableJson(hashSet), "utf8")),
    };
    if (stableJson(report.conversationNoticeJoin) !== stableJson(derivedJoin)) {
      errors.push("conversation_notice_join_derived_mismatch");
    }
  }
  const signerDecidedAt = Date.parse(report?.signerDecision?.decidedAt);
  if (
    Number.isFinite(signerDecidedAt) &&
    (signerDecidedAt > nowMs + 10 * 60_000 || signerDecidedAt < nowMs - 24 * 60 * 60_000)
  ) {
    errors.push("signer_decision_not_fresh");
  }

  const attestation = report.attestation ?? {};
  let signatureValid = false;
  if (errors.length === 0) {
    const payload = buildPrivateAttestationPayload(report);
    const payloadHash = sha256(Buffer.from(payload, "utf8"));
    if (attestation.signedPayloadSha256 !== payloadHash) {
      errors.push("signed_payload_hash_mismatch");
    } else {
      try {
        signatureValid = verifySignature(
          null,
          Buffer.from(payload, "utf8"),
          TRUSTED_OBSERVER_PUBLIC_KEY,
          Buffer.from(attestation.signatureBase64, "base64"),
        );
      } catch {
        signatureValid = false;
      }
      if (!signatureValid) errors.push("private_attestation_signature_invalid");
    }
  }

  const required = Array.isArray(report.requiredBindings) ? report.requiredBindings : [];
  const observed = Array.isArray(report.observedBindings) ? report.observedBindings : [];
  if (
    governedArtifact &&
    stableJson(normalizedGovernedBindings(governedArtifact)) !== stableJson(required)
  ) errors.push("governed_required_bindings_mismatch");
  if (
    unsignedCandidate &&
    stableJson(unsignedCandidate.requiredBindings ?? []) !== stableJson(required)
  ) errors.push("unsigned_candidate_required_bindings_mismatch");
  const candidateObserved = Array.isArray(unsignedCandidate?.observedBindings)
    ? unsignedCandidate.observedBindings
    : [];
  const normalizedEvents = Array.isArray(normalizedObservation?.events)
    ? normalizedObservation.events
    : [];
  for (const signed of observed) {
    const key = exactBindingKey(signed);
    const candidateMatches = candidateObserved.filter((event) => exactBindingKey(event) === key);
    const normalizedMatches = normalizedEvents.filter((event) => exactBindingKey(event) === key);
    if (candidateMatches.length !== 1) {
      errors.push(`unsigned_candidate_observed_match_count:${key}:${candidateMatches.length}`);
    } else {
      const candidateEvent = candidateMatches[0];
      compareArtifactBinding(candidateEvent, signed, key, errors);
      const normalizedReference = report.bundle?.normalizedObservation;
      const rawReference = report.bundle?.rawHostArtifact;
      if (
        candidateEvent.observerArtifact?.path !== normalizedReference?.relativePath ||
        candidateEvent.observerArtifact?.sha256 !== normalizedReference?.sha256
      ) errors.push(`unsigned_candidate_observer_source_mismatch:${key}`);
      if (
        candidateEvent.rawObserverArtifact?.path !== rawReference?.relativePath ||
        candidateEvent.rawObserverArtifact?.sha256 !== rawReference?.sha256
      ) errors.push(`unsigned_candidate_raw_source_mismatch:${key}`);
    }
    if (normalizedMatches.length !== 1) {
      errors.push(`normalized_observed_match_count:${key}:${normalizedMatches.length}`);
    } else {
      compareArtifactBinding(normalizedMatches[0], signed, key, errors);
    }
  }
  const bindingValidationErrorStart = errors.length;
  const requiredRefs = new Set();
  const matchedRefs = new Set();
  const unmatchedBindingRefs = [];
  const requiredTaskLanes = new Set(required.map(taskLaneKey));
  const observedTaskLanes = new Set(observed.map(taskLaneKey));
  const matchedTaskLanes = new Set();
  for (const binding of required) {
    if (
      !binding?.family ||
      !binding?.providerId ||
      !binding?.bindingRef ||
      binding.taskPacketId === undefined ||
      binding.roleInstanceId === undefined
    ) {
      errors.push("required_binding_incomplete");
      continue;
    }
    const key = exactBindingKey(binding);
    if (requiredRefs.has(key)) errors.push(`duplicate_required_binding:${key}`);
    requiredRefs.add(key);
    const matches = observed.filter((item) =>
      item?.family === binding.family &&
      item?.providerId === binding.providerId &&
      item?.bindingRef === binding.bindingRef &&
      item?.taskPacketId === binding.taskPacketId &&
      item?.roleInstanceId === binding.roleInstanceId,
    );
    if (matches.length !== 1) {
      errors.push(`exact_binding_match_count:${key}:${matches.length}`);
      unmatchedBindingRefs.push(binding.bindingRef);
      continue;
    }
    const event = matches[0];
    matchedRefs.add(key);
    matchedTaskLanes.add(taskLaneKey(binding));
    if (event.runId !== report.runId) errors.push(`run_mismatch:${key}`);
    if (event.target !== report.target) errors.push(`target_mismatch:${key}`);
    if (event.scenario !== report.scenario) errors.push(`scenario_mismatch:${key}`);
    if (event.packageSha256 !== report.isolation?.packageSha256) errors.push(`package_binding_mismatch:${key}`);
    if (event.promptSha256 !== report.isolation?.promptSha256) errors.push(`prompt_binding_mismatch:${key}`);
    if (!event.sessionId) errors.push(`session_missing:${key}`);
    if (!event.eventId) errors.push(`event_missing:${key}`);
    const occurredAt = Date.parse(event.occurredAt);
    if (!Number.isFinite(occurredAt) || occurredAt > nowMs + 10 * 60_000 || occurredAt < nowMs - 24 * 60 * 60_000) {
      errors.push(`timestamp_not_fresh:${key}`);
    }
    if (!["success", "completed", "returned", "verified", "applied"].includes(event.resultStatus)) {
      errors.push(`result_not_successful:${key}`);
    }
    if (!evidenceKindMatches(binding.family, event.evidenceKind)) {
      errors.push(`evidence_kind_mismatch:${key}`);
    }
    if (binding.family === "mcp" && event.hostSurface !== binding.providerId) {
      errors.push(`mcp_exact_provider_tool_call_missing:${key}`);
    }
    if (binding.family === "hook" && !event.parentEventId) {
      errors.push(`hook_trigger_correlation_missing:${key}`);
    }
  }
  const unselectedObservedBindingRefs = [];
  for (const event of observed) {
    const key = exactBindingKey(event);
    if (!requiredRefs.has(key)) {
      errors.push(`unselected_observed_binding:${key}`);
      unselectedObservedBindingRefs.push(event?.bindingRef ?? key);
    }
  }
  const unmatchedTaskLanes = [...requiredTaskLanes]
    .filter((key) => !matchedTaskLanes.has(key))
    .sort();
  const unselectedObservedTaskLanes = [...observedTaskLanes]
    .filter((key) => !requiredTaskLanes.has(key))
    .sort();
  const derivedCoverage =
    required.length > 0 &&
    matchedRefs.size === requiredRefs.size &&
    unmatchedBindingRefs.length === 0 &&
    unselectedObservedBindingRefs.length === 0 &&
    unmatchedTaskLanes.length === 0 &&
    unselectedObservedTaskLanes.length === 0 &&
    errors.length === bindingValidationErrorStart;
  const decision = report.signerDecision ?? {};
  if (decision.requiredCount !== required.length) errors.push("signer_required_count_mismatch");
  if (decision.observedCount !== observed.length) errors.push("signer_observed_count_mismatch");
  if (decision.matchedCount !== matchedRefs.size) errors.push("signer_matched_count_mismatch");
  if (decision.requiredTaskLaneCount !== requiredTaskLanes.size) {
    errors.push("signer_required_task_lane_count_mismatch");
  }
  if (decision.observedTaskLaneCount !== observedTaskLanes.size) {
    errors.push("signer_observed_task_lane_count_mismatch");
  }
  if (decision.matchedTaskLaneCount !== matchedTaskLanes.size) {
    errors.push("signer_matched_task_lane_count_mismatch");
  }
  if (stableJson(decision.unmatchedBindingRefs ?? []) !== stableJson(unmatchedBindingRefs)) {
    errors.push("signer_unmatched_bindings_mismatch");
  }
  if (
    stableJson(decision.unselectedObservedBindingRefs ?? []) !==
    stableJson(unselectedObservedBindingRefs)
  ) {
    errors.push("signer_unselected_bindings_mismatch");
  }
  if (stableJson(decision.unmatchedTaskLanes ?? []) !== stableJson(unmatchedTaskLanes)) {
    errors.push("signer_unmatched_task_lanes_mismatch");
  }
  if (
    stableJson(decision.unselectedObservedTaskLanes ?? []) !==
    stableJson(unselectedObservedTaskLanes)
  ) {
    errors.push("signer_unselected_task_lanes_mismatch");
  }
  if (report.exactBindingCoverage !== derivedCoverage) errors.push("exact_binding_coverage_derived_mismatch");
  const promotionDerived = derivedCoverage && signatureValid && errors.length === 0;
  if (report.promotionEligible !== promotionDerived) errors.push("promotion_eligible_derived_mismatch");
  if (report.status === "release_attested" && !promotionDerived) errors.push("release_status_not_derived");
  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    derived: {
      exactBindingCoverage: derivedCoverage,
      promotionEligible: promotionDerived,
      requiredCount: required.length,
      observedCount: observed.length,
      matchedCount: matchedRefs.size,
      requiredTaskLaneCount: requiredTaskLanes.size,
      observedTaskLaneCount: observedTaskLanes.size,
      matchedTaskLaneCount: matchedTaskLanes.size,
    },
  };
}

export function selectDefaultEvidencePath(directory) {
  if (!existsSync(directory)) return null;
  const candidates = [];
  for (const name of readdirSync(directory).filter((item) => item.endsWith(".attested.json"))) {
    const filePath = path.join(directory, name);
    try {
      const stats = statSync(filePath);
      if (!stats.isFile() || stats.size > 10 * 1024 * 1024) continue;
      const report = JSON.parse(readFileSync(filePath, "utf8"));
      if (validatePrivateAttestedReportShape(report).length > 0) continue;
      const decidedAt = Date.parse(report.signerDecision.decidedAt);
      if (!Number.isFinite(decidedAt)) continue;
      candidates.push({ filePath, decidedAt, mtimeMs: stats.mtimeMs });
    } catch {
      // Invalid or concurrently written reports are not default candidates.
    }
  }
  candidates.sort((a, b) =>
    b.decidedAt - a.decidedAt || b.mtimeMs - a.mtimeMs || a.filePath.localeCompare(b.filePath));
  return candidates[0]?.filePath ?? null;
}

export function defaultEvidencePath() {
  return selectDefaultEvidencePath(path.join(
    process.cwd(),
    ".meta-kim",
    "state",
    "default",
    "clean-room-live",
  ));
}

function requestedEvidencePath(argv) {
  const index = argv.indexOf("--evidence");
  if (index >= 0 && argv[index + 1] && !argv[index + 1].startsWith("--")) {
    return path.resolve(argv[index + 1]);
  }
  return defaultEvidencePath();
}

export function runReleaseEvidenceGate(argv = process.argv.slice(2)) {
  if (argv.includes("--public-key") || argv.includes("--trust-key")) {
    return { ok: false, errors: ["trust_root_override_forbidden"] };
  }
  const evidencePath = requestedEvidencePath(argv);
  if (!evidencePath || !existsSync(evidencePath)) {
    return {
      ok: false,
      errors: ["private_attested_exact_binding_report_missing"],
      evidencePath,
    };
  }
  let report;
  try {
    if (statSync(evidencePath).size > 10 * 1024 * 1024) {
      return { ok: false, errors: ["evidence_report_too_large"], evidencePath };
    }
    report = JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch {
    return { ok: false, errors: ["evidence_report_invalid_json"], evidencePath };
  }
  return {
    ...verifyPrivateAttestedExactBindingReport(report, Date.now(), {
      evidenceRoot: path.dirname(evidencePath),
    }),
    evidencePath,
  };
}

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const result = runReleaseEvidenceGate();
  if (!result.ok) {
    process.stderr.write(
      `live-certified clean-room evidence rejected: ${result.errors.join(", ")}. ` +
        "A private Ed25519-attested report must cover every exact selected binding; raw observations and caller-supplied trust keys remain diagnostic only.\n",
    );
    process.exit(1);
  }
  process.stdout.write(
    `live-certified clean-room evidence accepted: ${result.evidencePath}\n`,
  );
}
