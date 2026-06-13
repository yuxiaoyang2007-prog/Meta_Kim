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

function normalizePrompt(prompt) {
  return String(prompt ?? "").trim();
}

function hasQuestionOnlyShape(text) {
  if (!PURE_QUERY_RE.test(text) && !CHINESE_QUERY_WORD_RE.test(text)) return false;
  if (ACTION_RE.test(text) && DURABLE_OUTPUT_RE.test(text)) return false;
  if (FILE_OR_MUTATION_RE.test(text) && ACTION_RE.test(text)) return false;
  return true;
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

  if (!text) {
    return {
      governedEntry: false,
      path: "fast_path",
      taskClassification: "empty_input",
      triggerReason: "empty_input",
      choiceSurfaceState: "not_allowed",
      shouldAskBeforeFetch: false,
      confidence: 1,
    };
  }

  if (explicitMetaTheory) {
    return {
      governedEntry: true,
      path: "regulated_path",
      taskClassification: "meta_theory_explicit",
      triggerReason: "explicit_meta_theory",
      choiceSurfaceState: "not_allowed",
      shouldAskBeforeFetch: false,
      confidence: 1,
    };
  }

  if (subjectiveQuality && actionIntent) {
    return {
      governedEntry: true,
      path: "standard_path",
      taskClassification: "meta_theory_auto",
      triggerReason: "subjective_quality_ambiguous",
      choiceSurfaceState: "critical_clarification_allowed",
      shouldAskBeforeFetch: true,
      confidence: 0.9,
    };
  }

  if (actionIntent && (durableOutputIntent || fileOrMutationIntent || productBuildIntent)) {
    return {
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
    };
  }

  if (projectUnderstandingIntent) {
    return {
      governedEntry: true,
      path: "standard_path",
      taskClassification: "meta_theory_auto",
      triggerReason: "project_understanding_requires_fetch",
      choiceSurfaceState: "not_allowed",
      shouldAskBeforeFetch: false,
      confidence: 0.84,
    };
  }

  if (pureQuery) {
    return {
      governedEntry: false,
      path: "fast_path",
      taskClassification: "pure_query",
      triggerReason: "pure_query",
      choiceSurfaceState: "not_allowed",
      shouldAskBeforeFetch: false,
      confidence: 0.84,
    };
  }

  if (lower.includes("?") || text.includes("？")) {
    return {
      governedEntry: false,
      path: "fast_path",
      taskClassification: "read_only_question",
      triggerReason: "read_only_question",
      choiceSurfaceState: "not_allowed",
      shouldAskBeforeFetch: false,
      confidence: 0.7,
    };
  }

  return {
    governedEntry: false,
    path: "fast_path",
    taskClassification: "unclassified_low_signal",
    triggerReason: "no_governance_trigger",
    choiceSurfaceState: "not_allowed",
    shouldAskBeforeFetch: false,
    confidence: 0.55,
  };
}

function main() {
  const prompt = process.argv.slice(2).join(" ");
  process.stdout.write(`${JSON.stringify(classifyMetaTheoryEntry(prompt), null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
