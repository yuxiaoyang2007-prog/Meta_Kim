import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export const CODEX_REQUEST_USER_INPUT_FEATURE = "default_mode_request_user_input";
export const CODEX_JS_REPL_FEATURE = "js_repl";
export const CODEX_APP_NATIVE_PLUGIN_IDS = [
  "browser@openai-bundled",
  "chrome@openai-bundled",
  "computer-use@openai-bundled",
];
const WINDOWS_NOTIFY_COMMAND = [
  "powershell.exe",
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-Command",
  "$input | Out-Null",
];

function findSection(lines, sectionName) {
  const headerRe = new RegExp(`^\\s*\\[${sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]\\s*(?:#.*)?$`);
  const anyHeaderRe = /^\s*\[[^\]]+\]\s*(?:#.*)?$/;
  const start = lines.findIndex((line) => headerRe.test(line));
  if (start < 0) {
    return null;
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (anyHeaderRe.test(lines[index])) {
      end = index;
      break;
    }
  }
  return { start, end };
}

function normalizeLines(configText = "") {
  const normalized = String(configText ?? "").replace(/\r\n/g, "\n");
  const trailingNewline = normalized.endsWith("\n");
  const lines = normalized.length > 0 ? normalized.split("\n") : [];
  if (trailingNewline) {
    lines.pop();
  }
  return lines;
}

const TOML_BARE_KEY_RE = /^\s*[A-Za-z0-9_.-]+\s*=/;
const TOML_TABLE_HEADER_RE = /^\s*\[\[?[^\]]+\]\]?\s*(?:#.*)?$/;

function codeBeforeTomlComment(line = "") {
  let quote = null;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const ch = line[index];
    if (quote) {
      if (quote === '"' && escaped) {
        escaped = false;
        continue;
      }
      if (quote === '"' && ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === "#") {
      return line.slice(0, index);
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    }
  }

  return line;
}

function scanTomlContainers(code, stack, lineNumber) {
  let quote = null;
  let escaped = false;

  for (let index = 0; index < code.length; index += 1) {
    const ch = code[index];
    if (quote) {
      if (quote === '"' && escaped) {
        escaped = false;
        continue;
      }
      if (quote === '"' && ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "[") {
      stack.push({ kind: "array", line: lineNumber, column: index + 1 });
      continue;
    }
    if (ch === "{") {
      stack.push({ kind: "inline table", line: lineNumber, column: index + 1 });
      continue;
    }
    if (ch === "]") {
      const latestArray = stack.findLastIndex((entry) => entry.kind === "array");
      if (latestArray >= 0) stack.splice(latestArray, 1);
      continue;
    }
    if (ch === "}") {
      const latestTable = stack.findLastIndex((entry) => entry.kind === "inline table");
      if (latestTable >= 0) stack.splice(latestTable, 1);
    }
  }
}

function codexConfigTomlIssue(configText = "") {
  const lines = normalizeLines(configText);
  const stack = [];

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const rawLine = lines[index];
    const code = codeBeforeTomlComment(rawLine);
    if (!code.trim()) continue;

    const isTableHeader = TOML_TABLE_HEADER_RE.test(rawLine);
    if (stack.length > 0 && (TOML_BARE_KEY_RE.test(code) || isTableHeader)) {
      return {
        type: "statement_inside_unclosed_container",
        line: lineNumber,
        column: code.search(/\S/) + 1,
        snippet: rawLine.trim(),
        opener: stack[stack.length - 1],
      };
    }

    if (isTableHeader) continue;
    scanTomlContainers(code, stack, lineNumber);
  }

  if (stack.length > 0) {
    return {
      type: "unclosed_container",
      line: lines.length || 1,
      column: 1,
      snippet: "<end of file>",
      opener: stack[stack.length - 1],
    };
  }

  return null;
}

function formatCodexConfigTomlIssue(issue) {
  const opener = issue.opener;
  const location = `line ${issue.line}:${issue.column}`;
  const openedAt = `${opener.kind} opened at line ${opener.line}:${opener.column}`;
  return [
    `Codex config.toml is not safe to merge: ${location} appears before an unclosed TOML ${openedAt}.`,
    `Problem line: ${issue.snippet}`,
    "Fix the missing comma or closing bracket above this line first, then put Codex feature flags under [features], for example:",
    "[features]",
    "multi_agent = true",
  ].join("\n");
}

export class CodexConfigTomlError extends Error {
  constructor(issue) {
    super(formatCodexConfigTomlIssue(issue));
    this.name = "CodexConfigTomlError";
    this.issue = issue;
  }
}

export function assertCodexConfigTomlMergeable(configText = "") {
  const issue = codexConfigTomlIssue(configText);
  if (issue) {
    throw new CodexConfigTomlError(issue);
  }
}

function ensureSectionSetting(lines, sectionName, settingName, settingValue) {
  const settingLine = `${settingName} = ${settingValue}`;
  const settingRe = new RegExp(
    `^(\\s*)${settingName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=.*$`,
  );
  let section = findSection(lines, sectionName);

  if (!section) {
    if (lines.length > 0 && lines[lines.length - 1].trim() !== "") {
      lines.push("");
    }
    lines.push(`[${sectionName}]`, settingLine);
    return;
  }

  for (let index = section.start + 1; index < section.end; index += 1) {
    if (settingRe.test(lines[index])) {
      lines[index] = lines[index].replace(settingRe, `$1${settingLine}`);
      return;
    }
  }

  lines.splice(section.end, 0, settingLine);
}

function firstSectionIndex(lines) {
  const index = lines.findIndex((line) => /^\s*\[[^\]]+\]\s*(?:#.*)?$/.test(line));
  return index < 0 ? lines.length : index;
}

function rootSettingNames(lines) {
  const names = new Set();
  const end = firstSectionIndex(lines);
  for (const line of lines.slice(0, end)) {
    const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=/);
    if (match) names.add(match[1]);
  }
  return names;
}

function rootSettingLines(lines) {
  const end = firstSectionIndex(lines);
  return lines.slice(0, end).filter((line) => /^\s*[A-Za-z0-9_.-]+\s*=/.test(line));
}

function sectionNames(lines) {
  return lines
    .map((line) => line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/)?.[1])
    .filter(Boolean);
}

