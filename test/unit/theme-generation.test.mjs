import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { compositeHexColor, contrastRatio } from "../../scripts/color-contrast.mjs";
import { findIndistinguishableHoverBackgroundPairs } from "../../scripts/workbench-interaction-contract.mjs";
import { getPalette, getReadableTextPalette } from "../../dist/palette/index.js";
import { getSemantic } from "../../dist/semantic.js";
import { getDefaultSyntax } from "../../dist/syntax/default.js";
import { defaultThemePreferences } from "../../dist/theme.js";
import { createWorkbenchColors } from "../../dist/workbench/colors.js";

const documentedWorkbenchColorContract = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../../src/workbench/documented-workbench-colors.json"),
    "utf8"
  )
);
const themeVariants = [
  { appearance: "dark", contrast: "soft", expectedBackground: "#333c43" },
  { appearance: "dark", contrast: "medium", expectedBackground: "#2d353b" },
  { appearance: "dark", contrast: "hard", expectedBackground: "#272e33" },
  { appearance: "light", contrast: "soft", expectedBackground: "#f3ead3" },
  { appearance: "light", contrast: "medium", expectedBackground: "#fdf6e3" },
  { appearance: "light", contrast: "hard", expectedBackground: "#fffbef" },
];

function preferencesForThemeVariant(themeVariant) {
  return {
    ...defaultThemePreferences[themeVariant.appearance],
    contrast: themeVariant.contrast,
  };
}

const selectionColorRawPaletteFieldByChoice = {
  grey: "grey1",
  red: "dimRed",
  orange: "dimOrange",
  yellow: "dimYellow",
  green: "dimGreen",
  aqua: "dimAqua",
  blue: "dimBlue",
  purple: "dimPurple",
};
const selectionColorChoices = Object.keys(selectionColorRawPaletteFieldByChoice);
const readableWorkbenchStateContrastChecks = [
  ["list.focusOutline", "list.focusBackground", 3],
  ["list.focusAndSelectionOutline", "list.focusBackground", 3],
  ["list.inactiveFocusOutline", "list.inactiveFocusBackground", 3],
  ["textLink.activeForeground", "editor.background", 4.5],
  ["editorLink.activeForeground", "editor.background", 4.5],
  ["editorLineNumber.foreground", "editor.background", 4.5],
  ["editorLineNumber.activeForeground", "editor.background", 4.5],
  ["editorLineNumber.dimmedForeground", "editor.background", 4.5],
  ["editorGhostText.foreground", "editorGhostText.background", 4.5],
  ["editorInlayHint.foreground", "editorInlayHint.background", 4.5],
  ["editorInlayHint.typeForeground", "editorInlayHint.typeBackground", 4.5],
  ["editorInlayHint.parameterForeground", "editorInlayHint.parameterBackground", 4.5],
  ["editorCodeLens.foreground", "editor.background", 4.5],
  ["minimap.errorHighlight", "minimap.background", 3],
  ["minimap.warningHighlight", "minimap.background", 3],
  ["minimapGutter.modifiedBackground", "minimap.background", 3],
  ["minimapGutter.addedBackground", "minimap.background", 3],
  ["minimapGutter.deletedBackground", "minimap.background", 3],
  ["editorOverviewRuler.findMatchForeground", "editorOverviewRuler.background", 3],
  ["editorOverviewRuler.rangeHighlightForeground", "editorOverviewRuler.background", 3],
  ["editorOverviewRuler.selectionHighlightForeground", "editorOverviewRuler.background", 3],
  ["editorOverviewRuler.wordHighlightForeground", "editorOverviewRuler.background", 3],
  ["editorOverviewRuler.wordHighlightStrongForeground", "editorOverviewRuler.background", 3],
  ["editorOverviewRuler.wordHighlightTextForeground", "editorOverviewRuler.background", 3],
  ["editorOverviewRuler.modifiedForeground", "editorOverviewRuler.background", 3],
  ["editorOverviewRuler.addedForeground", "editorOverviewRuler.background", 3],
  ["editorOverviewRuler.deletedForeground", "editorOverviewRuler.background", 3],
  ["editorOverviewRuler.errorForeground", "editorOverviewRuler.background", 3],
  ["editorOverviewRuler.warningForeground", "editorOverviewRuler.background", 3],
  ["editorOverviewRuler.infoForeground", "editorOverviewRuler.background", 3],
  ["editorOverviewRuler.bracketMatchForeground", "editorOverviewRuler.background", 3],
  ["editorOverviewRuler.commentForeground", "editorOverviewRuler.background", 3],
  ["editorOverviewRuler.commentUnresolvedForeground", "editorOverviewRuler.background", 3],
  ["editorOverviewRuler.commentDraftForeground", "editorOverviewRuler.background", 3],
  ["editorOverviewRuler.inlineChatInserted", "editorOverviewRuler.background", 3],
  ["editorOverviewRuler.inlineChatRemoved", "editorOverviewRuler.background", 3],
  ["editorOverviewRuler.currentContentForeground", "editorOverviewRuler.background", 3],
  ["editorOverviewRuler.incomingContentForeground", "editorOverviewRuler.background", 3],
  ["editorOverviewRuler.commonContentForeground", "editorOverviewRuler.background", 3],
  ["editorGutter.modifiedBackground", "editorGutter.background", 3],
  ["editorGutter.addedBackground", "editorGutter.background", 3],
  ["editorGutter.deletedBackground", "editorGutter.background", 3],
  ["editorGutter.commentRangeForeground", "editor.background", 4.5],
  ["editorMarkerNavigationError.background", "editorMarkerNavigation.background", 3],
  ["editorMarkerNavigationWarning.background", "editorMarkerNavigation.background", 3],
  ["editorMarkerNavigationInfo.background", "editorMarkerNavigation.background", 3],
  ["terminalOverviewRuler.cursorForeground", "terminal.background", 3],
  ["terminalOverviewRuler.findMatchForeground", "terminal.background", 3],
  ["terminalOverviewRuler.border", "terminal.background", 3],
  ["notebookEditorOverviewRuler.runningCellForeground", "notebook.cellEditorBackground", 3],
  ["list.hoverForeground", "list.hoverBackground", 4.5],
  ["button.secondaryForeground", "button.secondaryHoverBackground", 4.5],
  ["radio.inactiveForeground", "radio.inactiveHoverBackground", 4.5],
  ["list.inactiveSelectionForeground", "list.inactiveSelectionBackground", 4.5],
  ["editorBracketPairGuide.background1", "editor.background", 3],
  ["editorBracketPairGuide.background2", "editor.background", 3],
  ["editorBracketPairGuide.background3", "editor.background", 3],
  ["editorBracketPairGuide.background4", "editor.background", 3],
  ["editorBracketPairGuide.background5", "editor.background", 3],
  ["editorBracketPairGuide.background6", "editor.background", 3],
];

