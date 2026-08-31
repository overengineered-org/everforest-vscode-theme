import assert from "node:assert/strict";
import test from "node:test";
import { createConfigurationChangeReconciler } from "../../dist/configuration.js";
import { ThemeScheduleController } from "../../dist/schedule-controller.js";
import {
  createThemeGenerationSnapshot,
  synchronizeConfiguredThemesWithFeedback,
  synchronizeThemeFiles,
} from "../../dist/theme-regeneration.js";

const darkThemePreferences = {
  appearance: "dark",
  contrast: "medium",
  workbenchStyle: "material",
  cursorColor: "white",
  selectionColor: "grey",
  italicKeywords: false,
  italicComments: true,
  diagnosticTextBackgroundOpacity: "0%",
  highContrast: false,
};
const lightThemePreferences = {
  ...darkThemePreferences,
  appearance: "light",
  cursorColor: "black",
};
const currentThemeGenerationSnapshot = createThemeGenerationSnapshot(
  "1.5.0",
  darkThemePreferences,
  lightThemePreferences
);

const createThemeFileLockLease = (recordedSteps) => ({
  ownerToken: "lock-owner",
  async release() {
    recordedSteps.push("release");
  },
});

test("does not start synchronization after lifecycle disposal", async () => {
  const recordedSteps = [];
  const synchronizedThemeFiles = await synchronizeThemeFiles({
    isLifecycleActive: () => false,
    acquireThemeFileLock: async () => {
      recordedSteps.push("acquire");
      return createThemeFileLockLease(recordedSteps);
    },
    recoverThemeFiles: async () => recordedSteps.push("recover"),
    readCurrentSnapshot: () => {
      recordedSteps.push("snapshot");
      return currentThemeGenerationSnapshot;
    },
    readStoredFingerprint: () => {
      recordedSteps.push("stored-fingerprint");
      return "old";
    },
    regenerateThemeFiles: async () => {
      recordedSteps.push("regenerate");
      return true;
    },
    storeCurrentFingerprint: async () => recordedSteps.push("store-fingerprint"),
  });

  assert.equal(synchronizedThemeFiles, false);
  assert.deepEqual(recordedSteps, []);
});

test("releases an acquired lock without starting work after disposal", async () => {
  let lifecycleActive = true;
  const recordedSteps = [];
  const synchronizedThemeFiles = await synchronizeThemeFiles({
    isLifecycleActive: () => lifecycleActive,
    acquireThemeFileLock: async () => {
      recordedSteps.push("acquire");
      lifecycleActive = false;
      return createThemeFileLockLease(recordedSteps);
    },
    recoverThemeFiles: async () => recordedSteps.push("recover"),
    readCurrentSnapshot: () => {
      recordedSteps.push("snapshot");
      return currentThemeGenerationSnapshot;
    },
    readStoredFingerprint: () => {
      recordedSteps.push("stored-fingerprint");
      return "old";
    },
    regenerateThemeFiles: async () => {
      recordedSteps.push("regenerate");
      return true;
    },
    storeCurrentFingerprint: async () => recordedSteps.push("store-fingerprint"),
  });

  assert.equal(synchronizedThemeFiles, false);
  assert.deepEqual(recordedSteps, ["acquire", "release"]);
});

test("stops before fingerprint work when recovery disposes the lifecycle", async () => {
  let lifecycleActive = true;
  const recordedSteps = [];
  const synchronizedThemeFiles = await synchronizeThemeFiles({
    isLifecycleActive: () => lifecycleActive,
    acquireThemeFileLock: async () => {
      recordedSteps.push("acquire");
      return createThemeFileLockLease(recordedSteps);
    },
    recoverThemeFiles: async () => {
      recordedSteps.push("recover");
      lifecycleActive = false;
    },
    readCurrentSnapshot: () => {
      recordedSteps.push("snapshot");
      return currentThemeGenerationSnapshot;
    },
    readStoredFingerprint: () => {
      recordedSteps.push("stored-fingerprint");
      return "old";
    },
    regenerateThemeFiles: async () => {
      recordedSteps.push("regenerate");
      return true;
    },
    storeCurrentFingerprint: async () => recordedSteps.push("store-fingerprint"),
  });

  assert.equal(synchronizedThemeFiles, false);
  assert.deepEqual(recordedSteps, ["acquire", "recover", "release"]);
});

