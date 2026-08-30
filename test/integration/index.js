const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join, resolve } = require("node:path");
const vscode = require("vscode");
const {
  expectedThemeContributions,
  requiredSemanticTokenIdentifiers,
  requiredSyntaxScopes,
} = require("../support/theme-manifest.cjs");

const extensionIdentifier = "overengineered-org.everforest-complete";
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

function serializeCommandManagedGlobalConfiguration() {
  return JSON.stringify(
    commandManagedConfigurationKeys.map(([configurationSection, configurationKey]) => [
      configurationSection,
      configurationKey,
      vscode.workspace.getConfiguration(configurationSection).inspect(configurationKey)
        ?.globalValue,
    ])
  );
}

async function validateNativeConfigurationCommandCancellation() {
  for (const nativeConfigurationCommandIdentifier of nativeConfigurationCommandIdentifiers) {
    const configurationBeforeCancellation = serializeCommandManagedGlobalConfiguration();
    const configurationCommandCompletion = vscode.commands.executeCommand(
      nativeConfigurationCommandIdentifier
    );
    await new Promise((resolveQuickPickDisplay) => setTimeout(resolveQuickPickDisplay, 150));
    await vscode.commands.executeCommand("workbench.action.closeQuickOpen");
    await configurationCommandCompletion;
    assert.equal(
      serializeCommandManagedGlobalConfiguration(),
      configurationBeforeCancellation,
      `${nativeConfigurationCommandIdentifier} cancellation must write nothing`
    );
  }
}

async function acceptQuickPickSelection(nextSelectionCount = 0) {
  await new Promise((resolveQuickPickDisplay) => setTimeout(resolveQuickPickDisplay, 150));
  for (let selectionNumber = 0; selectionNumber < nextSelectionCount; selectionNumber += 1) {
    await vscode.commands.executeCommand("workbench.action.quickOpenSelectNext");
  }
  await vscode.commands.executeCommand("workbench.action.acceptSelectedQuickOpenItem");
}

async function dismissConfigurationNotification() {
  await new Promise((resolveNotificationDisplay) => setTimeout(resolveNotificationDisplay, 250));
  await vscode.commands.executeCommand("notifications.clearAll");
}

async function validateSuccessfulNativeConfigurationCommands(extension) {
  const guidedConfigurationCompletion = vscode.commands.executeCommand(
    "everforestComplete.configureTheme"
  );
  await acceptQuickPickSelection();
  await acceptQuickPickSelection();
  await acceptQuickPickSelection();
  await dismissConfigurationNotification();
  await guidedConfigurationCompletion;

  const advancedConfigurationCompletion = vscode.commands.executeCommand(
    "everforestComplete.configureAdvancedControls"
  );
  await acceptQuickPickSelection(1);
  await acceptQuickPickSelection(7);
  await acceptQuickPickSelection();
  await dismissConfigurationNotification();
  await advancedConfigurationCompletion;

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
  await dismissConfigurationNotification();
  await automaticSwitchingConfigurationCompletion;

  assert.equal(vscode.workspace.getConfiguration("window").get("autoDetectColorScheme"), true);
  assert.equal(
    vscode.workspace.getConfiguration("workbench").get("preferredDarkColorTheme"),
    "Everforest Complete Dark"
  );
  assert.equal(
    vscode.workspace.getConfiguration("workbench").get("preferredLightColorTheme"),
    "Everforest Complete Light"
  );
  await vscode.workspace
    .getConfiguration("window")
    .update("autoDetectColorScheme", false, vscode.ConfigurationTarget.Global);
}

function registeredThemeExtension() {
  const extension = vscode.extensions.getExtension(extensionIdentifier);
  assert.ok(extension, "Extension is registered");
  return extension;
}

