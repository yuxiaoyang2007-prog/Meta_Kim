#!/usr/bin/env node

import process from "node:process";
import { fileURLToPath } from "node:url";

const EXPLICIT_META_THEORY_RE =
  /(?:^|\b)(?:\/?meta-theory|meta theory|run meta theory|execute meta theory)(?:\b|$)|元理论/u;

const ACTION_RE =
  /\b(?:build|create|implement|fix|repair|change|update|refactor|plan|start|handle|organize|prioritize|verify|review|audit|generate|write|sync)\b|(?:帮我|开始|处理|整理|规划|修复|验证|审查|检查|生成|写|改|优化|同步)/iu;

const DURABLE_OUTPUT_RE =
  /\b(?:plan|checklist|priority|priorities|recommendation|recommendations|verification|audit|report|artifact|implementation|fixes|tests?)\b|(?:优先级|修复建议|验证清单|计划|报告|产物|测试|清单|建议)/iu;

const PURE_QUERY_RE =
  /^(?:what|why|how|when|where|who|is|are|can|could|should)\b|^(?:什么|为什么|怎么|如何|是否|能否|可以|介绍|解释|说明)/iu;

const CHINESE_QUERY_WORD_RE = /(?:什么|为什么|怎么|如何|是否|能否|可以吗|吗|介绍|解释|说明)/u;

const SUBJECTIVE_QUALITY_RE =
  /\b(?:good|bad|beautiful|ugly|smooth|professional|premium|advanced|clean|simple|fast|slow|feels off|hard to use)\b|(?:好看|不好看|顺畅|不顺|高级|专业|简洁|太慢|太快|难用|怪|不对劲)/iu;

const FILE_OR_MUTATION_RE =
  /\b(?:file|code|repo|repository|project|app|page|component|test|config|contract|script)\b|(?:文件|代码|仓库|项目|页面|组件|测试|配置|合同|脚本)/iu;

const PRODUCT_BUILD_OBJECT_RE =
  /\b(?:app|web app|dashboard|platform|tool|saas|automation|publisher|scheduler|workflow)\b|(?:系统|平台|工具|应用|网站|面板|看板|自动发布器|发布器|营销.*器|自动化|工作流|小红书)/iu;

const PROJECT_UNDERSTANDING_RE =
  /\b(?:project|repo|repository|codebase|architecture|commerciali[sz]e|market|competitor|business model|strategy|roadmap)\b|(?:项目|仓库|代码库|架构|怎么玩|干啥|做什么|商业化|市场|竞品|商业模式|发展|路线图|战略)/iu;

const PARALLEL_AGENT_RE =
  /\b(?:parallel|subagents?|agent team|multi-agent|fan[- ]?out|delegate|spawn|review\s*\+\s*fix\s*\+\s*verify)\b|(?:并行|子智能体|子agent|多个\s*agent|多智能体|编排|分工|派发|噼里啪啦)/iu;

const COMPLEXITY_COMPLAINT_RE =
  /\b(?:too slow|slow|serial|not using agents?|missing agents?|no agents?)\b|(?:太慢|慢|不用\s*agent|没用\s*agent|没有\s*agent|没看到.*agent|串行|不会判断.*复杂|做的.*差)/iu;

const MULTI_LANE_WORD_RE =
  /\b(?:review|fix|verify|test|release|sync|hook|security|frontend|backend|database|api|docs|research|runtime|mcp|tool|agent|skill)\b|(?:审查|修复|验证|测试|发布|同步|钩子|安全|前端|后端|数据库|接口|文档|调研|运行时|工具|智能体|技能)/giu;

function normalizePrompt(prompt) {
  return String(prompt ?? "").trim();
}

function hasQuestionOnlyShape(text) {
  if (!PURE_QUERY_RE.test(text) && !CHINESE_QUERY_WORD_RE.test(text)) return false;
  if (ACTION_RE.test(text) && DURABLE_OUTPUT_RE.test(text)) return false;
  if (FILE_OR_MUTATION_RE.test(text) && ACTION_RE.test(text)) return false;
  return true;
}

