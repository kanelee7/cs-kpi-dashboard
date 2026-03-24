import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabaseService';
import { getBrandQueryValues } from './brandResolver';

export interface TicketOverviewCachePayload {
  ticketsIn: number;
  ticketsResolved: number;
  frtMedian: number;
  avgHandleTime: number;
  fcrRate: number;
  csatAverage: number;
  frtDistribution: {
    '0-1h': number;
    '1-8h': number;
    '8-24h': number;
    '>24h': number;
    'No Reply': number;
  };
  fcrBreakdown: {
    oneTouch: number;
    twoTouch: number;
    reopened: number;
  };
  weeklyTicketsIn: number[];
  weeklyTicketsResolved: number[];
  weeklyLabels: string[];
  weeklyRanges: string[];
  trends: {
    frt: number[];
    aht: number[];
    fcr: number[];
    csat: number[];
  };
  latestWeekLabel: string;
  latestWeekRange: string;
  latestWeekStartDate: string;
  latestWeekEndDate: string;
}

export interface VocInsightCacheRow {
  week_start_date: string;
  week_end_date: string;
  iso_week: number;
  week_label: string;
  top_issues: string[];
  ticket_summaries?: Array<{ ticket_id: number; summary: string }>;
  trend_changes: string | null;
  weekly_summary: string | null;
  ticket_count: number;
  generated_at: string;
  last_updated: string;
}

export interface TicketOverviewSnapshotRow {
  id: number;
  brand?: string | null;
  calculated_at?: string | null;
  generated_at?: string | null;
  [key: string]: unknown;
}

export interface VocInsightSnapshotRow {
  id: number;
  brand?: string | null;
  week_start_date?: string;
  ticket_count?: number;
  ticket_summaries?: Array<{ ticket_id: number; summary: string }>;
  generated_at?: string;
  created_at?: string;
  [key: string]: unknown;
}

function getClient(client?: SupabaseClient): SupabaseClient {
  return client ?? getSupabaseClient();
}

export async function upsertTicketOverviewCache(
  brand: string,
  payload: TicketOverviewCachePayload,
  client?: SupabaseClient,
): Promise<void> {
  const supabase = getClient(client);
  const now = new Date().toISOString();
  const { data: existing, error: readError } = await supabase
    .from('ticket_overview_cache')
    .select('id')
    .eq('brand', brand)
    .maybeSingle();

  if (readError) {
    throw new Error(`Failed to read ticket_overview_cache for upsert: ${readError.message}`);
  }

  const row = {
    brand,
    payload,
    generated_at: now,
    last_updated: now,
  };

  if (existing?.id) {
    const { error: updateError } = await supabase.from('ticket_overview_cache').update(row).eq('id', existing.id);
    if (updateError) {
      throw new Error(`Failed to update ticket_overview_cache: ${updateError.message}`);
    }
    return;
  }

  const { error: insertError } = await supabase.from('ticket_overview_cache').insert(row);
  if (insertError) {
    throw new Error(`Failed to insert ticket_overview_cache: ${insertError.message}`);
  }
}

