import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as vscode from "vscode";
import {
  applyPremiumConfigurationUpdates,
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
  PremiumConfigurationUpdate,
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
import { resolveScheduledTheme } from "./schedule";
import { defaultThemePreferences, generatedThemeFileName, serializeTheme } from "./theme";

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
let nativeConfigurationTransactionInProgress = false;
let queuedNativeConfigurationTransaction: Promise<void> = Promise.resolve();

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

async function applyNativeConfigurationTransaction(
  configurationUpdates: readonly PremiumConfigurationUpdate[]
): Promise<number> {
  const configurationTransaction = queuedNativeConfigurationTransaction.then(async () => {
    nativeConfigurationTransactionInProgress = true;
    try {
      return await applyPremiumConfigurationUpdates(
        configurationUpdates,
        vscodeGlobalConfigurationStorage
      );
    } finally {
      nativeConfigurationTransactionInProgress = false;
    }
  });
  queuedNativeConfigurationTransaction = configurationTransaction.then(
    () => undefined,
    () => undefined
  );
  return configurationTransaction;
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

async function applyConfiguredThemes(
  extensionPath: string,
  notifyWhenCurrent = false
): Promise<void> {
  try {
    const themesChanged = await regenerateConfiguredThemes(extensionPath);
    if (themesChanged) {
      void promptToReloadWindow(
        "Everforest Complete regenerated your Dark and Light themes. Reload once to apply them."
      );
    } else if (notifyWhenCurrent) {
      void vscode.window.showInformationMessage("Everforest Complete themes are current.");
    }
  } catch (regenerationError) {
    void vscode.window.showErrorMessage(
      `Everforest Complete could not regenerate themes: ${String(regenerationError)}`
    );
  }
}

async function reportAppliedThemeConfiguration(
  extensionPath: string,
  configurationUpdateCount: number
): Promise<void> {
  let themesChanged: boolean;
  try {
    themesChanged = await regenerateConfiguredThemes(extensionPath);
  } catch (themeRegenerationError) {
    const retryAction = "Try Again";
    const selectedAction = await vscode.window.showErrorMessage(
      `Everforest Complete saved your choices but could not regenerate theme files: ${String(themeRegenerationError)}`,
      retryAction
    );
    if (selectedAction === retryAction) {
      await vscode.commands.executeCommand("everforestComplete.regenerateThemes");
    }
    return;
  }

  if (themesChanged) {
    await promptToReloadWindow(
      "Everforest Complete applied your choices. Reload once to use the regenerated themes."
    );
    return;
  }

  await vscode.window.showInformationMessage(
    configurationUpdateCount === 0
      ? "Everforest Complete already matches those choices."
      : "Everforest Complete applied your choices."
  );
}

class ThemeScheduleController implements vscode.Disposable {
  private nextThemeSwitchTimeout: NodeJS.Timeout | undefined;
  private queuedScheduleOperation: Promise<void> = Promise.resolve();
  private scheduleConfigurationRevision = 0;

  restartFromConfiguration(): Promise<void> {
    const requestedScheduleRevision = ++this.scheduleConfigurationRevision;
    this.clearNextThemeSwitch();
    const scheduleOperation = this.queuedScheduleOperation.then(async () => {
      this.clearNextThemeSwitch();
      if (requestedScheduleRevision !== this.scheduleConfigurationRevision) return;
      if (!readExtensionConfigurationValue("autoSwitch.enabled", false)) return;
      if (vscode.workspace.getConfiguration("window").get("autoDetectColorScheme", false)) {
        void vscode.window.showWarningMessage(
          "Everforest Complete schedule is paused. Disable Window: Auto Detect Color Scheme first."
        );
        return;
      }
      await this.applyCurrentThemeAndScheduleNextSwitch(requestedScheduleRevision);
    });
    this.queuedScheduleOperation = scheduleOperation.catch(() => undefined);
    return scheduleOperation;
  }

  dispose(): void {
    this.scheduleConfigurationRevision += 1;
    this.clearNextThemeSwitch();
  }

  private clearNextThemeSwitch(): void {
    if (this.nextThemeSwitchTimeout) clearTimeout(this.nextThemeSwitchTimeout);
    this.nextThemeSwitchTimeout = undefined;
  }

  private async applyCurrentThemeAndScheduleNextSwitch(
    requestedScheduleRevision: number
  ): Promise<void> {
    const configuredSchedule = readExtensionConfigurationValue<ScheduledTheme[]>(
      "autoSwitch.schedule",
      defaultThemeSchedule
    );
    for (const scheduledTheme of configuredSchedule) {
      if (!supportedThemeNames.has(scheduledTheme.theme)) {
        throw new Error(`Unsupported scheduled theme: ${scheduledTheme.theme}`);
      }
    }

    const resolvedSchedule = resolveScheduledTheme(configuredSchedule, new Date());
    if (requestedScheduleRevision !== this.scheduleConfigurationRevision) return;
    const workbenchConfiguration = vscode.workspace.getConfiguration("workbench");
    if (workbenchConfiguration.get("colorTheme") !== resolvedSchedule.activeTheme) {
      await workbenchConfiguration.update(
        "colorTheme",
        resolvedSchedule.activeTheme,
        vscode.ConfigurationTarget.Global
      );
    }
    if (requestedScheduleRevision !== this.scheduleConfigurationRevision) return;

    this.nextThemeSwitchTimeout = setTimeout(
      () => void this.continueThemeSchedule(),
      resolvedSchedule.millisecondsUntilNextSwitch + 100
    );
  }

  private async continueThemeSchedule(): Promise<void> {
    try {
      await this.restartFromConfiguration();
    } catch (scheduleError) {
      this.clearNextThemeSwitch();
      await vscode.window.showErrorMessage(
        `Everforest Complete could not apply the theme schedule: ${String(scheduleError)}`
      );
    }
  }
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
  const themeScheduleController = new ThemeScheduleController();
  let themeRegenerationDebounce: NodeJS.Timeout | undefined;

  extensionContext.subscriptions.push(
    themeScheduleController,
    vscode.commands.registerCommand("everforestComplete.configureTheme", async () => {
      const guidedThemeSelections = await collectGuidedThemeSelections(
        readGuidedThemeConfigurationSnapshot()
      );
      if (!guidedThemeSelections) return;

      try {
        const configurationUpdateCount = await applyNativeConfigurationTransaction(
          createGuidedThemeConfigurationUpdates(guidedThemeSelections)
        );
        await themeScheduleController.restartFromConfiguration();
        await vscode.commands.executeCommand(
          "setContext",
          themeConfigurationCompletedContextKey,
          true
        );
        await reportAppliedThemeConfiguration(
          extensionContext.extensionPath,
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
        const configurationUpdateCount = await applyNativeConfigurationTransaction(
          createAdvancedThemeConfigurationUpdates(advancedThemeConfiguration)
        );
        await vscode.commands.executeCommand(
          "setContext",
          themeConfigurationCompletedContextKey,
          true
        );
        await reportAppliedThemeConfiguration(
          extensionContext.extensionPath,
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
        await applyNativeConfigurationTransaction(
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
      applyConfiguredThemes(extensionContext.extensionPath, true)
    ),
    vscode.workspace.onDidChangeConfiguration((configurationChange) => {
      if (nativeConfigurationTransactionInProgress) return;

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
        void applyConfiguredThemes(extensionContext.extensionPath);
      }, 250);
    }),
    {
      dispose: () => {
        if (themeRegenerationDebounce) clearTimeout(themeRegenerationDebounce);
      },
    }
  );

  await applyConfiguredThemes(extensionContext.extensionPath);
  restartThemeScheduleWithErrorReporting(themeScheduleController);
}
