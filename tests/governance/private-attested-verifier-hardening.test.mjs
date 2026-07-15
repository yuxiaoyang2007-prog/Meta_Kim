import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  validatePrivateAttestedReportShape,
  selectDefaultEvidencePath,
  verifyPrivateAttestedExactBindingReport,
} from "../../scripts/live-acceptance/require-clean-room-live-evidence.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const noticeHash = sha256("[Fetch] visible notice");
const noticeHashSetDigest = sha256(JSON.stringify([noticeHash]));

function baseReport({
  rawArtifactSha256,
  normalizedArtifactSha256 = rawArtifactSha256,
  governedArtifactSha256 = rawArtifactSha256,
  unsignedCandidateSha256 = rawArtifactSha256,
  rawArtifactRelativePath = "host/raw.jsonl",
  normalizedArtifactRelativePath = "host/normalized.json",
  governedArtifactRelativePath = "host/governed.json",
  unsignedCandidateRelativePath = "host/candidate.json",
  occurredAt = new Date().toISOString(),
}) {
  const packageSha256 = "a".repeat(64);
  const promptSha256 = "b".repeat(64);
  const runId = "private-attested-run-0001";
  const bindingRef = "task:mcp:mcp.selected_tool";
  return {
    schemaVersion: "private-attested-live-evidence-v0.1",
    runId,
    target: "claude_code",
    scenario: "governed_execution",
    status: "release_attested",
    promotionEligible: true,
    exactBindingCoverage: true,
    isolation: {
      home: "/isolated/home",
      runtimeHome: "/isolated/runtime",
      packageWorkspace: "/isolated/workspace",
      packageSha256,
      promptSha256,
      siblingAgentTeamsPlaybookAbsent: true,
      globalInventoryInjectionConfigured: false,
      promptLint: { pass: true, hits: [] },
    },
    bundle: {
      artifactRoot: "artifacts",
      governedArtifact: {
        relativePath: governedArtifactRelativePath,
        sha256: governedArtifactSha256,
      },
      unsignedCandidate: {
        relativePath: unsignedCandidateRelativePath,
        sha256: unsignedCandidateSha256,
      },
      rawHostArtifact: { relativePath: rawArtifactRelativePath, sha256: rawArtifactSha256 },
      normalizedObservation: {
        relativePath: normalizedArtifactRelativePath,
        sha256: normalizedArtifactSha256,
      },
    },
    requiredBindings: [{
      family: "mcp",
      providerId: "mcp.selected_tool",
      bindingRef,
      taskPacketId: "task-mcp-1",
      roleInstanceId: "backend-1",
    }],
    observedBindings: [{
      family: "mcp",
      providerId: "mcp.selected_tool",
      bindingRef,
      taskPacketId: "task-mcp-1",
      roleInstanceId: "backend-1",
      hostSurface: "mcp.selected_tool",
      evidenceKind: "mcp_tool_result",
      runId,
      target: "claude_code",
      scenario: "governed_execution",
      sessionId: "session-1",
      eventId: "event-1",
      parentEventId: null,
      occurredAt,
      resultStatus: "completed",
      packageSha256,
      promptSha256,
    }],
    conversationNoticeJoin: {
      expectedCount: 1,
      matchedCount: 1,
      singleSession: true,
      sessionId: "session-1",
      textSha256Set: [noticeHash],
      textSha256SetDigest: noticeHashSetDigest,
    },
    signerDecision: {
      policyVersion: "private-attestation-policy-v1",
      decidedAt: new Date().toISOString(),
      decision: "release_attested",
      requiredCount: 1,
      observedCount: 1,
      matchedCount: 1,
      unmatchedBindingRefs: [],
      unselectedObservedBindingRefs: [],
      requiredTaskLaneCount: 1,
      observedTaskLaneCount: 1,
      matchedTaskLaneCount: 1,
      unmatchedTaskLanes: [],
      unselectedObservedTaskLanes: [],
    },
    attestation: {
      algorithm: "Ed25519",
      keyId: "meta-kim-release-observer-ed25519-2b0848f46fe6c6d72",
      signatureBase64: "A".repeat(88),
      signedPayloadSha256: "c".repeat(64),
    },
  };
}

