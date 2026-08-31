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

export const darkThemeName = "Everforest Complete Dark";
export const lightThemeName = "Everforest Complete Light";
export const supportedThemeNames: ReadonlySet<string> = new Set([darkThemeName, lightThemeName]);
export const defaultThemeSchedule: ScheduledTheme[] = [
  { time: "07:00", theme: lightThemeName },
  { time: "19:00", theme: darkThemeName },
];

const themeContrastValues = ["soft", "medium", "hard"] as const;
const themeWorkbenchStyleValues = ["material", "flat", "high-contrast"] as const;
const themeCursorColorValues = [
  "white",
  "black",
  "red",
  "orange",
  "yellow",
  "green",
  "aqua",
  "blue",
  "purple",
] as const;
const themeSelectionColorValues = [
  "grey",
  "red",
  "orange",
  "yellow",
  "green",
  "aqua",
  "blue",
  "purple",
] as const;
const diagnosticTextBackgroundOpacityValues = ["0%", "12.5%", "25%", "37.5%", "50%"] as const;

export function isThemeContrast(configurationValue: unknown): configurationValue is ThemeContrast {
  return (
    typeof configurationValue === "string" &&
    (themeContrastValues as readonly string[]).includes(configurationValue)
  );
}

export function isThemeWorkbenchStyle(
  configurationValue: unknown
): configurationValue is ThemeWorkbenchStyle {
  return (
    typeof configurationValue === "string" &&
    (themeWorkbenchStyleValues as readonly string[]).includes(configurationValue)
  );
}

export function isThemeCursorColor(
  configurationValue: unknown
): configurationValue is ThemeCursorColor {
  return (
    typeof configurationValue === "string" &&
    (themeCursorColorValues as readonly string[]).includes(configurationValue)
  );
}

export function isThemeSelectionColor(
  configurationValue: unknown
): configurationValue is ThemeSelectionColor {
  return (
    typeof configurationValue === "string" &&
    (themeSelectionColorValues as readonly string[]).includes(configurationValue)
  );
}

export function isDiagnosticTextBackgroundOpacity(
  configurationValue: unknown
): configurationValue is DiagnosticTextBackgroundOpacity {
  return (
    typeof configurationValue === "string" &&
    (diagnosticTextBackgroundOpacityValues as readonly string[]).includes(configurationValue)
  );
}

export function isBooleanConfigurationValue(
  configurationValue: unknown
): configurationValue is boolean {
  return typeof configurationValue === "boolean";
}

export function isValidScheduleTime(scheduleTime: unknown): scheduleTime is string {
  return (
    typeof scheduleTime === "string" && /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/.test(scheduleTime)
  );
}

export function validateThemeSchedule(themeSchedule: unknown): ScheduledTheme[] {
  if (!Array.isArray(themeSchedule)) {
    throw new Error("Theme schedule must contain exactly one Light and one Dark boundary");
  }
  if (themeSchedule.length === 0) throw new Error("Theme schedule cannot be empty");
  const scheduleTimes = themeSchedule
    .filter(
      (scheduledTheme): scheduledTheme is Record<string, unknown> =>
        !!scheduledTheme && typeof scheduledTheme === "object"
    )
    .map((scheduledTheme) => scheduledTheme.time)
    .filter((scheduleTime): scheduleTime is string => typeof scheduleTime === "string");
  if (new Set(scheduleTimes).size !== scheduleTimes.length) {
    throw new Error("Theme schedule cannot contain duplicate times");
  }
  const validatedThemeSchedule = themeSchedule.map((scheduledTheme, scheduleIndex) => {
    if (!scheduledTheme || typeof scheduledTheme !== "object") {
      throw new Error(`Theme schedule boundary ${scheduleIndex + 1} must be an object`);
    }
    const scheduleRecord = scheduledTheme as Record<string, unknown>;
    const scheduleBoundaryKeys = Object.keys(scheduleRecord);
    if (
      scheduleBoundaryKeys.length !== 2 ||
      !scheduleBoundaryKeys.includes("time") ||
      !scheduleBoundaryKeys.includes("theme")
    ) {
      throw new Error(
        `Theme schedule boundary ${scheduleIndex + 1} must contain only time and theme`
      );
    }
    if (!isValidScheduleTime(scheduleRecord.time)) {
      throw new Error(`Invalid schedule time: ${String(scheduleRecord.time)}`);
    }
    if (
      typeof scheduleRecord.theme !== "string" ||
      !supportedThemeNames.has(scheduleRecord.theme)
    ) {
      throw new Error(`Unsupported scheduled theme: ${String(scheduleRecord.theme)}`);
    }
    return { time: scheduleRecord.time, theme: scheduleRecord.theme };
  });

  const lightBoundaryCount = validatedThemeSchedule.filter(
    (scheduledTheme) => scheduledTheme.theme === lightThemeName
  ).length;
  const darkBoundaryCount = validatedThemeSchedule.filter(
    (scheduledTheme) => scheduledTheme.theme === darkThemeName
  ).length;
  if (lightBoundaryCount !== 1 || darkBoundaryCount !== 1) {
    throw new Error("Theme schedule must contain exactly one Light and one Dark boundary");
  }
  return validatedThemeSchedule;
}

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
  workspaceValue?: unknown;
  workspaceFolderValue?: unknown;
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

