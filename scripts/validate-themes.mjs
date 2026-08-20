import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const canonicalThemeVariants = [
  { appearance: "dark", contrast: "soft", expectedBackground: "#333c43" },
  { appearance: "dark", contrast: "medium", expectedBackground: "#2d353b" },
  { appearance: "dark", contrast: "hard", expectedBackground: "#272e33" },
  { appearance: "light", contrast: "soft", expectedBackground: "#f3ead3" },
  { appearance: "light", contrast: "medium", expectedBackground: "#fdf6e3" },
  { appearance: "light", contrast: "hard", expectedBackground: "#fffbef" },
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
  "terminal.ansiGreen",
  "terminal.background",
  "testing.iconFailed",
  "testing.iconPassed",
  "titleBar.activeBackground",
  "menu.foreground",
];

const requiredSemanticTokens = [
  "class",
  "comment",
  "decorator",
  "enum",
  "enumMember",
  "event",
  "function",
  "interface",
  "label",
  "macro",
  "method",
  "namespace",
  "number",
  "operator",
  "parameter",
  "property",
  "regexp",
  "string",
  "struct",
  "type",
  "typeParameter",
  "variable",
];

const requiredSyntaxScopes = [
  "comment",
  "constant.numeric",
  "entity.name.function",
  "entity.name.tag.html",
  "keyword",
  "markup.bold",
  "markup.fenced_code.block.markdown",
  "storage.type.rust",
  "string",
  "support.type.property-name.css",
  "variable",
];

const extensionManifest = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const repositoryDirectory = resolve(".");
const contributedThemesByPath = new Map(
  extensionManifest.contributes.themes.map((themeContribution) => [
    themeContribution.path.replace(/^\.\//, ""),
    themeContribution,
  ])
);

function rgbChannelsFromHexColor(hexColor) {
  const hexColorMatch = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(hexColor);
  if (!hexColorMatch) throw new Error(`Invalid color: ${hexColor}`);
  const rgbHexadecimalDigits = hexColorMatch[1];
  return [0, 2, 4].map((channelOffset) =>
    Number.parseInt(rgbHexadecimalDigits.slice(channelOffset, channelOffset + 2), 16)
  );
}

function relativeLuminance(hexColor) {
  const channelWeights = [0.2126, 0.7152, 0.0722];
  return rgbChannelsFromHexColor(hexColor)
    .map((channel) => channel / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce(
      (luminance, channel, channelIndex) => luminance + channel * channelWeights[channelIndex],
      0
    );
}

function contrastRatio(foregroundColor, backgroundColor) {
  const lighterLuminance = Math.max(
    relativeLuminance(foregroundColor),
    relativeLuminance(backgroundColor)
  );
  const darkerLuminance = Math.min(
    relativeLuminance(foregroundColor),
    relativeLuminance(backgroundColor)
  );
  return (lighterLuminance + 0.05) / (darkerLuminance + 0.05);
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
  for (const colorIdentifier of requiredWorkbenchColors) {
    if (!(colorIdentifier in generatedTheme.colors)) {
      throw new Error(`${themePath}: missing ${colorIdentifier}`);
    }
  }
  for (const semanticTokenIdentifier of requiredSemanticTokens) {
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
    rgbChannelsFromHexColor(generatedThemeColor);
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
    ["chat.slashCommandForeground", "chat.slashCommandBackground", 4.5],
    ["focusBorder", "editor.background", 3],
    ["activityBar.activeFocusBorder", "activityBar.background", 3],
    ["activityBar.activeBorder", "activityBar.background", 3],
    ["commandCenter.activeBorder", "commandCenter.background", 3],
    ["editorBracketMatch.border", "editor.background", 3],
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
  ];
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
