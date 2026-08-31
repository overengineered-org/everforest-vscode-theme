import assert from "node:assert/strict";
import test from "node:test";
import { getPalette, getReadableTextPalette } from "../../dist/palette/index.js";
import {
  configurableThemeName,
  createTheme,
  defaultThemePreferences,
  generatedThemeFileName,
  presetThemeFileName,
  presetThemeName,
  serializeTheme,
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

test("serializes configurable themes and names generated files for both appearances", () => {
  const serializedLightTheme = serializeTheme(defaultThemePreferences.light);
  const serializedCustomTheme = serializeTheme(defaultThemePreferences.dark, "Custom Dark");

  assert.deepEqual(JSON.parse(serializedLightTheme), createTheme(defaultThemePreferences.light));
  assert.equal(JSON.parse(serializedCustomTheme).name, "Custom Dark");
  assert.equal(configurableThemeName("dark"), "Everforest Complete Dark");
  assert.equal(configurableThemeName("light"), "Everforest Complete Light");
  assert.equal(generatedThemeFileName("dark"), "everforest-complete-dark-color-theme.json");
  assert.equal(generatedThemeFileName("light"), "everforest-complete-light-color-theme.json");
  assert.equal(presetThemeName(defaultThemePreferences.light), "Everforest Complete Light Medium");
  assert.equal(
    presetThemeFileName(defaultThemePreferences.light),
    "everforest-complete-light-medium-color-theme.json"
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
  const readableDarkPalette = getReadableTextPalette("dark", darkPalette);

  for (const flatSurfaceIdentifier of [
    "activityBar.background",
    "sideBar.background",
    "panel.background",
    "statusBar.background",
    "titleBar.activeBackground",
  ]) {
    assert.equal(flatTheme.colors[flatSurfaceIdentifier], darkPalette.bg);
  }
  assert.equal(highContrastTheme.colors.contrastBorder, readableDarkPalette.strongBorder);
  assert.equal(highContrastTheme.colors.contrastActiveBorder, readableDarkPalette.strongBorder);
});

test("applies cursor, selection, and diagnostic preferences", () => {
  const configuredTheme = createTheme({
    ...defaultThemePreferences.dark,
    cursorColor: "purple",
    selectionColor: "red",
    diagnosticTextBackgroundOpacity: "25%",
  });
  const darkPalette = getPalette("dark", "medium");
  const readableDarkPalette = getReadableTextPalette("dark", darkPalette);

  assert.equal(configuredTheme.colors["editorCursor.foreground"], darkPalette.purple);
  assert.equal(configuredTheme.colors["terminalCursor.foreground"], darkPalette.purple);
  assert.equal(configuredTheme.colors["editor.selectionBackground"], `${darkPalette.dimRed}80`);
  assert.equal(
    configuredTheme.colors["editor.selectionHighlightBorder"],
    readableDarkPalette.strongBorder
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
  const readableLightPalette = getReadableTextPalette("light", lightPalette);

  assert.equal(configuredTheme.colors.contrastBorder, readableLightPalette.strongBorder);
  assert.equal(configuredTheme.colors["input.border"], readableLightPalette.strongBorder);
  assert.equal(configuredTheme.colors["titleBar.border"], readableLightPalette.strongBorder);
});
