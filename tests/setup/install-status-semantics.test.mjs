import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  INSTALL_STATUS_CLASSES,
  INSTALL_STATUS_MESSAGE_CLASSES,
  installStatusClassForMessageKey,
  installStatusNextAction,
} from "../../scripts/meta-kim-i18n.mjs";

describe("install/update status semantics", () => {
  test("status classes stay restricted to success, skipped, manual, failed", () => {
    assert.deepEqual(INSTALL_STATUS_CLASSES, [
      "success",
      "skipped",
      "manual",
      "failed",
    ]);
    for (const statusClass of INSTALL_STATUS_CLASSES) {
      assert.equal(typeof installStatusNextAction(statusClass), "string");
    }
  });

  test("user-visible install messages map to one semantic class", () => {
    for (const [messageKey, statusClass] of Object.entries(INSTALL_STATUS_MESSAGE_CLASSES)) {
      assert.ok(
        INSTALL_STATUS_CLASSES.includes(statusClass),
        `${messageKey} maps to unknown status class ${statusClass}`,
      );
    }

    assert.equal(installStatusClassForMessageKey("okUpdated"), "success");
    assert.equal(installStatusClassForMessageKey("skipAlreadyInstalled"), "skipped");
    assert.equal(installStatusClassForMessageKey("cursorNativePluginManualStep"), "manual");
    assert.equal(installStatusClassForMessageKey("warnPluginFailed"), "failed");
    assert.equal(installStatusClassForMessageKey("doesNotExist"), null);
  });
});
