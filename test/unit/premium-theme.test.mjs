import assert from "node:assert/strict";
import test from "node:test";
import { getPalette } from "../../dist/palette/index.js";
import {
  createTheme,
  defaultThemePreferences,
  presetThemeFileName,
  presetThemeName,
} from "../../dist/theme.js";

test("preserves preset names and paths for existing users", () => {
  const presetThemePreferences = {
    ...defaultThemePreferences.dark,
    contrast: "soft",
  };

  assert.equal(presetThemeName(presetThemePreferences), "Everforest Complete Dark Soft");
  assert.equal(
    presetThemeFileName(presetThemePreferences),
    "everforest-complete-dark-soft-color-theme.json"
  );
  assert.equal(
    createTheme(presetThemePreferences, presetThemeName(presetThemePreferences)).name,
    "Everforest Complete Dark Soft"
  );
});

test("applies workbench styles without a second theme path", () => {
  const flatTheme = createTheme({
    ...defaultThemePreferences.dark,
    workbenchStyle: "flat",
  });
  const highContrastTheme = createTheme({
    ...defaultThemePreferences.dark,
    workbenchStyle: "high-contrast",
  });
  const darkPalette = getPalette("dark", "medium");

  for (const flatSurfaceIdentifier of [
    "activityBar.background",
    "sideBar.background",
    "panel.background",
    "statusBar.background",
    "titleBar.activeBackground",
  ]) {
    assert.equal(flatTheme.colors[flatSurfaceIdentifier], darkPalette.bg);
  }
  assert.equal(highContrastTheme.colors.contrastBorder, darkPalette.grey1);
  assert.equal(highContrastTheme.colors.contrastActiveBorder, darkPalette.fg);
});

test("applies cursor, selection, and diagnostic preferences", () => {
  const configuredTheme = createTheme({
    ...defaultThemePreferences.dark,
    cursorColor: "purple",
    selectionColor: "red",
    diagnosticTextBackgroundOpacity: "25%",
  });
  const darkPalette = getPalette("dark", "medium");

  assert.equal(configuredTheme.colors["editorCursor.foreground"], darkPalette.purple);
  assert.equal(configuredTheme.colors["terminalCursor.foreground"], darkPalette.purple);
  assert.equal(configuredTheme.colors["editor.selectionBackground"], `${darkPalette.dimRed}80`);
  assert.equal(
    configuredTheme.colors["editor.selectionHighlightBorder"],
    `${darkPalette.dimRed}80`
  );
  assert.equal(configuredTheme.colors["editorError.background"], `${darkPalette.dimRed}40`);
  assert.equal(configuredTheme.colors["editorWarning.background"], `${darkPalette.dimYellow}40`);
  assert.equal(configuredTheme.colors["editorInfo.background"], `${darkPalette.dimBlue}40`);
});

test("applies keyword and comment font preferences to syntax and semantic tokens", () => {
  const configuredTheme = createTheme({
    ...defaultThemePreferences.light,
    italicKeywords: true,
    italicComments: false,
  });
  const configuredKeywordRule = configuredTheme.tokenColors.find(
    (tokenColorRule) => tokenColorRule.name === "Configured keyword style"
  );
  const configuredCommentRule = configuredTheme.tokenColors.find(
    (tokenColorRule) => tokenColorRule.name === "Comment"
  );

  assert.equal(configuredKeywordRule?.settings.fontStyle, "italic");
  assert.equal(configuredCommentRule?.settings.fontStyle, "");
  assert.equal(configuredTheme.semanticTokenColors.keyword.fontStyle, "italic");
  assert.equal(configuredTheme.semanticTokenColors.comment.fontStyle, "");
});

test("adds strong borders independently from the workbench style", () => {
  const configuredTheme = createTheme({
    ...defaultThemePreferences.light,
    workbenchStyle: "material",
    highContrast: true,
  });
  const lightPalette = getPalette("light", "medium");

  assert.equal(configuredTheme.colors.contrastBorder, lightPalette.grey1);
  assert.equal(configuredTheme.colors["input.border"], lightPalette.grey1);
  assert.equal(configuredTheme.colors["titleBar.border"], lightPalette.grey1);
});
