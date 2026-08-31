import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import JSZip from "jszip";
import {
  expectedPackagedFiles,
  expectedReleaseArchiveFiles,
  expectedWorkspacePathForArchiveFile,
  extensionPackageName,
  extensionPackagePublisher,
  maxVsixArchiveBytes,
  maxVsixArchiveEntryCompressedBytes,
  maxVsixArchiveEntryUncompressedBytes,
  packagedPayloadMatchesWorkspaceBytes,
} from "../scripts/package-contract.mjs";

const repositoryDirectory = resolve(import.meta.dirname, "..");
const releaseVersion = "999.999.999";
const releasePackageName = `everforest-complete-${releaseVersion}.vsix`;
const releasePackagePath = resolve(repositoryDirectory, "dist", releasePackageName);
const releaseChecksumPath = `${releasePackagePath}.sha256`;
const packageReleaseScriptPath = resolve(repositoryDirectory, "scripts/package-release.mjs");
const releaseVerificationScriptPath = resolve(
  repositoryDirectory,
  "scripts/verify-release-package.mjs"
);
const packageContentsValidationScriptPath = resolve(
  repositoryDirectory,
  "scripts/validate-package-contents.mjs"
);
const sourceVsixDirectory = resolve(repositoryDirectory, "dist");

function childProcessEnvironment() {
  const releaseEnvironment = { ...process.env };
  delete releaseEnvironment.NODE_TEST_CONTEXT;
  return releaseEnvironment;
}

function createReleaseWorkspace() {
  const sourceVsixFileNames = readdirSync(sourceVsixDirectory).filter(
    (fileName) => fileName.endsWith(".vsix") && fileName !== releasePackageName
  );
  assert.equal(
    sourceVsixFileNames.length,
    1,
    `package tests require exactly one built source VSIX, found ${sourceVsixFileNames.length}`
  );
  const [sourceVsixFileName] = sourceVsixFileNames;
  const releaseWorkspaceDirectory = mkdtempSync(join(tmpdir(), "everforest-release-test-"));
  mkdirSync(join(releaseWorkspaceDirectory, "dist"));
  cpSync(
    resolve(sourceVsixDirectory, sourceVsixFileName),
    join(releaseWorkspaceDirectory, "dist/everforest-complete.vsix")
  );
  return releaseWorkspaceDirectory;
}

function runScriptExpectingFailure(scriptPath, scriptArguments, workingDirectory) {
  const failedProcess = spawnSync(process.execPath, [scriptPath, ...scriptArguments], {
    cwd: workingDirectory,
    encoding: "utf8",
    env: childProcessEnvironment(),
  });
  assert.notEqual(failedProcess.status, 0, `${basename(scriptPath)} unexpectedly passed`);
  return `${failedProcess.stdout}\n${failedProcess.stderr}`;
}

function refreshReleaseChecksum(releaseWorkspaceDirectory) {
  const releaseWorkspacePackagePath = resolve(
    releaseWorkspaceDirectory,
    "dist",
    releasePackageName
  );
  const releaseWorkspacePackageBytes = readFileSync(releaseWorkspacePackagePath);
  const releaseWorkspacePackageDigest = createHash("sha256")
    .update(releaseWorkspacePackageBytes)
    .digest("hex");
  writeFileSync(
    `${releaseWorkspacePackagePath}.sha256`,
    `${releaseWorkspacePackageDigest}  ${releasePackageName}\n`,
    "utf8"
  );
}

const zipCrc32Table = Array.from({ length: 256 }, (_, tableIndex) => {
  let tableValue = tableIndex;
  for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
    tableValue = (tableValue >>> 1) ^ (tableValue & 1 ? 0xedb88320 : 0);
  }
  return tableValue >>> 0;
});

function calculateZipCrc32(fileBytes) {
  let crcValue = 0xffffffff;
  for (const fileByte of fileBytes) {
    crcValue = zipCrc32Table[(crcValue ^ fileByte) & 0xff] ^ (crcValue >>> 8);
  }
  return ~crcValue >>> 0;
}

