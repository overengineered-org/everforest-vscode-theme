import type { ThemePreferences } from "./interface";

export interface ThemeFileSynchronization {
  themeFilesChanged: boolean;
  synchronizationSkipped: boolean;
}

export interface ThemeFileSynchronizationDependencies {
  readCurrentFingerprint(): string;
  readStoredFingerprint(): string | undefined;
  regenerateThemeFiles(): Promise<boolean>;
  storeCurrentFingerprint(themeGenerationFingerprint: string): Promise<void>;
}

export interface ThemeConfigurationUserInterface {
  promptToReload(message: string): Promise<void>;
  retryThemeRegeneration(): Promise<void>;
  showInformation(message: string): Promise<void>;
  showRegenerationError(message: string): Promise<boolean>;
}

export function createThemeGenerationFingerprint(
  extensionVersion: string,
  darkThemePreferences: ThemePreferences,
  lightThemePreferences: ThemePreferences
): string {
  return JSON.stringify({
    extensionVersion,
    darkThemePreferences,
    lightThemePreferences,
  });
}

export async function synchronizeThemeFiles(
  synchronizationDependencies: ThemeFileSynchronizationDependencies,
  forceRegeneration = false
): Promise<ThemeFileSynchronization> {
  const currentThemeGenerationFingerprint = synchronizationDependencies.readCurrentFingerprint();
  if (
    !forceRegeneration &&
    synchronizationDependencies.readStoredFingerprint() === currentThemeGenerationFingerprint
  ) {
    return { themeFilesChanged: false, synchronizationSkipped: true };
  }

  const themeFilesChanged = await synchronizationDependencies.regenerateThemeFiles();
  await synchronizationDependencies.storeCurrentFingerprint(currentThemeGenerationFingerprint);
  return { themeFilesChanged, synchronizationSkipped: false };
}

export async function synchronizeConfiguredThemesWithFeedback(
  synchronizeConfiguredThemeFiles: () => Promise<ThemeFileSynchronization>,
  themeConfigurationUserInterface: ThemeConfigurationUserInterface,
  notifyWhenCurrent = false
): Promise<void> {
  try {
    const themeFileSynchronization = await synchronizeConfiguredThemeFiles();
    if (themeFileSynchronization.themeFilesChanged) {
      await themeConfigurationUserInterface.promptToReload(
        "Everforest Complete regenerated your Dark and Light themes. Reload once to apply them."
      );
    } else if (notifyWhenCurrent) {
      await themeConfigurationUserInterface.showInformation(
        "Everforest Complete themes are current."
      );
    }
  } catch (themeRegenerationError) {
    await themeConfigurationUserInterface.showRegenerationError(
      `Everforest Complete could not regenerate themes: ${String(themeRegenerationError)}`
    );
  }
}

export async function reportAppliedThemeConfiguration(
  synchronizeConfiguredThemeFiles: () => Promise<ThemeFileSynchronization>,
  themeConfigurationUserInterface: ThemeConfigurationUserInterface,
  configurationUpdateCount: number
): Promise<void> {
  let themeFileSynchronization: ThemeFileSynchronization;
  try {
    themeFileSynchronization = await synchronizeConfiguredThemeFiles();
  } catch (themeRegenerationError) {
    const retryThemeRegeneration = await themeConfigurationUserInterface.showRegenerationError(
      `Everforest Complete saved your choices but could not regenerate theme files: ${String(themeRegenerationError)}`
    );
    if (retryThemeRegeneration) {
      await themeConfigurationUserInterface.retryThemeRegeneration();
    }
    return;
  }

  if (themeFileSynchronization.themeFilesChanged) {
    await themeConfigurationUserInterface.promptToReload(
      "Everforest Complete applied your choices. Reload once to use the regenerated themes."
    );
    return;
  }

  await themeConfigurationUserInterface.showInformation(
    configurationUpdateCount === 0
      ? "Everforest Complete already matches those choices."
      : "Everforest Complete applied your choices."
  );
}
