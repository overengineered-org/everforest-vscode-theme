import assert from "node:assert/strict";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
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
import {
  defaultThemeFileTransactionJournalPath,
  recoverConfiguredThemeFileTransaction,
  replaceConfiguredThemeFiles,
} from "../../dist/theme-file-transaction.js";

const darkThemeName = "Everforest Complete Dark";
const lightThemeName = "Everforest Complete Light";
const darkThemeType = "dark";
const lightThemeType = "light";
const darkThemeFileName = "everforest-complete-dark-color-theme.json";
const lightThemeFileName = "everforest-complete-light-color-theme.json";
const transactionToken = "11111111-1111-4111-8111-111111111111";
const recoveryToken = "22222222-2222-4222-8222-222222222222";

function createThemeSource(themeName, themeType, marker) {
  return `${JSON.stringify({
    $schema: "vscode://schemas/color-theme",
    name: themeName,
    type: themeType,
    semanticHighlighting: true,
    semanticTokenColors: { keyword: marker },
    colors: { "editor.foreground": marker },
    tokenColors: [],
  })}\n`;
}

const oldDarkThemeSource = createThemeSource(darkThemeName, darkThemeType, "#111111");
const oldLightThemeSource = createThemeSource(lightThemeName, lightThemeType, "#222222");
const newDarkThemeSource = createThemeSource(darkThemeName, darkThemeType, "#333333");
const newLightThemeSource = createThemeSource(lightThemeName, lightThemeType, "#444444");

function createThemeFileSystem(overrides = {}) {
  return {
    readFile,
    open: async (filePath, flags, mode) => {
      const fileHandle = await open(filePath, flags, mode);
      return {
        writeFile: (contents, encoding) => fileHandle.writeFile(contents, encoding),
        read: (buffer, offset, length, position) =>
          fileHandle.read(buffer, offset, length, position),
        stat: () => fileHandle.stat(),
        chmod: (fileMode) => fileHandle.chmod(fileMode),
        sync: () => fileHandle.sync(),
        close: () => fileHandle.close(),
      };
    },
    lstat,
    rename,
    unlink,
    rmdir,
    ...overrides,
  };
}

async function withThemeFiles(callback) {
  const temporaryDirectoryPath = await mkdtemp(join(tmpdir(), "everforest-transaction-"));
  const themeFilePaths = {
    darkThemePath: join(temporaryDirectoryPath, darkThemeFileName),
    lightThemePath: join(temporaryDirectoryPath, lightThemeFileName),
  };
  await Promise.all([
    writeFile(themeFilePaths.darkThemePath, oldDarkThemeSource, "utf8"),
    writeFile(themeFilePaths.lightThemePath, oldLightThemeSource, "utf8"),
  ]);
  try {
    return await callback(temporaryDirectoryPath, themeFilePaths);
  } finally {
    await rm(temporaryDirectoryPath, { recursive: true, force: true });
  }
}

function createThemeFileSources() {
  return {
    darkThemeSource: newDarkThemeSource,
    lightThemeSource: newLightThemeSource,
  };
}

function createArtifactPaths(temporaryDirectoryPath, token) {
  const darkThemePath = join(temporaryDirectoryPath, darkThemeFileName);
  const lightThemePath = join(temporaryDirectoryPath, lightThemeFileName);
  const journalPath = join(temporaryDirectoryPath, ".everforest-complete-theme.transaction.json");
  return {
    darkThemeTempPath: `${darkThemePath}.${token}.tmp`,
    lightThemeTempPath: `${lightThemePath}.${token}.tmp`,
    darkThemeBackupPath: `${darkThemePath}.${token}.bak`,
    lightThemeBackupPath: `${lightThemePath}.${token}.bak`,
    darkThemeRestorePath: `${darkThemePath}.${token}.restore`,
    lightThemeRestorePath: `${lightThemePath}.${token}.restore`,
    journalTempPath: `${journalPath}.${token}.tmp`,
    journalPath,
  };
}

function createJournal(token, phase = "preparing", modes = {}) {
  return {
    journalVersion: 2,
    transactionToken: token,
    phase,
    darkThemeExisted: true,
    darkThemeMode: modes.dark ?? 0o644,
    lightThemeExisted: true,
    lightThemeMode: modes.light ?? 0o644,
  };
}

function createError(message, code = "EIO") {
  const transactionError = new Error(message);
  transactionError.code = code;
  return transactionError;
}

test("replaces both fixed theme files durably and cleans sibling artifacts", async () => {
  await withThemeFiles(async (temporaryDirectoryPath, themeFilePaths) => {
    await writeFile(join(temporaryDirectoryPath, "unrelated.tmp"), "keep me");
    assert.equal(
      await replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
        transactionToken,
      }),
      true
    );
    assert.equal(await readFile(themeFilePaths.darkThemePath, "utf8"), newDarkThemeSource);
    assert.equal(await readFile(themeFilePaths.lightThemePath, "utf8"), newLightThemeSource);
    assert.deepEqual(await readdir(temporaryDirectoryPath), [
      darkThemeFileName,
      lightThemeFileName,
      "unrelated.tmp",
    ]);
  });
});

test("creates a missing configured target without adding a journal path", async () => {
  await withThemeFiles(async (_temporaryDirectoryPath, themeFilePaths) => {
    await rm(themeFilePaths.darkThemePath);
    assert.equal(
      await replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
        transactionToken,
      }),
      true
    );
    assert.equal(await readFile(themeFilePaths.darkThemePath, "utf8"), newDarkThemeSource);
    assert.equal(await readFile(themeFilePaths.lightThemePath, "utf8"), newLightThemeSource);
    await assert.rejects(readFile(defaultThemeFileTransactionJournalPath(themeFilePaths), "utf8"), {
      code: "ENOENT",
    });
  });
});

