#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readGovernedExecutionRun } from "./run-meta-theory-governed-execution.mjs";
import {
  getGovernedRunSurfaceLabels,
  getReportLabels,
  normalizeOutputLanguage,
} from "./meta-kim-i18n.mjs";
import { createReportContext } from "./report-context.mjs";

const reportContext = createReportContext();
const REPO_ROOT = reportContext.repoRoot;
const DEFAULT_STATE_DIR = reportContext.resolveStatePath("governed-executions");

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

function statusLabel(status, labels) {
  return labels.statusValue(status);
}

const PANEL_COPY = Object.freeze({
  en: {
    offlineExecution: "Run record loaded; use the actual calls shown in this chat",
    independentReview: "Additional independent verification is not enabled or is still pending.",
    handoff: (count) => `${count} execution task(s) are assigned and will be merged and reviewed together.`,
    blockers: (count, approval) => count > 0
      ? `${count} item(s) still need attention before work can continue.`
      : approval ? "Approval is required before the next change." : "No user action is currently blocking progress.",
    result: "Result", risk: "Risk", next: "Next action",
    runtimeReady: "Release verification complete", runtimePending: "Further verification required",
    riskClear: "No outstanding runtime verification risk", riskPending: "Current evidence is not yet release-grade",
    nextClear: "No additional runtime action", nextPending: "Complete runtime verification before release",
  },
  "zh-CN": {
    offlineExecution: "运行记录已读取；以当前聊天中的实际调用结果为准",
    independentReview: "额外独立复核未启用或待完成。",
    handoff: (count) => `已安排 ${count} 个执行任务，完成后统一合并与验收。`,
    blockers: (count, approval) => count > 0
      ? `仍有 ${count} 项需要处理，完成后才能继续。`
      : approval ? "下一项变更需要批准后继续。" : "当前没有需要用户处理的阻塞。",
    result: "结果", risk: "风险", next: "下一步",
    runtimeReady: "发布验证已完成", runtimePending: "仍需进一步验证",
    riskClear: "没有待处理的运行验证风险", riskPending: "当前证据尚未达到发布级",
    nextClear: "无需额外运行操作", nextPending: "发布前完成运行验证",
  },
  "ja-JP": {
    offlineExecution: "実行記録を読み込みました。実際の呼び出し結果は現在のチャットを確認してください",
    independentReview: "追加の独立検証は未有効化、または完了待ちです。",
    handoff: (count) => `${count} 件の実行タスクを割り当て、完了後にまとめて統合・確認します。`,
    blockers: (count, approval) => count > 0
      ? `続行前に ${count} 件の対応が必要です。`
      : approval ? "次の変更には承認が必要です。" : "現在、ユーザー対応が必要なブロッカーはありません。",
    result: "結果", risk: "リスク", next: "次の対応",
    runtimeReady: "リリース検証完了", runtimePending: "追加検証が必要",
    riskClear: "未解決の実行検証リスクはありません", riskPending: "現在の証拠はリリース基準に未到達です",
    nextClear: "追加の実行対応は不要", nextPending: "リリース前に実行検証を完了する",
  },
  "ko-KR": {
    offlineExecution: "실행 기록을 읽었습니다. 실제 호출 결과는 현재 채팅을 기준으로 확인하세요",
    independentReview: "추가 독립 검증이 활성화되지 않았거나 완료 대기 중입니다.",
    handoff: (count) => `${count}개의 실행 작업을 배정했으며 완료 후 함께 병합하고 검토합니다.`,
    blockers: (count, approval) => count > 0
      ? `계속하려면 ${count}개 항목을 먼저 처리해야 합니다.`
      : approval ? "다음 변경은 승인 후 진행됩니다." : "현재 사용자 조치가 필요한 차단 요소가 없습니다.",
    result: "결과", risk: "위험", next: "다음 작업",
    runtimeReady: "릴리스 검증 완료", runtimePending: "추가 검증 필요",
    riskClear: "남은 실행 검증 위험이 없습니다", riskPending: "현재 증거는 아직 릴리스 수준이 아닙니다",
    nextClear: "추가 실행 작업 없음", nextPending: "릴리스 전에 실행 검증 완료",
  },
});

