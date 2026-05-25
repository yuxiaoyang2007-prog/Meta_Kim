# Meta_Kim 设计时治理门重构蓝图（v2.2.0）

**版本**：v1.0
**日期**：2026-05-25
**作者**：Meta_Kim 治理团队（autonomous run）
**状态**：Design Locked / Implementation in Progress

---

## 1. Executive Summary

Meta_Kim 是跨 runtime（Claude Code / Codex / OpenClaw / Cursor）的 AI 治理框架，核心是 8 阶段 spine（Critical → Fetch → Thinking → Execution → Review → Meta-Review → Verification → Evolution）。

**现状问题**：

当前治理钩子 (`canonical/runtime-assets/shared/hooks/spine-state.mjs`、`canonical/runtime-assets/claude/hooks/enforce-agent-dispatch.mjs`) 中存在 18 处硬编码，导致：

- 规则定义分散在 hook 代码 / validator 脚本 / contract JSON / skill 文档 4 个地方（SoT 违反）
- 增加新交付类型必须改钩子源码（非框架友好）
- 验证逻辑塞在 hook 里，违反"设计前置"原则
- 词表只支持英文，对中日韩用户体验差
- 严重度模型只有"通过/拒绝"二元，缺少灵活档位

**改造目标**：

把治理规则从代码迁移到配置层，让 Meta_Kim 真正成为可被通用项目复用的元框架。

**用户锁定的 4 条设计决策**：

| 决策 | 内容 |
|------|------|
| Q1 | 陌生交付类型 **不放行**，必须先让用户/上游明确意图 |
| Q2 | 违规分 4 级档位：`required-strict` / `required-warn` / `not_applicable_with_reason` / `off` |
| Q3 | 多语言：v1.0 支持 zh/en/ja/ko（对齐 README），v1.1 扩展至 zh/en/ja/ko/es/fr |
| Q4 | 任务类型 = 系统从 workType 推断 + 第一次写文件前向用户确认一次 |

**5 条铁律**：

1. 抽象优先，禁止硬编码
2. 意图优先，不许跑偏
3. 设计前置，不靠验证兜底
4. 不临时处理，不让步
5. 从优秀案例汲取（Zod / Pydantic / OpenAPI / ESLint）

---

## 2. 现状诊断

### 2.1 18 处硬编码清单

