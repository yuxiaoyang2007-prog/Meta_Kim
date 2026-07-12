import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MemoryEndpointConfigError,
  memoryServiceEnv,
  memoryServerHttpArgs,
  resolveMemoryEndpoint,
} from "../../scripts/memory-endpoint.mjs";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("MCP Memory endpoint policy", () => {
  test("default endpoint is local HTTP port 8000", () => {
    const endpoint = resolveMemoryEndpoint({});
    assert.equal(endpoint.endpointUrl, "http://localhost:8000");
    assert.equal(endpoint.healthUrl, "http://localhost:8000/api/health");
    assert.equal(endpoint.port, "8000");
    assert.equal(endpoint.isLocal, true);
    assert.equal(endpoint.canAutoStart, true);
  });

  test("custom local port controls endpoint, health, and service environment", () => {
    const endpoint = resolveMemoryEndpoint({ META_KIM_MEMORY_PORT: "8123" });
    assert.equal(endpoint.endpointUrl, "http://localhost:8123");
    assert.equal(endpoint.healthUrl, "http://localhost:8123/api/health");
    assert.equal(endpoint.canAutoStart, true);
    assert.deepEqual(memoryServiceEnv(endpoint, { KEEP: "yes" }), {
      KEEP: "yes",
      MCP_MEMORY_URL: "http://localhost:8123",
      META_KIM_MEMORY_PORT: "8123",
      MCP_HTTP_HOST: "localhost",
      MCP_HTTP_PORT: "8123",
    });
    assert.deepEqual(memoryServerHttpArgs(endpoint), [
      "server", "--http", "--http-host", "localhost", "--http-port", "8123",
    ]);
  });

  test("malformed, unsafe-scheme, credential, and invalid-port values fail closed", () => {
    for (const env of [
      { MCP_MEMORY_URL: "not a url" },
      { MCP_MEMORY_URL: "file:///tmp/memory" },
      { MCP_MEMORY_URL: "http://user:secret@localhost:8000" },
      { MCP_MEMORY_URL: "https://memory.example.test/?token=secret" },
      { MCP_MEMORY_URL: "https://memory.example.test/?author=kim" },
      { META_KIM_MEMORY_PORT: "0" },
      { META_KIM_MEMORY_PORT: "abc" },
      { META_KIM_MEMORY_PORT: "70000" },
    ]) {
      assert.throws(() => resolveMemoryEndpoint(env), MemoryEndpointConfigError);
    }
  });

  test("remote and local HTTPS endpoints never trigger local auto-start", () => {
    const remote = resolveMemoryEndpoint({ MCP_MEMORY_URL: "https://memory.example.test:9443/base" });
    assert.equal(remote.healthUrl, "https://memory.example.test:9443/api/health");
    assert.equal(remote.isLocal, false);
    assert.equal(remote.canAutoStart, false);
    assert.throws(() => memoryServerHttpArgs(remote), MemoryEndpointConfigError);

    const localTls = resolveMemoryEndpoint({ MCP_MEMORY_URL: "https://localhost:9443" });
    assert.equal(localTls.isLocal, true);
    assert.equal(localTls.canAutoStart, false);
  });

  test("setup and installer share the endpoint policy", () => {
    const setup = readFileSync(path.join(repoRoot, "setup.mjs"), "utf8");
    const installer = readFileSync(
      path.join(repoRoot, "scripts", "install-mcp-memory-hooks.mjs"),
      "utf8",
    );
    const autoStart = setup.slice(
      setup.indexOf("async function startMcpMemoryServiceBackground"),
      setup.indexOf("async function installMcpMemoryServiceStep"),
    );

    assert.match(setup, /from "\.\/scripts\/memory-endpoint\.mjs"/);
    assert.match(installer, /from "\.\/memory-endpoint\.mjs"/);
    assert.match(autoStart, /if \(!endpoint\.canAutoStart\)/);
    assert.match(autoStart, /endpoint\.healthUrl/);
    assert.match(autoStart, /JSON\.parse\(body\)\?\.status === "healthy"/);
    assert.doesNotMatch(autoStart, /includes\("healthy"\)/);
    assert.match(autoStart, /JSON\.parse\(b\)\.status===\"healthy\"/);
    assert.doesNotMatch(autoStart, /grep -E/);
    assert.match(autoStart, /memoryServiceEnv\(endpoint/);
    assert.match(autoStart, /MCP_MEMORY_URL/);
    assert.match(autoStart, /META_KIM_MEMORY_PORT/);
    assert.doesNotMatch(autoStart, /127\.0\.0\.1:8000/);
  });
});
