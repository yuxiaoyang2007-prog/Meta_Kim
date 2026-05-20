#!/usr/bin/env node

/**
 * detect-evolution-signals.mjs
 *
 * Detects evolution signals from multiple sources:
 * 1. Git diff analysis - detects changes in canonical/agents/ and canonical/skills/
 * 2. Pattern extraction - extracts repeated patterns from governed run artifacts
 * 3. Boundary drift detection - compares current agent definitions with actual usage
 * 4. Capability gap detection - identifies Fetch 0 matches situations
 *
 * Output: JSON array of evolution signals
 */

import { promises as fs } from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// Evolution config cache
let evolutionConfig = null;

async function loadEvolutionConfig() {
  if (evolutionConfig) return evolutionConfig;
  try {
    const configPath = path.join(repoRoot, "config/contracts/evolution-contract.json");
    const content = await fs.readFile(configPath, "utf8");
    evolutionConfig = JSON.parse(content);
  } catch (err) {
    console.warn("Could not load evolution-contract.json, using defaults");
    evolutionConfig = {
      thresholds: {
        gitAnalysis: { defaultCommitRange: "HEAD~10..HEAD" },
        signalAggregation: { minPatternCount: 2 },
        soulSize: { maxLines: 300 }
      }
    };
  }
  return evolutionConfig;
}

const DEFAULT_ARTIFACTS_DIR = path.join(repoRoot, "tests/fixtures/run-artifacts");
const DEFAULT_SIGNALS_DIR = path.join(repoRoot, ".meta-kim/signals");
const CANONICAL_AGENTS_DIR = path.join(repoRoot, "canonical/agents");
const CANONICAL_SKILLS_DIR = path.join(repoRoot, "canonical/skills");
const CAPABILITY_INDEX_PATH = path.join(repoRoot, "config/capability-index/meta-kim-capabilities.json");

// Signal types enum
const SIGNAL_TYPES = {
  GIT_DIFF_CHANGE: "git_diff_change",
  REPEATED_PATTERN: "repeated_pattern",
  BOUNDARY_DRIFT: "boundary_drift",
  CAPABILITY_GAP: "capability_gap",
  FETCH_ZERO_MATCH: "fetch_zero_match",
  AGENT_USAGE_MISMATCH: "agent_usage_mismatch",
};

// Signal severities
const SEVERITY = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
};

/**
 * Parse CLI arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    artifactsDir: DEFAULT_ARTIFACTS_DIR,
    signalsDir: DEFAULT_SIGNALS_DIR,
    outputFormat: "json",
    commitRange: null,
    since: null,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--artifacts":
        options.artifactsDir = args[++i];
        break;
      case "--signals-dir":
        options.signalsDir = args[++i];
        break;
      case "--commit-range":
        options.commitRange = args[++i];
        break;
      case "--since":
        options.since = args[++i];
        break;
      case "--format":
        options.outputFormat = args[++i];
        break;
      default:
        // Ignore unknown args
        break;
    }
  }

  return options;
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Usage: node scripts/detect-evolution-signals.mjs [options]

Detects evolution signals from git changes, governed runs, and capability gaps.

Options:
  -h, --help              Show this help message
  --artifacts <dir>       Directory containing governed run artifacts (default: tests/fixtures/run-artifacts)
  --signals-dir <dir>     Directory to store signal files (default: .meta-kim/signals)
  --commit-range <range>  Git commit range to analyze (e.g., HEAD~10..HEAD)
  --since <date>          Analyze changes since a date (e.g., "1 week ago")
  --format <format>       Output format: json, pretty (default: json)

Examples:
  node scripts/detect-evolution-signals.mjs
  node scripts/detect-evolution-signals.mjs --commit-range HEAD~20..HEAD
  node scripts/detect-evolution-signals.mjs --since "1 week ago" --format pretty
  node scripts/detect-evolution-signals.mjs --artifacts ./my-artifacts
`);
}

/**
 * Execute git command and return stdout
 */
async function gitExec(args, cwd = repoRoot) {
  try {
    const { stdout } = await execAsync(`git ${args}`, { cwd });
    return stdout.trim();
  } catch (error) {
    // Git commands may fail if not in a git repo or other issues
    return null;
  }
}