function buildStoredZipArchive(archiveEntries) {
  const localFileRecords = [];
  const centralDirectoryRecords = [];
  let localFileOffset = 0;
  for (const archiveEntry of archiveEntries) {
    const archiveEntryNameBytes = Buffer.from(archiveEntry.name, "utf8");
    const archiveEntryContents = Buffer.from(archiveEntry.contents ?? "");
    const archiveEntryCrc32 = calculateZipCrc32(archiveEntryContents);
    const localFileRecord = Buffer.alloc(
      30 + archiveEntryNameBytes.length + archiveEntryContents.length
    );
    localFileRecord.writeUInt32LE(0x04034b50, 0);
    localFileRecord.writeUInt16LE(20, 4);
    localFileRecord.writeUInt16LE(0x800, 6);
    localFileRecord.writeUInt16LE(0, 8);
    localFileRecord.writeUInt32LE(archiveEntryCrc32, 14);
    localFileRecord.writeUInt32LE(archiveEntryContents.length, 18);
    localFileRecord.writeUInt32LE(archiveEntryContents.length, 22);
    localFileRecord.writeUInt16LE(archiveEntryNameBytes.length, 26);
    archiveEntryNameBytes.copy(localFileRecord, 30);
    archiveEntryContents.copy(localFileRecord, 30 + archiveEntryNameBytes.length);
    localFileRecords.push(localFileRecord);

    const centralDirectoryRecord = Buffer.alloc(46 + archiveEntryNameBytes.length);
    centralDirectoryRecord.writeUInt32LE(0x02014b50, 0);
    centralDirectoryRecord.writeUInt16LE(20, 4);
    centralDirectoryRecord.writeUInt16LE(20, 6);
    centralDirectoryRecord.writeUInt16LE(0x800, 8);
    centralDirectoryRecord.writeUInt16LE(0, 10);
    centralDirectoryRecord.writeUInt32LE(archiveEntryCrc32, 16);
    centralDirectoryRecord.writeUInt32LE(archiveEntryContents.length, 20);
    centralDirectoryRecord.writeUInt32LE(archiveEntryContents.length, 24);
    centralDirectoryRecord.writeUInt16LE(archiveEntryNameBytes.length, 28);
    centralDirectoryRecord.writeUInt16LE(archiveEntry.name.endsWith("/") ? 0x10 : 0, 38);
    centralDirectoryRecord.writeUInt32LE(localFileOffset, 42);
    archiveEntryNameBytes.copy(centralDirectoryRecord, 46);
    centralDirectoryRecords.push(centralDirectoryRecord);
    localFileOffset += localFileRecord.length;
  }
  const centralDirectory = Buffer.concat(centralDirectoryRecords);
  const localFiles = Buffer.concat(localFileRecords);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(archiveEntries.length, 8);
  endOfCentralDirectory.writeUInt16LE(archiveEntries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(localFiles.length, 16);
  return Buffer.concat([localFiles, centralDirectory, endOfCentralDirectory]);
}

async function rewriteArchiveAsStoredZip(archivePath, transformEntries) {
  const archive = await JSZip.loadAsync(readFileSync(archivePath));
  const archiveEntries = [];
  for (const archiveEntry of Object.values(archive.files)) {
    archiveEntries.push({
      contents: archiveEntry.dir ? Buffer.alloc(0) : await archiveEntry.async("nodebuffer"),
      name: archiveEntry.name,
    });
  }
  writeFileSync(archivePath, buildStoredZipArchive(transformEntries(archiveEntries)));
}

function findZipEndOfCentralDirectoryOffset(zipBytes) {
  const signature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const endOfCentralDirectoryOffset = zipBytes.lastIndexOf(signature);
  assert.ok(endOfCentralDirectoryOffset >= 0, "ZIP end-of-central-directory record is required");
  return endOfCentralDirectoryOffset;
}

function mutateZipCentralEntry(archivePath, archiveEntryName, mutateCentralEntry) {
  const archiveBytes = Buffer.from(readFileSync(archivePath));
  const endOfCentralDirectoryOffset = findZipEndOfCentralDirectoryOffset(archiveBytes);
  const centralDirectoryEntryCount = archiveBytes.readUInt16LE(endOfCentralDirectoryOffset + 10);
  let centralDirectoryEntryOffset = archiveBytes.readUInt32LE(endOfCentralDirectoryOffset + 16);
  for (
    let archiveEntryIndex = 0;
    archiveEntryIndex < centralDirectoryEntryCount;
    archiveEntryIndex += 1
  ) {
    assert.equal(archiveBytes.readUInt32LE(centralDirectoryEntryOffset), 0x02014b50);
    const archiveEntryNameByteLength = archiveBytes.readUInt16LE(centralDirectoryEntryOffset + 28);
    const extraFieldByteLength = archiveBytes.readUInt16LE(centralDirectoryEntryOffset + 30);
    const commentByteLength = archiveBytes.readUInt16LE(centralDirectoryEntryOffset + 32);
    const currentArchiveEntryName = archiveBytes.toString(
      "utf8",
      centralDirectoryEntryOffset + 46,
      centralDirectoryEntryOffset + 46 + archiveEntryNameByteLength
    );
    if (currentArchiveEntryName === archiveEntryName) {
      mutateCentralEntry(archiveBytes, centralDirectoryEntryOffset);
      writeFileSync(archivePath, archiveBytes);
      return;
    }
    centralDirectoryEntryOffset +=
      46 + archiveEntryNameByteLength + extraFieldByteLength + commentByteLength;
  }
  assert.fail(`ZIP entry not found: ${archiveEntryName}`);
}

function tamperZipPayload(archivePath, archiveEntryName) {
  mutateZipCentralEntry(
    archivePath,
    archiveEntryName,
    (archiveBytes, centralDirectoryEntryOffset) => {
      const compressedSize = archiveBytes.readUInt32LE(centralDirectoryEntryOffset + 20);
      const localFileHeaderOffset = archiveBytes.readUInt32LE(centralDirectoryEntryOffset + 42);
      const localNameByteLength = archiveBytes.readUInt16LE(localFileHeaderOffset + 26);
      const localExtraFieldByteLength = archiveBytes.readUInt16LE(localFileHeaderOffset + 28);
      const payloadOffset =
        localFileHeaderOffset + 30 + localNameByteLength + localExtraFieldByteLength;
      assert.ok(compressedSize > 0, `${archiveEntryName} must contain a payload`);
      archiveBytes[payloadOffset] ^= 0xff;
    }
  );
}

function setZipUnixMode(archivePath, archiveEntryName, unixFileMode) {
  mutateZipCentralEntry(
    archivePath,
    archiveEntryName,
    (archiveBytes, centralDirectoryEntryOffset) => {
      archiveBytes.writeUInt16LE(20 | (3 << 8), centralDirectoryEntryOffset + 4);
      archiveBytes.writeUInt32LE(
        ((unixFileMode & 0xffff) << 16) >>> 0,
        centralDirectoryEntryOffset + 38
      );
    }
  );
}

async function mutateReleaseArchive(releaseWorkspaceDirectory, mutateArchive) {
  const releaseWorkspacePackagePath = resolve(
    releaseWorkspaceDirectory,
    "dist",
    releasePackageName
  );
  const releaseArchive = await JSZip.loadAsync(readFileSync(releaseWorkspacePackagePath));
  await mutateArchive(releaseArchive);
  writeFileSync(
    releaseWorkspacePackagePath,
    await releaseArchive.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    })
  );
  refreshReleaseChecksum(releaseWorkspaceDirectory);
}

async function mutateSourceArchive(releaseWorkspaceDirectory, mutateArchive) {
  const sourceArchivePath = resolve(releaseWorkspaceDirectory, "dist", "everforest-complete.vsix");
  const sourceArchive = await JSZip.loadAsync(readFileSync(sourceArchivePath));
  await mutateArchive(sourceArchive);
  writeFileSync(
    sourceArchivePath,
    await sourceArchive.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    })
  );
}

