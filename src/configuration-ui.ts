import * as vscode from "vscode";
import {
  createDailyThemeSchedule,
  darkThemeName,
  defaultThemeSchedule,
  formatThemeSchedule,
  isValidScheduleTime,
  lightThemeName,
  themeStartTime,
} from "./configuration";
import type {
  AdvancedThemeConfiguration,
  AppearanceBehavior,
  AutomaticSwitchingMode,
  AutomaticSwitchingSelection,
  GuidedThemeSelections,
} from "./configuration";
import type {
  DiagnosticTextBackgroundOpacity,
  ScheduledTheme,
  ThemeContrast,
  ThemeCursorColor,
  ThemeSelectionColor,
  ThemeWorkbenchStyle,
} from "./interface";

interface ConfigurationChoice<ConfigurationValue> extends vscode.QuickPickItem {
  configurationValue: ConfigurationValue;
}

interface GuidedThemeConfigurationSnapshot {
  appearanceBehavior: AppearanceBehavior;
  darkContrast: ThemeContrast;
  lightContrast: ThemeContrast;
  darkWorkbench: ThemeWorkbenchStyle;
  lightWorkbench: ThemeWorkbenchStyle;
  themeSchedule: ScheduledTheme[];
}

type AdvancedControlIdentifier = keyof AdvancedThemeConfiguration;

interface AdvancedControlMenuItem extends vscode.QuickPickItem {
  action: AdvancedControlIdentifier | "apply";
}

const contrastChoices: ConfigurationChoice<ThemeContrast>[] = [
  {
    label: "Soft",
    description: "Gentlest surface separation",
    detail: "Lowest glare for long sessions.",
    configurationValue: "soft",
  },
  {
    label: "Medium",
    description: "Balanced",
    detail: "Recommended default for most workbenches.",
    configurationValue: "medium",
  },
  {
    label: "Hard",
    description: "Strongest surface separation",
    detail: "Clearer editor, panel, and sidebar boundaries.",
    configurationValue: "hard",
  },
];

const workbenchStyleChoices: ConfigurationChoice<ThemeWorkbenchStyle>[] = [
  {
    label: "Material",
    description: "Tonal depth",
    detail: "Recommended. Calm separation between editor and supporting surfaces.",
    configurationValue: "material",
  },
  {
    label: "Flat",
    description: "One continuous surface",
    detail: "Minimal chrome and the quietest possible workbench.",
    configurationValue: "flat",
  },
  {
    label: "High Contrast",
    description: "Strong borders and hierarchy",
    detail: "Maximum structural distinction across the workbench.",
    configurationValue: "high-contrast",
  },
];

const sharedAccentColorChoices = [
  "red",
  "orange",
  "yellow",
  "green",
  "aqua",
  "blue",
  "purple",
] as const;

function emphasizeCurrentChoice<ConfigurationValue>(
  configurationChoices: readonly ConfigurationChoice<ConfigurationValue>[],
  currentConfigurationValue: ConfigurationValue | undefined
): ConfigurationChoice<ConfigurationValue>[] {
  const currentConfigurationChoice = configurationChoices.find(
    (configurationChoice) => configurationChoice.configurationValue === currentConfigurationValue
  );
  if (!currentConfigurationChoice) return [...configurationChoices];

  return [
    {
      ...currentConfigurationChoice,
      label: `$(check) ${currentConfigurationChoice.label}`,
      description: currentConfigurationChoice.description
        ? `Current · ${currentConfigurationChoice.description}`
        : "Current",
    },
    ...configurationChoices.filter(
      (configurationChoice) => configurationChoice !== currentConfigurationChoice
    ),
  ];
}

async function showConfigurationChoice<ConfigurationValue>(
  configurationChoices: readonly ConfigurationChoice<ConfigurationValue>[],
  currentConfigurationValue: ConfigurationValue | undefined,
  title: string,
  placeHolder: string
): Promise<ConfigurationValue | undefined> {
  const selectedConfigurationChoice = await vscode.window.showQuickPick(
    emphasizeCurrentChoice(configurationChoices, currentConfigurationValue),
    { title, placeHolder, ignoreFocusOut: true }
  );
  return selectedConfigurationChoice?.configurationValue;
}

