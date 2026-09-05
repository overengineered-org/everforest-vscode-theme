const assert = require("node:assert/strict");
const { readdirSync } = require("node:fs");
const { readFile } = require("node:fs/promises");
const { join, resolve } = require("node:path");
const vscode = require("vscode");
const extensionPackageManifest = require("../../package.json");
const {
  findChangedThemeSourcePaths,
  resolveExpectedInstalledExtensionVersion,
} = require("../support/integration-contract.cjs");
const {
  expectedThemeContributions,
  requiredSemanticTokenIdentifiers,
  requiredSyntaxScopes,
} = require("../support/theme-manifest.cjs");

const extensionIdentifier = "overengineered-org.everforest-complete";
const packagedExtensionDirectory = resolve(__dirname, "../../dist");
const expectedInstalledExtensionVersion = resolveExpectedInstalledExtensionVersion({
  packagedExtensionFileNames: readdirSync(packagedExtensionDirectory).filter((fileName) =>
    fileName.endsWith(".vsix")
  ),
  sourcePackageVersion: extensionPackageManifest.version,
  extensionPackageName: extensionPackageManifest.name,
});
const documentedWorkbenchColorContract = require(
  resolve(__dirname, "../../src/workbench/documented-workbench-colors.json")
);
const fixtureLanguageIdentifiers = new Map([
  ["showcase.css", "css"],
  ["showcase.go", "go"],
  ["showcase.html", "html"],
  ["showcase.js", "javascript"],
  ["showcase.json", "json"],
  ["showcase.md", "markdown"],
  ["showcase.py", "python"],
  ["showcase.rs", "rust"],
  ["showcase.sh", "shellscript"],
  ["showcase.sql", "sql"],
  ["showcase.ts", "typescript"],
  ["showcase.yaml", "yaml"],
]);
const nativeConfigurationCommandIdentifiers = [
  "everforestComplete.configureTheme",
  "everforestComplete.configureAdvancedControls",
  "everforestComplete.configureAutomaticSwitching",
];
const commandManagedConfigurationKeys = [
  ["everforestComplete", "darkContrast"],
  ["everforestComplete", "lightContrast"],
  ["everforestComplete", "darkWorkbench"],
  ["everforestComplete", "lightWorkbench"],
  ["everforestComplete", "darkCursor"],
  ["everforestComplete", "lightCursor"],
  ["everforestComplete", "darkSelection"],
  ["everforestComplete", "lightSelection"],
  ["everforestComplete", "italicKeywords"],
  ["everforestComplete", "italicComments"],
  ["everforestComplete", "diagnosticTextBackgroundOpacity"],
  ["everforestComplete", "highContrast"],
  ["everforestComplete", "autoSwitch.enabled"],
  ["everforestComplete", "autoSwitch.schedule"],
  ["window", "autoDetectColorScheme"],
  ["workbench", "colorTheme"],
  ["workbench", "preferredDarkColorTheme"],
  ["workbench", "preferredLightColorTheme"],
];
const expectedPremiumConfigurationContracts = {
  "everforestComplete.darkContrast": { scope: "application", default: "medium" },
  "everforestComplete.lightContrast": { scope: "application", default: "medium" },
  "everforestComplete.darkWorkbench": { scope: "application", default: "material" },
  "everforestComplete.lightWorkbench": { scope: "application", default: "material" },
  "everforestComplete.darkCursor": { scope: "application", default: "white" },
  "everforestComplete.lightCursor": { scope: "application", default: "black" },
  "everforestComplete.darkSelection": { scope: "application", default: "grey" },
  "everforestComplete.lightSelection": { scope: "application", default: "grey" },
  "everforestComplete.italicKeywords": { scope: "application", default: false },
  "everforestComplete.italicComments": { scope: "application", default: true },
  "everforestComplete.diagnosticTextBackgroundOpacity": {
    scope: "application",
    default: "0%",
  },
  "everforestComplete.highContrast": { scope: "application", default: false },
  "everforestComplete.autoSwitch.enabled": { scope: "application", default: false },
  "everforestComplete.autoSwitch.schedule": {
    scope: "application",
    default: [
      { time: "07:00", theme: "Everforest Complete Light" },
      { time: "19:00", theme: "Everforest Complete Dark" },
    ],
  },
};
const expectedSemanticWorkbenchStateColorsByThemeType = {
  dark: {
    "minimap.selectionOccurrenceHighlight": "#9ba89ed0",
    "minimap.chatEditHighlight": "#a7c080c0",
    "scrollbarSlider.background": "#7f897d50",
    "scrollbarSlider.hoverBackground": "#7f897d90",
    "scrollbarSlider.activeBackground": "#7f897dff",
    "notebookScrollbarSlider.background": "#7f897d50",
    "notebookScrollbarSlider.hoverBackground": "#7f897d90",
    "notebookScrollbarSlider.activeBackground": "#7f897dff",
    "minimapSlider.background": "#7f897d28",
    "minimapSlider.hoverBackground": "#7f897d68",
    "minimapSlider.activeBackground": "#7f897db0",
    "chart.line": "#7fbbb3",
    "chart.axis": "#d3c6aa66",
    "chart.guide": "#d3c6aa33",
    "gitDecoration.renamedResourceForeground": "#83c092",
    "debugView.valueChangedHighlight": "#7fbbb3",
    "settings.modifiedItemIndicator": "#7fbbb3",
    "commentsView.resolvedIcon": "#9ba89e",
    "commentsView.unresolvedIcon": "#7fbbb3",
    "editorCommentsWidget.resolvedBorder": "#9ba89e",
    "editorCommentsWidget.unresolvedBorder": "#7fbbb3",
  },
  light: {
    "minimap.selectionOccurrenceHighlight": "#59646cd0",
    "minimap.chatEditHighlight": "#596600c0",
    "scrollbarSlider.background": "#59646c58",
    "scrollbarSlider.hoverBackground": "#59646c88",
    "scrollbarSlider.activeBackground": "#59646cd0",
    "notebookScrollbarSlider.background": "#59646c58",
    "notebookScrollbarSlider.hoverBackground": "#59646c88",
    "notebookScrollbarSlider.activeBackground": "#59646cd0",
    "minimapSlider.background": "#59646c40",
    "minimapSlider.hoverBackground": "#59646c68",
    "minimapSlider.activeBackground": "#59646c98",
    "chart.line": "#2e5f94",
    "chart.axis": "#59646c99",
    "chart.guide": "#59646c33",
    "gitDecoration.renamedResourceForeground": "#2f6a4d",
    "debugView.valueChangedHighlight": "#2e5f94",
    "settings.modifiedItemIndicator": "#2e5f94",
    "commentsView.resolvedIcon": "#59646c",
    "commentsView.unresolvedIcon": "#2e5f94",
    "editorCommentsWidget.resolvedBorder": "#59646c",
    "editorCommentsWidget.unresolvedBorder": "#2e5f94",
  },
};
const quickPickDisplayDelayMilliseconds = process.platform === "linux" ? 750 : 250;
const configurationCommandTimeoutMilliseconds = 15_000;