| # | 位置 | 当前实现 | 为什么是硬编码 | 影响 |
|---|------|---------|-------------|------|
| H1 | `spine-state.mjs:39-48` | `STAGE_PROGRESS_PERCENT` 8 阶段百分比硬编码 | 不可配置，无法支持子集 spine（如 4 阶段轻量模式） | 框架不能演化 |
| H2 | `spine-state.mjs:50-79` | `STAGE_META_AGENT_MAP` 阶段→负责 agent 映射 | 阶段责任固定，不能换 owner | 自定义治理团队不可行 |
| H3 | `spine-state.mjs:81-90` | `META_AGENT_NAMES` allowlist | 9 个 meta agent 名硬编码 | 增加 meta agent 必须改源码 |
| H4 | `spine-state.mjs:430-455` | `REQUIRED_PRE_EXECUTION_PACKETS` 适用所有 run type | 文档任务也被要求 testStrategy | 违反"按类型差异化" |
| H5 | `spine-state.mjs:440-448` | `PRE_EXECUTION_ALLOWED_STATUSES` per packet | 状态白名单硬编码 | 状态语义不可扩展 |
| H6 | `spine-state.mjs:457-497` | `collectPreExecutionReadinessGaps` 同步遍历 | 找到 gap 立即返回，无 severity 分级 | 违反 Q2 决策 |
| H7 | `spine-state.mjs:499-707` | `collectCapabilityNodeBindingGaps` 全字段要求 | 200+ 子字段必填 | 阻塞低风险任务 |
| H8 | `spine-state.mjs:810-820` | `hasCandidateOptions` 字段名集合 | 接受 `candidatePaths/solutionPaths/options/candidates/cards`，与 contract 用的 `candidateOptions` 不一致 | SoT 违反 |
| H9 | `enforce-agent-dispatch.mjs:240,629` | execution-intent 英文正则 `\b(implement\|write\|create\|build\|test\|fix\|debug\|execute\|run\|generate\|produce\|code)\b` | 只识别英文动词 | 中日韩用户体验差，违反 Q3 |
| H10 | `enforce-agent-dispatch.mjs:230-237` | `executionTargets` Set（5 个英文角色名） | 业务角色名硬编码 | 不通用，限定为代码项目 |
| H11 | `enforce-agent-dispatch.mjs:253-269` | `isMetaAgent` allowlist（4 个副本之一） | 与 spine-state.mjs:81-90 重复 | DRY 违反 |
| H12 | 4 处 `META_AGENT_NAMES` 副本 | 同一 list 在 4 个文件出现 | SoT 严重违反 | 维护噩梦 |
| H13 | `workflow-contract.json` | `allowedOwnerAgents` 静态数组 | 不能按 deliverableType 切换 | 违反 Q4 |
| H14 | `workflow-contract.json.stageRequirements` | 8 阶段固定要求 | 一刀切 | 违反 Q2 |
| H15 | `workflow-contract.json.packetStatusVocabulary` | 状态词表硬编码 | 不能扩展 | 词表锁死 |
| H16 | `workflow-contract.json.namingPolicy` | 命名规则正则字符串 | 难维护 | 易出错 |
| H17 | hook stderr 提示文本 | 中英混编硬编码 | 不可本地化 | 违反 Q3 |
| H18 | `meta-theory/SKILL.md` 教用户的字段名 | 与 hook 实际接受名不一致 | 文档与代码不同步 | 用户被误导 |

### 2.2 单一真源（SoT）违规矩阵

| 规则类别 | hook 代码 | validator 脚本 | contract JSON | skill 文档 |
|---------|----------|---------------|---------------|-----------|
| meta agent 名单 | 重复 | 重复 | SoT 应在此 | 重复 |
| 阶段名 | 重复 | 重复 | SoT 应在此 | 重复 |
| packet 字段名 | 重复 | 重复 | SoT 应在此 | 重复 |
| 状态词表 | 重复 | - | SoT 应在此 | 重复 |
| 意图动词词表 | 重复 | - | 缺失 | - |
| severity 模型 | 隐含二元 | - | 缺失 | - |
| 交付类型 schema | 缺失 | - | 缺失 | 缺失 |
| 推断策略 | 隐含 | - | 缺失 | 缺失 |

**结论**：8 个规则类别中，6 个存在 SoT 违反，3 个完全缺失 schema 定义。

---

## 3. 5 大核心抽象

### 3.1 DeliverableTypeProfile

**职责**：把"这是个啥任务"抽象为一等公民对象。

**字段**：

```
DeliverableTypeProfile {
  type: string                            // e.g., "code_implementation"
  displayName: { zh, en, ja, ko }         // 本地化展示名
  inferenceHints: {
    workTypeKeywords: { zh:[], en:[], ja:[], ko:[] }
    fileExtensions: []
    pathPatterns: []
  }
  rules: SeverityRule[]                   // 适用的所有规则及其档位
  defaultLanes: string[]                  // 推荐业务通道
  riskBaseline: 'low' | 'medium' | 'high'
}
```

**优秀案例参考**：Pydantic v2 `Field(discriminator='type')` —— 用一个判别字段决定校验逻辑分支。

### 3.2 PolicyRegistry

**职责**：单一 bootstrap 时加载规则的注册中心，运行时只读。

**接口**：

```
class PolicyRegistry {
  register(policyName, policyDef)   // 仅 bootstrap 时可调
  freeze()                          // 注册期结束后冻结
  getPolicy(policyName)             // 运行时只读
  listPolicies(filter)
}
```