function sectionSettingLines(lines, sectionName) {
  const section = findSection(lines, sectionName);
  if (!section) return [];
  return lines
    .slice(section.start + 1, section.end)
    .filter((line) => /^\s*[A-Za-z0-9_.-]+\s*=/.test(line));
}

function settingNameFromLine(line) {
  return line.match(/^\s*([A-Za-z0-9_.-]+)\s*=/)?.[1] ?? null;
}

function isTopLevelMcpServerSection(sectionName = "") {
  return /^mcp_servers\.(?:"[^"]+"|[A-Za-z0-9_-]+)$/.test(sectionName);
}

function isStdioTransportType(value = "") {
  return String(value).trim().toLowerCase() === "stdio";
}

function isRemoteTransportType(value = "") {
  return ["http", "sse", "streamable_http", "streamable-http"].includes(
    String(value).trim().toLowerCase(),
  );
}

function mcpTransportForSection(lines, sectionName) {
  const settings = new Set(
    sectionSettingLines(lines, sectionName)
      .map(settingNameFromLine)
      .filter(Boolean),
  );
  const type = sectionSettingValue(lines, sectionName, "type");
  const hasUrl = settings.has("url");
  const hasStdioLaunch = settings.has("command") || settings.has("args");

  if (hasUrl && !hasStdioLaunch && !isStdioTransportType(type)) {
    return "remote";
  }
  if (hasStdioLaunch || isStdioTransportType(type)) {
    return "stdio";
  }
  if (hasUrl || isRemoteTransportType(type)) {
    return "remote";
  }
  return null;
}

function ensureBlankLineBeforeAppend(lines) {
  if (lines.length > 0 && lines[lines.length - 1].trim() !== "") {
    lines.push("");
  }
}

function appendWholeSection(lines, sourceLines, sectionName) {
  const section = findSection(sourceLines, sectionName);
  if (!section) return;
  ensureBlankLineBeforeAppend(lines);
  lines.push(...sourceLines.slice(section.start, section.end));
}