async function waitForConfigurationCommand(configurationCommandCompletion, commandIdentifier) {
  let configurationCommandTimeout;
  try {
    await Promise.race([
      configurationCommandCompletion,
      new Promise((_, rejectTimeout) => {
        configurationCommandTimeout = setTimeout(
          () => rejectTimeout(new Error(`${commandIdentifier} timed out`)),
          configurationCommandTimeoutMilliseconds
        );
      }),
    ]);
  } finally {
    clearTimeout(configurationCommandTimeout);
  }
}

async function completeConfigurationCommandAfterNotification(
  configurationCommandCompletion,
  commandIdentifier
) {
  const configurationCommandOutcome = configurationCommandCompletion.then(
    () => ({ state: "completed" }),
    (configurationCommandError) => ({
      configurationCommandError,
      state: "failed",
    })
  );
  const configurationCommandDeadline = Date.now() + configurationCommandTimeoutMilliseconds;

  while (Date.now() < configurationCommandDeadline) {
    const configurationCommandState = await Promise.race([
      configurationCommandOutcome,
      new Promise((resolveNotificationWait) =>
        setTimeout(() => resolveNotificationWait({ state: "pending" }), 250)
      ),
    ]);
    if (configurationCommandState.state === "completed") return;
    if (configurationCommandState.state === "failed") {
      throw configurationCommandState.configurationCommandError;
    }
    await vscode.commands.executeCommand("notifications.clearAll");
  }

  throw new Error(`${commandIdentifier} timed out`);
}

function serializeCommandManagedGlobalConfiguration() {
  return JSON.stringify(
    captureCommandManagedGlobalConfiguration().map(
      ({ configurationSection, configurationKey, globalValue }) => [
        configurationSection,
        configurationKey,
        globalValue,
      ]
    )
  );
}

function captureCommandManagedGlobalConfiguration() {
  return commandManagedConfigurationKeys.map(([configurationSection, configurationKey]) => ({
    configurationSection,
    configurationKey,
    globalValue: vscode.workspace.getConfiguration(configurationSection).inspect(configurationKey)
      ?.globalValue,
  }));
}

async function restoreCommandManagedGlobalConfiguration(configurationSnapshot) {
  for (const { configurationSection, configurationKey, globalValue } of configurationSnapshot) {
    await vscode.workspace
      .getConfiguration(configurationSection)
      .update(configurationKey, globalValue, vscode.ConfigurationTarget.Global);
  }
}

async function validateNativeConfigurationCommandCancellation() {
  for (const nativeConfigurationCommandIdentifier of nativeConfigurationCommandIdentifiers) {
    const configurationBeforeCancellation = serializeCommandManagedGlobalConfiguration();
    const configurationCommandCompletion = vscode.commands.executeCommand(
      nativeConfigurationCommandIdentifier
    );
    await new Promise((resolveQuickPickDisplay) =>
      setTimeout(resolveQuickPickDisplay, quickPickDisplayDelayMilliseconds)
    );
    await vscode.commands.executeCommand("workbench.action.closeQuickOpen");
    await waitForConfigurationCommand(
      configurationCommandCompletion,
      nativeConfigurationCommandIdentifier
    );
    assert.equal(
      serializeCommandManagedGlobalConfiguration(),
      configurationBeforeCancellation,
      `${nativeConfigurationCommandIdentifier} cancellation must write nothing`
    );
  }
}

async function acceptQuickPickSelection(nextSelectionCount = 0) {
  await new Promise((resolveQuickPickDisplay) =>
    setTimeout(resolveQuickPickDisplay, quickPickDisplayDelayMilliseconds)
  );
  for (let selectionNumber = 0; selectionNumber < nextSelectionCount; selectionNumber += 1) {
    await vscode.commands.executeCommand("workbench.action.quickOpenSelectNext");
  }
  await vscode.commands.executeCommand("workbench.action.acceptSelectedQuickOpenItem");
}

async function validateSuccessfulNativeConfigurationCommands(extension) {
  const guidedConfigurationCompletion = vscode.commands.executeCommand(
    "everforestComplete.configureTheme"
  );
  await acceptQuickPickSelection();
  await acceptQuickPickSelection();
  await acceptQuickPickSelection();
  await completeConfigurationCommandAfterNotification(
    guidedConfigurationCompletion,
    "everforestComplete.configureTheme"
  );

  const advancedConfigurationCompletion = vscode.commands.executeCommand(
    "everforestComplete.configureAdvancedControls"
  );
  await acceptQuickPickSelection(1);
  await acceptQuickPickSelection(7);
  await acceptQuickPickSelection();
  await completeConfigurationCommandAfterNotification(
    advancedConfigurationCompletion,
    "everforestComplete.configureAdvancedControls"
  );

  const premiumConfiguration = vscode.workspace.getConfiguration("everforestComplete");
  assert.equal(premiumConfiguration.get("darkCursor"), "purple");
  const regeneratedDarkTheme = JSON.parse(
    await readFile(
      join(extension.extensionPath, "themes/everforest-complete-dark-color-theme.json"),
      "utf8"
    )
  );
  assert.equal(regeneratedDarkTheme.colors["editorCursor.foreground"], "#d699b6");

  const automaticSwitchingConfigurationCompletion = vscode.commands.executeCommand(
    "everforestComplete.configureAutomaticSwitching"
  );
  await acceptQuickPickSelection(1);
  await completeConfigurationCommandAfterNotification(
    automaticSwitchingConfigurationCompletion,
    "everforestComplete.configureAutomaticSwitching"
  );

  assert.equal(vscode.workspace.getConfiguration("window").get("autoDetectColorScheme"), true);
  assert.equal(
    vscode.workspace.getConfiguration("workbench").get("preferredDarkColorTheme"),
    "Everforest Complete Dark"
  );
  assert.equal(
    vscode.workspace.getConfiguration("workbench").get("preferredLightColorTheme"),
    "Everforest Complete Light"
  );
  // Disable automatic switching before the explicit preset activation pass.
  await vscode.workspace
    .getConfiguration("window")
    .update("autoDetectColorScheme", false, vscode.ConfigurationTarget.Global);
}

