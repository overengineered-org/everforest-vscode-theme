import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Configuration, Palette, ThemeAppearance, ThemeContrast } from "./interface";
import { getPalette } from "./palette";
import { getSemantic } from "./semantic";
import { getDefaultSyntax } from "./syntax/default";
import { getReadableAccentGreen, materialWorkbench } from "./workbench/material";

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

function createConfiguration(contrast: ThemeContrast): Configuration {
  return {
    darkContrast: contrast,
    lightContrast: contrast,
    darkSelection: "grey",
    lightSelection: "grey",
    darkCursor: "white",
    lightCursor: "black",
    italicComments: true,
    diagnosticTextBackgroundOpacity: "0%",
    highContrast: false,
  };
}

function readableAccentForeground(appearance: ThemeAppearance, palette: Palette): string {
  return appearance === "dark" ? palette.bg : "#2d353b";
}

function createCurrentWorkbenchColors(
  appearance: ThemeAppearance,
  palette: Palette
): Record<string, string> {
  const accentForeground = readableAccentForeground(appearance, palette);
  const readableAccentGreen = getReadableAccentGreen(appearance, palette);
  return {
    "button.foreground": accentForeground,
    "badge.foreground": accentForeground,
    "activityBarBadge.foreground": accentForeground,
    "statusBarItem.prominentForeground": accentForeground,
    "commandCenter.foreground": palette.grey2,
    "commandCenter.activeForeground": palette.fg,
    "commandCenter.background": palette.bg1,
    "commandCenter.activeBackground": palette.bg2,
    "commandCenter.border": palette.bg4,
    "commandCenter.inactiveForeground": palette.grey1,
    "commandCenter.inactiveBorder": palette.bg3,
    "commandCenter.activeBorder": palette.fg,
    "commandCenter.debuggingBackground": palette.dimOrange,
    "chat.requestBorder": palette.bg4,
    "chat.requestBackground": palette.bg1,
    "chat.slashCommandBackground": palette.bg2,
    "chat.slashCommandForeground": readableAccentGreen,
    "chat.avatarBackground": palette.green,
    "chat.avatarForeground": accentForeground,
    "chat.editedFileForeground": palette.aqua,
    "chat.linesAddedForeground": readableAccentGreen,
    "chat.linesRemovedForeground": palette.red,
    "chat.requestCodeBorder": palette.bg4,
    "chat.requestBubbleBackground": palette.bg1,
    "chat.requestBubbleHoverBackground": palette.bg2,
    "chat.checkpointSeparator": palette.bg4,
    "chat.thinkingShimmer": palette.aqua,
    "chatManagement.sashBorder": palette.bg4,
    "agentSessionReadIndicator.foreground": readableAccentGreen,
    "agentSessionSelectedBadge.border": readableAccentGreen,
    "agentSessionSelectedUnfocusedBadge.border": palette.bg5,
    "agentStatusIndicator.background": palette.bg1,
    "aiCustomizationManagement.sashBorder": palette.bg4,
    "inlineChat.background": palette.bg1,
    "inlineChat.foreground": palette.fg,
    "inlineChat.border": palette.bg4,
    "inlineChat.shadow": palette.shadow,
    "inlineChatInput.border": palette.bg4,
    "inlineChatInput.focusBorder": palette.fg,
    "inlineChatInput.placeholderForeground": palette.grey1,
    "inlineChatInput.background": palette.bg,
    "inlineChatDiff.inserted": `${palette.dimGreen}40`,
    "inlineChatDiff.removed": `${palette.dimRed}40`,
    "interactive.activeCodeBorder": palette.fg,
    "interactive.inactiveCodeBorder": palette.bg4,
    "notebook.cellEditorBackground": palette.bg1,
    "multiDiffEditor.headerBackground": palette.bg1,
    "multiDiffEditor.background": palette.bg,
    "multiDiffEditor.border": palette.bg4,
  };
}

function createSemanticTokenColors(
  configuration: Configuration,
  appearance: ThemeAppearance,
  palette: Palette
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
    comment: { foreground: palette.grey1, fontStyle: "italic" },
    string: palette.yellow,
    number: palette.purple,
    regexp: palette.orange,
    operator: palette.orange,
    decorator: palette.aqua,
    ...getSemantic(configuration, appearance),
  };
}

function createTheme(appearance: ThemeAppearance, contrast: ThemeContrast): GeneratedTheme {
  const configuration = createConfiguration(contrast);
  const palette = getPalette(configuration, appearance);
  const displayAppearance = appearance === "dark" ? "Dark" : "Light";
  const displayContrast = `${contrast.charAt(0).toUpperCase()}${contrast.slice(1)}`;

  return {
    $schema: "vscode://schemas/color-theme",
    name: `Everforest Complete ${displayAppearance} ${displayContrast}`,
    type: appearance,
    semanticHighlighting: true,
    semanticTokenColors: createSemanticTokenColors(configuration, appearance, palette),
    colors: {
      ...materialWorkbench(palette, configuration, appearance),
      ...createCurrentWorkbenchColors(appearance, palette),
    },
    tokenColors: getDefaultSyntax(palette, configuration.italicComments),
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