function countDistinctMatches(text, regex) {
  return new Set([...String(text ?? "").matchAll(regex)].map((match) => match[0].toLowerCase())).size;
}

function estimateIndependentLaneCount(text, {
  explicitMetaTheory,
  productBuildIntent,
  durableOutputIntent,
  fileOrMutationIntent,
}) {
  const lineCount = normalizePrompt(text).split(/\n+/u).filter(Boolean).length;
  const multiLaneTerms = countDistinctMatches(text, MULTI_LANE_WORD_RE);
  const commaLikeSegments = normalizePrompt(text).split(/[，,、；;]+/u).filter((item) => item.trim()).length;
  const base = Math.max(lineCount, multiLaneTerms, commaLikeSegments > 2 ? commaLikeSegments : 1);
  if (productBuildIntent) return Math.max(base, 4);
  if (/review\s*\+\s*fix\s*\+\s*verify|审查.*修复.*验证|修复.*测试.*发布/iu.test(text)) {
    return Math.max(base, 3);
  }
  if (explicitMetaTheory && (durableOutputIntent || fileOrMutationIntent || base >= 2)) {
    return Math.max(base, 2);
  }
  return base;
}

function buildFanoutSignals(text, context) {
  const signals = [];
  if (context.explicitMetaTheory) signals.push("explicit_meta_theory_authorization");
  if (/critical\s+and\s+fetch\s+thinking\s+and\s+review/iu.test(text)) {
    signals.push("critical_fetch_thinking_review_requested");
  }
  if (PARALLEL_AGENT_RE.test(text)) signals.push("parallel_agent_or_fanout_requested");
  if (COMPLEXITY_COMPLAINT_RE.test(text)) signals.push("user_reported_serial_or_slow_agent_route");
  if (context.productBuildIntent) signals.push("product_build_has_multiple_execution_lanes");
  if (context.durableOutputIntent && context.fileOrMutationIntent) {
    signals.push("durable_output_plus_repo_mutation");
  }
  if (context.expectedIndependentLaneCount >= 2) {
    signals.push("multiple_independent_lane_terms_detected");
  }
  return [...new Set(signals)];
}

function buildFanoutMetadata(text, context) {
  const expectedIndependentLaneCount = estimateIndependentLaneCount(text, context);
  const directParallelAgentRequest = PARALLEL_AGENT_RE.test(text);
  const signals = buildFanoutSignals(text, {
    ...context,
    expectedIndependentLaneCount,
  });
  const fanoutEligible = expectedIndependentLaneCount >= 2 && (
    signals.length >= 2 ||
    directParallelAgentRequest ||
    (context.explicitMetaTheory && signals.length >= 1)
  );
  return {
    fanoutEligible,
    fanoutSignals: fanoutEligible ? signals : signals.filter((signal) => signal !== "explicit_meta_theory_authorization"),
    expectedIndependentLaneCount,
    requiresSubagentAuthorization:
      fanoutEligible && !context.explicitMetaTheory && !directParallelAgentRequest,
    subagentAuthorizationSource: !fanoutEligible
      ? "not_required"
      : context.explicitMetaTheory
        ? "explicit_meta_theory"
        : directParallelAgentRequest
          ? "direct_parallel_agent_request"
          : "native_choice_surface_required",
  };
}

function withFanoutMetadata(base, text, context) {
  return {
    ...base,
    ...buildFanoutMetadata(text, context),
  };
}

