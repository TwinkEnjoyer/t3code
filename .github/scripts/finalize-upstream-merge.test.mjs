import * as NodeAssert from "node:assert/strict";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTest from "node:test";
import * as NodeURL from "node:url";

const scriptPath = NodePath.join(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "finalize-upstream-merge.mjs",
);

function run(command, args, directory) {
  return NodeChildProcess.spawnSync(command, args, { cwd: directory, encoding: "utf8" });
}

function git(directory, ...args) {
  const result = run("git", args, directory);
  NodeAssert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function makeConflictFixture() {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-upstream-sync-"));
  git(directory, "init", "--initial-branch=main");
  git(directory, "config", "user.name", "Codex Test");
  git(directory, "config", "user.email", "codex-test@example.invalid");
  NodeFS.writeFileSync(NodePath.join(directory, "value.txt"), "base\n");
  git(directory, "add", "value.txt");
  git(directory, "commit", "-m", "base");
  git(directory, "tag", "v1.0.0");

  git(directory, "switch", "-c", "upstream");
  NodeFS.writeFileSync(NodePath.join(directory, "value.txt"), "upstream\n");
  git(directory, "commit", "-am", "upstream");
  git(directory, "tag", "v1.1.0");

  git(directory, "switch", "main");
  NodeFS.writeFileSync(NodePath.join(directory, "value.txt"), "fork\n");
  git(directory, "commit", "-am", "fork");

  const merge = run("git", ["merge", "--no-ff", "v1.1.0"], directory);
  NodeAssert.notEqual(merge.status, 0, "The fixture must contain a merge conflict.");
  return directory;
}

NodeTest.test("rejects a repository without an active merge", () => {
  const directory = NodeFS.mkdtempSync(
    NodePath.join(NodeOS.tmpdir(), "t3-upstream-sync-no-merge-"),
  );
  try {
    git(directory, "init", "--initial-branch=main");
    const result = run(process.execPath, [scriptPath, "v1.1.0"], directory);
    NodeAssert.notEqual(result.status, 0);
    NodeAssert.match(result.stderr, /No merge is in progress/u);
  } finally {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});

NodeTest.test("rejects conflict markers left by an incomplete repair", () => {
  const directory = makeConflictFixture();
  try {
    const result = run(process.execPath, [scriptPath, "v1.1.0"], directory);
    NodeAssert.notEqual(result.status, 0);
    NodeAssert.match(result.stderr, /conflict markers/u);
  } finally {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});

NodeTest.test("commits a repaired merge", () => {
  const directory = makeConflictFixture();
  try {
    NodeFS.writeFileSync(NodePath.join(directory, "value.txt"), "fork and upstream\n");
    const result = run(process.execPath, [scriptPath, "v1.1.0"], directory);
    NodeAssert.equal(result.status, 0, result.stderr || result.stdout);
    NodeAssert.equal(
      NodeFS.readFileSync(NodePath.join(directory, "value.txt"), "utf8"),
      "fork and upstream\n",
    );
    NodeAssert.equal(
      git(directory, "rev-list", "--parents", "-n", "1", "HEAD").split(" ").length,
      3,
    );
    NodeAssert.equal(
      git(directory, "log", "-1", "--pretty=%s"),
      "codex | merge upstream stable v1.1.0",
    );
  } finally {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});
