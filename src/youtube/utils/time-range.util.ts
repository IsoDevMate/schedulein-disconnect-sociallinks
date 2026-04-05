/**
 * Utility functions for consistent time range handling across the application
 */

export interface TimeRangeConfig {
  hours: number;
  days: number;
  label: string;
}

export const TIME_RANGE_CONFIGS: Record<string, TimeRangeConfig> = {
  hour: { hours: 1, days: 0, label: "Last Hour" },
  day: { hours: 24, days: 1, label: "Last Day" },
  "24h": { hours: 24, days: 1, label: "Last 24 Hours" },
  week: { hours: 168, days: 7, label: "Last Week" },
  "7d": { hours: 168, days: 7, label: "Last 7 Days" },
  month: { hours: 720, days: 30, label: "Last Month" },
  "30d": { hours: 720, days: 30, label: "Last 30 Days" },
  year: { hours: 8760, days: 365, label: "Last Year" },
};

/**
 * Get time range configuration
 */
export function getTimeRangeConfig(timeRange: string): TimeRangeConfig {
  const config = TIME_RANGE_CONFIGS[timeRange.toLowerCase()];
  if (!config) {
    // Default to 7 days if unknown
    return TIME_RANGE_CONFIGS["week"];
  }
  return config;
}

/**
 * Get start date for a time range
 */
export function getTimeRangeStartDate(timeRange: string): Date {
  const config = getTimeRangeConfig(timeRange);
  const now = new Date();
  return new Date(now.getTime() - config.hours * 60 * 60 * 1000);
}

/**
 * Get start date as ISO string for API calls
 */
export function getTimeRangeStartISO(timeRange: string): string {
  return getTimeRangeStartDate(timeRange).toISOString();
}

/**
 * Get time range in hours
 */
export function getTimeRangeHours(timeRange: string): number {
  const config = getTimeRangeConfig(timeRange);
  return config.hours;
}

/**
 * Get time range in days
 */
export function getTimeRangeDays(timeRange: string): number {
  const config = getTimeRangeConfig(timeRange);
  return config.days;
}

/**
 * Validate if a time range is supported
 */
export function isValidTimeRange(timeRange: string): boolean {
  return timeRange.toLowerCase() in TIME_RANGE_CONFIGS;
}

/**
 * Get all supported time ranges
 */
export function getSupportedTimeRanges(): string[] {
  return Object.keys(TIME_RANGE_CONFIGS);
}
