import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rename,
  rm,
  rmdir,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createThemeFileLock } from "../../dist/theme-file-lock.js";

const firstOwnerToken = "11111111-1111-4111-8111-111111111111";
const secondOwnerToken = "22222222-2222-4222-8222-222222222222";
const deadOwnerToken = "33333333-3333-4333-8333-333333333333";
const liveOwnerToken = "44444444-4444-4444-8444-444444444444";

function createLockFileSystem(overrides = {}) {
  return {
    mkdir,
    open: async (filePath, flags, mode) => {
      const fileHandle = await open(filePath, flags, mode);
      return {
        writeFile: (contents, encoding) => fileHandle.writeFile(contents, encoding),
        read: (buffer, offset, length, position) =>
          fileHandle.read(buffer, offset, length, position),
        stat: () => fileHandle.stat(),
        sync: () => fileHandle.sync(),
        close: () => fileHandle.close(),
      };
    },
    readFile,
    lstat,
    rename,
    unlink,
    rmdir,
    ...overrides,
  };
}

function createLockError(message, code = "EIO") {
  const lockError = new Error(message);
  lockError.code = code;
  return lockError;
}

function createLockStats({
  directory = true,
  symbolicLink = false,
  regular = true,
  mtimeMs = 0,
} = {}) {
  return {
    mtimeMs,
    isDirectory: () => directory,
    isSymbolicLink: () => symbolicLink,
    isFile: () => regular,
  };
}

async function withTemporaryLockPath(callback) {
  const temporaryDirectoryPath = await mkdtemp(join(tmpdir(), "everforest-lock-"));
  const lockPath = join(temporaryDirectoryPath, "themes.lock");
  try {
    return await callback(lockPath, temporaryDirectoryPath);
  } finally {
    await rm(temporaryDirectoryPath, { recursive: true, force: true });
  }
}

async function writeOwnerRecord(lockPath, ownerToken, ownerProcessId, createdAtMilliseconds) {
  await mkdir(lockPath);
  await writeFile(
    join(lockPath, "owner.json"),
    JSON.stringify({ ownerToken, ownerProcessId, createdAtMilliseconds }),
    "utf8"
  );
}

test("uses an atomic lock directory and releases only its own token", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    const themeFileLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_001,
      createOwnerToken: () => firstOwnerToken,
      isProcessAlive: () => true,
      now: () => 100_000,
    });
    const themeFileLockLease = await themeFileLock.acquire();
    assert.equal((await lstat(lockPath)).isDirectory(), true);
    assert.deepEqual(JSON.parse(await readFile(join(lockPath, "owner.json"), "utf8")), {
      ownerToken: firstOwnerToken,
      ownerProcessId: 41_001,
      createdAtMilliseconds: 100_000,
    });
    await themeFileLockLease.release();
    await assert.rejects(lstat(lockPath), { code: "ENOENT" });
  });
});

test("makes lease release idempotent across a byte-identical later lease", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    const lockOptions = {
      ownerProcessId: 41_001,
      ownerToken: firstOwnerToken,
      now: () => 100_000,
    };
    const originalLease = await createThemeFileLock(lockPath, lockOptions).acquire();
    await originalLease.release();

    const laterLease = await createThemeFileLock(lockPath, lockOptions).acquire();
    await originalLease.release();
    assert.equal((await lstat(lockPath)).isDirectory(), true);
    assert.deepEqual(JSON.parse(await readFile(join(lockPath, "owner.json"), "utf8")), {
      ownerToken: firstOwnerToken,
      ownerProcessId: 41_001,
      createdAtMilliseconds: 100_000,
    });
    await laterLease.release();
  });
});

test("retries when metadata disappears between lstat and open", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    await writeOwnerRecord(lockPath, deadOwnerToken, 41_002, 0);
    let metadataRaceInjected = false;
    const disappearingMetadataFileSystem = createLockFileSystem({
      lstat: async (filePath) => {
        const fileStats = await lstat(filePath);
        if (filePath === join(lockPath, "owner.json") && !metadataRaceInjected) {
          metadataRaceInjected = true;
          await rm(lockPath, { recursive: true, force: true });
        }
        return fileStats;
      },
    });
    const lock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_003,
      ownerToken: secondOwnerToken,
      now: () => 1_000,
      retryLimit: 1,
      sleep: async () => {},
      fileSystem: disappearingMetadataFileSystem,
    });
    const lease = await lock.acquire();
    assert.equal(metadataRaceInjected, true);
    assert.equal(
      JSON.parse(await readFile(join(lockPath, "owner.json"), "utf8")).ownerToken,
      secondOwnerToken
    );
    await lease.release();
  });
});

test("does not publish metadata from a stale creator into a replacement directory", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    const baseFileSystem = createLockFileSystem();
    let canonicalStatCallCount = 0;
    let staleCreatorIdentityCheckBlocked = false;
    let replacementIdentityCheckBlocked = false;
    let staleCreatorIdentityCheckStarted;
    const staleCreatorIdentityCheck = new Promise((resolveCheckStarted) => {
      staleCreatorIdentityCheckStarted = resolveCheckStarted;
    });
    let allowStaleCreatorIdentityCheck;
    const staleCreatorIdentityCheckRelease = new Promise((resolveCheck) => {
      allowStaleCreatorIdentityCheck = resolveCheck;
    });
    let replacementIdentityCheckStarted;
    const replacementIdentityCheck = new Promise((resolveCheckStarted) => {
      replacementIdentityCheckStarted = resolveCheckStarted;
    });
    let allowReplacementIdentityCheck;
    const replacementIdentityCheckRelease = new Promise((resolveCheck) => {
      allowReplacementIdentityCheck = resolveCheck;
    });
    const barrierFileSystem = createLockFileSystem({
      lstat: async (filePath) => {
        if (filePath === lockPath) {
          canonicalStatCallCount += 1;
          if (canonicalStatCallCount === 2 && !staleCreatorIdentityCheckBlocked) {
            staleCreatorIdentityCheckBlocked = true;
            staleCreatorIdentityCheckStarted();
            await staleCreatorIdentityCheckRelease;
          }
          if (canonicalStatCallCount >= 5 && !replacementIdentityCheckBlocked) {
            replacementIdentityCheckBlocked = true;
            replacementIdentityCheckStarted();
            await replacementIdentityCheckRelease;
          }
        }
        return baseFileSystem.lstat(filePath);
      },
    });
    const staleCreatorLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_004,
      ownerToken: firstOwnerToken,
      fileSystem: barrierFileSystem,
    });
    const staleCreatorLeasePromise = staleCreatorLock.acquire();
    await staleCreatorIdentityCheck;

    const replacementLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_005,
      ownerToken: secondOwnerToken,
      now: () => Date.now() + 10_000,
      isProcessAlive: () => true,
      metadataInitializationGraceMilliseconds: 0,
      minimumStaleLockAgeMilliseconds: 0,
      retryLimit: 0,
      sleep: async () => {},
      fileSystem: barrierFileSystem,
    });
    const replacementLeasePromise = replacementLock.acquire();
    await replacementIdentityCheck;

    allowStaleCreatorIdentityCheck();
    await assert.rejects(
      staleCreatorLeasePromise,
      /reservation was replaced before metadata creation/
    );
    allowReplacementIdentityCheck();
    const replacementLease = await replacementLeasePromise;
    assert.equal(
      JSON.parse(await readFile(join(lockPath, "owner.json"), "utf8")).ownerToken,
      secondOwnerToken
    );
    await replacementLease.release();
  });
});

