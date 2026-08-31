import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { createScanner } from "typescript/unstable/ast/scanner";
import { LanguageVariant, SyntaxKind } from "typescript/unstable/ast";

export const extensionPackageName = "everforest-complete";
export const extensionPackagePublisher = "overengineered-org";
export const releaseVersionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
export const maxVsixArchiveBytes = 64 * 1024 * 1024;
export const maxVsixArchiveEntryCount = 512;
export const maxVsixArchiveEntryCompressedBytes = 32 * 1024 * 1024;
export const maxVsixArchiveEntryUncompressedBytes = 64 * 1024 * 1024;
export const maxVsixArchiveUncompressedBytes = 64 * 1024 * 1024;
export const maxRuntimeSourceBytes = 4 * 1024 * 1024;

// Keep this list in sync with the intentional package boundary. package.json cannot express
// that boundary without broad globs, so release validation owns the exact contract here.
export const expectedPackagedFiles = Object.freeze(
  [
    "CHANGELOG.md",
    "LICENSE",
    "NOTICE",
    "README.md",
    "SUPPORT.md",
    "dist/configuration-ui.js",
    "dist/configuration.js",
    "dist/extension-web.js",
    "dist/extension.js",
    "dist/palette/index.js",
    "dist/schedule-controller.js",
    "dist/schedule.js",
    "dist/semantic.js",
    "dist/syntax/default.js",
    "dist/theme.js",
    "dist/theme-file-lock.js",
    "dist/theme-file-transaction.js",
    "dist/theme-regeneration.js",
    "dist/workbench/documented-workbench-colors.json",
    "dist/workbench/colors.js",
    "media/icon.png",
    "media/previews/everforest-complete-automation.webp",
    "media/previews/everforest-complete-customization.webp",
    "media/previews/everforest-complete-light-dark.webp",
    "media/previews/everforest-complete-workbench.webp",
    "media/walkthrough/automate-appearance.svg",
    "media/walkthrough/choose-theme.svg",
    "media/walkthrough/configure-feel.svg",
    "package.json",
    "themes/everforest-complete-dark-color-theme.json",
    "themes/everforest-complete-dark-hard-color-theme.json",
    "themes/everforest-complete-dark-medium-color-theme.json",
    "themes/everforest-complete-dark-soft-color-theme.json",
    "themes/everforest-complete-light-color-theme.json",
    "themes/everforest-complete-light-hard-color-theme.json",
    "themes/everforest-complete-light-medium-color-theme.json",
    "themes/everforest-complete-light-soft-color-theme.json",
  ].sort()
);

export const runtimeEntryPackageFiles = Object.freeze([
  "dist/extension.js",
  "dist/extension-web.js",
]);

const releaseManifestPathByPackagedFile = Object.freeze({
  "CHANGELOG.md": "changelog.md",
  LICENSE: "LICENSE.txt",
  "README.md": "readme.md",
});
const packagedFilePathByReleaseManifestPath = Object.freeze(
  Object.fromEntries(
    Object.entries(releaseManifestPathByPackagedFile).map(([packagedFilePath, archiveFilePath]) => [
      archiveFilePath,
      packagedFilePath,
    ])
  )
);

export function expectedReleaseArchiveFiles() {
  return [
    "[Content_Types].xml",
    "extension.vsixmanifest",
    ...expectedPackagedFiles.map(
      (packagedFilePath) =>
        `extension/${releaseManifestPathByPackagedFile[packagedFilePath] ?? packagedFilePath}`
    ),
  ].sort();
}

export function expectedReleaseArchiveDirectories(
  expectedArchiveFiles = expectedReleaseArchiveFiles()
) {
  const archiveDirectories = new Set();
  for (const archiveFileName of expectedArchiveFiles) {
    const archivePathSegments = normalizePackagePath(archiveFileName).split("/");
    for (let segmentIndex = 1; segmentIndex < archivePathSegments.length; segmentIndex += 1) {
      archiveDirectories.add(`${archivePathSegments.slice(0, segmentIndex).join("/")}/`);
    }
  }
  return [...archiveDirectories].sort();
}

export function expectedWorkspacePathForArchiveFile(archiveFilePath) {
  if (archiveFilePath === "[Content_Types].xml" || archiveFilePath === "extension.vsixmanifest") {
    return undefined;
  }
  if (!archiveFilePath.startsWith("extension/")) {
    throw new Error(`Unexpected VSIX archive file outside extension/: ${archiveFilePath}`);
  }
  const packagedFilePath = archiveFilePath.slice("extension/".length);
  return packagedFilePathByReleaseManifestPath[packagedFilePath] ?? packagedFilePath;
}

export function assertReleaseVersion(releaseVersion) {
  if (!releaseVersionPattern.test(releaseVersion ?? "")) {
    throw new Error(`Invalid release version: ${releaseVersion}`);
  }
  return releaseVersion;
}

export function normalizePackagePath(packagePath) {
  return String(packagePath)
    .trim()
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "");
}

export function parsePackageFileList(packageListing) {
  return packageListing.split(/\r?\n/).map(normalizePackagePath).filter(Boolean).sort();
}

const zipEndOfCentralDirectorySignature = 0x06054b50;
const zipCentralDirectoryFileHeaderSignature = 0x02014b50;
const zipLocalFileHeaderSignature = 0x04034b50;

function readZipUInt16(zipBytes, byteOffset, fieldName) {
  if (byteOffset < 0 || byteOffset + 2 > zipBytes.length) {
    throw new Error(`VSIX archive has a truncated ZIP ${fieldName}`);
  }
  return zipBytes.readUInt16LE(byteOffset);
}

function readZipUInt32(zipBytes, byteOffset, fieldName) {
  if (byteOffset < 0 || byteOffset + 4 > zipBytes.length) {
    throw new Error(`VSIX archive has a truncated ZIP ${fieldName}`);
  }
  return zipBytes.readUInt32LE(byteOffset);
}

function decodeZipEntryName(zipNameBytes, archiveContext) {
  let archiveEntryName;
  try {
    archiveEntryName = new TextDecoder("utf-8", { fatal: true }).decode(zipNameBytes);
  } catch (decodeError) {
    throw new Error(`${archiveContext} contains a ZIP entry name that is not valid UTF-8`);
  }
  return archiveEntryName;
}

