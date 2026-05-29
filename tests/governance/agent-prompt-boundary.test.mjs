import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

test("meta agents have operational boundaries and cannot be implementation workers", () => {
  for (const file of readdirSync("canonical/agents").filter((name) => name.startsWith("meta-"))) {
    const text = readFileSync(path.join("canonical/agents", file), "utf8");
    for (const section of ["Owns", "Does not own", "Trigger", "Required inputs", "Allowed actions", "Forbidden actions", "Output packet", "Pass criteria", "Fail criteria", "Escalation", "Silence / skip", "Verification", "Evolution", "Preserve"]) {
      assert.match(text, new RegExp(`^## ${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "m"), `${file} missing ${section}`);
    }
    assert.doesNotMatch(text, /subagent_type:\s*general-purpose/);
    assert.match(text, /not an implementation worker/);
  }
});
