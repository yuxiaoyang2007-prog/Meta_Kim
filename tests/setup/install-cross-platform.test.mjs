import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { pythonCandidates } from "../../scripts/graphify-runtime.mjs";
import {
  findskillPackSubdirForPlatform,
  resolveManifestSkillSubdir,
  shouldUseCliShell,
} from "../../scripts/install-platform-config.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const skillsManifest = JSON.parse(
  readFileSync(path.join(repoRoot, "config", "skills.json"), "utf8"),
);
const findskillSkill = skillsManifest.skills.find((skill) => skill.id === "findskill");
const planningWithFilesSkill = skillsManifest.skills.find(
  (skill) => skill.id === "planning-with-files",
);

describe("install platform config", () => {
  test("quick deploy copies root runtime guide files", () => {
    const source = readFileSync(path.join(repoRoot, "setup.mjs"), "utf8");
    const match = source.match(
      /function deployPlatformFiles\(platformId, targetDir\) \{[\s\S]*?\n\}/,
    );
    assert.ok(match, "deployPlatformFiles body not found");
    const body = match[0];

    assert.match(body, /copyIfExists\("CLAUDE\.md", "CLAUDE\.md"\)/);
    assert.match(body, /copyIfExists\("AGENTS\.md", "AGENTS\.md"\)/);
    assert.match(body, /platformId === "claude" \|\| platformId === "all"/);
    assert.match(body, /platformId === "openclaw"/);
    assert.match(body, /platformId === "codex"/);
    assert.match(body, /platformId === "cursor"/);
    assert.equal(
      body.match(/copyIfExists\("AGENTS\.md", "AGENTS\.md"\)/g)?.length,
      1,
    );
  });

  test("findskill uses windows subdir on Windows", () => {
    assert.equal(findskillPackSubdirForPlatform("win32"), "windows");
    assert.equal(resolveManifestSkillSubdir(findskillSkill, "win32"), "windows");
  });

  test("findskill uses original subdir on macOS and Linux", () => {
    assert.equal(findskillPackSubdirForPlatform("darwin"), "original");
    assert.equal(findskillPackSubdirForPlatform("linux"), "original");
    assert.equal(resolveManifestSkillSubdir(findskillSkill, "darwin"), "original");
    assert.equal(resolveManifestSkillSubdir(findskillSkill, "linux"), "original");
  });

  test("explicit subdir is stable across platforms", () => {
    assert.equal(
      resolveManifestSkillSubdir(planningWithFilesSkill, "win32"),
      "skills/planning-with-files",
    );
    assert.equal(
      resolveManifestSkillSubdir(planningWithFilesSkill, "darwin"),
      "skills/planning-with-files",
    );
    assert.equal(
      resolveManifestSkillSubdir(planningWithFilesSkill, "linux"),
      "skills/planning-with-files",
    );
  });

  test("planning-with-files uses skills/ as canonical + pluginHookCompat for hooks", () => {
    assert.equal(planningWithFilesSkill.pluginHookCompat, true);
    assert.equal(planningWithFilesSkill.installRoot, undefined);
  });

  test("legacy setup fallback only applies when requested", () => {
    const plainSkill = { id: "plain-skill" };
    assert.equal(resolveManifestSkillSubdir(plainSkill, "linux"), undefined);
    assert.equal(
      resolveManifestSkillSubdir(plainSkill, "linux", {
        fallbackToFindskillPack: true,
      }),
      "original",
    );
    assert.equal(
      resolveManifestSkillSubdir(plainSkill, "win32", {
        fallbackToFindskillPack: true,
      }),
      "windows",
    );
  });

  test("Claude CLI shell bridge is enabled only on Windows", () => {
    assert.equal(shouldUseCliShell("win32"), true);
    assert.equal(shouldUseCliShell("darwin"), false);
    assert.equal(shouldUseCliShell("linux"), false);
  });

  test("Codex planning hooks use Node runner on every platform", () => {
    const source = readFileSync(
      path.join(repoRoot, "scripts", "install-global-skills-all-runtimes.mjs"),
      "utf8",
    );
    const commandFunction = source.match(
      /function codexPlanningHookCommand[\s\S]*?\n}\n/,
    )?.[0];

    assert.ok(commandFunction);
    assert.match(commandFunction, /codex_hook_runner\.mjs/);
    assert.match(commandFunction, /process\.execPath/);
    assert.match(commandFunction, /shellToken/);
    assert.match(commandFunction, /return `\$\{shellToken\(nodePath\)\}/);
    assert.doesNotMatch(commandFunction, /os\.platform\(\) === "win32"/);
    assert.doesNotMatch(commandFunction, /return `node |return `"\$\{nodePath\}"|python3|2>\/dev\/null|\|\| true/);
  });

  test("Codex planning hook adapter counts level-2 and level-3 phases", () => {
    const source = readFileSync(
      path.join(repoRoot, "scripts", "install-global-skills-all-runtimes.mjs"),
      "utf8",
    );
    const adapterFunction = source.match(
      /function buildCodexPlanningHookAdapterPy[\s\S]*?\n}\n/,
    )?.[0];

    assert.ok(adapterFunction);
    assert.match(adapterFunction, /"import re"/);
    assert.match(adapterFunction, /#\{2,3\}\\\\s\+Phase\\\\b/);
    assert.doesNotMatch(
      adapterFunction,
      /total = sum\(1 for line in lines if "### Phase" in line\)/,
    );
  });

  test("planning-with-files phase counter patch covers shell and PowerShell hooks", () => {
    const source = readFileSync(
      path.join(repoRoot, "scripts", "install-global-skills-all-runtimes.mjs"),
      "utf8",
    );
    const patchFunction = source.match(
      /async function patchPlanningWithFilesPhaseCounters[\s\S]*?\n}\n/,
    )?.[0];

    assert.ok(patchFunction);
    assert.match(patchFunction, /runtimeHome, "hooks", "stop\.sh"/);
    assert.match(patchFunction, /runtimeHome, "hooks", "stop\.ps1"/);
    assert.match(patchFunction, /"check-complete\.sh"/);
    assert.match(patchFunction, /"check-complete\.ps1"/);
    assert.match(patchFunction, /#\{2,3\}\[\[:space:\]\]\+Phase\\\\b/);
    assert.match(patchFunction, /\(\?m\)\^#\{2,3\}\\\\s\+Phase\\\\b/);
  });
});

describe("python launcher selection", () => {
  test("Windows prefers py -3 before python/python3", () => {
    assert.deepEqual(pythonCandidates("win32"), [
      { command: "py", args: ["-3"] },
      { command: "python", args: [] },
      { command: "python3", args: [] },
    ]);
  });

  test("macOS and Linux prefer python3 first", () => {
    const expected = [
      { command: "python3", args: [] },
      { command: "python", args: [] },
    ];
    assert.deepEqual(pythonCandidates("darwin"), expected);
    assert.deepEqual(pythonCandidates("linux"), expected);
  });
});
