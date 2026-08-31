import assert from "node:assert/strict";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import test from "node:test";
import { generatedThemeArtifacts, generateThemes } from "../../dist/generate-themes.js";

const nodeFileSystem = createRequire(import.meta.url)("node:fs");
const generatedThemeFileNames = generatedThemeArtifacts().map(({ fileName }) => fileName);

function withTemporaryThemesDirectory(callback) {
  const temporaryThemesDirectory = mkdtempSync(join(tmpdir(), "everforest-generator-"));
  try {
    return callback(temporaryThemesDirectory);
  } finally {
    rmSync(temporaryThemesDirectory, { force: true, recursive: true });
  }
}

function withVerificationMode(callback) {
  const previousVerificationMode = process.env.VERIFY_GENERATED_THEMES;
  process.env.VERIFY_GENERATED_THEMES = "1";
  try {
    return callback();
  } finally {
    if (previousVerificationMode === undefined) {
      delete process.env.VERIFY_GENERATED_THEMES;
    } else {
      process.env.VERIFY_GENERATED_THEMES = previousVerificationMode;
    }
  }
}

test("stages every generated theme before replacing existing outputs", () => {
  withTemporaryThemesDirectory((temporaryThemesDirectory) => {
    for (const generatedThemeFileName of generatedThemeFileNames) {
      writeFileSync(join(temporaryThemesDirectory, generatedThemeFileName), "previous\n");
    }

    generateThemes(temporaryThemesDirectory);

    for (const generatedThemeArtifact of generatedThemeArtifacts()) {
      assert.equal(
        readFileSync(join(temporaryThemesDirectory, generatedThemeArtifact.fileName), "utf8"),
        generatedThemeArtifact.source
      );
    }
    assert.deepEqual(
      readdirSync(temporaryThemesDirectory)
        .filter((fileName) => fileName.endsWith(".json"))
        .sort(),
      [...generatedThemeFileNames].sort()
    );
    assert.deepEqual(
      readdirSync(temporaryThemesDirectory).filter((fileName) =>
        fileName.startsWith(".everforest-theme-generation-")
      ),
      []
    );
  });
});

test("creates the output directory for generation but not verification", () => {
  withTemporaryThemesDirectory((temporaryThemesDirectory) => {
    const missingThemesDirectory = join(temporaryThemesDirectory, "missing");
    generateThemes(missingThemesDirectory);
    assert.deepEqual(
      readdirSync(missingThemesDirectory)
        .filter((fileName) => fileName.endsWith(".json"))
        .sort(),
      [...generatedThemeFileNames].sort()
    );
  });
});

test("refuses a symlinked generated output without touching its target", () => {
  withTemporaryThemesDirectory((temporaryThemesDirectory) => {
    const symlinkedThemeFileName = generatedThemeFileNames[0];
    const symlinkedThemePath = join(temporaryThemesDirectory, symlinkedThemeFileName);
    const externalThemePath = join(temporaryThemesDirectory, "external-theme.json");
    writeFileSync(externalThemePath, "must remain unchanged\n");
    symlinkSync(externalThemePath, symlinkedThemePath);

    assert.throws(
      () => generateThemes(temporaryThemesDirectory),
      /Refusing symlinked generated theme output/
    );
    assert.equal(readFileSync(externalThemePath, "utf8"), "must remain unchanged\n");
    assert.equal(lstatSync(symlinkedThemePath).isSymbolicLink(), true);
    assert.deepEqual(
      readdirSync(temporaryThemesDirectory).filter((fileName) =>
        fileName.startsWith(".everforest-theme-generation-")
      ),
      []
    );
  });
});

test("refuses a symlinked generated themes directory", () => {
  withTemporaryThemesDirectory((temporaryThemesDirectory) => {
    const realThemesDirectory = join(temporaryThemesDirectory, "real-themes");
    const symlinkedThemesDirectory = join(temporaryThemesDirectory, "themes");
    mkdirSync(realThemesDirectory);
    symlinkSync(realThemesDirectory, symlinkedThemesDirectory);

    assert.throws(
      () => generateThemes(symlinkedThemesDirectory),
      /Refusing symlinked generated themes directory/
    );
    assert.deepEqual(readdirSync(realThemesDirectory), []);
  });
});

test("refuses a non-directory generated themes path", () => {
  withTemporaryThemesDirectory((temporaryThemesDirectory) => {
    const nonDirectoryThemesPath = join(temporaryThemesDirectory, "themes");
    writeFileSync(nonDirectoryThemesPath, "not a directory\n");

    assert.throws(
      () => generateThemes(nonDirectoryThemesPath),
      /Generated themes path must be a directory/
    );
  });
});

test("rejects a non-file generated output before replacing any output", () => {
  withTemporaryThemesDirectory((temporaryThemesDirectory) => {
    const invalidThemeFileName = generatedThemeFileNames[0];
    mkdirSync(join(temporaryThemesDirectory, invalidThemeFileName));
    for (const generatedThemeFileName of generatedThemeFileNames.slice(1)) {
      writeFileSync(join(temporaryThemesDirectory, generatedThemeFileName), "previous\n");
    }

    assert.throws(
      () => generateThemes(temporaryThemesDirectory),
      /Generated theme output must be a regular file/
    );
    for (const generatedThemeFileName of generatedThemeFileNames.slice(1)) {
      assert.equal(
        readFileSync(join(temporaryThemesDirectory, generatedThemeFileName), "utf8"),
        "previous\n"
      );
    }
  });
});

