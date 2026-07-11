import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  MAX_ARCHIVE_MEMBERS,
  MAX_ARCHIVE_MEMBER_UNCOMPRESSED_BYTES,
  MAX_ARCHIVE_TOTAL_UNCOMPRESSED_BYTES,
  extractArchiveInto,
  readResponseBodyBounded,
  validateArchiveMembers,
} from "../../scripts/install-global-skills-all-runtimes.mjs";
import {
  cleanupCleanRoomTemp,
  resolveWindowsCliInvocation,
  runCli,
} from "../../scripts/live-acceptance/run-clean-room-live-acceptance.mjs";

function writeTarString(header, offset, length, value) {
  Buffer.from(String(value), "utf8").copy(header, offset, 0, length);
}

function writeTarOctal(header, offset, length, value) {
  writeTarString(
    header,
    offset,
    length,
    `${Number(value).toString(8).padStart(length - 1, "0")}\0`,
  );
}

function tarMember({ name, type = "0", linkname = "", content = "" }) {
  const body = Buffer.from(content, "utf8");
  const header = Buffer.alloc(512);
  writeTarString(header, 0, 100, name);
  writeTarOctal(header, 100, 8, type === "5" ? 0o755 : 0o644);
  writeTarOctal(header, 108, 8, 0);
  writeTarOctal(header, 116, 8, 0);
  writeTarOctal(header, 124, 12, body.length);
  writeTarOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  writeTarString(header, 156, 1, type);
  writeTarString(header, 157, 100, linkname);
  writeTarString(header, 257, 6, "ustar\0");
  writeTarString(header, 263, 2, "00");
  writeTarString(header, 265, 32, "meta-kim");
  writeTarString(header, 297, 32, "meta-kim");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeTarString(
    header,
    148,
    8,
    `${checksum.toString(8).padStart(6, "0")}\0 `,
  );
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512);
  return Buffer.concat([header, body, padding]);
}

async function writeTarGz(filePath, members) {
  const tar = Buffer.concat([
    ...members.map(tarMember),
    Buffer.alloc(1024),
  ]);
  await writeFile(filePath, gzipSync(tar));
}

async function isAbsent(filePath) {
  try {
    await access(filePath);
    return false;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}

async function withTempDir(prefix, callback) {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function validationFailureIncludes(pattern) {
  return (error) =>
    pattern.test(
      `${error?.message ?? ""}\n${error?.stderr?.toString?.() ?? ""}`,
    );
}

for (const fixture of [
  {
    name: "path traversal",
    member: { name: "../../escaped.txt", content: "escaped" },
  },
  {
    name: "unsafe symlink target",
    member: { name: "repo/link", type: "2", linkname: "../../escaped.txt" },
  },
  {
    name: "unsafe hardlink target",
    member: { name: "repo/link", type: "1", linkname: "../../escaped.txt" },
  },
]) {
  test(`archive fallback rejects a real ${fixture.name} fixture before extraction`, async () => {
    await withTempDir("meta-kim-archive-fixture-", async (root) => {
      const archive = path.join(root, "malicious.tar.gz");
      const target = path.join(root, "installed-skill");
      const marker = path.join(target, "existing.txt");
      const escaped = path.join(root, "escaped.txt");
      await mkdir(target, { recursive: true });
      await writeFile(marker, "existing", "utf8");
      await writeTarGz(archive, [fixture.member]);

      assert.throws(() => validateArchiveMembers(archive));
      await assert.rejects(extractArchiveInto(target, archive));
      assert.equal(await readFile(marker, "utf8"), "existing");
      assert.equal(await isAbsent(escaped), true);
    });
  });
}

test("archive prevalidation publishes conservative dependency-package bomb limits", () => {
  assert.equal(MAX_ARCHIVE_MEMBERS, 10_000);
  assert.equal(MAX_ARCHIVE_MEMBER_UNCOMPRESSED_BYTES, 32 * 1024 * 1024);
  assert.equal(MAX_ARCHIVE_TOTAL_UNCOMPRESSED_BYTES, 128 * 1024 * 1024);
});

test("archive prevalidation rejects a real oversized-member fixture", async () => {
  await withTempDir("meta-kim-archive-member-bomb-", async (root) => {
    const archive = path.join(root, "oversized-member.tar.gz");
    await writeTarGz(archive, [
      { name: "repo/", type: "5" },
      { name: "repo/large.bin", content: "x".repeat(2049) },
    ]);

    assert.throws(
      () => validateArchiveMembers(archive, {
        maxMembers: 10,
        maxMemberBytes: 2048,
        maxTotalBytes: 4096,
      }),
      validationFailureIncludes(/member exceeds uncompressed size limit/),
    );
  });
});

test("archive prevalidation rejects a real excessive aggregate-size fixture", async () => {
  await withTempDir("meta-kim-archive-total-bomb-", async (root) => {
    const archive = path.join(root, "aggregate-size.tar.gz");
    await writeTarGz(archive, [
      { name: "repo/", type: "5" },
      { name: "repo/a.bin", content: "a".repeat(900) },
      { name: "repo/b.bin", content: "b".repeat(900) },
      { name: "repo/c.bin", content: "c".repeat(900) },
    ]);

    assert.throws(
      () => validateArchiveMembers(archive, {
        maxMembers: 10,
        maxMemberBytes: 1024,
        maxTotalBytes: 2048,
      }),
      validationFailureIncludes(/total uncompressed size exceeds limit/),
    );
  });
});

test("archive prevalidation rejects a real excessive member-count fixture", async () => {
  await withTempDir("meta-kim-archive-count-bomb-", async (root) => {
    const archive = path.join(root, "member-count.tar.gz");
    await writeTarGz(archive, [
      { name: "repo/", type: "5" },
      { name: "repo/a", content: "" },
      { name: "repo/b", content: "" },
      { name: "repo/c", content: "" },
    ]);

    assert.throws(
      () => validateArchiveMembers(archive, {
        maxMembers: 3,
        maxMemberBytes: 1024,
        maxTotalBytes: 1024,
      }),
      validationFailureIncludes(/member count exceeds limit/),
    );
  });
});

test("archive fallback extracts a valid fixture through fresh staging and replaces old residue", async () => {
  await withTempDir("meta-kim-archive-valid-", async (root) => {
    const archive = path.join(root, "valid.tar.gz");
    const target = path.join(root, "installed-skill");
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, "partial.txt"), "partial", "utf8");
    await writeTarGz(archive, [
      { name: "repo/", type: "5" },
      { name: "repo/SKILL.md", content: "# safe\n" },
    ]);

    await extractArchiveInto(target, archive);
    assert.equal(await readFile(path.join(target, "SKILL.md"), "utf8"), "# safe\n");
    assert.equal(await isAbsent(path.join(target, "partial.txt")), true);
  });
});

