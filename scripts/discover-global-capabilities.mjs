/**
 * Meta_Kim 跨平台能力发现器 v2
 *
 * 功能：
 * 1. 扫描4个平台的全局能力（agents/skills/hooks/plugins/commands）
 * 2. 使用直接文件遍历而不是glob，更可靠
 * 3. 生成统一的能力索引
 * 4. 支持 Claude Code / OpenClaw / Codex / Cursor
 */

import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensureProfileState } from "./meta-kim-local-state.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const CANONICAL_CAPABILITY_INDEX =
  "config/capability-index/meta-kim-capabilities.json";
const LOCAL_GLOBAL_INVENTORY =
  ".meta-kim/state/{profile}/capability-index/global-capabilities.json";
const LONG_TERM_META_SKILL_PROVIDER_IDS = [
  "meta-theory",
  "agent-teams-playbook",
  "superpowers",
  "ecc",
  "findskill",
];

function buildMetaSkillProviderContract() {
  const metaSkillProviders = Object.fromEntries(
    LONG_TERM_META_SKILL_PROVIDER_IDS.map((id) => [
      id,
      {
        id,
        providerKind: "meta-skill-package",
        allowedForLongTermAgentIdentity: true,
        concreteSubSkillBindingForbidden: true,
        notes:
          "May be referenced as a long-term provider package; concrete child skills are selected per run during Fetch.",
      },
    ]),
  );

  return {
    abstractCapabilitySlots: [
      {
        slotId: "run-scoped-meta-skill-selection",
        description:
          "Abstract slot for selecting concrete child skills at runtime Fetch without binding them into long-term meta-agent identity.",
        allowedProviderIds: LONG_TERM_META_SKILL_PROVIDER_IDS,
        selectedSkillScope: "run_only",
      },
      {
        slotId: "interface-integration-contract",
        description:
          "Abstract slot for internal API and third-party provider integration work: evidence-backed field ledger, provider adapter boundary, auth/signature, idempotency, callback, error model, contract tests, observability, and rollback gates.",
        allowedProviderIds: LONG_TERM_META_SKILL_PROVIDER_IDS,
        selectedSkillScope: "run_only",
      },
    ],
    metaSkillProviders,
    runtimeSelectedSkills: {
      selectedSkillScope: "run_only",
      persistencePolicy:
        "Runtime-selected concrete skills are scoped to the current run and must not be persisted into long-term agent identity.",
    },
    longTermAgentIdentityPolicy: {
      forbidConcreteSkillInLongTermAgentIdentity: true,
      allowedMetaSkillProviderIds: LONG_TERM_META_SKILL_PROVIDER_IDS,
      forbiddenConcreteSkillPatterns: [
        "provider/*",
        "provider:child-skill",
        "runtime-specific child skill id",
      ],
    },
  };
}

// ========== 平台定义 ==========

const PLATFORMS = {
  claudeCode: {
    name: "Claude Code",
    baseDir: () => path.join(os.homedir(), ".claude"),
    // 每个类型的扫描函数
    scanners: {
      agents: async (baseDir) =>
        scanMarkdownFiles(path.join(baseDir, "agents")),
      skills: async (baseDir) => scanSkillFiles(path.join(baseDir, "skills")),
      hooks: async (baseDir) =>
        mergeCapabilityLists(
          await scanHookFiles(path.join(baseDir, "hooks")),
          await scanConfigFile(path.join(baseDir, "settings.json"), {
            id: "settings-json",
            providerKind: "runtime-settings",
          }),
        ),
      plugins: async (baseDir) =>
        scanPluginFiles(path.join(baseDir, "plugins")),
      commands: async (baseDir) =>
        scanCommandFiles(path.join(baseDir, "commands")),
      mcpServers: async (baseDir) =>
        scanMcpConfig(path.join(baseDir, "settings.json")).then((result) => result.servers),
      mcpTools: async (baseDir) =>
        scanMcpConfig(path.join(baseDir, "settings.json")).then((result) => result.tools),
    },
  },
  openclaw: {
    name: "OpenClaw",
    baseDir: () => path.join(os.homedir(), ".openclaw"),
    scanners: {
      agents: async (baseDir) => scanOpenClawAgents(baseDir),
      skills: async (baseDir) => scanOpenClawSkills(baseDir),
      hooks: async (baseDir) =>
        mergeCapabilityLists(
          await scanHookFiles(path.join(baseDir, "hooks")),
          await scanConfigFile(path.join(baseDir, "openclaw.json"), {
            id: "openclaw-json",
            providerKind: "runtime-config",
          }),
        ),
      commands: async (baseDir) =>
        scanCommandFiles(path.join(baseDir, "commands")),
    },
  },
  codex: {
    name: "Codex",
    baseDir: () => path.join(os.homedir(), ".codex"),
    scanners: {
      agents: async (baseDir) =>
        scanTomlFilesRecursive(path.join(baseDir, "agents")),
      skills: async (baseDir) => scanCodexSkills(baseDir),
      hooks: async (baseDir) =>
        mergeCapabilityLists(
          await scanHookFiles(path.join(baseDir, "hooks")),
          await scanConfigFile(path.join(baseDir, "hooks.json"), {
            id: "hooks-json",
            providerKind: "hook-config",
          }),
        ),
      commands: async (baseDir) =>
        scanCommandFiles(path.join(baseDir, "commands")),
      mcpServers: async (baseDir) =>
        scanCodexTomlMcpServers(path.join(baseDir, "config.toml")),
      mcpTools: async (baseDir) =>
        scanCodexTomlMcpTools(path.join(baseDir, "config.toml")),
    },
  },
  cursor: {
    name: "Cursor",
    baseDir: () => path.join(os.homedir(), ".cursor"),
    scanners: {
      agents: async (baseDir) =>
        scanMarkdownFiles(path.join(baseDir, "agents")),
      skills: async (baseDir) => scanCursorSkills(baseDir),
      hooks: async (baseDir) =>
        mergeCapabilityLists(
          await scanHookFiles(path.join(baseDir, "hooks")),
          await scanConfigFile(path.join(baseDir, "hooks.json"), {
            id: "hooks-json",
            providerKind: "hook-config",
          }),
        ),
      rules: async (baseDir) =>
        scanMarkdownFilesRecursive(path.join(baseDir, "rules")),
      prompts: async (baseDir) =>
        scanMarkdownFilesRecursive(path.join(baseDir, "prompts")),
      mcpServers: async (baseDir) =>
        scanMcpConfig(path.join(baseDir, "mcp.json")).then((result) => result.servers),
      mcpTools: async (baseDir) =>
        scanMcpConfig(path.join(baseDir, "mcp.json")).then((result) => result.tools),
      plugins: async (baseDir) =>
        scanPluginFiles(path.join(baseDir, "plugins")),
    },
  },
};

