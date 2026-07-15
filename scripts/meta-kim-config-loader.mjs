import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export class MetaKimConfigError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "MetaKimConfigError";
    this.code = code;
    this.details = details;
  }
}

function readJsonFile(filePath, label) {
  if (!existsSync(filePath)) {
    throw new MetaKimConfigError(
      "CONFIG_MISSING",
      `${label} is missing: ${filePath}`,
      { filePath },
    );
  }
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new MetaKimConfigError(
      "CONFIG_READ_FAILED",
      `${label} could not be read: ${error.message}`,
      { filePath, cause: error },
    );
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new MetaKimConfigError(
      "CONFIG_JSON_INVALID",
      `${label} contains invalid JSON: ${error.message}`,
      { filePath, cause: error },
    );
  }
}

function matchesType(value, type) {
  if (type === "array") return Array.isArray(value);
  if (type === "object") {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "null") return value === null;
  return typeof value === type;
}

function validateSchemaNode(value, schema, valuePath, issues) {
  if (!schema || typeof schema !== "object") return;

  const allowedTypes = Array.isArray(schema.type)
    ? schema.type
    : schema.type
      ? [schema.type]
      : [];
  if (allowedTypes.length > 0 && !allowedTypes.some((type) => matchesType(value, type))) {
    issues.push(`${valuePath} must be ${allowedTypes.join(" or ")}`);
    return;
  }

  if (schema.enum && !schema.enum.includes(value)) {
    issues.push(`${valuePath} must be one of: ${schema.enum.join(", ")}`);
  }
  if (Object.hasOwn(schema, "const") && value !== schema.const) {
    issues.push(`${valuePath} must equal ${JSON.stringify(schema.const)}`);
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      issues.push(`${valuePath} must contain at least ${schema.minLength} character(s)`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      issues.push(`${valuePath} does not match the required pattern`);
    }
    if (schema.format === "uri") {
      try {
        new URL(value);
      } catch {
        issues.push(`${valuePath} must be a valid URI`);
      }
    }
  }

  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) {
    issues.push(`${valuePath} must be >= ${schema.minimum}`);
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      issues.push(`${valuePath} must contain at least ${schema.minItems} item(s)`);
    }
    if (schema.uniqueItems) {
      const serialized = value.map((item) => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) {
        issues.push(`${valuePath} must not contain duplicate items`);
      }
    }
    if (schema.items) {
      value.forEach((item, index) =>
        validateSchemaNode(item, schema.items, `${valuePath}[${index}]`, issues),
      );
    }
  }

  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const properties = schema.properties ?? {};
    for (const requiredKey of schema.required ?? []) {
      if (!Object.hasOwn(value, requiredKey)) {
        issues.push(`${valuePath}.${requiredKey} is required`);
      }
    }
    for (const [key, childValue] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) {
        validateSchemaNode(childValue, properties[key], `${valuePath}.${key}`, issues);
        continue;
      }
      if (schema.additionalProperties === false) {
        issues.push(`${valuePath}.${key} is not allowed`);
      } else if (
        schema.additionalProperties &&
        typeof schema.additionalProperties === "object"
      ) {
        validateSchemaNode(
          childValue,
          schema.additionalProperties,
          `${valuePath}.${key}`,
          issues,
        );
      }
    }
  }
}

function loadSchemaValidatedConfig(configPath, schemaPath, label) {
  const config = readJsonFile(configPath, label);
  const schema = readJsonFile(schemaPath, `${label} schema`);
  const issues = [];
  validateSchemaNode(config, schema, "$", issues);
  if (issues.length > 0) {
    throw new MetaKimConfigError(
      "CONFIG_SCHEMA_INVALID",
      `${label} does not match its schema: ${issues.join("; ")}`,
      { configPath, schemaPath, issues },
    );
  }
  return config;
}

function normalizeHost(host) {
  return String(host ?? "").trim().toLowerCase();
}

function assertTrustedHost(host, trustedHosts, label) {
  if (!trustedHosts.includes(normalizeHost(host))) {
    throw new MetaKimConfigError(
      "CONFIG_SEMANTIC_INVALID",
      `${label} uses untrusted repository host: ${host}`,
      { host, trustedHosts },
    );
  }
}

