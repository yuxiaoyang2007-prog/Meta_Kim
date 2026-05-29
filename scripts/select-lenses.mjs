#!/usr/bin/env node
import { readJson } from "./governance-lib.mjs";

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const taskShape = argValue("--taskShape", argValue("--task-shape", "fuzzy_complex_task"));
const realIntent = argValue("--realIntent", "");
const constraints = argValue("--constraints", "");
const domain = argValue("--domain", "");
const evidenceGap = argValue("--evidenceGap", "");
const outputType = argValue("--outputType", "");
const json = process.argv.includes("--json");

const catalog = await readJson("config/governance/lens-seed-catalog.json");
const policy = await readJson("config/governance/lens-discovery-policy.json");
const context = `${taskShape} ${realIntent} ${constraints} ${domain} ${evidenceGap} ${outputType}`.toLowerCase();

function score(seed) {
  let value = 0;
  if ((seed.taskShapeFit ?? []).some((fit) => context.includes(fit) || fit.includes(taskShape.split("_")[0]))) value += 35;
  for (const word of (policy.taskShapeHints?.[taskShape] ?? [])) {
    if (JSON.stringify(seed).toLowerCase().includes(word)) value += 8;
  }
  if ((seed.outputImpact ?? []).length) value += 20;
  if ((seed.useWhen ?? []).some((item) => context.includes(item.split(" ")[0].toLowerCase()))) value += 10;
  return value;
}

const candidates = catalog.seeds
  .map((seed) => ({ ...seed, score: score(seed) }))
  .sort((a, b) => b.score - a.score);
const dynamicCandidates = candidates.filter((candidate) => candidate.score > 0);
const seedLensFallbackUsed = dynamicCandidates.length < policy.candidatePoolMinimum;
const pool = seedLensFallbackUsed ? candidates : dynamicCandidates;
const selected = pool
  .filter((candidate) => candidate.score > 0 || seedLensFallbackUsed)
  .slice(0, Math.max(policy.selectedLensMin, Math.min(policy.selectedLensMax, pool.length)))
  .map((lens) => ({
    id: lens.id,
    sourceName: lens.sourceName,
    reason: lens.score > 0 ? "Matches task shape or output impact." : "Seed fallback to maintain candidate pool.",
    question: lens.questions?.[0] ?? "",
    decisionImpact: lens.outputImpact?.[0] ?? "pathSelection",
    outputImpact: lens.outputImpact ?? []
  }));
const selectedIds = new Set(selected.map((lens) => lens.id));
const omitted = candidates
  .filter((candidate) => !selectedIds.has(candidate.id))
  .map((lens) => ({ id: lens.id, omittedReason: "Lower task fit or weaker decision impact for this run." }));

const output = {
  discoveredLensCandidates: pool,
  seedLensFallbackUsed,
  selectedLenses: selected,
  omittedLenses: omitted,
  whyEachLensChangesDecision: Object.fromEntries(
    selected.map((lens) => [
      lens.id,
      {
        changedDecisionDimension: lens.decisionImpact,
        outputImpact: lens.outputImpact
      }
    ]),
  ),
};

console.log(JSON.stringify(output, null, 2));