function assertCanonicalArchiveEntryName(archiveEntryName, isDirectory, archiveContext) {
  if (!archiveEntryName || archiveEntryName.trim() !== archiveEntryName) {
    throw new Error(
      `${archiveContext} contains a non-canonical ZIP entry name: ${archiveEntryName}`
    );
  }
  if (
    archiveEntryName.includes("\\") ||
    archiveEntryName.includes("\0") ||
    archiveEntryName.startsWith("/") ||
    /^[A-Za-z]:/.test(archiveEntryName)
  ) {
    throw new Error(
      `${archiveContext} contains a non-canonical ZIP entry name: ${archiveEntryName}`
    );
  }

  const archivePathSegments = archiveEntryName.split("/");
  const finalPathSegment = archivePathSegments.at(-1);
  if (isDirectory) {
    if (finalPathSegment !== "") {
      throw new Error(
        `${archiveContext} contains a malformed ZIP directory name: ${archiveEntryName}`
      );
    }
    archivePathSegments.pop();
  } else if (finalPathSegment === "") {
    throw new Error(`${archiveContext} contains a malformed ZIP file name: ${archiveEntryName}`);
  }
  if (
    archivePathSegments.length === 0 ||
    archivePathSegments.some(
      (pathSegment) => !pathSegment || pathSegment === "." || pathSegment === ".."
    )
  ) {
    throw new Error(
      `${archiveContext} contains a non-canonical ZIP entry name: ${archiveEntryName}`
    );
  }
}

function locateZipEndOfCentralDirectory(zipBytes, archiveContext) {
  const minimumEndOfCentralDirectoryOffset = Math.max(0, zipBytes.length - (22 + 0xffff));
  for (
    let endOfCentralDirectoryOffset = zipBytes.length - 22;
    endOfCentralDirectoryOffset >= minimumEndOfCentralDirectoryOffset;
    endOfCentralDirectoryOffset -= 1
  ) {
    if (
      endOfCentralDirectoryOffset < 0 ||
      readZipUInt32(zipBytes, endOfCentralDirectoryOffset, "end-of-central-directory signature") !==
        zipEndOfCentralDirectorySignature
    ) {
      continue;
    }
    const commentLength = readZipUInt16(
      zipBytes,
      endOfCentralDirectoryOffset + 20,
      "comment length"
    );
    if (endOfCentralDirectoryOffset + 22 + commentLength !== zipBytes.length) continue;
    if (
      readZipUInt16(zipBytes, endOfCentralDirectoryOffset + 4, "disk number") !== 0 ||
      readZipUInt16(zipBytes, endOfCentralDirectoryOffset + 6, "central-directory disk") !== 0 ||
      readZipUInt16(zipBytes, endOfCentralDirectoryOffset + 8, "disk entry count") !==
        readZipUInt16(zipBytes, endOfCentralDirectoryOffset + 10, "entry count")
    ) {
      throw new Error(`${archiveContext} uses unsupported multi-disk ZIP metadata`);
    }
    const centralDirectorySize = readZipUInt32(
      zipBytes,
      endOfCentralDirectoryOffset + 12,
      "central-directory size"
    );
    const centralDirectoryOffset = readZipUInt32(
      zipBytes,
      endOfCentralDirectoryOffset + 16,
      "central-directory offset"
    );
    if (
      centralDirectoryOffset > endOfCentralDirectoryOffset ||
      centralDirectorySize > endOfCentralDirectoryOffset - centralDirectoryOffset ||
      centralDirectoryOffset + centralDirectorySize !== endOfCentralDirectoryOffset
    ) {
      throw new Error(`${archiveContext} has ZIP central-directory bounds outside the archive`);
    }
    return {
      centralDirectoryEntryCount: readZipUInt16(
        zipBytes,
        endOfCentralDirectoryOffset + 10,
        "entry count"
      ),
      centralDirectoryOffset,
      centralDirectorySize,
    };
  }
  throw new Error(`${archiveContext} has no valid ZIP end-of-central-directory record`);
}

/**
 * Parse central-directory names before JSZip indexes entries by name. This keeps path aliases,
 * duplicate raw entries, and directory spoofing visible to package validation.
 */
