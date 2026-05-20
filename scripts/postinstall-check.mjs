#!/usr/bin/env node
/**
 * Meta_Kim Post-Install Check
 *
 * Runs after npm install to ensure capability index exists.
 * Non-blocking: only suggests discover:global if index is missing.
 *
 * Usage: Automatically called by npm postinstall hook
 * Can be safely skipped with: npm install --ignore-scripts
 */

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const CAPABILITY_INDEX_PATH = join(
  repoRoot,
  "config/capability-index/meta-kim-capabilities.json"
);

// Simple i18n messages
const MESSAGES = {
  en: {
    indexNotFound: (cmd) =>
      "\n⚠️  [Meta_Kim] Capability index not found.\n" +
      `   Run: ${cmd}\n` +
      "   This scans your installed agents/skills for capability-first dispatch.\n",
    indexStale: (days, cmd) =>
      `\n⚠️  [Meta_Kim] Capability index is ${days} days old.\n` +
      `   Consider: ${cmd}\n` +
      "   Refreshes capability discovery for new agents/skills.\n",
  },
  "zh-CN": {
    indexNotFound: (cmd) =>
      "\n⚠️  [Meta_Kim] 未找到能力索引。\n" +
      `   运行: ${cmd}\n` +
      "   此命令将扫描已安装的 agents/skills 以实现基于能力的调度。\n",
    indexStale: (days, cmd) =>
      `\n⚠️  [Meta_Kim] 能力索引已过期 ${days} 天。\n` +
      `   建议: ${cmd}\n` +
      "   刷新能力发现以支持新的 agents/skills。\n",
  },
  "ja-JP": {
    indexNotFound: (cmd) =>
      "\n⚠️  [Meta_Kim] ケーパビリティインデックスが見つかりません。\n" +
      `   実行: ${cmd}\n` +
      "   インストール済みの agents/skills をスキャンしてケーパビリティファーストディスパッチを有効にします。\n",
    indexStale: (days, cmd) =>
      `\n⚠️  [Meta_Kim] ケーパビリティインデックスは ${days} 日前です。\n` +
      `   実行を検討: ${cmd}\n` +
      "   新しい agents/skills のケーパビリティディスカバリーを更新します。\n",
  },
  "ko-KR": {
    indexNotFound: (cmd) =>
      "\n⚠️  [Meta_Kim] capability index를 찾을 수 없습니다.\n" +
      `   실행: ${cmd}\n` +
      "   설치된 agents/skills를 스캔하여 capability-first dispatch를 활성화합니다.\n",
    indexStale: (days, cmd) =>
      `\n⚠️  [Meta_Kim] capability index가 ${days}일 되었습니다.\n` +
      `   실행 고려: ${cmd}\n` +
      "   새로운 agents/skills를 위한 capability discovery를 새로고침합니다.\n",
  },
};

function getLang() {
  const envLang = process.env.META_KIM_LANG;
  if (envLang && MESSAGES[envLang]) return envLang;

  // Fallback to system locale
  const osLocale = process.env.LANG || process.env.LC_ALL || process.env.LC_MESSAGES || "";
  if (osLocale.startsWith("zh")) return "zh-CN";
  if (osLocale.startsWith("ja")) return "ja-JP";
  if (osLocale.startsWith("ko")) return "ko-KR";

  return "en"; // Default
}

function t(key, ...args) {
  const lang = getLang();
  const msg = MESSAGES[lang]?.[key];
  return typeof msg === "function" ? msg(...args) : MESSAGES.en[key](...args);
}

function checkCapabilityIndex() {
  const CMD = "npm run discover:global";

  if (!existsSync(CAPABILITY_INDEX_PATH)) {
    console.warn(t("indexNotFound", CMD));
    return false;
  }

  // Check if index is stale (older than 7 days)
  const { mtime } = require("node:fs").statSync(CAPABILITY_INDEX_PATH);
  const ageMs = Date.now() - mtime.getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

  if (ageDays > 7) {
    console.warn(t("indexStale", ageDays, CMD));
  }

  return true;
}

// Silent mode (CI/CD)
if (process.env.CI || process.env.META_KIM_SILENT) {
  process.exit(0);
}

// Run check
checkCapabilityIndex();
