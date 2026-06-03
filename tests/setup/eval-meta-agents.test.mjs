import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");

describe("eval-meta-agents Claude smoke", () => {
  test("Windows CLI search includes npm-style ~/.local shims before native bin", () => {
    const source = readFileSync(
      path.join(repoRoot, "scripts", "eval-meta-agents.mjs"),
      "utf8",
    );
    const searchDirs = source.match(
      /function getWindowsCliSearchDirs\(\) \{[\s\S]*?\n\}/,
    )?.[0];

    assert.ok(searchDirs);
    assert.ok(
      searchDirs.indexOf('path.join(up, ".local")') <
        searchDirs.indexOf('path.join(up, ".local", "bin")'),
    );
  });

  test("Claude discovery falls back to project agent files when CLI lacks agents command", () => {
    const source = readFileSync(
      path.join(repoRoot, "scripts", "eval-meta-agents.mjs"),
      "utf8",
    );
    const discovery = source.match(
      /async function runClaudeDiscovery\(agentIds\) \{[\s\S]*?\n\}/,
    )?.[0];

    assert.ok(discovery);
    assert.match(discovery, /cmd\.toArgs\(\["--help"\]\)/);
    assert.match(discovery, /supportsAgentsCommand/);
    assert.match(discovery, /\.claude", "agents"/);
    assert.match(discovery, /source: "project-files"/);
    assert.match(discovery, /source: "claude-agents-command"/);
    assert.match(discovery, /claude-agents-command-unavailable/);
    assert.match(discovery, /claude-agents-command-non-tty/);
  });

  test("OpenClaw smoke can structurally validate without local auth secrets", () => {
    const source = readFileSync(
      path.join(repoRoot, "scripts", "eval-meta-agents.mjs"),
      "utf8",
    );

    assert.match(source, /function isMissingOpenClawAuthError/);
    assert.match(source, /async function runOpenClawStructuralSmoke/);
    assert.match(source, /openclaw_auth_not_configured/);
    assert.match(source, /source: "structural-template"/);
  });

  test("OpenClaw local prepare can hydrate from an existing meta agent when main auth is absent", () => {
    const source = readFileSync(
      path.join(repoRoot, "scripts", "prepare-openclaw-local.mjs"),
      "utf8",
    );

    assert.match(source, /agentAuthDirLooksUsable/);
    assert.match(source, /fallback:\$\{fallbackAgentId\.agentId\}/);
    assert.match(source, /Hydrated missing OpenClaw auth files/);
    assert.match(source, /fileLooksUsable\(targetPath\)/);
  });

  test("live evaluation can be sharded by canonical agent id", () => {
    const source = readFileSync(
      path.join(repoRoot, "scripts", "eval-meta-agents.mjs"),
      "utf8",
    );

    assert.match(source, /const agentArg = rawArgs\.find/);
    assert.match(source, /const selectedAgentIds = new Set/);
    assert.match(source, /function filterSelectedAgentIds/);
    assert.match(source, /requestedAgents/);
    assert.match(source, /Unknown agent filter/);
    assert.match(source, /Claude live case \$\{agentId\} attempt \$\{attempt\}\/2 scored/);
    assert.match(source, /attempts: attempt/);
  });

  test("OpenClaw evaluation prefers the main config MiniMax M3 model", () => {
    const source = readFileSync(
      path.join(repoRoot, "scripts", "eval-meta-agents.mjs"),
      "utf8",
    );

    assert.match(source, /function defaultOpenClawEvalModel/);
    assert.match(source, /META_KIM_OPENCLAW_EVAL_MODEL/);
    assert.match(source, /const mainConfigModel = openClawMainDefaultModel\(\)/);
    assert.match(source, /function readOpenClawMainConfig/);
    assert.match(source, /function openClawMainDefaultModel/);
    assert.match(source, /function ensureOpenClawModelRefInProviders/);
    assert.match(source, /const evalModels = ensureOpenClawModelRefInProviders/);
    assert.match(source, /\.\.\.\(mainConfig\.auth \?\? \{\}\)/);
    assert.match(source, /\.\.\.evalModels/);
    assert.match(source, /openclawMainConfigPath/);
    assert.match(source, /"MiniMax-M3"/);
    assert.match(source, /function openClawLocalAuthProfileHasProvider/);
    assert.match(source, /function openClawLocalModelRefForProvider/);
    assert.match(source, /function hasCodexCliAuth/);
    assert.match(source, /codex-cli\/gpt-5\.4/);
    assert.match(source, /"gpt-5\.4-mini"/);
    assert.match(source, /preferredModelIds/);
    assert.match(
      source,
      /codexModel && openClawLocalAuthProfileHasProvider\("codex"\)/,
    );
    assert.match(source, /"models\.json"/);
    assert.match(source, /useMainConfig: true/);
    assert.match(source, /configSource: "main"/);
    assert.match(source, /configSource: baseStatus\.tempConfig\.configSource/);
    assert.match(source, /codexHomeDir/);
    assert.match(source, /function shouldUseIsolatedCodexHome/);
    assert.match(source, /normalized\.startsWith\("codex-cli\/"\)/);
    assert.match(source, /\? \{ CODEX_HOME: tempConfig\.codexHomeDir \}/);
    assert.match(source, /OPENAI_API_KEY/);
    assert.match(source, /openai-codex\/gpt-5\.4/);
    assert.match(source, /function applyOpenClawEvalDefaults/);
    assert.match(source, /typeof existingDefaults\.model === "string"/);
    assert.match(source, /model: agent\.model \?\? evalModel/);
    assert.match(source, /bootstrapMaxChars: existingDefaults\.bootstrapMaxChars \?\? 1_200/);
    assert.match(source, /bootstrapTotalMaxChars: existingDefaults\.bootstrapTotalMaxChars \?\? 4_000/);
    assert.match(source, /profile: agent\.tools\?\.profile \?\? "minimal"/);
    assert.match(source, /memoryGetMaxChars/);
    assert.match(source, /startupContext/);
    assert.match(source, /enabled: false/);
    assert.match(source, /skills: agent\.skills \?\? \["meta-theory"\]/);
    assert.match(source, /evalModel: config\.agents\.defaults\.model\.primary/);
    assert.match(source, /sessionRootDir/);
    assert.match(source, /store: path\.join\(sessionRootDir, "\{agentId\}", "sessions\.json"\)/);
    assert.match(source, /stateDir/);
    assert.match(source, /homeDir/);
    assert.match(source, /OPENCLAW_STATE_DIR: tempConfig\.stateDir/);
    assert.match(source, /OPENCLAW_HOME: tempConfig\.homeDir/);
    assert.match(source, /hydrateOpenClawEvalAuthState/);
    assert.match(source, /maxRetries: 5/);
    assert.match(source, /OpenClaw eval temp cleanup left locked files/);
    assert.match(source, /shellEnv/);
    assert.match(source, /timeoutMs: 0/);
    assert.match(source, /allow: \["minimax", "openai"\]/);
    assert.doesNotMatch(source, /entries:\s*\{[\s\S]*"openai-codex": \{/);
    assert.match(source, /load: \{\s*paths: \[\]/);
    assert.match(source, /memory: "none"/);
    assert.match(source, /allowBundled: \[\]/);
    assert.match(source, /extraDirs: \[skillsRootDir\]/);
    assert.match(source, /watch: false/);
    assert.match(source, /maxSkillsLoadedPerSource: 8/);
    assert.match(source, /tool execution/);
    assert.match(source, /工具操作/);
    assert.match(source, /质量审计/);
    assert.match(source, /质量门禁/);
    assert.match(source, /质量门槛/);
    assert.match(source, /prompt 架构/);
    assert.match(source, /接入外部工具/);
    assert.match(source, /业务代码/);
    assert.match(source, /内部逻辑/);
    assert.match(source, /AI_slop/);
    assert.match(source, /发现报告/);
    assert.match(source, /协调管理/);
    assert.match(source, /synthesis/);
    assert.match(source, /边界守门/);
    assert.match(source, /SOUL\/AGENTS/);
  });

  test("OpenClaw child commands receive a stable current-user home", () => {
    const source = readFileSync(
      path.join(repoRoot, "scripts", "eval-meta-agents.mjs"),
      "utf8",
    );

    assert.match(source, /function openClawChildEnv/);
    assert.match(source, /HOME: homeDir/);
    assert.match(source, /USERPROFILE: homeDir/);
    assert.match(source, /HOMEDRIVE: drive/);
    assert.match(source, /HOMEPATH: homePath/);
    assert.match(source, /env: openClawChildEnv/);
  });

  test("OpenClaw live eval recovers completed replies from session jsonl when the CLI hangs", () => {
    const source = readFileSync(
      path.join(repoRoot, "scripts", "eval-meta-agents.mjs"),
      "utf8",
    );

    assert.match(source, /async function readOpenClawSessionPayload/);
    assert.ok(source.includes('entry.name.endsWith(".jsonl")'));
    assert.match(source, /sessionDirs = \[\]/);
    assert.match(source, /options\.sessionDirs \?\? \[\]/);
    assert.match(source, /baseStatus\.tempConfig\.sessionRootDir/);
    assert.match(source, /currentSessionId === sessionId/);
    assert.match(source, /event\.data\?\.runId === sessionId/);
    assert.match(source, /recentEvents/);
    assert.match(source, /eventMs >= sinceMs - 1_000/);
    assert.match(source, /const startedAtMs = Date\.now\(\)/);
    assert.match(source, /function extractOpenClawPayloadFromSessionEvents/);
    assert.match(source, /parseJsonObjectFromText\(text\)/);
    assert.match(source, /function normalizeOpenClawAgentPayload/);
    assert.match(source, /normalizeOpenClawAgentPayload\(agentId, turn\.payload\)/);
    assert.match(source, /async function runOpenClawAgentTurn/);
    assert.match(source, /OpenClaw live turn still running/);
    assert.match(source, /heartbeatMs = 30_000/);
    assert.match(source, /baseStatus\.tempConfig\.stateDir/);
    assert.match(source, /"agents"/);
    assert.match(source, /openclaw:bootstrap-context:full/);
    assert.match(source, /payload\.sessionRecovery\?\.bootstrapFull === true/);
    assert.match(source, /recoveredFromSession/);
    assert.match(source, /JSON 必须包含 agent/);
    assert.match(source, /agentId === "meta-scout"/);
    assert.match(source, /不直接执行工具或运行时动作/);
    assert.match(source, /"--thinking"/);
    assert.match(source, /"300"/);
    assert.match(source, /sessionTimeoutMs: 390_000/);
    assert.match(source, /attempt <= 2/);
    assert.match(source, /attempts: turnAttempt/);
  });
});
