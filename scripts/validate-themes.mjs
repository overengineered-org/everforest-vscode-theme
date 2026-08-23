import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import themeManifest from "../test/support/theme-manifest.cjs";
import { contrastRatio, validateHexColor } from "./color-contrast.mjs";

const { requiredSemanticTokenIdentifiers, requiredSyntaxScopes } = themeManifest;

const canonicalThemeVariants = [
  { appearance: "dark", contrast: "soft", expectedBackground: "#333c43" },
  { appearance: "dark", contrast: "medium", expectedBackground: "#2d353b" },
  { appearance: "dark", contrast: "hard", expectedBackground: "#272e33" },
  { appearance: "light", contrast: "soft", expectedBackground: "#f3ead3" },
  { appearance: "light", contrast: "medium", expectedBackground: "#fdf6e3" },
  { appearance: "light", contrast: "hard", expectedBackground: "#fffbef" },
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

const requiredWorkbenchColors = [
  "activityBar.background",
  "activityBar.activeFocusBorder",
  "agentSessionReadIndicator.foreground",
  "agentSessionSelectedBadge.border",
  "agentSessionSelectedUnfocusedBadge.border",
  "agentStatusIndicator.background",
  "aiCustomizationManagement.sashBorder",
  "button.background",
  "breadcrumb.foreground",
  "charts.green",
  "chat.requestBackground",
  "commandCenter.background",
  "commandCenter.activeBorder",
  "debugToolBar.background",
  "diffEditor.insertedTextBackground",
  "diffEditor.removedTextBackground",
  "editor.background",
  "editor.foreground",
  "editor.findMatchBackground",
  "editor.findMatchBorder",
  "editor.findMatchHighlightBackground",
  "editor.findMatchHighlightBorder",
  "editorError.foreground",
  "editorGutter.background",
  "editorHint.foreground",
  "editorInfo.foreground",
  "editorWidget.background",
  "editorWarning.foreground",
  "gitDecoration.addedResourceForeground",
  "gitDecoration.modifiedResourceForeground",
  "inlineChat.background",
  "inlineChatInput.focusBorder",
  "interactive.activeCodeBorder",
  "inputOption.activeBorder",
  "inputValidation.errorBackground",
  "inputValidation.errorForeground",
  "inputValidation.infoBackground",
  "inputValidation.infoForeground",
  "inputValidation.warningBackground",
  "inputValidation.warningForeground",
  "keybindingLabel.background",
  "list.activeSelectionBackground",
  "menu.background",
  "merge.currentHeaderBackground",
  "minimap.selectionHighlight",
  "minimap.errorHighlight",
  "multiDiffEditor.background",
  "notebook.cellEditorBackground",
  "notebook.focusedCellBorder",
  "notebook.focusedEditorBorder",
  "notebook.focusedRowBorder",
  "notebook.inactiveFocusedCellBorder",
  "notificationCenterHeader.background",
  "panel.background",
  "panel.border",
  "panelSectionHeader.background",
  "panelSectionHeader.border",
  "panelSectionHeader.foreground",
  "peekViewEditor.background",
  "ports.iconRunningProcessForeground",
  "panelTitle.activeBorder",
  "sash.hoverBorder",
  "settings.headerForeground",
  "sideBar.background",
  "sideBar.foreground",
  "sideBarSectionHeader.foreground",
  "sideBarTitle.foreground",
  "statusBar.background",
  "statusBar.foreground",
  "statusBar.noFolderForeground",
  "statusBarItem.remoteForeground",
  "tab.activeBackground",
  "tab.activeBorder",
  ...terminalAnsiColorIdentifiers,
  "terminal.background",
  "terminal.border",
  "terminal.foreground",
  "terminal.selectionBackground",
  "terminal.inactiveSelectionBackground",
  "terminal.findMatchBackground",
  "terminal.findMatchBorder",
  "terminal.findMatchHighlightBackground",
  "terminal.findMatchHighlightBorder",
  "terminal.hoverHighlightBackground",
  "terminal.tab.activeBorder",
  "terminalCommandDecoration.defaultBackground",
  "terminalCommandDecoration.errorBackground",
  "terminalCommandDecoration.successBackground",
  "terminalStickyScroll.background",
  "terminalStickyScroll.border",
  "terminalStickyScrollHover.background",
  "terminalOverviewRuler.border",
  "testing.iconFailed",
  "testing.iconPassed",
  "titleBar.activeBackground",
  "menu.foreground",
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

for (const { appearance, contrast, expectedBackground } of canonicalThemeVariants) {
  const themePath = resolve(
    "themes",
    `everforest-complete-${appearance}-${contrast}-color-theme.json`
  );
  const generatedTheme = JSON.parse(readFileSync(themePath, "utf8"));
  const displayAppearance = appearance === "dark" ? "Dark" : "Light";
  const displayContrast = `${contrast.charAt(0).toUpperCase()}${contrast.slice(1)}`;
  const expectedName = `Everforest Complete ${displayAppearance} ${displayContrast}`;
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
  for (const colorIdentifier of requiredWorkbenchColors) {
    if (!(colorIdentifier in generatedTheme.colors)) {
      throw new Error(`${themePath}: missing ${colorIdentifier}`);
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
  const criticalWorkbenchContrastChecks = [
    ["sideBar.foreground", "sideBar.background", 4.5],
    ["sideBarTitle.foreground", "sideBar.background", 4.5],
    ["sideBarSectionHeader.foreground", "sideBar.background", 4.5],
    ["statusBar.foreground", "statusBar.background", 4.5],
    ["statusBar.noFolderForeground", "statusBar.noFolderBackground", 4.5],
    ["statusBarItem.remoteForeground", "statusBarItem.remoteBackground", 4.5],
    ["menu.foreground", "menu.background", 4.5],
    ["titleBar.activeForeground", "titleBar.activeBackground", 4.5],
    ["settings.headerForeground", "editor.background", 4.5],
    ["breadcrumb.foreground", "editor.background", 4.5],
    ["textLink.foreground", "editor.background", 4.5],
    ["editorLink.activeForeground", "editor.background", 4.5],
    ["editorSuggestWidget.highlightForeground", "editorSuggestWidget.background", 4.5],
    ["notificationLink.foreground", "notifications.background", 4.5],
    ["terminal.ansiGreen", "terminal.background", 4.5],
    ["terminal.ansiBrightGreen", "terminal.background", 4.5],
    ["terminal.foreground", "terminal.background", 4.5],
    ["panelSectionHeader.foreground", "panelSectionHeader.background", 4.5],
    ["inputValidation.errorForeground", "inputValidation.errorBackground", 4.5],
    ["inputValidation.infoForeground", "inputValidation.infoBackground", 4.5],
    ["inputValidation.warningForeground", "inputValidation.warningBackground", 4.5],
    ["chat.slashCommandForeground", "chat.slashCommandBackground", 4.5],
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
    ["notebook.focusedRowBorder", "notebook.cellEditorBackground", 3],
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
    const workbenchContrast = contrastRatio(
      generatedTheme.colors[foregroundIdentifier],
      generatedTheme.colors[backgroundIdentifier]
    );
    if (workbenchContrast < minimumContrast) {
      throw new Error(
        `${themePath}: ${foregroundIdentifier} contrast ${workbenchContrast.toFixed(2)}`
      );
    }
  }
}

console.log(`Validated ${canonicalThemeVariants.length} themes.`);
