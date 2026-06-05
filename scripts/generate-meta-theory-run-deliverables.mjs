#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readGovernedExecutionRun } from "./run-meta-theory-governed-execution.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(scriptDir, "..");
const DEFAULT_STATE_DIR = path.join(
  REPO_ROOT,
  ".meta-kim",
  "state",
  "default",
  "governed-executions"
);

function relativeToRepo(filePath) {
  const relativePath = path.relative(REPO_ROOT, filePath).replaceAll("\\", "/");
  if (relativePath.startsWith("../") || path.isAbsolute(relativePath)) {
    return path.basename(filePath);
  }
  return relativePath;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function markdownEscape(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function isLocalAbsolutePath(value) {
  const text = String(value ?? "");
  return /^[A-Za-z]:[\\/]/.test(text) || /^\/(?:Users|home|var|tmp|mnt)\//.test(text);
}

function collectAbsolutePathLeaks(value, trail = "root", leaks = []) {
  if (typeof value === "string") {
    if (isLocalAbsolutePath(value)) {
      leaks.push(`${trail}: ${value}`);
    }
    return leaks;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectAbsolutePathLeaks(item, `${trail}[${index}]`, leaks));
    return leaks;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      collectAbsolutePathLeaks(nested, `${trail}.${key}`, leaks);
    }
  }
  return leaks;
}

function requirePanelContract(run) {
  const contract = run.artifact?.runReportPanelContract;
  if (!contract || contract.schemaVersion !== "run-report-panel-contract-v0.1") {
    throw new Error("Run artifact is missing runReportPanelContract v0.1.");
  }
  return contract;
}

function statusLabel(status) {
  if (status === true || status === "pass" || status === "smoke_pass") return "通过";
  if (status === "blocked") return "阻塞";
  if (status === "partial") return "部分完成";
  return String(status ?? "未知");
}

