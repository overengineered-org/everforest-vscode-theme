import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import themeManifest from "../test/support/theme-manifest.cjs";
import { compositeHexColor, contrastRatio, validateHexColor } from "./color-contrast.mjs";
import { findIndistinguishableHoverBackgroundPairs } from "./workbench-interaction-contract.mjs";

const { requiredSemanticTokenIdentifiers, requiredSyntaxScopes } = themeManifest;
const documentedWorkbenchColorContract = JSON.parse(
  readFileSync(resolve("src", "workbench", "documented-workbench-colors.json"), "utf8")
);
const expectedDocumentedWorkbenchColorCount = 910;
const extensionSpecificWorkbenchColorIdentifiers = [
  "gitlens.gutterBackgroundColor",
  "gitlens.gutterForegroundColor",
  "gitlens.gutterUncommittedForegroundColor",
  "gitlens.trailingLineForegroundColor",
  "gitlens.lineHighlightBackgroundColor",
  "gitlens.lineHighlightOverviewRulerColor",
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
const expectedExtensionSpecificWorkbenchColorCount = 27;
const expectedGeneratedWorkbenchColorCount = 937;
const requiredGeneratedWorkbenchColorIdentifiers = new Set([
  ...documentedWorkbenchColorContract.identifiers,
  ...extensionSpecificWorkbenchColorIdentifiers,
]);

if (documentedWorkbenchColorContract.identifiers.length !== expectedDocumentedWorkbenchColorCount) {
  throw new Error(
    `Documented workbench color contract has ${documentedWorkbenchColorContract.identifiers.length} identifiers, expected ${expectedDocumentedWorkbenchColorCount}`
  );
}
if (
  new Set(extensionSpecificWorkbenchColorIdentifiers).size !==
  expectedExtensionSpecificWorkbenchColorCount
) {
  throw new Error("Extension-specific workbench color contract must contain 27 unique identifiers");
}
if (requiredGeneratedWorkbenchColorIdentifiers.size !== expectedGeneratedWorkbenchColorCount) {
  throw new Error("Combined workbench color contract must contain 937 unique identifiers");
}

const shippedThemes = [
  {
    appearance: "dark",
    expectedBackground: "#333c43",
    expectedName: "Everforest Complete Dark Soft",
    fileName: "everforest-complete-dark-soft-color-theme.json",
  },
  {
    appearance: "dark",
    expectedBackground: "#2d353b",
    expectedName: "Everforest Complete Dark Medium",
    fileName: "everforest-complete-dark-medium-color-theme.json",
  },
  {
    appearance: "dark",
    expectedBackground: "#272e33",
    expectedName: "Everforest Complete Dark Hard",
    fileName: "everforest-complete-dark-hard-color-theme.json",
  },
  {
    appearance: "light",
    expectedBackground: "#f3ead3",
    expectedName: "Everforest Complete Light Soft",
    fileName: "everforest-complete-light-soft-color-theme.json",
  },
  {
    appearance: "light",
    expectedBackground: "#fdf6e3",
    expectedName: "Everforest Complete Light Medium",
    fileName: "everforest-complete-light-medium-color-theme.json",
  },
  {
    appearance: "light",
    expectedBackground: "#fffbef",
    expectedName: "Everforest Complete Light Hard",
    fileName: "everforest-complete-light-hard-color-theme.json",
  },
  {
    appearance: "dark",
    expectedBackground: "#2d353b",
    expectedName: "Everforest Complete Dark",
    fileName: "everforest-complete-dark-color-theme.json",
  },
  {
    appearance: "light",
    expectedBackground: "#fdf6e3",
    expectedName: "Everforest Complete Light",
    fileName: "everforest-complete-light-color-theme.json",
  },
];

const terminalAnsiColorIdentifiers = [
  "terminal.ansiBlack",
  "terminal.ansiBlue",
  "terminal.ansiBrightBlack",
  "terminal.ansiBrightBlue",
  "terminal.ansiBrightCyan",
  "terminal.ansiBrightGreen",
  "terminal.ansiBrightMagenta",
  "terminal.ansiBrightRed",
  "terminal.ansiBrightWhite",
  "terminal.ansiBrightYellow",
  "terminal.ansiCyan",
  "terminal.ansiGreen",
  "terminal.ansiMagenta",
  "terminal.ansiRed",
  "terminal.ansiWhite",
  "terminal.ansiYellow",
];

const semanticWorkbenchTranslucentColorIdentifiers = [
  "minimap.selectionOccurrenceHighlight",
  "minimap.chatEditHighlight",
  "chart.axis",
  "chart.guide",
];

const semanticWorkbenchDistinctColorIdentifierGroups = [
  ["minimap.selectionOccurrenceHighlight", "minimap.chatEditHighlight"],
  ["chart.line", "chart.axis", "chart.guide"],
  ["commentsView.resolvedIcon", "commentsView.unresolvedIcon"],
  ["editorCommentsWidget.resolvedBorder", "editorCommentsWidget.unresolvedBorder"],
];

const extensionManifest = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const repositoryDirectory = resolve(".");
const contributedThemesByPath = new Map(
  extensionManifest.contributes.themes.map((themeContribution) => [
    themeContribution.path.replace(/^\.\//, ""),
    themeContribution,
  ])
);

function alphaChannelFromHexColor(hexColor) {
  const alphaHexadecimalDigits = /^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(hexColor)?.[1];
  if (!alphaHexadecimalDigits) return undefined;
  return Number.parseInt(alphaHexadecimalDigits, 16);
}

const allowedFontStyleTokens = new Set(["bold", "italic", "strikethrough", "underline"]);

function isPlainObject(candidateValue) {
  return (
    candidateValue !== null &&
    typeof candidateValue === "object" &&
    !Array.isArray(candidateValue) &&
    Object.getPrototypeOf(candidateValue) === Object.prototype
  );
}

function validateFontStyle(themePath, fontStyle, colorRuleContext) {
  if (fontStyle === undefined || fontStyle === "") return;
  if (typeof fontStyle !== "string") {
    throw new Error(`${themePath}: ${colorRuleContext} fontStyle must be a string`);
  }
  const fontStyleTokens = fontStyle.split(/\s+/).filter(Boolean);
  if (
    new Set(fontStyleTokens).size !== fontStyleTokens.length ||
    fontStyleTokens.some((fontStyleToken) => !allowedFontStyleTokens.has(fontStyleToken))
  ) {
    throw new Error(`${themePath}: ${colorRuleContext} has invalid fontStyle ${fontStyle}`);
  }
}

function validateSyntaxTokenColors(themePath, tokenColors) {
  if (!Array.isArray(tokenColors)) {
    throw new Error(`${themePath}: tokenColors must be an array`);
  }
  tokenColors.forEach((tokenColorRule, tokenColorRuleIndex) => {
    const colorRuleContext = `tokenColors[${tokenColorRuleIndex}]`;
    if (!isPlainObject(tokenColorRule) || !isPlainObject(tokenColorRule.settings)) {
      throw new Error(`${themePath}: ${colorRuleContext} must contain settings`);
    }
    const scopeValues = Array.isArray(tokenColorRule.scope)
      ? tokenColorRule.scope
      : [tokenColorRule.scope];
    if (scopeValues.some((scopeValue) => typeof scopeValue !== "string")) {
      throw new Error(`${themePath}: ${colorRuleContext} scopes must be strings`);
    }
    const normalizedScopes = scopeValues.flatMap((scopeValue) =>
      scopeValue.split(",").map((syntaxScope) => syntaxScope.trim())
    );
    if (
      normalizedScopes.length === 0 ||
      normalizedScopes.some((syntaxScope) => syntaxScope.length === 0) ||
      new Set(normalizedScopes).size !== normalizedScopes.length
    ) {
      throw new Error(`${themePath}: ${colorRuleContext} scopes must be non-empty and unique`);
    }
    for (const colorProperty of ["background", "foreground"]) {
      if (tokenColorRule.settings[colorProperty] !== undefined) {
        validateHexColor(tokenColorRule.settings[colorProperty]);
      }
    }
    validateFontStyle(themePath, tokenColorRule.settings.fontStyle, colorRuleContext);
  });
}

function validateSemanticTokenColors(themePath, semanticTokenColors) {
  if (!isPlainObject(semanticTokenColors)) {
    throw new Error(`${themePath}: semanticTokenColors must be an object`);
  }
  for (const [semanticTokenIdentifier, semanticTokenRule] of Object.entries(semanticTokenColors)) {
    const colorRuleContext = `semanticTokenColors.${semanticTokenIdentifier}`;
    if (typeof semanticTokenRule === "string") {
      validateHexColor(semanticTokenRule);
      continue;
    }
    if (!isPlainObject(semanticTokenRule)) {
      throw new Error(`${themePath}: ${colorRuleContext} must be a color or rule object`);
    }
    if (semanticTokenRule.foreground !== undefined) {
      validateHexColor(semanticTokenRule.foreground);
    }
    validateFontStyle(themePath, semanticTokenRule.fontStyle, colorRuleContext);
    for (const styleProperty of ["bold", "italic", "strikethrough", "underline"]) {
      if (
        semanticTokenRule[styleProperty] !== undefined &&
        typeof semanticTokenRule[styleProperty] !== "boolean"
      ) {
        throw new Error(`${themePath}: ${colorRuleContext}.${styleProperty} must be boolean`);
      }
    }
  }
}

function resolveWorkbenchBackground(themeColors, backgroundIdentifier) {
  const backgroundColor = themeColors[backgroundIdentifier];
  if (!backgroundColor) return backgroundColor;
  if (alphaChannelFromHexColor(backgroundColor) === undefined) return backgroundColor;

  const baseSurfaceIdentifierByBackgroundIdentifier = {
    "button.hoverBackground": "button.background",
    "button.secondaryHoverBackground": "button.secondaryBackground",
    "extensionButton.hoverBackground": "extensionButton.background",
    "extensionButton.prominentHoverBackground": "extensionButton.prominentBackground",
    "input.background": "editor.background",
    "inlineChatInput.background": "editor.background",
    "editorGhostText.background": "editor.background",
    "editorInlayHint.background": "editor.background",
    "editorInlayHint.typeBackground": "editor.background",
    "editorInlayHint.parameterBackground": "editor.background",
    "editorGutter.background": "editor.background",
    "list.focusBackground": "editor.background",
    "list.inactiveFocusBackground": "editor.background",
    "list.hoverBackground": "editor.background",
    "list.inactiveSelectionBackground": "editor.background",
    "radio.inactiveHoverBackground": "radio.inactiveBackground",
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
    (themeColors[inferredBaseSurfaceIdentifier]
      ? inferredBaseSurfaceIdentifier
      : "editor.background");
  const baseSurfaceColor = themeColors[baseSurfaceIdentifier];
  if (!baseSurfaceColor || alphaChannelFromHexColor(baseSurfaceColor) !== undefined) {
    throw new Error(`${backgroundIdentifier}: cannot resolve translucent base surface`);
  }
  return compositeHexColor(backgroundColor, baseSurfaceColor);
}

function measureWorkbenchContrast(themeColors, foregroundIdentifier, backgroundIdentifier) {
  return contrastRatio(
    themeColors[foregroundIdentifier],
    resolveWorkbenchBackground(themeColors, backgroundIdentifier)
  );
}

function readSemanticForegroundColor(semanticTokenColor) {
  return typeof semanticTokenColor === "string"
    ? semanticTokenColor
    : semanticTokenColor?.foreground;
}

function assertThemeColorContrast(
  themePath,
  foregroundColor,
  backgroundColor,
  minimumContrast,
  roleDescription
) {
  const measuredContrast = contrastRatio(foregroundColor, backgroundColor);
  if (measuredContrast < minimumContrast) {
    throw new Error(
      `${themePath}: ${roleDescription} contrast ${measuredContrast.toFixed(2)}; minimum ${minimumContrast}`
    );
  }
}

function validateReadableThemeMatrix(themePath, generatedTheme) {
  const { colors: themeColors } = generatedTheme;
  const editorBackgroundColor = themeColors["editor.background"];

  for (const [syntaxRuleIndex, syntaxRule] of generatedTheme.tokenColors.entries()) {
    const syntaxForegroundColor = syntaxRule.settings?.foreground;
    if (syntaxForegroundColor) {
      assertThemeColorContrast(
        themePath,
        syntaxForegroundColor,
        editorBackgroundColor,
        4.5,
        `syntax rule ${syntaxRuleIndex}`
      );
    }
  }
  for (const [semanticTokenIdentifier, semanticTokenColor] of Object.entries(
    generatedTheme.semanticTokenColors
  )) {
    const semanticForegroundColor = readSemanticForegroundColor(semanticTokenColor);
    if (semanticForegroundColor) {
      assertThemeColorContrast(
        themePath,
        semanticForegroundColor,
        editorBackgroundColor,
        4.5,
        `semantic token ${semanticTokenIdentifier}`
      );
    }
  }

  const cursorChoiceColors = {
    white: themeColors["editorCursor.foreground"],
    black: themeColors["editorCursor.foreground"],
    red: readSemanticForegroundColor(generatedTheme.semanticTokenColors.keyword),
    orange: readSemanticForegroundColor(generatedTheme.semanticTokenColors.operator),
    yellow: readSemanticForegroundColor(generatedTheme.semanticTokenColors.string),
    green: readSemanticForegroundColor(generatedTheme.semanticTokenColors.function),
    aqua: readSemanticForegroundColor(generatedTheme.semanticTokenColors.namespace),
    blue: readSemanticForegroundColor(generatedTheme.semanticTokenColors.type),
    purple: readSemanticForegroundColor(generatedTheme.semanticTokenColors.enum),
  };
  for (const [cursorChoice, cursorColor] of Object.entries(cursorChoiceColors)) {
    for (const cursorSurfaceIdentifier of ["editor.background", "terminal.background"]) {
      assertThemeColorContrast(
        themePath,
        cursorColor,
        themeColors[cursorSurfaceIdentifier],
        3,
        `${cursorChoice} cursor on ${cursorSurfaceIdentifier}`
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
    assertThemeColorContrast(
      themePath,
      themeColors[bracketForegroundIdentifier],
      editorBackgroundColor,
      4.5,
      bracketForegroundIdentifier
    );
  }
  assertThemeColorContrast(
    themePath,
    themeColors["editorBracketMatch.foreground"],
    resolveWorkbenchBackground(themeColors, "editorBracketMatch.background"),
    4.5,
    "editorBracketMatch.foreground"
  );
  assertThemeColorContrast(
    themePath,
    themeColors["editorBracketMatch.border"],
    editorBackgroundColor,
    3,
    "editorBracketMatch.border"
  );
  for (const bracketGuideBackgroundIdentifier of [
    "editorBracketPairGuide.activeBackground1",
    "editorBracketPairGuide.activeBackground2",
    "editorBracketPairGuide.activeBackground3",
    "editorBracketPairGuide.activeBackground4",
    "editorBracketPairGuide.activeBackground5",
    "editorBracketPairGuide.activeBackground6",
  ]) {
    assertThemeColorContrast(
      themePath,
      themeColors[bracketGuideBackgroundIdentifier],
      editorBackgroundColor,
      3,
      bracketGuideBackgroundIdentifier
    );
  }

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
  for (const [
    foregroundIdentifier,
    backgroundIdentifier,
    minimumContrast,
  ] of readableWorkbenchStateContrastChecks) {
    assertThemeColorContrast(
      themePath,
      themeColors[foregroundIdentifier],
      resolveWorkbenchBackground(themeColors, backgroundIdentifier),
      minimumContrast,
      foregroundIdentifier
    );
  }
  for (const linkForegroundIdentifier of [
    "textLink.activeForeground",
    "editorLink.activeForeground",
  ]) {
    if (alphaChannelFromHexColor(themeColors[linkForegroundIdentifier]) !== undefined) {
      throw new Error(`${themePath}: ${linkForegroundIdentifier} must be opaque`);
    }
  }

  for (const [foregroundIdentifier, backgroundIdentifier, minimumContrast] of [
    ["editorSuggestWidget.foreground", "editorSuggestWidget.background", 4.5],
    ["editorSuggestWidget.highlightForeground", "editorSuggestWidget.background", 4.5],
    ["editorSuggestWidget.selectedForeground", "editorSuggestWidget.selectedBackground", 4.5],
    ["statusBarItem.prominentHoverForeground", "statusBarItem.prominentHoverBackground", 4.5],
    ["commandCenter.foreground", "commandCenter.background", 4.5],
    ["commandCenter.inactiveForeground", "commandCenter.background", 4.5],
    ["commandCenter.activeForeground", "commandCenter.activeBackground", 4.5],
    ["commandCenter.activeBorder", "commandCenter.activeBackground", 3],
  ]) {
    assertThemeColorContrast(
      themePath,
      themeColors[foregroundIdentifier],
      resolveWorkbenchBackground(themeColors, backgroundIdentifier),
      minimumContrast,
      foregroundIdentifier
    );
  }

  for (const extensionForegroundIdentifier of [
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
  ]) {
    for (const extensionSurfaceIdentifier of ["editor.background", "sideBar.background"]) {
      assertThemeColorContrast(
        themePath,
        themeColors[extensionForegroundIdentifier],
        themeColors[extensionSurfaceIdentifier],
        4.5,
        `${extensionForegroundIdentifier} on ${extensionSurfaceIdentifier}`
      );
    }
  }

  const minimapForegroundOpacity = themeColors["minimap.foregroundOpacity"];
  if (alphaChannelFromHexColor(minimapForegroundOpacity) === undefined) {
    throw new Error(`${themePath}: minimap.foregroundOpacity must include alpha`);
  }
  assertThemeColorContrast(
    themePath,
    minimapForegroundOpacity,
    resolveWorkbenchBackground(themeColors, "minimap.background"),
    3,
    "minimap.foregroundOpacity"
  );

  const diagnosticForegroundByIdentifier = {
    "editorError.foreground": "editorError.background",
    "editorWarning.foreground": "editorWarning.background",
    "editorInfo.foreground": "editorInfo.background",
  };
  for (const [foregroundIdentifier, backgroundIdentifier] of Object.entries(
    diagnosticForegroundByIdentifier
  )) {
    const diagnosticBackgroundColor = themeColors[backgroundIdentifier];
    const diagnosticBaseColor = diagnosticBackgroundColor.slice(0, 7);
    for (const diagnosticOpacity of ["00", "20", "40", "60", "80"]) {
      const diagnosticSurfaceColor = compositeHexColor(
        `${diagnosticBaseColor}${diagnosticOpacity}`,
        editorBackgroundColor
      );
      const diagnosticForegroundColor =
        diagnosticOpacity === "00"
          ? themeColors[foregroundIdentifier]
          : themeColors["editor.selectionForeground"];
      assertThemeColorContrast(
        themePath,
        diagnosticForegroundColor,
        diagnosticSurfaceColor,
        4.5,
        `${foregroundIdentifier} at ${diagnosticOpacity} opacity`
      );
    }
  }
}

function collectThemeColors(themeNode, collectedColors = []) {
  if (typeof themeNode === "string" && themeNode.startsWith("#")) {
    collectedColors.push(themeNode);
  } else if (Array.isArray(themeNode)) {
    for (const themeChildNode of themeNode) collectThemeColors(themeChildNode, collectedColors);
  } else if (themeNode && typeof themeNode === "object") {
    for (const themeChildNode of Object.values(themeNode)) {
      collectThemeColors(themeChildNode, collectedColors);
    }
  }
  return collectedColors;
}

function validateSelectionColorContract(themePath, themeColors, appearance) {
  const editorBackground = themeColors["editor.background"];
  const editorSelectionBackground = themeColors["editor.selectionBackground"];
  const editorInactiveSelectionBackground = themeColors["editor.inactiveSelectionBackground"];
  const editorSelectionHighlightBackground = themeColors["editor.selectionHighlightBackground"];
  const compositedEditorSelectionBackground = compositeHexColor(
    editorSelectionBackground,
    editorBackground
  );
  const activeSelectionSurfaceContrast = contrastRatio(
    compositedEditorSelectionBackground,
    editorBackground
  );
  const minimumActiveSelectionSurfaceContrast = appearance === "dark" ? 1.9 : 1.3;

  if (activeSelectionSurfaceContrast < minimumActiveSelectionSurfaceContrast) {
    throw new Error(
      `${themePath}: editor selection surface contrast ${activeSelectionSurfaceContrast.toFixed(2)}`
    );
  }
  const selectedTextContrast = contrastRatio(
    themeColors["editor.selectionForeground"],
    compositedEditorSelectionBackground
  );
  if (selectedTextContrast < 4.5) {
    throw new Error(`${themePath}: selected text contrast ${selectedTextContrast.toFixed(2)}`);
  }

  const selectionOpacitySequence = [
    editorSelectionBackground,
    editorInactiveSelectionBackground,
    editorSelectionHighlightBackground,
  ].map(alphaChannelFromHexColor);
  if (
    selectionOpacitySequence.some((selectionOpacity) => selectionOpacity === undefined) ||
    selectionOpacitySequence[0] <= selectionOpacitySequence[1] ||
    selectionOpacitySequence[1] <= selectionOpacitySequence[2]
  ) {
    throw new Error(`${themePath}: selection states must use descending translucent opacity`);
  }

  if (themeColors["terminal.selectionBackground"] !== editorSelectionBackground) {
    throw new Error(`${themePath}: terminal and editor active selection colors must match`);
  }
  const minimapSelectionBackground = themeColors["minimap.selectionHighlight"];
  const minimapSelectionOpacity = alphaChannelFromHexColor(minimapSelectionBackground);
  if (
    minimapSelectionOpacity === undefined ||
    minimapSelectionOpacity <= selectionOpacitySequence[0]
  ) {
    throw new Error(
      `${themePath}: minimap active selection must be stronger than editor selection`
    );
  }
  const minimapSelectionContrast = contrastRatio(
    compositeHexColor(minimapSelectionBackground, editorBackground),
    editorBackground
  );
  if (minimapSelectionContrast < 3) {
    throw new Error(
      `${themePath}: minimap selection contrast ${minimapSelectionContrast.toFixed(2)}`
    );
  }
  if (themeColors["terminal.inactiveSelectionBackground"] !== editorInactiveSelectionBackground) {
    throw new Error(`${themePath}: terminal and editor inactive selection colors must match`);
  }
  if (themeColors["terminal.selectionForeground"] !== themeColors["editor.selectionForeground"]) {
    throw new Error(`${themePath}: terminal and editor selected text colors must match`);
  }
}

for (const { appearance, expectedBackground, expectedName, fileName } of shippedThemes) {
  const themePath = resolve("themes", fileName);
  const generatedTheme = JSON.parse(readFileSync(themePath, "utf8"));
  const contributedThemePath = relative(repositoryDirectory, themePath).split(sep).join("/");
  const themeContribution = contributedThemesByPath.get(contributedThemePath);

  if (generatedTheme.name !== expectedName) throw new Error(`${themePath}: unexpected name`);
  if (generatedTheme.type !== appearance) throw new Error(`${themePath}: unexpected type`);
  if (!themeContribution) throw new Error(`${themePath}: missing package contribution`);
  if (themeContribution.label !== expectedName) {
    throw new Error(`${themePath}: contribution label mismatch`);
  }
  const expectedUiTheme = appearance === "dark" ? "vs-dark" : "vs";
  if (themeContribution.uiTheme !== expectedUiTheme) {
    throw new Error(`${themePath}: contribution UI theme mismatch`);
  }
  if (generatedTheme.semanticHighlighting !== true) {
    throw new Error(`${themePath}: semantic highlighting disabled`);
  }
  validateSyntaxTokenColors(themePath, generatedTheme.tokenColors);
  validateSemanticTokenColors(themePath, generatedTheme.semanticTokenColors);
  const generatedWorkbenchColorEntries = Object.entries(generatedTheme.colors ?? {});
  if (generatedWorkbenchColorEntries.length !== expectedGeneratedWorkbenchColorCount) {
    throw new Error(
      `${themePath}: expected ${expectedGeneratedWorkbenchColorCount} workbench colors, found ${generatedWorkbenchColorEntries.length}`
    );
  }
  for (const requiredWorkbenchColorIdentifier of requiredGeneratedWorkbenchColorIdentifiers) {
    if (!(requiredWorkbenchColorIdentifier in generatedTheme.colors)) {
      throw new Error(`${themePath}: missing ${requiredWorkbenchColorIdentifier}`);
    }
  }
  for (const [
    generatedWorkbenchColorIdentifier,
    generatedWorkbenchColor,
  ] of generatedWorkbenchColorEntries) {
    if (!requiredGeneratedWorkbenchColorIdentifiers.has(generatedWorkbenchColorIdentifier)) {
      throw new Error(`${themePath}: unexpected ${generatedWorkbenchColorIdentifier}`);
    }
    validateHexColor(generatedWorkbenchColor);
  }
  if (generatedTheme.colors["editor.background"] !== expectedBackground) {
    throw new Error(`${themePath}: canonical background mismatch`);
  }
  const editorBackgroundColor = generatedTheme.colors["editor.background"];
  const panelBackgroundColor = generatedTheme.colors["panel.background"];
  const terminalBackgroundColor = generatedTheme.colors["terminal.background"];
  if (panelBackgroundColor === editorBackgroundColor) {
    throw new Error(`${themePath}: panel must be distinct from editor`);
  }
  if (terminalBackgroundColor !== panelBackgroundColor) {
    throw new Error(`${themePath}: terminal must use the panel surface`);
  }
  if (generatedTheme.colors["panel.border"] !== generatedTheme.colors["terminal.border"]) {
    throw new Error(`${themePath}: terminal and panel borders must match`);
  }
  const indistinguishableHoverBackgroundPairs = findIndistinguishableHoverBackgroundPairs(
    generatedTheme.colors
  );
  if (indistinguishableHoverBackgroundPairs.length > 0) {
    const indistinguishableHoverBackgroundIdentifiers = indistinguishableHoverBackgroundPairs.map(
      ({ baseBackgroundIdentifier, hoverBackgroundIdentifier }) =>
        `${baseBackgroundIdentifier} = ${hoverBackgroundIdentifier}`
    );
    throw new Error(
      `${themePath}: indistinguishable interactive backgrounds: ${indistinguishableHoverBackgroundIdentifiers.join(", ")}`
    );
  }
  for (const colorIdentifier of documentedWorkbenchColorContract.identifiers) {
    if (!(colorIdentifier in generatedTheme.colors)) {
      throw new Error(`${themePath}: missing ${colorIdentifier}`);
    }
  }
  for (const translucentColorIdentifier of documentedWorkbenchColorContract.translucentIdentifiers) {
    const translucentColorAlphaChannel = alphaChannelFromHexColor(
      generatedTheme.colors[translucentColorIdentifier]
    );
    if (translucentColorAlphaChannel === undefined || translucentColorAlphaChannel === 255) {
      throw new Error(`${themePath}: ${translucentColorIdentifier} must be translucent`);
    }
  }
  for (const semanticWorkbenchTranslucentColorIdentifier of semanticWorkbenchTranslucentColorIdentifiers) {
    const semanticWorkbenchAlphaChannel = alphaChannelFromHexColor(
      generatedTheme.colors[semanticWorkbenchTranslucentColorIdentifier]
    );
    if (semanticWorkbenchAlphaChannel === undefined || semanticWorkbenchAlphaChannel === 255) {
      throw new Error(
        `${themePath}: ${semanticWorkbenchTranslucentColorIdentifier} must be translucent`
      );
    }
  }
  for (const semanticWorkbenchDistinctColorIdentifierGroup of semanticWorkbenchDistinctColorIdentifierGroups) {
    const semanticWorkbenchDistinctColors = semanticWorkbenchDistinctColorIdentifierGroup.map(
      (semanticWorkbenchColorIdentifier) => generatedTheme.colors[semanticWorkbenchColorIdentifier]
    );
    if (new Set(semanticWorkbenchDistinctColors).size !== semanticWorkbenchDistinctColors.length) {
      throw new Error(
        `${themePath}: ${semanticWorkbenchDistinctColorIdentifierGroup.join(", ")} must be distinct`
      );
    }
  }
  for (const semanticTokenIdentifier of requiredSemanticTokenIdentifiers) {
    if (!(semanticTokenIdentifier in generatedTheme.semanticTokenColors)) {
      throw new Error(`${themePath}: missing semantic token ${semanticTokenIdentifier}`);
    }
  }
  if (generatedTheme.tokenColors.length < 150) {
    throw new Error(`${themePath}: syntax scope coverage too small`);
  }
  const contributedSyntaxScopes = new Set(
    generatedTheme.tokenColors.flatMap(({ scope }) =>
      Array.isArray(scope)
        ? scope
        : String(scope ?? "")
            .split(",")
            .map((syntaxScope) => syntaxScope.trim())
    )
  );
  for (const requiredSyntaxScope of requiredSyntaxScopes) {
    if (!contributedSyntaxScopes.has(requiredSyntaxScope)) {
      throw new Error(`${themePath}: missing syntax scope ${requiredSyntaxScope}`);
    }
  }
  for (const generatedThemeColor of collectThemeColors(generatedTheme)) {
    validateHexColor(generatedThemeColor);
  }
  for (const terminalFindMatchColorIdentifier of [
    "terminal.findMatchBackground",
    "terminal.findMatchHighlightBackground",
  ]) {
    const terminalFindMatchAlphaChannel = alphaChannelFromHexColor(
      generatedTheme.colors[terminalFindMatchColorIdentifier]
    );
    if (!terminalFindMatchAlphaChannel || terminalFindMatchAlphaChannel === 255) {
      throw new Error(`${themePath}: ${terminalFindMatchColorIdentifier} must be translucent`);
    }
  }

  const editorContrast = contrastRatio(
    generatedTheme.colors["editor.foreground"],
    generatedTheme.colors["editor.background"]
  );
  const buttonContrast = contrastRatio(
    generatedTheme.colors["button.foreground"],
    generatedTheme.colors["button.background"]
  );
  if (editorContrast < 4.5) {
    throw new Error(`${themePath}: editor contrast ${editorContrast.toFixed(2)}`);
  }
  if (buttonContrast < 4.5) {
    throw new Error(`${themePath}: button contrast ${buttonContrast.toFixed(2)}`);
  }
  validateSelectionColorContract(themePath, generatedTheme.colors, appearance);
  const criticalWorkbenchContrastChecks = [
    ["foreground", "sideBar.background", 4.5],
    ["descriptionForeground", "sideBar.background", 4.5],
    ["icon.foreground", "activityBar.background", 4.5],
    ["sideBar.foreground", "sideBar.background", 4.5],
    ["sideBarTitle.foreground", "sideBar.background", 4.5],
    ["sideBarSectionHeader.foreground", "sideBar.background", 4.5],
    ["statusBar.foreground", "statusBar.background", 4.5],
    ["statusBar.noFolderForeground", "statusBar.noFolderBackground", 4.5],
    ["statusBarItem.remoteForeground", "statusBarItem.remoteBackground", 4.5],
    ["statusBar.debuggingForeground", "statusBar.debuggingBackground", 4.5],
    ["statusBarItem.errorForeground", "statusBarItem.errorBackground", 4.5],
    ["statusBarItem.warningForeground", "statusBarItem.warningBackground", 4.5],
    ["statusBarItem.prominentForeground", "statusBarItem.prominentBackground", 4.5],
    ["extensionButton.foreground", "extensionButton.background", 4.5],
    ["extensionButton.prominentForeground", "extensionButton.prominentBackground", 4.5],
    ["menu.foreground", "menu.background", 4.5],
    ["tab.inactiveForeground", "tab.inactiveBackground", 4.5],
    ["titleBar.inactiveForeground", "titleBar.inactiveBackground", 4.5],
    ["commandCenter.foreground", "commandCenter.background", 4.5],
    ["dropdown.foreground", "dropdown.background", 4.5],
    ["settings.dropdownForeground", "settings.dropdownBackground", 4.5],
    ["settings.numberInputForeground", "settings.numberInputBackground", 4.5],
    ["settings.textInputForeground", "settings.textInputBackground", 4.5],
    ["extensionBadge.remoteForeground", "extensionBadge.remoteBackground", 4.5],
    ["checkbox.foreground", "checkbox.background", 3],
    ["settings.checkboxForeground", "settings.checkboxBackground", 3],
    ["titleBar.activeForeground", "titleBar.activeBackground", 4.5],
    ["settings.headerForeground", "editor.background", 4.5],
    ["breadcrumb.foreground", "editor.background", 4.5],
    ["textLink.foreground", "editor.background", 4.5],
    ["editorLink.activeForeground", "editor.background", 4.5],
    ["editorSuggestWidget.highlightForeground", "editorSuggestWidget.background", 4.5],
    ["notificationLink.foreground", "notifications.background", 4.5],
    ["gitDecoration.renamedResourceForeground", "sideBar.background", 4.5],
    ["gitDecoration.addedResourceForeground", "sideBar.background", 4.5],
    ["gitDecoration.modifiedResourceForeground", "sideBar.background", 4.5],
    ["gitDecoration.deletedResourceForeground", "sideBar.background", 4.5],
    ["gitDecoration.untrackedResourceForeground", "sideBar.background", 4.5],
    ["debugView.valueChangedHighlight", "sideBar.background", 4.5],
    ["settings.modifiedItemIndicator", "editor.background", 3],
    ["chart.line", "editor.background", 3],
    ["commentsView.resolvedIcon", "sideBar.background", 3],
    ["commentsView.unresolvedIcon", "sideBar.background", 3],
    ["editorCommentsWidget.resolvedBorder", "editorWidget.background", 3],
    ["editorCommentsWidget.unresolvedBorder", "editorWidget.background", 3],
    ["scmGraph.historyItemHoverLabelForeground", "scmGraph.historyItemRefColor", 4.5],
    ["scmGraph.historyItemHoverLabelForeground", "scmGraph.historyItemRemoteRefColor", 4.5],
    ["scmGraph.historyItemHoverLabelForeground", "scmGraph.historyItemBaseRefColor", 4.5],
    ["scmGraph.historyItemHoverAdditionsForeground", "editorHoverWidget.background", 4.5],
    ["scmGraph.historyItemHoverDeletionsForeground", "editorHoverWidget.background", 4.5],
    ["terminal.ansiGreen", "terminal.background", 4.5],
    ["terminal.ansiBrightGreen", "terminal.background", 4.5],
    ["terminal.foreground", "terminal.background", 4.5],
    ["panelSectionHeader.foreground", "panelSectionHeader.background", 4.5],
    ["inputValidation.errorForeground", "inputValidation.errorBackground", 4.5],
    ["inputValidation.infoForeground", "inputValidation.infoBackground", 4.5],
    ["inputValidation.warningForeground", "inputValidation.warningBackground", 4.5],
    ["chat.slashCommandForeground", "chat.slashCommandBackground", 4.5],
    ["activityErrorBadge.foreground", "activityErrorBadge.background", 4.5],
    ["editorActionList.foreground", "editorActionList.background", 4.5],
    ["gauge.warningForeground", "gauge.warningBackground", 4.5],
    [
      "inlineEdit.gutterIndicator.successfulForeground",
      "inlineEdit.gutterIndicator.successfulBackground",
      4.5,
    ],
    ["radio.inactiveForeground", "radio.inactiveBackground", 4.5],
    ["statusBarItem.remoteHoverForeground", "statusBarItem.remoteHoverBackground", 4.5],
    ["statusBarItem.errorHoverForeground", "statusBarItem.errorHoverBackground", 4.5],
    ["statusBarItem.warningHoverForeground", "statusBarItem.warningHoverBackground", 4.5],
    ["statusBarItem.hoverForeground", "statusBarItem.hoverBackground", 4.5],
    ["testing.message.error.badgeForeground", "testing.message.error.badgeBackground", 4.5],
    ["focusBorder", "editor.background", 3],
    ["activityBar.activeFocusBorder", "activityBar.background", 3],
    ["activityBar.activeBorder", "activityBar.background", 3],
    ["commandCenter.activeBorder", "commandCenter.background", 3],
    ["editorBracketMatch.border", "editor.background", 3],
    ["editor.findMatchBorder", "editor.background", 3],
    ["editor.findMatchHighlightBorder", "editor.background", 3],
    ["inlineChatInput.focusBorder", "inlineChatInput.background", 3],
    ["interactive.activeCodeBorder", "editor.background", 3],
    ["inputOption.activeBorder", "input.background", 3],
    ["panelTitle.activeBorder", "panel.background", 3],
    ["sash.hoverBorder", "editor.background", 3],
    ["tab.activeBorder", "tab.activeBackground", 3],
    ["notebook.focusedCellBorder", "notebook.cellEditorBackground", 3],
    ["notebook.focusedEditorBorder", "notebook.cellEditorBackground", 3],
    ["notebook.inactiveFocusedCellBorder", "notebook.cellEditorBackground", 3],
    ["terminal.ansiWhite", "terminal.background", 4.5],
    ["terminal.ansiBrightWhite", "terminal.background", 4.5],
    ["terminal.findMatchBorder", "terminal.background", 3],
    ["terminal.findMatchHighlightBorder", "terminal.background", 3],
  ];
  for (const terminalAnsiColorIdentifier of terminalAnsiColorIdentifiers) {
    const terminalAnsiContrast = contrastRatio(
      generatedTheme.colors[terminalAnsiColorIdentifier],
      generatedTheme.colors["terminal.background"]
    );
    if (terminalAnsiContrast < 4.5) {
      throw new Error(
        `${themePath}: ${terminalAnsiColorIdentifier} contrast ${terminalAnsiContrast.toFixed(2)}`
      );
    }
  }
  for (const [
    foregroundIdentifier,
    backgroundIdentifier,
    minimumContrast,
  ] of criticalWorkbenchContrastChecks) {
    const workbenchContrast = measureWorkbenchContrast(
      generatedTheme.colors,
      foregroundIdentifier,
      backgroundIdentifier
    );
    if (workbenchContrast < minimumContrast) {
      throw new Error(
        `${themePath}: ${foregroundIdentifier} contrast ${workbenchContrast.toFixed(2)}`
      );
    }
  }
  validateReadableThemeMatrix(themePath, generatedTheme);
}

console.log(`Validated ${shippedThemes.length} themes.`);