export function classifyMetaTheoryEntry(prompt) {
  const text = normalizePrompt(prompt);
  const lower = text.toLowerCase();
  const explicitMetaTheory = EXPLICIT_META_THEORY_RE.test(text);
  const subjectiveQuality = SUBJECTIVE_QUALITY_RE.test(text);
  const actionIntent = ACTION_RE.test(text);
  const durableOutputIntent = DURABLE_OUTPUT_RE.test(text);
  const fileOrMutationIntent = FILE_OR_MUTATION_RE.test(text);
  const productBuildIntent = actionIntent && PRODUCT_BUILD_OBJECT_RE.test(text);
  const projectUnderstandingIntent = PROJECT_UNDERSTANDING_RE.test(text);
  const pureQuery = hasQuestionOnlyShape(text);
  const fanoutContext = {
    explicitMetaTheory,
    productBuildIntent,
    durableOutputIntent,
    fileOrMutationIntent,
  };

  if (!text) {
    return withFanoutMetadata({
      governedEntry: false,
      path: "fast_path",
      taskClassification: "empty_input",
      triggerReason: "empty_input",
      choiceSurfaceState: "not_allowed",
      shouldAskBeforeFetch: false,
      confidence: 1,
    }, text, fanoutContext);
  }

  if (explicitMetaTheory) {
    return withFanoutMetadata({
      governedEntry: true,
      path: "regulated_path",
      taskClassification: "meta_theory_explicit",
      triggerReason: "explicit_meta_theory",
      choiceSurfaceState: "not_allowed",
      shouldAskBeforeFetch: false,
      confidence: 1,
    }, text, fanoutContext);
  }

  if (subjectiveQuality && actionIntent) {
    return withFanoutMetadata({
      governedEntry: true,
      path: "standard_path",
      taskClassification: "meta_theory_auto",
      triggerReason: "subjective_quality_ambiguous",
      choiceSurfaceState: "critical_clarification_allowed",
      shouldAskBeforeFetch: true,
      confidence: 0.9,
    }, text, fanoutContext);
  }

  if (actionIntent && (durableOutputIntent || fileOrMutationIntent || productBuildIntent)) {
    return withFanoutMetadata({
      governedEntry: true,
      path: "standard_path",
      taskClassification: "meta_theory_auto",
      triggerReason: durableOutputIntent
        ? "natural_language_durable_work"
        : productBuildIntent
          ? "natural_language_product_build"
          : "natural_language_execution_work",
      choiceSurfaceState: "not_allowed",
      shouldAskBeforeFetch: false,
      confidence: productBuildIntent && !durableOutputIntent ? 0.82 : 0.86,
    }, text, fanoutContext);
  }

  if (projectUnderstandingIntent) {
    return withFanoutMetadata({
      governedEntry: true,
      path: "standard_path",
      taskClassification: "meta_theory_auto",
      triggerReason: "project_understanding_requires_fetch",
      choiceSurfaceState: "not_allowed",
      shouldAskBeforeFetch: false,
      confidence: 0.84,
    }, text, fanoutContext);
  }

  if (pureQuery) {
    return withFanoutMetadata({
      governedEntry: false,
      path: "fast_path",
      taskClassification: "pure_query",
      triggerReason: "pure_query",
      choiceSurfaceState: "not_allowed",
      shouldAskBeforeFetch: false,
      confidence: 0.84,
    }, text, fanoutContext);
  }

  if (lower.includes("?") || text.includes("？")) {
    return withFanoutMetadata({
      governedEntry: false,
      path: "fast_path",
      taskClassification: "read_only_question",
      triggerReason: "read_only_question",
      choiceSurfaceState: "not_allowed",
      shouldAskBeforeFetch: false,
      confidence: 0.7,
    }, text, fanoutContext);
  }

  return withFanoutMetadata({
    governedEntry: false,
    path: "fast_path",
    taskClassification: "unclassified_low_signal",
    triggerReason: "no_governance_trigger",
    choiceSurfaceState: "not_allowed",
    shouldAskBeforeFetch: false,
    confidence: 0.55,
  }, text, fanoutContext);
}

function main() {
  const prompt = process.argv.slice(2).join(" ");
  process.stdout.write(`${JSON.stringify(classifyMetaTheoryEntry(prompt), null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