function registeredThemeExtension() {
  const extension = vscode.extensions.getExtension(extensionIdentifier);
  assert.ok(extension, "Extension is registered");
  return extension;
}

function validateInstalledPremiumConfiguration(extension) {
  const installedPremiumSettings = Object.assign(
    {},
    ...extension.packageJSON.contributes.configuration.map(
      (configurationCategory) => configurationCategory.properties
    )
  );
  const expectedPremiumSettingIdentifiers = Object.keys(expectedPremiumConfigurationContracts);
  assert.equal(
    expectedPremiumSettingIdentifiers.length,
    14,
    "The integration contract must cover all 14 premium settings"
  );
  assert.equal(
    Object.keys(installedPremiumSettings).length,
    expectedPremiumSettingIdentifiers.length,
    "The installed VSIX must expose exactly 14 premium settings"
  );
  assert.deepEqual(
    Object.keys(installedPremiumSettings).sort(),
    [...expectedPremiumSettingIdentifiers].sort(),
    "The installed VSIX must expose the expected premium setting identifiers"
  );
  for (const [premiumSettingIdentifier, expectedPremiumSettingContract] of Object.entries(
    expectedPremiumConfigurationContracts
  )) {
    const installedPremiumSetting = installedPremiumSettings[premiumSettingIdentifier];
    assert.equal(
      installedPremiumSetting.scope,
      expectedPremiumSettingContract.scope,
      `${premiumSettingIdentifier} must remain application-scoped in the installed VSIX`
    );
    assert.deepEqual(
      installedPremiumSetting.default,
      expectedPremiumSettingContract.default,
      `${premiumSettingIdentifier} must preserve its default in the installed VSIX`
    );
  }
}

async function captureInstalledThemeSources(extension) {
  const themeSourcesByContributionPath = new Map();
  for (const themeContribution of expectedThemeContributions) {
    themeSourcesByContributionPath.set(
      themeContribution.path,
      await readFile(join(extension.extensionPath, themeContribution.path), "utf8")
    );
  }
  return themeSourcesByContributionPath;
}

async function waitForInstalledThemeSources(extension, expectedThemeSourcesByContributionPath) {
  const maximumThemeSourceReadAttempts = 40;
  for (
    let themeSourceReadAttempt = 0;
    themeSourceReadAttempt < maximumThemeSourceReadAttempts;
    themeSourceReadAttempt += 1
  ) {
    const currentThemeSourcesByContributionPath = await captureInstalledThemeSources(extension);
    const changedThemeSourcePaths = findChangedThemeSourcePaths(
      expectedThemeSourcesByContributionPath,
      currentThemeSourcesByContributionPath
    );
    if (changedThemeSourcePaths.length === 0) return currentThemeSourcesByContributionPath;
    await new Promise((resolveThemeSourceReadDelay) => setTimeout(resolveThemeSourceReadDelay, 50));
  }
  assert.deepEqual(
    findChangedThemeSourcePaths(
      expectedThemeSourcesByContributionPath,
      await captureInstalledThemeSources(extension)
    ),
    [],
    "Installed theme files must settle to the expected source state"
  );
}

async function waitForGeneratedThemeColor(themePath, colorIdentifier, expectedColor) {
  const maximumThemeReadAttempts = 40;
  for (
    let themeReadAttempt = 0;
    themeReadAttempt < maximumThemeReadAttempts;
    themeReadAttempt += 1
  ) {
    const generatedTheme = JSON.parse(await readFile(themePath, "utf8"));
    if (generatedTheme.colors[colorIdentifier] === expectedColor) return generatedTheme;
    await new Promise((resolveThemeReadDelay) => setTimeout(resolveThemeReadDelay, 50));
  }
  const generatedTheme = JSON.parse(await readFile(themePath, "utf8"));
  assert.equal(
    generatedTheme.colors[colorIdentifier],
    expectedColor,
    `Generated theme must apply ${colorIdentifier}`
  );
  return generatedTheme;
}

function waitForThemeActivation(expectedThemeKind, expectedThemeLabel) {
  const hasExpectedActiveTheme = () =>
    vscode.window.activeColorTheme.kind === expectedThemeKind &&
    vscode.workspace.getConfiguration("workbench").get("colorTheme") === expectedThemeLabel;
  if (hasExpectedActiveTheme()) return Promise.resolve();

  return new Promise((resolveActivation, rejectActivation) => {
    const activationTimeout = setTimeout(() => {
      themeChangeSubscription.dispose();
      rejectActivation(new Error(`Theme activation timed out: ${expectedThemeLabel}`));
    }, 2_000);
    const themeChangeSubscription = vscode.window.onDidChangeActiveColorTheme((activatedTheme) => {
      if (activatedTheme.kind !== expectedThemeKind) return;
      clearTimeout(activationTimeout);
      themeChangeSubscription.dispose();
      resolveActivation();
    });
    if (hasExpectedActiveTheme()) {
      clearTimeout(activationTimeout);
      themeChangeSubscription.dispose();
      resolveActivation();
    }
  });
}