export function mergeCodexConfigAddOnly(baseConfigText = "", additiveConfigText = "") {
  assertCodexConfigTomlMergeable(baseConfigText);
  assertCodexConfigTomlMergeable(additiveConfigText);

  const baseLines = normalizeLines(baseConfigText);
  const additiveLines = normalizeLines(additiveConfigText);
  const preferredMcpTransports = new Map(
    sectionNames(additiveLines)
      .filter(isTopLevelMcpServerSection)
      .map((sectionName) => [
        sectionName,
        mcpTransportForSection(additiveLines, sectionName),
      ])
      .filter(([, transport]) => Boolean(transport)),
  );
  const existingRootSettings = rootSettingNames(baseLines);
  const missingRootLines = rootSettingLines(additiveLines).filter((line) => {
    const name = settingNameFromLine(line);
    return name && !existingRootSettings.has(name);
  });

  if (missingRootLines.length > 0) {
    const insertAt = firstSectionIndex(baseLines);
    const block = [...missingRootLines, ""];
    baseLines.splice(insertAt, 0, ...block);
  }

  for (const sectionName of sectionNames(additiveLines)) {
    const baseSection = findSection(baseLines, sectionName);
    if (!baseSection) {
      appendWholeSection(baseLines, additiveLines, sectionName);
      continue;
    }

    const existingSettings = new Set(
      sectionSettingLines(baseLines, sectionName)
        .map(settingNameFromLine)
        .filter(Boolean),
    );
    const missingLines = sectionSettingLines(additiveLines, sectionName).filter((line) => {
      const name = settingNameFromLine(line);
      return name && !existingSettings.has(name);
    });
    if (missingLines.length > 0) {
      const latestSection = findSection(baseLines, sectionName);
      baseLines.splice(latestSection.end, 0, ...missingLines);
    }
  }

  normalizeCodexMcpServerTransportConflicts(baseLines, preferredMcpTransports);

  return `${baseLines.join("\n")}\n`;
}

export function ensureCodexRequestUserInputFeature(configText = "") {
  assertCodexConfigTomlMergeable(configText);

  const lines = normalizeLines(configText);
  ensureSectionSetting(
    lines,
    "features",
    CODEX_REQUEST_USER_INPUT_FEATURE,
    "true",
  );
  return `${lines.join("\n")}\n`;
}

export function hasCodexRequestUserInputFeature(configText = "") {
  const normalized = String(configText ?? "").replace(/\r\n/g, "\n");
  const lines = normalized.endsWith("\n")
    ? normalized.slice(0, -1).split("\n")
    : normalized.split("\n");
  const features = findSection(lines, "features");
  if (!features) {
    return false;
  }
  const settingRe = new RegExp(`^\\s*${CODEX_REQUEST_USER_INPUT_FEATURE}\\s*=\\s*true\\s*(?:#.*)?$`);
  return lines
    .slice(features.start + 1, features.end)
    .some((line) => settingRe.test(line));
}

function tomlString(value) {
  return JSON.stringify(value);
}

function tomlLiteralString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function windowsNotifyBlock() {
  return [
    "# Windows-safe no-op notification command. It consumes Codex's JSON",
    "# notification payload and exits successfully without requiring macOS",
    "# notification tools.",
    "notify = [",
    ...WINDOWS_NOTIFY_COMMAND.map((part, index) => {
      const comma = index === WINDOWS_NOTIFY_COMMAND.length - 1 ? "" : ",";
      return `  ${tomlString(part)}${comma}`;
    }),
    "]",
  ];
}

function codexComputerUseNotifyBlock(command) {
  return [
    "# Codex App computer-use notification helper. This preserves Browser /",
    "# Computer Use turn-ended integration on Windows when the helper exists.",
    "notify = [",
    `  ${tomlString(command)},`,
    `  ${tomlString("turn-ended")}`,
    "]",
  ];
}

function findCodexComputerUseNotifyCommand({
  codexHome,
  pathExists = defaultPathExists,
} = {}) {
  if (!codexHome) return null;
  const helperRoot = path.win32.join(
    codexHome,
    "plugins",
    "cache",
    "openai-bundled",
    "computer-use",
  );

  let versionDirs = [];
  try {
    versionDirs = readdirSync(helperRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(compareVersionLikeNamesDesc);
  } catch {
    return null;
  }

  for (const versionDir of versionDirs) {
    const candidate = path.win32.join(
      helperRoot,
      versionDir,
      "node_modules",
      "@oai",
      "sky",
      "bin",
      "windows",
      "codex-computer-use.exe",
    );
    if (pathExists(candidate)) return candidate;
  }

  return null;
}

function notifyBlockEnd(lines, start) {
  let bracketDepth = 0;
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    bracketDepth += (line.match(/\[/g) ?? []).length;
    bracketDepth -= (line.match(/\]/g) ?? []).length;
    if (bracketDepth <= 0) return index + 1;
  }
  return start + 1;
}