test("cleans staged artifacts when a staged write fails", () => {
  withTemporaryThemesDirectory((temporaryThemesDirectory) => {
    for (const generatedThemeFileName of generatedThemeFileNames) {
      writeFileSync(join(temporaryThemesDirectory, generatedThemeFileName), "previous\n");
    }
    const originalWriteFileSync = nodeFileSystem.writeFileSync;
    let stagedWriteCount = 0;
    nodeFileSystem.writeFileSync = (filePath, ...writeArguments) => {
      if (String(filePath).includes(".everforest-theme-generation-")) {
        stagedWriteCount += 1;
        if (stagedWriteCount === 3) throw new Error("injected staged write failure");
      }
      return originalWriteFileSync(filePath, ...writeArguments);
    };
    try {
      assert.throws(
        () => generateThemes(temporaryThemesDirectory),
        /injected staged write failure/
      );
    } finally {
      nodeFileSystem.writeFileSync = originalWriteFileSync;
    }
    for (const generatedThemeFileName of generatedThemeFileNames) {
      assert.equal(
        readFileSync(join(temporaryThemesDirectory, generatedThemeFileName), "utf8"),
        "previous\n"
      );
    }
    assert.deepEqual(
      readdirSync(temporaryThemesDirectory).filter((fileName) =>
        fileName.startsWith(".everforest-theme-generation-")
      ),
      []
    );
  });
});

test("rolls back already replaced outputs when a commit fails", () => {
  withTemporaryThemesDirectory((temporaryThemesDirectory) => {
    for (const generatedThemeFileName of generatedThemeFileNames) {
      writeFileSync(join(temporaryThemesDirectory, generatedThemeFileName), "previous\n");
    }
    const originalRenameSync = nodeFileSystem.renameSync;
    let renameCount = 0;
    nodeFileSystem.renameSync = (...renameArguments) => {
      renameCount += 1;
      if (renameCount === 6) throw new Error("injected commit failure");
      return originalRenameSync(...renameArguments);
    };
    try {
      assert.throws(() => generateThemes(temporaryThemesDirectory), /injected commit failure/);
    } finally {
      nodeFileSystem.renameSync = originalRenameSync;
    }
    for (const generatedThemeFileName of generatedThemeFileNames) {
      assert.equal(
        readFileSync(join(temporaryThemesDirectory, generatedThemeFileName), "utf8"),
        "previous\n"
      );
    }
  });
});

test("propagates unexpected filesystem errors while checking output paths", () => {
  withTemporaryThemesDirectory((temporaryThemesDirectory) => {
    const originalLstatSync = nodeFileSystem.lstatSync;
    nodeFileSystem.lstatSync = () => {
      throw new Error("injected lstat failure");
    };
    try {
      assert.throws(() => generateThemes(temporaryThemesDirectory), /injected lstat failure/);
    } finally {
      nodeFileSystem.lstatSync = originalLstatSync;
    }
  });
});

test("generate:check rejects extra JSON themes", () => {
  withTemporaryThemesDirectory((temporaryThemesDirectory) => {
    generateThemes(temporaryThemesDirectory);
    const extraThemePath = join(temporaryThemesDirectory, "stale-custom-theme.json");
    writeFileSync(extraThemePath, "stale\n");

    withVerificationMode(() => {
      assert.throws(
        () => generateThemes(temporaryThemesDirectory),
        /Unexpected generated theme files: stale-custom-theme\.json/
      );
    });
    assert.equal(readFileSync(extraThemePath, "utf8"), "stale\n");
  });
});

test("generate:check passes when every generated output is current", () => {
  withTemporaryThemesDirectory((temporaryThemesDirectory) => {
    generateThemes(temporaryThemesDirectory);
    withVerificationMode(() => generateThemes(temporaryThemesDirectory));
  });
});

test("generate:check rejects stale output without changing it", () => {
  withTemporaryThemesDirectory((temporaryThemesDirectory) => {
    generateThemes(temporaryThemesDirectory);
    const staleThemePath = join(temporaryThemesDirectory, generatedThemeFileNames[0]);
    writeFileSync(staleThemePath, "stale\n");

    withVerificationMode(() => {
      assert.throws(() => generateThemes(temporaryThemesDirectory), /Generated theme is stale/);
    });
    assert.equal(readFileSync(staleThemePath, "utf8"), "stale\n");
  });
});

test("generate:check does not create a missing themes directory", () => {
  withTemporaryThemesDirectory((temporaryThemesDirectory) => {
    const missingThemesDirectory = join(temporaryThemesDirectory, "missing");
    withVerificationMode(() => {
      assert.throws(
        () => generateThemes(missingThemesDirectory),
        /Generated themes directory is missing/
      );
    });
    assert.equal(lstatSync(temporaryThemesDirectory).isDirectory(), true);
    assert.throws(() => lstatSync(missingThemesDirectory), { code: "ENOENT" });
  });
});
