#!/usr/bin/env node
/**
 * Simulate a governance run interruption and write a local continuity
 * compaction packet.
 *
 * Usage: node scripts/write-compaction.mjs [--run-ref <name>] [--profile <name>]
 *
 * This script simulates what happens when a governed workflow (8-stage spine)
 * is interrupted mid-way — it writes a real compaction packet to:
 *   .meta-kim/state/{profile}/compaction/{run-ref}.json
 *
 * The packet is local-only continuity state. It is not runtime stage authority,
 * verification proof, public-ready proof, or Evolution writeback evidence.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  ensureProfileState,
  getProfilePaths,
  toRepoRelative,
} from "./meta-kim-local-state.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const runRefArg = process.argv.includes("--run-ref")
  ? process.argv[process.argv.indexOf("--run-ref") + 1]
  : `run-${Date.now()}`;
const profileArg = process.argv.includes("--profile")
  ? process.argv[process.argv.indexOf("--profile") + 1]
  : undefined;

async function writeCompaction({ runRef, profile }) {
  const state = getProfilePaths({ profile });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  const compaction = {
    packetVersion: "1.0",
    runRef,
    profile: state.profile,
    profileKey: state.profileKey,
    createdAt: new Date().toISOString(),
    stageState: {
      current: "Review",
      completed: ["Critical", "Fetch", "Thinking", "Execution"],
      resumeFrom: "Review",
      stepNumber: 5,
    },
    authority: "local_continuity_only",
    sourceAuthority: "manual_doctor_fixture",
    sourceAuthorityDetail: {
      runtimeRunId: null,
      transcriptFallbackUsed: false,
      publicReadyClaimAllowed: false,
      note: "Manual fixture for local continuity and doctor demonstrations only.",
    },
    openFindings: [
      {
        id: "F001",
        severity: "HIGH",
        description: "Missing input sanitization in user registration endpoint",
        sourceFile: "src/auth/register.ts",
        line: 47,
        reviewOwner: "meta-prism",
        verifiedBy: null,
        closeState: "open",
      },
      {
        id: "F002",
        severity: "MEDIUM",
        description: "Token expiry not validated on refresh",
        sourceFile: "src/auth/refresh.ts",
        line: 23,
        reviewOwner: "meta-prism",
        verifiedBy: null,
        closeState: "open",
      },
    ],
    pendingRevisions: [
      {
        findingId: "F001",
        plannedFix: "Add DOMPurify sanitization for all user inputs",
        status: "planned",
        owner: null,
      },
      {
        findingId: "F002",
        plannedFix: "Add token expiry check before refresh operation",
        status: "planned",
        owner: null,
      },
    ],
    verifyGateState: "pending_verify",
    singleDeliverableState: {
      currentDeliverable: "auth-module-security-fix",
      closed: false,
      singleDeliverableMaintained: false,
      deliverableChainClosed: false,
    },
    summaryDelta: {
      written: false,
      content: null,
      publicReady: false,
      verifyPassed: false,
      summaryClosed: false,
      source: "local_compaction_no_public_ready_claim",
    },
    writebackDecision: {
      decision: "none",
      targets: [],
      continuityOnly: true,
      continuityTarget: "local-compaction",
      content:
        "Local compaction is continuity state only, not an Evolution writeback to memory.",
    },
    accepted_risk: null,
    handoffNote: `Compaction written at ${timestamp}. Local continuity only: session was interrupted during Review stage (step 5/8), and 2 open findings need revision before verification can proceed. Inspect runtime spine state before claiming active-run continuation.`,
  };

  const outFile = path.join(state.compactionDir, `${runRef}.json`);
  await fs.writeFile(outFile, JSON.stringify(compaction, null, 2), "utf8");

  return {
    path: toRepoRelative(outFile),
    profile: state.profile,
    profileKey: state.profileKey,
    findingsCount: compaction.openFindings.length,
    stage: compaction.stageState.current,
  };
}

async function main() {
  console.log("meta-kim write-compaction\n");

  const profileState = await ensureProfileState({ profile: profileArg });
  console.log(`  profile: ${profileState.profile}`);
  console.log(`  profileKey: ${profileState.profileKey}`);

  const result = await writeCompaction({
    runRef: runRefArg,
    profile: profileState.profile,
  });

  console.log(`\n  [ok] compaction packet written`);
  console.log(`  path:   ${result.path}`);
  console.log(`  stage:  ${result.stage} (step 5/8, interrupted)`);
  console.log(`  findings: ${result.findingsCount} open`);
  console.log(
    `  gate:    ${result.findingsCount > 0 ? "pending_verify" : "verified"}`,
  );
  console.log(
    "\nContinuity note: load this file as local context only, then inspect runtime spine state before claiming continuation.",
  );
}

main().catch((e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
