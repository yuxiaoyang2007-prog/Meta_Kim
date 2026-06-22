import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

  test("Claude discovery falls back to project agent files or canonical agents when CLI lacks agents command", () => {
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
    assert.match(discovery, /readRuntimeAgentIdsOrCanonical/);
    assert.match(discovery, /\.claude", "agents"/);
    assert.match(discovery, /source: discoveredAgents\.source/);
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

  test("Claude live eval grounds role answers in loaded agent boundaries", () => {
    const source = readFileSync(
      path.join(repoRoot, "scripts", "eval-meta-agents.mjs"),
      "utf8",
    );

    assert.match(source, /const scoutInstruction =/);
    assert.match(source, /当前 Claude Code 已加载的 agent 定义/);
    assert.match(source, /frontmatter、AGENTS\/CLAUDE/);
    assert.match(source, /不要凭通用 agent 印象补写/);
    assert.match(source, /tool-skill-MCP\/ROI/);
    assert.match(source, /不直接执行工具或运行时动作/);
    assert.match(source, /协调\/dispatch\/loadout\/final approval/);
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
    assert.match(source, /function isOpenClawBoundaryPayload/);
    assert.match(source, /typeof payload\.agent === "string"/);
    assert.match(source, /Array\.isArray\(payload\.owns\)/);
    assert.match(source, /Array\.isArray\(payload\.refuses\)/);
    assert.match(source, /typeof payload\.artifact === "string"/);
    assert.match(source, /Array\.isArray\(payload\.delegates_to\)/);
    assert.match(source, /function extractOpenClawPayloadFromSessionEvents/);
    assert.match(source, /parseJsonObjectFromText\(item\.text\)/);
    assert.match(source, /isOpenClawBoundaryPayload\(payloadObject\)/);
    assert.match(source, /if \(hasToolCall\) \{\s*continue;\s*\}/);
    assert.match(source, /return null;\s*\}/);
    assert.match(source, /function normalizeOpenClawAgentPayload/);
    assert.match(source, /normalizeOpenClawAgentPayload\(agentId, turn\.payload\)/);
    assert.match(source, /async function runOpenClawAgentTurn/);
    assert.match(source, /if \(code === 0\) \{\s*recoverFromSession\(\)/);
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

  test("Cursor runtime reports projection smoke and explicit live harness contract boundary", () => {
    const source = readFileSync(
      path.join(repoRoot, "scripts", "eval-meta-agents.mjs"),
      "utf8",
    );
    const contract = JSON.parse(
      readFileSync(
        path.join(
          repoRoot,
          "config",
          "contracts",
          "cursor-live-turn-harness-contract.json",
        ),
        "utf8",
      ),
    );

    assert.match(source, /\["claude", "codex", "openclaw", "cursor"\]/);
    assert.match(source, /async function runCursorSmoke/);
    assert.match(source, /async function runCursorLive/);
    assert.match(source, /async function probeCursorAgentHarness/);
    assert.match(source, /function cursorLivePayloadOk/);
    assert.match(source, /META_KIM_CURSOR_AGENT_BIN/);
    assert.match(source, /META_KIM_CURSOR_BIN/);
    assert.match(source, /cursor-agent-wsl/);
    assert.match(source, /wsl\.exe/);
    assert.match(source, /function windowsPathToWslPath/);
    assert.match(source, /META_KIM_CURSOR_SKIP_WSL/);
    assert.match(source, /cursor-live-turn-harness-contract\.json/);
    assert.match(source, /"skills",\s*"meta-theory"/);
    assert.match(source, /"hooks\.json"/);
    assert.match(source, /"rules"/);
    assert.match(source, /cursor_live_harness_blocked/);
    assert.match(source, /unsupportedWithReason/);
    assert.match(source, /native_harness_missing/);
    assert.match(source, /localProbe/);
    assert.match(source, /blockedCriteria/);
    assert.match(source, /summarizeRuntimeReport\("cursor", report\.cursor\)/);
    assert.equal(contract.schemaVersion, "cursor-live-turn-harness-v0.1");
    assert.equal(
      contract.releaseBoundary.projectionSmokeIsLivePass,
      false,
    );
    assert.equal(contract.officialEvidenceRefreshedAt, "2026-06-04");
    assert.equal(contract.officialEvidenceRefreshOwner, "meta-scout");
    assert.ok(
      contract.officialEvidence.some((item) =>
        item.url === "https://docs.cursor.com/en/cli/reference/output-format",
      ),
    );
    assert.ok(
      contract.nativeHarnessCandidates.some((item) =>
        item.requiredHelpPatterns.includes("--output-format"),
      ),
    );
    assert.ok(
      contract.nativeHarnessCandidates.some((item) => item.id === "cursor-agent-wsl"),
    );
  });

  test("Cursor live with missing native agent reports structured blocked boundary", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/eval-meta-agents.mjs", "--runtime=cursor", "--live"],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          META_KIM_CURSOR_AGENT_BIN: path.join(repoRoot, ".missing-cursor-agent.exe"),
          META_KIM_CURSOR_BIN: path.join(repoRoot, ".missing-cursor.exe"),
          META_KIM_CURSOR_SKIP_WSL: "1",
          NO_COLOR: "1",
        },
        encoding: "utf8",
        timeout: 30_000,
      },
    );

    assert.equal(result.status, 1, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.equal(report.cursor.status, "blocked");
    assert.equal(report.cursor.reason, "cursor_live_harness_blocked");
    assert.equal(report.cursor.failureClass, "native_harness_missing");
    assert.equal(
      report.cursor.contract.schemaVersion,
      "cursor-live-turn-harness-v0.1",
    );
    assert.equal(
      report.runtimeEvidencePacket.records[0].failureClass,
      "native_harness_missing",
    );
    assert.equal(report.runtimeEvidencePacket.records[0].evidenceKind, "unsupported");
    assert.match(
      report.runtimeEvidencePacket.records[0].remainingAction,
      /Cursor Agent CLI \(`cursor-agent`\)/,
    );
    assert.equal(report.summary.releaseGrade, false);
  });

  test("Cursor live success fixture promotes harness evidence to release-grade pass", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/eval-meta-agents.mjs", "--runtime=cursor", "--live"],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          META_KIM_CURSOR_LIVE_SUCCESS_FIXTURE: "1",
          META_KIM_CURSOR_SKIP_WSL: "1",
          NO_COLOR: "1",
        },
        encoding: "utf8",
        timeout: 30_000,
      },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.summary.passed, ["cursor"]);
    assert.equal(report.cursor.status, "passed");
    assert.equal(report.cursor.fixture, true);
    assert.equal(report.cursor.localProbe.selectedHarness, "cursor-agent-success-fixture");
    assert.equal(report.runtimeEvidencePacket.records[0].runtime, "cursor");
    assert.equal(report.runtimeEvidencePacket.records[0].evidenceKind, "live");
    assert.equal(report.runtimeEvidencePacket.records[0].failureClass, "pass");
    assert.equal(report.runtimeEvidencePacket.records[0].strictReleasePass, true);
    assert.equal(report.runtimeEvidencePacket.summary.releaseGrade, true);
  });

  test("Runtime evidence aggregator uses fixed failure taxonomy", () => {
    const source = readFileSync(
      path.join(repoRoot, "scripts", "eval-meta-agents.mjs"),
      "utf8",
    );

    assert.match(source, /const RUNTIME_FAILURE_TAXONOMY/);
    for (const failureClass of [
      "timeout",
      "auth_missing",
      "native_harness_missing",
      "projection_only",
      "tool_unsupported",
    ]) {
      assert.match(source, new RegExp(failureClass));
    }
    assert.match(source, /function classifyRuntimeFailure/);
    assert.match(source, /function buildRuntimeEvidencePacket/);
    assert.match(source, /runtimeEvidencePacket/);
    assert.match(source, /remainingAction/);
    assert.match(source, /strictReleasePass/);
    assert.match(source, /releaseGrade/);
    assert.match(source, /blockedFromRelease/);
  });

  test("Codex live validates governed orchestration and records timeout fallback evidence", () => {
    const source = readFileSync(
      path.join(repoRoot, "scripts", "eval-meta-agents.mjs"),
      "utf8",
    );

    assert.match(source, /const codexLiveOrchestrationSchema/);
    assert.match(source, /function codexLivePayloadOk/);
    assert.match(source, /function tryExtractCodexReply/);
    assert.match(source, /governed_entry/);
    assert.match(source, /warden_entry_gate/);
    assert.match(source, /conductor_orchestration/);
    assert.match(source, /orchestrationTaskBoardPacket/);
    assert.match(source, /workerTaskPackets/);
    assert.match(source, /synthesisOwner/);
    assert.match(source, /roleDisplayName/);
    assert.match(source, /isCommandTimeoutFailure/);
    assert.match(source, /META_KIM_COMMAND_TIMEOUT/);
    assert.match(source, /codex_live_timeout/);
    assert.match(source, /codex_exec_orchestration_prompt/);
    assert.match(source, /function extractCodexThreadId/);
    assert.match(source, /thread\.started/);
    assert.match(source, /threadId: extractCodexThreadId\(error\.stdout\)/);
    assert.match(source, /sessionRecoveryHint/);
    assert.match(source, /recoveredFromTimeout/);
    assert.match(source, /codex_live_timeout_recovered/);
    assert.match(source, /status: "passed"/);
    assert.match(source, /retryCommand/);
    assert.match(source, /stdoutTail/);
    assert.match(source, /stderrTail/);
    assert.match(source, /120_000/);
    assert.match(
      source,
      /Warden -> Conductor -> orchestrationTaskBoardPacket -> workerTaskPackets/,
    );
  });

  test("Codex live timeout fixture recovers orchestration payload as pass", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/eval-meta-agents.mjs", "--runtime=codex", "--live"],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          META_KIM_CODEX_LIVE_TIMEOUT_FIXTURE: "1",
          NO_COLOR: "1",
        },
        encoding: "utf8",
        timeout: 30_000,
      },
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.summary.passed, ["codex"]);
    assert.equal(report.codex.status, "passed");
    assert.equal(report.codex.recoveredFromTimeout, true);
    assert.equal(
      report.codex.sample.runtime_smoke.orchestrationTaskBoardPacket
        .synthesisOwner,
      "meta-conductor",
    );
    assert.equal(
      report.codex.sample.runtime_smoke.workerTaskPackets[0].owner,
      "meta-artisan",
    );
    assert.equal(
      report.codex.sample.runtime_recovery.reason,
      "codex_live_timeout_recovered",
    );
    assert.equal(
      report.codex.sample.runtime_recovery.threadId,
      "codex-live-timeout-fixture-thread",
    );
    assert.equal(report.runtimeEvidencePacket.records[0].runtime, "codex");
    assert.equal(report.runtimeEvidencePacket.records[0].evidenceKind, "live");
    assert.equal(report.runtimeEvidencePacket.records[0].failureClass, "pass");
    assert.equal(report.runtimeEvidencePacket.summary.releaseGrade, true);
  });
});