function currentGuidedContrast(
  configurationSnapshot: GuidedThemeConfigurationSnapshot,
  appearanceBehavior: AppearanceBehavior
): ThemeContrast | undefined {
  if (appearanceBehavior === "light") return configurationSnapshot.lightContrast;
  if (appearanceBehavior === "dark") return configurationSnapshot.darkContrast;
  return configurationSnapshot.darkContrast === configurationSnapshot.lightContrast
    ? configurationSnapshot.darkContrast
    : undefined;
}

function currentGuidedWorkbenchStyle(
  configurationSnapshot: GuidedThemeConfigurationSnapshot,
  appearanceBehavior: AppearanceBehavior
): ThemeWorkbenchStyle | undefined {
  if (appearanceBehavior === "light") return configurationSnapshot.lightWorkbench;
  if (appearanceBehavior === "dark") return configurationSnapshot.darkWorkbench;
  return configurationSnapshot.darkWorkbench === configurationSnapshot.lightWorkbench
    ? configurationSnapshot.darkWorkbench
    : undefined;
}

export async function collectGuidedThemeSelections(
  configurationSnapshot: GuidedThemeConfigurationSnapshot
): Promise<GuidedThemeSelections | undefined> {
  const appearanceBehaviorChoices: ConfigurationChoice<AppearanceBehavior>[] = [
    {
      label: "Dark",
      description: "Use configurable Dark",
      detail: "Applies the next two choices to Dark only.",
      configurationValue: "dark",
    },
    {
      label: "Light",
      description: "Use configurable Light",
      detail: "Applies the next two choices to Light only.",
      configurationValue: "light",
    },
    {
      label: "Follow System",
      description: "Match macOS, Windows, or Linux",
      detail: "Applies the next two choices to both Light and Dark.",
      configurationValue: "system",
    },
    {
      label: "Follow Schedule",
      description: formatThemeSchedule(configurationSnapshot.themeSchedule),
      detail: "Applies the next two choices to both Light and Dark.",
      configurationValue: "schedule",
    },
  ];
  const appearanceBehavior = await showConfigurationChoice(
    appearanceBehaviorChoices,
    configurationSnapshot.appearanceBehavior,
    "Everforest Complete · 1 of 3",
    "Choose Light and Dark behaviour. Escape discards everything."
  );
  if (!appearanceBehavior) return undefined;

  const contrast = await showConfigurationChoice(
    contrastChoices,
    currentGuidedContrast(configurationSnapshot, appearanceBehavior),
    "Everforest Complete · 2 of 3",
    "Choose background contrast. Escape discards everything."
  );
  if (!contrast) return undefined;

  const workbenchStyle = await showConfigurationChoice(
    workbenchStyleChoices,
    currentGuidedWorkbenchStyle(configurationSnapshot, appearanceBehavior),
    "Everforest Complete · 3 of 3",
    "Choose workbench depth. Selecting applies all three choices."
  );
  if (!workbenchStyle) return undefined;

  return { appearanceBehavior, contrast, workbenchStyle };
}

function titleCaseConfigurationValue(configurationValue: string): string {
  return configurationValue
    .split("-")
    .map(
      (configurationWord) =>
        `${configurationWord.charAt(0).toUpperCase()}${configurationWord.slice(1)}`
    )
    .join(" ");
}

function advancedControlMenuItems(
  advancedThemeConfiguration: AdvancedThemeConfiguration,
  changedControlCount: number
): AdvancedControlMenuItem[] {
  return [
    {
      label: "$(check) Apply Changes",
      description:
        changedControlCount === 0
          ? "No staged changes"
          : `${changedControlCount} staged ${changedControlCount === 1 ? "change" : "changes"}`,
      detail: "Regenerates once and offers one reload.",
      action: "apply",
    },
    {
      label: "Dark Cursor",
      description: titleCaseConfigurationValue(advancedThemeConfiguration.darkCursor),
      action: "darkCursor",
    },
    {
      label: "Light Cursor",
      description: titleCaseConfigurationValue(advancedThemeConfiguration.lightCursor),
      action: "lightCursor",
    },
    {
      label: "Dark Selection",
      description: titleCaseConfigurationValue(advancedThemeConfiguration.darkSelection),
      action: "darkSelection",
    },
    {
      label: "Light Selection",
      description: titleCaseConfigurationValue(advancedThemeConfiguration.lightSelection),
      action: "lightSelection",
    },
    {
      label: "Keyword Italics",
      description: advancedThemeConfiguration.italicKeywords ? "On" : "Off",
      action: "italicKeywords",
    },
    {
      label: "Comment Italics",
      description: advancedThemeConfiguration.italicComments ? "On" : "Off",
      action: "italicComments",
    },
    {
      label: "Diagnostic Backgrounds",
      description:
        advancedThemeConfiguration.diagnosticTextBackgroundOpacity === "0%"
          ? "Off"
          : advancedThemeConfiguration.diagnosticTextBackgroundOpacity,
      action: "diagnosticTextBackgroundOpacity",
    },
    {
      label: "Stronger Borders",
      description: advancedThemeConfiguration.highContrast ? "On" : "Off",
      action: "highContrast",
    },
  ];
}