function assertSelectionAccentMatrix(themeLabel, rawPalette, themePreferences) {
  for (const selectionColorChoice of selectionColorChoices) {
    const workbenchColors = createWorkbenchColors(rawPalette, {
      ...themePreferences,
      selectionColor: selectionColorChoice,
    });
    const rawSelectionColor =
      rawPalette[selectionColorRawPaletteFieldByChoice[selectionColorChoice]];
    const activeSelectionBackground = workbenchColors["editor.selectionBackground"];
    const inactiveSelectionBackground = workbenchColors["editor.inactiveSelectionBackground"];
    const selectionHighlightBackground = workbenchColors["editor.selectionHighlightBackground"];
    const compositedEditorSelectionBackground = compositeHexColor(
      activeSelectionBackground,
      workbenchColors["editor.background"]
    );
    const compositedTerminalSelectionBackground = compositeHexColor(
      activeSelectionBackground,
      workbenchColors["terminal.background"]
    );
    const compositedSelectionHighlightBackground = compositeHexColor(
      selectionHighlightBackground,
      workbenchColors["editor.background"]
    );

    assert.equal(
      activeSelectionBackground.slice(0, 7),
      rawSelectionColor,
      `${themeLabel} ${selectionColorChoice}`
    );
    assert.equal(
      inactiveSelectionBackground.slice(0, 7),
      rawSelectionColor,
      `${themeLabel} inactive ${selectionColorChoice}`
    );
    assert.equal(
      selectionHighlightBackground.slice(0, 7),
      rawSelectionColor,
      `${themeLabel} highlight ${selectionColorChoice}`
    );
    assert.ok(
      contrastRatio(
        workbenchColors["editor.selectionForeground"],
        compositedEditorSelectionBackground
      ) >= 4.5,
      `${themeLabel} ${selectionColorChoice} selected editor text`
    );
    assert.ok(
      contrastRatio(
        workbenchColors["terminal.selectionForeground"],
        compositedTerminalSelectionBackground
      ) >= 4.5,
      `${themeLabel} ${selectionColorChoice} selected terminal text`
    );
    assert.ok(
      contrastRatio(
        workbenchColors["editor.selectionHighlightBorder"],
        compositedSelectionHighlightBackground
      ) >= 3,
      `${themeLabel} ${selectionColorChoice} selection border`
    );
    const activeSelectionSurfaceContrast = contrastRatio(
      compositedEditorSelectionBackground,
      workbenchColors["editor.background"]
    );
    assert.ok(
      activeSelectionSurfaceContrast >= 3 ||
        contrastRatio(
          workbenchColors["editor.selectionForeground"],
          compositedEditorSelectionBackground
        ) >= 4.5,
      `${themeLabel} ${selectionColorChoice} accessible selection state`
    );
  }
}

function alphaChannelFromHexColor(hexColor) {
  const alphaHexadecimalDigits = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.exec(hexColor)?.[1];
  if (alphaHexadecimalDigits === undefined) return 255;
  return Number.parseInt(alphaHexadecimalDigits, 16);
}

function actualWorkbenchBackgroundColor(workbenchColors, backgroundIdentifier) {
  const backgroundColor = workbenchColors[backgroundIdentifier];
  if (alphaChannelFromHexColor(backgroundColor) === undefined) return backgroundColor;
  const baseSurfaceIdentifierByBackgroundIdentifier = {
    "button.hoverBackground": "button.background",
    "button.secondaryHoverBackground": "button.secondaryBackground",
    "extensionButton.hoverBackground": "extensionButton.background",
    "extensionButton.prominentHoverBackground": "extensionButton.prominentBackground",
    "statusBarItem.hoverBackground": "statusBar.background",
    "statusBarItem.activeBackground": "statusBar.background",
    "statusBarItem.compactHoverBackground": "statusBar.background",
    "statusBarItem.offlineHoverBackground": "statusBar.background",
    "statusBarItem.prominentHoverBackground": "statusBarItem.prominentBackground",
    "statusBarItem.remoteHoverBackground": "statusBarItem.remoteBackground",
    "statusBarItem.errorHoverBackground": "statusBarItem.errorBackground",
    "statusBarItem.warningHoverBackground": "statusBarItem.warningBackground",
  };
  const inferredBaseSurfaceIdentifier = backgroundIdentifier.replace(
    /HoverBackground$/,
    "Background"
  );
  const baseSurfaceIdentifier =
    baseSurfaceIdentifierByBackgroundIdentifier[backgroundIdentifier] ??
    (workbenchColors[inferredBaseSurfaceIdentifier]
      ? inferredBaseSurfaceIdentifier
      : "editor.background");
  const baseSurfaceColor = workbenchColors[baseSurfaceIdentifier];
  return compositeHexColor(
    backgroundColor,
    alphaChannelFromHexColor(baseSurfaceColor) === 255
      ? baseSurfaceColor
      : workbenchColors["editor.background"]
  );
}

function assertReadableWorkbenchStateMatrix(themeLabel, rawPalette, themePreferences) {
  const workbenchColors = createWorkbenchColors(rawPalette, themePreferences);
  for (const [
    foregroundIdentifier,
    backgroundIdentifier,
    minimumContrast,
  ] of readableWorkbenchStateContrastChecks) {
    assert.ok(
      contrastRatio(
        workbenchColors[foregroundIdentifier],
        actualWorkbenchBackgroundColor(workbenchColors, backgroundIdentifier)
      ) >= minimumContrast,
      `${themeLabel} ${foregroundIdentifier} on ${backgroundIdentifier}`
    );
  }
  for (const linkForegroundIdentifier of [
    "textLink.activeForeground",
    "editorLink.activeForeground",
  ]) {
    assert.match(
      workbenchColors[linkForegroundIdentifier],
      /^#[0-9a-f]{6}$/i,
      `${themeLabel} ${linkForegroundIdentifier} must be opaque`
    );
  }
}

function normalizedSyntaxScopes(syntaxTokenColor) {
  return (
    Array.isArray(syntaxTokenColor.scope)
      ? syntaxTokenColor.scope
      : syntaxTokenColor.scope.split(",")
  ).map((syntaxScope) => syntaxScope.trim());
}

test("keeps language-specific syntax scopes collision-free", () => {
  const palette = getPalette("dark", "medium");
  const syntaxTokenColors = getDefaultSyntax(palette);
  const scalaClassSyntaxRule = syntaxTokenColors.find(({ name }) => name === "Scala yellow");

  assert.ok(scalaClassSyntaxRule, "Scala class syntax rule must exist");
  const scalaClassScopes = normalizedSyntaxScopes(scalaClassSyntaxRule);
  assert.ok(scalaClassScopes.includes("entity.name.class.scala"));
  assert.ok(!scalaClassScopes.includes("entity.name.class"));

  const phpModifierSyntaxRule = syntaxTokenColors.find(({ name }) => name === "PHP blue");
  assert.ok(phpModifierSyntaxRule, "PHP modifier syntax rule must exist");
  assert.deepEqual(normalizedSyntaxScopes(phpModifierSyntaxRule), [
    "storage.type.modifier.access.control.public.php",
    "storage.type.modifier.access.control.private.php",
  ]);

  for (const [moduleScope, expectedSyntaxRuleName] of [
    ["entity.name.type.module.ts", "TypeScript blue"],
    ["entity.name.type.module.tsx", "TSX blue"],
  ]) {
    const moduleSyntaxRules = syntaxTokenColors.filter((syntaxTokenColor) =>
      normalizedSyntaxScopes(syntaxTokenColor).includes(moduleScope)
    );
    assert.equal(moduleSyntaxRules.length, 1, `${moduleScope} must have one rule`);
    assert.equal(moduleSyntaxRules[0].name, expectedSyntaxRuleName);
    assert.equal(moduleSyntaxRules[0].settings.foreground, palette.blue);
  }
});