const TARGET_ALIASES = {
  claude: "claudeCode",
  claudeCode: "claudeCode",
  "claude-code": "claudeCode",
  codex: "codex",
  openclaw: "openclaw",
  cursor: "cursor",
};

function argValue(args, name) {
  const eq = args.find((arg) => arg.startsWith(`${name}=`));
  if (eq) return eq.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1]) return args[index + 1];
  return null;
}

function normalizePlatformTargets(rawValue) {
  if (!rawValue) return [];
  return [
    ...new Set(
      String(rawValue)
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => TARGET_ALIASES[part] ?? TARGET_ALIASES[part.toLowerCase()] ?? part)
        .filter((part) => Object.prototype.hasOwnProperty.call(PLATFORMS, part)),
    ),
  ];
}

// ========== 通用扫描函数 ==========

async function* walkDir(dir, maxDepth = 10) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name === "downloads" ||
        entry.name === "dist" ||
        entry.name === "build"
      ) {
        continue;
      }
      if (entry.isDirectory()) {
        const depth =
          fullPath.split(path.sep).length - dir.split(path.sep).length;
        if (depth < maxDepth) {
          yield* walkDir(fullPath, maxDepth);
        }
      } else if (entry.isFile()) {
        yield fullPath;
      }
    }
  } catch {
    // 目录不存在或无权限访问
  }
}

async function scanMarkdownFiles(dir) {
  const results = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const filePath = path.join(dir, entry.name);
        const stat = await fs.stat(filePath);
        results.push({
          id: entry.name.replace(/\.md$/, ""),
          path: filePath,
          size: stat.size,
          modified: stat.mtime,
        });
      }
    }
  } catch {}
  return results;
}

async function scanMarkdownFilesRecursive(dir) {
  const results = [];
  for await (const filePath of walkDir(dir, 5)) {
    if (filePath.endsWith(".md")) {
      const stat = await fs.stat(filePath);
      const relPath = path.relative(dir, filePath);
      const id = relPath.replace(/\.md$/, "").replace(/\\/g, "/");
      results.push({
        id,
        path: filePath,
        relativePath: relPath,
        size: stat.size,
        modified: stat.mtime,
      });
    }
  }
  return results;
}

async function scanTomlFiles(dir) {
  const results = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".toml")) {
        const filePath = path.join(dir, entry.name);
        const stat = await fs.stat(filePath);
        results.push({
          id: entry.name.replace(/\.toml$/, ""),
          path: filePath,
          size: stat.size,
          modified: stat.mtime,
        });
      }
    }
  } catch {}
  return results;
}

async function scanTomlFilesRecursive(dir) {
  const results = [];
  for await (const filePath of walkDir(dir, 5)) {
    if (filePath.endsWith(".toml")) {
      const stat = await fs.stat(filePath);
      const relPath = path.relative(dir, filePath);
      const id = relPath.replace(/\.toml$/, "").replace(/\\/g, "/");
      results.push({
        id,
        path: filePath,
        relativePath: relPath,
        size: stat.size,
        modified: stat.mtime,
      });
    }
  }
  return results;
}

async function scanOpenClawAgents(baseDir) {
  const results = [];
  const configPath = path.join(baseDir, "openclaw.json");
  const seen = new Set();

  try {
    const content = await fs.readFile(configPath, "utf8");
    const config = JSON.parse(content);
    const list = config?.agents?.list ?? [];

    for (const agent of list) {
      if (!agent?.id || seen.has(agent.id)) {
        continue;
      }

      const workspacePath =
        typeof agent.workspace === "string" && agent.workspace.trim()
          ? agent.workspace
          : path.join(baseDir, `workspace-${agent.id}`);

      let stat = null;
      try {
        stat = await fs.stat(workspacePath);
      } catch {}

      results.push({
        id: agent.id,
        path: workspacePath,
        size: stat?.size ?? 0,
        modified: stat?.mtime ?? new Date(0),
        metadata: {
          name: agent.name || agent.id,
          model: agent.model || "unknown",
          workspace: workspacePath,
          source: "openclaw.json",
          default: Boolean(agent.default),
        },
      });
      seen.add(agent.id);
    }
  } catch {}

  // Fall back to scanning workspace-* directories for loose/unlisted agents.
  try {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith("workspace-")) {
        continue;
      }

      const agentId = entry.name.replace(/^workspace-/, "");
      if (!agentId || seen.has(agentId)) {
        continue;
      }

      const workspacePath = path.join(baseDir, entry.name);
      const soulPath = path.join(workspacePath, "SOUL.md");
      const stat = await fs.stat(workspacePath);
      const metadata = {
        name: agentId,
        workspace: workspacePath,
        source: "workspace-scan",
      };

      try {
        const soulContent = await fs.readFile(soulPath, "utf8");
        const title = soulContent.match(/^#\s+(.+)$/m)?.[1]?.trim();
        if (title) {
          metadata.name = title;
        }
      } catch {}

      results.push({
        id: agentId,
        path: workspacePath,
        size: stat.size,
        modified: stat.mtime,
        metadata,
      });
      seen.add(agentId);
    }
  } catch {}

  return results.sort((left, right) => left.id.localeCompare(right.id));
}

async function scanSkillFiles(dir) {
  const results = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillDir = path.join(dir, entry.name);
        const skillMdPath = path.join(skillDir, "SKILL.md");
        try {
          const stat = await fs.stat(skillMdPath);
          results.push({
            id: entry.name,
            path: skillMdPath,
            size: stat.size,
            modified: stat.mtime,
          });
        } catch {
          // SKILL.md 不存在，跳过
        }
      }
    }
  } catch {}
  return results;
}

async function scanSkillFilesRecursive(dir) {
  const results = [];
  for await (const filePath of walkDir(dir, 6)) {
    if (path.basename(filePath) !== "SKILL.md") {
      continue;
    }

    const stat = await fs.stat(filePath);
    const relPath = path.relative(dir, filePath);
    const skillRoot = path.dirname(relPath);
    const normalizedRoot =
      skillRoot === "." ? "" : skillRoot.replace(/\\/g, "/");
    const id = normalizedRoot || "SKILL";

    results.push({
      id,
      path: filePath,
      relativePath: relPath,
      size: stat.size,
      modified: stat.mtime,
    });
  }
  return results;
}

