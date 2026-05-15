# SKILL.md Refactor Verification Contract

## Decision Logic Checklist (must survive refactor)

- [ ] Clarity Gate: 4 dimensions (Scope/Goal/Constraints/Architecture), ≥2 ambiguous → ask
- [ ] Architecture Type Pre-judgment: Meta Architecture vs Project Technical Architecture
- [ ] Type A-E routing: 5 types with distinct continuations
- [ ] Fetch-first 3-step: keyword scan → search owner → score+invoke
- [ ] Keyword scan table: tdd/review/security/debug/architecture/frontend/backend/database/DEFAULT

## Execution Steps Checklist (must survive refactor)

- [ ] 8-stage spine: Critical→Fetch→Thinking→Execution→Review→Meta-Review→Verification→Evolution
- [ ] Planning files: task_plan.md, findings.md, progress.md
- [ ] Gate 3 validation: 5-point checklist (agent assigned/no skip-level/correct agents/no gaps/complexity)
- [ ] Factory Station: Genesis→Artisan sequential, Scout/Sentinel/Librarian conditional parallel
- [ ] Type B 5-step pipeline: Discovery→Pre-design→Design→Review→Integration
- [ ] Station Deliverable Contract: Warden/Genesis/Artisan/Sentinel/Librarian/Conductor/Prism/Scout

## Conditions & Triggers Checklist (must survive refactor)

- [ ] Measurable dispatch triggers: 3+ files read / 20+ lines code / multi-module / any file mod / mid-execution catch
- [ ] FORBIDDEN PATHS: 6 anti-patterns listed
- [ ] Gate 3 non-skippable, FAIL override = governance violation
- [ ] User confirmation required before Execution (stages 1-3 → show plan → confirm)
- [ ] Capability gap resolution ladder: existing owner → Type B creation → temporary fallback
- [ ] agentInvocationState lifecycle: idle→discovered→matched→dispatched→returned/escalated

## Boundaries Checklist (must survive refactor)

- [ ] Hardcoded agent names FORBIDDEN
- [ ] meta-theory is dispatcher, NOT executor (>3 sentences = violation)
- [ ] Self-Check 4 questions: skip-level/hardcoded/capability-gap/user-bypass
- [ ] Read-only mode still delegable (doesn't revoke agent authorization)

## Evolution Rules Checklist (must survive refactor)

- [ ] Direct over indirect: edit agent SOUL.md, not memory files
- [ ] Evolution writeback table: 7 gap types with targets

## Test Prompts

1. **Type A test**: "审查一下 meta-conductor 的定义是否符合 Five Criteria"
   - Expected: classify Type A, Fetch-first search quality review capability, dispatch quality audit agent

2. **Type C test**: "给 stop-memory-save hook 添加重试机制"
   - Expected: classify Type C, measurable trigger (file modification), dispatch execution agent

3. **Ambiguity test**: "优化一下项目"
   - Expected: Clarity Gate fires (≥2 dimensions ambiguous), ask before proceeding

4. **Simple task test**: "这个文件第10行什么意思"
   - Expected: no dispatch needed, answer directly (single file, single question, no modification)

5. **Type B test**: "创建一个新的 meta-auditor agent 专门做运行时健康审计"
   - Expected: classify Type B, Factory Station activates, Genesis→Artisan sequential pipeline
