import { randomUUID } from "node:crypto";
import { constants as fileSystemConstants } from "node:fs";
import { lstat, open, rename, rmdir, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

const transactionJournalVersion = 2;
const transactionPhases = [
  "preparing",
  "prepared",
  "dark-replaced",
  "committed",
  "rolled-back",
] as const;
type ThemeFileTransactionPhase = (typeof transactionPhases)[number];
const transactionTokenPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fixedThemeFileNames = {
  dark: "everforest-complete-dark-color-theme.json",
  light: "everforest-complete-light-color-theme.json",
} as const;
const transactionJournalFileName = ".everforest-complete-theme.transaction.json";
const maximumThemeSourceBytes = 1 * 1024 * 1024;
const maximumTransactionJournalBytes = 64 * 1024;
const readOnlyNoFollowFlags =
  fileSystemConstants.O_RDONLY |
  (fileSystemConstants.O_NOFOLLOW ?? 0) |
  (fileSystemConstants.O_NONBLOCK ?? 0);
const exclusiveWriteNoFollowFlags =
  fileSystemConstants.O_WRONLY |
  fileSystemConstants.O_CREAT |
  fileSystemConstants.O_EXCL |
  (fileSystemConstants.O_NOFOLLOW ?? 0);

export interface ConfiguredThemeFilePaths {
  darkThemePath: string;
  lightThemePath: string;
}

export interface ConfiguredThemeFileSources {
  darkThemeSource: string;
  lightThemeSource: string;
}

export interface ThemeFileTransactionFileSystem {
  open(
    filePath: string,
    flags: string | number,
    mode?: number
  ): Promise<{
    writeFile(fileContents: string | Buffer, encoding?: "utf8"): Promise<void>;
    read?(
      buffer: Buffer,
      offset: number,
      length: number,
      position: number | null
    ): Promise<{ bytesRead: number }>;
    stat?(): Promise<ThemeFileStats>;
    chmod?(mode: number): Promise<void>;
    sync?(): Promise<void>;
    close(): Promise<void>;
  }>;
  lstat(filePath: string): Promise<ThemeFileStats>;
  rename(sourcePath: string, destinationPath: string): Promise<void>;
  unlink(filePath: string): Promise<void>;
  rmdir(directoryPath: string): Promise<void>;
}

interface ThemeFileStats {
  mode: number;
  dev?: number;
  ino?: number;
  isSymbolicLink(): boolean;
  isDirectory(): boolean;
  isFile?(): boolean;
}

interface ThemeFileIdentity {
  dev: number;
  ino: number;
}

export interface ThemeFileTransactionOptions {
  fileSystem?: ThemeFileTransactionFileSystem;
  transactionToken?: string;
}

interface ThemeFileTransactionJournal {
  journalVersion: number;
  transactionToken: string;
  phase: ThemeFileTransactionPhase;
  darkThemeExisted: boolean;
  darkThemeMode?: number;
  lightThemeExisted: boolean;
  lightThemeMode?: number;
}

interface ThemeFileTransactionArtifacts {
  journalPath: string;
  journal: ThemeFileTransactionJournal;
  darkThemeTempPath: string;
  lightThemeTempPath: string;
  darkThemeBackupPath: string;
  lightThemeBackupPath: string;
  darkThemeRestorePath: string;
  lightThemeRestorePath: string;
  journalTempPath: string;
}

function createDefaultFileSystem(): ThemeFileTransactionFileSystem {
  return {
    open: async (filePath, flags, mode) => {
      const fileHandle = await open(filePath, flags, mode);
      return {
        writeFile: async (fileContents, encoding) => {
          if (typeof fileContents === "string") {
            await fileHandle.writeFile(fileContents, encoding ?? "utf8");
          } else {
            await fileHandle.writeFile(fileContents);
          }
        },
        read: async (buffer, offset, length, position) =>
          fileHandle.read(buffer, offset, length, position),
        stat: async () => fileHandle.stat(),
        chmod: async (fileMode) => fileHandle.chmod(fileMode),
        sync: async () => fileHandle.sync(),
        close: async () => fileHandle.close(),
      };
    },
    lstat,
    rename,
    unlink,
    rmdir,
  };
}

function isFileMissingError(transactionError: unknown): boolean {
  return (
    typeof transactionError === "object" &&
    transactionError !== null &&
    "code" in transactionError &&
    transactionError.code === "ENOENT"
  );
}

function isUnsupportedSyncError(transactionError: unknown): boolean {
  return ["EINVAL", "EISDIR", "ENOTSUP", "EPERM"].some(
    (unsupportedErrorCode) =>
      typeof transactionError === "object" &&
      transactionError !== null &&
      "code" in transactionError &&
      transactionError.code === unsupportedErrorCode
  );
}

function isValidTransactionPhase(phase: unknown): phase is ThemeFileTransactionPhase {
  return (
    typeof phase === "string" && transactionPhases.includes(phase as ThemeFileTransactionPhase)
  );
}

function isPlainObject(candidateValue: unknown): candidateValue is Record<string, unknown> {
  if (typeof candidateValue !== "object" || candidateValue === null) return false;
  return Object.getPrototypeOf(candidateValue) === Object.prototype;
}

function isRegularThemeFile(fileStats: ThemeFileStats): boolean {
  return !fileStats.isDirectory() && (typeof fileStats.isFile !== "function" || fileStats.isFile());
}

interface BoundedThemeFileRead {
  fileBytes: Buffer;
  themeSource: string;
  fileStats: ThemeFileStats;
  fileIdentity?: ThemeFileIdentity;
}

function getThemeFileIdentity(fileStats: ThemeFileStats): ThemeFileIdentity | undefined {
  if (typeof fileStats.dev !== "number" || typeof fileStats.ino !== "number") return undefined;
  return { dev: fileStats.dev, ino: fileStats.ino };
}

function themeFileIdentitiesMatch(
  expectedFileIdentity: ThemeFileIdentity | undefined,
  currentFileStats: ThemeFileStats
): boolean {
  const currentFileIdentity = getThemeFileIdentity(currentFileStats);
  const expectedIdentityAvailable = expectedFileIdentity !== undefined;
  const currentIdentityAvailable = currentFileIdentity !== undefined;
  if (expectedIdentityAvailable !== currentIdentityAvailable) return false;
  if (!expectedFileIdentity || !currentFileIdentity) return true;
  return (
    expectedFileIdentity.dev === currentFileIdentity.dev &&
    expectedFileIdentity.ino === currentFileIdentity.ino
  );
}

async function readBoundedThemeFile(
  fileSystem: ThemeFileTransactionFileSystem,
  filePath: string,
  maximumBytes: number
): Promise<BoundedThemeFileRead> {
  const pathStats = await fileSystem.lstat(filePath);
  if (pathStats.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${filePath}`);
  if (!isRegularThemeFile(pathStats)) {
    throw new Error(`Theme path must be a regular file: ${filePath}`);
  }

  const fileHandle = await fileSystem.open(filePath, readOnlyNoFollowFlags);
  try {
    const openedFileStats = await fileHandle.stat?.();
    const verifiedFileStats = openedFileStats ?? pathStats;
    if (verifiedFileStats.isSymbolicLink() || !isRegularThemeFile(verifiedFileStats)) {
      throw new Error(`Theme path must be a regular file: ${filePath}`);
    }
    if (!fileHandle.read) {
      throw new Error("Theme file adapter must support bounded reads");
    }
    const fileBuffer = Buffer.alloc(maximumBytes + 1);
    let bytesRead = 0;
    while (bytesRead <= maximumBytes) {
      const readResult = await fileHandle.read(
        fileBuffer,
        bytesRead,
        maximumBytes + 1 - bytesRead,
        null
      );
      bytesRead += readResult.bytesRead;
      if (readResult.bytesRead === 0) break;
    }
    if (bytesRead > maximumBytes) {
      throw new Error(`Theme file exceeds ${maximumBytes} bytes: ${filePath}`);
    }
    const fileBytes = fileBuffer.subarray(0, bytesRead);
    return {
      fileBytes,
      themeSource: fileBytes.toString("utf8"),
      fileStats: verifiedFileStats,
      fileIdentity: getThemeFileIdentity(verifiedFileStats),
    };
  } finally {
    await fileHandle.close();
  }
}

function parseAndValidateThemeSource(themeSource: string, themePath: string): void {
  if (Buffer.byteLength(themeSource, "utf8") > maximumThemeSourceBytes) {
    throw new Error(
      `Generated theme JSON exceeds ${maximumThemeSourceBytes} bytes at ${themePath}`
    );
  }
  let parsedThemeSource: unknown;
  try {
    parsedThemeSource = JSON.parse(themeSource) as unknown;
  } catch (parseError) {
    throw new Error(`Invalid generated theme JSON at ${themePath}: ${String(parseError)}`);
  }
  if (!isPlainObject(parsedThemeSource)) {
    throw new Error(`Generated theme JSON must be a plain object at ${themePath}`);
  }
  if (!isPlainObject(parsedThemeSource.colors)) {
    throw new Error(`Generated theme JSON colors must be a plain object at ${themePath}`);
  }
  if (!Array.isArray(parsedThemeSource.tokenColors)) {
    throw new Error(`Generated theme JSON tokenColors must be an array at ${themePath}`);
  }
  if (!isPlainObject(parsedThemeSource.semanticTokenColors)) {
    throw new Error(
      `Generated theme JSON semanticTokenColors must be a plain object at ${themePath}`
    );
  }
  const expectedThemeAppearance = basename(themePath).includes("-dark-") ? "dark" : "light";
  const expectedThemeName =
    expectedThemeAppearance === "dark" ? "Everforest Complete Dark" : "Everforest Complete Light";
  if (parsedThemeSource.type !== expectedThemeAppearance) {
    throw new Error(`Generated theme JSON type must be ${expectedThemeAppearance} at ${themePath}`);
  }
  if (parsedThemeSource.name !== expectedThemeName) {
    throw new Error(`Generated theme JSON name must be ${expectedThemeName} at ${themePath}`);
  }
}

interface ThemeFilePathState {
  themeBytes: Buffer;
  existed: boolean;
  mode?: number;
}

interface CanonicalThemeFilePaths {
  themeDirectoryPath: string;
  darkThemePath: string;
  lightThemePath: string;
  journalPath: string;
}

function validateThemeFilePaths(themeFilePaths: ConfiguredThemeFilePaths): CanonicalThemeFilePaths {
  const darkThemePath = resolve(themeFilePaths.darkThemePath);
  const lightThemePath = resolve(themeFilePaths.lightThemePath);
  const themeDirectoryPath = dirname(darkThemePath);
  if (
    basename(darkThemePath) !== fixedThemeFileNames.dark ||
    basename(lightThemePath) !== fixedThemeFileNames.light ||
    dirname(lightThemePath) !== themeDirectoryPath
  ) {
    throw new Error("Configured theme files must be the fixed sibling Light/Dark theme paths");
  }
  return {
    themeDirectoryPath,
    darkThemePath,
    lightThemePath,
    journalPath: join(themeDirectoryPath, transactionJournalFileName),
  };
}

function isValidTransactionToken(transactionToken: unknown): transactionToken is string {
  return typeof transactionToken === "string" && transactionTokenPattern.test(transactionToken);
}

function createTransactionJournal(
  transactionToken: string,
  darkThemePathState: ThemeFilePathState,
  lightThemePathState: ThemeFilePathState
): ThemeFileTransactionJournal {
  return {
    journalVersion: transactionJournalVersion,
    transactionToken,
    phase: "preparing",
    darkThemeExisted: darkThemePathState.existed,
    ...(darkThemePathState.mode === undefined ? {} : { darkThemeMode: darkThemePathState.mode }),
    lightThemeExisted: lightThemePathState.existed,
    ...(lightThemePathState.mode === undefined ? {} : { lightThemeMode: lightThemePathState.mode }),
  };
}

function createTransactionArtifacts(
  canonicalThemeFilePaths: CanonicalThemeFilePaths,
  transactionJournal: ThemeFileTransactionJournal
): ThemeFileTransactionArtifacts {
  const transactionToken = transactionJournal.transactionToken;
  return {
    journalPath: canonicalThemeFilePaths.journalPath,
    journal: transactionJournal,
    darkThemeTempPath: `${canonicalThemeFilePaths.darkThemePath}.${transactionToken}.tmp`,
    lightThemeTempPath: `${canonicalThemeFilePaths.lightThemePath}.${transactionToken}.tmp`,
    darkThemeBackupPath: `${canonicalThemeFilePaths.darkThemePath}.${transactionToken}.bak`,
    lightThemeBackupPath: `${canonicalThemeFilePaths.lightThemePath}.${transactionToken}.bak`,
    darkThemeRestorePath: `${canonicalThemeFilePaths.darkThemePath}.${transactionToken}.restore`,
    lightThemeRestorePath: `${canonicalThemeFilePaths.lightThemePath}.${transactionToken}.restore`,
    journalTempPath: `${canonicalThemeFilePaths.journalPath}.${transactionToken}.tmp`,
  };
}

function isValidTransactionJournal(
  candidateJournal: unknown
): candidateJournal is ThemeFileTransactionJournal {
  if (!isPlainObject(candidateJournal)) return false;
  const journalKeys = Object.keys(candidateJournal).sort();
  const requiredJournalKeys = [
    "darkThemeExisted",
    "journalVersion",
    "lightThemeExisted",
    "phase",
    "transactionToken",
  ];
  const optionalJournalKeys = ["darkThemeMode", "lightThemeMode"];
  if (
    journalKeys.some(
      (journalKey) =>
        !requiredJournalKeys.includes(journalKey) && !optionalJournalKeys.includes(journalKey)
    ) ||
    requiredJournalKeys.some((journalKey) => !journalKeys.includes(journalKey))
  ) {
    return false;
  }
  if (
    candidateJournal.journalVersion !== transactionJournalVersion ||
    !isValidTransactionToken(candidateJournal.transactionToken) ||
    !isValidTransactionPhase(candidateJournal.phase) ||
    typeof candidateJournal.darkThemeExisted !== "boolean" ||
    typeof candidateJournal.lightThemeExisted !== "boolean"
  ) {
    return false;
  }
  if (
    candidateJournal.darkThemeMode !== undefined &&
    (typeof candidateJournal.darkThemeMode !== "number" ||
      !Number.isInteger(candidateJournal.darkThemeMode) ||
      candidateJournal.darkThemeMode < 0 ||
      candidateJournal.darkThemeMode > 0o7777)
  ) {
    return false;
  }
  if (
    candidateJournal.lightThemeMode !== undefined &&
    (typeof candidateJournal.lightThemeMode !== "number" ||
      !Number.isInteger(candidateJournal.lightThemeMode) ||
      candidateJournal.lightThemeMode < 0 ||
      candidateJournal.lightThemeMode > 0o7777)
  ) {
    return false;
  }
  if (
    (candidateJournal.darkThemeExisted && candidateJournal.darkThemeMode === undefined) ||
    (!candidateJournal.darkThemeExisted && candidateJournal.darkThemeMode !== undefined)
  ) {
    return false;
  }
  if (
    (candidateJournal.lightThemeExisted && candidateJournal.lightThemeMode === undefined) ||
    (!candidateJournal.lightThemeExisted && candidateJournal.lightThemeMode !== undefined)
  ) {
    return false;
  }
  return true;
}

async function assertNotSymbolicLink(
  fileSystem: ThemeFileTransactionFileSystem,
  filePath: string,
  allowMissing = true
): Promise<ThemeFileStats | undefined> {
  try {
    const fileStats = await fileSystem.lstat(filePath);
    if (fileStats.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${filePath}`);
    return fileStats;
  } catch (fileStatError) {
    if (allowMissing && isFileMissingError(fileStatError)) return undefined;
    throw fileStatError;
  }
}

