import assert from "node:assert/strict";
import test from "node:test";
import {
  findChangedThemeSourcePaths,
  resolveExpectedInstalledExtensionVersion,
} from "../support/integration-contract.cjs";

test("binds a generic VSIX to the source package version", () => {
  assert.equal(
    resolveExpectedInstalledExtensionVersion({
      packagedExtensionFileNames: ["everforest-complete.vsix"],
      sourcePackageVersion: "0.0.0-development",
      extensionPackageName: "everforest-complete",
    }),
    "0.0.0-development"
  );
});

test("binds a versioned VSIX to its exact release version", () => {
  assert.equal(
    resolveExpectedInstalledExtensionVersion({
      packagedExtensionFileNames: ["everforest-complete-1.5.3.vsix"],
      sourcePackageVersion: "1.5.2",
      extensionPackageName: "everforest-complete",
    }),
    "1.5.3"
  );
});

test("rejects an ambiguous or malformed VSIX target", () => {
  assert.throws(
    () =>
      resolveExpectedInstalledExtensionVersion({
        packagedExtensionFileNames: [
          "everforest-complete-1.5.3.vsix",
          "everforest-complete-1.5.4.vsix",
        ],
        sourcePackageVersion: "1.5.2",
        extensionPackageName: "everforest-complete",
      }),
    /exactly one packaged VSIX/
  );
  assert.throws(
    () =>
      resolveExpectedInstalledExtensionVersion({
        packagedExtensionFileNames: ["everforest-complete-preview.vsix"],
        sourcePackageVersion: "1.5.2",
        extensionPackageName: "everforest-complete",
      }),
    /Unexpected packaged VSIX filename/
  );
});

test("identifies only the regenerated configurable theme", () => {
  const originalThemeSources = new Map([
    ["dark-fixed.json", "dark-fixed"],
    ["light-fixed.json", "light-fixed"],
    ["dark-configurable.json", "dark-default"],
    ["light-configurable.json", "light-default"],
  ]);
  const regeneratedThemeSources = new Map([
    ["dark-fixed.json", "dark-fixed"],
    ["light-fixed.json", "light-fixed"],
    ["dark-configurable.json", "dark-red-cursor"],
    ["light-configurable.json", "light-default"],
  ]);

  assert.deepEqual(findChangedThemeSourcePaths(originalThemeSources, regeneratedThemeSources), [
    "dark-configurable.json",
  ]);
});
