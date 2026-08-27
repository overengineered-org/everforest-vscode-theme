/*---------------------------------------------------------------------------------------------
 *  Homepage:   https://github.com/sainnhe/everforest-vscode
 *  Copyright:  2020 Sainnhe Park <i@sainnhe.dev>
 *  License:    MIT
 *--------------------------------------------------------------------------------------------*/

import { Palette, ThemeAppearance } from "../interface";
import documentedWorkbenchColorContract from "./documented-workbench-colors.json";

type SemanticStatusColorName = "red" | "yellow" | "green" | "blue";

const brightAccentForeground = "#1b2024";

function semanticStatusColorNameForWorkbenchIdentifier(
  workbenchColorIdentifier: string
): SemanticStatusColorName | undefined {
  const normalizedIdentifier = workbenchColorIdentifier.toLowerCase();
  if (
    /(error|failed|deleted|removed|uncovered|unhandled|invalid|stopped)/.test(normalizedIdentifier)
  ) {
    return "red";
  }
  if (/(warning|conflict|untracked)/.test(normalizedIdentifier)) return "yellow";
  if (/(success|passed|added|inserted|covered)/.test(normalizedIdentifier)) return "green";
  if (/(info|modified|remote|link)/.test(normalizedIdentifier)) return "blue";
  return undefined;
}

function pairedWorkbenchColorIdentifier(
  workbenchColorIdentifier: string,
  sourceSuffix: "Foreground" | "Background",
  pairedSuffix: "Foreground" | "Background"
): string | undefined {
  if (workbenchColorIdentifier.endsWith(sourceSuffix)) {
    return `${workbenchColorIdentifier.slice(0, -sourceSuffix.length)}${pairedSuffix}`;
  }
  const dottedSourceSuffix = `.${sourceSuffix.toLowerCase()}`;
  if (workbenchColorIdentifier.endsWith(dottedSourceSuffix)) {
    return `${workbenchColorIdentifier.slice(0, -dottedSourceSuffix.length)}.${pairedSuffix.toLowerCase()}`;
  }
  return undefined;
}

function createDocumentedWorkbenchColorFallbacks(
  palette: Palette,
  appearance: ThemeAppearance
): Record<string, string> {
  const numberedAccentColors = [
    palette.red,
    palette.orange,
    palette.yellow,
    palette.green,
    palette.aqua,
    palette.blue,
  ];
  const transparentWorkbenchColor = `${palette.bg}00`;
  const { disabledWorkbenchForeground, primaryWorkbenchForeground, secondaryWorkbenchForeground } =
    getWorkbenchForegroundColors(appearance, palette);
  const readableWorkbenchAccentColors = getReadableWorkbenchAccentColors(appearance, palette);
  const documentedWorkbenchColorIdentifiers = new Set(documentedWorkbenchColorContract.identifiers);

  return Object.fromEntries(
    documentedWorkbenchColorContract.identifiers.map((workbenchColorIdentifier) => {
      const normalizedIdentifier = workbenchColorIdentifier.toLowerCase();
      const semanticStatusColorName =
        semanticStatusColorNameForWorkbenchIdentifier(workbenchColorIdentifier);
      const semanticStatusBackgroundColor = semanticStatusColorName
        ? palette[semanticStatusColorName]
        : undefined;
      const semanticStatusForegroundColor = semanticStatusColorName
        ? readableWorkbenchAccentColors[semanticStatusColorName]
        : undefined;
      const numberedColorIndex = Number.parseInt(
        /([1-6])$/.exec(workbenchColorIdentifier)?.[1] ?? "",
        10
      );
      const pairedBackgroundIdentifier = pairedWorkbenchColorIdentifier(
        workbenchColorIdentifier,
        "Foreground",
        "Background"
      );
      const pairedForegroundIdentifier = pairedWorkbenchColorIdentifier(
        workbenchColorIdentifier,
        "Background",
        "Foreground"
      );

      if (
        workbenchColorIdentifier === "contrastActiveBorder" ||
        workbenchColorIdentifier === "contrastBorder"
      ) {
        return [workbenchColorIdentifier, transparentWorkbenchColor];
      }
      if (
        Number.isInteger(numberedColorIndex) &&
        /(scmgraph\.foreground|editorbracketpairguide)/.test(normalizedIdentifier)
      ) {
        const numberedAccentColor = numberedAccentColors[numberedColorIndex - 1] ?? palette.fg;
        let numberedGuideOpacity = "ff";
        if (normalizedIdentifier.includes("background")) {
          numberedGuideOpacity = normalizedIdentifier.includes("active") ? "70" : "30";
        }
        return [workbenchColorIdentifier, `${numberedAccentColor}${numberedGuideOpacity}`];
      }
      if (normalizedIdentifier.includes("shadow")) {
        return [workbenchColorIdentifier, palette.shadow];
      }
      if (normalizedIdentifier.includes("background")) {
        if (semanticStatusBackgroundColor) {
          const hasPairedForeground =
            pairedForegroundIdentifier !== undefined &&
            documentedWorkbenchColorIdentifiers.has(pairedForegroundIdentifier);
          return [
            workbenchColorIdentifier,
            hasPairedForeground
              ? semanticStatusBackgroundColor
              : `${semanticStatusBackgroundColor}30`,
          ];
        }
        const usesInteractiveStateBackground =
          /(focus|hover|selected)/.test(normalizedIdentifier) ||
          (normalizedIdentifier.includes("active") && !normalizedIdentifier.includes("inactive"));
        if (usesInteractiveStateBackground) {
          return [workbenchColorIdentifier, `${palette.bg4}${appearance === "dark" ? "80" : "60"}`];
        }
        return [workbenchColorIdentifier, palette.bg1];
      }
      if (/(border|outline|separator|stroke|ruler)/.test(normalizedIdentifier)) {
        return [workbenchColorIdentifier, semanticStatusBackgroundColor ?? palette.bg4];
      }
      if (semanticStatusForegroundColor) {
        const hasPairedBackground =
          pairedBackgroundIdentifier !== undefined &&
          documentedWorkbenchColorIdentifiers.has(pairedBackgroundIdentifier);
        return [
          workbenchColorIdentifier,
          hasPairedBackground ? brightAccentForeground : semanticStatusForegroundColor,
        ];
      }
      if (normalizedIdentifier.includes("disabled")) {
        return [workbenchColorIdentifier, disabledWorkbenchForeground];
      }
      if (/(inactive|placeholder|deemphasized)/.test(normalizedIdentifier)) {
        return [workbenchColorIdentifier, secondaryWorkbenchForeground];
      }
      return [workbenchColorIdentifier, primaryWorkbenchForeground];
    })
  );
}

