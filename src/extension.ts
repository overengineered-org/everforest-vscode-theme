import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as vscode from "vscode";
import {
  createPremiumConfigurationTransactionExecutor,
  createAdvancedThemeConfigurationUpdates,
  createAutomaticSwitchingConfigurationUpdates,
  createGuidedThemeConfigurationUpdates,
  darkThemeName,
  defaultThemeSchedule,
  inferAppearanceBehavior,
  supportedThemeNames,
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
import type {
  DiagnosticTextBackgroundOpacity,
  ScheduledTheme,
  ThemeAppearance,
  ThemeContrast,
  ThemeCursorColor,
  ThemePreferences,
  ThemeSelectionColor,
  ThemeWorkbenchStyle,
} from "./interface";
import { ThemeScheduleController } from "./schedule-controller";
import { defaultThemePreferences, generatedThemeFileName, serializeTheme } from "./theme";
import {
  createThemeGenerationFingerprint,
  reportAppliedThemeConfiguration,
  synchronizeConfiguredThemesWithFeedback,
  synchronizeThemeFiles,
} from "./theme-regeneration";
import type { ThemeConfigurationUserInterface } from "./theme-regeneration";

const extensionConfigurationSection = "everforestComplete";
const themeGenerationFingerprintStateKey = "everforestComplete.themeGenerationFingerprint";
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
    };
  },
  async updateGlobal(configurationSection, configurationKey, configurationValue) {
    await vscode.workspace
      .getConfiguration(configurationSection)
      .update(configurationKey, configurationValue, vscode.ConfigurationTarget.Global);
  },
};
const premiumConfigurationTransactionExecutor = createPremiumConfigurationTransactionExecutor(
  vscodeGlobalConfigurationStorage
);

function readExtensionConfigurationValue<T>(configurationKey: string, fallbackValue: T): T {
  return (
    vscode.workspace.getConfiguration(extensionConfigurationSection).get<T>(configurationKey) ??
    fallbackValue
  );
}

function readThemePreferences(appearance: ThemeAppearance): ThemePreferences {
  const appearancePrefix = appearance === "dark" ? "dark" : "light";
  const defaultPreferences = defaultThemePreferences[appearance];

  return {
    appearance,
    contrast: readExtensionConfigurationValue<ThemeContrast>(
      `${appearancePrefix}Contrast`,
      defaultPreferences.contrast
    ),
    workbenchStyle: readExtensionConfigurationValue<ThemeWorkbenchStyle>(
      `${appearancePrefix}Workbench`,
      defaultPreferences.workbenchStyle
    ),
    cursorColor: readExtensionConfigurationValue<ThemeCursorColor>(
      `${appearancePrefix}Cursor`,
      defaultPreferences.cursorColor
    ),
    selectionColor: readExtensionConfigurationValue<ThemeSelectionColor>(
      `${appearancePrefix}Selection`,
      defaultPreferences.selectionColor
    ),
    italicKeywords: readExtensionConfigurationValue(
      "italicKeywords",
      defaultPreferences.italicKeywords
    ),
    italicComments: readExtensionConfigurationValue(
      "italicComments",
      defaultPreferences.italicComments
    ),
    diagnosticTextBackgroundOpacity:
      readExtensionConfigurationValue<DiagnosticTextBackgroundOpacity>(
        "diagnosticTextBackgroundOpacity",
        defaultPreferences.diagnosticTextBackgroundOpacity
      ),
    highContrast: readExtensionConfigurationValue("highContrast", defaultPreferences.highContrast),
  };
}

function readAdvancedThemeConfiguration(): AdvancedThemeConfiguration {
  const darkDefaultPreferences = defaultThemePreferences.dark;
  const lightDefaultPreferences = defaultThemePreferences.light;
  return {
    darkCursor: readExtensionConfigurationValue("darkCursor", darkDefaultPreferences.cursorColor),
    lightCursor: readExtensionConfigurationValue(
      "lightCursor",
      lightDefaultPreferences.cursorColor
    ),
    darkSelection: readExtensionConfigurationValue(
      "darkSelection",
      darkDefaultPreferences.selectionColor
    ),
    lightSelection: readExtensionConfigurationValue(
      "lightSelection",
      lightDefaultPreferences.selectionColor
    ),
    italicKeywords: readExtensionConfigurationValue(
      "italicKeywords",
      darkDefaultPreferences.italicKeywords
    ),
    italicComments: readExtensionConfigurationValue(
      "italicComments",
      darkDefaultPreferences.italicComments
    ),
    diagnosticTextBackgroundOpacity: readExtensionConfigurationValue(
      "diagnosticTextBackgroundOpacity",
      darkDefaultPreferences.diagnosticTextBackgroundOpacity
    ),
    highContrast: readExtensionConfigurationValue(
      "highContrast",
      darkDefaultPreferences.highContrast
    ),
  };
}

