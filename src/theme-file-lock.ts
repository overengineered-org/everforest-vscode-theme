import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { basename, dirname, join } from "node:path";

const defaultLockRetryLimit = 40;
const defaultLockRetryDelayMilliseconds = 25;
const themeFileLockPortRangeStart = 20_000;
const themeFileLockPortRangeSize = 10_000;

export interface ThemeFileLockLease {
  release(): Promise<void>;
}

export interface ThemeFileLockOptions {
  sleep?: (delayMilliseconds: number) => Promise<void>;
  retryLimit?: number;
  retryDelayMilliseconds?: number;
}

function hasErrorCode(lockError: unknown, expectedErrorCode: string): boolean {
  return (
    typeof lockError === "object" &&
    lockError !== null &&
    "code" in lockError &&
    lockError.code === expectedErrorCode
  );
}

async function defaultSleep(delayMilliseconds: number): Promise<void> {
  await new Promise<void>((resolveSleep) => setTimeout(resolveSleep, delayMilliseconds));
}

async function resolveThemeFileLockPort(lockPath: string): Promise<number> {
  const canonicalLockParentPath = await realpath(dirname(lockPath));
  const canonicalLockIdentity = join(canonicalLockParentPath, basename(lockPath));
  const platformLockIdentity =
    process.platform === "win32" ? canonicalLockIdentity.toLowerCase() : canonicalLockIdentity;
  const lockIdentityHash = createHash("sha256").update(platformLockIdentity).digest();
  return (
    themeFileLockPortRangeStart + (lockIdentityHash.readUInt32BE(0) % themeFileLockPortRangeSize)
  );
}

function tryListenForThemeFileLock(lockPort: number): Promise<Server | undefined> {
  return new Promise((resolveListen, rejectListen) => {
    const lockServer = createServer((clientSocket) => clientSocket.destroy());
    const handleListenError = (listenError: Error) => {
      lockServer.off("listening", handleListening);
      if (hasErrorCode(listenError, "EADDRINUSE")) resolveListen(undefined);
      else rejectListen(listenError);
    };
    const handleListening = () => {
      lockServer.off("error", handleListenError);
      lockServer.unref();
      resolveListen(lockServer);
    };
    lockServer.once("error", handleListenError);
    lockServer.once("listening", handleListening);
    lockServer.listen({ exclusive: true, host: "127.0.0.1", port: lockPort });
  });
}

function closeThemeFileLockServer(lockServer: Server): Promise<void> {
  return new Promise((resolveClose, rejectClose) => {
    lockServer.close((closeError) => {
      if (closeError) rejectClose(closeError);
      else resolveClose();
    });
  });
}

/** Coordinates extension processes with a kernel mutex released automatically on process exit. */
export function createThemeFileLock(lockPath: string, options: ThemeFileLockOptions = {}) {
  const waitBeforeRetry = options.sleep ?? defaultSleep;
  const retryLimit = options.retryLimit ?? defaultLockRetryLimit;
  const retryDelayMilliseconds =
    options.retryDelayMilliseconds ?? defaultLockRetryDelayMilliseconds;

  if (!Number.isSafeInteger(retryLimit) || retryLimit < 0) {
    throw new Error("Theme file lock retry limit must be a non-negative integer");
  }
  if (!Number.isFinite(retryDelayMilliseconds) || retryDelayMilliseconds < 0) {
    throw new Error("Theme file lock retry delay must be non-negative");
  }

  async function acquire(): Promise<ThemeFileLockLease> {
    const lockPort = await resolveThemeFileLockPort(lockPath);
    for (let acquisitionAttempt = 0; acquisitionAttempt <= retryLimit; acquisitionAttempt += 1) {
      const lockServer = await tryListenForThemeFileLock(lockPort);
      if (lockServer) {
        let releasePromise: Promise<void> | undefined;
        return {
          release: () => (releasePromise ??= closeThemeFileLockServer(lockServer)),
        };
      }
      if (acquisitionAttempt < retryLimit) {
        await waitBeforeRetry(retryDelayMilliseconds);
      }
    }

    throw new Error(
      `Timed out acquiring theme file lock after ${retryLimit + 1} attempts: ${lockPath}`
    );
  }

  return { acquire };
}
