import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  collectRuntimeEntryClosure,
  expectedReleaseArchiveFiles,
  maxRuntimeSourceBytes,
  parseArchiveFileList,
  parsePackageFileList,
  validateRuntimeEntryClosure,
  validateRawArchiveEntries,
} from "../../scripts/package-contract.mjs";

test("normalizes package listings and rejects exposed duplicate archive entries", () => {
  assert.deepEqual(
    parsePackageFileList(".\\dist\\extension.js\r\ndist/feature.js\r\n"),
    ["dist/extension.js", "dist/feature.js"].sort()
  );
  assert.throws(
    () =>
      parseArchiveFileList({
        zipEntries: { files: [{ fileName: "extension/a.js" }, { fileName: "extension\\a.js" }] },
      }),
    /duplicate file entries: extension\/a\.js/
  );
});

test("accepts VSIX archives with implicit directories only", () => {
  const expectedArchiveFiles = expectedReleaseArchiveFiles();
  const fileOnlyArchiveEntries = expectedArchiveFiles.map((archiveFileName) => ({
    isDirectory: false,
    name: archiveFileName,
  }));
  assert.deepEqual(
    validateRawArchiveEntries(fileOnlyArchiveEntries, expectedArchiveFiles, "file-only VSIX")
      .archiveDirectoryNames,
    []
  );
  assert.throws(
    () =>
      validateRawArchiveEntries(
        [...fileOnlyArchiveEntries, { isDirectory: true, name: "extension/unexpected/" }],
        expectedArchiveFiles,
        "unsafe VSIX"
      ),
    /unexpected VSIX directories/
  );
});

test("finds every transitive local module imported by runtime entries", () => {
  const fixtureRepositoryDirectory = mkdtempSync(join(tmpdir(), "everforest-runtime-closure-"));
  try {
    mkdirSync(join(fixtureRepositoryDirectory, "dist/nested"), { recursive: true });
    writeFileSync(
      join(fixtureRepositoryDirectory, "dist/extension.js"),
      [
        'import { feature } from "./nested/feature.js"',
        'export { exported } from "./nested/exported.js"',
        'import("./nested/dynamic.js")',
        'require /* comments are ignored */ ("./nested/required.js")',
        'require("./nested/data.json")',
        'const ignored = "require(\\"./nested/ignored.js\\")"; // import "./nested/ignored2.js"',
        "void feature;",
      ].join("\n")
    );
    writeFileSync(
      join(fixtureRepositoryDirectory, "dist/nested/feature.js"),
      "export const feature = true;\n"
    );
    writeFileSync(
      join(fixtureRepositoryDirectory, "dist/nested/exported.js"),
      "export const exported = true;\n"
    );
    writeFileSync(
      join(fixtureRepositoryDirectory, "dist/nested/dynamic.js"),
      "module.exports = {};\n"
    );
    writeFileSync(
      join(fixtureRepositoryDirectory, "dist/nested/required.js"),
      "module.exports = {};\n"
    );
    writeFileSync(join(fixtureRepositoryDirectory, "dist/nested/data.json"), "{}\n");

    writeFileSync(
      join(fixtureRepositoryDirectory, "dist/extension-web.js"),
      'require("./nested/web-boundary.js");\n'
    );
    writeFileSync(
      join(fixtureRepositoryDirectory, "dist/nested/web-boundary.js"),
      "module.exports = {};\n"
    );

    assert.deepEqual(collectRuntimeEntryClosure(fixtureRepositoryDirectory), [
      "dist/extension-web.js",
      "dist/extension.js",
      "dist/nested/data.json",
      "dist/nested/dynamic.js",
      "dist/nested/exported.js",
      "dist/nested/feature.js",
      "dist/nested/required.js",
      "dist/nested/web-boundary.js",
    ]);
  } finally {
    rmSync(fixtureRepositoryDirectory, { force: true, recursive: true });
  }
});

test("rejects a package allowlist that omits an imported runtime module", () => {
  const fixtureRepositoryDirectory = mkdtempSync(join(tmpdir(), "everforest-runtime-closure-"));
  try {
    mkdirSync(join(fixtureRepositoryDirectory, "dist"), { recursive: true });
    writeFileSync(join(fixtureRepositoryDirectory, "dist/extension.js"), 'require("./feature");\n');
    writeFileSync(join(fixtureRepositoryDirectory, "dist/feature.js"), "module.exports = {};\n");

    assert.throws(
      () =>
        validateRuntimeEntryClosure(
          fixtureRepositoryDirectory,
          ["dist/extension.js"],
          ["dist/extension.js"]
        ),
      /omits runtime modules imported by its entry points:[\s\S]*dist\/feature\.js/
    );
  } finally {
    rmSync(fixtureRepositoryDirectory, { force: true, recursive: true });
  }
});

test("rejects an imported runtime module missing from the compiled snapshot", () => {
  const fixtureRepositoryDirectory = mkdtempSync(join(tmpdir(), "everforest-runtime-closure-"));
  try {
    mkdirSync(join(fixtureRepositoryDirectory, "dist"), { recursive: true });
    writeFileSync(join(fixtureRepositoryDirectory, "dist/extension.js"), 'require("./missing");\n');

    assert.throws(
      () => collectRuntimeEntryClosure(fixtureRepositoryDirectory, ["dist/extension.js"]),
      /Runtime entry imports missing compiled module: dist\/missing/
    );
  } finally {
    rmSync(fixtureRepositoryDirectory, { force: true, recursive: true });
  }
});

test("rejects runtime symlinks, external paths, and oversized source files", () => {
  const fixtureRepositoryDirectory = mkdtempSync(join(tmpdir(), "everforest-runtime-safe-"));
  const externalSentinelDirectory = mkdtempSync(join(tmpdir(), "everforest-runtime-sentinel-"));
  try {
    mkdirSync(join(fixtureRepositoryDirectory, "dist"), { recursive: true });
    const externalSentinelPath = join(externalSentinelDirectory, "external-sentinel.js");
    writeFileSync(externalSentinelPath, "sentinel must never be read\n");
    symlinkSync(
      externalSentinelPath,
      join(fixtureRepositoryDirectory, "dist/external-sentinel.js")
    );
    writeFileSync(
      join(fixtureRepositoryDirectory, "dist/extension.js"),
      'require("./external-sentinel");\n'
    );
    assert.throws(
      () => collectRuntimeEntryClosure(fixtureRepositoryDirectory, ["dist/extension.js"]),
      /symlink/
    );

    rmSync(join(fixtureRepositoryDirectory, "dist/external-sentinel.js"));
    writeFileSync(
      join(fixtureRepositoryDirectory, "dist/extension.js"),
      'require("../../external");\n'
    );
    assert.throws(
      () => collectRuntimeEntryClosure(fixtureRepositoryDirectory, ["dist/extension.js"]),
      /escapes repository/
    );

    writeFileSync(
      join(fixtureRepositoryDirectory, "dist/extension.js"),
      Buffer.alloc(maxRuntimeSourceBytes + 1, 0x20)
    );
    assert.throws(
      () => collectRuntimeEntryClosure(fixtureRepositoryDirectory, ["dist/extension.js"]),
      /maximum size/
    );
  } finally {
    rmSync(externalSentinelDirectory, { force: true, recursive: true });
    rmSync(fixtureRepositoryDirectory, { force: true, recursive: true });
  }
});