async function mergeCapabilityLists(...lists) {
  const byPath = new Map();
  for (const list of lists) {
    for (const item of list) {
      byPath.set(item.path, item);
    }
  }
  return Array.from(byPath.values()).sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

async function scanOpenClawSkills(baseDir) {
  return mergeCapabilityLists(
    await scanSkillFilesRecursive(path.join(baseDir, "skills")),
    await scanSkillFilesRecursive(path.join(os.homedir(), ".agents", "skills")),
  );
}

async function scanCodexSkills(baseDir) {
  return mergeCapabilityLists(
    await scanSkillFilesRecursive(path.join(baseDir, "skills")),
    await scanSkillFilesRecursive(path.join(baseDir, ".agents", "skills")),
    await scanSkillFilesRecursive(path.join(os.homedir(), ".agents", "skills")),
  );
}

async function scanCursorSkills(baseDir) {
  return mergeCapabilityLists(
    await scanSkillFilesRecursive(path.join(baseDir, "skills")),
    await scanSkillFilesRecursive(path.join(baseDir, "skills-cursor")),
  );
}

async function scanConfigFile(filePath, metadata = {}) {
  try {
    const stat = await fs.stat(filePath);
    return [
      {
        id: metadata.id ?? path.basename(filePath),
        path: filePath,
        relativePath: path.basename(filePath),
        size: stat.size,
        modified: stat.mtime,
        metadata: {
          providerKind: metadata.providerKind ?? "config",
          source: "runtime-config",
        },
      },
    ];
  } catch {
    return [];
  }
}

async function scanHookFiles(dir) {
  const results = [];

  // Only scan physical hook script files in the hooks directory.
  // Meta_Kim's capability index records what hooks Meta_Kim manages
  // (i.e., the physical .js/.py/.sh files under the hooks directory).
  // Hook commands defined inside third-party skill SKILL.md files are
  // governed by their respective skill repositories, not by Meta_Kim.
  for await (const filePath of walkDir(dir, 3)) {
    if (
      filePath.endsWith(".js") ||
      filePath.endsWith(".mjs") ||
      filePath.endsWith(".py") ||
      filePath.endsWith(".sh")
    ) {
      const stat = await fs.stat(filePath);
      const relPath = path.relative(dir, filePath);
      if (relPath.replace(/\\/g, "/").startsWith(".meta-kim-legacy-backup/")) {
        continue;
      }
      const id = relPath.replace(/\\/g, "/");
      results.push({
        id,
        path: filePath,
        relativePath: relPath,
        size: stat.size,
        modified: stat.mtime,
      });
    }
  }

  return results;
}

async function scanPluginFiles(dir) {
  const results = [];

  // 扫描 installed_plugins.json
  try {
    const installedPath = path.join(dir, "installed_plugins.json");
    const content = await fs.readFile(installedPath, "utf8");
    const installed = JSON.parse(content);
    for (const [pluginId, info] of Object.entries(installed.plugins || {})) {
      results.push({
        id: pluginId,
        path: info.path || dir,
        metadata: info,
      });
    }
  } catch {}

  // 扫描 repos 目录
  const reposDir = path.join(dir, "repos");
  try {
    const entries = await fs.readdir(reposDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginDir = path.join(reposDir, entry.name);
        const packageJsonPath = path.join(pluginDir, "package.json");
        try {
          const content = await fs.readFile(packageJsonPath, "utf8");
          const pkg = JSON.parse(content);
          const stat = await fs.stat(pluginDir);
          results.push({
            id: entry.name,
            path: pluginDir,
            metadata: {
              name: pkg.name,
              version: pkg.version,
              description: pkg.description,
            },
            size: stat.size,
            modified: stat.mtime,
          });
        } catch {
          // 没有 package.json，仍然记录目录
          results.push({
            id: entry.name,
            path: pluginDir,
          });
        }
      }
    }
  } catch {}

  return results;
}

async function scanCommandFiles(dir) {
  const results = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const commandPath = path.join(dir, entry.name);
        const stat = await fs.stat(commandPath);
        results.push({
          id: path.basename(entry.name, ".md"),
          path: commandPath,
          relativePath: entry.name,
          size: stat.size,
          modified: stat.mtime,
        });
        continue;
      }

      if (entry.isDirectory()) {
        const commandDir = path.join(dir, entry.name);
        // 查找 command.md 或 SKILL.md
        const commandMdPath = path.join(commandDir, "command.md");
        const skillMdPath = path.join(commandDir, "SKILL.md");
        let foundPath = null;
        try {
          await fs.access(commandMdPath);
          foundPath = commandMdPath;
        } catch {
          try {
            await fs.access(skillMdPath);
            foundPath = skillMdPath;
          } catch {}
        }
        if (foundPath) {
          const stat = await fs.stat(foundPath);
          results.push({
            id: entry.name,
            path: foundPath,
            relativePath: path.relative(dir, foundPath),
            size: stat.size,
            modified: stat.mtime,
          });
        }
      }
    }
  } catch {}
  return results;
}

