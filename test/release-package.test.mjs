import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { basename, resolve } from "node:path";
import test from "node:test";
import JSZip from "jszip";

const repositoryDirectory = resolve(import.meta.dirname, "..");
const releaseVersion = "999.999.999";
const releasePackageName = `everforest-complete-${releaseVersion}.vsix`;
const releasePackagePath = resolve(repositoryDirectory, "dist", releasePackageName);
const releaseChecksumPath = `${releasePackagePath}.sha256`;
const expectedReleaseArchiveFiles = [
  "[Content_Types].xml",
  "extension.vsixmanifest",
  "extension/LICENSE.txt",
  "extension/NOTICE",
  "extension/SUPPORT.md",
  "extension/changelog.md",
  "extension/dist/extension-web.js",
  "extension/dist/extension.js",
  "extension/dist/palette/index.js",
  "extension/dist/schedule.js",
  "extension/dist/semantic.js",
  "extension/dist/syntax/default.js",
  "extension/dist/theme.js",
  "extension/dist/workbench/documented-workbench-colors.json",
  "extension/dist/workbench/colors.js",
  "extension/media/icon.png",
  "extension/media/previews/everforest-complete-variants.webp",
  "extension/package.json",
  "extension/readme.md",
  "extension/themes/everforest-complete-dark-color-theme.json",
  "extension/themes/everforest-complete-dark-hard-color-theme.json",
  "extension/themes/everforest-complete-dark-medium-color-theme.json",
  "extension/themes/everforest-complete-dark-soft-color-theme.json",
  "extension/themes/everforest-complete-light-color-theme.json",
  "extension/themes/everforest-complete-light-hard-color-theme.json",
  "extension/themes/everforest-complete-light-medium-color-theme.json",
  "extension/themes/everforest-complete-light-soft-color-theme.json",
].sort();

test("creates the exact versioned VSIX and matching SHA-256 checksum", async () => {
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
    const releaseArchive = await JSZip.loadAsync(releasePackageBytes);
    const releaseArchiveFiles = Object.values(releaseArchive.files)
      .filter((releaseArchiveEntry) => !releaseArchiveEntry.dir)
      .map((releaseArchiveEntry) => releaseArchiveEntry.name)
      .sort();
    const releaseArchiveDirectories = Object.values(releaseArchive.files).filter(
      (releaseArchiveEntry) => releaseArchiveEntry.dir
    );

    assert.ok(releasePackageBytes.length > 4, "VSIX archive is not empty");
    assert.deepEqual(
      [...releasePackageBytes.subarray(0, 4)],
      [0x50, 0x4b, 0x03, 0x04],
      "VSIX is a ZIP archive"
    );
    assert.deepEqual(
      releaseArchiveFiles,
      expectedReleaseArchiveFiles,
      "VSIX contains only the approved Marketplace files"
    );
    for (const releaseArchiveDirectory of releaseArchiveDirectories) {
      assert.ok(
        expectedReleaseArchiveFiles.some((expectedReleaseArchiveFile) =>
          expectedReleaseArchiveFile.startsWith(releaseArchiveDirectory.name)
        ),
        `VSIX contains unexpected directory: ${releaseArchiveDirectory.name}`
      );
    }
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