test("does not replace an unchanged pair and validates complete VS Code theme shape", async () => {
  await withThemeFiles(async (_temporaryDirectoryPath, themeFilePaths) => {
    assert.equal(
      await replaceConfiguredThemeFiles(
        themeFilePaths,
        { darkThemeSource: oldDarkThemeSource, lightThemeSource: oldLightThemeSource },
        { transactionToken }
      ),
      false
    );
    await assert.rejects(
      replaceConfiguredThemeFiles(
        themeFilePaths,
        {
          darkThemeSource: JSON.stringify({ name: darkThemeName, type: darkThemeType }),
          lightThemeSource: newLightThemeSource,
        },
        { transactionToken: recoveryToken }
      ),
      /colors must be a plain object/
    );
    assert.equal(await readFile(themeFilePaths.darkThemePath, "utf8"), oldDarkThemeSource);
    assert.equal(await readFile(themeFilePaths.lightThemePath, "utf8"), oldLightThemeSource);
  });
});

test("rejects every incomplete or mismatched VS Code theme shape before writing", async () => {
  await withThemeFiles(async (_temporaryDirectoryPath, themeFilePaths) => {
    const validTheme = JSON.parse(newDarkThemeSource);
    const invalidThemeSources = [
      ["array", JSON.stringify([])],
      ["colors", JSON.stringify({ ...validTheme, colors: [] })],
      ["tokenColors", JSON.stringify({ ...validTheme, tokenColors: {} })],
      ["semanticTokenColors", JSON.stringify({ ...validTheme, semanticTokenColors: [] })],
      ["type", JSON.stringify({ ...validTheme, type: "light" })],
      ["name", JSON.stringify({ ...validTheme, name: "Other Theme" })],
    ];
    for (const [invalidField, invalidDarkThemeSource] of invalidThemeSources) {
      await assert.rejects(
        replaceConfiguredThemeFiles(
          themeFilePaths,
          { darkThemeSource: invalidDarkThemeSource, lightThemeSource: newLightThemeSource },
          { transactionToken: recoveryToken }
        ),
        new RegExp(invalidField === "array" ? "plain object" : invalidField)
      );
    }
    assert.equal(await readFile(themeFilePaths.darkThemePath, "utf8"), oldDarkThemeSource);
    assert.equal(await readFile(themeFilePaths.lightThemePath, "utf8"), oldLightThemeSource);
  });
});

test("bounds theme and journal reads and rejects non-regular sentinels", async () => {
  await withThemeFiles(async (temporaryDirectoryPath, themeFilePaths) => {
    const oversizedThemeSource = createThemeSource(
      darkThemeName,
      darkThemeType,
      `#${"a".repeat(1_048_576)}`
    );
    await assert.rejects(
      replaceConfiguredThemeFiles(
        themeFilePaths,
        { darkThemeSource: oversizedThemeSource, lightThemeSource: newLightThemeSource },
        { transactionToken }
      ),
      /exceeds 1048576 bytes/
    );
    assert.equal(await readFile(themeFilePaths.darkThemePath, "utf8"), oldDarkThemeSource);

    const journalPath = defaultThemeFileTransactionJournalPath(themeFilePaths);
    await writeFile(journalPath, "x".repeat(65_537));
    await assert.rejects(
      recoverConfiguredThemeFileTransaction(themeFilePaths),
      /exceeds 65536 bytes/
    );
    await unlink(journalPath);

    const sentinelFileSystem = createThemeFileSystem({
      lstat: async (filePath) => {
        if (filePath === themeFilePaths.darkThemePath) {
          return {
            mode: 0o644,
            mtimeMs: 0,
            isSymbolicLink: () => false,
            isDirectory: () => false,
            isFile: () => false,
          };
        }
        return lstat(filePath);
      },
      open: async () => {
        throw new Error("sentinel must not be opened");
      },
    });
    await assert.rejects(
      replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
        transactionToken: recoveryToken,
        fileSystem: sentinelFileSystem,
      }),
      /regular file/
    );
  });
});

test("rolls back the exact old pair and modes when second rename fails", async () => {
  await withThemeFiles(async (_temporaryDirectoryPath, themeFilePaths) => {
    await chmod(themeFilePaths.darkThemePath, 0o600);
    await chmod(themeFilePaths.lightThemePath, 0o640);
    const failingFileSystem = createThemeFileSystem({
      rename: async (sourcePath, destinationPath) => {
        if (destinationPath === themeFilePaths.lightThemePath && sourcePath.endsWith(".tmp")) {
          const renameError = new Error("light rename failed");
          renameError.code = "EIO";
          throw renameError;
        }
        return rename(sourcePath, destinationPath);
      },
    });
    await assert.rejects(
      replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
        transactionToken,
        fileSystem: failingFileSystem,
      }),
      /light rename failed/
    );
    assert.equal(await readFile(themeFilePaths.darkThemePath, "utf8"), oldDarkThemeSource);
    assert.equal(await readFile(themeFilePaths.lightThemePath, "utf8"), oldLightThemeSource);
    assert.equal((await lstat(themeFilePaths.darkThemePath)).mode & 0o7777, 0o600);
    assert.equal((await lstat(themeFilePaths.lightThemePath)).mode & 0o7777, 0o640);
    assert.deepEqual(await readdir(_temporaryDirectoryPath), [
      darkThemeFileName,
      lightThemeFileName,
    ]);
  });
});

