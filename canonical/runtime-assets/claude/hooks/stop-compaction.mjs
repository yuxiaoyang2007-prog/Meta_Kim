#!/usr/bin/env node
/**
 * Stop hook: auto-write compaction packet when session ends.
 *
 * Scans the conversation transcript for governance stage markers
 * (Critical / Fetch / Thinking / Execution / Review / Meta-Review / Verification / Evolution)
 * and open findings, then writes a real compaction packet to:
 *   .meta-kim/state/{profile}/compaction/{run-ref}.json
 *
 * Runs on EVERY Stop event — detects governed run in progress by looking for
 * 8-stage spine markers. Always exits 0 — never blocks session stop.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { resolveProfileStateDir, sanitizeStateProfile } from "./spine-state.mjs";

// ── Read stdin ONCE at top level before anything else ────────────────────────
const STDIN_CHUNKS = [];
for await (const chunk of process.stdin) STDIN_CHUNKS.push(chunk);
const RAW_STDIN = Buffer.concat(STDIN_CHUNKS).toString("utf8").trim();
let INPUT = {};
try { INPUT = JSON.parse(RAW_STDIN || "{}"); } catch { INPUT = {}; }

// ── Constants ───────────────────────────────────────────────────────────────
const REPO_ROOT = path.resolve(INPUT.cwd || process.cwd());

const STAGES = [
  "Critical", "Fetch", "Thinking", "Execution",
  "Review", "Meta-Review", "Verification", "Evolution",
];

const STAGE_PATTERNS = {
  Critical:     /\b(Critical|clarify|intentPacket|需求澄清|明确意图)\b/gi,
  Fetch:        /\b(Fetch|搜索|capability|能力搜索|findskill)\b/gi,
  Thinking:     /\b(Thinking|规划|dispatchBoard|分派|owner|Task Card)\b/gi,
  Execution:    /\b(Execution|执行|分派执行|dispatch|Worker Task)\b/gi,
  Review:       /\b(Review|审查|reviewPacket|findings|openFindings|CRITICAL|HIGH|MEDIUM|LOW)\b/gi,
  "Meta-Review": /\b(Meta-Review|元审查|review.*standard)\b/gi,
  Verification: /\b(Verification|验证|verified|verify.*gate|closeFindings)\b/gi,
  Evolution:     /\b(Evolution|进化|writeback|evolutionWriteback)\b/gi,
};

const FINDING_PATTERNS = [
  /(?:finding|findingId)[^\n]{0,80}(?:CRITICAL|HIGH|MEDIUM|LOW)[^\n]{0,120}/gi,
  /(?:severity)[^\n]{0,40}(?:CRITICAL|HIGH|MEDIUM|LOW)[^\n]{0,120}/gi,
  /(?:open.*finding|unresolved.*finding)[^\n]{0,120}/gi,
];

// ── Helpers ────────────────────────────────────────────────────────────────
async function readTranscript(transcriptPath, maxLines = 600) {
  try {
    const fd = await fs.open(transcriptPath, "r");
    const buf = [];
    for await (const line of fd.readLines()) {
      buf.push(line);
      if (buf.length > maxLines) buf.shift();
    }
    fd.close();
    return buf.join("\n");
  } catch {
    return "";
  }
}

function detectCurrentStage(text) {
  let current = "Critical";
  let maxScore = 0;
  for (const [stage, pattern] of Object.entries(STAGE_PATTERNS)) {
    const matches = text.match(pattern) || [];
    if (matches.length > maxScore) {
      maxScore = matches.length;
      current = stage;
    }
  }
  return current;
}

function detectCompletedStages(text) {
  const completed = [];
  for (let i = 0; i < STAGES.length - 1; i++) {
    const laterActive = STAGES.slice(i + 1).some(
      (s) => (text.match(STAGE_PATTERNS[s]) || []).length > 0,
    );
    const thisActive = (text.match(STAGE_PATTERNS[STAGES[i]]) || []).length > 0;
    if (thisActive && laterActive) completed.push(STAGES[i]);
  }
  return [...new Set(completed)];
}

function extractFindings(text) {
  const findings = [];
  const seen = new Set();
  for (const pattern of FINDING_PATTERNS) {
    let match;
    try { match = pattern.exec(text); } catch { continue; }
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    while (match !== null) {
      const raw = match[0].slice(0, 200).trim();
      if (!seen.has(raw)) {
        seen.add(raw);
        let severity = "MEDIUM";
        if (/CRITICAL/i.test(raw)) severity = "CRITICAL";
        else if (/HIGH/i.test(raw)) severity = "HIGH";
        else if (/LOW/i.test(raw)) severity = "LOW";
        findings.push({
          id: `F${findings.length + 1}`,
          severity,
          description: raw,
          reviewOwner: "meta-prism",
          verifiedBy: null,
          closeState: "open",
        });
      }
      try { match = pattern.exec(text); } catch { match = null; }
      if (findings.length >= 10) break;
    }
    if (findings.length >= 10) break;
  }
  return findings;
}

async function writeCompaction({ stage, completed, findings, runRef, profile }) {
  const safeProfile = sanitizeStateProfile(profile);
  const compactionDir = resolveProfileStateDir(
    REPO_ROOT,
    safeProfile,
    "compaction",
  );
  await fs.mkdir(compactionDir, { recursive: true });

  const stageIdx = STAGES.indexOf(stage);
  const outFile = path.join(compactionDir, `${runRef}.json`);

  const compaction = {
    packetVersion: "1.0",
    runRef,
    profile: safeProfile,
    profileKey: `${safeProfile}-auto`,
    createdAt: new Date().toISOString(),
    stageState: {
      current: stage,
      completed,
      resumeFrom: stage,
      stepNumber: stageIdx + 1,
    },
    openFindings: findings.map((f) => ({
      ...f,
      findingId: f.id,
      sourceFile: null,
      line: null,
    })),
    pendingRevisions: findings.map((f) => ({
      findingId: f.id,
      plannedFix: null,
      status: "planned",
      owner: null,
    })),
    verifyGateState: findings.length > 0 ? "pending_verify" : "verified",
    singleDeliverableState: { currentDeliverable: "governed-run", closed: false },
    summaryDelta: { written: false, content: null },
    writebackDecision: {
      decision: "none",
      targets: [],
      continuityOnly: true,
      continuityTarget: "local-compaction",
      content:
        findings.length > 0
          ? "Review findings captured from transcript for local continuity only. Verify and close findings in next session; this is not an Evolution writeback."
          : "No open findings captured. Compaction packet is local continuity only and is not an Evolution writeback.",
    },
    accepted_risk: null,
    handoffNote:
      `Auto-compaction from Stop hook. Stage=${stage}(${stageIdx + 1}/${STAGES.length}), findings=${findings.length}. ` +
      `Auto-generated at session end. Resume from ${stage} stage.`,
  };

  await fs.writeFile(outFile, JSON.stringify(compaction, null, 2), "utf8");
  await fs.writeFile(
    path.join(compactionDir, "latest.json"),
    JSON.stringify(compaction, null, 2),
    "utf8",
  );

  return path.relative(REPO_ROOT, outFile).replace(/\\/g, "/");
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  // Never block session stop
  process.exitCode = 0;

  // Only run on actual interruptions (not active=true stops)
  if (INPUT.stop_hook_active === true) return;

  const transcriptPath = INPUT.transcript_path || INPUT.transcriptPath;
  if (!transcriptPath) return;

  const text = await readTranscript(transcriptPath);
  if (!text || text.length < 200) return; // too short to be a real session

  const stage = detectCurrentStage(text);
  const completed = detectCompletedStages(text);
  const findings = extractFindings(text);
  const hasActivity = Object.values(STAGE_PATTERNS).some(
    (p) => (text.match(p) || []).length > 0,
  );
  if (!hasActivity) return; // no governance activity detected

  const profile = sanitizeStateProfile(process.env.META_KIM_PROFILE);
  const runRef = `run-${Date.now()}`;

  try {
    const relPath = await writeCompaction({ stage, completed, findings, runRef, profile });
    process.stderr.write(
      `[compaction] auto-written: ${relPath} (stage=${stage}, findings=${findings.length})\n`,
    );
  } catch (e) {
    process.stderr.write(`[compaction] warn: ${e.message}\n`);
  }
}

main().catch(() => { process.exitCode = 0; });
