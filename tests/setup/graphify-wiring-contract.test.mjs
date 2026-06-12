import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function writeFakeExecutable(dir, name, source) {
  const scriptPath = path.join(dir, `${name}.mjs`);
  writeFileSync(scriptPath, source);

  if (process.platform === "win32") {
    const cmdPath = path.join(dir, `${name}.cmd`);
    writeFileSync(cmdPath, `@echo off\r\nnode "%~dp0${name}.mjs" %*\r\n`);
    return cmdPath;
  }

  const binPath = path.join(dir, name);
  writeFileSync(binPath, `#!/usr/bin/env node\nimport "./${name}.mjs";\n`);
  chmodSync(binPath, 0o755);
  return binPath;
}

describe("graphify idempotent wiring (contract)", () => {
  test("graphify-cli.mjs invokes hook install after claude install", () => {
    const src = readFileSync(
      path.join(root, "scripts/graphify-cli.mjs"),
      "utf8",
    );
    const claudeIdx = src.indexOf('["-m", "graphify", "claude", "install"]');
    const hookIdx = src.indexOf('["-m", "graphify", "hook", "install"]');
    assert.notEqual(claudeIdx, -1);
    assert.notEqual(hookIdx, -1);
    assert.ok(hookIdx > claudeIdx, "hook install must follow claude install");
  });

  test("graphify-cli.mjs has a rebuild command that uses graphify update", () => {
    const src = readFileSync(
      path.join(root, "scripts/graphify-cli.mjs"),
      "utf8",
    );

    assert.match(src, /function runRebuild\(\)/);
    assert.match(src, /spawnSync\("graphify", \["update", "\."\]/);
    assert.match(src, /\["-m", "graphify", "update", "\."\]/);
    assert.match(src, /case "rebuild":/);
  });

  test("graphify-cli.mjs stamps freshness metadata after successful rebuild", () => {
    const src = readFileSync(
      path.join(root, "scripts/graphify-cli.mjs"),
      "utf8",
    );
    const rebuildIdx = src.indexOf("function runRebuild()");
    assert.notEqual(rebuildIdx, -1);
    const rebuildBody = src.slice(rebuildIdx, rebuildIdx + 1200);

    assert.match(src, /function stampGraphFreshness\(/);
    assert.match(src, /graph\.built_at_commit = currentHead/);
    assert.ok(src.includes("Built from commit:\\s*`?([0-9a-f]{7,40})`?"));
    assert.match(rebuildBody, /stampGraphFreshness\(\)/);
  });

  test("package exposes a cross-platform graphify rebuild script", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8"),
    );

    assert.equal(
      pkg.scripts["meta:graphify:rebuild"],
      "node scripts/graphify-cli.mjs rebuild",
    );
  });

  test("AGENTS uses the cross-platform graphify rebuild script", () => {
    const src = readFileSync(path.join(root, "AGENTS.md"), "utf8");

    assert.match(src, /npm run meta:graphify:rebuild/);
    assert.doesNotMatch(src, /python3 -c "from graphify\.watch/);
  });

  test("setup.mjs installPythonTools wires graphify for all activeTargets", () => {
    const lines = readFileSync(path.join(root, "setup.mjs"), "utf8").split(
      /\r?\n/,
    );
    const start = lines.findIndex((l) =>
      l.includes("async function installPythonTools("),
    );
    const end = lines.findIndex(
      (l, i) => i > start && l.startsWith("// ── Step 4.6:"),
    );
    assert.ok(start !== -1 && end !== -1, "installPythonTools body not found");
    const body = lines.slice(start, end).join("\n");
    assert.match(body, /\["-m", "graphify", "hook", "install"\]/);
    assert.match(body, /for \(const target of expandGraphifyTargets\(activeTargets\)\)/);
    assert.match(
      body,
      /\["-m", "graphify", "[a-z]+", "install"\]/,
      "per-platform graphify install present",
    );
    assert.match(
      body,
      /\["-m", "graphify", "update", "\."\]/,
      "install should generate the local graph once after wiring graphify",
    );
    // pip install failure must NOT return early (skill install still needs to run)
    const afterPip = body.split(/pip install.*graphifyy.*\]/s)[1] || "";
    assert.doesNotMatch(
      afterPip.slice(0, 120),
      /^\s*return;/m,
      "no early return right after already-installed ok()",
    );
  });

  test("setup.mjs installPythonTools can wire graphify in a final project directory", () => {
    const src = readFileSync(path.join(root, "setup.mjs"), "utf8");

    assert.match(
      src,
      /async function installPythonTools\(\s*activeTargets,\s*inUpdateMode = false,\s*targetDir = PROJECT_DIR,\s*\)/,
    );
    assert.match(src, /const graphifyDir = resolve\(targetDir\)/);
    assert.match(src, /join\(graphifyDir, "\.git"\)/);
    assert.match(src, /guideAlreadyHasGraphifySection\(platform, graphifyDir\)/);
    assert.match(
      src,
      /runPythonModule\(\s*python,\s*\["-m", "graphify", "hook", "install"\],[\s\S]*?\{ cwd: graphifyDir, stdio: "pipe" \}/,
    );
    assert.match(
      src,
      /runPythonModule\(\s*python,\s*\["-m", "graphify", platform, "install"\],[\s\S]*?\{ cwd: graphifyDir, stdio: "pipe" \}/,
    );
    assert.match(
      src,
      /runPythonModule\(\s*python,\s*\["-m", "graphify", "update", "\."\],[\s\S]*?\{ cwd: graphifyDir, stdio: "pipe" \}/,
    );
  });

  test("setup deploy export writes a copy-ready graphify bootstrap", () => {
    const src = readFileSync(path.join(root, "setup.mjs"), "utf8");
    const start = src.indexOf("async function copyToDeployDir(");
    const end = src.indexOf("async function runQuickDeploy()", start);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    const body = src.slice(start, end);

    assert.match(src, /const POST_COPY_BOOTSTRAP_FILENAME = "meta-kim-post-copy\.mjs"/);
    assert.match(body, /writePostCopyBootstrap\(targetDir, activeTargets\)/);
    assert.match(body, /printPostCopyBootstrapHint\(\)/);
    assert.doesNotMatch(body, /installGraphify/);
    assert.doesNotMatch(body, /installPythonTools\(activeTargets, false, targetDir\)/);
    assert.ok(
      body.indexOf("deployPlatformFiles(platformId, targetDir)") <
        body.indexOf("writePostCopyBootstrap(targetDir, activeTargets)"),
      "the bootstrap must be written after runtime files are copied",
    );
  });

  test("install and update deploy exports do not treat the staging directory as the final graphify root", () => {
    const src = readFileSync(path.join(root, "setup.mjs"), "utf8");
    const installStart = src.indexOf("async function runInstall()");
    const updateStart = src.indexOf("async function runUpdate()");
    const checkStart = src.indexOf("async function runCheck()", updateStart);
    assert.notEqual(installStart, -1);
    assert.notEqual(updateStart, -1);
    assert.notEqual(checkStart, -1);
    const installBody = src.slice(installStart, updateStart);
    const updateBody = src.slice(updateStart, checkStart);

    for (const body of [installBody, updateBody]) {
      assert.doesNotMatch(body, /pythonToolsEnabled/);
      assert.doesNotMatch(body, /installGraphify/);
      assert.match(body, /copyToDeployDirs\(activeTargets, deployDirs\)/);
    }
  });

  test("quick deploy writes a portable post-copy bootstrap after copying platform files", () => {
    const src = readFileSync(path.join(root, "setup.mjs"), "utf8");
    const start = src.indexOf("async function runQuickDeploy()");
    const end = src.indexOf("// ── Install scope selection", start);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    const body = src.slice(start, end);

    assert.match(body, /writePostCopyBootstrap\(targetDir, \[platformId\]\)/);
    assert.match(body, /printPostCopyBootstrapHint\(\)/);
    assert.doesNotMatch(body, /installPythonTools\([\s\S]*?targetDir/);
    assert.ok(
      body.indexOf("deployPlatformFiles(platformId, targetDir)") <
        body.indexOf("writePostCopyBootstrap(targetDir, [platformId])"),
      "quick deploy must create the bootstrap after target runtime files are copied",
    );
  });

  test("post-copy bootstrap initializes graphify from the copied project root", () => {
    const src = readFileSync(path.join(root, "setup.mjs"), "utf8");
    const start = src.indexOf("function buildPostCopyBootstrapScript(");
    const end = src.indexOf("function writePostCopyBootstrap(", start);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    const body = src.slice(start, end);

    assert.match(body, /fileURLToPath\(import\.meta\.url\)/);
    assert.match(body, /const scriptPath = fileURLToPath\(import\.meta\.url\)/);
    assert.match(body, /const rootDir = dirname\(scriptPath\)/);
    assert.match(body, /\["-m", "pip", "show", "graphifyy"\]/);
    assert.match(body, /\["-m", "pip", "install", "graphifyy"\]/);
    assert.match(body, /\["-m", "graphify", "hook", "install"\]/);
    assert.match(body, /\["-m", "graphify", platform, "install"\]/);
    assert.match(body, /\["-m", "graphify", "update", "\."\]/);
    assert.match(body, /homebrewPythonCandidates/);
    assert.match(body, /\/opt\/homebrew/);
    assert.match(body, /\/home\/linuxbrew\/\.linuxbrew/);
    assert.match(body, /process\.argv\.includes\("--auto"\)/);
    assert.match(body, /process\.argv\.includes\("--auto-worker"\)/);
    assert.match(body, /post-copy-init\.json/);
    assert.match(body, /spawn\(process\.execPath, \[scriptPath, "--auto-worker"\]/);
    assert.match(body, /detached: true/);
    assert.match(body, /failedRetryMs/);
    assert.doesNotMatch(body, /PROJECT_DIR/);
    assert.doesNotMatch(body, /D:[\\/]/);
    assert.doesNotMatch(body, /Meta_Kim[\\/]/);
  });

  test("meta-theory activation hook starts post-copy auto-init without blocking startup", () => {
    const src = readFileSync(
      path.join(root, "canonical/runtime-assets/shared/hooks/activate-meta-theory-spine.mjs"),
      "utf8",
    );

    assert.match(src, /meta-kim-post-copy\.mjs/);
    assert.match(src, /spawnSync\(process\.execPath, \[scriptPath, "--auto"\]/);
    assert.match(src, /timeout: 4000/);
    assert.match(src, /stdio: "ignore"/);
    assert.match(src, /META_KIM_POST_COPY_AUTO === "off"/);
    assert.match(src, /catch \{\s*\/\/ Post-copy auto-init is opportunistic/s);
  });

  test("setup.mjs skips guide-mutating graphify platform install when guide section exists", () => {
    const src = readFileSync(path.join(root, "setup.mjs"), "utf8");

    assert.match(src, /const GRAPHIFY_GUIDE_TARGETS = \{/);
    assert.match(
      src,
      /function guideAlreadyHasGraphifySection\(platform, baseDir = PROJECT_DIR\)/,
    );
    assert.match(src, /\^##\\s\+graphify\\b\/im/);
    assert.match(src, /if \(guideAlreadyHasGraphifySection\(platform, graphifyDir\)\)/);
    assert.match(src, /continue;/);
  });

  test("install uses scoped validation and release validation keeps graphify check", () => {
    const setupSrc = readFileSync(path.join(root, "setup.mjs"), "utf8");
    const pkg = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8"),
    );

    assert.match(
      setupSrc,
      /"scripts\/validate-project\.mjs"[\s\S]*\["--context", "install"\]/,
    );
    assert.match(pkg.scripts["meta:verify:all"], /meta:graphify:check/);
  });

  test("graphify-out remains a local generated artifact, not a package file", () => {
    const pkg = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8"),
    );
    const gitignore = readFileSync(path.join(root, ".gitignore"), "utf8");

    assert.doesNotMatch((pkg.files ?? []).join("\n"), /graphify-out/);
    assert.match(gitignore, /^graphify-out\/$/m);
  });

  test("install-global-skills-all-runtimes.mjs calls wiring when pip skip", () => {
    const src = readFileSync(
      path.join(root, "scripts/install-global-skills-all-runtimes.mjs"),
      "utf8",
    );
    const idx = src.indexOf("if (pipShow.status === 0)");
    assert.notEqual(idx, -1);
    const branch = src.slice(idx, idx + 600);
    assert.match(branch, /ensureGraphifyWiring\(\)/);
  });

  test("install-global-skills-all-runtimes.mjs does not let graphify rewrite existing Claude guide wiring", () => {
    const src = readFileSync(
      path.join(root, "scripts/install-global-skills-all-runtimes.mjs"),
      "utf8",
    );
    const idx = src.indexOf("const ensureGraphifyWiring = () =>");
    assert.notEqual(idx, -1);
    const wiring = src.slice(idx, idx + 1000);

    assert.match(src, /function guideAlreadyHasGraphifySection\(platform\)/);
    assert.match(src, /\^##\\s\+graphify\\b\/im/);
    assert.match(wiring, /guideAlreadyHasGraphifySection\("claude"\)/);
    assert.match(wiring, /graphifyInstallSkippedGuideExists\("claude"\)/);
    assert.match(wiring, /\["-m", "graphify", "hook", "install"\]/);
  });

  test("canonical subagent-context mentions GRAPH_REPORT.md", () => {
    const src = readFileSync(
      path.join(
        root,
        "canonical/runtime-assets/claude/hooks/subagent-context.mjs",
      ),
      "utf8",
    );
    assert.match(src, /GRAPH_REPORT\.md/);
  });

  test("graphify check fails when GRAPH_REPORT.md was built from an older HEAD", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "meta-kim-graphify-"));
    const bin = path.join(tmp, "bin");
    const repo = path.join(tmp, "repo");
    mkdirSync(bin);
    mkdirSync(path.join(repo, "graphify-out"), { recursive: true });

    const fakePython = `
const args = process.argv.slice(2).filter((arg) => arg !== "-3");
if (args.includes("--version")) {
  console.log("Python 3.12.0");
  process.exit(0);
}
if (args.join(" ") === "-m pip --version") {
  console.log("pip 24.0");
  process.exit(0);
}
if (args.join(" ") === "-m pip show graphifyy") {
  console.log("Name: graphifyy\\nVersion: 1.2.3");
  process.exit(0);
}
process.exit(1);
`;
    for (const name of ["py", "python", "python3"]) {
      writeFakeExecutable(bin, name, fakePython);
    }
    for (const args of [
      ["init"],
      ["config", "user.email", "test@example.invalid"],
      ["config", "user.name", "Test User"],
    ]) {
      const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
    }
    writeFileSync(path.join(repo, "tracked.txt"), "fresh head\n");
    for (const args of [
      ["add", "tracked.txt"],
      ["commit", "-m", "seed"],
    ]) {
      const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
    }

    const head = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: repo,
      encoding: "utf8",
    }).stdout.trim();
    assert.notEqual(
      head,
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "test fixture must use a stale graph commit",
    );

    writeFileSync(
      path.join(repo, "graphify-out", "GRAPH_REPORT.md"),
      "# Graph Report\n\n## Graph Freshness\n- Built from commit: `aaaaaaaa`\n",
    );
    writeFileSync(
      path.join(repo, "graphify-out", "graph.json"),
      JSON.stringify({
        nodes: [{ id: "n1", label: "n1" }],
        links: [{ source: "n1", target: "n1" }],
        built_at_commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    );

    try {
      const result = spawnSync(
        process.execPath,
        [path.join(root, "scripts", "graphify-cli.mjs"), "check"],
        {
          cwd: repo,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
            Path: `${bin}${path.delimiter}${process.env.Path ?? ""}`,
          },
        },
      );

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /GRAPH_REPORT\.md is stale/);
      assert.match(result.stderr, /npm run meta:graphify:rebuild/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
