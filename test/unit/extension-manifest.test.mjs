import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import themeManifest from "../support/theme-manifest.cjs";

const repositoryDirectory = resolve(import.meta.dirname, "../..");
const extensionManifest = JSON.parse(
  readFileSync(resolve(repositoryDirectory, "package.json"), "utf8")
);
const readme = readFileSync(resolve(repositoryDirectory, "README.md"), "utf8");
const integrationHarnessManifest = JSON.parse(
  readFileSync(resolve(repositoryDirectory, "test/harness/package.json"), "utf8")
);

const { expectedThemeContributions } = themeManifest;
const marketplaceItemUrl =
  "https://marketplace.visualstudio.com/items?itemName=overengineered-org.everforest-complete";
const marketplaceBadgeImageUrl =
  "https://img.shields.io/visual-studio-marketplace/v/overengineered-org.everforest-complete?label=Marketplace";

test("requires VS Code 1.95 and declares the exact six shipped themes", () => {
  assert.equal(extensionManifest.engines.vscode, "^1.95.0");
  assert.equal(integrationHarnessManifest.engines.vscode, "^1.95.0");
  assert.deepEqual(extensionManifest.contributes.themes, expectedThemeContributions);
});

test("improves Marketplace discovery and installation", () => {
  assert.deepEqual(extensionManifest.keywords, [
    "everforest",
    "color theme",
    "dark theme",
    "light theme",
    "contrast",
  ]);
  assert.ok(
    readme.includes(
      `[Install Everforest Complete from the Visual Studio Marketplace](${marketplaceItemUrl})`
    )
  );
  assert.ok(
    readme.includes(
      `![Visual Studio Marketplace](${marketplaceBadgeImageUrl})](${marketplaceItemUrl})`
    )
  );
  assert.ok(extensionManifest.files.includes("README.md"));
});

test("remains a zero-runtime web extension with a minimal package allowlist", () => {
  assert.equal(extensionManifest.main, undefined);
  assert.equal(extensionManifest.browser, undefined);
  assert.equal(extensionManifest.activationEvents, undefined);
  assert.equal(extensionManifest.dependencies, undefined);
  assert.deepEqual(extensionManifest.files, [
    "themes/*.json",
    "media/icon.png",
    "README.md",
    "CHANGELOG.md",
    "SUPPORT.md",
    "LICENSE",
    "NOTICE",
  ]);
  assert.deepEqual(extensionManifest.capabilities, {
    untrustedWorkspaces: { supported: true },
    virtualWorkspaces: true,
  });
});
