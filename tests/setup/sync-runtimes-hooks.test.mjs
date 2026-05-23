import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

function runSyncCheck(targets) {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/sync-runtimes.mjs",
      "--check",
      "--json",
      "--targets",
      targets,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

describe("runtime hook sync contract", () => {
  test("Claude sync plans shared hook i18n dependency", () => {
    const output = runSyncCheck("claude").replace(/\\/g, "/");
    const hookI18nPath = join(repoRoot, ".claude", "hooks", "hook-i18n.mjs");
    assert.ok(
      output.includes(".claude/hooks/hook-i18n.mjs") ||
        existsSync(hookI18nPath),
      "expected Claude hook sync to include or already generate shared hook-i18n.mjs",
    );
  });

  test("Claude sync includes the meta-theory spine activation hook", () => {
    const source = readFileSync(
      join(repoRoot, "scripts/sync-runtimes.mjs"),
      "utf8",
    );

    assert.match(
      source,
      /const sharedClaudeHookDependencies = \[[\s\S]*"activate-meta-theory-spine\.mjs"/,
    );
    assert.equal(
      existsSync(
        join(
          repoRoot,
          "canonical/runtime-assets/shared/hooks/activate-meta-theory-spine.mjs",
        ),
      ),
      true,
    );
  });

  test("shared hook backup is not a canonical runtime asset", () => {
    assert.equal(
      existsSync(
        join(
          repoRoot,
          "canonical/runtime-assets/shared/hooks/skip-reminder.mjs.bak",
        ),
      ),
      false,
    );
  });
});
