import type { ZendeskTicket } from './zendeskClient';
import { getDateRange } from '../utils/dateUtils';

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
  const weekTickets = filterTicketsByCreatedAt(tickets, weekStart, weekEnd);
  const resolvedTickets = filterTicketsBySolvedAt(tickets, weekStart, weekEnd);

  const frtRangeStart = new Date(weekEnd.getTime() - 30 * DAY_IN_MS);
  const frtTickets = filterTicketsByCreatedAt(tickets, frtRangeStart, weekEnd);

  const frtValuesMinutes = frtTickets
    .filter((ticket) => ticket.status === 'solved' || ticket.status === 'closed')
    .map((ticket) => getMinutesBetween(ticket.created_at, ticket.updated_at))
    .filter((value): value is number => value !== null && value > 0)
    .map((value) => Math.min(value, 1440));

  const frtDistribution = buildFRTDistribution(frtValuesMinutes, weekTickets);
  const frtMedian = frtValuesMinutes.length > 0 ? calculateMedian(frtValuesMinutes) / 60 : 0;

  const ahtRangeStart = new Date(weekEnd.getTime() - 90 * DAY_IN_MS);
  const ahtTickets = filterTicketsBySolvedAt(tickets, ahtRangeStart, weekEnd);
  const ahtValues = ahtTickets
    .map((ticket) => getHoursBetween(ticket.created_at, ticket.solved_at ?? ticket.updated_at))
    .filter((value): value is number => value !== null && value > 0);

  const aht = ahtValues.length > 0 ? roundTo(ahtValues.reduce((sum, value) => sum + value, 0) / ahtValues.length, 2) : 0;

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
    return { fcrPercent: 0, fcrBreakdown: { ...EMPTY_FCR_BREAKDOWN } };
  }

  let oneTouch = 0;
  let twoTouch = 0;
  let reopened = 0;

  tickets.forEach((ticket) => {
    const hoursToSolve = getHoursBetween(ticket.created_at, ticket.solved_at ?? ticket.updated_at);

    if (hoursToSolve === null) {
      return;
    }

    if (hoursToSolve <= 24) {
      oneTouch += 1;
    } else if (hoursToSolve <= 72) {
      twoTouch += 1;
    } else {
      reopened += 1;
    }
  });

  const fcrPercent = (oneTouch / tickets.length) * 100;

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
    const solvedDate = ticket.solved_at ?? (ticket.status === 'solved' || ticket.status === 'closed' ? ticket.updated_at : null);

    if (!solvedDate) {
      return false;
    }

    const solved = new Date(solvedDate);
    return solved >= start && solved <= end;
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
  if (!end) {
    return null;
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  const diff = endDate.getTime() - startDate.getTime();

  return diff > 0 ? diff / (1000 * 60) : null;
}

function getHoursBetween(start: string, end: string | null): number | null {
  const minutes = getMinutesBetween(start, end);
  return minutes !== null ? minutes / 60 : null;
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}
