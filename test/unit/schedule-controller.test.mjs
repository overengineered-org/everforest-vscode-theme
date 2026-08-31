import assert from "node:assert/strict";
import test from "node:test";
import { ThemeScheduleController } from "../../dist/schedule-controller.js";

const supportedSchedule = [
  { time: "07:00", theme: "Everforest Complete Light" },
  { time: "19:00", theme: "Everforest Complete Dark" },
];

function createThemeScheduleControllerHarness(initialActiveTheme = "Everforest Complete Dark") {
  let activeTheme = initialActiveTheme;
  let configuredSchedule = supportedSchedule;
  let currentDate = new Date(2026, 7, 30, 18, 0, 0);
  let scheduledSwitchingEnabled = true;
  let systemColorSchemeDetectionEnabled = false;
  const scheduledThemeSwitches = [];
  const scheduleErrors = [];
  const scheduleWarnings = [];
  let scheduleErrorFailure;
  let reportScheduleErrorCompletion;
  const scheduleErrorReported = new Promise((resolve) => {
    reportScheduleErrorCompletion = resolve;
  });
  const appliedThemes = [];
  let pauseWarningCompletion = Promise.resolve();
  let pauseWarningFailure;
  let reportPauseWarningCompletion;
  const pauseWarningReported = new Promise((resolve) => {
    reportPauseWarningCompletion = resolve;
  });
  let activeThemeUpdateCompletion = Promise.resolve();
  let nextActiveThemeUpdateError;
  let observeActiveThemeUpdateStart = () => undefined;
  let observeCurrentDateRead = () => undefined;
  let observeScheduledSwitchingEnabledRead = () => undefined;
  let observeSystemColorSchemeDetectionRead = () => undefined;
  let observeActiveThemeRead = () => undefined;

  return {
    appliedThemes,
    scheduleErrors,
    scheduleWarnings,
    scheduleErrorReported,
    pauseWarningReported,
    scheduledThemeSwitches,
    setConfiguredSchedule: (newConfiguredSchedule) => {
      configuredSchedule = newConfiguredSchedule;
    },
    setScheduledSwitchingEnabled: (enabled) => {
      scheduledSwitchingEnabled = enabled;
    },
    setScheduleErrorFailure: (error) => {
      scheduleErrorFailure = error;
    },
    setCurrentDate: (newCurrentDate) => {
      currentDate = newCurrentDate;
    },
    setSystemColorSchemeDetectionEnabled: (enabled) => {
      systemColorSchemeDetectionEnabled = enabled;
    },
    setPauseWarningCompletion: (completion) => {
      pauseWarningCompletion = completion;
    },
    setPauseWarningFailure: (warningError) => {
      pauseWarningFailure = warningError;
    },
    setActiveThemeUpdateCompletion: (completion) => {
      activeThemeUpdateCompletion = completion;
    },
    setNextActiveThemeUpdateError: (updateError) => {
      nextActiveThemeUpdateError = updateError;
    },
    setActiveThemeUpdateStartObserver: (observer) => {
      observeActiveThemeUpdateStart = observer;
    },
    setCurrentDateReadObserver: (observer) => {
      observeCurrentDateRead = observer;
    },
    setScheduledSwitchingEnabledReadObserver: (observer) => {
      observeScheduledSwitchingEnabledRead = observer;
    },
    setSystemColorSchemeDetectionReadObserver: (observer) => {
      observeSystemColorSchemeDetectionRead = observer;
    },
    setActiveThemeReadObserver: (observer) => {
      observeActiveThemeRead = observer;
    },
    themeScheduleController: new ThemeScheduleController({
      currentDate: () => {
        observeCurrentDateRead();
        return currentDate;
      },
      readActiveTheme: () => {
        observeActiveThemeRead();
        return activeTheme;
      },
      readConfiguredSchedule: () => configuredSchedule,
      readScheduledSwitchingEnabled: () => {
        observeScheduledSwitchingEnabledRead();
        return scheduledSwitchingEnabled;
      },
      readSystemColorSchemeDetectionEnabled: () => {
        observeSystemColorSchemeDetectionRead();
        return systemColorSchemeDetectionEnabled;
      },
      async reportScheduleError(scheduleError) {
        scheduleErrors.push(scheduleError);
        reportScheduleErrorCompletion();
        if (scheduleErrorFailure) throw scheduleErrorFailure;
      },
      async reportSchedulePaused() {
        scheduleWarnings.push("paused");
        reportPauseWarningCompletion();
        if (pauseWarningFailure) throw pauseWarningFailure;
        await pauseWarningCompletion;
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
      async updateActiveTheme(themeName, shouldApplyTheme) {
        const updateCompletion = activeThemeUpdateCompletion;
        const updateError = nextActiveThemeUpdateError;
        nextActiveThemeUpdateError = undefined;
        observeActiveThemeUpdateStart(themeName);
        await updateCompletion;
        if (updateError) throw updateError;
        if (!shouldApplyTheme()) return;
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

test("keeps the active scheduled theme when no update is needed", async () => {
  const themeScheduleControllerHarness = createThemeScheduleControllerHarness(
    "Everforest Complete Light"
  );

  await themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();

  assert.deepEqual(themeScheduleControllerHarness.appliedThemes, []);
  assert.equal(themeScheduleControllerHarness.scheduledThemeSwitches.length, 1);
});

test("ignores a queued restart superseded before it starts", async () => {
  const themeScheduleControllerHarness = createThemeScheduleControllerHarness();

  const supersededRestart =
    themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();
  const latestRestart =
    themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();

  await Promise.all([supersededRestart, latestRestart]);

  assert.deepEqual(themeScheduleControllerHarness.appliedThemes, ["Everforest Complete Light"]);
  assert.equal(themeScheduleControllerHarness.scheduledThemeSwitches.length, 1);
});

test("stops before applying when scheduling is superseded during enablement read", async () => {
  const themeScheduleControllerHarness = createThemeScheduleControllerHarness();
  let latestRestart;
  let restartTriggered = false;
  themeScheduleControllerHarness.setScheduledSwitchingEnabledReadObserver(() => {
    if (restartTriggered) return;
    restartTriggered = true;
    latestRestart =
      themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();
  });

  const supersededRestart =
    themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();
  await supersededRestart;
  await latestRestart;

  assert.deepEqual(themeScheduleControllerHarness.appliedThemes, ["Everforest Complete Light"]);
});

test("stops before applying when scheduling is superseded during date resolution", async () => {
  const themeScheduleControllerHarness = createThemeScheduleControllerHarness();
  let latestRestart;
  let restartTriggered = false;
  themeScheduleControllerHarness.setCurrentDateReadObserver(() => {
    if (restartTriggered) return;
    restartTriggered = true;
    latestRestart =
      themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();
  });

  const supersededRestart =
    themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();
  await supersededRestart;
  await latestRestart;

  assert.deepEqual(themeScheduleControllerHarness.appliedThemes, ["Everforest Complete Light"]);
});

test("stops before applying when scheduling is superseded during active-theme read", async () => {
  const themeScheduleControllerHarness = createThemeScheduleControllerHarness();
  let latestRestart;
  let restartTriggered = false;
  themeScheduleControllerHarness.setActiveThemeReadObserver(() => {
    if (restartTriggered) return;
    restartTriggered = true;
    latestRestart =
      themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();
  });

  const supersededRestart =
    themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();
  await supersededRestart;
  await latestRestart;

  assert.deepEqual(themeScheduleControllerHarness.appliedThemes, ["Everforest Complete Light"]);
});

test("pauses without scheduling when native system appearance detection is enabled", async () => {
  const themeScheduleControllerHarness = createThemeScheduleControllerHarness();
  themeScheduleControllerHarness.setSystemColorSchemeDetectionEnabled(true);

  await themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();

  assert.deepEqual(themeScheduleControllerHarness.scheduleWarnings, ["paused"]);
  assert.deepEqual(themeScheduleControllerHarness.appliedThemes, []);
  assert.deepEqual(themeScheduleControllerHarness.scheduledThemeSwitches, []);
});

test("ignores a paused warning callback after a newer restart supersedes it", async () => {
  const themeScheduleControllerHarness = createThemeScheduleControllerHarness();
  let latestRestart;
  let restartTriggered = false;
  themeScheduleControllerHarness.setSystemColorSchemeDetectionEnabled(true);
  themeScheduleControllerHarness.setSystemColorSchemeDetectionReadObserver(() => {
    if (restartTriggered) return;
    restartTriggered = true;
    latestRestart =
      themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();
  });

  const supersededRestart =
    themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();
  await supersededRestart;
  await latestRestart;

  assert.deepEqual(themeScheduleControllerHarness.scheduleWarnings, ["paused"]);
});

test("swallows a paused warning reporting failure", async () => {
  const themeScheduleControllerHarness = createThemeScheduleControllerHarness();
  themeScheduleControllerHarness.setSystemColorSchemeDetectionEnabled(true);
  themeScheduleControllerHarness.setPauseWarningFailure(new Error("warning unavailable"));

  await themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();
  await themeScheduleControllerHarness.pauseWarningReported;
  await Promise.resolve();

  assert.deepEqual(themeScheduleControllerHarness.scheduleWarnings, ["paused"]);
});

test("does not block a later reconciliation on a hanging pause warning", async () => {
  const themeScheduleControllerHarness = createThemeScheduleControllerHarness();
  themeScheduleControllerHarness.setSystemColorSchemeDetectionEnabled(true);
  themeScheduleControllerHarness.setPauseWarningCompletion(new Promise(() => {}));

  await themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();
  themeScheduleControllerHarness.setSystemColorSchemeDetectionEnabled(false);
  await themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();

  assert.deepEqual(themeScheduleControllerHarness.appliedThemes, ["Everforest Complete Light"]);
});

test("suppresses a stale delayed update failure after the latest restart succeeds", async () => {
  const themeScheduleControllerHarness = createThemeScheduleControllerHarness();
  const staleUpdateFailure = new Error("stale theme update failed");
  let releaseStaleUpdate;
  const staleUpdateReleased = new Promise((resolve) => {
    releaseStaleUpdate = resolve;
  });
  let reportStaleUpdateStarted;
  const staleUpdateStarted = new Promise((resolve) => {
    reportStaleUpdateStarted = resolve;
  });
  themeScheduleControllerHarness.setActiveThemeUpdateCompletion(staleUpdateReleased);
  themeScheduleControllerHarness.setNextActiveThemeUpdateError(staleUpdateFailure);
  themeScheduleControllerHarness.setActiveThemeUpdateStartObserver(() => {
    reportStaleUpdateStarted();
  });

  const staleRestart =
    themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();
  await staleUpdateStarted;
  const latestRestart =
    themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();
  themeScheduleControllerHarness.setActiveThemeUpdateCompletion(Promise.resolve());
  releaseStaleUpdate();

  await Promise.all([staleRestart, latestRestart]);
  assert.deepEqual(themeScheduleControllerHarness.scheduleErrors, []);
  assert.deepEqual(themeScheduleControllerHarness.appliedThemes, ["Everforest Complete Light"]);
  assert.equal(themeScheduleControllerHarness.scheduledThemeSwitches.length, 1);
});

test("does not apply a stale update after a newer restart disables scheduling", async () => {
  const themeScheduleControllerHarness = createThemeScheduleControllerHarness();
  let releaseStaleUpdate;
  const staleUpdateReleased = new Promise((resolve) => {
    releaseStaleUpdate = resolve;
  });
  let reportStaleUpdateStarted;
  const staleUpdateStarted = new Promise((resolve) => {
    reportStaleUpdateStarted = resolve;
  });
  themeScheduleControllerHarness.setActiveThemeUpdateCompletion(staleUpdateReleased);
  themeScheduleControllerHarness.setActiveThemeUpdateStartObserver(() => {
    reportStaleUpdateStarted();
  });

  const staleRestart =
    themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();
  await staleUpdateStarted;
  themeScheduleControllerHarness.setScheduledSwitchingEnabled(false);
  const latestRestart =
    themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();
  releaseStaleUpdate();

  await Promise.all([staleRestart, latestRestart]);
  assert.deepEqual(themeScheduleControllerHarness.appliedThemes, []);
  assert.deepEqual(themeScheduleControllerHarness.scheduledThemeSwitches, []);
});

test("keeps a disposed controller permanently inactive", async () => {
  const themeScheduleControllerHarness = createThemeScheduleControllerHarness();
  let releaseStaleUpdate;
  const staleUpdateReleased = new Promise((resolve) => {
    releaseStaleUpdate = resolve;
  });
  let reportStaleUpdateStarted;
  const staleUpdateStarted = new Promise((resolve) => {
    reportStaleUpdateStarted = resolve;
  });
  themeScheduleControllerHarness.setActiveThemeUpdateCompletion(staleUpdateReleased);
  themeScheduleControllerHarness.setActiveThemeUpdateStartObserver(() => {
    reportStaleUpdateStarted();
  });

  const inFlightRestart =
    themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();
  await staleUpdateStarted;
  themeScheduleControllerHarness.themeScheduleController.dispose();
  const restartAfterDispose =
    themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();
  releaseStaleUpdate();

  await Promise.all([inFlightRestart, restartAfterDispose]);
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

test("cancels the active timer when the extension is disposed", async () => {
  const themeScheduleControllerHarness = createThemeScheduleControllerHarness();
  await themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();

  themeScheduleControllerHarness.themeScheduleController.dispose();
  themeScheduleControllerHarness.themeScheduleController.dispose();
  themeScheduleControllerHarness.scheduledThemeSwitches[0].continueThemeSchedule();
  await Promise.resolve();

  assert.equal(themeScheduleControllerHarness.scheduledThemeSwitches[0].cancelled, true);
  assert.deepEqual(themeScheduleControllerHarness.scheduleErrors, []);
});

test("rejects an invalid current date without scheduling a timer", async () => {
  const themeScheduleControllerHarness = createThemeScheduleControllerHarness();
  themeScheduleControllerHarness.setCurrentDate(new Date(Number.NaN));

  await assert.rejects(
    themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration(),
    /valid date/
  );
  assert.deepEqual(themeScheduleControllerHarness.scheduledThemeSwitches, []);
});

test("reports a later schedule failure and leaves no active timer", async () => {
  const themeScheduleControllerHarness = createThemeScheduleControllerHarness();
  await themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();
  themeScheduleControllerHarness.setConfiguredSchedule([
    { time: "19:00", theme: "Unsupported Theme" },
  ]);

  themeScheduleControllerHarness.scheduledThemeSwitches[0].continueThemeSchedule();
  await themeScheduleControllerHarness.scheduleErrorReported;

  assert.equal(themeScheduleControllerHarness.scheduleErrors.length, 1);
  assert.match(String(themeScheduleControllerHarness.scheduleErrors[0]), /Unsupported scheduled/);
  assert.equal(themeScheduleControllerHarness.scheduledThemeSwitches[0].cancelled, true);
});

test("contains timer error-reporting failure and keeps later schedule work available", async () => {
  const themeScheduleControllerHarness = createThemeScheduleControllerHarness();
  await themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();
  themeScheduleControllerHarness.setConfiguredSchedule([
    { time: "19:00", theme: "Unsupported Theme" },
  ]);
  themeScheduleControllerHarness.setScheduleErrorFailure(new Error("error reporter unavailable"));

  themeScheduleControllerHarness.scheduledThemeSwitches[0].continueThemeSchedule();
  await themeScheduleControllerHarness.scheduleErrorReported;

  themeScheduleControllerHarness.setScheduleErrorFailure(undefined);
  themeScheduleControllerHarness.setConfiguredSchedule(supportedSchedule);
  await themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();

  assert.equal(themeScheduleControllerHarness.scheduledThemeSwitches.length, 2);
  assert.equal(themeScheduleControllerHarness.scheduledThemeSwitches[1].cancelled, false);
});

test("ignores a stale timer failure after a newer restart takes ownership", async () => {
  const themeScheduleControllerHarness = createThemeScheduleControllerHarness();
  await themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();

  let newerScheduleRestartPromise;
  let resolveNewerScheduleRestartCreated;
  const newerScheduleRestartCreated = new Promise((resolve) => {
    resolveNewerScheduleRestartCreated = resolve;
  });
  let activeThemeUpdateStartCount = 0;
  themeScheduleControllerHarness.setNextActiveThemeUpdateError(
    new Error("stale timer update failed")
  );
  themeScheduleControllerHarness.setCurrentDate(new Date(2026, 7, 30, 20, 0, 0));
  themeScheduleControllerHarness.setActiveThemeUpdateStartObserver(() => {
    activeThemeUpdateStartCount += 1;
    if (activeThemeUpdateStartCount !== 1) return;
    queueMicrotask(() => {
      queueMicrotask(() => {
        newerScheduleRestartPromise =
          themeScheduleControllerHarness.themeScheduleController.restartFromConfiguration();
        resolveNewerScheduleRestartCreated(newerScheduleRestartPromise);
      });
    });
  });

  themeScheduleControllerHarness.scheduledThemeSwitches[0].continueThemeSchedule();
  await newerScheduleRestartCreated;
  await newerScheduleRestartPromise;
  await Promise.resolve();

  assert.deepEqual(themeScheduleControllerHarness.scheduleErrors, []);
  assert.deepEqual(themeScheduleControllerHarness.appliedThemes, [
    "Everforest Complete Light",
    "Everforest Complete Dark",
  ]);
  assert.equal(themeScheduleControllerHarness.scheduledThemeSwitches.length, 2);
});
