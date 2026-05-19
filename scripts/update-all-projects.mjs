#!/usr/bin/env node
/**
 * 批量更新所有使用 Meta_Kim 的项目
 *
 * 用法：
 *   node scripts/update-all-projects.mjs
 *
 * 配置：在项目根目录创建 projects.json
 *   [
 *     "~/projects/project-1",
 *     "~/projects/project-2"
 *   ]
 */

import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";

const PROJECT_ROOT = resolve(import.meta.dirname || ".", "..");
const PROJECTS_FILE = join(PROJECT_ROOT, "projects.json");

// 默认项目列表（可以自定义）
const DEFAULT_PROJECTS = [
  // 在这里添加你的项目路径
  // "~/projects/my-project-1",
  // "~/projects/my-project-2",
];

function loadProjects() {
  if (existsSync(PROJECTS_FILE)) {
    try {
      return JSON.parse(readFileSync(PROJECTS_FILE, "utf-8"));
    } catch (err) {
      console.warn(`⚠️  读取 ${PROJECTS_FILE} 失败，使用默认列表`);
    }
  }
  return DEFAULT_PROJECTS;
}

function runInProject(projectDir, command, args) {
  console.log(`\n📂 ${projectDir}`);
  console.log(`   运行: ${command} ${args.join(" ")}`);

  const result = spawnSync(command, args, {
    cwd: projectDir,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
  });

  return result.status === 0;
}

async function main() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  Meta_Kim 批量项目更新工具");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const projects = loadProjects();

  if (projects.length === 0) {
    console.log("❌ 没有配置项目列表！");
    console.log("\n请创建 projects.json 文件：");
    console.log(`   ${PROJECTS_FILE}`);
    console.log("\n内容示例：");
    console.log(`   [`);
    console.log(`     "~/projects/project-1",`);
    console.log(`     "~/projects/project-2"`);
    console.log(`   ]`);
    process.exit(1);
  }

  console.log(`📋 找到 ${projects.length} 个项目\n`);

  let successCount = 0;
  let failCount = 0;

  for (const project of projects) {
    if (!existsSync(project)) {
      console.log(`⚠️  跳过（不存在）: ${project}`);
      failCount++;
      continue;
    }

    // 检查是否有 .claude 目录（使用 Meta_Kim 的标志）
    const hasClaude = existsSync(join(project, ".claude"));
    const hasCodex = existsSync(join(project, ".codex"));
    const hasOpenclaw = existsSync(join(project, "openclaw"));

    if (!hasClaude && !hasCodex && !hasOpenclaw) {
      console.log(`⏭️  跳过（非 Meta_Kim 项目）: ${project}`);
      continue;
    }

    // 运行 npm run meta:sync（如果项目有这个脚本，兼容新旧命名）
    const pkgPath = join(project, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      const syncScript =
        pkg.scripts?.["meta:sync"] || pkg.scripts?.["sync:runtimes"];
      if (syncScript) {
        const cmd = pkg.scripts?.["meta:sync"] ? "meta:sync" : "sync:runtimes";
        const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
        const ok = runInProject(project, npmCommand, ["run", cmd]);
        if (ok) {
          console.log(`   ✅ 成功`);
          successCount++;
        } else {
          console.log(`   ❌ 失败`);
          failCount++;
        }
      } else {
        console.log(`⏭️  跳过（无 meta:sync 脚本）: ${project}`);
      }
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  总结: ${successCount} 成功, ${failCount} 失败`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main().catch(console.error);