test("preserves the journal and backups when rollback fails", async () => {
  await withThemeFiles(async (temporaryDirectoryPath, themeFilePaths) => {
    const failingFileSystem = createThemeFileSystem({
      rename: async (sourcePath, destinationPath) => {
        if (destinationPath === themeFilePaths.lightThemePath) {
          const renameError = new Error(
            sourcePath.endsWith(".tmp") ? "light commit failed" : "light rollback failed"
          );
          renameError.code = "EIO";
          throw renameError;
        }
        return rename(sourcePath, destinationPath);
      },
    });
    await assert.rejects(
      replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
        transactionToken,
        fileSystem: failingFileSystem,
      }),
      AggregateError
    );
    assert.equal(
      JSON.parse(await readFile(defaultThemeFileTransactionJournalPath(themeFilePaths), "utf8"))
        .phase,
      "dark-replaced"
    );
    assert.ok(
      (await readdir(temporaryDirectoryPath)).some((fileName) => fileName.endsWith(".bak"))
    );
  });
});

test("cleans a preparing journal when durable artifact creation fails", async () => {
  await withThemeFiles(async (_temporaryDirectoryPath, themeFilePaths) => {
    const baseFileSystem = createThemeFileSystem();
    const failingFileSystem = createThemeFileSystem({
      open: async (filePath, flags, mode) => {
        if (
          filePath.includes(`.${transactionToken}.tmp`) &&
          !filePath.includes("transaction.json")
        ) {
          throw createError("theme temp open failed");
        }
        return baseFileSystem.open(filePath, flags, mode);
      },
    });
    await assert.rejects(
      replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
        transactionToken,
        fileSystem: failingFileSystem,
      }),
      /theme temp open failed/
    );
    await assert.rejects(readFile(defaultThemeFileTransactionJournalPath(themeFilePaths), "utf8"), {
      code: "ENOENT",
    });
    assert.equal(await readFile(themeFilePaths.darkThemePath, "utf8"), oldDarkThemeSource);
    assert.equal(await readFile(themeFilePaths.lightThemePath, "utf8"), oldLightThemeSource);
  });
});

test("cleans a preparing journal when journal replacement fails", async () => {
  await withThemeFiles(async (_temporaryDirectoryPath, themeFilePaths) => {
    const failingFileSystem = createThemeFileSystem({
      rename: async (sourcePath, destinationPath) => {
        if (destinationPath === defaultThemeFileTransactionJournalPath(themeFilePaths)) {
          throw createError("journal rename failed");
        }
        return rename(sourcePath, destinationPath);
      },
    });
    await assert.rejects(
      replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
        transactionToken,
        fileSystem: failingFileSystem,
      }),
      /journal rename failed/
    );
    assert.equal(await readFile(themeFilePaths.darkThemePath, "utf8"), oldDarkThemeSource);
    assert.equal(await readFile(themeFilePaths.lightThemePath, "utf8"), oldLightThemeSource);
    await assert.rejects(readFile(defaultThemeFileTransactionJournalPath(themeFilePaths), "utf8"), {
      code: "ENOENT",
    });
  });
});

test("does not adapt cross-device rename and rolls back safely", async () => {
  await withThemeFiles(async (_temporaryDirectoryPath, themeFilePaths) => {
    const failingFileSystem = createThemeFileSystem({
      rename: async (sourcePath, destinationPath) => {
        if (destinationPath === themeFilePaths.darkThemePath && sourcePath.endsWith(".tmp")) {
          throw createError("cross-device rename", "EXDEV");
        }
        return rename(sourcePath, destinationPath);
      },
    });
    await assert.rejects(
      replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
        transactionToken,
        fileSystem: failingFileSystem,
      }),
      /cross-device rename/
    );
    assert.equal(await readFile(themeFilePaths.darkThemePath, "utf8"), oldDarkThemeSource);
    assert.equal(await readFile(themeFilePaths.lightThemePath, "utf8"), oldLightThemeSource);
  });
});

test("accepts unsupported sync adapters but fails durable file sync errors", async () => {
  await withThemeFiles(async (_temporaryDirectoryPath, themeFilePaths) => {
    const baseFileSystem = createThemeFileSystem();
    const unsupportedSyncFileSystem = createThemeFileSystem({
      open: async (filePath, flags, mode) => {
        const fileHandle = await baseFileSystem.open(filePath, flags, mode);
        return {
          ...fileHandle,
          sync: async () => {
            if (filePath !== _temporaryDirectoryPath)
              throw createError("sync unsupported", "EINVAL");
            await fileHandle.sync();
          },
        };
      },
    });
    assert.equal(
      await replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
        transactionToken,
        fileSystem: unsupportedSyncFileSystem,
      }),
      true
    );

    await rm(themeFilePaths.darkThemePath);
    await writeFile(themeFilePaths.darkThemePath, oldDarkThemeSource, "utf8");
    const durableFailureFileSystem = createThemeFileSystem({
      open: async (filePath, flags, mode) => {
        const fileHandle = await baseFileSystem.open(filePath, flags, mode);
        return {
          ...fileHandle,
          sync: async () => {
            if (filePath.endsWith(".tmp")) throw createError("sync failed");
            await fileHandle.sync();
          },
        };
      },
    });
    await assert.rejects(
      replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
        transactionToken: recoveryToken,
        fileSystem: durableFailureFileSystem,
      }),
      /sync failed/
    );
    assert.equal(await readFile(themeFilePaths.darkThemePath, "utf8"), oldDarkThemeSource);
  });
});