export function parseRawArchiveEntries(zipBytes, archiveContext = "VSIX archive") {
  if (!Buffer.isBuffer(zipBytes)) {
    throw new Error(`${archiveContext} must be provided as ZIP bytes`);
  }
  if (zipBytes.length > maxVsixArchiveBytes) {
    throw new Error(
      `${archiveContext} exceeds the maximum archive size of ${maxVsixArchiveBytes} bytes`
    );
  }
  const centralDirectory = locateZipEndOfCentralDirectory(zipBytes, archiveContext);
  if (centralDirectory.centralDirectoryEntryCount > maxVsixArchiveEntryCount) {
    throw new Error(
      `${archiveContext} contains too many ZIP entries: ${centralDirectory.centralDirectoryEntryCount}`
    );
  }
  if (centralDirectory.centralDirectoryEntryCount === 0) {
    if (centralDirectory.centralDirectorySize !== 0) {
      throw new Error(`${archiveContext} has a non-empty ZIP central directory with no entries`);
    }
    return [];
  }

  const archiveEntries = [];
  const rawArchiveEntryNames = new Set();
  let archiveUncompressedBytes = 0;
  let centralDirectoryEntryOffset = centralDirectory.centralDirectoryOffset;
  const centralDirectoryEndOffset =
    centralDirectory.centralDirectoryOffset + centralDirectory.centralDirectorySize;
  for (
    let archiveEntryIndex = 0;
    archiveEntryIndex < centralDirectory.centralDirectoryEntryCount;
    archiveEntryIndex += 1
  ) {
    if (
      centralDirectoryEntryOffset + 46 > centralDirectoryEndOffset ||
      readZipUInt32(
        zipBytes,
        centralDirectoryEntryOffset,
        "central-directory file-header signature"
      ) !== zipCentralDirectoryFileHeaderSignature
    ) {
      throw new Error(`${archiveContext} has malformed ZIP central-directory file headers`);
    }
    const versionNeeded = readZipUInt16(
      zipBytes,
      centralDirectoryEntryOffset + 6,
      "version-needed"
    );
    const generalPurposeFlags = readZipUInt16(zipBytes, centralDirectoryEntryOffset + 8, "flags");
    const compressedSize = readZipUInt32(
      zipBytes,
      centralDirectoryEntryOffset + 20,
      "compressed size"
    );
    const uncompressedSize = readZipUInt32(
      zipBytes,
      centralDirectoryEntryOffset + 24,
      "uncompressed size"
    );
    const compressionMethod = readZipUInt16(
      zipBytes,
      centralDirectoryEntryOffset + 10,
      "compression method"
    );
    const crc32 = readZipUInt32(zipBytes, centralDirectoryEntryOffset + 16, "CRC32");
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new Error(`${archiveContext} uses unsupported ZIP64 entry metadata`);
    }
    if (compressedSize > maxVsixArchiveEntryCompressedBytes) {
      throw new Error(
        `${archiveContext} entry exceeds the maximum compressed size of ${maxVsixArchiveEntryCompressedBytes} bytes`
      );
    }
    if (uncompressedSize > maxVsixArchiveEntryUncompressedBytes) {
      throw new Error(
        `${archiveContext} entry exceeds the maximum uncompressed size of ${maxVsixArchiveEntryUncompressedBytes} bytes`
      );
    }
    archiveUncompressedBytes += uncompressedSize;
    if (archiveUncompressedBytes > maxVsixArchiveUncompressedBytes) {
      throw new Error(
        `${archiveContext} exceeds the maximum aggregate uncompressed size of ${maxVsixArchiveUncompressedBytes} bytes`
      );
    }
    const archiveEntryNameByteLength = readZipUInt16(
      zipBytes,
      centralDirectoryEntryOffset + 28,
      "file-name length"
    );
    const extraFieldByteLength = readZipUInt16(
      zipBytes,
      centralDirectoryEntryOffset + 30,
      "extra-field length"
    );
    const commentByteLength = readZipUInt16(
      zipBytes,
      centralDirectoryEntryOffset + 32,
      "file-comment length"
    );
    const localFileHeaderOffset = readZipUInt32(
      zipBytes,
      centralDirectoryEntryOffset + 42,
      "local-header offset"
    );
    if (localFileHeaderOffset === 0xffffffff) {
      throw new Error(`${archiveContext} uses unsupported ZIP64 entry metadata`);
    }
    const centralEntryEndOffset =
      centralDirectoryEntryOffset +
      46 +
      archiveEntryNameByteLength +
      extraFieldByteLength +
      commentByteLength;
    if (centralEntryEndOffset > centralDirectoryEndOffset) {
      throw new Error(`${archiveContext} has a ZIP central-directory entry outside the archive`);
    }
    const archiveEntryName = decodeZipEntryName(
      zipBytes.subarray(
        centralDirectoryEntryOffset + 46,
        centralDirectoryEntryOffset + 46 + archiveEntryNameByteLength
      ),
      archiveContext
    );
    const externalFileAttributes = readZipUInt32(
      zipBytes,
      centralDirectoryEntryOffset + 38,
      "external attributes"
    );
    // ZIP tools omit UNIX attributes on ordinary DOS/Windows entries. When mode bits are present,
    // however, require an explicit regular-file or directory type regardless of originating host.
    const unixFileMode = externalFileAttributes >>> 16;
    const unixFileType = unixFileMode & 0xf000;
    if (unixFileMode !== 0 && unixFileType !== 0x8000 && unixFileType !== 0x4000) {
      throw new Error(
        `${archiveContext} contains a ZIP entry with an unsupported UNIX file mode: ${archiveEntryName}`
      );
    }
    const hasDirectoryAttributes = (externalFileAttributes & 0x10) !== 0 || unixFileType === 0x4000;
    const isDirectory = archiveEntryName.endsWith("/");
    if (hasDirectoryAttributes && !isDirectory) {
      throw new Error(`${archiveContext} contains a directory entry without a trailing slash`);
    }
    if (unixFileType === 0x8000 && isDirectory) {
      throw new Error(`${archiveContext} contains a regular UNIX file with a directory name`);
    }
    assertCanonicalArchiveEntryName(archiveEntryName, isDirectory, archiveContext);
    if (rawArchiveEntryNames.has(archiveEntryName)) {
      throw new Error(`${archiveContext} contains duplicate raw ZIP entries: ${archiveEntryName}`);
    }
    rawArchiveEntryNames.add(archiveEntryName);

    if (
      localFileHeaderOffset >= centralDirectory.centralDirectoryOffset ||
      localFileHeaderOffset + 30 > centralDirectory.centralDirectoryOffset ||
      readZipUInt32(zipBytes, localFileHeaderOffset, "local-header signature") !==
        zipLocalFileHeaderSignature
    ) {
      throw new Error(`${archiveContext} contains a ZIP entry with invalid local-header bounds`);
    }
    const localNameByteLength = readZipUInt16(
      zipBytes,
      localFileHeaderOffset + 26,
      "local file-name length"
    );
    const localVersionNeeded = readZipUInt16(
      zipBytes,
      localFileHeaderOffset + 4,
      "local version-needed"
    );
    const localExtraFieldByteLength = readZipUInt16(
      zipBytes,
      localFileHeaderOffset + 28,
      "local extra-field length"
    );
    const localGeneralPurposeFlags = readZipUInt16(
      zipBytes,
      localFileHeaderOffset + 6,
      "local flags"
    );
    const localCompressionMethod = readZipUInt16(
      zipBytes,
      localFileHeaderOffset + 8,
      "local compression method"
    );
    const localCrc32 = readZipUInt32(zipBytes, localFileHeaderOffset + 14, "local CRC32");
    const localCompressedSize = readZipUInt32(
      zipBytes,
      localFileHeaderOffset + 18,
      "local compressed size"
    );
    const localUncompressedSize = readZipUInt32(
      zipBytes,
      localFileHeaderOffset + 22,
      "local uncompressed size"
    );
    const localDataOffset =
      localFileHeaderOffset + 30 + localNameByteLength + localExtraFieldByteLength;
    if (
      localDataOffset > centralDirectory.centralDirectoryOffset ||
      compressedSize > centralDirectory.centralDirectoryOffset - localDataOffset
    ) {
      throw new Error(`${archiveContext} contains a ZIP entry with data outside the archive`);
    }
    const localArchiveEntryName = decodeZipEntryName(
      zipBytes.subarray(
        localFileHeaderOffset + 30,
        localFileHeaderOffset + 30 + localNameByteLength
      ),
      archiveContext
    );
    if (localArchiveEntryName !== archiveEntryName) {
      throw new Error(`${archiveContext} contains mismatched local and central ZIP entry names`);
    }
    const usesDataDescriptor = (generalPurposeFlags & 0x0008) !== 0;
    if (
      localGeneralPurposeFlags !== generalPurposeFlags ||
      localVersionNeeded !== versionNeeded ||
      localCompressionMethod !== compressionMethod ||
      (!usesDataDescriptor &&
        (localCrc32 !== crc32 ||
          localCompressedSize !== compressedSize ||
          localUncompressedSize !== uncompressedSize))
    ) {
      throw new Error(`${archiveContext} contains mismatched local and central ZIP metadata`);
    }
    if (usesDataDescriptor) {
      let dataDescriptorOffset = localDataOffset + compressedSize;
      if (
        dataDescriptorOffset + 4 <= centralDirectory.centralDirectoryOffset &&
        readZipUInt32(zipBytes, dataDescriptorOffset, "data-descriptor signature") === 0x08074b50
      ) {
        dataDescriptorOffset += 4;
      }
      if (dataDescriptorOffset + 12 > centralDirectory.centralDirectoryOffset) {
        throw new Error(`${archiveContext} contains a missing ZIP data descriptor`);
      }
      const descriptorCrc32 = readZipUInt32(zipBytes, dataDescriptorOffset, "descriptor CRC32");
      const descriptorCompressedSize = readZipUInt32(
        zipBytes,
        dataDescriptorOffset + 4,
        "descriptor compressed size"
      );
      const descriptorUncompressedSize = readZipUInt32(
        zipBytes,
        dataDescriptorOffset + 8,
        "descriptor uncompressed size"
      );
      if (
        descriptorCrc32 !== crc32 ||
        descriptorCompressedSize !== compressedSize ||
        descriptorUncompressedSize !== uncompressedSize
      ) {
        throw new Error(`${archiveContext} contains mismatched ZIP data-descriptor metadata`);
      }
    }
    archiveEntries.push({
      compressedSize,
      compressionMethod,
      crc32,
      generalPurposeFlags,
      isDirectory,
      name: archiveEntryName,
      uncompressedSize,
    });
    centralDirectoryEntryOffset = centralEntryEndOffset;
  }
  if (centralDirectoryEntryOffset !== centralDirectoryEndOffset) {
    throw new Error(`${archiveContext} has trailing bytes in its ZIP central directory`);
  }
  return archiveEntries;
}

