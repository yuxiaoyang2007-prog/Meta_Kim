import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  executeSafeManagedFileTransaction,
  sha256ManagedFile,
} from "../../scripts/safe-managed-file-operations.mjs";

const repoRoot = resolve(import.meta.dirname, "..", "..");

function read(rel) {
  return readFileSync(resolve(repoRoot, rel), "utf8");
}

test("56 — setup routes managed writes through the shared safe transaction", () => {
  const setup = read("setup.mjs");
  assert.match(
    setup,
    /executeSafeManagedFileTransaction\s*\(/,
    "setup managed writes must use the shared transaction boundary",
  );
});

test("56 — MCP memory hook install and removal use the shared safe transaction", () => {
  const mcp = read("scripts/install-mcp-memory-hooks.mjs");
  const transactionCalls = (mcp.match(/executeSafeManagedFileTransaction\s*\(/g) || []).length;
  assert.ok(
    transactionCalls >= 2,
    `install and removal must each call the shared transaction, found ${transactionCalls}`,
  );
});

test("56 — a fully verified rollback returns an explicit zero-residue recovery result", () => {
  const root = mkdtempSync(join(tmpdir(), "meta-kim-backup-contract-"));
  try {
    const first = join(root, "first.txt");
    const second = join(root, "second.txt");
    writeFileSync(first, "first-old\n");
    writeFileSync(second, "second-old\n");

    const result = executeSafeManagedFileTransaction({
      trustedRoot: root,
      backupRoot: join(root, ".meta-kim", "backups"),
      injectFailureAtCommit: 2,
      operations: [
        {
          kind: "write",
          relPath: "first.txt",
          content: "first-new\n",
          expectedOldHash: sha256ManagedFile(first),
        },
        {
          kind: "write",
          relPath: "second.txt",
          content: "second-new\n",
          expectedOldHash: sha256ManagedFile(second),
        },
      ],
    });

    assert.equal(result.ok, false);
    assert.match(result.reason, /injected_commit_failure/);
    assert.equal(result.status, "rolled_back");
    assert.equal(result.recovery, "recovered_rolled_back");
    assert.equal(readFileSync(first, "utf8"), "first-old\n");
    assert.equal(readFileSync(second, "utf8"), "second-old\n");
    assert.deepEqual(result.backups, []);
    assert.match(result.nextAction, /fully rolled back/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("56 — incomplete recovery preserves the journal and returns an actionable blocker", () => {
  const root = mkdtempSync(join(tmpdir(), "meta-kim-recovery-evidence-"));
  try {
    const controlDir = join(root, ".meta-kim", "transactions");
    const journalPath = join(controlDir, "managed-files.journal.json");
    mkdirSync(controlDir, { recursive: true });
    writeFileSync(journalPath, '{"schemaVersion":"invalid"}\n');

    const result = executeSafeManagedFileTransaction({
      trustedRoot: root,
      backupRoot: join(root, ".meta-kim", "backups"),
      operations: [
        {
          kind: "write",
          relPath: "new.txt",
          content: "new\n",
        },
      ],
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "recovery_required");
    assert.equal(result.reason, "invalid_transaction_journal");
    assert.equal(result.journalPath, journalPath);
    assert.equal(existsSync(journalPath), true);
    assert.match(result.nextAction, /preserve the journal and backups/i);
    assert.equal(existsSync(join(root, "new.txt")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