test("cleans artifacts when directory sync fails and preserves an artifact symlink", async () => {
  await withThemeFiles(async (temporaryDirectoryPath, themeFilePaths) => {
    const baseFileSystem = createThemeFileSystem();
    let directorySyncCount = 0;
    const failingFileSystem = createThemeFileSystem({
      open: async (filePath, flags, mode) => {
        const fileHandle = await baseFileSystem.open(filePath, flags, mode);
        if (filePath === temporaryDirectoryPath) {
          directorySyncCount += 1;
          return {
            ...fileHandle,
            sync: async () => {
              if (directorySyncCount === 3) throw createError("directory sync failed");
              await fileHandle.sync();
            },
          };
        }
        return fileHandle;
      },
    });
    await assert.rejects(
      replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
        transactionToken,
        fileSystem: failingFileSystem,
      }),
      /directory sync failed/
    );
    assert.equal(await readFile(themeFilePaths.darkThemePath, "utf8"), oldDarkThemeSource);
    assert.equal(await readFile(themeFilePaths.lightThemePath, "utf8"), oldLightThemeSource);

    const artifacts = createArtifactPaths(temporaryDirectoryPath, recoveryToken);
    await symlink(themeFilePaths.lightThemePath, artifacts.darkThemeTempPath);
    await writeFile(artifacts.journalPath, JSON.stringify(createJournal(recoveryToken)));
    await assert.rejects(
      recoverConfiguredThemeFileTransaction(themeFilePaths),
      (error) =>
        error instanceof AggregateError &&
        error.errors.some((nestedError) => /Refusing symbolic link/.test(String(nestedError)))
    );
    await unlink(artifacts.journalPath);
    await unlink(artifacts.darkThemeTempPath);
  });
});

test("keeps committed files when cleanup fails, then recovery retries cleanup", async () => {
  await withThemeFiles(async (_temporaryDirectoryPath, themeFilePaths) => {
    const failingFileSystem = createThemeFileSystem({
      unlink: async (filePath) => {
        if (filePath.endsWith(".bak")) {
          const cleanupError = new Error("backup cleanup failed");
          cleanupError.code = "EIO";
          throw cleanupError;
        }
        return unlink(filePath);
      },
    });
    await assert.rejects(
      replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
        transactionToken,
        fileSystem: failingFileSystem,
      }),
      AggregateError
    );
    assert.equal(await readFile(themeFilePaths.darkThemePath, "utf8"), newDarkThemeSource);
    assert.equal(await readFile(themeFilePaths.lightThemePath, "utf8"), newLightThemeSource);
    await recoverConfiguredThemeFileTransaction(themeFilePaths);
    await assert.rejects(readFile(defaultThemeFileTransactionJournalPath(themeFilePaths), "utf8"), {
      code: "ENOENT",
    });
  });
});

test("preparing recovery removes only artifacts, while prepared recovery restores both files", async () => {
  await withThemeFiles(async (temporaryDirectoryPath, themeFilePaths) => {
    const preparingArtifacts = createArtifactPaths(temporaryDirectoryPath, transactionToken);
    await Promise.all([
      writeFile(preparingArtifacts.darkThemeTempPath, newDarkThemeSource),
      writeFile(preparingArtifacts.lightThemeTempPath, newLightThemeSource),
      writeFile(preparingArtifacts.journalPath, JSON.stringify(createJournal(transactionToken))),
    ]);
    await recoverConfiguredThemeFileTransaction(themeFilePaths);
    assert.equal(await readFile(themeFilePaths.darkThemePath, "utf8"), oldDarkThemeSource);
    assert.equal(await readFile(themeFilePaths.lightThemePath, "utf8"), oldLightThemeSource);
    await assert.rejects(readFile(preparingArtifacts.journalPath, "utf8"), { code: "ENOENT" });

    const preparedArtifacts = createArtifactPaths(temporaryDirectoryPath, recoveryToken);
    await Promise.all([
      writeFile(preparedArtifacts.darkThemeTempPath, newDarkThemeSource),
      writeFile(preparedArtifacts.lightThemeTempPath, newLightThemeSource),
      writeFile(preparedArtifacts.darkThemeBackupPath, oldDarkThemeSource),
      writeFile(preparedArtifacts.lightThemeBackupPath, oldLightThemeSource),
      writeFile(
        preparedArtifacts.journalPath,
        JSON.stringify(createJournal(recoveryToken, "prepared"))
      ),
      writeFile(themeFilePaths.darkThemePath, newDarkThemeSource),
      writeFile(themeFilePaths.lightThemePath, newLightThemeSource),
    ]);
    await recoverConfiguredThemeFileTransaction(themeFilePaths);
    assert.equal(await readFile(themeFilePaths.darkThemePath, "utf8"), oldDarkThemeSource);
    assert.equal(await readFile(themeFilePaths.lightThemePath, "utf8"), oldLightThemeSource);
    await assert.rejects(readFile(preparedArtifacts.journalPath, "utf8"), { code: "ENOENT" });
  });
});

test("recovers a crash after backups exist but before prepared journal persistence", async () => {
  await withThemeFiles(async (temporaryDirectoryPath, themeFilePaths) => {
    const artifacts = createArtifactPaths(temporaryDirectoryPath, transactionToken);
    await Promise.all([
      writeFile(artifacts.darkThemeTempPath, newDarkThemeSource),
      writeFile(artifacts.lightThemeTempPath, newLightThemeSource),
      writeFile(artifacts.darkThemeBackupPath, oldDarkThemeSource),
      writeFile(artifacts.lightThemeBackupPath, oldLightThemeSource),
      writeFile(artifacts.journalPath, JSON.stringify(createJournal(transactionToken))),
    ]);
    await rm(themeFilePaths.darkThemePath);
    await rm(themeFilePaths.lightThemePath);

    await recoverConfiguredThemeFileTransaction(themeFilePaths);

    assert.equal(await readFile(themeFilePaths.darkThemePath, "utf8"), oldDarkThemeSource);
    assert.equal(await readFile(themeFilePaths.lightThemePath, "utf8"), oldLightThemeSource);
    await assert.rejects(readFile(artifacts.journalPath, "utf8"), { code: "ENOENT" });
  });
});