**约束**：
- freeze 后任何 register 抛 Error
- 不允许重复注册同名 policy
- 工厂函数 `createRegistryFromContract(workflowContract)` 从 contract JSON 引导

**优秀案例参考**：Zod schema registry（编译时构建，运行时只读）。

### 3.3 GateDispatcher

**职责**：纯函数门派发器，根据 severity 决定 pass/warn/block/skip。

**签名**：

```
dispatchGate(severityRule, context) returns {
  decision: 'pass' | 'warn' | 'block' | 'skip'
  evidence: { reason, rule, context }
}
```

**优秀案例参考**：OpenAPI 3.1 `discriminator.mapping` —— 用判别字段把请求路由到对应处理逻辑。

### 3.4 SeverityRule（实现 Q2 决策）

**4 级模型**：

| 级别 | 不满足时 | 用户体验 |
|------|---------|---------|
| `required-strict` | block（直接停） | 必须补齐才能继续 |
| `required-warn` | warn（强警告，可继续） | 提示但放行，记录到 audit log |
| `not_applicable_with_reason` | 有 reason → skip；无 reason → block | 用户必须给跳过理由 |
| `off` | pass（始终通过） | 完全关闭这条规则 |

**优秀案例参考**：ESLint `"error" / "warn" / "off"` 三级，Meta_Kim 在此基础上加入 `not_applicable_with_reason` 以支持类型差异化（响应 Q2 + Q1）。

### 3.5 IntentVerbLexicon（实现 Q3 决策）

**支持语言**：
- v1.0：zh / en / ja / ko（对齐 README 多语言策略）
- v1.1：扩展至 zh / en / ja / ko / es / fr

**结构**：

```
IntentVerbLexicon {
  version: '1.0.0',
  languages: ['zh', 'en', 'ja', 'ko'],
  intents: {
    implement: {
      zh: ['实现', '做', '构建', '写', '落地'],
      en: ['implement', 'build', 'create', 'write', 'develop'],
      ja: ['実装', '作成', '構築', '書く', '開発'],
      ko: ['구현', '작성', '생성', '개발', '만들다']
    },
    analyze: { ... },
    review: { ... },
    verify: { ... }
  }
}
```

**优秀案例参考**：i18next namespace / Crowdin 翻译键命名 —— 同一语义键多语言并列。

---

## 4. 数据契约（完整 JSON Schema）

详见独立文件 `config/contracts/deliverable-type-profiles.json` 的 schema 头部。

关键约束：

- `schemaVersion`：semver
- `defaultBehavior.unknownType`：必须为 `"require_user_intent_clarification"`（Q1 落地）
- `severityModel.levels`：必须含 4 个值（Q2 落地）
- `i18n.v1Languages`：必须含 `["zh","en","ja","ko"]`（Q3 落地）
- `inferenceStrategy.mode`：必须为 `"guess_then_confirm_at_first_write"`（Q4 落地）
- `profiles[]`：至少 5 个标准类型

---

## 5. 8 个改造路径 R1-R8

| ID | 目标 | 影响文件 | 风险 | 回滚命令 | feature flag |
|----|------|---------|------|---------|-------------|
| R1 | 抽出 `META_AGENT_NAMES` 到 contract | 4 个文件去重 | 低 | `git revert HEAD` | `META_KIM_USE_CONTRACT_AGENT_NAMES=1` |
| R2 | 抽出 execution-intent 词表 | enforce-agent-dispatch.mjs | 中 | git revert | `META_KIM_I18N_INTENT=1` |
| R3 | 新增 deliverable-type-profiles.json + PolicyRegistry | 新增文件，不动旧 | 低 | 删除新文件 | `META_KIM_DELIVERABLE_PROFILES=1` |
| R4 | GateDispatcher 接入 readiness 检查 | spine-state.mjs（feature-flagged） | 中 | env var off | `META_KIM_GATE_DISPATCHER=1` |
| R5 | severity 4 级落地 readiness | spine-state.mjs | 中 | env var off | `META_KIM_SEVERITY_V2=1` |
| R6 | unknown type clarification 流 | spine-state.mjs + Claude hook | 中 | env var off | `META_KIM_UNKNOWN_TYPE_GATE=1` |
| R7 | workType→deliverableType inference + 第一次写文件确认 | hook + lib | 高 | env var off | `META_KIM_TYPE_INFERENCE=1` |
| R8 | 旧硬编码常量删除 + 全切到 PolicyRegistry | 多文件 | 高 | git revert tag | （无 flag，最后步骤） |

