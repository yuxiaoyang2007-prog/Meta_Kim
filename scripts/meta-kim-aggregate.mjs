#!/usr/bin/env node

/**
 * meta-kim-aggregate.mjs
 *
 * Aggregates evolution signals from multiple sources and coordinates writeback.
 *
 * Sources:
 * 1. Git hooks (pre-commit, post-commit)
 * 2. Governed run artifacts
 * 3. Manual triggers (CLI invocation)
 * 4. Runtime capability queries
 *
 * Output: evolutionWritebackPacket for meta-chrysalis coordination
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import {
  processEvolutionPacket,
  validateFiveCriteria,
  validatePrinStPrinciples,
  checkRecursiveRisk
} from "./evolution-writeback-gate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const DEFAULT_SIGNALS_DIR = path.join(repoRoot, ".meta-kim/signals");
const DEFAULT_ARTIFACTS_DIR = path.join(repoRoot, "tests/fixtures/run-artifacts");
const EVOLUTION_OUTPUT_DIR = path.join(repoRoot, ".meta-kim/evolution");
const CONTRACT_PATH = path.join(repoRoot, "config/contracts/workflow-contract.json");

// Evolution decision types (from workflow-contract.json)
const EVOLUTION_DECISIONS = {
  WRITEBACK: "writeback",
  NONE: "none",
};

// Writeback target patterns (from workflow-contract.json evolutionWritebackTargets)
const WRITEBACK_TARGETS = [
  "canonical/agents/{agent}.md",
  "canonical/skills/",
  "config/contracts/",
  "config/capability-index/",
];

/**
 * Parse CLI arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    signalsDir: DEFAULT_SIGNALS_DIR,
    artifactsDir: DEFAULT_ARTIFACTS_DIR,
    outputDir: EVOLUTION_OUTPUT_DIR,
    outputFormat: "json",
    command: "aggregate", // aggregate, merge, writeback
    signalFiles: [],
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--signals-dir":
        options.signalsDir = args[++i];
        break;
      case "--artifacts":
        options.artifactsDir = args[++i];
        break;
      case "--output-dir":
        options.outputDir = args[++i];
        break;
      case "--format":
        options.outputFormat = args[++i];
        break;
      case "--command":
        options.command = args[++i];
        break;
      case "--signal-file":
        options.signalFiles.push(args[++i]);
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      default:
        // Ignore unknown args
        break;
    }
  }

  return options;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Usage: node scripts/meta-kim-aggregate.mjs [options]

Aggregates evolution signals and generates evolutionWritebackPacket.

Commands:
  aggregate   Collect and merge signals from all sources (default)
  merge       Merge existing signal files
  writeback   Generate evolutionWritebackPacket for meta-chrysalis

Options:
  -h, --help              Show this help message
  --signals-dir <dir>     Directory containing signal files (default: .meta-kim/signals)
  --artifacts <dir>       Directory containing governed run artifacts (default: tests/fixtures/run-artifacts)
  --output-dir <dir>      Directory to write evolution packets (default: .meta-kim/evolution)
  --format <format>       Output format: json, pretty (default: json)
  --command <cmd>         Command to run: aggregate, merge, writeback
  --signal-file <file>    Add specific signal file to merge (can be used multiple times)
  --dry-run               Show what would be done without writing files

Examples:
  node scripts/meta-kim-aggregate.mjs
  node scripts/meta-kim-aggregate.mjs --command writeback --format pretty
  node scripts/meta-kim-aggregate.mjs --signal-file .meta-kim/signals/signal-1.json
  node scripts/meta-kim-aggregate.mjs --dry-run
`);
}

/**
 * Generate a unique signal ID
 */
