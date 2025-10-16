export interface WeekRange {
  start: Date;
  end: Date;
}

export const ZENDESK_TZ_OFFSET_HOURS = -12;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toTimezone(date: Date, offsetHours: number): Date {
  return new Date(date.getTime() + offsetHours * 60 * 60 * 1000);
}

export function toZendeskTimezone(date: Date): Date {
  return toTimezone(date, ZENDESK_TZ_OFFSET_HOURS);
}

export function fromZendeskTimezone(date: Date): Date {
  return toTimezone(date, -ZENDESK_TZ_OFFSET_HOURS);
}

function truncateToZendeskMidnight(localDate: Date): Date {
  const truncated = new Date(localDate);
  truncated.setUTCHours(0, 0, 0, 0);
  return truncated;
}

function getWeekRangeForDate(referenceDate: Date, offsetWeeks = 0): WeekRange {
  const localReference = toZendeskTimezone(referenceDate);
  const startLocal = truncateToZendeskMidnight(localReference);
  const isoDay = (startLocal.getUTCDay() + 6) % 7;
  startLocal.setUTCDate(startLocal.getUTCDate() - isoDay - offsetWeeks * 7);

  const endLocal = new Date(startLocal.getTime() + 7 * MS_PER_DAY - 1);

  return {
    start: fromZendeskTimezone(startLocal),
    end: fromZendeskTimezone(endLocal),
  };
}

/**
 * Calculate Zendesk-style week number.
 */
export function getZendeskWeekNumber(date: Date): number {
  const localDate = toZendeskTimezone(date);
  const target = new Date(Date.UTC(
    localDate.getUTCFullYear(),
    localDate.getUTCMonth(),
    localDate.getUTCDate()
  ));

  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);

  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);

  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * MS_PER_DAY));
}

export function getWeekRange(offsetWeeks = 0): WeekRange {
  return getWeekRangeForDate(new Date(), offsetWeeks);
}

/**
 * Get date range for a specific period type ('week' or 'day') relative to a reference date.
 * @param referenceDate The reference date (defaults to current date)
 * @param periodType Type of period ('week' or 'day')
 * @returns Object containing start and end dates
 */
export function getDateRange(referenceDate: Date, periodType: 'week' | 'day' = 'week'): WeekRange {
  if (periodType === 'week') {
    return getWeekRangeForDate(referenceDate, 0);
  }

  const localEnd = toZendeskTimezone(referenceDate);
  const startLocal = truncateToZendeskMidnight(localEnd);
  const endLocal = new Date(startLocal.getTime() + MS_PER_DAY - 1);

  return {
    start: fromZendeskTimezone(startLocal),
    end: fromZendeskTimezone(endLocal),
  };
}

/**
 * Returns a date range (inclusive) ending at referenceDate and spanning `days`.
 * Default reference is now and aligned to KST midnight.
 * @deprecated Use getDateRange with periodType instead
 */
export function getDateRangeDays(days: number, referenceDate: Date = new Date()): WeekRange {
  const localEnd = truncateToZendeskMidnight(toZendeskTimezone(referenceDate));
  const startLocal = new Date(localEnd.getTime() - (days - 1) * MS_PER_DAY);

  return {
    start: fromZendeskTimezone(startLocal),
    end: fromZendeskTimezone(localEnd),
  };
}
