#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SUCCESS_RESULTS = new Set(["success", "completed", "returned", "verified", "applied"]);
const AGENT_OWNER_BINDING_MODES = new Set([
  "native_custom_agent",
  "run_scoped_owner_contract",
]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const LOCAL_SENSITIVE_RETENTION_POLICY = Object.freeze({
  classification: "local_sensitive",
  successfulBundlePolicy: "content_addressed_bundle_only",
  failedBundlePolicy: "standalone_raw_failure_diagnostic",
  deletionAuthority: "maintainer_or_release_evidence_retention_job",
});

function bundleRelative(bundleRoot, filePath, label) {
  const root = path.resolve(bundleRoot);
  const resolved = path.resolve(filePath);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} must be a file below bundleRoot`);
  }
  return relative.replaceAll("\\", "/");
}

function contained(root, target) {
  const relative = path.relative(root, target);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function realFileBelow(bundleRoot, filePath, label) {
  const realRoot = await fs.realpath(path.resolve(bundleRoot));
  const realFile = await fs.realpath(path.resolve(filePath));
  if (!contained(realRoot, realFile)) throw new Error(`${label} must be a real file below bundleRoot`);
  const stats = await fs.stat(realFile);
  if (!stats.isFile()) throw new Error(`${label} must be a regular file`);
  return { realRoot, realFile };
}

async function atomicExclusiveWrite(filePath, bytes) {
  const resolved = path.resolve(filePath);
  const parent = path.dirname(resolved);
  const temporary = path.join(parent, `.${path.basename(resolved)}.${randomUUID()}.tmp`);
  await fs.writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
  try {
    await fs.link(temporary, resolved);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

function requiredBindingsFrom(artifact) {
  return (
    artifact?.coreLoop?.runtimeInvocationPlanPacket?.requiredBindings ??
    artifact?.runtimeInvocationPlanPacket?.requiredBindings ??
    []
  );
}

function workerPacketsFrom(artifact) {
  return (
    artifact?.workerTaskPackets ??
    artifact?.sourceArtifacts?.orchestrationReport?.workerTaskPackets ??
    []
  );
}

function normalizedAgentOwnerBinding(binding) {
  if (binding?.family !== "agent_subagent") return {};
  const ownerBindingMode = binding.ownerBindingMode ?? "run_scoped_owner_contract";
  if (!AGENT_OWNER_BINDING_MODES.has(ownerBindingMode)) {
    throw new Error(`agent_owner_binding_mode_invalid:${bindingKeyBase(binding)}`);
  }
  const nativeAgentType = ownerBindingMode === "native_custom_agent"
    ? binding.nativeAgentType
    : null;
  if (
    ownerBindingMode === "native_custom_agent" &&
    (typeof nativeAgentType !== "string" || !nativeAgentType.trim())
  ) {
    throw new Error(`agent_native_type_invalid:${bindingKeyBase(binding)}`);
  }
  if (
    ownerBindingMode === "run_scoped_owner_contract" &&
    binding.nativeAgentType != null
  ) {
    throw new Error(`run_scoped_native_type_must_be_null:${bindingKeyBase(binding)}`);
  }
  return { ownerBindingMode, nativeAgentType };
}

function bindingKeyBase(item) {
  return `${item?.family}:${item?.bindingRef}`;
}

function bindingKey(item) {
  const ownerBinding = normalizedAgentOwnerBinding(item);
  return JSON.stringify([
    item?.family,
    item?.bindingRef,
    ownerBinding.ownerBindingMode ?? null,
    ownerBinding.nativeAgentType ?? null,
  ]);
}

function normalizeRequiredBindings(artifact) {
  const roleByTask = new Map(
    workerPacketsFrom(artifact)
      .filter((packet) => packet?.taskPacketId)
      .map((packet) => [packet.taskPacketId, packet.roleInstanceId ?? null]),
  );
  const bindings = requiredBindingsFrom(artifact).map((binding) => {
    if (!binding?.family || !binding?.providerId || !binding?.bindingRef) {
      throw new Error("required_binding_incomplete");
    }
    const taskPacketId = binding.taskPacketId ?? null;
    const roleInstanceId = binding.roleInstanceId ??
      (taskPacketId ? roleByTask.get(taskPacketId) ?? null : null);
    if (taskPacketId && !roleInstanceId) {
      throw new Error(`required_role_instance_missing:${bindingKey(binding)}`);
    }
    return {
      family: binding.family,
      providerId: binding.providerId,
      bindingRef: binding.bindingRef,
      taskPacketId,
      roleInstanceId,
      ...normalizedAgentOwnerBinding(binding),
    };
  });
  const keys = bindings.map(bindingKey);
  if (new Set(keys).size !== keys.length) throw new Error("duplicate_required_binding");
  return bindings.sort((a, b) => bindingKey(a).localeCompare(bindingKey(b)));
}

function normalizedEventsFrom(observation) {
  const events = observation?.events ?? observation?.observation?.events ?? [];
  if (!Array.isArray(events)) throw new Error("observation_events_invalid");
  return events;
}

export function buildExactBindingCandidate({
  governedArtifact,
  observation,
  governedArtifactPath,
  observationPath,
  rawObservationPath,
  governedArtifactSha256,
  observationSha256,
  rawObservationSha256,
  bundleRoot,
  conversationNoticeObservations = [],
  retentionPolicy = LOCAL_SENSITIVE_RETENTION_POLICY,
}) {
  const runId = governedArtifact?.runId;
  if (!runId || observation?.runId !== runId) throw new Error("run_id_mismatch");
  const requiredBindings = normalizeRequiredBindings(governedArtifact);
  if (requiredBindings.length === 0) throw new Error("required_bindings_empty");
  const requiredByKey = new Map(requiredBindings.map((binding) => [bindingKey(binding), binding]));
  const markedEvents = normalizedEventsFrom(observation).filter((event) => event?.bindingRef != null);
  for (const event of markedEvents) {
    if (!requiredByKey.has(bindingKey(event))) {
      throw new Error(`unselected_or_mismatched_binding:${bindingKey(event)}`);
    }
  }

  const observedBindings = requiredBindings.map((binding) => {
    const matches = markedEvents.filter((event) => bindingKey(event) === bindingKey(binding));
    if (matches.length !== 1) {
      throw new Error(`exact_binding_match_count:${bindingKey(binding)}:${matches.length}`);
    }
    const event = matches[0];
    for (const field of ["eventId", "sessionId", "occurredAt", "resultStatus", "observerFormat"]) {
      if (!event[field]) throw new Error(`observed_binding_field_missing:${bindingKey(binding)}:${field}`);
    }
    if (event.runId !== runId) throw new Error(`observed_run_mismatch:${bindingKey(binding)}`);
    if (event.providerId !== binding.providerId) throw new Error(`observed_provider_mismatch:${bindingKey(binding)}`);
    if ((event.taskPacketId ?? null) !== binding.taskPacketId) throw new Error(`observed_task_mismatch:${bindingKey(binding)}`);
    if ((event.roleInstanceId ?? null) !== binding.roleInstanceId) throw new Error(`observed_role_mismatch:${bindingKey(binding)}`);
    if (!SUCCESS_RESULTS.has(event.resultStatus)) throw new Error(`observed_result_not_successful:${bindingKey(binding)}`);
    if (!Number.isFinite(Date.parse(event.occurredAt))) throw new Error(`observed_timestamp_invalid:${bindingKey(binding)}`);
    return {
      ...binding,
      runId,
      eventId: event.eventId,
      sessionId: event.sessionId,
      occurredAt: event.occurredAt,
      resultStatus: event.resultStatus,
      evidenceKind: event.evidenceKind ?? null,
      observerFormat: event.observerFormat,
      hostSurface: event.hostSurface ?? null,
      observerArtifact: {
        path: bundleRelative(bundleRoot, observationPath, "observation"),
        sha256: observationSha256,
      },
      rawObserverArtifact: {
        path: bundleRelative(bundleRoot, rawObservationPath, "raw observation"),
        sha256: rawObservationSha256,
      },
    };
  });

  return {
    schemaVersion: "exact-binding-unsigned-candidate-v0.1",
    status: "unsigned_candidate",
    promotionEligible: false,
    releaseAttested: false,
    runId,
    exactBindingCandidateCoverage: "complete",
    requiredBindings,
    observedBindings,
    conversationNoticeObservations,
    retentionPolicy,
    sourceArtifacts: {
      governedArtifact: {
        path: bundleRelative(bundleRoot, governedArtifactPath, "governed artifact"),
        sha256: governedArtifactSha256,
      },
      observation: {
        path: bundleRelative(bundleRoot, observationPath, "observation"),
        sha256: observationSha256,
      },
      rawHostJsonl: {
        path: bundleRelative(bundleRoot, rawObservationPath, "raw observation"),
        sha256: rawObservationSha256,
      },
    },
    trustBoundary:
      "Unsigned deterministic candidate only. A separate private release observer must verify and attest it; this file is not release_attested evidence.",
  };
}

export async function buildExactBindingCandidateFromFiles({
  governedArtifactPath,
  observationPath,
  rawObservationPath,
  outputPath,
  bundleRoot = path.dirname(path.resolve(outputPath)),
  conversationNoticeObservations = [],
  retentionPolicy = LOCAL_SENSITIVE_RETENTION_POLICY,
}) {
  const [{ realRoot, realFile: realGoverned }, { realFile: realObservation }, { realFile: realRaw }] = await Promise.all([
    realFileBelow(bundleRoot, governedArtifactPath, "governed artifact"),
    realFileBelow(bundleRoot, observationPath, "observation"),
    realFileBelow(bundleRoot, rawObservationPath, "raw observation"),
  ]);
  const resolvedOutput = path.resolve(outputPath);
  const realOutputParent = await fs.realpath(path.dirname(resolvedOutput));
  if (realOutputParent !== realRoot || !contained(realRoot, resolvedOutput)) {
    throw new Error("output must be a new file below bundleRoot");
  }
  const [governedBytes, observationBytes, rawObservationBytes] = await Promise.all([
    fs.readFile(realGoverned),
    fs.readFile(realObservation),
    fs.readFile(realRaw),
  ]);
  const candidate = buildExactBindingCandidate({
    governedArtifact: JSON.parse(governedBytes.toString("utf8")),
    observation: JSON.parse(observationBytes.toString("utf8")),
    governedArtifactPath,
    observationPath,
    rawObservationPath,
    governedArtifactSha256: sha256(governedBytes),
    observationSha256: sha256(observationBytes),
    rawObservationSha256: sha256(rawObservationBytes),
    bundleRoot,
    conversationNoticeObservations,
    retentionPolicy,
  });
  await atomicExclusiveWrite(resolvedOutput, `${JSON.stringify(candidate, null, 2)}\n`);
  return candidate;
}

async function main() {
  const args = process.argv.slice(2);
  const value = (name) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : null;
  };
  const governedArtifactPath = value("--governed-artifact");
  const observationPath = value("--observation");
  const rawObservationPath = value("--raw-observation");
  const outputPath = value("--output");
  const bundleRoot = value("--bundle-root") ?? (outputPath ? path.dirname(path.resolve(outputPath)) : null);
  if (!governedArtifactPath || !observationPath || !rawObservationPath || !outputPath || !bundleRoot) {
    throw new Error(
      "Usage: build-exact-binding-candidate.mjs --governed-artifact <run.json> --observation <observed.json> --raw-observation <host.jsonl> --output <candidate.json> [--bundle-root <dir>]",
    );
  }
  const candidate = await buildExactBindingCandidateFromFiles({
    governedArtifactPath,
    observationPath,
    rawObservationPath,
    outputPath,
    bundleRoot,
  });
  process.stdout.write(`${JSON.stringify({ status: candidate.status, runId: candidate.runId, output: bundleRelative(bundleRoot, outputPath, "output") })}\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exit(1);
  });
}
