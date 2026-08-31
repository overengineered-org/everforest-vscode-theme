import assert from "node:assert/strict";
import test from "node:test";
import { compositeHexColor, contrastRatio } from "../../scripts/color-contrast.mjs";
import { getPalette, getReadableTextPalette } from "../../dist/palette/index.js";
import { defaultThemePreferences } from "../../dist/theme.js";
import { createWorkbenchColors } from "../../dist/workbench/colors.js";

const themeVariants = [
  ["dark", "soft"],
  ["dark", "medium"],
  ["dark", "hard"],
  ["light", "soft"],
  ["light", "medium"],
  ["light", "hard"],
];

test("keeps minimap highlights at 3:1 non-text contrast", () => {
  for (const [themeAppearance, themeContrast] of themeVariants) {
    const rawPalette = getPalette(themeAppearance, themeContrast);
    const themePreferences = {
      ...defaultThemePreferences[themeAppearance],
      contrast: themeContrast,
    };
    const workbenchColors = createWorkbenchColors(rawPalette, themePreferences);
    const minimapBackgroundColor = workbenchColors["minimap.background"];

    for (const minimapHighlightIdentifier of [
      "minimap.findMatchHighlight",
      "minimap.selectionHighlight",
      "minimap.selectionOccurrenceHighlight",
      "minimap.chatEditHighlight",
    ]) {
      const compositedMinimapHighlightColor = compositeHexColor(
        workbenchColors[minimapHighlightIdentifier],
        minimapBackgroundColor
      );
      assert.ok(
        contrastRatio(compositedMinimapHighlightColor, minimapBackgroundColor) >= 3,
        `${themeAppearance} ${themeContrast} ${minimapHighlightIdentifier}`
      );
    }
  }
});

test("keeps material toolbar hover and flat active states semantic", () => {
  for (const [themeAppearance, themeContrast] of themeVariants) {
    const rawPalette = getPalette(themeAppearance, themeContrast);
    const readableTextPalette = getReadableTextPalette(themeAppearance, rawPalette);
    const baseThemePreferences = {
      ...defaultThemePreferences[themeAppearance],
      contrast: themeContrast,
    };
    const materialWorkbenchColors = createWorkbenchColors(rawPalette, baseThemePreferences);
    const flatWorkbenchColors = createWorkbenchColors(rawPalette, {
      ...baseThemePreferences,
      workbenchStyle: "flat",
    });

    assert.ok(
      contrastRatio(
        materialWorkbenchColors["toolbar.hoverOutline"],
        materialWorkbenchColors["toolbar.hoverBackground"]
      ) >= 3,
      `${themeAppearance} ${themeContrast} material toolbar hover outline`
    );
    assert.equal(
      flatWorkbenchColors["terminalOverviewRuler.border"],
      readableTextPalette.strongBorder,
      `${themeAppearance} ${themeContrast} terminal overview ruler border`
    );
    assert.ok(
      contrastRatio(
        flatWorkbenchColors["terminalOverviewRuler.border"],
        flatWorkbenchColors["terminal.background"]
      ) >= 3,
      `${themeAppearance} ${themeContrast} terminal overview ruler contrast`
    );
    for (const activeIndicatorIdentifier of [
      "activityBar.activeBorder",
      "activityBarTop.activeBorder",
      "panelTitle.activeBorder",
      "tab.activeBorder",
      "tab.activeBorderTop",
      "terminal.tab.activeBorder",
    ]) {
      assert.equal(
        flatWorkbenchColors[activeIndicatorIdentifier],
        readableTextPalette.green,
        `${themeAppearance} ${themeContrast} ${activeIndicatorIdentifier}`
      );
    }
    assert.equal(
      materialWorkbenchColors["gitDecoration.stageDeletedResourceForeground"],
      readableTextPalette.red
    );
    assert.equal(
      materialWorkbenchColors["gitDecoration.conflictingResourceForeground"],
      readableTextPalette.yellow
    );
    assert.equal(materialWorkbenchColors["testing.iconPassed"], readableTextPalette.green);
  }
});
