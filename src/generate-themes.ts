import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ThemeAppearance, ThemeContrast, ThemePreferences } from "./interface";
import {
  defaultThemePreferences,
  generatedThemeFileName,
  presetThemeFileName,
  presetThemeName,
  serializeTheme,
} from "./theme";

const generatedThemesDirectory = resolve(__dirname, "..", "themes");
const themeAppearances: readonly ThemeAppearance[] = ["dark", "light"];
const themeContrasts: readonly ThemeContrast[] = ["soft", "medium", "hard"];

interface GeneratedThemeArtifact {
  fileName: string;
  source: string;
}

function generatedThemeArtifacts(): GeneratedThemeArtifact[] {
  const configurableThemeArtifacts = themeAppearances.map((appearance) => ({
    fileName: generatedThemeFileName(appearance),
    source: serializeTheme(defaultThemePreferences[appearance]),
  }));
  const presetThemeArtifacts = themeAppearances.flatMap((appearance) =>
    themeContrasts.map((contrast) => {
      const themePreferences: ThemePreferences = {
        ...defaultThemePreferences[appearance],
        contrast,
      };
      return {
        fileName: presetThemeFileName(themePreferences),
        source: serializeTheme(themePreferences, presetThemeName(themePreferences)),
      };
    })
  );

  return [...configurableThemeArtifacts, ...presetThemeArtifacts];
}

function generateThemes(): void {
  mkdirSync(generatedThemesDirectory, { recursive: true });
  const verifyOnly = process.env.VERIFY_GENERATED_THEMES === "1";

  for (const generatedThemeArtifact of generatedThemeArtifacts()) {
    const generatedThemePath = resolve(generatedThemesDirectory, generatedThemeArtifact.fileName);

    if (verifyOnly) {
      const committedThemeSource = readFileSync(generatedThemePath, "utf8");
      if (committedThemeSource !== generatedThemeArtifact.source) {
        throw new Error(`Generated theme is stale: ${generatedThemePath}`);
      }
      continue;
    }

    writeFileSync(generatedThemePath, generatedThemeArtifact.source, "utf8");
  }
}

generateThemes();