async function waitForConfiguredTheme(expectedThemeLabel) {
  const maximumAttempts = 40;
  for (let attemptNumber = 0; attemptNumber < maximumAttempts; attemptNumber += 1) {
    const configuredTheme = vscode.workspace.getConfiguration("workbench").get("colorTheme");
    if (configuredTheme === expectedThemeLabel) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  assert.equal(
    vscode.workspace.getConfiguration("workbench").get("colorTheme"),
    expectedThemeLabel
  );
}

async function validatePremiumThemeRegeneration(extension) {
  const premiumConfiguration = vscode.workspace.getConfiguration("everforestComplete");
  const themeSourcesBeforeRegeneration = await captureInstalledThemeSources(extension);
  const configurableDarkThemePath = "./themes/everforest-complete-dark-color-theme.json";
  await premiumConfiguration.update("darkCursor", "red", vscode.ConfigurationTarget.Global);
  const darkThemePath = join(
    extension.extensionPath,
    "themes/everforest-complete-dark-color-theme.json"
  );
  const regeneratedDarkTheme = await waitForGeneratedThemeColor(
    darkThemePath,
    "editorCursor.foreground",
    "#f8a0a0"
  );
  assert.equal(regeneratedDarkTheme.colors["terminalCursor.foreground"], "#f8a0a0");

  const themeSourcesAfterRegeneration = await captureInstalledThemeSources(extension);
  assert.deepEqual(
    findChangedThemeSourcePaths(themeSourcesBeforeRegeneration, themeSourcesAfterRegeneration),
    [configurableDarkThemePath],
    "Dynamic regeneration must change only the configurable Dark theme"
  );
  for (const themeContribution of expectedThemeContributions) {
    if (themeContribution.path === configurableDarkThemePath) continue;
    assert.equal(
      themeSourcesAfterRegeneration.get(themeContribution.path),
      themeSourcesBeforeRegeneration.get(themeContribution.path),
      `${themeContribution.label} must remain stable during Dark regeneration`
    );
  }

  const configurationBeforeManualRegeneration = serializeCommandManagedGlobalConfiguration();
  const manualRegenerationCompletion = vscode.commands.executeCommand(
    "everforestComplete.regenerateThemes"
  );
  await completeConfigurationCommandAfterNotification(
    manualRegenerationCompletion,
    "everforestComplete.regenerateThemes"
  );
  assert.equal(
    serializeCommandManagedGlobalConfiguration(),
    configurationBeforeManualRegeneration,
    "Manual theme regeneration must not change configuration"
  );
  assert.deepEqual(
    await captureInstalledThemeSources(extension),
    themeSourcesAfterRegeneration,
    "Manual regeneration must not change the generated theme sources"
  );
}

function validateNativeSystemThemePreferences() {
  const windowConfiguration = vscode.workspace.getConfiguration("window");
  const workbenchConfiguration = vscode.workspace.getConfiguration("workbench");
  assert.equal(windowConfiguration.get("autoDetectColorScheme"), true);
  assert.equal(workbenchConfiguration.get("preferredDarkColorTheme"), "Everforest Complete Dark");
  assert.equal(workbenchConfiguration.get("preferredLightColorTheme"), "Everforest Complete Light");
  assert.ok(
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
      vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light,
    "System auto mode resolves to a supported Light or Dark appearance"
  );
  // ColorTheme exposes only kind in the minimum supported public API.
}

async function openThemeDocumentAfterLanguageService(themePath) {
  const themeDocument = await vscode.workspace.openTextDocument(themePath);
  await vscode.commands.executeCommand("vscode.executeDocumentSymbolProvider", themeDocument.uri);
  return themeDocument;
}

async function validateLanguageFixtures() {
  const fixtureWorkspace = vscode.workspace.workspaceFolders?.[0];
  assert.ok(fixtureWorkspace, "Fixture workspace is open");

  for (const [fixtureName, expectedLanguageIdentifier] of fixtureLanguageIdentifiers) {
    const fixtureDocument = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(fixtureWorkspace.uri, fixtureName)
    );
    assert.equal(fixtureDocument.languageId, expectedLanguageIdentifier, fixtureName);
  }

  const notebookFixtureUri = vscode.Uri.joinPath(fixtureWorkspace.uri, "showcase.ipynb");
  const notebookFixture = await vscode.workspace.openNotebookDocument(notebookFixtureUri);
  assert.equal(notebookFixture.cellCount, 2, "Notebook fixture has two cells");
  assert.equal(notebookFixture.cellAt(0).kind, vscode.NotebookCellKind.Markup);
  assert.equal(notebookFixture.cellAt(1).kind, vscode.NotebookCellKind.Code);
}

function validateInstalledSourceControlGraphColors(theme, themeLabel, contrastRatio) {
  const expectedInstalledSourceControlGraphColors =
    theme.type === "dark"
      ? {
          "scmGraph.foreground1": "#e67e80ff",
          "scmGraph.foreground2": "#e69875ff",
          "scmGraph.foreground3": "#dbbc7fff",
          "scmGraph.foreground4": "#a7c080ff",
          "scmGraph.foreground5": "#83c092ff",
          "scmGraph.historyItemRefColor": "#7fbbb3",
          "scmGraph.historyItemRemoteRefColor": "#d699b6",
          "scmGraph.historyItemBaseRefColor": "#e69875",
          "scmGraph.historyItemHoverLabelForeground": "#1b2024",
          "scmGraph.historyItemHoverAdditionsForeground": "#a7c080",
          "scmGraph.historyItemHoverDeletionsForeground": "#f8a0a0",
        }
      : {
          "scmGraph.foreground1": "#f85552ff",
          "scmGraph.foreground2": "#f57d26ff",
          "scmGraph.foreground3": "#dfa000ff",
          "scmGraph.foreground4": "#8da101ff",
          "scmGraph.foreground5": "#35a77cff",
          "scmGraph.historyItemRefColor": "#3a94c5",
          "scmGraph.historyItemRemoteRefColor": "#df69ba",
          "scmGraph.historyItemBaseRefColor": "#f57d26",
          "scmGraph.historyItemHoverLabelForeground": "#1b2024",
          "scmGraph.historyItemHoverAdditionsForeground": "#596600",
          "scmGraph.historyItemHoverDeletionsForeground": "#ad3d3d",
        };

  for (const [
    sourceControlGraphColorIdentifier,
    expectedInstalledSourceControlGraphColor,
  ] of Object.entries(expectedInstalledSourceControlGraphColors)) {
    assert.equal(
      theme.colors[sourceControlGraphColorIdentifier],
      expectedInstalledSourceControlGraphColor,
      `${themeLabel} must install ${sourceControlGraphColorIdentifier}`
    );
  }

  const installedSourceControlGraphLaneColors = [1, 2, 3, 4, 5].map(
    (sourceControlGraphLaneNumber) =>
      theme.colors[`scmGraph.foreground${sourceControlGraphLaneNumber}`]
  );
  assert.equal(
    new Set(installedSourceControlGraphLaneColors).size,
    installedSourceControlGraphLaneColors.length,
    `${themeLabel} source control graph lanes must remain visually distinct`
  );

  const sourceControlGraphLabelForeground =
    theme.colors["scmGraph.historyItemHoverLabelForeground"];
  for (const sourceControlGraphReferenceColorIdentifier of [
    "scmGraph.historyItemRefColor",
    "scmGraph.historyItemRemoteRefColor",
    "scmGraph.historyItemBaseRefColor",
  ]) {
    assert.ok(
      contrastRatio(
        sourceControlGraphLabelForeground,
        theme.colors[sourceControlGraphReferenceColorIdentifier]
      ) >= 4.5,
      `${themeLabel} installed ${sourceControlGraphReferenceColorIdentifier} label must meet 4.5:1 contrast`
    );
  }

  for (const sourceControlGraphChangeColorIdentifier of [
    "scmGraph.historyItemHoverAdditionsForeground",
    "scmGraph.historyItemHoverDeletionsForeground",
  ]) {
    assert.ok(
      contrastRatio(
        theme.colors[sourceControlGraphChangeColorIdentifier],
        theme.colors["editorHoverWidget.background"]
      ) >= 4.5,
      `${themeLabel} installed ${sourceControlGraphChangeColorIdentifier} must meet 4.5:1 contrast`
    );
  }
}

