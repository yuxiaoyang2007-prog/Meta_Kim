export const CODEX_REQUEST_USER_INPUT_FEATURE = "default_mode_request_user_input";

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
