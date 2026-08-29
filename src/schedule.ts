import type { ScheduledTheme } from "./interface";

interface ParsedScheduledTheme extends ScheduledTheme {
  minuteOfDay: number;
}

export interface ResolvedScheduledTheme {
  activeTheme: string;
  millisecondsUntilNextSwitch: number;
}

function parseScheduleTime(scheduleTime: string): number {
  const parsedTime = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/.exec(scheduleTime);
  if (!parsedTime) throw new Error(`Invalid schedule time: ${scheduleTime}`);

  return Number(parsedTime[1]) * 60 + Number(parsedTime[2]);
}

function parseThemeSchedule(themeSchedule: readonly ScheduledTheme[]): ParsedScheduledTheme[] {
  if (themeSchedule.length === 0) throw new Error("Theme schedule cannot be empty");

  const parsedThemeSchedule = themeSchedule
    .map((scheduledTheme) => ({
      ...scheduledTheme,
      minuteOfDay: parseScheduleTime(scheduledTheme.time),
    }))
    .sort(
      (firstScheduledTheme, secondScheduledTheme) =>
        firstScheduledTheme.minuteOfDay - secondScheduledTheme.minuteOfDay
    );
  const uniqueScheduleTimes = new Set(
    parsedThemeSchedule.map((scheduledTheme) => scheduledTheme.minuteOfDay)
  );
  if (uniqueScheduleTimes.size !== parsedThemeSchedule.length) {
    throw new Error("Theme schedule cannot contain duplicate times");
  }

  return parsedThemeSchedule;
}

export function resolveScheduledTheme(
  themeSchedule: readonly ScheduledTheme[],
  currentDate: Date
): ResolvedScheduledTheme {
  const parsedThemeSchedule = parseThemeSchedule(themeSchedule);
  const currentMinuteOfDay = currentDate.getHours() * 60 + currentDate.getMinutes();
  const firstScheduledTheme = parsedThemeSchedule[0];
  const lastScheduledTheme = parsedThemeSchedule.at(-1);
  if (!firstScheduledTheme || !lastScheduledTheme) {
    throw new Error("Theme schedule could not be resolved");
  }

  let activeScheduledTheme = lastScheduledTheme;
  for (const scheduledTheme of parsedThemeSchedule) {
    if (scheduledTheme.minuteOfDay > currentMinuteOfDay) break;
    activeScheduledTheme = scheduledTheme;
  }
  const nextScheduledTheme =
    parsedThemeSchedule.find((scheduledTheme) => scheduledTheme.minuteOfDay > currentMinuteOfDay) ??
    firstScheduledTheme;

  const nextSwitchDate = new Date(currentDate);
  nextSwitchDate.setHours(Math.floor(nextScheduledTheme.minuteOfDay / 60));
  nextSwitchDate.setMinutes(nextScheduledTheme.minuteOfDay % 60, 0, 0);
  if (nextSwitchDate <= currentDate) nextSwitchDate.setDate(nextSwitchDate.getDate() + 1);

  return {
    activeTheme: activeScheduledTheme.theme,
    millisecondsUntilNextSwitch: nextSwitchDate.getTime() - currentDate.getTime(),
  };
}
