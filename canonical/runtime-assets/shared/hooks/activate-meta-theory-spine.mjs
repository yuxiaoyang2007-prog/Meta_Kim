import process from "node:process";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readJsonFromStdin } from "./utils.mjs";
import {
  readSpineState,
  writeSpineState,
  createInitialState,
} from "./spine-state.mjs";

const cwd = process.cwd();
const payload = await readJsonFromStdin();
const toolName = payload?.tool_name ?? "";
const toolInput = payload?.tool_input ?? {};
const packageRootArgIndex = process.argv.indexOf("--package-root");
const packageRootArg =
  packageRootArgIndex >= 0 ? process.argv[packageRootArgIndex + 1] : null;

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

const PROJECT_BOOTSTRAP_PROBE_DISABLED = {
  disabled: true,
  results: [],
};

function getPromptText() {
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
    if (typeof value === "string" && value.trim()) return value.toLowerCase();
  }
  return "";
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

  const promptText = getPromptText();
  return classifyPromptActivation(promptText);
}

function startPostCopyAutoInit() {
  if (process.env.META_KIM_POST_COPY_AUTO === "off") return;

  const scriptPath = join(cwd, "meta-kim-post-copy.mjs");
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

function projectBootstrapProbeCommands() {
  const args = ["--project-bootstrap", "--dry-run", "--project-dir", cwd, "--json"];
  const commands = [];
  const envRoot = packageRootArg || process.env.META_KIM_PACKAGE_ROOT;
  if (envRoot && existsSync(join(envRoot, "setup.mjs"))) {
    commands.push({
      command: process.execPath,
      args: [join(envRoot, "setup.mjs"), ...args],
      cwd: envRoot,
    });
  }

  if (existsSync(join(cwd, "setup.mjs"))) {
    commands.push({
      command: process.execPath,
      args: [join(cwd, "setup.mjs"), ...args],
      cwd,
    });
  }

  commands.push({
    command: "meta-kim",
    args: ["project", "bootstrap", "--dry-run", "--project-dir", cwd, "--json"],
    cwd,
    shell: process.platform === "win32",
  });
  return commands;
}

function isCanonicalPackageRoot() {
  try {
    const packageJson = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
    return (
      packageJson?.name === "meta-kim" &&
      existsSync(join(cwd, "setup.mjs")) &&
      existsSync(join(cwd, "canonical", "skills", "meta-theory", "SKILL.md"))
    );
  } catch {
    return false;
  }
}

function projectBootstrapProbeUnavailable(summary) {
  return !summary || !Array.isArray(summary.results);
}

function projectBootstrapManifestExists() {
  return existsSync(join(cwd, ".meta-kim", "state", "default", "project-bootstrap.json"));
}

function emitProjectBootstrapProbeUnavailable() {
  const context = [
    "Meta_Kim project bootstrap could not run from this prompt entry.",
    "reason=project bootstrap dry-run unavailable; no project files were written.",
    "Run `meta-kim project bootstrap --dry-run --project-dir . --json` or reinstall/update Meta_Kim global hooks with package-root evidence before governed execution.",
  ].join("\n");
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: payload?.hook_event_name ?? "UserPromptSubmit",
        additionalContext: context,
      },
    })}\n`,
  );
}

function runProjectBootstrapProbe() {
  if (process.env.META_KIM_PROJECT_BOOTSTRAP_PROBE === "off") {
    return PROJECT_BOOTSTRAP_PROBE_DISABLED;
  }

  for (const candidate of projectBootstrapProbeCommands()) {
    try {
      const result = spawnSync(candidate.command, candidate.args, {
        cwd: candidate.cwd,
        encoding: "utf8",
        windowsHide: true,
        timeout: 4000,
        shell: Boolean(candidate.shell),
        env: {
          ...process.env,
          META_KIM_PROJECT_BOOTSTRAP_PROBE: "1",
        },
      });
      if (result.status !== 0 || !result.stdout?.trim()) continue;
      return JSON.parse(result.stdout);
    } catch {
      // The probe is evidence gathering only. Missing global CLI or permission
      // errors must not prevent the meta-theory spine from starting.
    }
  }
  return null;
}

function projectBootstrapNeedsConfirmation(summary) {
  return (summary?.results ?? []).some(
    (result) => result?.state?.requiresConfirmation === true,
  );
}

function emitProjectBootstrapContext(summary) {
  const result = summary?.results?.[0];
  if (!result) return;
  const context = [
    "Meta_Kim project bootstrap dry-run found this directory is not ready for project governance.",
    `status=${result.state?.status ?? "unknown"} targets=${(result.state?.activeTargets ?? []).join(",")}`,
    `reason=${result.state?.confirmationReason ?? "project bootstrap confirmation required"}`,
    "Before applying project files, use the dry-run choiceSurface with Claude Code AskUserQuestion or Codex request_user_input; do not write project bootstrap files without confirmation.",
  ].join("\n");
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: payload?.hook_event_name ?? "Skill",
        additionalContext: context,
      },
    })}\n`,
  );
}

const activation = isMetaTheoryTrigger();
if (!activation.triggered) {
  process.exit(0);
}

startPostCopyAutoInit();
const canonicalPackageRoot = isCanonicalPackageRoot();
const projectBootstrapProbe = canonicalPackageRoot ? null : runProjectBootstrapProbe();
if (
  projectBootstrapProbeUnavailable(projectBootstrapProbe) &&
  !canonicalPackageRoot &&
  !projectBootstrapManifestExists()
) {
  emitProjectBootstrapProbeUnavailable();
  process.exit(0);
}
if (projectBootstrapNeedsConfirmation(projectBootstrapProbe)) {
  emitProjectBootstrapContext(projectBootstrapProbe);
  process.exit(0);
}

const existing = await readSpineState(cwd);
if (existing && existing.active) {
  process.exit(0);
}

const state = createInitialState({
  taskClassification: activation.taskClassification,
  triggerReason: activation.triggerReason,
});

await writeSpineState(cwd, state);
process.exit(0);
