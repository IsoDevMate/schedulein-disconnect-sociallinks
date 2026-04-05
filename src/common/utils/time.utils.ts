import { BadRequestException } from '@nestjs/common';

export class TimeUtils {
  static readonly MINIMUM_SCHEDULE_MINUTES = 3;
  static readonly PUBLISH_WINDOW_MINUTES = 3;

  static validateScheduleTime(scheduledTime: Date): void {
    const now = new Date();
    const minScheduleTime = new Date(
      now.getTime() + this.MINIMUM_SCHEDULE_MINUTES * 60 * 1000,
    );

    if (scheduledTime < minScheduleTime) {
      throw new BadRequestException(
        `Scheduled time must be at least ${this.MINIMUM_SCHEDULE_MINUTES} minutes from now`,
      );
    }
  }

  static isWithinPublishWindow(scheduledTime: Date): boolean {
    const now = new Date();
    const windowStart = new Date(
      scheduledTime.getTime() - this.PUBLISH_WINDOW_MINUTES * 60 * 1000,
    );
    const windowEnd = new Date(
      scheduledTime.getTime() + this.PUBLISH_WINDOW_MINUTES * 60 * 1000,
    );

    return now >= windowStart && now <= windowEnd;
  }

  static getCurrentTimeInTimezone(timezone: string): Date {
    return new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  }
}
