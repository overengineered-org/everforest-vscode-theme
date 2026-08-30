import assert from "node:assert/strict";
import test from "node:test";
import { ThemeScheduleController } from "../../dist/schedule-controller.js";

const supportedSchedule = [
  { time: "07:00", theme: "Everforest Complete Light" },
  { time: "19:00", theme: "Everforest Complete Dark" },
];

function createThemeScheduleControllerHarness() {
  let activeTheme = "Everforest Complete Dark";
  let configuredSchedule = supportedSchedule;
  let scheduledSwitchingEnabled = true;
  let systemColorSchemeDetectionEnabled = false;
  const scheduledThemeSwitches = [];
  const scheduleErrors = [];
  const scheduleWarnings = [];
  const appliedThemes = [];

  return {
    appliedThemes,
    scheduleErrors,
    scheduleWarnings,
    scheduledThemeSwitches,
    setConfiguredSchedule: (newConfiguredSchedule) => {
      configuredSchedule = newConfiguredSchedule;
    },
    setScheduledSwitchingEnabled: (enabled) => {
      scheduledSwitchingEnabled = enabled;
    },
    setSystemColorSchemeDetectionEnabled: (enabled) => {
      systemColorSchemeDetectionEnabled = enabled;
    },
    themeScheduleController: new ThemeScheduleController({
      currentDate: () => new Date(2026, 7, 30, 18, 0, 0),
      isScheduledThemeSupported: (themeName) =>
        themeName === "Everforest Complete Dark" || themeName === "Everforest Complete Light",
      readActiveTheme: () => activeTheme,
      readConfiguredSchedule: () => configuredSchedule,
      readScheduledSwitchingEnabled: () => scheduledSwitchingEnabled,
      readSystemColorSchemeDetectionEnabled: () => systemColorSchemeDetectionEnabled,
      async reportScheduleError(scheduleError) {
        scheduleErrors.push(scheduleError);
      },
      async reportSchedulePaused() {
        scheduleWarnings.push("paused");
      },
      scheduleThemeSwitch(continueThemeSchedule, millisecondsUntilNextSwitch) {
        const scheduledThemeSwitch = {
          cancelled: false,
          continueThemeSchedule,
          millisecondsUntilNextSwitch,
        };
        scheduledThemeSwitches.push(scheduledThemeSwitch);
        return {
          cancel: () => {
            scheduledThemeSwitch.cancelled = true;
          },
        };
      },
      async updateActiveTheme(themeName) {
        activeTheme = themeName;
        appliedThemes.push(themeName);
      },
    }),
  };
}

test("applies the active scheduled theme and creates one next-boundary timer", async () => {
  const themeScheduleControllerHarness = createThemeScheduleControllerHarness();

  await themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();

  assert.deepEqual(themeScheduleControllerHarness.appliedThemes, ["Everforest Complete Light"]);
  assert.equal(themeScheduleControllerHarness.scheduledThemeSwitches.length, 1);
  assert.equal(
    themeScheduleControllerHarness.scheduledThemeSwitches[0].millisecondsUntilNextSwitch,
    3_600_100
  );
});

test("pauses without scheduling when native system appearance detection is enabled", async () => {
  const themeScheduleControllerHarness = createThemeScheduleControllerHarness();
  themeScheduleControllerHarness.setSystemColorSchemeDetectionEnabled(true);

  await themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();

  assert.deepEqual(themeScheduleControllerHarness.scheduleWarnings, ["paused"]);
  assert.deepEqual(themeScheduleControllerHarness.appliedThemes, []);
  assert.deepEqual(themeScheduleControllerHarness.scheduledThemeSwitches, []);
});

test("cancels the active timer when scheduled switching is disabled", async () => {
  const themeScheduleControllerHarness = createThemeScheduleControllerHarness();
  await themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();
  themeScheduleControllerHarness.setScheduledSwitchingEnabled(false);

  await themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();

  assert.equal(themeScheduleControllerHarness.scheduledThemeSwitches[0].cancelled, true);
  assert.equal(themeScheduleControllerHarness.scheduledThemeSwitches.length, 1);
});

test("reports a later schedule failure and leaves no active timer", async () => {
  const themeScheduleControllerHarness = createThemeScheduleControllerHarness();
  await themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();
  themeScheduleControllerHarness.setConfiguredSchedule([
    { time: "19:00", theme: "Unsupported Theme" },
  ]);

  themeScheduleControllerHarness.scheduledThemeSwitches[0].continueThemeSchedule();
  for (let attemptNumber = 0; attemptNumber < 20; attemptNumber += 1) {
    if (themeScheduleControllerHarness.scheduleErrors.length > 0) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
  }

  assert.equal(themeScheduleControllerHarness.scheduleErrors.length, 1);
  assert.match(String(themeScheduleControllerHarness.scheduleErrors[0]), /Unsupported scheduled/);
  assert.equal(themeScheduleControllerHarness.scheduledThemeSwitches[0].cancelled, true);
});