function generateSignalId() {
  return `sig-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * Load signal files from directory
 */
async function loadSignalFiles(signalsDir) {
  const signals = [];

  try {
    const entries = await fs.readdir(signalsDir, { withFileTypes: true });
    const signalFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => path.join(signalsDir, e.name));

    for (const filePath of signalFiles) {
      try {
        const content = await fs.readFile(filePath, "utf8");
        const data = JSON.parse(content);

        // Handle both single signal and signal collection formats
        if (data.signals && Array.isArray(data.signals)) {
          signals.push(...data.signals);
        } else if (data.type) {
          signals.push(data);
        }
      } catch (error) {
        // Skip invalid signal files
        continue;
      }
    }
  } catch (error) {
    // Signals directory may not exist
    return signals;
  }

  return signals;
}

/**
 * Collect signals from all sources
 */
async function collectSignals(options) {
  const signals = [];

  // 1. Load from signal files directory
  const dirSignals = await loadSignalFiles(options.signalsDir);
  signals.push(...dirSignals);

  // 2. Load specific signal files from args
  for (const filePath of options.signalFiles) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const data = JSON.parse(content);

      if (data.signals && Array.isArray(data.signals)) {
        signals.push(...data.signals);
      } else if (data.type) {
        signals.push(data);
      }
    } catch (error) {
      // Skip invalid files
      continue;
    }
  }

  // 3. Detect new signals from artifacts
  try {
    const { detectEvolutionSignals } = await import("./detect-evolution-signals.mjs");
    const newSignals = await detectEvolutionSignals({
      artifactsDir: options.artifactsDir,
    });
    signals.push(...newSignals);
  } catch (error) {
    // Detection script may have failed
  }

  return signals;
}

/**
 * Deduplicate signals by type and data
 */
function deduplicateSignals(signals) {
  const seen = new Map();
  const unique = [];

  for (const signal of signals) {
    const key = `${signal.type}:${JSON.stringify(signal.data)}`;
    const existing = seen.get(key);

    if (existing) {
      // Merge occurrence counts
      existing.occurrenceCount = (existing.occurrenceCount || 1) + 1;
      existing.lastSeen = signal.timestamp;
    } else {
      signal.occurrenceCount = 1;
      signal.firstSeen = signal.timestamp;
      signal.lastSeen = signal.timestamp;
      seen.set(key, signal);
      unique.push(signal);
    }
  }

  return unique;
}

/**
 * Classify signals into retain/upgrade/retire categories
 */
function classifySignals(signals) {
  const classification = {
    retain: [],
    upgrade: [],
    retire: [],
  };

  for (const signal of signals) {
    switch (signal.type) {
      case "boundary_drift":
      case "agent_usage_mismatch":
        classification.upgrade.push({
          target: signal.data.agentId || signal.data.filePath,
          reason: signal.description,
          source: signal.id,
        });
        break;

      case "fetch_zero_match":
      case "capability_gap":
        classification.upgrade.push({
          target: "capability_registry",
          reason: signal.description,
          source: signal.id,
        });
        break;

      case "git_diff_change":
        if (signal.data.status === "D") {
          classification.retire.push({
            target: signal.data.filePath,
            reason: signal.description,
            source: signal.id,
          });
        } else {
          classification.upgrade.push({
            target: signal.data.filePath,
            reason: signal.description,
            source: signal.id,
          });
        }
        break;

      case "repeated_pattern":
        if (signal.occurrenceCount >= 3) {
          classification.retain.push({
            target: "pattern_capture",
            reason: `High-frequency pattern: ${signal.description}`,
            source: signal.id,
          });
        }
        break;

      default:
        classification.retain.push({
          target: "review_needed",
          reason: signal.description,
          source: signal.id,
        });
    }
  }

  return classification;
}

/**
 * Generate evolution writeback packet
 */
async function generateEvolutionPacket(options) {
  const signals = await collectSignals(options);
  const uniqueSignals = deduplicateSignals(signals);
  const classification = classifySignals(uniqueSignals);

  // Load contract for target validation
  let contract = { runDiscipline: { evolutionWritebackTargets: WRITEBACK_TARGETS } };
  try {
    const contractContent = await fs.readFile(CONTRACT_PATH, "utf8");
    contract = JSON.parse(contractContent);
  } catch (error) {
    // Use defaults if contract unavailable
  }

  // Build writebacks list with target validation
  const writebacks = [];
  const allowedTargets = contract.runDiscipline?.evolutionWritebackTargets || WRITEBACK_TARGETS;

  for (const item of [...classification.upgrade, ...classification.retain]) {
    // Check if target matches allowed patterns
    const target = item.target;
    const isAllowed = allowedTargets.some((pattern) => {
      // Simple glob matching
      const regex = new RegExp(
        "^" + pattern.replace("{agent}", "[^/]+").replace(/\*/g, ".*") + "$"
      );
      return regex.test(target);
    });

    if (isAllowed) {
      writebacks.push({
        target,
        reason: item.reason,
      });
    }
  }

  // Determine writeback decision
  const hasHighSeverity = uniqueSignals.some((s) => s.severity === "high" || s.severity === "critical");
  const hasWritebacks = writebacks.length > 0;

  let writebackDecision = EVOLUTION_DECISIONS.NONE;
  let decisionReason = "No evolution action required";

  if (hasWritebacks && (hasHighSeverity || uniqueSignals.length >= 3)) {
    writebackDecision = EVOLUTION_DECISIONS.WRITEBACK;
    decisionReason = `Aggregated ${uniqueSignals.length} signals with ${writebacks.length} writeback targets`;
  } else if (hasWritebacks) {
    writebackDecision = EVOLUTION_DECISIONS.WRITEBACK;
    decisionReason = `Evolution signals detected with writeback candidates`;
  }

  return {
    packetVersion: "v1",
    generatedAt: new Date().toISOString(),
    source: "meta-kim-aggregate",
    ownerAssessment: "automated",
    writebackDecision,
    decisionReason,
    writebacks,
    retain: classification.retain.filter((item) => !writebacks.some((w) => w.target === item.target)),
    upgrade: classification.upgrade.filter((item) => !writebacks.some((w) => w.target === item.target)),
    retire: classification.retire,
    scarIds: uniqueSignals
      .filter((s) => s.severity === "critical")
      .map((s) => s.id),
    syncRequired: hasWritebacks,
    signalSummary: {
      totalSignals: uniqueSignals.length,
      byType: uniqueSignals.reduce((acc, s) => {
        acc[s.type] = (acc[s.type] || 0) + 1;
        return acc;
      }, {}),
      bySeverity: uniqueSignals.reduce((acc, s) => {
        acc[s.severity] = (acc[s.severity] || 0) + 1;
        return acc;
      }, {}),
    },
    signals: uniqueSignals.map((s) => ({
      id: s.id,
      type: s.type,
      severity: s.severity,
      description: s.description,
      timestamp: s.timestamp,
    })),
  };
}

/**
 * Merge multiple signal files
 */
async function mergeSignalFiles(options) {
  const signals = await collectSignals(options);
  const uniqueSignals = deduplicateSignals(signals);

  return {
    generatedAt: new Date().toISOString(),
    source: "meta-kim-aggregate:merge",
    summary: {
      totalSignals: uniqueSignals.length,
      byType: uniqueSignals.reduce((acc, s) => {
        acc[s.type] = (acc[s.type] || 0) + 1;
        return acc;
      }, {}),
      bySeverity: uniqueSignals.reduce((acc, s) => {
        acc[s.severity] = (acc[s.severity] || 0) + 1;
        return acc;
      }, {}),
    },
    signals: uniqueSignals,
  };
}

/**
 * Aggregate signals from all sources
 */
async function aggregateSignals(options) {
  const packet = await generateEvolutionPacket(options);

  return {
    generatedAt: new Date().toISOString(),
    source: "meta-kim-aggregate:aggregate",
    evolutionPacket: packet,
  };
}

/**
 * Trigger meta-chrysalis for writeback coordination
 */
async function triggerMetaChrysalis(packet, options) {
  // Pass packet through Evolution Writeback Gate for validation
  const gateResult = await processEvolutionPacket(packet, {
    force: options.force || false,
    dryRun: options.dryRun || false,
    boundaryModification: packet.writebacks &&
                              packet.writebacks.some(w => w.includes('agents/'))
  });

  // If gate rejects or defers, return gate result
  if (gateResult.decision === 'reject') {
    return {
      triggered: false,
      gateDecision: gateResult.decision,
      reason: gateResult.reason,
      fiveCriteria: gateResult.fiveCriteria,
      prinSt: gateResult.prinSt,
      recursiveRisk: gateResult.recursiveRisk
    };
  }

  if (gateResult.decision === 'defer') {
    return {
      triggered: false,
      gateDecision: gateResult.decision,
      reason: gateResult.reason,
      requiresUserConfirmation: true,
      fiveCriteria: gateResult.fiveCriteria,
      prinSt: gateResult.prinSt
    };
  }

  if (gateResult.decision === 'escalate') {
    return {
      triggered: false,
      gateDecision: gateResult.decision,
      reason: gateResult.reason,
      escalated: true,
      requiresDualReview: true,
      fiveCriteria: gateResult.fiveCriteria,
      prinSt: gateResult.prinSt
    };
  }

  // Gate approved - write packet to evolution directory
  if (!options.dryRun) {
    await fs.mkdir(options.outputDir, { recursive: true });

    const packetPath = path.join(
      options.outputDir,
      `evolution-packet-${Date.now()}.json`
    );

    // Include gate validation results in packet
    const enrichedPacket = {
      ...packet,
      gateValidation: {
        decision: gateResult.decision,
        riskLevel: gateResult.riskLevel,
        fiveCriteria: gateResult.fiveCriteria,
        prinSt: gateResult.prinSt,
        recursiveRisk: gateResult.recursiveRisk,
        validatedAt: new Date().toISOString()
      }
    };

    await fs.writeFile(packetPath, JSON.stringify(enrichedPacket, null, 2), "utf8");

    return {
      triggered: true,
      gateDecision: gateResult.decision,
      riskLevel: gateResult.riskLevel,
      packetPath: path.relative(repoRoot, packetPath),
    };
  }

  return {
    triggered: false,
    dryRun: true,
    gateDecision: gateResult.decision,
    riskLevel: gateResult.riskLevel,
    wouldWriteTo: path.relative(repoRoot, path.join(options.outputDir, `evolution-packet-${Date.now()}.json`)),
  };
}

/**
 * Format output based on options
 */
function formatOutput(data, options) {
  if (options.outputFormat === "pretty") {
    return JSON.stringify(data, null, 2);
  }
  return JSON.stringify(data);
}

/**
 * Main function
 */
async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  let result;
  let chrysalisResult = null;

  switch (options.command) {
    case "merge":
      result = await mergeSignalFiles(options);
      break;

    case "writeback":
      result = await generateEvolutionPacket(options);
      chrysalisResult = await triggerMetaChrysalis(result, options);
      if (chrysalisResult) {
        result.chrysalisTrigger = chrysalisResult;
      }
      break;

    case "aggregate":
    default:
      result = await aggregateSignals(options);
      break;
  }

  console.log(formatOutput(result, options));

  // Exit with non-zero if writeback is recommended
  if (
    result.evolutionPacket?.writebackDecision === EVOLUTION_DECISIONS.WRITEBACK &&
    !options.dryRun
  ) {
    process.exitCode = 0; // Non-zero only for errors
  }

  return result;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(JSON.stringify({ error: error.message }));
    process.exitCode = 1;
  });
}

export {
  main,
  collectSignals,
  deduplicateSignals,
  classifySignals,
  generateEvolutionPacket,
  mergeSignalFiles,
  aggregateSignals,
  triggerMetaChrysalis,
  EVOLUTION_DECISIONS,
  WRITEBACK_TARGETS,
};