async function readThemeFilePathState(
  fileSystem: ThemeFileTransactionFileSystem,
  themePath: string
): Promise<ThemeFilePathState> {
  const themeFileStats = await assertNotSymbolicLink(fileSystem, themePath);
  if (!themeFileStats) return { themeBytes: Buffer.alloc(0), existed: false };
  if (themeFileStats.isDirectory()) throw new Error(`Theme path must be a file: ${themePath}`);
  const boundedThemeFileRead = await readBoundedThemeFile(
    fileSystem,
    themePath,
    maximumThemeSourceBytes
  );
  return {
    themeBytes: boundedThemeFileRead.fileBytes,
    existed: true,
    mode: boundedThemeFileRead.fileStats.mode & 0o7777,
  };
}

async function writeDurableFile(
  fileSystem: ThemeFileTransactionFileSystem,
  filePath: string,
  fileContents: string | Buffer,
  fileMode: number
): Promise<void> {
  const fileHandle = await fileSystem.open(filePath, exclusiveWriteNoFollowFlags, fileMode);
  try {
    const fileStats = await fileHandle.stat?.();
    if (fileStats && !isRegularThemeFile(fileStats)) {
      throw new Error(`Theme transaction artifact must be a regular file: ${filePath}`);
    }
    await fileHandle.writeFile(fileContents, typeof fileContents === "string" ? "utf8" : undefined);
    await fileHandle.chmod?.(fileMode);
    try {
      await fileHandle.sync?.();
    } catch (fileSyncError) {
      if (!isUnsupportedSyncError(fileSyncError)) throw fileSyncError;
    }
  } finally {
    await fileHandle.close();
  }
}

