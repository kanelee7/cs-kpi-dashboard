import { resolveFirstReplyMetrics } from './zendeskClient';
import type { FirstReplyMetricResolution, ZendeskTicket } from './zendeskClient';
import { getDateRange, toZendeskTimezone } from '../utils/dateUtils';

// Constants (Zendesk Analytics와 동일한 값 사용)
const MAX_AHT_HOURS = 168; // 7 days cap (internal policy, Zendesk doesn't enforce a max)
const MAX_AHT_MINUTES = MAX_AHT_HOURS * 60;
const FRT_WINDOW_DAYS = 45; // FRT 계산 기간 확장
const AHT_WINDOW_DAYS = 45; // AHT 계산 기간 확장

// Zendesk와 동일한 버킷 기준 (분 단위)
const FRT_BUCKETS = {
  UNDER_1H: 60,         // 0-1시간
  UNDER_8H: 8 * 60,     // 1-8시간
  UNDER_24H: 24 * 60,   // 8-24시간
  OVER_24H: Infinity    // 24시간 초과
};

type FirstReplyMetricSource = string;

type FirstReplyMetricComponentsDetail = FirstReplyMetricResolution['components'];

interface FirstReplyMetricInfo {
  minutes: number | null;
  rawMinutes: number | null;
  source: FirstReplyMetricSource;
  calendarMinutes: number | null;
  businessMinutes: number | null;
  secondsValue: number | null;
  resolutionSource: string;
  resolutionComponents: FirstReplyMetricComponentsDetail | null;
}

