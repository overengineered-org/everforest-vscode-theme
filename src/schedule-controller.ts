import type { ScheduledTheme } from "./interface";
import { resolveScheduledTheme } from "./schedule";

export interface ScheduledThemeSwitch {
  cancel(): void;
}

export interface ThemeScheduleControllerDependencies {
  currentDate(): Date;
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
  updateActiveTheme(themeName: string, shouldApplyTheme: () => boolean): Promise<void>;
}

export class ThemeScheduleController {
  private nextThemeSwitch: ScheduledThemeSwitch | undefined;
  private queuedScheduleOperation: Promise<void> = Promise.resolve();
  private scheduleConfigurationRevision = 0;
  private disposed = false;

  constructor(private readonly dependencies: ThemeScheduleControllerDependencies) {}

  restartFromConfiguration(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const requestedScheduleRevision = ++this.scheduleConfigurationRevision;
    this.clearNextThemeSwitch();
    const scheduleOperation = this.queuedScheduleOperation.then(async () => {
      try {
        if (!this.isCurrentScheduleRevision(requestedScheduleRevision)) return;
        this.clearNextThemeSwitch();
        if (!this.dependencies.readScheduledSwitchingEnabled()) return;
        if (this.dependencies.readSystemColorSchemeDetectionEnabled()) {
          // A warning is user feedback, not part of schedule reconciliation. Keep
          // timer/configuration work free to settle if the host notification hangs.
          void Promise.resolve()
            .then(() => {
              if (!this.isCurrentScheduleRevision(requestedScheduleRevision)) return;
              return this.dependencies.reportSchedulePaused();
            })
            .catch(() => undefined);
          return;
        }
        await this.applyCurrentThemeAndScheduleNextSwitch(requestedScheduleRevision);
      } catch (scheduleError) {
        // A newer restart owns the outcome. Do not reject an obsolete caller
        // after the latest revision has already taken over.
        if (!this.isCurrentScheduleRevision(requestedScheduleRevision)) return;
        throw scheduleError;
      }
    });
    this.queuedScheduleOperation = scheduleOperation.catch(() => undefined);
    return scheduleOperation;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scheduleConfigurationRevision += 1;
    this.clearNextThemeSwitch();
  }

  private isCurrentScheduleRevision(requestedScheduleRevision: number): boolean {
    return !this.disposed && requestedScheduleRevision === this.scheduleConfigurationRevision;
  }

  private clearNextThemeSwitch(): void {
    this.nextThemeSwitch?.cancel();
    this.nextThemeSwitch = undefined;
  }

  private async applyCurrentThemeAndScheduleNextSwitch(
    requestedScheduleRevision: number
  ): Promise<void> {
    if (!this.isCurrentScheduleRevision(requestedScheduleRevision)) return;
    const configuredSchedule = this.dependencies.readConfiguredSchedule();
    const resolvedSchedule = resolveScheduledTheme(
      configuredSchedule,
      this.dependencies.currentDate()
    );
    if (!this.isCurrentScheduleRevision(requestedScheduleRevision)) return;
    if (this.dependencies.readActiveTheme() !== resolvedSchedule.activeTheme) {
      if (!this.isCurrentScheduleRevision(requestedScheduleRevision)) return;
      await this.dependencies.updateActiveTheme(resolvedSchedule.activeTheme, () =>
        this.isCurrentScheduleRevision(requestedScheduleRevision)
      );
    }
    if (!this.isCurrentScheduleRevision(requestedScheduleRevision)) return;

    this.nextThemeSwitch = this.dependencies.scheduleThemeSwitch(
      () => void this.continueThemeSchedule(),
      resolvedSchedule.millisecondsUntilNextSwitch + 100
    );
  }

  private async continueThemeSchedule(): Promise<void> {
    if (this.disposed) return;
    const requestedScheduleRevision = this.scheduleConfigurationRevision + 1;
    try {
      await this.restartFromConfiguration();
    } catch (scheduleError) {
      if (!this.isCurrentScheduleRevision(requestedScheduleRevision)) return;
      this.clearNextThemeSwitch();
      // Error reporting is best-effort. Keep timer callbacks resolved even when
      // the host notification rejects, so the rejection cannot become unhandled.
      void Promise.resolve()
        .then(() => this.dependencies.reportScheduleError(scheduleError))
        .catch(() => undefined);
    }
  }
}