test("cleans a partial preparing backup without blocking the next transaction", async () => {
  await withThemeFiles(async (temporaryDirectoryPath, themeFilePaths) => {
    const artifacts = createArtifactPaths(temporaryDirectoryPath, transactionToken);
    await Promise.all([
      writeFile(artifacts.darkThemeTempPath, newDarkThemeSource),
      writeFile(artifacts.lightThemeTempPath, newLightThemeSource),
      writeFile(artifacts.darkThemeBackupPath, oldDarkThemeSource),
      writeFile(artifacts.journalPath, JSON.stringify(createJournal(transactionToken))),
    ]);

    await recoverConfiguredThemeFileTransaction(themeFilePaths);

    assert.equal(await readFile(themeFilePaths.darkThemePath, "utf8"), oldDarkThemeSource);
    assert.equal(await readFile(themeFilePaths.lightThemePath, "utf8"), oldLightThemeSource);
    assert.deepEqual(await readdir(temporaryDirectoryPath), [
      darkThemeFileName,
      lightThemeFileName,
    ]);
    assert.equal(
      await replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
        transactionToken,
      }),
      true
    );
  });
});

test("recovers dark-replaced journals and handles an originally absent dark file", async () => {
  await withThemeFiles(async (temporaryDirectoryPath, themeFilePaths) => {
    const artifacts = createArtifactPaths(temporaryDirectoryPath, transactionToken);
    await rm(themeFilePaths.darkThemePath);
    await Promise.all([
      writeFile(artifacts.darkThemeTempPath, newDarkThemeSource),
      writeFile(artifacts.lightThemeTempPath, newLightThemeSource),
      writeFile(artifacts.lightThemeBackupPath, oldLightThemeSource),
      writeFile(
        artifacts.journalPath,
        JSON.stringify({
          ...createJournal(transactionToken, "dark-replaced"),
          darkThemeExisted: false,
          darkThemeMode: undefined,
        })
      ),
      writeFile(themeFilePaths.darkThemePath, newDarkThemeSource),
    ]);
    await recoverConfiguredThemeFileTransaction(themeFilePaths);
    await assert.rejects(readFile(themeFilePaths.darkThemePath, "utf8"), { code: "ENOENT" });
    assert.equal(await readFile(themeFilePaths.lightThemePath, "utf8"), oldLightThemeSource);
    await assert.rejects(readFile(artifacts.journalPath, "utf8"), { code: "ENOENT" });
  });
});

test("rolled-back recovery only retries cleanup and keeps restored files", async () => {
  await withThemeFiles(async (temporaryDirectoryPath, themeFilePaths) => {
    const artifacts = createArtifactPaths(temporaryDirectoryPath, transactionToken);
    await Promise.all([
      writeFile(artifacts.darkThemeBackupPath, oldDarkThemeSource),
      writeFile(artifacts.lightThemeBackupPath, oldLightThemeSource),
      writeFile(artifacts.darkThemeTempPath, newDarkThemeSource),
      writeFile(
        artifacts.journalPath,
        JSON.stringify(createJournal(transactionToken, "rolled-back"))
      ),
      writeFile(themeFilePaths.darkThemePath, oldDarkThemeSource),
      writeFile(themeFilePaths.lightThemePath, oldLightThemeSource),
    ]);
    await recoverConfiguredThemeFileTransaction(themeFilePaths);
    assert.equal(await readFile(themeFilePaths.darkThemePath, "utf8"), oldDarkThemeSource);
    assert.equal(await readFile(themeFilePaths.lightThemePath, "utf8"), oldLightThemeSource);
    assert.deepEqual(await readdir(temporaryDirectoryPath), [
      darkThemeFileName,
      lightThemeFileName,
    ]);
  });
});

test("rejects arbitrary targets, invalid journal fields, and symbolic links", async () => {
  await withThemeFiles(async (temporaryDirectoryPath, themeFilePaths) => {
    await assert.rejects(
      replaceConfiguredThemeFiles(
        {
          darkThemePath: join(temporaryDirectoryPath, "dark.json"),
          lightThemePath: themeFilePaths.lightThemePath,
        },
        createThemeFileSources(),
        { transactionToken }
      ),
      /fixed sibling/
    );
    const journalPath = defaultThemeFileTransactionJournalPath(themeFilePaths);
    await writeFile(
      journalPath,
      JSON.stringify({ ...createJournal(transactionToken), maliciousPath: "/tmp/outside" })
    );
    await assert.rejects(
      recoverConfiguredThemeFileTransaction(themeFilePaths),
      /Invalid theme file transaction journal contents/
    );
    await unlink(journalPath);
    await symlink(themeFilePaths.lightThemePath, journalPath);
    await assert.rejects(
      recoverConfiguredThemeFileTransaction(themeFilePaths),
      /Refusing symbolic link/
    );
    await unlink(journalPath);
    await rm(themeFilePaths.darkThemePath);
    await symlink(themeFilePaths.lightThemePath, themeFilePaths.darkThemePath);
    await assert.rejects(
      replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), { transactionToken }),
      /Refusing symbolic link/
    );
  });
});

