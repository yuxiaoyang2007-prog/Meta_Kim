#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(__dirname);

const CHANGELOG_PATH = join(repoRoot, 'CHANGELOG.md');
const FOLD_THRESHOLD = '2.2.2'; // versions >= 2.2.2 require their own .release-notes file

function extractVersionsFromChangelog(text) {
  const versionRegex = /^## \[(\d+\.\d+\.\d+)\]/gm;
  const versions = [];
  let m;
  while ((m = versionRegex.exec(text)) !== null) {
    versions.push(m[1]);
  }
  return versions;
}

function compareVersion(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function main() {
  if (!existsSync(CHANGELOG_PATH)) {
    console.error(`[check-release-notes-consistency] CHANGELOG.md not found at ${CHANGELOG_PATH}`);
    process.exit(2);
  }
  const changelogText = readFileSync(CHANGELOG_PATH, 'utf8');
  const versions = extractVersionsFromChangelog(changelogText);

  const missingNotes = [];
  const presentNotes = [];

  for (const version of versions) {
    if (compareVersion(version, FOLD_THRESHOLD) < 0) continue;
    const notesFile = join(repoRoot, `.release-notes-v${version}.md`);
    if (existsSync(notesFile)) {
      presentNotes.push(version);
    } else {
      missingNotes.push(version);
    }
  }

  console.log(`[check-release-notes-consistency] CHANGELOG.md has ${versions.length} version sections`);
  console.log(`[check-release-notes-consistency] Versions >= ${FOLD_THRESHOLD} requiring .release-notes files:`);
  console.log(`  Present: ${presentNotes.join(', ') || '(none)'}`);
  if (missingNotes.length > 0) {
    console.warn(`  Missing: ${missingNotes.join(', ')}`);
    console.warn('[check-release-notes-consistency] WARNING — missing release-notes files for versions above fold threshold');
    process.exit(1);
  }
  console.log('[check-release-notes-consistency] PASS — all required release-notes files present');
  process.exit(0);
}

main();
