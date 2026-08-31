import assert from "node:assert/strict";
import test from "node:test";
import {
  applyPremiumConfigurationUpdates,
  assertGlobalConfigurationUpdateAllowed,
  createAdvancedThemeConfigurationUpdates,
  createAutomaticSwitchingConfigurationUpdates,
  createConfigurationChangeReconciler,
  createDailyThemeSchedule,
  createGuidedThemeConfigurationUpdates,
  createPremiumConfigurationTransactionExecutor,
  darkThemeName,
  formatThemeSchedule,
  inferAppearanceBehavior,
  isValidScheduleTime,
  lightThemeName,
  normalizeThemePreferences,
  themeStartTime,
  validateThemeSchedule,
} from "../../dist/configuration.js";
import { defaultThemePreferences } from "../../dist/theme.js";

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

test("serializes configuration transactions and exposes their active state", async () => {
  const writtenConfigurationKeys = [];
  let releaseFirstConfigurationWrite;
  const firstConfigurationWriteCanFinish = new Promise((resolveFirstConfigurationWrite) => {
    releaseFirstConfigurationWrite = resolveFirstConfigurationWrite;
  });
  let reportFirstConfigurationWriteStarted;
  const firstConfigurationWriteStarted = new Promise((resolveFirstConfigurationWriteStarted) => {
    reportFirstConfigurationWriteStarted = resolveFirstConfigurationWriteStarted;
  });
  const configurationTransactionExecutor = createPremiumConfigurationTransactionExecutor({
    readSnapshot() {
      return { defaultValue: undefined, globalValue: undefined };
    },
    async updateGlobal(_configurationSection, configurationKey) {
      writtenConfigurationKeys.push(configurationKey);
      if (configurationKey !== "darkContrast") return;
      reportFirstConfigurationWriteStarted();
      await firstConfigurationWriteCanFinish;
    },
  });

  const firstConfigurationTransaction = configurationTransactionExecutor.apply([
    transactionalConfigurationUpdates[0],
  ]);
  await firstConfigurationWriteStarted;
  const secondConfigurationTransaction = configurationTransactionExecutor.apply([
    transactionalConfigurationUpdates[1],
  ]);
  await new Promise((resolveQueuedMicrotasks) => setImmediate(resolveQueuedMicrotasks));

  assert.equal(configurationTransactionExecutor.transactionInProgress, true);
  assert.deepEqual(writtenConfigurationKeys, ["darkContrast"]);

  releaseFirstConfigurationWrite();
  await Promise.all([firstConfigurationTransaction, secondConfigurationTransaction]);

  assert.equal(configurationTransactionExecutor.transactionInProgress, false);
  assert.deepEqual(writtenConfigurationKeys, ["darkContrast", "colorTheme"]);
});

test("continues queued configuration transactions after a failed transaction", async () => {
  const writtenConfigurationKeys = [];
  const configurationTransactionExecutor = createPremiumConfigurationTransactionExecutor({
    readSnapshot() {
      return { defaultValue: undefined, globalValue: undefined };
    },
    async updateGlobal(_configurationSection, configurationKey, configurationValue) {
      writtenConfigurationKeys.push(configurationKey);
      if (configurationKey === "darkContrast" && configurationValue === "hard") {
        throw new Error("first transaction failed");
      }
    },
  });

  const failedConfigurationTransaction = configurationTransactionExecutor.apply([
    transactionalConfigurationUpdates[0],
  ]);
  const successfulConfigurationTransaction = configurationTransactionExecutor.apply([
    transactionalConfigurationUpdates[1],
  ]);

  await assert.rejects(failedConfigurationTransaction, /first transaction failed/);
  assert.equal(await successfulConfigurationTransaction, 1);
  assert.deepEqual(writtenConfigurationKeys, ["darkContrast", "colorTheme"]);
});

