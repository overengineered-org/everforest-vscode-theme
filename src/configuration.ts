import type {
  DiagnosticTextBackgroundOpacity,
  ScheduledTheme,
  ThemeContrast,
  ThemeCursorColor,
  ThemeSelectionColor,
  ThemeWorkbenchStyle,
} from "./interface";

export const darkThemeName = "Everforest Complete Dark";
export const lightThemeName = "Everforest Complete Light";
export const supportedThemeNames: ReadonlySet<string> = new Set([darkThemeName, lightThemeName]);
export const defaultThemeSchedule: ScheduledTheme[] = [
  { time: "07:00", theme: lightThemeName },
  { time: "19:00", theme: darkThemeName },
];

export type AppearanceBehavior = "dark" | "light" | "system" | "schedule";
export type AutomaticSwitchingMode = "off" | "system" | "schedule";
export type PremiumConfigurationSection = "everforestComplete" | "window" | "workbench";

export interface PremiumConfigurationUpdate {
  configurationSection: PremiumConfigurationSection;
  configurationKey: string;
  configurationValue: unknown;
}

export interface PremiumConfigurationSnapshot {
  defaultValue: unknown;
  globalValue: unknown;
}

export interface PremiumConfigurationStorage {
  readSnapshot(
    configurationSection: PremiumConfigurationSection,
    configurationKey: string
  ): PremiumConfigurationSnapshot;
  updateGlobal(
    configurationSection: PremiumConfigurationSection,
    configurationKey: string,
    configurationValue: unknown
  ): Promise<void>;
}

export interface PremiumConfigurationTransactionExecutor {
  readonly transactionInProgress: boolean;
  apply(configurationUpdates: readonly PremiumConfigurationUpdate[]): Promise<number>;
}

export interface GuidedThemeSelections {
  appearanceBehavior: AppearanceBehavior;
  contrast: ThemeContrast;
  workbenchStyle: ThemeWorkbenchStyle;
}

export interface AdvancedThemeConfiguration {
  darkCursor: ThemeCursorColor;
  lightCursor: ThemeCursorColor;
  darkSelection: ThemeSelectionColor;
  lightSelection: ThemeSelectionColor;
  italicKeywords: boolean;
  italicComments: boolean;
  diagnosticTextBackgroundOpacity: DiagnosticTextBackgroundOpacity;
  highContrast: boolean;
}

export interface AutomaticSwitchingSelection {
  switchingMode: AutomaticSwitchingMode;
  themeSchedule?: ScheduledTheme[];
}

function extensionConfigurationUpdate(
  configurationKey: string,
  configurationValue: unknown
): PremiumConfigurationUpdate {
  return {
    configurationSection: "everforestComplete",
    configurationKey,
    configurationValue,
  };
}

function nativeConfigurationUpdate(
  configurationSection: "window" | "workbench",
  configurationKey: string,
  configurationValue: unknown
): PremiumConfigurationUpdate {
  return { configurationSection, configurationKey, configurationValue };
}

function configurationValuesMatch(
  currentConfigurationValue: unknown,
  requestedConfigurationValue: unknown
): boolean {
  return JSON.stringify(currentConfigurationValue) === JSON.stringify(requestedConfigurationValue);
}

