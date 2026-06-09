import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(scriptDir, "..");

const CAPABILITY_RUNTIME_ID = {
  claude: "claude_code",
  codex: "codex",
  cursor: "cursor",
  openclaw: "openclaw",
};

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, relativePath), "utf8"));
}

export function toCapabilityRuntimeId(id) {
  return CAPABILITY_RUNTIME_ID[id] ?? id;
}

export function renderAgentPath(agentPath, agentName = "<agent>") {
  if (!agentPath) return null;
  return String(agentPath)
    .replaceAll("{agent}", agentName)
    .replaceAll("<agent>", agentName);
}

export function loadFormalToolProfiles() {
  const syncManifest = readJson("config/sync.json");
  const catalog = readJson("config/runtime-compatibility-catalog.json");
  const byId = new Map((catalog.products ?? []).map((product) => [product.id, product]));

  return (syncManifest.supportedTargets ?? []).map((id) => {
    const product = byId.get(id);
    const agentPath = product?.genericCompatibility?.agentPath ?? null;
    return {
      id,
      runtime: toCapabilityRuntimeId(id),
      label: product?.label ?? id,
      compatibilityStatus: product?.genericCompatibility?.status ?? "unknown",
      agentPath,
      agentPathTemplate: renderAgentPath(agentPath),
      evidenceRefs: (product?.evidence ?? []).map((entry) => entry.ref),
    };
  });
}

export function loadAgentProjectionProfiles() {
  return loadFormalToolProfiles().filter((profile) => profile.agentPath);
}

export function buildAgentProjectionTargets(agentName = "<agent>") {
  return loadAgentProjectionProfiles().map((profile) => ({
    runtime: profile.runtime,
    tool: profile.label,
    target: renderAgentPath(profile.agentPath, agentName),
    compatibilityStatus: profile.compatibilityStatus,
  }));
}
