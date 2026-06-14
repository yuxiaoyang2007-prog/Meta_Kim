/**
 * Meta_Kim + agent-teams-playbook Integration Test
 *
 * This test demonstrates the Stage 4 Execution integration with agent-teams-playbook.
 * Run: node tests/integration/agent-teams-playbook-integration.test.mjs
 */

// =============================================================================
// Mock: Simulated agent-teams-playbook natural language output
// =============================================================================

const mockPlaybookOutput = `
# Agent Teams 编排分析报告

## 任务分析

**部门**: AI Department
**主要交付物**: 用户认证服务，支持 OAuth2 + JWT
**目标受众**: 内部开发者
**复杂度**: 中等（3-5步，需要并行）

## 场景决策

选定场景: 场景3（计划+评审）

**决策依据**:
- 任务复杂度: 中等
- 需要多角色协作: 是（API、安全、数据库）
- 并行执行可行: 是

## 团队蓝图

| ID | 角色 | 职责 | 模型 | Subagent类型 | 技能/类型 |
|----|------|------|------|-------------|----------|
| 1 | API开发者 | 实现 OAuth2 + JWT 认证 API | opus | api-developer | auth-service |
| 2 | 安全专家 | 安全审计和渗透测试 | sonnet | security-auditor | oauth2 |
| 3 | 数据库专家 | 设计用户表和 Token 存储 | sonnet | database-admin | postgres |

## 协作模式

协作模式: Subagent

**并行执行**:
- API开发者 (ID: 1)
- 安全专家 (ID: 2) [并行]
- 数据库专家 (ID: 3) [并行]

**串行依赖**:
- API开发者 完成后 → 整合测试

## 评审策略

- 代码审查: 自动 (puppeteer test)
- 安全审查: 人工 (安全专家)
- 集成测试: 自动化

## 交付物

1. auth-service/ - 认证服务实现
2. tests/ - 测试用例
3. docs/ - API 文档
`;

// =============================================================================
// ParseError Class
// =============================================================================

class ParseError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "ParseError";
  }
}

// =============================================================================
// Parsing Functions (from meta-conductor.md Stage 4)
// =============================================================================

function parseScenario(nlOutput) {
  // Chinese pattern
  const zhMatch = nlOutput.match(
    /选定场景[:：]\s*场景(\d+)[（(]([^）)]+)[）)]/,
  );
  if (zhMatch) {
    return { scenario: parseInt(zhMatch[1]), mode: zhMatch[2].trim() };
  }

  // English fallback
  const enMatch = nlOutput.match(
    /Selected Scenario[:：]\s*Scenario\s*(\d+)\s*\(?\s*([^)]+)\s*\)?/i,
  );
  if (enMatch) {
    return { scenario: parseInt(enMatch[1]), mode: enMatch[2].trim() };
  }

  throw new ParseError(
    "SCENARIO_MISSING",
    "Cannot determine scenario from playbook output",
  );
}

function parseTeamBlueprint(tableSection) {
  const rows = tableSection
    .split("\n")
    .filter((line) => line.match(/^\|\s*\d+\s*\|/));

  // BLUEPRINT_EMPTY: No team blueprint rows found
  if (rows.length === 0) {
    throw new ParseError(
      "BLUEPRINT_EMPTY",
      "No team blueprint rows found in playbook output",
    );
  }

  return rows.map((row) => {
    const cols = row
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());

    // BLUEPRINT_COLUMN_MISMATCH: Expected 6 columns
    if (cols.length !== 6) {
      throw new ParseError(
        "BLUEPRINT_COLUMN_MISMATCH",
        `Expected 6 columns, got ${cols.length}`,
      );
    }

    return {
      id: parseInt(cols[0]),
      role: cols[1],
      responsibility: cols[2],
      model: cols[3],
      subagentType: cols[4],
      skillOrType: cols[5],
    };
  });
}

function parseCollaborationMode(nlOutput) {
  const match =
    nlOutput.match(/协作模式[:：]\s*(Subagent|Agent Team)/i) ||
    nlOutput.match(/Collaboration.*Mode[:：]\s*(Subagent|Agent Team)/i) ||
    nlOutput.match(/(Subagent|Agent Team)/i);

  if (!match) {
    throw new ParseError(
      "DISPATCH_BOARD_MISSING",
      "Cannot determine collaboration mode",
    );
  }

  return { mode: match[1].trim() };
}

// =============================================================================
// teamBlueprint to workerTaskPackets Conversion
// =============================================================================

function convertToWorkerTaskPackets(blueprint, scenario) {
  const parallelGroup = `PG-${scenario}-${Date.now().toString(36)}`;

  return blueprint.map((member, index) => ({
    id: `TASK-${member.id}`,
    role: member.role,
    responsibility: member.responsibility,
    model: member.model,
    subagentType: member.subagentType,
    skillOrType: member.skillOrType,
    parallelGroup: index === 0 ? null : parallelGroup,
    dependsOn: index === 0 ? null : `TASK-${blueprint[index - 1].id}`,
    mergeOwner: index === blueprint.length - 1 ? "meta-conductor" : null,
  }));
}