function validateInstalledSemanticWorkbenchStateColors(theme, themeLabel, contrastRatio) {
  const expectedInstalledSemanticWorkbenchStateColors =
    expectedSemanticWorkbenchStateColorsByThemeType[theme.type];
  assert.ok(expectedInstalledSemanticWorkbenchStateColors, `Unsupported theme type: ${theme.type}`);

  for (const [
    semanticWorkbenchColorIdentifier,
    expectedInstalledSemanticWorkbenchColor,
  ] of Object.entries(expectedInstalledSemanticWorkbenchStateColors)) {
    assert.equal(
      theme.colors[semanticWorkbenchColorIdentifier],
      expectedInstalledSemanticWorkbenchColor,
      `${themeLabel} must install ${semanticWorkbenchColorIdentifier}`
    );
  }

  assert.equal(theme.colors["scrollbar.background"], `${theme.colors["editor.background"]}00`);
  assert.equal(
    theme.colors["minimap.foregroundOpacity"].slice(-2),
    theme.type === "dark" ? "a0" : "c0",
    `${themeLabel} installed minimap foreground opacity`
  );
  for (const continuousEditorSurfaceIdentifier of [
    "minimap.background",
    "editorOverviewRuler.background",
  ]) {
    assert.equal(
      theme.colors[continuousEditorSurfaceIdentifier],
      theme.colors["editor.background"],
      `${themeLabel} installed ${continuousEditorSurfaceIdentifier} must continue the editor surface`
    );
  }

  for (const translucentSemanticWorkbenchColorIdentifier of [
    "minimap.selectionOccurrenceHighlight",
    "minimap.chatEditHighlight",
    "chart.axis",
    "chart.guide",
  ]) {
    const translucentSemanticWorkbenchColor =
      theme.colors[translucentSemanticWorkbenchColorIdentifier];
    assert.match(
      translucentSemanticWorkbenchColor,
      /^#[0-9a-f]{8}$/i,
      `${themeLabel} installed ${translucentSemanticWorkbenchColorIdentifier} must include alpha`
    );
    assert.notEqual(
      translucentSemanticWorkbenchColor.slice(-2).toLowerCase(),
      "ff",
      `${themeLabel} installed ${translucentSemanticWorkbenchColorIdentifier} must be translucent`
    );
  }

  for (const distinctSemanticWorkbenchColorIdentifiers of [
    ["minimap.selectionOccurrenceHighlight", "minimap.chatEditHighlight"],
    ["chart.line", "chart.axis", "chart.guide"],
    ["commentsView.resolvedIcon", "commentsView.unresolvedIcon"],
    ["editorCommentsWidget.resolvedBorder", "editorCommentsWidget.unresolvedBorder"],
  ]) {
    assert.equal(
      new Set(
        distinctSemanticWorkbenchColorIdentifiers.map(
          (semanticWorkbenchColorIdentifier) => theme.colors[semanticWorkbenchColorIdentifier]
        )
      ).size,
      distinctSemanticWorkbenchColorIdentifiers.length,
      `${themeLabel} installed ${distinctSemanticWorkbenchColorIdentifiers.join(", ")} must remain distinct`
    );
  }

  for (const [foregroundIdentifier, backgroundIdentifier, minimumContrast] of [
    ["gitDecoration.renamedResourceForeground", "sideBar.background", 4.5],
    ["debugView.valueChangedHighlight", "sideBar.background", 4.5],
    ["settings.modifiedItemIndicator", "editor.background", 3],
    ["chart.line", "editor.background", 3],
    ["commentsView.resolvedIcon", "sideBar.background", 3],
    ["commentsView.unresolvedIcon", "sideBar.background", 3],
    ["editorCommentsWidget.resolvedBorder", "editorWidget.background", 3],
    ["editorCommentsWidget.unresolvedBorder", "editorWidget.background", 3],
  ]) {
    assert.ok(
      contrastRatio(theme.colors[foregroundIdentifier], theme.colors[backgroundIdentifier]) >=
        minimumContrast,
      `${themeLabel} installed ${foregroundIdentifier} must meet ${minimumContrast}:1 contrast against ${backgroundIdentifier}`
    );
  }
}