async function materializeBundle(evidenceRoot, { noticeOverrides = {} } = {}) {
  const artifactDir = path.join(evidenceRoot, "artifacts", "host");
  await mkdir(artifactDir, { recursive: true });
  const occurredAt = new Date().toISOString();
  const rawBytes = Buffer.from('{"eventId":"event-1"}\n', "utf8");
  const requiredBinding = {
    family: "mcp",
    providerId: "mcp.selected_tool",
    bindingRef: "task:mcp:mcp.selected_tool",
    taskPacketId: "task-mcp-1",
    roleInstanceId: "backend-1",
  };
  const observedBinding = {
    ...requiredBinding,
    hostSurface: "mcp.selected_tool",
    evidenceKind: "mcp_tool_result",
    runId: "private-attested-run-0001",
    sessionId: "session-1",
    eventId: "event-1",
    occurredAt,
    resultStatus: "completed",
  };
  const noticeObservation = {
    stage: "Fetch",
    textSha256: noticeHash,
    sessionId: "session-1",
    messageId: "notice-1",
    eventId: "notice-1",
    observerFormat: "codex_desktop_assistant_message_v1",
    resultStatus: "completed",
    mainThreadChat: true,
    ...noticeOverrides,
  };
  const governedBytes = Buffer.from(`${JSON.stringify({
    runId: "private-attested-run-0001",
    coreLoop: { runtimeInvocationPlanPacket: { requiredBindings: [{
      family: requiredBinding.family,
      providerId: requiredBinding.providerId,
      bindingRef: requiredBinding.bindingRef,
      taskPacketId: requiredBinding.taskPacketId,
    }] } },
    workerTaskPackets: [{
      taskPacketId: requiredBinding.taskPacketId,
      roleInstanceId: requiredBinding.roleInstanceId,
    }],
    conversationNotice: { hostObservationExpectations: [{ stage: "Fetch", textSha256: noticeHash }] },
  })}\n`, "utf8");
  const rawArtifactSha256 = sha256(rawBytes);
  const normalizedBytes = Buffer.from(`${JSON.stringify({
    runId: "private-attested-run-0001",
    rawArtifact: { path: "host/raw.jsonl", sha256: rawArtifactSha256 },
    events: [observedBinding],
    conversationNoticeObservations: [noticeObservation],
  })}\n`, "utf8");
  const governedArtifactSha256 = sha256(governedBytes);
  const normalizedArtifactSha256 = sha256(normalizedBytes);
  const candidateBytes = Buffer.from(`${JSON.stringify({
    status: "unsigned_candidate",
    promotionEligible: false,
    releaseAttested: false,
    runId: "private-attested-run-0001",
    requiredBindings: [requiredBinding],
    observedBindings: [{
      ...observedBinding,
      observerArtifact: { path: "host/normalized.json", sha256: normalizedArtifactSha256 },
      rawObserverArtifact: { path: "host/raw.jsonl", sha256: rawArtifactSha256 },
    }],
    conversationNoticeObservations: [noticeObservation],
    sourceArtifacts: {
      governedArtifact: { path: "host/governed.json", sha256: governedArtifactSha256 },
      observation: { path: "host/normalized.json", sha256: normalizedArtifactSha256 },
      rawHostJsonl: { path: "host/raw.jsonl", sha256: rawArtifactSha256 },
    },
  })}\n`, "utf8");
  await writeFile(path.join(artifactDir, "raw.jsonl"), rawBytes);
  await writeFile(path.join(artifactDir, "normalized.json"), normalizedBytes);
  await writeFile(path.join(artifactDir, "governed.json"), governedBytes);
  await writeFile(path.join(artifactDir, "candidate.json"), candidateBytes);
  return {
    rawArtifactSha256,
    normalizedArtifactSha256,
    governedArtifactSha256,
    unsignedCandidateSha256: sha256(candidateBytes),
    occurredAt,
  };
}