test("stops before post-write fingerprint reads when regeneration disposes the lifecycle", async () => {
  let lifecycleActive = true;
  const recordedSteps = [];
  const synchronizedThemeFiles = await synchronizeThemeFiles({
    isLifecycleActive: () => lifecycleActive,
    acquireThemeFileLock: async () => ({
      ownerToken: "post-write-disposal-lock-owner",
      async release() {},
    }),
    recoverThemeFiles: async () => {},
    readCurrentSnapshot: () => {
      recordedSteps.push("snapshot");
      return currentThemeGenerationSnapshot;
    },
    readStoredFingerprint: () => {
      recordedSteps.push("stored-fingerprint");
      return "old";
    },
    regenerateThemeFiles: async () => {
      recordedSteps.push("regenerate");
      lifecycleActive = false;
      return true;
    },
    storeCurrentFingerprint: async () => recordedSteps.push("store-fingerprint"),
  });

  assert.equal(synchronizedThemeFiles, false);
  assert.deepEqual(recordedSteps, ["snapshot", "stored-fingerprint", "regenerate"]);
});

test("recovers startup state and retries when generation changes during regeneration", async () => {
  const updatedThemeGenerationSnapshot = createThemeGenerationSnapshot(
    "1.5.0",
    darkThemePreferences,
    { ...lightThemePreferences, contrast: "soft" }
  );
  let currentThemeGenerationSnapshot = createThemeGenerationSnapshot(
    "1.5.0",
    darkThemePreferences,
    lightThemePreferences
  );
  let regenerationAttemptCount = 0;
  let storedThemeGenerationFingerprint = "stale";
  const recordedSteps = [];

  const synchronizedThemeFiles = await synchronizeThemeFiles({
    isLifecycleActive: () => true,
    acquireThemeFileLock: async () => ({
      ownerToken: "generation-drift-lock-owner",
      async release() {},
    }),
    recoverThemeFiles: async () => recordedSteps.push("recover"),
    readCurrentSnapshot: () => {
      recordedSteps.push("snapshot");
      return currentThemeGenerationSnapshot;
    },
    readStoredFingerprint: () => {
      recordedSteps.push("stored-fingerprint");
      return storedThemeGenerationFingerprint;
    },
    regenerateThemeFiles: async () => {
      regenerationAttemptCount += 1;
      recordedSteps.push(`regenerate-${regenerationAttemptCount}`);
      if (regenerationAttemptCount === 1) {
        currentThemeGenerationSnapshot = updatedThemeGenerationSnapshot;
      }
      return true;
    },
    storeCurrentFingerprint: async (themeGenerationFingerprint) => {
      recordedSteps.push("store-fingerprint");
      storedThemeGenerationFingerprint = themeGenerationFingerprint;
    },
  });

  assert.equal(synchronizedThemeFiles, true);
  assert.equal(regenerationAttemptCount, 2);
  assert.equal(storedThemeGenerationFingerprint, updatedThemeGenerationSnapshot.fingerprint);
  assert.deepEqual(recordedSteps, [
    "recover",
    "snapshot",
    "stored-fingerprint",
    "regenerate-1",
    "snapshot",
    "snapshot",
    "regenerate-2",
    "snapshot",
    "store-fingerprint",
  ]);
});

test("requests the configured regeneration retry after startup failure", async () => {
  const regenerationError = new Error("startup regeneration failed");
  const recordedUiActions = [];

  await synchronizeConfiguredThemesWithFeedback(
    async () => {
      recordedUiActions.push("synchronize");
      throw regenerationError;
    },
    {
      promptToReload: async () => recordedUiActions.push("reload"),
      retryThemeRegeneration: async () => recordedUiActions.push("retry"),
      showInformation: async () => recordedUiActions.push("information"),
      showRegenerationError: async (message) => {
        recordedUiActions.push(`error:${message}`);
        return true;
      },
    }
  );

  assert.deepEqual(recordedUiActions, [
    "synchronize",
    "error:Everforest Complete could not regenerate themes: Error: startup regeneration failed",
    "retry",
  ]);
});

