import type { ScheduledTheme } from "./interface";
import { resolveScheduledTheme } from "./schedule";

export interface ScheduledThemeSwitch {
  cancel(): void;
}

export interface ThemeScheduleControllerDependencies {
  currentDate(): Date;
  isScheduledThemeSupported(themeName: string): boolean;
  readActiveTheme(): string | undefined;
  readConfiguredSchedule(): ScheduledTheme[];
  readScheduledSwitchingEnabled(): boolean;
  readSystemColorSchemeDetectionEnabled(): boolean;
  reportScheduleError(scheduleError: unknown): Promise<void>;
  reportSchedulePaused(): Promise<void>;
  scheduleThemeSwitch(
    continueThemeSchedule: () => void,
    millisecondsUntilNextSwitch: number
  ): ScheduledThemeSwitch;
  updateActiveTheme(themeName: string): Promise<void>;
}

export class ThemeScheduleController {
  private nextThemeSwitch: ScheduledThemeSwitch | undefined;
  private queuedScheduleOperation: Promise<void> = Promise.resolve();
  private scheduleConfigurationRevision = 0;

  constructor(private readonly dependencies: ThemeScheduleControllerDependencies) {}

  restartFromConfiguration(): Promise<void> {
    const requestedScheduleRevision = ++this.scheduleConfigurationRevision;
    this.clearNextThemeSwitch();
    const scheduleOperation = this.queuedScheduleOperation.then(async () => {
      this.clearNextThemeSwitch();
      if (requestedScheduleRevision !== this.scheduleConfigurationRevision) return;
      if (!this.dependencies.readScheduledSwitchingEnabled()) return;
      if (this.dependencies.readSystemColorSchemeDetectionEnabled()) {
        await this.dependencies.reportSchedulePaused();
        return;
      }
      await this.applyCurrentThemeAndScheduleNextSwitch(requestedScheduleRevision);
    });
    this.queuedScheduleOperation = scheduleOperation.catch(() => undefined);
    return scheduleOperation;
  }

  dispose(): void {
    this.scheduleConfigurationRevision += 1;
    this.clearNextThemeSwitch();
  }

  private clearNextThemeSwitch(): void {
    this.nextThemeSwitch?.cancel();
    this.nextThemeSwitch = undefined;
  }

  private async applyCurrentThemeAndScheduleNextSwitch(
    requestedScheduleRevision: number
  ): Promise<void> {
    const configuredSchedule = this.dependencies.readConfiguredSchedule();
    for (const scheduledTheme of configuredSchedule) {
      if (!this.dependencies.isScheduledThemeSupported(scheduledTheme.theme)) {
        throw new Error(`Unsupported scheduled theme: ${scheduledTheme.theme}`);
      }
    }

    const resolvedSchedule = resolveScheduledTheme(
      configuredSchedule,
      this.dependencies.currentDate()
    );
    if (requestedScheduleRevision !== this.scheduleConfigurationRevision) return;
    if (this.dependencies.readActiveTheme() !== resolvedSchedule.activeTheme) {
      await this.dependencies.updateActiveTheme(resolvedSchedule.activeTheme);
    }
    if (requestedScheduleRevision !== this.scheduleConfigurationRevision) return;

    this.nextThemeSwitch = this.dependencies.scheduleThemeSwitch(
      () => void this.continueThemeSchedule(),
      resolvedSchedule.millisecondsUntilNextSwitch + 100
    );
  }

  private async continueThemeSchedule(): Promise<void> {
    try {
      await this.restartFromConfiguration();
    } catch (scheduleError) {
      this.clearNextThemeSwitch();
      await this.dependencies.reportScheduleError(scheduleError);
    }
  }
}
