import { createHash } from "node:crypto";
import type { ThemePreferences } from "./interface";
import type { ThemeFileLockLease } from "./theme-file-lock";

export const themeGenerationFingerprintVersion = "v1";
export const maximumThemeSynchronizationAttempts = 3;

export interface ThemeGenerationSnapshot {
  readonly extensionVersion: string;
  readonly dark: Readonly<ThemePreferences>;
  readonly light: Readonly<ThemePreferences>;
  readonly fingerprint: string;
}

export interface ThemeRegenerationHost {
  isLifecycleActive(): boolean;
  readCurrentSnapshot(): ThemeGenerationSnapshot;
  readStoredFingerprint(): string | undefined;
  regenerateThemeFiles(themeGenerationSnapshot: ThemeGenerationSnapshot): Promise<boolean>;
  storeCurrentFingerprint(themeGenerationFingerprint: string): Promise<void>;
  acquireThemeFileLock(): Promise<ThemeFileLockLease>;
  recoverThemeFiles(): Promise<void>;
}

export interface ThemeConfigurationUserInterface {
  promptToReload(message: string): Promise<void>;
  retryThemeRegeneration(): Promise<void>;
  showInformation(message: string): Promise<void>;
  showRegenerationError(message: string): Promise<boolean>;
}

export function createThemeGenerationFingerprint(
  extensionVersion: string,
  darkThemePreferences: Readonly<ThemePreferences>,
  lightThemePreferences: Readonly<ThemePreferences>
): string {
  const fingerprintPayload = JSON.stringify({
    extensionVersion,
    darkThemePreferences: cloneThemePreferences(darkThemePreferences),
    lightThemePreferences: cloneThemePreferences(lightThemePreferences),
  });
  return `${themeGenerationFingerprintVersion}:${createHash("sha256")
    .update(fingerprintPayload)
    .digest("hex")}`;
}

function cloneThemePreferences(
  themePreferences: Readonly<ThemePreferences>
): Readonly<ThemePreferences> {
  return Object.freeze({
    appearance: themePreferences.appearance,
    contrast: themePreferences.contrast,
    workbenchStyle: themePreferences.workbenchStyle,
    cursorColor: themePreferences.cursorColor,
    selectionColor: themePreferences.selectionColor,
    italicKeywords: themePreferences.italicKeywords,
    italicComments: themePreferences.italicComments,
    diagnosticTextBackgroundOpacity: themePreferences.diagnosticTextBackgroundOpacity,
    highContrast: themePreferences.highContrast,
  });
}

export function createThemeGenerationSnapshot(
  extensionVersion: string,
  darkThemePreferences: Readonly<ThemePreferences>,
  lightThemePreferences: Readonly<ThemePreferences>
): ThemeGenerationSnapshot {
  const clonedDarkThemePreferences = cloneThemePreferences(darkThemePreferences);
  const clonedLightThemePreferences = cloneThemePreferences(lightThemePreferences);
  const fingerprint = createThemeGenerationFingerprint(
    extensionVersion,
    clonedDarkThemePreferences,
    clonedLightThemePreferences
  );
  return Object.freeze({
    extensionVersion,
    dark: clonedDarkThemePreferences,
    light: clonedLightThemePreferences,
    fingerprint,
  });
}