test("transitions scheduled mode through a timer callback and reschedules the next boundary", async () => {
  let activeTheme = "Everforest Complete Dark";
  let currentDate = new Date(2026, 7, 30, 18, 0, 0);
  const appliedThemes = [];
  const scheduledThemeSwitches = [];
  let resolveSecondTimerScheduled;
  const secondTimerScheduled = new Promise((resolve) => {
    resolveSecondTimerScheduled = resolve;
  });
  const themeScheduleController = new ThemeScheduleController({
    currentDate: () => currentDate,
    readActiveTheme: () => activeTheme,
    readConfiguredSchedule: () => [
      { time: "07:00", theme: "Everforest Complete Light" },
      { time: "19:00", theme: "Everforest Complete Dark" },
    ],
    readScheduledSwitchingEnabled: () => true,
    readSystemColorSchemeDetectionEnabled: () => false,
    reportScheduleError: async () => {},
    reportSchedulePaused: async () => {},
    scheduleThemeSwitch: (continueThemeSchedule, millisecondsUntilNextSwitch) => {
      const scheduledThemeSwitch = {
        cancelled: false,
        continueThemeSchedule,
        millisecondsUntilNextSwitch,
      };
      scheduledThemeSwitches.push(scheduledThemeSwitch);
      if (scheduledThemeSwitches.length === 2) resolveSecondTimerScheduled();
      return {
        cancel: () => {
          scheduledThemeSwitch.cancelled = true;
        },
      };
    },
    updateActiveTheme: async (themeName, shouldApplyTheme) => {
      if (!shouldApplyTheme()) return;
      activeTheme = themeName;
      appliedThemes.push(themeName);
    },
  });

  await themeScheduleController.restartFromConfiguration();
  currentDate = new Date(2026, 7, 30, 20, 0, 0);
  scheduledThemeSwitches[0].continueThemeSchedule();
  await secondTimerScheduled;

  assert.deepEqual(appliedThemes, ["Everforest Complete Light", "Everforest Complete Dark"]);
  assert.equal(scheduledThemeSwitches[0].cancelled, true);
  assert.equal(scheduledThemeSwitches[1].cancelled, false);
  themeScheduleController.dispose();
  assert.equal(scheduledThemeSwitches[1].cancelled, true);
});

test("drops configuration changes queued when the extension is disposed", async () => {
  let transactionInProgress = true;
  let releaseTransactionSettlement;
  const transactionSettlement = new Promise((resolve) => {
    releaseTransactionSettlement = resolve;
  });
  const reconciledChanges = [];
  const configurationChangeReconciler = createConfigurationChangeReconciler(
    {
      get transactionInProgress() {
        return transactionInProgress;
      },
      settle: () => transactionSettlement,
    },
    (configurationChange) => reconciledChanges.push(configurationChange)
  );

  configurationChangeReconciler.request({
    scheduleAffected: true,
    themePreferencesAffected: true,
  });
  configurationChangeReconciler.dispose();
  transactionInProgress = false;
  releaseTransactionSettlement();
  await transactionSettlement;
  await Promise.resolve();
  configurationChangeReconciler.request({
    scheduleAffected: true,
    themePreferencesAffected: true,
  });

  assert.deepEqual(reconciledChanges, []);
});

test("keeps a disposed schedule controller inactive across queued work", async () => {
  let activeTheme = "Everforest Complete Dark";
  let releaseThemeUpdate;
  const themeUpdateReleased = new Promise((resolve) => {
    releaseThemeUpdate = resolve;
  });
  let reportThemeUpdateStarted;
  const themeUpdateStarted = new Promise((resolve) => {
    reportThemeUpdateStarted = resolve;
  });
  const scheduledThemeSwitches = [];
  const appliedThemes = [];
  const themeScheduleController = new ThemeScheduleController({
    currentDate: () => new Date(2026, 7, 30, 18, 0, 0),
    readActiveTheme: () => activeTheme,
    readConfiguredSchedule: () => [
      { time: "07:00", theme: "Everforest Complete Light" },
      { time: "19:00", theme: "Everforest Complete Dark" },
    ],
    readScheduledSwitchingEnabled: () => true,
    readSystemColorSchemeDetectionEnabled: () => false,
    reportScheduleError: async () => {},
    reportSchedulePaused: async () => {},
    scheduleThemeSwitch: (continueThemeSchedule) => {
      const scheduledThemeSwitch = { cancelled: false };
      scheduledThemeSwitches.push(scheduledThemeSwitch);
      return {
        cancel: () => {
          scheduledThemeSwitch.cancelled = true;
        },
        continueThemeSchedule,
      };
    },
    updateActiveTheme: async (themeName, shouldApplyTheme) => {
      reportThemeUpdateStarted();
      await themeUpdateReleased;
      if (!shouldApplyTheme()) return;
      activeTheme = themeName;
      appliedThemes.push(themeName);
    },
  });

  const inFlightRestart = themeScheduleController.restartFromConfiguration();
  await themeUpdateStarted;
  themeScheduleController.dispose();
  const restartAfterDispose = themeScheduleController.restartFromConfiguration();
  releaseThemeUpdate();

  await Promise.all([inFlightRestart, restartAfterDispose]);
  assert.deepEqual(appliedThemes, []);
  assert.deepEqual(scheduledThemeSwitches, []);
  assert.equal(activeTheme, "Everforest Complete Dark");
});