function writeMinimalSourceVsix(releaseWorkspaceDirectory, archiveFiles) {
  const sourceArchive = new JSZip();
  for (const [archivePath, archiveContents] of Object.entries(archiveFiles)) {
    sourceArchive.file(archivePath, archiveContents);
  }
  return sourceArchive
    .generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
    .then((sourceArchiveBytes) => {
      writeFileSync(
        resolve(releaseWorkspaceDirectory, "dist", "minimal-source.vsix"),
        sourceArchiveBytes
      );
    });
}

async function createCurrentPayloadValidationWorkspace() {
  const validationWorkspaceDirectory = mkdtempSync(
    join(tmpdir(), "everforest-package-verify-test-")
  );
  mkdirSync(join(validationWorkspaceDirectory, "dist"));
  for (const packagedFilePath of expectedPackagedFiles) {
    const workspaceSourcePath = resolve(repositoryDirectory, packagedFilePath);
    const validationSourcePath = resolve(validationWorkspaceDirectory, packagedFilePath);
    mkdirSync(dirname(validationSourcePath), { recursive: true });
    cpSync(workspaceSourcePath, validationSourcePath);
  }

  const currentWorkspaceArchive = new JSZip();
  currentWorkspaceArchive.file("[Content_Types].xml", "<Types />\n");
  currentWorkspaceArchive.file(
    "extension.vsixmanifest",
    '<PackageManifest><Metadata><Identity Id="everforest-complete" Publisher="overengineered-org" Version="1.0.0" /></Metadata></PackageManifest>'
  );
  for (const archiveFilePath of expectedReleaseArchiveFiles()) {
    const workspaceSourcePath = expectedWorkspacePathForArchiveFile(archiveFilePath);
    if (workspaceSourcePath) {
      currentWorkspaceArchive.file(
        archiveFilePath,
        readFileSync(resolve(repositoryDirectory, workspaceSourcePath))
      );
    }
  }
  writeFileSync(
    resolve(validationWorkspaceDirectory, "dist/everforest-complete.vsix"),
    await currentWorkspaceArchive.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
  );
  return validationWorkspaceDirectory;
}