async function verifyThemeArtifact(
  fileSystem: ThemeFileTransactionFileSystem,
  artifactPath: string,
  expectedThemeContents: string | Buffer,
  expectedThemeMode: number
): Promise<ThemeFileIdentity | undefined> {
  const artifactStats = await assertNotSymbolicLink(fileSystem, artifactPath);
  if (!artifactStats || artifactStats.isDirectory()) {
    throw new Error(`Missing theme transaction artifact: ${artifactPath}`);
  }
  const boundedArtifactRead = await readBoundedThemeFile(
    fileSystem,
    artifactPath,
    maximumThemeSourceBytes
  );
  const expectedThemeBytes =
    typeof expectedThemeContents === "string"
      ? Buffer.from(expectedThemeContents, "utf8")
      : expectedThemeContents;
  if (!boundedArtifactRead.fileBytes.equals(expectedThemeBytes)) {
    throw new Error(`Theme transaction artifact changed before replacement: ${artifactPath}`);
  }
  if ((boundedArtifactRead.fileStats.mode & 0o7777) !== expectedThemeMode) {
    throw new Error(`Theme transaction artifact mode changed before replacement: ${artifactPath}`);
  }
  return boundedArtifactRead.fileIdentity;
}

async function verifyPreparedThemeArtifacts(
  fileSystem: ThemeFileTransactionFileSystem,
  transactionArtifacts: ThemeFileTransactionArtifacts,
  darkThemeSource: string,
  lightThemeSource: string,
  darkThemePathState: ThemeFilePathState,
  lightThemePathState: ThemeFilePathState
): Promise<{
  darkThemeIdentity: ThemeFileIdentity | undefined;
  lightThemeIdentity: ThemeFileIdentity | undefined;
}> {
  const [darkThemeIdentity, lightThemeIdentity] = await Promise.all([
    verifyThemeArtifact(
      fileSystem,
      transactionArtifacts.darkThemeTempPath,
      darkThemeSource,
      darkThemePathState.mode ?? 0o644
    ),
    verifyThemeArtifact(
      fileSystem,
      transactionArtifacts.lightThemeTempPath,
      lightThemeSource,
      lightThemePathState.mode ?? 0o644
    ),
    darkThemePathState.existed
      ? verifyThemeArtifact(
          fileSystem,
          transactionArtifacts.darkThemeBackupPath,
          darkThemePathState.themeBytes,
          darkThemePathState.mode ?? 0o644
        )
      : Promise.resolve(),
    lightThemePathState.existed
      ? verifyThemeArtifact(
          fileSystem,
          transactionArtifacts.lightThemeBackupPath,
          lightThemePathState.themeBytes,
          lightThemePathState.mode ?? 0o644
        )
      : Promise.resolve(),
  ]);
  return { darkThemeIdentity, lightThemeIdentity };
}