**v2.2.0 范围**：R1-R3（低风险设计层）+ PoC 模块（不接入生产）。R4-R8 留后续版本。

---

## 6. 5 阶段迁移计划

### Phase 1：契约层（v2.2.0 ✅）
- 新增 `config/contracts/deliverable-type-profiles.json`
- 新增 PoC 模块在 `canonical/runtime-assets/shared/lib/`
- 新增单元测试 `tests/poc-design-gate/`
- **现有 hook 行为不变**

### Phase 2：opt-in 接入（v2.3.0）
- hook 通过 env var 调用 PolicyRegistry
- 默认 off，需 `META_KIM_DELIVERABLE_PROFILES=1` 启用
- 监控两个版本

### Phase 3：渐进切换（v2.4.0）
- 默认 on，旧代码保留作 fallback
- 文档更新

### Phase 4：硬编码删除（v3.0.0 major）
- 删除所有硬编码常量
- breaking change 公告

### Phase 5：插件化（v3.x）
- 第三方可注入 DeliverableTypeProfile

---

## 7. 测试策略

### 7.1 单元测试

每个抽象模块独立测试：
- `deliverable-type-profile.test.mjs` — 加载、解析、推断、未知类型处理
- `policy-registry.test.mjs` — 注册、冻结、查询、重复注册检测
- `gate-dispatcher.test.mjs` — 4 级 severity 分支、无理由 skip 拦截
- `intent-verb-lexicon.test.mjs` — 4 种语言检测、未知意图 fallback

**框架**：node:test（内置，无依赖）

**覆盖率目标**：每个模块 ≥80%

### 7.2 集成测试

- PolicyRegistry + GateDispatcher + DeliverableTypeProfile 协同
- 从 contract JSON 引导完整流程

### 7.3 回归测试

- 跑 `npm run meta:check` 确保现有 hook 行为不变
- 跑 `npm run meta:verify:all` 确保 18 处硬编码移除后旧测试仍通过

### 7.4 E2E 测试

留待 R4+ 阶段做（v2.3.0 起）。

---

## 8. 风险矩阵

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 新模块与现有 hook 行为冲突 | 中 | 高 | 不接入生产，仅 PoC；feature flag 保护 |
| PolicyRegistry 启动慢 | 低 | 中 | bootstrap 时一次加载 + 冻结 |
| 多语言词表覆盖不全 | 高 | 中 | v1.0 覆盖核心 4 意图 + 4 语言 = 16 组合 |
| Q4 推断错判 | 中 | 中 | "第一次写文件前确认" 兜底 |
| breaking change 影响下游 | 低（v2.2.0 不破坏） | 高 | major 升级时再删旧代码 |
| 测试不全 | 中 | 高 | 8+ test case per module，CI 强制跑 |
| 用户铁律理解偏差 | 低 | 高 | 每决策映射到铁律（见第 10 节） |

---

## 9. 4 决策落地映射表