for (const themeVariant of themeVariants) {
  test(`${themeVariant.appearance} ${themeVariant.contrast} generates complete source colors`, () => {
    const rawPalette = getPalette(themeVariant.appearance, themeVariant.contrast);
    const readableTextPalette = getReadableTextPalette(themeVariant.appearance, rawPalette);
    const semanticTokenColors = getSemantic(readableTextPalette);
    const themePreferences = preferencesForThemeVariant(themeVariant);
    const syntaxTokenColors = getDefaultSyntax(readableTextPalette, themePreferences);
    const workbenchColors = createWorkbenchColors(rawPalette, themePreferences);
    const missingDocumentedWorkbenchColorIdentifiers =
      documentedWorkbenchColorContract.identifiers.filter(
        (documentedWorkbenchColorIdentifier) =>
          !(documentedWorkbenchColorIdentifier in workbenchColors)
      );

    assert.equal(rawPalette.bg, themeVariant.expectedBackground);
    assert.equal(semanticTokenColors["class:typescript"], readableTextPalette.aqua);
    assert.equal(semanticTokenColors["macro:rust"], readableTextPalette.aqua);
    assert.ok(syntaxTokenColors.length >= 50, "syntax coverage must remain broad");
    assert.deepEqual(missingDocumentedWorkbenchColorIdentifiers, []);

    for (const translucentWorkbenchColorIdentifier of documentedWorkbenchColorContract.translucentIdentifiers) {
      const translucentWorkbenchColor = workbenchColors[translucentWorkbenchColorIdentifier];
      assert.match(translucentWorkbenchColor, /^#[0-9a-f]{8}$/i);
      assert.notEqual(translucentWorkbenchColor.slice(-2).toLowerCase(), "ff");
    }
  });

  test(`${themeVariant.appearance} ${themeVariant.contrast} keeps selected code unmistakable and readable`, () => {
    const palette = getPalette(themeVariant.appearance, themeVariant.contrast);
    const readableTextPalette = getReadableTextPalette(themeVariant.appearance, palette);
    const workbenchColors = createWorkbenchColors(
      palette,
      preferencesForThemeVariant(themeVariant)
    );
    const expectedSelectionForeground = themeVariant.appearance === "dark" ? "#fdf6e3" : "#2d353b";
    const expectedSelectionBackground = `${palette.grey1}${themeVariant.appearance === "dark" ? "80" : "a0"}`;
    const expectedInactiveSelectionBackground = `${palette.grey1}${themeVariant.appearance === "dark" ? "40" : "60"}`;
    const expectedSelectionHighlightBackground = `${palette.grey1}${themeVariant.appearance === "dark" ? "20" : "30"}`;
    const expectedMinimapSelectionHighlight = `${readableTextPalette.grey1}e0`;

    assert.equal(workbenchColors["editor.selectionForeground"], expectedSelectionForeground);
    assert.equal(workbenchColors["editor.selectionBackground"], expectedSelectionBackground);
    assert.equal(
      workbenchColors["editor.inactiveSelectionBackground"],
      expectedInactiveSelectionBackground
    );
    assert.equal(
      workbenchColors["editor.selectionHighlightBackground"],
      expectedSelectionHighlightBackground
    );
    assert.equal(
      workbenchColors["editor.selectionHighlightBorder"],
      readableTextPalette.strongBorder
    );
    assert.equal(workbenchColors["minimap.selectionHighlight"], expectedMinimapSelectionHighlight);
    assert.equal(workbenchColors["terminal.selectionBackground"], expectedSelectionBackground);
    assert.equal(
      workbenchColors["terminal.inactiveSelectionBackground"],
      expectedInactiveSelectionBackground
    );
    assert.equal(workbenchColors["terminal.selectionForeground"], expectedSelectionForeground);

    const compositedSelectionBackground = compositeHexColor(
      expectedSelectionBackground,
      palette.bg
    );
    const compositedInactiveSelectionBackground = compositeHexColor(
      expectedInactiveSelectionBackground,
      palette.bg
    );
    const compositedSelectionHighlightBackground = compositeHexColor(
      expectedSelectionHighlightBackground,
      palette.bg
    );
    const activeSelectionSurfaceContrast = contrastRatio(compositedSelectionBackground, palette.bg);
    const inactiveSelectionSurfaceContrast = contrastRatio(
      compositedInactiveSelectionBackground,
      palette.bg
    );
    const selectionHighlightSurfaceContrast = contrastRatio(
      compositedSelectionHighlightBackground,
      palette.bg
    );

    assert.ok(
      activeSelectionSurfaceContrast >= (themeVariant.appearance === "dark" ? 1.9 : 1.3),
      "active selection must remain distinct from the editor surface"
    );
    assert.ok(
      contrastRatio(expectedSelectionForeground, compositedSelectionBackground) >= 4.5,
      "selected text must meet WCAG AA contrast"
    );
    assert.ok(
      contrastRatio(
        workbenchColors["editor.selectionHighlightBorder"],
        compositedSelectionHighlightBackground
      ) >= 3,
      "selection highlight border must remain visible on its composited surface"
    );
    assert.ok(activeSelectionSurfaceContrast > inactiveSelectionSurfaceContrast);
    assert.ok(inactiveSelectionSurfaceContrast > selectionHighlightSurfaceContrast);
  });

  test(`${themeVariant.appearance} ${themeVariant.contrast} keeps source control graph labels semantic and readable`, () => {
    const palette = getPalette(themeVariant.appearance, themeVariant.contrast);
    const workbenchColors = createWorkbenchColors(
      palette,
      preferencesForThemeVariant(themeVariant)
    );
    const sourceControlGraphLabelForeground =
      workbenchColors["scmGraph.historyItemHoverLabelForeground"];
    const expectedSourceControlGraphColors = {
      "scmGraph.foreground1": `${palette.red}ff`,
      "scmGraph.foreground2": `${palette.orange}ff`,
      "scmGraph.foreground3": `${palette.yellow}ff`,
      "scmGraph.foreground4": `${palette.green}ff`,
      "scmGraph.foreground5": `${palette.aqua}ff`,
      "scmGraph.historyItemRefColor": palette.blue,
      "scmGraph.historyItemRemoteRefColor": palette.purple,
      "scmGraph.historyItemBaseRefColor": palette.orange,
      "scmGraph.historyItemHoverLabelForeground": "#1b2024",
      "scmGraph.historyItemHoverAdditionsForeground":
        themeVariant.appearance === "dark" ? palette.green : "#596600",
      "scmGraph.historyItemHoverDeletionsForeground":
        themeVariant.appearance === "dark" ? "#f8a0a0" : "#ad3d3d",
    };

    for (const [
      sourceControlGraphColorIdentifier,
      expectedSourceControlGraphColor,
    ] of Object.entries(expectedSourceControlGraphColors)) {
      assert.equal(
        workbenchColors[sourceControlGraphColorIdentifier],
        expectedSourceControlGraphColor,
        sourceControlGraphColorIdentifier
      );
    }

    assert.equal(
      new Set(
        Object.keys(expectedSourceControlGraphColors)
          .filter((sourceControlGraphColorIdentifier) =>
            sourceControlGraphColorIdentifier.startsWith("scmGraph.foreground")
          )
          .map(
            (sourceControlGraphColorIdentifier) =>
              workbenchColors[sourceControlGraphColorIdentifier]
          )
      ).size,
      5,
      "source control graph lanes must remain visually distinct"
    );

    for (const sourceControlGraphReferenceColorIdentifier of [
      "scmGraph.historyItemRefColor",
      "scmGraph.historyItemRemoteRefColor",
      "scmGraph.historyItemBaseRefColor",
    ]) {
      assert.ok(
        contrastRatio(
          sourceControlGraphLabelForeground,
          workbenchColors[sourceControlGraphReferenceColorIdentifier]
        ) >= 4.5,
        `${sourceControlGraphReferenceColorIdentifier} label contrast`
      );
    }
  });

  test(`${themeVariant.appearance} ${themeVariant.contrast} keeps extension install actions prominent and readable`, () => {
    const palette = getPalette(themeVariant.appearance, themeVariant.contrast);
    const workbenchColors = createWorkbenchColors(
      palette,
      preferencesForThemeVariant(themeVariant)
    );

    for (const extensionButtonColorIdentifiers of [
      {
        background: "extensionButton.background",
        foreground: "extensionButton.foreground",
        hoverBackground: "extensionButton.hoverBackground",
      },
      {
        background: "extensionButton.prominentBackground",
        foreground: "extensionButton.prominentForeground",
        hoverBackground: "extensionButton.prominentHoverBackground",
      },
    ]) {
      assert.equal(
        workbenchColors[extensionButtonColorIdentifiers.background],
        workbenchColors["button.background"]
      );
      assert.equal(
        workbenchColors[extensionButtonColorIdentifiers.foreground],
        workbenchColors["button.foreground"]
      );
      assert.equal(
        workbenchColors[extensionButtonColorIdentifiers.hoverBackground],
        workbenchColors["button.hoverBackground"]
      );
      assert.ok(
        contrastRatio(
          workbenchColors[extensionButtonColorIdentifiers.foreground],
          workbenchColors[extensionButtonColorIdentifiers.background]
        ) >= 4.5,
        `${extensionButtonColorIdentifiers.background} must meet 4.5:1 contrast`
      );
      assert.ok(
        contrastRatio(
          workbenchColors[extensionButtonColorIdentifiers.foreground],
          actualWorkbenchBackgroundColor(
            workbenchColors,
            extensionButtonColorIdentifiers.hoverBackground
          )
        ) >= 4.5,
        `${extensionButtonColorIdentifiers.hoverBackground} must meet 4.5:1 contrast`
      );
    }
  });

  test(`${themeVariant.appearance} ${themeVariant.contrast} keeps desktop workbench hierarchy and states readable`, () => {
    const palette = getPalette(themeVariant.appearance, themeVariant.contrast);
    const workbenchColors = createWorkbenchColors(
      palette,
      preferencesForThemeVariant(themeVariant)
    );

    for (const secondaryWorkbenchSurfaceIdentifier of [
      "activityBar.background",
      "sideBar.background",
      "editorGroupHeader.tabsBackground",
      "tab.inactiveBackground",
      "panel.background",
      "statusBar.background",
      "titleBar.activeBackground",
      "notifications.background",
    ]) {
      assert.equal(workbenchColors[secondaryWorkbenchSurfaceIdentifier], palette.bg1);
    }
    assert.equal(workbenchColors["tab.activeBackground"], palette.bg);

    for (const activeWorkbenchIndicatorIdentifier of [
      "panelTitle.activeBorder",
      "tab.activeBorder",
      "terminal.tab.activeBorder",
    ]) {
      assert.equal(
        workbenchColors[activeWorkbenchIndicatorIdentifier],
        workbenchColors["textLink.foreground"]
      );
    }
    assert.equal(
      workbenchColors["activityBar.activeBorder"],
      `${workbenchColors["textLink.foreground"]}d0`
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
        contrastRatio(
          workbenchColors[foregroundIdentifier],
          actualWorkbenchBackgroundColor(workbenchColors, backgroundIdentifier)
        ) >= minimumContrast,
        `${foregroundIdentifier} must meet ${minimumContrast}:1 contrast against ${backgroundIdentifier}`
      );
    }

    assert.notEqual(workbenchColors.disabledForeground, workbenchColors.foreground);

    for (const [statusForegroundIdentifier, statusBackgroundIdentifier] of [
      ["statusBar.debuggingForeground", "statusBar.debuggingBackground"],
      ["statusBarItem.remoteForeground", "statusBarItem.remoteBackground"],
      ["statusBarItem.remoteHoverForeground", "statusBarItem.remoteHoverBackground"],
      ["statusBarItem.errorForeground", "statusBarItem.errorBackground"],
      ["statusBarItem.errorHoverForeground", "statusBarItem.errorHoverBackground"],
      ["statusBarItem.warningForeground", "statusBarItem.warningBackground"],
      ["statusBarItem.warningHoverForeground", "statusBarItem.warningHoverBackground"],
      ["statusBarItem.hoverForeground", "statusBarItem.hoverBackground"],
      ["statusBarItem.prominentForeground", "statusBarItem.prominentBackground"],
      ["statusBarItem.prominentHoverForeground", "statusBarItem.prominentHoverBackground"],
      ["editorBracketMatch.foreground", "editorBracketMatch.background"],
    ]) {
      const statusBackground = actualWorkbenchBackgroundColor(
        workbenchColors,
        statusBackgroundIdentifier
      );
      assert.ok(
        contrastRatio(workbenchColors[statusForegroundIdentifier], statusBackground) >= 4.5,
        `${statusForegroundIdentifier} must meet 4.5:1 contrast against ${statusBackgroundIdentifier}`
      );
    }

    assert.deepEqual(findIndistinguishableHoverBackgroundPairs(workbenchColors), []);
  });

  test(`${themeVariant.appearance} ${themeVariant.contrast} keeps semantic workbench states distinct and readable`, () => {
    const palette = getPalette(themeVariant.appearance, themeVariant.contrast);
    const workbenchColors = createWorkbenchColors(
      palette,
      preferencesForThemeVariant(themeVariant)
    );
    const expectedAccessibleBlueForeground =
      themeVariant.appearance === "dark" ? palette.blue : "#2e5f94";
    const expectedAccessibleAquaForeground =
      themeVariant.appearance === "dark" ? palette.aqua : "#2f6a4d";
    const expectedResolvedCommentIndicator =
      themeVariant.appearance === "dark" ? "#9ba89e" : "#59646c";
    const expectedSemanticWorkbenchStateColors = {
      "minimap.selectionOccurrenceHighlight": `${
        themeVariant.appearance === "dark" ? "#9ba89e" : "#59646c"
      }d0`,
      "minimap.chatEditHighlight": `${themeVariant.appearance === "dark" ? palette.green : "#596600"}c0`,
      "chart.line": expectedAccessibleBlueForeground,
      "chart.axis": `${themeVariant.appearance === "dark" ? palette.fg : "#59646c"}${themeVariant.appearance === "dark" ? "66" : "99"}`,
      "chart.guide": `${themeVariant.appearance === "dark" ? palette.fg : "#59646c"}33`,
      "gitDecoration.renamedResourceForeground": expectedAccessibleAquaForeground,
      "debugView.valueChangedHighlight": expectedAccessibleBlueForeground,
      "settings.modifiedItemIndicator": expectedAccessibleBlueForeground,
      "commentsView.resolvedIcon": expectedResolvedCommentIndicator,
      "commentsView.unresolvedIcon": expectedAccessibleBlueForeground,
      "editorCommentsWidget.resolvedBorder": expectedResolvedCommentIndicator,
      "editorCommentsWidget.unresolvedBorder": expectedAccessibleBlueForeground,
    };

    for (const [semanticWorkbenchColorIdentifier, expectedSemanticWorkbenchColor] of Object.entries(
      expectedSemanticWorkbenchStateColors
    )) {
      assert.equal(
        workbenchColors[semanticWorkbenchColorIdentifier],
        expectedSemanticWorkbenchColor,
        semanticWorkbenchColorIdentifier
      );
    }

    for (const translucentSemanticWorkbenchColorIdentifier of [
      "minimap.selectionOccurrenceHighlight",
      "minimap.chatEditHighlight",
      "chart.axis",
      "chart.guide",
    ]) {
      assert.match(
        workbenchColors[translucentSemanticWorkbenchColorIdentifier],
        /^#[0-9a-f]{8}$/i,
        `${translucentSemanticWorkbenchColorIdentifier} must be translucent`
      );
      assert.notEqual(
        workbenchColors[translucentSemanticWorkbenchColorIdentifier].slice(-2).toLowerCase(),
        "ff",
        `${translucentSemanticWorkbenchColorIdentifier} must not be opaque`
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
            (semanticWorkbenchColorIdentifier) => workbenchColors[semanticWorkbenchColorIdentifier]
          )
        ).size,
        distinctSemanticWorkbenchColorIdentifiers.length,
        `${distinctSemanticWorkbenchColorIdentifiers.join(", ")} must remain distinct`
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
        contrastRatio(
          workbenchColors[foregroundIdentifier],
          actualWorkbenchBackgroundColor(workbenchColors, backgroundIdentifier)
        ) >= minimumContrast,
        `${foregroundIdentifier} must meet ${minimumContrast}:1 contrast against ${backgroundIdentifier}`
      );
    }
  });
}