function validateInstalledSelectionColors(theme, themeLabel, compositeHexColor, contrastRatio) {
  const selectionAccent = theme.type === "dark" ? "#859289" : "#939f91";
  const readableSelectionBorder = theme.type === "dark" ? "#9ba89e" : "#59646c";
  const expectedSelectionColors = {
    "editor.selectionBackground": `${selectionAccent}${theme.type === "dark" ? "80" : "a0"}`,
    "editor.selectionForeground": theme.type === "dark" ? "#fdf6e3" : "#2d353b",
    "editor.inactiveSelectionBackground": `${selectionAccent}${theme.type === "dark" ? "40" : "60"}`,
    "editor.selectionHighlightBackground": `${selectionAccent}${theme.type === "dark" ? "20" : "30"}`,
    "editor.selectionHighlightBorder": readableSelectionBorder,
  };

  for (const [selectionColorIdentifier, expectedSelectionColor] of Object.entries(
    expectedSelectionColors
  )) {
    assert.equal(
      theme.colors[selectionColorIdentifier],
      expectedSelectionColor,
      `${themeLabel} must install ${selectionColorIdentifier}`
    );
  }

  const compositedSelectionBackground = compositeHexColor(
    theme.colors["editor.selectionBackground"],
    theme.colors["editor.background"]
  );
  assert.ok(
    contrastRatio(compositedSelectionBackground, theme.colors["editor.background"]) >=
      (theme.type === "dark" ? 1.9 : 1.3),
    `${themeLabel} active selection must remain distinct from the editor surface`
  );
  assert.ok(
    contrastRatio(theme.colors["editor.selectionForeground"], compositedSelectionBackground) >= 4.5,
    `${themeLabel} selected text must meet 4.5:1 contrast`
  );

  assert.equal(
    theme.colors["terminal.selectionBackground"],
    theme.colors["editor.selectionBackground"],
    `${themeLabel} editor and terminal active selections must match`
  );
  assert.equal(theme.colors["minimap.selectionHighlight"], `${readableSelectionBorder}e0`);
  assert.ok(
    contrastRatio(
      compositeHexColor(
        theme.colors["minimap.selectionHighlight"],
        theme.colors["editor.background"]
      ),
      theme.colors["editor.background"]
    ) >= 3,
    `${themeLabel} minimap selection must meet 3:1 contrast`
  );
  assert.equal(
    theme.colors["terminal.inactiveSelectionBackground"],
    theme.colors["editor.inactiveSelectionBackground"],
    `${themeLabel} editor and terminal inactive selections must match`
  );
  assert.equal(
    theme.colors["terminal.selectionForeground"],
    theme.colors["editor.selectionForeground"],
    `${themeLabel} editor and terminal selected text must match`
  );
}

function validateInstalledDesktopWorkbenchColors(
  theme,
  themeLabel,
  compositeHexColor,
  contrastRatio,
  findIndistinguishableHoverBackgroundPairs
) {
  for (const secondaryWorkbenchSurfaceIdentifier of [
    "activityBar.background",
    "sideBar.background",
    "editorGroupHeader.tabsBackground",
    "tab.inactiveBackground",
    "statusBar.background",
    "titleBar.activeBackground",
    "notifications.background",
  ]) {
    assert.equal(
      theme.colors[secondaryWorkbenchSurfaceIdentifier],
      theme.colors["panel.background"],
      `${themeLabel} must install one coherent secondary workbench surface`
    );
  }
  assert.equal(theme.colors["tab.activeBackground"], theme.colors["editor.background"]);

  for (const activeWorkbenchIndicatorIdentifier of [
    "panelTitle.activeBorder",
    "tab.activeBorder",
    "terminal.tab.activeBorder",
  ]) {
    assert.equal(
      theme.colors[activeWorkbenchIndicatorIdentifier],
      theme.colors["textLink.foreground"],
      `${themeLabel} must install one active-state accent`
    );
  }
  assert.equal(
    theme.colors["activityBar.activeBorder"],
    `${theme.colors["textLink.foreground"]}d0`,
    `${themeLabel} must install the translucent active-state accent in the Activity Bar`
  );

  for (const [foregroundIdentifier, backgroundIdentifier, minimumContrast] of [
    ["foreground", "sideBar.background", 4.5],
    ["descriptionForeground", "sideBar.background", 4.5],
    ["icon.foreground", "activityBar.background", 4.5],
    ["tab.inactiveForeground", "tab.inactiveBackground", 4.5],
    ["titleBar.inactiveForeground", "titleBar.inactiveBackground", 4.5],
    ["commandCenter.foreground", "commandCenter.background", 4.5],
    ["dropdown.foreground", "dropdown.background", 4.5],
    ["settings.dropdownForeground", "settings.dropdownBackground", 4.5],
    ["settings.numberInputForeground", "settings.numberInputBackground", 4.5],
    ["settings.textInputForeground", "settings.textInputBackground", 4.5],
    ["checkbox.foreground", "checkbox.background", 3],
    ["settings.checkboxForeground", "settings.checkboxBackground", 3],
    ["extensionBadge.remoteForeground", "extensionBadge.remoteBackground", 4.5],
    ["gitDecoration.addedResourceForeground", "sideBar.background", 4.5],
    ["gitDecoration.modifiedResourceForeground", "sideBar.background", 4.5],
    ["gitDecoration.deletedResourceForeground", "sideBar.background", 4.5],
    ["gitDecoration.untrackedResourceForeground", "sideBar.background", 4.5],
  ]) {
    assert.ok(
      contrastRatio(theme.colors[foregroundIdentifier], theme.colors[backgroundIdentifier]) >=
        minimumContrast,
      `${themeLabel} installed ${foregroundIdentifier} must meet ${minimumContrast}:1 contrast against ${backgroundIdentifier}`
    );
  }

  assert.notEqual(theme.colors.disabledForeground, theme.colors.foreground);
  assert.equal(theme.colors["extensionButton.background"], theme.colors["button.background"]);
  assert.equal(theme.colors["extensionButton.foreground"], theme.colors["button.foreground"]);
  assert.equal(
    theme.colors["extensionButton.prominentBackground"],
    theme.colors["button.background"]
  );
  assert.equal(
    theme.colors["extensionButton.prominentForeground"],
    theme.colors["button.foreground"]
  );

  const semanticStatusBackgroundIdentifiers = [
    "statusBar.debuggingBackground",
    "statusBarItem.remoteBackground",
    "statusBarItem.errorBackground",
    "statusBarItem.warningBackground",
  ];
  assert.equal(
    new Set(
      semanticStatusBackgroundIdentifiers.map(
        (semanticStatusBackgroundIdentifier) => theme.colors[semanticStatusBackgroundIdentifier]
      )
    ).size,
    semanticStatusBackgroundIdentifiers.length,
    `${themeLabel} must install distinct debugging, remote, error, and warning states`
  );

  for (const [statusForegroundIdentifier, statusBackgroundIdentifier] of [
    ["statusBar.debuggingForeground", "statusBar.debuggingBackground"],
    ["statusBarItem.remoteForeground", "statusBarItem.remoteBackground"],
    ["statusBarItem.remoteHoverForeground", "statusBarItem.remoteHoverBackground"],
    ["statusBarItem.errorForeground", "statusBarItem.errorBackground"],
    ["statusBarItem.errorHoverForeground", "statusBarItem.errorHoverBackground"],
    ["statusBarItem.warningForeground", "statusBarItem.warningBackground"],
    ["statusBarItem.warningHoverForeground", "statusBarItem.warningHoverBackground"],
    ["statusBarItem.prominentForeground", "statusBarItem.prominentBackground"],
  ]) {
    const renderedStatusBackground = statusBackgroundIdentifier.includes("Hover")
      ? compositeHexColor(
          theme.colors[statusBackgroundIdentifier],
          theme.colors[statusBackgroundIdentifier.replace("Hover", "")]
        )
      : theme.colors[statusBackgroundIdentifier];
    assert.ok(
      contrastRatio(theme.colors[statusForegroundIdentifier], renderedStatusBackground) >= 4.5,
      `${themeLabel} installed ${statusForegroundIdentifier} must meet 4.5:1 contrast against ${statusBackgroundIdentifier}`
    );
  }

  for (const [hoverBackgroundIdentifier, baseBackgroundIdentifier] of [
    ["button.hoverBackground", "button.background"],
    ["statusBarItem.prominentHoverBackground", "statusBarItem.prominentBackground"],
    ["statusBarItem.remoteHoverBackground", "statusBarItem.remoteBackground"],
    ["statusBarItem.errorHoverBackground", "statusBarItem.errorBackground"],
    ["statusBarItem.warningHoverBackground", "statusBarItem.warningBackground"],
    ["extensionButton.hoverBackground", "extensionButton.background"],
    ["extensionButton.prominentHoverBackground", "extensionButton.prominentBackground"],
  ]) {
    const renderedHoverBackground = compositeHexColor(
      theme.colors[hoverBackgroundIdentifier],
      theme.colors[baseBackgroundIdentifier]
    );
    assert.ok(
      contrastRatio(renderedHoverBackground, theme.colors[baseBackgroundIdentifier]) >= 1.05,
      `${themeLabel} installed ${hoverBackgroundIdentifier} must meet 1.05:1 rendered contrast against ${baseBackgroundIdentifier}`
    );
  }

  assert.deepEqual(
    findIndistinguishableHoverBackgroundPairs(theme.colors),
    [],
    `${themeLabel} must install visibly interactive hover backgrounds`
  );
}

