#!/usr/bin/env node

import process from "node:process";
import { readMetaRunStatus } from "../canonical/runtime-assets/shared/hooks/spine-state.mjs";

const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const profileArg = process.argv.find((arg) => arg.startsWith("--profile="));
const profile =
  profileArg?.slice("--profile=".length) || process.env.META_KIM_STATE_PROFILE;

const DEFAULT_LABELS = {
  inactive: "meta_governance_status=inactive",
  active: "meta_governance_active",
  completed: "completed",
  current: "current",
  next: "next",
  blocked: "blocked",
  none: "none",
  separator: "=",
  listSeparator: ",",
};

const status = await readMetaRunStatus(process.cwd(), profile);

if (json) {
  console.log(JSON.stringify(status || null, null, 2));
  process.exit(0);
}

if (!status) {
  console.log(DEFAULT_LABELS.inactive);
  process.exit(0);
}

const labels = {
  ...DEFAULT_LABELS,
  ...(status.publicLabels && typeof status.publicLabels === "object"
    ? status.publicLabels
    : {}),
};
const completed = status.completed?.length
  ? status.completed.join(labels.listSeparator)
  : labels.none;
const stagePurpose = status.stagePurpose || status.stagePurposeKey || labels.none;

console.log(
  [
    `${labels.active}${labels.separator}${status.currentStage} (${status.stageIndex}/${status.stageTotal}, ${status.percent}%)`,
    `${labels.completed}${labels.separator}${completed}`,
    `${labels.current}${labels.separator}${stagePurpose}`,
    `${labels.next}${labels.separator}${status.next || labels.none}`,
    `${labels.blocked}${labels.separator}${status.blockedOn || labels.none}`,
  ].join("\n"),
);
