import process from "node:process";
import { readJsonFromStdin } from "./utils.mjs";

await readJsonFromStdin();

const additionalContext = [
  "Meta_Kim subagent rule set:",
  "- Theory source: canonical/skills/meta-theory/references/meta-theory.md",
  "- Canonical Claude agent source: .claude/agents/*.md",
  "- After editing agents or skills, run npm run meta:sync and npm run meta:validate",
  "- Prefer the smallest agent boundary that can solve the task cleanly",
  "- Do not fork runtime-specific instructions unless the target runtime genuinely requires it",
  "- Codex owner identity comes from the verified worker invocation envelope (ownerAgent + ownerSource + capabilityLoadout + role/co-ordination + metaKimBinding). task_name, followup target, and UI nickname are runtime instance labels only and must never be presented as the professional owner.",
  "- Graph context: if graphify-out/graph.json exists in the target project root, use Graphify as navigation, not as a context dump. For focused questions, prefer `graphify query \"<question>\" --budget 1000`, `graphify path \"A\" \"B\"`, or `graphify explain \"concept\"`; read GRAPH_REPORT.md only for broad architecture orientation. Treat graph results as candidate file anchors, verify route-changing claims against source files, and fall back to targeted repository search when graph results are generic, stale, or polluted by generated state. Never inject full graph.json or full GRAPH_REPORT.md.",
  "- CRITICAL: you are a dispatched subagent. If the task scope grows beyond your assigned boundary (multi-file, multi-module, multi-capability), report back to the dispatcher instead of self-expanding. Self-expansion is a governance violation.",
].join("\n");

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SubagentStart",
      additionalContext,
    },
  }),
);