test("rejects malformed transaction journals without following journal paths", async () => {
  await withThemeFiles(async (temporaryDirectoryPath, themeFilePaths) => {
    const journalPath = defaultThemeFileTransactionJournalPath(themeFilePaths);
    const malformedJournals = [
      { ...createJournal(transactionToken), journalVersion: 1 },
      { ...createJournal(transactionToken), transactionToken: "unsafe-token" },
      { ...createJournal(transactionToken), phase: "unknown" },
      { ...createJournal(transactionToken), darkThemeMode: 0o10000 },
      { ...createJournal(transactionToken), darkThemeMode: "0644" },
      { ...createJournal(transactionToken), darkThemeMode: undefined },
      { ...createJournal(transactionToken), lightThemeMode: undefined },
      { ...createJournal(transactionToken), lightThemeExisted: false },
    ];
    for (const malformedJournal of malformedJournals) {
      await writeFile(journalPath, JSON.stringify(malformedJournal));
      await assert.rejects(
        recoverConfiguredThemeFileTransaction(themeFilePaths),
        /Invalid theme file transaction journal contents/
      );
      await unlink(journalPath);
    }

    await writeFile(journalPath, "not-json");
    await assert.rejects(
      recoverConfiguredThemeFileTransaction(themeFilePaths),
      /Invalid theme file transaction journal:/
    );
    await unlink(journalPath);

    const linkedThemesDirectory = join(temporaryDirectoryPath, "linked-themes");
    await symlink(temporaryDirectoryPath, linkedThemesDirectory);
    await assert.rejects(
      recoverConfiguredThemeFileTransaction({
        darkThemePath: join(linkedThemesDirectory, darkThemeFileName),
        lightThemePath: join(linkedThemesDirectory, lightThemeFileName),
      }),
      /Refusing symbolic link/
    );
  });
});

test("preserves a journal when recovery artifacts are missing, malformed, or wrong-mode", async () => {
  await withThemeFiles(async (temporaryDirectoryPath, themeFilePaths) => {
    const artifacts = createArtifactPaths(temporaryDirectoryPath, transactionToken);
    const journal = createJournal(transactionToken, "prepared");
    await writeFile(artifacts.journalPath, JSON.stringify(journal));
    await assert.rejects(
      recoverConfiguredThemeFileTransaction(themeFilePaths),
      /Could not recover interrupted theme file transaction/
    );
    assert.equal(await readFile(artifacts.journalPath, "utf8"), JSON.stringify(journal));
    await unlink(artifacts.journalPath);

    await Promise.all([
      writeFile(artifacts.journalPath, JSON.stringify(journal)),
      writeFile(artifacts.darkThemeBackupPath, "not-json"),
      writeFile(artifacts.lightThemeBackupPath, oldLightThemeSource),
      writeFile(themeFilePaths.darkThemePath, newDarkThemeSource),
      writeFile(themeFilePaths.lightThemePath, newLightThemeSource),
    ]);
    await assert.rejects(
      recoverConfiguredThemeFileTransaction(themeFilePaths),
      /Could not recover interrupted theme file transaction/
    );
    await rm(artifacts.journalPath);
    await rm(artifacts.darkThemeBackupPath);
    await rm(artifacts.lightThemeBackupPath);

    await Promise.all([
      writeFile(artifacts.journalPath, JSON.stringify(journal)),
      writeFile(artifacts.darkThemeBackupPath, oldDarkThemeSource),
      writeFile(artifacts.lightThemeBackupPath, oldLightThemeSource),
      writeFile(themeFilePaths.darkThemePath, newDarkThemeSource),
      writeFile(themeFilePaths.lightThemePath, newLightThemeSource),
    ]);
    const baseFileSystem = createThemeFileSystem();
    const wrongModeFileSystem = createThemeFileSystem({
      lstat: async (filePath) => {
        const fileStats = await lstat(filePath);
        if (filePath === artifacts.darkThemeBackupPath) {
          return {
            mode: 0o600,
            mtimeMs: fileStats.mtimeMs,
            isSymbolicLink: () => fileStats.isSymbolicLink(),
            isDirectory: () => fileStats.isDirectory(),
          };
        }
        return fileStats;
      },
      open: async (filePath, flags, mode) => {
        const fileHandle = await baseFileSystem.open(filePath, flags, mode);
        if (filePath !== artifacts.darkThemeBackupPath) return fileHandle;
        return {
          ...fileHandle,
          stat: async () => ({
            mode: 0o600,
            mtimeMs: (await lstat(filePath)).mtimeMs,
            isSymbolicLink: () => false,
            isDirectory: () => false,
            isFile: () => true,
          }),
        };
      },
    });
    await assert.rejects(
      recoverConfiguredThemeFileTransaction(themeFilePaths, { fileSystem: wrongModeFileSystem }),
      /Could not recover interrupted theme file transaction/
    );
    await assert.doesNotReject(readFile(artifacts.journalPath, "utf8"));
  });
});

test("rejects artifact identity and content drift through the file adapter", async () => {
  const runAdapterCase = async (adapterFactory, expectedError) => {
    await withThemeFiles(async (_temporaryDirectoryPath, themeFilePaths) => {
      const baseFileSystem = createThemeFileSystem();
      const adapterFileSystem = createThemeFileSystem({
        open: (filePath, flags, mode) => adapterFactory(baseFileSystem, filePath, flags, mode),
      });
      await assert.rejects(
        replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
          transactionToken,
          fileSystem: adapterFileSystem,
        }),
        expectedError
      );
      assert.equal(await readFile(themeFilePaths.darkThemePath, "utf8"), oldDarkThemeSource);
      assert.equal(await readFile(themeFilePaths.lightThemePath, "utf8"), oldLightThemeSource);
    });
  };

  const artifactOpenCounts = new Map();
  await runAdapterCase(async (baseFileSystem, filePath, flags, mode) => {
    const fileHandle = await baseFileSystem.open(filePath, flags, mode);
    const artifactOpenCount = (artifactOpenCounts.get(filePath) ?? 0) + 1;
    artifactOpenCounts.set(filePath, artifactOpenCount);
    if (
      artifactOpenCount > 1 &&
      filePath.endsWith(`.${transactionToken}.tmp`) &&
      !filePath.includes("transaction.json")
    ) {
      return {
        ...fileHandle,
        stat: async () => ({
          mode: 0o644,
          mtimeMs: 0,
          isSymbolicLink: () => false,
          isDirectory: () => false,
          isFile: () => false,
        }),
      };
    }
    return fileHandle;
  }, /must be a regular file/);

  await runAdapterCase(async (baseFileSystem, filePath, flags, mode) => {
    const fileHandle = await baseFileSystem.open(filePath, flags, mode);
    if (!filePath.endsWith(`.${transactionToken}.tmp`) || filePath.includes("transaction.json")) {
      return fileHandle;
    }
    return {
      ...fileHandle,
      stat: async () => ({
        mode: 0o644,
        mtimeMs: 0,
        isSymbolicLink: () => false,
        isDirectory: () => false,
        isFile: () => true,
      }),
      read: undefined,
    };
  }, /adapter must support bounded reads/);

  await runAdapterCase(async (baseFileSystem, filePath, flags, mode) => {
    const fileHandle = await baseFileSystem.open(filePath, flags, mode);
    if (!filePath.endsWith(`.${transactionToken}.tmp`) || filePath.includes("transaction.json")) {
      return fileHandle;
    }
    return {
      ...fileHandle,
      read: async (buffer, offset, length, position) => {
        const readResult = await fileHandle.read(buffer, offset, length, position);
        if (readResult.bytesRead > 0) buffer[offset] ^= 1;
        return readResult;
      },
    };
  }, /artifact changed before replacement/);

  await runAdapterCase(async (baseFileSystem, filePath, flags, mode) => {
    const fileHandle = await baseFileSystem.open(filePath, flags, mode);
    if (!filePath.endsWith(`.${transactionToken}.tmp`) || filePath.includes("transaction.json")) {
      return fileHandle;
    }
    return {
      ...fileHandle,
      stat: async () => ({
        mode: 0o600,
        mtimeMs: 0,
        isSymbolicLink: () => false,
        isDirectory: () => false,
        isFile: () => true,
      }),
    };
  }, /artifact mode changed before replacement/);
});

