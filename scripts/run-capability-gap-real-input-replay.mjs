#!/usr/bin/env node
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_JSON_PATH = path.join(
  REPO_ROOT,
  ".meta-kim",
  "state",
  "default",
  "capability-gap-real-input-replay.json"
);
const DEFAULT_MARKDOWN_PATH = path.join(
  REPO_ROOT,
  "docs",
  "capability-gap-real-input-replay-report.zh-CN.md"
);
const DEFAULT_DB_PATH = path.join(
  REPO_ROOT,
  ".meta-kim",
  "state",
  "default",
  "capability-gap-real-input-replay.sqlite"
);

const REAL_INPUTS = [
  {
    id: "REAL-01",
    input:
      "我经常要求同一套 PRD 判断流程：先锁真实目标，再查依据，再比较路线，最后复盘质量。现有 owner 能做单次评审，但这套 reusable flow 每次都要重讲。",
    expectedDecision: "create_skill",
    userFacingGoal: "重复方法沉淀成 skill，不新建长期 agent。",
  },
  {
    id: "REAL-02",
    input:
      "我们反复缺少一个长期 test coverage strategy owner：它要看 coverage gap、判断缺 verifier、给 verification planning，而不是只跑一次测试。",
    expectedDecision: "create_agent",
    userFacingGoal: "长期专业 owner 缺口，进入 create_agent。",
  },
  {
    id: "REAL-03",
    input:
      "每次发布前都要把 run artifacts normalize 成同一种 JSON report，过程 mechanical、testable、没有外部授权需求。",
    expectedDecision: "create_script",
    userFacingGoal: "稳定机械动作，应该沉淀成 script。",
  },
  {
    id: "REAL-04",
    input:
      "我需要稳定查询 company internal knowledge base，并且明确 read/write 权限、credential boundary、审计事件和 provider 调用范围。",
    expectedDecision: "create_mcp_provider",
    userFacingGoal: "稳定外部或内部系统能力，应该设计 MCP provider 候选。",
  },
  {
    id: "REAL-05",
    input:
      "这次只把当前中文报告里一段话改得更口语化，已有文档编辑 owner 和工具足够，没有重复复用价值。",
    expectedDecision: "worker_task_only",
    userFacingGoal: "一次性任务，只生成 workerTask，不进入长期能力。",
  },
  {
    id: "REAL-06",
    input:
      "请自动 publish 到第三方平台，同时修改 credentials 并创建 paid job；我还没有给明确授权。",
    expectedDecision: "blocked_or_needs_approval",
    userFacingGoal: "外部写动作和凭证/付费风险，必须阻塞或请求授权。",
  },
];

const REQUIRED_STATION_PACKETS = [
  "agentBoundaryDecision",
  "agentLoadoutDecision",
  "agentMemoryDecision",
  "agentDesignReview",
  "agentCandidateGateDecision",
];

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1] ?? fallback;
}

function relative(filePath) {
  return path.relative(REPO_ROOT, filePath).replaceAll("\\", "/");
}

function runNodeProcess(args, { cwd = REPO_ROOT } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(
          new Error(
            `child process failed (${exitCode}): ${args.join(" ")}\n${stderr}`
          )
        );
        return;
      }
      resolve({ stdout, stderr, exitCode });
    });
  });
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function outputCompleteness(result) {
  const decisionOutput = result.decisionOutput;
  const payload = decisionOutput?.payload ?? {};
  const missing = [
    ...(decisionOutput?.acceptance?.missingFields ?? []),
    ...((decisionOutput?.outputs ?? []).filter(
      (field) => payload[field] === undefined || payload[field] === null
    )),
  ];
  return {
    status:
      result.decisionOutput?.acceptance?.status === "pass" &&
      result.decisionEvidence?.status === "pass" &&
      missing.length === 0
        ? "pass"
        : "fail",
    missing,
  };
}

function summarizeReplay({ gapReplay, processReplay }) {
  const stationPackets = processReplay.stationPackets ?? {};
  const stationPacketCoverage = REQUIRED_STATION_PACKETS.every((packet) =>
    Object.hasOwn(stationPackets, packet)
  );
  const cases = gapReplay.results.map((result, index) => {
    const fixture = REAL_INPUTS[index];
    const completeness = outputCompleteness(result);
    const isCreateAgent = result.gapDecision.decision === "create_agent";
    return {
      id: fixture.id,
      input: fixture.input,
      userFacingGoal: fixture.userFacingGoal,
      expectedDecision: fixture.expectedDecision,
      actualDecision: result.gapDecision.decision,
      decisionMatched: fixture.expectedDecision === result.gapDecision.decision,
      capabilityGap: {
        requestedCapability: result.capabilityGap.requestedCapability,
        insufficiencyReason: result.capabilityGap.insufficiencyReason,
        riskIfUnresolved: result.capabilityGap.riskIfUnresolved,
      },
      decisionReason: result.gapDecision.decisionReason,
      rejectedAlternatives: result.gapDecision.rejectedAlternatives,
      outputCompleteness: completeness,
      runStateStore: {
        runId: result.capabilityGap.runId,
        graphPath: result.graphPath,
        eventCount: result.events.length,
        requiredEventsPresent: result.events.length >= 8,
      },
      stationPacketCompleteness: isCreateAgent
        ? {
            status: stationPacketCoverage ? "pass" : "fail",
            packets: REQUIRED_STATION_PACKETS,
          }
        : {
            status: "not_required",
            reason: "Only create_agent branch requires the five governance station packets.",
          },
    };
  });
  const failedCases = cases.filter(
    (item) =>
      !item.decisionMatched ||
      item.outputCompleteness.status !== "pass" ||
      item.runStateStore.requiredEventsPresent === false ||
      item.stationPacketCompleteness.status === "fail"
  );
  return {
    status:
      failedCases.length === 0 &&
      gapReplay.summary.replayed === REAL_INPUTS.length &&
      gapReplay.summary.runs === REAL_INPUTS.length &&
      stationPacketCoverage
        ? "pass"
        : "fail",
    cases,
    stationPacketCoverage,
    stationPackets: Object.keys(stationPackets),
    database: gapReplay.summary,
    processReplay: {
      status: processReplay.status,
      runId: processReplay.runId,
      generatedAgentSpec: processReplay.generatedAgentSpec?.name,
      events: processReplay.database?.events,
    },
  };
}

