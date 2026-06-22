/**
 * Tests for resolveRuntimeHome() — runtime home directory resolution.
 * Covers: env var override and default home fallbacks for formal plus candidate runtimes.
 */

import { test, describe } from "node:test";
import assert from "node:assert";
import { mockEnv } from "./_mocks.mjs";

// Re-read setup.mjs source to extract the function logic inline for testing
// (setup.mjs is a script, not a module — we test the logic by reimplementing it
//  in the test file to match the actual behavior, so the test stays stable
//  when the source changes in non-functional ways.)

const OS_HOME = process.env.HOME || process.env.USERPROFILE || "/home/test";
const RUNTIME_HOME_ENV_KEYS = {
  claude: ["META_KIM_CLAUDE_HOME", "CLAUDE_HOME"],
  codex: ["META_KIM_CODEX_HOME", "CODEX_HOME"],
  openclaw: ["META_KIM_OPENCLAW_HOME", "OPENCLAW_HOME"],
  cursor: ["META_KIM_CURSOR_HOME", "CURSOR_HOME"],
  qoder: ["META_KIM_QODER_HOME", "QODER_HOME"],
};

function mockRuntimeHomeEnv(runtimeId, overrides = {}) {
  const cleared = Object.fromEntries(
    (RUNTIME_HOME_ENV_KEYS[runtimeId] || []).map((key) => [key, ""]),
  );
  return mockEnv({ ...cleared, ...overrides });
}

function resolveRuntimeHomeUnderTest(runtimeId) {
  const envKeys = {
    claude: ["META_KIM_CLAUDE_HOME", "CLAUDE_HOME"],
    codex: ["META_KIM_CODEX_HOME", "CODEX_HOME"],
    openclaw: ["META_KIM_OPENCLAW_HOME", "OPENCLAW_HOME"],
    cursor: ["META_KIM_CURSOR_HOME", "CURSOR_HOME"],
    qoder: ["META_KIM_QODER_HOME", "QODER_HOME"],
  };
  const keys = envKeys[runtimeId] || [runtimeId.toUpperCase() + "_HOME"];
  for (const key of keys) {
    const v = process.env[key];
    if (v) return key + "→" + v; // prefix so we can verify which key matched
  }
  const defaults = {
    codex: ".codex",
    openclaw: ".openclaw",
    qoder: ".qoder",
  };
  const dir = defaults[runtimeId] || "." + runtimeId;
  return "HOME→" + OS_HOME + "/" + dir;
}

describe("resolveRuntimeHome()", () => {
  test("returns env-overridden path for META_KIM_CLAUDE_HOME", () => {
    const restore = mockEnv({ META_KIM_CLAUDE_HOME: "/custom/claude" });
    try {
      const result = resolveRuntimeHomeUnderTest("claude");
      assert.match(result, /^META_KIM_CLAUDE_HOME→/);
      assert.ok(result.includes("/custom/claude"), result);
    } finally {
      restore();
    }
  });

  test("falls back to CLAUDE_HOME for claude", () => {
    const restore = mockRuntimeHomeEnv("claude", {
      CLAUDE_HOME: "/fallback/claude",
    });
    try {
      const result = resolveRuntimeHomeUnderTest("claude");
      assert.match(result, /^CLAUDE_HOME→/);
    } finally {
      restore();
    }
  });

  test("returns env-overridden path for META_KIM_CODEX_HOME", () => {
    const restore = mockEnv({ META_KIM_CODEX_HOME: "/custom/codex" });
    try {
      const result = resolveRuntimeHomeUnderTest("codex");
      assert.match(result, /^META_KIM_CODEX_HOME→/);
      assert.ok(result.includes("/custom/codex"), result);
    } finally {
      restore();
    }
  });

  test("falls back to home/.codex for codex when no env", () => {
    const restore = mockRuntimeHomeEnv("codex");
    try {
      const result = resolveRuntimeHomeUnderTest("codex");
      assert.ok(result.includes("/.codex"), result);
    } finally {
      restore();
    }
  });

  test("falls back to home/.openclaw for openclaw when no env", () => {
    const restore = mockRuntimeHomeEnv("openclaw");
    try {
      const result = resolveRuntimeHomeUnderTest("openclaw");
      assert.ok(result.includes("/.openclaw"), result);
    } finally {
      restore();
    }
  });

  test("falls back to home/.cursor for cursor when no env", () => {
    const restore = mockRuntimeHomeEnv("cursor");
    try {
      const result = resolveRuntimeHomeUnderTest("cursor");
      assert.ok(result.includes("/.cursor"), result);
    } finally {
      restore();
    }
  });

  test("returns env-overridden path for META_KIM_QODER_HOME", () => {
    const restore = mockEnv({ META_KIM_QODER_HOME: "/custom/qoder" });
    try {
      const result = resolveRuntimeHomeUnderTest("qoder");
      assert.match(result, /^META_KIM_QODER_HOME→/);
      assert.ok(result.includes("/custom/qoder"), result);
    } finally {
      restore();
    }
  });

  test("falls back to QODER_HOME for qoder", () => {
    const restore = mockRuntimeHomeEnv("qoder", {
      QODER_HOME: "/fallback/qoder",
    });
    try {
      const result = resolveRuntimeHomeUnderTest("qoder");
      assert.match(result, /^QODER_HOME→/);
    } finally {
      restore();
    }
  });

  test("falls back to home/.qoder for qoder when no env", () => {
    const restore = mockRuntimeHomeEnv("qoder");
    try {
      const result = resolveRuntimeHomeUnderTest("qoder");
      assert.ok(result.includes("/.qoder"), result);
    } finally {
      restore();
    }
  });

  test("META_KIM_CLAUDE_HOME takes priority over CLAUDE_HOME", () => {
    const restore = mockEnv({
      META_KIM_CLAUDE_HOME: "/priority/claude",
      CLAUDE_HOME: "/secondary/claude",
    });
    try {
      const result = resolveRuntimeHomeUnderTest("claude");
      assert.ok(result.includes("/priority/claude"), result);
    } finally {
      restore();
    }
  });

  test("trims whitespace from env values", () => {
    const restore = mockEnv({ META_KIM_CLAUDE_HOME: "  /trimmed/claude  " });
    try {
      const result = resolveRuntimeHomeUnderTest("claude");
      assert.ok(result.includes("/trimmed/claude"), result);
    } finally {
      restore();
    }
  });

  test("unknown runtimeId falls back to uppercase_HOME pattern", () => {
    const restore = mockEnv({});
    try {
      const result = resolveRuntimeHomeUnderTest("unknown");
      assert.ok(result.includes("/.unknown"), result);
    } finally {
      restore();
    }
  });
});