export async function getTicketOverviewCache(
  brand = 'all',
  client?: SupabaseClient,
): Promise<{ payload: TicketOverviewCachePayload; generated_at: string; last_updated: string } | null> {
  const supabase = getClient(client);
  const { data, error } = await supabase
    .from('ticket_overview_cache')
    .select('payload, generated_at, last_updated')
    .eq('brand', brand)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to read ticket_overview_cache: ${error.message}`);
  }

  return data as { payload: TicketOverviewCachePayload; generated_at: string; last_updated: string } | null;
}

export async function getVocInsightsFromCache(weeks = 5, client?: SupabaseClient): Promise<VocInsightCacheRow[]> {
  const supabase = getClient(client);
  const { data, error } = await supabase
    .from('voc_insights')
    .select(
      'week_start_date, week_end_date, iso_week, week_label, top_issues, ticket_summaries, trend_changes, weekly_summary, ticket_count, generated_at, last_updated',
    )
    .order('week_start_date', { ascending: false })
    .limit(weeks);

  if (error) {
    throw new Error(`Failed to read voc_insights cache: ${error.message}`);
  }

  return (data ?? []) as VocInsightCacheRow[];
}

function shouldFallbackToGeneratedAt(errorMessage: string): boolean {
  return errorMessage.includes('column') && errorMessage.includes('calculated_at');
}

export async function getLatestTicketOverviewSnapshot(
  brand: string,
  _weeks = 5,
  client?: SupabaseClient,
): Promise<TicketOverviewSnapshotRow | null> {
  const supabase = getClient(client);
  const brandValues = getBrandQueryValues(brand);
  const primary = await supabase
    .from('ticket_overview_cache')
    .select('*')
    .in('brand', brandValues)
    .order('calculated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!primary.error) {
    return primary.data as TicketOverviewSnapshotRow | null;
  }

  if (!shouldFallbackToGeneratedAt(primary.error.message)) {
    throw new Error(`Failed to read latest ticket overview snapshot: ${primary.error.message}`);
  }

  const fallback = await supabase
    .from('ticket_overview_cache')
    .select('*')
    .in('brand', brandValues)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fallback.error) {
    throw new Error(`Failed to read latest ticket overview snapshot: ${fallback.error.message}`);
  }

  return fallback.data as TicketOverviewSnapshotRow | null;
}

function snapshotGeneratedMs(row: TicketOverviewSnapshotRow): number {
  const raw = row.generated_at ?? row.calculated_at;
  if (typeof raw !== 'string') return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** One row per brand (latest by generated_at). Avoids double-counting if duplicate brand rows exist. */
function dedupeTicketOverviewSnapshotsByBrand(rows: TicketOverviewSnapshotRow[]): TicketOverviewSnapshotRow[] {
  const latestByBrand = new Map<string, TicketOverviewSnapshotRow>();
  for (const snap of rows) {
    const raw = snap.brand;
    const brand = typeof raw === 'string' ? raw.trim() : '';
    if (!brand || brand.toLowerCase() === 'all') continue;
    const prev = latestByBrand.get(brand);
    if (!prev || snapshotGeneratedMs(snap) >= snapshotGeneratedMs(prev)) {
      latestByBrand.set(brand, snap);
    }
  }
  return Array.from(latestByBrand.values());
}

export async function getAllBrandsAggregatedTicketOverview(
  client?: SupabaseClient,
): Promise<TicketOverviewSnapshotRow | null> {
  const supabase = getClient(client);
  const { data, error } = await supabase
    .from('ticket_overview_cache')
    .select('*')
    .order('generated_at', { ascending: false });

  if (error) throw new Error(`Failed to read all brand snapshots: ${error.message}`);
  if (!data || data.length === 0) return null;

  const snapshots = data as TicketOverviewSnapshotRow[];
  const dedupedSnapshots = dedupeTicketOverviewSnapshotsByBrand(snapshots);
  if (dedupedSnapshots.length === 0) return null;

  const payloads = dedupedSnapshots
    .map(s => s.payload as TicketOverviewCachePayload | undefined)
    .filter((p): p is TicketOverviewCachePayload => !!p);

  if (payloads.length === 0) return dedupedSnapshots[0];

  const ticketsIn = payloads.reduce((s, p) => s + (p.ticketsIn ?? 0), 0);
  const ticketsResolved = payloads.reduce((s, p) => s + (p.ticketsResolved ?? 0), 0);
  const totalTickets = ticketsIn || 1;

  const frtMedian =
    payloads.reduce((s, p) => s + (p.frtMedian ?? 0) * (p.ticketsIn ?? 0), 0) / totalTickets;
  const avgHandleTime =
    payloads.reduce((s, p) => s + (p.avgHandleTime ?? 0) * (p.ticketsIn ?? 0), 0) / totalTickets;
  const fcrRate =
    payloads.reduce((s, p) => s + (p.fcrRate ?? 0) * (p.ticketsIn ?? 0), 0) / totalTickets;
  const csatAverage =
    payloads.reduce((s, p) => s + (p.csatAverage ?? 0) * (p.ticketsIn ?? 0), 0) / totalTickets;

  const frtDistribution: TicketOverviewCachePayload['frtDistribution'] = {
    '0-1h': 0,
    '1-8h': 0,
    '8-24h': 0,
    '>24h': 0,
    'No Reply': 0,
  };
  for (const p of payloads) {
    if (p.frtDistribution) {
      for (const key of Object.keys(frtDistribution) as Array<keyof typeof frtDistribution>) {
        frtDistribution[key] += p.frtDistribution[key] ?? 0;
      }
    }
  }

  const fcrBreakdown: TicketOverviewCachePayload['fcrBreakdown'] = {
    oneTouch: 0,
    twoTouch: 0,
    reopened: 0,
  };
  for (const p of payloads) {
    if (p.fcrBreakdown) {
      fcrBreakdown.oneTouch += p.fcrBreakdown.oneTouch ?? 0;
      fcrBreakdown.twoTouch += p.fcrBreakdown.twoTouch ?? 0;
      fcrBreakdown.reopened += p.fcrBreakdown.reopened ?? 0;
    }
  }

  const base = payloads[0];
  const weekCount = base.weeklyLabels?.length ?? 0;
  const weeklyTicketsIn = Array.from({ length: weekCount }, (_, i) =>
    payloads.reduce((s, p) => s + (p.weeklyTicketsIn?.[i] ?? 0), 0),
  );
  const weeklyTicketsResolved = Array.from({ length: weekCount }, (_, i) =>
    payloads.reduce((s, p) => s + (p.weeklyTicketsResolved?.[i] ?? 0), 0),
  );

  const trendKeys = ['frt', 'aht', 'fcr', 'csat'] as const;
  const trends = {} as TicketOverviewCachePayload['trends'];
  for (const key of trendKeys) {
    const trendLen = base.trends?.[key]?.length ?? 0;
    trends[key] = Array.from({ length: trendLen }, (_, i) => {
      const vals = payloads
        .map(p => p.trends?.[key]?.[i])
        .filter((v): v is number => typeof v === 'number');
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });
  }

  const aggregatedPayload: TicketOverviewCachePayload = {
    ...base,
    ticketsIn,
    ticketsResolved,
    frtMedian,
    avgHandleTime,
    fcrRate,
    csatAverage,
    frtDistribution,
    fcrBreakdown,
    weeklyTicketsIn,
    weeklyTicketsResolved,
    trends,
  };

  const metaRow = [...dedupedSnapshots].sort((a, b) => snapshotGeneratedMs(b) - snapshotGeneratedMs(a))[0];

  return {
    ...metaRow,
    brand: 'all',
    payload: aggregatedPayload,
  };
}

export async function getLatestVocRows(
  weeks = 5,
  brand?: string,
  client?: SupabaseClient,
): Promise<VocInsightSnapshotRow[]> {
  const supabase = getClient(client);
  let query = supabase
    .from('voc_insights')
    .select('*')
    .order('week_start_date', { ascending: false })
    .limit(weeks);
  if (brand) {
    query = query.in('brand', getBrandQueryValues(brand));
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to read latest VOC rows: ${error.message}`);
  }

  return (data ?? []) as VocInsightSnapshotRow[];
}