async function restoreIntegrationState(
  extension,
  originalConfigurationSnapshot,
  originalThemeSourcesByContributionPath
) {
  await restoreCommandManagedGlobalConfiguration(originalConfigurationSnapshot);

  // A forced regeneration stores the matching fingerprint in extension global state and restores
  // both configurable files from the restored settings. Fixed preset files remain untouched.
  const regenerationCompletion = vscode.commands.executeCommand(
    "everforestComplete.regenerateThemes"
  );
  await completeConfigurationCommandAfterNotification(
    regenerationCompletion,
    "everforestComplete.regenerateThemes cleanup"
  );
  assert.deepEqual(
    captureCommandManagedGlobalConfiguration(),
    originalConfigurationSnapshot,
    "Integration cleanup must restore every managed global setting"
  );
  await waitForInstalledThemeSources(extension, originalThemeSourcesByContributionPath);
}

async function runWithIntegrationStateRestored(extension, integrationOperation) {
  const originalConfigurationSnapshot = captureCommandManagedGlobalConfiguration();
  const originalThemeSourcesByContributionPath = await captureInstalledThemeSources(extension);
  let integrationOperationError;
  const cleanupErrors = [];

  try {
    await integrationOperation();
  } catch (operationError) {
    integrationOperationError = operationError;
  }

  try {
    await restoreIntegrationState(
      extension,
      originalConfigurationSnapshot,
      originalThemeSourcesByContributionPath
    );
  } catch (cleanupError) {
    cleanupErrors.push(cleanupError);
  }

  if (integrationOperationError && cleanupErrors.length > 0) {
    throw new AggregateError(
      [integrationOperationError, ...cleanupErrors],
      "Integration validation and state cleanup failed"
    );
  }
  if (integrationOperationError) throw integrationOperationError;
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "Integration state cleanup failed");
  }
}

