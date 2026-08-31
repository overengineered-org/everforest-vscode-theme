import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createThemeFileLock } from "../../dist/theme-file-lock.js";

const repositoryDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function withTemporaryLockPath(callback) {
  const temporaryDirectoryPath = await mkdtemp(join(tmpdir(), "everforest-lock-"));
  const lockPath = join(temporaryDirectoryPath, "themes.lock");
  try {
    return await callback(lockPath, temporaryDirectoryPath);
  } finally {
    await rm(temporaryDirectoryPath, { recursive: true, force: true });
  }
}

async function startLockOwnerProcess(lockPath, readyMessage = "ready") {
  const lockOwnerProcess = spawn(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import { createThemeFileLock } from "./dist/theme-file-lock.js";
       await createThemeFileLock(process.env.EVERFOREST_TEST_LOCK_PATH).acquire();
       process.stdout.write(${JSON.stringify(readyMessage)} + "\\n");
       setInterval(() => {}, 1_000);`,
    ],
    {
      cwd: repositoryDirectory,
      env: { ...process.env, EVERFOREST_TEST_LOCK_PATH: lockPath },
      stdio: ["ignore", "pipe", "inherit"],
    }
  );
  await new Promise((resolveReady, rejectReady) => {
    lockOwnerProcess.once("error", rejectReady);
    lockOwnerProcess.stdout.once("data", (childOutput) => {
      const lockOwnerOutput = childOutput.toString("utf8");
      if (lockOwnerOutput.includes(readyMessage)) resolveReady();
      else rejectReady(new Error(`Unexpected lock child output: ${lockOwnerOutput}`));
    });
  });
  return lockOwnerProcess;
}

test("holds one kernel lock without creating an artifact and releases idempotently", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    const lease = await createThemeFileLock(lockPath).acquire();
    await assert.rejects(lstat(lockPath), { code: "ENOENT" });

    await lease.release();
    await lease.release();
    await assert.rejects(lstat(lockPath), { code: "ENOENT" });
  });
});

test("serializes same-process contenders", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    const firstLease = await createThemeFileLock(lockPath).acquire();
    let retryCount = 0;
    const secondLease = await createThemeFileLock(lockPath, {
      retryLimit: 1,
      sleep: async () => {
        retryCount += 1;
        await firstLease.release();
      },
    }).acquire();

    assert.equal(retryCount, 1);
    await secondLease.release();
  });
});

test("times out without stealing another process lock", { timeout: 5_000 }, async () => {
  await withTemporaryLockPath(async (lockPath) => {
    const lockOwnerProcess = await startLockOwnerProcess(lockPath);
    try {
      let sleepCallCount = 0;
      await assert.rejects(
        createThemeFileLock(lockPath, {
          retryLimit: 1,
          sleep: async () => {
            sleepCallCount += 1;
          },
        }).acquire(),
        /after 2 attempts/
      );
      assert.equal(sleepCallCount, 1);
    } finally {
      lockOwnerProcess.kill("SIGKILL");
      await new Promise((resolveExit) => lockOwnerProcess.once("close", resolveExit));
    }
  });
});

test("recovers immediately after its owner process crashes", { timeout: 5_000 }, async () => {
  await withTemporaryLockPath(async (lockPath) => {
    const crashingOwnerProcess = await startLockOwnerProcess(lockPath);
    crashingOwnerProcess.kill("SIGKILL");
    await new Promise((resolveExit) => crashingOwnerProcess.once("close", resolveExit));

    const recoveredLease = await createThemeFileLock(lockPath, { retryLimit: 0 }).acquire();
    await recoveredLease.release();
  });
});

test("serializes aliases of the same canonical lock parent", async () => {
  await withTemporaryLockPath(async (lockPath, temporaryDirectoryPath) => {
    const canonicalParentPath = join(temporaryDirectoryPath, "canonical");
    const aliasParentPath = join(temporaryDirectoryPath, "alias");
    await mkdir(canonicalParentPath);
    await symlink(canonicalParentPath, aliasParentPath);
    const canonicalLockPath = join(canonicalParentPath, "themes.lock");
    const aliasLockPath = join(aliasParentPath, "themes.lock");

    const canonicalLease = await createThemeFileLock(canonicalLockPath).acquire();
    await assert.rejects(
      createThemeFileLock(aliasLockPath, { retryLimit: 0 }).acquire(),
      /after 1 attempts/
    );
    await canonicalLease.release();

    const aliasLease = await createThemeFileLock(aliasLockPath, { retryLimit: 0 }).acquire();
    await aliasLease.release();
    await assert.rejects(lstat(lockPath), { code: "ENOENT" });
  });
});

test("serializes real child processes under contention", { timeout: 10_000 }, async () => {
  await withTemporaryLockPath(async (lockPath, temporaryDirectoryPath) => {
    const counterPath = join(temporaryDirectoryPath, "counter.txt");
    await writeFile(counterPath, "0", "utf8");
    const workerSource = `
      import { readFile, writeFile } from "node:fs/promises";
      import { createThemeFileLock } from "./dist/theme-file-lock.js";
      const lease = await createThemeFileLock(process.env.EVERFOREST_TEST_LOCK_PATH, {
        retryLimit: 400,
        retryDelayMilliseconds: 5,
      }).acquire();
      try {
        const counter = Number(await readFile(process.env.EVERFOREST_TEST_COUNTER_PATH, "utf8"));
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
        await writeFile(process.env.EVERFOREST_TEST_COUNTER_PATH, String(counter + 1), "utf8");
      } finally {
        await lease.release();
      }
    `;
    const workerProcesses = Array.from({ length: 8 }, () =>
      spawn(process.execPath, ["--input-type=module", "--eval", workerSource], {
        cwd: repositoryDirectory,
        env: {
          ...process.env,
          EVERFOREST_TEST_COUNTER_PATH: counterPath,
          EVERFOREST_TEST_LOCK_PATH: lockPath,
        },
        stdio: ["ignore", "inherit", "inherit"],
      })
    );
    await Promise.all(
      workerProcesses.map(
        (workerProcess) =>
          new Promise((resolveWorker, rejectWorker) => {
            workerProcess.once("error", rejectWorker);
            workerProcess.once("close", (exitCode) => {
              if (exitCode === 0) resolveWorker();
              else rejectWorker(new Error(`Lock worker exited with code ${exitCode}`));
            });
          })
      )
    );

    assert.equal(await readFile(counterPath, "utf8"), "8");
  });
});

test("validates retry options", async () => {
  await withTemporaryLockPath(async (lockPath) => {
    assert.throws(() => createThemeFileLock(lockPath, { retryLimit: -1 }), /retry limit/);
    assert.throws(
      () => createThemeFileLock(lockPath, { retryDelayMilliseconds: -1 }),
      /retry delay/
    );
  });
});