for (const themeVariant of themeVariants) {
  test(`${themeVariant.appearance} ${themeVariant.contrast} covers every configurable selection accent`, () => {
    const rawPalette = getPalette(themeVariant.appearance, themeVariant.contrast);
    assertSelectionAccentMatrix(
      `${themeVariant.appearance} ${themeVariant.contrast}`,
      rawPalette,
      preferencesForThemeVariant(themeVariant)
    );
  });
}

for (const [themeAppearance, defaultThemePreference] of Object.entries(defaultThemePreferences)) {
  test(`${themeAppearance} configurable default covers every selection accent`, () => {
    const rawPalette = getPalette(themeAppearance, defaultThemePreference.contrast);
    assertSelectionAccentMatrix(`${themeAppearance} default`, rawPalette, defaultThemePreference);
  });
}

for (const themeVariant of themeVariants) {
  test(`${themeVariant.appearance} ${themeVariant.contrast} preserves flat state borders`, () => {
    assertFlatStateBorderMatrix(
      `${themeVariant.appearance} ${themeVariant.contrast}`,
      getPalette(themeVariant.appearance, themeVariant.contrast),
      preferencesForThemeVariant(themeVariant)
    );
  });
}

for (const [themeAppearance, defaultThemePreference] of Object.entries(defaultThemePreferences)) {
  test(`${themeAppearance} configurable default preserves flat state borders`, () => {
    assertFlatStateBorderMatrix(
      `${themeAppearance} default`,
      getPalette(themeAppearance, defaultThemePreference.contrast),
      defaultThemePreference
    );
  });
}