test("rejects unsafe owner tokens before creating a lock", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    const themeFileLock = createThemeFileLock(lockPath, {
      ownerToken: "owner-with-path/../../outside",
    });
    await assert.rejects(themeFileLock.acquire(), /owner token must be a UUID v4/);
    await assert.rejects(lstat(lockPath), { code: "ENOENT" });
  });
});

test("recovers an old dead owner but never steals a live owner", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    await writeOwnerRecord(lockPath, deadOwnerToken, 41_004, 100);
    const deadOwnerThemeFileLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_005,
      ownerToken: secondOwnerToken,
      isProcessAlive: (processId) => processId !== 41_004,
      now: () => 1_000,
      minimumStaleLockAgeMilliseconds: 500,
      metadataInitializationGraceMilliseconds: 10,
      retryLimit: 0,
      sleep: async () => {},
    });
    const deadOwnerLease = await deadOwnerThemeFileLock.acquire();
    assert.equal(
      JSON.parse(await readFile(join(lockPath, "owner.json"), "utf8")).ownerToken,
      secondOwnerToken
    );
    await deadOwnerLease.release();

    await writeOwnerRecord(lockPath, liveOwnerToken, 41_006, 100);
    const liveOwnerThemeFileLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_007,
      ownerToken: secondOwnerToken,
      isProcessAlive: () => true,
      now: () => 1_000,
      minimumStaleLockAgeMilliseconds: 500,
      metadataInitializationGraceMilliseconds: 10,
      retryLimit: 1,
      sleep: async () => {},
    });
    await assert.rejects(liveOwnerThemeFileLock.acquire(), /after 2 attempts/);
    assert.equal(
      JSON.parse(await readFile(join(lockPath, "owner.json"), "utf8")).ownerToken,
      liveOwnerToken
    );
  });
});

test("keeps missing or partial metadata during initialization grace and bounds retries", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    await mkdir(lockPath);
    let sleepCallCount = 0;
    const themeFileLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_008,
      ownerToken: secondOwnerToken,
      isProcessAlive: () => false,
      now: () => 1_000,
      metadataInitializationGraceMilliseconds: 5_000,
      minimumStaleLockAgeMilliseconds: 5_000,
      retryLimit: 2,
      sleep: async () => {
        sleepCallCount += 1;
      },
    });
    await assert.rejects(themeFileLock.acquire(), /after 3 attempts/);
    assert.equal(sleepCallCount, 2);
    assert.equal((await lstat(lockPath)).isDirectory(), true);
    await writeFile(join(lockPath, "owner.json"), "not-json", "utf8");
    await assert.rejects(themeFileLock.acquire(), /after 3 attempts/);
    assert.equal((await lstat(lockPath)).isDirectory(), true);

    await rm(lockPath, { recursive: true, force: true });
    await mkdir(lockPath);
    await writeFile(join(lockPath, "owner.json"), "not-json", "utf8");
    const staleIncompleteLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_011,
      ownerToken: firstOwnerToken,
      isProcessAlive: () => false,
      now: () => Date.now() + 10_000,
      metadataInitializationGraceMilliseconds: 100,
      minimumStaleLockAgeMilliseconds: 100,
      retryLimit: 0,
      sleep: async () => {},
    });
    const staleIncompleteLease = await staleIncompleteLock.acquire();
    assert.equal(
      JSON.parse(await readFile(join(lockPath, "owner.json"), "utf8")).ownerToken,
      firstOwnerToken
    );
    await staleIncompleteLease.release();
  });
});

test("does not release a lock after metadata changes and rechecks quarantine identity", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    const themeFileLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_009,
      ownerToken: firstOwnerToken,
      isProcessAlive: () => true,
      fileSystem: createLockFileSystem({
        rename: async (sourcePath, destinationPath) => {
          await rename(sourcePath, destinationPath);
          if (sourcePath === lockPath) {
            await writeFile(
              join(destinationPath, "owner.json"),
              JSON.stringify({
                ownerToken: secondOwnerToken,
                ownerProcessId: 41_010,
                createdAtMilliseconds: Date.now(),
              }),
              "utf8"
            );
          }
        },
      }),
    });
    const themeFileLockLease = await themeFileLock.acquire();
    await themeFileLockLease.release();
    assert.equal((await lstat(lockPath)).isDirectory(), true);
    assert.equal(
      JSON.parse(await readFile(join(lockPath, "owner.json"), "utf8")).ownerToken,
      secondOwnerToken
    );
  });
});

test("quarantine reread prevents deleting replaced metadata", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    await writeOwnerRecord(lockPath, deadOwnerToken, 41_011, 100);
    const renamedLockPaths = [];
    const adversarialFileSystem = createLockFileSystem({
      rename: async (sourcePath, destinationPath) => {
        await rename(sourcePath, destinationPath);
        if (sourcePath === lockPath) {
          renamedLockPaths.push(destinationPath);
          await writeFile(
            join(destinationPath, "owner.json"),
            JSON.stringify({
              ownerToken: liveOwnerToken,
              ownerProcessId: 41_012,
              createdAtMilliseconds: 100,
            })
          );
        }
      },
    });
    const contenderThemeFileLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_013,
      ownerToken: secondOwnerToken,
      now: () => 1_000,
      isProcessAlive: (processId) => processId === 41_012,
      minimumStaleLockAgeMilliseconds: 500,
      metadataInitializationGraceMilliseconds: 10,
      retryLimit: 0,
      fileSystem: adversarialFileSystem,
    });
    await assert.rejects(contenderThemeFileLock.acquire(), /after 1 attempts/);
    assert.equal(renamedLockPaths.length, 1);
    assert.equal((await lstat(lockPath)).isDirectory(), true);
    assert.equal(
      JSON.parse(await readFile(join(lockPath, "owner.json"), "utf8")).ownerToken,
      liveOwnerToken
    );
  });
});

test("validates lock limits, clock, and generated owner tokens", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    assert.throws(
      () => createThemeFileLock(lockPath, { retryLimit: 1.5 }),
      /retry limit must be a non-negative integer/
    );
    assert.throws(
      () => createThemeFileLock(lockPath, { ownerProcessId: 0 }),
      /owner process ID must be a positive integer/
    );
    assert.throws(
      () => createThemeFileLock(lockPath, { metadataInitializationGraceMilliseconds: -1 }),
      /age limits are invalid/
    );
    assert.throws(
      () =>
        createThemeFileLock(lockPath, {
          metadataInitializationGraceMilliseconds: 20,
          minimumStaleLockAgeMilliseconds: 10,
        }),
      /age limits are invalid/
    );
    assert.throws(
      () => createThemeFileLock(lockPath, { retryDelayMilliseconds: -1 }),
      /retry delay must be non-negative/
    );
    await assert.rejects(
      createThemeFileLock(lockPath, {
        ownerToken: firstOwnerToken,
        now: () => Number.NaN,
      }).acquire(),
      /clock must return a non-negative time/
    );
    const generatedTokenLock = createThemeFileLock(lockPath, {
      createOwnerToken: () => secondOwnerToken,
      ownerProcessId: 41_014,
      now: () => 1,
    });
    const generatedTokenLease = await generatedTokenLock.acquire();
    await generatedTokenLease.release();
  });
});