function renderMarkdown(report) {
  const lines = [
    "# Capability Gap Real Input Replay Report",
    "",
    "## 一句话",
    "",
    "本报告用 6 条更接近真实使用场景的输入，在独立 Node 子进程里回放 CapabilityGap 决策，验证系统是否自然走到 create_skill / create_agent / create_script / create_mcp_provider / worker_task_only / blocked_or_needs_approval。",
    "",
    "## 结果",
    "",
    `- 状态：${report.status}`,
    `- 输入数：${report.cases.length}`,
    `- 决策覆盖：${report.database.decisions.join(", ")}`,
    `- SQLite runs：${report.database.runs}`,
    `- SQLite events：${report.database.events}`,
    `- create_agent station packets：${report.stationPacketCoverage ? "pass" : "fail"}`,
    "",
    "## 回放明细",
    "",
    "| ID | 期望 | 实际 | 决策 | 输出 | 事件 | Station |",
    "|---|---|---|---|---|---|---|",
    ...report.cases.map((item) =>
      [
        item.id,
        item.expectedDecision,
        item.actualDecision,
        item.decisionMatched ? "pass" : "fail",
        item.outputCompleteness.status,
        item.runStateStore.requiredEventsPresent ? "pass" : "fail",
        item.stationPacketCompleteness.status,
      ].join(" | ")
    ).map((line) => `| ${line} |`),
    "",
    "## 每条输入的判断依据",
    "",
    ...report.cases.flatMap((item) => [
      `### ${item.id}：${item.actualDecision}`,
      "",
      `- 输入：${item.input}`,
      `- 人话目标：${item.userFacingGoal}`,
      `- CapabilityGap：${item.capabilityGap.insufficiencyReason}`,
      `- 为什么这么判：${item.decisionReason}`,
      `- 拒绝路线：${item.rejectedAlternatives
        .map((alt) => `${alt.decision}（${alt.reason}）`)
        .join("；")}`,
      `- RunStateStore：runId=${item.runStateStore.runId}，events=${item.runStateStore.eventCount}`,
      "",
    ]),
    "## 新进程证据",
    "",
    ...report.evidence.commands.map((command) => `- \`${command}\``),
    "",
  ];
  return `${lines.join("\n")}`;
}

export async function runCapabilityGapRealInputReplay({
  jsonPath = DEFAULT_JSON_PATH,
  markdownPath = DEFAULT_MARKDOWN_PATH,
  dbPath = DEFAULT_DB_PATH,
} = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "meta-kim-real-gap-"));
  const fixturePath = path.join(tempDir, "real-inputs.json");
  await fs.writeFile(fixturePath, `${JSON.stringify(REAL_INPUTS, null, 2)}\n`);
  await fs.rm(dbPath, { force: true });

  const gapCommand = [
    "scripts/capability-gap-mvp.mjs",
    "--fixture",
    fixturePath,
    "--db",
    dbPath,
    "--json",
  ];
  const gapProcess = await runNodeProcess(gapCommand);
  const gapReplay = JSON.parse(gapProcess.stdout);

  const processStatePath = path.join(tempDir, "agent-process.json");
  const processMarkdownPath = path.join(tempDir, "agent-process.md");
  const processDbPath = path.join(tempDir, "agent-process.sqlite");
  const processCommand = [
    "scripts/run-governance-agent-process-mvp.mjs",
    "--json-out",
    processStatePath,
    "--markdown-out",
    processMarkdownPath,
    "--db",
    processDbPath,
  ];
  await runNodeProcess(processCommand);
  const processReplay = await readJson(processStatePath);

  const summary = summarizeReplay({ gapReplay, processReplay });
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    ...summary,
    evidence: {
      commands: [
        "node scripts/capability-gap-mvp.mjs --fixture <temp-fixture> --db <state-sqlite> --json",
        "node scripts/run-governance-agent-process-mvp.mjs --json-out <temp-json> --markdown-out <temp-md> --db <temp-sqlite>",
      ],
      files: {
        json: relative(jsonPath),
        markdown: relative(markdownPath),
        sqlite: relative(dbPath),
      },
    },
  };

  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.mkdir(path.dirname(markdownPath), { recursive: true });
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(markdownPath, renderMarkdown(report));
  await fs.rm(tempDir, { recursive: true, force: true });
  return report;
}

async function main() {
  const jsonPath = path.resolve(argValue("--json-out", DEFAULT_JSON_PATH));
  const markdownPath = path.resolve(
    argValue("--markdown-out", DEFAULT_MARKDOWN_PATH)
  );
  const dbPath = path.resolve(argValue("--db", DEFAULT_DB_PATH));
  const report = await runCapabilityGapRealInputReplay({
    jsonPath,
    markdownPath,
    dbPath,
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        status: report.status,
        cases: report.cases.length,
        decisions: report.database.decisions,
        stationPacketCoverage: report.stationPacketCoverage,
        report: relative(markdownPath),
      },
      null,
      2
    )}\n`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