export function validateRawArchiveEntries(
  rawArchiveEntries,
  expectedArchiveFiles,
  archiveContext = "VSIX archive"
) {
  const archiveFileNames = rawArchiveEntries
    .filter((archiveEntry) => !archiveEntry.isDirectory)
    .map((archiveEntry) => archiveEntry.name)
    .sort();
  const archiveDirectoryNames = rawArchiveEntries
    .filter((archiveEntry) => archiveEntry.isDirectory)
    .map((archiveEntry) => archiveEntry.name)
    .sort();
  const expectedArchiveFileNames = expectedArchiveFiles.map(normalizePackagePath).sort();
  const expectedArchiveDirectoryNames = new Set(
    expectedReleaseArchiveDirectories(expectedArchiveFileNames)
  );
  if (JSON.stringify(archiveFileNames) !== JSON.stringify(expectedArchiveFileNames)) {
    throw new Error(`${archiveContext} contains unexpected VSIX files`);
  }
  const unexpectedArchiveDirectoryNames = archiveDirectoryNames.filter(
    (archiveDirectoryName) => !expectedArchiveDirectoryNames.has(archiveDirectoryName)
  );
  if (unexpectedArchiveDirectoryNames.length > 0) {
    throw new Error(
      `${archiveContext} contains unexpected VSIX directories: ${unexpectedArchiveDirectoryNames.join(", ")}`
    );
  }
  return { archiveDirectoryNames, archiveFileNames };
}

/**
 * Return normalized archive file names and reject duplicate names when the archive reader exposes
 * the raw entry list. JSZip normally indexes entries by name, so the fallback cannot observe
 * duplicates after parsing.
 */
export function parseArchiveFileList(archive, archiveContext = "VSIX archive") {
  const rawArchiveEntries = Array.isArray(archive?.zipEntries?.files)
    ? archive.zipEntries.files
    : Object.values(archive?.files ?? {});
  const archiveFileNames = rawArchiveEntries
    .filter((archiveEntry) => !archiveEntry.dir && !archiveEntry.isDir)
    .map((archiveEntry) => normalizePackagePath(archiveEntry.name ?? archiveEntry.fileName));
  const seenArchiveFileNames = new Set();
  const duplicateArchiveFileNames = new Set();
  for (const archiveFileName of archiveFileNames) {
    if (seenArchiveFileNames.has(archiveFileName)) {
      duplicateArchiveFileNames.add(archiveFileName);
    }
    seenArchiveFileNames.add(archiveFileName);
  }
  if (duplicateArchiveFileNames.size > 0) {
    throw new Error(
      `${archiveContext} contains duplicate file entries: ${[...duplicateArchiveFileNames].join(", ")}`
    );
  }
  return archiveFileNames.sort();
}

function replaceTopLevelJsonStringPropertyValue(jsonSource, propertyName, replacementValue) {
  let scanOffset = 0;
  let objectDepth = 0;
  while (scanOffset < jsonSource.length) {
    const sourceCharacter = jsonSource[scanOffset];
    if (sourceCharacter === '"') {
      const stringStartOffset = scanOffset;
      scanOffset += 1;
      while (scanOffset < jsonSource.length) {
        if (jsonSource[scanOffset] === "\\") {
          scanOffset += 2;
          continue;
        }
        if (jsonSource[scanOffset] === '"') break;
        scanOffset += 1;
      }
      if (scanOffset >= jsonSource.length) return undefined;
      const stringEndOffset = scanOffset;
      scanOffset += 1;
      if (objectDepth !== 1) continue;
      let propertyDelimiterOffset = scanOffset;
      while (/\s/.test(jsonSource[propertyDelimiterOffset] ?? "")) {
        propertyDelimiterOffset += 1;
      }
      if (jsonSource[propertyDelimiterOffset] !== ":") continue;
      if (JSON.parse(jsonSource.slice(stringStartOffset, stringEndOffset + 1)) !== propertyName) {
        continue;
      }
      let propertyValueStartOffset = propertyDelimiterOffset + 1;
      while (/\s/.test(jsonSource[propertyValueStartOffset] ?? "")) {
        propertyValueStartOffset += 1;
      }
      if (jsonSource[propertyValueStartOffset] !== '"') return undefined;
      let propertyValueEndOffset = propertyValueStartOffset + 1;
      while (propertyValueEndOffset < jsonSource.length) {
        if (jsonSource[propertyValueEndOffset] === "\\") {
          propertyValueEndOffset += 2;
          continue;
        }
        if (jsonSource[propertyValueEndOffset] === '"') break;
        propertyValueEndOffset += 1;
      }
      if (propertyValueEndOffset >= jsonSource.length) return undefined;
      const replacementJsonString = JSON.stringify(replacementValue);
      return (
        jsonSource.slice(0, propertyValueStartOffset) +
        replacementJsonString +
        jsonSource.slice(propertyValueEndOffset + 1)
      );
    }
    if (sourceCharacter === "{") objectDepth += 1;
    if (sourceCharacter === "}") objectDepth -= 1;
    scanOffset += 1;
  }
  return undefined;
}