test("rolls back when a verified temp is replaced before rename", async () => {
  await withThemeFiles(async (temporaryDirectoryPath, themeFilePaths) => {
    const darkThemeTempPath = createArtifactPaths(
      temporaryDirectoryPath,
      transactionToken
    ).darkThemeTempPath;
    const adversarialDarkThemeSource = createThemeSource(darkThemeName, darkThemeType, "#999999");
    const baseFileSystem = createThemeFileSystem();
    const swappingFileSystem = createThemeFileSystem({
      rename: async (sourcePath, destinationPath) => {
        if (sourcePath === darkThemeTempPath && destinationPath === themeFilePaths.darkThemePath) {
          await unlink(sourcePath);
          await writeFile(sourcePath, adversarialDarkThemeSource, "utf8");
        }
        return baseFileSystem.rename(sourcePath, destinationPath);
      },
    });

    await assert.rejects(
      replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
        transactionToken,
        fileSystem: swappingFileSystem,
      }),
      /target identity changed after replacement/
    );
    assert.equal(await readFile(themeFilePaths.darkThemePath, "utf8"), oldDarkThemeSource);
    assert.equal(await readFile(themeFilePaths.lightThemePath, "utf8"), oldLightThemeSource);
    assert.equal((await lstat(themeFilePaths.darkThemePath)).isSymbolicLink(), false);
    assert.deepEqual(await readdir(temporaryDirectoryPath), [
      darkThemeFileName,
      lightThemeFileName,
    ]);
  });
});

test("handles transaction adapter limits, journal collisions, and cleanup aggregation", async () => {
  await withThemeFiles(async (temporaryDirectoryPath, themeFilePaths) => {
    const baseFileSystem = createThemeFileSystem();
    const unsupportedDirectorySyncFileSystem = createThemeFileSystem({
      open: async (filePath, flags, mode) => {
        if (filePath === temporaryDirectoryPath)
          throw createError("directory unsupported", "EINVAL");
        return baseFileSystem.open(filePath, flags, mode);
      },
    });
    assert.equal(
      await replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
        transactionToken,
        fileSystem: unsupportedDirectorySyncFileSystem,
      }),
      true
    );
  });

  await withThemeFiles(async (temporaryDirectoryPath, themeFilePaths) => {
    const baseFileSystem = createThemeFileSystem();
    const directorySyncFailureFileSystem = createThemeFileSystem({
      open: async (filePath, flags, mode) => {
        if (filePath === temporaryDirectoryPath) throw createError("directory sync failed");
        return baseFileSystem.open(filePath, flags, mode);
      },
    });
    await assert.rejects(
      replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
        transactionToken,
        fileSystem: directorySyncFailureFileSystem,
      }),
      /directory sync failed/
    );
  });

  await withThemeFiles(async (_temporaryDirectoryPath, themeFilePaths) => {
    await writeFile(defaultThemeFileTransactionJournalPath(themeFilePaths), "in progress");
    await assert.rejects(
      replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), { transactionToken }),
      /already in progress/
    );
    await unlink(defaultThemeFileTransactionJournalPath(themeFilePaths));

    await assert.rejects(
      replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
        transactionToken: "unsafe-token",
      }),
      /transaction token must be a UUID v4/
    );
    await assert.rejects(
      replaceConfiguredThemeFiles(
        themeFilePaths,
        { darkThemeSource: "not-json", lightThemeSource: newLightThemeSource },
        { transactionToken }
      ),
      /Invalid generated theme JSON/
    );
  });

  await withThemeFiles(async (_temporaryDirectoryPath, themeFilePaths) => {
    const baseFileSystem = createThemeFileSystem();
    const cleanupAggregateFileSystem = createThemeFileSystem({
      open: async (filePath, flags, mode) => {
        if (
          filePath.endsWith(`.${transactionToken}.tmp`) &&
          !filePath.includes("transaction.json")
        ) {
          throw createError("artifact open failed");
        }
        return baseFileSystem.open(filePath, flags, mode);
      },
      unlink: async (filePath) => {
        if (filePath === defaultThemeFileTransactionJournalPath(themeFilePaths)) {
          throw createError("journal cleanup failed");
        }
        return unlink(filePath);
      },
    });
    await assert.rejects(
      replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
        transactionToken,
        fileSystem: cleanupAggregateFileSystem,
      }),
      AggregateError
    );
  });
});