// Debug logger
const debug = (message: string, data?: any) => {
  const nodeEnv =
    typeof globalThis !== 'undefined'
      ? (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV
      : undefined;

  if (nodeEnv === 'development') {
    console.debug(`[KPI Debug] ${message}`, data || '');
  }
};

export interface ZendeskTicketMetrics {
  first_reply_time_in_minutes?: number | null;
  reply_time_in_minutes?: number | null;
  requester_wait_time_in_minutes?: number | null;
}

export interface FRTDistribution {
  '0-1h': number;
  '1-8h': number;
  '8-24h': number;
  '>24h': number;
  'No Reply': number;
}

export interface FCRBreakdown {
  oneTouch: number;
  twoTouch: number;
  reopened: number;
}

export interface KPIData {
  ticketsIn: number;
  ticketsResolved: number;
  frtMedian: number;
  aht: number;
  fcrPercent: number;
  frtDistribution: FRTDistribution;
  fcrBreakdown: FCRBreakdown;
}

const EMPTY_DISTRIBUTION: FRTDistribution = {
  '0-1h': 0,
  '1-8h': 0,
  '8-24h': 0,
  '>24h': 0,
  'No Reply': 0,
};

const EMPTY_FCR_BREAKDOWN: FCRBreakdown = {
  oneTouch: 0,
  twoTouch: 0,
  reopened: 0,
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function cloneDistribution(): FRTDistribution {
  return { ...EMPTY_DISTRIBUTION };
}

function collectFirstReplyMetric(ticket: ZendeskTicket): FirstReplyMetricInfo {
  const directMinutes = typeof ticket.first_reply_time_minutes === 'number' ? ticket.first_reply_time_minutes : null;
  const directSeconds = typeof ticket.first_reply_time_seconds === 'number' ? ticket.first_reply_time_seconds : null;
  let resolutionSource = ticket.first_reply_metric_source ?? (directMinutes !== null ? 'ticket' : 'none');
  let resolutionComponents: FirstReplyMetricComponentsDetail | null = ticket.first_reply_metric_components ?? null;

  if (!resolutionComponents && ticket.metric_set) {
    const resolution = resolveFirstReplyMetrics(ticket.metric_set);
    resolutionSource = resolution.source;
    resolutionComponents = resolution.components;
  }

  const replyMinutes = ticket.metric_set?.reply_time_in_minutes ?? null;
  const replyMinutesBusiness = typeof replyMinutes?.business === 'number' ? replyMinutes.business : null;
  const replyMinutesCalendar = typeof replyMinutes?.calendar === 'number' ? replyMinutes.calendar : null;
  const replyMinutesFallback = resolutionComponents?.replyMinutes?.combined ?? null;

  const replySeconds = ticket.metric_set?.reply_time_in_seconds ?? null;
  const replySecondsBusiness = typeof replySeconds?.business === 'number' ? replySeconds.business : null;
  const replySecondsCalendar = typeof replySeconds?.calendar === 'number' ? replySeconds.calendar : null;
  const replySecondsFallback = resolutionComponents?.replySeconds?.combined ?? null;

  const firstReplyMinutesFallback = resolutionComponents?.firstReplyMinutes?.combined ?? null;
  const firstReplySecondsFallback = resolutionComponents?.firstReplySeconds?.combined ?? null;

  let rawMinutes: number | null = directMinutes !== null && directMinutes > 0 ? directMinutes : null;
  let source: FirstReplyMetricSource = rawMinutes !== null ? (resolutionSource || 'ticket') : 'none';

  if (rawMinutes === null || rawMinutes <= 0) {
    if (replyMinutesBusiness && replyMinutesBusiness > 0) {
      rawMinutes = replyMinutesBusiness;
      source = 'reply_minutes_business';
    } else if (replyMinutesCalendar && replyMinutesCalendar > 0) {
      rawMinutes = replyMinutesCalendar;
      source = 'reply_minutes_calendar';
    } else if (replyMinutesFallback && replyMinutesFallback > 0) {
      rawMinutes = replyMinutesFallback;
      source = 'reply_minutes_combined';
    } else if (firstReplyMinutesFallback && firstReplyMinutesFallback > 0) {
      rawMinutes = firstReplyMinutesFallback;
      source = 'first_reply_minutes_combined';
    }
  }

  let secondsValue: number | null = directSeconds !== null && directSeconds > 0 ? directSeconds : null;
  if (secondsValue === null || secondsValue <= 0) {
    if (replySecondsBusiness && replySecondsBusiness > 0) {
      secondsValue = replySecondsBusiness;
    } else if (replySecondsCalendar && replySecondsCalendar > 0) {
      secondsValue = replySecondsCalendar;
    } else if (replySecondsFallback && replySecondsFallback > 0) {
      secondsValue = replySecondsFallback;
    } else if (firstReplySecondsFallback && firstReplySecondsFallback > 0) {
      secondsValue = firstReplySecondsFallback;
    }
  }

  if ((rawMinutes === null || rawMinutes <= 0) && secondsValue && secondsValue > 0) {
    rawMinutes = secondsValue / 60;
    if (source === 'none') {
      source = 'reply_seconds_fallback';
    }
  }

  const minutes = rawMinutes !== null && rawMinutes > 0 ? rawMinutes : null;

  if ((!resolutionSource || resolutionSource === 'none') && source !== 'none') {
    resolutionSource = source;
  }

  return {
    minutes,
    rawMinutes: minutes,
    source,
    calendarMinutes: replyMinutesCalendar,
    businessMinutes: replyMinutesBusiness,
    secondsValue,
    resolutionSource,
    resolutionComponents,
  };
}

function getFirstReplyMinutes(ticket: ZendeskTicket): number | null {
  return collectFirstReplyMetric(ticket).minutes;
}

function getResolutionMinutes(ticket: ZendeskTicket): number | null {
  if (typeof ticket.full_resolution_time_minutes === 'number') {
    return ticket.full_resolution_time_minutes;
  }

  const metricValue = ticket.metric_set?.full_resolution_time_in_minutes?.calendar ?? null;
  if (typeof metricValue === 'number') {
    return metricValue;
  }

  return getMinutesBetween(ticket.created_at, ticket.metric_set?.solved_at ?? ticket.solved_at ?? ticket.updated_at);
}

function getSolvedDate(ticket: ZendeskTicket): Date | null {
  const solvedAt = ticket.metric_set?.solved_at || ticket.solved_at || null;
  if (!solvedAt) {
    return null;
  }

  const solvedDate = new Date(solvedAt);
  if (isNaN(solvedDate.getTime())) {
    return null;
  }

  return solvedDate;
}

export function calculateKPIsForWeek(
  tickets: ZendeskTicket[],
  weekStart: Date,
  weekEnd: Date,
): KPIData {
  const weekStartUTC = weekStart.toISOString();
  const weekEndUTC = weekEnd.toISOString();
  const weekStartZendesk = toZendeskTimezone(weekStart);
  const weekEndZendesk = toZendeskTimezone(weekEnd);
  const weekStartKst = new Date(weekStart.getTime() + 9 * 60 * 60 * 1000);
  const weekEndKst = new Date(weekEnd.getTime() + 9 * 60 * 60 * 1000);

  debug('KPI Week Range', {
    weekStartUTC,
    weekEndUTC,
    weekStartZendesk: weekStartZendesk.toISOString(),
    weekEndZendesk: weekEndZendesk.toISOString(),
    weekStartKst: weekStartKst.toISOString(),
    weekEndKst: weekEndKst.toISOString(),
  });
  
  // Tickets created in the target week
  const weekTickets = filterTicketsByCreatedAt(tickets, weekStart, weekEnd);
  
  // Tickets resolved in the target week
  const resolvedTickets = filterTicketsBySolvedAt(tickets, weekStart, weekEnd);
  debug(`Found ${resolvedTickets.length} tickets resolved in target week`);

  // FRT Calculation (using Zendesk metrics with relaxed filters)
  const frtRangeStart = new Date(weekEnd.getTime() - FRT_WINDOW_DAYS * DAY_IN_MS);
  const frtWindowTickets = filterTicketsByCreatedAt(tickets, frtRangeStart, weekEnd);
  const frtWindowMeasurements = frtWindowTickets.map(ticket => {
    const metricInfo = collectFirstReplyMetric(ticket);
    return {
      ticket,
      minutes: metricInfo.minutes,
      rawMinutes: metricInfo.rawMinutes,
      source: metricInfo.source,
      calendarMinutes: metricInfo.calendarMinutes,
      businessMinutes: metricInfo.businessMinutes,
      secondsValue: metricInfo.secondsValue,
      resolutionSource: metricInfo.resolutionSource,
      resolutionComponents: metricInfo.resolutionComponents,
    };
  });

  const frtMetricStats = frtWindowMeasurements.reduce(
    (stats, measurement) => {
      stats.total += 1;
      stats.sourceCounts[measurement.source] = (stats.sourceCounts[measurement.source] ?? 0) + 1;
      const resolutionKey = measurement.resolutionSource || 'none';
      stats.resolutionSourceCounts[resolutionKey] = (stats.resolutionSourceCounts[resolutionKey] ?? 0) + 1;
      if (typeof measurement.secondsValue === 'number') {
        stats.secondsCount += 1;
      }

      if (measurement.rawMinutes === null) {
        stats.nullCount += 1;
        if (stats.nullSamples.length < 5) {
          stats.nullSamples.push(measurement.ticket.id);
        }
      } else if (measurement.rawMinutes <= 0) {
        stats.zeroCount += 1;
        if (stats.zeroSamples.length < 5) {
          stats.zeroSamples.push({ id: measurement.ticket.id, rawMinutes: measurement.rawMinutes });
        }
      } else {
        stats.validCount += 1;
      }

      if (stats.metricSamples.length < 5) {
        stats.metricSamples.push({
          id: measurement.ticket.id,
          source: measurement.source,
          rawMinutes: measurement.rawMinutes,
          calendar: measurement.calendarMinutes,
          business: measurement.businessMinutes,
          seconds: measurement.secondsValue,
          resolutionSource: measurement.resolutionSource,
        });
      }

      return stats;
    },
    {
      total: 0,
      nullCount: 0,
      zeroCount: 0,
      validCount: 0,
      sourceCounts: {} as Record<string, number>,
      secondsCount: 0,
      resolutionSourceCounts: {} as Record<string, number>,
      nullSamples: [] as number[],
      zeroSamples: [] as { id: number; rawMinutes: number | null }[],
      metricSamples: [] as Array<{
        id: number;
        source: FirstReplyMetricSource;
        rawMinutes: number | null;
        calendar: number | null;
        business: number | null;
        seconds: number | null;
        resolutionSource: string;
      }>,
    },
  );

  debug('FRT metric distribution', {
    total: frtMetricStats.total,
    nullCount: frtMetricStats.nullCount,
    zeroOrNegativeCount: frtMetricStats.zeroCount,
    validCount: frtMetricStats.validCount,
    sourceCounts: frtMetricStats.sourceCounts,
    resolutionSourceCounts: frtMetricStats.resolutionSourceCounts,
    nullSamples: frtMetricStats.nullSamples,
    zeroSamples: frtMetricStats.zeroSamples,
    metricSamples: frtMetricStats.metricSamples,
    secondsCount: frtMetricStats.secondsCount,
  });

  if (frtMetricStats.total > 0) {
    const invalidRatio = (frtMetricStats.nullCount + frtMetricStats.zeroCount) / frtMetricStats.total;
    if (invalidRatio >= 0.5) {
      console.warn(
        `[KPI Warning] first_reply_time_in_minutes 값이 ${Math.round(invalidRatio * 1000) / 10}% 티켓에서 null/0 입니다. Zendesk API 응답 또는 티켓 유형을 확인하세요.`,
        {
          nullCount: frtMetricStats.nullCount,
          zeroCount: frtMetricStats.zeroCount,
          total: frtMetricStats.total,
        },
      );
    }
  }

  const frtValuesMinutes = frtWindowMeasurements
    .map(measurement => measurement.minutes)
    .filter((value): value is number => value !== null && value > 0);

  const frtValidTickets = frtWindowMeasurements.filter(m => typeof m.minutes === 'number' && m.minutes > 0);
  debug('FRT window stats', {
    frtWindowTicketCount: frtWindowTickets.length,
    frtValidCount: frtValidTickets.length,
    frtValidSample: frtValidTickets.slice(0, 10).map(m => ({
      id: m.ticket.id,
      minutes: m.minutes,
      resolutionSource: m.resolutionSource,
    })),
    nullCount: frtMetricStats.nullCount,
    zeroOrNegativeCount: frtMetricStats.zeroCount,
    nullSamples: frtMetricStats.nullSamples,
    zeroSamples: frtMetricStats.zeroSamples,
    secondsCount: frtMetricStats.secondsCount,
    resolutionSourceCounts: frtMetricStats.resolutionSourceCounts,
  });

  if (frtMetricStats.nullSamples.length > 0) {
    const nullSampleTickets = frtMetricStats.nullSamples.slice(0, 10).map(id => frtWindowMeasurements.find(m => m.ticket.id === id));
    console.debug('[KPI Debug] first_reply_time null sample metric_sets', nullSampleTickets
      ?.filter(sample => sample && sample.ticket.metric_set)
      .map(sample => ({
        id: sample!.ticket.id,
        metric_set: sample!.ticket.metric_set,
        resolutionSource: sample!.resolutionSource,
        first_reply_metric_components: sample!.ticket.first_reply_metric_components ?? sample!.resolutionComponents,
      })));
  }

  const frtDistribution = buildFRTDistribution(
    weekTickets,
    weekTickets.map(ticket => {
      const metricInfo = collectFirstReplyMetric(ticket);
      return {
        ticket,
        minutes: metricInfo.minutes,
        rawMinutes: metricInfo.rawMinutes,
        source: metricInfo.source,
        calendarMinutes: metricInfo.calendarMinutes,
        businessMinutes: metricInfo.businessMinutes,
        secondsValue: metricInfo.secondsValue,
        resolutionSource: metricInfo.resolutionSource,
        resolutionComponents: metricInfo.resolutionComponents,
      };
    })
  );

  const frtMedian = frtValuesMinutes.length > 0
    ? roundTo(calculateMedian(frtValuesMinutes) / 60, 1)
    : 0;

  debug(`FRT (single week): ${frtValuesMinutes.length} measurements (window), median: ${frtMedian}h`);

  // AHT Calculation (45-day window, leveraging metric sets)
  const ahtRangeStart = new Date(weekEnd.getTime() - AHT_WINDOW_DAYS * DAY_IN_MS);
  const ahtTickets = filterTicketsBySolvedAt(tickets, ahtRangeStart, weekEnd);

  debug(`AHT: ${ahtTickets.length} valid tickets (window)`);
  const ahtValues = ahtTickets
    .map(ticket => {
      const minutes = getResolutionMinutes(ticket);
      if (minutes === null) {
        debug('AHT exclusion: missing resolution minutes', { id: ticket.id });
        return null;
      }
      const hours = minutes / 60;
      if (hours <= 0) {
        debug('AHT exclusion: non-positive duration', { id: ticket.id, hours });
        return null;
      }
      if (hours > MAX_AHT_HOURS) {
        debug('AHT exclusion: exceeds MAX_AHT_HOURS', { id: ticket.id, hours, maxHours: MAX_AHT_HOURS });
        return null;
      }
      return hours;
    })
    .filter((value): value is number => value !== null);

  const aht = ahtValues.length > 0
    ? roundTo(ahtValues.reduce((sum, value) => sum + value, 0) / ahtValues.length, 2)
    : 0;

  debug(`AHT: ${ahtValues.length} valid tickets, average: ${aht}h`);

  // FCR Calculation (using same ticket set as AHT for consistency)
  const { fcrPercent, fcrBreakdown } = buildFCRMetrics(ahtTickets);
  debug('FCR breakdown details', {
    oneTouchCount: fcrBreakdown.oneTouch,
    twoTouchCount: fcrBreakdown.twoTouch,
    reopenedCount: fcrBreakdown.reopened,
  });
  return {
    ticketsIn: weekTickets.length,
    ticketsResolved: resolvedTickets.length,
    frtMedian: roundTo(frtMedian, 1),
    aht,
    fcrPercent: roundTo(fcrPercent, 1),
    frtDistribution,
    fcrBreakdown,
  };
}

export function calculateKPIs(tickets: ZendeskTicket[], referenceDate: Date = new Date()): KPIData {
  const { start: startDate, end: endDate } = getDateRange(referenceDate, 'week');
  return calculateKPIsForWeek(tickets, startDate, endDate);
}

type FRTMeasurement = {
  ticket: ZendeskTicket;
  minutes: number | null;
  rawMinutes: number | null;
  source: FirstReplyMetricSource;
  calendarMinutes: number | null;
  businessMinutes: number | null;
  secondsValue: number | null;
  resolutionSource: string;
  resolutionComponents: FirstReplyMetricComponentsDetail | null;
};

function buildFRTDistribution(weekTickets: ZendeskTicket[], measurements: FRTMeasurement[]): FRTDistribution {
  const distribution = cloneDistribution();
  const repliedIds = new Set<number>();

  measurements.forEach(({ ticket, minutes }) => {
    if (minutes === null || minutes < 0) {
      debug('FRT exclusion: invalid minutes', { id: ticket.id, minutes });
      return;
    }

    repliedIds.add(ticket.id);

    const hours = minutes / 60;
    if (hours <= 1) {
      distribution['0-1h']++;
    } else if (hours <= 8) {
      distribution['1-8h']++;
    } else if (hours <= 24) {
      distribution['8-24h']++;
    } else {
      distribution['>24h']++;
    }
  });

  const noReplyCount = weekTickets.filter(ticket => !repliedIds.has(ticket.id)).length;
  distribution['No Reply'] = noReplyCount;

  debug('FRT Distribution', {
    totalTickets: weekTickets.length,
    withReplies: repliedIds.size,
    noReply: noReplyCount,
    distribution: { ...distribution }
  });

  return distribution;
}

function buildFCRMetrics(tickets: ZendeskTicket[]): { fcrPercent: number; fcrBreakdown: FCRBreakdown } {
  const breakdown: FCRBreakdown = { oneTouch: 0, twoTouch: 0, reopened: 0 };
  const oneTouchIds: number[] = [];
  const twoTouchIds: number[] = [];
  const reopenedIds: number[] = [];

  for (const ticket of tickets) {
    const solvedAt = ticket.metric_set?.solved_at ?? ticket.solved_at ?? null;
    if (!solvedAt) {
      debug('FCR exclusion: missing solvedAt', { id: ticket.id, status: ticket.status });
      continue;
    }

    const reopens = ticket.metric_set?.reopens ?? ticket.reopens ?? 0;
    if (reopens > 0) {
      breakdown.reopened++;
      reopenedIds.push(ticket.id);
      continue;
    }

    const replies = ticket.metric_set?.replies ?? ticket.replies ?? null;
    if (typeof replies === 'number') {
      if (replies < 2) {
        breakdown.oneTouch++;
        oneTouchIds.push(ticket.id);
      } else {
        breakdown.twoTouch++;
        twoTouchIds.push(ticket.id);
      }
      continue;
    }

    const touches = ticket.metric_set?.touches ?? null;
    if (typeof touches === 'number') {
      if (touches < 2) {
        breakdown.oneTouch++;
        oneTouchIds.push(ticket.id);
      } else {
        breakdown.twoTouch++;
        twoTouchIds.push(ticket.id);
      }
      continue;
    }

    // Replies/touches unavailable: treat as multi-touch for conservative reporting
    breakdown.twoTouch++;
    twoTouchIds.push(ticket.id);
  }

  const totalFCR = breakdown.oneTouch + breakdown.twoTouch;
  const totalTickets = totalFCR + breakdown.reopened;
  const fcrPercent = totalTickets > 0 ? (breakdown.oneTouch / totalTickets) * 100 : 0;

  debug('FCR 계산 결과', {
    totalTickets,
    oneTouch: breakdown.oneTouch,
    twoTouch: breakdown.twoTouch,
    reopened: breakdown.reopened,
    fcrPercent: roundTo(fcrPercent, 1) + '%'
  });
  debug('FCR ticket categorization', {
    oneTouchIds: oneTouchIds.slice(0, 50),
    twoTouchIds: twoTouchIds.slice(0, 50),
    reopenedIds: reopenedIds.slice(0, 50),
  });

  return {
    fcrPercent,
    fcrBreakdown: {
      oneTouch: breakdown.oneTouch,
      twoTouch: breakdown.twoTouch,
      reopened: breakdown.reopened,
    },
  };
}

function filterTicketsByCreatedAt(tickets: ZendeskTicket[], start: Date, end: Date): ZendeskTicket[] {
  const startUTC = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
    start.getUTCHours(),
    start.getUTCMinutes(),
    start.getUTCSeconds()
  );
  
  const endUTC = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
    end.getUTCHours(),
    end.getUTCMinutes(),
    end.getUTCSeconds()
  );

  return tickets.filter(ticket => {
    const ticketDate = new Date(ticket.created_at);
    const ticketUTC = Date.UTC(
      ticketDate.getUTCFullYear(),
      ticketDate.getUTCMonth(),
      ticketDate.getUTCDate(),
      ticketDate.getUTCHours(),
      ticketDate.getUTCMinutes(),
      ticketDate.getUTCSeconds()
    );
    
    return ticketUTC >= startUTC && ticketUTC <= endUTC;
  });
}