test("archive response body is bounded even without content-length", async () => {
  const response = new Response(Buffer.alloc(32));
  await assert.rejects(
    readResponseBodyBounded(response, 16),
    /exceeds 16 byte limit/,
  );
});

test("archive response rejects an oversized declared content-length before reading", async () => {
  const response = new Response(Buffer.from("small"), {
    headers: { "content-length": "1024" },
  });
  await assert.rejects(
    readResponseBodyBounded(response, 16),
    /content-length 1024/,
  );
});

test("clean-room preservation scrubs copied Codex auth while retaining diagnostics", async () => {
  await withTempDir("meta-kim-auth-preserve-", async (tempRoot) => {
    const authPath = path.join(tempRoot, "user-home", "codex-home", "auth.json");
    const diagnostic = path.join(tempRoot, "diagnostic.txt");
    await mkdir(path.dirname(authPath), { recursive: true });
    await writeFile(authPath, '{"token":"not-a-real-secret"}', "utf8");
    await writeFile(diagnostic, "keep", "utf8");

    await cleanupCleanRoomTemp(tempRoot, { preserveTemp: true });

    assert.equal(await isAbsent(authPath), true);
    assert.equal(await readFile(diagnostic, "utf8"), "keep");
  });
});

test("copied Codex auth is gone before a later general cleanup failure", async () => {
  await withTempDir("meta-kim-auth-cleanup-error-", async (tempRoot) => {
    const authPath = path.join(tempRoot, "user-home", "codex-home", "auth.json");
    await mkdir(path.dirname(authPath), { recursive: true });
    await writeFile(authPath, '{"token":"not-a-real-secret"}', "utf8");
    let cleanupCalled = false;

    await assert.rejects(
      cleanupCleanRoomTemp(tempRoot, {
        removeTree: async () => {
          cleanupCalled = true;
          assert.equal(await isAbsent(authPath), true);
          const error = new Error("simulated general cleanup failure");
          error.code = "EIO";
          throw error;
        },
      }),
      /simulated general cleanup failure/,
    );
    assert.equal(cleanupCalled, true);
    assert.equal(await isAbsent(authPath), true);
  });
});

test("Windows Node shim resolution keeps shell metacharacters and percent expressions literal", async () => {
  await withTempDir("meta-kim-windows-shim-", async (root) => {
    const shim = path.join(root, "literal-cli.cmd");
    const script = path.join(root, "literal-cli.js");
    await writeFile(
      shim,
      '@ECHO off\r\n"%dp0%\\literal-cli.js" %*\r\n',
      "utf8",
    );
    await writeFile(
      script,
      'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n',
      "utf8",
    );
    const specialArgs = [
      "%ANTHROPIC_API_KEY%",
      'a"b',
      "&",
      "|",
      "<",
      ">",
      "^",
    ];
    const invocation = resolveWindowsCliInvocation("literal-cli", specialArgs, {
      pathValue: root,
    });
    assert.notEqual(path.basename(invocation.command).toLowerCase(), "cmd.exe");
    const env = { ...process.env, ANTHROPIC_API_KEY: "must-not-expand" };
    const result = process.platform === "win32"
      ? runCli(shim, specialArgs, { env })
      : spawnSync(invocation.command, invocation.args, { encoding: "utf8", env });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), specialArgs);
  });
});

test("clean-room dependency acceptance pins playbook v4.8.0 by revision and exact Skill hash", async () => {
  const harness = await readFile(
    "scripts/live-acceptance/run-clean-room-live-acceptance.mjs",
    "utf8",
  );
  assert.match(harness, /EXPECTED_AGENT_TEAMS_PLAYBOOK_REF = "v4\.8\.0"/);
  assert.match(harness, /753ff43bd9b1f9aee4d184c4f21e7f494af5a79f/);
  assert.match(harness, /0c61f80b3e0616e3b6c6611e03c230e8eb26fbda65d4a7cc9477a9370e7d5fb4/);
  assert.match(harness, /verified_archive_commit_prefix_and_skill_hash/);
});