// =============================================================================
// Test Runner
// =============================================================================

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${err.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${expected}, got ${actual}`);
  }
}

function assertContains(arr, item, msg) {
  if (!arr.includes(item)) {
    throw new Error(`${msg}: array does not contain ${item}`);
  }
}

// =============================================================================
// Run Tests
// =============================================================================

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("🔄 META-CONDUCTOR STAGE 4 INTEGRATION TEST");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

// Test 1: Parse Scenario
test("Parse scenario correctly", () => {
  const result = parseScenario(mockPlaybookOutput);
  console.log(`   Parsed: scenario=${result.scenario}, mode=${result.mode}`);
  assertEqual(result.scenario, 3, "scenario");
  assertEqual(result.mode.includes("计划+评审"), true, "mode");
});

// Test 2: Parse Team Blueprint
test("Parse team blueprint correctly", () => {
  const tableSection =
    mockPlaybookOutput.match(/## 团队蓝图\n([\s\S]+?)##/)?.[1] || "";
  const result = parseTeamBlueprint(tableSection);
  console.log(`   Parsed ${result.length} team members`);
  assertEqual(result.length, 3, "team size");
  assertEqual(result[0].id, 1, "first member id");
  assertEqual(result[0].role, "API开发者", "first member role");
  assertEqual(result[0].subagentType, "api-developer", "first member type");
  assertEqual(result[1].role, "安全专家", "second member role");
  assertEqual(result[2].role, "数据库专家", "third member role");
});

// Test 3: Parse Collaboration Mode
test("Parse collaboration mode correctly", () => {
  const result = parseCollaborationMode(mockPlaybookOutput);
  console.log(`   Mode: ${result.mode}`);
  assertEqual(result.mode, "Subagent", "collaboration mode");
});

// Test 4: Convert to workerTaskPackets
test("Convert blueprint to workerTaskPackets", () => {
  const tableSection =
    mockPlaybookOutput.match(/## 团队蓝图\n([\s\S]+?)##/)?.[1] || "";
  const blueprint = parseTeamBlueprint(tableSection);
  const scenario = parseScenario(mockPlaybookOutput);

  const workerPackets = convertToWorkerTaskPackets(
    blueprint,
    scenario.scenario,
  );
  console.log(`   Generated ${workerPackets.length} task packets`);

  assertEqual(workerPackets.length, 3, "task count");
  assertEqual(
    workerPackets[0].parallelGroup,
    null,
    "lead task has no parallel group",
  );
  assertEqual(workerPackets[0].dependsOn, null, "lead task has no dependency");
  assertEqual(
    workerPackets[1].parallelGroup !== null,
    true,
    "parallel task has group",
  );
  assertEqual(workerPackets[2].mergeOwner, "meta-conductor", "merge owner");
});

// Test 5: Error Handling
test("Handle BLUEPRINT_EMPTY error", () => {
  try {
    parseTeamBlueprint("No valid rows here");
    throw new Error("Should have thrown ParseError");
  } catch (err) {
    if (err instanceof ParseError && err.code === "BLUEPRINT_EMPTY") {
      console.log(`   Correctly threw: ${err.code} - ${err.message}`);
    } else {
      throw err;
    }
  }
});

// Test 6: Complete Pipeline
test("Run complete integration pipeline", () => {
  const scenario = parseScenario(mockPlaybookOutput);
  const tableSection =
    mockPlaybookOutput.match(/## 团队蓝图\n([\s\S]+?)##/)?.[1] || "";
  const blueprint = parseTeamBlueprint(tableSection);
  const collaborationMode = parseCollaborationMode(mockPlaybookOutput);
  const workerPackets = convertToWorkerTaskPackets(
    blueprint,
    scenario.scenario,
  );

  const result = {
    scenario,
    collaborationMode,
    teamBlueprint: blueprint,
    workerTaskPackets: workerPackets,
    dispatchEnvelope: {
      workflowFamily: "business",
      primaryDeliverable: "用户认证服务 OAuth2 + JWT",
      executionAgents: workerPackets.map((p) => p.subagentType),
      parallelGroups: workerPackets
        .filter((p) => p.parallelGroup)
        .map((p) => p.parallelGroup),
    },
  };

  console.log("\n📦 Complete Integration Result:");
  console.log(JSON.stringify(result, null, 2));

  assertEqual(result.scenario.scenario, 3, "scenario");
  assertEqual(result.teamBlueprint.length, 3, "team size");
  assertEqual(result.workerTaskPackets.length, 3, "task count");
  assertContains(
    result.dispatchEnvelope.executionAgents,
    "api-developer",
    "agents",
  );
  assertContains(
    result.dispatchEnvelope.executionAgents,
    "security-auditor",
    "agents",
  );
  assertContains(
    result.dispatchEnvelope.executionAgents,
    "database-admin",
    "agents",
  );
});

// =============================================================================
// Summary
// =============================================================================

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`📊 TEST RESULTS: ${passed} passed, ${failed} failed`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

if (failed > 0) {
  console.log("❌ SOME TESTS FAILED");
  process.exit(1);
} else {
  console.log("✅ ALL TESTS PASSED!");
  console.log("\n🔄 INTEGRATION DEMO:");
  console.log(`
【Step 1: Skill Invocation】
Skill(
  skill="agent-teams-playbook",
  args="Task: 实现用户认证服务
        Department: AI Department
        Deliverable: OAuth2 + JWT 认证"
)

【Step 2: Receive Natural Language Output】
  ↓ (simulated in mockPlaybookOutput)

【Step 3: Parse Output】
  ✅ Scenario: 3 (计划+评审)
  ✅ Team Blueprint: 3 members
  ✅ Collaboration Mode: Subagent

【Step 4: Generate workerTaskPackets】
  ✅ TASK-1: api-developer (sequential lead)
  ✅ TASK-2: security-auditor (parallel)
  ✅ TASK-3: database-admin (parallel)
  ✅ Merge Owner: meta-conductor

【Step 5: Execute via Task() tool】
  Task(subagent_type="api-developer", ...)
  Task(subagent_type="security-auditor", ...) [parallel]
  Task(subagent_type="database-admin", ...) [parallel]
`);
  process.exit(0);
}
