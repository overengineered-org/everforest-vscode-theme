/*---------------------------------------------------------------------------------------------
 *  Homepage:   https://github.com/sainnhe/everforest-vscode
 *  Copyright:  2020 Sainnhe Park <i@sainnhe.dev>
 *  License:    MIT
 *--------------------------------------------------------------------------------------------*/

import {
  DiagnosticTextBackgroundOpacity,
  Palette,
  ThemeAppearance,
  ThemePaletteAccent,
  ThemePreferences,
} from "../interface";
import { getReadableTextPalette, ReadableTextPalette } from "../palette";
import documentedWorkbenchColorContract from "./documented-workbench-colors.json";

type SemanticStatusColorName = "red" | "yellow" | "green" | "blue";

const brightAccentForeground = "#1b2024";
const diagnosticOpacityAlpha: Record<DiagnosticTextBackgroundOpacity, string> = {
  "0%": "00",
  "12.5%": "20",
  "25%": "40",
  "37.5%": "60",
  "50%": "80",
};
const dimPaletteColorByAccent: Record<ThemePaletteAccent, keyof Palette> = {
  red: "dimRed",
  orange: "dimOrange",
  yellow: "dimYellow",
  green: "dimGreen",
  aqua: "dimAqua",
  blue: "dimBlue",
  purple: "dimPurple",
};

function configuredCursorColor(
  readableTextPalette: ReadableTextPalette,
  themePreferences: ThemePreferences
): string {
  if (themePreferences.cursorColor === "white") {
    return themePreferences.appearance === "dark"
      ? readableTextPalette.invertedText
      : readableTextPalette.fg;
  }
  if (themePreferences.cursorColor === "black") {
    return themePreferences.appearance === "dark"
      ? readableTextPalette.fg
      : readableTextPalette.invertedText;
  }
  return readableTextPalette[themePreferences.cursorColor];
}

function configuredSelectionColor(palette: Palette, themePreferences: ThemePreferences): string {
  if (themePreferences.selectionColor === "grey") return palette.grey1;
  return palette[dimPaletteColorByAccent[themePreferences.selectionColor]];
}