test("rolls back every attempted global write when a later write fails", async () => {
  const writtenConfigurationValues = [];
  const configurationApplicationError = new Error("second write failed");
  const globalConfigurationValues = new Map([
    ["everforestComplete.darkContrast", "soft"],
    ["workbench.colorTheme", "Existing Theme"],
  ]);

  await assert.rejects(
    applyPremiumConfigurationUpdates(transactionalConfigurationUpdates, {
      readSnapshot(configurationSection, configurationKey) {
        return {
          defaultValue: undefined,
          globalValue: globalConfigurationValues.get(`${configurationSection}.${configurationKey}`),
        };
      },
      async updateGlobal(configurationSection, configurationKey, configurationValue) {
        writtenConfigurationValues.push({
          configurationSection,
          configurationKey,
          configurationValue,
        });
        globalConfigurationValues.set(
          `${configurationSection}.${configurationKey}`,
          configurationValue
        );
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
  const globalConfigurationValues = new Map([
    ["everforestComplete.darkContrast", "soft"],
    ["workbench.colorTheme", "Existing Theme"],
  ]);

  await assert.rejects(
    applyPremiumConfigurationUpdates(transactionalConfigurationUpdates, {
      readSnapshot(configurationSection, configurationKey) {
        return {
          defaultValue: undefined,
          globalValue: globalConfigurationValues.get(`${configurationSection}.${configurationKey}`),
        };
      },
      async updateGlobal(configurationSection, configurationKey, configurationValue) {
        configurationWriteNumber += 1;
        globalConfigurationValues.set(
          `${configurationSection}.${configurationKey}`,
          configurationValue
        );
        if (configurationWriteNumber === 2 || configurationWriteNumber === 3) {
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

test("preserves a newer global value when another window changes during rollback", async () => {
  const globalConfigurationValues = new Map([
    ["everforestComplete.darkContrast", "soft"],
    ["workbench.colorTheme", "Existing Theme"],
  ]);
  const configurationWrites = [];
  const configurationApplicationError = new Error("first window theme write failed");
  let reportFirstWindowWriteStarted;
  const firstWindowWriteStarted = new Promise((resolve) => {
    reportFirstWindowWriteStarted = resolve;
  });
  let releaseFirstWindowWrite;
  const firstWindowWriteReleased = new Promise((resolve) => {
    releaseFirstWindowWrite = resolve;
  });

  const createWindowConfigurationStorage = (windowName) => ({
    readSnapshot(configurationSection, configurationKey) {
      return {
        defaultValue: undefined,
        globalValue: globalConfigurationValues.get(`${configurationSection}.${configurationKey}`),
      };
    },
    async updateGlobal(configurationSection, configurationKey, configurationValue) {
      configurationWrites.push({
        windowName,
        configurationSection,
        configurationKey,
        configurationValue,
      });
      globalConfigurationValues.set(
        `${configurationSection}.${configurationKey}`,
        configurationValue
      );
      if (windowName === "first" && configurationKey === "darkContrast") {
        reportFirstWindowWriteStarted();
        await firstWindowWriteReleased;
      }
      if (
        windowName === "first" &&
        configurationKey === "colorTheme" &&
        configurationValue === darkThemeName
      ) {
        throw configurationApplicationError;
      }
    },
  });

  const firstWindowTransactions = createPremiumConfigurationTransactionExecutor(
    createWindowConfigurationStorage("first")
  );
  const secondWindowTransactions = createPremiumConfigurationTransactionExecutor(
    createWindowConfigurationStorage("second")
  );
  const firstWindowTransaction = firstWindowTransactions.apply(transactionalConfigurationUpdates);
  await firstWindowWriteStarted;
  await secondWindowTransactions.apply([
    {
      configurationSection: "everforestComplete",
      configurationKey: "darkContrast",
      configurationValue: "medium",
    },
  ]);
  releaseFirstWindowWrite();

  await assert.rejects(firstWindowTransaction, (configurationTransactionError) => {
    assert.ok(configurationTransactionError instanceof AggregateError);
    assert.match(configurationTransactionError.errors[1].message, /changed externally/);
    return true;
  });
  assert.equal(globalConfigurationValues.get("everforestComplete.darkContrast"), "medium");
  assert.equal(
    configurationWrites.some(
      ({ configurationSection, configurationKey, configurationValue }) =>
        configurationSection === "everforestComplete" &&
        configurationKey === "darkContrast" &&
        configurationValue === "soft"
    ),
    false
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

test("falls back to safe enum and boolean values before theme serialization", () => {
  assert.deepEqual(
    normalizeThemePreferences(
      "dark",
      {
        contrast: "not-a-contrast",
        workbenchStyle: { invalid: true },
        cursorColor: "not-a-cursor",
        selectionColor: "not-a-selection",
        italicKeywords: "true",
        italicComments: null,
        diagnosticTextBackgroundOpacity: "100%",
        highContrast: 1,
      },
      defaultThemePreferences.dark
    ),
    defaultThemePreferences.dark
  );
  assert.deepEqual(
    normalizeThemePreferences(
      "light",
      {
        contrast: "hard",
        workbenchStyle: "flat",
        cursorColor: "blue",
        selectionColor: "orange",
        italicKeywords: true,
        italicComments: false,
        diagnosticTextBackgroundOpacity: "25%",
        highContrast: true,
      },
      defaultThemePreferences.light
    ),
    {
      appearance: "light",
      contrast: "hard",
      workbenchStyle: "flat",
      cursorColor: "blue",
      selectionColor: "orange",
      italicKeywords: true,
      italicComments: false,
      diagnosticTextBackgroundOpacity: "25%",
      highContrast: true,
    }
  );
});

test("accepts only one Light and one Dark schedule boundary", () => {
  assert.deepEqual(
    validateThemeSchedule([
      { time: "19:00", theme: darkThemeName },
      { time: "07:00", theme: lightThemeName },
    ]),
    [
      { time: "19:00", theme: darkThemeName },
      { time: "07:00", theme: lightThemeName },
    ]
  );
  assert.throws(
    () => validateThemeSchedule([{ time: "07:00", theme: lightThemeName }]),
    /exactly one Light and one Dark/
  );
  assert.throws(
    () =>
      validateThemeSchedule([
        { time: "07:00", theme: lightThemeName },
        { time: "19:00", theme: darkThemeName },
        { time: "22:00", theme: darkThemeName },
      ]),
    /exactly one Light and one Dark/
  );
  assert.throws(
    () =>
      validateThemeSchedule([
        { time: "07:00", theme: lightThemeName },
        { time: "07:00", theme: darkThemeName },
      ]),
    /duplicate times/
  );
  assert.throws(
    () =>
      validateThemeSchedule([
        { time: "07:00", theme: lightThemeName },
        { time: "bad", theme: darkThemeName },
      ]),
    /Invalid schedule time/
  );
  assert.throws(
    () =>
      validateThemeSchedule([
        { time: "07:00", theme: lightThemeName, extra: true },
        { time: "19:00", theme: darkThemeName },
      ]),
    /only time and theme/
  );
  assert.throws(() => validateThemeSchedule("not-an-array"), /exactly one Light and one Dark/);
  assert.throws(
    () => validateThemeSchedule([null, { time: "19:00", theme: darkThemeName }]),
    /must be an object/
  );
  assert.throws(
    () =>
      validateThemeSchedule([
        { time: "07:00", theme: lightThemeName },
        { time: "19:00", theme: "Other" },
      ]),
    /Unsupported scheduled theme/
  );
  assert.throws(
    () =>
      validateThemeSchedule([
        { time: "07:00", theme: lightThemeName },
        { time: "19:00", theme: lightThemeName },
      ]),
    /exactly one Light and one Dark/
  );
});

test("rejects a native global write when workspace scope is effective", async () => {
  const nativeConfigurationUpdate = {
    configurationSection: "window",
    configurationKey: "autoDetectColorScheme",
    configurationValue: false,
  };
  assert.throws(
    () =>
      assertGlobalConfigurationUpdateAllowed(nativeConfigurationUpdate, {
        defaultValue: false,
        globalValue: true,
        workspaceValue: true,
      }),
    /workspace or folder setting overrides/
  );
  let writeCount = 0;
  await assert.rejects(
    applyPremiumConfigurationUpdates([nativeConfigurationUpdate], {
      readSnapshot: () => ({ defaultValue: false, globalValue: true, workspaceFolderValue: true }),
      updateGlobal: async () => {
        writeCount += 1;
      },
    }),
    /workspace or folder setting overrides/
  );
  assert.equal(writeCount, 0);
  await assert.rejects(
    applyPremiumConfigurationUpdates([nativeConfigurationUpdate], {
      readSnapshot: () => ({ defaultValue: false, globalValue: false, workspaceValue: true }),
      updateGlobal: async () => {
        writeCount += 1;
      },
    }),
    /workspace or folder setting overrides/
  );
  assert.equal(writeCount, 0);
});

test("settles queued transactions after success and rollback", async () => {
  let releaseFirstWrite;
  const firstWriteReleased = new Promise((resolve) => {
    releaseFirstWrite = resolve;
  });
  let reportSecondWriteStarted;
  const secondWriteStarted = new Promise((resolve) => {
    reportSecondWriteStarted = resolve;
  });
  let releaseSecondWrite;
  const secondWriteReleased = new Promise((resolve) => {
    releaseSecondWrite = resolve;
  });
  const transactionExecutor = createPremiumConfigurationTransactionExecutor({
    readSnapshot: () => ({ defaultValue: undefined, globalValue: undefined }),
    async updateGlobal(_section, key) {
      if (key === "first") await firstWriteReleased;
      if (key === "second") {
        reportSecondWriteStarted();
        await secondWriteReleased;
      }
    },
  });
  const firstTransaction = transactionExecutor.apply([
    {
      configurationSection: "everforestComplete",
      configurationKey: "first",
      configurationValue: true,
    },
  ]);
  const secondTransaction = transactionExecutor.apply([
    {
      configurationSection: "everforestComplete",
      configurationKey: "second",
      configurationValue: true,
    },
  ]);
  let settlementCompleted = false;
  const settlementPromise = transactionExecutor.settle();
  void settlementPromise.then(() => {
    settlementCompleted = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settlementCompleted, false);
  assert.equal(transactionExecutor.transactionInProgress, true);
  releaseFirstWrite();
  await firstTransaction;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settlementCompleted, false);
  await secondWriteStarted;
  assert.equal(settlementCompleted, false);
  releaseSecondWrite();
  await Promise.all([secondTransaction, settlementPromise]);
  assert.equal(settlementCompleted, true);
  assert.equal(transactionExecutor.transactionInProgress, false);
});

test("rejects unknown automatic mode and malformed guided selections", () => {
  assert.throws(
    () => createAutomaticSwitchingConfigurationUpdates({ switchingMode: "unknown" }),
    /Unsupported automatic switching mode/
  );
  assert.throws(
    () =>
      createGuidedThemeConfigurationUpdates({
        appearanceBehavior: "unknown",
        contrast: "medium",
        workbenchStyle: "material",
      }),
    /Guided theme selections are invalid/
  );
});

test("reconciles configuration changes after transaction settlement", async () => {
  let transactionInProgress = true;
  let releaseSettlement;
  const settlement = new Promise((resolve) => {
    releaseSettlement = resolve;
  });
  const reconciledChanges = [];
  const configurationChangeReconciler = createConfigurationChangeReconciler(
    {
      get transactionInProgress() {
        return transactionInProgress;
      },
      settle: () => settlement,
    },
    (configurationChange) => reconciledChanges.push(configurationChange)
  );
  configurationChangeReconciler.request({
    scheduleAffected: true,
    themePreferencesAffected: false,
  });
  configurationChangeReconciler.request({
    scheduleAffected: false,
    themePreferencesAffected: true,
  });
  assert.deepEqual(reconciledChanges, []);
  transactionInProgress = false;
  releaseSettlement();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(reconciledChanges, [{ scheduleAffected: true, themePreferencesAffected: true }]);
  configurationChangeReconciler.dispose();
});

test("flushes immediately when idle and still flushes after a rejected settlement", async () => {
  const reconciledChanges = [];
  let transactionInProgress = false;
  let rejectSettlement;
  const rejectedSettlement = new Promise((_resolveSettlement, reject) => {
    rejectSettlement = reject;
  });
  const configurationChangeReconciler = createConfigurationChangeReconciler(
    {
      get transactionInProgress() {
        return transactionInProgress;
      },
      settle: () => rejectedSettlement,
    },
    (configurationChange) => reconciledChanges.push(configurationChange)
  );
  configurationChangeReconciler.request({
    scheduleAffected: false,
    themePreferencesAffected: true,
  });
  assert.deepEqual(reconciledChanges, [
    { scheduleAffected: false, themePreferencesAffected: true },
  ]);
  transactionInProgress = true;
  configurationChangeReconciler.request({
    scheduleAffected: true,
    themePreferencesAffected: false,
  });
  transactionInProgress = false;
  rejectSettlement(new Error("settlement failed"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(reconciledChanges, [
    { scheduleAffected: false, themePreferencesAffected: true },
    { scheduleAffected: true, themePreferencesAffected: false },
  ]);
  configurationChangeReconciler.dispose();
  configurationChangeReconciler.request({ scheduleAffected: true, themePreferencesAffected: true });
  assert.equal(reconciledChanges.length, 2);
});
