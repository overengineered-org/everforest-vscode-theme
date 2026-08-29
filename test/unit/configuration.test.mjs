import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPremiumConfigurationUpdates,
  createAdvancedThemeConfigurationUpdates,
  createAutomaticSwitchingConfigurationUpdates,
  createDailyThemeSchedule,
  createGuidedThemeConfigurationUpdates,
  darkThemeName,
  formatThemeSchedule,
  inferAppearanceBehavior,
  isValidScheduleTime,
  lightThemeName,
  themeStartTime,
} from "../../dist/configuration.js";

const transactionalConfigurationUpdates = [
  {
    configurationSection: "everforestComplete",
    configurationKey: "darkContrast",
    configurationValue: "hard",
  },
  {
    configurationSection: "workbench",
    configurationKey: "colorTheme",
    configurationValue: darkThemeName,
  },
];

test("stages a fixed Dark setup without changing Light preferences", () => {
  assert.deepEqual(
    createGuidedThemeConfigurationUpdates({
      appearanceBehavior: "dark",
      contrast: "hard",
      workbenchStyle: "flat",
    }),
    [
      {
        configurationSection: "everforestComplete",
        configurationKey: "autoSwitch.enabled",
        configurationValue: false,
      },
      {
        configurationSection: "window",
        configurationKey: "autoDetectColorScheme",
        configurationValue: false,
      },
      {
        configurationSection: "workbench",
        configurationKey: "colorTheme",
        configurationValue: darkThemeName,
      },
      {
        configurationSection: "everforestComplete",
        configurationKey: "darkContrast",
        configurationValue: "hard",
      },
      {
        configurationSection: "everforestComplete",
        configurationKey: "darkWorkbench",
        configurationValue: "flat",
      },
    ]
  );
});

test("stages system appearance with matching Light and Dark preferences", () => {
  const configurationUpdates = createGuidedThemeConfigurationUpdates({
    appearanceBehavior: "system",
    contrast: "soft",
    workbenchStyle: "material",
  });

  assert.deepEqual(
    configurationUpdates.map((configurationUpdate) => configurationUpdate.configurationKey),
    [
      "autoSwitch.enabled",
      "autoDetectColorScheme",
      "preferredDarkColorTheme",
      "preferredLightColorTheme",
      "darkContrast",
      "darkWorkbench",
      "lightContrast",
      "lightWorkbench",
    ]
  );
  assert.deepEqual(
    configurationUpdates.filter((configurationUpdate) =>
      configurationUpdate.configurationKey.endsWith("Contrast")
    ),
    [
      {
        configurationSection: "everforestComplete",
        configurationKey: "darkContrast",
        configurationValue: "soft",
      },
      {
        configurationSection: "everforestComplete",
        configurationKey: "lightContrast",
        configurationValue: "soft",
      },
    ]
  );
});

test("stages fixed Light and scheduled setup through their native behaviors", () => {
  const fixedLightConfigurationUpdates = createGuidedThemeConfigurationUpdates({
    appearanceBehavior: "light",
    contrast: "medium",
    workbenchStyle: "high-contrast",
  });
  const scheduledConfigurationUpdates = createGuidedThemeConfigurationUpdates({
    appearanceBehavior: "schedule",
    contrast: "hard",
    workbenchStyle: "material",
  });

  assert.ok(
    fixedLightConfigurationUpdates.some(
      (configurationUpdate) =>
        configurationUpdate.configurationKey === "colorTheme" &&
        configurationUpdate.configurationValue === lightThemeName
    )
  );
  assert.ok(
    fixedLightConfigurationUpdates.some(
      (configurationUpdate) => configurationUpdate.configurationKey === "lightContrast"
    )
  );
  assert.ok(
    fixedLightConfigurationUpdates.every(
      (configurationUpdate) => configurationUpdate.configurationKey !== "darkContrast"
    )
  );
  assert.ok(
    scheduledConfigurationUpdates.some(
      (configurationUpdate) =>
        configurationUpdate.configurationKey === "autoSwitch.enabled" &&
        configurationUpdate.configurationValue === true
    )
  );
  assert.ok(
    scheduledConfigurationUpdates.some(
      (configurationUpdate) => configurationUpdate.configurationKey === "darkContrast"
    )
  );
  assert.ok(
    scheduledConfigurationUpdates.some(
      (configurationUpdate) => configurationUpdate.configurationKey === "lightContrast"
    )
  );
});

test("stages every advanced control as one configuration set", () => {
  const advancedConfigurationUpdates = createAdvancedThemeConfigurationUpdates({
    darkCursor: "aqua",
    lightCursor: "blue",
    darkSelection: "green",
    lightSelection: "aqua",
    italicKeywords: true,
    italicComments: false,
    diagnosticTextBackgroundOpacity: "25%",
    highContrast: true,
  });

  assert.deepEqual(
    advancedConfigurationUpdates.map((configurationUpdate) => configurationUpdate.configurationKey),
    [
      "darkCursor",
      "lightCursor",
      "darkSelection",
      "lightSelection",
      "italicKeywords",
      "italicComments",
      "diagnosticTextBackgroundOpacity",
      "highContrast",
    ]
  );
  assert.ok(
    advancedConfigurationUpdates.every(
      (configurationUpdate) => configurationUpdate.configurationSection === "everforestComplete"
    )
  );
});

test("builds an exact two-boundary local schedule without JSON input", () => {
  const themeSchedule = createDailyThemeSchedule("06:45", "20:15");

  assert.deepEqual(themeSchedule, [
    { time: "06:45", theme: lightThemeName },
    { time: "20:15", theme: darkThemeName },
  ]);
  assert.equal(formatThemeSchedule(themeSchedule), "06:45 Light · 20:15 Dark");
  assert.equal(
    formatThemeSchedule([{ time: "12:00", theme: "Unexpected Theme" }]),
    "12:00 Unexpected Theme"
  );
  assert.equal(themeStartTime(themeSchedule, lightThemeName, "07:00"), "06:45");
  assert.equal(themeStartTime([], lightThemeName, "07:00"), "07:00");
  assert.equal(isValidScheduleTime("23:59"), true);
  assert.equal(isValidScheduleTime("24:00"), false);
  assert.deepEqual(
    createAutomaticSwitchingConfigurationUpdates({
      switchingMode: "schedule",
      themeSchedule,
    }),
    [
      {
        configurationSection: "window",
        configurationKey: "autoDetectColorScheme",
        configurationValue: false,
      },
      {
        configurationSection: "everforestComplete",
        configurationKey: "autoSwitch.schedule",
        configurationValue: themeSchedule,
      },
      {
        configurationSection: "everforestComplete",
        configurationKey: "autoSwitch.enabled",
        configurationValue: true,
      },
    ]
  );
});

test("applies only changed global configuration values", async () => {
  const writtenConfigurationValues = [];
  const appliedConfigurationUpdateCount = await applyPremiumConfigurationUpdates(
    transactionalConfigurationUpdates,
    {
      readSnapshot(configurationSection) {
        return configurationSection === "everforestComplete"
          ? { defaultValue: "medium", globalValue: "hard" }
          : { defaultValue: "Default Dark Modern", globalValue: undefined };
      },
      async updateGlobal(configurationSection, configurationKey, configurationValue) {
        writtenConfigurationValues.push({
          configurationSection,
          configurationKey,
          configurationValue,
        });
      },
    }
  );

  assert.equal(appliedConfigurationUpdateCount, 1);
  assert.deepEqual(writtenConfigurationValues, [transactionalConfigurationUpdates[1]]);
});

