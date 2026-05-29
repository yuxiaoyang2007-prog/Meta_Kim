#!/usr/bin/env node
import { CONFIDENCE, RUNTIMES, SUPPORT, assert, readJson } from "./governance-lib.mjs";

const matrix = await readJson("config/runtime-capability-matrix.json");
const platformMap = new Map(matrix.platforms?.map((entry) => [entry.platform, entry]));

function supportMap(entry) {
  const map = new Map((entry.capabilities ?? []).map((capability) => [capability.capability, capability]));
  return map;
}

for (const runtime of RUNTIMES) {
  assert(platformMap.has(runtime), `Missing runtime platform ${runtime}`);
  const entry = platformMap.get(runtime);
  const capabilities = supportMap(entry);
  assert(!entry.capabilityTemplate, `${runtime} must not use capabilityTemplate; every capability needs a full record`);
  for (const capabilityName of matrix.capabilityNames ?? []) {
    assert(capabilities.has(capabilityName), `${runtime} missing capability ${capabilityName}`);
  }
  for (const capability of capabilities.values()) {
    assert(SUPPORT.includes(capability.support), `${runtime}.${capability.capability} has invalid support`);
    assert(CONFIDENCE.includes(capability.confidence), `${runtime}.${capability.capability} has invalid confidence`);
    assert(capability.trigger && capability.evidence, `${runtime}.${capability.capability} missing trigger/evidence`);
    assert(!(capability.support === "native" && capability.confidence === "unverified"), `${runtime}.${capability.capability} cannot be native with unverified confidence`);
  }
}

for (const osName of ["macos", "windows", "linux", "wsl2"]) {
  assert(JSON.stringify(matrix).includes(osName), `Matrix must mention ${osName}`);
}

const cursor = supportMap(platformMap.get("cursor"));
for (const cap of ["hook", "native choice surface", "subagent"]) {
  assert(cursor.get(cap)?.support !== "native", `Cursor ${cap} must not be native without evidence`);
}

const codex = platformMap.get("codex");
assert(JSON.stringify(codex).includes("explicitly requested"), "Codex subagent constraint must require explicit trigger");
assert(JSON.stringify(codex).includes("trust review"), "Codex hooks must mention trust review");
assert(JSON.stringify(platformMap.get("openclaw")).includes("Third-party skills"), "OpenClaw third-party skill risk must be recorded");

console.log("runtime capability matrix valid");