function getWorkbenchForegroundColors(appearance: ThemeAppearance, palette: Palette) {
  return {
    activeWorkbenchForeground: appearance === "light" ? "#2d353b" : palette.fg,
    disabledWorkbenchForeground: appearance === "light" ? palette.grey1 : palette.grey0,
    primaryWorkbenchForeground: appearance === "light" ? "#59646c" : palette.fg,
    secondaryWorkbenchForeground: appearance === "light" ? "#59646c" : palette.grey2,
  };
}

function getReadableWorkbenchAccentColors(appearance: ThemeAppearance, palette: Palette) {
  if (appearance === "dark") {
    return {
      black: palette.grey2,
      brightBlack: palette.fg,
      blue: palette.blue,
      cyan: palette.aqua,
      green: palette.green,
      magenta: palette.purple,
      orange: palette.orange,
      red: palette.red,
      white: palette.fg,
      yellow: palette.yellow,
    };
  }
  return {
    black: "#59646c",
    brightBlack: "#59646c",
    blue: "#2e5f94",
    cyan: "#2f6a4d",
    green: "#596600",
    magenta: "#8a4b7c",
    orange: "#984b00",
    red: "#ad3d3d",
    white: "#59646c",
    yellow: "#7e5200",
  };
}

export function createWorkbenchColors(palette: Palette, appearance: ThemeAppearance) {
  const accentForeground = appearance === "dark" ? palette.bg : "#2d353b";
  const {
    activeWorkbenchForeground,
    disabledWorkbenchForeground,
    primaryWorkbenchForeground,
    secondaryWorkbenchForeground,
  } = getWorkbenchForegroundColors(appearance, palette);
  const readableWorkbenchAccentColors = getReadableWorkbenchAccentColors(appearance, palette);
  const accessibleAccentGreen = readableWorkbenchAccentColors.green;
  const accessibleBlueForeground = readableWorkbenchAccentColors.blue;
  const editorSelectionBackgroundColor = `${palette.bg4}${appearance === "dark" ? "c0" : "a0"}`;
  const editorSelectionHighlightColor = `${palette.bg4}${appearance === "dark" ? "60" : "50"}`;
  const resolvedCommentIndicator = appearance === "dark" ? palette.grey2 : "#59646c";
  const unresolvedCommentIndicator = accessibleBlueForeground;
  const cursorForeground = palette.fg;
  const diagnosticBackgroundOpacity = "00";
  const workbenchColors: Record<string, string> = {
    ...createDocumentedWorkbenchColorFallbacks(palette, appearance),
    foreground: primaryWorkbenchForeground,
    focusBorder: palette.fg,
    "widget.shadow": palette.shadow,
    "selection.background": `${palette.bg4}${appearance === "dark" ? "e0" : "c0"}`,
    disabledForeground: disabledWorkbenchForeground,
    descriptionForeground: secondaryWorkbenchForeground,
    errorForeground: readableWorkbenchAccentColors.red,
    "icon.foreground": primaryWorkbenchForeground,
    "textLink.foreground": accessibleAccentGreen,
    "textLink.activeForeground": `${accessibleAccentGreen}c0`,
    "textCodeBlock.background": palette.bg1,
    "textBlockQuote.background": palette.bg1,
    "textBlockQuote.border": palette.bg4,
    "textPreformat.foreground": readableWorkbenchAccentColors.yellow,
    "toolbar.hoverBackground": palette.bg2,
    "button.background": palette.badge,
    "button.hoverBackground": `${palette.badge}d0`,
    "button.foreground": accentForeground,
    "button.secondaryBackground": palette.bg3,
    "button.secondaryForeground": primaryWorkbenchForeground,
    "button.secondaryHoverBackground": palette.bg4,
    "checkbox.background": palette.bg,
    "checkbox.foreground": readableWorkbenchAccentColors.orange,
    "checkbox.border": palette.bg5,
    "dropdown.border": palette.bg5,
    "dropdown.background": palette.bg,
    "dropdown.foreground": primaryWorkbenchForeground,
    "input.border": palette.bg5,
    "input.background": `${palette.bg}00`,
    "input.foreground": primaryWorkbenchForeground,
    "input.placeholderForeground": secondaryWorkbenchForeground,
    "inputOption.activeBorder": palette.fg,
    "inputValidation.errorBorder": readableWorkbenchAccentColors.red,
    "inputValidation.errorBackground": palette.bg2,
    "inputValidation.errorForeground": primaryWorkbenchForeground,
    "inputValidation.infoBorder": readableWorkbenchAccentColors.blue,
    "inputValidation.infoBackground": palette.bg2,
    "inputValidation.infoForeground": primaryWorkbenchForeground,
    "inputValidation.warningBorder": readableWorkbenchAccentColors.yellow,
    "inputValidation.warningBackground": palette.bg2,
    "inputValidation.warningForeground": primaryWorkbenchForeground,
    "scrollbar.shadow": palette.shadow,
    "scrollbarSlider.activeBackground": palette.grey2,
    "scrollbarSlider.hoverBackground": palette.bg5,
    "scrollbarSlider.background": `${palette.bg5}80`,
    "badge.background": palette.badge,
    "badge.foreground": accentForeground,
    "progressBar.background": palette.badge,
    "list.activeSelectionForeground": activeWorkbenchForeground,
    "list.activeSelectionBackground": `${palette.bg4}80`,
    "list.inactiveSelectionForeground": secondaryWorkbenchForeground,
    "list.inactiveSelectionBackground": `${palette.bg4}80`,
    "list.dropBackground": `${palette.bg2}80`,
    "list.focusForeground": activeWorkbenchForeground,
    "list.focusBackground": `${palette.bg4}80`,
    "list.inactiveFocusBackground": `${palette.bg4}60`,
    "list.highlightForeground": accessibleAccentGreen,
    "list.hoverForeground": activeWorkbenchForeground,
    "list.hoverBackground": `${palette.bg}00`,
    "list.invalidItemForeground": readableWorkbenchAccentColors.red,
    "list.errorForeground": readableWorkbenchAccentColors.red,
    "list.warningForeground": readableWorkbenchAccentColors.yellow,
    "tree.indentGuidesStroke": palette.grey0,
    "activityBar.border": palette.bg4,
    "activityBar.background": palette.bg1,
    "activityBar.foreground": activeWorkbenchForeground,
    "activityBar.inactiveForeground": secondaryWorkbenchForeground,
    "activityBar.activeBorder": `${accessibleAccentGreen}d0`,
    "activityBar.activeFocusBorder": palette.fg,
    "activityBarBadge.background": palette.badge,
    "activityBarBadge.foreground": accentForeground,
    "sideBar.foreground": primaryWorkbenchForeground,
    "sideBar.background": palette.bg1,
    "sideBarSectionHeader.background": `${palette.bg}00`,
    "sideBarTitle.foreground": activeWorkbenchForeground,
    "sideBarSectionHeader.foreground": primaryWorkbenchForeground,
    "minimap.findMatchHighlight": `${palette.dimAqua}60`,
    "minimap.selectionHighlight": `${palette.bg5}f0`,
    "minimap.selectionOccurrenceHighlight": editorSelectionHighlightColor,
    "minimap.chatEditHighlight": `${accessibleAccentGreen}${appearance === "dark" ? "99" : "80"}`,
    "minimap.errorHighlight": `${palette.dimRed}80`,
    "minimap.warningHighlight": `${palette.dimYellow}80`,
    "minimapGutter.addedBackground": `${palette.dimGreen}a0`,
    "minimapGutter.modifiedBackground": `${palette.dimBlue}a0`,
    "minimapGutter.deletedBackground": `${palette.dimRed}a0`,
    "editorGroup.border": palette.bg4,
    "editorGroupHeader.tabsBackground": palette.bg1,
    "editorGroupHeader.noTabsBackground": palette.bg1,
    "editorGroup.dropBackground": `${palette.bg5}60`,
    "tab.border": palette.bg4,
    "tab.activeBorder": accessibleAccentGreen,
    "tab.inactiveBackground": palette.bg1,
    "tab.hoverBackground": palette.bg2,
    "tab.hoverForeground": activeWorkbenchForeground,
    "tab.activeBackground": palette.bg,
    "tab.activeForeground": activeWorkbenchForeground,
    "tab.inactiveForeground": secondaryWorkbenchForeground,
    "tab.unfocusedActiveForeground": secondaryWorkbenchForeground,
    "tab.unfocusedActiveBorder": palette.bg4,
    "tab.unfocusedInactiveForeground": secondaryWorkbenchForeground,
    "tab.unfocusedHoverForeground": activeWorkbenchForeground,
    "tab.lastPinnedBorder": `${palette.badge}d0`,
    "editor.background": palette.bg,
    "editor.foreground": palette.fg,
    "editorLineNumber.foreground": `${palette.grey0}a0`,
    "editorLineNumber.activeForeground": `${palette.grey2}e0`,
    "editorCursor.foreground": cursorForeground,
    "editor.selectionBackground": editorSelectionBackgroundColor,
    "editor.selectionHighlightBackground": editorSelectionHighlightColor,
    "editor.inactiveSelectionBackground": editorSelectionHighlightColor,
    "editor.wordHighlightBackground":
      appearance === "dark" ? `${palette.bg4}58` : `${palette.bg4}48`,
    "editor.wordHighlightStrongBackground":
      appearance === "dark" ? `${palette.bg4}b0` : `${palette.bg4}90`,
    "editor.wordHighlightTextBackground":
      appearance === "dark" ? `${palette.bg4}58` : `${palette.bg4}48`,
    "editor.hoverHighlightBackground":
      appearance === "dark" ? `${palette.bg4}b0` : `${palette.bg4}90`,
    "editor.findMatchBackground": `${palette.dimOrange}40`,
    "editor.findMatchBorder": palette.fg,
    "editor.findMatchHighlightBackground": `${palette.dimGreen}40`,
    "editor.findMatchHighlightBorder": accessibleAccentGreen,
    "editor.findRangeHighlightBackground": editorSelectionHighlightColor,
    "editor.lineHighlightBorder": `${palette.bg5}00`,
    "editor.lineHighlightBackground":
      appearance === "dark" ? `${palette.bg3}90` : `${palette.bg3}70`,
    "editor.rangeHighlightBackground": `${palette.bg3}80`,
    "editor.symbolHighlightBackground": `${palette.dimBlue}40`,
    "editorLink.activeForeground": accessibleAccentGreen,
    "editorWhitespace.foreground": palette.bg4,
    "editorIndentGuide.background": `${palette.grey2}20`,
    "editorIndentGuide.activeBackground": `${palette.grey2}50`,
    "editorInlayHint.background": `${palette.bg}00`,
    "editorInlayHint.foreground": `${palette.grey0}a0`,
    "editorInlayHint.typeBackground": `${palette.bg}00`,
    "editorInlayHint.typeForeground": `${palette.grey0}a0`,
    "editorInlayHint.parameterBackground": `${palette.bg}00`,
    "editorInlayHint.parameterForeground": `${palette.grey0}a0`,
    "editorRuler.foreground": `${palette.bg4}a0`,
    "editorCodeLens.foreground": `${palette.grey0}a0`,
    "editor.foldBackground": `${palette.bg5}80`,
    "editorBracketMatch.border": palette.fg,
    "editorBracketMatch.background": palette.bg5,
    "editorBracketHighlight.foreground1": palette.red,
    "editorBracketHighlight.foreground2": palette.yellow,
    "editorBracketHighlight.foreground3": palette.green,
    "editorBracketHighlight.foreground4": palette.blue,
    "editorBracketHighlight.foreground5": palette.orange,
    "editorBracketHighlight.foreground6": palette.purple,
    "editorBracketHighlight.unexpectedBracket.foreground": palette.grey1,
    "editorOverviewRuler.border": `${palette.bg}00`,
    "editorOverviewRuler.findMatchForeground": `${palette.dimAqua}a0`,
    "editorOverviewRuler.rangeHighlightForeground": `${palette.dimAqua}a0`,
    "editorOverviewRuler.selectionHighlightForeground": `${palette.dimAqua}a0`,
    "editorOverviewRuler.wordHighlightForeground": `${palette.bg5}a0`,
    "editorOverviewRuler.wordHighlightStrongForeground": `${palette.bg5}a0`,
    "editorOverviewRuler.wordHighlightTextForeground": `${palette.bg5}a0`,
    "editorOverviewRuler.modifiedForeground": `${palette.dimBlue}a0`,
    "editorOverviewRuler.addedForeground": `${palette.dimGreen}a0`,
    "editorOverviewRuler.deletedForeground": `${palette.dimRed}a0`,
    "editorOverviewRuler.errorForeground": palette.red,
    "editorOverviewRuler.warningForeground": palette.yellow,
    "editorOverviewRuler.infoForeground": palette.purple,
    "editorOverviewRuler.currentContentForeground": palette.dimBlue,
    "editorOverviewRuler.incomingContentForeground": palette.dimAqua,
    "editorOverviewRuler.commonContentForeground": palette.grey1,
    "problemsErrorIcon.foreground": readableWorkbenchAccentColors.red,
    "problemsWarningIcon.foreground": readableWorkbenchAccentColors.yellow,
    "problemsInfoIcon.foreground": readableWorkbenchAccentColors.blue,
    "editorUnnecessaryCode.border": palette.bg,
    "editorUnnecessaryCode.opacity": `#00000080`,
    "editorError.foreground": readableWorkbenchAccentColors.red,
    "editorWarning.foreground": readableWorkbenchAccentColors.yellow,
    "editorInfo.foreground": readableWorkbenchAccentColors.blue,
    "editorHint.foreground": palette.dimPurple,
    "editorError.background": `${palette.dimRed}${diagnosticBackgroundOpacity}`,
    "editorWarning.background": `${palette.dimYellow}${diagnosticBackgroundOpacity}`,
    "editorInfo.background": `${palette.dimBlue}${diagnosticBackgroundOpacity}`,
    "editorGutter.background": `${palette.bg}00`,
    "editorGutter.modifiedBackground": `${palette.dimBlue}a0`,
    "editorGutter.addedBackground": `${palette.dimGreen}a0`,
    "editorGutter.deletedBackground": `${palette.dimRed}a0`,
    "editorGutter.commentRangeForeground": palette.grey0,
    "editorCommentsWidget.resolvedBorder": resolvedCommentIndicator,
    "editorCommentsWidget.unresolvedBorder": unresolvedCommentIndicator,
    "diffEditor.insertedTextBackground": `${palette.dimAqua}30`,
    "diffEditor.removedTextBackground": `${palette.dimRed}30`,
    "diffEditor.diagonalFill": palette.bg5,
    "editorSuggestWidget.background": palette.bg3,
    "editorSuggestWidget.foreground": palette.fg,
    "editorSuggestWidget.highlightForeground":
      appearance === "light" ? accessibleAccentGreen : palette.fg,
    "editorSuggestWidget.selectedBackground": palette.bg4,
    "editorSuggestWidget.border": palette.bg3,
    "editorWidget.background": palette.bg,
    "editorWidget.foreground": palette.fg,
    "editorWidget.border": palette.bg5,
    "editorHoverWidget.background": palette.bg2,
    "editorHoverWidget.border": palette.bg4,
    "editorGhostText.background": `${palette.bg}00`,
    "editorGhostText.foreground": `${palette.grey0}a0`,
    "editorMarkerNavigation.background": palette.bg2,
    "editorMarkerNavigationError.background": `${palette.dimRed}80`,
    "editorMarkerNavigationWarning.background": `${palette.dimYellow}80`,
    "editorMarkerNavigationInfo.background": `${palette.dimBlue}80`,
    "peekView.border": palette.bg4,
    "peekViewEditor.background": palette.bg2,
    "peekViewEditor.matchHighlightBackground": `${palette.dimYellow}50`,
    "peekViewEditorGutter.background": palette.bg2,
    "peekViewResult.fileForeground": palette.fg,
    "peekViewResult.lineForeground": palette.grey2,
    "peekViewResult.matchHighlightBackground": `${palette.dimYellow}50`,
    "peekViewResult.selectionBackground": `${palette.dimAqua}50`,
    "peekViewResult.selectionForeground": palette.fg,
    "peekViewTitleDescription.foreground": palette.fg,
    "peekViewTitleLabel.foreground": palette.green,
    "peekViewResult.background": palette.bg2,
    "peekViewTitle.background": palette.bg4,
    "pickerGroup.border": `${palette.badge}1a`,
    "terminal.background": palette.bg1,
    "terminal.foreground": primaryWorkbenchForeground,
    "terminal.border": palette.bg4,
    "terminal.selectionBackground": editorSelectionBackgroundColor,
    "terminal.inactiveSelectionBackground": editorSelectionHighlightColor,
    "terminal.findMatchBackground": `${palette.dimOrange}60`,
    "terminal.findMatchBorder": palette.fg,
    "terminal.findMatchHighlightBackground": `${palette.dimGreen}40`,
    "terminal.findMatchHighlightBorder": accessibleAccentGreen,
    "terminal.hoverHighlightBackground": `${palette.dimAqua}50`,
    "terminal.tab.activeBorder": accessibleAccentGreen,
    "terminalCommandDecoration.defaultBackground": `${palette.dimBlue}80`,
    "terminalCommandDecoration.successBackground": `${palette.dimGreen}80`,
    "terminalCommandDecoration.errorBackground": `${palette.dimRed}80`,
    "terminalStickyScroll.background": palette.bg2,
    "terminalStickyScroll.border": palette.bg4,
    "terminalStickyScrollHover.background": palette.bg3,
    "terminalOverviewRuler.border": palette.bg4,
    "terminalCursor.foreground": cursorForeground,
    "terminal.ansiBlack": readableWorkbenchAccentColors.black,
    "terminal.ansiBlue": readableWorkbenchAccentColors.blue,
    "terminal.ansiBrightBlack": readableWorkbenchAccentColors.brightBlack,
    "terminal.ansiBrightBlue": readableWorkbenchAccentColors.blue,
    "terminal.ansiBrightCyan": readableWorkbenchAccentColors.cyan,
    "terminal.ansiBrightGreen": readableWorkbenchAccentColors.green,
    "terminal.ansiBrightMagenta": readableWorkbenchAccentColors.magenta,
    "terminal.ansiBrightRed": readableWorkbenchAccentColors.red,
    "terminal.ansiBrightWhite": readableWorkbenchAccentColors.white,
    "terminal.ansiBrightYellow": readableWorkbenchAccentColors.yellow,
    "terminal.ansiCyan": readableWorkbenchAccentColors.cyan,
    "terminal.ansiGreen": readableWorkbenchAccentColors.green,
    "terminal.ansiMagenta": readableWorkbenchAccentColors.magenta,
    "terminal.ansiRed": readableWorkbenchAccentColors.red,
    "terminal.ansiWhite": readableWorkbenchAccentColors.white,
    "terminal.ansiYellow": readableWorkbenchAccentColors.yellow,
    "debugToolBar.background": palette.bg,
    "debugTokenExpression.name": palette.blue,
    "debugTokenExpression.value": palette.green,
    "debugTokenExpression.string": palette.yellow,
    "debugTokenExpression.boolean": palette.purple,
    "debugTokenExpression.number": palette.purple,
    "debugTokenExpression.error": palette.red,
    "debugIcon.breakpointForeground": readableWorkbenchAccentColors.red,
    "debugIcon.breakpointDisabledForeground": palette.dimRed,
    "debugIcon.breakpointUnverifiedForeground": palette.grey2,
    "debugIcon.breakpointCurrentStackframeForeground": readableWorkbenchAccentColors.blue,
    "debugIcon.breakpointStackframeForeground": readableWorkbenchAccentColors.red,
    "debugIcon.startForeground": readableWorkbenchAccentColors.cyan,
    "debugIcon.pauseForeground": readableWorkbenchAccentColors.yellow,
    "debugIcon.stopForeground": readableWorkbenchAccentColors.red,
    "debugIcon.disconnectForeground": readableWorkbenchAccentColors.magenta,
    "debugIcon.restartForeground": readableWorkbenchAccentColors.cyan,
    "debugIcon.stepOverForeground": readableWorkbenchAccentColors.blue,
    "debugIcon.stepIntoForeground": readableWorkbenchAccentColors.blue,
    "debugIcon.stepOutForeground": readableWorkbenchAccentColors.blue,
    "debugIcon.continueForeground": readableWorkbenchAccentColors.blue,
    "debugIcon.stepBackForeground": readableWorkbenchAccentColors.blue,
    "debugConsole.infoForeground": accessibleAccentGreen,
    "debugConsole.warningForeground": readableWorkbenchAccentColors.yellow,
    "debugConsole.errorForeground": readableWorkbenchAccentColors.red,
    "debugConsole.sourceForeground": readableWorkbenchAccentColors.magenta,
    "debugConsoleInputIcon.foreground": readableWorkbenchAccentColors.cyan,
    "debugView.valueChangedHighlight": accessibleBlueForeground,
    "merge.incomingHeaderBackground": `${palette.dimAqua}80`,
    "merge.incomingContentBackground": `${palette.dimAqua}40`,
    "merge.currentHeaderBackground": `${palette.dimBlue}80`,
    "merge.currentContentBackground": `${palette.dimBlue}40`,
    "merge.commonHeaderBackground": `${palette.bg4}80`,
    "merge.commonContentBackground": `${palette.bg4}40`,
    "merge.border": `${palette.bg}00`,
    "panel.background": palette.bg1,
    "panel.border": palette.bg4,
    "panelInput.border": palette.bg5,
    "panelTitle.activeForeground": activeWorkbenchForeground,
    "panelTitle.activeBorder": accessibleAccentGreen,
    "panelTitle.inactiveForeground": secondaryWorkbenchForeground,
    "panelSection.border": palette.bg4,
    "panelSectionHeader.background": palette.bg2,
    "panelSectionHeader.foreground": primaryWorkbenchForeground,
    "panelSectionHeader.border": palette.bg4,
    "statusBar.background": palette.bg1,
    "statusBar.foreground": primaryWorkbenchForeground,
    "statusBar.border": palette.bg4,
    "statusBar.debuggingForeground": brightAccentForeground,
    "statusBar.debuggingBackground": palette.orange,
    "statusBar.noFolderBackground": palette.bg1,
    "statusBar.noFolderForeground": primaryWorkbenchForeground,
    "statusBar.noFolderBorder": palette.bg4,
    "statusBarItem.hoverBackground": `${palette.bg4}a0`,
    "statusBarItem.activeBackground": `${palette.bg4}70`,
    "statusBarItem.prominentForeground": accentForeground,
    "statusBarItem.prominentBackground": palette.badge,
    "statusBarItem.prominentHoverBackground": `${palette.badge}d0`,
    "statusBarItem.remoteBackground": palette.blue,
    "statusBarItem.remoteForeground": brightAccentForeground,
    "statusBarItem.remoteHoverBackground": `${palette.blue}d0`,
    "statusBarItem.remoteHoverForeground": brightAccentForeground,
    "statusBarItem.errorBackground": palette.red,
    "statusBarItem.errorForeground": brightAccentForeground,
    "statusBarItem.errorHoverBackground": `${palette.red}d0`,
    "statusBarItem.errorHoverForeground": brightAccentForeground,
    "statusBarItem.warningBackground": palette.yellow,
    "statusBarItem.warningForeground": brightAccentForeground,
    "statusBarItem.warningHoverBackground": `${palette.yellow}d0`,
    "statusBarItem.warningHoverForeground": brightAccentForeground,
    "titleBar.activeBackground": palette.bg1,
    "titleBar.activeForeground": activeWorkbenchForeground,
    "titleBar.inactiveBackground": palette.bg1,
    "titleBar.inactiveForeground": secondaryWorkbenchForeground,
    "titleBar.border": palette.bg4,
    "menubar.selectionForeground": activeWorkbenchForeground,
    "menubar.selectionBackground": palette.bg2,
    "menubar.selectionBorder": palette.bg4,
    "menu.foreground": primaryWorkbenchForeground,
    "menu.background": palette.bg1,
    "menu.selectionForeground": activeWorkbenchForeground,
    "menu.selectionBackground": palette.bg3,
    "gitDecoration.addedResourceForeground": readableWorkbenchAccentColors.green,
    "gitDecoration.modifiedResourceForeground": readableWorkbenchAccentColors.blue,
    "gitDecoration.deletedResourceForeground": readableWorkbenchAccentColors.red,
    "gitDecoration.untrackedResourceForeground": readableWorkbenchAccentColors.yellow,
    "gitDecoration.ignoredResourceForeground": palette.bg5,
    "gitDecoration.conflictingResourceForeground": readableWorkbenchAccentColors.magenta,
    "gitDecoration.submoduleResourceForeground": readableWorkbenchAccentColors.orange,
    "gitDecoration.stageDeletedResourceForeground": readableWorkbenchAccentColors.cyan,
    "gitDecoration.stageModifiedResourceForeground": readableWorkbenchAccentColors.cyan,
    "gitDecoration.renamedResourceForeground": readableWorkbenchAccentColors.cyan,
    "scmGraph.historyItemRefColor": palette.blue,
    "scmGraph.historyItemRemoteRefColor": palette.purple,
    "scmGraph.historyItemBaseRefColor": palette.orange,
    "scmGraph.historyItemHoverLabelForeground": brightAccentForeground,
    "scmGraph.historyItemHoverAdditionsForeground": accessibleAccentGreen,
    "scmGraph.historyItemHoverDeletionsForeground": appearance === "dark" ? "#f8a0a0" : "#ad3d3d",
    "notificationCenterHeader.foreground": activeWorkbenchForeground,
    "notificationCenterHeader.background": palette.bg2,
    "notifications.foreground": primaryWorkbenchForeground,
    "notifications.background": palette.bg1,
    "notificationLink.foreground": accessibleAccentGreen,
    "notificationsErrorIcon.foreground": readableWorkbenchAccentColors.red,
    "notificationsWarningIcon.foreground": readableWorkbenchAccentColors.yellow,
    "notificationsInfoIcon.foreground": readableWorkbenchAccentColors.blue,
    "extensionButton.foreground": accentForeground,
    "extensionButton.background": palette.badge,
    "extensionButton.hoverBackground": `${palette.badge}d0`,
    "extensionButton.prominentForeground": accentForeground,
    "extensionButton.prominentBackground": palette.badge,
    "extensionButton.prominentHoverBackground": `${palette.badge}d0`,
    "extensionBadge.remoteBackground": palette.badge,
    "extensionBadge.remoteForeground": accentForeground,
    "extensionIcon.starForeground": readableWorkbenchAccentColors.cyan,
    "extensionIcon.verifiedForeground": readableWorkbenchAccentColors.green,
    "extensionIcon.preReleaseForeground": readableWorkbenchAccentColors.orange,
    "pickerGroup.foreground": primaryWorkbenchForeground,
    "quickInputTitle.background": palette.bg2,
    "keybindingLabel.background": `${palette.bg}00`,
    "keybindingLabel.foreground": primaryWorkbenchForeground,
    "keybindingLabel.border": palette.bg1,
    "keybindingLabel.bottomBorder": palette.bg0,
    "keybindingTable.headerBackground": palette.bg3,
    "keybindingTable.rowsBackground": palette.bg2,
    "settings.headerForeground": activeWorkbenchForeground,
    "settings.numberInputBackground": palette.bg,
    "settings.numberInputForeground": primaryWorkbenchForeground,
    "settings.numberInputBorder": palette.bg5,
    "settings.textInputBackground": palette.bg,
    "settings.textInputForeground": primaryWorkbenchForeground,
    "settings.textInputBorder": palette.bg5,
    "settings.checkboxBackground": palette.bg,
    "settings.checkboxForeground": readableWorkbenchAccentColors.orange,
    "settings.checkboxBorder": palette.bg5,
    "settings.dropdownBackground": palette.bg,
    "settings.dropdownForeground": primaryWorkbenchForeground,
    "settings.dropdownBorder": palette.bg5,
    "settings.modifiedItemIndicator": accessibleBlueForeground,
    "settings.focusedRowBackground": palette.bg2,
    "settings.rowHoverBackground": palette.bg2,
    "editorLightBulb.foreground": readableWorkbenchAccentColors.yellow,
    "editorLightBulbAutoFix.foreground": readableWorkbenchAccentColors.cyan,
    "welcomePage.progress.foreground": readableWorkbenchAccentColors.green,
    "welcomePage.tileHoverBackground": palette.bg3,
    "walkThrough.embeddedEditorBackground": palette.bg1,
    "breadcrumb.foreground": primaryWorkbenchForeground,
    "breadcrumb.focusForeground": activeWorkbenchForeground,
    "breadcrumb.activeSelectionForeground": activeWorkbenchForeground,
    "symbolIcon.colorForeground": primaryWorkbenchForeground,
    "symbolIcon.snippetForeground": primaryWorkbenchForeground,
    "symbolIcon.fieldForeground": primaryWorkbenchForeground,
    "symbolIcon.fileForeground": primaryWorkbenchForeground,
    "symbolIcon.folderForeground": primaryWorkbenchForeground,
    "symbolIcon.textForeground": primaryWorkbenchForeground,
    "symbolIcon.unitForeground": primaryWorkbenchForeground,
    "symbolIcon.keywordForeground": readableWorkbenchAccentColors.red,
    "symbolIcon.operatorForeground": readableWorkbenchAccentColors.orange,
    "symbolIcon.classForeground": readableWorkbenchAccentColors.yellow,
    "symbolIcon.eventForeground": readableWorkbenchAccentColors.yellow,
    "symbolIcon.interfaceForeground": readableWorkbenchAccentColors.yellow,
    "symbolIcon.structForeground": readableWorkbenchAccentColors.yellow,
    "symbolIcon.functionForeground": readableWorkbenchAccentColors.green,
    "symbolIcon.keyForeground": readableWorkbenchAccentColors.green,
    "symbolIcon.methodForeground": readableWorkbenchAccentColors.green,
    "symbolIcon.stringForeground": readableWorkbenchAccentColors.green,
    "symbolIcon.constantForeground": readableWorkbenchAccentColors.cyan,
    "symbolIcon.enumeratorMemberForeground": readableWorkbenchAccentColors.cyan,
    "symbolIcon.nullForeground": readableWorkbenchAccentColors.cyan,
    "symbolIcon.propertyForeground": readableWorkbenchAccentColors.cyan,
    "symbolIcon.typeParameterForeground": readableWorkbenchAccentColors.cyan,
    "symbolIcon.arrayForeground": readableWorkbenchAccentColors.blue,
    "symbolIcon.referenceForeground": readableWorkbenchAccentColors.blue,
    "symbolIcon.variableForeground": readableWorkbenchAccentColors.blue,
    "symbolIcon.booleanForeground": readableWorkbenchAccentColors.magenta,
    "symbolIcon.constructorForeground": readableWorkbenchAccentColors.magenta,
    "symbolIcon.enumeratorForeground": readableWorkbenchAccentColors.magenta,
    "symbolIcon.moduleForeground": readableWorkbenchAccentColors.magenta,
    "symbolIcon.namespaceForeground": readableWorkbenchAccentColors.magenta,
    "symbolIcon.numberForeground": readableWorkbenchAccentColors.magenta,
    "symbolIcon.objectForeground": readableWorkbenchAccentColors.magenta,
    "symbolIcon.packageForeground": readableWorkbenchAccentColors.magenta,
    "editor.snippetTabstopHighlightBackground": palette.bg3,
    "editor.snippetFinalTabstopHighlightBackground": `${palette.dimGreen}40`,
    "editor.snippetFinalTabstopHighlightBorder": palette.bg,
    "charts.red": readableWorkbenchAccentColors.red,
    "charts.orange": readableWorkbenchAccentColors.orange,
    "charts.yellow": readableWorkbenchAccentColors.yellow,
    "charts.green": readableWorkbenchAccentColors.green,
    "charts.blue": readableWorkbenchAccentColors.blue,
    "charts.purple": readableWorkbenchAccentColors.magenta,
    "charts.foreground": primaryWorkbenchForeground,
    "chart.line": accessibleBlueForeground,
    "chart.axis": `${primaryWorkbenchForeground}${appearance === "dark" ? "66" : "99"}`,
    "chart.guide": `${primaryWorkbenchForeground}33`,
    "ports.iconRunningProcessForeground": readableWorkbenchAccentColors.orange,
    "commentsView.resolvedIcon": resolvedCommentIndicator,
    "commentsView.unresolvedIcon": unresolvedCommentIndicator,
    "sash.hoverBorder": palette.fg,
    "notebook.cellBorderColor": palette.bg5,
    "notebook.cellStatusBarItemHoverBackground": palette.bg2,
    "notebook.focusedCellBackground": palette.bg,
    "notebook.cellHoverBackground": palette.bg,
    "notebook.outputContainerBackgroundColor": palette.bg1,
    "notebookStatusSuccessIcon.foreground": readableWorkbenchAccentColors.green,
    "notebookStatusErrorIcon.foreground": readableWorkbenchAccentColors.red,
    "notebookStatusRunningIcon.foreground": readableWorkbenchAccentColors.blue,
    "notebook.focusedCellBorder": palette.fg,
    "notebook.focusedEditorBorder": palette.fg,
    "notebook.selectedCellBorder": palette.bg5,
    "notebook.inactiveFocusedCellBorder": palette.fg,
    "notebook.cellToolbarSeparator": palette.bg5,
    "testing.iconFailed": readableWorkbenchAccentColors.red,
    "testing.iconErrored": readableWorkbenchAccentColors.red,
    "testing.iconPassed": readableWorkbenchAccentColors.cyan,
    "testing.runAction": readableWorkbenchAccentColors.cyan,
    "testing.iconQueued": readableWorkbenchAccentColors.blue,
    "testing.iconUnset": readableWorkbenchAccentColors.yellow,
    "testing.iconSkipped": readableWorkbenchAccentColors.magenta,
    // Extension-contributed colors: GitLens.
    "gitlens.gutterBackgroundColor": palette.bg,
    "gitlens.gutterForegroundColor": palette.fg,
    "gitlens.gutterUncommittedForegroundColor": palette.blue,
    "gitlens.trailingLineForegroundColor": palette.grey1,
    "gitlens.lineHighlightBackgroundColor": palette.bg2,
    "gitlens.lineHighlightOverviewRulerColor": accessibleAccentGreen,
    "gitlens.closedPullRequestIconColor": palette.red,
    "gitlens.openPullRequestIconColor": palette.aqua,
    "gitlens.mergedPullRequestIconColor": palette.purple,
    "gitlens.unpublishedChangesIconColor": palette.blue,
    "gitlens.unpublishedCommitIconColor": palette.yellow,
    "gitlens.unpulledChangesIconColor": palette.orange,
    "gitlens.decorations.addedForegroundColor": palette.green,
    "gitlens.decorations.copiedForegroundColor": palette.purple,
    "gitlens.decorations.deletedForegroundColor": palette.red,
    "gitlens.decorations.ignoredForegroundColor": palette.grey2,
    "gitlens.decorations.modifiedForegroundColor": palette.blue,
    "gitlens.decorations.untrackedForegroundColor": palette.yellow,
    "gitlens.decorations.renamedForegroundColor": palette.purple,
    "gitlens.decorations.branchAheadForegroundColor": palette.aqua,
    "gitlens.decorations.branchBehindForegroundColor": palette.orange,
    "gitlens.decorations.branchDivergedForegroundColor": palette.yellow,
    "gitlens.decorations.branchUpToDateForegroundColor": palette.fg,
    "gitlens.decorations.branchUnpublishedForegroundColor": palette.blue,
    "gitlens.decorations.branchMissingUpstreamForegroundColor": palette.red,
    // Extension-contributed colors: GitHub Pull Requests and Issues.
    "issues.open": palette.aqua,
    "issues.closed": palette.red,
    "commandCenter.foreground": primaryWorkbenchForeground,
    "commandCenter.activeForeground": palette.fg,
    "commandCenter.background": palette.bg1,
    "commandCenter.activeBackground": palette.bg2,
    "commandCenter.border": palette.bg4,
    "commandCenter.inactiveForeground": secondaryWorkbenchForeground,
    "commandCenter.inactiveBorder": palette.bg3,
    "commandCenter.activeBorder": palette.fg,
    "commandCenter.debuggingBackground": palette.dimOrange,
    "chat.requestBorder": palette.bg4,
    "chat.requestBackground": palette.bg1,
    "chat.slashCommandBackground": palette.bg2,
    "chat.slashCommandForeground": accessibleAccentGreen,
    "chat.avatarBackground": palette.badge,
    "chat.avatarForeground": accentForeground,
    "chat.editedFileForeground": palette.aqua,
    "chat.linesAddedForeground": accessibleAccentGreen,
    "chat.linesRemovedForeground": palette.red,
    "chat.requestCodeBorder": palette.bg4,
    "chat.requestBubbleBackground": palette.bg1,
    "chat.requestBubbleHoverBackground": palette.bg3,
    "chat.checkpointSeparator": palette.bg4,
    "chat.thinkingShimmer": palette.aqua,
    "chatManagement.sashBorder": palette.bg4,
    "agentSessionReadIndicator.foreground": accessibleAccentGreen,
    "agentSessionSelectedBadge.border": accessibleAccentGreen,
    "agentSessionSelectedUnfocusedBadge.border": palette.bg5,
    "agentStatusIndicator.background": palette.bg1,
    "aiCustomizationManagement.sashBorder": palette.bg4,
    "inlineChat.background": palette.bg1,
    "inlineChat.foreground": palette.fg,
    "inlineChat.border": palette.bg4,
    "inlineChat.shadow": palette.shadow,
    "inlineChatInput.border": palette.bg4,
    "inlineChatInput.focusBorder": palette.fg,
    "inlineChatInput.placeholderForeground": palette.grey1,
    "inlineChatInput.background": palette.bg,
    "inlineChatDiff.inserted": `${palette.dimGreen}40`,
    "inlineChatDiff.removed": `${palette.dimRed}40`,
    "interactive.activeCodeBorder": palette.fg,
    "interactive.inactiveCodeBorder": palette.bg4,
    "notebook.cellEditorBackground": palette.bg1,
    "multiDiffEditor.headerBackground": palette.bg1,
    "multiDiffEditor.background": palette.bg,
    "multiDiffEditor.border": palette.bg4,
  };
  return workbenchColors;
}

// vim: fdm=marker fmr={{{,}}}:
