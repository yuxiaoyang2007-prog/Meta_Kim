import { isIP } from "node:net";

export const DEFAULT_MEMORY_ENDPOINT = "http://localhost:8000";

export class MemoryEndpointConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "MemoryEndpointConfigError";
  }
}

function isLoopbackHostname(hostname) {
  const value = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (value === "localhost" || value.endsWith(".localhost") || value === "::1") return true;
  if (isIP(value) === 4) return value.startsWith("127.");
  return false;
}

function normalizePort(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) {
    throw new MemoryEndpointConfigError("META_KIM_MEMORY_PORT must be an integer between 1 and 65535");
  }
  const port = Number(text);
  if (port < 1 || port > 65535) {
    throw new MemoryEndpointConfigError("META_KIM_MEMORY_PORT must be an integer between 1 and 65535");
  }
  return String(port);
}

export function resolveMemoryEndpoint(env = process.env) {
  const configuredUrl = String(env.MCP_MEMORY_URL || "").trim();
  const source = configuredUrl
    ? "MCP_MEMORY_URL"
    : env.META_KIM_MEMORY_PORT
      ? "META_KIM_MEMORY_PORT"
      : "default";
  const rawEndpoint = configuredUrl || `http://localhost:${normalizePort(env.META_KIM_MEMORY_PORT || "8000")}`;

  let parsed;
  try {
    parsed = new URL(rawEndpoint);
  } catch {
    throw new MemoryEndpointConfigError(`${source} must be a valid absolute HTTP(S) URL`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new MemoryEndpointConfigError(`${source} must use http:// or https://`);
  }
  if (parsed.username || parsed.password) {
    throw new MemoryEndpointConfigError(`${source} must not contain credentials`);
  }
  if (!parsed.hostname) {
    throw new MemoryEndpointConfigError(`${source} must include a hostname`);
  }
  if (parsed.search || parsed.hash) {
    throw new MemoryEndpointConfigError(
      `${source} must not contain query parameters or fragments; use separate secret environment variables`,
    );
  }

  const endpointUrl = parsed.toString().replace(/\/$/, "");
  const healthUrl = new URL("/api/health", parsed).toString();
  const isLocal = isLoopbackHostname(parsed.hostname);
  const canAutoStart = isLocal && parsed.protocol === "http:";
  const port = parsed.port || (parsed.protocol === "https:" ? "443" : "80");

  return Object.freeze({
    source,
    endpointUrl,
    healthUrl,
    hostname: parsed.hostname,
    port,
    protocol: parsed.protocol,
    isLocal,
    canAutoStart,
  });
}

export function memoryServiceEnv(endpoint, baseEnv = process.env) {
  return {
    ...baseEnv,
    MCP_MEMORY_URL: endpoint.endpointUrl,
    META_KIM_MEMORY_PORT: endpoint.port,
    MCP_HTTP_HOST: endpoint.hostname,
    MCP_HTTP_PORT: endpoint.port,
  };
}

export function memoryServerHttpArgs(endpoint) {
  if (!endpoint?.canAutoStart) {
    throw new MemoryEndpointConfigError("automatic Memory Service startup requires a local HTTP endpoint");
  }
  return ["server", "--http", "--http-host", endpoint.hostname, "--http-port", endpoint.port];
}
