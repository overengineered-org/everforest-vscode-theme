import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getPalette } from "../../dist/palette/index.js";
import { getSemantic } from "../../dist/semantic.js";
import { getDefaultSyntax } from "../../dist/syntax/default.js";
import { createWorkbenchColors } from "../../dist/workbench/material.js";

const documentedWorkbenchColorContract = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, "../../src/workbench/documented-workbench-colors.json"),
    "utf8"
  )
);
const themeVariants = [
  { appearance: "dark", contrast: "soft", expectedBackground: "#333c43" },
  { appearance: "dark", contrast: "medium", expectedBackground: "#2d353b" },
  { appearance: "dark", contrast: "hard", expectedBackground: "#272e33" },
  { appearance: "light", contrast: "soft", expectedBackground: "#f3ead3" },
  { appearance: "light", contrast: "medium", expectedBackground: "#fdf6e3" },
  { appearance: "light", contrast: "hard", expectedBackground: "#fffbef" },
];

for (const themeVariant of themeVariants) {
  test(`${themeVariant.appearance} ${themeVariant.contrast} generates complete source colors`, () => {
    const palette = getPalette(themeVariant.appearance, themeVariant.contrast);
    const semanticTokenColors = getSemantic(palette);
    const syntaxTokenColors = getDefaultSyntax(palette);
    const workbenchColors = createWorkbenchColors(palette, themeVariant.appearance);
    const missingDocumentedWorkbenchColorIdentifiers =
      documentedWorkbenchColorContract.identifiers.filter(
        (documentedWorkbenchColorIdentifier) =>
          !(documentedWorkbenchColorIdentifier in workbenchColors)
      );

    assert.equal(palette.bg, themeVariant.expectedBackground);
    assert.equal(semanticTokenColors["class:typescript"], palette.aqua);
    assert.equal(semanticTokenColors["macro:rust"], palette.aqua);
    assert.ok(syntaxTokenColors.length >= 50, "syntax coverage must remain broad");
    assert.deepEqual(missingDocumentedWorkbenchColorIdentifiers, []);

    for (const translucentWorkbenchColorIdentifier of documentedWorkbenchColorContract.translucentIdentifiers) {
      const translucentWorkbenchColor = workbenchColors[translucentWorkbenchColorIdentifier];
      assert.match(translucentWorkbenchColor, /^#[0-9a-f]{8}$/i);
      assert.notEqual(translucentWorkbenchColor.slice(-2).toLowerCase(), "ff");
    }
  });
}
