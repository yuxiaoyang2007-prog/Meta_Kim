import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import test from "node:test";

function writeAgent(agentsDir, filename, content) {
  writeFileSync(join(agentsDir, filename), `${content.trim()}\n`, "utf8");
}

test("Codex TOML discovery validates multiline instructions, required fields, and declared owner name", () => {
  const home = mkdtempSync(join(tmpdir(), "meta-kim-codex-agent-discovery-"));
  const agentsDir = join(home, ".codex", "agents");
  const profile = `codex-agent-discovery-${process.pid}-${Date.now()}`;
  const profileDir = resolve(".meta-kim", "state", profile);
  mkdirSync(agentsDir, { recursive: true });

  writeAgent(agentsDir, "valid-multiline.toml", `
name = "valid-multiline"
description = "Valid custom agent"
developer_instructions = """
Review the bounded task.
Return evidence and unresolved blockers.
"""
  `);
  writeAgent(agentsDir, "empty-instructions.toml", `
name = "empty-instructions"
description = "Empty instructions must fail"
developer_instructions = """

"""
  `);
  writeAgent(agentsDir, "missing-name.toml", `
description = "Missing name"
developer_instructions = "Do bounded work."
  `);
  writeAgent(agentsDir, "missing-description.toml", `
name = "missing-description"
developer_instructions = "Do bounded work."
  `);
  writeAgent(agentsDir, "missing-instructions.toml", `
name = "missing-instructions"
description = "Missing instructions"
  `);
  writeAgent(agentsDir, "filename-owner.toml", `
name = "search-specialist"
description = "The TOML name intentionally differs from the filename."
developer_instructions = "Do not use the filename as agent_type."
  `);

  const env = {
    ...process.env,
    USERPROFILE: home,
    HOME: home,
    META_KIM_PROFILE: profile,
    META_KIM_RUNTIME_FAMILY: "codex",
  };

  try {
    const discovery = spawnSync(
      process.execPath,
      [
        "scripts/discover-global-capabilities.mjs",
        "--runtime-inventory-only",
        "--targets",
        "codex",
        "--json",
        "--lang",
        "en",
      ],
      { cwd: process.cwd(), env, encoding: "utf8" },
    );
    assert.equal(discovery.status, 0, discovery.stderr);
    const inventory = JSON.parse(discovery.stdout);
    const agents = Object.values(inventory.byCapabilityType.agents ?? {});
    const byId = new Map(agents.map((agent) => [agent.id, agent]));

    const valid = byId.get("valid-multiline");
    assert.equal(valid?.metadata?.validCustomAgentDefinition, true);
    assert.match(valid?.metadata?.developer_instructions ?? "", /Review the bounded task\./u);
    assert.match(valid?.metadata?.developer_instructions ?? "", /Return evidence/u);

    const invalidCases = [
      ["empty-instructions", "missing_developer_instructions"],
      ["missing-name", "missing_name"],
      ["missing-description", "missing_description"],
      ["missing-instructions", "missing_developer_instructions"],
    ];
    for (const [id, error] of invalidCases) {
      const agent = byId.get(id);
      assert.ok(
        agent,
        `${id} must be discovered; got ${[...byId.keys()].join(", ")}`,
      );
      assert.equal(agent.metadata.validCustomAgentDefinition, false, id);
      assert.ok(agent.metadata.customAgentDefinitionErrors.includes(error), `${id}: ${error}`);
    }
    assert.equal(byId.has("filename-owner"), false);
    const declaredOwner = byId.get("search-specialist");
    assert.equal(declaredOwner?.metadata?.validCustomAgentDefinition, true);
    assert.equal(declaredOwner?.metadata?.nativeAgentName, "search-specialist");
    assert.equal(declaredOwner?.inventoryId, "filename-owner");

    const hostSchema = JSON.stringify({
      hostSurface: "spawn_agent",
      inputProperties: ["task_name", "message", "agent_type"],
      evidenceSource: "active_host_tool_schema",
    });
    const route = spawnSync(
      process.execPath,
      [
        "scripts/select-execution-route.mjs",
        "--task",
        "Critical Thinking Fetch Deep Thinking Review why Codex creates an agent instead of finding a global agent",
        "--runtime",
        "codex",
        "--os",
        "windows",
        "--json",
        "--codex-host-tool-schema",
        hostSchema,
      ],
      { cwd: process.cwd(), env, encoding: "utf8" },
    );
    assert.equal(route.status, 0, route.stderr);
    const routed = JSON.parse(route.stdout);
    assert.equal(routed.recommendedRoute?.owner, "search-specialist");
    const binding = routed.recommendedRoute?.codexSpawnBinding;
    assert.equal(binding?.ownerBindingMode, "native_custom_agent");
    assert.equal(binding?.nativeAgentType, "search-specialist");
    assert.equal(binding?.agent_type, "search-specialist");
    assert.notEqual(binding?.agent_type, "filename-owner");
    assert.equal(binding?.ownerDefinition?.nativeAgentName, "search-specialist");
    assert.equal(binding?.ownerDefinition?.nativeCustomAgentEligible, true);
  } finally {
    rmSync(profileDir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});