test("handles malformed owner records and lock adapter errors conservatively", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    const malformedRecords = [
      null,
      {},
      {
        ownerToken: firstOwnerToken,
        ownerProcessId: 41_015,
        createdAtMilliseconds: 0,
        extra: true,
      },
      { ownerToken: "unsafe", ownerProcessId: 41_015, createdAtMilliseconds: 0 },
      { ownerToken: firstOwnerToken, ownerProcessId: 0, createdAtMilliseconds: 0 },
      { ownerToken: firstOwnerToken, ownerProcessId: 41_015, createdAtMilliseconds: -1 },
    ];
    for (const malformedRecord of malformedRecords) {
      await mkdir(lockPath);
      await writeFile(join(lockPath, "owner.json"), JSON.stringify(malformedRecord));
      const lock = createThemeFileLock(lockPath, {
        ownerProcessId: 41_016,
        ownerToken: secondOwnerToken,
        now: () => Date.now() + 20_000,
        metadataInitializationGraceMilliseconds: 0,
        minimumStaleLockAgeMilliseconds: 0,
        retryLimit: 0,
        sleep: async () => {},
      });
      const lease = await lock.acquire();
      await lease.release();
    }

    await mkdir(lockPath);
    const lstatFailureLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_017,
      ownerToken: secondOwnerToken,
      retryLimit: 0,
      fileSystem: createLockFileSystem({
        lstat: async (filePath) => {
          if (filePath === lockPath) return createLockStats();
          throw createLockError("owner stat failed");
        },
      }),
    });
    await assert.rejects(lstatFailureLock.acquire(), /owner stat failed/);
    await rm(lockPath, { recursive: true, force: true });

    await mkdir(lockPath);
    await writeFile(join(lockPath, "owner.json"), JSON.stringify({ ownerToken: firstOwnerToken }));
    const readFailureLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_018,
      ownerToken: secondOwnerToken,
      retryLimit: 0,
      fileSystem: createLockFileSystem({
        lstat: async (filePath) =>
          filePath === lockPath
            ? createLockStats()
            : filePath.endsWith("owner.json")
              ? createLockStats({ directory: false })
              : createLockStats(),
        open: async (filePath, flags, mode) => {
          if (filePath.endsWith("owner.json")) throw createLockError("owner read failed");
          return open(filePath, flags, mode);
        },
      }),
    });
    await assert.rejects(readFailureLock.acquire(), /owner read failed/);
  });
});

test("never treats a symlink or non-directory lock as reclaimable", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    for (const lockStats of [
      createLockStats({ symbolicLink: true }),
      createLockStats({ directory: false }),
    ]) {
      const lock = createThemeFileLock(lockPath, {
        ownerProcessId: 41_019,
        ownerToken: secondOwnerToken,
        retryLimit: 0,
        fileSystem: createLockFileSystem({
          mkdir: async () => {
            throw createLockError("already exists", "EEXIST");
          },
          lstat: async (filePath) => (filePath === lockPath ? lockStats : createLockStats()),
        }),
      });
      await assert.rejects(lock.acquire(), /after 1 attempts/);
    }
  });
});

test("uses default liveness and bounded retry sleep", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    await writeOwnerRecord(lockPath, deadOwnerToken, 2_000_000_000, 0);
    const lock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_020,
      ownerToken: secondOwnerToken,
      now: () => Date.now(),
      minimumStaleLockAgeMilliseconds: 0,
      metadataInitializationGraceMilliseconds: 0,
      retryLimit: 0,
    });
    const lease = await lock.acquire();
    await lease.release();

    await writeOwnerRecord(lockPath, liveOwnerToken, process.pid, 0);
    const blockedLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_021,
      ownerToken: secondOwnerToken,
      now: () => Date.now(),
      minimumStaleLockAgeMilliseconds: 0,
      metadataInitializationGraceMilliseconds: 0,
      retryLimit: 1,
    });
    await assert.rejects(blockedLock.acquire(), /after 2 attempts/);
  });
});

test("rejects unsafe lock parents and bounded non-regular or oversized metadata", async () => {
  await withTemporaryLockPath(async (lockPath, temporaryDirectoryPath) => {
    const linkedParentPath = join(temporaryDirectoryPath, "linked-parent");
    await symlink(temporaryDirectoryPath, linkedParentPath);
    const linkedLock = createThemeFileLock(join(linkedParentPath, "themes.lock"), {
      ownerProcessId: 41_022,
      ownerToken: firstOwnerToken,
    });
    await assert.rejects(linkedLock.acquire(), /parent must be a directory/);

    await mkdir(lockPath);
    await writeFile(join(lockPath, "owner.json"), "sentinel");
    const nonRegularLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_023,
      ownerToken: firstOwnerToken,
      retryLimit: 0,
      fileSystem: createLockFileSystem({
        lstat: async (filePath) =>
          filePath === lockPath
            ? createLockStats()
            : filePath.endsWith("owner.json")
              ? createLockStats({ directory: false, regular: false })
              : createLockStats(),
        mkdir: async () => {
          throw createLockError("already exists", "EEXIST");
        },
      }),
    });
    await assert.rejects(nonRegularLock.acquire(), /after 1 attempts/);

    await rm(lockPath, { recursive: true, force: true });
    await mkdir(lockPath);
    await writeFile(join(lockPath, "owner.json"), "x".repeat(65_537));
    const oversizedMetadataLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_024,
      ownerToken: secondOwnerToken,
      now: () => Date.now(),
      minimumStaleLockAgeMilliseconds: 0,
      metadataInitializationGraceMilliseconds: 0,
      retryLimit: 0,
      sleep: async () => {},
    });
    await assert.rejects(oversizedMetadataLock.acquire(), /metadata exceeds 65536 bytes/);
  });
});

