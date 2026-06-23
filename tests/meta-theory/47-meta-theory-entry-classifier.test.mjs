import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "./_helpers.mjs";
import { classifyMetaTheoryEntry } from "../../scripts/meta-theory-entry-classifier.mjs";

describe("47 - Meta-theory entry classifier", () => {
  test("explicit meta-theory activation enters regulated path", () => {
    const result = classifyMetaTheoryEntry("meta-theory 帮我做治理审查");

    assert.equal(result.governedEntry, true);
    assert.equal(result.path, "regulated_path");
    assert.equal(result.taskClassification, "meta_theory_explicit");
    assert.equal(result.triggerReason, "explicit_meta_theory");
    assert.equal(result.fanoutEligible, false);
  });

  test("ordinary natural-language durable work enters governed path", () => {
    const prompt =
      "我想把客户反馈自动整理成优先级、修复建议和验证清单，请帮我规划并开始处理。";
    assert.doesNotMatch(prompt, /agent|skill|MCP|command|阶段|packet|JSON/i);

    const result = classifyMetaTheoryEntry(prompt);

    assert.equal(result.governedEntry, true);
    assert.equal(result.path, "standard_path");
    assert.equal(result.taskClassification, "meta_theory_auto");
    assert.equal(result.triggerReason, "natural_language_durable_work");
    assert.equal(result.shouldAskBeforeFetch, false);
  });

  test("wish-style product build enters governed path without protocol words", () => {
    const prompt = "帮我做个小红书营销自动发布器";
    assert.doesNotMatch(prompt, /agent|skill|MCP|command|阶段|packet|JSON|优先级|验证清单/i);

    const result = classifyMetaTheoryEntry(prompt);

    assert.equal(result.governedEntry, true);
    assert.equal(result.path, "standard_path");
    assert.equal(result.taskClassification, "meta_theory_auto");
    assert.equal(result.triggerReason, "natural_language_product_build");
    assert.equal(result.shouldAskBeforeFetch, false);
    assert.equal(result.fanoutEligible, true);
    assert.ok(result.fanoutSignals.includes("product_build_has_multiple_execution_lanes"));
    assert.equal(result.requiresSubagentAuthorization, true);
    assert.equal(result.subagentAuthorizationSource, "native_choice_surface_required");
  });

  test("human fuzzy product idea enters product-build route without capability words", () => {
    const prompt =
      "我想做个东西，能把我平时随手记的想法变成能发出去的内容，但我现在也说不清先做成啥，你帮我拆一下怎么落地，别真发。";
    assert.doesNotMatch(prompt, /agent|skill|MCP|command|findskill|tool|阶段|packet|JSON/i);

    const result = classifyMetaTheoryEntry(prompt);

    assert.equal(result.governedEntry, true);
    assert.equal(result.path, "standard_path");
    assert.equal(result.taskClassification, "meta_theory_auto");
    assert.equal(result.triggerReason, "natural_language_product_build");
    assert.equal(result.fanoutEligible, true);
    assert.ok(result.fanoutSignals.includes("product_build_has_multiple_execution_lanes"));
  });

  test("review plus fix plus verify is fan-out eligible before execution", () => {
    const result = classifyMetaTheoryEntry(
      "review + fix + verify 这个仓库的 hook、runner、测试，做完再告诉我。",
    );

    assert.equal(result.governedEntry, true);
    assert.equal(result.fanoutEligible, true);
    assert.ok(result.expectedIndependentLaneCount >= 3);
    assert.equal(result.requiresSubagentAuthorization, false);
    assert.equal(result.subagentAuthorizationSource, "direct_parallel_agent_request");
  });

  test("critical fetch thinking review wording enters governed path without explicit meta-theory", () => {
    const result = classifyMetaTheoryEntry(
      "critical and fetch thinking and review 帮我检查项目级更新、全局能力扫描和发布验证",
    );

    assert.equal(result.governedEntry, true);
    assert.equal(result.path, "standard_path");
    assert.equal(result.taskClassification, "meta_theory_auto");
    assert.ok(result.fanoutSignals.includes("critical_fetch_thinking_review_requested"));
  });

  test("explicit meta-theory with serial-agent complaint authorizes fan-out", () => {
    const result = classifyMetaTheoryEntry(
      "你太慢了，没看到多个 agent 并行，critical and fetch thinking and review /meta-theory",
    );

    assert.equal(result.governedEntry, true);
    assert.equal(result.path, "regulated_path");
    assert.equal(result.fanoutEligible, true);
    assert.equal(result.requiresSubagentAuthorization, false);
    assert.equal(result.subagentAuthorizationSource, "explicit_meta_theory");
    assert.ok(result.fanoutSignals.includes("user_reported_serial_or_slow_agent_route"));
  });

  test("subjective quality request asks through Critical before Fetch", () => {
    const result = classifyMetaTheoryEntry("这个页面不好看，帮我弄高级一点");

    assert.equal(result.governedEntry, true);
    assert.equal(result.path, "standard_path");
    assert.equal(result.triggerReason, "subjective_quality_ambiguous");
    assert.equal(result.choiceSurfaceState, "critical_clarification_allowed");
    assert.equal(result.shouldAskBeforeFetch, true);
    assert.equal(result.ambiguityPacket.choicePolicy, "must_ask");
    assert.match(result.ambiguityPacket.basis, /route, acceptance, risk, owner, permission/);
    assert.match(result.ambiguityPacket.mustAskReason, /native choice answer/);
  });

  test("project understanding questions enter governed Fetch path", () => {
    const result = classifyMetaTheoryEntry("这个项目是什么？");

    assert.equal(result.governedEntry, true);
    assert.equal(result.path, "standard_path");
    assert.equal(result.taskClassification, "meta_theory_auto");
    assert.equal(result.triggerReason, "project_understanding_requires_fetch");
  });

  test("commercialization strategy questions enter governed Fetch path", () => {
    const result = classifyMetaTheoryEntry("这个项目如果商业化应该怎么发展？");

    assert.equal(result.governedEntry, true);
    assert.equal(result.path, "standard_path");
    assert.equal(result.triggerReason, "project_understanding_requires_fetch");
  });

  test("existing governed execution CLI exposes entry classification without running a full run", () => {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/run-meta-theory-governed-execution.mjs",
        "--classify-entry",
        "--task",
        "我想把客户反馈自动整理成优先级、修复建议和验证清单，请帮我规划并开始处理。",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.governedEntry, true);
    assert.equal(payload.triggerReason, "natural_language_durable_work");
    assert.equal(payload.taskClassification, "meta_theory_auto");
  });

  test("CLI classifies wish-style product build as governed work", () => {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/run-meta-theory-governed-execution.mjs",
        "--classify-entry",
        "--task",
        "帮我做个小红书营销自动发布器",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.governedEntry, true);
    assert.equal(payload.path, "standard_path");
    assert.equal(payload.triggerReason, "natural_language_product_build");
    assert.equal(payload.taskClassification, "meta_theory_auto");
    assert.equal(payload.fanoutEligible, true);
    assert.equal(payload.subagentAuthorizationSource, "native_choice_surface_required");
  });

  test("CLI temp-output flag does not consume a positional task", () => {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/run-meta-theory-governed-execution.mjs",
        "--classify-entry",
        "--temp-output",
        "帮我做个小红书营销自动发布器",
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.governedEntry, true);
    assert.equal(payload.path, "standard_path");
    assert.equal(payload.triggerReason, "natural_language_product_build");
    assert.notEqual(payload.triggerReason, "empty_input");
  });

  test("user-facing docs present natural language as the normal entry path", async () => {
    const readme = await readFile("README.md");
    const readmeZh = await readFile("README.zh-CN.md");
    const agents = await readFile("AGENTS.md");
    const skill = await readFile("canonical/skills/meta-theory/SKILL.md");
    const combined = `${readme}\n${readmeZh}\n${agents}\n${skill}`;

    assert.match(readme, /humans should be able to use plain task language/i);
    assert.match(readme, /maintainer shortcuts, not the normal user path/i);
    assert.match(readmeZh, /人类应该直接用自然语言说任务/);
    assert.match(readmeZh, /维护者快捷方式，不是普通用户入口/);
    assert.match(agents, /Do not require humans to know or type command words/);
    assert.match(skill, /ordinary natural-language durable work/);
    assert.match(skill, /not required human behavior/);

    assert.doesNotMatch(
      combined,
      /What needs explicit trigger|需要显式触发|Type "run meta theory"|输入"run meta theory"/,
    );
  });

  test("execution guidance requires reading target files before rewrite", async () => {
    const skill = await readFile("canonical/skills/meta-theory/SKILL.md");
    const runtimeClaude = await readFile("canonical/skills/meta-theory/references/runtime-claude.md");
    const devGovernance = await readFile("canonical/skills/meta-theory/references/dev-governance.md");

    assert.match(skill, /read every target file that may be changed/i);
    assert.match(skill, /current content of every target file has been read/i);
    assert.match(runtimeClaude, /Read the current content of every target file/i);
    assert.match(runtimeClaude, /before using Edit, MultiEdit, Write/i);
    assert.match(devGovernance, /Fetch reads the current content of every target file/i);
  });
});
