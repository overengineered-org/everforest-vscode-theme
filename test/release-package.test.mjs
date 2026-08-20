import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { basename, resolve } from "node:path";
import test from "node:test";

const repositoryDirectory = resolve(import.meta.dirname, "..");
const releaseVersion = "999.999.999";
const releasePackageName = `everforest-complete-${releaseVersion}.vsix`;
const releasePackagePath = resolve(repositoryDirectory, "dist", releasePackageName);
const releaseChecksumPath = `${releasePackagePath}.sha256`;

test("creates a valid versioned VSIX and matching SHA-256 checksum", () => {
  assert.equal(existsSync(releasePackagePath), false, `${releasePackageName} must not pre-exist`);
  assert.equal(
    existsSync(releaseChecksumPath),
    false,
    `${basename(releaseChecksumPath)} must not pre-exist`
  );

  try {
    const releasePackagingEnvironment = { ...process.env };
    delete releasePackagingEnvironment.NODE_TEST_CONTEXT;
    execFileSync(process.execPath, ["scripts/package-release.mjs", releaseVersion], {
      cwd: repositoryDirectory,
      encoding: "utf8",
      env: releasePackagingEnvironment,
    });

    const releasePackageBytes = readFileSync(releasePackagePath);
    const releasePackageDigest = createHash("sha256").update(releasePackageBytes).digest("hex");
    const checksumFileContents = readFileSync(releaseChecksumPath, "utf8").trim();

    assert.ok(releasePackageBytes.length > 4, "VSIX archive is not empty");
    assert.deepEqual(
      [...releasePackageBytes.subarray(0, 4)],
      [0x50, 0x4b, 0x03, 0x04],
      "VSIX is a ZIP archive"
    );
    assert.equal(
      checksumFileContents,
      `${releasePackageDigest}  ${releasePackageName}`,
      "checksum identifies the exact VSIX bytes"
    );
  } finally {
    rmSync(releasePackagePath, { force: true });
    rmSync(releaseChecksumPath, { force: true });
  }
});