test("private attestation schema defines strict binding, isolation, and bundle contracts", async () => {
  const schema = JSON.parse(
    await readFile("config/contracts/private-attested-live-evidence.schema.json", "utf8"),
  );
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schemaVersion.const, "private-attested-live-evidence-v0.1");
  assert.equal(schema.$defs.requiredBinding.additionalProperties, false);
  assert.equal(schema.$defs.observedBinding.additionalProperties, false);
  assert.equal(schema.$defs.isolation.additionalProperties, false);
  assert.equal(schema.$defs.relativePath.pattern.includes("\\.\\."), true);
  assert.deepEqual(
    schema.properties.bundle.required,
    [
      "artifactRoot",
      "governedArtifact",
      "unsignedCandidate",
      "rawHostArtifact",
      "normalizedObservation",
    ],
  );
  assert.ok(schema.$defs.requiredBinding.required.includes("taskPacketId"));
  assert.ok(schema.$defs.requiredBinding.required.includes("roleInstanceId"));
  assert.equal(schema.$defs.attestation.properties.keyId.const.includes("observer-ed25519"), true);

  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const positive = baseReport({ rawArtifactSha256: "d".repeat(64) });
  assert.equal(validate(positive), true, JSON.stringify(validate.errors));
  positive.requiredBindings[0].family = "hook";
  positive.observedBindings[0].family = "hook";
  positive.observedBindings[0].parentEventId = "parent-1";
  positive.observedBindings[0].evidenceKind = "hook_trigger_event";
  assert.equal(validate(positive), true, JSON.stringify(validate.errors));
  positive.observedBindings[0].evidenceKind = "agent_team_result";
  assert.equal(validate(positive), false);

  const nativeAgent = baseReport({ rawArtifactSha256: "d".repeat(64) });
  Object.assign(nativeAgent.requiredBindings[0], {
    family: "agent_subagent",
    ownerBindingMode: "native_custom_agent",
    nativeAgentType: "meta-prism",
  });
  Object.assign(nativeAgent.observedBindings[0], {
    family: "agent_subagent",
    ownerBindingMode: "native_custom_agent",
    nativeAgentType: "meta-prism",
    evidenceKind: "spawn_agent_result",
  });
  assert.equal(validate(nativeAgent), true, JSON.stringify(validate.errors));
});

test("complete signed-report shape accepts exact task/lane identities and content-addressed bundle refs", () => {
  const report = baseReport({ rawArtifactSha256: "d".repeat(64) });
  assert.deepEqual(validatePrivateAttestedReportShape(report), []);
});

test("private verifier rejects run-scoped Agent evidence for a native custom Agent requirement", () => {
  const report = baseReport({ rawArtifactSha256: "d".repeat(64) });
  report.target = "codex_cli";
  report.isolation.codexSharedSkillRootContaminates = false;
  Object.assign(report.requiredBindings[0], {
    family: "agent_subagent",
    providerId: "global:meta-prism",
    bindingRef: "task-1:agent_subagent:global:meta-prism",
    taskPacketId: "task-1",
    roleInstanceId: "review-1",
    ownerBindingMode: "native_custom_agent",
    nativeAgentType: "meta-prism",
  });
  Object.assign(report.observedBindings[0], {
    family: "agent_subagent",
    providerId: "global:meta-prism",
    bindingRef: "task-1:agent_subagent:global:meta-prism",
    taskPacketId: "task-1",
    roleInstanceId: "review-1",
    ownerBindingMode: "run_scoped_owner_contract",
    nativeAgentType: null,
    evidenceKind: "spawn_agent_result",
    hostSurface: "collaboration.spawn_agent",
    target: "codex_cli",
  });
  assert.deepEqual(validatePrivateAttestedReportShape(report), []);
  const result = verifyPrivateAttestedExactBindingReport(report);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.startsWith("exact_binding_match_count:")));
  assert.ok(result.errors.some((error) => error.startsWith("unselected_observed_binding:")));
});