async function scanMcpConfig(configPath) {
  const servers = [];
  const tools = [];

  let raw;
  let stat;
  try {
    [raw, stat] = await Promise.all([
      fs.readFile(configPath, "utf8"),
      fs.stat(configPath),
    ]);
  } catch {
    return { servers, tools };
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch {
    return { servers, tools };
  }

  for (const [serverId, serverConfig] of Object.entries(config.mcpServers || {})) {
    const command = serverConfig?.command || "";
    const args = Array.isArray(serverConfig?.args) ? serverConfig.args : [];
    const env = serverConfig?.env && typeof serverConfig.env === "object"
      ? serverConfig.env
      : {};
    const serverEntry = {
      id: serverId,
      path: configPath,
      size: stat.size,
      modified: stat.mtime,
      command,
      args,
      metadata: {
        name: serverId,
        description: `Configured MCP server ${serverId}`,
        providerKind: "mcp-server",
        transport: serverConfig?.type || "stdio",
        command,
        args: args.join(" "),
        envKeys: Object.keys(env).join(","),
        permissionStatus: "configured",
      },
    };

    servers.push(serverEntry);

    const selfTest = runKnownMcpSelfTest(command, args);
    if (selfTest?.ok) {
      serverEntry.metadata.permissionStatus = "self_test_verified";
      serverEntry.metadata.toolCount = String(selfTest.tools.length);
      for (const toolName of selfTest.tools) {
        tools.push({
          id: `${serverId}:${toolName}`,
          path: configPath,
          size: stat.size,
          modified: stat.mtime,
          metadata: {
            name: toolName,
            description: `MCP tool ${toolName} from server ${serverId}`,
            providerKind: "mcp-tool",
            serverId,
            permissionStatus: "self_test_verified",
            source: "mcp-self-test",
          },
        });
      }
    } else {
      tools.push({
        id: `${serverId}:tools-unlisted`,
        path: configPath,
        size: stat.size,
        modified: stat.mtime,
        metadata: {
          name: "tools-unlisted",
          description: `MCP server ${serverId} is configured, but tool names were not introspected during static discovery.`,
          providerKind: "mcp-tool-list",
          serverId,
          permissionStatus: "configured_unverified",
          source: "mcp-config",
        },
      });
    }
  }

  return { servers, tools };
}

async function scanCodexTomlMcpServers(configPath) {
  let raw;
  let stat;
  try {
    [raw, stat] = await Promise.all([
      fs.readFile(configPath, "utf8"),
      fs.stat(configPath),
    ]);
  } catch {
    return [];
  }

  const servers = [];
  const serverMatches = raw.matchAll(/^\s*\[mcp_servers\.([^\]\s]+)\]\s*$/gm);
  for (const match of serverMatches) {
    const serverId = match[1].replace(/^["']|["']$/g, "");
    servers.push({
      id: serverId,
      path: configPath,
      relativePath: path.basename(configPath),
      size: stat.size,
      modified: stat.mtime,
      metadata: {
        name: serverId,
        description: `Configured Codex MCP server ${serverId}`,
        providerKind: "mcp-server",
        source: "codex-config-toml",
        permissionStatus: "configured_unverified",
      },
    });
  }

  return servers;
}

async function scanCodexTomlMcpTools(configPath) {
  let raw;
  let stat;
  try {
    [raw, stat] = await Promise.all([
      fs.readFile(configPath, "utf8"),
      fs.stat(configPath),
    ]);
  } catch {
    return [];
  }

  const tools = [];
  const serverMatches = raw.matchAll(/^\s*\[mcp_servers\.([^\]\s]+)\]\s*$/gm);
  for (const match of serverMatches) {
    const serverId = match[1].replace(/^["']|["']$/g, "");
    tools.push({
      id: `${serverId}:tools-unlisted`,
      path: configPath,
      relativePath: path.basename(configPath),
      size: stat.size,
      modified: stat.mtime,
      metadata: {
        name: "tools-unlisted",
        description: `Codex MCP server ${serverId} is configured, but tool names were not introspected during static discovery.`,
        providerKind: "mcp-tool-list",
        serverId,
        source: "codex-config-toml",
        permissionStatus: "configured_unverified",
      },
    });
  }

  return tools;
}

function runKnownMcpSelfTest(command, args) {
  if (!command || !Array.isArray(args)) return null;
  const scriptArg = args.find((arg) =>
    typeof arg === "string" && arg.replace(/\\/g, "/").endsWith("scripts/mcp/meta-runtime-server.mjs")
  );
  if (!scriptArg) return null;

  const result = spawnSync(command, [...args, "--self-test"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10000,
  });
  if (result.status !== 0) return null;

  try {
    const parsed = JSON.parse(result.stdout);
    return {
      ok: parsed?.ok === true,
      tools: Array.isArray(parsed?.tools) ? parsed.tools : [],
    };
  } catch {
    return null;
  }
}

// ========== Agent 元数据提取 ==========

function parseSimpleYaml(text) {
  const metadata = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex > 0) {
      const key = trimmed.slice(0, colonIndex).trim();
      let value = trimmed.slice(colonIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value === "|" || value === ">") continue;
      metadata[key] = value;
    }
  }
  return metadata;
}

function extractContentKeywords(content, maxChars = 3000) {
  const chunk = content.slice(0, maxChars);
  const headings = [...chunk.matchAll(/^#{1,3}\s+(.+)$/gm)].map((m) =>
    m[1].trim(),
  );
  const cleaned = headings
    .map((h) => h.replace(/[*`#]/g, "").trim())
    .filter((h) => h.length > 2 && h.length < 80);
  return [...new Set(cleaned)].slice(0, 20);
}

async function extractAgentMetadata(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const metadata = {};

    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (frontmatterMatch) {
      Object.assign(metadata, parseSimpleYaml(frontmatterMatch[1]));
    }

    const titleMatch = content.match(/^#\s+(.+)$/m);
    if (titleMatch && !metadata.title) {
      metadata.title = titleMatch[1].trim();
    }

    const keywords = extractContentKeywords(content);
    if (keywords.length > 0) {
      metadata._keywords = keywords.join(" | ");
    }

    return metadata;
  } catch {}
  return {};
}

async function extractCodexAgentMetadata(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const metadata = {};

    // 解析 TOML-style key = "value"
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^(\w+)\s*=\s*["'](.+?)["']/);
      if (match) {
        metadata[match[1]] = match[2];
      }
    }

    return metadata;
  } catch {}
  return {};
}

async function extractSkillMetadata(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const metadata = {};

    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (frontmatterMatch) {
      Object.assign(metadata, parseSimpleYaml(frontmatterMatch[1]));
    }

    const keywords = extractContentKeywords(content);
    if (keywords.length > 0) {
      metadata._keywords = keywords.join(" | ");
    }

    return metadata;
  } catch {}
  return {};
}

// ========== 平台扫描 ==========

async function scanPlatform(platformId, platform) {
  const baseDir = platform.baseDir();
  const result = {
    platform: platform.name,
    platformId,
    baseDir,
    capabilities: {
      agents: [],
      skills: [],
      hooks: [],
      plugins: [],
      commands: [],
      rules: [],
      prompts: [],
      mcpServers: [],
      mcpTools: [],
    },
    errors: [],
  };

  // 检查平台目录是否存在
  try {
    await fs.access(baseDir);
  } catch {
    result.errors.push(`Platform directory not found: ${baseDir}`);
    return result;
  }

  // 扫描每种能力类型
  for (const [type, scanner] of Object.entries(platform.scanners)) {
    try {
      const items = await scanner(baseDir);
      for (const item of items) {
        try {
          const capability = {
            id: item.id,
            type,
            platform: platform.name,
            platformId,
            path: item.path,
            size: item.size,
            modified: item.modified,
          };

          if (item.relativePath) {
            capability.relativePath = item.relativePath;
          }

          if (item.metadata) {
            capability.metadata = item.metadata;
          }

          // Pass through hook fields from skill hook extraction
          if (type === "hooks") {
            if (item.command !== undefined) {
              capability.command = item.command;
            }
            if (item.available !== undefined) {
              capability.available = item.available;
            }
            if (item.unavailableReason) {
              capability.unavailableReason = item.unavailableReason;
            }
            if (item.fromSkill) {
              capability.fromSkill = item.fromSkill;
            }
            if (item.hookEvent) {
              capability.hookEvent = item.hookEvent;
            }
          }

          // Extract specific-type metadata
          if (type === "agents") {
            // Determine agent layer (meta vs execution)
            // Global agents from ~/.claude/agents/ are typically execution agents
            // unless their ID explicitly indicates otherwise
            if (item.id.startsWith("meta-") && platformId === "claudeCode") {
              // Some users may have meta-agents in their global directory
              capability.layer = "meta";
              capability.executionBlock = true;
            } else {
              capability.layer = "execution";
              capability.executionBlock = false;
            }

            if (item.path.endsWith(".md")) {
              capability.metadata = {
                ...capability.metadata,
                ...(await extractAgentMetadata(item.path)),
              };
            } else if (item.path.endsWith(".toml")) {
              capability.metadata = {
                ...capability.metadata,
                ...(await extractCodexAgentMetadata(item.path)),
              };
            }
          } else if (type === "skills" && item.path.endsWith("SKILL.md")) {
            capability.metadata = {
              ...capability.metadata,
              ...(await extractSkillMetadata(item.path)),
            };
          }

          result.capabilities[type].push(capability);
        } catch (error) {
          result.errors.push(`Error processing ${item.path}: ${error.message}`);
        }
      }
    } catch (error) {
      result.errors.push(`Error scanning ${type}: ${error.message}`);
    }
  }

  return result;
}

// ========== 索引构建 ==========

async function collectRepoCanonicalCapabilities() {
  const agents = await scanMarkdownFiles(
    path.join(repoRoot, "canonical", "agents"),
  );
  const skills = await scanSkillFiles(
    path.join(repoRoot, "canonical", "skills"),
  );
  const skillReferences = await scanMarkdownFilesRecursive(
    path.join(repoRoot, "canonical", "skills", "meta-theory", "references"),
  );
  const sharedHooks = await scanHookFiles(
    path.join(repoRoot, "canonical", "runtime-assets", "shared", "hooks"),
  );
  const claudeHooks = await scanHookFiles(
    path.join(repoRoot, "canonical", "runtime-assets", "claude", "hooks"),
  );
  const openclawHooks = await scanHookFiles(
    path.join(repoRoot, "canonical", "runtime-assets", "openclaw", "hooks"),
  );
  const claudeCommands = await scanCommandFiles(
    path.join(repoRoot, "canonical", "runtime-assets", "claude", "commands"),
  );
  const codexCommands = await scanCommandFiles(
    path.join(repoRoot, "canonical", "runtime-assets", "codex", "commands"),
  );
  const mcpDiscovery = await scanMcpConfig(path.join(repoRoot, ".mcp.json"));
  const skillsManifest = await readJsonIfExists(
    path.join(repoRoot, "config", "skills.json"),
  );
  const pluginCapabilities = (skillsManifest?.skills ?? [])
    .filter((skill) => {
      const pluginIds = [
        skill.claudePlugin,
        skill.codexPlugin,
        skill.cursorPlugin,
      ].filter(Boolean);
      return (
        skill.installMethod === "pluginMarketplace" ||
        pluginIds.length > 0 ||
        skill.pluginHookCompat
      );
    })
    .map((skill) => {
      const pluginIds = [
        skill.claudePlugin,
        skill.codexPlugin,
        skill.cursorPlugin,
      ].filter(Boolean);
      const isPlugin =
        skill.installMethod === "pluginMarketplace" || pluginIds.length > 0;
      return {
        id: skill.id,
        type: isPlugin ? "plugins" : "pluginBundles",
        namespace: isPlugin ? "plugin-marketplace" : "plugin-bundle",
        path: "config/skills.json",
        runtimeTargets: skill.targets ?? [],
        installMethod: skill.installMethod ?? "subdirExtraction",
        providerRegistryId: isPlugin
          ? `plugin-marketplace-${skill.id}`
          : `plugin-bundle-${skill.id}`,
        pluginIds,
        evidence: `config/skills.json skills[id=${skill.id}]`,
      };
    });

  // Determine agent layer: meta (governance) vs execution (work)
  function determineAgentLayer(id, namespace) {
    // Meta_Kim canonical meta-agents are identified by "meta-" prefix
    // These are governance layer and MUST NOT be used for direct execution
    if (namespace === "canonical" && id.startsWith("meta-")) {
      return {
        layer: "meta",
        executionBlock: true,
        publicRepoOwnerEligible: true,
        publicRepoEvidenceMode: "durable_governance_owner",
        _reason: "Canonical meta-agent (governance layer)"
      };
    }
    // All other agents are execution agents (work layer)
    return {
      layer: "execution",
      executionBlock: false,
      publicRepoOwnerEligible: false,
      publicRepoEvidenceMode: "run_scoped_only",
      _reason: "Execution agent (work layer)"
    };
  }

  const toRepoCapability = (item, type, namespace) => {
    const base = {
      id: item.id,
      type,
      namespace,
      path: path.relative(repoRoot, item.path).replace(/\\/g, "/"),
      relativePath: item.relativePath?.replace(/\\/g, "/"),
      size: item.size,
      modified: item.modified,
    };

    // Add layer field for agents
    if (type === "agents") {
      const layerInfo = determineAgentLayer(item.id, namespace);
      return {
        ...base,
        layer: layerInfo.layer,
        executionBlock: layerInfo.executionBlock,
      };
    }

    return base;
  };

  return {
    agents: agents.map((item) => toRepoCapability(item, "agents", "canonical")),
    skills: [
      ...skills.map((item) => toRepoCapability(item, "skills", "canonical")),
      ...skillReferences.map((item) =>
        toRepoCapability(item, "skills", "canonical-reference"),
      ),
    ],
    hooks: [...sharedHooks, ...claudeHooks, ...openclawHooks].map((item) =>
      toRepoCapability(item, "hooks", "canonical-runtime-assets"),
    ),
    mcpServers: mcpDiscovery.servers.map((item) =>
      toRepoCapability(item, "mcpServers", "repo-mcp"),
    ),
    mcpTools: mcpDiscovery.tools.map((item) =>
      toRepoCapability(item, "mcpTools", "repo-mcp"),
    ),
    plugins: pluginCapabilities,
    rules: [],
    prompts: [],
    commands: [...claudeCommands, ...codexCommands].map((item) =>
      toRepoCapability(item, "commands", "canonical-runtime-assets"),
    ),
  };
}

async function buildRepoCapabilityIndex() {
  const capabilities = await collectRepoCanonicalCapabilities();
  const metaSkillProviderContract = buildMetaSkillProviderContract();
  const index = {
    generatedAt: new Date().toISOString(),
    registryName: "meta-kim-capabilities",
    scope: "repo-canonical",
    canonicalProjection: CANONICAL_CAPABILITY_INDEX,
    canonicalSource: CANONICAL_CAPABILITY_INDEX,
    localGlobalInventory: LOCAL_GLOBAL_INVENTORY,
    mirroredTo: [
      ".claude/capability-index/meta-kim-capabilities.json",
      ".codex/capability-index/meta-kim-capabilities.json",
      "openclaw/capability-index/meta-kim-capabilities.json",
      ".cursor/capability-index/meta-kim-capabilities.json",
    ],
    fetchOrder: [
      "repo canonical capability index",
      "runtime mirror",
      "local global inventory",
      "capability gap packet and return to Thinking",
    ],
    summary: {
      totalAgents: capabilities.agents.length,
      totalSkills: capabilities.skills.length,
      totalHooks: capabilities.hooks.length,
      totalMcpServers: capabilities.mcpServers.length,
      totalMcpTools: capabilities.mcpTools.length,
      totalPlugins: capabilities.plugins.length,
      totalCommands: capabilities.commands.length,
    },
    ...metaSkillProviderContract,
    byCapabilityType: {
      agents: Object.fromEntries(
        capabilities.agents.map((cap) => [
          `repo:${cap.namespace}:${cap.id}`,
          cap,
        ]),
      ),
      skills: Object.fromEntries(
        capabilities.skills.map((cap) => [
          `repo:${cap.namespace}:${cap.id}`,
          cap,
        ]),
      ),
      hooks: Object.fromEntries(
        capabilities.hooks.map((cap) => [
          `repo:${cap.namespace}:${cap.id}`,
          cap,
        ]),
      ),
      mcpServers: Object.fromEntries(
        capabilities.mcpServers.map((cap) => [
          `repo:${cap.namespace}:${cap.id}`,
          cap,
        ]),
      ),
      mcpTools: Object.fromEntries(
        capabilities.mcpTools.map((cap) => [
          `repo:${cap.namespace}:${cap.id}`,
          cap,
        ]),
      ),
      plugins: Object.fromEntries(
        capabilities.plugins.map((cap) => [
          `manifest:${cap.namespace}:${cap.id}`,
          cap,
        ]),
      ),
      rules: {},
      prompts: {},
      commands: Object.fromEntries(
        capabilities.commands.map((cap) => [
          `repo:${cap.namespace}:${cap.id}`,
          cap,
        ]),
      ),
    },
  };

  // Add governance rules to prevent meta-agent misuse
  index.governanceRules = {
    metaAgentDispatchRule: "Meta-agents (layer='meta') are the only durable public Meta_Kim owners for Critical, Fetch, Thinking, and Review. They MUST NOT perform implementation work directly; concrete implementation capability is recorded as run-scoped matchedCapabilities/capabilityBindings across skills, commands, MCP tools, runtime tools, file sets, or capability-index queries; legacy matchedSkills is compatibility evidence only.",
    fallbackBehavior: "Use a governance meta owner plus run-scoped matchedCapabilities/capabilityBindings, or block with capabilityGapPacket. Do not persist non-governance execution agents in the public repo.",
    layerClassification: "Meta-agents: id starts with 'meta-' in canonical namespace. In public Meta_Kim, all other agents are ignored as durable owners and may appear only as run-scoped capability evidence when explicitly discovered.",
  };

  return index;
}

export function capabilityIndexWithoutGeneratedAt(index) {
  const normalized = JSON.parse(JSON.stringify(index ?? {}));
  delete normalized.generatedAt;
  return normalized;
}

export function capabilityIndexWithoutVolatileFields(index) {
  const normalized = JSON.parse(JSON.stringify(index ?? {}));

  function stripVolatile(value) {
    if (Array.isArray(value)) {
      for (const item of value) stripVolatile(item);
      return;
    }
    if (!value || typeof value !== "object") return;

    delete value.generatedAt;
    delete value.modified;
    delete value.size;
    for (const child of Object.values(value)) {
      stripVolatile(child);
    }
  }

  stripVolatile(normalized);
  return normalized;
}

export function preserveGeneratedAtWhenUnchanged(nextIndex, existingIndex) {
  if (
    existingIndex &&
    typeof existingIndex.generatedAt === "string" &&
    JSON.stringify(capabilityIndexWithoutVolatileFields(nextIndex)) ===
      JSON.stringify(capabilityIndexWithoutVolatileFields(existingIndex))
  ) {
    return existingIndex;
  }

  return nextIndex;
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function buildGlobalCapabilityInventory(scannedResults, profile) {
  const index = {
    generatedAt: new Date().toISOString(),
    registryName: "global-capabilities",
    scope: "local-global-inventory",
    profile,
    canonicalProjection: CANONICAL_CAPABILITY_INDEX,
    repoCanonicalIndex: CANONICAL_CAPABILITY_INDEX,
    localInventoryPath: LOCAL_GLOBAL_INVENTORY.replace("{profile}", profile),
    summary: {
      totalAgents: 0,
      totalSkills: 0,
      totalHooks: 0,
      totalMcpServers: 0,
      totalMcpTools: 0,
      totalPlugins: 0,
      totalCommands: 0,
      totalRules: 0,
      totalPrompts: 0,
    },
    byPlatform: {},
    byCapabilityType: {
      agents: {},
      skills: {},
      hooks: {},
      mcpServers: {},
      mcpTools: {},
      plugins: {},
      commands: {},
      rules: {},
      prompts: {},
    },
  };

  for (const scan of scannedResults) {
    index.byPlatform[scan.platformId] = scan;

    for (const [type, capabilities] of Object.entries(scan.capabilities)) {
      index.summary[`total${type.charAt(0).toUpperCase()}${type.slice(1)}`] +=
        capabilities.length;

      for (const cap of capabilities) {
        const key = `${scan.platformId}:${cap.id}`;
        index.byCapabilityType[type][key] = cap;
      }
    }
  }

  return index;
}

// ========== 输出格式 ==========

const META_KIM_HOOK_FILE_NAMES = new Set([
  "activate-meta-theory-spine.mjs",
  "bash-readonly-whitelist.mjs",
  "block-dangerous-bash.mjs",
  "codex_hook_adapter.py",
  "codex_hook_runner.mjs",
  "enforce-agent-dispatch.mjs",
  "graphify-context.mjs",
  "hookprompt-adapter.mjs",
  "meta-kim-memory-save.mjs",
  "planning-with-files-adapter.mjs",
  "post-console-log-warn.mjs",
  "post-format.mjs",
  "post-typecheck.mjs",
  "post_tool_use.py",
  "post-tool-use.ps1",
  "post-tool-use.sh",
  "pre_tool_use.py",
  "pre-tool-use.ps1",
  "pre-tool-use.sh",
  "pre-compact.sh",
  "session_start.py",
  "session-start.sh",
  "skip-reminder.mjs",
  "spine-state.mjs",
  "stop.py",
  "stop.sh",
  "stop-compaction.mjs",
  "stop-completion-guard.mjs",
  "stop-console-log-audit.mjs",
  "stop-spine-cleanup.mjs",
  "subagent-context.mjs",
  "utils.mjs",
]);

const SUMMARY_TYPE_ORDER = [
  "agents",
  "skills",
  "hooks",
  "mcpServers",
  "mcpTools",
  "plugins",
  "commands",
  "rules",
  "prompts",
];

function formatCountLine(label, count) {
  return `${label}: ${count}`;
}

function capabilityTypesForOutput(index, filterType) {
  if (filterType) {
    return Object.prototype.hasOwnProperty.call(
      index.byCapabilityType ?? {},
      filterType,
    )
      ? [filterType]
      : [];
  }
  return SUMMARY_TYPE_ORDER.filter((type) =>
    Object.prototype.hasOwnProperty.call(index.byCapabilityType ?? {}, type),
  );
}

function hookFileName(cap) {
  const rel = String(cap.relativePath || cap.id || "").replace(/\\/g, "/");
  return rel.split("/").pop() || rel;
}

function classifyHookCapability(cap) {
  const rel = String(cap.relativePath || cap.id || "").replace(/\\/g, "/");
  const fileName = hookFileName(cap);
  const providerKind = cap.metadata?.providerKind;

  if (
    providerKind === "hook-config" ||
    providerKind === "runtime-config" ||
    providerKind === "runtime-settings"
  ) {
    return "runtime config";
  }

  if (rel.startsWith("meta-kim/")) {
    return "Meta_Kim namespaced";
  }

  if (META_KIM_HOOK_FILE_NAMES.has(fileName)) {
    return "Meta_Kim legacy root";
  }

  if (/-[a-f0-9]{10,}\.(?:js|mjs|py|sh|ps1)$/i.test(fileName)) {
    return "generated/hash variant";
  }

  if (rel.startsWith("optional/")) {
    return "optional hook pack";
  }

  return "third-party/user";
}

function countBy(items, classifier) {
  const counts = new Map();
  for (const item of items) {
    const key = classifier(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => {
    if (right[1] !== left[1]) return right[1] - left[1];
    return left[0].localeCompare(right[0]);
  });
}

function skillFamily(cap) {
  const id = String(cap.id || "").replace(/\\/g, "/");
  if (!id) return "unknown";
  const first = id.split("/")[0];
  if (first === "gstack" || first === "cli-anything") return first;
  if (id.startsWith("openai-")) return "openai";
  if (id.startsWith("superpowers")) return "superpowers";
  if (id.startsWith("data-analytics")) return "data-analytics";
  if (id.startsWith("creative-production")) return "creative-production";
  if (id.startsWith("vercel")) return "vercel";
  return first;
}

const OUTPUT_I18N = {
  en: {
    title: "Global Capability Summary",
    byPlatform: "By platform",
    hooksByCategory: "Hooks by category",
    skillsByFamily: "Skills by family",
    detailsHidden:
      "Details hidden by default. Use --verbose or --details to print every capability id.",
    noMatchingCapabilities: "no matching capabilities",
    noMatchingCapabilityType: "No matching capability type",
    warnings: "warnings",
    more: "more",
    none: "none",
    scanning: "Scanning global capabilities across platforms...",
    scanningPlatform: (name) => `  Scanning ${name}...`,
    errors: "errors",
    detailedInventory: "Detailed Inventory",
    governanceRules: "Governance Rules",
    canonicalIndexWritten: (target) => `Canonical index written to ${target}`,
    localInventoryWritten: (target) => `Local inventory written to ${target}`,
    canonicalIndexMirrored: (count) =>
      `Repo canonical index refreshed in ${count} runtime mirror directories (not the scan target list):`,
    searchIndexWritten: (count) =>
      `Search index written to capability-search-index.tsv (${count} entries)`,
  },
  zh: {
    title: "Meta_Kim 全局能力摘要",
    byPlatform: "按平台统计",
    hooksByCategory: "Hooks 分类统计",
    skillsByFamily: "Skills 家族统计",
    detailsHidden:
      "默认只显示分类统计；使用 --verbose 或 --details 查看每个能力 id。",
    noMatchingCapabilities: "没有匹配的能力",
    noMatchingCapabilityType: "没有匹配的能力类型",
    warnings: "警告",
    more: "项未显示",
    none: "无",
    scanning: "正在扫描全局能力...",
    scanningPlatform: (name) => `  正在扫描 ${name}...`,
    errors: "错误",
    detailedInventory: "详细清单",
    governanceRules: "治理规则",
    canonicalIndexWritten: (target) => `canonical 能力索引已写入 ${target}`,
    localInventoryWritten: (target) => `本机全局能力清单已写入 ${target}`,
    canonicalIndexMirrored: (count) =>
      `仓库内 canonical 能力索引已刷新到 ${count} 个 runtime 镜像目录（这不是本次扫描范围）：`,
    searchIndexWritten: (count) =>
      `搜索索引已写入 capability-search-index.tsv（${count} 条）`,
  },
};

function normalizeOutputLang(lang = "en") {
  const raw = String(lang || "en").toLowerCase();
  if (raw.startsWith("zh")) return "zh";
  return "en";
}

function outputText(lang) {
  return OUTPUT_I18N[normalizeOutputLang(lang)] ?? OUTPUT_I18N.en;
}

function formatCounts(counts, maxItems = 8, labels = OUTPUT_I18N.en) {
  if (counts.length === 0) return labels.none;
  const shown = counts
    .slice(0, maxItems)
    .map(([label, count]) => `${label} ${count}`)
    .join(", ");
  const hidden = counts.length - maxItems;
  return hidden > 0 ? `${shown}, +${hidden} ${labels.more}` : shown;
}

function flattenCapabilitiesByType(index, type) {
  return Object.values(index.byCapabilityType?.[type] ?? {});
}

function formatDefaultSummary(index, { filterType, lang } = {}) {
  const labels = outputText(lang);
  let output = `\n📊 ${labels.title}\n\n`;

  const summaryTypes = capabilityTypesForOutput(index, filterType);
  const totalLine = summaryTypes
    .map((type) =>
      formatCountLine(type, Object.keys(index.byCapabilityType?.[type] ?? {}).length),
    )
    .join(" | ");
  output += `${totalLine || labels.noMatchingCapabilityType}\n\n`;

  output += `🔹 ${labels.byPlatform}\n`;
  for (const [, data] of Object.entries(index.byPlatform ?? {})) {
    const counts = summaryTypes
      .map((type) => [type, data.capabilities?.[type]?.length ?? 0])
      .filter(([, count]) => count > 0)
      .map(([type, count]) => `${type} ${count}`)
      .join(", ");
    output += `  ${data.platform}: ${counts || labels.noMatchingCapabilities}`;
    if (data.errors?.length > 0) {
      output += `; ${labels.warnings} ${data.errors.length}`;
    }
    output += "\n";
  }

  if (!filterType || filterType === "hooks") {
    const hooks = flattenCapabilitiesByType(index, "hooks");
    output += `\n🧩 ${labels.hooksByCategory}\n`;
    for (const [, data] of Object.entries(index.byPlatform ?? {})) {
      const platformHooks = hooks.filter(
        (cap) => cap.platformId === data.platformId,
      );
      if (platformHooks.length === 0) continue;
      output += `  ${data.platform}: ${formatCounts(countBy(platformHooks, classifyHookCapability), 8, labels)}\n`;
    }
  }

  if (!filterType || filterType === "skills") {
    const skills = flattenCapabilitiesByType(index, "skills");
    output += `\n🧠 ${labels.skillsByFamily}\n`;
    for (const [, data] of Object.entries(index.byPlatform ?? {})) {
      const platformSkills = skills.filter(
        (cap) => cap.platformId === data.platformId,
      );
      if (platformSkills.length === 0) continue;
      output += `  ${data.platform}: ${formatCounts(countBy(platformSkills, skillFamily), 8, labels)}\n`;
    }
  }

  output += `\n${labels.detailsHidden}\n`;
  return output;
}

function formatDetailedInventory(index, { filterType, lang } = {}) {
  const labels = outputText(lang);
  let output = `\n📊 ${labels.title}\n\n`;

  for (const [platformId, data] of Object.entries(index.byPlatform)) {
    output += `🔹 ${data.platform} (${data.baseDir})\n`;
    for (const [type, items] of Object.entries(data.capabilities)) {
      if (items.length > 0) {
        output += `   ${type}: ${items.length}\n`;
      }
    }
    if (data.errors.length > 0) {
      output += `   ⚠️  ${labels.errors}: ${data.errors.length}\n`;
    }
  }

  output += `\n📋 ${labels.detailedInventory}\n\n`;

  for (const type of capabilityTypesForOutput(index, filterType)) {
    const items = index.byCapabilityType[type] ?? {};
    const keys = Object.keys(items);
    if (keys.length === 0) continue;

    output += `\n### ${type.toUpperCase()} (${keys.length})\n\n`;

    for (const [key, cap] of Object.entries(items)) {
      const metaParts = [];
      if (cap.metadata?.description) {
        metaParts.push(cap.metadata.description.substring(0, 80) + "...");
      } else if (cap.metadata?.title) {
        metaParts.push(cap.metadata.title);
      }
      if (cap.metadata?.version) {
        metaParts.push(`v${cap.metadata.version}`);
      }

      output += `  ${key}`;

      // Show layer info for agents
      if (cap.layer) {
        const layerIcon = cap.layer === "meta" ? "🔶" : "🔵";
        const layerLabel = cap.layer === "meta" ? "[META-GOVERNANCE]" : "[EXECUTION]";
        output += ` ${layerIcon} ${layerLabel}`;
        if (cap.executionBlock) {
          output += ` ⛔`;
        }
      }

      if (metaParts.length > 0) {
        output += `\n    → ${metaParts.join(" | ")}`;
      }
      output += "\n";
    }
  }

  // Add governance rules summary
  if (index.governanceRules) {
    output += `\n🛡️ ${labels.governanceRules}\n\n`;
    output += `  ${index.governanceRules.metaAgentDispatchRule}\n`;
    output += `  ${index.governanceRules.fallbackBehavior}\n`;
  }

  return output;
}

export function formatTableOutput(index, options = {}) {
  return options.verbose
    ? formatDetailedInventory(index, options)
    : formatDefaultSummary(index, options);
}

// ========== 主函数 ==========

async function main() {
  const args = process.argv.slice(2);
  const outputFormat = args.includes("--json") ? "json" : "table";
  const verboseOutput =
    args.includes("--verbose") || args.includes("--details");
  const langArg = argValue(args, "--lang");
  const outputLang = normalizeOutputLang(
    langArg || process.env.META_KIM_LANG || process.env.LANG || "en",
  );
  const labels = outputText(outputLang);
  const filterTargets = normalizePlatformTargets(
    argValue(args, "--targets") || argValue(args, "--platform"),
  );
  const filterType = argValue(args, "--type");

  const platformsToScan =
    filterTargets.length > 0
      ? Object.fromEntries(
          filterTargets.map((target) => [target, PLATFORMS[target]]),
        )
      : PLATFORMS;

  console.error(`🔍 ${labels.scanning}\n`);

  const scannedResults = [];
  for (const [platformId, platform] of Object.entries(platformsToScan)) {
    console.error(labels.scanningPlatform(platform.name));
    const result = await scanPlatform(platformId, platform);
    scannedResults.push(result);

    if (result.errors.length > 0) {
      console.error(`    ⚠️  ${result.errors.length} ${labels.errors}`);
    }
  }

  const profileState = await ensureProfileState();
  const canonicalIndexPath = path.join(repoRoot, CANONICAL_CAPABILITY_INDEX);
  const repoCapabilityIndex = preserveGeneratedAtWhenUnchanged(
    await buildRepoCapabilityIndex(),
    await readJsonIfExists(canonicalIndexPath),
  );
  const globalInventory = await buildGlobalCapabilityInventory(
    scannedResults,
    profileState.profile,
  );

  if (outputFormat === "json") {
    console.log(JSON.stringify(globalInventory, null, 2));
  } else {
    console.log(
      formatTableOutput(globalInventory, {
        verbose: verboseOutput,
        filterType,
        lang: outputLang,
      }),
    );
  }

  // Write the repo-neutral canonical index, then mirror only that index into
  // runtime projections. Machine-specific global inventory stays local-only.
  const repoContent = `${JSON.stringify(repoCapabilityIndex, null, 2)}\n`;
  await fs.mkdir(path.dirname(canonicalIndexPath), { recursive: true });
  await fs.writeFile(canonicalIndexPath, repoContent);

  const platformIndexDirs = [
    path.join(repoRoot, ".claude", "capability-index"),
    path.join(repoRoot, ".codex", "capability-index"),
    path.join(repoRoot, "openclaw", "capability-index"),
    path.join(repoRoot, ".cursor", "capability-index"),
  ];

  for (const indexDir of platformIndexDirs) {
    await fs.mkdir(indexDir, { recursive: true });
    await fs.writeFile(
      path.join(indexDir, "meta-kim-capabilities.json"),
      repoContent,
    );
    await fs.rm(path.join(indexDir, "global-capabilities.json"), {
      force: true,
    });
  }

  const localInventoryPath = path.join(
    profileState.profileDir,
    "capability-index",
    "global-capabilities.json",
  );
  await fs.mkdir(path.dirname(localInventoryPath), { recursive: true });
  await fs.writeFile(
    localInventoryPath,
    `${JSON.stringify(globalInventory, null, 2)}\n`,
  );

  console.error(`\n✅ ${labels.canonicalIndexWritten(CANONICAL_CAPABILITY_INDEX)}`);
  console.error(
    `✅ ${labels.localInventoryWritten(path.relative(repoRoot, localInventoryPath).replace(/\\/g, "/"))}`,
  );
  console.error(`✅ ${labels.canonicalIndexMirrored(platformIndexDirs.length)}`);
  for (const dir of platformIndexDirs) {
    const rel = path.relative(repoRoot, dir).replace(/\\/g, "/");
    console.error(`   ${rel}/`);
  }

  // Generate grep-friendly search index
  const searchLines = [];
  for (const [type, items] of Object.entries(
    globalInventory.byCapabilityType,
  )) {
    for (const [key, cap] of Object.entries(items)) {
      const name = cap.metadata?.name || cap.id || "";
      const desc = (cap.metadata?.description || "")
        .replace(/\n/g, " ")
        .substring(0, 300);
      const kw = cap.metadata?._keywords || "";
      const trigger = (cap.metadata?.trigger || "")
        .replace(/\n/g, " ")
        .substring(0, 200);
      searchLines.push(`${type}\t${key}\t${name}\t${desc}\t${trigger}\t${kw}`);
    }
  }
  const searchIndexPath = path.join(
    path.dirname(localInventoryPath),
    "capability-search-index.tsv",
  );
  await fs.writeFile(searchIndexPath, searchLines.join("\n") + "\n", "utf8");
  console.error(`✅ ${labels.searchIndexWritten(searchLines.length)}`);
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  await main();
}
