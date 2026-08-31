import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
  versionVsixManifest,
} from "./package-contract.mjs";
import { createCanonicalSha256ChecksumRecord } from "./package-checksum.mjs";

const [releaseVersion, replacementOption, unexpectedOption] = process.argv.slice(2);
if (unexpectedOption !== undefined) {
  throw new Error(`Unknown release packaging option: ${unexpectedOption}`);
}
assertReleaseVersion(releaseVersion);
if (replacementOption !== undefined && replacementOption !== "--replace-source") {
  throw new Error(`Unknown release packaging option: ${replacementOption}`);
}

const replaceSourcePackage = replacementOption === "--replace-source";
const releaseDistributionDirectory = resolve("dist");
const releasePackageName = `${extensionPackageName}-${releaseVersion}.vsix`;
const releasePackagePath = resolve(releaseDistributionDirectory, releasePackageName);
const releaseChecksumPath = `${releasePackagePath}.sha256`;
const releaseOutputLockPath = resolve(releaseDistributionDirectory, `.${releasePackageName}.lock`);
if (!existsSync(releaseDistributionDirectory)) {
  throw new Error(`Expected exactly one source VSIX in ${releaseDistributionDirectory}, found 0`);
}
try {
  mkdirSync(releaseOutputLockPath);
} catch (lockError) {
  if (lockError?.code === "EEXIST") {
    throw new Error(`Release output is already being created: ${releasePackageName}`);
  }
  throw lockError;
}
const releaseOutputLockCleanup = () =>
  rmSync(releaseOutputLockPath, { force: true, recursive: true });
process.once("exit", releaseOutputLockCleanup);
process.once("SIGINT", () => {
  releaseOutputLockCleanup();
  process.exit(130);
});
process.once("SIGTERM", () => {
  releaseOutputLockCleanup();
  process.exit(143);
});
if (existsSync(releasePackagePath) || existsSync(releaseChecksumPath)) {
  throw new Error(`Release output already exists: ${releasePackageName}`);
}
const sourcePackageFileNames = readdirSync(releaseDistributionDirectory).filter(
  (fileName) => fileName.endsWith(".vsix") && fileName !== releasePackageName
);
if (sourcePackageFileNames.length !== 1) {
  throw new Error(
    `Expected exactly one source VSIX in ${releaseDistributionDirectory}, found ${sourcePackageFileNames.length}`
  );
}

const sourcePackagePath = resolve(releaseDistributionDirectory, sourcePackageFileNames[0]);
const sourcePackageChecksumPath = `${sourcePackagePath}.sha256`;
const sourcePackageMetadata = lstatSync(sourcePackagePath);
if (sourcePackageMetadata.isSymbolicLink() || !sourcePackageMetadata.isFile()) {
  throw new Error(`Source VSIX must be a regular file: ${basename(sourcePackagePath)}`);
}
if (replaceSourcePackage && existsSync(sourcePackageChecksumPath)) {
  const sourceChecksumMetadata = lstatSync(sourcePackageChecksumPath);
  if (sourceChecksumMetadata.isSymbolicLink() || !sourceChecksumMetadata.isFile()) {
    throw new Error(
      `Source checksum must be a regular file: ${basename(sourcePackageChecksumPath)}`
    );
  }
}
const sourcePackageBytes = readFileSync(sourcePackagePath);
const sourceArchiveContext = `${basename(sourcePackagePath)} source archive`;
const rawSourceArchiveEntries = parseRawArchiveEntries(sourcePackageBytes, sourceArchiveContext);
let sourcePackageArchive;
try {
  sourcePackageArchive = await JSZip.loadAsync(sourcePackageBytes, { checkCRC32: true });
} catch (archiveError) {
  throw new Error(`Could not read source VSIX ${basename(sourcePackagePath)}: ${archiveError}`);
}
const packagedExtensionManifestEntry = sourcePackageArchive.file("extension/package.json");
const vsixManifestEntry = sourcePackageArchive.file("extension.vsixmanifest");
if (!packagedExtensionManifestEntry || !vsixManifestEntry) {
  throw new Error(`${basename(sourcePackagePath)} is missing required extension manifests`);
}
const sourceArchiveFiles = validateRawArchiveEntries(
  rawSourceArchiveEntries,
  expectedReleaseArchiveFiles(),
  sourceArchiveContext
).archiveFileNames;
const indexedSourceArchiveFiles = parseArchiveFileList(sourcePackageArchive, sourceArchiveContext);
if (JSON.stringify(indexedSourceArchiveFiles) !== JSON.stringify(sourceArchiveFiles)) {
  throw new Error(`${basename(sourcePackagePath)} archive reader changed its file list`);
}

