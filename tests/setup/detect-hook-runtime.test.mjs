/**
 * Tests for detectHookRuntime() — cross-OS runtime detection.
 *
 * The function lives in `canonical/runtime-assets/claude/hooks/enforce-agent-dispatch.mjs`
 * and decides which host (claude / codex / cursor) is invoking the hook so that
 * `deny()` can emit the right payload schema.
 *
 * The hook module performs top-level `await readJsonFromStdin()` and unconditional
 * `process.exit(0)` calls, so it cannot be imported directly inside a Node test
 * worker. Instead we read the canonical file, extract the function definition by
 * regex, and evaluate it in an isolated `new Function(...)` scope wired only to
 * the dependencies it really needs (`process` shim + `path.normalize`). That
 * gives us a pure callable that exercises the *real* logic without triggering
 * any of the hook's side effects.
 *
 * Coverage:
 *   - META_KIM_HOOK_RUNTIME env override (claude / codex / cursor)
 *   - --runtime CLI override projected by hook config
 *   - process.argv[1] path inspection on Windows (backslash, mixed case)
 *   - process.argv[1] path inspection on POSIX (forward slash)
 *   - Forward-slash variant on Windows (Node sometimes preserves verbatim path)
 *   - Fallback to "claude" when no segment matches
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOOK_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "canonical",
  "runtime-assets",
  "claude",
  "hooks",
  "enforce-agent-dispatch.mjs",
);

const hookSource = await readFile(HOOK_PATH, "utf8");

// Pull the function definition out of the canonical hook source. We accept both
// "function detectHookRuntime" and "export function detectHookRuntime" so the
// extraction is resilient to wrapper-export refactors. The body extends from
// the opening brace until the matching closing brace at column 0.
function extractDetectHookRuntimeSource(src) {
  const startMatch = src.match(
    /(?:export\s+)?function\s+detectHookRuntime\s*\([^)]*\)\s*\{/,
  );
  if (!startMatch) {
    throw new Error(
      "Could not locate detectHookRuntime() in canonical hook source.",
    );
  }
  const startIdx = startMatch.index + startMatch[0].length;
  // Walk the source from inside the opening brace to the matching closing
  // brace. We track string contexts so braces inside string and template
  // literals do not perturb the counter. Template literals also support
  // `${...}` substitutions which open a nested code context — we model that
  // with a stack so braces inside a substitution count toward depth, but the
  // closing `}` of the substitution does NOT decrement the outer function
  // depth.
  //
  // Escape handling: inside a string/template, a backslash escapes the very
  // next character (one character only). We model that with an `escaped`
  // boolean rather than a 1-character lookback, which would mishandle `\\"`
  // (two backslashes followed by a real, unescaped quote).
  let depth = 1;
  let i = startIdx;
  let mode = "code"; // "code" | "single" | "double" | "template"
  let escaped = false;
  // Stack of brace contexts: each entry remembers whether we are inside a
  // `${ ... }` substitution of a template literal so the closing `}` returns
  // us to the template instead of decrementing the outer depth.
  const exprStack = []; // each entry: { templateDepth: <depth at time of $\{ open> }
  // Stack of templates we have entered (so nested templates inside ${...} work).
  const templateStack = [];

  while (i < src.length && depth > 0) {
    const ch = src[i];

    if (mode === "single") {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "'") {
        mode = "code";
      }
    } else if (mode === "double") {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        mode = "code";
      }
    } else if (mode === "template") {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "`") {
        templateStack.pop();
        mode = "code";
      } else if (ch === "$" && src[i + 1] === "{") {
        exprStack.push({ depth });
        depth += 1; // count the substitution's opening brace
        mode = "code"; // switch to code mode inside ${...}
        i += 1; // skip the `{`
      }
    } else {
      // mode === "code"
      if (ch === "'") mode = "single";
      else if (ch === '"') mode = "double";
      else if (ch === "`") {
        templateStack.push(true);
        mode = "template";
      } else if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
        // If the closing brace matches the depth at which a ${ was opened,
        // we are leaving the substitution and returning to the template
        // literal that contained it.
        if (
          exprStack.length > 0 &&
          exprStack[exprStack.length - 1].depth === depth
        ) {
          exprStack.pop();
          if (templateStack.length > 0) {
            mode = "template";
          }
        }
      }
    }
    i += 1;
  }
  if (depth !== 0) {
    throw new Error("Failed to balance braces while extracting function body.");
  }
  return src.slice(startMatch.index, i);
}

// Build an isolated callable from the extracted source. We pass a fresh
// `process` shim and `normalize` binding per call so each test controls its
// own platform / argv / env state without polluting the test runner process.
//
// The `normalize` binding is platform-aware because the canonical function
// uses Node's `path.normalize`, which differs between Windows and POSIX. We
// pick `path.win32.normalize` for `platform === "win32"` and
// `path.posix.normalize` for everything else, mirroring how the function
// would behave on a real host of the corresponding platform.
function buildDetectFor({ platform, argv, env }) {
  // Strip a leading `export` keyword if present — new Function() executes in a
  // function-body context where `export` is a syntax error.
  const fnSource = extractDetectHookRuntimeSource(hookSource).replace(
    /^export\s+/,
    "",
  );
  // The function references the bare identifiers `process` and `normalize`,
  // both of which are normally module-scope imports. We inject them via the
  // factory's parameter list so the eval happens in a closed scope.
  const factory = new Function(
    "process",
    "normalize",
    `${fnSource}\nreturn detectHookRuntime;`,
  );
  const processShim = {
    env,
    argv,
    platform,
  };
  const normalizeImpl =
    platform === "win32" ? path.win32.normalize : path.posix.normalize;
  return factory(processShim, normalizeImpl);
}

describe("detectHookRuntime() — META_KIM_HOOK_RUNTIME env override", () => {
  test("returns 'cursor' when META_KIM_HOOK_RUNTIME=cursor", () => {
    const detect = buildDetectFor({
      platform: "linux",
      argv: ["node", "/anywhere/script.mjs"],
      env: { META_KIM_HOOK_RUNTIME: "cursor" },
    });
    assert.equal(detect(), "cursor");
  });

  test("returns 'codex' when META_KIM_HOOK_RUNTIME=codex", () => {
    const detect = buildDetectFor({
      platform: "linux",
      argv: ["node", "/anywhere/script.mjs"],
      env: { META_KIM_HOOK_RUNTIME: "codex" },
    });
    assert.equal(detect(), "codex");
  });

  test("returns 'claude' when META_KIM_HOOK_RUNTIME=claude", () => {
    const detect = buildDetectFor({
      platform: "linux",
      argv: ["node", "/anywhere/script.mjs"],
      env: { META_KIM_HOOK_RUNTIME: "claude" },
    });
    assert.equal(detect(), "claude");
  });

  test("env override is case-insensitive and tolerates surrounding whitespace", () => {
    const detect = buildDetectFor({
      platform: "linux",
      argv: ["node", "/anywhere/script.mjs"],
      env: { META_KIM_HOOK_RUNTIME: "  CURSOR  " },
    });
    assert.equal(detect(), "cursor");
  });

  test("invalid override falls through to path inspection (not throw)", () => {
    const detect = buildDetectFor({
      platform: "linux",
      argv: ["node", "/home/u/proj/.codex/hooks/enforce-agent-dispatch.mjs"],
      env: { META_KIM_HOOK_RUNTIME: "not-a-runtime" },
    });
    assert.equal(detect(), "codex");
  });
});

describe("detectHookRuntime() — process.argv[1] path inspection", () => {
  test("CLI --runtime override beats path fallback", () => {
    const detect = buildDetectFor({
      platform: "linux",
      argv: ["node", "/tmp/enforce-agent-dispatch.mjs", "--runtime", "codex"],
      env: {},
    });
    assert.equal(detect(), "codex");
  });

  test("CLI --meta-kim-hook-runtime=cursor override is accepted", () => {
    const detect = buildDetectFor({
      platform: "linux",
      argv: [
        "node",
        "/tmp/enforce-agent-dispatch.mjs",
        "--meta-kim-hook-runtime=cursor",
      ],
      env: {},
    });
    assert.equal(detect(), "cursor");
  });

  test("Windows backslash argv with .codex segment → 'codex'", () => {
    const detect = buildDetectFor({
      platform: "win32",
      argv: ["node", "C:\\proj\\.codex\\hooks\\enforce-agent-dispatch.mjs"],
      env: {},
    });
    assert.equal(detect(), "codex");
  });

  test("POSIX forward-slash argv with .cursor segment → 'cursor'", () => {
    const detect = buildDetectFor({
      platform: "linux",
      argv: ["node", "/home/user/proj/.cursor/hooks/enforce-agent-dispatch.mjs"],
      env: {},
    });
    assert.equal(detect(), "cursor");
  });

  test("forward-slash variant on Windows with .claude segment → 'claude'", () => {
    const detect = buildDetectFor({
      platform: "win32",
      argv: ["node", "C:/proj/.claude/hooks/enforce-agent-dispatch.mjs"],
      env: {},
    });
    assert.equal(detect(), "claude");
  });

  test("no env, no recognised segment → fallback 'claude'", () => {
    const detect = buildDetectFor({
      platform: "linux",
      argv: ["node", "/opt/tools/random/script.mjs"],
      env: {},
    });
    assert.equal(detect(), "claude");
  });

  test("Windows mixed-case .CODEX segment → 'codex' (case-insensitive)", () => {
    const detect = buildDetectFor({
      platform: "win32",
      argv: ["node", "C:\\Proj\\.CODEX\\hooks\\enforce-agent-dispatch.mjs"],
      env: {},
    });
    assert.equal(detect(), "codex");
  });

  test("Windows backslash argv with .claude segment → 'claude'", () => {
    const detect = buildDetectFor({
      platform: "win32",
      argv: ["node", "C:\\proj\\.claude\\hooks\\enforce-agent-dispatch.mjs"],
      env: {},
    });
    assert.equal(detect(), "claude");
  });

  test("POSIX argv with .codex segment → 'codex'", () => {
    const detect = buildDetectFor({
      platform: "linux",
      argv: ["node", "/srv/dev/.codex/hooks/enforce-agent-dispatch.mjs"],
      env: {},
    });
    assert.equal(detect(), "codex");
  });

  test("empty argv[1] (e.g. -e one-liner) → fallback 'claude'", () => {
    const detect = buildDetectFor({
      platform: "linux",
      argv: ["node", ""],
      env: {},
    });
    assert.equal(detect(), "claude");
  });
});

describe("detectHookRuntime() — env override beats path inspection", () => {
  test("env=cursor wins even when argv path contains .codex", () => {
    const detect = buildDetectFor({
      platform: "linux",
      argv: ["node", "/home/u/proj/.codex/hooks/enforce-agent-dispatch.mjs"],
      env: { META_KIM_HOOK_RUNTIME: "cursor" },
    });
    assert.equal(detect(), "cursor");
  });
});

describe("detectHookRuntime() — canonical hook still exports the symbol", () => {
  test("canonical source defines `export function detectHookRuntime`", () => {
    assert.match(
      hookSource,
      /export\s+function\s+detectHookRuntime\s*\(/,
      "detectHookRuntime must be exported so other modules and tests can rely on it.",
    );
  });
});