async function verifyRenamedThemeArtifact(
  fileSystem: ThemeFileTransactionFileSystem,
  targetThemePath: string,
  stagedThemeIdentity: ThemeFileIdentity | undefined
): Promise<void> {
  const targetThemeStats = await assertNotSymbolicLink(fileSystem, targetThemePath, false);
  if (!targetThemeStats || !isRegularThemeFile(targetThemeStats)) {
    throw new Error(`Theme transaction target must be the staged regular file: ${targetThemePath}`);
  }
  if (!themeFileIdentitiesMatch(stagedThemeIdentity, targetThemeStats)) {
    throw new Error(
      `Theme transaction target identity changed after replacement: ${targetThemePath}`
    );
  }
}

async function syncThemeDirectory(
  fileSystem: ThemeFileTransactionFileSystem,
  themeDirectoryPath: string
): Promise<void> {
  let directoryHandle: Awaited<ReturnType<ThemeFileTransactionFileSystem["open"]>>;
  try {
    directoryHandle = await fileSystem.open(themeDirectoryPath, "r");
  } catch (directoryOpenError) {
    if (isUnsupportedSyncError(directoryOpenError)) return;
    throw directoryOpenError;
  }
  try {
    await directoryHandle.sync?.();
  } catch (directorySyncError) {
    if (!isUnsupportedSyncError(directorySyncError)) throw directorySyncError;
  } finally {
    await directoryHandle.close();
  }
}