test("shape validation rejects missing isolation and Codex shared-skill contamination", () => {
  const report = baseReport({ rawArtifactSha256: "d".repeat(64) });
  delete report.isolation.promptLint;
  assert.ok(validatePrivateAttestedReportShape(report).includes("isolation_prompt_lint_invalid"));

  const codex = baseReport({ rawArtifactSha256: "d".repeat(64) });
  codex.target = "codex_cli";
  codex.observedBindings[0].target = "codex_cli";
  codex.isolation.codexSharedSkillRootContaminates = true;
  assert.ok(validatePrivateAttestedReportShape(codex).includes("codex_cli_isolation_contaminated"));
});

test("absolute and traversing signed bundle artifact paths are rejected before signature trust", () => {
  const absolute = baseReport({ rawArtifactSha256: "d".repeat(64) });
  absolute.bundle.rawHostArtifact.relativePath = path.resolve("outside.jsonl");
  assert.ok(
    validatePrivateAttestedReportShape(absolute).includes("raw_host_artifact_path_unsafe"),
  );

  const traversal = baseReport({
    rawArtifactSha256: "d".repeat(64),
    normalizedArtifactRelativePath: "../outside.jsonl",
  });
  assert.ok(
    validatePrivateAttestedReportShape(traversal).includes("normalized_observation_path_unsafe"),
  );
});

test("verifier binds event package, prompt, target, scenario, signer counts, and content hash", async () => {
  const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), "meta-kim-private-attestation-"));
  try {
    const report = baseReport(await materializeBundle(evidenceRoot));
    report.observedBindings[0].packageSha256 = "e".repeat(64);
    report.signerDecision.matchedCount = 0;

    const result = verifyPrivateAttestedExactBindingReport(report, Date.now(), { evidenceRoot });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.startsWith("package_binding_mismatch")));
    assert.ok(result.errors.includes("signer_matched_count_mismatch"));
    assert.ok(result.errors.includes("exact_binding_coverage_derived_mismatch"));
    assert.ok(result.errors.includes("promotion_eligible_derived_mismatch"));
    assert.ok(result.errors.includes("release_status_not_derived"));
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test("verifier rejects task/role substitution and recomputes signer task-lane coverage", async () => {
  const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), "meta-kim-private-task-lane-"));
  try {
    const report = baseReport(await materializeBundle(evidenceRoot));
    report.observedBindings[0].roleInstanceId = "frontend-2";
    const result = verifyPrivateAttestedExactBindingReport(report, Date.now(), { evidenceRoot });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.startsWith("exact_binding_match_count:")));
    assert.ok(result.errors.some((error) => error.startsWith("unselected_observed_binding:")));
    assert.ok(result.errors.includes("signer_matched_task_lane_count_mismatch"));
    assert.ok(result.errors.includes("signer_unmatched_task_lanes_mismatch"));
    assert.ok(result.errors.includes("signer_unselected_task_lanes_mismatch"));
    assert.equal(result.derived.exactBindingCoverage, false);
    assert.equal(result.derived.matchedTaskLaneCount, 0);
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test("taskPacketId and roleInstanceId must be both bounded strings or both null", () => {
  const report = baseReport({ rawArtifactSha256: "d".repeat(64) });
  report.requiredBindings[0].roleInstanceId = null;
  const errors = validatePrivateAttestedReportShape(report);
  assert.ok(errors.includes("binding_task_role_nullability_mismatch:0"));
});

