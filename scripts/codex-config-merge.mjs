export const CODEX_REQUEST_USER_INPUT_FEATURE = "default_mode_request_user_input";
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

export function ensureCodexRequestUserInputFeature(configText = "") {
  const normalized = String(configText ?? "").replace(/\r\n/g, "\n");
  const trailingNewline = normalized.endsWith("\n");
  const lines = normalized.length > 0 ? normalized.split("\n") : [];
  if (trailingNewline) {
    lines.pop();
  }

  const settingLine = `${CODEX_REQUEST_USER_INPUT_FEATURE} = true`;
  const settingRe = new RegExp(`^(\\s*)${CODEX_REQUEST_USER_INPUT_FEATURE}\\s*=.*$`);
  const features = findSection(lines, "features");

  if (!features) {
    if (lines.length > 0 && lines[lines.length - 1].trim() !== "") {
      lines.push("");
    }
    lines.push("[features]", settingLine);
    return `${lines.join("\n")}\n`;
  }

  for (let index = features.start + 1; index < features.end; index += 1) {
    if (settingRe.test(lines[index])) {
      lines[index] = lines[index].replace(settingRe, `$1${settingLine}`);
      return `${lines.join("\n")}\n`;
    }
  }

  lines.splice(features.end, 0, settingLine);
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

  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*notify\s*=\s*\[/.test(lines[index])) continue;
    const end = notifyBlockEnd(lines, index);
    const block = lines.slice(index, end).join("\n");
    if (!/terminal-notifier/.test(block)) continue;
    lines.splice(index, end - index, ...windowsNotifyBlock());
    return `${lines.join("\n")}\n`;
  }

  return `${lines.join("\n")}\n`;
}
