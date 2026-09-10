import assert from "node:assert/strict";
import test from "node:test";
import { getPalette, getReadableTextPalette } from "../../dist/palette/index.js";
import { getSyntaxRoleColors } from "../../dist/syntax/roles.js";
import { createTheme } from "../../dist/theme.js";
import themeManifest from "../support/theme-manifest.cjs";

const rustSemanticThemeVariants = [
  { appearance: "dark", contrast: "soft" },
  { appearance: "dark", contrast: "medium" },
  { appearance: "dark", contrast: "hard" },
  { appearance: "light", contrast: "soft" },
  { appearance: "light", contrast: "medium" },
  { appearance: "light", contrast: "hard" },
];

test("maps Rust semantic tokens to the shared cross-language roles", () => {
  for (const rustSemanticThemeVariant of rustSemanticThemeVariants) {
    const rustThemePreferences = {
      appearance: rustSemanticThemeVariant.appearance,
      contrast: rustSemanticThemeVariant.contrast,
      workbenchStyle: "material",
      cursorColor: rustSemanticThemeVariant.appearance === "dark" ? "white" : "black",
      selectionColor: "grey",
      italicKeywords: false,
      italicComments: true,
      diagnosticTextBackgroundOpacity: "0%",
      highContrast: false,
    };
    const generatedRustTheme = createTheme(rustThemePreferences);
    const readableRustPalette = getReadableTextPalette(
      rustSemanticThemeVariant.appearance,
      getPalette(rustSemanticThemeVariant.appearance, rustSemanticThemeVariant.contrast)
    );
    const rustSyntaxRoleColors = getSyntaxRoleColors(readableRustPalette);

    assert.equal(
      generatedRustTheme.semanticTokenColors["selfTypeKeyword:rust"],
      rustSyntaxRoleColors.constant,
      `${rustSemanticThemeVariant.appearance} ${rustSemanticThemeVariant.contrast} self type keyword`
    );
    assert.equal(
      generatedRustTheme.semanticTokenColors["selfTypeKeyword:rust"],
      generatedRustTheme.semanticTokenColors["selfKeyword:rust"],
      `${rustSemanticThemeVariant.appearance} ${rustSemanticThemeVariant.contrast} Rust self roles`
    );
    assert.equal(
      generatedRustTheme.semanticTokenColors.member,
      rustSyntaxRoleColors.property,
      `${rustSemanticThemeVariant.appearance} ${rustSemanticThemeVariant.contrast} member role`
    );
    assert.equal(
      generatedRustTheme.semanticTokenColors.modifier,
      rustSyntaxRoleColors.declaration,
      `${rustSemanticThemeVariant.appearance} ${rustSemanticThemeVariant.contrast} modifier role`
    );
    assert.equal(generatedRustTheme.semanticTokenColors.macro, rustSyntaxRoleColors.annotation);
    assert.equal(generatedRustTheme.semanticTokenColors.namespace, rustSyntaxRoleColors.namespace);
  }
});

test("requires standard generic semantic roles in the theme manifest contract", () => {
  for (const genericSemanticTokenIdentifier of [
    "member",
    "modifier",
    "variable.readonly",
    "property.readonly",
    "function.defaultLibrary",
    "type.defaultLibrary",
    "stringLiteral",
    "numberLiteral",
  ]) {
    assert.ok(
      themeManifest.requiredSemanticTokenIdentifiers.includes(genericSemanticTokenIdentifier),
      genericSemanticTokenIdentifier
    );
  }
});
