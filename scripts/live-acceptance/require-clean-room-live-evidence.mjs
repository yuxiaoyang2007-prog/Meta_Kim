#!/usr/bin/env node

import { createHash, verify as verifySignature } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

function artifactHashMatches(binding) {
  const artifactPath = binding?.observerArtifactPath;
  if (!path.isAbsolute(String(artifactPath ?? "")) || !existsSync(artifactPath)) {
    return false;
  }
  const bytes = readFileSync(artifactPath);
  return sha256(bytes) === binding.observerArtifactSha256;
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

export function verifyPrivateAttestedExactBindingReport(report, nowMs = Date.now()) {
  const errors = [];
  if (!report || typeof report !== "object") return { ok: false, errors: ["report_missing"] };
  if (report.status !== "release_attested") errors.push("status_not_release_attested");
  if (report.promotionEligible !== true) errors.push("promotion_not_eligible");
  if (report.exactBindingCoverage !== true) errors.push("exact_binding_coverage_not_true");
  if (!report.runId || !report.target) errors.push("run_or_target_missing");

  const attestation = report.attestation ?? {};
  if (attestation.algorithm !== "Ed25519") errors.push("attestation_algorithm_invalid");
  if (attestation.keyId !== TRUSTED_OBSERVER_KEY_ID) errors.push("untrusted_key_id");
  if (typeof attestation.signatureBase64 !== "string") errors.push("signature_missing");
  const payload = buildPrivateAttestationPayload(report);
  const payloadHash = sha256(Buffer.from(payload, "utf8"));
  if (attestation.signedPayloadSha256 !== payloadHash) errors.push("signed_payload_hash_mismatch");
  if (errors.length === 0) {
    let signatureValid = false;
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

  const required = Array.isArray(report.requiredBindings) ? report.requiredBindings : [];
  const observed = Array.isArray(report.observedBindings) ? report.observedBindings : [];
  if (required.length === 0) errors.push("required_bindings_empty");
  const requiredRefs = new Set();
  for (const binding of required) {
    if (!binding?.family || !binding?.providerId || !binding?.bindingRef) {
      errors.push("required_binding_incomplete");
      continue;
    }
    const key = `${binding.family}:${binding.bindingRef}`;
    if (requiredRefs.has(key)) errors.push(`duplicate_required_binding:${key}`);
    requiredRefs.add(key);
    const matches = observed.filter((item) =>
      item?.family === binding.family &&
      item?.providerId === binding.providerId &&
      item?.bindingRef === binding.bindingRef,
    );
    if (matches.length !== 1) {
      errors.push(`exact_binding_match_count:${key}:${matches.length}`);
      continue;
    }
    const event = matches[0];
    if (event.runId !== report.runId) errors.push(`run_mismatch:${key}`);
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
    if (!artifactHashMatches(event)) errors.push(`artifact_hash_invalid:${key}`);
    if (binding.family === "mcp" && event.hostSurface !== binding.providerId) {
      errors.push(`mcp_exact_provider_tool_call_missing:${key}`);
    }
    if (binding.family === "hook" && !event.parentEventId) {
      errors.push(`hook_trigger_correlation_missing:${key}`);
    }
  }
  for (const event of observed) {
    const key = `${event?.family}:${event?.bindingRef}`;
    if (!requiredRefs.has(key)) errors.push(`unselected_observed_binding:${key}`);
  }
  return { ok: errors.length === 0, errors };
}

function defaultEvidencePath() {
  const directory = path.join(
    process.cwd(),
    ".meta-kim",
    "state",
    "default",
    "clean-room-live",
  );
  if (!existsSync(directory)) return null;
  const candidates = readdirSync(directory)
    .filter((name) => name.endsWith(".attested.json"))
    .map((name) => path.join(directory, name))
    .sort((a, b) => readFileSync(b).length - readFileSync(a).length);
  return candidates[0] ?? null;
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
    report = JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch {
    return { ok: false, errors: ["evidence_report_invalid_json"], evidencePath };
  }
  return { ...verifyPrivateAttestedExactBindingReport(report), evidencePath };
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