export function packagedPayloadMatchesWorkspaceBytes(
  archiveFilePath,
  packagedFileBytes,
  workspaceFileBytes
) {
  if (!Buffer.isBuffer(packagedFileBytes) || !Buffer.isBuffer(workspaceFileBytes)) {
    throw new Error("Packaged and workspace payloads must be provided as bytes");
  }
  if (packagedFileBytes.equals(workspaceFileBytes)) return true;
  if (archiveFilePath !== "extension/package.json") return false;

  let workspacePackageManifest;
  try {
    workspacePackageManifest = JSON.parse(workspaceFileBytes.toString("utf8"));
  } catch {
    return false;
  }
  if (
    !workspacePackageManifest ||
    typeof workspacePackageManifest !== "object" ||
    Array.isArray(workspacePackageManifest) ||
    typeof workspacePackageManifest.version !== "string"
  ) {
    return false;
  }
  let packagedPackageManifest;
  try {
    packagedPackageManifest = JSON.parse(packagedFileBytes.toString("utf8"));
  } catch {
    return false;
  }
  if (
    !packagedPackageManifest ||
    typeof packagedPackageManifest !== "object" ||
    Array.isArray(packagedPackageManifest) ||
    typeof packagedPackageManifest.version !== "string"
  ) {
    return false;
  }
  const versionNormalizedWorkspaceSource = replaceTopLevelJsonStringPropertyValue(
    workspaceFileBytes.toString("utf8"),
    "version",
    packagedPackageManifest.version
  );
  return (
    versionNormalizedWorkspaceSource !== undefined &&
    Buffer.from(versionNormalizedWorkspaceSource).equals(packagedFileBytes)
  );
}

function stripXmlCommentsPreservingOffsets(xmlSource) {
  let sanitizedXmlSource = "";
  let scanOffset = 0;
  while (scanOffset < xmlSource.length) {
    const commentStartOffset = xmlSource.indexOf("<!--", scanOffset);
    if (commentStartOffset < 0) {
      sanitizedXmlSource += xmlSource.slice(scanOffset);
      break;
    }
    sanitizedXmlSource += xmlSource.slice(scanOffset, commentStartOffset);
    const commentEndOffset = xmlSource.indexOf("-->", commentStartOffset + 4);
    if (commentEndOffset < 0) {
      throw new Error("VSIX manifest contains an unclosed XML comment");
    }
    const commentSource = xmlSource.slice(commentStartOffset, commentEndOffset + 3);
    sanitizedXmlSource += commentSource.replace(/[^\r\n]/g, " ");
    scanOffset = commentEndOffset + 3;
  }
  return sanitizedXmlSource;
}

function scanXmlTags(xmlSource) {
  const xmlTags = [];
  let scanOffset = 0;
  while (scanOffset < xmlSource.length) {
    const tagStartOffset = xmlSource.indexOf("<", scanOffset);
    if (tagStartOffset < 0) break;

    let tagEndOffset = tagStartOffset + 1;
    let quotedAttributeDelimiter;
    while (tagEndOffset < xmlSource.length) {
      const tagCharacter = xmlSource[tagEndOffset];
      if (quotedAttributeDelimiter) {
        if (tagCharacter === quotedAttributeDelimiter) quotedAttributeDelimiter = undefined;
      } else if (tagCharacter === '"' || tagCharacter === "'") {
        quotedAttributeDelimiter = tagCharacter;
      } else if (tagCharacter === ">") {
        break;
      }
      tagEndOffset += 1;
    }
    if (tagEndOffset >= xmlSource.length || quotedAttributeDelimiter) {
      throw new Error("VSIX manifest contains a malformed XML tag");
    }

    const tagSource = xmlSource.slice(tagStartOffset, tagEndOffset + 1);
    if (/^<\?/.test(tagSource)) {
      xmlTags.push({
        endOffset: tagEndOffset + 1,
        processingInstruction: true,
        source: tagSource,
        startOffset: tagStartOffset,
      });
      scanOffset = tagEndOffset + 1;
      continue;
    }
    if (/^<!/i.test(tagSource)) {
      throw new Error("VSIX manifest contains an unsupported XML declaration");
    }
    const tagNameMatch = /^<\/?([A-Za-z][A-Za-z0-9_.:-]*)/.exec(tagSource);
    if (!tagNameMatch) {
      throw new Error("VSIX manifest contains a malformed XML tag");
    }
    const closingTag = /^<\//.test(tagSource);
    if (
      closingTag &&
      (!/^<\/([A-Za-z][A-Za-z0-9_.:-]*)\s*>$/.test(tagSource) || /\/\s*>$/.test(tagSource))
    ) {
      throw new Error("VSIX manifest contains a malformed XML closing tag");
    }
    xmlTags.push({
      endOffset: tagEndOffset + 1,
      name: tagNameMatch[1],
      selfClosing: /\/\s*>$/.test(tagSource),
      source: tagSource,
      startOffset: tagStartOffset,
      closing: closingTag,
    });
    scanOffset = tagEndOffset + 1;
  }
  return xmlTags;
}

