import { join } from "node:path";
import * as vscode from "vscode";
import {
  assertGlobalConfigurationUpdateAllowed,
  createPremiumConfigurationTransactionExecutor,
  createAdvancedThemeConfigurationUpdates,
  createAutomaticSwitchingConfigurationUpdates,
  createConfigurationChangeReconciler,
  createGuidedThemeConfigurationUpdates,
  darkThemeName,
  defaultThemeSchedule,
  inferAppearanceBehavior,
  isBooleanConfigurationValue,
  normalizeThemePreferences,
  validateThemeSchedule,
} from "./configuration";
import type {
  AdvancedThemeConfiguration,
  AutomaticSwitchingMode,
  PremiumConfigurationStorage,
} from "./configuration";
import {
  collectAdvancedThemeConfiguration,
  collectAutomaticSwitchingSelection,
  collectGuidedThemeSelections,
} from "./configuration-ui";
import type { ConfigurationUiHost } from "./configuration-ui";
import type { ScheduledTheme, ThemeAppearance, ThemePreferences } from "./interface";
import { ThemeScheduleController } from "./schedule-controller";
import { defaultThemePreferences, generatedThemeFileName, serializeTheme } from "./theme";
import { createThemeFileLock } from "./theme-file-lock";
import {
  recoverConfiguredThemeFileTransaction,
  replaceConfiguredThemeFiles,
} from "./theme-file-transaction";
import {
  createThemeGenerationSnapshot,
  reportAppliedThemeConfiguration,
  synchronizeConfiguredThemesWithFeedback,
  synchronizeThemeFiles,
} from "./theme-regeneration";
import type {
  ThemeConfigurationUserInterface,
  ThemeGenerationSnapshot,
} from "./theme-regeneration";

const extensionConfigurationSection = "everforestComplete";
const themeConfigurationCompletedContextKey = "everforestComplete.themeConfigurationCompleted";
const automaticSwitchingCompletedContextKey = "everforestComplete.automaticSwitchingCompleted";
const themePreferenceConfigurationKeys = [
  "darkContrast",
  "lightContrast",
  "darkWorkbench",
  "lightWorkbench",
  "darkCursor",
  "lightCursor",
  "darkSelection",
  "lightSelection",
  "italicKeywords",
  "italicComments",
  "diagnosticTextBackgroundOpacity",
  "highContrast",
] as const;

const vscodeConfigurationUiHost: ConfigurationUiHost = {
  showQuickPick: (items, options) => vscode.window.showQuickPick(items, options),
  showInputBox: (options) => vscode.window.showInputBox(options),
};

const vscodeGlobalConfigurationStorage: PremiumConfigurationStorage = {
  readSnapshot(configurationSection, configurationKey) {
    const configurationSnapshot = vscode.workspace
      .getConfiguration(configurationSection)
      .inspect(configurationKey);
    if (!configurationSnapshot) {
      throw new Error(`Unknown configuration: ${configurationSection}.${configurationKey}`);
    }
    return {
      defaultValue: configurationSnapshot.defaultValue,
      globalValue: configurationSnapshot.globalValue,
      workspaceValue: configurationSnapshot.workspaceValue,
      workspaceFolderValue: configurationSnapshot.workspaceFolderValue,
    };
  },
  async updateGlobal(configurationSection, configurationKey, configurationValue) {
    const configurationUpdate = {
      configurationSection,
      configurationKey,
      configurationValue,
    } as const;
    const inspectedConfiguration = vscode.workspace
      .getConfiguration(configurationSection)
      .inspect(configurationKey);
    if (!inspectedConfiguration) {
      throw new Error(`Unknown configuration: ${configurationSection}.${configurationKey}`);
    }
    assertGlobalConfigurationUpdateAllowed(configurationUpdate, {
      defaultValue: inspectedConfiguration.defaultValue,
      globalValue: inspectedConfiguration.globalValue,
      workspaceValue: inspectedConfiguration.workspaceValue,
      workspaceFolderValue: inspectedConfiguration.workspaceFolderValue,
    });
    await vscode.workspace
      .getConfiguration(configurationSection)
      .update(configurationKey, configurationValue, vscode.ConfigurationTarget.Global);
  },
};
const premiumConfigurationTransactionExecutor = createPremiumConfigurationTransactionExecutor(
  vscodeGlobalConfigurationStorage
);