for (const themeVariant of themeVariants) {
  test(`${themeVariant.appearance} ${themeVariant.contrast} keeps metadata and interaction states readable`, () => {
    assertReadableWorkbenchStateMatrix(
      `${themeVariant.appearance} ${themeVariant.contrast}`,
      getPalette(themeVariant.appearance, themeVariant.contrast),
      preferencesForThemeVariant(themeVariant)
    );
  });
}

for (const [themeAppearance, defaultThemePreference] of Object.entries(defaultThemePreferences)) {
  test(`${themeAppearance} configurable default keeps metadata and interaction states readable`, () => {
    assertReadableWorkbenchStateMatrix(
      `${themeAppearance} default`,
      getPalette(themeAppearance, defaultThemePreference.contrast),
      defaultThemePreference
    );
  });
}

const cursorChoices = [
  "white",
  "black",
  "red",
  "orange",
  "yellow",
  "green",
  "aqua",
  "blue",
  "purple",
];
const structuralBorderColorIdentifiers = documentedWorkbenchColorContract.identifiers.filter(
  (workbenchColorIdentifier) =>
    /border|outline|stroke/i.test(workbenchColorIdentifier) ||
    (/separator/i.test(workbenchColorIdentifier) &&
      !/foreground|background/i.test(workbenchColorIdentifier))
);
const structuralBorderSurfaceFallbackIdentifierByColorIdentifier = {
  contrastActiveBorder: "editor.background",
  contrastBorder: "editor.background",
  focusBorder: "editor.background",
  "statusBar.debuggingBorder": "statusBar.debuggingBackground",
  "testing.message.error.badgeBorder": "testing.message.error.badgeBackground",
  "sash.hoverBorder": "editor.background",
  "textPreformat.border": "textCodeBlock.background",
  "toolbar.hoverOutline": "toolbar.hoverBackground",
  "button.separator": "button.background",
  "listFilterWidget.outline": "editorWidget.background",
  "listFilterWidget.noMatchesOutline": "editorWidget.background",
  "tree.tableColumnsBorder": "sideBar.background",
  "profiles.sashBorder": "sideBar.background",
  "sideBarActivityBarTop.border": "sideBar.background",
  "editorGroup.dropIntoPromptBorder": "editorGroupHeader.tabsBackground",
  "tab.selectedBorderTop": "tab.activeBackground",
  "tab.activeBorderTop": "tab.activeBackground",
  "tab.unfocusedActiveBorderTop": "tab.inactiveBackground",
  "tab.activeModifiedBorder": "tab.activeBackground",
  "tab.inactiveModifiedBorder": "tab.inactiveBackground",
  "tab.unfocusedActiveModifiedBorder": "tab.inactiveBackground",
  "tab.unfocusedInactiveModifiedBorder": "tab.inactiveBackground",
  "sideBySideEditor.horizontalBorder": "editor.background",
  "sideBySideEditor.verticalBorder": "editor.background",
  "editor.compositionBorder": "editor.background",
  "editorOverviewRuler.border": "editor.background",
  "editorUnnecessaryCode.border": "editor.background",
  "editorCommentsWidget.resolvedBorder": "editorWidget.background",
  "editorCommentsWidget.unresolvedBorder": "editorWidget.background",
  "diffEditor.border": "editor.background",
  "diffEditor.move.border": "editor.background",
  "diffEditor.moveActive.border": "editor.background",
  "merge.border": "editor.background",
  "mergeEditor.conflict.unhandledUnfocused.border": "editor.background",
  "mergeEditor.conflict.unhandledFocused.border": "editor.background",
  "mergeEditor.conflict.handledUnfocused.border": "editor.background",
  "mergeEditor.conflict.handledFocused.border": "editor.background",
  "peekViewEditor.matchHighlightBorder": "peekViewResult.background",
  "statusBarItem.focusBorder": "statusBar.background",
  "testing.peekBorder": "editorWidget.background",
  "testing.messagePeekBorder": "editorWidget.background",
  "settings.sashBorder": "settings.textInputBackground",
  "notebook.cellBorderColor": "notebook.cellEditorBackground",
  "notebook.outputContainerBorderColor": "notebook.cellEditorBackground",
  "simpleFindWidget.sashBorder": "editorWidget.background",
  "gauge.border": "editor.background",
  "agentSessionSelectedBadge.border": "editorWidget.background",
  "agentSessionSelectedUnfocusedBadge.border": "editorWidget.background",
  "aiCustomizationManagement.sashBorder": "editorWidget.background",
};

