type ThemeMode = "light" | "dark";

interface ThemePreference {
  mode: ThemeMode;
  contrast: number;
}

export function describeTheme(preference: ThemePreference): string {
  const readableContrast = Math.max(preference.contrast, 4.5);
  return `${preference.mode} theme at ${readableContrast}:1`;
}