type ThemePreferencesSnapshot = Record<ThemeAppearance, ThemePreferences>;

function readThemePreferencesSnapshot(): ThemePreferencesSnapshot {
  const extensionConfiguration = vscode.workspace.getConfiguration(extensionConfigurationSection);
  const sharedThemePreferenceValues = {
    italicKeywords: extensionConfiguration.get<unknown>("italicKeywords"),
    italicComments: extensionConfiguration.get<unknown>("italicComments"),
    diagnosticTextBackgroundOpacity: extensionConfiguration.get<unknown>(
      "diagnosticTextBackgroundOpacity"
    ),
    highContrast: extensionConfiguration.get<unknown>("highContrast"),
  };
  const readAppearancePreferences = (appearance: ThemeAppearance): ThemePreferences => {
    const appearancePrefix = appearance === "dark" ? "dark" : "light";
    const defaultPreferences = defaultThemePreferences[appearance];
    return normalizeThemePreferences(
      appearance,
      {
        contrast: extensionConfiguration.get<unknown>(`${appearancePrefix}Contrast`),
        workbenchStyle: extensionConfiguration.get<unknown>(`${appearancePrefix}Workbench`),
        cursorColor: extensionConfiguration.get<unknown>(`${appearancePrefix}Cursor`),
        selectionColor: extensionConfiguration.get<unknown>(`${appearancePrefix}Selection`),
        ...sharedThemePreferenceValues,
      },
      defaultPreferences
    );
  };
  return { dark: readAppearancePreferences("dark"), light: readAppearancePreferences("light") };
}

function readAdvancedThemeConfiguration(): AdvancedThemeConfiguration {
  const themePreferencesSnapshot = readThemePreferencesSnapshot();
  return {
    darkCursor: themePreferencesSnapshot.dark.cursorColor,
    lightCursor: themePreferencesSnapshot.light.cursorColor,
    darkSelection: themePreferencesSnapshot.dark.selectionColor,
    lightSelection: themePreferencesSnapshot.light.selectionColor,
    italicKeywords: themePreferencesSnapshot.dark.italicKeywords,
    italicComments: themePreferencesSnapshot.dark.italicComments,
    diagnosticTextBackgroundOpacity: themePreferencesSnapshot.dark.diagnosticTextBackgroundOpacity,
    highContrast: themePreferencesSnapshot.dark.highContrast,
  };
}

function readConfiguredThemeSchedule(): ScheduledTheme[] {
  const configuredSchedule = vscode.workspace
    .getConfiguration(extensionConfigurationSection)
    .get<unknown>("autoSwitch.schedule");
  try {
    return validateThemeSchedule(configuredSchedule ?? defaultThemeSchedule);
  } catch {
    return [...defaultThemeSchedule];
  }
}

function readBooleanConfigurationValue(
  configurationSection: string,
  configurationKey: string,
  fallbackValue: boolean
): boolean {
  const configuredValue = vscode.workspace
    .getConfiguration(configurationSection)
    .get<unknown>(configurationKey);
  return isBooleanConfigurationValue(configuredValue) ? configuredValue : fallbackValue;
}

function readAutomaticSwitchingMode(): AutomaticSwitchingMode {
  if (readBooleanConfigurationValue(extensionConfigurationSection, "autoSwitch.enabled", false)) {
    return "schedule";
  }
  return readBooleanConfigurationValue("window", "autoDetectColorScheme", false) ? "system" : "off";
}

function readGuidedThemeConfigurationSnapshot() {
  const themePreferencesSnapshot = readThemePreferencesSnapshot();
  const workbenchConfiguration = vscode.workspace.getConfiguration("workbench");

  return {
    appearanceBehavior: inferAppearanceBehavior(
      readBooleanConfigurationValue(extensionConfigurationSection, "autoSwitch.enabled", false),
      readBooleanConfigurationValue("window", "autoDetectColorScheme", false),
      workbenchConfiguration.get("colorTheme", darkThemeName)
    ),
    darkContrast: themePreferencesSnapshot.dark.contrast,
    lightContrast: themePreferencesSnapshot.light.contrast,
    darkWorkbench: themePreferencesSnapshot.dark.workbenchStyle,
    lightWorkbench: themePreferencesSnapshot.light.workbenchStyle,
    themeSchedule: readConfiguredThemeSchedule(),
  };
}