export type AutomaticSwitchingSelection =
  | { switchingMode: "off" }
  | { switchingMode: "system" }
  | { switchingMode: "schedule"; themeSchedule: ScheduledTheme[] };

export interface ConfigurationChangeFlags {
  scheduleAffected: boolean;
  themePreferencesAffected: boolean;
}

export interface SettlingConfigurationTransactionExecutor {
  readonly transactionInProgress: boolean;
  settle(): Promise<void>;
}

export function createConfigurationChangeReconciler(
  configurationTransactionExecutor: SettlingConfigurationTransactionExecutor,
  reconcileConfigurationChange: (configurationChange: ConfigurationChangeFlags) => void
): { request(configurationChange: ConfigurationChangeFlags): void; dispose(): void } {
  let pendingConfigurationChange: ConfigurationChangeFlags | undefined;
  let settlementInProgress = false;
  let disposed = false;

  const mergeConfigurationChange = (configurationChange: ConfigurationChangeFlags) => {
    pendingConfigurationChange = {
      scheduleAffected:
        (pendingConfigurationChange?.scheduleAffected ?? false) ||
        configurationChange.scheduleAffected,
      themePreferencesAffected:
        (pendingConfigurationChange?.themePreferencesAffected ?? false) ||
        configurationChange.themePreferencesAffected,
    };
  };

  const flushConfigurationChange = () => {
    if (disposed || configurationTransactionExecutor.transactionInProgress || settlementInProgress)
      return;
    const configurationChange = pendingConfigurationChange;
    pendingConfigurationChange = undefined;
    if (configurationChange) reconcileConfigurationChange(configurationChange);
  };

  const waitForConfigurationSettlement = () => {
    if (settlementInProgress || disposed) return;
    settlementInProgress = true;
    void configurationTransactionExecutor.settle().then(
      () => {
        settlementInProgress = false;
        flushConfigurationChange();
      },
      () => {
        settlementInProgress = false;
        flushConfigurationChange();
      }
    );
  };

  return {
    request(configurationChange) {
      if (disposed) return;
      mergeConfigurationChange(configurationChange);
      if (configurationTransactionExecutor.transactionInProgress) {
        waitForConfigurationSettlement();
        return;
      }
      flushConfigurationChange();
    },
    dispose() {
      disposed = true;
      pendingConfigurationChange = undefined;
    },
  };
}

