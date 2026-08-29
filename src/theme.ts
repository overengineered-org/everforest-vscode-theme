import { Palette, ThemeAppearance, ThemePreferences } from "./interface";
import { getPalette } from "./palette";
import { getSemantic } from "./semantic";
import { getDefaultSyntax } from "./syntax/default";
import { createWorkbenchColors } from "./workbench/colors";

export interface GeneratedTheme {
  $schema: string;
  name: string;
  type: ThemeAppearance;
  semanticHighlighting: true;
  semanticTokenColors: Record<string, string | { foreground: string; fontStyle?: string }>;
  colors: Record<string, string>;
  tokenColors: ReturnType<typeof getDefaultSyntax>;
}

export const defaultThemePreferences: Record<ThemeAppearance, ThemePreferences> = {
  dark: {
    appearance: "dark",
    contrast: "medium",
    workbenchStyle: "material",
    cursorColor: "white",
    selectionColor: "grey",
    italicKeywords: false,
    italicComments: true,
    diagnosticTextBackgroundOpacity: "0%",
    highContrast: false,
  },
  light: {
    appearance: "light",
    contrast: "medium",
    workbenchStyle: "material",
    cursorColor: "black",
    selectionColor: "grey",
    italicKeywords: false,
    italicComments: true,
    diagnosticTextBackgroundOpacity: "0%",
    highContrast: false,
  },
};

function createSemanticTokenColors(
  palette: Palette,
  themePreferences: ThemePreferences
): GeneratedTheme["semanticTokenColors"] {
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
    keyword: {
      foreground: palette.red,
      fontStyle: themePreferences.italicKeywords ? "italic" : "",
    },
    comment: {
      foreground: palette.grey1,
      fontStyle: themePreferences.italicComments ? "italic" : "",
    },
    string: palette.yellow,
    number: palette.purple,
    regexp: palette.orange,
    operator: palette.orange,
    decorator: palette.aqua,
    ...getSemantic(palette),
  };
}

export function configurableThemeName(appearance: ThemeAppearance): string {
  const displayAppearance = appearance === "dark" ? "Dark" : "Light";
  return `Everforest Complete ${displayAppearance}`;
}

export function presetThemeName(themePreferences: ThemePreferences): string {
  const displayAppearance = themePreferences.appearance === "dark" ? "Dark" : "Light";
  const displayContrast =
    themePreferences.contrast.charAt(0).toUpperCase() + themePreferences.contrast.slice(1);
  return `Everforest Complete ${displayAppearance} ${displayContrast}`;
}

export function createTheme(
  themePreferences: ThemePreferences,
  themeName = configurableThemeName(themePreferences.appearance)
): GeneratedTheme {
  const palette = getPalette(themePreferences.appearance, themePreferences.contrast);

  return {
    $schema: "vscode://schemas/color-theme",
    name: themeName,
    type: themePreferences.appearance,
    semanticHighlighting: true,
    semanticTokenColors: createSemanticTokenColors(palette, themePreferences),
    colors: createWorkbenchColors(palette, themePreferences),
    tokenColors: getDefaultSyntax(palette, themePreferences),
  };
}

export function serializeTheme(
  themePreferences: ThemePreferences,
  themeName = configurableThemeName(themePreferences.appearance)
): string {
  return `${JSON.stringify(createTheme(themePreferences, themeName), null, 2)}\n`;
}

export function generatedThemeFileName(appearance: ThemeAppearance): string {
  return `everforest-complete-${appearance}-color-theme.json`;
}

export function presetThemeFileName(themePreferences: ThemePreferences): string {
  return `everforest-complete-${themePreferences.appearance}-${themePreferences.contrast}-color-theme.json`;
}
