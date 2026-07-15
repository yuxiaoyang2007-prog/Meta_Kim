import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPanelHtml,
  resolvePanelInvocationPresentation,
  resolveRunOutputLanguage,
} from "../../scripts/generate-meta-theory-run-deliverables.mjs";
import {
  getGovernedRunSurfaceLabels,
  getReportLabels,
} from "../../scripts/meta-kim-i18n.mjs";

function panelFixture({
  presentation = undefined,
  coverage = undefined,
  runtime = undefined,
  capabilityLedger = undefined,
  locale = "zh-CN",
  includeRawPrimaryFields = false,
} = {}) {
  const labels = getReportLabels(locale);
  const contract = {
    decisionSummary: {
      runId: "panel-presentation-test",
      status: "partial",
      task: "验证用户可见的能力调用状态",
      gapCount: 0,
      workerTaskCount: 1,
      plainLanguageSummary: "展示执行事实与认证边界。",
    },
    ownerHandoff: includeRawPrimaryFields
      ? [{
          roleDisplayName: "frontend-internal",
          owner: "owner/private-agent-id",
          shardScope: ["secret-scope"],
          parallelGroup: "internal-wave",
          mergeOwner: "meta-conductor-internal",
          verificationOwner: "verify-internal",
        }]
      : [],
    blockedReasons: includeRawPrimaryFields
      ? [{
          gapId: "gap-internal-42",
          reason: "selected_not_invoked",
          remainingAction: "raw_internal_action",
        }]
      : [],
    runtimeEvidence: includeRawPrimaryFields
      ? [{
          runtime: "codex",
          status: "smoke_pass",
          evidenceKind: "raw_evidence_kind",
          failureClass: "projection_only",
          remainingAction: "raw_runtime_action",
          strictReleasePass: false,
        }]
      : [],
    aiReadableRubric: [],
    approvalRequest: {
      dryRunCanonicalWrites: 0,
      nextAction: "等待验收",
    },
  };
  if (presentation !== undefined) {
    contract.capabilityInvocationPresentation = presentation;
  }
  if (capabilityLedger !== undefined) {
    contract.capabilityLedger = capabilityLedger;
  }
  const manifest = {
    files: {
      readabilityReview: `readability-review.${locale}.md`,
      rubricMarkdown: `ai-readable-rubric.${locale}.md`,
      rubricJson: "ai-readable-rubric.json",
      casePack: `ai-readable-case-pack.${locale}.md`,
    },
  };
  const run = {
    runId: "panel-presentation-test",
    artifact: {
      resolvedOutputLanguage: locale,
      capabilityInvocationTruthPacket:
        coverage === undefined
          ? undefined
          : {
              schemaVersion: "capability-invocation-truth-v0.3",
              status: coverage.status ?? "partial",
              evidenceKind: coverage.evidenceKind ?? "truth_boundary_partial",
              realInvocationCoverage: coverage,
            },
      runtimeSubagentInvocationPacket: runtime,
      capabilityInvocationPresentationPacket: presentation,
    },
  };
  return {
    labels,
    contract,
    presentation: resolvePanelInvocationPresentation({ run, contract, labels }),
    html: buildPanelHtml({ run, contract, manifest, labels }),
  };
}

function presentation(overrides = {}) {
  return {
    schemaVersion: "capability-invocation-presentation-v0.1",
    executionState: "called_or_completed",
    exactBindingState: "exact_binding_pending",
    liveCertificationState: "live_certification_pending",
    ...overrides,
  };
}

