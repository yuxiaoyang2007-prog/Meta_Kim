#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  assertExactRuntimeCapabilityMatrix,
  parseRuntimeCapabilityMatrix,
} from "../mcp/runtime-resource-contract.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const repoRootIndex = args.indexOf("--repo-root");
const repoRoot = path.resolve(
  repoRootIndex >= 0 && args[repoRootIndex + 1]
    ? args[repoRootIndex + 1]
    : path.resolve(scriptDir, "..", ".."),
);
const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value ?? null), "utf8").digest("hex");

function requireRuntimeMatrix(result, expectedMatrix) {
  const textItems = (result?.content ?? []).filter(
    (item) => item?.type === "text" && typeof item.text === "string",
  );
  if (textItems.length !== 1) {
    throw new Error(
      "get_meta_runtime_capabilities must return exactly one text payload",
    );
  }
  let matrix;
  try {
    matrix = JSON.parse(textItems[0].text);
  } catch (error) {
    throw new Error(
      `get_meta_runtime_capabilities returned non-JSON/stub content: ${error.message}`,
    );
  }
  assertExactRuntimeCapabilityMatrix(
    matrix,
    expectedMatrix,
    "get_meta_runtime_capabilities",
  );
  return {
    schemaVersion: matrix.schemaVersion,
    platforms: matrix.platforms.map((entry) => entry.platform),
    capabilityCounts: Object.fromEntries(
      matrix.platforms.map((entry) => [entry.platform, entry.capabilities.length]),
    ),
    semanticMatrixMatched: true,
  };
}

async function main() {
  const sessionId = randomUUID();
  const callId = randomUUID();
  const matrixPath = path.join(repoRoot, "config", "runtime-capability-matrix.json");
  const expectedMatrix = parseRuntimeCapabilityMatrix(
    await fs.readFile(matrixPath, "utf8"),
    matrixPath,
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "scripts", "mcp", "meta-runtime-server.mjs")],
    cwd: repoRoot,
    stderr: "pipe",
  });
  const client = new Client({ name: "meta-kim-clean-room-observer", version: "0.1.0" });
  try {
    await client.connect(transport);
    process.stdout.write(`${JSON.stringify({ phase: "initialize", status: "success", sessionId })}\n`);
    const listed = await client.listTools();
    const toolNames = (listed.tools ?? []).map((tool) => tool.name);
    if (!toolNames.includes("get_meta_runtime_capabilities")) {
      throw new Error("MCP tools/list did not expose get_meta_runtime_capabilities");
    }
    process.stdout.write(`${JSON.stringify({
      phase: "tools/list",
      status: "success",
      sessionId,
      toolNames,
      outputDigest: digest(toolNames),
    })}\n`);
    const argumentsValue = {};
    const result = await client.callTool({
      name: "get_meta_runtime_capabilities",
      arguments: argumentsValue,
    });
    const runtimeMatrix = requireRuntimeMatrix(result, expectedMatrix);
    process.stdout.write(`${JSON.stringify({
      phase: "tools/call",
      status: "success",
      sessionId,
      callId,
      providerId: "meta-kim-runtime:get_meta_runtime_capabilities",
      toolName: "get_meta_runtime_capabilities",
      arguments: argumentsValue,
      inputDigest: digest(argumentsValue),
      outputDigest: digest(result),
      runtimeMatrix,
    })}\n`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exit(1);
});
