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
const themeGalleryImagePath = "media/previews/everforest-complete-variants.webp";

test("requires VS Code 1.95 and preserves presets beside configurable themes", () => {
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
    "customizable",
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
  assert.ok(readme.includes(`](${themeGalleryImagePath})`));
  assert.ok(extensionManifest.files.includes("README.md"));
  assert.ok(extensionManifest.files.includes(themeGalleryImagePath));
});

test("ships one local-only premium runtime with a minimal package allowlist", () => {
  assert.equal(extensionManifest.main, "./dist/extension.js");
  assert.equal(extensionManifest.browser, "./dist/extension-web.js");
  assert.deepEqual(extensionManifest.activationEvents, ["onStartupFinished"]);
  assert.deepEqual(extensionManifest.extensionKind, ["ui"]);
  assert.equal(extensionManifest.dependencies, undefined);
  assert.deepEqual(extensionManifest.files, [
    "themes/*.json",
    "dist/extension.js",
    "dist/extension-web.js",
    "dist/palette/index.js",
    "dist/schedule.js",
    "dist/semantic.js",
    "dist/syntax/default.js",
    "dist/theme.js",
    "dist/workbench/colors.js",
    "dist/workbench/documented-workbench-colors.json",
    "media/icon.png",
    "media/previews/everforest-complete-variants.webp",
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
  assert.deepEqual(
    extensionManifest.contributes.commands.map(({ command }) => command),
    ["everforestComplete.openSettings", "everforestComplete.regenerateThemes"]
  );
  assert.deepEqual(Object.keys(extensionManifest.contributes.configuration.properties), [
    "everforestComplete.darkContrast",
    "everforestComplete.lightContrast",
    "everforestComplete.darkWorkbench",
    "everforestComplete.lightWorkbench",
    "everforestComplete.darkCursor",
    "everforestComplete.lightCursor",
    "everforestComplete.darkSelection",
    "everforestComplete.lightSelection",
    "everforestComplete.italicKeywords",
    "everforestComplete.italicComments",
    "everforestComplete.diagnosticTextBackgroundOpacity",
    "everforestComplete.highContrast",
    "everforestComplete.autoSwitch.enabled",
    "everforestComplete.autoSwitch.schedule",
  ]);
});

test("exposes the proven Everforest premium configuration contract", () => {
  const premiumSettings = extensionManifest.contributes.configuration.properties;
  assert.deepEqual(
    new Set(Object.values(premiumSettings).map(({ scope }) => scope)),
    new Set(["application"])
  );
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(premiumSettings).map(([configurationKey, configurationSchema]) => [
        configurationKey,
        configurationSchema.default,
      ])
    ),
    {
      "everforestComplete.darkContrast": "medium",
      "everforestComplete.lightContrast": "medium",
      "everforestComplete.darkWorkbench": "material",
      "everforestComplete.lightWorkbench": "material",
      "everforestComplete.darkCursor": "white",
      "everforestComplete.lightCursor": "black",
      "everforestComplete.darkSelection": "grey",
      "everforestComplete.lightSelection": "grey",
      "everforestComplete.italicKeywords": false,
      "everforestComplete.italicComments": true,
      "everforestComplete.diagnosticTextBackgroundOpacity": "0%",
      "everforestComplete.highContrast": false,
      "everforestComplete.autoSwitch.enabled": false,
      "everforestComplete.autoSwitch.schedule": [
        { time: "07:00", theme: "Everforest Complete Light" },
        { time: "19:00", theme: "Everforest Complete Dark" },
      ],
    }
  );
  assert.deepEqual(premiumSettings["everforestComplete.darkContrast"].enum, [
    "soft",
    "medium",
    "hard",
  ]);
  assert.deepEqual(premiumSettings["everforestComplete.darkWorkbench"].enum, [
    "material",
    "flat",
    "high-contrast",
  ]);
  assert.deepEqual(premiumSettings["everforestComplete.diagnosticTextBackgroundOpacity"].enum, [
    "0%",
    "12.5%",
    "25%",
    "37.5%",
    "50%",
  ]);
});
