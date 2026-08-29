import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as vscode from "vscode";
import {
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
const darkThemeName = "Everforest Complete Dark";
const lightThemeName = "Everforest Complete Light";
const supportedThemeNames = new Set([darkThemeName, lightThemeName]);
const defaultThemeSchedule: ScheduledTheme[] = [
  { time: "07:00", theme: lightThemeName },
  { time: "19:00", theme: darkThemeName },
];
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

async function promptToReloadWindow(): Promise<void> {
  const reloadAction = "Reload Window";
  const selectedAction = await vscode.window.showInformationMessage(
    "Everforest Complete regenerated your Dark and Light themes.",
    reloadAction
  );
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
    if (themesChanged) void promptToReloadWindow();
    else if (notifyWhenCurrent) {
      void vscode.window.showInformationMessage("Everforest Complete themes are current.");
    }
  } catch (regenerationError) {
    void vscode.window.showErrorMessage(
      `Everforest Complete could not regenerate themes: ${String(regenerationError)}`
    );
  }
}

class ThemeScheduleController implements vscode.Disposable {
  private nextThemeSwitchTimeout: NodeJS.Timeout | undefined;

  restartFromConfiguration(): void {
    this.stop();
    if (!readExtensionConfigurationValue("autoSwitch.enabled", false)) return;
    if (vscode.workspace.getConfiguration("window").get("autoDetectColorScheme", false)) {
      void vscode.window.showWarningMessage(
        "Everforest Complete schedule is paused. Disable Window: Auto Detect Color Scheme first."
      );
      return;
    }
    void this.applyCurrentThemeAndScheduleNextSwitch();
  }

  dispose(): void {
    this.stop();
  }

  private stop(): void {
    if (this.nextThemeSwitchTimeout) clearTimeout(this.nextThemeSwitchTimeout);
    this.nextThemeSwitchTimeout = undefined;
  }

  private async applyCurrentThemeAndScheduleNextSwitch(): Promise<void> {
    try {
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
      const workbenchConfiguration = vscode.workspace.getConfiguration("workbench");
      if (workbenchConfiguration.get("colorTheme") !== resolvedSchedule.activeTheme) {
        await workbenchConfiguration.update(
          "colorTheme",
          resolvedSchedule.activeTheme,
          vscode.ConfigurationTarget.Global
        );
      }

      this.nextThemeSwitchTimeout = setTimeout(
        () => void this.applyCurrentThemeAndScheduleNextSwitch(),
        resolvedSchedule.millisecondsUntilNextSwitch + 100
      );
    } catch (scheduleError) {
      this.stop();
      await vscode.window.showErrorMessage(
        `Everforest Complete could not apply the theme schedule: ${String(scheduleError)}`
      );
    }
  }
}

export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
  const themeScheduleController = new ThemeScheduleController();
  let themeRegenerationDebounce: NodeJS.Timeout | undefined;

  extensionContext.subscriptions.push(
    themeScheduleController,
    vscode.commands.registerCommand("everforestComplete.openSettings", () =>
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:overengineered-org.everforest-complete"
      )
    ),
    vscode.commands.registerCommand("everforestComplete.regenerateThemes", () =>
      applyConfiguredThemes(extensionContext.extensionPath, true)
    ),
    vscode.workspace.onDidChangeConfiguration((configurationChange) => {
      if (
        configurationChange.affectsConfiguration(`${extensionConfigurationSection}.autoSwitch`) ||
        configurationChange.affectsConfiguration("window.autoDetectColorScheme")
      ) {
        themeScheduleController.restartFromConfiguration();
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
  themeScheduleController.restartFromConfiguration();
}