async function removeFileIfPresent(
  fileSystem: ThemeFileTransactionFileSystem,
  filePath: string
): Promise<void> {
  const artifactStats = await assertNotSymbolicLink(fileSystem, filePath);
  if (!artifactStats) return;
  await fileSystem.unlink(filePath);
}

async function cleanupTransactionArtifacts(
  fileSystem: ThemeFileTransactionFileSystem,
  transactionArtifacts: ThemeFileTransactionArtifacts,
  includeJournal: boolean
): Promise<void> {
  const transactionArtifactPaths = [
    transactionArtifacts.darkThemeTempPath,
    transactionArtifacts.lightThemeTempPath,
    transactionArtifacts.darkThemeBackupPath,
    transactionArtifacts.lightThemeBackupPath,
    transactionArtifacts.darkThemeRestorePath,
    transactionArtifacts.lightThemeRestorePath,
    transactionArtifacts.journalTempPath,
  ];
  const cleanupResults = await Promise.allSettled(
    transactionArtifactPaths.map((artifactPath) => removeFileIfPresent(fileSystem, artifactPath))
  );
  const cleanupErrors = cleanupResults.flatMap((cleanupResult) =>
    cleanupResult.status === "rejected" ? [cleanupResult.reason] : []
  );
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "Could not clean up theme file transaction artifacts");
  }
  if (includeJournal) await removeFileIfPresent(fileSystem, transactionArtifacts.journalPath);
}

async function restoreThemeFile(
  fileSystem: ThemeFileTransactionFileSystem,
  sourceBackupPath: string,
  restoreTempPath: string,
  targetThemePath: string,
  originalThemeExisted: boolean,
  originalThemeMode: number | undefined,
  themeDirectoryPath: string
): Promise<void> {
  await assertNotSymbolicLink(fileSystem, targetThemePath);
  if (!originalThemeExisted) {
    await removeFileIfPresent(fileSystem, targetThemePath);
    return;
  }
  const backupStats = await assertNotSymbolicLink(fileSystem, sourceBackupPath);
  if (!backupStats || backupStats.isDirectory()) {
    throw new Error(`Missing theme backup: ${sourceBackupPath}`);
  }
  const boundedBackupRead = await readBoundedThemeFile(
    fileSystem,
    sourceBackupPath,
    maximumThemeSourceBytes
  );
  const backupContents = boundedBackupRead.fileBytes;
  if ((boundedBackupRead.fileStats.mode & 0o7777) !== (originalThemeMode ?? 0o644)) {
    throw new Error(`Theme backup mode changed: ${sourceBackupPath}`);
  }
  await removeFileIfPresent(fileSystem, restoreTempPath);
  await writeDurableFile(fileSystem, restoreTempPath, backupContents, originalThemeMode ?? 0o644);
  await fileSystem.rename(restoreTempPath, targetThemePath);
  await syncThemeDirectory(fileSystem, themeDirectoryPath);
}