test("keeps quarantined owners safe across races and cleanup failures", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    await writeOwnerRecord(lockPath, deadOwnerToken, 41_025, 0);
    const racingFileSystem = createLockFileSystem({
      rename: async (sourcePath, destinationPath) => {
        await rename(sourcePath, destinationPath);
        if (sourcePath === lockPath) {
          await mkdir(lockPath);
          await writeFile(
            join(lockPath, "owner.json"),
            JSON.stringify({
              ownerToken: liveOwnerToken,
              ownerProcessId: 41_026,
              createdAtMilliseconds: 0,
            })
          );
          await writeFile(
            join(destinationPath, "owner.json"),
            JSON.stringify({
              ownerToken: secondOwnerToken,
              ownerProcessId: 41_027,
              createdAtMilliseconds: 0,
            })
          );
        }
      },
    });
    const racingLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_028,
      ownerToken: secondOwnerToken,
      now: () => 1_000,
      isProcessAlive: () => false,
      minimumStaleLockAgeMilliseconds: 500,
      metadataInitializationGraceMilliseconds: 0,
      retryLimit: 0,
      fileSystem: racingFileSystem,
    });
    await assert.rejects(racingLock.acquire(), /after 1 attempts/);
    assert.equal(
      JSON.parse(await readFile(join(lockPath, "owner.json"), "utf8")).ownerToken,
      liveOwnerToken
    );
  });

  await withTemporaryLockPath(async (lockPath) => {
    await writeOwnerRecord(lockPath, deadOwnerToken, 41_029, 0);
    let livenessCheckCount = 0;
    const liveDuringQuarantineFileSystem = createLockFileSystem({
      rename: async (sourcePath, destinationPath) => {
        await rename(sourcePath, destinationPath);
      },
    });
    const liveDuringQuarantineLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_030,
      ownerToken: secondOwnerToken,
      now: () => 1_000,
      isProcessAlive: () => {
        livenessCheckCount += 1;
        return livenessCheckCount > 1;
      },
      minimumStaleLockAgeMilliseconds: 500,
      metadataInitializationGraceMilliseconds: 0,
      retryLimit: 0,
      fileSystem: liveDuringQuarantineFileSystem,
    });
    await assert.rejects(liveDuringQuarantineLock.acquire(), /after 1 attempts/);
    assert.equal((await lstat(lockPath)).isDirectory(), true);
    assert.equal(
      JSON.parse(await readFile(join(lockPath, "owner.json"), "utf8")).ownerToken,
      deadOwnerToken
    );
  });

  await withTemporaryLockPath(async (lockPath) => {
    await writeOwnerRecord(lockPath, deadOwnerToken, 41_031, 0);
    const cleanupFailureFileSystem = createLockFileSystem({
      unlink: async () => {
        throw createLockError("quarantine unlink failed");
      },
    });
    const cleanupFailureLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_032,
      ownerToken: secondOwnerToken,
      now: () => 1_000,
      isProcessAlive: () => false,
      minimumStaleLockAgeMilliseconds: 500,
      metadataInitializationGraceMilliseconds: 0,
      retryLimit: 0,
      fileSystem: cleanupFailureFileSystem,
    });
    await assert.rejects(cleanupFailureLock.acquire(), /quarantine unlink failed/);
    assert.equal((await lstat(lockPath)).isDirectory(), true);
  });
});

test("bounds lock recovery when paths disappear or adapters fail", async () => {
  await withTemporaryLockPath(async (lockPath, temporaryDirectoryPath) => {
    const parentFailureLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_033,
      ownerToken: firstOwnerToken,
      fileSystem: createLockFileSystem({
        lstat: async (filePath) => {
          if (filePath === temporaryDirectoryPath)
            throw createLockError("lock parent disappeared", "ENOENT");
          return createLockStats();
        },
      }),
    });
    await assert.rejects(parentFailureLock.acquire(), /lock parent disappeared/);

    const adapterFailureLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_034,
      ownerToken: firstOwnerToken,
      fileSystem: createLockFileSystem({
        lstat: async (filePath) => {
          if (filePath === temporaryDirectoryPath) throw createLockError("lock parent stat failed");
          return createLockStats();
        },
      }),
    });
    await assert.rejects(adapterFailureLock.acquire(), /lock parent stat failed/);
  });

  await withTemporaryLockPath(async (lockPath) => {
    await writeOwnerRecord(lockPath, deadOwnerToken, 41_035, 0);
    const disappearingFileSystem = createLockFileSystem({
      rename: async () => {
        throw createLockError("lock disappeared", "ENOENT");
      },
    });
    const disappearingLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_036,
      ownerToken: secondOwnerToken,
      now: () => 1_000,
      isProcessAlive: () => false,
      minimumStaleLockAgeMilliseconds: 500,
      metadataInitializationGraceMilliseconds: 0,
      retryLimit: 0,
      fileSystem: disappearingFileSystem,
    });
    await assert.rejects(disappearingLock.acquire(), /after 1 attempts/);
  });

  await withTemporaryLockPath(async (lockPath) => {
    await writeOwnerRecord(lockPath, deadOwnerToken, 41_037, 0);
    const failedQuarantineFileSystem = createLockFileSystem({
      rename: async () => {
        throw createLockError("quarantine failed");
      },
    });
    const failedQuarantineLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_038,
      ownerToken: secondOwnerToken,
      now: () => 1_000,
      isProcessAlive: () => false,
      minimumStaleLockAgeMilliseconds: 500,
      metadataInitializationGraceMilliseconds: 0,
      retryLimit: 0,
      fileSystem: failedQuarantineFileSystem,
    });
    await assert.rejects(failedQuarantineLock.acquire(), /after 1 attempts/);
  });
});

test("releases safely when ownership or release rename changes", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    const releaseErrorLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_039,
      ownerToken: firstOwnerToken,
      fileSystem: createLockFileSystem({
        rename: async (sourcePath, destinationPath) => {
          if (sourcePath === lockPath && destinationPath.includes(".release-")) {
            throw createLockError("release rename failed");
          }
          return rename(sourcePath, destinationPath);
        },
      }),
    });
    const releaseErrorLease = await releaseErrorLock.acquire();
    await assert.rejects(releaseErrorLease.release(), /release rename failed/);
  });

  await withTemporaryLockPath(async (lockPath) => {
    const releaseCleanupErrorLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_040,
      ownerToken: firstOwnerToken,
      fileSystem: createLockFileSystem({
        unlink: async () => {
          throw createLockError("release unlink failed");
        },
      }),
    });
    const releaseCleanupErrorLease = await releaseCleanupErrorLock.acquire();
    await assert.rejects(releaseCleanupErrorLease.release(), /release unlink failed/);
  });
});

