import process from "node:process";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readJsonFromStdin } from "./utils.mjs";
import {
  readSpineState,
  readSpineStateIncludingInactive,
  writeSpineState,
  createInitialState,
} from "./spine-state.mjs";

const cwd = process.cwd();
const payload = await readJsonFromStdin();
const toolName = payload?.tool_name ?? "";
const toolInput = payload?.tool_input ?? {};
const packageRootArgIndex = process.argv.indexOf("--package-root");
const packageRoot =
  packageRootArgIndex >= 0 && process.argv[packageRootArgIndex + 1]
    ? process.argv[packageRootArgIndex + 1]
    : process.env.META_KIM_PACKAGE_ROOT || null;

const EXPLICIT_META_THEORY_RE =
  /(?:^|\b)(?:\/?meta-theory|meta theory|run meta theory|execute meta theory)(?:\b|$)|元理论/u;
const CRITICAL_FETCH_THINKING_RE =
  /critical[\s\S]{0,80}fetch[\s\S]{0,80}thinking[\s\S]{0,80}review|critical\s+and\s+fetch\s+thinking\s+and\s+review|深度.*(?:fetch|检索|研究).*review|critical.*review/iu;
const ACTION_RE =
  /\b(?:build|create|implement|fix|repair|change|update|refactor|plan|start|handle|organize|prioritize|verify|review|audit|generate|write|sync|release|publish|ship|commit|push)\b|(?:帮我|开始|处理|整理|规划|修复|验证|审查|检查|生成|写|改|优化|同步|提交|推送|发布|更新|实机测试)/iu;
const DURABLE_OUTPUT_RE =
  /\b(?:plan|checklist|priority|priorities|recommendation|recommendations|verification|audit|report|artifact|implementation|fixes|tests?|release notes?|changelog|version)\b|(?:优先级|修复建议|验证清单|计划|报告|产物|测试|清单|建议|更新记录|版本|发布)/iu;
const FILE_OR_MUTATION_RE =
  /\b(?:file|code|repo|repository|project|app|page|component|test|config|contract|script|hook|runtime|release|version)\b|(?:文件|代码|仓库|项目|页面|组件|测试|配置|合同|脚本|钩子|运行时|发布|版本)/iu;
const PRODUCT_BUILD_OBJECT_RE =
  /\b(?:app|web app|dashboard|platform|tool|saas|automation|publisher|scheduler|workflow)\b|(?:系统|平台|工具|应用|网站|面板|看板|自动发布器|发布器|营销.*器|自动化|工作流|小红书)/iu;
const PROJECT_UNDERSTANDING_RE =
  /\b(?:project|repo|repository|codebase|architecture|commerciali[sz]e|market|competitor|business model|strategy|roadmap)\b|(?:项目|仓库|代码库|架构|怎么玩|干啥|做什么|商业化|市场|竞品|商业模式|发展|路线图|战略)/iu;
const SUBJECTIVE_QUALITY_RE =
  /\b(?:good|bad|beautiful|ugly|smooth|professional|premium|advanced|clean|simple|fast|slow|feels off|hard to use)\b|(?:好看|不好看|顺畅|不顺|高级|专业|简洁|太慢|太快|难用|怪|不对劲)/iu;
const CONTINUATION_REQUEST_RE =
  /\b(?:continue|resume|continuation|current\s+run|active\s+run|same\s+run)\b|(?:继续|续跑|接着|恢复|当前\s*run|active\s*run|同一个\s*run|不要重启|不重启)/iu;

const DEFAULT_STALE_MINUTES = 360;

