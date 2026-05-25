import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  preserveGeneratedAtWhenUnchanged,
} from "../../scripts/discover-global-capabilities.mjs";
import {
  repoRoot,
  resolveRuntimeProjection,
} from "../../scripts/meta-kim-sync-config.mjs";

const canonicalIndexPath = path.join(
  repoRoot,
  "config",
  "capability-index",
  "meta-kim-capabilities.json",
);

const mirrorIndexPaths = [
  ".claude/capability-index/meta-kim-capabilities.json",
  ".codex/capability-index/meta-kim-capabilities.json",
  "openclaw/capability-index/meta-kim-capabilities.json",
  ".cursor/capability-index/meta-kim-capabilities.json",
].map((relativePath) => path.join(repoRoot, relativePath));

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(repoRoot, relativePath), "utf8"));
}

async function listCanonicalSkillIds() {
  const skillsRoot = path.join(repoRoot, "canonical", "skills");
  const entries = await fs.readdir(skillsRoot, { withFileTypes: true });
  const ids = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      await fs.access(path.join(skillsRoot, entry.name, "SKILL.md"));
      ids.push(entry.name);
    } catch {}
  }
  return ids.sort();
}

describe("capability index inheritance chain", () => {
  test("repo canonical index and all runtime mirrors are byte-for-byte identical", async () => {
    const canonical = await fs.readFile(canonicalIndexPath, "utf8");
    for (const mirrorPath of mirrorIndexPaths) {
      assert.equal(
        await fs.readFile(mirrorPath, "utf8"),
        canonical,
        `${path.relative(repoRoot, mirrorPath).replace(/\\/g, "/")} must exactly mirror the canonical capability index`,
      );
    }
  });

  test("capability index covers every canonical agent and root skill", async () => {
    const index = await readJson("config/capability-index/meta-kim-capabilities.json");
    const indexedAgentPaths = new Set(
      Object.values(index.byCapabilityType?.agents ?? {}).map((entry) => entry.path),
    );
    const indexedSkillPaths = new Set(
      Object.values(index.byCapabilityType?.skills ?? {}).map((entry) => entry.path),
    );

    const agentFiles = (await fs.readdir(path.join(repoRoot, "canonical", "agents")))
      .filter((file) => file.endsWith(".md"))
      .map((file) => `canonical/agents/${file}`)
      .sort();
    const skillPaths = (await listCanonicalSkillIds()).map(
      (id) => `canonical/skills/${id}/SKILL.md`,
    );

    assert.deepEqual(
      agentFiles.filter((agentPath) => !indexedAgentPaths.has(agentPath)),
      [],
      "every canonical agent file must be represented in byCapabilityType.agents",
    );
    assert.deepEqual(
      skillPaths.filter((skillPath) => !indexedSkillPaths.has(skillPath)),
      [],
      "every canonical skill SKILL.md must be represented in byCapabilityType.skills",
    );
  });

  test("capability index covers canonical runtime commands", async () => {
    const index = await readJson("config/capability-index/meta-kim-capabilities.json");
    const commandPaths = new Set(
      Object.values(index.byCapabilityType?.commands ?? {}).map((entry) => entry.path),
    );

    for (const expectedPath of [
      "canonical/runtime-assets/claude/commands/save-progress/SKILL.md",
      "canonical/runtime-assets/codex/commands/meta-theory.md",
    ]) {
      assert.ok(
        commandPaths.has(expectedPath),
        `${expectedPath} must be represented in byCapabilityType.commands`,
      );
    }
    assert.ok(
      index.summary?.totalCommands >= 2,
      "capability index summary must count canonical runtime commands",
    );
  });

  test("sync configuration treats canonical skills as a directory of skills", async () => {
    const manifest = await readJson("config/sync.json");
    assert.equal(manifest.canonicalRoots?.skills, "canonical/skills");
    assert.ok(
      manifest.generatedTargets?.codex?.includes(".agents/skills"),
      "Codex project skill projection must include the official .agents/skills root.",
    );

    for (const runtimeId of ["claude", "codex", "openclaw", "cursor"]) {
      const projection = resolveRuntimeProjection(runtimeId, "project");
      assert.ok(
        projection.skillsDir,
        `${runtimeId} projection must expose a runtime skills directory`,
      );
      assert.equal(
        projection.skillsDir.endsWith(path.join("skills")),
        true,
        `${runtimeId} projection skillsDir must point at the runtime skills root`,
      );
      assert.ok(
        projection.capabilityIndexDir,
        `${runtimeId} projection must expose a capability index mirror directory`,
      );
    }

    const codexProjection = resolveRuntimeProjection("codex", "project");
    assert.equal(
      codexProjection.projectSkillsDir.endsWith(path.join(".agents", "skills")),
      true,
      "Codex project projection must expose .agents/skills as the project skill root.",
    );
  });

  test("release verification refreshes global capability discovery before checks", async () => {
    const pkg = await readJson("package.json");
    for (const scriptName of ["meta:verify:all", "meta:verify:all:live"]) {
      const script = pkg.scripts?.[scriptName] ?? "";
      assert.match(script, /npm run discover:global/);
      assert.ok(
        script.indexOf("npm run discover:global") < script.indexOf("npm run meta:check"),
        `${scriptName} must refresh capability indexes before validation checks`,
      );
    }
  });

  test("global discovery keeps volatile timestamps stable when canonical capability content is unchanged", () => {
    const existing = {
      generatedAt: "2026-05-23T21:39:16.715Z",
      registryName: "meta-kim-capabilities",
      summary: { totalAgents: 9 },
      byCapabilityType: {
        mcpServers: {
          "repo:repo-mcp:meta-kim-runtime": {
            id: "meta-kim-runtime",
            modified: "2026-05-20T05:24:46.853Z",
          },
        },
      },
    };
    const next = {
      generatedAt: "2026-05-23T21:45:13.184Z",
      registryName: "meta-kim-capabilities",
      summary: { totalAgents: 9 },
      byCapabilityType: {
        mcpServers: {
          "repo:repo-mcp:meta-kim-runtime": {
            id: "meta-kim-runtime",
            modified: "2026-05-24T09:13:38.181Z",
          },
        },
      },
    };

    assert.deepEqual(
      preserveGeneratedAtWhenUnchanged(next, existing),
      existing,
      "pure regeneration must not dirty canonical capability index timestamps",
    );
    assert.equal(
      preserveGeneratedAtWhenUnchanged(
        { ...next, summary: { totalAgents: 10 } },
        existing,
      ).generatedAt,
      next.generatedAt,
      "real capability content changes must keep the new generation timestamp",
    );
  });

  test("project validator enforces the capability index schema contract", async () => {
    const source = await fs.readFile(
      path.join(repoRoot, "scripts", "validate-project.mjs"),
      "utf8",
    );
    assert.match(source, /capability-index\.schema\.json/);
    assert.match(source, /validateCapabilityIndexSchema/);
    assert.match(source, /schemaNode\.required/);
  });

  test("capability index declares abstract slots and run-only runtime skill selections", async () => {
    const index = await readJson("config/capability-index/meta-kim-capabilities.json");
    const providerIds = [
      "meta-theory",
      "agent-teams-playbook",
      "superpowers",
      "ecc",
      "findskill",
    ];

    assert.ok(Array.isArray(index.abstractCapabilitySlots));
    assert.ok(index.abstractCapabilitySlots.length >= 1);
    assert.ok(
      index.abstractCapabilitySlots.some(
        (slot) => slot.slotId === "interface-integration-contract",
      ),
      "capability index must expose the abstract interface integration contract slot",
    );
    assert.equal(
      index.longTermAgentIdentityPolicy?.forbidConcreteSkillInLongTermAgentIdentity,
      true,
    );
    assert.equal(index.runtimeSelectedSkills?.selectedSkillScope, "run_only");

    for (const providerId of providerIds) {
      assert.equal(
        index.metaSkillProviders?.[providerId]?.allowedForLongTermAgentIdentity,
        true,
        `${providerId} must be allowed as a long-term meta-skill package provider`,
      );
      assert.ok(
        index.longTermAgentIdentityPolicy?.allowedMetaSkillProviderIds?.includes(providerId),
        `${providerId} must be listed in the long-term identity provider allowlist`,
      );
    }

    for (const slot of index.abstractCapabilitySlots) {
      assert.ok(slot.slotId, "abstract capability slots need stable ids");
      assert.equal(slot.selectedSkillScope, "run_only");
      assert.ok(Array.isArray(slot.allowedProviderIds));
      assert.ok(slot.allowedProviderIds.length >= 1);
    }
  });

  test("schema requires the capability slot/provider/runtime selection contract", async () => {
    const schema = await readJson("config/contracts/capability-index.schema.json");

    for (const field of [
      "abstractCapabilitySlots",
      "metaSkillProviders",
      "runtimeSelectedSkills",
      "longTermAgentIdentityPolicy",
    ]) {
      assert.ok(schema.required.includes(field), `schema must require ${field}`);
      assert.ok(schema.properties?.[field], `schema must define ${field}`);
    }

    assert.deepEqual(
      schema.properties.runtimeSelectedSkills.properties.selectedSkillScope.enum,
      ["run_only"],
    );
    assert.deepEqual(
      schema.properties.longTermAgentIdentityPolicy.properties
        .forbidConcreteSkillInLongTermAgentIdentity.const,
      true,
    );
  });
});