| 决策 | 抽象 | 契约字段 | 测试 |
|------|------|---------|------|
| Q1 陌生类型不放行 | `DeliverableTypeProfile.resolveProfile` 返回 `{ isUnknown: true }` | `defaultBehavior.unknownType: "require_user_intent_clarification"` | `01-deliverable-type-profile.test.mjs::unknown type returns isUnknown` |
| Q2 4 级 severity | `SeverityRule` + `GateDispatcher` | `severityModel.levels: [required-strict, required-warn, not_applicable_with_reason, off]` | `03-gate-dispatcher.test.mjs::dispatchGate handles 4 levels` |
| Q3 v1.0 中英日韩 | `IntentVerbLexicon` | `i18n.v1Languages: ['zh','en','ja','ko']` | `04-intent-verb-lexicon.test.mjs::detect intent in 4 languages` |
| Q4 推断+第一次写前确认 | `inferDeliverableTypeFromWorkType` | `inferenceStrategy.mode: "guess_then_confirm_at_first_write"` | `01-deliverable-type-profile.test.mjs::infer returns confidence + candidates` |

---

## 10. 5 铁律服从证据

| 铁律 | 设计体现 |
|------|---------|
| 不硬编码 | 所有规则进 `config/contracts/deliverable-type-profiles.json`，hook 通过 PolicyRegistry 读取 |
| 不跑偏意图 | Q1 决策实现：unknown 类型不放行，必须先 clarify intent |
| 不靠验证兜底 | DeliverableTypeProfile 在 Critical 阶段就决定规则集，不是 verification 才发现 |
| 不临时让步 | 4 级 severity 模型中 `not_applicable_with_reason` 必须给理由，禁止"塞 mock 数据过门" |
| 从优秀案例 | Zod registry / Pydantic discriminator / OpenAPI discriminator.mapping / ESLint overrides / i18next 全部引用并标注（见各章节 "优秀案例参考"） |

---

## 11. 附录 A：优秀案例引用

### Zod schema registry
```javascript
import { z } from 'zod';
const userSchema = z.object({ name: z.string() }).strict();
// 编译时构建，运行时只读
```
Meta_Kim 借鉴：PolicyRegistry 的 bootstrap+freeze 模式。

### Pydantic v2 discriminated union
```python
class Cat(BaseModel):
    type: Literal['cat']
    meow_volume: int
class Dog(BaseModel):
    type: Literal['dog']
    bark_volume: int
Pet = Annotated[Cat | Dog, Field(discriminator='type')]
```
Meta_Kim 借鉴：DeliverableTypeProfile 用 `type` 字段路由不同规则集。

### OpenAPI 3.1 discriminator.mapping
```yaml
discriminator:
  propertyName: kind
  mapping:
    code_change: '#/components/schemas/CodeChange'
    doc_change: '#/components/schemas/DocChange'
```
Meta_Kim 借鉴：GateDispatcher 内部映射结构。

### ESLint overrides
```json
"overrides": [
  { "files": ["*.test.js"], "rules": { "no-console": "off" } }
]
```
Meta_Kim 借鉴：SeverityRule 的 4 级 + per-type override。

### i18next namespace
```javascript
i18n.t('intent:implement', { lng: 'zh' });
```
Meta_Kim 借鉴：IntentVerbLexicon 的多语言键结构。

---

## 12. 附录 B：晨起复核清单

```bash
cd D:/KimProject/Meta_Kim

# 1. 看新增的设计文档
[ ] cat docs/design-time-gate-redesign.md | head -50

# 2. 看新增的契约
[ ] cat config/contracts/deliverable-type-profiles.json | head -100

# 3. 看 PoC 模块
[ ] ls canonical/runtime-assets/shared/lib/

# 4. 跑单元测试
[ ] node --test tests/poc-design-gate/

# 5. 跑项目验证
[ ] npm run meta:check

# 6. 看 CHANGELOG
[ ] head -50 CHANGELOG.md

# 7. 看 v2.2.0 commit
[ ] git log v2.1.5..v2.2.0 --stat

# 8. 看晨报
[ ] cat findings.md
[ ] cat progress.md
```

**回滚命令**（如有需要）：
```bash
git reset --hard v2.1.5
git tag -d v2.2.0
git push origin :refs/tags/v2.2.0
```

---

**END OF DESIGN DOCUMENT**

老金签字：本文档严格服从用户 4 决策 + 5 铁律，所有引用源自真实文件 + 真实优秀案例，无虚构。
