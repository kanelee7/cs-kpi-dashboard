import type { ZendeskTicket } from './zendeskClient';
import { getDateRange } from '../utils/dateUtils';

// Constants (Zendesk Analytics와 동일한 값 사용)
const MAX_AHT_HOURS = 168; // 7 days (Zendesk 표준)
const MAX_AHT_MINUTES = MAX_AHT_HOURS * 60;
const FCR_ONE_TOUCH_HOURS = 24; // 24시간 내 1차 해결
const FCR_TWO_TOUCH_HOURS = 72; // 72시간 내 2차 해결
const FRT_WINDOW_DAYS = 30; // FRT 계산 기간
const AHT_WINDOW_DAYS = 30; // AHT 계산 기간

// Zendesk와 동일한 버킷 기준 (분 단위)
const FRT_BUCKETS = {
  UNDER_1H: 60,         // 0-1시간
  UNDER_8H: 8 * 60,     // 1-8시간
  UNDER_24H: 24 * 60,   // 8-24시간
  OVER_24H: Infinity    // 24시간 초과
};

// Debug logger
const debug = (message: string, data?: any) => {
  if (process.env.NODE_ENV === 'development') {
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

export function calculateKPIsForWeek(
  tickets: ZendeskTicket[],
  weekStart: Date,
  weekEnd: Date,
): KPIData {
  debug(`Calculating KPIs for week ${weekStart.toISOString()} to ${weekEnd.toISOString()}`);
  
  // Tickets created in the target week
  const weekTickets = filterTicketsByCreatedAt(tickets, weekStart, weekEnd);
  debug(`Found ${weekTickets.length} tickets created in target week`);
  
  // Tickets resolved in the target week
  const resolvedTickets = filterTicketsBySolvedAt(tickets, weekStart, weekEnd);
  debug(`Found ${resolvedTickets.length} tickets resolved in target week`);

  // FRT Calculation (30-day window)
  const frtRangeStart = new Date(weekEnd.getTime() - FRT_WINDOW_DAYS * DAY_IN_MS);
  const frtTickets = filterTicketsByCreatedAt(tickets, frtRangeStart, weekEnd)
    .filter(ticket => ticket.status === 'solved' || ticket.status === 'closed');
  
  const frtValuesMinutes = frtTickets
    .map(ticket => getMinutesBetween(ticket.created_at, ticket.updated_at))
    .filter((value): value is number => value !== null && value > 0 && value <= 1440); // Cap at 24h for FRT
  
  const frtDistribution = buildFRTDistribution(frtValuesMinutes, weekTickets);
  const frtMedian = frtValuesMinutes.length > 0 
    ? roundTo(calculateMedian(frtValuesMinutes) / 60, 1) 
    : 0;
  
  debug(`FRT: ${frtValuesMinutes.length} valid tickets, median: ${frtMedian}h`);

  // AHT Calculation (30-day window, same as FRT for consistency)
  const ahtRangeStart = new Date(weekEnd.getTime() - AHT_WINDOW_DAYS * DAY_IN_MS);
  const ahtTickets = filterTicketsBySolvedAt(tickets, ahtRangeStart, weekEnd)
    .filter(ticket => ticket.status === 'solved' || ticket.status === 'closed');
  
  const ahtValues = ahtTickets
    .map(ticket => {
      // Only use solved_at for AHT calculation, no fallback to updated_at
      if (!ticket.solved_at) return null;
      return getHoursBetween(ticket.created_at, ticket.solved_at);
    })
    .filter((value): value is number => 
      value !== null && 
      value > 0 && 
      value <= MAX_AHT_HOURS // Cap at 7 days
    );
  
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

function buildFRTDistribution(frtValuesMinutes: number[], weekTickets: ZendeskTicket[]): FRTDistribution {
  const distribution: FRTDistribution = { ...EMPTY_DISTRIBUTION };
  const repliedTicketIds = new Set<number>();

  // Process tickets with replies
  frtValuesMinutes.forEach((minutes, index) => {
    const ticket = weekTickets[index];
    if (!ticket) return;
    
    repliedTicketIds.add(ticket.id);
    
    // Skip invalid or negative values
    if (minutes <= 0) {
      debug('Skipping invalid FRT value', { ticketId: ticket.id, minutes });
      return;
    }

    // Convert to hours for bucketing
    const hours = minutes / 60;
    
    // Categorize into time buckets (matching Zendesk Analytics)
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

  // Calculate "No Reply" tickets (tickets without a first reply)
  const noReplyTickets = weekTickets.filter(ticket => 
    !repliedTicketIds.has(ticket.id) && 
    (ticket.status === 'open' || ticket.status === 'pending')
  );
  
  distribution['No Reply'] = noReplyTickets.length;
  
  debug('FRT Distribution', {
    totalTickets: weekTickets.length,
    withReplies: frtValuesMinutes.length,
    noReply: noReplyTickets.length,
    distribution: { ...distribution }
  });

  return distribution;
}

function buildFCRMetrics(tickets: ZendeskTicket[]): { fcrPercent: number; fcrBreakdown: FCRBreakdown } {
  if (tickets.length === 0) {
    debug('No tickets provided for FCR calculation');
    return { fcrPercent: 0, fcrBreakdown: { oneTouch: 0, twoTouch: 0, reopened: 0 } };
  }

  let oneTouch = 0;
  let twoTouch = 0;
  let reopened = 0;
  let invalidTickets = 0;
  const validTickets: ZendeskTicket[] = [];

  // First pass: Filter valid tickets
  tickets.forEach(ticket => {
    // Only include solved/closed tickets
    if (ticket.status !== 'solved' && ticket.status !== 'closed') {
      debug('Skipping non-resolved ticket', { 
        ticketId: ticket.id, 
        status: ticket.status 
      });
      invalidTickets++;
      return;
    }

    // Must have both created_at and solved_at
    if (!ticket.created_at || !ticket.solved_at) {
      debug('Missing timestamps', { 
        ticketId: ticket.id, 
        hasCreated: !!ticket.created_at,
        hasSolved: !!ticket.solved_at
      });
      invalidTickets++;
      return;
    }

    // Calculate solve time in hours
    const solveTimeHours = getHoursBetween(ticket.created_at, ticket.solved_at);
    if (solveTimeHours === null || solveTimeHours <= 0) {
      debug('Invalid solve time', { 
        ticketId: ticket.id, 
        solveTimeHours,
        created: ticket.created_at,
        solved: ticket.solved_at
      });
      invalidTickets++;
      return;
    }

    validTickets.push(ticket);
  });

  debug('FCR - Valid tickets for calculation', { 
    total: tickets.length,
    valid: validTickets.length,
    invalid: invalidTickets
  });

  if (validTickets.length === 0) {
    return { 
      fcrPercent: 0, 
      fcrBreakdown: { oneTouch: 0, twoTouch: 0, reopened: 0 } 
    };
  }

  // Second pass: Calculate FCR metrics
  validTickets.forEach(ticket => {
    const solveTimeHours = getHoursBetween(ticket.created_at, ticket.solved_at!)!;
    
    // Check for reopened tickets (Zendesk considers these as not FCR)
    const isReopened = ticket.tags?.includes('reopened') || 
                      ticket.tags?.includes('follow_up') ||
                      (ticket.custom_fields?.some((f: any) => 
                        f.id === 'reopened' && f.value === true
                      ));

    if (isReopened) {
      reopened++;
      debug('FCR - Reopened ticket', { 
        ticketId: ticket.id, 
        solveTimeHours,
        tags: ticket.tags,
        customFields: ticket.custom_fields
      });
    } else if (solveTimeHours <= FCR_ONE_TOUCH_HOURS) {
      oneTouch++;
      debug('FCR - One touch resolution', { 
        ticketId: ticket.id, 
        solveTimeHours,
        maxAllowed: FCR_ONE_TOUCH_HOURS
      });
    } else if (solveTimeHours <= FCR_TWO_TOUCH_HOURS) {
      twoTouch++;
      debug('FCR - Two touch resolution', { 
        ticketId: ticket.id, 
        solveTimeHours,
        maxAllowed: FCR_TWO_TOUCH_HOURS
      });
    } else {
      reopened++;
      debug('FCR - Long resolution time', { 
        ticketId: ticket.id, 
        solveTimeHours,
        maxAllowed: FCR_TWO_TOUCH_HOURS
      });
    }
  });

  // Calculate FCR percentage (one-touch and two-touch resolutions as percentage of valid tickets)
  const fcrPercent = ((oneTouch + twoTouch) / validTickets.length) * 100;
  
  debug('FCR - Final calculation', {
    totalTickets: validTickets.length,
    oneTouch,
    twoTouch,
    reopened,
    fcrPercent: roundTo(fcrPercent, 1) + '%'
  });
  
  return {
    fcrPercent: roundTo(fcrPercent, 1),
    fcrBreakdown: {
      oneTouch,
      twoTouch,
      reopened,
    },
  };
}

function filterTicketsByCreatedAt(tickets: ZendeskTicket[], start: Date, end: Date): ZendeskTicket[] {
  return tickets.filter((ticket) => {
    const created = new Date(ticket.created_at);
    return created >= start && created <= end;
  });
}

function filterTicketsBySolvedAt(tickets: ZendeskTicket[], start: Date, end: Date): ZendeskTicket[] {
  return tickets.filter((ticket) => {
    // Only consider tickets that are actually solved/closed
    if (!ticket.solved_at && !(ticket.status === 'solved' || ticket.status === 'closed')) {
      return false;
    }
    
    // Prefer solved_at, fall back to updated_at only if the ticket is actually solved/closed
    const solvedDate = ticket.solved_at || 
                      ((ticket.status === 'solved' || ticket.status === 'closed') ? ticket.updated_at : null);

    if (!solvedDate) {
      return false;
    }

    const solved = new Date(solvedDate);
    const isInRange = solved >= start && solved <= end;
    
    if (!isInRange) {
      debug(`Ticket ${ticket.id} solved outside date range`, { 
        solved: solvedDate, 
        range: { start, end },
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