export function normalizeThemePreferences(
  appearance: ThemeAppearance,
  rawThemePreferenceValues: Partial<Record<keyof ThemePreferences, unknown>>,
  fallbackThemePreferences: ThemePreferences
): ThemePreferences {
  return {
    appearance,
    contrast: isThemeContrast(rawThemePreferenceValues.contrast)
      ? rawThemePreferenceValues.contrast
      : fallbackThemePreferences.contrast,
    workbenchStyle: isThemeWorkbenchStyle(rawThemePreferenceValues.workbenchStyle)
      ? rawThemePreferenceValues.workbenchStyle
      : fallbackThemePreferences.workbenchStyle,
    cursorColor: isThemeCursorColor(rawThemePreferenceValues.cursorColor)
      ? rawThemePreferenceValues.cursorColor
      : fallbackThemePreferences.cursorColor,
    selectionColor: isThemeSelectionColor(rawThemePreferenceValues.selectionColor)
      ? rawThemePreferenceValues.selectionColor
      : fallbackThemePreferences.selectionColor,
    italicKeywords: isBooleanConfigurationValue(rawThemePreferenceValues.italicKeywords)
      ? rawThemePreferenceValues.italicKeywords
      : fallbackThemePreferences.italicKeywords,
    italicComments: isBooleanConfigurationValue(rawThemePreferenceValues.italicComments)
      ? rawThemePreferenceValues.italicComments
      : fallbackThemePreferences.italicComments,
    diagnosticTextBackgroundOpacity: isDiagnosticTextBackgroundOpacity(
      rawThemePreferenceValues.diagnosticTextBackgroundOpacity
    )
      ? rawThemePreferenceValues.diagnosticTextBackgroundOpacity
      : fallbackThemePreferences.diagnosticTextBackgroundOpacity,
    highContrast: isBooleanConfigurationValue(rawThemePreferenceValues.highContrast)
      ? rawThemePreferenceValues.highContrast
      : fallbackThemePreferences.highContrast,
  };
}

export function assertGlobalConfigurationUpdateAllowed(
  configurationUpdate: PremiumConfigurationUpdate,
  configurationSnapshot: PremiumConfigurationSnapshot
): void {
  if (
    (configurationUpdate.configurationSection === "window" ||
      configurationUpdate.configurationSection === "workbench") &&
    (configurationSnapshot.workspaceFolderValue !== undefined ||
      configurationSnapshot.workspaceValue !== undefined)
  ) {
    throw new Error(
      `Cannot update ${configurationUpdate.configurationSection}.${configurationUpdate.configurationKey} globally: a workspace or folder setting overrides it. Remove that override in Workspace Settings, then retry.`
    );
  }
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

    assertGlobalConfigurationUpdateAllowed(configurationUpdate, configurationSnapshot);
    if (configurationValuesMatch(currentGlobalValue, configurationUpdate.configurationValue))
      return [];
    return [{ configurationUpdate, previousGlobalValue: configurationSnapshot.globalValue }];
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
        const currentGlobalValue = configurationStorage.readSnapshot(
          configurationUpdate.configurationSection,
          configurationUpdate.configurationKey
        ).globalValue;
        if (configurationValuesMatch(currentGlobalValue, previousGlobalValue)) continue;
        if (!configurationValuesMatch(currentGlobalValue, configurationUpdate.configurationValue)) {
          rollbackErrors.push(
            new Error(
              `Cannot roll back ${configurationUpdate.configurationSection}.${configurationUpdate.configurationKey}: global value changed externally; preserving ${JSON.stringify(currentGlobalValue)}`
            )
          );
          continue;
        }
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
        `Everforest Complete could not roll back every configuration change: ${String(configurationApplicationError)}`
      );
    }
    throw configurationApplicationError;
  }

  return attemptedConfigurationUpdates.length;
}

export function createPremiumConfigurationTransactionExecutor(
  configurationStorage: PremiumConfigurationStorage
) {
  let pendingConfigurationTransactionCount = 0;
  let queuedConfigurationTransaction: Promise<void> = Promise.resolve();
  const settlementResolvers = new Set<() => void>();

  const resolveSettlementsWhenIdle = () => {
    if (pendingConfigurationTransactionCount !== 0) return;
    for (const resolveSettlement of settlementResolvers) resolveSettlement();
    settlementResolvers.clear();
  };

  return {
    get transactionInProgress() {
      return pendingConfigurationTransactionCount > 0;
    },
    apply(configurationUpdates: readonly PremiumConfigurationUpdate[]) {
      // Count at enqueue time so reconciliation cannot run in the gap between
      // one callback finishing and the next queued callback starting.
      pendingConfigurationTransactionCount += 1;
      const configurationTransaction = queuedConfigurationTransaction.then(async () => {
        try {
          return await applyPremiumConfigurationUpdates(configurationUpdates, configurationStorage);
        } finally {
          pendingConfigurationTransactionCount -= 1;
          resolveSettlementsWhenIdle();
        }
      });
      queuedConfigurationTransaction = configurationTransaction.then(
        () => undefined,
        () => undefined
      );
      return configurationTransaction;
    },
    settle(): Promise<void> {
      if (pendingConfigurationTransactionCount === 0) return Promise.resolve();
      return new Promise<void>((resolveSettlement) => {
        settlementResolvers.add(resolveSettlement);
      });
    },
  };
}

