export interface WeekRange {
  start: Date;
  end: Date;
}

/**
 * Calculate Zendesk-style week number (ISO 8601, weeks start on Monday in KST).
 */
export function getZendeskWeekNumber(date: Date): number {
  const kstDate = toKst(date);
  const target = new Date(Date.UTC(
    kstDate.getUTCFullYear(),
    kstDate.getUTCMonth(),
    kstDate.getUTCDate()
  ));

  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);

  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);

  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
}

/**
 * Returns the Monday-Sunday week range (KST) for the given offset.
 * @param offsetWeeks 0 = current week, 1 = previous week, etc.
 */
export function getWeekRange(offsetWeeks = 0): WeekRange {
  const now = toKst(new Date());
  const day = (now.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 15, 0, 0));
  monday.setUTCDate(monday.getUTCDate() - day - offsetWeeks * 7);

  const start = new Date(monday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(14, 59, 59, 999);

  return { start, end };
}

/**
 * Get date range for a specific period type ('week' or 'day') relative to a reference date.
 * @param referenceDate The reference date (defaults to current date)
 * @param periodType Type of period ('week' or 'day')
 * @returns Object containing start and end dates
 */
export function getDateRange(referenceDate: Date, periodType: 'week' | 'day' = 'week'): WeekRange {
  const end = toKst(referenceDate);
  const start = new Date(end);
  
  if (periodType === 'week') {
    // For week, get the start of the week (Sunday)
    const day = end.getUTCDay();
    start.setUTCDate(end.getUTCDate() - day);
  } else {
    // For day, just use the same day
    start.setUTCDate(end.getUTCDate());
  }
  
  // Set to start of day in KST
  start.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(23, 59, 59, 999);
  
  return { start, end };
}

/**
 * Returns a date range (inclusive) ending at referenceDate and spanning `days`.
 * Default reference is now and aligned to KST midnight.
 * @deprecated Use getDateRange with periodType instead
 */
export function getDateRangeDays(days: number, referenceDate: Date = new Date()): WeekRange {
  const end = toKst(referenceDate);
  end.setUTCHours(0, 0, 0, 0);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  return { start, end };
}

function toKst(date: Date): Date {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000);
}