function getRawPromptText() {
  const candidates = [
    payload?.prompt,
    payload?.user_prompt,
    payload?.hook_input?.prompt,
    payload?.hook_input?.user_prompt,
    payload?.input,
    payload?.text,
    payload?.message,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function getPromptText() {
  return getRawPromptText().toLowerCase();
}

function getSkillName() {
  return (
    toolInput?.skill_name ||
    toolInput?.name ||
    toolInput?.skill ||
    ""
  ).toLowerCase();
}

function classifyPromptActivation(promptText) {
  if (!promptText) {
    return {
      triggered: false,
      taskClassification: "empty_input",
      triggerReason: "empty_input",
    };
  }
  if (EXPLICIT_META_THEORY_RE.test(promptText)) {
    return {
      triggered: true,
      taskClassification: "meta_theory_explicit",
      triggerReason: "explicit_meta_theory",
    };
  }
  if (CRITICAL_FETCH_THINKING_RE.test(promptText)) {
    return {
      triggered: true,
      taskClassification: "meta_theory_auto",
      triggerReason: "critical_fetch_thinking_review_requested",
    };
  }
  const actionIntent = ACTION_RE.test(promptText);
  const durableOutputIntent = DURABLE_OUTPUT_RE.test(promptText);
  const fileOrMutationIntent = FILE_OR_MUTATION_RE.test(promptText);
  const productBuildIntent = actionIntent && PRODUCT_BUILD_OBJECT_RE.test(promptText);
  if (SUBJECTIVE_QUALITY_RE.test(promptText) && actionIntent) {
    return {
      triggered: true,
      taskClassification: "meta_theory_auto",
      triggerReason: "subjective_quality_ambiguous",
    };
  }
  if (actionIntent && (durableOutputIntent || fileOrMutationIntent || productBuildIntent)) {
    return {
      triggered: true,
      taskClassification: "meta_theory_auto",
      triggerReason: durableOutputIntent
        ? "natural_language_durable_work"
        : productBuildIntent
          ? "natural_language_product_build"
          : "natural_language_execution_work",
    };
  }
  if (PROJECT_UNDERSTANDING_RE.test(promptText)) {
    return {
      triggered: true,
      taskClassification: "meta_theory_auto",
      triggerReason: "project_understanding_requires_fetch",
    };
  }
  return {
    triggered: false,
    taskClassification: "unclassified_low_signal",
    triggerReason: "no_governance_trigger",
  };
}

function isMetaTheoryTrigger() {
  const skillName = getSkillName();
  if (toolName === "Skill" && skillName.includes("meta-theory")) {
    return {
      triggered: true,
      taskClassification: "meta_theory_auto",
      triggerReason: "skill_activation_auto",
    };
  }

  return classifyPromptActivation(getPromptText());
}

function detectPromptLanguage(promptText) {
  if (/[\u4e00-\u9fff]/u.test(promptText)) return "zh-CN";
  if (/[\u3040-\u30ff]/u.test(promptText)) return "ja-JP";
  if (/[\uac00-\ud7af]/u.test(promptText)) return "ko-KR";
  return "en";
}

function fingerprintPrompt(promptText) {
  if (!promptText) return null;
  return createHash("sha256").update(promptText, "utf8").digest("hex").slice(0, 16);
}

function staleMinutes() {
  const raw = Number.parseInt(process.env.META_KIM_SPINE_STALE_MINUTES || "", 10);
  return Number.isFinite(raw) && raw >= 1 ? raw : DEFAULT_STALE_MINUTES;
}

function ageMs(state) {
  const raw = state?.triggeredAt || state?.startedAt || state?.stageRuntimeControl?.createdAt;
  const time = raw ? Date.parse(raw) : Number.NaN;
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY;
  return Date.now() - time;
}

function isObservedState(state) {
  const control = state?.stageRuntimeControl || {};
  return (
    control.activationMode === "hook_observed" ||
    control.driverMode === "hook_observed" ||
    control.hookGateMode === "advisory" ||
    state?.activationMode === "hook_observed" ||
    state?.driverMode === "hook_observed" ||
    state?.hookGateMode === "advisory"
  );
}

function isManagedStageState(state) {
  const control = state?.stageRuntimeControl || {};
  return (
    control.driverMode === "managed" ||
    control.activationMode === "managed_stage_runtime" ||
    state?.driverMode === "managed"
  );
}

function buildContinuationBoundary(previousState, promptText) {
  if (!previousState || previousState.active !== false) return null;
  if (!CONTINUATION_REQUEST_RE.test(promptText || "")) return null;
  return {
    status: "new_run_from_inactive_request",
    mode:
      previousState.deactivationReason === "session_stop"
        ? "session_stop_continuation_request"
        : "inactive_run_continuation_request",
    previousRunId: previousState.runId || null,
    previousActive: false,
    previousStage: previousState.currentStage || null,
    previousDeactivatedAt: previousState.deactivatedAt || null,
    previousDeactivationReason: previousState.deactivationReason || null,
    authority:
      "HookPrompt may preserve the user's continuation wording, but runtime state says the previous run is inactive.",
    requiredNextAction:
      "Reconcile current active-run/spine-state before claiming continuation; choose new governed run or offline audit if the previous run stopped.",
  };
}

function shouldReplaceActiveState(existing, promptFingerprint) {
  if (!existing?.active) return true;

  const existingFingerprint =
    existing?.stageRuntimeControl?.promptFingerprint ||
    existing?.promptFingerprint ||
    null;
  if (existingFingerprint && existingFingerprint === promptFingerprint) return false;

  if (isObservedState(existing)) return true;

  const legacyWithoutControl = !existing.stageRuntimeControl;
  const staleCutoffMs = staleMinutes() * 60 * 1000;
  if (legacyWithoutControl && ageMs(existing) > staleCutoffMs) return true;

  return !isManagedStageState(existing) && ageMs(existing) > staleCutoffMs;
}

function startPostCopyAutoInit() {
  if (process.env.META_KIM_POST_COPY_AUTO === "off") return;

  const globalScriptPath = packageRoot
    ? join(packageRoot, "scripts", "project-post-copy-init.mjs")
    : null;
  const scriptPath =
    globalScriptPath && existsSync(globalScriptPath)
      ? globalScriptPath
      : existsSync(join(cwd, ".meta-kim", "meta-kim-post-copy.mjs"))
        ? join(cwd, ".meta-kim", "meta-kim-post-copy.mjs")
        : join(cwd, "meta-kim-post-copy.mjs");
  if (!existsSync(scriptPath)) return;

  try {
    spawnSync(process.execPath, [scriptPath, "--auto"], {
      cwd,
      stdio: "ignore",
      timeout: 4000,
      windowsHide: true,
      env: {
        ...process.env,
        META_KIM_POST_COPY_AUTO: "1",
      },
    });
  } catch {
    // Post-copy auto-init is opportunistic. A failure here must not block
    // the meta-theory state machine from starting.
  }
}

const activation = isMetaTheoryTrigger();
if (!activation.triggered) {
  process.exit(0);
}

startPostCopyAutoInit();

const rawPromptText = getRawPromptText();
const promptFingerprint = fingerprintPrompt(rawPromptText);
const rawExisting = await readSpineStateIncludingInactive(cwd);
const existing = rawExisting?.active === false ? null : rawExisting || (await readSpineState(cwd));
if (existing && existing.active && !shouldReplaceActiveState(existing, promptFingerprint)) {
  process.exit(0);
}

const state = createInitialState({
  taskClassification: activation.taskClassification,
  triggerReason: activation.triggerReason,
  activationMode: "hook_observed",
  driverMode: "hook_observed",
  hookGateMode: "advisory",
  promptFingerprint,
  latestUserInputLanguage: detectPromptLanguage(rawPromptText),
  factGatePolicy: "managed_gate_required_for_public_ready",
  executionLeasePolicy: "advisory_until_managed_stage_driver",
});
const continuationBoundary = buildContinuationBoundary(rawExisting, rawPromptText);
if (continuationBoundary) {
  state.continuationBoundary = continuationBoundary;
}

await writeSpineState(cwd, state);
process.exit(0);
