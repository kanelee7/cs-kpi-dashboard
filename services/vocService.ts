import { getWeekRange, getZendeskWeekNumber } from '../utils/dateUtils';
import { ZendeskClient, type ZendeskTicket } from './zendeskClient';
import { getSupabaseClient } from './supabaseService';
import { analyzeVOCWeek, summarizeVOCTicketsBatch, type VOCTicketSummary } from './openaiService';
import { resolveTicketBrand } from './brandResolver';

const HISTORY_WEEKS = 5;
const MAX_TICKETS_PER_WEEK_FOR_WEEKLY_ANALYSIS = 50;
const ISSUE_TYPE_FIELD_IDS = [
  10384471774223, // Issue Type
  11776812779407, // [AZ] Issue Type
  11276257531023, // [LOKC] Issue Type
  12658411526415, // [LOKH] Issue Type
];

type CustomField = {
  id?: number | string;
  value?: unknown;
};

export interface VOCWeekInsight {
  brand: string;
  weekStartDate: string;
  weekEndDate: string;
  isoWeek: number;
  weekLabel: string;
  topIssues: string[];
  trendChanges: string;
  weeklySummary: string;
  ticketCount: number;
  ticketSummaries: VOCTicketSummary[];
  cached: boolean;
  generatedAt: string;
}

interface VOCInsightRecord {
  id?: number;
  brand: string;
  week_start_date: string;
  week_end_date: string;
  iso_week: number;
  week_label: string;
  top_issues: string[];
  trend_changes: string | null;
  weekly_summary: string | null;
  ticket_count: number;
  ticket_summaries: VOCTicketSummary[];
  generated_at: string;
  last_updated: string;
}

function normalizeDescription(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  return value.replace(/\s+/g, ' ').trim();
}

function parseCustomFieldValue(customFields: Array<Record<string, unknown>>, ids: number[]): string | null {
  const normalized = customFields as CustomField[];

  for (const fieldId of ids) {
    const matched = normalized.find(field => Number(field.id) === fieldId);
    if (!matched) {
      continue;
    }

    if (typeof matched.value === 'string' && matched.value.trim() !== '') {
      return matched.value.trim();
    }
  }

  return null;
}

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

function isWithinRange(dateString: string, start: Date, end: Date): boolean {
  const date = new Date(dateString);
  return date >= start && date <= end;
}

function buildWeekLabel(start: Date): string {
  const isoWeek = getZendeskWeekNumber(start);
  const year = start.getUTCFullYear();
  return `${year}-W${String(isoWeek).padStart(2, '0')}`;
}

async function getCachedVOCInsights(weekStarts: string[], brand: string): Promise<Map<string, VOCInsightRecord>> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('voc_insights')
    .select(
      'id, brand, week_start_date, week_end_date, iso_week, week_label, top_issues, trend_changes, weekly_summary, ticket_count, ticket_summaries, generated_at, last_updated',
    )
    .eq('brand', brand)
    .in('week_start_date', weekStarts);

  if (error) {
    throw new Error(`Failed to fetch voc_insights cache: ${error.message}`);
  }

  const map = new Map<string, VOCInsightRecord>();
  (data ?? []).forEach((record: VOCInsightRecord) => {
    map.set(record.week_start_date, record);
  });
  return map;
}

async function upsertVOCInsight(record: VOCInsightRecord): Promise<void> {
  const supabase = getSupabaseClient();
  const { data: existing, error: readError } = await supabase
    .from('voc_insights')
    .select('id')
    .eq('brand', record.brand)
    .eq('week_start_date', record.week_start_date)
    .maybeSingle();

  if (readError) {
    throw new Error(`Failed to check existing voc_insights record: ${readError.message}`);
  }

  const payload = {
    brand: record.brand,
    week_start_date: record.week_start_date,
    week_end_date: record.week_end_date,
    iso_week: record.iso_week,
    week_label: record.week_label,
    top_issues: record.top_issues,
    trend_changes: record.trend_changes,
    weekly_summary: record.weekly_summary,
    ticket_count: record.ticket_count,
    ticket_summaries: record.ticket_summaries,
    generated_at: record.generated_at,
    last_updated: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error: updateError } = await supabase.from('voc_insights').update(payload).eq('id', existing.id);
    if (updateError) {
      throw new Error(`Failed to update voc_insights record: ${updateError.message}`);
    }
    return;
  }

  const { error: insertError } = await supabase.from('voc_insights').insert(payload);
  if (insertError) {
    throw new Error(`Failed to insert voc_insights record: ${insertError.message}`);
  }
}

async function deleteVOCInsight(id: number): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from('voc_insights').delete().eq('id', id);
  if (error) {
    throw new Error(`Failed to delete empty voc_insights record: ${error.message}`);
  }
}

function mapInsight(record: VOCInsightRecord, cached: boolean): VOCWeekInsight {
  return {
    brand: record.brand,
    weekStartDate: record.week_start_date,
    weekEndDate: record.week_end_date,
    isoWeek: record.iso_week,
    weekLabel: record.week_label,
    topIssues: record.top_issues ?? [],
    trendChanges: record.trend_changes ?? '',
    weeklySummary: record.weekly_summary ?? '',
    ticketCount: record.ticket_count ?? 0,
    ticketSummaries: (record.ticket_summaries ?? []) as VOCTicketSummary[],
    cached,
    generatedAt: record.generated_at,
  };
}

