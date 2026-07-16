import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertExactRuntimeCapabilityMatrix,
  parseRuntimeCapabilityMatrix,
  readRequiredPackagedText,
  validateRequiredMarkdown,
  validateRuntimeCapabilityMatrix,
} from "../../scripts/mcp/runtime-resource-contract.mjs";

const matrixPath = "config/runtime-capability-matrix.json";
const canonicalMatrix = JSON.parse(readFileSync(matrixPath, "utf8"));

test("MCP runtime resources use packaged canonical files without fallback stubs", () => {
  const source = readFileSync("scripts/mcp/meta-runtime-server.mjs", "utf8");
  assert.match(source, /packagedCanonicalAgentsDir = path\.join\(repoRoot, "canonical", "agents"\)/u);
  assert.match(source, /"canonical",\s*"skills",\s*"meta-theory",\s*"SKILL\.md"/u);
  assert.match(source, /"config",\s*"runtime-capability-matrix\.json"/u);
  assert.doesNotMatch(
    source,
    /FALLBACK_META_THEORY|readUtf8IfExists|openclawSkillPath|canonicalAgentsDir/u,
  );
});

test("MCP packaged resources ignore a polluted repository-root environment", () => {
  const externalRoot = mkdtempSync(path.join(os.tmpdir(), "meta-kim-mcp-external-root-"));
  try {
    const result = spawnSync(
      process.execPath,
      ["scripts/mcp/meta-runtime-server.mjs", "--self-test"],
      {
        cwd: process.cwd(),
        env: { ...process.env, META_KIM_REPO_ROOT: externalRoot },
        encoding: "utf8",
        windowsHide: true,
        timeout: 30_000,
      },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout || result.error?.message);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.agentCount, 9);
    assert.equal(payload.tools.length, 4);
  } finally {
    rmSync(externalRoot, { recursive: true, force: true });
  }
});

test("required packaged resources fail closed when missing", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "meta-kim-mcp-required-"));
  try {
    await assert.rejects(
      readRequiredPackagedText(path.join(root, "missing.md"), {
        packageRoot: root,
        label: "required test resource",
      }),
      /ENOENT|no such file/iu,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("canonical MCP Markdown resources must remain structurally valid", () => {
  const theory = readFileSync(
    "canonical/skills/meta-theory/references/meta-theory.md",
    "utf8",
  );
  const skill = readFileSync("canonical/skills/meta-theory/SKILL.md", "utf8");
  assert.equal(validateRequiredMarkdown(theory), theory);
  assert.equal(
    validateRequiredMarkdown(skill, {
      requireFrontmatter: true,
      expectedFrontmatterName: "meta-theory",
    }),
    skill,
  );
  assert.throws(() => validateRequiredMarkdown(""), /valid non-empty Markdown/u);
  assert.throws(
    () => validateRequiredMarkdown("# Skill\n", { requireFrontmatter: true }),
    /missing YAML frontmatter/u,
  );
});

test("runtime matrix validation rejects incomplete and malicious payloads", () => {
  assert.equal(validateRuntimeCapabilityMatrix(canonicalMatrix, matrixPath), canonicalMatrix);

  const missingMetadata = structuredClone(canonicalMatrix);
  delete missingMetadata.generatedFrom;
  assert.throws(
    () => validateRuntimeCapabilityMatrix(missingMetadata, "missing metadata"),
    /not a valid Meta_Kim runtime capability matrix/u,
  );

  const missingCapability = structuredClone(canonicalMatrix);
  missingCapability.platforms[0].capabilities.pop();
  assert.throws(
    () => validateRuntimeCapabilityMatrix(missingCapability, "missing capability"),
    /missing capabilities/u,
  );

  const malicious = JSON.parse(JSON.stringify(canonicalMatrix));
  malicious.platforms[0].capabilities[0]["__proto__"] = { polluted: true };
  const maliciousText = JSON.stringify(malicious).replace(
    '"platform":"claude_code"',
    '"__proto__":{"polluted":true},"platform":"claude_code"',
  );
  assert.throws(
    () => parseRuntimeCapabilityMatrix(maliciousText, "malicious matrix"),
    /unsafe object key/u,
  );
});

test("semantic MCP proof requires the complete top-level canonical matrix", () => {
  const response = structuredClone(canonicalMatrix);
  assert.equal(
    assertExactRuntimeCapabilityMatrix(response, canonicalMatrix),
    response,
  );
  response.knownConstraints = {
    ...response.knownConstraints,
    injected: ["top-level drift that a platforms-only comparison would miss"],
  };
  assert.throws(
    () => assertExactRuntimeCapabilityMatrix(response, canonicalMatrix),
    /does not exactly match/u,
  );
});
