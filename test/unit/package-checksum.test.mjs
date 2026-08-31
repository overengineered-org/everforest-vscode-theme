import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  createCanonicalSha256ChecksumRecord,
  writeCanonicalSha256Checksum,
} from "../../scripts/package-checksum.mjs";

const repositoryDirectory = resolve(import.meta.dirname, "../..");

test("package:vsix records a checksum after building the canonical VSIX", () => {
  const packageManifest = JSON.parse(readFileSync(resolve(repositoryDirectory, "package.json")));
  assert.match(packageManifest.scripts["package:vsix"], /vsce package/);
  assert.match(
    packageManifest.scripts["package:vsix"],
    /node scripts\/package-checksum\.mjs dist\/everforest-complete\.vsix/
  );
});

test("writes one canonical checksum record and replaces a checksum symlink safely", () => {
  const testDirectory = mkdtempSync(join(tmpdir(), "everforest-package-checksum-"));
  const packagedFilePath = join(testDirectory, "everforest-complete.vsix");
  const checksumFilePath = `${packagedFilePath}.sha256`;
  const externalChecksumPath = join(testDirectory, "external-checksum");
  const packagedFileBytes = Buffer.from("package checksum bytes");
  const expectedChecksumRecord = `${createHash("sha256")
    .update(packagedFileBytes)
    .digest("hex")}  everforest-complete.vsix\n`;
  try {
    writeFileSync(packagedFilePath, packagedFileBytes);
    writeFileSync(externalChecksumPath, "external checksum must remain unchanged\n");
    symlinkSync(externalChecksumPath, checksumFilePath);

    assert.equal(
      createCanonicalSha256ChecksumRecord(packagedFilePath, packagedFileBytes),
      expectedChecksumRecord
    );
    assert.equal(writeCanonicalSha256Checksum(packagedFilePath), checksumFilePath);
    assert.equal(lstatSync(checksumFilePath).isSymbolicLink(), false);
    assert.equal(readFileSync(checksumFilePath, "utf8"), expectedChecksumRecord);
    assert.equal(
      readFileSync(externalChecksumPath, "utf8"),
      "external checksum must remain unchanged\n"
    );
    assert.ok(existsSync(checksumFilePath));
  } finally {
    rmSync(testDirectory, { force: true, recursive: true });
  }
});
