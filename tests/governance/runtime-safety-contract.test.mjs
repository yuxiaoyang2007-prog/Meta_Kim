import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  CODEX_APP_NATIVE_PLUGIN_IDS,
  CODEX_JS_REPL_FEATURE,
  CODEX_REQUEST_USER_INPUT_FEATURE,
} from "../../scripts/codex-config-merge.mjs";
import {
  buildCodexHooksJson,
  buildHookPromptAdapterSource,
} from "../../scripts/runtime-hook-mapping.mjs";

const CONTRACT = JSON.parse(
  readFileSync("config/governance/runtime-safety-hardening-contract.json", "utf8"),
);
const PACKAGE = JSON.parse(readFileSync("package.json", "utf8"));
const HOOKPROMPT_FIXTURES = JSON.parse(
  readFileSync("tests/fixtures/hookprompt-bad-inputs.json", "utf8"),
);

test("runtime safety contract covers the five recent hardening lanes", () => {
  assert.equal(CONTRACT.contractId, "meta-kim-runtime-safety-hardening-contract");
  assert.deepEqual(CONTRACT.hostConfigMerge.requiredMatrixColumns, [
    "existingHostState",
    "stateAddedByChange",
    "stateMustPreserve",
    "rollbackPath",
  ]);
  assert.deepEqual(CONTRACT.hookPromptProtocol.requiredLayers.map((layer) => layer.id), [
    "sourcePayload",
    "adapterTransform",
    "hostRegistration",
    "modelVisibleResult",
  ]);
  assert.ok(CONTRACT.residueSweep.requiredBuckets.includes("i18n"));
  assert.ok(CONTRACT.runtimeEvidence.requiredTemplateFields.includes("hostVisibleResult"));
  assert.deepEqual(CONTRACT.installStatusSemantics.allowedClasses, [
    "success",
    "skipped",
    "manual",
    "failed",
  ]);
});

test("runtime safety validator is wired into governance verification", () => {
  assert.equal(
    PACKAGE.scripts[CONTRACT.releaseGate.packageScript],
    `node ${CONTRACT.releaseGate.validatorScript}`,
  );
  assert.match(
    PACKAGE.scripts["meta:verify:governance"],
    new RegExp(`npm run ${CONTRACT.releaseGate.packageScript}`),
  );

  const output = execFileSync(process.execPath, [CONTRACT.releaseGate.validatorScript], {
    encoding: "utf8",
  });
  assert.match(output, /runtime safety hardening contract valid/);
});

test("Codex host merge contract matches implementation constants", () => {
  assert.deepEqual(CONTRACT.hostConfigMerge.codexNativeControls.requiredFeatures, [
    CODEX_REQUEST_USER_INPUT_FEATURE,
    CODEX_JS_REPL_FEATURE,
  ]);
  assert.deepEqual(
    CONTRACT.hostConfigMerge.codexNativeControls.requiredPluginIds,
    CODEX_APP_NATIVE_PLUGIN_IDS,
  );
  assert.equal(CONTRACT.hostConfigMerge.codexNativeControls.windowsSandbox, "unelevated");
  assert.ok(
    CONTRACT.hostConfigMerge.forbiddenOutcomes.includes("pinStaleBundledMarketplaceSource"),
  );
});

test("HookPrompt protocol contract binds source, adapter, host, and model-visible fields", () => {
  const codexSource = buildHookPromptAdapterSource("codex");
  const cursorSource = buildHookPromptAdapterSource("cursor");
  const codexHooks = buildCodexHooksJson({
    hookPromptAdapterPath: ".codex/hooks/hookprompt-adapter.mjs",
  });

  assert.match(codexSource, /hookSpecificOutput/);
  assert.match(codexSource, /additionalContext/);
  assert.doesNotMatch(codexSource, /systemMessage:\s*additionalContext/);
  assert.match(cursorSource, /prompt:\s*additionalContext/);
  assert.match(JSON.stringify(codexHooks), /hookprompt-adapter\.mjs/);
});

test("HookPrompt bad-input fixtures flow through adapter into model-visible fields", () => {
  for (const runtimeId of ["codex", "cursor"]) {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), `meta-kim-hookprompt-${runtimeId}-`));
    try {
      const adapterPath = path.join(tempDir, "hookprompt-adapter.mjs");
      const hookPromptPath = path.join(tempDir, "user-prompt-submit.js");
      writeFileSync(adapterPath, buildHookPromptAdapterSource(runtimeId), "utf8");
      writeFileSync(
        hookPromptPath,
        [
          'import { readFileSync } from "node:fs";',
          'const raw = readFileSync(0, "utf8");',
          'const payload = raw.trim() ? JSON.parse(raw) : {};',
          'const prompt = payload.prompt || "";',
          'console.log(JSON.stringify({ hookSpecificOutput: { additionalContext: `CTX:${prompt}` } }));',
          "",
        ].join("\n"),
        "utf8",
      );

      for (const fixture of HOOKPROMPT_FIXTURES.fixtures) {
        const result = spawnSync(process.execPath, [adapterPath], {
          input: JSON.stringify(fixture.payload),
          encoding: "utf8",
        });
        assert.equal(result.status, 0, result.stderr);
        const parsed = JSON.parse(result.stdout);
        const modelVisible =
          runtimeId === "cursor"
            ? parsed.prompt
            : parsed.hookSpecificOutput?.additionalContext;
        assert.match(modelVisible, new RegExp(fixture.expectedPromptFragment));
        assert.doesNotMatch(JSON.stringify(parsed), /systemMessage/);
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
});
