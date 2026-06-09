import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const catalog = JSON.parse(
  readFileSync(
    path.join(repoRoot, "config", "runtime-compatibility-catalog.json"),
    "utf8",
  ),
);
const syncManifest = JSON.parse(
  readFileSync(path.join(repoRoot, "config", "sync.json"), "utf8"),
);
const skillsManifest = JSON.parse(
  readFileSync(path.join(repoRoot, "config", "skills.json"), "utf8"),
);

function sorted(values) {
  return [...values].sort();
}

describe("runtime compatibility catalog", () => {
  test("formal runtime projection tier matches sync supportedTargets exactly", () => {
    const projectionIds = catalog.products
      .filter((product) => product.tier === "runtime_projection")
      .map((product) => product.id);

    assert.deepEqual(sorted(projectionIds), sorted(syncManifest.supportedTargets));
  });

  test("non-projection products cannot claim sync/profile/layout support", () => {
    const supportedTargets = new Set(syncManifest.supportedTargets);
    const defaultTargets = new Set(syncManifest.defaultTargets);

    for (const product of catalog.products) {
      if (product.tier === "runtime_projection") continue;

      assert.equal(supportedTargets.has(product.id), false, product.id);
      assert.equal(defaultTargets.has(product.id), false, product.id);
      assert.deepEqual(
        product.formalProjection,
        {
          inSyncManifest: false,
          hasRuntimeProfile: false,
          hasProjectionLayout: false,
          isDefaultTarget: false,
        },
        product.id,
      );
    }
  });

  test("ECC install targets are represented without becoming sync projections", () => {
    const ecc = skillsManifest.skills.find((skill) => skill.id === "ecc");
    const byId = new Map(catalog.products.map((product) => [product.id, product]));

    assert.ok(ecc);
    for (const target of ecc.targets) {
      const product = byId.get(target);
      assert.ok(product, `missing catalog product for ${target}`);
      assert.equal(product.dependencyInstall.ecc.support, "native", target);
    }
  });

  test("Qoder stays a candidate probe with docs evidence and no ECC target", () => {
    const qoder = catalog.products.find((product) => product.id === "qoder");
    const ecc = skillsManifest.skills.find((skill) => skill.id === "ecc");

    assert.ok(qoder);
    assert.equal(qoder.tier, "candidate_probe");
    assert.equal(qoder.formalProjection.inSyncManifest, false);
    assert.equal(qoder.dependencyInstall.ecc.support, "not_supported");
    assert.equal(qoder.genericCompatibility.status, "verified_current");
    assert.equal(syncManifest.supportedTargets.includes("qoder"), false);
    assert.equal(ecc.targets.includes("qoder"), false);
    assert.ok(qoder.evidence.some((entry) => entry.ref.includes("/issues/7")));
    assert.ok(
      qoder.evidence.filter((entry) => entry.type === "official_docs").length >= 4,
    );
  });

  test("formal projection wording preserves support and self-test boundaries", () => {
    const byId = new Map(catalog.products.map((product) => [product.id, product]));
    const claude = byId.get("claude");
    const codex = byId.get("codex");
    const openclaw = byId.get("openclaw");
    const cursor = byId.get("cursor");

    assert.equal(claude.genericCompatibility.status, "verified_current");
    assert.equal(codex.genericCompatibility.status, "verified_current");
    assert.equal(openclaw.genericCompatibility.status, "verified_current");
    assert.equal(cursor.genericCompatibility.status, "verified_current");
    assert.match(openclaw.nextAction, /strict OpenClaw self-test evidence/i);
    assert.match(cursor.nextAction, /strict Cursor self-test evidence/i);
    assert.match(openclaw.nextAction, /passes review/i);
    assert.match(cursor.nextAction, /passes review/i);
    assert.doesNotMatch(openclaw.nextAction, /before merge/i);
    assert.doesNotMatch(cursor.nextAction, /before merge/i);
    assert.doesNotMatch(openclaw.decision, /unsupported|not supported|partial/i);
    assert.doesNotMatch(cursor.decision, /unsupported|not supported|partial|light/i);
  });
});