test("handles disappearing quarantine artifacts and adapter read variants", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    await writeOwnerRecord(lockPath, deadOwnerToken, 41_041, 0);
    let quarantinePath;
    let quarantineStatCallCount = 0;
    const disappearingQuarantineFileSystem = createLockFileSystem({
      rename: async (sourcePath, destinationPath) => {
        await rename(sourcePath, destinationPath);
        if (sourcePath === lockPath) {
          quarantinePath = destinationPath;
          await rm(destinationPath, { recursive: true, force: true });
        }
      },
    });
    const disappearingQuarantineLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_042,
      ownerToken: secondOwnerToken,
      now: () => 1_000,
      isProcessAlive: () => false,
      minimumStaleLockAgeMilliseconds: 500,
      metadataInitializationGraceMilliseconds: 0,
      retryLimit: 0,
      fileSystem: disappearingQuarantineFileSystem,
    });
    const lease = await disappearingQuarantineLock.acquire();
    assert.equal(typeof quarantinePath, "string");
    await lease.release();
  });

  await withTemporaryLockPath(async (lockPath) => {
    await writeOwnerRecord(lockPath, deadOwnerToken, 41_043, 0);
    let quarantinePath;
    let quarantineStatCallCount = 0;
    const missingQuarantineFileSystem = createLockFileSystem({
      rename: async (sourcePath, destinationPath) => {
        await rename(sourcePath, destinationPath);
        if (sourcePath === lockPath) {
          quarantinePath = destinationPath;
          await writeFile(join(destinationPath, "owner.json"), JSON.stringify({ unsafe: true }));
        }
      },
      lstat: async (filePath) => {
        if (filePath === quarantinePath) {
          quarantineStatCallCount += 1;
          if (quarantineStatCallCount >= 3) throw createLockError("quarantine gone", "ENOENT");
        }
        return lstat(filePath);
      },
    });
    const missingQuarantineLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_044,
      ownerToken: secondOwnerToken,
      now: () => 1_000,
      isProcessAlive: () => false,
      minimumStaleLockAgeMilliseconds: 500,
      metadataInitializationGraceMilliseconds: 0,
      retryLimit: 0,
      fileSystem: missingQuarantineFileSystem,
    });
    await assert.rejects(missingQuarantineLock.acquire(), /after 1 attempts/);
    assert.equal(quarantineStatCallCount, 3);
  });

  await withTemporaryLockPath(async (lockPath) => {
    await writeOwnerRecord(lockPath, deadOwnerToken, 41_045, 0);
    let quarantinePath;
    const restoreFailureFileSystem = createLockFileSystem({
      rename: async (sourcePath, destinationPath) => {
        if (quarantinePath && sourcePath === quarantinePath) {
          throw createLockError("quarantine restore failed");
        }
        await rename(sourcePath, destinationPath);
        if (sourcePath === lockPath) {
          quarantinePath = destinationPath;
          await writeFile(join(destinationPath, "owner.json"), JSON.stringify({ unsafe: true }));
        }
      },
    });
    const restoreFailureLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_046,
      ownerToken: secondOwnerToken,
      now: () => 1_000,
      isProcessAlive: () => false,
      minimumStaleLockAgeMilliseconds: 500,
      metadataInitializationGraceMilliseconds: 0,
      retryLimit: 0,
      fileSystem: restoreFailureFileSystem,
    });
    await assert.rejects(restoreFailureLock.acquire(), /quarantine restore failed/);
  });

  await withTemporaryLockPath(async (lockPath) => {
    await writeOwnerRecord(lockPath, liveOwnerToken, 41_047, 0);
    const baseFileSystem = createLockFileSystem();
    const noStatReadFileSystem = createLockFileSystem({
      open: async (filePath, flags, mode) => {
        const fileHandle = await baseFileSystem.open(filePath, flags, mode);
        return {
          writeFile: fileHandle.writeFile,
          read: fileHandle.read,
          close: fileHandle.close,
        };
      },
    });
    const noStatReadLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_048,
      ownerToken: secondOwnerToken,
      isProcessAlive: () => true,
      retryLimit: 0,
      fileSystem: noStatReadFileSystem,
    });
    await assert.rejects(noStatReadLock.acquire(), /after 1 attempts/);
  });
});

test("covers lock metadata, directory, and quarantine adapter failures", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    await writeOwnerRecord(lockPath, liveOwnerToken, 41_049, 0);
    const ownerStatFailureLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_050,
      ownerToken: secondOwnerToken,
      retryLimit: 0,
      fileSystem: createLockFileSystem({
        lstat: async (filePath) => {
          if (filePath.endsWith("owner.json")) throw createLockError("owner stat failed");
          return lstat(filePath);
        },
      }),
    });
    await assert.rejects(ownerStatFailureLock.acquire(), /owner stat failed/);
  });

  for (const openedStats of [
    createLockStats({ directory: false, regular: false }),
    createLockStats({ symbolicLink: true }),
  ]) {
    await withTemporaryLockPath(async (lockPath) => {
      await writeOwnerRecord(lockPath, liveOwnerToken, 41_051, Date.now());
      const baseFileSystem = createLockFileSystem();
      const openedStatsLock = createThemeFileLock(lockPath, {
        ownerProcessId: 41_052,
        ownerToken: secondOwnerToken,
        retryLimit: 0,
        fileSystem: createLockFileSystem({
          open: async (filePath, flags, mode) => {
            const fileHandle = await baseFileSystem.open(filePath, flags, mode);
            if (!filePath.endsWith("owner.json")) return fileHandle;
            return { ...fileHandle, stat: async () => openedStats };
          },
        }),
      });
      await assert.rejects(openedStatsLock.acquire(), /after 1 attempts/);
    });
  }

  for (const directoryStatError of ["ENOENT", "EIO"]) {
    await withTemporaryLockPath(async (lockPath, temporaryDirectoryPath) => {
      await mkdir(lockPath);
      const directoryFailureLock = createThemeFileLock(lockPath, {
        ownerProcessId: 41_053,
        ownerToken: secondOwnerToken,
        retryLimit: 0,
        fileSystem: createLockFileSystem({
          lstat: async (filePath) => {
            if (filePath === lockPath)
              throw createLockError("directory stat failed", directoryStatError);
            return filePath === temporaryDirectoryPath ? createLockStats() : lstat(filePath);
          },
        }),
      });
      await assert.rejects(
        directoryFailureLock.acquire(),
        directoryStatError === "ENOENT" ? /after 1 attempts/ : /directory stat failed/
      );
    });
  }

  for (const restoreErrorCode of ["ENOENT", "EIO"]) {
    await withTemporaryLockPath(async (lockPath) => {
      await writeOwnerRecord(lockPath, deadOwnerToken, 41_054, 0);
      let quarantinePath;
      let quarantineLookupCount = 0;
      const restoreFailureFileSystem = createLockFileSystem({
        rename: async (sourcePath, destinationPath) => {
          if (quarantinePath && sourcePath === quarantinePath) {
            throw createLockError("restore failed", restoreErrorCode);
          }
          await rename(sourcePath, destinationPath);
          if (sourcePath === lockPath) {
            quarantinePath = destinationPath;
            await writeFile(join(destinationPath, "owner.json"), JSON.stringify({ unsafe: true }));
          }
        },
        lstat: async (filePath) => {
          if (filePath === quarantinePath) {
            quarantineLookupCount += 1;
            if (restoreErrorCode === "ENOENT" && quarantineLookupCount >= 2) {
              throw createLockError("quarantine missing", "ENOENT");
            }
          }
          return lstat(filePath);
        },
      });
      const restoreFailureLock = createThemeFileLock(lockPath, {
        ownerProcessId: 41_055,
        ownerToken: secondOwnerToken,
        now: () => 1_000,
        isProcessAlive: () => false,
        minimumStaleLockAgeMilliseconds: 500,
        metadataInitializationGraceMilliseconds: 0,
        retryLimit: 0,
        fileSystem: restoreFailureFileSystem,
      });
      if (restoreErrorCode === "ENOENT") {
        await assert.rejects(restoreFailureLock.acquire(), /after 1 attempts/);
      } else {
        await assert.rejects(restoreFailureLock.acquire(), /restore failed/);
      }
    });
  }

  await withTemporaryLockPath(async (lockPath) => {
    await writeOwnerRecord(lockPath, deadOwnerToken, 41_056, 0);
    let quarantinePath;
    const canonicalStatFailureFileSystem = createLockFileSystem({
      rename: async (sourcePath, destinationPath) => {
        if (quarantinePath && sourcePath === quarantinePath)
          throw createLockError("restore failed");
        await rename(sourcePath, destinationPath);
        if (sourcePath === lockPath) {
          quarantinePath = destinationPath;
          await writeFile(join(destinationPath, "owner.json"), JSON.stringify({ unsafe: true }));
        }
      },
      lstat: async (filePath) => {
        if (filePath === lockPath && quarantinePath) throw createLockError("canonical stat failed");
        return lstat(filePath);
      },
    });
    const canonicalStatFailureLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_057,
      ownerToken: secondOwnerToken,
      now: () => 1_000,
      isProcessAlive: () => false,
      minimumStaleLockAgeMilliseconds: 500,
      metadataInitializationGraceMilliseconds: 0,
      retryLimit: 0,
      fileSystem: canonicalStatFailureFileSystem,
    });
    await assert.rejects(canonicalStatFailureLock.acquire(), /canonical stat failed/);
  });
});

