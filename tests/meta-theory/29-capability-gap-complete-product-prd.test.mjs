import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const prd = readFileSync(
  path.join(REPO_ROOT, "docs", "ai-native-capability-gap-mvp-prd.zh-CN.md"),
  "utf8"
);

describe("29 — Capability Gap complete product PRD", () => {
  test("marks local complete-product state with live/native release boundary", () => {
    assert.match(prd, /## 当前完成状态/);
    assert.match(prd, /已测通/);
    assert.match(prd, /本地 planning\/orchestration MVP 已经证明/);
    assert.match(prd, /还不能宣称“治理 Agent \+ 执行 Agent 实机闭环完成”/);
    assert.match(prd, /还不能宣称“发布级 live\/native 全 runtime 完成”/);
    assert.match(prd, /Cursor Agent CLI native live 仍未闭合/);
    assert.match(prd, /Claude 和 OpenClaw 全九个 meta agents shard live evidence 已闭合/);
    assert.match(prd, /Codex \| orchestration live artifact pass/);
    assert.match(prd, /Cursor native live 仍返回 structured blocked/);
  });

  test("defines remaining complete-product scope with measurable acceptance", () => {
    for (const section of [
      "R-001 分支产物质量门",
      "R-002 用户纠错回放与进化门",
      "R-003 可执行 Graph Contract",
      "R-004 Run Analytics",
      "R-005 默认产品入口",
      "R-006 完整产品验收命令",
      "R-007 默认 meta-theory orchestration runtime path",
      "R-008 跨 runtime 真实投影验证",
      "R-009 Warden 审批后的真实长期 writeback 流程",
      "R-010 用户可读 UI / 报告层",
      "R-011 AI 可读产品标准",
      "完整产品 Definition of Done",
    ]) {
      assert.match(prd, new RegExp(section), `missing ${section}`);
    }

    for (const metric of [
      "真实输入至少 12 条",
      "每类至少 2 条",
      "branch coverage 100%",
      "database_as_planner_count = 0",
      "用户纠正 replay 后",
      "FR pass rate 100%",
      "Quantitative acceptance pass rate 100%",
      "fake owner 0",
      "自动写 canonical 0",
      "未授权外部写动作 0",
      "requiredEvidence",
    ]) {
      assert.match(prd, new RegExp(metric), `missing metric ${metric}`);
    }
  });

  test("requires PRD iteration status for every future product iteration", () => {
    for (const marker of [
      "## PRD 迭代与任务状态规则",
      "每次 Capability Gap / meta-theory 产品迭代都必须同步更新本 PRD",
      "每项任务的状态",
      "GitHub 差距",
      "未开始",
      "进行中",
      "部分完成",
      "已测通",
      "降级",
      "阻塞",
    ]) {
      assert.match(prd, new RegExp(marker), `missing iteration marker ${marker}`);
    }
  });

  test("keeps human-readable natural-language entry work in the single PRD source", () => {
    for (const marker of [
      "版本：v0.37",
      "真实治理 Agent \\+ 执行 Agent live 链路",
      "自然语言入口与用户体验提示",
      "普通自然语言 durable 任务",
      "没有真实 conversation notice emitted 证据时必须标 partial",
      "CLI adapter 发射后才可标 ready",
      "--emit-conversation-notice",
      "帮我做个小红书营销自动发布器",
      "P-061",
      "自然语言入口分类",
      "P-062",
      "用户体验 truth boundary",
      "P-063",
      "阶段执行说明",
      "P-064",
      "单一 PRD 源守卫",
      "P-065",
      "多语言阶段说明覆盖",
      "P-066",
      "真实 conversation notice 发射",
      "P-067",
      "顺滑能力发现守卫",
      "P-068",
      "治理 Agent live result packet",
      "P-069",
      "执行 owner / 多能力 live execution evidence",
      "P-070",
      "项目能力资产沉淀 validator",
      "不能新增第二份 backlog / PRD",
    ]) {
      assert.match(prd, new RegExp(marker), `missing natural-language PRD marker ${marker}`);
    }

    assert.equal(
      existsSync(
        path.join(REPO_ROOT, "config", "governance", "human-readable-ambiguity-remediation.json"),
      ),
      false,
      "human-readable remediation must not live as a second PRD/backlog source",
    );
  });

  test("keeps the PRD local-private and out of GitHub-visible paths", () => {
    const gitignore = readFileSync(path.join(REPO_ROOT, ".gitignore"), "utf8");

    assert.match(gitignore, /^docs\/\*\*$/m);
    assert.doesNotMatch(
      gitignore,
      /^!docs\/ai-native-capability-gap-mvp-prd\.zh-CN\.md$/m,
      "the local PRD must not be unignored for GitHub publication",
    );
  });

  test("tracks the four next product targets with status and done standards", () => {
    for (const marker of [
      "T-001",
      "默认 meta-theory orchestration runtime path",
      "T-002",
      "Claude / Codex / Cursor / OpenClaw 四端投影验证",
      "T-003",
      "Warden 审批后的真实长期 writeback 流程",
      "T-004",
      "用户可读 UI / 报告层",
      "T-005",
      "AI 可读产品标准",
      "Definition of Done",
      "orchestrationTaskBoardPacket",
      "workerTaskPackets",
      "approved-for-writeback",
      "按 runId 查看",
      "设计、执行、验收、反馈、交付内容",
      "Codex orchestration live artifact pass",
      "Cursor live harness",
      "全 meta agents shard live evidence",
    ]) {
      assert.match(prd, new RegExp(marker), `missing target marker ${marker}`);
    }
  });

  test("tracks a granular parallel work queue for unfinished runtime and product work", () => {
    for (const marker of [
      "### 可并行任务队列",
      "主窗口由 `meta-warden` / `meta-conductor` 保持总控",
      "可子窗口并行",
      "P-001",
      "Codex live prompt 最小化",
      "已测通",
      "P-002",
      "Codex session recovery",
      "codex_live_timeout",
      "sessionRecoveryHint",
      "META_KIM_CODEX_LIVE_TIMEOUT_FIXTURE=1",
      "recoveredFromTimeout = true",
      "P-003",
      "Codex 主窗口 / 子窗口隔离复测",
      "019e9163-31ec-7510-86f9-9fc645c95811",
      "019e916e-4782-7081-ae57-740b4c3bf1b2",
      "第二轮 PASS",
      "无新增文件改动",
      "P-004",
      "Cursor native live-turn harness 设计",
      "P-005",
      "Cursor native live-turn harness 实现或明确阻塞",
      "P-006",
      "Claude 全 meta agents shard",
      "P-007",
      "OpenClaw 全 meta agents shard",
      "P-008",
      "四端 evidence aggregator",
      "P-009",
      "runtime failure taxonomy",
      "P-010",
      "真实 Warden approval packet",
      "P-011",
      "当前 repo canonical writeback dry-run",
      "P-012",
      "Web/UI 产品面板原型",
      "P-013",
      "报告可读性 review",
      "P-014",
      "AI 可读评分表导出",
      "P-015",
      "多 gap 混合需求 fixture",
      "P-016",
      "orchestration board 并行/线性计划质量门",
      "P-017",
      "深度研究前置门",
      "P-018",
      "multi-type capability inventory 质量门",
      "P-019",
      "skill 触发入口边界",
      "P-020",
      "同类型多需求拆分",
      "P-021",
      "非 agent 能力候选站点质量门",
      "stationCoverage",
      "npm run meta:gap:validate-board",
      "npm run meta:gap:score-candidates",
      "P-022",
      "产品面板数据合同",
      "config/contracts/run-report-panel-contract.json",
      "runReportPanelContract",
      "P-023",
      "AI 可读案例包",
      "P-024",
      "Cursor native live pass 解阻",
      "当前主干闭合顺序",
      "当前可并行批次",
      "Runtime evidence",
      "Orchestration quality",
      "User deliverable",
      "Release closure",
    ]) {
      assert.match(prd, new RegExp(marker), `missing parallel queue marker ${marker}`);
    }
  });

  test("records orchestration quality completion and GitHub delta", () => {
    for (const marker of [
      "编排质量轨",
      "tests/meta-theory/33-capability-gap-orchestration-quality.test.mjs",
      "当前 GitHub 差距",
      "P-015 到 P-021 编排质量轨",
      "仍未完成且不能对 GitHub 宣称完成",
      "P-012 / P-013 / P-014 / P-023",
      "P-024 Cursor native live pass 解阻",
    ]) {
      assert.match(prd, new RegExp(marker), `missing v0.16 marker ${marker}`);
    }
  });

  test("keeps panel data contract completion without overclaiming runtime completion", () => {
    for (const marker of [
      "P-022 产品面板数据合同",
      "runReportPanelContract",
      "decision summary",
      "owner handoff",
      "blocked reason",
      "runtime evidence",
      "approval request",
      "readable rubric",
      "deliverables",
      "P-012 / P-013 / P-014 / P-023",
      "不能把某一类交付物冒充另一类",
    ]) {
      assert.match(prd, new RegExp(marker), `missing v0.17 panel marker ${marker}`);
    }
  });

  test("records user deliverables completion without clearing Cursor native blocker", () => {
    for (const marker of [
      "npm run meta:theory:deliverables",
      "run-panel.html",
      "readability-review.zh-CN.md",
      "ai-readable-rubric.zh-CN.md",
      "ai-readable-rubric.json",
      "ai-readable-case-pack.zh-CN.md",
      "tests/meta-theory/34-run-deliverables.test.mjs",
      "P-012 / P-013 / P-014 / P-023 用户交付轨",
      "P-024 Cursor native live pass 解阻",
      "用户交付轨已有面板数据合同、静态 Web/UI、可读性 review、AI 可读评分表和案例包",
      "后续只能扩展真实 reviewer 样本，不能把某一类交付物冒充另一类",
    ]) {
      assert.match(prd, new RegExp(marker), `missing deliverable marker ${marker}`);
    }
  });

  test("records all meta agents shard evidence with only Cursor native still blocked", () => {
    for (const marker of [
      "P-006 / P-007 全 meta agents shard live evidence",
      "仍未完成且不能对 GitHub 宣称完成：P-024 Cursor native live pass 解阻",
      "Claude 和 OpenClaw 全九个 meta agents shard live evidence 已闭合",
      "P-006",
      "9/9 agentResults ok",
      "runtimeEvidencePacket.failureClasses.claude = \"pass\"",
      "P-007",
      "minimax-portal/MiniMax-M3",
      "hooks 4/4 ready",
      "批量模式出现过 timeout",
      "验收口径采用单 shard 证据而非虚报整批 pass",
      "all meta agents shard live pass",
      "无 OpenClaw shard 剩余动作；保留批量 timeout 作为稳定性改进信号",
    ]) {
      assert.match(prd, new RegExp(marker), `missing v0.19 runtime shard marker ${marker}`);
    }
  });

  test("records v0.20 Cursor WSL candidate while preserving native-live blocker", () => {
    for (const marker of [
      "P-024 官方 WSL candidate probe",
      "官方 Windows WSL `cursor-agent`",
      "cursor-agent-wsl",
      "WSL Ubuntu 存在但 `command -v cursor-agent` 为空",
      "Windows native、Cursor IDE subcommand、官方 Windows WSL `cursor-agent` 三个候选",
      "Windows WSL 可用 `cursor-agent --version` 验证",
      "failureClass = \"native_harness_missing\"",
      "不能对 GitHub 宣称完成：P-024 Cursor native live pass 解阻",
    ]) {
      assert.match(prd, new RegExp(marker), `missing v0.20 Cursor marker ${marker}`);
    }
  });

  test("records expanded unfinished parallel backlog instead of collapsing to one blocker", () => {
    for (const marker of [
      "版本：v0.37",
      "未完成但可并行推进的扩展 / 解阻队列",
      "P-025",
      "Cursor WSL live 安装与只读验收子窗口",
      "P-026",
      "Cursor 官方文档 source-backed refresh",
      "P-027",
      "Cursor native success fixture",
      "P-028",
      "GitHub 差距自动报告",
      "P-029",
      "跨 run 趋势服务化面板",
      "P-030",
      "AI 可读 reviewer 样本回放",
      "P-031",
      "真实 Warden approved canonical writeback",
      "P-032",
      "OpenClaw batch live 稳定性改进",
      "P-033",
      "runtime live shard 自动化矩阵",
      "P-034",
      "子窗口验收包模板",
      "P-035",
      "真实复杂输入扩展集",
      "P-036",
      "PRD 状态完整性守卫",
      "P-037",
      "深度研究准备层产品化",
      "P-038",
      "多类型能力库存浏览器",
      "P-039",
      "编排 DAG 可视化与依赖模拟",
      "P-040",
      "workerTask 输出合同与返工策略",
      "P-041",
      "真实用户纠错 replay 池",
      "P-042",
      "反馈入口与状态闭环",
      "P-043",
      "Warden 审批体验面板",
      "P-044",
      "runtime 解阻安装/验收手册",
      "P-045",
      "产品交付包打包",
      "P-046",
      "reviewer 校准样本",
      "P-047",
      "真实联网研究执行层",
      "P-048",
      "研究证据缓存与新鲜度策略",
      "P-049",
      "能力创新候选沙箱",
      "P-050",
      "DAG 串行依赖样本扩展",
      "P-051",
      "DAG 调度仿真与关键路径",
      "P-052",
      "workerTask 输出 schema registry",
      "P-053",
      "workerTask 返工 runner",
      "P-054",
      "Review / Meta-Review 双层接收门",
      "P-055",
      "用户反馈动作合同",
      "P-056",
      "反馈 replay 指标面板",
      "P-057",
      "Warden 审批 diff 预览与回滚演练",
      "P-058",
      "runtime probe 变体矩阵",
      "P-059",
      "产品交付 bundle CLI",
      "P-060",
      "reviewer 评分校准与反例库",
      "这些任务不会让当前 MVP 重新变成未完成",
    ]) {
      assert.match(prd, new RegExp(marker), `missing expanded backlog marker ${marker}`);
    }
  });

  test("records v0.22 closure for non-blocked parallel backlog items", () => {
    for (const marker of [
      "P-026 \\| R-008 \\| Cursor 官方文档 source-backed refresh[\\s\\S]*?\\| 已测通 \\|",
      "2026-06-05 官方文档复核",
      "cursor-agent",
      "--output-format json",
      "P-027 \\| R-008 \\| Cursor native success fixture[\\s\\S]*?\\| 已测通 \\|",
      "\\$env:META_KIM_CURSOR_LIVE_SUCCESS_FIXTURE='1'; node scripts/eval-meta-agents.mjs --runtime=cursor --live",
      "strictReleasePass = true",
      "P-028 \\| Release closure \\| GitHub 差距自动报告[\\s\\S]*?\\| 已测通 \\|",
      "npm run meta:github:gap",
      ".meta-kim/state/default/github-gap-report/latest.json",
      "P-034 \\| Verification \\| 子窗口验收包模板[\\s\\S]*?\\| 已测通 \\|",
      "npm run meta:verification:subwindows",
      ".meta-kim/state/default/subwindow-verification-packets/latest.json",
      "P-036 \\| PRD governance \\| PRD 状态完整性守卫[\\s\\S]*?\\| 已测通 \\|",
      "tests/meta-theory/35-release-closure-deliverables.test.mjs",
      "P-024 仍保持真实 native live 阻塞",
    ]) {
      assert.match(prd, new RegExp(marker), `missing v0.22 closure marker ${marker}`);
    }
  });

  test("records v0.23 runtime matrix and complex input closure", () => {
    for (const marker of [
      "P-033 \\| R-008 \\| runtime live shard 自动化矩阵[\\s\\S]*?\\| 已测通 \\|",
      "npm run meta:runtime:shard-matrix",
      ".meta-kim/state/default/runtime-live-shard-matrix/latest.json",
      "Claude / Codex / OpenClaw / Cursor",
      "releaseGradeCandidate",
      "Cursor blocked 与 fixture-only 边界",
      "P-035 \\| R-001/R-007/R-011 \\| 真实复杂输入扩展集[\\s\\S]*?\\| 已测通 \\|",
      "npm run meta:gap:complex-inputs",
      ".meta-kim/state/default/complex-capability-gap-inputs/latest.json",
      "10/10 pass",
      "research-first、multi-capability、approval-blocked、workerTask-only",
      "P-033 / P-035",
      "P-025 需要安装或暴露 Cursor Agent CLI",
    ]) {
      assert.match(prd, new RegExp(marker), `missing v0.23 marker ${marker}`);
    }
  });

  test("records v0.24 external product reviewer replay closure", () => {
    for (const marker of [
      "P-030 \\| R-011 \\| AI 可读 reviewer 样本回放[\\s\\S]*?\\| 已测通 \\|",
      "npm run meta:reviewer:replay",
      ".meta-kim/state/default/product-reviewer-replay/latest.json",
      "3 个 reviewer 样本",
      "五维评分",
      "6 条误解点与修订建议",
      "fixture pass、release-grade、GitHub complete、Warden approval",
      "P-026 / P-027 / P-028 / P-029 / P-030 / P-031 / P-032 / P-033 / P-034 / P-035 / P-036 / P-037 / P-038 / P-039 / P-040 / P-041 / P-042 / P-043 / P-044 / P-045 / P-046 / P-047 / P-048 / P-049 / P-050 / P-051 / P-052 / P-053 / P-054 / P-055 / P-056 / P-057 / P-058 / P-059 / P-060 / P-061 / P-062 / P-063 / P-064 / P-065 / P-066 已测通",
      "P-025 需要安装或暴露 Cursor Agent CLI",
    ]) {
      assert.match(prd, new RegExp(marker), `missing v0.24 marker ${marker}`);
    }
  });

  test("records v0.25 wider parallel product backlog", () => {
    for (const marker of [
      "P-025 到 P-060 并行扩展队列",
      "本 PRD v0.37 的状态更新",
      "P-025 到 P-070 队列",
      "researchPreparationPacket",
      "研究完才编排",
      "避免把 capability 简化成 skill",
      "fake parallelism 计数为 0",
      "schema 不合格",
      "至少 12 条 correction replay",
      "反馈是否影响下一轮 route",
      "未提供审批包时必须生成 `approvalRequest`",
      "runtime 解阻安装/验收手册",
      "一条命令生成 bundle manifest",
      "能力不等于 skill",
      "真实联网研究、反馈闭环、审批体验、runtime probe 变体、交付打包、reviewer 校准",
      "P-024 解阻前不能宣称全 runtime release-grade 完成",
    ]) {
      assert.match(prd, new RegExp(marker), `missing v0.25 marker ${marker}`);
    }
  });

  test("records v0.26 research preparation closure", () => {
    for (const marker of [
      "P-037 \\| R-007/R-010 \\| 深度研究准备层产品化[\\s\\S]*?\\| 已测通 \\|",
      "npm run meta:research:prepare",
      ".meta-kim/state/default/research-preparation/latest.json",
      "4/4 case pass",
      "current-fact、official docs、external MCP provider、local-only、blocked paid/credential boundary",
      "searchAngles、sourceList、freshness、credibility、blockedReason、decisionImpactMap、thinkingHandoff",
      "研究完才编排",
      "已完成 P-037",
    ]) {
      assert.match(prd, new RegExp(marker), `missing v0.26 marker ${marker}`);
    }
  });

  test("records v0.27 multi-type capability browser closure", () => {
    for (const marker of [
      "本 PRD v0.37 的状态更新",
      "P-038 \\| R-007/R-010 \\| 多类型能力库存浏览器[\\s\\S]*?\\| 已测通（旧十类浏览器） \\|",
      "npm run meta:capabilities:browser",
      ".meta-kim/state/default/multi-type-capability-browser/latest.json",
      "10/10 legacy capability types covered",
      "237 个候选",
      "skillOnly = false",
      "核心类别优先",
      "不把 MCP/tools 继续压成旧十类",
      "已完成 P-038",
      "P-025 需要安装或暴露 Cursor Agent CLI",
    ]) {
      assert.match(prd, new RegExp(marker), `missing v0.27 marker ${marker}`);
    }
  });

  test("records v0.37 smooth capability discovery without swallowing MCP or tools", () => {
    for (const marker of [
      "版本：v0.37",
      "核心能力类别",
      "默认发现粒度要顺滑",
      "MCP 和 tools 是足够重要的一等类别",
      "MCP",
      "tools",
      "no_expansion_needed",
      "permissionBoundary",
      "verificationOwner",
      "按需展开",
      "workerResult",
      "把未验证 MCP/tools 冒充已调用",
      "P-067",
      "顺滑能力发现守卫",
      "P-068",
      "治理 Agent live result packet",
      "P-069",
      "执行 owner / 多能力 live execution evidence",
      "P-070",
      "项目能力资产沉淀 validator",
    ]) {
      assert.match(prd, new RegExp(marker), `missing v0.37 capability marker ${marker}`);
    }

    for (const marker of [
      "orchestration_artifact_pass",
      "projection_smoke",
      "live_governance_agent_pass",
      "live_execution_pass",
      "degradedFlag=true",
      "governanceAgentResultPackets",
      "workerResultPackets",
      "workerExecutionEvidence",
      "只有 board、workerTaskPackets、schema、中文报告、SQLite event 或 projection smoke",
    ]) {
      assert.match(prd, new RegExp(marker), `missing evidence layering marker ${marker}`);
    }

    assert.doesNotMatch(
      prd,
      /Codex \| live pass/,
      "Codex orchestration artifact must not be labeled as generic live pass",
    );
    assert.doesNotMatch(
      prd,
      /Complete product MVP 已经在本地证明/,
      "local orchestration MVP must not overclaim complete execution",
    );
  });

  test("records v0.28 orchestration DAG closure and wider parallel product lanes", () => {
    for (const marker of [
      "版本：v0.37",
      "P-039 \\| R-003/R-007 \\| 编排 DAG 可视化与依赖模拟[\\s\\S]*?\\| 已测通 \\|",
      "npm run meta:orchestration:dag",
      ".meta-kim/state/default/orchestration-dag/latest.json",
      "3 个 DAG case pass",
      "fakeParallelismCount = 0",
      "blocked node 可见",
      "Mermaid preview 可读",
      "已完成 P-039",
      "P-047 \\| R-007 \\| 真实联网研究执行层[\\s\\S]*?\\| 已测通 \\|",
      "P-048 \\| R-007/R-010 \\| 研究证据缓存与新鲜度策略[\\s\\S]*?\\| 已测通 \\|",
      "P-049 \\| R-007/R-009 \\| 能力创新候选沙箱[\\s\\S]*?\\| 已测通 \\|",
      "P-050 \\| R-003/R-007 \\| DAG 串行依赖样本扩展[\\s\\S]*?\\| 已测通 \\|",
      "P-051 \\| R-003/R-007 \\| DAG 调度仿真与关键路径[\\s\\S]*?\\| 已测通 \\|",
      "P-052 \\| R-001/R-007 \\| workerTask 输出 schema registry[\\s\\S]*?\\| 已测通 \\|",
      "P-053 \\| R-001/R-007 \\| workerTask 返工 runner[\\s\\S]*?\\| 已测通 \\|",
      "P-054 \\| R-008/R-011 \\| Review / Meta-Review 双层接收门[\\s\\S]*?\\| 已测通 \\|",
      "P-055 \\| R-002/R-010 \\| 用户反馈动作合同[\\s\\S]*?\\| 已测通 \\|",
      "P-056 \\| R-002/R-010/R-011 \\| 反馈 replay 指标面板[\\s\\S]*?\\| 已测通 \\|",
      "P-057 \\| R-009/R-010 \\| Warden 审批 diff 预览与回滚演练[\\s\\S]*?\\| 已测通 \\|",
      "P-058 \\| R-008 \\| runtime probe 变体矩阵[\\s\\S]*?\\| 已测通 \\|",
      "P-059 \\| R-010/R-011 \\| 产品交付 bundle CLI[\\s\\S]*?\\| 已测通 \\|",
      "P-060 \\| R-011 \\| reviewer 评分校准与反例库[\\s\\S]*?\\| 已测通 \\|",
      "P-025 需要安装或暴露 Cursor Agent CLI",
    ]) {
      assert.match(prd, new RegExp(marker), `missing v0.28 marker ${marker}`);
    }
  });

  test("records v0.29 orchestration scheduler closure", () => {
    for (const marker of [
      "版本：v0.37",
      "P-050 \\| R-003/R-007 \\| DAG 串行依赖样本扩展[\\s\\S]*?\\| 已测通 \\|",
      "P-051 \\| R-003/R-007 \\| DAG 调度仿真与关键路径[\\s\\S]*?\\| 已测通 \\|",
      "npm run meta:orchestration:schedule",
      ".meta-kim/state/default/orchestration-scheduler/latest.json",
      ".meta-kim/state/default/orchestration-scheduler/latest.zh-CN.md",
      "5 个 DAG case",
      "3 个有非空 dependsOn",
      "9 条 edge",
      "orphanDependencyCount = 0",
      "cycleCount = 0",
      "blockedDependencyViolationCount = 0",
      "criticalPath",
      "parallelUtilization",
      "serialBottleneck",
      "blockedWaitReason",
      "research -> capability -> execution -> review",
      "fanout-then-merge",
      "approval blocked wait reason",
      "已完成 P-050 / P-051",
      "P-025 需要安装或暴露 Cursor Agent CLI",
    ]) {
      assert.match(prd, new RegExp(marker), `missing v0.29 marker ${marker}`);
    }
  });

  test("records v0.30 workerTask output contract and retry closure", () => {
    for (const marker of [
      "版本：v0.37",
      "P-040 \\| R-001/R-007 \\| workerTask 输出合同与返工策略[\\s\\S]*?\\| 已测通 \\|",
      "P-052 \\| R-001/R-007 \\| workerTask 输出 schema registry[\\s\\S]*?\\| 已测通 \\|",
      "P-053 \\| R-001/R-007 \\| workerTask 返工 runner[\\s\\S]*?\\| 已测通 \\|",
      "config/contracts/worker-task-output-contract.json",
      "npm run meta:worker:outputs",
      ".meta-kim/state/default/worker-task-output/latest.json",
      ".meta-kim/state/default/worker-task-output/latest.zh-CN.md",
      "6 类 worker output schema",
      "required evidence",
      "failureClass",
      "returnToStage",
      "maxRetries",
      "Review 接收条件",
      "9 个 replay 样本全部 pass",
      "6 accept",
      "1 retry",
      "1 return_to_stage",
      "1 blocked",
      "缺 evidence",
      "owner 越界",
      "schema 不合格",
      "Review 不接收无 owner/evidence/schema 的输出",
      "已完成 P-040 / P-052 / P-053",
      "P-025 需要安装或暴露 Cursor Agent CLI",
    ]) {
      assert.match(prd, new RegExp(marker), `missing v0.30 marker ${marker}`);
    }
  });

  test("records v0.31 feedback loop and Review Meta-Review gate closure", () => {
    for (const marker of [
      "版本：v0.37",
      "P-041 \\| R-002/R-011 \\| 真实用户纠错 replay 池[\\s\\S]*?\\| 已测通 \\|",
      "P-042 \\| R-002/R-010 \\| 反馈入口与状态闭环[\\s\\S]*?\\| 已测通 \\|",
      "P-054 \\| R-008/R-011 \\| Review / Meta-Review 双层接收门[\\s\\S]*?\\| 已测通 \\|",
      "P-055 \\| R-002/R-010 \\| 用户反馈动作合同[\\s\\S]*?\\| 已测通 \\|",
      "P-056 \\| R-002/R-010/R-011 \\| 反馈 replay 指标面板[\\s\\S]*?\\| 已测通 \\|",
      "config/contracts/feedback-action-contract.json",
      "npm run meta:feedback:loop",
      ".meta-kim/state/default/feedback-loop/latest.json",
      ".meta-kim/state/default/feedback-loop/latest.zh-CN.md",
      "12 条 correction replay",
      "accept / correct / reject / promote_to_long_term / keep_one_time",
      "changedDecisionCount = 12",
      "repeatGapCount = 11",
      "reviewerConfusionReduced = 12",
      "reviewRejectedCount = 3",
      "polish-only review 返回 Review",
      "缺 Fetch 返回 Fetch",
      "缺 writeback boundary 置 blocked",
      "canonicalWritesWithoutApproval = 0",
      "已完成 P-041 / P-042 / P-054 / P-055 / P-056",
      "P-025 需要安装或暴露 Cursor Agent CLI",
    ]) {
      assert.match(prd, new RegExp(marker), `missing v0.31 marker ${marker}`);
    }
  });

  test("records product delivery bundle and reviewer calibration closure", () => {
    for (const marker of [
      "版本：v0.37",
      "P-045 \\| R-010/R-011 \\| 产品交付包打包[\\s\\S]*?\\| 已测通 \\|",
      "P-046 \\| R-011 \\| reviewer 校准样本[\\s\\S]*?\\| 已测通 \\|",
      "P-059 \\| R-010/R-011 \\| 产品交付 bundle CLI[\\s\\S]*?\\| 已测通 \\|",
      "P-060 \\| R-011 \\| reviewer 评分校准与反例库[\\s\\S]*?\\| 已测通 \\|",
      "config/contracts/product-delivery-bundle-contract.json",
      "npm run meta:delivery:bundle",
      ".meta-kim/state/default/product-delivery-bundle/latest.json",
      ".meta-kim/state/default/product-delivery-bundle/latest.zh-CN.md",
      "fileCount = 12",
      "panel、readability review、rubric、case pack、GitHub gap、runtime matrix、DAG report、research report、feedback report",
      "tests/meta-theory/scenarios/reviewer-calibration-samples.json",
      "8 个 reviewer 评分样本",
      "research-before-orchestration、skill-only capability、fake parallelism、fixture pass as live、unauthorized writeback、GitHub gap overclaim、Warden approval confusion、mixed deliverables",
      "privacyStatus = \"pass\"",
      "missingPitfalls = \\[\\]",
      "已完成 P-045 / P-046 / P-059 / P-060",
      "P-025 需要安装或暴露 Cursor Agent CLI",
    ]) {
      assert.match(prd, new RegExp(marker), `missing v0.35 marker ${marker}`);
    }
  });

  test("records live research execution, freshness, and innovation sandbox closure", () => {
    for (const marker of [
      "版本：v0.37",
      "P-047 \\| R-007 \\| 真实联网研究执行层[\\s\\S]*?\\| 已测通 \\|",
      "P-048 \\| R-007/R-010 \\| 研究证据缓存与新鲜度策略[\\s\\S]*?\\| 已测通 \\|",
      "P-049 \\| R-007/R-009 \\| 能力创新候选沙箱[\\s\\S]*?\\| 已测通 \\|",
      "config/contracts/research-execution-contract.json",
      "npm run meta:research:execute",
      ".meta-kim/state/default/research-execution/latest.json",
      ".meta-kim/state/default/research-execution/latest.zh-CN.md",
      "6 条研究样本",
      "4 条 live fetch",
      "2 条 blocked",
      "staleRefreshCount = 1",
      "2 个 innovationCandidatePacket",
      "canonicalWrites = 0",
      "已完成 P-047 / P-048 / P-049",
      "P-025 需要安装或暴露 Cursor Agent CLI",
    ]) {
      assert.match(prd, new RegExp(marker), `missing v0.35 research marker ${marker}`);
    }
  });

  test("records remaining backlog closure without clearing true blockers", () => {
    for (const marker of [
      "版本：v0.37",
      "P-029 \\| R-010 \\| 跨 run 趋势服务化面板[\\s\\S]*?\\| 已测通 \\|",
      "npm run meta:trend:panel",
      ".meta-kim/state/default/run-trend-panel/latest.json",
      "5 类 filter",
      "4 个 panel",
      "P-032 \\| R-008 \\| OpenClaw batch live 稳定性改进[\\s\\S]*?\\| 已测通 \\|",
      "P-031 \\| R-009 \\| 真实 Warden approved canonical writeback[\\s\\S]*?\\| 已测通 \\|",
      "file-inventory-skill-approved-writeback",
      "warden-approved-file-inventory-skill-2026-06-05",
      "canonicalWrites = 1",
      "canonical/skills/same-set-reusable-flow-for-project-file-inventor/SKILL.md",
      "npm run meta:openclaw:batch-stability",
      "expectedFailureClass = \"timeout\"",
      "releaseGradeCandidate = false",
      "P-043 \\| R-009/R-010 \\| Warden 审批体验面板[\\s\\S]*?\\| 已测通 \\|",
      "P-044 \\| R-008 \\| runtime 解阻安装/验收手册[\\s\\S]*?\\| 已测通 \\|",
      "P-057 \\| R-009/R-010 \\| Warden 审批 diff 预览与回滚演练[\\s\\S]*?\\| 已测通 \\|",
      "P-058 \\| R-008 \\| runtime probe 变体矩阵[\\s\\S]*?\\| 已测通 \\|",
      "npm run meta:warden:approval-panel",
      "currentRepoCanonicalWrites = 0",
      "rollbackVerified = true",
      "npm run meta:runtime:probe-playbook",
      "至少 12 个 runtime/environment variant",
      "18. 已完成 P-029 / P-032 / P-043 / P-044 / P-057 / P-058",
      "19. 已完成 P-031",
      "P-025 需要安装或暴露 Cursor Agent CLI",
      "P-024 解阻前不能宣称全 runtime release-grade 完成",
    ]) {
      assert.match(prd, new RegExp(marker), `missing v0.35 remaining backlog marker ${marker}`);
    }
  });

  test("records current live runtime evidence without overclaiming release-grade completion", () => {
    for (const marker of [
      "当前 live evidence matrix",
      "Claude",
      "live pass",
      "Codex",
      "orchestrationTaskBoardPacket.synthesisOwner",
      "workerTaskPackets\\[0\\].owner",
      "OpenClaw",
      "MiniMax M3",
      "Cursor",
      "native live blocked-with-contract",
      "cursor-live-turn-harness-v0.1",
      "native_harness_missing",
      "evidenceKind = \"unsupported\"",
      "不能当 release-grade native live pass",
    ]) {
      assert.match(prd, new RegExp(marker), `missing live evidence marker ${marker}`);
    }
  });

  test("defines AI-readable standards for product outputs", () => {
    for (const marker of [
      "AI 可读产品标准",
      "设计标准",
      "执行标准",
      "验收标准",
      "反馈标准",
      "交付内容标准",
      "人话问题",
      "通过标准",
      "失败标准",
      "requiredEvidence",
      "config/contracts/ai-readable-product-standards.json",
    ]) {
      assert.match(prd, new RegExp(marker), `missing AI-readable standard ${marker}`);
    }
  });

  test("keeps Capability Gap product settings in a single PRD source", () => {
    assert.equal(
      existsSync(path.join(REPO_ROOT, "docs", "meta-kim-capability-governance-langgraph-plan.zh-CN.md")),
      false,
      "Capability Gap / LangGraph product settings must not live in a second plan"
    );
    assert.match(prd, /单一产品源/);
    assert.match(prd, /不要再维护第二份 Capability Gap \/ LangGraph 产品设定文档/);
  });

  test("defines capability as a multi-type function stack, not skill-only", () => {
    for (const marker of [
      "能力口径",
      "不是 skill-only",
      "governance agent",
      "execution agent",
      "command",
      "script",
      "MCP",
      "tools",
      "hook/runtime adapter",
      "memory/graph",
      "retrieval/research",
      "dependency/external package",
      "workerTask",
      "workerResult",
      "multi-type capability inventory",
      "researchCapabilityDiscovery",
      "deepResearchPlan",
    ]) {
      assert.match(prd, new RegExp(marker), `missing multi-capability marker ${marker}`);
    }
  });

  test("keeps user goal prompt out of product PRD requirements", () => {
    assert.doesNotMatch(prd, /下一目标提示词/);
    assert.doesNotMatch(prd, /复制.*提示词/);
  });
});