/**
 * Detect git diff changes in canonical directories
 */
async function detectGitDiffChanges(options) {
  const signals = [];
  const config = await loadEvolutionConfig();
  const commitRange = options.commitRange || "HEAD";

  // Build git diff command
  let diffArgs = "diff --name-status";
  if (options.since) {
    diffArgs += ` --since="${options.since}"`;
  } else if (options.commitRange) {
    diffArgs += ` ${commitRange}`;
  } else {
    // Use configured default commit range
    diffArgs += ` ${config.thresholds.gitAnalysis.defaultCommitRange}`;
  }

  const diffOutput = await gitExec(diffArgs);
  if (!diffOutput) {
    return signals;
  }

  const changes = diffOutput.split("\n").filter((line) => line.trim());
  const canonicalChanges = changes.filter((line) => {
    const parts = line.split("\t");
    const filePath = parts[1] || "";
    return (
      filePath.startsWith("canonical/agents/") ||
      filePath.startsWith("canonical/skills/") ||
      filePath.startsWith("config/contracts/") ||
      filePath.startsWith("config/capability-index/")
    );
  });

  for (const change of canonicalChanges) {
    const [status, filePath] = change.split("\t");
    let signalType = SIGNAL_TYPES.GIT_DIFF_CHANGE;
    let severity = SEVERITY.LOW;

    // Determine severity based on file type and status
    if (filePath.includes("canonical/agents/")) {
      severity = status === "D" ? SEVERITY.HIGH : SEVERITY.MEDIUM;
      signalType = SIGNAL_TYPES.BOUNDARY_DRIFT;
    } else if (filePath.includes("canonical/skills/meta-theory/")) {
      severity = SEVERITY.HIGH;
    } else if (filePath.includes("config/contracts/")) {
      severity = SEVERITY.CRITICAL;
    }

    signals.push({
      id: `git-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: signalType,
      severity,
      source: "git",
      timestamp: new Date().toISOString(),
      data: {
        filePath,
        status,
        statusMeaning: getStatusMeaning(status),
      },
      description: `Git change detected: ${status} ${filePath}`,
      suggestedAction: getSuggestedAction(filePath, status),
    });
  }

  return signals;
}

/**
 * Get human-readable meaning of git status
 */
function getStatusMeaning(status) {
  const meanings = {
    M: "Modified",
    A: "Added",
    D: "Deleted",
    R: "Renamed",
    C: "Copied",
    T: "Type changed",
  };
  return meanings[status.charAt(0)] || status;
}

/**
 * Get suggested action based on file path and status
 */
function getSuggestedAction(filePath, status) {
  if (filePath.includes("canonical/agents/")) {
    if (status === "D") {
      return "Agent deleted - review for retirement or migrate to new owner";
    }
    return "Agent boundary changed - consider meta-genesis review";
  }
  if (filePath.includes("canonical/skills/meta-theory/")) {
    return "Meta-theory changed - run npm run meta:sync and npm run meta:validate";
  }
  if (filePath.includes("config/contracts/")) {
    return "Contract changed - all run artifacts must re-validate";
  }
  return "Review change for evolution impact";
}

/**
 * Extract patterns from governed run artifacts
 */
async function extractRepeatedPatterns(options) {
  const signals = [];
  const config = await loadEvolutionConfig();
  const artifactsDir = path.resolve(options.artifactsDir);

  try {
    const entries = await fs.readdir(artifactsDir, { withFileTypes: true });
    const artifactFiles = entries
      .filter((e) => e.isFile() && e.name.endsWith(".json"))
      .map((e) => path.join(artifactsDir, e.name));

    // Track patterns across runs
    const patternCounts = new Map();
    const capabilityUsage = new Map();
    const agentUsage = new Map();

    for (const artifactPath of artifactFiles) {
      try {
        const content = await fs.readFile(artifactPath, "utf8");
        const artifact = JSON.parse(content);

        // Extract patterns from fetchPacket
        if (artifact.fetchPacket) {
          // Track capability matches
          for (const match of artifact.fetchPacket.capabilityMatches || []) {
            const key = `capability:${match.capability}`;
            capabilityUsage.set(key, (capabilityUsage.get(key) || 0) + 1);
          }

          // Track capability gaps
          for (const gap of artifact.fetchPacket.capabilityGaps || []) {
            const key = `gap:${gap.capability}`;
            patternCounts.set(key, (patternCounts.get(key) || 0) + 1);
          }
        }

        // Track agent usage
        if (artifact.dispatchEnvelopePacket?.ownerAgent) {
          const owner = artifact.dispatchEnvelopePacket.ownerAgent;
          agentUsage.set(owner, (agentUsage.get(owner) || 0) + 1);
        }

        // Track workers
        for (const worker of artifact.workerTaskPackets || []) {
          const owner = worker.owner;
          agentUsage.set(owner, (agentUsage.get(owner) || 0) + 1);
        }

        // Track evolution decisions
        if (artifact.evolutionWritebackPacket) {
          const decision = artifact.evolutionWritebackPacket.writebackDecision;
          const key = `evolution:${decision}`;
          patternCounts.set(key, (patternCounts.get(key) || 0) + 1);
        }
      } catch (error) {
        // Skip invalid artifacts
        continue;
      }
    }

    // Detect repeated patterns - use configured threshold
    const minPatternCount = config.thresholds.signalAggregation?.minPatternCount || 2;
    for (const [pattern, count] of patternCounts.entries()) {
      if (count >= minPatternCount) {
        // Only report if pattern appears minPatternCount+ times
        signals.push({
          id: `pattern-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: SIGNAL_TYPES.REPEATED_PATTERN,
          severity: count >= 3 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
          source: "artifact-analysis",
          timestamp: new Date().toISOString(),
          data: {
            pattern,
            occurrenceCount: count,
            patternType: pattern.startsWith("gap:") ? "capability_gap" : "evolution_decision",
          },
          description: `Repeated pattern detected: "${pattern}" appears ${count} times`,
          suggestedAction: pattern.startsWith("gap:")
            ? `Capability gap recurring - consider creating or upgrading an agent`
            : "Review evolution pattern consistency",
        });
      }
    }

    // Detect capability gaps (0 matches scenarios)
    for (const [key, count] of capabilityUsage.entries()) {
      // This is tracked for contrast with gaps
    }

    // Detect Fetch 0 matches from artifacts
    for (const artifactPath of artifactFiles) {
      try {
        const content = await fs.readFile(artifactPath, "utf8");
        const artifact = JSON.parse(content);

        if (
          artifact.fetchPacket &&
          artifact.fetchPacket.capabilityMatches &&
          artifact.fetchPacket.capabilityMatches.length === 0
        ) {
          signals.push({
            id: `fetch-zero-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: SIGNAL_TYPES.FETCH_ZERO_MATCH,
            severity: SEVERITY.HIGH,
            source: "artifact-analysis",
            timestamp: new Date().toISOString(),
            data: {
              artifactPath: path.relative(repoRoot, artifactPath),
              capabilityGaps: artifact.fetchPacket.capabilityGaps || [],
              taskClassification: artifact.taskClassification,
            },
            description: "Fetch returned 0 capability matches",
            suggestedAction: "Review capability gaps and consider owner creation or upgrade",
          });
        }
      } catch (error) {
        // Skip invalid artifacts
        continue;
      }
    }

    return signals;
  } catch (error) {
    // Artifacts directory may not exist
    return signals;
  }
}

/**
 * Detect boundary drift by comparing agent definitions with usage
 */
async function detectBoundaryDrift(options) {
  const signals = [];

  try {
    // Load current agents
    const agentEntries = await fs.readdir(CANONICAL_AGENTS_DIR);
    const definedAgents = new Set(
      agentEntries.filter((e) => e.endsWith(".md")).map((e) => e.replace(".md", ""))
    );

    // Load capability index to get declared capabilities
    let capabilityIndex = { byCapabilityType: { agents: {} } };
    try {
      const indexContent = await fs.readFile(CAPABILITY_INDEX_PATH, "utf8");
      capabilityIndex = JSON.parse(indexContent);
    } catch (error) {
      // Capability index may not exist
    }

    // Extract declared capabilities from capability index
    const declaredCapabilities = new Map();
    for (const [key, agentData] of Object.entries(capabilityIndex.byCapabilityType?.agents || {})) {
      if (agentData.capabilities) {
        declaredCapabilities.set(agentData.id, new Set(agentData.capabilities));
      }
    }

    // Analyze agent definitions for capability declarations
    for (const agentId of definedAgents) {
      const agentPath = path.join(CANONICAL_AGENTS_DIR, `${agentId}.md`);
      try {
        const content = await fs.readFile(agentPath, "utf8");

        // Extract frontmatter capabilities
        const capabilityMatch = content.match(/capabilities:\s*\n((?:\s*-\s*.+\n?)+)/i);
        if (capabilityMatch) {
          const capabilities = capabilityMatch[1]
            .split("\n")
            .map((line) => line.replace(/^\s*-\s*/, "").trim())
            .filter((line) => line);

          if (capabilities.length > 0) {
            declaredCapabilities.set(agentId, new Set(capabilities));
          }
        }
      } catch (error) {
        // Skip unreadable files
      }
    }

    // Check for agents without declared capabilities
    for (const agentId of definedAgents) {
      if (!declaredCapabilities.has(agentId) || declaredCapabilities.get(agentId).size === 0) {
        signals.push({
          id: `drift-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: SIGNAL_TYPES.BOUNDARY_DRIFT,
          severity: SEVERITY.MEDIUM,
          source: "agent-analysis",
          timestamp: new Date().toISOString(),
          data: {
            agentId,
            issue: "no_declared_capabilities",
          },
          description: `Agent "${agentId}" has no declared capabilities in frontmatter`,
          suggestedAction: "Add capabilities field to agent frontmatter via meta-genesis",
        });
      }
    }

    return signals;
  } catch (error) {
    // Canonical agents directory may not exist
    return signals;
  }
}