export async function applyPremiumConfigurationUpdates(
  configurationUpdates: readonly PremiumConfigurationUpdate[],
  configurationStorage: PremiumConfigurationStorage
): Promise<number> {
  const changedConfigurationUpdates = configurationUpdates.flatMap((configurationUpdate) => {
    const configurationSnapshot = configurationStorage.readSnapshot(
      configurationUpdate.configurationSection,
      configurationUpdate.configurationKey
    );
    const currentGlobalValue =
      configurationSnapshot.globalValue === undefined
        ? configurationSnapshot.defaultValue
        : configurationSnapshot.globalValue;

    return configurationValuesMatch(currentGlobalValue, configurationUpdate.configurationValue)
      ? []
      : [{ configurationUpdate, previousGlobalValue: configurationSnapshot.globalValue }];
  });
  const attemptedConfigurationUpdates = [] as typeof changedConfigurationUpdates;

  try {
    for (const changedConfigurationUpdate of changedConfigurationUpdates) {
      const { configurationUpdate } = changedConfigurationUpdate;
      attemptedConfigurationUpdates.push(changedConfigurationUpdate);
      await configurationStorage.updateGlobal(
        configurationUpdate.configurationSection,
        configurationUpdate.configurationKey,
        configurationUpdate.configurationValue
      );
    }
  } catch (configurationApplicationError) {
    const rollbackErrors: unknown[] = [];
    for (const attemptedConfigurationUpdate of [...attemptedConfigurationUpdates].reverse()) {
      const { configurationUpdate, previousGlobalValue } = attemptedConfigurationUpdate;
      try {
        await configurationStorage.updateGlobal(
          configurationUpdate.configurationSection,
          configurationUpdate.configurationKey,
          previousGlobalValue
        );
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }

    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [configurationApplicationError, ...rollbackErrors],
        "Everforest Complete could not roll back every configuration change"
      );
    }
    throw configurationApplicationError;
  }

  return attemptedConfigurationUpdates.length;
}

export function createPremiumConfigurationTransactionExecutor(
  configurationStorage: PremiumConfigurationStorage
): PremiumConfigurationTransactionExecutor {
  let transactionInProgress = false;
  let queuedConfigurationTransaction: Promise<void> = Promise.resolve();

  return {
    get transactionInProgress() {
      return transactionInProgress;
    },
    apply(configurationUpdates) {
      const configurationTransaction = queuedConfigurationTransaction.then(async () => {
        transactionInProgress = true;
        try {
          return await applyPremiumConfigurationUpdates(configurationUpdates, configurationStorage);
        } finally {
          transactionInProgress = false;
        }
      });
      queuedConfigurationTransaction = configurationTransaction.then(
        () => undefined,
        () => undefined
      );
      return configurationTransaction;
    },
  };
}

function automaticBehaviorUpdates(
  appearanceBehavior: AppearanceBehavior
): PremiumConfigurationUpdate[] {
  if (appearanceBehavior === "system") {
    return [
      extensionConfigurationUpdate("autoSwitch.enabled", false),
      nativeConfigurationUpdate("window", "autoDetectColorScheme", true),
      nativeConfigurationUpdate("workbench", "preferredDarkColorTheme", darkThemeName),
      nativeConfigurationUpdate("workbench", "preferredLightColorTheme", lightThemeName),
    ];
  }

  if (appearanceBehavior === "schedule") {
    return [
      nativeConfigurationUpdate("window", "autoDetectColorScheme", false),
      extensionConfigurationUpdate("autoSwitch.enabled", true),
    ];
  }

  const activeThemeName = appearanceBehavior === "dark" ? darkThemeName : lightThemeName;
  return [
    extensionConfigurationUpdate("autoSwitch.enabled", false),
    nativeConfigurationUpdate("window", "autoDetectColorScheme", false),
    nativeConfigurationUpdate("workbench", "colorTheme", activeThemeName),
  ];
}

export function createGuidedThemeConfigurationUpdates(
  guidedThemeSelections: GuidedThemeSelections
): PremiumConfigurationUpdate[] {
  const appearancePrefixes =
    guidedThemeSelections.appearanceBehavior === "dark" ||
    guidedThemeSelections.appearanceBehavior === "light"
      ? [guidedThemeSelections.appearanceBehavior]
      : ["dark", "light"];

  return [
    ...automaticBehaviorUpdates(guidedThemeSelections.appearanceBehavior),
    ...appearancePrefixes.flatMap((appearancePrefix) => [
      extensionConfigurationUpdate(`${appearancePrefix}Contrast`, guidedThemeSelections.contrast),
      extensionConfigurationUpdate(
        `${appearancePrefix}Workbench`,
        guidedThemeSelections.workbenchStyle
      ),
    ]),
  ];
}