async function rollbackThemeFilePair(
  fileSystem: ThemeFileTransactionFileSystem,
  canonicalThemeFilePaths: CanonicalThemeFilePaths,
  transactionArtifacts: ThemeFileTransactionArtifacts
): Promise<void> {
  const rollbackResults = await Promise.allSettled([
    restoreThemeFile(
      fileSystem,
      transactionArtifacts.darkThemeBackupPath,
      transactionArtifacts.darkThemeRestorePath,
      canonicalThemeFilePaths.darkThemePath,
      transactionArtifacts.journal.darkThemeExisted,
      transactionArtifacts.journal.darkThemeMode,
      canonicalThemeFilePaths.themeDirectoryPath
    ),
    restoreThemeFile(
      fileSystem,
      transactionArtifacts.lightThemeBackupPath,
      transactionArtifacts.lightThemeRestorePath,
      canonicalThemeFilePaths.lightThemePath,
      transactionArtifacts.journal.lightThemeExisted,
      transactionArtifacts.journal.lightThemeMode,
      canonicalThemeFilePaths.themeDirectoryPath
    ),
  ]);
  const rollbackErrors = rollbackResults.flatMap((rollbackResult) =>
    rollbackResult.status === "rejected" ? [rollbackResult.reason] : []
  );
  if (rollbackErrors.length > 0) {
    throw new AggregateError(rollbackErrors, "Could not roll back theme file transaction");
  }
}

async function restorePreparingThemeFilesFromBackups(
  fileSystem: ThemeFileTransactionFileSystem,
  canonicalThemeFilePaths: CanonicalThemeFilePaths,
  transactionArtifacts: ThemeFileTransactionArtifacts
): Promise<void> {
  const restorationOperations: Promise<void>[] = [];
  if (transactionArtifacts.journal.darkThemeExisted) {
    restorationOperations.push(
      restoreThemeFile(
        fileSystem,
        transactionArtifacts.darkThemeBackupPath,
        transactionArtifacts.darkThemeRestorePath,
        canonicalThemeFilePaths.darkThemePath,
        true,
        transactionArtifacts.journal.darkThemeMode,
        canonicalThemeFilePaths.themeDirectoryPath
      )
    );
  }
  if (transactionArtifacts.journal.lightThemeExisted) {
    restorationOperations.push(
      restoreThemeFile(
        fileSystem,
        transactionArtifacts.lightThemeBackupPath,
        transactionArtifacts.lightThemeRestorePath,
        canonicalThemeFilePaths.lightThemePath,
        true,
        transactionArtifacts.journal.lightThemeMode,
        canonicalThemeFilePaths.themeDirectoryPath
      )
    );
  }
  const restorationResults = await Promise.allSettled(restorationOperations);
  const restorationErrors = restorationResults.flatMap((restorationResult) =>
    restorationResult.status === "rejected" ? [restorationResult.reason] : []
  );
  if (restorationErrors.length > 0) {
    throw new AggregateError(
      restorationErrors,
      "Could not restore preparing theme file transaction"
    );
  }
}

async function recoverPreparingThemeFileTransaction(
  fileSystem: ThemeFileTransactionFileSystem,
  canonicalThemeFilePaths: CanonicalThemeFilePaths,
  transactionArtifacts: ThemeFileTransactionArtifacts
): Promise<void> {
  const [darkBackupStats, lightBackupStats] = await Promise.all([
    transactionArtifacts.journal.darkThemeExisted
      ? assertNotSymbolicLink(fileSystem, transactionArtifacts.darkThemeBackupPath)
      : Promise.resolve(undefined),
    transactionArtifacts.journal.lightThemeExisted
      ? assertNotSymbolicLink(fileSystem, transactionArtifacts.lightThemeBackupPath)
      : Promise.resolve(undefined),
  ]);
  const expectedBackupStates = [
    {
      expected: transactionArtifacts.journal.darkThemeExisted,
      stats: darkBackupStats,
    },
    {
      expected: transactionArtifacts.journal.lightThemeExisted,
      stats: lightBackupStats,
    },
  ];
  if (!expectedBackupStates.some(({ stats }) => stats !== undefined)) {
    await cleanupTransactionArtifacts(fileSystem, transactionArtifacts, true);
    return;
  }
  const missingExpectedBackup = expectedBackupStates.some(
    ({ expected, stats }) => expected && stats === undefined
  );
  if (missingExpectedBackup) {
    // Canonical files are not replaced until every backup is durable and the
    // journal advances to prepared. Partial preparation can therefore discard
    // only its private artifacts and safely let the next transaction retry.
    await cleanupTransactionArtifacts(fileSystem, transactionArtifacts, true);
    return;
  }
  await restorePreparingThemeFilesFromBackups(
    fileSystem,
    canonicalThemeFilePaths,
    transactionArtifacts
  );
  transactionArtifacts.journal.phase = "rolled-back";
  await writeTransactionJournal(fileSystem, transactionArtifacts);
  await cleanupTransactionArtifacts(fileSystem, transactionArtifacts, true);
}