function actualStructuralBorderSurfaceIdentifier(workbenchColorIdentifier, workbenchColors) {
  const explicitlyMappedSurfaceIdentifier =
    structuralBorderSurfaceFallbackIdentifierByColorIdentifier[workbenchColorIdentifier];
  if (explicitlyMappedSurfaceIdentifier) return explicitlyMappedSurfaceIdentifier;

  const pairedBackgroundIdentifierCandidates = [
    workbenchColorIdentifier.replace(/\.border$/i, ".background"),
    workbenchColorIdentifier.replace(/border$/i, "background"),
    workbenchColorIdentifier.replace(/outline$/i, "background"),
  ];
  const pairedBackgroundIdentifier = pairedBackgroundIdentifierCandidates.find(
    (backgroundIdentifier) =>
      backgroundIdentifier !== workbenchColorIdentifier && backgroundIdentifier in workbenchColors
  );
  if (pairedBackgroundIdentifier) return pairedBackgroundIdentifier;

  if (workbenchColorIdentifier.startsWith("activityBar")) return "activityBar.background";
  if (workbenchColorIdentifier.startsWith("sideBar")) return "sideBar.background";
  if (workbenchColorIdentifier.startsWith("editorGroup")) {
    return "editorGroupHeader.tabsBackground";
  }
  if (workbenchColorIdentifier.startsWith("panel")) return "panel.background";
  if (workbenchColorIdentifier.startsWith("statusBar")) return "statusBar.background";
  if (workbenchColorIdentifier.startsWith("titleBar")) return "titleBar.activeBackground";
  if (workbenchColorIdentifier.startsWith("tab")) return "tab.activeBackground";
  if (workbenchColorIdentifier.startsWith("editorSuggestWidget")) {
    return "editorSuggestWidget.background";
  }
  if (workbenchColorIdentifier.startsWith("editorHoverWidget")) {
    return "editorHoverWidget.background";
  }
  if (workbenchColorIdentifier.startsWith("editorWidget")) return "editorWidget.background";
  if (workbenchColorIdentifier.startsWith("terminal")) return "terminal.background";
  if (workbenchColorIdentifier.startsWith("debug")) return "debugToolBar.background";
  if (workbenchColorIdentifier.startsWith("settings")) return "settings.textInputBackground";
  if (workbenchColorIdentifier.startsWith("notebook")) return "notebook.cellEditorBackground";
  if (workbenchColorIdentifier.startsWith("inlineChat")) return "inlineChat.background";
  if (workbenchColorIdentifier.startsWith("chat")) return "chat.requestBackground";
  if (workbenchColorIdentifier.startsWith("notification")) return "notifications.background";
  if (workbenchColorIdentifier.startsWith("extensionButton")) {
    return "extensionButton.background";
  }
  return "editor.background";
}

const flatStateBorderContrastChecks = [
  ["list.focusOutline", "list.focusBackground"],
  ["list.focusAndSelectionOutline", "list.focusBackground"],
  ["list.inactiveFocusOutline", "list.inactiveFocusBackground"],
  ["listFilterWidget.outline", "editorWidget.background"],
  ["listFilterWidget.noMatchesOutline", "editorWidget.background"],
  ["list.filterMatchBorder", "editor.background"],
  ["toolbar.hoverOutline", "toolbar.hoverBackground"],
  ["sash.hoverBorder", "editor.background"],
  ["checkbox.selectBorder", "checkbox.background"],
  ["radio.activeBorder", "radio.activeBackground"],
  ["radio.inactiveBorder", "radio.inactiveBackground"],
  ["inlineChatInput.border", "inlineChatInput.background"],
  ["inlineChatInput.focusBorder", "inlineChatInput.background"],
  ["editor.selectionHighlightBorder", "editor.background"],
  ["editor.findMatchBorder", "editor.background"],
  ["editor.findMatchHighlightBorder", "editor.background"],
  ["editor.findRangeHighlightBorder", "editor.background"],
  ["terminal.findMatchBorder", "terminal.background"],
  ["terminal.findMatchHighlightBorder", "terminal.background"],
  ["editorBracketMatch.border", "editorBracketMatch.background"],
  ["editorError.border", "editor.background"],
  ["editorWarning.border", "editor.background"],
  ["editorInfo.border", "editor.background"],
  ["editorHint.border", "editor.background"],
  ["inputValidation.errorBorder", "inputValidation.errorBackground"],
  ["inputValidation.infoBorder", "inputValidation.infoBackground"],
  ["inputValidation.warningBorder", "inputValidation.warningBackground"],
  ["inputOption.activeBorder", "input.background"],
  ["activityBar.activeBorder", "activityBar.background"],
  ["activityBar.activeFocusBorder", "activityBar.background"],
  ["commandCenter.activeBorder", "commandCenter.activeBackground"],
  ["interactive.activeCodeBorder", "editor.background"],
  ["panelTitle.activeBorder", "panel.background"],
  ["tab.activeBorder", "tab.activeBackground"],
  ["tab.activeBorderTop", "tab.activeBackground"],
  ["terminal.tab.activeBorder", "terminal.background"],
  ["testing.message.error.badgeBorder", "testing.message.error.badgeBackground"],
  ["button.border", "button.background"],
  ["button.separator", "button.background"],
  ["statusBar.debuggingBorder", "statusBar.debuggingBackground"],
  ["extensionButton.border", "extensionButton.background"],
  ["extensionButton.separator", "extensionButton.background"],
  ["editorCommentsWidget.resolvedBorder", "editorWidget.background"],
  ["editorCommentsWidget.unresolvedBorder", "editorWidget.background"],
  ["notebook.focusedCellBorder", "notebook.cellEditorBackground"],
  ["notebook.focusedEditorBorder", "notebook.cellEditorBackground"],
  ["notebook.inactiveFocusedCellBorder", "notebook.cellEditorBackground"],
  ["notebook.selectedCellBorder", "notebook.cellEditorBackground"],
];