/**
 * Detect capability gaps from capability index
 */
async function detectCapabilityGaps(options) {
  const signals = [];

  try {
    const indexContent = await fs.readFile(CAPABILITY_INDEX_PATH, "utf8");
    const capabilityIndex = JSON.parse(indexContent);

    // Check for orphaned capabilities (declared but no owner)
    const allCapabilities = new Set();
    const ownedCapabilities = new Set();

    for (const [key, agentData] of Object.entries(capabilityIndex.byCapabilityType?.agents || {})) {
      for (const cap of agentData.capabilities || []) {
        allCapabilities.add(cap);
        ownedCapabilities.add(cap);
      }
    }

    // Check for gaps in skills
    for (const [key, skillData] of Object.entries(capabilityIndex.byCapabilityType?.skills || {})) {
      for (const cap of skillData.capabilities || []) {
        allCapabilities.add(cap);
        ownedCapabilities.add(cap);
      }
    }

    // This is a placeholder for more sophisticated gap detection
    // In practice, you'd cross-reference with actual capability queries

    return signals;
  } catch (error) {
    // Capability index may not exist
    return signals;
  }
}

/**
 * Detect agent usage mismatch (agents used but not defined, or defined but unused)
 */
async function detectAgentUsageMismatch(options) {
  const signals = [];

  try {
    // Get defined agents from canonical
    const agentEntries = await fs.readdir(CANONICAL_AGENTS_DIR);
    const definedAgents = new Set(
      agentEntries.filter((e) => e.endsWith(".md")).map((e) => e.replace(".md", ""))
    );

    // Get agents from runtime projections
    const runtimeAgents = [".claude/agents", ".codex/agents", ".cursor/agents"];
    const projectedAgents = new Set();

    for (const runtimeDir of runtimeAgents) {
      const runtimePath = path.join(repoRoot, runtimeDir);
      try {
        const entries = await fs.readdir(runtimePath);
        for (const entry of entries) {
          if (entry.endsWith(".md") || entry.endsWith(".toml")) {
            const agentId = entry.replace(/\.(md|toml)$/, "");
            projectedAgents.add(agentId);
          }
        }
      } catch (error) {
        // Directory may not exist
      }
    }

    // Check for canonical agents not in projections
    for (const agentId of definedAgents) {
      if (!projectedAgents.has(agentId)) {
        signals.push({
          id: `sync-gap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: SIGNAL_TYPES.AGENT_USAGE_MISMATCH,
          severity: SEVERITY.MEDIUM,
          source: "sync-analysis",
          timestamp: new Date().toISOString(),
          data: {
            agentId,
            issue: "not_synced_to_runtime",
            definedIn: "canonical/agents/",
            missingIn: runtimeAgents.filter((dir) => {
              const runtimePath = path.join(repoRoot, dir);
              try {
                return !fs.access(path.join(runtimePath, `${agentId}.md`));
              } catch {
                return true;
              }
            }),
          },
          description: `Agent "${agentId}" defined in canonical/ but not synced to runtimes`,
          suggestedAction: "Run npm run meta:sync to update runtime projections",
        });
      }
    }

    // Check for projected agents not in canonical (stale)
    for (const agentId of projectedAgents) {
      if (!definedAgents.has(agentId)) {
        signals.push({
          id: `stale-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: SIGNAL_TYPES.AGENT_USAGE_MISMATCH,
          severity: SEVERITY.LOW,
          source: "sync-analysis",
          timestamp: new Date().toISOString(),
          data: {
            agentId,
            issue: "stale_runtime_projection",
            existsIn: runtimeAgents,
            missingIn: "canonical/agents/",
          },
          description: `Agent "${agentId}" exists in runtime but not in canonical (stale projection)`,
          suggestedAction: "Run npm run meta:sync to clean up stale projections",
        });
      }
    }

    return signals;
  } catch (error) {
    // Canonical agents directory may not exist
    return signals;
  }
}

