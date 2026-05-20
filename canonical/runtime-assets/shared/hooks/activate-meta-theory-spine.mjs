import process from "node:process";
import { join } from "node:path";
import { readJsonFromStdin } from "./utils.mjs";
import {
  readSpineState,
  writeSpineState,
  createInitialState,
} from "./spine-state.mjs";

const cwd = process.cwd();
const payload = await readJsonFromStdin();
const toolName = payload?.tool_name ?? "";
const toolInput = payload?.tool_input ?? {};

function getSkillName() {
  return (
    toolInput?.skill_name ||
    toolInput?.name ||
    toolInput?.skill ||
    ""
  ).toLowerCase();
}

const skillName = getSkillName();
if (toolName !== "Skill" || !skillName.includes("meta-theory")) {
  process.exit(0);
}

const existing = await readSpineState(cwd);
if (existing && existing.active) {
  process.exit(0);
}

const state = createInitialState({
  taskClassification: "meta_theory_auto",
  triggerReason: "skill_activation_auto",
});

await writeSpineState(cwd, state);
process.exit(0);
