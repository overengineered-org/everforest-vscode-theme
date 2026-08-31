import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function createCanonicalSha256ChecksumRecord(packagedFilePath, packagedFileBytes) {
  const packagedFileDigest = createHash("sha256").update(packagedFileBytes).digest("hex");
  return `${packagedFileDigest}  ${basename(packagedFilePath)}\n`;
}

export function writeCanonicalSha256Checksum(packagedFilePath) {
  const packagedFileBytes = readFileSync(packagedFilePath);
  const checksumFilePath = `${packagedFilePath}.sha256`;
  const checksumFileName = basename(checksumFilePath);
  const checksumStagingDirectory = mkdtempSync(
    resolve(dirname(checksumFilePath), `.${checksumFileName}.tmp-`)
  );
  const stagedChecksumFilePath = resolve(checksumStagingDirectory, checksumFileName);
  try {
    writeFileSync(
      stagedChecksumFilePath,
      createCanonicalSha256ChecksumRecord(packagedFilePath, packagedFileBytes),
      { encoding: "utf8", flag: "wx", mode: 0o644 }
    );
    renameSync(stagedChecksumFilePath, checksumFilePath);
  } finally {
    rmSync(checksumStagingDirectory, { force: true, recursive: true });
  }
  return checksumFilePath;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const [packagedFilePath, unexpectedArgument] = process.argv.slice(2);
  if (!packagedFilePath || unexpectedArgument !== undefined) {
    throw new Error("Expected exactly one packaged VSIX path");
  }
  writeCanonicalSha256Checksum(packagedFilePath);
}
