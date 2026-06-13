#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  CODEX_APP_NATIVE_PLUGIN_IDS,
  CODEX_JS_REPL_FEATURE,
  CODEX_REQUEST_USER_INPUT_FEATURE,
  ensureCodexAppNativeControls,
  mergeCodexConfigAddOnly,
} from "./codex-config-merge.mjs";
import {
  INSTALL_STATUS_CLASSES,
  INSTALL_STATUS_MESSAGE_CLASSES,
  installStatusNextAction,
} from "./meta-kim-i18n.mjs";
import {
  buildCodexHooksJson,
  buildHookPromptAdapterSource,
} from "./runtime-hook-mapping.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function repoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readText(relativePath) {
  return fs.readFile(repoPath(relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function exists(relativePath) {
  try {
    await fs.access(repoPath(relativePath));
    return true;
  } catch {
    return false;
  }
}

async function walk(relativeRoot, bucket = []) {
  const absoluteRoot = repoPath(relativeRoot);
  let entries = [];
  try {
    entries = await fs.readdir(absoluteRoot, { withFileTypes: true });
  } catch {
    return bucket;
  }

  for (const entry of entries) {
    const absolutePath = path.join(absoluteRoot, entry.name);
    const relativePath = path.relative(repoRoot, absolutePath).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      await walk(relativePath, bucket);
    } else if (entry.isFile()) {
      bucket.push(relativePath);
    }
  }
  return bucket;
}

function hasAll(haystack, needles, label) {
  for (const needle of needles) {
    assert(haystack.includes(needle), `${label} missing ${needle}`);
  }
}

const contract = await readJson("config/governance/runtime-safety-hardening-contract.json");
const pkg = await readJson("package.json");
const catalog = await readJson("config/runtime-compatibility-catalog.json");
const checklist = await readText("config/contracts/change-readiness-checklist.md");
const pullRequestTemplate = await readText(".github/pull_request_template.md");
const verificationEvidence = await readText("canonical/skills/meta-theory/references/verification-evidence.md");
const evalMetaAgents = await readText("scripts/eval-meta-agents.mjs");

assert(
  contract.contractId === "meta-kim-runtime-safety-hardening-contract",
  "runtime safety contract id mismatch",
);
assert(
  await exists(contract.releaseGate?.validatorScript),
  "runtime safety validator script is missing",
);
assert(
  pkg.scripts?.[contract.releaseGate?.packageScript] ===
    `node ${contract.releaseGate.validatorScript}`,
  "package script must point to the runtime safety validator",
);
assert(
  String(pkg.scripts?.["meta:verify:governance"] ?? "").includes(
    `npm run ${contract.releaseGate.packageScript}`,
  ),
  "meta:verify:governance must run runtime safety validation",
);

hasAll(
  contract.hostConfigMerge?.requiredMatrixColumns ?? [],
  ["existingHostState", "stateAddedByChange", "stateMustPreserve", "rollbackPath"],
  "host config merge matrix",
);
hasAll(
  contract.hostConfigMerge?.protectedState ?? [],
  ["userOwnedConfig", "credentials", "customMcpServers", "nativeHostControls", "marketplaceSources"],
  "host config protected state",
);
assert(
  contract.hostConfigMerge?.mergeMode === "additive_preserve_user_state",
  "host config merge mode must preserve user state",
);
hasAll(
  contract.hostConfigMerge?.codexNativeControls?.requiredFeatures ?? [],
  [CODEX_REQUEST_USER_INPUT_FEATURE, CODEX_JS_REPL_FEATURE],
  "Codex native feature contract",
);
assert(
  JSON.stringify(contract.hostConfigMerge?.codexNativeControls?.requiredPluginIds) ===
    JSON.stringify(CODEX_APP_NATIVE_PLUGIN_IDS),
  "Codex native plugin ids must match codex-config-merge implementation",
);
const additiveMergeOut = mergeCodexConfigAddOnly(
  [
    'model = "gpt-5.5"',
    "",
    "[mcp_servers.github]",
    'command = "npx"',
    "",
    "[hooks]",
    'stop = "scripts/stop.mjs"',
    "",
  ].join("\n"),
  [
    'model = "gpt-5.4"',
    "",
    "[mcp_servers.github]",
    'command = "uvx"',
    'args = ["github-mcp"]',
    "",
    "[mcp_servers.context7]",
    'command = "npx"',
    "",
  ].join("\n"),
);
hasAll(
  additiveMergeOut,
  [
    'model = "gpt-5.5"',
    "[mcp_servers.github]",
    'command = "npx"',
    'args = ["github-mcp"]',
    "[mcp_servers.context7]",
    "[hooks]",
    'stop = "scripts/stop.mjs"',
  ],
  "Codex additive merge fixture",
);
assert(
  !additiveMergeOut.includes('model = "gpt-5.4"'),
  "Codex additive merge must not overwrite existing root settings",
);
const nativeControlsOut = ensureCodexAppNativeControls(
  [
    'model = "gpt-5.5"',
    'notify = ["terminal-notifier", "-message", "Task completed!"]',
    "",
    "[features]",
    "default_mode_request_user_input = false",
    "",
    '[plugins."browser@openai-bundled"]',
    "enabled = false",
    "",
    "[marketplaces.openai-bundled]",
    'source = "\\\\?\\C:\\Users\\Kim\\.codex\\.tmp\\bundled-marketplaces\\openai-bundled"',
    "",
    "[mcp_servers.github]",
    'command = "npx"',
    "",
    "[hooks]",
    'stop = "scripts/stop.mjs"',
    "",
    '[projects."D:/KimProject/Meta_Kim"]',
    'trust_level = "trusted"',
    "",
  ].join("\n"),
  {
    platformName: "win32",
    bundledMarketplaceSource: "C:\\CodexApp\\app\\resources\\plugins\\openai-bundled",
    pathExists: () => true,
  },
);
hasAll(
  nativeControlsOut,
  [
    "default_mode_request_user_input = true",
    "js_repl = true",
    '[plugins."browser@openai-bundled"]',
    '[plugins."chrome@openai-bundled"]',
    '[plugins."computer-use@openai-bundled"]',
    "[mcp_servers.github]",
    "[hooks]",
    '[projects."D:/KimProject/Meta_Kim"]',
  ],
  "Codex native controls fixture",
);
assert(!/terminal-notifier/.test(nativeControlsOut), "Windows Codex notify must not keep terminal-notifier");
assert(
  !/\.codex\\\.tmp\\bundled-marketplaces\\openai-bundled/i.test(nativeControlsOut),
  "Codex native controls must not keep stale bundled marketplace source",
);

const hookLayers = (contract.hookPromptProtocol?.requiredLayers ?? []).map(
  (layer) => layer.id,
);
assert(
  hookLayers.join("|") ===
    "sourcePayload|adapterTransform|hostRegistration|modelVisibleResult",
  "HookPrompt protocol must model the four hop chain",
);
const codexAdapter = buildHookPromptAdapterSource("codex");
const cursorAdapter = buildHookPromptAdapterSource("cursor");
hasAll(codexAdapter, ["hookSpecificOutput", "hookEventName", "UserPromptSubmit", "additionalContext"], "Codex HookPrompt adapter");
assert(
  !/systemMessage:\s*additionalContext/.test(codexAdapter),
  "Codex HookPrompt adapter must not use systemMessage for model context",
);
hasAll(cursorAdapter, ["prompt: additionalContext"], "Cursor HookPrompt adapter");
const codexHooks = buildCodexHooksJson({
  hookPromptAdapterPath: ".codex/hooks/hookprompt-adapter.mjs",
});
assert(
  JSON.stringify(codexHooks).includes("hookprompt-adapter.mjs"),
  "Codex HookPrompt host registration is missing",
);
hasAll(
  contract.hookPromptProtocol?.badInputRegressionFixtures ?? [],
  ["markdownFence", "delegatedPrompt", "internalGoalFilter"],
  "HookPrompt bad input regression fixtures",
);

hasAll(
  contract.residueSweep?.requiredBuckets ?? [],
  ["runtimeState", "i18n", "docs", "fixtures", "validators", "runtimeMirrors"],
  "residue sweep buckets",
);
const productionScanFiles = [
  ...(await walk("canonical")),
  ...(await walk("scripts")),
  "README.md",
  "README.zh-CN.md",
  "README.ja-JP.md",
  "README.ko-KR.md",
  "AGENTS.md",
  "CLAUDE.md",
].filter((file) => !file.endsWith(".png") && !file.endsWith(".sqlite"));
for (const marker of contract.residueSweep?.deprecatedMarkers ?? []) {
  const offenders = [];
  for (const file of productionScanFiles) {
    const raw = await readText(file);
    if (raw.includes(marker.marker)) {
      offenders.push(file);
    }
  }
  assert(
    offenders.length === 0,
    `deprecated marker ${marker.marker} remains in production files: ${offenders.join(", ")}`,
  );
}

hasAll(
  contract.runtimeEvidence?.requiredTemplateFields ?? [],
  ["operationSteps", "toolSideOutput", "hostVisibleResult", "failureBoundary", "reviewStatus"],
  "runtime evidence template",
);
hasAll(
  verificationEvidence,
  contract.runtimeEvidence?.allowedEvidenceKinds ?? [],
  "verification evidence reference",
);
hasAll(
  evalMetaAgents,
  ["runtimeEvidencePacket", "strictReleasePass", "blockedFromRelease", "evidenceKind", "failureClass"],
  "runtime evaluator evidence packet",
);
for (const evidenceKind of Object.keys(contract.runtimeEvidence?.evalEvidenceKindMap ?? {})) {
  assert(
    evalMetaAgents.includes(`"${evidenceKind}"`),
    `runtime evaluator missing evidence kind ${evidenceKind}`,
  );
}
hasAll(
  contract.runtimeEvidence?.requiredRecordFields ?? [],
  ["runtime", "mode", "status", "evidenceKind", "failureClass", "command", "artifact", "remainingAction", "strictReleasePass", "blockedFromRelease"],
  "runtime evidence record fields",
);
const catalogById = new Map((catalog.products ?? []).map((runtime) => [runtime.id, runtime]));
for (const runtimeId of ["cursor", "openclaw"]) {
  const runtime = catalogById.get(runtimeId);
  assert(runtime, `runtime compatibility catalog missing ${runtimeId}`);
  assert(
    /strict .*self-test evidence/i.test(runtime.nextAction ?? "") &&
      /passes review/i.test(runtime.nextAction ?? ""),
    `${runtimeId} nextAction must require strict self-test evidence and review`,
  );
}

assert(
  JSON.stringify(contract.installStatusSemantics?.allowedClasses) ===
    JSON.stringify(["success", "skipped", "manual", "failed"]),
  "install status classes must be success/skipped/manual/failed",
);
assert(
  JSON.stringify(INSTALL_STATUS_CLASSES) ===
    JSON.stringify(contract.installStatusSemantics?.allowedClasses),
  "install status helper classes must match runtime safety contract",
);
for (const statusClass of ["success", "skipped", "manual", "failed"]) {
  const record = contract.installStatusSemantics?.classes?.[statusClass];
  assert(record?.meaning, `install status ${statusClass} missing meaning`);
  assert(record?.userNextAction, `install status ${statusClass} missing userNextAction`);
  assert(installStatusNextAction(statusClass), `install status ${statusClass} missing helper next action`);
}
for (const [messageKey, statusClass] of Object.entries(INSTALL_STATUS_MESSAGE_CLASSES)) {
  assert(
    INSTALL_STATUS_CLASSES.includes(statusClass),
    `install message ${messageKey} maps to unknown status class ${statusClass}`,
  );
}

for (const doc of [checklist, pullRequestTemplate]) {
  hasAll(
    doc,
    [
      "Host State Impact Matrix",
      "Hook / Prompt Protocol Flow",
      "Deletion / Refactor Residue Sweep",
      "Evidence Budget",
      "Install / Update Status Semantics",
    ],
    "change readiness documentation",
  );
}

console.log("runtime safety hardening contract valid");
