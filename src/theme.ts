import { Palette, ThemeAppearance, ThemePreferences } from "./interface";
import { getPalette, getReadableTextPalette } from "./palette";
import { getDefaultSyntax } from "./syntax/default";
import { getSyntaxRoleColors } from "./syntax/roles";
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
  const syntaxRoleColors = getSyntaxRoleColors(themePreferences.appearance, palette);
  return {
    namespace: syntaxRoleColors.namespace,
    type: syntaxRoleColors.type,
    class: syntaxRoleColors.type,
    enum: syntaxRoleColors.constant,
    interface: syntaxRoleColors.type,
    struct: syntaxRoleColors.type,
    typeParameter: syntaxRoleColors.parameter,
    parameter: syntaxRoleColors.parameter,
    variable: syntaxRoleColors.variable,
    property: syntaxRoleColors.property,
    member: syntaxRoleColors.property,
    enumMember: syntaxRoleColors.constant,
    event: syntaxRoleColors.constant,
    function: syntaxRoleColors.callable,
    method: syntaxRoleColors.callable,
    macro: syntaxRoleColors.annotation,
    label: syntaxRoleColors.escape,
    keyword: {
      foreground: syntaxRoleColors.keyword,
      fontStyle: themePreferences.italicKeywords ? "italic" : "",
    },
    modifier: syntaxRoleColors.declaration,
    comment: {
      foreground: syntaxRoleColors.comment,
      fontStyle: themePreferences.italicComments ? "italic" : "",
    },
    string: syntaxRoleColors.string,
    number: syntaxRoleColors.constant,
    regexp: syntaxRoleColors.annotation,
    operator: syntaxRoleColors.operator,
    decorator: syntaxRoleColors.annotation,
    "variable.readonly": syntaxRoleColors.constant,
    "property.readonly": syntaxRoleColors.constant,
    "variable.defaultLibrary": syntaxRoleColors.type,
    "property.defaultLibrary": syntaxRoleColors.type,
    "function.defaultLibrary": syntaxRoleColors.callable,
    "method.defaultLibrary": syntaxRoleColors.callable,
    "type.defaultLibrary": syntaxRoleColors.type,
    "class.defaultLibrary": syntaxRoleColors.type,
    stringLiteral: syntaxRoleColors.string,
    numberLiteral: syntaxRoleColors.constant,
    newOperator: syntaxRoleColors.keyword,
    customLiteral: syntaxRoleColors.callable,
    operatorOverload: syntaxRoleColors.operator,
    memberOperatorOverload: syntaxRoleColors.operator,
    "intrinsic:python": syntaxRoleColors.constant,
    "module:python": syntaxRoleColors.namespace,
    "selfKeyword:rust": syntaxRoleColors.constant,
    "selfTypeKeyword:rust": syntaxRoleColors.constant,
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
  const rawPalette = getPalette(themePreferences.appearance, themePreferences.contrast);
  const readableTextPalette = getReadableTextPalette(themePreferences.appearance, rawPalette);

  return {
    $schema: "vscode://schemas/color-theme",
    name: themeName,
    type: themePreferences.appearance,
    semanticHighlighting: true,
    semanticTokenColors: createSemanticTokenColors(readableTextPalette, themePreferences),
    colors: createWorkbenchColors(rawPalette, themePreferences),
    tokenColors: getDefaultSyntax(
      readableTextPalette,
      themePreferences.appearance,
      themePreferences
    ),
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