function configuredReadableSelectionColor(
  readableTextPalette: ReadableTextPalette,
  themePreferences: ThemePreferences
): string {
  if (themePreferences.selectionColor === "grey") return readableTextPalette.grey1;
  return readableTextPalette[themePreferences.selectionColor];
}

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
  const readableTextPalette = getReadableTextPalette(appearance, palette);
  const readableNumberedAccentColors = [
    readableTextPalette.red,
    readableTextPalette.orange,
    readableTextPalette.yellow,
    readableTextPalette.green,
    readableTextPalette.aqua,
    readableTextPalette.blue,
  ];
  const transparentWorkbenchColor = `${palette.bg}00`;
  const { disabledWorkbenchForeground, primaryWorkbenchForeground, secondaryWorkbenchForeground } =
    getWorkbenchForegroundColors(appearance, readableTextPalette, palette);
  const readableWorkbenchAccentColors = getReadableWorkbenchAccentColors(readableTextPalette);
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
        const usesReadableBracketGuideColor =
          normalizedIdentifier.includes("editorbracketpairguide");
        const numberedAccentColor =
          (usesReadableBracketGuideColor ? readableNumberedAccentColors : numberedAccentColors)[
            numberedColorIndex - 1
          ] ?? palette.fg;
        let numberedGuideOpacity = "ff";
        if (normalizedIdentifier.includes("background")) {
          numberedGuideOpacity = normalizedIdentifier.includes("active") ? "d0" : "ff";
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

function getWorkbenchForegroundColors(
  appearance: ThemeAppearance,
  readableTextPalette: ReadableTextPalette,
  rawPalette: Palette
) {
  return {
    activeWorkbenchForeground:
      appearance === "light" ? readableTextPalette.invertedText : readableTextPalette.fg,
    disabledWorkbenchForeground: appearance === "light" ? rawPalette.grey1 : rawPalette.grey0,
    primaryWorkbenchForeground: readableTextPalette.fg,
    secondaryWorkbenchForeground: readableTextPalette.grey2,
  };
}

function getReadableWorkbenchAccentColors(readableTextPalette: ReadableTextPalette) {
  return {
    black: readableTextPalette.grey2,
    brightBlack: readableTextPalette.fg,
    blue: readableTextPalette.blue,
    cyan: readableTextPalette.aqua,
    green: readableTextPalette.green,
    magenta: readableTextPalette.purple,
    orange: readableTextPalette.orange,
    red: readableTextPalette.red,
    white: readableTextPalette.fg,
    yellow: readableTextPalette.yellow,
  };
}

function applyWorkbenchStyle(
  workbenchColors: Record<string, string>,
  palette: Palette,
  themePreferences: ThemePreferences
): void {
  const readableTextPalette = getReadableTextPalette(themePreferences.appearance, palette);
  const flatSurfaceIdentifiers = [
    "activityBar.background",
    "sideBar.background",
    "editorGroupHeader.tabsBackground",
    "tab.activeBackground",
    "tab.inactiveBackground",
    "panel.background",
    "statusBar.background",
    "statusBar.noFolderBackground",
    "titleBar.activeBackground",
    "titleBar.inactiveBackground",
    "menu.background",
    "commandCenter.background",
  ];
  const structuralBorderIdentifiers = [
    "sash.hoverBorder",
    "widget.border",
    "window.activeBorder",
    "window.inactiveBorder",
    "textBlockQuote.border",
    "textPreformat.border",
    "toolbar.hoverOutline",
    "button.border",
    "button.separator",
    "button.secondaryBorder",
    "checkbox.selectBorder",
    "radio.activeBorder",
    "radio.inactiveBorder",
    "list.focusOutline",
    "list.focusAndSelectionOutline",
    "list.inactiveFocusOutline",
    "listFilterWidget.outline",
    "listFilterWidget.noMatchesOutline",
    "list.filterMatchBorder",
    "tree.tableColumnsBorder",
    "tree.indentGuidesStroke",
    "tree.inactiveIndentGuidesStroke",
    "activityBar.border",
    "activityBar.dropBorder",
    "activityBar.activeBorder",
    "activityBar.activeFocusBorder",
    "activityBarTop.activeBorder",
    "activityBarTop.dropBorder",
    "profiles.sashBorder",
    "sideBar.border",
    "sideBarSectionHeader.border",
    "sideBarActivityBarTop.border",
    "sideBarTitle.border",
    "sideBarStickyScroll.border",
    "editorGroup.border",
    "editorGroupHeader.tabsBorder",
    "editorGroupHeader.border",
    "editorGroup.focusedEmptyBorder",
    "editorGroup.dropIntoPromptBorder",
    "panel.border",
    "panel.dropBorder",
    "panelTitle.activeBorder",
    "panelTitle.border",
    "panelStickyScroll.border",
    "statusBar.border",
    "statusBar.debuggingBorder",
    "statusBar.focusBorder",
    "statusBar.noFolderBorder",
    "statusBarItem.focusBorder",
    "titleBar.border",
    "tab.border",
    "tab.activeBorder",
    "tab.selectedBorderTop",
    "tab.dragAndDropBorder",
    "tab.hoverBorder",
    "tab.unfocusedActiveBorder",
    "tab.activeBorderTop",
    "tab.unfocusedActiveBorderTop",
    "tab.lastPinnedBorder",
    "tab.unfocusedHoverBorder",
    "tab.activeModifiedBorder",
    "tab.inactiveModifiedBorder",
    "tab.unfocusedActiveModifiedBorder",
    "tab.unfocusedInactiveModifiedBorder",
    "sideBySideEditor.horizontalBorder",
    "sideBySideEditor.verticalBorder",
    "editor.compositionBorder",
    "editor.selectionHighlightBorder",
    "editor.wordHighlightBorder",
    "editor.wordHighlightStrongBorder",
    "editor.wordHighlightTextBorder",
    "editor.findMatchBorder",
    "editor.findMatchHighlightBorder",
    "editor.findRangeHighlightBorder",
    "searchEditor.findMatchBorder",
    "searchEditor.textInputBorder",
    "editor.lineHighlightBorder",
    "editorUnicodeHighlight.border",
    "editor.rangeHighlightBorder",
    "editor.symbolHighlightBorder",
    "editorWidget.border",
    "editorWidget.resizeBorder",
    "input.border",
    "inputOption.activeBorder",
    "dropdown.border",
    "checkbox.border",
    "inputValidation.errorBorder",
    "inputValidation.infoBorder",
    "inputValidation.warningBorder",
    "editorBracketMatch.border",
    "editorOverviewRuler.border",
    "editorError.border",
    "editorWarning.border",
    "editorInfo.border",
    "editorHint.border",
    "editorUnnecessaryCode.border",
    "editorCommentsWidget.resolvedBorder",
    "editorCommentsWidget.unresolvedBorder",
    "inlineEdit.gutterIndicator.primaryBorder",
    "inlineEdit.gutterIndicator.secondaryBorder",
    "inlineEdit.gutterIndicator.successfulBorder",
    "inlineEdit.originalBorder",
    "inlineEdit.modifiedBorder",
    "inlineEdit.tabWillAcceptModifiedBorder",
    "inlineEdit.tabWillAcceptOriginalBorder",
    "diffEditor.insertedTextBorder",
    "diffEditor.removedTextBorder",
    "diffEditor.border",
    "diffEditor.move.border",
    "diffEditor.moveActive.border",
    "merge.border",
    "mergeEditor.conflict.unhandledUnfocused.border",
    "mergeEditor.conflict.unhandledFocused.border",
    "mergeEditor.conflict.handledUnfocused.border",
    "mergeEditor.conflict.handledFocused.border",
    "editorSuggestWidget.border",
    "editorHoverWidget.border",
    "editorGhostText.border",
    "editorStickyScroll.border",
    "peekView.border",
    "peekViewEditor.matchHighlightBorder",
    "terminal.border",
    "terminal.findMatchBorder",
    "terminal.findMatchHighlightBorder",
    "terminal.tab.activeBorder",
    "terminalStickyScroll.border",
    "terminalOverviewRuler.border",
    "debugToolBar.border",
    "debugExceptionWidget.border",
    "panelInput.border",
    "panelSection.border",
    "panelSectionHeader.border",
    "settings.dropdownBorder",
    "settings.textInputBorder",
    "settings.numberInputBorder",
    "settings.checkboxBorder",
    "settings.focusedRowBorder",
    "settings.headerBorder",
    "settings.dropdownListBorder",
    "settings.sashBorder",
    "testing.peekBorder",
    "testing.messagePeekBorder",
    "testing.coveredBorder",
    "testing.uncoveredBorder",
    "testing.message.error.badgeBorder",
    "welcomePage.tileBorder",
    "simpleFindWidget.sashBorder",
    "gauge.border",
    "agentSessionSelectedBadge.border",
    "agentSessionSelectedUnfocusedBadge.border",
    "aiCustomizationManagement.sashBorder",
    "inlineChat.border",
    "inlineChatInput.border",
    "inlineChatInput.focusBorder",
    "interactive.activeCodeBorder",
    "interactive.inactiveCodeBorder",
    "multiDiffEditor.border",
    "chat.requestBorder",
    "chat.requestCodeBorder",
    "chat.checkpointSeparator",
    "chatManagement.sashBorder",
    "notificationCenter.border",
    "notificationToast.border",
    "notifications.border",
    "commandCenter.border",
    "commandCenter.inactiveBorder",
    "commandCenter.activeBorder",
    "menubar.selectionBorder",
    "menu.selectionBorder",
    "menu.separatorBackground",
    "menu.border",
    "extensionButton.border",
    "extensionButton.separator",
    "pickerGroup.border",
    "keybindingLabel.border",
    "keybindingLabel.bottomBorder",
    "editor.snippetTabstopHighlightBorder",
    "editor.snippetFinalTabstopHighlightBorder",
    "notebook.cellBorderColor",
    "notebook.focusedCellBorder",
    "notebook.focusedEditorBorder",
    "notebook.inactiveFocusedCellBorder",
    "notebook.inactiveSelectedCellBorder",
    "notebook.outputContainerBorderColor",
    "notebook.selectedCellBorder",
    "notebook.cellToolbarSeparator",
  ];
  const accentSurfaceBorderIdentifiers = new Set([
    "button.border",
    "button.separator",
    "statusBar.debuggingBorder",
    "testing.message.error.badgeBorder",
    "extensionButton.border",
    "extensionButton.separator",
  ]);
  const flatReadableBorderRoleByIdentifier: Record<string, string> = {
    "list.focusOutline": readableTextPalette.strongBorder,
    "list.focusAndSelectionOutline": readableTextPalette.strongBorder,
    "list.inactiveFocusOutline": readableTextPalette.strongBorder,
    "listFilterWidget.outline": readableTextPalette.strongBorder,
    "listFilterWidget.noMatchesOutline": readableTextPalette.red,
    "list.filterMatchBorder": readableTextPalette.yellow,
    "toolbar.hoverOutline": readableTextPalette.strongBorder,
    "sash.hoverBorder": readableTextPalette.strongBorder,
    "checkbox.selectBorder": readableTextPalette.strongBorder,
    "radio.activeBorder": readableTextPalette.strongBorder,
    "radio.inactiveBorder": readableTextPalette.strongBorder,
    "inlineChatInput.border": readableTextPalette.strongBorder,
    "inlineChatInput.focusBorder": readableTextPalette.strongBorder,
    "editor.selectionHighlightBorder": readableTextPalette.strongBorder,
    "editor.findMatchBorder": readableTextPalette.strongBorder,
    "editor.findMatchHighlightBorder": readableTextPalette.strongBorder,
    "editor.findRangeHighlightBorder": readableTextPalette.strongBorder,
    "terminal.findMatchBorder": readableTextPalette.strongBorder,
    "terminal.findMatchHighlightBorder": readableTextPalette.strongBorder,
    "terminalOverviewRuler.border": readableTextPalette.strongBorder,
    "editorBracketMatch.border": readableTextPalette.strongBorderOnSubsurface,
    "editorError.border": readableTextPalette.red,
    "editorWarning.border": readableTextPalette.yellow,
    "editorInfo.border": readableTextPalette.blue,
    "editorHint.border": readableTextPalette.purple,
    "inputValidation.errorBorder": readableTextPalette.red,
    "inputValidation.infoBorder": readableTextPalette.blue,
    "inputValidation.warningBorder": readableTextPalette.yellow,
    "inputOption.activeBorder": readableTextPalette.strongBorder,
    "activityBar.activeBorder": readableTextPalette.green,
    "activityBar.activeFocusBorder": readableTextPalette.strongBorder,
    "activityBar.dropBorder": readableTextPalette.strongBorder,
    "activityBarTop.activeBorder": readableTextPalette.green,
    "activityBarTop.dropBorder": readableTextPalette.strongBorder,
    "commandCenter.activeBorder": readableTextPalette.strongBorder,
    "interactive.activeCodeBorder": readableTextPalette.strongBorder,
    "editor.snippetTabstopHighlightBorder": readableTextPalette.strongBorder,
    "editor.snippetFinalTabstopHighlightBorder": readableTextPalette.strongBorder,
    "panelTitle.activeBorder": readableTextPalette.green,
    "tab.activeBorder": readableTextPalette.green,
    "tab.activeBorderTop": readableTextPalette.green,
    "tab.hoverBorder": readableTextPalette.strongBorder,
    "tab.dragAndDropBorder": readableTextPalette.strongBorder,
    "terminal.tab.activeBorder": readableTextPalette.green,
    "testing.message.error.badgeBorder": readableTextPalette.strongBorderOnAccent,
    "button.border": readableTextPalette.strongBorderOnAccent,
    "button.separator": readableTextPalette.strongBorderOnAccent,
    "statusBar.debuggingBorder": readableTextPalette.strongBorderOnAccent,
    "extensionButton.border": readableTextPalette.strongBorderOnAccent,
    "extensionButton.separator": readableTextPalette.strongBorderOnAccent,
    "editorCommentsWidget.resolvedBorder": readableTextPalette.green,
    "editorCommentsWidget.unresolvedBorder": readableTextPalette.red,
    "editorGroup.dropIntoPromptBorder": readableTextPalette.strongBorder,
    "panel.dropBorder": readableTextPalette.strongBorder,
    "statusBar.focusBorder": readableTextPalette.strongBorder,
    "statusBarItem.focusBorder": readableTextPalette.strongBorder,
    "menu.selectionBorder": readableTextPalette.strongBorder,
    "menubar.selectionBorder": readableTextPalette.strongBorder,
    "editorUnicodeHighlight.border": readableTextPalette.strongBorder,
    "editor.rangeHighlightBorder": readableTextPalette.strongBorder,
    "editor.symbolHighlightBorder": readableTextPalette.strongBorder,
    "notebook.focusedCellBorder": readableTextPalette.strongBorder,
    "notebook.focusedEditorBorder": readableTextPalette.strongBorder,
    "notebook.inactiveFocusedCellBorder": readableTextPalette.strongBorder,
    "notebook.selectedCellBorder": readableTextPalette.strongBorder,
  };

  if (themePreferences.workbenchStyle === "flat") {
    for (const surfaceIdentifier of flatSurfaceIdentifiers) {
      workbenchColors[surfaceIdentifier] = palette.bg;
    }
    for (const borderIdentifier of structuralBorderIdentifiers) {
      workbenchColors[borderIdentifier] =
        flatReadableBorderRoleByIdentifier[borderIdentifier] ?? `${palette.bg}00`;
    }
  }

  const usesStrongBorders =
    themePreferences.workbenchStyle === "high-contrast" || themePreferences.highContrast;
  if (!usesStrongBorders) return;

  workbenchColors.contrastBorder = readableTextPalette.strongBorder;
  workbenchColors.contrastActiveBorder = readableTextPalette.strongBorder;
  workbenchColors.focusBorder = readableTextPalette.strongBorder;
  for (const borderIdentifier of structuralBorderIdentifiers) {
    workbenchColors[borderIdentifier] =
      borderIdentifier === "editorBracketMatch.border"
        ? readableTextPalette.strongBorderOnSubsurface
        : accentSurfaceBorderIdentifiers.has(borderIdentifier)
          ? readableTextPalette.strongBorderOnAccent
          : readableTextPalette.strongBorder;
  }
}

export function createWorkbenchColors(palette: Palette, themePreferences: ThemePreferences) {
  const { appearance } = themePreferences;
  const readableTextPalette = getReadableTextPalette(appearance, palette);
  const accentForeground = readableTextPalette.accentForeground;
  const hoverOverlayColor =
    appearance === "dark" ? `${readableTextPalette.invertedText}20` : `${palette.bg}20`;
  const {
    activeWorkbenchForeground,
    disabledWorkbenchForeground,
    primaryWorkbenchForeground,
    secondaryWorkbenchForeground,
  } = getWorkbenchForegroundColors(appearance, readableTextPalette, palette);
  const readableWorkbenchAccentColors = getReadableWorkbenchAccentColors(readableTextPalette);
  const accessibleAccentGreen = readableWorkbenchAccentColors.green;
  const accessibleBlueForeground = readableWorkbenchAccentColors.blue;
  const selectionColor = configuredSelectionColor(palette, themePreferences);
  const readableSelectionColor = configuredReadableSelectionColor(
    readableTextPalette,
    themePreferences
  );
  const activeSelectionBackgroundColor = `${selectionColor}${appearance === "dark" ? "80" : "a0"}`;
  const inactiveSelectionBackgroundColor = `${selectionColor}${appearance === "dark" ? "40" : "60"}`;
  const selectionOccurrenceBackgroundColor = `${selectionColor}${appearance === "dark" ? "20" : "30"}`;
  const minimapSelectionHighlightColor = `${readableSelectionColor}e0`;
  const minimapSelectionOccurrenceHighlightColor = `${readableSelectionColor}d0`;
  const neutralSliderColor = appearance === "dark" ? palette.grey0 : readableTextPalette.grey2;
  const scrollbarSliderBackgroundColor = `${neutralSliderColor}${appearance === "dark" ? "50" : "58"}`;
  const scrollbarSliderHoverBackgroundColor = `${neutralSliderColor}${appearance === "dark" ? "90" : "88"}`;
  const scrollbarSliderActiveBackgroundColor = `${neutralSliderColor}${appearance === "dark" ? "ff" : "d0"}`;
  const minimapSliderBackgroundColor = `${neutralSliderColor}${appearance === "dark" ? "28" : "40"}`;
  const minimapSliderHoverBackgroundColor = `${neutralSliderColor}68`;
  const minimapSliderActiveBackgroundColor = `${neutralSliderColor}${appearance === "dark" ? "b0" : "98"}`;
  const selectedTextForegroundColor = readableTextPalette.invertedText;
  const resolvedCommentIndicator = readableTextPalette.grey2;
  const unresolvedCommentIndicator = accessibleBlueForeground;
  const cursorForeground = configuredCursorColor(readableTextPalette, themePreferences);
  const diagnosticBackgroundOpacity =
    diagnosticOpacityAlpha[themePreferences.diagnosticTextBackgroundOpacity];
  const workbenchColors: Record<string, string> = {
    ...createDocumentedWorkbenchColorFallbacks(palette, appearance),
    foreground: primaryWorkbenchForeground,
    focusBorder: readableTextPalette.strongBorder,
    "widget.shadow": palette.shadow,
    "selection.background": `${palette.bg4}${appearance === "dark" ? "e0" : "c0"}`,
    disabledForeground: disabledWorkbenchForeground,
    descriptionForeground: secondaryWorkbenchForeground,
    errorForeground: readableWorkbenchAccentColors.red,
    "icon.foreground": primaryWorkbenchForeground,
    "textLink.foreground": accessibleAccentGreen,
    "textLink.activeForeground": accessibleAccentGreen,
    "textCodeBlock.background": palette.bg1,
    "textBlockQuote.background": palette.bg1,
    "textBlockQuote.border": palette.bg4,
    "textPreformat.foreground": readableWorkbenchAccentColors.yellow,
    "toolbar.hoverBackground": palette.bg2,
    "toolbar.hoverOutline": readableTextPalette.strongBorder,
    "button.background": palette.badge,
    "button.hoverBackground": hoverOverlayColor,
    "button.foreground": accentForeground,
    "button.secondaryBackground": palette.bg3,
    "button.secondaryForeground": primaryWorkbenchForeground,
    "button.secondaryHoverBackground": palette.bg2,
    "checkbox.background": palette.bg,
    "checkbox.foreground": readableWorkbenchAccentColors.orange,
    "checkbox.border": palette.bg5,
    "radio.inactiveForeground": primaryWorkbenchForeground,
    "dropdown.border": palette.bg5,
    "dropdown.background": palette.bg,
    "dropdown.foreground": primaryWorkbenchForeground,
    "input.border": palette.bg5,
    "input.background": `${palette.bg}00`,
    "input.foreground": primaryWorkbenchForeground,
    "input.placeholderForeground": secondaryWorkbenchForeground,
    "inputOption.activeBorder": readableTextPalette.strongBorder,
    "inputValidation.errorBorder": readableWorkbenchAccentColors.red,
    "inputValidation.errorBackground": palette.bg2,
    "inputValidation.errorForeground": primaryWorkbenchForeground,
    "inputValidation.infoBorder": readableWorkbenchAccentColors.blue,
    "inputValidation.infoBackground": palette.bg2,
    "inputValidation.infoForeground": primaryWorkbenchForeground,
    "inputValidation.warningBorder": readableWorkbenchAccentColors.yellow,
    "inputValidation.warningBackground": palette.bg2,
    "inputValidation.warningForeground": primaryWorkbenchForeground,
    "scrollbar.background": `${palette.bg}00`,
    "scrollbar.shadow": palette.shadow,
    "scrollbarSlider.background": scrollbarSliderBackgroundColor,
    "scrollbarSlider.hoverBackground": scrollbarSliderHoverBackgroundColor,
    "scrollbarSlider.activeBackground": scrollbarSliderActiveBackgroundColor,
    "notebookScrollbarSlider.background": scrollbarSliderBackgroundColor,
    "notebookScrollbarSlider.hoverBackground": scrollbarSliderHoverBackgroundColor,
    "notebookScrollbarSlider.activeBackground": scrollbarSliderActiveBackgroundColor,
    "badge.background": palette.badge,
    "badge.foreground": accentForeground,
    "progressBar.background": palette.badge,
    "list.activeSelectionForeground": activeWorkbenchForeground,
    "list.activeSelectionBackground": `${palette.bg4}80`,
    "list.inactiveSelectionForeground": primaryWorkbenchForeground,
    "list.inactiveSelectionBackground": `${palette.bg4}80`,
    "list.dropBackground": `${palette.bg2}80`,
    "list.focusForeground": activeWorkbenchForeground,
    "list.focusBackground": `${palette.bg4}80`,
    "list.focusOutline": readableTextPalette.strongBorder,
    "list.focusAndSelectionOutline": readableTextPalette.strongBorder,
    "list.inactiveFocusOutline": readableTextPalette.strongBorder,
    "list.inactiveFocusBackground": `${palette.bg4}60`,
    "list.highlightForeground": accessibleAccentGreen,
    "list.hoverForeground": activeWorkbenchForeground,
    "list.hoverBackground": palette.bg2,
    "list.invalidItemForeground": readableWorkbenchAccentColors.red,
    "list.errorForeground": readableWorkbenchAccentColors.red,
    "list.warningForeground": readableWorkbenchAccentColors.yellow,
    "tree.indentGuidesStroke": palette.grey0,
    "activityBar.border": palette.bg4,
    "activityBar.background": palette.bg1,
    "activityBar.foreground": activeWorkbenchForeground,
    "activityBar.inactiveForeground": secondaryWorkbenchForeground,
    "activityBar.activeBorder": `${accessibleAccentGreen}d0`,
    "activityBar.activeFocusBorder": readableTextPalette.strongBorder,
    "activityBarBadge.background": palette.badge,
    "activityBarBadge.foreground": accentForeground,
    "sideBar.foreground": primaryWorkbenchForeground,
    "sideBar.background": palette.bg1,
    "sideBarSectionHeader.background": `${palette.bg}00`,
    "sideBarTitle.foreground": activeWorkbenchForeground,
    "sideBarSectionHeader.foreground": primaryWorkbenchForeground,
    "minimap.background": palette.bg,
    "minimap.foregroundOpacity": `#000000${appearance === "dark" ? "a0" : "c0"}`,
    "minimap.findMatchHighlight": `${readableWorkbenchAccentColors.cyan}c0`,
    "minimap.selectionHighlight": minimapSelectionHighlightColor,
    "minimap.selectionOccurrenceHighlight": minimapSelectionOccurrenceHighlightColor,
    "minimap.chatEditHighlight": `${accessibleAccentGreen}c0`,
    "minimap.errorHighlight": readableWorkbenchAccentColors.red,
    "minimap.warningHighlight": readableWorkbenchAccentColors.yellow,
    "minimapGutter.addedBackground": readableWorkbenchAccentColors.green,
    "minimapGutter.modifiedBackground": readableWorkbenchAccentColors.blue,
    "minimapGutter.deletedBackground": readableWorkbenchAccentColors.red,
    "minimapSlider.background": minimapSliderBackgroundColor,
    "minimapSlider.hoverBackground": minimapSliderHoverBackgroundColor,
    "minimapSlider.activeBackground": minimapSliderActiveBackgroundColor,
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
    "editor.foreground": readableTextPalette.fg,
    "editorLineNumber.foreground": readableTextPalette.grey2,
    "editorLineNumber.activeForeground": primaryWorkbenchForeground,
    "editorCursor.foreground": cursorForeground,
    "editor.selectionBackground": activeSelectionBackgroundColor,
    "editor.selectionForeground": selectedTextForegroundColor,
    "editor.selectionHighlightBackground": selectionOccurrenceBackgroundColor,
    "editor.selectionHighlightBorder": readableTextPalette.strongBorder,
    "editor.inactiveSelectionBackground": inactiveSelectionBackgroundColor,
    "editor.wordHighlightBackground":
      appearance === "dark" ? `${palette.bg4}58` : `${palette.bg4}48`,
    "editor.wordHighlightStrongBackground":
      appearance === "dark" ? `${palette.bg4}b0` : `${palette.bg4}90`,
    "editor.wordHighlightTextBackground":
      appearance === "dark" ? `${palette.bg4}58` : `${palette.bg4}48`,
    "editor.hoverHighlightBackground":
      appearance === "dark" ? `${palette.bg4}b0` : `${palette.bg4}90`,
    "editor.findMatchBackground": `${palette.dimOrange}40`,
    "editor.findMatchBorder": readableTextPalette.strongBorder,
    "editor.findMatchHighlightBackground": `${palette.dimGreen}40`,
    "editor.findMatchHighlightBorder": accessibleAccentGreen,
    "editor.findRangeHighlightBackground": selectionOccurrenceBackgroundColor,
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
    "editorInlayHint.foreground": readableTextPalette.grey2,
    "editorInlayHint.typeBackground": `${palette.bg}00`,
    "editorInlayHint.typeForeground": readableTextPalette.grey2,
    "editorInlayHint.parameterBackground": `${palette.bg}00`,
    "editorInlayHint.parameterForeground": readableTextPalette.grey2,
    "editorRuler.foreground": readableTextPalette.grey2,
    "editorCodeLens.foreground": readableTextPalette.grey2,
    "editor.foldBackground": `${palette.bg5}80`,
    "editorBracketMatch.border": readableTextPalette.strongBorderOnSubsurface,
    "editorBracketMatch.background": palette.bg5,
    "editorBracketMatch.foreground": readableTextPalette.invertedText,
    "editorBracketHighlight.foreground1": readableTextPalette.red,
    "editorBracketHighlight.foreground2": readableTextPalette.yellow,
    "editorBracketHighlight.foreground3": readableTextPalette.green,
    "editorBracketHighlight.foreground4": readableTextPalette.blue,
    "editorBracketHighlight.foreground5": readableTextPalette.orange,
    "editorBracketHighlight.foreground6": readableTextPalette.purple,
    "editorBracketHighlight.unexpectedBracket.foreground": readableTextPalette.grey2,
    "editorOverviewRuler.background": palette.bg,
    "editorOverviewRuler.border": `${palette.bg}00`,
    "editorOverviewRuler.findMatchForeground": `${readableTextPalette.aqua}d0`,
    "editorOverviewRuler.rangeHighlightForeground": `${readableTextPalette.aqua}d0`,
    "editorOverviewRuler.selectionHighlightForeground": `${readableTextPalette.strongBorder}d0`,
    "editorOverviewRuler.wordHighlightForeground": `${readableTextPalette.grey2}d0`,
    "editorOverviewRuler.wordHighlightStrongForeground": `${readableTextPalette.grey2}d0`,
    "editorOverviewRuler.wordHighlightTextForeground": `${readableTextPalette.grey2}d0`,
    "editorOverviewRuler.modifiedForeground": readableWorkbenchAccentColors.blue,
    "editorOverviewRuler.addedForeground": readableWorkbenchAccentColors.green,
    "editorOverviewRuler.deletedForeground": readableWorkbenchAccentColors.red,
    "editorOverviewRuler.errorForeground": readableWorkbenchAccentColors.red,
    "editorOverviewRuler.warningForeground": readableWorkbenchAccentColors.yellow,
    "editorOverviewRuler.infoForeground": readableWorkbenchAccentColors.magenta,
    "editorOverviewRuler.currentContentForeground": readableWorkbenchAccentColors.blue,
    "editorOverviewRuler.incomingContentForeground": readableWorkbenchAccentColors.cyan,
    "editorOverviewRuler.commonContentForeground": readableTextPalette.grey2,
    "editorOverviewRuler.bracketMatchForeground": readableTextPalette.strongBorder,
    "editorOverviewRuler.commentForeground": readableTextPalette.grey2,
    "editorOverviewRuler.commentUnresolvedForeground": readableTextPalette.red,
    "editorOverviewRuler.commentDraftForeground": readableTextPalette.yellow,
    "editorOverviewRuler.inlineChatInserted": readableWorkbenchAccentColors.green,
    "editorOverviewRuler.inlineChatRemoved": readableWorkbenchAccentColors.red,
    "problemsErrorIcon.foreground": readableWorkbenchAccentColors.red,
    "problemsWarningIcon.foreground": readableWorkbenchAccentColors.yellow,
    "problemsInfoIcon.foreground": readableWorkbenchAccentColors.blue,
    "editorUnnecessaryCode.border": palette.bg,
    "editorUnnecessaryCode.opacity": `#00000080`,
    "editorError.border": readableWorkbenchAccentColors.red,
    "editorWarning.border": readableWorkbenchAccentColors.yellow,
    "editorInfo.border": readableWorkbenchAccentColors.blue,
    "editorHint.border": readableWorkbenchAccentColors.magenta,
    "editorError.foreground":
      themePreferences.diagnosticTextBackgroundOpacity === "0%"
        ? readableWorkbenchAccentColors.red
        : readableTextPalette.invertedText,
    "editorWarning.foreground":
      themePreferences.diagnosticTextBackgroundOpacity === "0%"
        ? readableWorkbenchAccentColors.yellow
        : readableTextPalette.invertedText,
    "editorInfo.foreground":
      themePreferences.diagnosticTextBackgroundOpacity === "0%"
        ? readableWorkbenchAccentColors.blue
        : readableTextPalette.invertedText,
    "editorHint.foreground": readableWorkbenchAccentColors.magenta,
    "editorError.background": `${palette.dimRed}${diagnosticBackgroundOpacity}`,
    "editorWarning.background": `${palette.dimYellow}${diagnosticBackgroundOpacity}`,
    "editorInfo.background": `${palette.dimBlue}${diagnosticBackgroundOpacity}`,
    "editorGutter.background": `${palette.bg}00`,
    "editorGutter.modifiedBackground": readableWorkbenchAccentColors.blue,
    "editorGutter.addedBackground": readableWorkbenchAccentColors.green,
    "editorGutter.deletedBackground": readableWorkbenchAccentColors.red,
    "editorGutter.commentRangeForeground": readableTextPalette.grey2,
    "editorCommentsWidget.resolvedBorder": resolvedCommentIndicator,
    "editorCommentsWidget.unresolvedBorder": unresolvedCommentIndicator,
    "diffEditor.insertedTextBackground": `${palette.dimAqua}30`,
    "diffEditor.removedTextBackground": `${palette.dimRed}30`,
    "diffEditor.diagonalFill": palette.bg5,
    "editorSuggestWidget.background": palette.bg3,
    "editorSuggestWidget.foreground": readableTextPalette.fg,
    "editorSuggestWidget.selectedForeground": readableTextPalette.invertedText,
    "editorSuggestWidget.highlightForeground":
      appearance === "dark" ? readableTextPalette.fg : readableWorkbenchAccentColors.green,
    "editorSuggestWidget.selectedBackground": palette.bg4,
    "editorSuggestWidget.border": palette.bg3,
    "editorWidget.background": palette.bg,
    "editorWidget.foreground": readableTextPalette.fg,
    "editorWidget.border": palette.bg5,
    "editorHoverWidget.background": palette.bg2,
    "editorHoverWidget.border": palette.bg4,
    "editorGhostText.background": `${palette.bg}00`,
    "editorGhostText.foreground": readableTextPalette.grey2,
    "editorMarkerNavigation.background": palette.bg2,
    "editorMarkerNavigationError.background": readableWorkbenchAccentColors.red,
    "editorMarkerNavigationWarning.background": readableWorkbenchAccentColors.yellow,
    "editorMarkerNavigationInfo.background": readableWorkbenchAccentColors.blue,
    "peekView.border": palette.bg4,
    "peekViewEditor.background": palette.bg2,
    "peekViewEditor.matchHighlightBackground": `${palette.dimYellow}50`,
    "peekViewEditorGutter.background": palette.bg2,
    "peekViewResult.fileForeground": readableTextPalette.fg,
    "peekViewResult.lineForeground": readableTextPalette.grey2,
    "peekViewResult.matchHighlightBackground": `${palette.dimYellow}50`,
    "peekViewResult.selectionBackground": `${palette.dimAqua}50`,
    "peekViewResult.selectionForeground": readableTextPalette.fg,
    "peekViewTitleDescription.foreground": readableTextPalette.fg,
    "peekViewTitleLabel.foreground": readableWorkbenchAccentColors.green,
    "peekViewResult.background": palette.bg2,
    "peekViewTitle.background": palette.bg4,
    "pickerGroup.border": `${palette.badge}1a`,
    "terminal.background": palette.bg1,
    "terminal.foreground": primaryWorkbenchForeground,
    "terminal.border": palette.bg4,
    "terminal.selectionBackground": activeSelectionBackgroundColor,
    "terminal.selectionForeground": selectedTextForegroundColor,
    "terminal.inactiveSelectionBackground": inactiveSelectionBackgroundColor,
    "terminal.findMatchBackground": `${palette.dimOrange}60`,
    "terminal.findMatchBorder": readableTextPalette.strongBorder,
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
    "terminalOverviewRuler.border": readableTextPalette.strongBorder,
    "terminalOverviewRuler.cursorForeground": readableTextPalette.strongBorder,
    "terminalOverviewRuler.findMatchForeground": readableTextPalette.strongBorder,
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
    "debugTokenExpression.name": readableWorkbenchAccentColors.blue,
    "debugTokenExpression.value": readableWorkbenchAccentColors.green,
    "debugTokenExpression.string": readableWorkbenchAccentColors.yellow,
    "debugTokenExpression.boolean": readableWorkbenchAccentColors.magenta,
    "debugTokenExpression.number": readableWorkbenchAccentColors.magenta,
    "debugTokenExpression.error": readableWorkbenchAccentColors.red,
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
    "statusBarItem.hoverForeground":
      appearance === "light" ? readableTextPalette.invertedText : readableTextPalette.fg,
    "statusBarItem.activeBackground": `${palette.bg4}70`,
    "statusBarItem.prominentForeground": accentForeground,
    "statusBarItem.prominentBackground": palette.badge,
    "statusBarItem.prominentHoverForeground": accentForeground,
    "statusBarItem.prominentHoverBackground": hoverOverlayColor,
    "statusBarItem.remoteBackground": palette.blue,
    "statusBarItem.remoteForeground": brightAccentForeground,
    "statusBarItem.remoteHoverBackground": hoverOverlayColor,
    "statusBarItem.remoteHoverForeground": brightAccentForeground,
    "statusBarItem.errorBackground": palette.red,
    "statusBarItem.errorForeground": brightAccentForeground,
    "statusBarItem.errorHoverBackground": hoverOverlayColor,
    "statusBarItem.errorHoverForeground": brightAccentForeground,
    "statusBarItem.warningBackground": palette.yellow,
    "statusBarItem.warningForeground": brightAccentForeground,
    "statusBarItem.warningHoverBackground": hoverOverlayColor,
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
    "gitDecoration.ignoredResourceForeground": readableTextPalette.grey2,
    "gitDecoration.conflictingResourceForeground": readableWorkbenchAccentColors.yellow,
    "gitDecoration.submoduleResourceForeground": readableWorkbenchAccentColors.orange,
    "gitDecoration.stageDeletedResourceForeground": readableWorkbenchAccentColors.red,
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
    "extensionButton.hoverBackground": hoverOverlayColor,
    "extensionButton.prominentForeground": accentForeground,
    "extensionButton.prominentBackground": palette.badge,
    "extensionButton.prominentHoverBackground": hoverOverlayColor,
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
    "sash.hoverBorder": readableTextPalette.strongBorder,
    "notebook.cellBorderColor": palette.bg5,
    "notebook.cellStatusBarItemHoverBackground": palette.bg2,
    "notebook.focusedCellBackground": palette.bg,
    "notebook.cellHoverBackground": palette.bg,
    "notebook.outputContainerBackgroundColor": palette.bg1,
    "notebookStatusSuccessIcon.foreground": readableWorkbenchAccentColors.green,
    "notebookStatusErrorIcon.foreground": readableWorkbenchAccentColors.red,
    "notebookStatusRunningIcon.foreground": readableWorkbenchAccentColors.blue,
    "notebookEditorOverviewRuler.runningCellForeground": readableWorkbenchAccentColors.blue,
    "notebook.focusedCellBorder": readableTextPalette.strongBorder,
    "notebook.focusedEditorBorder": readableTextPalette.strongBorder,
    "notebook.selectedCellBorder": palette.bg5,
    "notebook.inactiveFocusedCellBorder": readableTextPalette.strongBorder,
    "notebook.cellToolbarSeparator": palette.bg5,
    "testing.iconFailed": readableWorkbenchAccentColors.red,
    "testing.iconErrored": readableWorkbenchAccentColors.red,
    "testing.iconPassed": readableWorkbenchAccentColors.green,
    "testing.runAction": readableWorkbenchAccentColors.cyan,
    "testing.iconQueued": readableWorkbenchAccentColors.blue,
    "testing.iconUnset": readableWorkbenchAccentColors.yellow,
    "testing.iconSkipped": readableWorkbenchAccentColors.magenta,
    // Extension-contributed colors: GitLens.
    "gitlens.gutterBackgroundColor": palette.bg,
    "gitlens.gutterForegroundColor": readableTextPalette.fg,
    "gitlens.gutterUncommittedForegroundColor": readableWorkbenchAccentColors.blue,
    "gitlens.trailingLineForegroundColor": readableTextPalette.grey2,
    "gitlens.lineHighlightBackgroundColor": palette.bg2,
    "gitlens.lineHighlightOverviewRulerColor": accessibleAccentGreen,
    "gitlens.closedPullRequestIconColor": readableWorkbenchAccentColors.red,
    "gitlens.openPullRequestIconColor": readableWorkbenchAccentColors.cyan,
    "gitlens.mergedPullRequestIconColor": readableWorkbenchAccentColors.magenta,
    "gitlens.unpublishedChangesIconColor": readableWorkbenchAccentColors.blue,
    "gitlens.unpublishedCommitIconColor": readableWorkbenchAccentColors.yellow,
    "gitlens.unpulledChangesIconColor": readableWorkbenchAccentColors.orange,
    "gitlens.decorations.addedForegroundColor": readableWorkbenchAccentColors.green,
    "gitlens.decorations.copiedForegroundColor": readableWorkbenchAccentColors.magenta,
    "gitlens.decorations.deletedForegroundColor": readableWorkbenchAccentColors.red,
    "gitlens.decorations.ignoredForegroundColor": readableTextPalette.grey2,
    "gitlens.decorations.modifiedForegroundColor": readableWorkbenchAccentColors.blue,
    "gitlens.decorations.untrackedForegroundColor": readableWorkbenchAccentColors.yellow,
    "gitlens.decorations.renamedForegroundColor": readableWorkbenchAccentColors.magenta,
    "gitlens.decorations.branchAheadForegroundColor": readableWorkbenchAccentColors.cyan,
    "gitlens.decorations.branchBehindForegroundColor": readableWorkbenchAccentColors.orange,
    "gitlens.decorations.branchDivergedForegroundColor": readableWorkbenchAccentColors.yellow,
    "gitlens.decorations.branchUpToDateForegroundColor": readableTextPalette.fg,
    "gitlens.decorations.branchUnpublishedForegroundColor": readableWorkbenchAccentColors.blue,
    "gitlens.decorations.branchMissingUpstreamForegroundColor": readableWorkbenchAccentColors.red,
    // Extension-contributed colors: GitHub Pull Requests and Issues.
    "issues.open": readableWorkbenchAccentColors.cyan,
    "issues.closed": readableWorkbenchAccentColors.red,
    "commandCenter.foreground": primaryWorkbenchForeground,
    "commandCenter.activeForeground": readableTextPalette.invertedText,
    "commandCenter.background": palette.bg1,
    "commandCenter.activeBackground": palette.bg2,
    "commandCenter.border": palette.bg4,
    "commandCenter.inactiveForeground": secondaryWorkbenchForeground,
    "commandCenter.inactiveBorder": palette.bg3,
    "commandCenter.activeBorder": readableTextPalette.strongBorder,
    "commandCenter.debuggingBackground": palette.dimOrange,
    "chat.requestBorder": palette.bg4,
    "chat.requestBackground": palette.bg1,
    "chat.slashCommandBackground": palette.bg2,
    "chat.slashCommandForeground": accessibleAccentGreen,
    "chat.avatarBackground": palette.badge,
    "chat.avatarForeground": accentForeground,
    "chat.editedFileForeground": readableWorkbenchAccentColors.cyan,
    "chat.linesAddedForeground": accessibleAccentGreen,
    "chat.linesRemovedForeground": readableWorkbenchAccentColors.red,
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
    "inlineChat.foreground": readableTextPalette.fg,
    "inlineChat.border": palette.bg4,
    "inlineChat.shadow": palette.shadow,
    "inlineChatInput.border": palette.bg4,
    "inlineChatInput.focusBorder": readableTextPalette.strongBorder,
    "inlineChatInput.placeholderForeground": readableTextPalette.grey2,
    "inlineChatInput.background": palette.bg,
    "inlineChatDiff.inserted": `${palette.dimGreen}40`,
    "inlineChatDiff.removed": `${palette.dimRed}40`,
    "interactive.activeCodeBorder": readableTextPalette.strongBorder,
    "interactive.inactiveCodeBorder": palette.bg4,
    "notebook.cellEditorBackground": palette.bg1,
    "multiDiffEditor.headerBackground": palette.bg1,
    "multiDiffEditor.background": palette.bg,
    "multiDiffEditor.border": palette.bg4,
  };
  applyWorkbenchStyle(workbenchColors, palette, themePreferences);
  return workbenchColors;
}

// vim: fdm=marker fmr={{{,}}}:
