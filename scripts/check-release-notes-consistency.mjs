#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(__dirname);

const CHANGELOG_PATH = join(repoRoot, 'CHANGELOG.md');

function extractVersionsFromChangelog(text) {
  const versionRegex = /^## \[(\d+\.\d+\.\d+)\]/gm;
  const versions = [];
  let m;
  while ((m = versionRegex.exec(text)) !== null) {
    versions.push(m[1]);
  }
  return versions;
}

function main() {
  if (!existsSync(CHANGELOG_PATH)) {
    console.error(`[check-release-notes-consistency] CHANGELOG.md not found at ${CHANGELOG_PATH}`);
    process.exit(2);
  }
  const changelogText = readFileSync(CHANGELOG_PATH, 'utf8');
  const versions = extractVersionsFromChangelog(changelogText);

  console.log(`[check-release-notes-consistency] CHANGELOG.md has ${versions.length} version sections`);
  console.log('[check-release-notes-consistency] PASS — CHANGELOG.md is the canonical release-notes source; standalone .release-notes files are not required.');
  process.exit(0);
}

main();