function filterTicketsBySolvedAt(tickets: ZendeskTicket[], start: Date, end: Date): ZendeskTicket[] {
  const startUTC = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
    start.getUTCHours(),
    start.getUTCMinutes(),
    start.getUTCSeconds()
  );
  
  const endUTC = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
    end.getUTCHours(),
    end.getUTCMinutes(),
    end.getUTCSeconds()
  );

  return tickets.filter(ticket => {
    const solvedAt = ticket.metric_set?.solved_at;
    if (!solvedAt) return false;
    
    const solvedDate = new Date(solvedAt);
    const solvedUTC = Date.UTC(
      solvedDate.getUTCFullYear(),
      solvedDate.getUTCMonth(),
      solvedDate.getUTCDate(),
      solvedDate.getUTCHours(),
      solvedDate.getUTCMinutes(),
      solvedDate.getUTCSeconds()
    );
    
    const isInRange = solvedUTC >= startUTC && solvedUTC <= endUTC;

    if (!isInRange) {
      debug(`Ticket ${ticket.id} solved outside date range`, {
        solved: solvedAt,
        range: { start: start.toISOString(), end: end.toISOString() },
        status: ticket.status
      });
    }

    return isInRange;
  });
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function getMinutesBetween(start: string, end: string | null): number | null {
  if (!start || !end) {
    return null;
  }

  try {
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    // Validate dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      debug('Invalid date in getMinutesBetween', { start, end });
      return null;
    }
    
    const diff = endDate.getTime() - startDate.getTime();
    
    if (diff <= 0) {
      debug('Negative or zero time difference', { start, end, diff });
      return null;
    }
    
    const minutes = diff / (1000 * 60);
    
    if (minutes > MAX_AHT_MINUTES * 2) {
      debug('Extremely long duration detected, likely invalid', { 
        start, 
        end, 
        minutes,
        maxAllowed: MAX_AHT_MINUTES * 2
      });
    }
    
    return minutes;
  } catch (error) {
    console.error('Error in getMinutesBetween:', error, { start, end });
    return null;
  }
}

function getHoursBetween(start: string, end: string | null): number | null {
  const minutes = getMinutesBetween(start, end);
  return minutes !== null ? minutes / 60 : null;
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
