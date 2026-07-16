#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { repairEphemeralProjectRegistryEntries } from "./project-registry.mjs";

const DEFAULT_SAMPLE_SIZE = 5;

function helpText() {
  return [
    "Usage: node scripts/repair-project-registry.mjs [--dry-run | --apply] [options]",
    "",
    "Default: dry-run. Apply mode backs up the registry and removes only missing",
    "project-bootstrap entries located strictly beneath the current OS temp root.",
    "",
    "Options:",
    "  --home-dir <path>    inspect an explicit user home",
    "  --sample-size <n>    compact output sample size (default: 5)",
    "  --verbose            emit the complete candidates/skipped/deleted packet",
    "  -h, --help           show this help",
  ].join("\n");
}

function parseArgs(argv) {
  let apply = false;
  let explicitDryRun = false;
  let homeDir = os.homedir();
  let verbose = false;
  let sampleSize = DEFAULT_SAMPLE_SIZE;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--dry-run") {
      explicitDryRun = true;
      continue;
    }
    if (arg === "--home-dir") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--home-dir requires a path");
      }
      homeDir = path.resolve(value);
      index += 1;
      continue;
    }
    if (arg === "--sample-size") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--sample-size requires a non-negative integer");
      }
      sampleSize = Number(value);
      if (!Number.isSafeInteger(sampleSize) || sampleSize < 0) {
        throw new Error("--sample-size requires a non-negative integer");
      }
      index += 1;
      continue;
    }
    if (arg === "--verbose") {
      verbose = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { help: true, apply: false, homeDir, verbose, sampleSize };
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (apply && explicitDryRun) {
    throw new Error("--apply and --dry-run are mutually exclusive");
  }
  return { help: false, apply, homeDir, verbose, sampleSize };
}

function countSkippedReasons(skipped = []) {
  return Object.fromEntries(
    [...skipped.reduce((counts, item) => {
      counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
      return counts;
    }, new Map())].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function compactAudit(result, sampleSize) {
  const candidates = result.candidates ?? [];
  const skipped = result.skipped ?? [];
  const deleted = result.deleted ?? [];
  const becameIneligible = result.becameIneligible ?? [];
  return {
    schemaVersion: result.schemaVersion,
    mode: result.mode,
    registryPath: result.registryPath,
    registryExists: result.registryExists,
    criteria: result.criteria,
    scannedCount: result.scannedCount,
    eligibleCount: result.eligibleCount,
    skippedCount: result.skippedCount,
    deletedCount: result.deletedCount,
    skippedByReason: countSkippedReasons(skipped),
    backup: result.backup,
    transaction: result.transaction,
    candidateSample: candidates.slice(0, sampleSize),
    skippedSample: skipped.slice(0, sampleSize),
    deletedSample: deleted.slice(0, sampleSize),
    becameIneligibleSample: becameIneligible.slice(0, sampleSize),
    omitted: {
      candidates: Math.max(0, candidates.length - sampleSize),
      skipped: Math.max(0, skipped.length - sampleSize),
      deleted: Math.max(0, deleted.length - sampleSize),
      becameIneligible: Math.max(0, becameIneligible.length - sampleSize),
    },
    fullPacketFlag: "--verbose",
  };
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText());
  } else {
    const result = await repairEphemeralProjectRegistryEntries(options);
    const output = options.verbose ? result : compactAudit(result, options.sampleSize);
    console.log(`${JSON.stringify(output, null, 2)}\n`);
  }
} catch (error) {
  console.error(
    `${JSON.stringify({
      ok: false,
      error: error.message,
      transaction: error.transaction ?? "not_started",
      backup: error.backup ?? null,
    })}\n`,
  );
  process.exitCode = 1;
}