test("rejects directory artifacts and invalid light journal modes", async () => {
  await withThemeFiles(async (_temporaryDirectoryPath, themeFilePaths) => {
    const baseFileSystem = createThemeFileSystem();
    let darkTempLookupCount = 0;
    const directoryArtifactFileSystem = createThemeFileSystem({
      lstat: async (filePath) => {
        if (
          filePath.endsWith(`.${transactionToken}.tmp`) &&
          !filePath.includes("transaction.json")
        ) {
          darkTempLookupCount += 1;
          if (darkTempLookupCount === 1) {
            return {
              mode: 0o755,
              mtimeMs: 0,
              isSymbolicLink: () => false,
              isDirectory: () => true,
              isFile: () => false,
            };
          }
        }
        return baseFileSystem.lstat(filePath);
      },
    });
    await assert.rejects(
      replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
        transactionToken,
        fileSystem: directoryArtifactFileSystem,
      }),
      /Missing theme transaction artifact/
    );

    const journalPath = defaultThemeFileTransactionJournalPath(themeFilePaths);
    const malformedLightJournals = [
      { ...createJournal(transactionToken), lightThemeMode: 0o10000 },
      { ...createJournal(transactionToken), lightThemeMode: "0644" },
    ];
    for (const malformedJournal of malformedLightJournals) {
      await writeFile(journalPath, JSON.stringify(malformedJournal));
      await assert.rejects(
        recoverConfiguredThemeFileTransaction(themeFilePaths),
        /Invalid theme file transaction journal contents/
      );
      await unlink(journalPath);
    }
  });
});

test("rejects missing or non-directory configured theme roots", async () => {
  await withThemeFiles(async (temporaryDirectoryPath, themeFilePaths) => {
    const nonDirectoryFileSystem = createThemeFileSystem({
      lstat: async (filePath) => {
        if (filePath === temporaryDirectoryPath) {
          return {
            mode: 0o644,
            mtimeMs: 0,
            isSymbolicLink: () => false,
            isDirectory: () => false,
            isFile: () => true,
          };
        }
        return lstat(filePath);
      },
    });
    await assert.rejects(
      replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
        transactionToken,
        fileSystem: nonDirectoryFileSystem,
      }),
      /inside a directory/
    );
    await assert.rejects(
      recoverConfiguredThemeFileTransaction(themeFilePaths, { fileSystem: nonDirectoryFileSystem }),
      /inside a directory/
    );
  });
});

test("supports minimal durable handles and a missing light target", async () => {
  await withThemeFiles(async (temporaryDirectoryPath, themeFilePaths) => {
    await rm(themeFilePaths.lightThemePath);
    const baseFileSystem = createThemeFileSystem();
    const minimalHandleFileSystem = createThemeFileSystem({
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
          mode: fileStats.mode,
          mtimeMs: fileStats.mtimeMs,
          isSymbolicLink: () => fileStats.isSymbolicLink(),
          isDirectory: () => fileStats.isDirectory(),
          isFile: () => fileStats.isFile(),
        };
      },
    });
    assert.equal(
      await replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
        transactionToken,
        fileSystem: minimalHandleFileSystem,
      }),
      true
    );
    assert.equal(await readFile(themeFilePaths.darkThemePath, "utf8"), newDarkThemeSource);
    assert.equal(await readFile(themeFilePaths.lightThemePath, "utf8"), newLightThemeSource);
    assert.equal((await lstat(themeFilePaths.lightThemePath)).mode & 0o7777, 0o644);
    assert.deepEqual(await readdir(temporaryDirectoryPath), [
      darkThemeFileName,
      lightThemeFileName,
    ]);
  });
});

test("rejects each non-sibling configured light target", async () => {
  await withThemeFiles(async (temporaryDirectoryPath, themeFilePaths) => {
    await assert.rejects(
      replaceConfiguredThemeFiles(
        {
          darkThemePath: themeFilePaths.darkThemePath,
          lightThemePath: join(temporaryDirectoryPath, "other-light.json"),
        },
        createThemeFileSources(),
        { transactionToken }
      ),
      /fixed sibling/
    );
    const otherDirectoryPath = join(temporaryDirectoryPath, "other-directory");
    await mkdir(otherDirectoryPath);
    await assert.rejects(
      replaceConfiguredThemeFiles(
        {
          darkThemePath: themeFilePaths.darkThemePath,
          lightThemePath: join(otherDirectoryPath, lightThemeFileName),
        },
        createThemeFileSources(),
        { transactionToken }
      ),
      /fixed sibling/
    );
  });
});

test("ignores every supported directory sync limitation", async () => {
  for (const unsupportedErrorCode of ["EISDIR", "ENOTSUP", "EPERM"]) {
    await withThemeFiles(async (temporaryDirectoryPath, themeFilePaths) => {
      const baseFileSystem = createThemeFileSystem();
      const unsupportedDirectorySyncFileSystem = createThemeFileSystem({
        open: async (filePath, flags, mode) => {
          if (filePath === temporaryDirectoryPath) {
            throw createError("directory sync unsupported", unsupportedErrorCode);
          }
          return baseFileSystem.open(filePath, flags, mode);
        },
      });
      assert.equal(
        await replaceConfiguredThemeFiles(themeFilePaths, createThemeFileSources(), {
          transactionToken,
          fileSystem: unsupportedDirectorySyncFileSystem,
        }),
        true
      );
      assert.equal(await readFile(themeFilePaths.darkThemePath, "utf8"), newDarkThemeSource);
    });
  }
});