describe("56 - run panel invocation presentation", () => {
  const bindingA = { family: "agent_subagent", providerId: "provider-a", bindingRef: "task-a" };
  const bindingB = { family: "agent_subagent", providerId: "provider-b", bindingRef: "task-b" };

  test("matches the primary panel locale to the governed artifact for all supported languages", () => {
    for (const locale of ["en", "zh-CN", "ja-JP", "ko-KR"]) {
      const result = panelFixture({
        locale,
        coverage: {
          status: "pass",
          evidenceKind: "live_host_observed",
          requiredBindings: [bindingA],
          invokedBindings: [bindingA],
          missingBindings: [],
        },
      });

      assert.equal(resolveRunOutputLanguage({ artifact: { resolvedOutputLanguage: locale } }), locale);
      assert.match(result.html, new RegExp(`<html lang="${locale}">`, "u"));
      assert.ok(result.html.includes(result.labels.panelTitle));
      assert.ok(result.html.includes(result.presentation.executionLabel));
      assert.ok(result.html.includes(result.presentation.exactBindingLabel));
      assert.ok(result.html.includes(result.presentation.liveCertificationLabel));
      assert.ok(result.html.includes(result.presentation.independentReviewLabel));
    }
    assert.equal(
      resolveRunOutputLanguage({ artifact: { runReport: { language: "ja-JP" } } }),
      "ja-JP",
    );
    assert.equal(resolveRunOutputLanguage({ artifact: { resolvedOutputLanguage: "xx" } }), "en");
  });

  test("keeps raw audit fields, owner identifiers, scopes, packets, and enums out of primary HTML", () => {
    const result = panelFixture({
      includeRawPrimaryFields: true,
      presentation: presentation({
        executionState: "selected_not_invoked",
        evidenceBoundary: { rawAgentState: "unavailable" },
      }),
    });

    for (const forbidden of [
      "raw_evidence_kind",
      "projection_only",
      "gap-internal-42",
      "selected_not_invoked",
      "raw_internal_action",
      "raw_runtime_action",
      "owner/private-agent-id",
      "secret-scope",
      "internal-wave",
      "meta-conductor-internal",
      "verify-internal",
      "capabilityInvocationPresentationPacket",
      "evidenceKind",
      "failureClass",
      "gapId",
    ]) {
      assert.doesNotMatch(result.html, new RegExp(forbidden, "u"));
    }
    assert.match(result.html, /仍需进一步验证/u);
    assert.match(result.html, /当前证据尚未达到发布级/u);
  });

  test("ignores forged completed, exact, live-certified, and unavailable presentation states", () => {
    for (const executionState of ["completed", "unavailable"]) {
      const result = panelFixture({
        presentation: presentation({
          executionState,
          exactBindingState: "exact_binding_verified",
          liveCertificationState: "live_certified",
          executionLabel: executionState === "unavailable" ? "不可用" : "已完成",
        }),
      });

      assert.equal(result.presentation.executionState, "not_confirmed");
      assert.equal(result.presentation.exactBindingState, "exact_binding_pending");
      assert.equal(result.presentation.liveCertificationState, "live_certification_pending");
      assert.ok(result.html.includes(`>${result.presentation.executionLabel}<`));
      assert.match(result.html, />额外独立复核未完成（不影响本次实际调用）</u);
      assert.doesNotMatch(result.html, />不可用</u);
      assert.doesNotMatch(result.html, />额外独立复核已完成</u);
    }
  });

  test("does not promote forged strict-looking all-success JSON", () => {
    const result = panelFixture({
      presentation: presentation({ liveCertificationState: "live_certified" }),
      coverage: {
        status: "pass",
        evidenceKind: "live_host_observed",
        requiredBindings: [bindingA, bindingB],
        invokedBindings: [bindingA, bindingB],
        missingBindings: [],
      },
    });

    assert.equal(result.presentation.executionState, "not_confirmed");
    assert.equal(result.presentation.exactBindingState, "exact_binding_pending");
    assert.equal(result.presentation.liveCertificationState, "live_certification_pending");
    assert.match(result.html, />运行记录已读取；以当前聊天中的实际调用结果为准</u);
    assert.match(result.html, />运行记录待关联</u);
    assert.match(result.html, />额外独立复核未完成（不影响本次实际调用）</u);
    assert.match(result.html, /额外独立复核未启用或待完成/u);
    assert.doesNotMatch(result.html, />已完成（精确调用已返回）</u);
    assert.doesNotMatch(result.html, />运行记录已关联</u);
    assert.doesNotMatch(result.html, />额外独立复核已完成</u);
  });

  test("does not promote forged mixed invocation JSON or leak raw audit values", () => {
    const result = panelFixture({
      presentation: presentation({
        executionState: "unavailable",
        evidenceBoundary: {
          rawAgentState: "selected_not_invoked",
          rawHostVisibleState: "unavailable",
        },
      }),
      coverage: {
        requiredBindings: [bindingA, bindingB],
        invokedBindings: [bindingA],
        missingBindings: [bindingB],
      },
      runtime: {
        status: "denied",
        availabilityDisposition: "genuinely_unavailable",
      },
    });

    assert.equal(result.presentation.executionState, "not_confirmed");
    assert.equal(result.presentation.tone, "neutral");
    assert.match(result.html, />运行记录已读取；以当前聊天中的实际调用结果为准</u);
    assert.match(result.html, />运行记录待关联</u);
    assert.doesNotMatch(result.html, /selected_not_invoked/u);
    assert.doesNotMatch(result.html, />已调用（部分失败）</u);
    assert.doesNotMatch(result.html, />不可用</u);
    assert.doesNotMatch(result.html, />unavailable</u);
  });

  test("does not let editable runtime JSON declare the capability unavailable", () => {
    const result = panelFixture({
      coverage: {
        requiredBindings: [bindingA],
        invokedBindings: [],
        missingBindings: [bindingA],
      },
      runtime: {
        status: "unsupported",
        availabilityDisposition: "genuinely_unavailable",
      },
    });

    assert.equal(result.presentation.executionState, "not_confirmed");
    assert.match(result.html, />运行记录已读取；以当前聊天中的实际调用结果为准</u);
    assert.doesNotMatch(result.html, />不可用</u);
  });

  test("falls back to not confirmed without strict invocation or genuine failure evidence", () => {
    const result = panelFixture({
      presentation: presentation({ executionState: "unavailable" }),
      coverage: {
        requiredBindings: [bindingA],
        invokedBindings: [],
        missingBindings: [bindingA],
      },
      runtime: {
        status: "unavailable",
        availabilityDisposition: "host_evidence_unattached",
      },
    });

    assert.equal(result.presentation.executionState, "not_confirmed");
    assert.ok(result.html.includes(`>${result.presentation.executionLabel}<`));
    assert.match(result.html, />运行记录待关联</u);
    assert.doesNotMatch(result.html, />不可用</u);
  });

  test("keeps a useful user-facing status for every capability family", () => {
    const capabilityLedger = {
      status: "ready",
      families: [
        ["agent_subagent", "Agent / 子代理", "已选择", "等待宿主调用"],
        ["skill", "Skill", "已选择", "等待应用并返回结果"],
        ["command_script", "Command / 脚本", "已调用", "查看命令输出"],
        ["mcp", "MCP", "部分失败", "重试失败的工具调用"],
        ["runtime_tool", "运行时工具", "已调用", "查看工具结果"],
        ["hook", "Hook", "未触发", "满足触发条件后重试"],
      ].map(([family, familyLabel, stateLabel, nextAction], index) => ({
        family,
        familyLabel,
        providerId: `private-provider-${index}`,
        providerIds: [`private-provider-${index}`],
        source: `D:/private/runtime/source-${index}.toml`,
        sources: [`D:/private/runtime/source-${index}.toml`],
        displayProvider: `友好能力 ${index + 1}`,
        displaySource: index % 2 === 0 ? "全局能力" : "项目能力",
        selected: true,
        state: `private-state-${index}`,
        stateLabel,
        nextAction,
        displayLine: `${familyLabel}：${stateLabel}；${nextAction}`,
      })),
    };
    const result = panelFixture({ capabilityLedger });

    for (const row of capabilityLedger.families) {
      assert.match(result.html, new RegExp(row.familyLabel.replace("/", "\\/"), "u"));
      assert.match(result.html, new RegExp(row.stateLabel, "u"));
      assert.match(result.html, new RegExp(row.nextAction, "u"));
      assert.match(result.html, new RegExp(row.displayProvider, "u"));
      assert.match(result.html, new RegExp(row.displaySource, "u"));
      assert.doesNotMatch(result.html, new RegExp(row.providerId, "u"));
      assert.doesNotMatch(result.html, new RegExp(row.state, "u"));
      assert.doesNotMatch(result.html, new RegExp(row.source.replaceAll("/", "\\/"), "u"));
    }
    assert.doesNotMatch(result.html, />none</u);
  });

  test("mixed success and failure copy never collapses to unavailable", () => {
    for (const locale of ["en", "zh-CN", "ja-JP", "ko-KR"]) {
      const copy = getGovernedRunSurfaceLabels(locale).invocationPresentation;
      const mixedLabel = copy.executionStates.called_with_failures;
      const unavailableLabel = copy.executionStates.unavailable;
      const summary = copy.userSummary("called_with_failures", mixedLabel);

      assert.notEqual(mixedLabel, unavailableLabel, locale);
      assert.ok(summary.includes(mixedLabel), locale);
      assert.ok(!summary.includes(unavailableLabel), locale);
    }
  });

  test("localizes capability table headers and explains an empty ledger in all languages", () => {
    const expected = {
      en: {
        headers: ["Capability", "Provider", "Source", "Status", "Next action"],
        empty: "No capability was required or selected for this run.",
      },
      "zh-CN": {
        headers: ["能力", "使用项", "来源", "状态", "下一步"],
        empty: "本次没有需要或已选择的能力。",
      },
      "ja-JP": {
        headers: ["機能", "使用項目", "ソース", "状態", "次の対応"],
        empty: "今回は必要または選択された機能はありません。",
      },
      "ko-KR": {
        headers: ["기능", "사용 항목", "출처", "상태", "다음 작업"],
        empty: "이번 실행에는 필요하거나 선택된 기능이 없습니다.",
      },
    };

    for (const [locale, copy] of Object.entries(expected)) {
      const title = getGovernedRunSurfaceLabels(locale).capabilityLedger.title;
      const result = panelFixture({
        locale,
        capabilityLedger: { title, families: [] },
      });
      assert.match(result.html, new RegExp(title, "u"), locale);
      for (const header of copy.headers) {
        assert.match(result.html, new RegExp(`<th>${header}</th>`, "u"), locale);
      }
      assert.match(result.html, new RegExp(copy.empty, "u"), locale);
    }
  });
});