async function regenerateConfiguredThemes(
  extensionPath: string,
  themeGenerationSnapshot: ThemeGenerationSnapshot
): Promise<boolean> {
  const configuredThemeFilePaths = getConfiguredThemeFilePaths(extensionPath);
  return replaceConfiguredThemeFiles(configuredThemeFilePaths, {
    darkThemeSource: serializeTheme(themeGenerationSnapshot.dark),
    lightThemeSource: serializeTheme(themeGenerationSnapshot.light),
  });
}

function getConfiguredThemeFilePaths(extensionPath: string) {
  return {
    darkThemePath: join(extensionPath, "themes", generatedThemeFileName("dark")),
    lightThemePath: join(extensionPath, "themes", generatedThemeFileName("light")),
  };
}

async function promptToReloadWindow(
  message: string,
  isExtensionLifecycleActive: () => boolean = () => true
): Promise<void> {
  if (!isExtensionLifecycleActive()) return;
  const reloadAction = "Reload Window";
  const selectedAction = await vscode.window.showInformationMessage(message, reloadAction);
  if (selectedAction === reloadAction && isExtensionLifecycleActive()) {
    await vscode.commands.executeCommand("workbench.action.reloadWindow");
  }
}

function createVscodeThemeConfigurationUserInterface(
  isExtensionLifecycleActive: () => boolean
): ThemeConfigurationUserInterface {
  return {
    promptToReload: (message) => promptToReloadWindow(message, isExtensionLifecycleActive),
    retryThemeRegeneration: async () => {
      if (!isExtensionLifecycleActive()) return;
      await vscode.commands.executeCommand("everforestComplete.regenerateThemes");
    },
    showInformation: async (message) => {
      if (!isExtensionLifecycleActive()) return;
      await vscode.window.showInformationMessage(message);
    },
    showRegenerationError: async (message) => {
      if (!isExtensionLifecycleActive()) return false;
      const retryAction = "Try Again";
      const selectedAction = await vscode.window.showErrorMessage(message, retryAction);
      return isExtensionLifecycleActive() && selectedAction === retryAction;
    },
  };
}

function restartThemeScheduleWithErrorReporting(
  themeScheduleController: ThemeScheduleController
): void {
  void themeScheduleController.restartFromConfiguration().catch((scheduleError) => {
    void vscode.window.showErrorMessage(
      `Everforest Complete could not apply the theme schedule: ${String(scheduleError)}`
    );
  });
}

