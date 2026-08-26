import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { contrastRatio } from "../../scripts/color-contrast.mjs";
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

  test(`${themeVariant.appearance} ${themeVariant.contrast} keeps source control graph labels semantic and readable`, () => {
    const palette = getPalette(themeVariant.appearance, themeVariant.contrast);
    const workbenchColors = createWorkbenchColors(palette, themeVariant.appearance);
    const sourceControlGraphLabelForeground =
      workbenchColors["scmGraph.historyItemHoverLabelForeground"];
    const expectedSourceControlGraphColors = {
      "scmGraph.foreground1": `${palette.red}ff`,
      "scmGraph.foreground2": `${palette.orange}ff`,
      "scmGraph.foreground3": `${palette.yellow}ff`,
      "scmGraph.foreground4": `${palette.green}ff`,
      "scmGraph.foreground5": `${palette.aqua}ff`,
      "scmGraph.historyItemRefColor": palette.blue,
      "scmGraph.historyItemRemoteRefColor": palette.purple,
      "scmGraph.historyItemBaseRefColor": palette.orange,
      "scmGraph.historyItemHoverLabelForeground": "#1b2024",
      "scmGraph.historyItemHoverAdditionsForeground":
        themeVariant.appearance === "dark" ? palette.green : "#596600",
      "scmGraph.historyItemHoverDeletionsForeground":
        themeVariant.appearance === "dark" ? "#f8a0a0" : "#ad3d3d",
    };

    for (const [
      sourceControlGraphColorIdentifier,
      expectedSourceControlGraphColor,
    ] of Object.entries(expectedSourceControlGraphColors)) {
      assert.equal(
        workbenchColors[sourceControlGraphColorIdentifier],
        expectedSourceControlGraphColor,
        sourceControlGraphColorIdentifier
      );
    }

    assert.equal(
      new Set(
        Object.keys(expectedSourceControlGraphColors)
          .filter((sourceControlGraphColorIdentifier) =>
            sourceControlGraphColorIdentifier.startsWith("scmGraph.foreground")
          )
          .map(
            (sourceControlGraphColorIdentifier) =>
              workbenchColors[sourceControlGraphColorIdentifier]
          )
      ).size,
      5,
      "source control graph lanes must remain visually distinct"
    );

    for (const sourceControlGraphReferenceColorIdentifier of [
      "scmGraph.historyItemRefColor",
      "scmGraph.historyItemRemoteRefColor",
      "scmGraph.historyItemBaseRefColor",
    ]) {
      assert.ok(
        contrastRatio(
          sourceControlGraphLabelForeground,
          workbenchColors[sourceControlGraphReferenceColorIdentifier]
        ) >= 4.5,
        `${sourceControlGraphReferenceColorIdentifier} label contrast`
      );
    }
  });

  test(`${themeVariant.appearance} ${themeVariant.contrast} keeps semantic workbench states distinct and readable`, () => {
    const palette = getPalette(themeVariant.appearance, themeVariant.contrast);
    const workbenchColors = createWorkbenchColors(palette, themeVariant.appearance);
    const expectedAccessibleBlueForeground =
      themeVariant.appearance === "dark" ? palette.blue : "#2e5f94";
    const expectedAccessibleAquaForeground =
      themeVariant.appearance === "dark" ? palette.aqua : "#2f6a4d";
    const expectedResolvedCommentIndicator =
      themeVariant.appearance === "dark" ? palette.grey2 : "#59646c";
    const expectedSemanticWorkbenchStateColors = {
      "minimap.selectionOccurrenceHighlight": `${palette.bg4}${themeVariant.appearance === "dark" ? "60" : "50"}`,
      "minimap.chatEditHighlight": `${themeVariant.appearance === "dark" ? palette.green : "#596600"}${themeVariant.appearance === "dark" ? "99" : "80"}`,
      "chart.line": expectedAccessibleBlueForeground,
      "chart.axis": `${themeVariant.appearance === "dark" ? palette.fg : "#59646c"}${themeVariant.appearance === "dark" ? "66" : "99"}`,
      "chart.guide": `${themeVariant.appearance === "dark" ? palette.fg : "#59646c"}33`,
      "gitDecoration.renamedResourceForeground": expectedAccessibleAquaForeground,
      "debugView.valueChangedHighlight": expectedAccessibleBlueForeground,
      "settings.modifiedItemIndicator": expectedAccessibleBlueForeground,
      "commentsView.resolvedIcon": expectedResolvedCommentIndicator,
      "commentsView.unresolvedIcon": expectedAccessibleBlueForeground,
      "editorCommentsWidget.resolvedBorder": expectedResolvedCommentIndicator,
      "editorCommentsWidget.unresolvedBorder": expectedAccessibleBlueForeground,
    };

    for (const [semanticWorkbenchColorIdentifier, expectedSemanticWorkbenchColor] of Object.entries(
      expectedSemanticWorkbenchStateColors
    )) {
      assert.equal(
        workbenchColors[semanticWorkbenchColorIdentifier],
        expectedSemanticWorkbenchColor,
        semanticWorkbenchColorIdentifier
      );
    }

    for (const translucentSemanticWorkbenchColorIdentifier of [
      "minimap.selectionOccurrenceHighlight",
      "minimap.chatEditHighlight",
      "chart.axis",
      "chart.guide",
    ]) {
      assert.match(
        workbenchColors[translucentSemanticWorkbenchColorIdentifier],
        /^#[0-9a-f]{8}$/i,
        `${translucentSemanticWorkbenchColorIdentifier} must be translucent`
      );
      assert.notEqual(
        workbenchColors[translucentSemanticWorkbenchColorIdentifier].slice(-2).toLowerCase(),
        "ff",
        `${translucentSemanticWorkbenchColorIdentifier} must not be opaque`
      );
    }

    for (const distinctSemanticWorkbenchColorIdentifiers of [
      ["minimap.selectionOccurrenceHighlight", "minimap.chatEditHighlight"],
      ["chart.line", "chart.axis", "chart.guide"],
      ["commentsView.resolvedIcon", "commentsView.unresolvedIcon"],
      ["editorCommentsWidget.resolvedBorder", "editorCommentsWidget.unresolvedBorder"],
    ]) {
      assert.equal(
        new Set(
          distinctSemanticWorkbenchColorIdentifiers.map(
            (semanticWorkbenchColorIdentifier) => workbenchColors[semanticWorkbenchColorIdentifier]
          )
        ).size,
        distinctSemanticWorkbenchColorIdentifiers.length,
        `${distinctSemanticWorkbenchColorIdentifiers.join(", ")} must remain distinct`
      );
    }

    for (const [foregroundIdentifier, backgroundIdentifier, minimumContrast] of [
      ["gitDecoration.renamedResourceForeground", "sideBar.background", 4.5],
      ["debugView.valueChangedHighlight", "sideBar.background", 4.5],
      ["settings.modifiedItemIndicator", "editor.background", 3],
      ["chart.line", "editor.background", 3],
      ["commentsView.resolvedIcon", "sideBar.background", 3],
      ["commentsView.unresolvedIcon", "sideBar.background", 3],
      ["editorCommentsWidget.resolvedBorder", "editorWidget.background", 3],
      ["editorCommentsWidget.unresolvedBorder", "editorWidget.background", 3],
    ]) {
      assert.ok(
        contrastRatio(
          workbenchColors[foregroundIdentifier],
          workbenchColors[backgroundIdentifier]
        ) >= minimumContrast,
        `${foregroundIdentifier} must meet ${minimumContrast}:1 contrast against ${backgroundIdentifier}`
      );
    }
  });
}