function readConfiguredThemeSchedule(): ScheduledTheme[] {
  return readExtensionConfigurationValue("autoSwitch.schedule", defaultThemeSchedule);
}

function readAutomaticSwitchingMode(): AutomaticSwitchingMode {
  if (readExtensionConfigurationValue("autoSwitch.enabled", false)) return "schedule";
  return vscode.workspace.getConfiguration("window").get("autoDetectColorScheme", false)
    ? "system"
    : "off";
}

function readGuidedThemeConfigurationSnapshot() {
  const darkThemePreferences = readThemePreferences("dark");
  const lightThemePreferences = readThemePreferences("light");
  const workbenchConfiguration = vscode.workspace.getConfiguration("workbench");

  return {
    appearanceBehavior: inferAppearanceBehavior(
      readExtensionConfigurationValue("autoSwitch.enabled", false),
      vscode.workspace.getConfiguration("window").get("autoDetectColorScheme", false),
      workbenchConfiguration.get("colorTheme", darkThemeName)
    ),
    darkContrast: darkThemePreferences.contrast,
    lightContrast: lightThemePreferences.contrast,
    darkWorkbench: darkThemePreferences.workbenchStyle,
    lightWorkbench: lightThemePreferences.workbenchStyle,
    themeSchedule: readConfiguredThemeSchedule(),
  };
}

async function writeThemeWhenChanged(themePath: string, themeSource: string): Promise<boolean> {
  const installedThemeSource = await readFile(themePath, "utf8");
  if (installedThemeSource === themeSource) return false;

  await writeFile(themePath, themeSource, "utf8");
  return true;
}

async function regenerateConfiguredThemes(extensionPath: string): Promise<boolean> {
  const themeFileChanges = await Promise.all(
    (["dark", "light"] as const).map((appearance) =>
      writeThemeWhenChanged(
        join(extensionPath, "themes", generatedThemeFileName(appearance)),
        serializeTheme(readThemePreferences(appearance))
      )
    )
  );

  return themeFileChanges.some(Boolean);
}

async function promptToReloadWindow(message: string): Promise<void> {
  const reloadAction = "Reload Window";
  const selectedAction = await vscode.window.showInformationMessage(message, reloadAction);
  if (selectedAction === reloadAction) {
    await vscode.commands.executeCommand("workbench.action.reloadWindow");
  }
}

