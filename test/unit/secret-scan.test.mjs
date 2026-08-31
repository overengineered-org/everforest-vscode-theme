import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const repositoryDirectory = resolve(import.meta.dirname, "../..");
const secretScanScriptPath = resolve(repositoryDirectory, ".codex/environments/secret-scan.sh");
const maximumUntrackedFileBytes = 1024 * 1024;
const maximumUntrackedStdinBytes = 5 * 1024 * 1024;

function runGit(repositoryPath, gitArguments) {
  return execFileSync("git", gitArguments, {
    cwd: repositoryPath,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
    stdio: "pipe",
  });
}

test("secret scan skips symlinks, scans exact accepted bytes, and fails closed on bounds", () => {
  const temporaryTestDirectory = mkdtempSync(join(tmpdir(), "everforest-secret-scan-"));
  const fixtureRepositoryDirectory = join(temporaryTestDirectory, "repository");
  const captureDirectory = join(temporaryTestDirectory, "captures");
  const stubCommandDirectory = join(temporaryTestDirectory, "bin");
  const externalDirectory = join(temporaryTestDirectory, "external");
  mkdirSync(fixtureRepositoryDirectory);
  mkdirSync(captureDirectory);
  mkdirSync(stubCommandDirectory);
  mkdirSync(externalDirectory);

  try {
    runGit(fixtureRepositoryDirectory, ["init", "--initial-branch=main"]);
    writeFileSync(join(fixtureRepositoryDirectory, "tracked.txt"), "tracked\n");
    runGit(fixtureRepositoryDirectory, ["add", "tracked.txt"]);
    execFileSync(
      "git",
      ["-c", "user.name=fixture", "-c", "user.email=fixture", "commit", "-m", "fixture"],
      { cwd: fixtureRepositoryDirectory, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" } }
    );

    const fixtureEnvironmentDirectory = join(fixtureRepositoryDirectory, ".codex/environments");
    mkdirSync(fixtureEnvironmentDirectory, { recursive: true });
    copyFileSync(secretScanScriptPath, join(fixtureEnvironmentDirectory, "secret-scan.sh"));
    runGit(fixtureRepositoryDirectory, ["add", ".codex/environments/secret-scan.sh"]);
    execFileSync(
      "git",
      ["-c", "user.name=fixture", "-c", "user.email=fixture", "commit", "-m", "scan"],
      { cwd: fixtureRepositoryDirectory, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" } }
    );

    const acceptedFileContents = "accepted untracked bytes\n";
    writeFileSync(join(fixtureRepositoryDirectory, "accepted.txt"), acceptedFileContents);

    const externalSentinelContents = "OUTSIDE_SENTINEL_SHOULD_NEVER_REACH_GITLEAKS";
    const externalSentinelPath = join(externalDirectory, "sentinel.txt");
    writeFileSync(externalSentinelPath, externalSentinelContents);
    const externalSymlinkPath = join(fixtureRepositoryDirectory, "external-link.txt");
    symlinkSync(externalSentinelPath, externalSymlinkPath);

    const gitleaksStubPath = join(stubCommandDirectory, "gitleaks");
    writeFileSync(
      gitleaksStubPath,
      `#!/bin/sh
set -eu
if [ "\${1:-}" = "stdin" ]; then
  capture_index="\$(find "\$GITLEAKS_CAPTURE_DIRECTORY" -type f -name 'stdin-*.bin' | wc -l | tr -d '[:space:]')"
  cat > "\$GITLEAKS_CAPTURE_DIRECTORY/stdin-\$capture_index.bin"
fi
`,
      { mode: 0o755 }
    );
    chmodSync(gitleaksStubPath, 0o755);

    const scanRun = spawnSync("bash", [join(fixtureEnvironmentDirectory, "secret-scan.sh")], {
      cwd: fixtureRepositoryDirectory,
      encoding: "utf8",
      env: {
        ...process.env,
        GITLEAKS_CAPTURE_DIRECTORY: captureDirectory,
        PATH: `${stubCommandDirectory}:${process.env.PATH}`,
      },
    });
    assert.equal(scanRun.status, 0, scanRun.stderr);

    const capturedStdinFiles = readdirSync(captureDirectory)
      .filter((fileName) => fileName.startsWith("stdin-"))
      .sort()
      .map((fileName) => readFileSync(join(captureDirectory, fileName), "utf8"));
    assert.equal(capturedStdinFiles.length, 3);
    assert.ok(
      capturedStdinFiles.every((capturedStdin) => !capturedStdin.includes(externalSentinelContents))
    );

    const untrackedStdin = capturedStdinFiles[2];
    assert.equal(untrackedStdin, `\nFILE:accepted.txt\n${acceptedFileContents}`);
    assert.doesNotMatch(untrackedStdin, /FILE:external-link\.txt/);
    assert.equal(lstatSync(externalSymlinkPath).isSymbolicLink(), true);
    assert.equal(readFileSync(externalSentinelPath, "utf8"), externalSentinelContents);

    const oversizedFilePath = join(fixtureRepositoryDirectory, "oversized.bin");
    writeFileSync(oversizedFilePath, "X".repeat(maximumUntrackedFileBytes + 1));
    const oversizedFileRun = spawnSync(
      "bash",
      [join(fixtureEnvironmentDirectory, "secret-scan.sh")],
      {
        cwd: fixtureRepositoryDirectory,
        encoding: "utf8",
        env: {
          ...process.env,
          GITLEAKS_CAPTURE_DIRECTORY: captureDirectory,
          PATH: `${stubCommandDirectory}:${process.env.PATH}`,
        },
      }
    );
    assert.notEqual(oversizedFileRun.status, 0);
    assert.match(oversizedFileRun.stderr, /exceeds the per-file limit/);
    rmSync(oversizedFilePath);

    const aggregateFileBytes = 900 * 1024;
    for (let aggregateFileNumber = 1; aggregateFileNumber <= 6; aggregateFileNumber += 1) {
      writeFileSync(
        join(fixtureRepositoryDirectory, `aggregate-${aggregateFileNumber}.bin`),
        String(aggregateFileNumber).repeat(aggregateFileBytes)
      );
    }
    const aggregateRun = spawnSync("bash", [join(fixtureEnvironmentDirectory, "secret-scan.sh")], {
      cwd: fixtureRepositoryDirectory,
      encoding: "utf8",
      env: {
        ...process.env,
        GITLEAKS_CAPTURE_DIRECTORY: captureDirectory,
        PATH: `${stubCommandDirectory}:${process.env.PATH}`,
      },
    });
    assert.notEqual(aggregateRun.status, 0);
    assert.match(aggregateRun.stderr, /aggregate input would exceed the limit/);
    assert.ok(maximumUntrackedStdinBytes > maximumUntrackedFileBytes);
    assert.equal(readFileSync(externalSentinelPath, "utf8"), externalSentinelContents);
  } finally {
    rmSync(temporaryTestDirectory, { force: true, recursive: true });
  }
});