test("recovers incomplete lock initialization only after all identity checks", async () => {
  const runIncompleteRecoveryCase = async (configureFileSystem, expectedError) => {
    await withTemporaryLockPath(async (lockPath) => {
      await mkdir(lockPath);
      await writeFile(join(lockPath, "owner.json"), "not-json");
      const incompleteLock = createThemeFileLock(lockPath, {
        ownerProcessId: 41_058,
        ownerToken: secondOwnerToken,
        now: () => Date.now() + 10_000,
        minimumStaleLockAgeMilliseconds: 500,
        metadataInitializationGraceMilliseconds: 0,
        retryLimit: 0,
        fileSystem: createLockFileSystem(configureFileSystem(lockPath)),
      });
      await assert.rejects(incompleteLock.acquire(), expectedError);
    });
  };

  await runIncompleteRecoveryCase((lockPath) => {
    let quarantinePath;
    return {
      rename: async (sourcePath, destinationPath) => {
        await rename(sourcePath, destinationPath);
        if (sourcePath === lockPath) quarantinePath = destinationPath;
      },
      lstat: async (filePath) => {
        if (filePath === quarantinePath) throw createLockError("quarantine stat failed");
        return lstat(filePath);
      },
    };
  }, /quarantine stat failed/);

  for (const quarantineReplacement of ["file", "symlink"]) {
    await runIncompleteRecoveryCase((lockPath) => {
      let quarantinePath;
      return {
        rename: async (sourcePath, destinationPath) => {
          await rename(sourcePath, destinationPath);
          if (sourcePath !== lockPath) return;
          quarantinePath = destinationPath;
          await unlink(join(destinationPath, "owner.json"));
          if (quarantineReplacement === "file") await writeFile(destinationPath, "not-a-dir");
          else await symlink(lockPath, destinationPath);
        },
        lstat: async (filePath) => lstat(filePath),
      };
    }, /after 1 attempts/);
  }

  await runIncompleteRecoveryCase((lockPath) => {
    let quarantinePath;
    let quarantineLookupCount = 0;
    return {
      rename: async (sourcePath, destinationPath) => {
        await rename(sourcePath, destinationPath);
        if (sourcePath === lockPath) quarantinePath = destinationPath;
      },
      lstat: async (filePath) => {
        if (filePath === quarantinePath) {
          quarantineLookupCount += 1;
          if (quarantineLookupCount === 2) throw createLockError("latest stat failed");
        }
        return lstat(filePath);
      },
    };
  }, /latest stat failed/);

  await runIncompleteRecoveryCase((lockPath) => {
    let quarantinePath;
    let quarantineLookupCount = 0;
    return {
      rename: async (sourcePath, destinationPath) => {
        await rename(sourcePath, destinationPath);
        if (sourcePath === lockPath) quarantinePath = destinationPath;
      },
      lstat: async (filePath) => {
        if (filePath === quarantinePath) {
          quarantineLookupCount += 1;
          if (quarantineLookupCount === 2) return createLockStats({ mtimeMs: 1 });
        }
        return lstat(filePath);
      },
    };
  }, /after 1 attempts/);

  for (const metadataFailure of ["EIO", "SYMLINK"]) {
    await runIncompleteRecoveryCase(
      (lockPath) => {
        let quarantinePath;
        let metadataLookupCount = 0;
        return {
          rename: async (sourcePath, destinationPath) => {
            await rename(sourcePath, destinationPath);
            if (sourcePath === lockPath) quarantinePath = destinationPath;
          },
          lstat: async (filePath) => {
            if (filePath === quarantinePath) return lstat(filePath);
            if (filePath.endsWith("owner.json") && filePath.includes(".incomplete-")) {
              metadataLookupCount += 1;
              if (metadataLookupCount < 3) return lstat(filePath);
              if (metadataFailure === "EIO") throw createLockError("metadata stat failed");
              return createLockStats({ symbolicLink: true });
            }
            return lstat(filePath);
          },
        };
      },
      metadataFailure === "EIO" ? /metadata stat failed/ : /after 1 attempts/
    );
  }

  await withTemporaryLockPath(async (lockPath) => {
    await mkdir(lockPath);
    const incompleteLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_059,
      ownerToken: secondOwnerToken,
      now: () => Date.now() + 10_000,
      minimumStaleLockAgeMilliseconds: 0,
      metadataInitializationGraceMilliseconds: 0,
      retryLimit: 0,
      sleep: async () => {},
    });
    const lease = await incompleteLock.acquire();
    await lease.release();
  });
});