export function resolveRunOutputLanguage(run) {
  return normalizeOutputLanguage(
    run?.artifact?.resolvedOutputLanguage ?? run?.artifact?.runReport?.language,
  ) ?? "en";
}

export function resolvePanelInvocationPresentation({ labels }) {
  const copy = getGovernedRunSurfaceLabels(labels.htmlLang).invocationPresentation;
  const panelCopy = PANEL_COPY[labels.htmlLang] ?? PANEL_COPY.en;
  // This generator reads editable offline artifacts. They are useful context, but never
  // authority for invocation, failure, availability, exact binding, or live certification.
  // Future promotion requires a separate explicit input produced by the private external
  // verifier; do not reuse any field from the editable run JSON as that interface.
  const executionState = "not_confirmed";
  const exactBindingState = "exact_binding_pending";
  const liveCertificationState = "live_certification_pending";
  const executionLabel = panelCopy.offlineExecution;
  const exactBindingLabel = copy.certificationStates[exactBindingState];
  const liveCertificationLabel = copy.certificationStates[liveCertificationState];
  return {
    executionState,
    exactBindingState,
    liveCertificationState,
    executionHeading: copy.executionLabel,
    certificationHeading: copy.certificationLabel,
    executionLabel,
    exactBindingLabel,
    liveCertificationLabel,
    independentReviewLabel: panelCopy.independentReview,
    summary: copy.summary(executionLabel, exactBindingLabel),
    tone: "neutral",
  };
}