function assertFlatStateBorderMatrix(themeLabel, rawPalette, themePreferences) {
  const flatWorkbenchColors = createWorkbenchColors(rawPalette, {
    ...themePreferences,
    workbenchStyle: "flat",
  });
  for (const [borderIdentifier, backgroundIdentifier] of flatStateBorderContrastChecks) {
    const borderColor = flatWorkbenchColors[borderIdentifier];
    assert.match(borderColor, /^#[0-9a-f]{6}$/i, `${themeLabel} ${borderIdentifier}`);
    assert.ok(
      contrastRatio(
        borderColor,
        actualWorkbenchBackgroundColor(flatWorkbenchColors, backgroundIdentifier)
      ) >= 3,
      `${themeLabel} ${borderIdentifier} on ${backgroundIdentifier}`
    );
  }
}

const gitLensAndIssuesForegroundIdentifiers = [
  "gitlens.gutterForegroundColor",
  "gitlens.gutterUncommittedForegroundColor",
  "gitlens.trailingLineForegroundColor",
  "gitlens.closedPullRequestIconColor",
  "gitlens.openPullRequestIconColor",
  "gitlens.mergedPullRequestIconColor",
  "gitlens.unpublishedChangesIconColor",
  "gitlens.unpublishedCommitIconColor",
  "gitlens.unpulledChangesIconColor",
  "gitlens.decorations.addedForegroundColor",
  "gitlens.decorations.copiedForegroundColor",
  "gitlens.decorations.deletedForegroundColor",
  "gitlens.decorations.ignoredForegroundColor",
  "gitlens.decorations.modifiedForegroundColor",
  "gitlens.decorations.untrackedForegroundColor",
  "gitlens.decorations.renamedForegroundColor",
  "gitlens.decorations.branchAheadForegroundColor",
  "gitlens.decorations.branchBehindForegroundColor",
  "gitlens.decorations.branchDivergedForegroundColor",
  "gitlens.decorations.branchUpToDateForegroundColor",
  "gitlens.decorations.branchUnpublishedForegroundColor",
  "gitlens.decorations.branchMissingUpstreamForegroundColor",
  "issues.open",
  "issues.closed",
];

for (const themeVariant of themeVariants) {
  test(`${themeVariant.appearance} ${themeVariant.contrast} keeps every source role readable`, () => {
    const rawPalette = getPalette(themeVariant.appearance, themeVariant.contrast);
    const readableTextPalette = getReadableTextPalette(themeVariant.appearance, rawPalette);
    const themePreferences = preferencesForThemeVariant(themeVariant);
    const syntaxTokenColors = getDefaultSyntax(readableTextPalette, themePreferences);
    const semanticTokenColors = getSemantic(readableTextPalette);

    for (const syntaxTokenColor of syntaxTokenColors) {
      if (syntaxTokenColor.settings.foreground) {
        assert.ok(
          contrastRatio(syntaxTokenColor.settings.foreground, rawPalette.bg) >= 4.5,
          `${syntaxTokenColor.name} syntax foreground`
        );
      }
    }
    for (const [semanticTokenIdentifier, semanticTokenColor] of Object.entries(
      semanticTokenColors
    )) {
      const semanticForegroundColor =
        typeof semanticTokenColor === "string" ? semanticTokenColor : semanticTokenColor.foreground;
      assert.ok(
        contrastRatio(semanticForegroundColor, rawPalette.bg) >= 4.5,
        `${semanticTokenIdentifier} semantic foreground`
      );
    }
  });

  test(`${themeVariant.appearance} ${themeVariant.contrast} keeps every cursor choice readable`, () => {
    const rawPalette = getPalette(themeVariant.appearance, themeVariant.contrast);
    for (const cursorChoice of cursorChoices) {
      const cursorColors = createWorkbenchColors(rawPalette, {
        ...preferencesForThemeVariant(themeVariant),
        cursorColor: cursorChoice,
      });
      for (const cursorSurfaceIdentifier of ["editor.background", "terminal.background"]) {
        assert.ok(
          contrastRatio(
            cursorColors["editorCursor.foreground"],
            cursorColors[cursorSurfaceIdentifier]
          ) >= 3,
          `${cursorChoice} cursor on ${cursorSurfaceIdentifier}`
        );
        assert.equal(
          cursorColors["terminalCursor.foreground"],
          cursorColors["editorCursor.foreground"]
        );
      }
    }
  });

  test(`${themeVariant.appearance} ${themeVariant.contrast} keeps extension and editor states readable`, () => {
    const rawPalette = getPalette(themeVariant.appearance, themeVariant.contrast);
    const workbenchColors = createWorkbenchColors(
      rawPalette,
      preferencesForThemeVariant(themeVariant)
    );
    for (const foregroundIdentifier of gitLensAndIssuesForegroundIdentifiers) {
      for (const surfaceIdentifier of ["editor.background", "sideBar.background"]) {
        assert.ok(
          contrastRatio(
            workbenchColors[foregroundIdentifier],
            workbenchColors[surfaceIdentifier]
          ) >= 4.5,
          `${foregroundIdentifier} on ${surfaceIdentifier}`
        );
      }
    }
    for (const bracketForegroundIdentifier of [
      "editorBracketHighlight.foreground1",
      "editorBracketHighlight.foreground2",
      "editorBracketHighlight.foreground3",
      "editorBracketHighlight.foreground4",
      "editorBracketHighlight.foreground5",
      "editorBracketHighlight.foreground6",
    ]) {
      assert.ok(
        contrastRatio(workbenchColors[bracketForegroundIdentifier], rawPalette.bg) >= 4.5,
        bracketForegroundIdentifier
      );
    }
    for (const bracketGuideBackgroundIdentifier of [
      "editorBracketPairGuide.activeBackground1",
      "editorBracketPairGuide.activeBackground2",
      "editorBracketPairGuide.activeBackground3",
      "editorBracketPairGuide.activeBackground4",
      "editorBracketPairGuide.activeBackground5",
      "editorBracketPairGuide.activeBackground6",
    ]) {
      assert.ok(
        contrastRatio(workbenchColors[bracketGuideBackgroundIdentifier], rawPalette.bg) >= 3,
        bracketGuideBackgroundIdentifier
      );
    }
    for (const [foregroundIdentifier, backgroundIdentifier, minimumContrast] of [
      ["editorSuggestWidget.foreground", "editorSuggestWidget.background", 4.5],
      ["editorSuggestWidget.highlightForeground", "editorSuggestWidget.background", 4.5],
      ["editorSuggestWidget.selectedForeground", "editorSuggestWidget.selectedBackground", 4.5],
      ["commandCenter.foreground", "commandCenter.background", 4.5],
      ["commandCenter.inactiveForeground", "commandCenter.background", 4.5],
      ["commandCenter.activeForeground", "commandCenter.activeBackground", 4.5],
      ["commandCenter.activeBorder", "commandCenter.activeBackground", 3],
      ["statusBarItem.prominentHoverForeground", "statusBarItem.prominentHoverBackground", 4.5],
      ["editorBracketMatch.foreground", "editorBracketMatch.background", 4.5],
      ["editorBracketMatch.border", "editor.background", 3],
    ]) {
      assert.ok(
        contrastRatio(
          workbenchColors[foregroundIdentifier],
          actualWorkbenchBackgroundColor(workbenchColors, backgroundIdentifier)
        ) >= minimumContrast,
        `${foregroundIdentifier} on ${backgroundIdentifier}`
      );
    }
  });

  test(`${themeVariant.appearance} ${themeVariant.contrast} uses strong high-contrast borders`, () => {
    const rawPalette = getPalette(themeVariant.appearance, themeVariant.contrast);
    for (const highContrastPreferences of [
      { workbenchStyle: "high-contrast" },
      { highContrast: true },
    ]) {
      const workbenchColors = createWorkbenchColors(rawPalette, {
        ...preferencesForThemeVariant(themeVariant),
        ...highContrastPreferences,
      });
      for (const borderIdentifier of structuralBorderColorIdentifiers) {
        const backgroundIdentifier = actualStructuralBorderSurfaceIdentifier(
          borderIdentifier,
          workbenchColors
        );
        assert.ok(backgroundIdentifier in workbenchColors, `${borderIdentifier} surface exists`);
        assert.match(workbenchColors[borderIdentifier], /^#[0-9a-f]{6}$/i, borderIdentifier);
        assert.ok(
          contrastRatio(
            workbenchColors[borderIdentifier],
            actualWorkbenchBackgroundColor(workbenchColors, backgroundIdentifier)
          ) >= 3,
          `${borderIdentifier} on ${backgroundIdentifier}`
        );
      }
    }
  });

  test(`${themeVariant.appearance} ${themeVariant.contrast} keeps diagnostics readable at every opacity`, () => {
    const rawPalette = getPalette(themeVariant.appearance, themeVariant.contrast);
    for (const diagnosticTextBackgroundOpacity of ["0%", "12.5%", "25%", "37.5%", "50%"]) {
      const workbenchColors = createWorkbenchColors(rawPalette, {
        ...preferencesForThemeVariant(themeVariant),
        diagnosticTextBackgroundOpacity,
      });
      for (const [foregroundIdentifier, backgroundIdentifier] of [
        ["editorError.foreground", "editorError.background"],
        ["editorWarning.foreground", "editorWarning.background"],
        ["editorInfo.foreground", "editorInfo.background"],
      ]) {
        const diagnosticSurfaceColor = compositeHexColor(
          workbenchColors[backgroundIdentifier],
          rawPalette.bg
        );
        assert.ok(
          contrastRatio(workbenchColors[foregroundIdentifier], diagnosticSurfaceColor) >= 4.5,
          `${foregroundIdentifier} at ${diagnosticTextBackgroundOpacity}`
        );
      }
    }
  });
}

for (const [themeAppearance, defaultThemePreference] of Object.entries(defaultThemePreferences)) {
  test(`${themeAppearance} configurable default keeps every cursor choice readable`, () => {
    const rawPalette = getPalette(themeAppearance, defaultThemePreference.contrast);
    for (const cursorChoice of cursorChoices) {
      const cursorColors = createWorkbenchColors(rawPalette, {
        ...defaultThemePreference,
        cursorColor: cursorChoice,
      });
      for (const cursorSurfaceIdentifier of ["editor.background", "terminal.background"]) {
        assert.ok(
          contrastRatio(
            cursorColors["editorCursor.foreground"],
            cursorColors[cursorSurfaceIdentifier]
          ) >= 3,
          `${themeAppearance} default ${cursorChoice} cursor on ${cursorSurfaceIdentifier}`
        );
        assert.equal(
          cursorColors["terminalCursor.foreground"],
          cursorColors["editorCursor.foreground"]
        );
      }
    }
  });
}

test("pins readable palette roles while preserving Everforest fill accents", () => {
  const rawDarkPalette = getPalette("dark", "soft");
  const readableDarkPalette = getReadableTextPalette("dark", rawDarkPalette);
  assert.equal(readableDarkPalette.fg, "#d3c6aa");
  assert.equal(readableDarkPalette.grey2, "#9ba89e");
  assert.equal(readableDarkPalette.red, "#f8a0a0");
  assert.equal(readableDarkPalette.accentForeground, "#272e33");
  assert.equal(readableDarkPalette.invertedText, "#fdf6e3");
  assert.equal(readableDarkPalette.strongBorder, "#9ba89e");
  assert.equal(readableDarkPalette.strongBorderOnAccent, "#272e33");
  assert.equal(readableDarkPalette.strongBorderOnSubsurface, "#fdf6e3");
  assert.equal(readableDarkPalette.green, rawDarkPalette.green);
  assert.equal(readableDarkPalette.bg, rawDarkPalette.bg);

  const rawLightPalette = getPalette("light", "soft");
  const readableLightPalette = getReadableTextPalette("light", rawLightPalette);
  assert.equal(readableLightPalette.fg, "#59646c");
  assert.equal(readableLightPalette.red, "#ad3d3d");
  assert.equal(readableLightPalette.orange, "#984b00");
  assert.equal(readableLightPalette.accentForeground, "#2d353b");
  assert.equal(readableLightPalette.invertedText, "#2d353b");
  assert.equal(readableLightPalette.strongBorder, "#59646c");
  assert.equal(readableLightPalette.strongBorderOnAccent, "#2d353b");
  assert.equal(readableLightPalette.strongBorderOnSubsurface, "#2d353b");
  assert.equal(readableLightPalette.bg, rawLightPalette.bg);
  assert.equal(readableLightPalette.dimRed, rawLightPalette.dimRed);
});

test("composites translucent foregrounds before measuring contrast", () => {
  assert.equal(compositeHexColor("#ffffff80", "#000000"), "#808080");
  assert.ok(contrastRatio("#ffffff80", "#000000") > 3);
  assert.equal(contrastRatio("#ffffff", "#000000"), 21);
});