const vscodeThemeConfigurationUserInterface: ThemeConfigurationUserInterface = {
  promptToReload: promptToReloadWindow,
  retryThemeRegeneration: async () => {
    await vscode.commands.executeCommand("everforestComplete.regenerateThemes");
  },
  showInformation: async (message) => {
    await vscode.window.showInformationMessage(message);
  },
  showRegenerationError: async (message) => {
    const retryAction = "Try Again";
    return (await vscode.window.showErrorMessage(message, retryAction)) === retryAction;
  },
};

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
  const themeScheduleController = new ThemeScheduleController({
    currentDate: () => new Date(),
    isScheduledThemeSupported: (themeName) => supportedThemeNames.has(themeName),
    readActiveTheme: () => vscode.workspace.getConfiguration("workbench").get("colorTheme"),
    readConfiguredSchedule: () => readConfiguredThemeSchedule(),
    readScheduledSwitchingEnabled: () =>
      readExtensionConfigurationValue("autoSwitch.enabled", false),
    readSystemColorSchemeDetectionEnabled: () =>
      vscode.workspace.getConfiguration("window").get("autoDetectColorScheme", false),
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
    updateActiveTheme: async (themeName) => {
      await vscode.workspace
        .getConfiguration("workbench")
        .update("colorTheme", themeName, vscode.ConfigurationTarget.Global);
    },
  });
  let themeRegenerationDebounce: NodeJS.Timeout | undefined;
  const synchronizeConfiguredThemeFiles = (forceRegeneration = false) =>
    synchronizeThemeFiles(
      {
        readCurrentFingerprint: () =>
          createThemeGenerationFingerprint(
            extensionContext.extension.packageJSON.version,
            readThemePreferences("dark"),
            readThemePreferences("light")
          ),
        readStoredFingerprint: () =>
          extensionContext.globalState.get<string>(themeGenerationFingerprintStateKey),
        regenerateThemeFiles: () => regenerateConfiguredThemes(extensionContext.extensionPath),
        storeCurrentFingerprint: async (themeGenerationFingerprint) =>
          await extensionContext.globalState.update(
            themeGenerationFingerprintStateKey,
            themeGenerationFingerprint
          ),
      },
      forceRegeneration
    );

  extensionContext.subscriptions.push(
    themeScheduleController,
    vscode.commands.registerCommand("everforestComplete.configureTheme", async () => {
      const guidedThemeSelections = await collectGuidedThemeSelections(
        readGuidedThemeConfigurationSnapshot()
      );
      if (!guidedThemeSelections) return;

      try {
        const configurationUpdateCount = await premiumConfigurationTransactionExecutor.apply(
          createGuidedThemeConfigurationUpdates(guidedThemeSelections)
        );
        await themeScheduleController.restartFromConfiguration();
        await vscode.commands.executeCommand(
          "setContext",
          themeConfigurationCompletedContextKey,
          true
        );
        await reportAppliedThemeConfiguration(
          synchronizeConfiguredThemeFiles,
          vscodeThemeConfigurationUserInterface,
          configurationUpdateCount
        );
      } catch (configurationError) {
        await vscode.window.showErrorMessage(
          `Everforest Complete could not apply your choices: ${String(configurationError)}`
        );
      }
    }),
    vscode.commands.registerCommand("everforestComplete.configureAdvancedControls", async () => {
      const advancedThemeConfiguration = await collectAdvancedThemeConfiguration(
        readAdvancedThemeConfiguration()
      );
      if (!advancedThemeConfiguration) return;

      try {
        const configurationUpdateCount = await premiumConfigurationTransactionExecutor.apply(
          createAdvancedThemeConfigurationUpdates(advancedThemeConfiguration)
        );
        await vscode.commands.executeCommand(
          "setContext",
          themeConfigurationCompletedContextKey,
          true
        );
        await reportAppliedThemeConfiguration(
          synchronizeConfiguredThemeFiles,
          vscodeThemeConfigurationUserInterface,
          configurationUpdateCount
        );
      } catch (configurationError) {
        await vscode.window.showErrorMessage(
          `Everforest Complete could not apply advanced controls: ${String(configurationError)}`
        );
      }
    }),
    vscode.commands.registerCommand("everforestComplete.configureAutomaticSwitching", async () => {
      const automaticSwitchingSelection = await collectAutomaticSwitchingSelection(
        readAutomaticSwitchingMode(),
        readConfiguredThemeSchedule()
      );
      if (!automaticSwitchingSelection) return;

      try {
        await premiumConfigurationTransactionExecutor.apply(
          createAutomaticSwitchingConfigurationUpdates(automaticSwitchingSelection)
        );
        await themeScheduleController.restartFromConfiguration();
        await vscode.commands.executeCommand(
          "setContext",
          automaticSwitchingCompletedContextKey,
          true
        );
        await vscode.window.showInformationMessage(
          automaticSwitchingSelection.switchingMode === "off"
            ? "Everforest Complete automatic switching is off."
            : automaticSwitchingSelection.switchingMode === "system"
              ? "Everforest Complete now follows your operating system."
              : "Everforest Complete now follows your local schedule."
        );
      } catch (configurationError) {
        await vscode.window.showErrorMessage(
          `Everforest Complete could not configure automatic switching: ${String(configurationError)}`
        );
      }
    }),
    vscode.commands.registerCommand("everforestComplete.regenerateThemes", () =>
      synchronizeConfiguredThemesWithFeedback(
        () => synchronizeConfiguredThemeFiles(true),
        vscodeThemeConfigurationUserInterface,
        true
      )
    ),
    vscode.workspace.onDidChangeConfiguration((configurationChange) => {
      if (premiumConfigurationTransactionExecutor.transactionInProgress) return;

      if (
        configurationChange.affectsConfiguration(`${extensionConfigurationSection}.autoSwitch`) ||
        configurationChange.affectsConfiguration("window.autoDetectColorScheme")
      ) {
        restartThemeScheduleWithErrorReporting(themeScheduleController);
      }

      const themePreferencesChanged = themePreferenceConfigurationKeys.some((configurationKey) =>
        configurationChange.affectsConfiguration(
          `${extensionConfigurationSection}.${configurationKey}`
        )
      );
      if (!themePreferencesChanged) return;

      if (themeRegenerationDebounce) clearTimeout(themeRegenerationDebounce);
      themeRegenerationDebounce = setTimeout(() => {
        themeRegenerationDebounce = undefined;
        void synchronizeConfiguredThemesWithFeedback(
          synchronizeConfiguredThemeFiles,
          vscodeThemeConfigurationUserInterface
        );
      }, 250);
    }),
    {
      dispose: () => {
        if (themeRegenerationDebounce) clearTimeout(themeRegenerationDebounce);
      },
    }
  );

  await synchronizeConfiguredThemesWithFeedback(
    synchronizeConfiguredThemeFiles,
    vscodeThemeConfigurationUserInterface
  );
  restartThemeScheduleWithErrorReporting(themeScheduleController);
}
