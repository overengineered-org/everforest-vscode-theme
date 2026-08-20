import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const releaseVersion = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(releaseVersion ?? "")) {
  throw new Error(`Invalid release version: ${releaseVersion}`);
}

const repositoryDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const releaseDistributionDirectory = resolve(repositoryDirectory, "dist");
const releasePackagePath = resolve(
  releaseDistributionDirectory,
  `everforest-complete-${releaseVersion}.vsix`
);
const releaseStagingDirectory = mkdtempSync(resolve(tmpdir(), "everforest-release-"));
const stagedReleasePackagePath = resolve(
  releaseStagingDirectory,
  `everforest-complete-${releaseVersion}.vsix`
);
const npxExecutable = process.platform === "win32" ? "npx.cmd" : "npx";
let vsixPackagingExitStatus = 0;
try {
  const vsixPackagingProcess = spawnSync(
    npxExecutable,
    [
      "--no-install",
      "vsce",
      "package",
      releaseVersion,
      "--no-update-package-json",
      "--no-git-tag-version",
      "--no-dependencies",
      "--out",
      stagedReleasePackagePath,
    ],
    { cwd: repositoryDirectory, stdio: "inherit" }
  );

  vsixPackagingExitStatus = vsixPackagingProcess.status ?? 1;
  if (vsixPackagingExitStatus === 0) {
    mkdirSync(releaseDistributionDirectory, { recursive: true });
    renameSync(stagedReleasePackagePath, releasePackagePath);
  }
} finally {
  rmSync(releaseStagingDirectory, { force: true, recursive: true });
}

if (vsixPackagingExitStatus !== 0) process.exit(vsixPackagingExitStatus);

const releasePackageChecksum = createHash("sha256")
  .update(readFileSync(releasePackagePath))
  .digest("hex");
const releaseChecksumPath = `${releasePackagePath}.sha256`;
writeFileSync(
  releaseChecksumPath,
  `${releasePackageChecksum}  ${basename(releasePackagePath)}\n`,
  "utf8"
);
