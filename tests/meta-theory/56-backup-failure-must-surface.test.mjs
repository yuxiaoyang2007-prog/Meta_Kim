import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..");

function read(rel) {
  return readFileSync(resolve(repoRoot, rel), "utf8");
}

function sliceFromFn(source, fnName, len = 900) {
  const idx = source.indexOf(`function ${fnName}`);
  assert.notEqual(idx, -1, `${fnName} not found`);
  return source.slice(idx, idx + len);
}

test("56 — backupBeforeMerge exists in setup.mjs and surfaces failure", () => {
  const setup = read("setup.mjs");
  assert.match(setup, /function backupBeforeMerge\s*\(/);
  const slice = sliceFromFn(setup, "backupBeforeMerge");
  assert.match(slice, /catch/, "backupBeforeMerge must catch its own errors");
  assert.match(
    slice,
    /warn|console\.(warn|error)/,
    "backupBeforeMerge must warn (or console.warn/error) on failure, never silent",
  );
});

test("56 — backupBeforeForce exists in install-mcp-memory-hooks.mjs and surfaces failure", () => {
  const mcp = read("scripts/install-mcp-memory-hooks.mjs");
  assert.match(mcp, /function backupBeforeForce\s*\(/);
  const slice = sliceFromFn(mcp, "backupBeforeForce");
  assert.match(slice, /catch/, "backupBeforeForce must catch its own errors");
  assert.match(
    slice,
    /warn|console\.(warn|error)/,
    "backupBeforeForce must warn (or console.warn/error) on failure, never silent",
  );
});

test("56 — backup helpers are invoked at write sites (not dead code)", () => {
  const setup = read("setup.mjs");
  const mcp = read("scripts/install-mcp-memory-hooks.mjs");
  const setupCalls = (setup.match(/backupBeforeMerge\s*\(/g) || []).length;
  const mcpCalls = (mcp.match(/backupBeforeForce\s*\(/g) || []).length;
  assert.ok(
    setupCalls >= 2,
    `backupBeforeMerge should have a definition + call sites, found ${setupCalls}`,
  );
  assert.ok(
    mcpCalls >= 2,
    `backupBeforeForce should have a definition + call site, found ${mcpCalls}`,
  );
});
