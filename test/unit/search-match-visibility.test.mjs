import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  compositeHexColor,
  contrastRatio,
  validateHexColor,
} from "../../scripts/color-contrast.mjs";
import themeManifest from "../support/theme-manifest.cjs";

const repositoryDirectory = resolve(import.meta.dirname, "../..");

test("uses the WCAG contrast ratio and rejects invalid theme colors", () => {
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  assert.equal(contrastRatio("#ffffff", "#000000"), contrastRatio("#000000", "#ffffff"));
  assert.doesNotThrow(() => validateHexColor("#a7c080"));
  assert.doesNotThrow(() => validateHexColor("#a7c08080"));
  assert.throws(() => validateHexColor("#fff"), /Invalid color/);
  assert.throws(() => contrastRatio("transparent", "#ffffff"), /Invalid color/);
  assert.equal(compositeHexColor("#00000080", "#ffffff"), "#7f7f7f");
  assert.equal(compositeHexColor("#a7c080", "#ffffff"), "#a7c080");
  assert.throws(() => compositeHexColor("#00000080", "#ffffff80"), /Surface color must be opaque/);
});

for (const themeContribution of themeManifest.expectedThemeContributions) {
  test(`${themeContribution.label} keeps search matches visible`, () => {
    const themePath = resolve(repositoryDirectory, themeContribution.path);
    const generatedTheme = JSON.parse(readFileSync(themePath, "utf8"));
    const searchMatchSurfaces = [
      {
        activeBorder: "editor.findMatchBorder",
        background: "editor.background",
        otherBorder: "editor.findMatchHighlightBorder",
      },
      {
        activeBorder: "terminal.findMatchBorder",
        background: "terminal.background",
        otherBorder: "terminal.findMatchHighlightBorder",
      },
    ];

    for (const searchMatchSurface of searchMatchSurfaces) {
      const surfaceBackground = generatedTheme.colors[searchMatchSurface.background];
      const activeMatchBorder = generatedTheme.colors[searchMatchSurface.activeBorder];
      const otherMatchBorder = generatedTheme.colors[searchMatchSurface.otherBorder];

      assert.notEqual(activeMatchBorder, otherMatchBorder, "active match must differ from others");
      assert.ok(
        contrastRatio(activeMatchBorder, surfaceBackground) >= 3,
        `${searchMatchSurface.activeBorder} must meet 3:1 non-text contrast`
      );
      assert.ok(
        contrastRatio(otherMatchBorder, surfaceBackground) >= 3,
        `${searchMatchSurface.otherBorder} must meet 3:1 non-text contrast`
      );
    }
  });
}
