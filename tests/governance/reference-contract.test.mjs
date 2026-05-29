import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

test("meta-theory references expose executable contracts", () => {
  const sections = ["Use when", "Required inputs", "Do", "Do not", "Required packet", "Pass", "Fail", "Block", "Return to stage", "Verification", "Writeback", "Preserve"];
  for (const file of readdirSync("canonical/skills/meta-theory/references").filter((name) => name.endsWith(".md"))) {
    const text = readFileSync(path.join("canonical/skills/meta-theory/references", file), "utf8");
    for (const section of sections) {
      assert.match(text, new RegExp(`^## ${section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "m"), `${file} missing ${section}`);
    }
  }
});
