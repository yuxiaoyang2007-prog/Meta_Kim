#!/usr/bin/env node
/**
 * migrate-spine-state-eb004.mjs — EB-004 migration helper.
 *
 * Promotes legacy nested fields from `preDecisionOptionFrame` to the
 * top-level `state` object in every `.meta-kim/state/<profile>/spine/spine-state.json`.
 *
 * Migrated fields:
 *   - preDecisionOptionFrame.choiceSurfaceState  -> state.choiceSurfaceState
 *   - preDecisionOptionFrame.solutionChoiceState -> state.solutionChoiceState
 *   - preDecisionOptionFrame.choiceGateSkip      -> state.choiceGateSkip
 *
 * Semantics:
 *   - Idempotent: running again is a no-op if the legacy keys are already
 *     removed.
 *   - Safe by default: if both the top-level field and the nested field
 *     exist and disagree, the script aborts for that file with a clear
 *     message rather than silently picking a side.
 *   - Strict exit code: returns 1 if any file aborted, 0 otherwise.
 *
 * Usage:
 *   node scripts/migrate-spine-state-eb004.mjs
 *
 * See docs/v2.3.1-rfc-EB-004-preDecisionOptionFrame-nesting.md for the
 * canonical-location contract.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const STATE_DIR = ".meta-kim/state";
const FIELDS = ["choiceSurfaceState", "solutionChoiceState", "choiceGateSkip"];

function migrateFile(filePath) {
  const state = JSON.parse(readFileSync(filePath, "utf8"));
  const frame = state.preDecisionOptionFrame;
  if (!frame || typeof frame !== "object" || Array.isArray(frame)) {
    return { changed: false, reason: "no_frame" };
  }

  let changed = false;
  const errors = [];

  for (const field of FIELDS) {
    const frameValue = frame[field];
    const topValue = state[field];
    if (frameValue === undefined) continue;
    if (topValue !== undefined && topValue !== frameValue) {
      errors.push(
        `disagree on ${field}: top=${JSON.stringify(topValue)} frame=${JSON.stringify(frameValue)}`,
      );
      continue;
    }
    if (topValue === undefined) {
      state[field] = frameValue;
      changed = true;
    }
    delete frame[field];
    changed = true;
  }

  if (errors.length > 0) return { changed: false, errors };
  if (changed) writeFileSync(filePath, JSON.stringify(state, null, 2));
  return { changed };
}

function main() {
  if (!existsSync(STATE_DIR)) {
    console.log("No .meta-kim/state directory; nothing to migrate.");
    return 0;
  }

  const profiles = readdirSync(STATE_DIR);
  let migrated = 0;
  let skipped = 0;
  let aborted = 0;

  for (const profile of profiles) {
    const file = join(STATE_DIR, profile, "spine", "spine-state.json");
    if (!existsSync(file)) continue;
    const result = migrateFile(file);
    if (result.errors) {
      console.error(`[ABORT] ${file}:`);
      result.errors.forEach((e) => console.error("  - " + e));
      aborted++;
    } else if (result.changed) {
      console.log(`[MIGRATED] ${file}`);
      migrated++;
    } else {
      skipped++;
    }
  }

  console.log(
    `\nSummary: ${migrated} migrated, ${skipped} no-change, ${aborted} aborted.`,
  );
  return aborted > 0 ? 1 : 0;
}

process.exit(main());
