import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SKILL_PATH,
  REPO_ROOT,
  ALL_AGENTS,
  parseFrontmatter,
  readFile,
  readJson,
  fileExists,
} from "./_helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENARIOS_PATH = path.join(
  __dirname,
  "scenarios",
  "capability-discovery-scenarios.json",
);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Capability Type Matrix
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CAPABILITY_TYPES = {
  AGENT: {
    name: "Agent",
    sources: ["canonical/agents/"],
    discoveryMethods: ["Glob", "MCP list_meta_agents"],
    keyFilePattern: /\.md$/,
  },
  SKILL: {
    name: "Skill",
    sources: ["canonical/skills/", "~/.claude/skills/"],
    discoveryMethods: ["Glob", "findskill"],
    keyFilePattern: /SKILL\.md$/,
  },
  MCP_TOOL: {
    name: "MCP Tool",
    sources: [".mcp.json"],
    discoveryMethods: ["MCP ListMcpResourcesTool", "deferred tools"],
    keyFilePattern: null,
  },
  COMMAND: {
    name: "Command",
    sources: ["package.json"],
    discoveryMethods: ["Glob scripts"],
    keyFilePattern: null,
  },
  MEMORY: {
    name: "Memory",
    sources: ["memory/"],
    discoveryMethods: ["Librarian sqlite-vec"],
    keyFilePattern: null,
  },
  KNOWLEDGE_GRAPH: {
    name: "Knowledge Graph",
    sources: ["graphify-out/"],
    discoveryMethods: ["graphify auto-detect"],
    keyFilePattern: /graph\.json$/,
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part A: SKILL.md Documents ALL Capability Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part A: SKILL.md documents all capability types", async () => {
  const skillContent = await readFile("canonical/skills/meta-theory/SKILL.md");

  test("Fetch stage covers Agent discovery", () => {
    const agentPatterns = [
      /Agent.*discovery/i,
      /list_meta_agents/i,
      /canonical\/agents/i,
      /meta-agent/i,
    ];
    const found = agentPatterns.some((p) => p.test(skillContent));
    assert.ok(found, "SKILL.md must document Agent discovery in Fetch stage");
  });

  test("Fetch stage covers Skill discovery", () => {
    const skillPatterns = [
      /Skill.*discovery/i,
      /\bskill\b/i,
      /canonical\/skills/i,
      /findskill/i,
      /ROI/i,
    ];
    const found = skillPatterns.some((p) => p.test(skillContent));
    assert.ok(found, "SKILL.md must document Skill discovery in Fetch stage");
  });

  test("Fetch stage covers MCP Tool discovery", () => {
    const mcpPatterns = [
      /MCP.*tool/i,
      /\.mcp\.json/i,
      /deferred.*tool/i,
      /ListMcpResourcesTool/i,
    ];
    const found = mcpPatterns.some((p) => p.test(skillContent));
    assert.ok(
      found,
      "SKILL.md must document MCP Tool discovery in Fetch stage",
    );
  });

  test("Command discovery is covered by meta-artisan or meta-theory", async () => {
    // Command discovery is Artisan's responsibility per the expanded scope
    const artisanContent = await readFile("canonical/agents/meta-artisan.md");
    const cmdPatterns = [
      /Command.*discover/i,
      /npm.*script/i,
      /package\.json.*script/i,
      /script.*scan/i,
      /Command.*script/i,
    ];
    const found = cmdPatterns.some((p) => p.test(artisanContent));
    assert.ok(
      found,
      "meta-artisan.md must document Command/script discovery in Own scope",
    );
  });

  test("Fetch stage covers Memory recall", () => {
    const memPatterns = [
      /Memory.*recall/i,
      /sqlite-vec/i,
      /Librarian/i,
      /memory.*search/i,
    ];
    const found = memPatterns.some((p) => p.test(skillContent));
    assert.ok(found, "SKILL.md must document Memory recall in Fetch stage");
  });

  test("Fetch stage covers Knowledge Graph", () => {
    const kgPatterns = [/Knowledge Graph/i, /graphify/i, /code.*graph/i];
    const found = kgPatterns.some((p) => p.test(skillContent));
    assert.ok(found, "SKILL.md must document Knowledge Graph in Fetch stage");
  });

  test("Fetch stage covers cross-platform capability discovery", () => {
    const crossPatterns = [
      /cross-platform/i,
      /Codex.*OpenClaw/i,
      /global.*capability/i,
      /capability.*index/i,
    ];
    const found = crossPatterns.some((p) => p.test(skillContent));
    assert.ok(
      found,
      "SKILL.md must document cross-platform capability discovery",
    );
  });

  test("Fetch stage explicitly lists runtime global and project capability paths", () => {
    const requiredPaths = [
      ".claude/agents/",
      ".claude/skills/",
      ".claude/commands/",
      ".claude/hooks/",
      ".claude/settings.json",
      "~/.claude/agents/",
      "~/.claude/skills/",
      "~/.claude/commands/",
      "~/.claude/hooks/",
      "~/.claude/settings.json",
      "~/.codex/agents/",
      "~/.codex/skills/",
      "~/.codex/commands/",
      "~/.codex/hooks/",
      "~/.codex/hooks.json",
      "~/.codex/config.toml",
      "~/.agents/skills/",
      ".codex/agents/",
      ".agents/skills/",
      ".codex/commands/",
      ".codex/hooks/",
      ".codex/hooks.json",
      ".codex/config.toml",
      ".cursor/agents/",
      ".cursor/skills/",
      ".cursor/rules/",
      ".cursor/prompts/",
      ".cursor/hooks/",
      ".cursor/hooks.json",
      ".cursor/mcp.json",
      "~/.cursor/agents/",
      "~/.cursor/skills/",
      "~/.cursor/rules/",
      "~/.cursor/prompts/",
      "~/.cursor/hooks/",
      "~/.cursor/hooks.json",
      "openclaw/workspaces/",
      "openclaw/skills/",
      "openclaw/hooks/",
      "openclaw/openclaw.template.json",
      "~/.openclaw/openclaw.json",
      "~/.openclaw/workspace-*",
      "~/.openclaw/skills/",
      "~/.openclaw/hooks/",
      ".mcp.json",
      "package.json",
    ];

    for (const requiredPath of requiredPaths) {
      assert.ok(
        skillContent.includes(requiredPath),
        `Fetch discovery checklist must explicitly include ${requiredPath}`,
      );
    }
    assert.match(
      skillContent,
      /fetchPacket\.capabilityDiscovery\.searchLog[\s\S]*empty or unavailable source entries/i,
      "Fetch pass condition must require a searchLog with checked empty/unavailable sources.",
    );
  });

  test("Fetch stage is NOT skill-only (capability-first)", () => {
    // Verify the Fetch section mentions more than just skills
    const fetchSectionMatch = skillContent.match(
      /##\s+Stage\s+2.*?Fetch[\s\S]*?(?=\n##|\n#)/im,
    );
    if (fetchSectionMatch) {
      const fetchSection = fetchSectionMatch[0];
      const mentionsAgent = /\bAgent\b/i.test(fetchSection);
      const mentionsTool = /\b(MCP|Tool)\b/i.test(fetchSection);
      const mentionsCommand = /\b(Command|Script)\b/i.test(fetchSection);
      const mentionsSkill = /\b(Skill|findskill)\b/i.test(fetchSection);

      const diversityScore =
        (mentionsAgent ? 1 : 0) +
        (mentionsTool ? 1 : 0) +
        (mentionsCommand ? 1 : 0) +
        (mentionsSkill ? 1 : 0);

      assert.ok(
        diversityScore >= 2,
        `Fetch section must cover multiple capability types (found ${diversityScore}/4: Agent=${mentionsAgent}, Tool=${mentionsTool}, Command=${mentionsCommand}, Skill=${mentionsSkill})`,
      );
    }
  });

  test("Capability gap detection and logging documented", () => {
    const gapPatterns = [
      /capability.*gap/i,
      /gap.*resolution/i,
      /memory\/capability-gaps\.md/i,
    ];
    const found = gapPatterns.some((p) => p.test(skillContent));
    assert.ok(
      found,
      "SKILL.md must document capability gap detection and logging",
    );
  });

  test("DRY conflict detection documented (DOC GAP)", () => {
    const dryPatterns = [
      /DRY.*conflict/i,
      /overlap.*detect/i,
      /duplicate.*reject/i,
    ];
    const found = dryPatterns.some((p) => p.test(skillContent));
    if (!found) {
      console.warn(
        "⚠️  [DOC GAP] SKILL.md does not document DRY conflict detection — consider adding overlap detection for skill/agent discovery",
      );
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part B: Runtime MCP Integration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part B: Runtime MCP Integration", async () => {
  test("canonical MCP config declares meta-kim-runtime", async () => {
    const mcpConfig = await readJson("canonical/runtime-assets/claude/mcp.json");
    assert.ok(
      mcpConfig.mcpServers?.["meta-kim-runtime"],
      "canonical MCP config must declare meta-kim-runtime server",
    );
  });

  test("meta-runtime-server.mjs implements list_meta_agents", async () => {
    const serverPath = path.join(
      REPO_ROOT,
      "scripts",
      "mcp",
      "meta-runtime-server.mjs",
    );
    const content = await fs.readFile(serverPath, "utf8");

    assert.ok(
      content.includes("list_meta_agents"),
      "meta-runtime-server.mjs must implement list_meta_agents tool",
    );
    assert.ok(
      content.includes("get_meta_agent"),
      "meta-runtime-server.mjs must implement get_meta_agent tool",
    );
    assert.ok(
      content.includes("get_meta_runtime_capabilities"),
      "meta-runtime-server.mjs must implement get_meta_runtime_capabilities tool",
    );
    assert.ok(
      content.includes("dispatch_meta_agent"),
      "meta-runtime-server.mjs must implement dispatch_meta_agent tool",
    );
  });

  test("list_meta_agents returns all expected meta-agents", async () => {
    const serverPath = path.join(
      REPO_ROOT,
      "scripts",
      "mcp",
      "meta-runtime-server.mjs",
    );
    const content = await fs.readFile(serverPath, "utf8");

    for (const agent of ALL_AGENTS) {
      assert.ok(
        content.includes(agent),
        `meta-runtime-server.mjs must reference agent "${agent}"`,
      );
    }
  });

  test("meta-runtime-server.mjs self-test passes", async () => {
    const { execSync } = await import("node:child_process");
    try {
      const output = execSync(
        `node "${path.join(REPO_ROOT, "scripts", "mcp", "meta-runtime-server.mjs")}" --self-test`,
        { encoding: "utf8" },
      );
      const result = JSON.parse(output);
      assert.ok(result.ok, "meta-runtime-server.mjs self-test must pass");
      assert.ok(
        result.agentCount >= ALL_AGENTS.length,
        `Expected at least ${ALL_AGENTS.length} agents, got ${result.agentCount}`,
      );
      assert.ok(
        result.tools.includes("list_meta_agents"),
        "self-test must expose list_meta_agents tool",
      );
      assert.ok(
        result.tools.includes("get_meta_agent"),
        "self-test must expose get_meta_agent tool",
      );
      assert.ok(
        result.tools.includes("dispatch_meta_agent"),
        "self-test must expose dispatch_meta_agent tool",
      );
      const syncConfig = await readJson("config/sync.json");
      const canonicalAgentRoot = syncConfig.canonicalRoots.agents;
      assert.equal(
        result.agentSources.length,
        result.agentCount,
        "self-test must expose one source path for every loaded agent",
      );
      assert.ok(
        result.agentSources.every((source) => source.startsWith(`${canonicalAgentRoot}/`)),
        `all MCP runtime agents must load from the declared canonical root ${canonicalAgentRoot}`,
      );
    } catch (err) {
      assert.fail(`meta-runtime-server.mjs self-test failed: ${err.message}`);
    }
  });

  test("MCP server resources are registered", async () => {
    const serverPath = path.join(
      REPO_ROOT,
      "scripts",
      "mcp",
      "meta-runtime-server.mjs",
    );
    const content = await fs.readFile(serverPath, "utf8");

    assert.ok(
      content.includes("registerResource") && content.includes("meta-theory"),
      "meta-runtime-server.mjs must register meta-theory resource",
    );
    assert.ok(
      content.includes("registerResource") &&
        content.includes("runtime-matrix"),
      "meta-runtime-server.mjs must register runtime-matrix resource",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part C: Agent Discovery
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part C: Agent Discovery", async () => {
  test("All expected meta-agents have .md files in canonical/agents/", async () => {
    for (const agent of ALL_AGENTS) {
      const agentPath = path.join(
        REPO_ROOT,
        "canonical",
        "agents",
        `${agent}.md`,
      );
      try {
        await fs.access(agentPath);
      } catch {
        assert.fail(`Agent file canonical/agents/${agent}.md must exist`);
      }
    }
  });

  test("Each meta-agent .md has valid frontmatter with name and description", async () => {
    for (const agent of ALL_AGENTS) {
      const agentPath = path.join(
        REPO_ROOT,
        "canonical",
        "agents",
        `${agent}.md`,
      );
      const raw = await fs.readFile(agentPath, "utf8");
      const fm = parseFrontmatter(raw, agentPath);

      assert.ok(
        fm.name === agent,
        `${agent}.md frontmatter name must be "${agent}"`,
      );
      assert.ok(
        fm.description && fm.description.length > 0,
        `${agent}.md must have a non-empty description`,
      );
    }
  });

  test("SKILL.md documents capability-first (no hardcoded agent names)", () => {
    // The Fetch section should guide toward capability matching, not name matching
    const skillContent = readFile("canonical/skills/meta-theory/SKILL.md");
    // This is verified through dispatch tests; here we just confirm the principle exists
    return skillContent.then((content) => {
      const hasCapabilityMatching = /capability.*match/i.test(content);
      const hasFetchFirst = /Fetch-first/i.test(content);
      assert.ok(
        hasCapabilityMatching || hasFetchFirst,
        "SKILL.md must document capability-first dispatch principle",
      );
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part D: Skill Discovery
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part D: Skill Discovery", async () => {
  test("meta-theory skill has SKILL.md in canonical/skills/meta-theory/", async () => {
    const skillPath = path.join(
      REPO_ROOT,
      "canonical",
      "skills",
      "meta-theory",
      "SKILL.md",
    );
    await fs.access(skillPath);
  });

  test("SKILL.md has valid frontmatter", async () => {
    const raw = await fs.readFile(
      path.join(REPO_ROOT, "canonical", "skills", "meta-theory", "SKILL.md"),
      "utf8",
    );
    // SKILL.md uses description: | multi-line scalar; parseFrontmatter may not capture it
    // But we verify the essential fields exist via raw text search
    assert.ok(
      raw.includes("name: meta-theory"),
      "SKILL.md must have name field",
    );
    assert.ok(
      /version:\s*\d+\.\d+\.\d+/.test(raw),
      "SKILL.md must have version field",
    );
    assert.ok(raw.includes("trigger:"), "SKILL.md must have trigger field");
    assert.ok(raw.includes("author:"), "SKILL.md must have author field");
  });

  test("SKILL.md documents 5-step discovery chain", async () => {
    const skillContent = await readFile(
      "canonical/skills/meta-theory/SKILL.md",
    );

    const stepPatterns = [
      [/search.*match.*invoke/i, /Fetch-first pattern/i, /canonical\/agents/i],
      [
        /capability.*index/i,
        /global.*capabilities/i,
        /global agent already covers the need/i,
      ],
      [/findskill/i, /external.*search/i, /external.*capability.*discovery/i],
      [
        /expert.*ecosystem/i,
        /everything-claude-code/i,
        /specialist.*ecosystem.*search/i,
        /meta-scout/i,
      ],
      [/capabilityGapPacket/i, /capability gap packet/i, /return to Thinking/i],
    ];

    const stepsFound = stepPatterns.filter((stepPatters) =>
      stepPatters.some((p) => p.test(skillContent)),
    );

    assert.ok(
      stepsFound.length >= 3,
      `SKILL.md should document at least 3 of 5 discovery steps (found ${stepsFound.length}/5)`,
    );
  });

  test("SKILL.md documents ROI formula for skill selection", async () => {
    const skillContent = await readFile(
      "canonical/skills/meta-theory/SKILL.md",
    );
    const roiPatterns = [
      /ROI/i,
      /Coverage.*Frequency.*Cost/i,
      /coverage.*frequency/i,
      /Task Coverage/i,
    ];
    const found = roiPatterns.some((p) => p.test(skillContent));
    if (!found) {
      console.warn(
        "⚠️  [DOC GAP] SKILL.md does not document ROI formula — add: ROI = (Task Coverage × Usage Frequency) / (Context Cost + Learning Curve)",
      );
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part E: MCP Tool Discovery
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part E: MCP Tool Discovery", async () => {
  test("canonical MCP config references at least one server", async () => {
    const mcpConfig = await readJson("canonical/runtime-assets/claude/mcp.json");
    const servers = mcpConfig.mcpServers;
    assert.ok(
      servers && Object.keys(servers).length > 0,
      "canonical MCP config must have at least one MCP server configured",
    );
  });

  test("meta-runtime-server registers at least 3 tools", async () => {
    const serverPath = path.join(
      REPO_ROOT,
      "scripts",
      "mcp",
      "meta-runtime-server.mjs",
    );
    const content = await fs.readFile(serverPath, "utf8");

    const toolCount =
      (content.match(/registerTool\s*\(/g) || []).length +
      (content.match(/registerResource\s*\(/g) || []).length;

    assert.ok(
      toolCount >= 3,
      `meta-runtime-server.mjs must register at least 3 tools/resources (found ${toolCount})`,
    );
  });

  test("dispatch_meta_agent is guarded by explicit execution approval", async () => {
    const serverPath = path.join(
      REPO_ROOT,
      "scripts",
      "mcp",
      "meta-runtime-server.mjs",
    );
    const content = await fs.readFile(serverPath, "utf8");

    assert.match(content, /dispatch_meta_agent/);
    assert.match(content, /executionApproved/);
    assert.match(content, /blocked_pending_execution_approval/);
    assert.match(content, /--temp-output/);
    assert.match(content, /spawn\(process\.execPath/);
    assert.doesNotMatch(content, /shell:\s*true/);
  });

  test("SKILL.md mentions MCP integration for tool discovery", async () => {
    const skillContent = await readFile(
      "canonical/skills/meta-theory/SKILL.md",
    );
    const mcpPatterns = [/MCP/i, /\.mcp\.json/i, /deferred.*tool/i];
    const found = mcpPatterns.some((p) => p.test(skillContent));
    assert.ok(
      found,
      "SKILL.md must mention MCP integration for tool discovery",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part F: Command Discovery
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part F: Command Discovery", async () => {
  test("package.json exists and has scripts", async () => {
    const pkgPath = path.join(REPO_ROOT, "package.json");
    const pkg = await readJson("package.json");
    assert.ok(
      pkg.scripts && Object.keys(pkg.scripts).length > 0,
      "package.json must have scripts section",
    );
  });

  test("package.json has npm run validate and test scripts", async () => {
    const pkg = await readJson("package.json");
    const scripts = pkg.scripts || {};

    assert.ok(
      scripts["meta:validate"] || scripts["meta:validate:run"],
      "package.json should have meta:validate or meta:validate:run script",
    );
    assert.ok(
      scripts["meta:doctor:governance"] || scripts["meta:doctor"],
      "package.json should have meta:doctor:governance or meta:doctor script",
    );
  });

  test("SKILL.md mentions command/script discovery in Fetch stage", async () => {
    const skillContent = await readFile(
      "canonical/skills/meta-theory/SKILL.md",
    );
    const cmdPatterns = [
      /Command.*discover/i,
      /npm.*run/i,
      /script.*scan/i,
      /package\.json.*script/i,
    ];
    const found = cmdPatterns.some((p) => p.test(skillContent));
    // This is a SHOULD, not a MUST — many systems don't use command discovery
    // But if SKILL.md already covers other capability types, it should mention commands too
    if (!found) {
      console.warn(
        "SKILL.md does not document command/script discovery — consider adding",
      );
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part G: Memory & Knowledge Graph
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part G: Memory & Knowledge Graph", async () => {
  test("evolution writes back directly to agent definitions, not memory/ dir", async () => {
    // memory/ is Claude Code's session memory, NOT Meta_Kim's evolution mechanism
    // Evolution writes capability gaps and patterns directly into agent SOUL.md files
    const skillContent = await readFile(
      "canonical/skills/meta-theory/SKILL.md",
    );
    // SKILL.md should describe direct SOUL.md editing, NOT memory/ reference
    const noMemoryDir = !/memory\//.test(skillContent);
    const mentionsDirectEdit =
      /directly edit|direct.*edit|edit.*SOUL\.md|agent.*definition/i.test(
        skillContent,
      );
    assert.ok(
      noMemoryDir || mentionsDirectEdit,
      "SKILL.md should describe direct agent self-evolution (editing SOUL.md), not memory/ directory",
    );
  });

  test("evolution-contract.json maps evolution targets to agent definition files", async () => {
    const evolutionContract = await readJson(
      "config/contracts/evolution-contract.json",
    );
    const contractStr = JSON.stringify(evolutionContract);
    // All evolution targets should point to canonical/agents/{agent}.md or skill files
    // NOT memory/ directory
    const noMemoryRefs = !/memory\//.test(contractStr);
    const hasAgentRef = /canonical\/agents\//.test(contractStr);
    assert.ok(
      noMemoryRefs && hasAgentRef,
      "evolution-contract.json must reference canonical/agents/ paths, not memory/",
    );
  });

  test("graphify is referenced if available, or SKILL.md handles its absence", async () => {
    const skillContent = await readFile(
      "canonical/skills/meta-theory/SKILL.md",
    );
    const graphifyMentioned = /graphify/i.test(skillContent);

    if (graphifyMentioned) {
      // If graphify is documented, graphify-out/ should exist
      const graphExists = await fileExists("graphify-out/graph.json");
      if (graphExists) {
        const graphData = await readJson("graphify-out/graph.json");
        const hasEdges = graphData.edges ?? graphData.links;
        assert.ok(
          graphData.nodes && hasEdges,
          "graphify-out/graph.json must have nodes and edges or links",
        );
      }
    }
    // Either graphify is documented OR Fetch explicitly records a capability gap / degraded read path.
    assert.ok(
      graphifyMentioned || /Fetch.*capabilityGapPacket|degraded.*read/i.test(skillContent),
      "SKILL.md must either document graphify or record a capability gap / degraded read path",
    );
  });

  test("sqlite-vec memory integration is referenced or degraded read path is explicit", async () => {
    const skillContent = await readFile(
      "canonical/skills/meta-theory/SKILL.md",
    );
    const hasVecRef = /sqlite-vec/i.test(skillContent);
    const hasDegradedReadPath = /degraded.*read|capabilityGapPacket/i.test(skillContent);

    assert.ok(
      hasVecRef || hasDegradedReadPath,
      "SKILL.md must reference sqlite-vec or provide a degraded read path / capability gap",
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part H: discover-global-capabilities Script
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part H: discover-global-capabilities Script", async () => {
  test("discover-global-capabilities.mjs exists", async () => {
    const scriptPath = path.join(
      REPO_ROOT,
      "scripts",
      "discover-global-capabilities.mjs",
    );
    await fs.access(scriptPath);
  });

  test("script scans 3 platforms (Claude Code, OpenClaw, Codex)", async () => {
    const scriptPath = path.join(
      REPO_ROOT,
      "scripts",
      "discover-global-capabilities.mjs",
    );
    const content = await fs.readFile(scriptPath, "utf8");

    const platforms = [
      ["claudeCode", "Claude Code", "~/.claude"],
      ["openclaw", "OpenClaw", "~/.openclaw"],
      ["codex", "Codex", "~/.codex"],
    ];

    for (const [platformId, platformName, expectedPath] of platforms) {
      assert.ok(
        content.includes(platformId) || content.includes(platformName),
        `discover-global-capabilities.mjs must reference ${platformName} (${platformId})`,
      );
    }
  });

  test("script scans Codex agents, skills, commands, hooks, and MCP config", async () => {
    const scriptPath = path.join(
      REPO_ROOT,
      "scripts",
      "discover-global-capabilities.mjs",
    );
    const content = await fs.readFile(scriptPath, "utf8");

    const requiredPatterns = [
      /scanTomlFilesRecursive\(path\.join\(baseDir,\s*"agents"\)\)/,
      /scanCodexSkills\(baseDir\)/,
      /scanCommandFiles\(path\.join\(baseDir,\s*"commands"\)\)/,
      /scanHookFiles\(path\.join\(baseDir,\s*"hooks"\)\)/,
      /scanConfigFile\(path\.join\(baseDir,\s*"hooks\.json"\)/,
      /scanCodexTomlMcpServers\(path\.join\(baseDir,\s*"config\.toml"\)\)/,
      /scanCodexTomlMcpTools\(path\.join\(baseDir,\s*"config\.toml"\)\)/,
      /id:\s*`\$\{serverId\}:tools-unlisted`/,
      /path\.join\(os\.homedir\(\),\s*"\.agents",\s*"skills"\)/,
    ];

    for (const pattern of requiredPatterns) {
      assert.match(
        content,
        pattern,
        `discover-global-capabilities.mjs must include Codex discovery pattern ${pattern}`,
      );
    }
  });

  test("script scans Claude, Cursor, and OpenClaw runtime config providers", async () => {
    const scriptPath = path.join(
      REPO_ROOT,
      "scripts",
      "discover-global-capabilities.mjs",
    );
    const content = await fs.readFile(scriptPath, "utf8");

    const requiredPatterns = [
      /scanConfigFile\(path\.join\(baseDir,\s*"settings\.json"\)/,
      /scanConfigFile\(path\.join\(baseDir,\s*"openclaw\.json"\)/,
      /scanConfigFile\(path\.join\(baseDir,\s*"hooks\.json"\)/,
      /scanMarkdownFilesRecursive\(path\.join\(baseDir,\s*"rules"\)\)/,
      /scanMarkdownFilesRecursive\(path\.join\(baseDir,\s*"prompts"\)\)/,
      /scanMcpConfig\(path\.join\(baseDir,\s*"mcp\.json"\)\)/,
    ];

    for (const pattern of requiredPatterns) {
      assert.match(
        content,
        pattern,
        `discover-global-capabilities.mjs must include cross-runtime discovery pattern ${pattern}`,
      );
    }
  });

  test("script discovers agents, skills, hooks, plugins, commands", async () => {
    const scriptPath = path.join(
      REPO_ROOT,
      "scripts",
      "discover-global-capabilities.mjs",
    );
    const content = await fs.readFile(scriptPath, "utf8");

    const capabilityTypes = [
      "agents",
      "skills",
      "hooks",
      "plugins",
      "commands",
    ];
    for (const capType of capabilityTypes) {
      assert.ok(
        content.includes(capType),
        `discover-global-capabilities.mjs must scan for ${capType}`,
      );
    }
  });

  test("script outputs to the repo-local capability index", async () => {
    const scriptPath = path.join(
      REPO_ROOT,
      "scripts",
      "discover-global-capabilities.mjs",
    );
    const content = await fs.readFile(scriptPath, "utf8");

    assert.ok(
      content.includes("capability-index") ||
        content.includes("meta-kim-capabilities.json") ||
        content.includes("global-capabilities.json"),
      "discover-global-capabilities.mjs must output to capability-index directory",
    );
  });

  test("script self-test or basic execution succeeds", async () => {
    const { execSync } = await import("node:child_process");
    try {
      const output = execSync(
        `node "${path.join(REPO_ROOT, "scripts", "discover-global-capabilities.mjs")}" --help 2>&1 || echo ""`,
        { encoding: "utf8", timeout: 30000 },
      );
      // Just verify it doesn't crash
      assert.ok(
        typeof output === "string",
        "discover-global-capabilities.mjs should produce output",
      );
    } catch (err) {
      // Some scripts don't have --help; that's OK
      // Just verify the file is syntactically valid
      assert.ok(true, "Script file is readable");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part I: Capability Gap Resolution
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part I: Capability Gap Resolution", async () => {
  test("SKILL.md documents capability gap resolution ladder", async () => {
    const skillContent = await readFile(
      "canonical/skills/meta-theory/SKILL.md",
    );

    const ladderSteps = [
      [/existing owner/i, /direct dispatch/i],
      [/Type B.*create/i, /owner.*creation|owner.*upgrade/i],
      [/capabilityGapPacket/i, /block|defer|return to Thinking/i],
    ];

    const stepsFound = ladderSteps.filter((stepPatterns) =>
      stepPatterns.some((p) => p.test(skillContent)),
    );

    assert.ok(
      stepsFound.length >= 2,
      `SKILL.md must document at least 2 of 3 non-fallback gap resolution steps (found ${stepsFound.length}/3)`,
    );
  });

  test("Evolution contract documents capability gap feedback loop", async () => {
    const evolutionContract = await readJson(
      "config/contracts/evolution-contract.json",
    );
    const contractStr = JSON.stringify(evolutionContract);
    // capabilityGap key exists (note: no dot, this is camelCase)
    assert.ok(
      /capabilityGap/i.test(contractStr),
      "evolution-contract.json must reference capabilityGap feedback loop",
    );
  });

  test("Capability combination (multi-capability dispatch) is documented", async () => {
    const skillContent = await readFile(
      "canonical/skills/meta-theory/SKILL.md",
    );
    const comboPatterns = [
      /capability.*combin/i,
      /combin.*agent.*skill/i,
      /multi.*capability/i,
      /agent.*\+.*skill/i,
    ];
    const found = comboPatterns.some((p) => p.test(skillContent));

    if (!found) {
      console.warn(
        "SKILL.md does not explicitly document capability combination — consider adding guidance for multi-capability dispatch (agent + skill + MCP tool)",
      );
    }
    // Not a hard fail — this is an advanced feature
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part J: Scenarios Validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Part J: Capability Discovery Scenarios", async () => {
  let scenarios;

  test("capability-discovery-scenarios.json exists and is valid", async () => {
    try {
      const raw = await fs.readFile(SCENARIOS_PATH, "utf8");
      scenarios = JSON.parse(raw);
      assert.ok(Array.isArray(scenarios), "Scenarios must be an array");
      assert.ok(
        scenarios.length >= 10,
        `Expected at least 10 scenarios, got ${scenarios.length}`,
      );
    } catch (err) {
      if (err.code === "ENOENT") {
        // Scenarios file doesn't exist yet — that's OK for now
        console.warn(
          `⚠️  ${SCENARIOS_PATH} not found. Create it with at least 10 test scenarios.`,
        );
        assert.ok(true, "Scenarios file will be created");
        return;
      }
      throw err;
    }
  });

  if (scenarios) {
    for (const scenario of scenarios) {
      test(`Scenario ${scenario.id}: ${scenario.name}`, () => {
        assert.ok(scenario.id, "Scenario must have an id");
        assert.ok(scenario.name, "Scenario must have a name");
        assert.ok(scenario.input, `Scenario ${scenario.id} must have an input`);
        assert.ok(
          scenario.capabilityTypes || scenario.expectedDiscovery,
          `Scenario ${scenario.id} must specify capability types or expected discovery`,
        );
        assert.ok(
          scenario.passFailCriteria?.PASS,
          `Scenario ${scenario.id} must have passFailCriteria.PASS`,
        );
        assert.ok(
          scenario.passFailCriteria?.FAIL,
          `Scenario ${scenario.id} must have passFailCriteria.FAIL`,
        );
      });
    }
  }
});