async function writeTransactionJournal(
  fileSystem: ThemeFileTransactionFileSystem,
  transactionArtifacts: ThemeFileTransactionArtifacts
): Promise<void> {
  await assertNotSymbolicLink(fileSystem, transactionArtifacts.journalPath);
  await writeDurableFile(
    fileSystem,
    transactionArtifacts.journalTempPath,
    JSON.stringify(transactionArtifacts.journal),
    0o600
  );
  // Journal replacement is atomic on the same directory/filesystem. A
  // cross-device rename is intentionally not adapted because it is unsafe.
  await fileSystem.rename(transactionArtifacts.journalTempPath, transactionArtifacts.journalPath);
  await syncThemeDirectory(fileSystem, dirname(transactionArtifacts.journalPath));
}

async function readTransactionJournal(
  fileSystem: ThemeFileTransactionFileSystem,
  canonicalThemeFilePaths: CanonicalThemeFilePaths
): Promise<ThemeFileTransactionArtifacts | undefined> {
  const journalStats = await assertNotSymbolicLink(fileSystem, canonicalThemeFilePaths.journalPath);
  if (!journalStats) return undefined;
  if (journalStats.isDirectory()) throw new Error("Theme transaction journal must be a file");
  const boundedJournalRead = await readBoundedThemeFile(
    fileSystem,
    canonicalThemeFilePaths.journalPath,
    maximumTransactionJournalBytes
  );
  const journalContents = boundedJournalRead.themeSource;

  let parsedJournal: unknown;
  try {
    parsedJournal = JSON.parse(journalContents) as unknown;
  } catch (parseError) {
    throw new Error(`Invalid theme file transaction journal: ${String(parseError)}`);
  }
  if (!isValidTransactionJournal(parsedJournal)) {
    throw new Error("Invalid theme file transaction journal contents");
  }
  return createTransactionArtifacts(canonicalThemeFilePaths, parsedJournal);
}

export function defaultThemeFileTransactionJournalPath(
  themeFilePaths: ConfiguredThemeFilePaths
): string {
  const canonicalThemeFilePaths = validateThemeFilePaths(themeFilePaths);
  return canonicalThemeFilePaths.journalPath;
}