test("signed raw and normalized artifacts are independently containment/hash checked", async () => {
  const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), "meta-kim-private-artifacts-"));
  try {
    const report = baseReport(await materializeBundle(evidenceRoot));
    report.bundle.rawHostArtifact.sha256 = "e".repeat(64);
    report.bundle.normalizedObservation.sha256 = "f".repeat(64);
    const result = verifyPrivateAttestedExactBindingReport(report, Date.now(), { evidenceRoot });
    assert.ok(result.errors.includes("raw_host_artifact_hash_invalid"));
    assert.ok(result.errors.includes("normalized_observation_hash_invalid"));
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test("signed governed and unsigned-candidate artifacts are independently hash checked", async () => {
  const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), "meta-kim-private-source-artifacts-"));
  try {
    const report = baseReport(await materializeBundle(evidenceRoot));
    report.bundle.governedArtifact.sha256 = "1".repeat(64);
    report.bundle.unsignedCandidate.sha256 = "2".repeat(64);
    const result = verifyPrivateAttestedExactBindingReport(report, Date.now(), { evidenceRoot });
    assert.ok(result.errors.includes("governed_artifact_hash_invalid"));
    assert.ok(result.errors.includes("unsigned_candidate_hash_invalid"));
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test("conversation notice summary is recomputed from governed, normalized, and candidate artifacts", async () => {
  const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), "meta-kim-private-notice-join-"));
  try {
    const report = baseReport(await materializeBundle(evidenceRoot));
    report.conversationNoticeJoin.sessionId = "caller-claimed-session";
    report.conversationNoticeJoin.textSha256SetDigest = "3".repeat(64);
    const result = verifyPrivateAttestedExactBindingReport(report, Date.now(), { evidenceRoot });
    assert.ok(result.errors.includes("conversation_notice_join_derived_mismatch"));
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test("conversation notice recomputation rejects non-main, failed, unknown-format, and wrong-stage joins", async () => {
  const cases = [
    [{ mainThreadChat: false }, "conversation_notice_not_main_thread:0"],
    [{ resultStatus: "failed" }, "conversation_notice_result_not_successful:0"],
    [{ observerFormat: "caller_claimed_assistant_v1" }, "conversation_notice_observer_format_invalid:0"],
    [{ stage: "Thinking" }, "conversation_notice_stage_hash_pairs_mismatch"],
  ];
  for (const [noticeOverrides, expectedError] of cases) {
    const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), "meta-kim-private-notice-tamper-"));
    try {
      const report = baseReport(await materializeBundle(evidenceRoot, { noticeOverrides }));
      const result = verifyPrivateAttestedExactBindingReport(report, Date.now(), { evidenceRoot });
      assert.ok(result.errors.includes(expectedError), `${expectedError}: ${result.errors.join(",")}`);
    } finally {
      await rm(evidenceRoot, { recursive: true, force: true });
    }
  }
});