test("covers incomplete-owner restoration, cleanup, and metadata identity races", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    await writeOwnerRecord(lockPath, deadOwnerToken, 41_060, 0);
    let quarantinePath;
    let quarantineLookupCount = 0;
    const restoreStatFailureFileSystem = createLockFileSystem({
      rename: async (sourcePath, destinationPath) => {
        if (quarantinePath && sourcePath === quarantinePath) {
          throw createLockError("quarantine stat failed");
        }
        await rename(sourcePath, destinationPath);
        if (sourcePath === lockPath) {
          quarantinePath = destinationPath;
          await writeFile(join(destinationPath, "owner.json"), JSON.stringify({ unsafe: true }));
        }
      },
      lstat: async (filePath) => {
        if (filePath === quarantinePath) {
          quarantineLookupCount += 1;
          if (quarantineLookupCount === 2) throw createLockError("quarantine stat failed");
        }
        return lstat(filePath);
      },
    });
    const restoreStatFailureLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_061,
      ownerToken: secondOwnerToken,
      now: () => 1_000,
      isProcessAlive: () => false,
      minimumStaleLockAgeMilliseconds: 500,
      metadataInitializationGraceMilliseconds: 0,
      retryLimit: 0,
      fileSystem: restoreStatFailureFileSystem,
    });
    await assert.rejects(restoreStatFailureLock.acquire(), /quarantine stat failed/);
  });

  await withTemporaryLockPath(async (lockPath) => {
    await writeOwnerRecord(lockPath, deadOwnerToken, 41_062, 0);
    let quarantinePath;
    const removeStatFailureFileSystem = createLockFileSystem({
      rename: async (sourcePath, destinationPath) => {
        await rename(sourcePath, destinationPath);
        if (sourcePath === lockPath) {
          quarantinePath = destinationPath;
          await rm(destinationPath, { recursive: true, force: true });
        }
      },
      lstat: async (filePath) => {
        if (filePath === quarantinePath) throw createLockError("quarantine remove stat failed");
        return lstat(filePath);
      },
    });
    const removeStatFailureLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_063,
      ownerToken: secondOwnerToken,
      now: () => 1_000,
      isProcessAlive: () => false,
      minimumStaleLockAgeMilliseconds: 500,
      metadataInitializationGraceMilliseconds: 0,
      retryLimit: 0,
      fileSystem: removeStatFailureFileSystem,
    });
    await assert.rejects(removeStatFailureLock.acquire(), /quarantine remove stat failed/);
  });

  await withTemporaryLockPath(async (lockPath) => {
    await mkdir(lockPath);
    await writeFile(join(lockPath, "owner.json"), "not-json");
    let quarantinePath;
    const recoveredOwnerFileSystem = createLockFileSystem({
      rename: async (sourcePath, destinationPath) => {
        await rename(sourcePath, destinationPath);
        if (sourcePath === lockPath) {
          quarantinePath = destinationPath;
          await writeFile(
            join(destinationPath, "owner.json"),
            JSON.stringify({
              ownerToken: deadOwnerToken,
              ownerProcessId: 41_064,
              createdAtMilliseconds: 0,
            })
          );
        }
      },
    });
    const recoveredOwnerLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_065,
      ownerToken: secondOwnerToken,
      now: () => Date.now() + 10_000,
      isProcessAlive: () => false,
      minimumStaleLockAgeMilliseconds: 500,
      metadataInitializationGraceMilliseconds: 0,
      retryLimit: 0,
      fileSystem: recoveredOwnerFileSystem,
    });
    const lease = await recoveredOwnerLock.acquire();
    await lease.release();
    assert.equal(typeof quarantinePath, "string");
  });

  await withTemporaryLockPath(async (lockPath) => {
    await mkdir(lockPath);
    await writeFile(join(lockPath, "owner.json"), "not-json");
    let quarantinePath;
    const youngOwnerFileSystem = createLockFileSystem({
      rename: async (sourcePath, destinationPath) => {
        await rename(sourcePath, destinationPath);
        if (sourcePath === lockPath) {
          quarantinePath = destinationPath;
          await writeFile(
            join(destinationPath, "owner.json"),
            JSON.stringify({
              ownerToken: liveOwnerToken,
              ownerProcessId: 41_066,
              createdAtMilliseconds: Date.now() + 9_900,
            })
          );
        }
      },
    });
    const youngOwnerLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_067,
      ownerToken: secondOwnerToken,
      now: () => Date.now() + 10_000,
      isProcessAlive: () => false,
      minimumStaleLockAgeMilliseconds: 500,
      metadataInitializationGraceMilliseconds: 0,
      retryLimit: 0,
      fileSystem: youngOwnerFileSystem,
    });
    await assert.rejects(youngOwnerLock.acquire(), /after 1 attempts/);
    assert.equal(typeof quarantinePath, "string");
  });

  await withTemporaryLockPath(async (lockPath) => {
    await mkdir(lockPath);
    await writeFile(join(lockPath, "owner.json"), "not-json");
    let quarantinePath;
    let quarantineLookupCount = 0;
    const latestNonDirectoryFileSystem = createLockFileSystem({
      rename: async (sourcePath, destinationPath) => {
        await rename(sourcePath, destinationPath);
        if (sourcePath === lockPath) quarantinePath = destinationPath;
      },
      lstat: async (filePath) => {
        if (filePath === quarantinePath) {
          quarantineLookupCount += 1;
          if (quarantineLookupCount === 2) return createLockStats({ directory: false });
        }
        return lstat(filePath);
      },
    });
    const latestNonDirectoryLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_068,
      ownerToken: secondOwnerToken,
      now: () => Date.now() + 10_000,
      minimumStaleLockAgeMilliseconds: 0,
      metadataInitializationGraceMilliseconds: 0,
      retryLimit: 0,
      fileSystem: latestNonDirectoryFileSystem,
    });
    await assert.rejects(latestNonDirectoryLock.acquire(), /after 1 attempts/);
  });

  await withTemporaryLockPath(async (lockPath) => {
    await mkdir(lockPath);
    await writeFile(join(lockPath, "owner.json"), "not-json");
    let quarantinePath;
    const cleanupFailureFileSystem = createLockFileSystem({
      rename: async (sourcePath, destinationPath) => {
        await rename(sourcePath, destinationPath);
        if (sourcePath === lockPath) quarantinePath = destinationPath;
      },
      unlink: async (filePath) => {
        if (filePath === join(quarantinePath, "owner.json")) {
          throw createLockError("incomplete cleanup failed");
        }
        return unlink(filePath);
      },
    });
    const cleanupFailureLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_069,
      ownerToken: secondOwnerToken,
      now: () => Date.now() + 10_000,
      minimumStaleLockAgeMilliseconds: 0,
      metadataInitializationGraceMilliseconds: 0,
      retryLimit: 0,
      fileSystem: cleanupFailureFileSystem,
    });
    await assert.rejects(cleanupFailureLock.acquire(), /incomplete cleanup failed/);
  });

  await withTemporaryLockPath(async (lockPath) => {
    const baseFileSystem = createLockFileSystem();
    const metadataIdentityFileSystem = createLockFileSystem({
      open: async (filePath, flags, mode) => {
        const fileHandle = await baseFileSystem.open(filePath, flags, mode);
        return {
          ...fileHandle,
          stat: async () => createLockStats({ directory: false, regular: false }),
        };
      },
    });
    const metadataIdentityLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_070,
      ownerToken: secondOwnerToken,
      fileSystem: metadataIdentityFileSystem,
    });
    await assert.rejects(metadataIdentityLock.acquire(), /metadata must be a regular file/);
  });
});

