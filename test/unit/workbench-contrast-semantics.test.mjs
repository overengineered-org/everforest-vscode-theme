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

function renderedSliderContrastSequence(workbenchColors, sliderIdentifierPrefix, backgroundColor) {
  return ["background", "hoverBackground", "activeBackground"].map((interactionState) =>
    contrastRatio(
      compositeHexColor(
        workbenchColors[`${sliderIdentifierPrefix}.${interactionState}`],
        backgroundColor
      ),
      backgroundColor
    )
  );
}

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
      "minimap.infoHighlight",
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

test("keeps scrollbar and minimap controls subtle with clear interaction states", () => {
  for (const [themeAppearance, themeContrast] of themeVariants) {
    const rawPalette = getPalette(themeAppearance, themeContrast);
    const readableTextPalette = getReadableTextPalette(themeAppearance, rawPalette);
    const themePreferences = {
      ...defaultThemePreferences[themeAppearance],
      contrast: themeContrast,
    };
    const workbenchColors = createWorkbenchColors(rawPalette, themePreferences);
    const editorBackgroundColor = workbenchColors["editor.background"];
    const themeLabel = `${themeAppearance} ${themeContrast}`;
    const expectedNeutralSliderColor =
      themeAppearance === "dark" ? rawPalette.grey0 : readableTextPalette.grey2;
    const expectedScrollbarSliderAlphaChannels =
      themeAppearance === "dark" ? ["50", "90", "ff"] : ["58", "88", "d0"];
    const expectedMinimapSliderAlphaChannels =
      themeAppearance === "dark" ? ["28", "68", "b0"] : ["40", "68", "98"];

    assert.equal(workbenchColors["scrollbar.background"], `${rawPalette.bg}00`);
    assert.equal(workbenchColors["minimap.background"], editorBackgroundColor);
    assert.equal(workbenchColors["editorOverviewRuler.background"], editorBackgroundColor);
    assert.equal(
      workbenchColors["minimap.foregroundOpacity"].slice(-2),
      themeAppearance === "dark" ? "a0" : "c0"
    );

    const sliderInteractionStates = ["background", "hoverBackground", "activeBackground"];
    for (const [sliderStateIndex, sliderInteractionState] of sliderInteractionStates.entries()) {
      assert.equal(
        workbenchColors[`scrollbarSlider.${sliderInteractionState}`],
        `${expectedNeutralSliderColor}${expectedScrollbarSliderAlphaChannels[sliderStateIndex]}`,
        `${themeLabel} scrollbar ${sliderInteractionState}`
      );
      assert.equal(
        workbenchColors[`notebookScrollbarSlider.${sliderInteractionState}`],
        workbenchColors[`scrollbarSlider.${sliderInteractionState}`],
        `${themeLabel} notebook scrollbar ${sliderInteractionState}`
      );
      assert.equal(
        workbenchColors[`minimapSlider.${sliderInteractionState}`],
        `${expectedNeutralSliderColor}${expectedMinimapSliderAlphaChannels[sliderStateIndex]}`,
        `${themeLabel} minimap slider ${sliderInteractionState}`
      );
    }

    const [scrollbarIdleContrast, scrollbarHoverContrast, scrollbarActiveContrast] =
      renderedSliderContrastSequence(workbenchColors, "scrollbarSlider", editorBackgroundColor);
    assert.ok(
      scrollbarIdleContrast >= 1.35 &&
        scrollbarHoverContrast - scrollbarIdleContrast >= 0.4 &&
        scrollbarActiveContrast - scrollbarHoverContrast >= 0.4 &&
        scrollbarActiveContrast >= 3,
      `${themeLabel} scrollbar states must progress from subtle to prominent`
    );

    const [minimapSliderIdleContrast, minimapSliderHoverContrast, minimapSliderActiveContrast] =
      renderedSliderContrastSequence(workbenchColors, "minimapSlider", editorBackgroundColor);
    assert.ok(
      minimapSliderIdleContrast >= 1.2 &&
        minimapSliderHoverContrast - minimapSliderIdleContrast >= 0.25 &&
        minimapSliderActiveContrast - minimapSliderHoverContrast >= 0.25 &&
        minimapSliderActiveContrast >= 2,
      `${themeLabel} minimap slider states must progress without obscuring code`
    );
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
