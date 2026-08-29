import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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
const premiumConfigurationCategories = extensionManifest.contributes.configuration;
const premiumSettings = Object.assign(
  {},
  ...premiumConfigurationCategories.map((configurationCategory) => configurationCategory.properties)
);

const { expectedThemeContributions } = themeManifest;
const marketplaceItemUrl =
  "https://marketplace.visualstudio.com/items?itemName=overengineered-org.everforest-complete";
const marketplaceVersionBadgeImageUrl =
  "https://vsmarketplacebadges.dev/version/overengineered-org.everforest-complete.svg?subject=Marketplace";
const marketplaceImagePaths = [
  "media/previews/everforest-complete-light-dark.webp",
  "media/previews/everforest-complete-workbench.webp",
  "media/previews/everforest-complete-customization.webp",
];

function readMarketplaceImageDimensions(marketplaceImagePath) {
  const marketplaceImageBytes = readFileSync(resolve(repositoryDirectory, marketplaceImagePath));
  assert.equal(marketplaceImageBytes.toString("ascii", 0, 4), "RIFF");
  assert.equal(marketplaceImageBytes.toString("ascii", 8, 12), "WEBP");
  assert.equal(marketplaceImageBytes.toString("ascii", 12, 16), "VP8 ");
  assert.deepEqual([...marketplaceImageBytes.subarray(23, 26)], [0x9d, 0x01, 0x2a]);
  return {
    width: marketplaceImageBytes.readUInt16LE(26) & 0x3fff,
    height: marketplaceImageBytes.readUInt16LE(28) & 0x3fff,
  };
}

test("requires VS Code 1.95 and preserves presets beside configurable themes", () => {
  assert.equal(extensionManifest.engines.vscode, "^1.95.0");
  assert.equal(integrationHarnessManifest.engines.vscode, "^1.95.0");
  assert.deepEqual(extensionManifest.contributes.themes, expectedThemeContributions);
});

test("uses truthful premium imagery for Marketplace discovery", () => {
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
      `[![Visual Studio Marketplace](${marketplaceVersionBadgeImageUrl})](${marketplaceItemUrl})`
    )
  );
  assert.doesNotMatch(readme, /img\.shields\.io\/visual-studio-marketplace\//);
  assert.doesNotMatch(readme, /everforest-complete-variants\.webp/);
  assert.equal(
    existsSync(resolve(repositoryDirectory, "media/previews/everforest-complete-variants.webp")),
    false
  );
  for (const marketplaceImagePath of marketplaceImagePaths) {
    assert.ok(readme.includes(`](${marketplaceImagePath})`), marketplaceImagePath);
    assert.ok(extensionManifest.files.includes(marketplaceImagePath), marketplaceImagePath);
    assert.deepEqual(readMarketplaceImageDimensions(marketplaceImagePath), {
      width: 1600,
      height: 900,
    });
  }
});

test("ships one local-only premium runtime with a minimal package allowlist", () => {
  assert.equal(extensionManifest.main, "./dist/extension.js");
  assert.equal(extensionManifest.browser, "./dist/extension-web.js");
  assert.deepEqual(extensionManifest.activationEvents, ["onStartupFinished"]);
  assert.deepEqual(extensionManifest.extensionKind, ["ui"]);
  assert.equal(extensionManifest.dependencies, undefined);
  assert.deepEqual(extensionManifest.files, [
    "themes/*.json",
    "dist/configuration.js",
    "dist/configuration-ui.js",
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
    "media/previews/everforest-complete-light-dark.webp",
    "media/previews/everforest-complete-workbench.webp",
    "media/previews/everforest-complete-customization.webp",
    "media/walkthrough/*.svg",
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
    [
      "everforestComplete.configureTheme",
      "everforestComplete.configureAdvancedControls",
      "everforestComplete.configureAutomaticSwitching",
      "everforestComplete.regenerateThemes",
    ]
  );
  assert.equal(
    extensionManifest.contributes.commands.some(
      ({ command }) => command === "everforestComplete.openSettings"
    ),
    false
  );
});

test("onboards through one completion-aware native walkthrough", () => {
  const [premiumWalkthrough] = extensionManifest.contributes.walkthroughs;
  assert.equal(premiumWalkthrough.id, "everforestComplete.gettingStarted");
  assert.equal(premiumWalkthrough.when, "!isWeb");
  assert.match(premiumWalkthrough.description, /under two minutes/i);
  assert.deepEqual(
    premiumWalkthrough.steps.map(({ id }) => id),
    [
      "everforestComplete.chooseTheme",
      "everforestComplete.configureFeel",
      "everforestComplete.automateAppearance",
    ]
  );
  assert.deepEqual(
    premiumWalkthrough.steps.map(({ completionEvents }) => completionEvents),
    [
      ["onSettingChanged:workbench.colorTheme"],
      ["onContext:everforestComplete.themeConfigurationCompleted"],
      ["onContext:everforestComplete.automaticSwitchingCompleted"],
    ]
  );
  for (const walkthroughStep of premiumWalkthrough.steps) {
    assert.match(walkthroughStep.description, /\[.+\]\(command:.+\)/);
    assert.ok(
      existsSync(resolve(repositoryDirectory, walkthroughStep.media.image)),
      walkthroughStep.media.image
    );
    assert.ok(extensionManifest.files.includes("media/walkthrough/*.svg"));
  }
});

test("groups and orders every advanced setting with human labels", () => {
  assert.deepEqual(
    premiumConfigurationCategories.map(({ title, order }) => ({ title, order })),
    [
      { title: "Everforest Complete: Appearance", order: 10 },
      { title: "Everforest Complete: Editor", order: 20 },
      { title: "Everforest Complete: Accessibility", order: 30 },
      { title: "Everforest Complete: Automation", order: 40 },
    ]
  );
  for (const configurationCategory of premiumConfigurationCategories) {
    const settingOrders = Object.values(configurationCategory.properties).map(({ order }) => order);
    assert.deepEqual(
      settingOrders,
      [...settingOrders].sort((first, second) => first - second)
    );
  }
  for (const configurationSchema of Object.values(premiumSettings)) {
    assert.equal(configurationSchema.scope, "application");
    assert.match(configurationSchema.markdownDescription, /command:everforestComplete\./);
    if (configurationSchema.enum) {
      assert.equal(configurationSchema.enumItemLabels.length, configurationSchema.enum.length);
    }
  }
  assert.deepEqual(
    premiumSettings["everforestComplete.diagnosticTextBackgroundOpacity"].enumItemLabels,
    ["Off", "Subtle — 12.5%", "Moderate — 25%", "Strong — 37.5%", "Maximum — 50%"]
  );
});

test("preserves the proven premium configuration defaults behind native commands", () => {
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
  assert.ok(readme.includes("Everforest Complete: Configure Theme"));
  assert.ok(readme.includes("Everforest Complete: Configure Advanced Controls"));
  assert.ok(readme.includes("Everforest Complete: Configure Automatic Light/Dark"));
  assert.doesNotMatch(readme, /Open Premium Settings/);
  assert.doesNotMatch(readme, /User Settings \(JSON\)/);
});