function changedAdvancedControlCount(
  initialConfiguration: AdvancedThemeConfiguration,
  stagedConfiguration: AdvancedThemeConfiguration
): number {
  return Object.keys(initialConfiguration).filter((configurationKey) => {
    const advancedControlIdentifier = configurationKey as AdvancedControlIdentifier;
    return (
      initialConfiguration[advancedControlIdentifier] !==
      stagedConfiguration[advancedControlIdentifier]
    );
  }).length;
}

function accentChoices<AccentColor extends string>(
  defaultAccentColor: AccentColor
): ConfigurationChoice<AccentColor | (typeof sharedAccentColorChoices)[number]>[] {
  return [defaultAccentColor, ...sharedAccentColorChoices].map((accentColor) => ({
    label: titleCaseConfigurationValue(accentColor),
    configurationValue: accentColor,
  }));
}

async function changeAdvancedControl(
  advancedControlIdentifier: AdvancedControlIdentifier,
  stagedConfiguration: AdvancedThemeConfiguration
): Promise<AdvancedThemeConfiguration | undefined> {
  const updatedConfiguration = { ...stagedConfiguration };

  if (advancedControlIdentifier === "darkCursor") {
    const darkCursor = await showConfigurationChoice<ThemeCursorColor>(
      accentChoices("white"),
      stagedConfiguration.darkCursor,
      "Advanced Controls · Dark Cursor",
      "Choose the Dark editor and terminal cursor."
    );
    if (!darkCursor) return undefined;
    updatedConfiguration.darkCursor = darkCursor;
  } else if (advancedControlIdentifier === "lightCursor") {
    const lightCursor = await showConfigurationChoice<ThemeCursorColor>(
      accentChoices("black"),
      stagedConfiguration.lightCursor,
      "Advanced Controls · Light Cursor",
      "Choose the Light editor and terminal cursor."
    );
    if (!lightCursor) return undefined;
    updatedConfiguration.lightCursor = lightCursor;
  } else if (
    advancedControlIdentifier === "darkSelection" ||
    advancedControlIdentifier === "lightSelection"
  ) {
    const selectionColor = await showConfigurationChoice<ThemeSelectionColor>(
      accentChoices("grey"),
      stagedConfiguration[advancedControlIdentifier],
      `Advanced Controls · ${advancedControlIdentifier === "darkSelection" ? "Dark" : "Light"} Selection`,
      "Choose selection emphasis across editor, terminal, and minimap."
    );
    if (!selectionColor) return undefined;
    updatedConfiguration[advancedControlIdentifier] = selectionColor;
  } else if (
    advancedControlIdentifier === "italicKeywords" ||
    advancedControlIdentifier === "italicComments" ||
    advancedControlIdentifier === "highContrast"
  ) {
    const enabled = await showConfigurationChoice<boolean>(
      [
        { label: "On", configurationValue: true },
        { label: "Off", configurationValue: false },
      ],
      stagedConfiguration[advancedControlIdentifier],
      `Advanced Controls · ${advancedControlIdentifier === "italicKeywords" ? "Keyword Italics" : advancedControlIdentifier === "italicComments" ? "Comment Italics" : "Stronger Borders"}`,
      "Choose one value."
    );
    if (enabled === undefined) return undefined;
    updatedConfiguration[advancedControlIdentifier] = enabled;
  } else {
    const diagnosticTextBackgroundOpacity =
      await showConfigurationChoice<DiagnosticTextBackgroundOpacity>(
        [
          { label: "Off", description: "No diagnostic fill", configurationValue: "0%" },
          { label: "Subtle", description: "12.5%", configurationValue: "12.5%" },
          { label: "Moderate", description: "25%", configurationValue: "25%" },
          { label: "Strong", description: "37.5%", configurationValue: "37.5%" },
          { label: "Maximum", description: "50%", configurationValue: "50%" },
        ],
        stagedConfiguration.diagnosticTextBackgroundOpacity,
        "Advanced Controls · Diagnostic Backgrounds",
        "Choose error, warning, and information emphasis."
      );
    if (!diagnosticTextBackgroundOpacity) return undefined;
    updatedConfiguration.diagnosticTextBackgroundOpacity = diagnosticTextBackgroundOpacity;
  }

  return updatedConfiguration;
}