function parseXmlAttributes(elementSource, elementName) {
  const attributeSource = elementSource
    .replace(new RegExp(`^<${elementName}\\b`, "i"), "")
    .replace(/\/\s*>$/, "")
    .replace(/>$/, "");
  const attributes = {};
  let attributeOffset = 0;
  while (attributeOffset < attributeSource.length) {
    while (/\s/.test(attributeSource[attributeOffset] ?? "")) attributeOffset += 1;
    if (attributeOffset >= attributeSource.length) break;

    const attributeNameMatch = /^[A-Za-z][A-Za-z0-9_.:-]*/.exec(
      attributeSource.slice(attributeOffset)
    );
    if (!attributeNameMatch) {
      throw new Error(`VSIX manifest Identity contains a malformed attribute`);
    }
    const attributeName = attributeNameMatch[0];
    attributeOffset += attributeName.length;
    while (/\s/.test(attributeSource[attributeOffset] ?? "")) attributeOffset += 1;
    if (attributeSource[attributeOffset] !== "=") {
      throw new Error(`VSIX manifest Identity attribute ${attributeName} is missing '='`);
    }
    attributeOffset += 1;
    while (/\s/.test(attributeSource[attributeOffset] ?? "")) attributeOffset += 1;
    const attributeDelimiter = attributeSource[attributeOffset];
    if (attributeDelimiter !== '"' && attributeDelimiter !== "'") {
      throw new Error(`VSIX manifest Identity attribute ${attributeName} is not quoted`);
    }
    attributeOffset += 1;
    const attributeValueEndOffset = attributeSource.indexOf(attributeDelimiter, attributeOffset);
    if (attributeValueEndOffset < 0) {
      throw new Error(`VSIX manifest Identity attribute ${attributeName} is unclosed`);
    }
    if (Object.hasOwn(attributes, attributeName)) {
      throw new Error(`VSIX manifest Identity contains duplicate ${attributeName} attributes`);
    }
    attributes[attributeName] = attributeSource.slice(attributeOffset, attributeValueEndOffset);
    attributeOffset = attributeValueEndOffset + 1;
  }
  return attributes;
}

