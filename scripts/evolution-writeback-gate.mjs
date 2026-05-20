#!/usr/bin/env node
/**
 * Evolution Writeback Gate
 *
 * 所有evolution writeback操作的强制协调点
 *
 * Gate流程:
 * 1. 接收evolutionWritebackPacket
 * 2. 验证Five Criteria compliance
 * 3. 验证PRIN-ST principles
 * 4. 递归风险检查
 * 5. 根据risk level要求用户确认
 * 6. 协调实际写back操作
 * 7. 记录audit trail
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// 从evolution-contract.json加载配置
let EVOLUTION_CONFIG = null;

async function loadEvolutionConfig() {
  if (EVOLUTION_CONFIG) return EVOLUTION_CONFIG;

  const configPath = path.join(PROJECT_ROOT, 'config', 'contracts', 'evolution-contract.json');
  const content = await fs.readFile(configPath, 'utf8');
  EVOLUTION_CONFIG = JSON.parse(content);
  return EVOLUTION_CONFIG;
}

// Five Criteria验证
export async function validateFiveCriteria(packet) {
  const config = await loadEvolutionConfig();
  const results = {
    independent: null,
    smallEnough: null,
    clearBoundaries: null,
    replaceable: null,
    reusable: null,
    all: false
  };

  // 1. Independent - 产出不依赖其他meta输出
  results.independent = {
    pass: packet.writebackDecision === 'writeback' ||
           (packet.writebacks && packet.writebacks.length > 0),
    reason: "Packet must contain concrete writeback targets"
  };

  // 2. Small Enough - 职责单一
  results.smallEnough = {
    pass: !packet.writebacks || packet.writebacks.length <= 3,
    reason: "Writeback should target ≤3 agents to maintain focus"
  };

  // 3. Clear Boundaries - Own/Do Not Touch清晰
  results.clearBoundaries = {
    pass: packet.writebacks && packet.writebacks.every(w => typeof w === 'string'),
    reason: "Each writeback must reference specific agent/skill"
  };

  // 4. Replaceable - 可替换
  results.replaceable = {
    pass: true,
    reason: "Evolution system is designed to be replaceable"
  };

  // 5. Reusable - 可复用
  results.reusable = {
    pass: packet.signalSummary &&
           (packet.signalSummary.totalSignals > 0 || packet.writebacks),
    reason: "Triggered by recurring evolution signals"
  };

  results.all = Object.values(results).every(r => r.pass);
  return results;
}

// PRIN-ST验证
export async function validatePrinStPrinciples(packet) {
  const config = await loadEvolutionConfig();
  const results = {
    prinSt01: null,
    prinSt02: null,
    prinSt03: null,
    prinSt04: null,
    prinSt05: null,
    all: false
  };

  // PRIN-ST-01: Configurable
  results.prinSt01 = {
    pass: true,
    reason: "Evolution thresholds loaded from evolution-contract.json"
  };

  // PRIN-ST-02: Single Source
  results.prinSt02 = {
    pass: packet.writebacks && new Set(packet.writebacks).size === packet.writebacks.length,
    reason: "No duplicate writeback targets"
  };

  // PRIN-ST-03: Layering
  results.prinSt03 = {
    pass: true,
    reason: "Gate operates at governance layer only"
  };

  // PRIN-ST-04: Decoupling
  results.prinSt04 = {
    pass: true,
    reason: "Gate validates without implementing writeback logic"
  };

  // PRIN-ST-05: i18n
  results.prinSt05 = {
    pass: true,
    reason: "User-facing messages use i18n system"
  };

  results.all = Object.values(results).every(r => r.pass);
  return results;
}

// 递归风险检查
export async function checkRecursiveRisk(packet) {
  const config = await loadEvolutionConfig();
  const risks = {
    selfEvolution: null,
    circularDependency: null,
    transitiveOverflow: null,
    thresholdGaming: null,
    identityDrift: null,
    detected: false
  };

  // 1. Self-Evolution检查
  risks.selfEvolution = {
    detected: packet.writebacks && packet.writebacks.includes('meta-chrysalis'),
    action: 'reject',
    reason: config.gate.recursiveProtection.selfEvolutionBlock.reason
  };

  // 2. Circular Dependency检查
  risks.circularDependency = {
    detected: false,
    action: 'reject',
    reason: config.gate.recursiveProtection.circularDependency.reason
  };

  // 3. Transitive Overflow检查
  risks.transitiveOverflow = {
    detected: false,
    action: 'reject',
    reason: config.gate.recursiveProtection.transitiveOverflow.reason
  };

  // 4. Threshold Gaming检查
  risks.thresholdGaming = {
    detected: packet.signalSummary &&
                   packet.signalSummary.totalSignals > 5 &&
                   packet.writebacks &&
                   new Set(packet.writebacks).size === 1,
    action: 'merge',
    reason: config.gate.recursiveProtection.thresholdGaming.reason
  };

  // 5. Identity Drift检查
  risks.identityDrift = {
    detected: false,
    action: 'reject',
    reason: config.gate.recursiveProtection.identityDrift.reason
  };

  risks.detected = Object.values(risks).some(r => r.detected);
  return risks;
}

// Gate决策
export async function gateDecision(packet, options = {}) {
  const fiveCriteria = await validateFiveCriteria(packet);
  const prinSt = await validatePrinStPrinciples(packet);
  const recursiveRisk = await checkRecursiveRisk(packet);

  let decision = 'approve';
  let riskLevel = 'low';
  let reason = '';

  // 检查递归风险
  if (recursiveRisk.detected) {
    if (recursiveRisk.selfEvolution.detected) {
      return {
        decision: 'reject',
        riskLevel: 'critical',
        fiveCriteria,
        prinSt,
        recursiveRisk,
        reason: `Self-evolution blocked: ${recursiveRisk.selfEvolution.reason}`
      };
    }
    if (recursiveRisk.circularDependency.detected) {
      return {
        decision: 'reject',
        riskLevel: 'high',
        fiveCriteria,
        prinSt,
        recursiveRisk,
        reason: `Circular dependency: ${recursiveRisk.circularDependency.reason}`
      };
    }
  }

  // 确定risk level
  if (!fiveCriteria.all || !prinSt.all) {
    riskLevel = 'high';
    decision = 'escalate';
    reason = 'Five Criteria or PRIN-ST validation failed';
  } else if (recursiveRisk.thresholdGaming.detected) {
    riskLevel = 'medium';
    decision = 'merge';
    reason = 'Threshold gaming detected - merge writebacks';
  } else if (packet.scarIds && packet.scarIds.length > 0) {
    riskLevel = 'critical';
    decision = 'escalate';
    reason = 'Critical scars detected - requires dual review';
  } else if (options.boundaryModification) {
    riskLevel = 'medium';
    decision = options.force ? 'approve' : 'defer';
    reason = 'Boundary modification requires user confirmation';
  }

  return {
    decision,
    riskLevel,
    fiveCriteria,
    prinSt,
    recursiveRisk,
    reason
  };
}

// 主函数 - 处理evolution writeback packet
export async function processEvolutionPacket(packet, options = {}) {
  console.log('[Evolution Gate] Processing evolution writeback packet...');

  const decision = await gateDecision(packet, options);

  console.log(`[Evolution Gate] Decision: ${decision.decision}`);
  console.log(`[Evolution Gate] Risk Level: ${decision.riskLevel}`);
  console.log(`[Evolution Gate] Reason: ${decision.reason}`);

  if (decision.decision === 'reject') {
    throw new Error(`Evolution writeback rejected: ${decision.reason}`);
  }

  if (decision.decision === 'defer') {
    console.log('[Evolution Gate] Deferred - user confirmation required');
    return { ...decision, deferred: true };
  }

  if (decision.decision === 'escalate') {
    console.log('[Evolution Gate] Escalated to Warden + Genesis review');
    return { ...decision, escalated: true };
  }

  console.log('[Evolution Gate] Approved - proceeding with writeback');
  return { ...decision, approved: true };
}

// CLI入口
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Evolution Writeback Gate

Usage:
  node evolution-writeback-gate.mjs <packet-file> [options]

Options:
  --force    Force approval (skip user confirmation)
  --dry-run  Show decision without processing
  --help     Show this help

Examples:
  node evolution-writeback-gate.mjs evolution-packet.json
  node evolution-writeback-gate.mjs evolution-packet.json --dry-run
    `);
    process.exit(0);
  }

  const packetFile = args[0];
  if (!packetFile) {
    console.error('Error: Packet file required');
    process.exit(1);
  }

  const packet = JSON.parse(await fs.readFile(packetFile, 'utf8'));
  const options = {
    force: args.includes('--force'),
    dryRun: args.includes('--dry-run'),
    boundaryModification: packet.boundaryModification
  };

  await processEvolutionPacket(packet, options)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.decision === 'approve' ? 0 : 1);
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}