export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
  let extensionDisposed = false;
  const isExtensionLifecycleActive = () => !extensionDisposed;
  const themeScheduleController = new ThemeScheduleController({
    currentDate: () => new Date(),
    readActiveTheme: () => vscode.workspace.getConfiguration("workbench").get("colorTheme"),
    readConfiguredSchedule: () => readConfiguredThemeSchedule(),
    readScheduledSwitchingEnabled: () =>
      readBooleanConfigurationValue(extensionConfigurationSection, "autoSwitch.enabled", false),
    readSystemColorSchemeDetectionEnabled: () =>
      readBooleanConfigurationValue("window", "autoDetectColorScheme", false),
    reportScheduleError: async (scheduleError) => {
      await vscode.window.showErrorMessage(
        `Everforest Complete could not apply the theme schedule: ${String(scheduleError)}`
      );
    },
    reportSchedulePaused: async () => {
      await vscode.window.showWarningMessage(
        "Everforest Complete schedule is paused. Disable Window: Auto Detect Color Scheme first."
      );
    },
    scheduleThemeSwitch: (continueThemeSchedule, millisecondsUntilNextSwitch) => {
      const themeSwitchTimeout = setTimeout(continueThemeSchedule, millisecondsUntilNextSwitch);
      return { cancel: () => clearTimeout(themeSwitchTimeout) };
    },
    updateActiveTheme: async (themeName, shouldApplyTheme) => {
      if (!shouldApplyTheme()) return;
      await vscodeGlobalConfigurationStorage.updateGlobal("workbench", "colorTheme", themeName);
    },
  });
  let themeRegenerationDebounce: NodeJS.Timeout | undefined;
  const configuredThemeFilePaths = getConfiguredThemeFilePaths(extensionContext.extensionPath);
  const configuredThemeFileLock = createThemeFileLock(
    join(extensionContext.extensionPath, "themes", ".everforest-complete-theme.lock")
  );
  let lastVerifiedThemeGenerationFingerprint: string | undefined;
  const synchronizeConfiguredThemeFiles = () =>
    synchronizeThemeFiles({
      isLifecycleActive: isExtensionLifecycleActive,
      readCurrentSnapshot: () => {
        const themePreferences = readThemePreferencesSnapshot();
        return createThemeGenerationSnapshot(
          extensionContext.extension.packageJSON.version,
          themePreferences.dark,
          themePreferences.light
        );
      },
      readStoredFingerprint: () => lastVerifiedThemeGenerationFingerprint,
      regenerateThemeFiles: (themeGenerationSnapshot) => {
        if (!themeGenerationSnapshot) {
          throw new Error("Theme regeneration requires an immutable theme snapshot");
        }
        return regenerateConfiguredThemes(extensionContext.extensionPath, themeGenerationSnapshot);
      },
      storeCurrentFingerprint: async (themeGenerationFingerprint) => {
        lastVerifiedThemeGenerationFingerprint = themeGenerationFingerprint;
      },
      acquireThemeFileLock: () => configuredThemeFileLock.acquire(),
      recoverThemeFiles: () => recoverConfiguredThemeFileTransaction(configuredThemeFilePaths),
    });

  const themeConfigurationUserInterface = createVscodeThemeConfigurationUserInterface(
    isExtensionLifecycleActive
  );
  const configurationChangeReconciler = createConfigurationChangeReconciler(
    premiumConfigurationTransactionExecutor,
    ({ scheduleAffected, themePreferencesAffected }) => {
      if (scheduleAffected) restartThemeScheduleWithErrorReporting(themeScheduleController);
      if (!themePreferencesAffected) return;

      if (themeRegenerationDebounce) clearTimeout(themeRegenerationDebounce);
      themeRegenerationDebounce = setTimeout(() => {
        themeRegenerationDebounce = undefined;
        void synchronizeConfiguredThemesWithFeedback(
          synchronizeConfiguredThemeFiles,
          themeConfigurationUserInterface
        );
      }, 250);
    }
  );
  const extensionLifecycle = {
    dispose: () => {
      extensionDisposed = true;
      configurationChangeReconciler.dispose();
      if (themeRegenerationDebounce) clearTimeout(themeRegenerationDebounce);
    },
  };

  extensionContext.subscriptions.push(
    extensionLifecycle,
    themeScheduleController,
    configurationChangeReconciler,
    vscode.commands.registerCommand("everforestComplete.configureTheme", async () => {
      try {
        const guidedThemeSelections = await collectGuidedThemeSelections(
          readGuidedThemeConfigurationSnapshot(),
          vscodeConfigurationUiHost
        );
        if (!guidedThemeSelections) return;
        if (!isExtensionLifecycleActive()) return;

        const configurationUpdateCount = await premiumConfigurationTransactionExecutor.apply(
          createGuidedThemeConfigurationUpdates(guidedThemeSelections)
        );
        if (!isExtensionLifecycleActive()) return;
        await themeScheduleController.restartFromConfiguration();
        if (!isExtensionLifecycleActive()) return;
        await vscode.commands.executeCommand(
          "setContext",
          themeConfigurationCompletedContextKey,
          true
        );
        if (!isExtensionLifecycleActive()) return;
        await reportAppliedThemeConfiguration(
          synchronizeConfiguredThemeFiles,
          themeConfigurationUserInterface,
          configurationUpdateCount
        );
      } catch (configurationError) {
        if (!isExtensionLifecycleActive()) return;
        await vscode.window.showErrorMessage(
          `Everforest Complete could not apply your choices: ${String(configurationError)}`
        );
      }
    }),
    vscode.commands.registerCommand("everforestComplete.configureAdvancedControls", async () => {
      try {
        const advancedThemeConfiguration = await collectAdvancedThemeConfiguration(
          readAdvancedThemeConfiguration(),
          vscodeConfigurationUiHost
        );
        if (!advancedThemeConfiguration) return;
        if (!isExtensionLifecycleActive()) return;

        const configurationUpdateCount = await premiumConfigurationTransactionExecutor.apply(
          createAdvancedThemeConfigurationUpdates(advancedThemeConfiguration)
        );
        if (!isExtensionLifecycleActive()) return;
        await vscode.commands.executeCommand(
          "setContext",
          themeConfigurationCompletedContextKey,
          true
        );
        if (!isExtensionLifecycleActive()) return;
        await reportAppliedThemeConfiguration(
          synchronizeConfiguredThemeFiles,
          themeConfigurationUserInterface,
          configurationUpdateCount
        );
      } catch (configurationError) {
        if (!isExtensionLifecycleActive()) return;
        await vscode.window.showErrorMessage(
          `Everforest Complete could not apply advanced controls: ${String(configurationError)}`
        );
      }
    }),
    vscode.commands.registerCommand("everforestComplete.configureAutomaticSwitching", async () => {
      try {
        const automaticSwitchingSelection = await collectAutomaticSwitchingSelection(
          readAutomaticSwitchingMode(),
          readConfiguredThemeSchedule(),
          vscodeConfigurationUiHost
        );
        if (!automaticSwitchingSelection) return;
        if (!isExtensionLifecycleActive()) return;

        await premiumConfigurationTransactionExecutor.apply(
          createAutomaticSwitchingConfigurationUpdates(automaticSwitchingSelection)
        );
        if (!isExtensionLifecycleActive()) return;
        await themeScheduleController.restartFromConfiguration();
        if (!isExtensionLifecycleActive()) return;
        await vscode.commands.executeCommand(
          "setContext",
          automaticSwitchingCompletedContextKey,
          true
        );
        if (!isExtensionLifecycleActive()) return;
        await vscode.window.showInformationMessage(
          automaticSwitchingSelection.switchingMode === "off"
            ? "Everforest Complete automatic switching is off."
            : automaticSwitchingSelection.switchingMode === "system"
              ? "Everforest Complete now follows your operating system."
              : "Everforest Complete now follows your local schedule."
        );
      } catch (configurationError) {
        if (!isExtensionLifecycleActive()) return;
        await vscode.window.showErrorMessage(
          `Everforest Complete could not configure automatic switching: ${String(configurationError)}`
        );
      }
    }),
    vscode.commands.registerCommand("everforestComplete.regenerateThemes", () => {
      if (!isExtensionLifecycleActive()) return Promise.resolve();
      return synchronizeConfiguredThemesWithFeedback(
        synchronizeConfiguredThemeFiles,
        themeConfigurationUserInterface,
        true
      );
    }),
    vscode.workspace.onDidChangeConfiguration((configurationChange) => {
      const scheduleAffected =
        configurationChange.affectsConfiguration(`${extensionConfigurationSection}.autoSwitch`) ||
        configurationChange.affectsConfiguration("window.autoDetectColorScheme");

      const themePreferencesChanged = themePreferenceConfigurationKeys.some((configurationKey) =>
        configurationChange.affectsConfiguration(
          `${extensionConfigurationSection}.${configurationKey}`
        )
      );
      if (!scheduleAffected && !themePreferencesChanged) return;
      configurationChangeReconciler.request({
        scheduleAffected,
        themePreferencesAffected: themePreferencesChanged,
      });
    })
  );

  await synchronizeConfiguredThemesWithFeedback(
    synchronizeConfiguredThemeFiles,
    themeConfigurationUserInterface
  );
  if (!isExtensionLifecycleActive()) return;
  restartThemeScheduleWithErrorReporting(themeScheduleController);
}
