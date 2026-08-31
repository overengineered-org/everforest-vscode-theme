import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { resolveScheduledTheme } from "../../dist/schedule.js";

const standardThemeSchedule = [
  { time: "07:00", theme: "Everforest Complete Light" },
  { time: "19:00", theme: "Everforest Complete Dark" },
];

test("resolves the active theme across midnight", () => {
  assert.equal(
    resolveScheduledTheme(standardThemeSchedule, new Date(2026, 7, 29, 6, 30)).activeTheme,
    "Everforest Complete Dark"
  );
  assert.equal(
    resolveScheduledTheme(standardThemeSchedule, new Date(2026, 7, 29, 12, 0)).activeTheme,
    "Everforest Complete Light"
  );
  assert.equal(
    resolveScheduledTheme(standardThemeSchedule, new Date(2026, 7, 29, 21, 0)).activeTheme,
    "Everforest Complete Dark"
  );
});

test("schedules the next exact boundary instead of polling", () => {
  const resolvedSchedule = resolveScheduledTheme(
    standardThemeSchedule,
    new Date(2026, 7, 29, 18, 30)
  );

  assert.equal(resolvedSchedule.activeTheme, "Everforest Complete Light");
  assert.equal(resolvedSchedule.millisecondsUntilNextSwitch, 30 * 60 * 1_000);
});

test("rejects invalid and ambiguous schedules", () => {
  assert.throws(() => resolveScheduledTheme([], new Date()), /cannot be empty/);
  assert.throws(
    () => resolveScheduledTheme(standardThemeSchedule, new Date(Number.NaN)),
    /requires a valid date/
  );
  assert.throws(
    () => resolveScheduledTheme([{ time: "7:00", theme: "Light" }], new Date()),
    /Invalid schedule time/
  );
  assert.throws(
    () =>
      resolveScheduledTheme(
        [
          { time: "07:00", theme: "Light" },
          { time: "07:00", theme: "Dark" },
        ],
        new Date()
      ),
    /duplicate times/
  );
});

test("skips a nonexistent DST boundary instead of normalising it", () => {
  const scheduleResolutionOutput = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { resolveScheduledTheme } from "./dist/schedule.js";
const schedule = [
  { time: "02:30", theme: "Everforest Complete Light" },
  { time: "19:00", theme: "Everforest Complete Dark" },
];
const resolvedSchedule = resolveScheduledTheme(schedule, new Date(2026, 2, 8, 3, 30));
console.log(JSON.stringify(resolvedSchedule));`,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, TZ: "America/New_York" },
      encoding: "utf8",
    }
  );
  assert.deepEqual(JSON.parse(scheduleResolutionOutput), {
    activeTheme: "Everforest Complete Dark",
    millisecondsUntilNextSwitch: 15.5 * 60 * 60 * 1_000,
  });
});

test("uses the earlier real occurrence for an ambiguous fall-back boundary", () => {
  const scheduleResolutionOutput = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { resolveScheduledTheme } from "./dist/schedule.js";
const schedule = [
  { time: "01:30", theme: "Everforest Complete Light" },
  { time: "19:00", theme: "Everforest Complete Dark" },
];
const firstOccurrenceResolution = resolveScheduledTheme(
  schedule,
  new Date("2026-11-01T01:15:00-04:00")
);
const secondOccurrenceResolution = resolveScheduledTheme(
  schedule,
  new Date("2026-11-01T01:15:00-05:00")
);
console.log(JSON.stringify({ firstOccurrenceResolution, secondOccurrenceResolution }));`,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, TZ: "America/New_York" },
      encoding: "utf8",
    }
  );
  assert.deepEqual(JSON.parse(scheduleResolutionOutput), {
    firstOccurrenceResolution: {
      activeTheme: "Everforest Complete Dark",
      millisecondsUntilNextSwitch: 15 * 60 * 1_000,
    },
    secondOccurrenceResolution: {
      activeTheme: "Everforest Complete Light",
      millisecondsUntilNextSwitch: 17.75 * 60 * 60 * 1_000,
    },
  });
});