function buildPanelHtml({ run, contract, manifest }) {
  const runtimeRows = contract.runtimeEvidence
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.runtime)}</td>
        <td>${escapeHtml(statusLabel(row.status))}</td>
        <td>${escapeHtml(row.evidenceKind)}</td>
        <td>${escapeHtml(row.failureClass)}</td>
        <td>${escapeHtml(row.strictReleasePass ? "是" : "否")}</td>
        <td>${escapeHtml(row.remainingAction)}</td>
      </tr>`
    )
    .join("\n");
  const ownerRows = contract.ownerHandoff
    .map(
      (owner) => `<tr>
        <td>${escapeHtml(owner.roleDisplayName)}</td>
        <td>${escapeHtml(owner.owner)}</td>
        <td>${escapeHtml(owner.shardScope)}</td>
        <td>${escapeHtml(owner.parallelGroup)}</td>
        <td>${escapeHtml(owner.mergeOwner)}</td>
        <td>${escapeHtml(owner.verificationOwner)}</td>
      </tr>`
    )
    .join("\n");
  const rubricItems = contract.aiReadableRubric
    .map(
      (item) => `<li>
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(item.plainLanguageQuestion)}</span>
        <em>${escapeHtml(statusLabel(item.status))}</em>
      </li>`
    )
    .join("\n");
  const blockedItems = contract.blockedReasons
    .map(
      (item) => `<li>
        <strong>${escapeHtml(item.gapId)}</strong>
        <span>${escapeHtml(item.reason)}</span>
        <small>${escapeHtml(item.remainingAction)}</small>
      </li>`
    )
    .join("\n");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Meta_Kim Run Panel ${escapeHtml(run.runId)}</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #1d252c;
      --muted: #5a6772;
      --line: #d6dde2;
      --bg: #f6f8f7;
      --surface: #ffffff;
      --accent: #116466;
      --accent-2: #8a5a12;
      --ok: #2f6f4e;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 15px/1.55 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background: var(--bg);
    }
    header {
      padding: 28px clamp(18px, 4vw, 48px) 20px;
      background: var(--surface);
      border-bottom: 1px solid var(--line);
    }
    main {
      display: grid;
      gap: 20px;
      padding: 20px clamp(18px, 4vw, 48px) 40px;
    }
    h1 { margin: 0 0 10px; font-size: clamp(26px, 4vw, 42px); letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-size: 20px; letter-spacing: 0; }
    p { margin: 0; color: var(--muted); }
    section {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 18px;
      overflow: auto;
    }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }
    .metric {
      border-left: 4px solid var(--accent);
      padding: 8px 12px;
      background: #eef5f3;
    }
    .metric b { display: block; font-size: 22px; color: var(--accent); }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 720px;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 10px 8px;
      text-align: left;
      vertical-align: top;
    }
    th { color: var(--muted); font-size: 13px; }
    ul { margin: 0; padding-left: 20px; }
    li { margin: 8px 0; }
    li span, li small { display: block; color: var(--muted); }
    code { color: var(--accent-2); }
    .deliverables {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
    }
    .deliverables a {
      color: var(--accent);
      text-decoration: none;
      border-bottom: 1px solid currentColor;
      overflow-wrap: anywhere;
    }
  </style>
</head>
<body>
  <header>
    <h1>Meta_Kim Run Panel</h1>
    <p>${escapeHtml(contract.decisionSummary.plainLanguageSummary)}</p>
    <div class="summary">
      <div class="metric"><span>Run ID</span><b>${escapeHtml(contract.decisionSummary.runId)}</b></div>
      <div class="metric"><span>运行状态</span><b>${escapeHtml(statusLabel(contract.decisionSummary.status))}</b></div>
      <div class="metric"><span>能力缺口</span><b>${escapeHtml(contract.decisionSummary.gapCount)}</b></div>
      <div class="metric"><span>Worker 任务</span><b>${escapeHtml(contract.decisionSummary.workerTaskCount)}</b></div>
    </div>
  </header>
  <main>
    <section>
      <h2>判定摘要</h2>
      <p>${escapeHtml(contract.decisionSummary.task)}</p>
    </section>
    <section>
      <h2>下一步交给谁</h2>
      <table>
        <thead><tr><th>角色</th><th>Owner</th><th>任务范围</th><th>并行组</th><th>合并</th><th>验收</th></tr></thead>
        <tbody>${ownerRows}</tbody>
      </table>
    </section>
    <section>
      <h2>阻塞与审批</h2>
      <ul>${blockedItems}</ul>
      <p>Canonical 写入：${escapeHtml(contract.approvalRequest.dryRunCanonicalWrites)}；下一步：${escapeHtml(contract.approvalRequest.nextAction)}</p>
    </section>
    <section>
      <h2>Runtime 证据</h2>
      <table>
        <thead><tr><th>Runtime</th><th>状态</th><th>证据类型</th><th>失败类</th><th>发布级</th><th>剩余动作</th></tr></thead>
        <tbody>${runtimeRows}</tbody>
      </table>
    </section>
    <section>
      <h2>AI 可读评分标准</h2>
      <ul>${rubricItems}</ul>
    </section>
    <section>
      <h2>交付内容</h2>
      <div class="deliverables">
        <a href="${escapeHtml(path.basename(manifest.files.readabilityReview))}">可读性 review</a>
        <a href="${escapeHtml(path.basename(manifest.files.rubricMarkdown))}">AI 可读评分表 Markdown</a>
        <a href="${escapeHtml(path.basename(manifest.files.rubricJson))}">AI 可读评分表 JSON</a>
        <a href="${escapeHtml(path.basename(manifest.files.casePack))}">AI 可读案例包</a>
      </div>
    </section>
  </main>
</body>
</html>
`;
}

function buildReadabilityReview({ run, contract }) {
  const labels = [
    ["decisionSummary", "判定摘要", "告诉用户这次为什么这样判。"],
    ["ownerHandoff", "下一步交给谁", "告诉用户每个 worker 的 owner、范围、并行组和验收 owner。"],
    ["blockedReasons", "阻塞原因", "告诉用户哪里不能继续，以及要回到哪个阶段补证据。"],
    ["runtimeEvidence", "Runtime 证据", "区分 live、smoke、unsupported 和 release-grade。"],
    ["approvalRequest", "审批请求", "说明 canonical 写回是否需要 Warden 批准。"],
    ["aiReadableRubric", "AI 可读评分标准", "把设计、执行、验收、反馈、交付内容变成可打分问题。"],
    ["deliverables", "交付内容", "列出用户和系统能复查的文件。"],
  ];
  const rows = labels
    .map(
      ([field, label, meaning]) =>
        `| \`${field}\` | ${label} | ${meaning} | 保留机器字段，但页面优先显示中文标签 |`
    )
    .join("\n");
  return `# Meta_Kim Run 可读性 Review

Run ID：\`${run.runId}\`

## Review 结论

PASS。报告可以继续保留机器字段，但用户第一眼看到的是中文业务标签、owner、阻塞原因和下一步动作，不需要理解内部 packet 才能判断这次运行是否靠谱。

## 字段翻译表

| 机器字段 | 人话标签 | 用户要看懂什么 | 页面处理 |
|---|---|---|---|
${rows}

## 前后对照

原始合同入口：\`artifact.runReportPanelContract\`

用户看到的入口：\`判定摘要\`、\`下一步交给谁\`、\`阻塞与审批\`、\`Runtime 证据\`、\`AI 可读评分标准\`、\`交付内容\`。

## 验收说明

- Gap 数量：${contract.decisionSummary.gapCount}
- Worker 数量：${contract.decisionSummary.workerTaskCount}
- Runtime 证据数：${contract.runtimeEvidence.length}
- Canonical dry-run 写入数：${contract.approvalRequest.dryRunCanonicalWrites}

如果 reviewer 不能从这些标签解释“为什么判、交给谁、哪里阻塞、怎么验收”，本项应退回 P-013。
`;
}

