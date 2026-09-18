#!/usr/bin/env node

import * as NodeChildProcess from "node:child_process";

const stableTag = process.argv[2] ?? "";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function git(args, options = {}) {
  const result = NodeChildProcess.spawnSync("git", args, {
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });

  if (result.error) {
    fail(`Git could not start: ${result.error.message}`);
  }

  return result;
}

if (!/^v\d+\.\d+\.\d+$/u.test(stableTag)) {
  fail("Pass one stable tag in the vMAJOR.MINOR.PATCH form.");
}

const mergeHead = git(["rev-parse", "--quiet", "--verify", "MERGE_HEAD"], { capture: true });
if (mergeHead.status !== 0) {
  fail("No merge is in progress. Codex must not abort or commit the merge.");
}

const stage = git(["add", "--all"]);
if (stage.status !== 0) {
  fail("Git could not stage the repaired files.");
}

const unresolved = git(["diff", "--name-only", "--diff-filter=U"], { capture: true });
if (unresolved.status !== 0 || unresolved.stdout.trim() !== "") {
  fail(`Unmerged paths remain:\n${unresolved.stdout.trim()}`);
}

const whitespace = git(["diff", "--cached", "--check"], { capture: true });
if (whitespace.status !== 0) {
  fail(
    `The repaired merge contains whitespace errors or conflict markers:\n${whitespace.stdout.trim()}`,
  );
}

const commit = git([
  "commit",
  "-m",
  `codex | merge upstream stable ${stableTag}`,
  "-m",
  "Codex resolved the upstream merge conflicts. The update stays on a review branch until its checks pass.",
]);
if (commit.status !== 0) {
  fail("Git could not commit the repaired merge.");
}

console.log(`Codex repair for ${stableTag} passed merge validation.`);
