import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import JSZip from "jszip";
import vscePackage from "@vscode/vsce/out/package.js";
import {
  expectedPackagedFiles,
  expectedReleaseArchiveFiles,
  expectedWorkspacePathForArchiveFile,
  packagedPayloadMatchesWorkspaceBytes,
  parsePackageFileList,
  parseRawArchiveEntries,
  validateRuntimeEntryClosure,
  validateRawArchiveEntries,
} from "./package-contract.mjs";

const { ReadmeProcessor } = vscePackage;

async function expectedPackagedWorkspaceBytes(
  packagedArchiveFilePath,
  workspaceFileBytes,
  extensionManifest
) {
  if (packagedArchiveFilePath !== "extension/readme.md") return workspaceFileBytes;
  const readmeProcessor = new ReadmeProcessor(extensionManifest);
  const processedReadme = await readmeProcessor.onFile({
    contents: workspaceFileBytes,
    path: packagedArchiveFilePath,
  });
  return processedReadme.contents;
}

const npxExecutable = process.platform === "win32" ? "npx.cmd" : "npx";
const packagedFiles = parsePackageFileList(
  execFileSync(npxExecutable, ["--no-install", "vsce", "ls", "--no-dependencies"], {
    encoding: "utf8",
  })
);

validateRuntimeEntryClosure(process.cwd(), packagedFiles);

if (JSON.stringify(packagedFiles) !== JSON.stringify(expectedPackagedFiles)) {
  throw new Error(`Unexpected VSIX contents:\n${packagedFiles.join("\n")}`);
}

const packagedExtensionDirectory = resolve("dist");
const packagedExtensionFileNames = existsSync(packagedExtensionDirectory)
  ? readdirSync(packagedExtensionDirectory).filter((fileName) => fileName.endsWith(".vsix"))
  : [];
if (packagedExtensionFileNames.length !== 1) {
  throw new Error(
    `Expected exactly one packaged VSIX in ${packagedExtensionDirectory}, found ${packagedExtensionFileNames.length}`
  );
}
const packagedExtensionPath = resolve(packagedExtensionDirectory, packagedExtensionFileNames[0]);
const packagedExtensionBytes = readFileSync(packagedExtensionPath);
const packagedExtensionArchiveContext = `${basename(packagedExtensionPath)} package contents`;
const extensionManifest = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
let packagedExtensionArchive;
try {
  packagedExtensionArchive = await JSZip.loadAsync(packagedExtensionBytes, { checkCRC32: true });
} catch (archiveError) {
  throw new Error(`Could not read ${packagedExtensionArchiveContext}: ${archiveError}`);
}
const rawPackagedExtensionEntries = parseRawArchiveEntries(
  packagedExtensionBytes,
  packagedExtensionArchiveContext
);
const packagedArchiveFiles = validateRawArchiveEntries(
  rawPackagedExtensionEntries,
  expectedReleaseArchiveFiles(),
  packagedExtensionArchiveContext
).archiveFileNames;
for (const packagedArchiveFilePath of packagedArchiveFiles) {
  const workspaceFilePath = expectedWorkspacePathForArchiveFile(packagedArchiveFilePath);
  if (!workspaceFilePath) continue;
  if (!existsSync(workspaceFilePath)) {
    throw new Error(`Packaged VSIX is missing current workspace file: ${workspaceFilePath}`);
  }
  const packagedFileEntry = packagedExtensionArchive.file(packagedArchiveFilePath);
  if (!packagedFileEntry) {
    throw new Error(`Packaged VSIX is missing expected payload: ${packagedArchiveFilePath}`);
  }
  const packagedFileBytes = await packagedFileEntry.async("nodebuffer");
  const workspaceFileBytes = await expectedPackagedWorkspaceBytes(
    packagedArchiveFilePath,
    readFileSync(workspaceFilePath),
    extensionManifest
  );
  if (
    !packagedPayloadMatchesWorkspaceBytes(
      packagedArchiveFilePath,
      packagedFileBytes,
      workspaceFileBytes
    )
  ) {
    throw new Error(
      `Packaged VSIX payload is stale for ${workspaceFilePath} (${packagedArchiveFilePath})`
    );
  }
}

console.log(
  `Validated ${packagedFiles.length} packaged files and current payload bytes in ${basename(packagedExtensionPath)}.`
);