test("typed task-lane identity keeps null distinct from the literal run sentinel text", async () => {
  const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), "meta-kim-private-typed-lane-"));
  try {
    const report = baseReport(await materializeBundle(evidenceRoot));
    const runBinding = {
      family: "agent_teams_playbook",
      providerId: "agent-teams-playbook",
      bindingRef: "run:agent-teams-playbook",
      taskPacketId: null,
      roleInstanceId: null,
    };
    const literalBinding = {
      family: "runtime_tool",
      providerId: "runtime.literal",
      bindingRef: "literal:run-text",
      taskPacketId: "<run>",
      roleInstanceId: "<run>",
    };
    report.requiredBindings = [runBinding, literalBinding];
    report.observedBindings = [runBinding, literalBinding].map((binding, index) => ({
      ...binding,
      hostSurface: binding.providerId,
      evidenceKind: index === 0 ? "agent_team_result" : "runtime_tool_call",
      runId: report.runId,
      target: report.target,
      scenario: report.scenario,
      sessionId: "session-1",
      eventId: `typed-${index}`,
      parentEventId: null,
      occurredAt: new Date().toISOString(),
      resultStatus: "completed",
      packageSha256: report.isolation.packageSha256,
      promptSha256: report.isolation.promptSha256,
    }));
    Object.assign(report.signerDecision, {
      requiredCount: 2,
      observedCount: 2,
      matchedCount: 2,
      requiredTaskLaneCount: 2,
      observedTaskLaneCount: 2,
      matchedTaskLaneCount: 2,
    });
    const result = verifyPrivateAttestedExactBindingReport(report, Date.now(), { evidenceRoot });
    assert.equal(result.derived.requiredTaskLaneCount, 2);
    assert.equal(result.derived.observedTaskLaneCount, 2);
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test("default evidence selection uses valid signer freshness instead of report byte size", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "meta-kim-private-selection-"));
  try {
    const older = baseReport({ rawArtifactSha256: "d".repeat(64) });
    older.signerDecision.decidedAt = new Date(Date.now() - 60_000).toISOString();
    const newer = baseReport({ rawArtifactSha256: "d".repeat(64) });
    newer.signerDecision.decidedAt = new Date().toISOString();
    const invalid = { ...newer, unexpected: true };
    const olderPath = path.join(directory, "older.attested.json");
    const newerPath = path.join(directory, "newer.attested.json");
    await writeFile(olderPath, `${JSON.stringify(older, null, 2)}${" ".repeat(4096)}\n`);
    await writeFile(newerPath, `${JSON.stringify(newer)}\n`);
    await writeFile(path.join(directory, "invalid.attested.json"), `${JSON.stringify(invalid)}\n`);
    assert.equal(selectDefaultEvidencePath(directory), newerPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("hook and agent-teams evidence kinds remain family-correlated", async () => {
  const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), "meta-kim-private-families-"));
  try {
    const report = baseReport(await materializeBundle(evidenceRoot));
    const common = {
      runId: report.runId,
      target: report.target,
      scenario: report.scenario,
      sessionId: "session-1",
      occurredAt: new Date().toISOString(),
      resultStatus: "completed",
      packageSha256: report.isolation.packageSha256,
      promptSha256: report.isolation.promptSha256,
    };
    report.requiredBindings = [
      {
        family: "hook",
        providerId: "pre-tool-use",
        bindingRef: "task-1:hook:pre-tool-use",
        taskPacketId: "task-1",
        roleInstanceId: "backend-1",
      },
      {
        family: "agent_teams_playbook",
        providerId: "agent-teams-playbook",
        bindingRef: "run:agent_teams_playbook:agent-teams-playbook",
        taskPacketId: null,
        roleInstanceId: null,
      },
    ];
    report.observedBindings = [
      {
        ...report.requiredBindings[0],
        ...common,
        hostSurface: "PreToolUse",
        evidenceKind: "hook_trigger_event",
        eventId: "hook-event-1",
        parentEventId: "parent-tool-call-1",
      },
      {
        ...report.requiredBindings[1],
        ...common,
        hostSurface: "collaboration.agent_team",
        evidenceKind: "agent_team_result",
        eventId: "team-event-1",
        parentEventId: null,
      },
    ];
    Object.assign(report.signerDecision, {
      requiredCount: 2,
      observedCount: 2,
      matchedCount: 2,
      requiredTaskLaneCount: 2,
      observedTaskLaneCount: 2,
      matchedTaskLaneCount: 2,
    });
    const correct = verifyPrivateAttestedExactBindingReport(report, Date.now(), { evidenceRoot });
    assert.equal(correct.errors.some((error) => error.startsWith("evidence_kind_mismatch:")), false);
    assert.equal(correct.errors.some((error) => error.startsWith("hook_trigger_correlation_missing:")), false);

    report.observedBindings[0].evidenceKind = "agent_team_result";
    report.observedBindings[1].evidenceKind = "hook_trigger_event";
    const wrong = verifyPrivateAttestedExactBindingReport(report, Date.now(), { evidenceRoot });
    assert.equal(
      wrong.errors.filter((error) => error.startsWith("evidence_kind_mismatch:")).length,
      2,
    );
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});

test("bundle containment rejects an artifact root outside the evidence directory", async () => {
  const evidenceRoot = await mkdtemp(path.join(os.tmpdir(), "meta-kim-private-bundle-"));
  try {
    const report = baseReport({ rawArtifactSha256: "d".repeat(64) });
    report.bundle.artifactRoot = "../outside";
    const result = verifyPrivateAttestedExactBindingReport(report, Date.now(), { evidenceRoot });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("bundle_artifact_root_invalid"));
    assert.ok(result.errors.includes("evidence_bundle_root_invalid"));
  } finally {
    await rm(evidenceRoot, { recursive: true, force: true });
  }
});