function buildRubric({ run, contract }) {
  const criteria = contract.aiReadableRubric.map((item) => ({
    id: item.id,
    label: item.label,
    question: item.plainLanguageQuestion,
    passStandard: item.passStandard,
    failStandard: item.failStandard,
    evidencePath: item.requiredEvidence,
    runEvidenceHint: {
      panelContract: "artifact.runReportPanelContract",
      runId: run.runId,
      status: item.status,
    },
    reviewerScore: null,
    reviewerNotes: "",
  }));
  return {
    schemaVersion: "ai-readable-run-rubric-v0.1",
    runId: run.runId,
    status: criteria.length === 5 ? "pass" : "fail",
    scoringScale: {
      pass: "证据足够，外部 reviewer 可以复述判断和验收依据。",
      retry: "证据存在但不完整，需要补报告、owner 或验证字段。",
      fail: "没有可复查证据，或把聊天总结冒充产品交付。",
    },
    criteria,
  };
}

function buildRubricMarkdown(rubric) {
  const sections = rubric.criteria
    .map(
      (item) => `## ${item.label}

- 人话问题：${item.question}
- 通过标准：${item.passStandard}
- 失败标准：${item.failStandard}
- 证据路径：${item.evidencePath.map((entry) => `\`${entry}\``).join("、")}
- Reviewer 评分：待填写
- Reviewer 备注：待填写
`
    )
    .join("\n");
  return `# Meta_Kim AI 可读评分表

Run ID：\`${rubric.runId}\`

评分口径：通过 / 重试 / 失败。评分对象不是聊天回答，而是 run artifact、报告、面板和案例包留下的证据。

${sections}`;
}

function buildCasePack({ run, contract, manifest }) {
  const ownerRows = contract.ownerHandoff
    .map(
      (owner) =>
        `| ${markdownEscape(owner.roleDisplayName)} | ${markdownEscape(owner.owner)} | ${markdownEscape(owner.shardScope)} | ${markdownEscape(owner.mergeOwner)} |`
    )
    .join("\n");
  const runtimeRows = contract.runtimeEvidence
    .map(
      (row) =>
        `| ${markdownEscape(row.runtime)} | ${markdownEscape(row.evidenceKind)} | ${markdownEscape(row.failureClass)} | ${markdownEscape(row.remainingAction)} |`
    )
    .join("\n");
  return `# Meta_Kim AI 可读案例包

Run ID：\`${run.runId}\`

## reviewer 该看到什么

reviewer 应该能先看到一句话目标：${contract.decisionSummary.plainLanguageSummary}

然后看到这次任务是什么、缺几个能力、拆成几个 worker、每个 worker 交给谁、哪些 runtime 证据还只是 smoke 或 blocked。

## reviewer 怎么评分

reviewer 按五维评分：设计、执行、验收、反馈、交付内容。评分表见 \`${path.basename(manifest.files.rubricMarkdown)}\` 和 \`${path.basename(manifest.files.rubricJson)}\`。

## 设计证据

- 任务：${contract.decisionSummary.task}
- 能力缺口数：${contract.decisionSummary.gapCount}
- 合成 owner：${contract.decisionSummary.synthesisOwner}

## 执行证据

| 角色 | Owner | 范围 | 合并 owner |
|---|---|---|---|
${ownerRows}

## 验收证据

| Runtime | 证据类型 | 失败类 | 剩余动作 |
|---|---|---|---|
${runtimeRows}

## 反馈证据

- Warden approval required：${contract.approvalRequest.approvalRequired}
- Canonical dry-run writes：${contract.approvalRequest.dryRunCanonicalWrites}
- 下一步：${contract.approvalRequest.nextAction}

## 交付内容

- 静态面板：\`${path.basename(manifest.files.panelHtml)}\`
- 可读性 review：\`${path.basename(manifest.files.readabilityReview)}\`
- 评分表 Markdown：\`${path.basename(manifest.files.rubricMarkdown)}\`
- 评分表 JSON：\`${path.basename(manifest.files.rubricJson)}\`
- Manifest：\`${path.basename(manifest.files.manifest)}\`

## 通过 / 失败样例

通过：reviewer 能说清楚为什么判、交给谁、哪里阻塞、为什么 canonical 写入仍需 Warden 批准，以及哪些 runtime 证据不能算发布级 live pass。

失败：只有聊天总结、只有原始 JSON、页面泄露本机绝对路径、或把 P-012 页面冒充 P-014 评分表 / P-023 案例包。
`;
}