async function fetchTicketsForVOC(): Promise<ZendeskTicket[]> {
  const zendeskClient = new ZendeskClient({
    subdomain: process.env.ZENDESK_SUBDOMAIN || '',
    email: process.env.ZENDESK_EMAIL || '',
    apiToken: process.env.ZENDESK_API_TOKEN || '',
  });

  const oldestWeek = getWeekRange(HISTORY_WEEKS);
  return zendeskClient.getAllTickets(oldestWeek.start.toISOString());
}

function validateZendeskCredentials(): void {
  const required = ['ZENDESK_SUBDOMAIN', 'ZENDESK_EMAIL', 'ZENDESK_API_TOKEN'] as const;
  for (const name of required) {
    if (!process.env[name]) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
  }
}

export async function getVOCAnalysis(options?: {
  weeks?: number;
  forceRefresh?: boolean;
  brand?: string;
  sourceTickets?: ZendeskTicket[];
}): Promise<VOCWeekInsight[]> {
  const brand = options?.brand?.trim() ? options.brand.trim().toLowerCase() : 'unknown';
  if (!options?.sourceTickets) {
    validateZendeskCredentials();
  }

  const weeks = Math.min(Math.max(options?.weeks ?? HISTORY_WEEKS, 1), HISTORY_WEEKS);
  const weekRanges = Array.from({ length: weeks }, (_, idx) => getWeekRange(weeks - idx));
  const weekStartDates = weekRanges.map(range => toDateString(range.start));

  const cachedMap = await getCachedVOCInsights(weekStartDates, brand);
  const needsGeneration = options?.forceRefresh
    ? weekRanges
    : weekRanges.filter(range => !cachedMap.has(toDateString(range.start)));

  const generatedMap = new Map<string, VOCInsightRecord>();

  if (needsGeneration.length > 0) {
    const tickets = options?.sourceTickets ?? (await fetchTicketsForVOC());
    const brandScopedTickets = tickets.filter(ticket => resolveTicketBrand(ticket) === brand);

    let previousWeekIssues: string[] = [];
    for (const range of weekRanges) {
      const key = toDateString(range.start);
      const existing = cachedMap.get(key);
      if (existing && !options?.forceRefresh) {
        previousWeekIssues = existing.top_issues ?? [];
        continue;
      }

      const weeklyTickets = brandScopedTickets
        .filter(ticket => isWithinRange(ticket.created_at, range.start, range.end));

      if (weeklyTickets.length === 0) {
        if (existing?.id) {
          await deleteVOCInsight(existing.id);
        }
        continue;
      }

      const weeklyAnalysisTickets = weeklyTickets.slice(0, MAX_TICKETS_PER_WEEK_FOR_WEEKLY_ANALYSIS);
      const weekLabel = buildWeekLabel(range.start);
      const aiResult = await analyzeVOCWeek({
        weekLabel,
        previousWeekLabel: previousWeekIssues.length ? buildWeekLabel(new Date(range.start.getTime() - 7 * 24 * 60 * 60 * 1000)) : undefined,
        previousWeekTopIssues: previousWeekIssues,
        tickets: weeklyAnalysisTickets.map(ticket => ({
          id: ticket.id,
          subject: ticket.subject || '',
          description: normalizeDescription(ticket.description),
          status: ticket.status || '',
          tags: Array.isArray(ticket.tags) ? ticket.tags : [],
          issueType: parseCustomFieldValue(ticket.custom_fields, ISSUE_TYPE_FIELD_IDS),
        })),
      });

      const ticketSummaries: VOCTicketSummary[] = await summarizeVOCTicketsBatch(
        weeklyTickets.map(ticket => ({
          id: ticket.id,
          subject: ticket.subject || '',
          description: normalizeDescription(ticket.description),
          status: ticket.status || '',
          tags: Array.isArray(ticket.tags) ? ticket.tags : [],
          issueType: parseCustomFieldValue(ticket.custom_fields, ISSUE_TYPE_FIELD_IDS),
        })),
      );

      const nowIso = new Date().toISOString();
      const record: VOCInsightRecord = {
        brand,
        week_start_date: key,
        week_end_date: toDateString(range.end),
        iso_week: getZendeskWeekNumber(range.start),
        week_label: weekLabel,
        top_issues: aiResult.topIssues,
        trend_changes: aiResult.trendChanges,
        weekly_summary: aiResult.weeklySummary,
        ticket_count: weeklyTickets.length,
        ticket_summaries: ticketSummaries,
        generated_at: nowIso,
        last_updated: nowIso,
      };

      await upsertVOCInsight(record);
      generatedMap.set(key, record);
      previousWeekIssues = record.top_issues;
    }
  }

  return weekRanges
    .map(range => {
    const key = toDateString(range.start);
    const generated = generatedMap.get(key);
    if (generated) {
      return mapInsight(generated, false);
    }

    const cached = cachedMap.get(key);
      if (!cached) {
        return null;
      }

      return mapInsight(cached, true);
    })
    .filter((row): row is VOCWeekInsight => row !== null);
}