function createPackageListShimDirectory() {
  const packageListShimDirectory = mkdtempSync(join(tmpdir(), "everforest-package-list-test-"));
  const packageListShimPath = join(
    packageListShimDirectory,
    process.platform === "win32" ? "npx.cmd" : "npx"
  );
  const packageListShimScript =
    process.platform === "win32"
      ? `@echo off\r\n${expectedPackagedFiles
          .map((packagedFilePath) => `echo ${packagedFilePath}`)
          .join("\r\n")}\r\n`
      : `#!/bin/sh\nprintf '%s\\n' ${expectedPackagedFiles
          .map((packagedFilePath) => `'${packagedFilePath}'`)
          .join(" ")}\n`;
  writeFileSync(packageListShimPath, packageListShimScript, "utf8");
  chmodSync(packageListShimPath, 0o755);
  return packageListShimDirectory;
}

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
    execFileSync(process.execPath, ["scripts/verify-release-package.mjs", releaseVersion], {
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
      expectedReleaseArchiveFiles(),
      "VSIX contains only the approved Marketplace files"
    );
    for (const releaseArchiveDirectory of releaseArchiveDirectories) {
      assert.ok(
        expectedReleaseArchiveFiles().some((expectedReleaseArchiveFile) =>
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

test("--replace-source leaves exactly the versioned VSIX and checksum assets", () => {
  const releaseWorkspaceDirectory = createReleaseWorkspace();
  try {
    writeFileSync(
      join(releaseWorkspaceDirectory, "dist/everforest-complete.vsix.sha256"),
      "source checksum is replaced with the release checksum\n",
      "utf8"
    );
    execFileSync(process.execPath, [packageReleaseScriptPath, releaseVersion, "--replace-source"], {
      cwd: releaseWorkspaceDirectory,
      encoding: "utf8",
      env: childProcessEnvironment(),
    });

    assert.deepEqual(readdirSync(join(releaseWorkspaceDirectory, "dist")).sort(), [
      releasePackageName,
      `${releasePackageName}.sha256`,
    ]);
  } finally {
    rmSync(releaseWorkspaceDirectory, { force: true, recursive: true });
  }
});

test("rejects pre-existing versioned VSIX or checksum outputs", () => {
  for (const preExistingOutput of [releasePackagePath, releaseChecksumPath]) {
    const releaseWorkspaceDirectory = createReleaseWorkspace();
    try {
      const releaseWorkspaceOutputPath = resolve(
        releaseWorkspaceDirectory,
        "dist",
        basename(preExistingOutput)
      );
      writeFileSync(releaseWorkspaceOutputPath, "pre-existing\n", "utf8");
      assert.match(
        runScriptExpectingFailure(
          packageReleaseScriptPath,
          [releaseVersion],
          releaseWorkspaceDirectory
        ),
        /Release output already exists/
      );
      assert.ok(
        existsSync(resolve(releaseWorkspaceDirectory, "dist/everforest-complete.vsix")),
        "source VSIX remains when output is already present"
      );
    } finally {
      rmSync(releaseWorkspaceDirectory, { force: true, recursive: true });
    }
  }
});

test("rejects a symlinked source VSIX without reading its target", () => {
  const sourceVsixFileName = readdirSync(sourceVsixDirectory).find((fileName) =>
    fileName.endsWith(".vsix")
  );
  assert.ok(sourceVsixFileName, "package tests require a built source VSIX");
  const releaseWorkspaceDirectory = mkdtempSync(join(tmpdir(), "everforest-release-test-"));
  try {
    mkdirSync(join(releaseWorkspaceDirectory, "dist"));
    symlinkSync(
      resolve(sourceVsixDirectory, sourceVsixFileName),
      join(releaseWorkspaceDirectory, "dist/everforest-complete.vsix")
    );
    assert.match(
      runScriptExpectingFailure(
        packageReleaseScriptPath,
        [releaseVersion],
        releaseWorkspaceDirectory
      ),
      /Source VSIX must be a regular file/
    );
  } finally {
    rmSync(releaseWorkspaceDirectory, { force: true, recursive: true });
  }
});

test("preflights a replacement checksum before removing the source VSIX", () => {
  const releaseWorkspaceDirectory = createReleaseWorkspace();
  const sourcePackagePath = join(releaseWorkspaceDirectory, "dist/everforest-complete.vsix");
  try {
    mkdirSync(`${sourcePackagePath}.sha256`);
    assert.match(
      runScriptExpectingFailure(
        packageReleaseScriptPath,
        [releaseVersion, "--replace-source"],
        releaseWorkspaceDirectory
      ),
      /Source checksum must be a regular file/
    );
    assert.equal(existsSync(sourcePackagePath), true, "source VSIX must remain recoverable");
  } finally {
    rmSync(releaseWorkspaceDirectory, { force: true, recursive: true });
  }
});

test("rejects invalid release options and source VSIX counts", async () => {
  const invalidArgumentCases = [
    [["not-a-version"], /Invalid release version/],
    [[releaseVersion, "--replace"], /Unknown release packaging option/],
    [[releaseVersion, "--replace-source", "extra"], /Unknown release packaging option/],
  ];
  for (const [scriptArguments, expectedError] of invalidArgumentCases) {
    const releaseWorkspaceDirectory = mkdtempSync(join(tmpdir(), "everforest-release-test-"));
    try {
      mkdirSync(join(releaseWorkspaceDirectory, "dist"));
      assert.match(
        runScriptExpectingFailure(
          packageReleaseScriptPath,
          scriptArguments,
          releaseWorkspaceDirectory
        ),
        expectedError
      );
    } finally {
      rmSync(releaseWorkspaceDirectory, { force: true, recursive: true });
    }
  }

  for (const [sourceCount, expectedError] of [
    [0, /Expected exactly one source VSIX.*found 0/],
    [2, /Expected exactly one source VSIX.*found 2/],
  ]) {
    const releaseWorkspaceDirectory = mkdtempSync(join(tmpdir(), "everforest-release-test-"));
    try {
      mkdirSync(join(releaseWorkspaceDirectory, "dist"));
      for (let sourceNumber = 0; sourceNumber < sourceCount; sourceNumber += 1) {
        writeFileSync(
          join(releaseWorkspaceDirectory, "dist", `source-${sourceNumber}.vsix`),
          "not a VSIX"
        );
      }
      assert.match(
        runScriptExpectingFailure(
          packageReleaseScriptPath,
          [releaseVersion],
          releaseWorkspaceDirectory
        ),
        expectedError
      );
    } finally {
      rmSync(releaseWorkspaceDirectory, { force: true, recursive: true });
    }
  }
});

test("rejects source VSIXes missing either required manifest", async () => {
  const missingManifestCases = [
    {
      archiveFiles: {
        "extension/package.json": JSON.stringify({
          name: extensionPackageName,
          publisher: extensionPackagePublisher,
        }),
      },
      expectedError: /missing required extension manifests/,
    },
    {
      archiveFiles: {
        "extension.vsixmanifest": "<PackageManifest />",
      },
      expectedError: /missing required extension manifests/,
    },
  ];
  for (const { archiveFiles, expectedError } of missingManifestCases) {
    const releaseWorkspaceDirectory = mkdtempSync(join(tmpdir(), "everforest-release-test-"));
    try {
      mkdirSync(join(releaseWorkspaceDirectory, "dist"));
      await writeMinimalSourceVsix(releaseWorkspaceDirectory, archiveFiles);
      assert.match(
        runScriptExpectingFailure(
          packageReleaseScriptPath,
          [releaseVersion],
          releaseWorkspaceDirectory
        ),
        expectedError
      );
    } finally {
      rmSync(releaseWorkspaceDirectory, { force: true, recursive: true });
    }
  }
});

test("rejects wrong source package identities", async () => {
  const identityCases = [
    ["name", { name: "wrong-name" }, /manifest name wrong-name/],
    ["publisher", { publisher: "wrong-publisher" }, /manifest publisher wrong-publisher/],
  ];
  for (const [, identityChange, expectedError] of identityCases) {
    const releaseWorkspaceDirectory = createReleaseWorkspace();
    try {
      await mutateSourceArchive(releaseWorkspaceDirectory, async (releaseArchive) => {
        const packageManifestEntry = releaseArchive.file("extension/package.json");
        const packageManifest = JSON.parse(await packageManifestEntry.async("string"));
        Object.assign(packageManifest, identityChange);
        releaseArchive.file("extension/package.json", JSON.stringify(packageManifest));
      });
      assert.match(
        runScriptExpectingFailure(
          packageReleaseScriptPath,
          [releaseVersion],
          releaseWorkspaceDirectory
        ),
        expectedError
      );
    } finally {
      rmSync(releaseWorkspaceDirectory, { force: true, recursive: true });
    }
  }
});

test("rejects source VSIX identity mismatches and malformed manifests", async () => {
  const malformedSourceCases = [
    {
      description: "VSIX identity Id",
      mutateArchive: async (sourceArchive) => {
        const manifestEntry = sourceArchive.file("extension.vsixmanifest");
        const manifestSource = await manifestEntry.async("string");
        sourceArchive.file(
          "extension.vsixmanifest",
          manifestSource.replace('Id="everforest-complete"', 'Id="wrong-name"')
        );
      },
      expectedError: /Source VSIX identity Id wrong-name/,
    },
    {
      description: "VSIX identity publisher",
      mutateArchive: async (sourceArchive) => {
        const manifestEntry = sourceArchive.file("extension.vsixmanifest");
        const manifestSource = await manifestEntry.async("string");
        sourceArchive.file(
          "extension.vsixmanifest",
          manifestSource.replace('Publisher="overengineered-org"', 'Publisher="wrong-publisher"')
        );
      },
      expectedError: /Source VSIX identity publisher wrong-publisher/,
    },
    {
      description: "malformed package manifest",
      mutateArchive: async (sourceArchive) => {
        sourceArchive.file("extension/package.json", "{");
      },
      expectedError: /invalid extension\/package\.json/,
    },
    {
      description: "duplicate Metadata Identity",
      mutateArchive: async (sourceArchive) => {
        const manifestEntry = sourceArchive.file("extension.vsixmanifest");
        const manifestSource = await manifestEntry.async("string");
        const identitySource = manifestSource.match(/<Identity\b[^>]*\/>/i)?.[0];
        assert.ok(identitySource);
        sourceArchive.file(
          "extension.vsixmanifest",
          manifestSource.replace(identitySource, `${identitySource}${identitySource}`)
        );
      },
      expectedError: /exactly one Identity/,
    },
    {
      description: "unclosed Identity",
      mutateArchive: async (sourceArchive) => {
        sourceArchive.file(
          "extension.vsixmanifest",
          '<PackageManifest><Metadata><Identity Id="everforest-complete" Publisher="overengineered-org" Version="1.0.0" /></Metadata>'
        );
      },
      expectedError: /unclosed XML elements/,
    },
    {
      description: "DOCTYPE",
      mutateArchive: async (sourceArchive) => {
        const manifestEntry = sourceArchive.file("extension.vsixmanifest");
        const manifestSource = await manifestEntry.async("string");
        sourceArchive.file("extension.vsixmanifest", `<!DOCTYPE PackageManifest>${manifestSource}`);
      },
      expectedError: /DOCTYPE is not allowed/,
    },
    {
      description: "CDATA",
      mutateArchive: async (sourceArchive) => {
        const manifestEntry = sourceArchive.file("extension.vsixmanifest");
        const manifestSource = await manifestEntry.async("string");
        sourceArchive.file(
          "extension.vsixmanifest",
          manifestSource.replace("<PackageManifest", "<PackageManifest><![CDATA[invalid]]>")
        );
      },
      expectedError: /CDATA is not allowed/,
    },
    {
      description: "alternate root",
      mutateArchive: async (sourceArchive) => {
        sourceArchive.file(
          "extension.vsixmanifest",
          '<AlternateManifest><Metadata><Identity Id="everforest-complete" Publisher="overengineered-org" Version="1.0.0" /></Metadata></AlternateManifest>'
        );
      },
      expectedError: /root element must be PackageManifest/,
    },
    {
      description: "multiple roots",
      mutateArchive: async (sourceArchive) => {
        sourceArchive.file(
          "extension.vsixmanifest",
          '<PackageManifest><Metadata><Identity Id="everforest-complete" Publisher="overengineered-org" Version="1.0.0" /></Metadata></PackageManifest><PackageManifest />'
        );
      },
      expectedError: /exactly one PackageManifest root element/,
    },
    {
      description: "text outside root",
      mutateArchive: async (sourceArchive) => {
        sourceArchive.file(
          "extension.vsixmanifest",
          'text<PackageManifest><Metadata><Identity Id="everforest-complete" Publisher="overengineered-org" Version="1.0.0" /></Metadata></PackageManifest>'
        );
      },
      expectedError: /text outside its PackageManifest root element/,
    },
    {
      description: "non-canonical processing instruction",
      mutateArchive: async (sourceArchive) => {
        sourceArchive.file(
          "extension.vsixmanifest",
          '<?xml version="1.0"?><?unexpected?><PackageManifest><Metadata><Identity Id="everforest-complete" Publisher="overengineered-org" Version="1.0.0" /></Metadata></PackageManifest>'
        );
      },
      expectedError: /only one canonical leading XML declaration/,
    },
    {
      description: "trailing processing instruction",
      mutateArchive: async (sourceArchive) => {
        sourceArchive.file(
          "extension.vsixmanifest",
          '<PackageManifest><Metadata><Identity Id="everforest-complete" Publisher="overengineered-org" Version="1.0.0" /></Metadata></PackageManifest><?xml version="1.0"?>'
        );
      },
      expectedError: /only one canonical leading XML declaration/,
    },
    {
      description: "malformed processing instruction",
      mutateArchive: async (sourceArchive) => {
        sourceArchive.file(
          "extension.vsixmanifest",
          '<?xml version=1.0?><PackageManifest><Metadata><Identity Id="everforest-complete" Publisher="overengineered-org" Version="1.0.0" /></Metadata></PackageManifest>'
        );
      },
      expectedError: /only one canonical leading XML declaration/,
    },
  ];
  for (const { description, mutateArchive, expectedError } of malformedSourceCases) {
    const releaseWorkspaceDirectory = createReleaseWorkspace();
    try {
      await mutateSourceArchive(releaseWorkspaceDirectory, mutateArchive);
      assert.match(
        runScriptExpectingFailure(
          packageReleaseScriptPath,
          [releaseVersion],
          releaseWorkspaceDirectory
        ),
        expectedError,
        description
      );
    } finally {
      rmSync(releaseWorkspaceDirectory, { force: true, recursive: true });
    }
  }
});

test("rejects raw source ZIP aliases, duplicates, and unexpected directories", async () => {
  const rawArchiveCases = [
    {
      description: "duplicate raw entry",
      addEntry: (archiveEntries) => {
        const duplicatedEntry = archiveEntries.find(
          (archiveEntry) => !archiveEntry.name.endsWith("/")
        );
        return [...archiveEntries, { ...duplicatedEntry }];
      },
      expectedError: /duplicate raw ZIP entries/,
    },
    {
      description: "traversal alias",
      addEntry: (archiveEntries) => [
        ...archiveEntries,
        { name: "extension/../evil.js", contents: "evil" },
      ],
      expectedError: /non-canonical ZIP entry name: extension\/\.\.\/evil\.js/,
    },
    {
      description: "backslash alias",
      addEntry: (archiveEntries) => [
        ...archiveEntries,
        { name: "extension\\evil.js", contents: "evil" },
      ],
      expectedError: /non-canonical ZIP entry name: extension\\evil\.js/,
    },
    {
      description: "dot-segment alias",
      addEntry: (archiveEntries) => [
        ...archiveEntries,
        { name: "extension/./evil.js", contents: "evil" },
      ],
      expectedError: /non-canonical ZIP entry name: extension\/\.\/evil\.js/,
    },
    {
      description: "absolute alias",
      addEntry: (archiveEntries) => [...archiveEntries, { name: "/evil.js", contents: "evil" }],
      expectedError: /non-canonical ZIP entry name: \/evil\.js/,
    },
    {
      description: "leading whitespace alias",
      addEntry: (archiveEntries) => [
        ...archiveEntries,
        { name: " extension/evil.js", contents: "evil" },
      ],
      expectedError: /non-canonical ZIP entry name:  extension\/evil\.js/,
    },
    {
      description: "trailing whitespace alias",
      addEntry: (archiveEntries) => [
        ...archiveEntries,
        { name: "extension/evil.js ", contents: "evil" },
      ],
      expectedError: /non-canonical ZIP entry name: extension\/evil\.js /,
    },
    {
      description: "duplicate-slash alias",
      addEntry: (archiveEntries) => [
        ...archiveEntries,
        { name: "extension//evil.js", contents: "evil" },
      ],
      expectedError: /non-canonical ZIP entry name: extension\/\/evil\.js/,
    },
    {
      description: "unexpected directory",
      addEntry: (archiveEntries) => [...archiveEntries, { name: "evil/", contents: "" }],
      expectedError: /unexpected VSIX directories/,
    },
  ];

  for (const { description, addEntry, expectedError } of rawArchiveCases) {
    const releaseWorkspaceDirectory = createReleaseWorkspace();
    try {
      await rewriteArchiveAsStoredZip(
        resolve(releaseWorkspaceDirectory, "dist/everforest-complete.vsix"),
        addEntry
      );
      assert.match(
        runScriptExpectingFailure(
          packageReleaseScriptPath,
          [releaseVersion],
          releaseWorkspaceDirectory
        ),
        expectedError,
        description
      );
    } finally {
      rmSync(releaseWorkspaceDirectory, { force: true, recursive: true });
    }
  }
});

test("rejects raw ZIP local-header metadata mismatches and oversized entries", () => {
  const rawMetadataCases = [
    {
      description: "local flags mismatch",
      mutateArchive: (archivePath) =>
        mutateZipCentralEntry(
          archivePath,
          "extension.vsixmanifest",
          (archiveBytes, centralDirectoryEntryOffset) => {
            const localFileHeaderOffset = archiveBytes.readUInt32LE(
              centralDirectoryEntryOffset + 42
            );
            archiveBytes.writeUInt16LE(1, localFileHeaderOffset + 6);
          }
        ),
      expectedError: /mismatched local and central ZIP metadata/,
    },
    {
      description: "local compressed size mismatch",
      mutateArchive: (archivePath) =>
        mutateZipCentralEntry(
          archivePath,
          "extension.vsixmanifest",
          (archiveBytes, centralDirectoryEntryOffset) => {
            const localFileHeaderOffset = archiveBytes.readUInt32LE(
              centralDirectoryEntryOffset + 42
            );
            archiveBytes.writeUInt32LE(1, localFileHeaderOffset + 18);
          }
        ),
      expectedError: /mismatched local and central ZIP metadata/,
    },
    {
      description: "compressed entry size bound",
      mutateArchive: (archivePath) =>
        mutateZipCentralEntry(
          archivePath,
          "extension.vsixmanifest",
          (archiveBytes, centralDirectoryEntryOffset) => {
            archiveBytes.writeUInt32LE(
              maxVsixArchiveEntryCompressedBytes + 1,
              centralDirectoryEntryOffset + 20
            );
          }
        ),
      expectedError: /maximum compressed size/,
    },
  ];
  for (const { description, mutateArchive, expectedError } of rawMetadataCases) {
    const releaseWorkspaceDirectory = createReleaseWorkspace();
    try {
      const sourceArchivePath = resolve(releaseWorkspaceDirectory, "dist/everforest-complete.vsix");
      mutateArchive(sourceArchivePath);
      assert.match(
        runScriptExpectingFailure(
          packageReleaseScriptPath,
          [releaseVersion],
          releaseWorkspaceDirectory
        ),
        expectedError,
        description
      );
    } finally {
      rmSync(releaseWorkspaceDirectory, { force: true, recursive: true });
    }
  }
});

test("verifier inspects raw ZIP entries before JSZip normalization", async () => {
  const verifierArchiveCases = [
    {
      description: "duplicate raw entry",
      addEntry: (archiveEntries) => {
        const duplicatedEntry = archiveEntries.find(
          (archiveEntry) => !archiveEntry.name.endsWith("/")
        );
        return [...archiveEntries, { ...duplicatedEntry }];
      },
      expectedError: /duplicate raw ZIP entries/,
    },
    {
      description: "path alias",
      addEntry: (archiveEntries) => [
        ...archiveEntries,
        { name: "extension/./evil.js", contents: "evil" },
      ],
      expectedError: /non-canonical ZIP entry name: extension\/\.\/evil\.js/,
    },
    {
      description: "unexpected directory",
      addEntry: (archiveEntries) => [...archiveEntries, { name: "evil/", contents: "" }],
      expectedError: /unexpected VSIX directories/,
    },
  ];

  for (const { description, addEntry, expectedError } of verifierArchiveCases) {
    const releaseWorkspaceDirectory = createReleaseWorkspace();
    try {
      execFileSync(process.execPath, [packageReleaseScriptPath, releaseVersion], {
        cwd: releaseWorkspaceDirectory,
        encoding: "utf8",
        env: childProcessEnvironment(),
      });
      await rewriteArchiveAsStoredZip(
        resolve(releaseWorkspaceDirectory, "dist", releasePackageName),
        addEntry
      );
      refreshReleaseChecksum(releaseWorkspaceDirectory);
      assert.match(
        runScriptExpectingFailure(
          releaseVerificationScriptPath,
          [releaseVersion],
          releaseWorkspaceDirectory
        ),
        expectedError,
        description
      );
    } finally {
      rmSync(releaseWorkspaceDirectory, { force: true, recursive: true });
    }
  }
});

test("rejects tampered ZIP payloads and special UNIX entry modes", async () => {
  const releaseArchiveCases = [
    {
      description: "CRC-tampered payload",
      mutateArchive: (releaseArchivePath) =>
        tamperZipPayload(releaseArchivePath, "extension.vsixmanifest"),
      expectedError:
        /CRC32 mismatch|Corrupted zip|uncompressed data size mismatch|unexpected end of file/i,
    },
    {
      description: "UNIX symlink mode",
      mutateArchive: (releaseArchivePath) =>
        setZipUnixMode(releaseArchivePath, "extension.vsixmanifest", 0xa000),
      expectedError: /unsupported UNIX file mode/,
    },
    {
      description: "UNIX character-device mode",
      mutateArchive: (releaseArchivePath) =>
        setZipUnixMode(releaseArchivePath, "extension.vsixmanifest", 0x2000),
      expectedError: /unsupported UNIX file mode/,
    },
  ];

  for (const { description, mutateArchive, expectedError } of releaseArchiveCases) {
    const releaseWorkspaceDirectory = createReleaseWorkspace();
    try {
      execFileSync(process.execPath, [packageReleaseScriptPath, releaseVersion], {
        cwd: releaseWorkspaceDirectory,
        encoding: "utf8",
        env: childProcessEnvironment(),
      });
      const releaseArchivePath = resolve(releaseWorkspaceDirectory, "dist", releasePackageName);
      mutateArchive(releaseArchivePath);
      refreshReleaseChecksum(releaseWorkspaceDirectory);
      assert.match(
        runScriptExpectingFailure(
          releaseVerificationScriptPath,
          [releaseVersion],
          releaseWorkspaceDirectory
        ),
        expectedError,
        description
      );
    } finally {
      rmSync(releaseWorkspaceDirectory, { force: true, recursive: true });
    }
  }

  const releaseWorkspaceDirectory = createReleaseWorkspace();
  try {
    tamperZipPayload(
      resolve(releaseWorkspaceDirectory, "dist/everforest-complete.vsix"),
      "extension.vsixmanifest"
    );
    assert.match(
      runScriptExpectingFailure(
        packageReleaseScriptPath,
        [releaseVersion],
        releaseWorkspaceDirectory
      ),
      /CRC32 mismatch|Corrupted zip|uncompressed data size mismatch|unexpected end of file/i,
      "package-release CRC validation"
    );
  } finally {
    rmSync(releaseWorkspaceDirectory, { force: true, recursive: true });
  }
});

test("rejects missing or corrupt release checksums", () => {
  for (const checksumMutation of ["missing", "corrupt"]) {
    const releaseWorkspaceDirectory = createReleaseWorkspace();
    try {
      execFileSync(process.execPath, [packageReleaseScriptPath, releaseVersion], {
        cwd: releaseWorkspaceDirectory,
        encoding: "utf8",
        env: childProcessEnvironment(),
      });
      const releaseWorkspaceChecksumPath = resolve(
        releaseWorkspaceDirectory,
        "dist",
        `${releasePackageName}.sha256`
      );
      if (checksumMutation === "missing") {
        rmSync(releaseWorkspaceChecksumPath);
      } else {
        writeFileSync(releaseWorkspaceChecksumPath, `corrupt  ${releasePackageName}\n`, "utf8");
      }
      assert.match(
        runScriptExpectingFailure(
          releaseVerificationScriptPath,
          [releaseVersion],
          releaseWorkspaceDirectory
        ),
        checksumMutation === "missing"
          ? /Required release file not found/
          : /checksum does not match/
      );
    } finally {
      rmSync(releaseWorkspaceDirectory, { force: true, recursive: true });
    }
  }
});

test("rejects wrong release package and VSIX manifest identities", async () => {
  const identityCases = [
    [
      "package name",
      async (releaseArchive) => {
        const packageManifestEntry = releaseArchive.file("extension/package.json");
        const packageManifest = JSON.parse(await packageManifestEntry.async("string"));
        packageManifest.name = "wrong-name";
        releaseArchive.file("extension/package.json", JSON.stringify(packageManifest));
      },
      /name wrong-name/,
    ],
    [
      "publisher",
      async (releaseArchive) => {
        const packageManifestEntry = releaseArchive.file("extension/package.json");
        const packageManifest = JSON.parse(await packageManifestEntry.async("string"));
        packageManifest.publisher = "wrong-publisher";
        releaseArchive.file("extension/package.json", JSON.stringify(packageManifest));
      },
      /publisher wrong-publisher/,
    ],
    [
      "package version",
      async (releaseArchive) => {
        const packageManifestEntry = releaseArchive.file("extension/package.json");
        const packageManifest = JSON.parse(await packageManifestEntry.async("string"));
        packageManifest.version = "1.2.2";
        releaseArchive.file("extension/package.json", JSON.stringify(packageManifest));
      },
      /contains version 1\.2\.2/,
    ],
    [
      "VSIX identity name",
      async (releaseArchive) => {
        const vsixManifestEntry = releaseArchive.file("extension.vsixmanifest");
        const vsixManifest = await vsixManifestEntry.async("string");
        releaseArchive.file(
          "extension.vsixmanifest",
          vsixManifest.replace('Id="everforest-complete"', 'Id="wrong-name"')
        );
      },
      /identity Id wrong-name/,
    ],
    [
      "VSIX identity publisher",
      async (releaseArchive) => {
        const vsixManifestEntry = releaseArchive.file("extension.vsixmanifest");
        const vsixManifest = await vsixManifestEntry.async("string");
        releaseArchive.file(
          "extension.vsixmanifest",
          vsixManifest.replace('Publisher="overengineered-org"', 'Publisher="wrong-publisher"')
        );
      },
      /identity publisher wrong-publisher/,
    ],
    [
      "VSIX identity version",
      async (releaseArchive) => {
        const vsixManifestEntry = releaseArchive.file("extension.vsixmanifest");
        const vsixManifest = await vsixManifestEntry.async("string");
        releaseArchive.file(
          "extension.vsixmanifest",
          vsixManifest.replace('Version="999.999.999"', 'Version="1.2.2"')
        );
      },
      /identity version 1\.2\.2/,
    ],
  ];
  for (const [, mutateArchive, expectedError] of identityCases) {
    const releaseWorkspaceDirectory = createReleaseWorkspace();
    try {
      execFileSync(process.execPath, [packageReleaseScriptPath, releaseVersion], {
        cwd: releaseWorkspaceDirectory,
        encoding: "utf8",
        env: childProcessEnvironment(),
      });
      await mutateReleaseArchive(releaseWorkspaceDirectory, mutateArchive);
      assert.match(
        runScriptExpectingFailure(
          releaseVerificationScriptPath,
          [releaseVersion],
          releaseWorkspaceDirectory
        ),
        expectedError
      );
    } finally {
      rmSync(releaseWorkspaceDirectory, { force: true, recursive: true });
    }
  }
});

test("rejects unexpected VSIX files and omitted runtime modules", () => {
  const validatorCases = [
    [[...expectedPackagedFiles, "unexpected.txt"], /Unexpected VSIX contents/],
    [
      expectedPackagedFiles.filter((packagedFilePath) => packagedFilePath !== "dist/theme.js"),
      /omits runtime modules imported by its entry points/,
    ],
  ];
  for (const [fakePackagedFiles, expectedError] of validatorCases) {
    const fakeNpxDirectory = mkdtempSync(join(tmpdir(), "everforest-validator-test-"));
    try {
      const fakeNpxPath = join(fakeNpxDirectory, process.platform === "win32" ? "npx.cmd" : "npx");
      const fakeNpxScript =
        process.platform === "win32"
          ? `@echo off\r\n${fakePackagedFiles
              .map((packagedFilePath) => `echo ${packagedFilePath}`)
              .join("\r\n")}\r\n`
          : `#!/bin/sh\nprintf '%s\\n' ${fakePackagedFiles
              .map((packagedFilePath) => `'${packagedFilePath}'`)
              .join(" ")}\n`;
      writeFileSync(fakeNpxPath, fakeNpxScript, "utf8");
      chmodSync(fakeNpxPath, 0o755);
      const validatorEnvironment = {
        ...childProcessEnvironment(),
        PATH: `${fakeNpxDirectory}:${process.env.PATH}`,
      };
      const validationResult = spawnSync(process.execPath, [packageContentsValidationScriptPath], {
        cwd: repositoryDirectory,
        encoding: "utf8",
        env: validatorEnvironment,
      });
      assert.notEqual(validationResult.status, 0, "package validator unexpectedly passed");
      assert.match(`${validationResult.stdout}\n${validationResult.stderr}`, expectedError);
    } finally {
      rmSync(fakeNpxDirectory, { force: true, recursive: true });
    }
  }
});

test("package verifier rejects a stale packaged payload", async () => {
  const validationWorkspaceDirectory = await createCurrentPayloadValidationWorkspace();
  const packageListShimDirectory = createPackageListShimDirectory();
  try {
    const packagedExtensionPath = resolve(
      validationWorkspaceDirectory,
      "dist/everforest-complete.vsix"
    );
    const packagedExtensionArchive = await JSZip.loadAsync(readFileSync(packagedExtensionPath));
    const stalePayloadEntry = packagedExtensionArchive.file("extension/dist/extension.js");
    assert.ok(stalePayloadEntry);
    const stalePayloadBytes = await stalePayloadEntry.async("nodebuffer");
    stalePayloadBytes[0] ^= 0xff;
    packagedExtensionArchive.file("extension/dist/extension.js", stalePayloadBytes);
    writeFileSync(
      packagedExtensionPath,
      await packagedExtensionArchive.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
      })
    );

    const validationEnvironment = {
      ...childProcessEnvironment(),
      PATH: `${packageListShimDirectory}:${process.env.PATH}`,
    };
    const validationResult = spawnSync(process.execPath, [packageContentsValidationScriptPath], {
      cwd: validationWorkspaceDirectory,
      encoding: "utf8",
      env: validationEnvironment,
    });
    assert.notEqual(validationResult.status, 0, "package verifier unexpectedly passed stale bytes");
    assert.match(
      `${validationResult.stdout}\n${validationResult.stderr}`,
      /Packaged VSIX payload is stale for dist\/extension\.js/
    );
  } finally {
    rmSync(packageListShimDirectory, { force: true, recursive: true });
    rmSync(validationWorkspaceDirectory, { force: true, recursive: true });
  }
});

test("allows only a package manifest version rewrite for current payload bytes", () => {
  const currentPackageManifestBytes = Buffer.from(
    '{\n  "name": "everforest-complete",\n  "version": "0.0.0-development",\n  "description": "current"\n}\n'
  );
  const releasePackageManifestBytes = Buffer.from(
    '{\n  "name": "everforest-complete",\n  "version": "1.2.3",\n  "description": "current"\n}\n'
  );
  assert.equal(
    packagedPayloadMatchesWorkspaceBytes(
      "extension/package.json",
      releasePackageManifestBytes,
      currentPackageManifestBytes
    ),
    true
  );
  assert.equal(
    packagedPayloadMatchesWorkspaceBytes(
      "extension/package.json",
      Buffer.from(releasePackageManifestBytes.toString().replace('"current"', '"stale"')),
      currentPackageManifestBytes
    ),
    false
  );
  assert.equal(
    packagedPayloadMatchesWorkspaceBytes(
      "extension/dist/extension.js",
      Buffer.from("release bytes"),
      Buffer.from("source bytes")
    ),
    false
  );
});

test("exports conservative VSIX archive and entry bounds", () => {
  assert.ok(maxVsixArchiveBytes >= maxVsixArchiveEntryUncompressedBytes);
  assert.ok(maxVsixArchiveEntryUncompressedBytes > maxVsixArchiveEntryCompressedBytes);
});