export function buildPanelHtml({ run, contract, manifest, labels }) {
  const sectionLabels = labels.sections;
  const panelCopy = PANEL_COPY[labels.htmlLang] ?? PANEL_COPY.en;
  const invocationPresentation = resolvePanelInvocationPresentation({ run, contract, labels });
  const runtimeRows = contract.runtimeEvidence
    .map(
      (row) => `<tr>
        <td>${escapeHtml(row.runtime)}</td>
        <td>${escapeHtml(row.strictReleasePass ? panelCopy.runtimeReady : panelCopy.runtimePending)}</td>
        <td>${escapeHtml(row.strictReleasePass ? panelCopy.riskClear : panelCopy.riskPending)}</td>
        <td>${escapeHtml(row.strictReleasePass ? panelCopy.nextClear : panelCopy.nextPending)}</td>
      </tr>`
    )
    .join("\n");
  const rubricItems = contract.aiReadableRubric
    .map(
      (item) => `<li>
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(item.plainLanguageQuestion)}</span>
        <em>${escapeHtml(statusLabel(item.status, labels))}</em>
      </li>`
    )
    .join("\n");
  const blockedCount = contract.blockedReasons.filter((item) => item.gapId !== "none").length;
  return `<!doctype html>
<html lang="${escapeHtml(labels.htmlLang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(labels.panelTitle)} ${escapeHtml(run.runId)}</title>
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
    .invocation-summary { margin-bottom: 14px; color: var(--ink); font-weight: 650; }
    .verification-boundary { margin-top: 12px; color: var(--muted); }
    .status-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 12px;
    }
    .status-card {
      margin: 0;
      padding: 12px 14px;
      border: 1px solid var(--line);
      border-left: 4px solid var(--accent);
      border-radius: 6px;
      background: #f8fbfa;
    }
    .status-card[data-tone="success"] { border-left-color: var(--ok); }
    .status-card[data-tone="warning"] { border-left-color: var(--accent-2); }
    .status-card dt { color: var(--muted); font-size: 13px; }
    .status-card dd { margin: 4px 0 0; font-size: 17px; font-weight: 700; }
    .status-card dd + dd { margin-top: 8px; color: var(--muted); font-size: 14px; }
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
    <h1>${escapeHtml(labels.panelTitle)}</h1>
    <p>${escapeHtml(contract.decisionSummary.plainLanguageSummary)}</p>
    <div class="summary">
      <div class="metric"><span>${escapeHtml(labels.runId)}</span><b>${escapeHtml(contract.decisionSummary.runId)}</b></div>
      <div class="metric"><span>${escapeHtml(labels.runState)}</span><b>${escapeHtml(statusLabel(contract.decisionSummary.status, labels))}</b></div>
      <div class="metric"><span>${escapeHtml(labels.capabilityGaps)}</span><b>${escapeHtml(contract.decisionSummary.gapCount)}</b></div>
      <div class="metric"><span>${escapeHtml(labels.workerTasks)}</span><b>${escapeHtml(contract.decisionSummary.workerTaskCount)}</b></div>
    </div>
  </header>
  <main>
    <section>
      <h2>${escapeHtml(sectionLabels.decisionSummary)}</h2>
      <p>${escapeHtml(contract.decisionSummary.task)}</p>
    </section>
    <section aria-labelledby="capability-invocation-title">
      <h2 id="capability-invocation-title">${escapeHtml(invocationPresentation.executionHeading)} / ${escapeHtml(invocationPresentation.certificationHeading)}</h2>
      <p class="invocation-summary" role="status" aria-live="polite">${escapeHtml(invocationPresentation.summary)}</p>
      <div class="status-grid" role="group" aria-label="${escapeHtml(invocationPresentation.summary)}">
        <dl class="status-card" data-tone="${escapeHtml(invocationPresentation.tone)}" aria-label="${escapeHtml(`${invocationPresentation.executionHeading}: ${invocationPresentation.executionLabel}`)}">
          <dt>${escapeHtml(invocationPresentation.executionHeading)}</dt>
          <dd>${escapeHtml(invocationPresentation.executionLabel)}</dd>
        </dl>
        <dl class="status-card" data-tone="neutral" aria-label="${escapeHtml(`${invocationPresentation.certificationHeading}: ${invocationPresentation.exactBindingLabel}; ${invocationPresentation.liveCertificationLabel}`)}">
          <dt>${escapeHtml(invocationPresentation.certificationHeading)}</dt>
          <dd>${escapeHtml(invocationPresentation.exactBindingLabel)}</dd>
          <dd>${escapeHtml(invocationPresentation.liveCertificationLabel)}</dd>
        </dl>
      </div>
      <p class="verification-boundary">${escapeHtml(invocationPresentation.independentReviewLabel)}</p>
    </section>
    <section>
      <h2>${escapeHtml(sectionLabels.ownerHandoff)}</h2>
      <p>${escapeHtml(panelCopy.handoff(contract.ownerHandoff.length))}</p>
    </section>
    <section>
      <h2>${escapeHtml(sectionLabels.blockedApproval)}</h2>
      <p>${escapeHtml(panelCopy.blockers(blockedCount, contract.approvalRequest.approvalRequired === true))}</p>
    </section>
    <section>
      <h2>${escapeHtml(sectionLabels.toolEvidenceShort)}</h2>
      <table>
        <thead><tr><th>${escapeHtml(labels.tool)}</th><th>${escapeHtml(panelCopy.result)}</th><th>${escapeHtml(panelCopy.risk)}</th><th>${escapeHtml(panelCopy.next)}</th></tr></thead>
        <tbody>${runtimeRows}</tbody>
      </table>
    </section>
    <section>
      <h2>${escapeHtml(sectionLabels.aiReadableRubric)}</h2>
      <ul>${rubricItems}</ul>
    </section>
    <section>
      <h2>${escapeHtml(sectionLabels.deliverables)}</h2>
      <div class="deliverables">
        <a href="${escapeHtml(path.basename(manifest.files.readabilityReview))}">${escapeHtml(labels.deliverableLinks.readabilityReview)}</a>
        <a href="${escapeHtml(path.basename(manifest.files.rubricMarkdown))}">${escapeHtml(labels.deliverableLinks.rubricMarkdown)}</a>
        <a href="${escapeHtml(path.basename(manifest.files.rubricJson))}">${escapeHtml(labels.deliverableLinks.rubricJson)}</a>
        <a href="${escapeHtml(path.basename(manifest.files.casePack))}">${escapeHtml(labels.deliverableLinks.casePack)}</a>
      </div>
    </section>
  </main>
</body>
</html>
`;
}