test("rolls back every attempted global write when a later write fails", async () => {
  const writtenConfigurationValues = [];
  const configurationApplicationError = new Error("second write failed");

  await assert.rejects(
    applyPremiumConfigurationUpdates(transactionalConfigurationUpdates, {
      readSnapshot(configurationSection) {
        return configurationSection === "everforestComplete"
          ? { defaultValue: "medium", globalValue: "soft" }
          : { defaultValue: "Default Dark Modern", globalValue: "Existing Theme" };
      },
      async updateGlobal(configurationSection, configurationKey, configurationValue) {
        writtenConfigurationValues.push({
          configurationSection,
          configurationKey,
          configurationValue,
        });
        if (configurationValue === darkThemeName) throw configurationApplicationError;
      },
    }),
    configurationApplicationError
  );

  assert.deepEqual(writtenConfigurationValues, [
    transactionalConfigurationUpdates[0],
    transactionalConfigurationUpdates[1],
    {
      configurationSection: "workbench",
      configurationKey: "colorTheme",
      configurationValue: "Existing Theme",
    },
    {
      configurationSection: "everforestComplete",
      configurationKey: "darkContrast",
      configurationValue: "soft",
    },
  ]);
});

test("reports both application and rollback failures", async () => {
  let configurationWriteNumber = 0;

  await assert.rejects(
    applyPremiumConfigurationUpdates(transactionalConfigurationUpdates, {
      readSnapshot(configurationSection) {
        return configurationSection === "everforestComplete"
          ? { defaultValue: "medium", globalValue: "soft" }
          : { defaultValue: "Default Dark Modern", globalValue: "Existing Theme" };
      },
      async updateGlobal() {
        configurationWriteNumber += 1;
        if (configurationWriteNumber === 2 || configurationWriteNumber === 4) {
          throw new Error(`write ${configurationWriteNumber}`);
        }
      },
    }),
    (configurationTransactionError) => {
      assert.ok(configurationTransactionError instanceof AggregateError);
      assert.match(configurationTransactionError.message, /could not roll back every/);
      assert.equal(configurationTransactionError.errors.length, 2);
      return true;
    }
  );
});

test("coordinates Off and System switching with native VS Code settings", () => {
  assert.deepEqual(createAutomaticSwitchingConfigurationUpdates({ switchingMode: "off" }), [
    {
      configurationSection: "everforestComplete",
      configurationKey: "autoSwitch.enabled",
      configurationValue: false,
    },
    {
      configurationSection: "window",
      configurationKey: "autoDetectColorScheme",
      configurationValue: false,
    },
  ]);
  assert.deepEqual(createAutomaticSwitchingConfigurationUpdates({ switchingMode: "system" }), [
    {
      configurationSection: "everforestComplete",
      configurationKey: "autoSwitch.enabled",
      configurationValue: false,
    },
    {
      configurationSection: "window",
      configurationKey: "autoDetectColorScheme",
      configurationValue: true,
    },
    {
      configurationSection: "workbench",
      configurationKey: "preferredDarkColorTheme",
      configurationValue: darkThemeName,
    },
    {
      configurationSection: "workbench",
      configurationKey: "preferredLightColorTheme",
      configurationValue: lightThemeName,
    },
  ]);
});

test("rejects invalid or ambiguous command schedules", () => {
  assert.throws(() => createDailyThemeSchedule("7:00", "19:00"), /Invalid Light/);
  assert.throws(() => createDailyThemeSchedule("07:00", "25:00"), /Invalid Dark/);
  assert.throws(() => createDailyThemeSchedule("07:00", "07:00"), /must differ/);
  assert.throws(
    () => createAutomaticSwitchingConfigurationUpdates({ switchingMode: "schedule" }),
    /requires a theme schedule/
  );
});

test("infers the active appearance behavior from native settings", () => {
  assert.equal(inferAppearanceBehavior(true, true, lightThemeName), "schedule");
  assert.equal(inferAppearanceBehavior(false, true, darkThemeName), "system");
  assert.equal(inferAppearanceBehavior(false, false, lightThemeName), "light");
  assert.equal(inferAppearanceBehavior(false, false, darkThemeName), "dark");
});
