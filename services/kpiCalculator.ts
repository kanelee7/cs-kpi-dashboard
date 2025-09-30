import type { ZendeskTicket } from './zendeskClient';
import { getDateRange } from '../utils/dateUtils';

// Constants
const MAX_AHT_HOURS = 168; // 7 days
const MAX_AHT_MINUTES = MAX_AHT_HOURS * 60; // For FRT which is in minutes
const FCR_ONE_TOUCH_HOURS = 24;
const FCR_TWO_TOUCH_HOURS = 72;
const FRT_WINDOW_DAYS = 30;
const AHT_WINDOW_DAYS = 30; // Changed from 90 to 30 for consistency with FRT

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
  const { start: startDate, end: endDate } = getDateRange(7, referenceDate);
  return calculateKPIsForWeek(tickets, startDate, endDate);
}

function buildFRTDistribution(frtValuesMinutes: number[], weekTickets: ZendeskTicket[]): FRTDistribution {
  const distribution: FRTDistribution = { ...EMPTY_DISTRIBUTION };

  frtValuesMinutes.forEach((minutes) => {
    const hours = minutes / 60;
    if (hours <= 1) {
      distribution['0-1h'] += 1;
    } else if (hours <= 8) {
      distribution['1-8h'] += 1;
    } else if (hours <= 24) {
      distribution['8-24h'] += 1;
    } else {
      distribution['>24h'] += 1;
    }
  });

  const noReply = weekTickets.filter((ticket) => ticket.status === 'open' || ticket.status === 'pending').length;
  distribution['No Reply'] = noReply;

  return distribution;
}

function buildFCRMetrics(tickets: ZendeskTicket[]): { fcrPercent: number; fcrBreakdown: FCRBreakdown } {
  if (tickets.length === 0) {
    debug('No tickets provided for FCR calculation');
    return { fcrPercent: 0, fcrBreakdown: { ...EMPTY_FCR_BREAKDOWN } };
  }

  let oneTouch = 0;
  let twoTouch = 0;
  let reopened = 0;
  let skipped = 0;

  tickets.forEach((ticket, index) => {
    // Only count tickets that are actually solved/closed
    if (!ticket.solved_at) {
      debug(`Skipping ticket ${ticket.id} - not solved/closed`, { status: ticket.status });
      skipped++;
      return;
    }

    const hoursToSolve = getHoursBetween(ticket.created_at, ticket.solved_at);
    
    if (hoursToSolve === null || hoursToSolve <= 0) {
      debug(`Skipping ticket ${ticket.id} - invalid solve time`, { 
        created: ticket.created_at, 
        solved: ticket.solved_at,
        hoursToSolve
      });
      skipped++;
      return;
    }

    // Check if ticket was reopened (has been through multiple solve cycles)
    const isReopened = ticket.status === 'solved' && 
                      ticket.updated_at !== ticket.solved_at &&
                      new Date(ticket.updated_at) > new Date(ticket.solved_at);

    if (isReopened) {
      debug(`Ticket ${ticket.id} marked as reopened`, { 
        created: ticket.created_at, 
        solved: ticket.solved_at,
        updated: ticket.updated_at
      });
      reopened++;
    } else if (hoursToSolve <= FCR_ONE_TOUCH_HOURS) {
      debug(`Ticket ${ticket.id} marked as one-touch FCR`, { hoursToSolve });
      oneTouch++;
    } else if (hoursToSolve <= FCR_TWO_TOUCH_HOURS) {
      debug(`Ticket ${ticket.id} marked as two-touch FCR`, { hoursToSolve });
      twoTouch++;
    } else {
      debug(`Ticket ${ticket.id} took too long to resolve`, { hoursToSolve });
      reopened++;
    }
  });

  const validTickets = tickets.length - skipped;
  const fcrPercent = validTickets > 0 ? roundTo((oneTouch / validTickets) * 100, 1) : 0;
  
  debug('FCR Calculation Results', {
    totalTickets: tickets.length,
    validTickets,
    oneTouch,
    twoTouch,
    reopened,
    skipped,
    fcrPercent
  });

  return {
    fcrPercent,
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
