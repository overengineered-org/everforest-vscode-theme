import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import JSZip from "jszip";
import {
  assertExtensionPackageIdentity,
  assertReleaseVersion,
  expectedReleaseArchiveFiles,
  extensionPackageName,
  extensionPackagePublisher,
  parseArchiveFileList,
  parseRawArchiveEntries,
  parseVsixIdentity,
  validateRawArchiveEntries,
} from "./package-contract.mjs";

const releaseVersion = process.argv[2];
if (process.argv[3] !== undefined) {
  throw new Error(`Unknown release verification option: ${process.argv[3]}`);
}
assertReleaseVersion(releaseVersion);

const releasePackageName = `${extensionPackageName}-${releaseVersion}.vsix`;
const releasePackagePath = resolve("dist", releasePackageName);
const releaseChecksumPath = `${releasePackagePath}.sha256`;

for (const requiredReleaseFilePath of [releasePackagePath, releaseChecksumPath]) {
  if (!existsSync(requiredReleaseFilePath)) {
    throw new Error(`Required release file not found: ${requiredReleaseFilePath}`);
  }
}

const releasePackageBytes = readFileSync(releasePackagePath);
const releasePackageDigest = createHash("sha256").update(releasePackageBytes).digest("hex");
const releaseArchiveContext = `${releasePackageName} archive`;
const expectedChecksumFileContents = `${releasePackageDigest}  ${basename(releasePackagePath)}\n`;
const checksumFileContents = readFileSync(releaseChecksumPath, "utf8");
if (checksumFileContents !== expectedChecksumFileContents) {
  throw new Error(`Release checksum does not match ${releasePackageName}`);
}
const rawReleaseArchiveEntries = parseRawArchiveEntries(releasePackageBytes, releaseArchiveContext);

let releaseArchive;
try {
  releaseArchive = await JSZip.loadAsync(releasePackageBytes, { checkCRC32: true });
} catch (archiveError) {
  throw new Error(`Release package is not a readable VSIX archive: ${archiveError}`);
}
const packagedExtensionManifestEntry = releaseArchive.file("extension/package.json");
const vsixManifestEntry = releaseArchive.file("extension.vsixmanifest");
if (!packagedExtensionManifestEntry || !vsixManifestEntry) {
  throw new Error(`${releasePackageName} does not contain required extension manifests`);
}
const releaseArchiveFiles = validateRawArchiveEntries(
  rawReleaseArchiveEntries,
  expectedReleaseArchiveFiles(),
  releaseArchiveContext
).archiveFileNames;
const indexedReleaseArchiveFiles = parseArchiveFileList(releaseArchive, releaseArchiveContext);
if (JSON.stringify(indexedReleaseArchiveFiles) !== JSON.stringify(releaseArchiveFiles)) {
  throw new Error(`${releasePackageName} archive reader changed its file list`);
}

let packagedExtensionManifest;
try {
  packagedExtensionManifest = JSON.parse(await packagedExtensionManifestEntry.async("string"));
} catch (manifestError) {
  throw new Error(`Release package contains invalid extension/package.json: ${manifestError}`);
}
assertExtensionPackageIdentity(packagedExtensionManifest, releasePackageName);
if (packagedExtensionManifest.version !== releaseVersion) {
  throw new Error(
    `${releasePackageName} contains version ${packagedExtensionManifest.version}, expected ${releaseVersion}`
  );
}

const vsixManifest = await vsixManifestEntry.async("string");
const packagedVsixIdentity = parseVsixIdentity(vsixManifest);
if (packagedVsixIdentity.attributes.Id !== extensionPackageName) {
  throw new Error(
    `${releasePackageName} contains VSIX identity Id ${packagedVsixIdentity.attributes.Id ?? "<missing>"}, expected ${extensionPackageName}`
  );
}
if (packagedVsixIdentity.attributes.Publisher !== extensionPackagePublisher) {
  throw new Error(
    `${releasePackageName} contains VSIX identity publisher ${packagedVsixIdentity.attributes.Publisher ?? "<missing>"}, expected ${extensionPackagePublisher}`
  );
}
const packagedVsixIdentityVersion = packagedVsixIdentity.attributes.Version;
if (packagedVsixIdentityVersion !== releaseVersion) {
  throw new Error(
    `${releasePackageName} contains VSIX identity version ${packagedVsixIdentityVersion}, expected ${releaseVersion}`
  );
}

console.log(`Verified exact release package ${releasePackageName} (${releasePackageDigest}).`);