export async function replaceConfiguredThemeFiles(
  themeFilePaths: ConfiguredThemeFilePaths,
  themeFileSources: ConfiguredThemeFileSources,
  options: ThemeFileTransactionOptions = {}
): Promise<boolean> {
  const fileSystem = options.fileSystem ?? createDefaultFileSystem();
  const transactionToken = options.transactionToken ?? randomUUID();
  if (!isValidTransactionToken(transactionToken)) {
    throw new Error("Theme file transaction token must be a UUID v4");
  }
  const canonicalThemeFilePaths = validateThemeFilePaths(themeFilePaths);
  const themeDirectoryStats = await assertNotSymbolicLink(
    fileSystem,
    canonicalThemeFilePaths.themeDirectoryPath,
    false
  );
  if (!themeDirectoryStats || !themeDirectoryStats.isDirectory()) {
    throw new Error("Configured theme paths must be inside a directory");
  }
  const existingJournalStats = await assertNotSymbolicLink(
    fileSystem,
    canonicalThemeFilePaths.journalPath
  );
  if (existingJournalStats) throw new Error("Theme file transaction is already in progress");

  parseAndValidateThemeSource(
    themeFileSources.darkThemeSource,
    canonicalThemeFilePaths.darkThemePath
  );
  parseAndValidateThemeSource(
    themeFileSources.lightThemeSource,
    canonicalThemeFilePaths.lightThemePath
  );

  const [darkThemePathState, lightThemePathState] = await Promise.all([
    readThemeFilePathState(fileSystem, canonicalThemeFilePaths.darkThemePath),
    readThemeFilePathState(fileSystem, canonicalThemeFilePaths.lightThemePath),
  ]);
  if (
    darkThemePathState.existed &&
    lightThemePathState.existed &&
    darkThemePathState.themeBytes.equals(Buffer.from(themeFileSources.darkThemeSource, "utf8")) &&
    lightThemePathState.themeBytes.equals(Buffer.from(themeFileSources.lightThemeSource, "utf8"))
  ) {
    return false;
  }

  const transactionJournal = createTransactionJournal(
    transactionToken,
    darkThemePathState,
    lightThemePathState
  );
  const transactionArtifacts = createTransactionArtifacts(
    canonicalThemeFilePaths,
    transactionJournal
  );
  let transactionPrepared = false;
  let committedJournalPersisted = false;
  let stagedThemeIdentities: {
    darkThemeIdentity: ThemeFileIdentity | undefined;
    lightThemeIdentity: ThemeFileIdentity | undefined;
  } = {
    darkThemeIdentity: undefined,
    lightThemeIdentity: undefined,
  };
  try {
    await writeTransactionJournal(fileSystem, transactionArtifacts);
    await writeDurableFile(
      fileSystem,
      transactionArtifacts.darkThemeTempPath,
      themeFileSources.darkThemeSource,
      darkThemePathState.mode ?? 0o644
    );
    await writeDurableFile(
      fileSystem,
      transactionArtifacts.lightThemeTempPath,
      themeFileSources.lightThemeSource,
      lightThemePathState.mode ?? 0o644
    );
    if (darkThemePathState.existed) {
      await writeDurableFile(
        fileSystem,
        transactionArtifacts.darkThemeBackupPath,
        darkThemePathState.themeBytes,
        darkThemePathState.mode ?? 0o644
      );
    }
    if (lightThemePathState.existed) {
      await writeDurableFile(
        fileSystem,
        transactionArtifacts.lightThemeBackupPath,
        lightThemePathState.themeBytes,
        lightThemePathState.mode ?? 0o644
      );
    }
    stagedThemeIdentities = await verifyPreparedThemeArtifacts(
      fileSystem,
      transactionArtifacts,
      themeFileSources.darkThemeSource,
      themeFileSources.lightThemeSource,
      darkThemePathState,
      lightThemePathState
    );
    transactionArtifacts.journal.phase = "prepared";
    await writeTransactionJournal(fileSystem, transactionArtifacts);
    transactionPrepared = true;

    await assertNotSymbolicLink(fileSystem, canonicalThemeFilePaths.darkThemePath);
    await fileSystem.rename(
      transactionArtifacts.darkThemeTempPath,
      canonicalThemeFilePaths.darkThemePath
    );
    await verifyRenamedThemeArtifact(
      fileSystem,
      canonicalThemeFilePaths.darkThemePath,
      stagedThemeIdentities.darkThemeIdentity
    );
    await syncThemeDirectory(fileSystem, canonicalThemeFilePaths.themeDirectoryPath);
    transactionArtifacts.journal.phase = "dark-replaced";
    await writeTransactionJournal(fileSystem, transactionArtifacts);

    await assertNotSymbolicLink(fileSystem, canonicalThemeFilePaths.lightThemePath);
    await fileSystem.rename(
      transactionArtifacts.lightThemeTempPath,
      canonicalThemeFilePaths.lightThemePath
    );
    await verifyRenamedThemeArtifact(
      fileSystem,
      canonicalThemeFilePaths.lightThemePath,
      stagedThemeIdentities.lightThemeIdentity
    );
    await syncThemeDirectory(fileSystem, canonicalThemeFilePaths.themeDirectoryPath);
    transactionArtifacts.journal.phase = "committed";
    await writeTransactionJournal(fileSystem, transactionArtifacts);
    committedJournalPersisted = true;
    await cleanupTransactionArtifacts(fileSystem, transactionArtifacts, true);
    return true;
  } catch (transactionError) {
    if (committedJournalPersisted) throw transactionError;
    if (!transactionPrepared) {
      try {
        await cleanupTransactionArtifacts(fileSystem, transactionArtifacts, true);
      } catch (cleanupError) {
        throw new AggregateError(
          [transactionError, cleanupError],
          "Theme file transaction failed during preparation and cleanup"
        );
      }
      throw transactionError;
    }

    try {
      await rollbackThemeFilePair(fileSystem, canonicalThemeFilePaths, transactionArtifacts);
      transactionArtifacts.journal.phase = "rolled-back";
      await writeTransactionJournal(fileSystem, transactionArtifacts);
      await cleanupTransactionArtifacts(fileSystem, transactionArtifacts, true);
    } catch (rollbackError) {
      throw new AggregateError(
        [transactionError, rollbackError],
        "Theme file transaction failed and rollback was incomplete"
      );
    }
    throw transactionError;
  }
}

export async function recoverConfiguredThemeFileTransaction(
  themeFilePaths: ConfiguredThemeFilePaths,
  options: Pick<ThemeFileTransactionOptions, "fileSystem"> = {}
): Promise<void> {
  const fileSystem = options.fileSystem ?? createDefaultFileSystem();
  const canonicalThemeFilePaths = validateThemeFilePaths(themeFilePaths);
  const themeDirectoryStats = await assertNotSymbolicLink(
    fileSystem,
    canonicalThemeFilePaths.themeDirectoryPath,
    false
  );
  if (!themeDirectoryStats || !themeDirectoryStats.isDirectory()) {
    throw new Error("Configured theme paths must be inside a directory");
  }
  const transactionArtifacts = await readTransactionJournal(fileSystem, canonicalThemeFilePaths);
  if (!transactionArtifacts) return;

  if (transactionArtifacts.journal.phase === "preparing") {
    await recoverPreparingThemeFileTransaction(
      fileSystem,
      canonicalThemeFilePaths,
      transactionArtifacts
    );
    return;
  }
  if (
    transactionArtifacts.journal.phase === "committed" ||
    transactionArtifacts.journal.phase === "rolled-back"
  ) {
    await cleanupTransactionArtifacts(fileSystem, transactionArtifacts, true);
    return;
  }

  try {
    await rollbackThemeFilePair(fileSystem, canonicalThemeFilePaths, transactionArtifacts);
    transactionArtifacts.journal.phase = "rolled-back";
    await writeTransactionJournal(fileSystem, transactionArtifacts);
    await cleanupTransactionArtifacts(fileSystem, transactionArtifacts, true);
  } catch (recoveryError) {
    throw new AggregateError(
      [recoveryError],
      "Could not recover interrupted theme file transaction; journal preserved"
    );
  }
}