function buildReadabilityReview({ run, contract, labels }) {
  const sectionLabels = labels.sections;
  const readability = labels.readability;
  const rowsByField = [
    ["decisionSummary", sectionLabels.decisionSummary, readability.fieldMeanings.decisionSummary],
    ["ownerHandoff", sectionLabels.ownerHandoff, readability.fieldMeanings.ownerHandoff],
    ["blockedReasons", sectionLabels.blockedApproval, readability.fieldMeanings.blockedReasons],
    ["runtimeEvidence", sectionLabels.toolEvidenceShort, readability.fieldMeanings.toolEvidence],
    ["approvalRequest", sectionLabels.wardenApproval, readability.fieldMeanings.approvalRequest],
    ["aiReadableRubric", sectionLabels.aiReadableRubric, readability.fieldMeanings.aiReadableRubric],
    ["deliverables", sectionLabels.deliverables, readability.fieldMeanings.deliverables],
  ];
  const rows = rowsByField
    .map(
      ([field, label, meaning]) =>
        `| \`${field}\` | ${label} | ${meaning} | ${readability.pageTreatment} |`
    )
    .join("\n");
  return `# ${readability.title}

${labels.runId}: \`${run.runId}\`

## ${readability.conclusionHeading}

${readability.conclusionBody}

## ${readability.fieldTranslationHeading}

| ${readability.tableHeaders.field} | ${readability.tableHeaders.humanLabel} | ${readability.tableHeaders.meaning} | ${readability.tableHeaders.pageTreatment} |
|---|---|---|---|
${rows}

## ${readability.beforeAfterHeading}

${readability.sourceContractEntry}: \`artifact.runReportPanelContract\`

${readability.visibleEntryPrefix}: \`${sectionLabels.decisionSummary}\`, \`${sectionLabels.ownerHandoff}\`, \`${sectionLabels.blockedApproval}\`, \`${sectionLabels.toolEvidenceShort}\`, \`${sectionLabels.aiReadableRubric}\`, \`${sectionLabels.deliverables}\`.

## ${readability.acceptanceHeading}

- ${readability.gapCount}: ${contract.decisionSummary.gapCount}
- ${readability.workerCount}: ${contract.decisionSummary.workerTaskCount}
- ${readability.toolEvidenceCount}: ${contract.runtimeEvidence.length}
- ${readability.canonicalDryRunWriteCount}: ${contract.approvalRequest.dryRunCanonicalWrites}

${readability.returnIfCannotExplain}
`;
}

function buildRubric({ run, contract, labels }) {
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
      pass: labels.rubric.scoringScale.pass,
      retry: labels.rubric.scoringScale.retry,
      fail: labels.rubric.scoringScale.fail,
    },
    criteria,
  };
}

function buildRubricMarkdown(rubric, labels) {
  const sections = rubric.criteria
    .map(
      (item) => `## ${item.label}

- ${labels.rubric.humanQuestion}: ${item.question}
- ${labels.rubric.passStandard}: ${item.passStandard}
- ${labels.rubric.failStandard}: ${item.failStandard}
- ${labels.rubric.evidencePath}: ${item.evidencePath.map((entry) => `\`${entry}\``).join(", ")}
- ${labels.rubric.reviewerScore}: ${labels.rubric.pending}
- ${labels.rubric.reviewerNotes}: ${labels.rubric.pending}
`
    )
    .join("\n");
  return `# ${labels.rubric.title}

${labels.runId}: \`${rubric.runId}\`

${labels.rubric.scoringIntro}

${sections}`;
}