/**
 * Aggregate all signals and deduplicate
 */
function aggregateSignals(allSignals) {
  const seen = new Set();
  const unique = [];

  for (const signal of allSignals) {
    // Create a unique key based on type and data
    const key = `${signal.type}:${JSON.stringify(signal.data)}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(signal);
    }
  }

  // Sort by severity and timestamp
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  unique.sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return new Date(b.timestamp) - new Date(a.timestamp);
  });

  return unique;
}

/**
 * Main function
 */
async function main() {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  // Detect signals from all sources
  const [
    gitSignals,
    patternSignals,
    driftSignals,
    gapSignals,
    mismatchSignals,
  ] = await Promise.all([
    detectGitDiffChanges(options),
    extractRepeatedPatterns(options),
    detectBoundaryDrift(options),
    detectCapabilityGaps(options),
    detectAgentUsageMismatch(options),
  ]);

  const allSignals = aggregateSignals([
    ...gitSignals,
    ...patternSignals,
    ...driftSignals,
    ...gapSignals,
    ...mismatchSignals,
  ]);

  const result = {
    generatedAt: new Date().toISOString(),
    options: {
      artifactsDir: path.relative(repoRoot, options.artifactsDir),
      signalsDir: path.relative(repoRoot, options.signalsDir),
      commitRange: options.commitRange,
      since: options.since,
    },
    summary: {
      totalSignals: allSignals.length,
      byType: allSignals.reduce((acc, s) => {
        acc[s.type] = (acc[s.type] || 0) + 1;
        return acc;
      }, {}),
      bySeverity: allSignals.reduce((acc, s) => {
        acc[s.severity] = (acc[s.severity] || 0) + 1;
        return acc;
      }, {}),
    },
    signals: allSignals,
  };

  // Output result
  if (options.outputFormat === "pretty") {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(JSON.stringify(result));
  }

  // Optionally write to signals directory
  if (options.signalsDir) {
    try {
      await fs.mkdir(options.signalsDir, { recursive: true });
      const signalFile = path.join(
        options.signalsDir,
        `evolution-signals-${Date.now()}.json`
      );
      await fs.writeFile(signalFile, JSON.stringify(result, null, 2), "utf8");
      // Uncomment to enable file writing:
      // console.error(`Signals written to: ${signalFile}`);
    } catch (error) {
      // Silently fail if signals directory cannot be written
    }
  }

  // Exit with non-zero if critical/high signals detected
  const hasCritical = allSignals.some((s) => s.severity === SEVERITY.CRITICAL);
  if (hasCritical) {
    process.exitCode = 1;
  }

  return result;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(JSON.stringify({ error: error.message }));
    process.exitCode = 1;
  });
}

export { main, detectGitDiffChanges, extractRepeatedPatterns, detectBoundaryDrift, SIGNAL_TYPES, SEVERITY };