export async function synchronizeThemeFiles(
  synchronizationDependencies: ThemeRegenerationHost,
  forceRegeneration = false
): Promise<boolean> {
  const isSynchronizationLifecycleActive = synchronizationDependencies.isLifecycleActive;
  const synchronizationWork = sameProcessSynchronizationTail.then(async () => {
    if (!isSynchronizationLifecycleActive()) return false;
    const themeFileLockLease = await synchronizationDependencies.acquireThemeFileLock();
    let synchronizationResult: boolean | undefined;
    let hasCommittedThemeWrites = false;
    let synchronizationError: unknown;
    try {
      if (!isSynchronizationLifecycleActive()) {
        synchronizationResult = false;
      } else {
        await synchronizationDependencies.recoverThemeFiles();
        if (!isSynchronizationLifecycleActive()) {
          synchronizationResult = false;
        } else {
          for (
            let synchronizationAttempt = 1;
            synchronizationAttempt <= maximumThemeSynchronizationAttempts;
            synchronizationAttempt += 1
          ) {
            if (!isSynchronizationLifecycleActive()) {
              synchronizationResult = false;
              break;
            }
            const initialThemeGenerationSnapshot =
              synchronizationDependencies.readCurrentSnapshot();
            if (!isSynchronizationLifecycleActive()) {
              synchronizationResult = false;
              break;
            }

            // This fingerprint is lifecycle-local: activation always verifies the actual files
            // once, while repeat work in the same extension host can skip unchanged inputs.
            if (
              !forceRegeneration &&
              synchronizationAttempt === 1 &&
              synchronizationDependencies.readStoredFingerprint() ===
                initialThemeGenerationSnapshot.fingerprint
            ) {
              synchronizationResult = false;
              break;
            }

            const themeFilesChanged = await synchronizationDependencies.regenerateThemeFiles(
              initialThemeGenerationSnapshot
            );
            if (themeFilesChanged) hasCommittedThemeWrites = true;
            if (!isSynchronizationLifecycleActive()) {
              synchronizationResult = false;
              break;
            }
            const postWriteThemeGenerationSnapshot =
              synchronizationDependencies.readCurrentSnapshot();
            if (!isSynchronizationLifecycleActive()) {
              synchronizationResult = false;
              break;
            }
            if (
              postWriteThemeGenerationSnapshot.fingerprint !==
              initialThemeGenerationSnapshot.fingerprint
            ) {
              if (synchronizationAttempt === maximumThemeSynchronizationAttempts) {
                throw new Error(
                  `Theme settings changed during regeneration after ${maximumThemeSynchronizationAttempts} attempts`
                );
              }
              continue;
            }

            if (!isSynchronizationLifecycleActive()) {
              synchronizationResult = false;
              break;
            }
            await synchronizationDependencies.storeCurrentFingerprint(
              postWriteThemeGenerationSnapshot.fingerprint
            );
            if (!isSynchronizationLifecycleActive()) {
              synchronizationResult = false;
              break;
            }
            synchronizationResult = themeFilesChanged;
            break;
          }
        }
      }
    } catch (caughtSynchronizationError) {
      synchronizationError = caughtSynchronizationError;
    }

    let lockReleaseError: unknown;
    try {
      await themeFileLockLease?.release();
    } catch (caughtLockReleaseError) {
      lockReleaseError = caughtLockReleaseError;
    }

    if (synchronizationError !== undefined) {
      if (lockReleaseError !== undefined) {
        throw new AggregateError(
          [synchronizationError, lockReleaseError],
          `Theme synchronization failed: ${String(synchronizationError)}; lock release failed: ${String(lockReleaseError)}`
        );
      }
      throw synchronizationError;
    }
    if (lockReleaseError !== undefined && !hasCommittedThemeWrites) {
      throw lockReleaseError;
    }
    if (synchronizationResult === undefined) {
      throw new Error("Theme synchronization did not complete");
    }
    return synchronizationResult;
  });
  sameProcessSynchronizationTail = synchronizationWork.then(
    () => undefined,
    () => undefined
  );
  return synchronizationWork;
}

let sameProcessSynchronizationTail: Promise<void> = Promise.resolve();

export async function synchronizeConfiguredThemesWithFeedback(
  synchronizeConfiguredThemeFiles: () => Promise<boolean>,
  themeConfigurationUserInterface: ThemeConfigurationUserInterface,
  notifyWhenCurrent = false
): Promise<void> {
  try {
    const themeFilesChanged = await synchronizeConfiguredThemeFiles();
    if (themeFilesChanged) {
      await themeConfigurationUserInterface.promptToReload(
        "Everforest Complete regenerated your Dark and Light themes. Reload once to apply them."
      );
    } else if (notifyWhenCurrent) {
      await themeConfigurationUserInterface.showInformation(
        "Everforest Complete themes are current."
      );
    }
  } catch (themeRegenerationError) {
    const retryThemeRegeneration = await themeConfigurationUserInterface.showRegenerationError(
      `Everforest Complete could not regenerate themes: ${String(themeRegenerationError)}`
    );
    if (retryThemeRegeneration) {
      await themeConfigurationUserInterface.retryThemeRegeneration();
    }
  }
}

export async function reportAppliedThemeConfiguration(
  synchronizeConfiguredThemeFiles: () => Promise<boolean>,
  themeConfigurationUserInterface: ThemeConfigurationUserInterface,
  configurationUpdateCount: number
): Promise<void> {
  let themeFilesChanged: boolean;
  try {
    themeFilesChanged = await synchronizeConfiguredThemeFiles();
  } catch (themeRegenerationError) {
    const retryThemeRegeneration = await themeConfigurationUserInterface.showRegenerationError(
      `Everforest Complete saved your choices but could not regenerate theme files: ${String(themeRegenerationError)}`
    );
    if (retryThemeRegeneration) {
      await themeConfigurationUserInterface.retryThemeRegeneration();
    }
    return;
  }

  if (themeFilesChanged) {
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