let packagedExtensionManifest;
try {
  packagedExtensionManifest = JSON.parse(await packagedExtensionManifestEntry.async("string"));
} catch (manifestError) {
  throw new Error(
    `${basename(sourcePackagePath)} contains invalid extension/package.json: ${manifestError}`
  );
}
const sourceVsixManifest = await vsixManifestEntry.async("string");
assertExtensionPackageIdentity(packagedExtensionManifest, "Source extension manifest");
const sourceVsixIdentity = parseVsixIdentity(sourceVsixManifest);
if (sourceVsixIdentity.attributes.Id !== extensionPackageName) {
  throw new Error(
    `Source VSIX identity Id ${sourceVsixIdentity.attributes.Id ?? "<missing>"} does not match ${extensionPackageName}`
  );
}
if (sourceVsixIdentity.attributes.Publisher !== extensionPackagePublisher) {
  throw new Error(
    `Source VSIX identity publisher ${sourceVsixIdentity.attributes.Publisher ?? "<missing>"} does not match ${extensionPackagePublisher}`
  );
}
packagedExtensionManifest.version = releaseVersion;
sourcePackageArchive.file(
  "extension/package.json",
  `${JSON.stringify(packagedExtensionManifest, null, 2)}\n`
);

const versionedVsixManifest = versionVsixManifest(sourceVsixManifest, releaseVersion);
sourcePackageArchive.file("extension.vsixmanifest", versionedVsixManifest);

const releasePackageBytes = await sourcePackageArchive.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 9 },
});
const releaseStagingDirectory = mkdtempSync(
  resolve(releaseDistributionDirectory, ".everforest-release-")
);
const stagedReleasePackagePath = resolve(releaseStagingDirectory, releasePackageName);
const stagedReleaseChecksumPath = resolve(releaseStagingDirectory, `${releasePackageName}.sha256`);
let releasePackageCommitted = false;
let releaseChecksumCommitted = false;
try {
  writeFileSync(stagedReleasePackagePath, releasePackageBytes);
  writeFileSync(
    stagedReleaseChecksumPath,
    createCanonicalSha256ChecksumRecord(releasePackageName, releasePackageBytes),
    "utf8"
  );
  renameSync(stagedReleasePackagePath, releasePackagePath);
  releasePackageCommitted = true;
  renameSync(stagedReleaseChecksumPath, releaseChecksumPath);
  releaseChecksumCommitted = true;
} catch (releaseCommitError) {
  if (releasePackageCommitted) rmSync(releasePackagePath, { force: true });
  if (releaseChecksumCommitted) rmSync(releaseChecksumPath, { force: true });
  throw releaseCommitError;
} finally {
  rmSync(releaseStagingDirectory, { force: true, recursive: true });
}

const releasePackageDigest = createHash("sha256").update(releasePackageBytes).digest("hex");
if (replaceSourcePackage) {
  rmSync(sourcePackageChecksumPath, { force: true });
  rmSync(sourcePackagePath, { force: true });
}

console.log(
  `Created ${releasePackageName} from ${basename(sourcePackagePath)} (${releasePackageDigest}).`
);
