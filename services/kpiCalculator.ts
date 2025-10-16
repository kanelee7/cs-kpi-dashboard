import type { ZendeskTicket } from './zendeskClient';
import { getDateRange } from '../utils/dateUtils';

// Constants (Zendesk Analytics와 동일한 값 사용)
const MAX_AHT_HOURS = 168; // 7 days (Zendesk 표준)
const MAX_AHT_MINUTES = MAX_AHT_HOURS * 60;
const FCR_ONE_TOUCH_HOURS = 24; // 24시간 내 1차 해결
const FCR_TWO_TOUCH_HOURS = 72; // 72시간 내 2차 해결
const FRT_WINDOW_DAYS = 45; // FRT 계산 기간 확장
const AHT_WINDOW_DAYS = 45; // AHT 계산 기간 확장

// Zendesk와 동일한 버킷 기준 (분 단위)
const FRT_BUCKETS = {
  UNDER_1H: 60,         // 0-1시간
  UNDER_8H: 8 * 60,     // 1-8시간
  UNDER_24H: 24 * 60,   // 8-24시간
  OVER_24H: Infinity    // 24시간 초과
};

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

function getFirstReplyMinutes(ticket: ZendeskTicket): number | null {
  if (typeof ticket.first_reply_time_minutes === 'number') {
    return ticket.first_reply_time_minutes;
  }

  const metricValue = ticket.metric_set?.first_reply_time_in_minutes?.calendar ?? null;
  if (typeof metricValue === 'number') {
    return metricValue;
  }

  return null;
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
  debug(`Calculating KPIs for week ${weekStart.toISOString()} to ${weekEnd.toISOString()}`);
  
  // Tickets created in the target week
  const weekTickets = filterTicketsByCreatedAt(tickets, weekStart, weekEnd);
  
  // Tickets resolved in the target week
  const resolvedTickets = filterTicketsBySolvedAt(tickets, weekStart, weekEnd);
  debug(`Found ${resolvedTickets.length} tickets resolved in target week`);

  // FRT Calculation (using Zendesk metrics with relaxed filters)
  const frtRangeStart = new Date(weekEnd.getTime() - FRT_WINDOW_DAYS * DAY_IN_MS);
  const frtWindowTickets = filterTicketsByCreatedAt(tickets, frtRangeStart, weekEnd);
  const frtWindowMeasurements = frtWindowTickets.map(ticket => ({
    ticket,
    minutes: getFirstReplyMinutes(ticket)
  }));

  const frtValuesMinutes = frtWindowMeasurements
    .map(measurement => measurement.minutes)
    .filter((value): value is number => value !== null && value > 0 && value <= 72 * 60);

  const frtDistribution = buildFRTDistribution(
    weekTickets,
    weekTickets.map(ticket => ({ ticket, minutes: getFirstReplyMinutes(ticket) }))
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
        return null;
      }
      const hours = minutes / 60;
      return hours > 0 && hours <= MAX_AHT_HOURS ? hours : null;
    })
    .filter((value): value is number => value !== null);

  const aht = ahtValues.length > 0
    ? roundTo(ahtValues.reduce((sum, value) => sum + value, 0) / ahtValues.length, 2)
    : 0;

  debug(`AHT: ${ahtValues.length} valid tickets, average: ${aht}h`);

  // FCR Calculation (using same ticket set as AHT for consistency)
  const { fcrPercent, fcrBreakdown } = buildFCRMetrics(ahtTickets);
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
};

function buildFRTDistribution(weekTickets: ZendeskTicket[], measurements: FRTMeasurement[]): FRTDistribution {
  const distribution = cloneDistribution();
  const repliedIds = new Set<number>();

  measurements.forEach(({ ticket, minutes }) => {
    if (minutes === null || minutes < 0) {
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
  
  for (const ticket of tickets) {
    const solvedAt = ticket.metric_set?.solved_at ?? ticket.solved_at ?? null;
    if (!solvedAt) {
      continue;
    }

    const reopens = ticket.metric_set?.reopens ?? ticket.reopens ?? 0;

    if (reopens > 0) {
      breakdown.reopened++;
      continue;
    }

    const replies = ticket.metric_set?.replies ?? ticket.replies;
    if (typeof replies === 'number') {
      if (replies <= 1) {
        breakdown.oneTouch++;
      } else {
        breakdown.twoTouch++;
      }
      continue;
    }

    const touches = ticket.metric_set?.touches;
    if (typeof touches === 'number') {
      if (touches <= 1) {
        breakdown.oneTouch++;
      } else {
        breakdown.twoTouch++;
      }
      continue;
    }

    const resolutionTime = getHoursBetween(ticket.created_at, solvedAt);
    if (resolutionTime === null) {
      continue;
    }

    if (resolutionTime <= FCR_ONE_TOUCH_HOURS) {
      breakdown.oneTouch++;
    } else {
      breakdown.twoTouch++;
    }
  }

  const totalFCR = breakdown.oneTouch + breakdown.twoTouch;
  const totalTickets = totalFCR + breakdown.reopened;
  
  const fcrPercent = totalTickets > 0 
    ? (totalFCR / totalTickets) * 100 
    : 0;

  debug('FCR 계산 결과', {
    totalTickets,
    oneTouch: breakdown.oneTouch,
    twoTouch: breakdown.twoTouch,
    reopened: breakdown.reopened,
    fcrPercent: roundTo(fcrPercent, 1) + '%'
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
