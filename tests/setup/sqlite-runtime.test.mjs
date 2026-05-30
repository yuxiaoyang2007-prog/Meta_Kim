import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { importDatabaseSync } from "../../scripts/sqlite-runtime.mjs";

describe("sqlite runtime import", () => {
  test("suppresses only the known node:sqlite ExperimentalWarning", async () => {
    const originalEmitWarning = process.emitWarning;
    const emitted = [];
    process.emitWarning = function captureWarning(warning, ...args) {
      emitted.push({ warning, args });
      return undefined;
    };

    try {
      const DatabaseSync = await importDatabaseSync();
      assert.equal(typeof DatabaseSync, "function");
      assert.equal(
        emitted.some((entry) =>
          /SQLite is an experimental feature/i.test(String(entry.warning)),
        ),
        false,
      );
    } finally {
      process.emitWarning = originalEmitWarning;
    }
  });
});
