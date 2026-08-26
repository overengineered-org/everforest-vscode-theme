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

async function run() {
  const { contrastRatio } = await import("../../scripts/color-contrast.mjs");
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
  assert.equal(extension.packageJSON.main, undefined);
  assert.equal(extension.packageJSON.browser, undefined);
  assert.equal(extension.packageJSON.activationEvents, undefined);
  assert.deepEqual(extension.packageJSON.contributes.themes, expectedThemeContributions);

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
    console.log("Validated native VS Code system auto mode and Medium preferences.");
    return;
  }

  const workbenchConfiguration = vscode.workspace.getConfiguration("workbench");
  const originalTheme = workbenchConfiguration.get("colorTheme");
  try {
    await validateLanguageFixtures();
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

  console.log("Validated six themes inside VS Code Extension Host.");
}

module.exports = { run };