function buildCasePack({ run, contract, manifest, labels }) {
  const sectionLabels = labels.sections;
  const casePack = labels.casePack;
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
  return `# ${casePack.title}

${labels.runId}: \`${run.runId}\`

## ${casePack.reviewerShouldSeeHeading}

${casePack.reviewerShouldSeeIntro(contract.decisionSummary.plainLanguageSummary)}

${casePack.reviewerShouldSeeThen(sectionLabels.toolEvidenceShort)}

## ${casePack.reviewerScoringHeading}

${casePack.reviewerScoringBody(path.basename(manifest.files.rubricMarkdown), path.basename(manifest.files.rubricJson))}

## ${casePack.designEvidenceHeading}

- ${casePack.taskLabel}: ${contract.decisionSummary.task}
- ${labels.capabilityGaps}：${contract.decisionSummary.gapCount}
- ${casePack.synthesisOwnerLabel}: ${contract.decisionSummary.synthesisOwner}

## ${casePack.executionEvidenceHeading}

| ${labels.role} | ${labels.owner} | ${labels.taskScope} | ${labels.mergeOwner} |
|---|---|---|---|
${ownerRows}

## ${casePack.acceptanceEvidenceHeading}

| ${labels.tool} | ${labels.evidenceKind} | ${labels.failureClass} | ${labels.remainingAction} |
|---|---|---|---|
${runtimeRows}

## ${casePack.feedbackEvidenceHeading}

- ${casePack.wardenApprovalRequired}: ${contract.approvalRequest.approvalRequired}
- ${casePack.canonicalDryRunWrites}: ${contract.approvalRequest.dryRunCanonicalWrites}
- ${labels.remainingAction}: ${contract.approvalRequest.nextAction}

## ${sectionLabels.deliverables}

- ${casePack.staticPanel}: \`${path.basename(manifest.files.panelHtml)}\`
- ${casePack.readabilityReview}: \`${path.basename(manifest.files.readabilityReview)}\`
- ${casePack.rubricMarkdown}: \`${path.basename(manifest.files.rubricMarkdown)}\`
- ${casePack.rubricJson}: \`${path.basename(manifest.files.rubricJson)}\`
- ${casePack.manifest}: \`${path.basename(manifest.files.manifest)}\`

## ${casePack.passFailExamplesHeading}

${casePack.passExample}

${casePack.failExample}
`;
}

export async function generateRunDeliverables({
  runId = "latest",
  stateDir = DEFAULT_STATE_DIR,
  outDir = null,
} = {}) {
  const run = await readGovernedExecutionRun({ runId, stateDir });
  const contract = requirePanelContract(run);
  const outputLanguage = resolveRunOutputLanguage(run);
  const baseOutDir = outDir
    ? path.resolve(outDir)
    : path.join(path.dirname(run.paths.json), `${run.runId}-deliverables`);
  await reportContext.ensureDirectory(baseOutDir);

  const files = {
    panelHtml: path.join(baseOutDir, "run-panel.html"),
    readabilityReview: path.join(baseOutDir, `readability-review.${outputLanguage}.md`),
    rubricMarkdown: path.join(baseOutDir, `ai-readable-rubric.${outputLanguage}.md`),
    rubricJson: path.join(baseOutDir, "ai-readable-rubric.json"),
    casePack: path.join(baseOutDir, `ai-readable-case-pack.${outputLanguage}.md`),
    manifest: path.join(baseOutDir, "deliverables-manifest.json"),
  };
  const labels = getReportLabels(outputLanguage);
  const manifest = {
    schemaVersion: "meta-theory-run-deliverables-v0.1",
    runId: run.runId,
    status: "pass",
    productTasks: labels.productTasks.map((task) => ({ ...task, status: "pass" })),
    files: Object.fromEntries(
      Object.entries(files).map(([key, filePath]) => [key, relativeToRepo(filePath)])
    ),
    source: {
      runArtifact: relativeToRepo(run.paths.json),
      report: relativeToRepo(run.paths.markdown),
      panelContract: "artifact.runReportPanelContract",
    },
  };
  const rubric = buildRubric({ run, contract, labels });
  const panelHtml = buildPanelHtml({ run, contract, manifest, labels });
  const outputs = {
    [files.panelHtml]: panelHtml,
    [files.readabilityReview]: buildReadabilityReview({ run, contract, labels }),
    [files.rubricMarkdown]: buildRubricMarkdown(rubric, labels),
    [files.rubricJson]: `${JSON.stringify(rubric, null, 2)}\n`,
    [files.casePack]: buildCasePack({ run, contract, manifest, labels }),
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
    await reportContext.writeText(filePath, content);
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