function normalizeRepoPath(repoPath, label) {
  const normalized = String(repoPath ?? "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.git$/i, "");
  const segments = normalized.split("/").filter(Boolean);
  if (
    segments.length < 2 ||
    segments.some((segment) => !/^[A-Za-z0-9._-]+$/.test(segment))
  ) {
    throw new MetaKimConfigError(
      "CONFIG_SEMANTIC_INVALID",
      `${label} must identify a repository as owner/name or a supported URL`,
      { repoPath },
    );
  }
  return { repoPath: segments.join("/"), repoName: segments.at(-1) };
}

export function normalizeRepositorySource(
  source,
  {
    label = "repository",
    defaultHttpsBase = "https://github.com",
    trustedHosts = ["github.com"],
  } = {},
) {
  const raw = String(source ?? "").trim();
  if (!raw) {
    throw new MetaKimConfigError(
      "CONFIG_SEMANTIC_INVALID",
      `${label} must not be empty`,
    );
  }
  const normalizedTrustedHosts = [...new Set(trustedHosts.map(normalizeHost))];

  const scpMatch = /^git@([^:]+):(.+)$/i.exec(raw);
  if (scpMatch) {
    const host = normalizeHost(scpMatch[1]);
    assertTrustedHost(host, normalizedTrustedHosts, label);
    const repo = normalizeRepoPath(scpMatch[2], label);
    return {
      source: raw,
      cloneUrl: `git@${host}:${repo.repoPath}.git`,
      host,
      fullName: repo.repoPath,
      repoName: repo.repoName,
      transport: "ssh",
    };
  }

  if (/^ssh:\/\//i.test(raw)) {
    let parsed;
    try {
      parsed = new URL(raw);
    } catch (error) {
      throw new MetaKimConfigError(
        "CONFIG_SEMANTIC_INVALID",
        `${label} contains an invalid SSH URL: ${error.message}`,
      );
    }
    const host = normalizeHost(parsed.hostname);
    assertTrustedHost(host, normalizedTrustedHosts, label);
    if (parsed.username && parsed.username !== "git") {
      throw new MetaKimConfigError(
        "CONFIG_SEMANTIC_INVALID",
        `${label} SSH URLs must use the git account`,
      );
    }
    if (parsed.password || parsed.search || parsed.hash) {
      throw new MetaKimConfigError(
        "CONFIG_SEMANTIC_INVALID",
        `${label} SSH URLs cannot contain credentials, query parameters, or fragments`,
      );
    }
    const repo = normalizeRepoPath(parsed.pathname, label);
    const port = parsed.port ? `:${parsed.port}` : "";
    return {
      source: raw,
      cloneUrl: `ssh://git@${host}${port}/${repo.repoPath}.git`,
      host,
      fullName: repo.repoPath,
      repoName: repo.repoName,
      transport: "ssh",
    };
  }

  if (/^https:\/\//i.test(raw)) {
    let parsed;
    try {
      parsed = new URL(raw);
    } catch (error) {
      throw new MetaKimConfigError(
        "CONFIG_SEMANTIC_INVALID",
        `${label} contains an invalid HTTPS URL: ${error.message}`,
      );
    }
    const host = normalizeHost(parsed.hostname);
    assertTrustedHost(host, normalizedTrustedHosts, label);
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new MetaKimConfigError(
        "CONFIG_SEMANTIC_INVALID",
        `${label} HTTPS URLs cannot contain credentials, query parameters, or fragments`,
      );
    }
    const repo = normalizeRepoPath(parsed.pathname, label);
    const port = parsed.port ? `:${parsed.port}` : "";
    return {
      source: raw,
      cloneUrl: `https://${host}${port}/${repo.repoPath}.git`,
      host,
      fullName: repo.repoPath,
      repoName: repo.repoName,
      transport: "https",
    };
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    throw new MetaKimConfigError(
      "CONFIG_SEMANTIC_INVALID",
      `${label} must use HTTPS or trusted SSH`,
    );
  }

  const repo = normalizeRepoPath(raw, label);
  let base;
  try {
    base = new URL(defaultHttpsBase);
  } catch (error) {
    throw new MetaKimConfigError(
      "CONFIG_SEMANTIC_INVALID",
      `repositoryPolicy.defaultHttpsBase is invalid: ${error.message}`,
    );
  }
  if (base.protocol !== "https:") {
    throw new MetaKimConfigError(
      "CONFIG_SEMANTIC_INVALID",
      "repositoryPolicy.defaultHttpsBase must use HTTPS",
    );
  }
  const host = normalizeHost(base.hostname);
  assertTrustedHost(host, normalizedTrustedHosts, "repositoryPolicy.defaultHttpsBase");
  const prefix = base.pathname.replace(/\/$/, "");
  return {
    source: raw,
    cloneUrl: `https://${base.host}${prefix}/${repo.repoPath}.git`,
    host,
    fullName: repo.repoPath,
    repoName: repo.repoName,
    transport: "https",
  };
}