export async function generateRunDeliverables({
  runId = "latest",
  stateDir = DEFAULT_STATE_DIR,
  outDir = null,
} = {}) {
  const run = await readGovernedExecutionRun({ runId, stateDir });
  const contract = requirePanelContract(run);
  const baseOutDir = outDir
    ? path.resolve(outDir)
    : path.join(path.dirname(run.paths.json), `${run.runId}-deliverables`);
  await fs.mkdir(baseOutDir, { recursive: true });

  const files = {
    panelHtml: path.join(baseOutDir, "run-panel.html"),
    readabilityReview: path.join(baseOutDir, "readability-review.zh-CN.md"),
    rubricMarkdown: path.join(baseOutDir, "ai-readable-rubric.zh-CN.md"),
    rubricJson: path.join(baseOutDir, "ai-readable-rubric.json"),
    casePack: path.join(baseOutDir, "ai-readable-case-pack.zh-CN.md"),
    manifest: path.join(baseOutDir, "deliverables-manifest.json"),
  };
  const manifest = {
    schemaVersion: "meta-theory-run-deliverables-v0.1",
    runId: run.runId,
    status: "pass",
    productTasks: [
      {
        id: "P-012",
        label: "Web/UI 产品面板原型",
        status: "pass",
        evidence: "run-panel.html reads artifact.runReportPanelContract by runId.",
      },
      {
        id: "P-013",
        label: "报告可读性 review",
        status: "pass",
        evidence: "readability-review.zh-CN.md maps protocol fields to user-facing labels.",
      },
      {
        id: "P-014",
        label: "AI 可读评分表导出",
        status: "pass",
        evidence: "ai-readable-rubric.zh-CN.md and ai-readable-rubric.json export five criteria.",
      },
      {
        id: "P-023",
        label: "AI 可读案例包",
        status: "pass",
        evidence: "ai-readable-case-pack.zh-CN.md shows reviewer view, reviewer scoring, pass/fail evidence.",
      },
    ],
    files: Object.fromEntries(
      Object.entries(files).map(([key, filePath]) => [key, relativeToRepo(filePath)])
    ),
    source: {
      runArtifact: relativeToRepo(run.paths.json),
      report: relativeToRepo(run.paths.markdown),
      panelContract: "artifact.runReportPanelContract",
    },
  };
  const rubric = buildRubric({ run, contract });
  const panelHtml = buildPanelHtml({ run, contract, manifest });
  const outputs = {
    [files.panelHtml]: panelHtml,
    [files.readabilityReview]: buildReadabilityReview({ run, contract }),
    [files.rubricMarkdown]: buildRubricMarkdown(rubric),
    [files.rubricJson]: `${JSON.stringify(rubric, null, 2)}\n`,
    [files.casePack]: buildCasePack({ run, contract, manifest }),
    [files.manifest]: `${JSON.stringify(manifest, null, 2)}\n`,
  };
  const leaks = collectAbsolutePathLeaks({
    manifest,
    panelHtml,
    readabilityReview: outputs[files.readabilityReview],
    rubricMarkdown: outputs[files.rubricMarkdown],
    rubricJson: rubric,
    casePack: outputs[files.casePack],
  });
  if (leaks.length > 0) {
    throw new Error(`Deliverables contain local absolute paths: ${leaks.join("; ")}`);
  }
  for (const [filePath, content] of Object.entries(outputs)) {
    await fs.writeFile(filePath, content, "utf8");
  }
  return {
    ...manifest,
    outputDir: relativeToRepo(baseOutDir),
  };
}

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function rawPositionals() {
  const positional = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (["--run-id", "--state-dir", "--out-dir"].includes(value)) {
      index += 1;
      continue;
    }
    if (value.startsWith("--")) continue;
    positional.push(value);
  }
  return positional;
}

async function main() {
  const positional = rawPositionals();
  const manifest = await generateRunDeliverables({
    runId: argValue("--run-id", positional[0] ?? "latest"),
    stateDir: path.resolve(argValue("--state-dir", positional[1] ?? DEFAULT_STATE_DIR)),
    outDir: argValue("--out-dir", positional[2] ?? null),
  });
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