export function parseVsixIdentity(vsixManifestSource) {
  const sanitizedVsixManifestSource = stripXmlCommentsPreservingOffsets(vsixManifestSource);
  if (/<!DOCTYPE\b/i.test(sanitizedVsixManifestSource)) {
    throw new Error("VSIX manifest DOCTYPE is not allowed");
  }
  if (/<!\[CDATA\[/i.test(sanitizedVsixManifestSource)) {
    throw new Error("VSIX manifest CDATA is not allowed");
  }

  const xmlTags = scanXmlTags(sanitizedVsixManifestSource);
  if (xmlTags.length === 0) {
    throw new Error("VSIX manifest must contain exactly one PackageManifest root element");
  }
  const processingInstructionTags = xmlTags.filter(
    (xmlTag) => xmlTag.processingInstruction === true
  );
  if (processingInstructionTags.length > 0) {
    if (
      processingInstructionTags.length !== 1 ||
      processingInstructionTags[0].startOffset !== 0 ||
      !/^<\?xml\s+version=(['"])1\.0\1(?:\s+encoding=(['"])(?:UTF-8|utf-8)\2)?(?:\s+standalone=(['"])(?:yes|no)\3)?\s*\?>$/.test(
        processingInstructionTags[0].source
      )
    ) {
      throw new Error(
        "VSIX manifest accepts only one canonical leading XML declaration processing instruction"
      );
    }
  }
  const openElementNames = [];
  const metadataIdentityTags = [];
  let metadataElementCount = 0;
  let rootElementCount = 0;
  let rootElementClosed = false;
  let xmlContentOffset = 0;
  for (const xmlTag of xmlTags) {
    const textBetweenXmlTags = sanitizedVsixManifestSource.slice(
      xmlContentOffset,
      xmlTag.startOffset
    );
    if (openElementNames.length === 0 && textBetweenXmlTags.trim() !== "") {
      throw new Error("VSIX manifest contains text outside its PackageManifest root element");
    }
    xmlContentOffset = xmlTag.endOffset;
    if (xmlTag.processingInstruction) continue;

    if (xmlTag.closing) {
      if (openElementNames.length === 0) {
        throw new Error(`VSIX manifest contains an unexpected closing XML element: ${xmlTag.name}`);
      }
      const openElementName = openElementNames.pop();
      if (openElementName !== xmlTag.name) {
        throw new Error(`VSIX manifest contains malformed XML nesting near ${xmlTag.name}`);
      }
      if (openElementNames.length === 0) rootElementClosed = true;
      continue;
    }

    if (openElementNames.length === 0) {
      rootElementCount += 1;
      if (rootElementCount > 1) {
        throw new Error("VSIX manifest must contain exactly one PackageManifest root element");
      }
      if (xmlTag.name !== "PackageManifest") {
        throw new Error("VSIX manifest root element must be PackageManifest");
      }
    } else if (rootElementClosed) {
      throw new Error("VSIX manifest must contain exactly one PackageManifest root element");
    }

    if (xmlTag.name === "Metadata") {
      if (openElementNames.length !== 1 || openElementNames[0] !== "PackageManifest") {
        throw new Error("VSIX manifest Metadata must be a direct child of PackageManifest");
      }
      metadataElementCount += 1;
      if (metadataElementCount > 1) {
        throw new Error("VSIX manifest must contain exactly one Metadata element");
      }
    }
    if (xmlTag.name === "Identity") {
      if (
        openElementNames.length !== 2 ||
        openElementNames[0] !== "PackageManifest" ||
        openElementNames[1] !== "Metadata"
      ) {
        throw new Error("VSIX manifest Identity must be a child of Metadata");
      }
      metadataIdentityTags.push(xmlTag);
      if (metadataIdentityTags.length > 1) {
        throw new Error("VSIX manifest Metadata must contain exactly one Identity element");
      }
    }
    if (!xmlTag.selfClosing) openElementNames.push(xmlTag.name);
    if (xmlTag.selfClosing && openElementNames.length === 0) {
      rootElementClosed = true;
    }
  }
  if (openElementNames.length > 0 || !rootElementClosed) {
    throw new Error("VSIX manifest contains unclosed XML elements");
  }
  if (sanitizedVsixManifestSource.slice(xmlContentOffset).trim() !== "") {
    throw new Error("VSIX manifest contains text outside its PackageManifest root element");
  }
  if (rootElementCount !== 1) {
    throw new Error("VSIX manifest must contain exactly one PackageManifest root element");
  }
  if (metadataElementCount !== 1) {
    throw new Error("VSIX manifest must contain exactly one Metadata element");
  }
  if (metadataIdentityTags.length !== 1) {
    throw new Error("VSIX manifest Metadata must contain exactly one Identity element");
  }

  const identityTag = metadataIdentityTags[0];
  return {
    attributes: parseXmlAttributes(identityTag.source, "Identity"),
    elementSource: identityTag.source,
    endOffset: identityTag.endOffset,
    startOffset: identityTag.startOffset,
  };
}

export function versionVsixManifest(vsixManifestSource, releaseVersion) {
  assertReleaseVersion(releaseVersion);
  const parsedIdentity = parseVsixIdentity(vsixManifestSource);
  if (!parsedIdentity.attributes.Version) {
    throw new Error("VSIX manifest Identity is missing a version");
  }
  const versionedIdentitySource = parsedIdentity.elementSource.replace(
    /(\bVersion\s*=\s*)(["'])[^"']*\2/i,
    `$1$2${releaseVersion}$2`
  );
  if (versionedIdentitySource === parsedIdentity.elementSource) {
    throw new Error("VSIX manifest Identity does not contain a version attribute");
  }
  return (
    vsixManifestSource.slice(0, parsedIdentity.startOffset) +
    versionedIdentitySource +
    vsixManifestSource.slice(parsedIdentity.endOffset)
  );
}

export function assertExtensionPackageIdentity(extensionManifest, manifestContext) {
  if (
    !extensionManifest ||
    typeof extensionManifest !== "object" ||
    Array.isArray(extensionManifest)
  ) {
    throw new Error(`${manifestContext} is not a valid extension manifest object`);
  }
  if (extensionManifest.name !== extensionPackageName) {
    throw new Error(
      `${manifestContext} name ${extensionManifest.name ?? "<missing>"} does not match ${extensionPackageName}`
    );
  }
  if (extensionManifest.publisher !== extensionPackagePublisher) {
    throw new Error(
      `${manifestContext} publisher ${extensionManifest.publisher ?? "<missing>"} does not match ${extensionPackagePublisher}`
    );
  }
}

function isPathWithinDirectory(candidatePath, directoryPath) {
  const relativeCandidatePath = relative(directoryPath, candidatePath);
  return (
    relativeCandidatePath === "" ||
    (!isAbsolute(relativeCandidatePath) &&
      relativeCandidatePath !== ".." &&
      !relativeCandidatePath.startsWith(`..${sep}`))
  );
}

function inspectRuntimeSourcePath(
  runtimeSourcePath,
  repositoryLexicalPath,
  repositoryRealPath,
  runtimePackageFile
) {
  if (!isPathWithinDirectory(runtimeSourcePath, repositoryLexicalPath)) {
    throw new Error(`Runtime entry path escapes repository: ${runtimePackageFile}`);
  }

  let runtimeSourceMetadata;
  try {
    runtimeSourceMetadata = lstatSync(runtimeSourcePath);
  } catch (filesystemError) {
    if (filesystemError?.code === "ENOENT") return undefined;
    throw new Error(`Could not inspect runtime module ${runtimePackageFile}: ${filesystemError}`);
  }
  if (runtimeSourceMetadata.isSymbolicLink()) {
    throw new Error(`Runtime entry resolves through a symlink: ${runtimePackageFile}`);
  }
  if (!runtimeSourceMetadata.isFile()) {
    throw new Error(`Runtime entry is not a regular file: ${runtimePackageFile}`);
  }
  let runtimeRealPath;
  try {
    runtimeRealPath = realpathSync(runtimeSourcePath);
  } catch (filesystemError) {
    throw new Error(`Could not resolve runtime module ${runtimePackageFile}: ${filesystemError}`);
  }
  if (!isPathWithinDirectory(runtimeRealPath, repositoryRealPath)) {
    throw new Error(`Runtime entry path escapes repository through a link: ${runtimePackageFile}`);
  }
  if (runtimeSourceMetadata.size > maxRuntimeSourceBytes) {
    throw new Error(
      `Runtime source exceeds the maximum size of ${maxRuntimeSourceBytes} bytes: ${runtimePackageFile}`
    );
  }
  return runtimeSourceMetadata;
}

function resolveRuntimeImportPath(
  runtimeSourcePath,
  importSpecifier,
  repositoryLexicalPath,
  repositoryRealPath
) {
  const importedPath = resolve(dirname(runtimeSourcePath), importSpecifier.replaceAll("\\", "/"));
  const candidatePaths = [
    importedPath,
    `${importedPath}.js`,
    `${importedPath}.json`,
    join(importedPath, "index.js"),
  ];
  return candidatePaths.find((candidatePath) => {
    const candidatePackageFile = normalizePackagePath(
      relative(repositoryLexicalPath, candidatePath)
    );
    if (!isPathWithinDirectory(candidatePath, repositoryLexicalPath)) {
      throw new Error(`Runtime entry path escapes repository: ${candidatePackageFile}`);
    }
    let candidateMetadata;
    try {
      candidateMetadata = lstatSync(candidatePath);
    } catch (filesystemError) {
      if (filesystemError?.code === "ENOENT") return false;
      throw new Error(
        `Could not inspect runtime module ${candidatePackageFile}: ${filesystemError}`
      );
    }
    if (candidateMetadata.isDirectory()) return false;
    return Boolean(
      inspectRuntimeSourcePath(
        candidatePath,
        repositoryLexicalPath,
        repositoryRealPath,
        candidatePackageFile
      )
    );
  });
}

function isStaticModuleToken(runtimeToken) {
  return Boolean(
    runtimeToken &&
    (runtimeToken.kind === SyntaxKind.StringLiteral ||
      runtimeToken.kind === SyntaxKind.NoSubstitutionTemplateLiteral)
  );
}

/**
 * Scan compiled CommonJS/ESM output for local module edges. TypeScript 7 ships its parser only
 * inside the native tsgo process, so this scanner deliberately uses TypeScript's lexical scanner:
 * comments and string contents are skipped, while the small module grammar handles static and
 * dynamic imports, export-from, and CommonJS require calls.
 */
function findRelativeRuntimeImportSpecifiers(runtimeSource) {
  const runtimeScanner = createScanner(true, LanguageVariant.Standard, runtimeSource);
  const runtimeTokens = [];
  let runtimeTokenKind;
  do {
    runtimeTokenKind = runtimeScanner.scan();
    const runtimeTokenStart = runtimeScanner.getTokenStart();
    const runtimeTokenEnd = runtimeScanner.getTokenEnd();
    runtimeTokens.push({
      kind: runtimeTokenKind,
      text: runtimeScanner.getTokenText(),
      value: runtimeScanner.getTokenValue(),
    });
    // TypeScript's scanner can return a zero-width Unknown token for a malformed regular
    // expression in generated JavaScript. Advance past it so closure validation cannot hang.
    if (runtimeTokenKind !== SyntaxKind.EndOfFile && runtimeTokenStart === runtimeTokenEnd) {
      runtimeScanner.resetTokenState(Math.min(runtimeSource.length, runtimeTokenEnd + 1));
    }
  } while (runtimeTokenKind !== SyntaxKind.EndOfFile);

  const relativeImportSpecifiers = new Set();
  const recordRelativeImport = (runtimeToken) => {
    if (isStaticModuleToken(runtimeToken) && /^\.\.?[\\/]/.test(runtimeToken.value)) {
      relativeImportSpecifiers.add(runtimeToken.value);
    }
  };
  const findStaticModuleAfterFrom = (startTokenIndex) => {
    for (let tokenIndex = startTokenIndex; tokenIndex < runtimeTokens.length; tokenIndex += 1) {
      const runtimeToken = runtimeTokens[tokenIndex];
      if (runtimeToken.kind === SyntaxKind.FromKeyword) {
        const moduleSpecifierToken = runtimeTokens[tokenIndex + 1];
        return isStaticModuleToken(moduleSpecifierToken) ? moduleSpecifierToken : undefined;
      }
      if (
        runtimeToken.kind === SyntaxKind.SemicolonToken ||
        runtimeToken.kind === SyntaxKind.EndOfFile ||
        (runtimeToken.kind === SyntaxKind.CloseBraceToken &&
          runtimeTokens[tokenIndex + 1]?.kind !== SyntaxKind.FromKeyword)
      ) {
        return undefined;
      }
    }
    return undefined;
  };

  for (let tokenIndex = 0; tokenIndex < runtimeTokens.length; tokenIndex += 1) {
    const runtimeToken = runtimeTokens[tokenIndex];
    const followingToken = runtimeTokens[tokenIndex + 1];
    if (runtimeToken.kind === SyntaxKind.ImportKeyword) {
      if (followingToken?.kind === SyntaxKind.OpenParenToken) {
        recordRelativeImport(runtimeTokens[tokenIndex + 2]);
      } else if (isStaticModuleToken(followingToken)) {
        recordRelativeImport(followingToken);
      } else {
        recordRelativeImport(findStaticModuleAfterFrom(tokenIndex + 1));
      }
    } else if (runtimeToken.kind === SyntaxKind.ExportKeyword) {
      recordRelativeImport(findStaticModuleAfterFrom(tokenIndex + 1));
    } else if (
      runtimeToken.kind === SyntaxKind.RequireKeyword &&
      runtimeTokens[tokenIndex - 1]?.kind !== SyntaxKind.DotToken &&
      followingToken?.kind === SyntaxKind.OpenParenToken
    ) {
      recordRelativeImport(followingToken && runtimeTokens[tokenIndex + 2]);
    }
  }
  return [...relativeImportSpecifiers];
}

/**
 * Return all local compiled runtime modules reachable from the package entry points.
 * Missing source modules are reported too; otherwise a broken allowlist can look valid.
 */
export function collectRuntimeEntryClosure(
  repositoryDirectory = process.cwd(),
  runtimeEntryPackageFilePaths = runtimeEntryPackageFiles
) {
  const repositoryLexicalPath = resolve(repositoryDirectory);
  let repositoryRealPath;
  try {
    repositoryRealPath = realpathSync(repositoryLexicalPath);
  } catch (filesystemError) {
    throw new Error(`Could not resolve runtime repository: ${filesystemError}`);
  }
  const expectedRuntimePackageFiles = new Set();
  const visitedRuntimeSourcePaths = new Set();
  const pendingRuntimeSourcePaths = runtimeEntryPackageFilePaths.map((runtimeEntryPackageFile) =>
    resolve(repositoryLexicalPath, normalizePackagePath(runtimeEntryPackageFile))
  );

  while (pendingRuntimeSourcePaths.length > 0) {
    const runtimeSourcePath = pendingRuntimeSourcePaths.pop();
    if (!runtimeSourcePath || visitedRuntimeSourcePaths.has(runtimeSourcePath)) {
      continue;
    }

    const runtimePackageFile = normalizePackagePath(
      relative(repositoryLexicalPath, runtimeSourcePath)
    );
    const runtimeSourceMetadata = inspectRuntimeSourcePath(
      runtimeSourcePath,
      repositoryLexicalPath,
      repositoryRealPath,
      runtimePackageFile
    );
    visitedRuntimeSourcePaths.add(runtimeSourcePath);
    expectedRuntimePackageFiles.add(runtimePackageFile);
    if (!runtimeSourceMetadata) {
      throw new Error(`Runtime entry imports missing compiled module: ${runtimePackageFile}`);
    }

    const runtimeSourceBytes = readFileSync(runtimeSourcePath);
    if (runtimeSourceBytes.length > maxRuntimeSourceBytes) {
      throw new Error(
        `Runtime source exceeds the maximum size of ${maxRuntimeSourceBytes} bytes: ${runtimePackageFile}`
      );
    }
    const runtimeSource = runtimeSourceBytes.toString("utf8");
    for (const importSpecifier of findRelativeRuntimeImportSpecifiers(runtimeSource)) {
      const importedRuntimeSourcePath = resolveRuntimeImportPath(
        runtimeSourcePath,
        importSpecifier,
        repositoryLexicalPath,
        repositoryRealPath
      );
      if (!importedRuntimeSourcePath) {
        throw new Error(
          `Runtime entry imports missing compiled module: ${normalizePackagePath(
            relative(repositoryLexicalPath, resolve(dirname(runtimeSourcePath), importSpecifier))
          )}`
        );
      }
      if (importedRuntimeSourcePath.endsWith(".js")) {
        pendingRuntimeSourcePaths.push(importedRuntimeSourcePath);
      }
      expectedRuntimePackageFiles.add(
        normalizePackagePath(relative(repositoryLexicalPath, importedRuntimeSourcePath))
      );
    }
  }
  return [...expectedRuntimePackageFiles].sort();
}

export function validateRuntimeEntryClosure(
  repositoryDirectory,
  packagedFiles,
  runtimeEntryPackageFilePaths = runtimeEntryPackageFiles
) {
  const packagedFileSet = new Set(packagedFiles.map(normalizePackagePath));
  const runtimeEntryClosure = collectRuntimeEntryClosure(
    repositoryDirectory,
    runtimeEntryPackageFilePaths
  );
  const missingRuntimePackageFiles = runtimeEntryClosure.filter(
    (runtimePackageFile) => !packagedFileSet.has(runtimePackageFile)
  );
  if (missingRuntimePackageFiles.length > 0) {
    throw new Error(
      `VSIX omits runtime modules imported by its entry points:\n${missingRuntimePackageFiles.join("\n")}`
    );
  }
  return runtimeEntryClosure;
}
