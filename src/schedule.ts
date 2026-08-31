import { validateThemeSchedule } from "./configuration";
import type { ScheduledTheme } from "./interface";

interface ParsedScheduledTheme extends ScheduledTheme {
  minuteOfDay: number;
}

export interface ResolvedScheduledTheme {
  activeTheme: string;
  millisecondsUntilNextSwitch: number;
}

function parseScheduleTime(scheduleTime: string): number {
  return Number(scheduleTime.slice(0, 2)) * 60 + Number(scheduleTime.slice(3, 5));
}

function parseThemeSchedule(themeSchedule: readonly ScheduledTheme[]): ParsedScheduledTheme[] {
  const validatedThemeSchedule = validateThemeSchedule(themeSchedule);

  const parsedThemeSchedule = validatedThemeSchedule
    .map((scheduledTheme) => ({
      ...scheduledTheme,
      minuteOfDay: parseScheduleTime(scheduledTheme.time),
    }))
    .sort(
      (firstScheduledTheme, secondScheduledTheme) =>
        firstScheduledTheme.minuteOfDay - secondScheduledTheme.minuteOfDay
    );
  return parsedThemeSchedule;
}

export function resolveScheduledTheme(
  themeSchedule: readonly ScheduledTheme[],
  currentDate: Date
): ResolvedScheduledTheme {
  const parsedThemeSchedule = parseThemeSchedule(themeSchedule);
  if (Number.isNaN(currentDate.getTime())) throw new Error("Theme schedule requires a valid date");

  const localBoundaryDate = (dayOffset: number, minuteOfDay: number): Date | undefined => {
    const boundaryDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      currentDate.getDate() + dayOffset,
      Math.floor(minuteOfDay / 60),
      minuteOfDay % 60,
      0,
      0
    );
    // Date normalises nonexistent DST times. A boundary that does not round-trip
    // to its requested local wall-clock time is skipped for that calendar day.
    if (
      boundaryDate.getHours() !== Math.floor(minuteOfDay / 60) ||
      boundaryDate.getMinutes() !== minuteOfDay % 60
    ) {
      return undefined;
    }
    // An ambiguous fall-back wall-clock time intentionally means the earlier
    // real occurrence. The local Date constructor selects that occurrence.
    return boundaryDate;
  };

  const scheduleBoundaries: Array<{ scheduledTheme: ParsedScheduledTheme; boundaryDate: Date }> =
    [];
  for (let dayOffset = -370; dayOffset <= 370; dayOffset += 1) {
    for (const scheduledTheme of parsedThemeSchedule) {
      const boundaryDate = localBoundaryDate(dayOffset, scheduledTheme.minuteOfDay);
      if (boundaryDate) scheduleBoundaries.push({ scheduledTheme, boundaryDate });
    }
  }

  const activeBoundary = scheduleBoundaries
    .filter(({ boundaryDate }) => boundaryDate <= currentDate)
    .at(-1)!;
  const nextBoundary = scheduleBoundaries.find(({ boundaryDate }) => boundaryDate > currentDate)!;

  return {
    activeTheme: activeBoundary.scheduledTheme.theme,
    millisecondsUntilNextSwitch: nextBoundary.boundaryDate.getTime() - currentDate.getTime(),
  };
}
