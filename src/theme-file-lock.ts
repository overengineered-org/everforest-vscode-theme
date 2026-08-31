import { randomUUID } from "node:crypto";
import { constants as fileSystemConstants } from "node:fs";
import { lstat, mkdir, open, rename, rmdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

const defaultLockRetryLimit = 40;
const defaultLockRetryDelayMilliseconds = 25;
const defaultMetadataInitializationGraceMilliseconds = 5_000;
const defaultMinimumStaleLockAgeMilliseconds = 60_000;
const ownerTokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumOwnerMetadataBytes = 64 * 1024;
const readOnlyNoFollowFlags =
  fileSystemConstants.O_RDONLY |
  (fileSystemConstants.O_NOFOLLOW ?? 0) |
  (fileSystemConstants.O_NONBLOCK ?? 0);
const exclusiveWriteNoFollowFlags =
  fileSystemConstants.O_WRONLY |
  fileSystemConstants.O_CREAT |
  fileSystemConstants.O_EXCL |
  (fileSystemConstants.O_NOFOLLOW ?? 0);

interface ThemeFileLockOwnerRecord {
  ownerToken: string;
  ownerProcessId: number;
  createdAtMilliseconds: number;
}

interface ThemeFileLockFileStats {
  mtimeMs: number;
  dev?: number;
  ino?: number;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
  isFile?(): boolean;
}

interface ThemeFileLockMetadataHandle {
  writeFile(lockContents: string, encoding: "utf8"): Promise<void>;
  read?(
    buffer: Buffer,
    offset: number,
    length: number,
    position: number | null
  ): Promise<{ bytesRead: number }>;
  stat?(): Promise<ThemeFileLockFileStats>;
  sync?(): Promise<void>;
  close(): Promise<void>;
}

type ThemeFileLockRecoveryResult = "recovered" | "busy-initializing" | "busy";

export interface ThemeFileLockLease {
  readonly ownerToken: string;
  release(): Promise<void>;
}

export interface ThemeFileLockFileSystem {
  mkdir(lockDirectoryPath: string): Promise<void>;
  open(
    lockMetadataPath: string,
    flags: string | number,
    mode?: number
  ): Promise<ThemeFileLockMetadataHandle>;
  lstat(lockPath: string): Promise<ThemeFileLockFileStats>;
  rename(sourcePath: string, destinationPath: string): Promise<void>;
  unlink(lockMetadataPath: string): Promise<void>;
  rmdir(lockDirectoryPath: string): Promise<void>;
}

export interface ThemeFileLockOptions {
  fileSystem?: ThemeFileLockFileSystem;
  ownerProcessId?: number;
  ownerToken?: string;
  createOwnerToken?: () => string;
  now?: () => number;
  sleep?: (delayMilliseconds: number) => Promise<void>;
  isProcessAlive?: (processId: number) => boolean;
  retryLimit?: number;
  retryDelayMilliseconds?: number;
  metadataInitializationGraceMilliseconds?: number;
  minimumStaleLockAgeMilliseconds?: number;
}

function createDefaultFileSystem(): ThemeFileLockFileSystem {
  return {
    mkdir: async (lockDirectoryPath) => {
      await mkdir(lockDirectoryPath);
    },
    open: async (lockMetadataPath, flags, mode) => {
      const lockMetadataHandle = await open(lockMetadataPath, flags, mode);
      return {
        writeFile: async (lockContents, encoding) => {
          await lockMetadataHandle.writeFile(lockContents, encoding);
        },
        read: async (buffer, offset, length, position) =>
          lockMetadataHandle.read(buffer, offset, length, position),
        stat: async () => lockMetadataHandle.stat(),
        sync: async () => {
          await lockMetadataHandle.sync();
        },
        close: async () => {
          await lockMetadataHandle.close();
        },
      };
    },
    lstat,
    rename,
    unlink,
    rmdir,
  };
}

function hasErrorCode(lockError: unknown, expectedErrorCode: string): boolean {
  return (
    typeof lockError === "object" &&
    lockError !== null &&
    "code" in lockError &&
    lockError.code === expectedErrorCode
  );
}

function isValidOwnerToken(ownerToken: unknown): ownerToken is string {
  return typeof ownerToken === "string" && ownerTokenPattern.test(ownerToken);
}

function isValidOwnerRecord(lockOwnerRecord: unknown): lockOwnerRecord is ThemeFileLockOwnerRecord {
  if (typeof lockOwnerRecord !== "object" || lockOwnerRecord === null) return false;
  const ownerRecordProperties = lockOwnerRecord as Record<string, unknown>;
  if (
    !Object.hasOwn(ownerRecordProperties, "ownerToken") ||
    !Object.hasOwn(ownerRecordProperties, "ownerProcessId") ||
    !Object.hasOwn(ownerRecordProperties, "createdAtMilliseconds")
  ) {
    return false;
  }
  if (Object.keys(ownerRecordProperties).length !== 3) return false;
  return (
    isValidOwnerToken(ownerRecordProperties.ownerToken) &&
    typeof ownerRecordProperties.ownerProcessId === "number" &&
    Number.isSafeInteger(ownerRecordProperties.ownerProcessId) &&
    ownerRecordProperties.ownerProcessId > 0 &&
    typeof ownerRecordProperties.createdAtMilliseconds === "number" &&
    Number.isFinite(ownerRecordProperties.createdAtMilliseconds) &&
    ownerRecordProperties.createdAtMilliseconds >= 0
  );
}

function isRegularLockFile(lockFileStats: ThemeFileLockFileStats): boolean {
  return (
    !lockFileStats.isDirectory() &&
    (typeof lockFileStats.isFile !== "function" || lockFileStats.isFile())
  );
}

function lockDirectoryIdentityMatches(
  originalLockDirectoryStats: ThemeFileLockFileStats,
  currentLockDirectoryStats: ThemeFileLockFileStats
): boolean {
  const originalIdentityAvailable =
    typeof originalLockDirectoryStats.dev === "number" &&
    typeof originalLockDirectoryStats.ino === "number";
  const currentIdentityAvailable =
    typeof currentLockDirectoryStats.dev === "number" &&
    typeof currentLockDirectoryStats.ino === "number";
  if (originalIdentityAvailable !== currentIdentityAvailable) return false;
  if (!originalIdentityAvailable || !currentIdentityAvailable) return true;
  return (
    originalLockDirectoryStats.dev === currentLockDirectoryStats.dev &&
    originalLockDirectoryStats.ino === currentLockDirectoryStats.ino
  );
}

async function readBoundedLockMetadata(
  fileSystem: ThemeFileLockFileSystem,
  lockMetadataPath: string
): Promise<string | undefined> {
  let metadataStats: ThemeFileLockFileStats;
  try {
    metadataStats = await fileSystem.lstat(lockMetadataPath);
  } catch (metadataStatError) {
    if (hasErrorCode(metadataStatError, "ENOENT")) return undefined;
    throw metadataStatError;
  }
  if (metadataStats.isSymbolicLink() || !isRegularLockFile(metadataStats)) return undefined;

  let metadataHandle: ThemeFileLockMetadataHandle;
  try {
    metadataHandle = await fileSystem.open(lockMetadataPath, readOnlyNoFollowFlags);
  } catch (metadataOpenError) {
    // A concurrent release can remove the lock directory after lstat but
    // before open. The owner disappeared; acquisition should retry.
    if (hasErrorCode(metadataOpenError, "ENOENT")) return undefined;
    throw metadataOpenError;
  }
  try {
    const openedMetadataStats = await metadataHandle.stat?.();
    if (openedMetadataStats) {
      if (openedMetadataStats.isSymbolicLink() || !isRegularLockFile(openedMetadataStats)) {
        return undefined;
      }
    }
    if (!metadataHandle.read) throw new Error("Theme file lock adapter must support bounded reads");
    const metadataBuffer = Buffer.alloc(maximumOwnerMetadataBytes + 1);
    let metadataBytesRead = 0;
    while (metadataBytesRead <= maximumOwnerMetadataBytes) {
      const readResult = await metadataHandle.read(
        metadataBuffer,
        metadataBytesRead,
        maximumOwnerMetadataBytes + 1 - metadataBytesRead,
        null
      );
      metadataBytesRead += readResult.bytesRead;
      if (readResult.bytesRead === 0) break;
    }
    if (metadataBytesRead > maximumOwnerMetadataBytes) {
      throw new Error(`Theme file lock metadata exceeds ${maximumOwnerMetadataBytes} bytes`);
    }
    return metadataBuffer.subarray(0, metadataBytesRead).toString("utf8");
  } finally {
    await metadataHandle.close();
  }
}

function ownerRecordsMatch(
  firstOwnerRecord: ThemeFileLockOwnerRecord,
  secondOwnerRecord: ThemeFileLockOwnerRecord
): boolean {
  return (
    firstOwnerRecord.ownerToken === secondOwnerRecord.ownerToken &&
    firstOwnerRecord.ownerProcessId === secondOwnerRecord.ownerProcessId &&
    firstOwnerRecord.createdAtMilliseconds === secondOwnerRecord.createdAtMilliseconds
  );
}

function defaultIsProcessAlive(processId: number): boolean {
  try {
    process.kill(processId, 0);
    return true;
  } catch (processError) {
    return hasErrorCode(processError, "EPERM");
  }
}

async function defaultSleep(delayMilliseconds: number): Promise<void> {
  await new Promise<void>((resolveSleep) => setTimeout(resolveSleep, delayMilliseconds));
}

function createQuarantinePath(lockPath: string, quarantinePurpose: string): string {
  return `${lockPath}.${quarantinePurpose}-${randomUUID()}`;
}

/**
 * Writers share this directory lock; VS Code readers cannot participate, so
 * the two theme JSON files are never reader-atomic. A dead PID is reclaimed
 * only after the age limit, which conservatively limits PID reuse risk. A
 * live PID is never stolen because this lock cannot prove process identity.
 */
export function createThemeFileLock(lockPath: string, options: ThemeFileLockOptions = {}) {
  const fileSystem = options.fileSystem ?? createDefaultFileSystem();
  const ownerProcessId = options.ownerProcessId ?? process.pid;
  const createOwnerToken = options.createOwnerToken ?? (() => options.ownerToken ?? randomUUID());
  const readCurrentTimeMilliseconds = options.now ?? Date.now;
  const waitBeforeRetry = options.sleep ?? defaultSleep;
  const isProcessAlive = options.isProcessAlive ?? defaultIsProcessAlive;
  const retryLimit = options.retryLimit ?? defaultLockRetryLimit;
  const retryDelayMilliseconds =
    options.retryDelayMilliseconds ?? defaultLockRetryDelayMilliseconds;
  const metadataInitializationGraceMilliseconds =
    options.metadataInitializationGraceMilliseconds ??
    defaultMetadataInitializationGraceMilliseconds;
  const minimumStaleLockAgeMilliseconds =
    options.minimumStaleLockAgeMilliseconds ?? defaultMinimumStaleLockAgeMilliseconds;
  const lockParentPath = dirname(lockPath);
  const lockMetadataPath = join(lockPath, "owner.json");

  if (!Number.isSafeInteger(retryLimit) || retryLimit < 0) {
    throw new Error("Theme file lock retry limit must be a non-negative integer");
  }
  if (!Number.isSafeInteger(ownerProcessId) || ownerProcessId <= 0) {
    throw new Error("Theme file lock owner process ID must be a positive integer");
  }
  if (
    !Number.isFinite(metadataInitializationGraceMilliseconds) ||
    metadataInitializationGraceMilliseconds < 0 ||
    !Number.isFinite(minimumStaleLockAgeMilliseconds) ||
    minimumStaleLockAgeMilliseconds < metadataInitializationGraceMilliseconds
  ) {
    throw new Error("Theme file lock age limits are invalid");
  }
  if (!Number.isFinite(retryDelayMilliseconds) || retryDelayMilliseconds < 0) {
    throw new Error("Theme file lock retry delay must be non-negative");
  }

  async function assertLockParentDirectory(): Promise<void> {
    const parentStats = await fileSystem.lstat(lockParentPath);
    if (parentStats.isSymbolicLink() || !parentStats.isDirectory()) {
      throw new Error(`Theme file lock parent must be a directory: ${lockParentPath}`);
    }
  }

  async function readOwnerRecord(
    ownerMetadataPath = lockMetadataPath
  ): Promise<ThemeFileLockOwnerRecord | undefined> {
    const lockContents = await readBoundedLockMetadata(fileSystem, ownerMetadataPath);
    if (lockContents === undefined) return undefined;

    try {
      const parsedLockOwner = JSON.parse(lockContents) as unknown;
      return isValidOwnerRecord(parsedLockOwner) ? parsedLockOwner : undefined;
    } catch {
      return undefined;
    }
  }

  async function readLockDirectoryStats(): Promise<ThemeFileLockFileStats | undefined> {
    try {
      const lockDirectoryStats = await fileSystem.lstat(lockPath);
      if (lockDirectoryStats.isSymbolicLink() || !lockDirectoryStats.isDirectory())
        return undefined;
      return lockDirectoryStats;
    } catch (lockDirectoryStatError) {
      if (hasErrorCode(lockDirectoryStatError, "ENOENT")) return undefined;
      throw lockDirectoryStatError;
    }
  }

  async function verifyLockDirectoryReservation(
    reservedLockDirectoryStats: ThemeFileLockFileStats
  ): Promise<void> {
    const currentLockDirectoryStats = await readLockDirectoryStats();
    if (
      !currentLockDirectoryStats ||
      !lockDirectoryIdentityMatches(reservedLockDirectoryStats, currentLockDirectoryStats)
    ) {
      throw new Error("Theme file lock reservation was replaced before metadata creation");
    }
  }

  async function restoreQuarantinedLockIfUnclaimed(quarantineLockPath: string): Promise<void> {
    try {
      const quarantineStats = await fileSystem.lstat(quarantineLockPath);
      if (quarantineStats.isSymbolicLink() || !quarantineStats.isDirectory()) return;
      const currentLockStats = await fileSystem.lstat(lockPath);
      if (currentLockStats.isSymbolicLink() || !currentLockStats.isDirectory()) return;
      return;
    } catch (lockStatError) {
      if (hasErrorCode(lockStatError, "ENOENT")) {
        // A missing canonical path is the only safe case for restoring the
        // quarantined directory. A missing quarantine itself is already gone.
        try {
          await fileSystem.lstat(quarantineLockPath);
        } catch (quarantineStatError) {
          if (hasErrorCode(quarantineStatError, "ENOENT")) return;
          throw quarantineStatError;
        }
      } else {
        throw lockStatError;
      }
    }
    try {
      await fileSystem.rename(quarantineLockPath, lockPath);
    } catch (restoreError) {
      // A new owner may have acquired the canonical path before restoration.
      if (!hasErrorCode(restoreError, "EEXIST") && !hasErrorCode(restoreError, "ENOENT")) {
        throw restoreError;
      }
    }
  }

  function isWithinInitializationGrace(lockDirectoryStats: ThemeFileLockFileStats): boolean {
    const lockDirectoryAgeMilliseconds = readCurrentTimeMilliseconds() - lockDirectoryStats.mtimeMs;
    return (
      !Number.isFinite(lockDirectoryAgeMilliseconds) ||
      lockDirectoryAgeMilliseconds < metadataInitializationGraceMilliseconds
    );
  }

  function isOldEnoughToRecover(ownerRecord: ThemeFileLockOwnerRecord): boolean {
    const ownerRecordAgeMilliseconds =
      readCurrentTimeMilliseconds() - ownerRecord.createdAtMilliseconds;
    return (
      Number.isFinite(ownerRecordAgeMilliseconds) &&
      ownerRecordAgeMilliseconds >= minimumStaleLockAgeMilliseconds
    );
  }

  async function removeQuarantinedLock(
    quarantineLockPath: string,
    expectedOwnerRecord: ThemeFileLockOwnerRecord
  ): Promise<boolean> {
    let quarantineStats: ThemeFileLockFileStats;
    try {
      quarantineStats = await fileSystem.lstat(quarantineLockPath);
    } catch (quarantineStatError) {
      if (hasErrorCode(quarantineStatError, "ENOENT")) return true;
      throw quarantineStatError;
    }
    if (quarantineStats.isSymbolicLink() || !quarantineStats.isDirectory()) return false;
    const quarantinedOwnerRecord = await readOwnerRecord(join(quarantineLockPath, "owner.json"));
    if (
      !quarantinedOwnerRecord ||
      !ownerRecordsMatch(quarantinedOwnerRecord, expectedOwnerRecord)
    ) {
      await restoreQuarantinedLockIfUnclaimed(quarantineLockPath);
      return false;
    }
    if (isProcessAlive(quarantinedOwnerRecord.ownerProcessId)) {
      await restoreQuarantinedLockIfUnclaimed(quarantineLockPath);
      return false;
    }
    try {
      await fileSystem.unlink(join(quarantineLockPath, "owner.json"));
      await fileSystem.rmdir(quarantineLockPath);
    } catch (quarantineCleanupError) {
      if (hasErrorCode(quarantineCleanupError, "ENOENT")) return true;
      await restoreQuarantinedLockIfUnclaimed(quarantineLockPath);
      throw quarantineCleanupError;
    }
    return true;
  }

  async function reclaimIncompleteInitialization(
    lockDirectoryStats: ThemeFileLockFileStats
  ): Promise<boolean> {
    const quarantineLockPath = createQuarantinePath(lockPath, "incomplete");
    try {
      await fileSystem.rename(lockPath, quarantineLockPath);
    } catch (quarantineError) {
      return hasErrorCode(quarantineError, "ENOENT");
    }

    const quarantineOwnerMetadataPath = join(quarantineLockPath, "owner.json");
    let quarantineStats: ThemeFileLockFileStats;
    try {
      quarantineStats = await fileSystem.lstat(quarantineLockPath);
    } catch (quarantineStatError) {
      if (hasErrorCode(quarantineStatError, "ENOENT")) return true;
      throw quarantineStatError;
    }
    if (quarantineStats.isSymbolicLink() || !quarantineStats.isDirectory()) return false;
    const firstOwnerRecord = await readOwnerRecord(quarantineOwnerMetadataPath);
    if (firstOwnerRecord) {
      if (
        isOldEnoughToRecover(firstOwnerRecord) &&
        !isProcessAlive(firstOwnerRecord.ownerProcessId)
      ) {
        return removeQuarantinedLock(quarantineLockPath, firstOwnerRecord);
      }
      await restoreQuarantinedLockIfUnclaimed(quarantineLockPath);
      return false;
    }

    // A writer may still be finishing its metadata write after the rename.
    // Re-read both metadata and directory mtime before removing an incomplete
    // initialization; malformed metadata is never treated as an owner.
    const secondOwnerRecord = await readOwnerRecord(quarantineOwnerMetadataPath);
    let latestQuarantineStats: ThemeFileLockFileStats;
    try {
      latestQuarantineStats = await fileSystem.lstat(quarantineLockPath);
    } catch (quarantineStatError) {
      if (hasErrorCode(quarantineStatError, "ENOENT")) return true;
      throw quarantineStatError;
    }
    if (latestQuarantineStats.isSymbolicLink() || !latestQuarantineStats.isDirectory()) {
      return false;
    }
    if (
      secondOwnerRecord ||
      latestQuarantineStats.mtimeMs !== quarantineStats.mtimeMs ||
      latestQuarantineStats.mtimeMs !== lockDirectoryStats.mtimeMs
    ) {
      await restoreQuarantinedLockIfUnclaimed(quarantineLockPath);
      return false;
    }

    const quarantineMetadataStats = await fileSystem
      .lstat(quarantineOwnerMetadataPath)
      .catch((metadataStatError: unknown) => {
        if (hasErrorCode(metadataStatError, "ENOENT")) return undefined;
        throw metadataStatError;
      });
    if (quarantineMetadataStats?.isSymbolicLink()) {
      await restoreQuarantinedLockIfUnclaimed(quarantineLockPath);
      return false;
    }
    try {
      if (quarantineMetadataStats) await fileSystem.unlink(quarantineOwnerMetadataPath);
      await fileSystem.rmdir(quarantineLockPath);
    } catch (incompleteCleanupError) {
      await restoreQuarantinedLockIfUnclaimed(quarantineLockPath);
      throw incompleteCleanupError;
    }
    return true;
  }

  async function recoverDeadOwnerLock(): Promise<ThemeFileLockRecoveryResult> {
    const lockDirectoryStats = await readLockDirectoryStats();
    if (!lockDirectoryStats) return "busy";
    const existingLockOwner = await readOwnerRecord();
    if (!existingLockOwner) {
      // Metadata can be absent/partial while the mkdir owner initializes. A
      // generous grace prevents immediate stealing; after it, quarantine and
      // re-check the directory before removing only an incomplete owner.json.
      if (isWithinInitializationGrace(lockDirectoryStats)) return "busy-initializing";
      return (await reclaimIncompleteInitialization(lockDirectoryStats)) ? "recovered" : "busy";
    }
    if (!isOldEnoughToRecover(existingLockOwner)) return "busy";
    if (isProcessAlive(existingLockOwner.ownerProcessId)) return "busy";

    const quarantineLockPath = createQuarantinePath(lockPath, "stale");
    try {
      await fileSystem.rename(lockPath, quarantineLockPath);
    } catch (quarantineError) {
      if (hasErrorCode(quarantineError, "ENOENT")) return "recovered";
      return "busy";
    }
    return (await removeQuarantinedLock(quarantineLockPath, existingLockOwner))
      ? "recovered"
      : "busy";
  }

  async function releaseOwnedLock(ownerRecord: ThemeFileLockOwnerRecord): Promise<void> {
    const existingLockOwner = await readOwnerRecord();
    if (!existingLockOwner || !ownerRecordsMatch(existingLockOwner, ownerRecord)) return;

    const quarantineLockPath = createQuarantinePath(lockPath, "release");
    try {
      await fileSystem.rename(lockPath, quarantineLockPath);
    } catch (releaseError) {
      if (hasErrorCode(releaseError, "ENOENT")) return;
      throw releaseError;
    }
    const quarantinedOwnerRecord = await readOwnerRecord(join(quarantineLockPath, "owner.json"));
    if (!quarantinedOwnerRecord || !ownerRecordsMatch(quarantinedOwnerRecord, ownerRecord)) {
      await restoreQuarantinedLockIfUnclaimed(quarantineLockPath);
      return;
    }
    await fileSystem.unlink(join(quarantineLockPath, "owner.json"));
    await fileSystem.rmdir(quarantineLockPath);
  }

  async function verifyPublishedLockReservation(
    reservedLockDirectoryStats: ThemeFileLockFileStats,
    expectedOwnerRecord: ThemeFileLockOwnerRecord
  ): Promise<void> {
    const currentLockDirectoryStats = await readLockDirectoryStats();
    if (
      !currentLockDirectoryStats ||
      !lockDirectoryIdentityMatches(reservedLockDirectoryStats, currentLockDirectoryStats)
    ) {
      throw new Error("Theme file lock reservation was replaced before publication completed");
    }
    const currentOwnerRecord = await readOwnerRecord();
    if (!currentOwnerRecord || !ownerRecordsMatch(currentOwnerRecord, expectedOwnerRecord)) {
      throw new Error("Theme file lock owner changed before publication completed");
    }
  }

  async function acquire(): Promise<ThemeFileLockLease> {
    const ownerToken = createOwnerToken();
    if (!isValidOwnerToken(ownerToken)) {
      throw new Error("Theme file lock owner token must be a UUID v4");
    }
    const ownerRecord: ThemeFileLockOwnerRecord = {
      ownerToken,
      ownerProcessId,
      createdAtMilliseconds: readCurrentTimeMilliseconds(),
    };
    if (
      !Number.isFinite(ownerRecord.createdAtMilliseconds) ||
      ownerRecord.createdAtMilliseconds < 0
    ) {
      throw new Error("Theme file lock clock must return a non-negative time");
    }

    let staleRecoveryCount = 0;
    const maximumStaleRecoveryCount = retryLimit + 1;
    for (let retryAttempt = 0; retryAttempt <= retryLimit; retryAttempt += 1) {
      try {
        await assertLockParentDirectory();
        await fileSystem.mkdir(lockPath);
        await assertLockParentDirectory();
        const reservedLockDirectoryStats = await readLockDirectoryStats();
        if (!reservedLockDirectoryStats) {
          throw new Error("Theme file lock directory disappeared during acquisition");
        }
        await verifyLockDirectoryReservation(reservedLockDirectoryStats);
        const metadataHandle = await fileSystem.open(
          lockMetadataPath,
          exclusiveWriteNoFollowFlags,
          0o600
        );
        try {
          const metadataStats = await metadataHandle.stat?.();
          if (metadataStats && !isRegularLockFile(metadataStats)) {
            throw new Error("Theme file lock metadata must be a regular file");
          }
          await metadataHandle.writeFile(JSON.stringify(ownerRecord), "utf8");
          await metadataHandle.sync?.();
        } finally {
          await metadataHandle.close();
        }
        await verifyPublishedLockReservation(reservedLockDirectoryStats, ownerRecord);
        let releasePromise: Promise<void> | undefined;
        return {
          ownerToken,
          release: () => (releasePromise ??= releaseOwnedLock(ownerRecord)),
        };
      } catch (lockAcquireError) {
        if (!hasErrorCode(lockAcquireError, "EEXIST")) throw lockAcquireError;
      }

      if ((await recoverDeadOwnerLock()) === "recovered") {
        staleRecoveryCount += 1;
        if (staleRecoveryCount > maximumStaleRecoveryCount) {
          throw new Error(
            `Timed out acquiring theme file lock after ${retryLimit + 1} attempts: ${lockPath}`
          );
        }
        // Recovered stale directories do not consume a timed wait, but the
        // separate recovery budget keeps an adversary from extending this loop.
        retryAttempt -= 1;
        continue;
      }
      if (retryAttempt === retryLimit) {
        throw new Error(
          `Timed out acquiring theme file lock after ${retryLimit + 1} attempts: ${lockPath}`
        );
      }
      await waitBeforeRetry(retryDelayMilliseconds);
    }

    throw new Error(`Theme file lock acquisition failed: ${lockPath}`);
  }

  return { acquire };
}