function normalizeSkillsConfig(manifest, distribution, syncConfig, env) {
  const skillOwner = String(env.META_KIM_SKILL_OWNER || manifest.skillOwner).trim();
  if (!/^[A-Za-z0-9._-]+$/.test(skillOwner)) {
    throw new MetaKimConfigError(
      "CONFIG_SEMANTIC_INVALID",
      "skillOwner must be a repository owner/organization segment",
    );
  }
  const supportedTargets = syncConfig.supportedTargets;
  if (!Array.isArray(supportedTargets) || supportedTargets.length === 0) {
    throw new MetaKimConfigError(
      "CONFIG_SEMANTIC_INVALID",
      "config/sync.json supportedTargets must be a non-empty array",
    );
  }
  const repositoryOptions = distribution.repositoryPolicy;
  const ids = new Set();
  const skills = manifest.skills.map((skill, index) => {
    const idKey = skill.id.toLowerCase();
    if (ids.has(idKey)) {
      throw new MetaKimConfigError(
        "CONFIG_SEMANTIC_INVALID",
        `skills[${index}].id duplicates ${skill.id}`,
      );
    }
    ids.add(idKey);

    const expandedRepo = skill.repo.replaceAll("${skillOwner}", skillOwner);
    if (expandedRepo.includes("${")) {
      throw new MetaKimConfigError(
        "CONFIG_SEMANTIC_INVALID",
        `skills[${index}].repo contains an unsupported placeholder`,
      );
    }
    const repository = normalizeRepositorySource(expandedRepo, {
      ...repositoryOptions,
      label: `skills[${index}].repo`,
    });
    const targets = skill.targets ? [...skill.targets] : [...supportedTargets];
    if (targets.length === 0 || new Set(targets).size !== targets.length) {
      throw new MetaKimConfigError(
        "CONFIG_SEMANTIC_INVALID",
        `skills[${index}].targets must be non-empty and unique`,
      );
    }

    let marketplace;
    let versionSource;
    if (skill.claudePlugin) {
      const [pluginName, marketplaceId, ...extraParts] = skill.claudePlugin.split("@");
      if (!pluginName || !marketplaceId || extraParts.length > 0) {
        throw new MetaKimConfigError(
          "CONFIG_SEMANTIC_INVALID",
          `skills[${index}].claudePlugin must use plugin@marketplace`,
        );
      }
      if (!skill.marketplace || skill.marketplace.id !== marketplaceId) {
        throw new MetaKimConfigError(
          "CONFIG_SEMANTIC_INVALID",
          `skills[${index}].marketplace.id must match ${marketplaceId}`,
        );
      }
      if (!skill.versionSource) {
        throw new MetaKimConfigError(
          "CONFIG_SEMANTIC_INVALID",
          `skills[${index}].versionSource is required for Claude plugin updates`,
        );
      }
      marketplace = {
        ...skill.marketplace,
        repository: normalizeRepositorySource(skill.marketplace.repository, {
          ...repositoryOptions,
          label: `skills[${index}].marketplace.repository`,
        }),
      };
      const versionRepository = normalizeRepositorySource(
        skill.versionSource.repository,
        {
          ...repositoryOptions,
          label: `skills[${index}].versionSource.repository`,
        },
      );
      const githubHost = normalizeHost(distribution.sourceHosts.github.host);
      if (
        skill.versionSource.provider === "github-contents" &&
        versionRepository.host !== githubHost
      ) {
        throw new MetaKimConfigError(
          "CONFIG_SEMANTIC_INVALID",
          `skills[${index}].versionSource repository must use ${githubHost}`,
        );
      }
      versionSource = {
        ...skill.versionSource,
        pluginName: skill.versionSource.pluginName || pluginName,
        repository: versionRepository,
        apiBase: distribution.sourceHosts.github.apiBase.replace(/\/$/, ""),
      };
    } else if (skill.marketplace || skill.versionSource) {
      throw new MetaKimConfigError(
        "CONFIG_SEMANTIC_INVALID",
        `skills[${index}] cannot declare marketplace/versionSource without claudePlugin`,
      );
    }

    return {
      ...skill,
      targets,
      repository,
      ...(marketplace ? { marketplace } : {}),
      ...(versionSource ? { versionSource } : {}),
    };
  });
  return { ...manifest, skillOwner, skills };
}