export function createAdvancedThemeConfigurationUpdates(
  advancedThemeConfiguration: AdvancedThemeConfiguration
): PremiumConfigurationUpdate[] {
  return Object.entries(advancedThemeConfiguration).map(([configurationKey, configurationValue]) =>
    extensionConfigurationUpdate(configurationKey, configurationValue)
  );
}

export function createAutomaticSwitchingConfigurationUpdates(
  automaticSwitchingSelection: AutomaticSwitchingSelection
): PremiumConfigurationUpdate[] {
  if (automaticSwitchingSelection.switchingMode === "off") {
    return [
      extensionConfigurationUpdate("autoSwitch.enabled", false),
      nativeConfigurationUpdate("window", "autoDetectColorScheme", false),
    ];
  }

  if (automaticSwitchingSelection.switchingMode === "system") {
    return [
      extensionConfigurationUpdate("autoSwitch.enabled", false),
      nativeConfigurationUpdate("window", "autoDetectColorScheme", true),
      nativeConfigurationUpdate("workbench", "preferredDarkColorTheme", darkThemeName),
      nativeConfigurationUpdate("workbench", "preferredLightColorTheme", lightThemeName),
    ];
  }

  if (!automaticSwitchingSelection.themeSchedule) {
    throw new Error("Scheduled switching requires a theme schedule");
  }

  return [
    nativeConfigurationUpdate("window", "autoDetectColorScheme", false),
    extensionConfigurationUpdate("autoSwitch.schedule", automaticSwitchingSelection.themeSchedule),
    extensionConfigurationUpdate("autoSwitch.enabled", true),
  ];
}

export function inferAppearanceBehavior(
  scheduledSwitchingEnabled: boolean,
  systemColorSchemeDetectionEnabled: boolean,
  activeThemeName: string
): AppearanceBehavior {
  if (scheduledSwitchingEnabled) return "schedule";
  if (systemColorSchemeDetectionEnabled) return "system";
  return activeThemeName.includes("Light") ? "light" : "dark";
}

export function createDailyThemeSchedule(
  lightThemeStartTime: string,
  darkThemeStartTime: string
): ScheduledTheme[] {
  if (!isValidScheduleTime(lightThemeStartTime)) {
    throw new Error(`Invalid Light theme start time: ${lightThemeStartTime}`);
  }
  if (!isValidScheduleTime(darkThemeStartTime)) {
    throw new Error(`Invalid Dark theme start time: ${darkThemeStartTime}`);
  }
  if (lightThemeStartTime === darkThemeStartTime) {
    throw new Error("Light and Dark theme start times must differ");
  }

  return [
    { time: lightThemeStartTime, theme: lightThemeName },
    { time: darkThemeStartTime, theme: darkThemeName },
  ];
}

export function isValidScheduleTime(scheduleTime: string): boolean {
  return /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/.test(scheduleTime);
}

export function themeStartTime(
  themeSchedule: readonly ScheduledTheme[],
  themeName: string,
  fallbackTime: string
): string {
  return (
    themeSchedule.find((scheduledTheme) => scheduledTheme.theme === themeName)?.time ?? fallbackTime
  );
}

export function formatThemeSchedule(themeSchedule: readonly ScheduledTheme[]): string {
  return [...themeSchedule]
    .sort((firstScheduledTheme, secondScheduledTheme) =>
      firstScheduledTheme.time.localeCompare(secondScheduledTheme.time)
    )
    .map((scheduledTheme) => {
      const appearanceLabel =
        scheduledTheme.theme === lightThemeName
          ? "Light"
          : scheduledTheme.theme === darkThemeName
            ? "Dark"
            : scheduledTheme.theme;
      return `${scheduledTheme.time} ${appearanceLabel}`;
    })
    .join(" · ");
}
