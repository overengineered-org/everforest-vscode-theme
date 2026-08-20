const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const vscode = require("vscode");

const extensionIdentifier = "overengineered-org.everforest-complete";
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

function registeredThemeExtension() {
  const extension = vscode.extensions.getExtension(extensionIdentifier);
  assert.ok(extension, "Extension is registered");
  return extension;
}

async function waitForActiveThemeKind(expectedThemeKind) {
  const maximumAttempts = 40;
  for (let attemptNumber = 0; attemptNumber < maximumAttempts; attemptNumber += 1) {
    if (vscode.window.activeColorTheme.kind === expectedThemeKind) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  assert.equal(vscode.window.activeColorTheme.kind, expectedThemeKind);
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

function validateNativeSystemThemePreferences() {
  const windowConfiguration = vscode.workspace.getConfiguration("window");
  const workbenchConfiguration = vscode.workspace.getConfiguration("workbench");
  assert.equal(windowConfiguration.get("autoDetectColorScheme"), true);
  assert.equal(
    workbenchConfiguration.get("preferredDarkColorTheme"),
    "Everforest Complete Dark Medium"
  );
  assert.equal(
    workbenchConfiguration.get("preferredLightColorTheme"),
    "Everforest Complete Light Medium"
  );
  assert.ok(
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ||
      vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light,
    "System auto mode resolves to a supported Light or Dark appearance"
  );
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

  const notebookFixture = await vscode.workspace.openTextDocument(
    vscode.Uri.joinPath(fixtureWorkspace.uri, "showcase.ipynb")
  );
  assert.doesNotThrow(
    () => JSON.parse(notebookFixture.getText()),
    "Notebook fixture is valid JSON"
  );
}

async function run() {
  const integrationTestMode = process.env.EVERFOREST_INTEGRATION_TEST_MODE;
  assert.ok(
    integrationTestMode === "auto-mode" || integrationTestMode === "manual-themes",
    `Unexpected integration test mode: ${integrationTestMode}`
  );
  const extension = registeredThemeExtension();
  assert.match(extension.extensionPath, /extensions/i, "Extension was loaded from clean install");
  assert.equal(extension.packageJSON.main, undefined);
  assert.equal(extension.packageJSON.browser, undefined);
  assert.equal(extension.packageJSON.activationEvents, undefined);
  assert.equal(extension.packageJSON.contributes.themes.length, 6);

  for (const themeContribution of extension.packageJSON.contributes.themes) {
    const themePath = join(extension.extensionPath, themeContribution.path);
    const theme = JSON.parse(await readFile(themePath, "utf8"));
    assert.equal(theme.name, themeContribution.label);
    assert.ok(theme.colors["editor.background"]);
    assert.ok(theme.semanticTokenColors);
    assert.ok(theme.tokenColors.length >= 150);

    const themeDocument = await vscode.workspace.openTextDocument(themePath);
    assert.equal(themeDocument.languageId, "jsonc");
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
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
    console.log("Validated native VS Code system auto mode and Medium preferences.");
    return;
  }

  const workbenchConfiguration = vscode.workspace.getConfiguration("workbench");
  const originalTheme = workbenchConfiguration.get("colorTheme");
  try {
    await validateLanguageFixtures();
    for (const themeContribution of extension.packageJSON.contributes.themes) {
      await workbenchConfiguration.update(
        "colorTheme",
        themeContribution.label,
        vscode.ConfigurationTarget.Global
      );
      const expectedThemeKind =
        themeContribution.uiTheme === "vs-dark"
          ? vscode.ColorThemeKind.Dark
          : vscode.ColorThemeKind.Light;
      await waitForActiveThemeKind(expectedThemeKind);
      await waitForConfiguredTheme(themeContribution.label);
    }
  } finally {
    await workbenchConfiguration.update(
      "colorTheme",
      originalTheme,
      vscode.ConfigurationTarget.Global
    );
  }

  console.log("Validated six themes inside VS Code Extension Host.");
}

module.exports = { run };