function normalizeDistributionConfig(distribution) {
  const trustedHosts = distribution.repositoryPolicy.trustedHosts.map(normalizeHost);
  if (new Set(trustedHosts).size !== trustedHosts.length) {
    throw new MetaKimConfigError(
      "CONFIG_SEMANTIC_INVALID",
      "repositoryPolicy.trustedHosts must not contain duplicates",
    );
  }
  const normalized = {
    ...distribution,
    repositoryPolicy: {
      ...distribution.repositoryPolicy,
      trustedHosts,
    },
  };
  const projectRepository = normalizeRepositorySource(
    distribution.project.repository,
    {
      ...normalized.repositoryPolicy,
      label: "distribution.project.repository",
    },
  );
  if (/\s|[\r\n]/.test(distribution.project.npxSpec)) {
    throw new MetaKimConfigError(
      "CONFIG_SEMANTIC_INVALID",
      "distribution.project.npxSpec must be a single safe package specifier",
    );
  }
  const githubHost = normalizeHost(distribution.sourceHosts.github.host);
  if (!trustedHosts.includes(githubHost)) {
    throw new MetaKimConfigError(
      "CONFIG_SEMANTIC_INVALID",
      "sourceHosts.github.host must be included in repositoryPolicy.trustedHosts",
    );
  }
  for (const [label, value] of [
    ["sourceHosts.github.webBase", distribution.sourceHosts.github.webBase],
    ["sourceHosts.github.apiBase", distribution.sourceHosts.github.apiBase],
  ]) {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") {
      throw new MetaKimConfigError(
        "CONFIG_SEMANTIC_INVALID",
        `${label} must use HTTPS`,
      );
    }
  }
  return {
    ...normalized,
    project: {
      ...distribution.project,
      repositoryDetails: projectRepository,
    },
  };
}

export function loadMetaKimConfig({ repoRoot, env = process.env } = {}) {
  const root = path.resolve(repoRoot ?? path.join(import.meta.dirname, ".."));
  const distribution = normalizeDistributionConfig(
    loadSchemaValidatedConfig(
      path.join(root, "config", "distribution.json"),
      path.join(root, "config", "contracts", "distribution.schema.json"),
      "Meta_Kim distribution config",
    ),
  );
  const syncConfig = readJsonFile(
    path.join(root, "config", "sync.json"),
    "Meta_Kim runtime sync config",
  );
  const skills = normalizeSkillsConfig(
    loadSchemaValidatedConfig(
      path.join(root, "config", "skills.json"),
      path.join(root, "config", "contracts", "skills-manifest.schema.json"),
      "Meta_Kim skills manifest",
    ),
    distribution,
    syncConfig,
    env,
  );
  return { root, distribution, syncConfig, skills };
}
