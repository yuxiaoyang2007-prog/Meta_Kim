import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { createReportContext } from "../../scripts/report-context.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");

test("report context keeps the default and named profile output roots stable", () => {
  const defaultContext = createReportContext({ profile: "default" });
  const namedContext = createReportContext({ profile: "report-context-test" });

  assert.equal(
    defaultContext.relativeToRepo(defaultContext.resolveStatePath("sample", "latest.json")),
    ".meta-kim/state/default/sample/latest.json",
  );
  assert.equal(
    namedContext.relativeToRepo(namedContext.resolveStatePath("sample", "latest.json")),
    ".meta-kim/state/report-context-test/sample/latest.json",
  );
});

test("shared report writers preserve JSON and text bytes", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "meta-kim-report-context-"));
  const context = createReportContext({ profile: "writer-test" });
  const outputDir = path.join(tempDir, "nested");
  const jsonPath = path.join(outputDir, "latest.json");
  const textPath = path.join(outputDir, "latest.md");

  try {
    await context.ensureDirectory(outputDir);
    await context.writeJson(jsonPath, { schemaVersion: "fixture-v1", ok: true });
    await context.writeText(textPath, "# Fixture\n");

    assert.equal(
      await fs.readFile(jsonPath, "utf8"),
      '{\n  "schemaVersion": "fixture-v1",\n  "ok": true\n}\n',
    );
    assert.equal(await fs.readFile(textPath, "utf8"), "# Fixture\n");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("runtime probe generator writes the same schema and stdout contract under a named profile", async () => {
  const profile = `report-context-${process.pid}-${Date.now()}`;
  const context = createReportContext({ profile });
  const profileDir = context.profileDir;

  try {
    const result = spawnSync(
      process.execPath,
      ["scripts/generate-runtime-probe-playbook.mjs"],
      {
        cwd: repoRoot,
        encoding: "utf8",
        env: { ...process.env, META_KIM_PROFILE: profile },
      },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const summary = JSON.parse(result.stdout);
    assert.deepEqual(Object.keys(summary), [
      "ok",
      "report",
      "markdown",
      "variantCount",
      "missingEnvironments",
      "cursorNativeStillBlocked",
    ]);
    assert.equal(summary.ok, true);
    assert.equal(
      summary.report,
      `.meta-kim/state/${profile}/runtime-probe-playbook/latest.json`,
    );
    assert.equal(
      summary.markdown,
      `.meta-kim/state/${profile}/runtime-probe-playbook/latest.zh-CN.md`,
    );

    const report = JSON.parse(
      await fs.readFile(context.resolveStatePath("runtime-probe-playbook", "latest.json"), "utf8"),
    );
    assert.deepEqual(Object.keys(report), [
      "schemaVersion",
      "generatedAt",
      "status",
      "summary",
      "variants",
    ]);
    assert.equal(report.schemaVersion, "runtime-probe-playbook-v0.1");
    assert.equal(report.status, "pass");
    assert.equal(report.summary.variantCount, report.variants.length);
  } finally {
    await fs.rm(profileDir, { recursive: true, force: true });
  }
});

test("state report generators use shared context and canonical generators declare their output class", async () => {
  const scriptNames = (await fs.readdir(path.join(repoRoot, "scripts")))
    .filter((name) => name.startsWith("generate-") && name.endsWith(".mjs"));

  assert.ok(scriptNames.length >= 16);
  for (const scriptName of scriptNames) {
    const source = await fs.readFile(path.join(repoRoot, "scripts", scriptName), "utf8");
    const usesReportContext = /createReportContext/u.test(source);
    const declaresCanonicalSource =
      /export const GENERATOR_OUTPUT_CLASS = "canonical_source"/u.test(source);
    assert.equal(
      usesReportContext || declaresCanonicalSource,
      true,
      `${scriptName} must use shared report context or declare canonical source output`,
    );
    assert.doesNotMatch(
      source,
      /["']\.meta-kim["'][\s\S]{0,120}["']state["'][\s\S]{0,120}["']default["']/,
      `${scriptName} must not hardcode the default profile state path`,
    );
    if (declaresCanonicalSource) {
      assert.doesNotMatch(
        source,
        /["']\.meta-kim["']/u,
        `${scriptName} canonical source output must not write local profile state`,
      );
    }
  }
});
