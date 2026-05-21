import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { REPO_ROOT } from "../meta-theory/_helpers.mjs";

const execFileAsync = promisify(execFile);

describe("postinstall-check.mjs", () => {
  test("runs under ES module scope without require()", async () => {
    const { stderr } = await execFileAsync(
      "node",
      ["scripts/postinstall-check.mjs"],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          META_KIM_LANG: "en",
          META_KIM_SILENT: "",
          CI: "",
        },
      },
    );

    assert.doesNotMatch(stderr, /ReferenceError: require is not defined/);
  });
});
