import assert from "node:assert/strict";
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