test("preserves quarantine when its final identity recheck fails", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    await writeOwnerRecord(lockPath, deadOwnerToken, 41_071, 0);
    let quarantinePath;
    let quarantineLookupCount = 0;
    const finalIdentityFailureFileSystem = createLockFileSystem({
      rename: async (sourcePath, destinationPath) => {
        if (quarantinePath && sourcePath === quarantinePath) {
          throw createLockError("quarantine restore blocked");
        }
        await rename(sourcePath, destinationPath);
        if (sourcePath === lockPath) {
          quarantinePath = destinationPath;
          await writeFile(join(destinationPath, "owner.json"), JSON.stringify({ unsafe: true }));
        }
      },
      lstat: async (filePath) => {
        if (filePath === quarantinePath) {
          quarantineLookupCount += 1;
          if (quarantineLookupCount === 3) throw createLockError("quarantine recheck failed");
        }
        return lstat(filePath);
      },
    });
    const finalIdentityFailureLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_072,
      ownerToken: secondOwnerToken,
      now: () => 1_000,
      isProcessAlive: () => false,
      minimumStaleLockAgeMilliseconds: 500,
      metadataInitializationGraceMilliseconds: 0,
      retryLimit: 0,
      fileSystem: finalIdentityFailureFileSystem,
    });
    await assert.rejects(finalIdentityFailureLock.acquire(), /quarantine recheck failed/);
  });
});

test("supports minimal lock handles without optional stat or sync adapters", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    const baseFileSystem = createLockFileSystem();
    const minimalHandleFileSystem = createLockFileSystem({
      open: async (filePath, flags, mode) => {
        const fileHandle = await baseFileSystem.open(filePath, flags, mode);
        return {
          writeFile: fileHandle.writeFile,
          read: fileHandle.read,
          close: fileHandle.close,
        };
      },
      lstat: async (filePath) => {
        const fileStats = await lstat(filePath);
        return {
          mtimeMs: fileStats.mtimeMs,
          isDirectory: () => fileStats.isDirectory(),
          isSymbolicLink: () => fileStats.isSymbolicLink(),
        };
      },
    });
    const lock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_073,
      ownerToken: firstOwnerToken,
      fileSystem: minimalHandleFileSystem,
    });
    const lease = await lock.acquire();
    await lease.release();
    await assert.rejects(lstat(lockPath), { code: "ENOENT" });
  });
});

test("treats missing release and quarantine cleanup paths as already resolved", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    const releaseMissingFileSystem = createLockFileSystem({
      rename: async (sourcePath, destinationPath) => {
        if (sourcePath === lockPath && destinationPath.includes(".release-")) {
          throw createLockError("lock already gone", "ENOENT");
        }
        return rename(sourcePath, destinationPath);
      },
    });
    const releaseMissingLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_074,
      ownerToken: firstOwnerToken,
      fileSystem: releaseMissingFileSystem,
    });
    const lease = await releaseMissingLock.acquire();
    await lease.release();
  });

  await withTemporaryLockPath(async (lockPath) => {
    await writeOwnerRecord(lockPath, deadOwnerToken, 41_075, 0);
    const cleanupAlreadyDoneFileSystem = createLockFileSystem({
      unlink: async (filePath) => {
        if (filePath.includes(".stale-")) {
          throw createLockError("owner already removed", "ENOENT");
        }
        return unlink(filePath);
      },
    });
    const recoveredLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_076,
      ownerToken: secondOwnerToken,
      now: () => 1_000,
      isProcessAlive: () => false,
      minimumStaleLockAgeMilliseconds: 500,
      metadataInitializationGraceMilliseconds: 0,
      retryLimit: 0,
      fileSystem: cleanupAlreadyDoneFileSystem,
    });
    const recoveredLease = await recoveredLock.acquire();
    await recoveredLease.release();
  });
});

test("does not return a lease after a delayed partial initialization is reclaimed", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    const baseFileSystem = createLockFileSystem();
    let delayedOwnerWriteStarted;
    const ownerWriteStarted = new Promise((resolveWriteStarted) => {
      delayedOwnerWriteStarted = resolveWriteStarted;
    });
    let allowDelayedOwnerWrite;
    const delayedOwnerWriteRelease = new Promise((resolveWrite) => {
      allowDelayedOwnerWrite = resolveWrite;
    });
    let delayedOwnerWriteCount = 0;
    const delayedWriteFileSystem = createLockFileSystem({
      open: async (filePath, flags, mode) => {
        const fileHandle = await baseFileSystem.open(filePath, flags, mode);
        if (filePath !== join(lockPath, "owner.json") || delayedOwnerWriteCount > 0) {
          return fileHandle;
        }
        delayedOwnerWriteCount += 1;
        return {
          ...fileHandle,
          writeFile: async (contents, encoding) => {
            delayedOwnerWriteStarted();
            await delayedOwnerWriteRelease;
            await fileHandle.writeFile(contents, encoding);
          },
        };
      },
    });
    const firstOwnerLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_077,
      ownerToken: firstOwnerToken,
      fileSystem: delayedWriteFileSystem,
    });
    const firstOwnerLeasePromise = firstOwnerLock.acquire();
    await ownerWriteStarted;

    const secondOwnerLock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_078,
      ownerToken: secondOwnerToken,
      now: () => Date.now() + 10_000,
      isProcessAlive: () => true,
      metadataInitializationGraceMilliseconds: 0,
      minimumStaleLockAgeMilliseconds: 0,
      retryLimit: 0,
      fileSystem: delayedWriteFileSystem,
    });
    const secondOwnerLease = await secondOwnerLock.acquire();
    allowDelayedOwnerWrite();
    await assert.rejects(
      firstOwnerLeasePromise,
      /reservation was replaced|owner changed before publication/
    );
    assert.equal(
      JSON.parse(await readFile(join(lockPath, "owner.json"), "utf8")).ownerToken,
      secondOwnerToken
    );
    await secondOwnerLease.release();
  });
});

test("rejects publication after the owner metadata changes", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    const baseFileSystem = createLockFileSystem();
    const replacementOwnerRecord = {
      ownerToken: secondOwnerToken,
      ownerProcessId: 41_079,
      createdAtMilliseconds: 100,
    };
    const ownerChangingFileSystem = createLockFileSystem({
      open: async (filePath, flags, mode) => {
        const metadataHandle = await baseFileSystem.open(filePath, flags, mode);
        if (filePath !== join(lockPath, "owner.json")) return metadataHandle;
        return {
          ...metadataHandle,
          writeFile: async (contents, encoding) => {
            await metadataHandle.writeFile(contents, encoding);
            await writeFile(filePath, JSON.stringify(replacementOwnerRecord), encoding);
          },
        };
      },
    });
    const lock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_078,
      ownerToken: firstOwnerToken,
      now: () => 100,
      fileSystem: ownerChangingFileSystem,
    });

    await assert.rejects(lock.acquire(), /owner changed before publication completed/);
    assert.deepEqual(
      JSON.parse(await readFile(join(lockPath, "owner.json"), "utf8")),
      replacementOwnerRecord
    );
  });
});

test("rejects acquisition when the lock directory disappears after mkdir", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    const disappearingDirectoryFileSystem = createLockFileSystem({
      mkdir: async (createdLockPath) => {
        await mkdir(createdLockPath);
        await rm(createdLockPath, { recursive: true, force: true });
      },
    });
    const lock = createThemeFileLock(lockPath, {
      ownerProcessId: 41_080,
      ownerToken: firstOwnerToken,
      fileSystem: disappearingDirectoryFileSystem,
    });

    await assert.rejects(lock.acquire(), /directory disappeared during acquisition/);
  });
});