async function run() {
  const { compositeHexColor, contrastRatio } = await import("../../scripts/color-contrast.mjs");
  const { findIndistinguishableHoverBackgroundPairs } =
    await import("../../scripts/workbench-interaction-contract.mjs");
  const jsonLanguageFeatures = vscode.extensions.getExtension("vscode.json-language-features");
  assert.ok(jsonLanguageFeatures, "VS Code JSON language features are registered");
  await jsonLanguageFeatures.activate();
  const integrationTestMode = process.env.EVERFOREST_INTEGRATION_TEST_MODE;
  assert.ok(
    integrationTestMode === "auto-mode" || integrationTestMode === "manual-themes",
    `Unexpected integration test mode: ${integrationTestMode}`
  );
  const extension = registeredThemeExtension();
  assert.match(
    extension.extensionPath,
    /[/\\]extensions[/\\]overengineered-org\.everforest-complete-[^/\\]+$/i,
    "Extension was loaded from an installed VSIX directory"
  );
  assert.equal(
    extension.packageJSON.version,
    expectedInstalledExtensionVersion,
    "Installed VSIX version must match the exact packaged artifact"
  );
  assert.equal(extension.packageJSON.main, "./dist/extension.js");
  assert.equal(extension.packageJSON.browser, "./dist/extension-web.js");
  assert.deepEqual(extension.packageJSON.activationEvents, ["onStartupFinished"]);
  assert.deepEqual(extension.packageJSON.contributes.themes, expectedThemeContributions);
  validateInstalledPremiumConfiguration(extension);
  assert.equal(
    extension.isActive,
    true,
    "Premium runtime is already active from onStartupFinished before manual activation"
  );
  await extension.activate();
  assert.equal(extension.isActive, true, "Premium runtime activates in VS Code Desktop");
  const registeredCommandIdentifiers = new Set(await vscode.commands.getCommands(true));
  for (const premiumCommandIdentifier of [
    ...nativeConfigurationCommandIdentifiers,
    "everforestComplete.regenerateThemes",
  ]) {
    assert.ok(
      registeredCommandIdentifiers.has(premiumCommandIdentifier),
      `${premiumCommandIdentifier} is registered in the installed VSIX`
    );
  }
  assert.equal(
    registeredCommandIdentifiers.has("everforestComplete.openSettings"),
    false,
    "The retired Settings command is not registered"
  );
  await validateNativeConfigurationCommandCancellation();
  assert.equal(extension.packageJSON.contributes.walkthroughs.length, 1);
  assert.deepEqual(
    extension.packageJSON.contributes.configuration.map(({ title }) => title),
    [
      "Everforest Complete: Appearance",
      "Everforest Complete: Editor",
      "Everforest Complete: Accessibility",
      "Everforest Complete: Automation",
    ]
  );

  for (const themeContribution of extension.packageJSON.contributes.themes) {
    const themePath = join(extension.extensionPath, themeContribution.path);
    const theme = JSON.parse(await readFile(themePath, "utf8"));
    assert.equal(theme.name, themeContribution.label);
    assert.equal(theme.$schema, "vscode://schemas/color-theme");
    assert.equal(theme.type, themeContribution.uiTheme === "vs-dark" ? "dark" : "light");
    assert.equal(theme.semanticHighlighting, true);
    assert.ok(theme.colors["editor.background"]);
    const missingDocumentedWorkbenchColorIdentifiers =
      documentedWorkbenchColorContract.identifiers.filter(
        (documentedWorkbenchColorIdentifier) =>
          !(documentedWorkbenchColorIdentifier in theme.colors)
      );
    assert.deepEqual(
      missingDocumentedWorkbenchColorIdentifiers,
      [],
      `${themeContribution.label} must install every documented workbench color`
    );
    for (const translucentWorkbenchColorIdentifier of documentedWorkbenchColorContract.translucentIdentifiers) {
      const translucentWorkbenchColor = theme.colors[translucentWorkbenchColorIdentifier];
      assert.match(
        translucentWorkbenchColor,
        /^#[0-9a-f]{8}$/i,
        `${themeContribution.label} ${translucentWorkbenchColorIdentifier} must include alpha`
      );
      assert.notEqual(
        translucentWorkbenchColor.slice(-2).toLowerCase(),
        "ff",
        `${themeContribution.label} ${translucentWorkbenchColorIdentifier} must not be opaque`
      );
    }
    for (const semanticTokenIdentifier of requiredSemanticTokenIdentifiers) {
      assert.ok(
        semanticTokenIdentifier in theme.semanticTokenColors,
        `${themeContribution.label} must install semantic token ${semanticTokenIdentifier}`
      );
    }
    const installedSyntaxScopes = new Set(
      theme.tokenColors.flatMap(({ scope }) =>
        Array.isArray(scope)
          ? scope
          : String(scope ?? "")
              .split(",")
              .map((syntaxScope) => syntaxScope.trim())
      )
    );
    for (const requiredSyntaxScope of requiredSyntaxScopes) {
      assert.ok(
        installedSyntaxScopes.has(requiredSyntaxScope),
        `${themeContribution.label} must install syntax scope ${requiredSyntaxScope}`
      );
    }
    for (const searchMatchColorIdentifier of [
      "editor.findMatchBorder",
      "editor.findMatchHighlightBorder",
      "terminal.findMatchBorder",
      "terminal.findMatchHighlightBorder",
    ]) {
      assert.match(
        theme.colors[searchMatchColorIdentifier],
        /^#[0-9a-f]{6}$/i,
        `${themeContribution.label} must install ${searchMatchColorIdentifier}`
      );
    }
    assert.notEqual(
      theme.colors["editor.findMatchBorder"],
      theme.colors["editor.findMatchHighlightBorder"],
      `${themeContribution.label} must distinguish active editor search matches`
    );
    assert.notEqual(
      theme.colors["terminal.findMatchBorder"],
      theme.colors["terminal.findMatchHighlightBorder"],
      `${themeContribution.label} must distinguish active terminal search matches`
    );
    validateInstalledSourceControlGraphColors(theme, themeContribution.label, contrastRatio);
    validateInstalledSemanticWorkbenchStateColors(theme, themeContribution.label, contrastRatio);
    validateInstalledSelectionColors(
      theme,
      themeContribution.label,
      compositeHexColor,
      contrastRatio
    );
    validateInstalledDesktopWorkbenchColors(
      theme,
      themeContribution.label,
      compositeHexColor,
      contrastRatio,
      findIndistinguishableHoverBackgroundPairs
    );
    for (const searchMatchSurface of [
      {
        activeBorder: "editor.findMatchBorder",
        background: "editor.background",
        otherBorder: "editor.findMatchHighlightBorder",
      },
      {
        activeBorder: "terminal.findMatchBorder",
        background: "terminal.background",
        otherBorder: "terminal.findMatchHighlightBorder",
      },
    ]) {
      for (const searchMatchBorder of [
        searchMatchSurface.activeBorder,
        searchMatchSurface.otherBorder,
      ]) {
        assert.ok(
          contrastRatio(
            theme.colors[searchMatchBorder],
            theme.colors[searchMatchSurface.background]
          ) >= 3,
          `${themeContribution.label} installed ${searchMatchBorder} must meet 3:1 contrast`
        );
      }
    }

    const themeDocument = await openThemeDocumentAfterLanguageService(themePath);
    assert.equal(themeDocument.languageId, "jsonc");
    const schemaErrors = vscode.languages
      .getDiagnostics(themeDocument.uri)
      .filter((diagnostic) => diagnostic.severity === vscode.DiagnosticSeverity.Error);
    assert.deepEqual(
      schemaErrors.map((diagnostic) => diagnostic.message),
      [],
      `${themeContribution.label} must satisfy VS Code's color-theme schema`
    );
  }

  if (integrationTestMode === "auto-mode") {
    validateNativeSystemThemePreferences();
    console.log("Validated native VS Code system auto mode preferences.");
    return;
  }

  await runWithIntegrationStateRestored(extension, async () => {
    const workbenchConfiguration = vscode.workspace.getConfiguration("workbench");
    await validateLanguageFixtures();
    await validateSuccessfulNativeConfigurationCommands(extension);
    await validatePremiumThemeRegeneration(extension);
    for (const themeContribution of extension.packageJSON.contributes.themes) {
      const expectedThemeKind =
        themeContribution.uiTheme === "vs-dark"
          ? vscode.ColorThemeKind.Dark
          : vscode.ColorThemeKind.Light;
      const themeActivation = waitForThemeActivation(expectedThemeKind, themeContribution.label);
      await workbenchConfiguration.update(
        "colorTheme",
        themeContribution.label,
        vscode.ConfigurationTarget.Global
      );
      await themeActivation;
      await waitForConfiguredTheme(themeContribution.label);
    }
  });

  console.log("Validated six presets and two configurable themes inside VS Code Extension Host.");
}

module.exports = { run };
