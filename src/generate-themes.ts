import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Palette, ThemeAppearance, ThemeContrast } from "./interface";
import { getPalette } from "./palette";
import { getSemantic } from "./semantic";
import { getDefaultSyntax } from "./syntax/default";
import { createWorkbenchColors } from "./workbench/material";

interface GeneratedTheme {
  $schema: string;
  name: string;
  type: ThemeAppearance;
  semanticHighlighting: true;
  semanticTokenColors: Record<string, string | { foreground: string; fontStyle?: string }>;
  colors: Record<string, string>;
  tokenColors: ReturnType<typeof getDefaultSyntax>;
}

const appearances: readonly ThemeAppearance[] = ["dark", "light"];
const contrasts: readonly ThemeContrast[] = ["soft", "medium", "hard"];
const generatedThemesDirectory = resolve(__dirname, "..", "themes");

function createSemanticTokenColors(palette: Palette): GeneratedTheme["semanticTokenColors"] {
  return {
    namespace: palette.aqua,
    type: palette.blue,
    class: palette.blue,
    enum: palette.purple,
    interface: palette.aqua,
    struct: palette.blue,
    typeParameter: palette.yellow,
    parameter: palette.fg,
    variable: palette.fg,
    property: palette.fg,
    enumMember: palette.purple,
    event: palette.purple,
    function: palette.green,
    method: palette.green,
    macro: palette.aqua,
    label: palette.aqua,
    comment: { foreground: palette.grey1, fontStyle: "italic" },
    string: palette.yellow,
    number: palette.purple,
    regexp: palette.orange,
    operator: palette.orange,
    decorator: palette.aqua,
    ...getSemantic(palette),
  };
}

function createTheme(appearance: ThemeAppearance, contrast: ThemeContrast): GeneratedTheme {
  const palette = getPalette(appearance, contrast);
  const displayAppearance = appearance === "dark" ? "Dark" : "Light";
  const displayContrast = `${contrast.charAt(0).toUpperCase()}${contrast.slice(1)}`;

  return {
    $schema: "vscode://schemas/color-theme",
    name: `Everforest Complete ${displayAppearance} ${displayContrast}`,
    type: appearance,
    semanticHighlighting: true,
    semanticTokenColors: createSemanticTokenColors(palette),
    colors: createWorkbenchColors(palette, appearance),
    tokenColors: getDefaultSyntax(palette),
  };
}

function generatedThemePath(appearance: ThemeAppearance, contrast: ThemeContrast): string {
  return resolve(
    generatedThemesDirectory,
    `everforest-complete-${appearance}-${contrast}-color-theme.json`
  );
}

function serializeTheme(theme: GeneratedTheme): string {
  return `${JSON.stringify(theme, null, 2)}\n`;
}

function generateAllThemes(): void {
  mkdirSync(generatedThemesDirectory, { recursive: true });
  const verifyOnly = process.env.VERIFY_GENERATED_THEMES === "1";

  for (const appearance of appearances) {
    for (const contrast of contrasts) {
      const themePath = generatedThemePath(appearance, contrast);
      const serializedTheme = serializeTheme(createTheme(appearance, contrast));
      if (verifyOnly) {
        const existingTheme = readFileSync(themePath, "utf8");
        if (existingTheme !== serializedTheme) {
          throw new Error(`Generated theme is stale: ${themePath}`);
        }
      } else {
        writeFileSync(themePath, serializedTheme, "utf8");
      }
    }
  }
}

generateAllThemes();