export async function collectAdvancedThemeConfiguration(
  initialConfiguration: AdvancedThemeConfiguration
): Promise<AdvancedThemeConfiguration | undefined> {
  let stagedConfiguration = { ...initialConfiguration };

  while (true) {
    const changedControlCount = changedAdvancedControlCount(
      initialConfiguration,
      stagedConfiguration
    );
    const selectedMenuItem = await vscode.window.showQuickPick(
      advancedControlMenuItems(stagedConfiguration, changedControlCount),
      {
        title: "Everforest Complete · Advanced Controls",
        placeHolder: "Choose a control. Escape discards staged changes.",
        ignoreFocusOut: true,
      }
    );
    if (!selectedMenuItem) return undefined;
    if (selectedMenuItem.action === "apply") return stagedConfiguration;

    const updatedConfiguration = await changeAdvancedControl(
      selectedMenuItem.action,
      stagedConfiguration
    );
    if (!updatedConfiguration) return undefined;
    stagedConfiguration = updatedConfiguration;
  }
}

export async function collectAutomaticSwitchingSelection(
  currentSwitchingMode: AutomaticSwitchingMode,
  currentThemeSchedule: ScheduledTheme[]
): Promise<AutomaticSwitchingSelection | undefined> {
  const switchingMode = await showConfigurationChoice<AutomaticSwitchingMode>(
    [
      {
        label: "Off",
        description: "Keep the current theme",
        configurationValue: "off",
      },
      {
        label: "Follow System",
        description: "Match macOS, Windows, or Linux",
        configurationValue: "system",
      },
      {
        label: "Follow Schedule",
        description: formatThemeSchedule(currentThemeSchedule),
        configurationValue: "schedule",
      },
    ],
    currentSwitchingMode,
    "Everforest Complete · Automatic Light/Dark",
    "Choose Off, System, or a local schedule."
  );
  if (!switchingMode) return undefined;
  if (switchingMode !== "schedule") return { switchingMode };

  const lightThemeStartTime = await vscode.window.showInputBox({
    title: "Automatic Schedule · 1 of 2",
    prompt: "When should Light begin?",
    placeHolder: "07:00",
    value: themeStartTime(
      currentThemeSchedule,
      lightThemeName,
      defaultThemeSchedule[0]?.time ?? "07:00"
    ),
    ignoreFocusOut: true,
    validateInput: (scheduleTime) =>
      isValidScheduleTime(scheduleTime) ? undefined : "Use local 24-hour time: HH:MM",
  });
  if (!lightThemeStartTime) return undefined;

  const darkThemeStartTime = await vscode.window.showInputBox({
    title: "Automatic Schedule · 2 of 2",
    prompt: "When should Dark begin? Selecting Enter applies the schedule.",
    placeHolder: "19:00",
    value: themeStartTime(
      currentThemeSchedule,
      darkThemeName,
      defaultThemeSchedule[1]?.time ?? "19:00"
    ),
    ignoreFocusOut: true,
    validateInput: (scheduleTime) => {
      if (!isValidScheduleTime(scheduleTime)) return "Use local 24-hour time: HH:MM";
      if (scheduleTime === lightThemeStartTime) return "Light and Dark start times must differ";
      return undefined;
    },
  });
  if (!darkThemeStartTime) return undefined;

  return {
    switchingMode,
    themeSchedule: createDailyThemeSchedule(lightThemeStartTime, darkThemeStartTime),
  };
}