function automaticBehaviorUpdates(
  appearanceBehavior: AppearanceBehavior
): PremiumConfigurationUpdate[] {
  if (appearanceBehavior === "system") return createAutomaticModeUpdates("system");
  if (appearanceBehavior === "schedule") return createAutomaticModeUpdates("schedule");

  const activeThemeName = appearanceBehavior === "dark" ? darkThemeName : lightThemeName;
  return [
    ...createAutomaticModeUpdates("off"),
    nativeConfigurationUpdate("workbench", "colorTheme", activeThemeName),
  ];
}

export function createGuidedThemeConfigurationUpdates(
  guidedThemeSelections: GuidedThemeSelections
): PremiumConfigurationUpdate[] {
  if (
    !["dark", "light", "system", "schedule"].includes(guidedThemeSelections.appearanceBehavior) ||
    !isThemeContrast(guidedThemeSelections.contrast) ||
    !isThemeWorkbenchStyle(guidedThemeSelections.workbenchStyle)
  ) {
    throw new Error("Guided theme selections are invalid");
  }
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

function createAutomaticModeUpdates(
  switchingMode: AutomaticSwitchingMode,
  themeSchedule?: ScheduledTheme[]
): PremiumConfigurationUpdate[] {
  if (switchingMode === "off") {
    return [
      extensionConfigurationUpdate("autoSwitch.enabled", false),
      nativeConfigurationUpdate("window", "autoDetectColorScheme", false),
    ];
  }

  if (switchingMode === "system") {
    return [
      extensionConfigurationUpdate("autoSwitch.enabled", false),
      nativeConfigurationUpdate("window", "autoDetectColorScheme", true),
      nativeConfigurationUpdate("workbench", "preferredDarkColorTheme", darkThemeName),
      nativeConfigurationUpdate("workbench", "preferredLightColorTheme", lightThemeName),
    ];
  }

  if (switchingMode !== "schedule") {
    throw new Error(`Unsupported automatic switching mode: ${String(switchingMode)}`);
  }

  const scheduleUpdates = themeSchedule
    ? [extensionConfigurationUpdate("autoSwitch.schedule", validateThemeSchedule(themeSchedule))]
    : [];
  return [
    nativeConfigurationUpdate("window", "autoDetectColorScheme", false),
    ...scheduleUpdates,
    extensionConfigurationUpdate("autoSwitch.enabled", true),
  ];
}

export function createAutomaticSwitchingConfigurationUpdates(
  automaticSwitchingSelection: AutomaticSwitchingSelection
): PremiumConfigurationUpdate[] {
  if (
    automaticSwitchingSelection.switchingMode === "schedule" &&
    !automaticSwitchingSelection.themeSchedule
  ) {
    throw new Error("Scheduled switching requires a theme schedule");
  }
  return createAutomaticModeUpdates(
    automaticSwitchingSelection.switchingMode,
    automaticSwitchingSelection.switchingMode === "schedule"
      ? automaticSwitchingSelection.themeSchedule
      : undefined
  );
}

export function inferAppearanceBehavior(
  scheduledSwitchingEnabled: boolean,
  systemColorSchemeDetectionEnabled: boolean,
  activeThemeName: string
): AppearanceBehavior {
  if (scheduledSwitchingEnabled) return "schedule";
  if (systemColorSchemeDetectionEnabled) return "system";
  return typeof activeThemeName === "string" && activeThemeName.includes("Light")
    ? "light"
    : "dark";
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