function waitForThemeActivation(expectedThemeKind, expectedThemeLabel) {
  return new Promise((resolveActivation, rejectActivation) => {
    const activationTimeout = setTimeout(() => {
      themeChangeSubscription.dispose();
      rejectActivation(new Error(`Theme activation timed out: ${expectedThemeLabel}`));
    }, 2_000);
    const themeChangeSubscription = vscode.window.onDidChangeActiveColorTheme((activatedTheme) => {
      const configuredTheme = vscode.workspace.getConfiguration("workbench").get("colorTheme");
      if (activatedTheme.kind !== expectedThemeKind || configuredTheme !== expectedThemeLabel)
        return;
      clearTimeout(activationTimeout);
      themeChangeSubscription.dispose();
      resolveActivation();
    });
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
  await premiumConfiguration.update("darkCursor", "purple", vscode.ConfigurationTarget.Global);
  const darkThemePath = join(
    extension.extensionPath,
    "themes/everforest-complete-dark-color-theme.json"
  );

  for (let attemptNumber = 0; attemptNumber < 40; attemptNumber += 1) {
    const regeneratedDarkTheme = JSON.parse(await readFile(darkThemePath, "utf8"));
    if (regeneratedDarkTheme.colors["editorCursor.foreground"] === "#d699b6") return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }

  const regeneratedDarkTheme = JSON.parse(await readFile(darkThemePath, "utf8"));
  assert.equal(
    regeneratedDarkTheme.colors["editorCursor.foreground"],
    "#d699b6",
    "Configuration changes regenerate the installed Dark theme"
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
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
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
  const expectedResolvedCommentIndicator = theme.type === "dark" ? "#9aa79d" : "#59646c";
  const expectedInstalledSemanticWorkbenchStateColors = {
    "minimap.selectionOccurrenceHighlight": theme.colors["editor.selectionHighlightBackground"],
    "minimap.chatEditHighlight": theme.type === "dark" ? "#a7c08099" : "#59660080",
    "chart.line": theme.colors["terminal.ansiBlue"],
    "chart.axis": `${theme.colors["terminal.foreground"]}${theme.type === "dark" ? "66" : "99"}`,
    "chart.guide": `${theme.colors["terminal.foreground"]}33`,
    "gitDecoration.renamedResourceForeground": theme.colors["terminal.ansiCyan"],
    "debugView.valueChangedHighlight": theme.colors["terminal.ansiBlue"],
    "settings.modifiedItemIndicator": theme.colors["terminal.ansiBlue"],
    "commentsView.resolvedIcon": expectedResolvedCommentIndicator,
    "commentsView.unresolvedIcon": theme.colors["terminal.ansiBlue"],
    "editorCommentsWidget.resolvedBorder": expectedResolvedCommentIndicator,
    "editorCommentsWidget.unresolvedBorder": theme.colors["terminal.ansiBlue"],
  };

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
  const expectedSelectionColors = {
    "editor.selectionBackground": `${selectionAccent}${theme.type === "dark" ? "80" : "a0"}`,
    "editor.selectionForeground": theme.type === "dark" ? "#fdf6e3" : "#2d353b",
    "editor.inactiveSelectionBackground": `${selectionAccent}${theme.type === "dark" ? "40" : "60"}`,
    "editor.selectionHighlightBackground": `${selectionAccent}${theme.type === "dark" ? "20" : "30"}`,
    "editor.selectionHighlightBorder": `${selectionAccent}80`,
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
  assert.equal(
    theme.colors["minimap.selectionHighlight"],
    theme.colors["editor.selectionBackground"],
    `${themeLabel} editor and minimap active selections must match`
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
    assert.ok(
      contrastRatio(
        theme.colors[statusForegroundIdentifier],
        theme.colors[statusBackgroundIdentifier]
      ) >= 4.5,
      `${themeLabel} installed ${statusForegroundIdentifier} must meet 4.5:1 contrast against ${statusBackgroundIdentifier}`
    );
  }

  assert.deepEqual(
    findIndistinguishableHoverBackgroundPairs(theme.colors),
    [],
    `${themeLabel} must install visibly interactive hover backgrounds`
  );
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
  assert.match(extension.extensionPath, /extensions/i, "Extension was loaded from clean install");
  assert.equal(extension.packageJSON.main, "./dist/extension.js");
  assert.equal(extension.packageJSON.browser, "./dist/extension-web.js");
  assert.deepEqual(extension.packageJSON.activationEvents, ["onStartupFinished"]);
  assert.deepEqual(extension.packageJSON.contributes.themes, expectedThemeContributions);
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

  const workbenchConfiguration = vscode.workspace.getConfiguration("workbench");
  const originalTheme = workbenchConfiguration.get("colorTheme");
  try {
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
  } finally {
    await workbenchConfiguration.update(
      "colorTheme",
      originalTheme,
      vscode.ConfigurationTarget.Global
    );
  }

  console.log("Validated six presets and two configurable themes inside VS Code Extension Host.");
}

module.exports = { run };