export function ensureCodexWindowsNotifyCompat(
  configText = "",
  platformName = process.platform,
  options = {},
) {
  const normalized = String(configText ?? "").replace(/\r\n/g, "\n");
  if (platformName !== "win32" || !/terminal-notifier/.test(normalized)) {
    return normalized.endsWith("\n") || normalized.length === 0
      ? normalized
      : `${normalized}\n`;
  }

  const trailingNewline = normalized.endsWith("\n");
  const lines = normalized.length > 0 ? normalized.split("\n") : [];
  if (trailingNewline) {
    lines.pop();
  }

  const helperCommand = findCodexComputerUseNotifyCommand(options);
  const replacementBlock = helperCommand
    ? codexComputerUseNotifyBlock(helperCommand)
    : windowsNotifyBlock();

  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*notify\s*=\s*\[/.test(lines[index])) continue;
    const end = notifyBlockEnd(lines, index);
    const block = lines.slice(index, end).join("\n");
    if (!/terminal-notifier/.test(block)) continue;
    lines.splice(index, end - index, ...replacementBlock);
    return `${lines.join("\n")}\n`;
  }

  return `${lines.join("\n")}\n`;
}

function parseTomlStringValue(rawValue = "") {
  const trimmed = String(rawValue).trim().replace(/\s+#.*$/, "");
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function sectionSettingValue(lines, sectionName, settingName) {
  const section = findSection(lines, sectionName);
  if (!section) return null;
  const settingRe = new RegExp(
    `^\\s*${settingName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*(.+?)\\s*$`,
  );
  for (let index = section.start + 1; index < section.end; index += 1) {
    const match = lines[index].match(settingRe);
    if (match) return parseTomlStringValue(match[1]);
  }
  return null;
}

function removeSectionSetting(lines, sectionName, settingName) {
  const section = findSection(lines, sectionName);
  if (!section) return;
  const settingRe = new RegExp(
    `^\\s*${settingName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=`,
  );
  for (let index = section.end - 1; index > section.start; index -= 1) {
    if (settingRe.test(lines[index])) {
      lines.splice(index, 1);
    }
  }
}

function codexMcpServerTransportConflict(lines, sectionName) {
  const settings = new Set(
    sectionSettingLines(lines, sectionName)
      .map(settingNameFromLine)
      .filter(Boolean),
  );
  const type = sectionSettingValue(lines, sectionName, "type");
  const hasRemote = settings.has("url") || isRemoteTransportType(type);
  const hasStdio =
    settings.has("command") ||
    settings.has("args") ||
    isStdioTransportType(type);

  return hasRemote && hasStdio;
}

function removeTransportTypeIf(lines, sectionName, predicate) {
  const type = sectionSettingValue(lines, sectionName, "type");
  if (type !== null && predicate(type)) {
    removeSectionSetting(lines, sectionName, "type");
  }
}

function normalizeCodexMcpServerTransportConflicts(
  lines,
  preferredTransports = new Map(),
) {
  for (const sectionName of sectionNames(lines)) {
    if (!isTopLevelMcpServerSection(sectionName)) continue;
    if (!codexMcpServerTransportConflict(lines, sectionName)) continue;

    const preferredTransport =
      preferredTransports.get(sectionName) ??
      mcpTransportForSection(lines, sectionName) ??
      "stdio";

    if (preferredTransport === "remote") {
      for (const settingName of ["command", "args", "cwd"]) {
        removeSectionSetting(lines, sectionName, settingName);
      }
      removeTransportTypeIf(lines, sectionName, isStdioTransportType);
      continue;
    }

    for (const settingName of [
      "url",
      "bearer_token_env_var",
      "oauth_client_id",
      "oauth_resource",
    ]) {
      removeSectionSetting(lines, sectionName, settingName);
    }
    removeTransportTypeIf(lines, sectionName, isRemoteTransportType);
  }
}

function withoutExtendedWindowsPrefix(filePath = "") {
  return String(filePath).replace(/^\\\\\?\\/, "");
}

function defaultPathExists(filePath) {
  try {
    return existsSync(withoutExtendedWindowsPrefix(filePath));
  } catch {
    return false;
  }
}

function normalizeWindowsPathForToml(filePath) {
  const value = String(filePath);
  if (!/^[A-Za-z]:\\/.test(value)) return value;
  return value.startsWith("\\\\?\\") ? value : `\\\\?\\${value}`;
}

function isStaleBundledMarketplaceSource(source = "", pathExists = defaultPathExists) {
  const normalized = String(source).replace(/\//g, "\\");
  if (/\\\.codex\\\.tmp\\bundled-marketplaces\\openai-bundled$/i.test(normalized)) {
    return true;
  }
  if (/\\bundled-marketplaces\\openai-bundled$/i.test(normalized)) {
    return !pathExists(source);
  }
  return false;
}

function compareVersionLikeNamesDesc(left, right) {
  return right.localeCompare(left, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function findCodexAppBundledMarketplaceSource({
  platformName = process.platform,
  pathExists = defaultPathExists,
  windowsAppsRoots,
  bundledMarketplaceSource,
} = {}) {
  if (bundledMarketplaceSource && pathExists(bundledMarketplaceSource)) {
    return normalizeWindowsPathForToml(bundledMarketplaceSource);
  }
  if (platformName !== "win32") {
    return null;
  }

  const roots = windowsAppsRoots ?? [
    process.env.ProgramFiles ? path.win32.join(process.env.ProgramFiles, "WindowsApps") : null,
    "C:\\Program Files\\WindowsApps",
  ].filter(Boolean);

  for (const root of roots) {
    let entries = [];
    try {
      entries = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^OpenAI\.Codex_/i.test(entry.name))
        .map((entry) => entry.name);
    } catch {
      continue;
    }

    for (const appDir of entries.sort(compareVersionLikeNamesDesc)) {
      const candidate = path.win32.join(
        root,
        appDir,
        "app",
        "resources",
        "plugins",
        "openai-bundled",
      );
      if (pathExists(candidate)) {
        return normalizeWindowsPathForToml(candidate);
      }
    }
  }

  return null;
}

function ensureOpenAiBundledMarketplace(lines, options = {}) {
  const sectionName = "marketplaces.openai-bundled";
  const pathExists = options.pathExists ?? defaultPathExists;
  const existingSource = sectionSettingValue(lines, sectionName, "source");
  const discoveredSource = findCodexAppBundledMarketplaceSource(options);
  const sourceToKeep =
    discoveredSource ??
    (existingSource && !isStaleBundledMarketplaceSource(existingSource, pathExists)
      ? existingSource
      : null);

  ensureSectionSetting(lines, sectionName, "source_type", tomlString("local"));
  if (sourceToKeep) {
    ensureSectionSetting(
      lines,
      sectionName,
      "source",
      tomlLiteralString(normalizeWindowsPathForToml(sourceToKeep)),
    );
    return;
  }

  removeSectionSetting(lines, sectionName, "source");
}

export function ensureCodexAppNativeControls(configText = "", options = {}) {
  assertCodexConfigTomlMergeable(configText);

  const lines = normalizeLines(configText);
  const platformName = options.platformName ?? process.platform;

  ensureSectionSetting(lines, "features", CODEX_REQUEST_USER_INPUT_FEATURE, "true");
  ensureSectionSetting(lines, "features", CODEX_JS_REPL_FEATURE, "true");
  if (platformName === "win32") {
    ensureSectionSetting(lines, "windows", "sandbox", tomlString("unelevated"));
    ensureOpenAiBundledMarketplace(lines, { ...options, platformName });

    for (const pluginId of CODEX_APP_NATIVE_PLUGIN_IDS) {
      ensureSectionSetting(lines, `plugins."${pluginId}"`, "enabled", "true");
    }
  }

  normalizeCodexMcpServerTransportConflicts(lines);

  return ensureCodexWindowsNotifyCompat(
    `${lines.join("\n")}\n`,
    platformName,
    options,
  );
}
