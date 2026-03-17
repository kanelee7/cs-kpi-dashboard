import { ZendeskClient } from '../services/zendeskClient';
import { calculateKPIsForWeek } from '../services/kpiCalculator';
import type { FCRBreakdown, FRTDistribution } from '../services/kpiCalculator';
import { getSupabaseClient, upsertKPI } from '../services/supabaseService';
import { getVOCAnalysis } from '../services/vocService';
import { syncOpenTicketDevSummaries } from '../services/devSummaryService';
import {
  getLatestVocRows,
  upsertTicketOverviewCache,
  type TicketOverviewCachePayload,
} from '../services/precomputeCacheService';
import { groupTicketsByBrand } from '../services/brandResolver';
import { getWeekRange, getZendeskDisplayRange, getZendeskWeekNumber } from '../utils/dateUtils';

const HISTORY_WEEKS = 5;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function ensureRequiredEnv(): void {
  const required = [
    'ZENDESK_EMAIL',
    'ZENDESK_API_TOKEN',
    'ZENDESK_SUBDOMAIN',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY',
  ];
  required.forEach(requiredEnv);
}

type WeeklyKPIResult = {
  weekStartDate: string;
  weekEndDate: string;
  weekLabel: string;
  weekRange: string;
  ticketsIn: number;
  ticketsResolved: number;
  frtMedian: number;
  aht: number;
  fcrPercent: number;
  frtDistribution: FRTDistribution;
  fcrBreakdown: FCRBreakdown;
};

type SyncJobStatus = 'running' | 'success' | 'failed';

function toDateOnly(value: string): string {
  return value.split('T')[0];
}

function computeExpectedWeeklyCounts(tickets: Array<{ created_at: string }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (let offset = HISTORY_WEEKS; offset >= 1; offset--) {
    const { start, end } = getWeekRange(offset);
    const key = start.toISOString().split('T')[0];
    const count = tickets.filter(ticket => {
      const createdAt = new Date(ticket.created_at);
      return createdAt >= start && createdAt <= end;
    }).length;
    if (count > 0) {
      counts.set(key, count);
    }
  }
  return counts;
}

function logZendeskAuthenticity(tickets: Array<{ id: number; created_at: string }>): void {
  const distinctIds = new Set<number>(tickets.map(ticket => ticket.id));
  const sorted = [...tickets].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const oldest = sorted[0]?.created_at ? toDateOnly(sorted[0].created_at) : null;
  const latest = sorted[sorted.length - 1]?.created_at ? toDateOnly(sorted[sorted.length - 1].created_at) : null;
  const sampleIds = Array.from(distinctIds).slice(0, 3);

  console.log('[sync-metrics] Zendesk authenticity check', {
    totalTicketsFetched: tickets.length,
    distinctTicketIds: distinctIds.size,
    fetchedDateRange: oldest && latest ? `${oldest}..${latest}` : 'n/a',
    sampleTicketIds: sampleIds,
  });
}

function validateVocIntegrity(
  brand: string,
  expectedCounts: Map<string, number>,
  vocRows: Array<{ week_start_date?: string; ticket_count?: number }>,
): void {
  const rowByWeek = new Map<string, number>();
  for (const row of vocRows) {
    const weekStart = row.week_start_date;
    const ticketCount = Number(row.ticket_count ?? 0);
    if (!weekStart) {
      continue;
    }
    if (ticketCount <= 0) {
      throw new Error(`[sync-metrics] brand=${brand} has empty VOC week row for ${weekStart}`);
    }
    rowByWeek.set(weekStart, ticketCount);
  }

  expectedCounts.forEach((expectedCount, weekStart) => {
    const actualCount = rowByWeek.get(weekStart);
    if (actualCount === undefined) {
      throw new Error(`[sync-metrics] brand=${brand} missing VOC row for week ${weekStart}`);
    }
    if (actualCount !== expectedCount) {
      throw new Error(
        `[sync-metrics] brand=${brand} VOC ticket_count mismatch for week ${weekStart}: expected=${expectedCount}, actual=${actualCount}`,
      );
    }
  });
}

function countTicketSummaries(rows: Array<{ ticket_summaries?: unknown }>): number {
  return rows.reduce((sum, row) => {
    const ticketSummaries = row.ticket_summaries;
    return sum + (Array.isArray(ticketSummaries) ? ticketSummaries.length : 0);
  }, 0);
}

async function createSyncJobRun(
  status: SyncJobStatus,
  startedAt: string,
  message?: string,
): Promise<number> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('sync_job_runs')
    .insert({
      job_name: 'metrics-sync',
      status,
      started_at: startedAt,
      message: message ?? null,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create sync_job_runs row: ${error.message}`);
  }
  return Number((data as { id?: number })?.id ?? 0);
}

async function finalizeSyncJobRun(
  id: number,
  status: Exclude<SyncJobStatus, 'running'>,
  endedAt: string,
  message?: string,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('sync_job_runs')
    .update({
      status,
      ended_at: endedAt,
      message: message ?? null,
    })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to finalize sync_job_runs row: ${error.message}`);
  }
}

function buildOverviewPayload(weekly: WeeklyKPIResult[]): TicketOverviewCachePayload {
  const ordered = [...weekly].sort((a, b) => new Date(a.weekStartDate).getTime() - new Date(b.weekStartDate).getTime());
  const latest = ordered[ordered.length - 1];

  return {
    ticketsIn: latest?.ticketsIn ?? 0,
    ticketsResolved: latest?.ticketsResolved ?? 0,
    frtMedian: latest?.frtMedian ?? 0,
    avgHandleTime: latest?.aht ?? 0,
    fcrRate: latest?.fcrPercent ?? 0,
    csatAverage: 4.2,
    frtDistribution: latest?.frtDistribution ?? {
      '0-1h': 0,
      '1-8h': 0,
      '8-24h': 0,
      '>24h': 0,
      'No Reply': 0,
    },
    fcrBreakdown: latest?.fcrBreakdown ?? { oneTouch: 0, twoTouch: 0, reopened: 0 },
    weeklyTicketsIn: ordered.map(item => item.ticketsIn),
    weeklyTicketsResolved: ordered.map(item => item.ticketsResolved),
    weeklyLabels: ordered.map(item => item.weekLabel),
    weeklyRanges: ordered.map(item => item.weekRange),
    trends: {
      frt: ordered.map(item => item.frtMedian),
      aht: ordered.map(item => item.aht),
      fcr: ordered.map(item => item.fcrPercent),
      csat: ordered.map(() => 4.2),
    },
    latestWeekLabel: latest?.weekLabel ?? '',
    latestWeekRange: latest?.weekRange ?? '',
    latestWeekStartDate: latest?.weekStartDate ?? '',
    latestWeekEndDate: latest?.weekEndDate ?? '',
  };
}

async function main() {
  ensureRequiredEnv();
  const startedAt = new Date().toISOString();
  const syncRunId = await createSyncJobRun('running', startedAt);
  console.log('[sync-metrics] Starting precompute sync...');

  try {
    const zendeskClient = new ZendeskClient({
      subdomain: requiredEnv('ZENDESK_SUBDOMAIN'),
      email: requiredEnv('ZENDESK_EMAIL'),
      apiToken: requiredEnv('ZENDESK_API_TOKEN'),
    });
    const supabase = getSupabaseClient();

    const lookbackStart = new Date();
    lookbackStart.setDate(lookbackStart.getDate() - 60);
    console.log('[sync-metrics] Fetching Zendesk tickets...');
    const allTickets = await zendeskClient.getAllTickets(lookbackStart.toISOString());
    console.log(`[sync-metrics] Tickets fetched: ${allTickets.length}`);
    logZendeskAuthenticity(allTickets);

    if (allTickets.length === 0) {
      console.warn('[sync-metrics] No tickets fetched. Aborting.');
      await finalizeSyncJobRun(syncRunId, 'failed', new Date().toISOString(), 'No tickets fetched from Zendesk');
      return;
    }

    const groupedByBrand = groupTicketsByBrand(allTickets);
    console.log(`[sync-metrics] Brand groups: ${Array.from(groupedByBrand.keys()).join(', ')}`);

    const brandEntries: Array<[string, typeof allTickets]> = [];
    groupedByBrand.forEach((brandTickets, brand) => {
      brandEntries.push([brand, brandTickets]);
    });

    for (const [brand, brandTickets] of brandEntries) {
      const normalizedBrand = brand || 'unknown';
      const weeklyResults: WeeklyKPIResult[] = [];

      for (let offset = HISTORY_WEEKS; offset >= 1; offset--) {
        const { start: weekStart, end: weekEnd } = getWeekRange(offset);
        const kpiData = calculateKPIsForWeek(brandTickets, weekStart, weekEnd);
        const weekStartDate = weekStart.toISOString().split('T')[0];
        const weekEndDate = weekEnd.toISOString().split('T')[0];
        const weekNumber = getZendeskWeekNumber(weekStart);
        const weekLabel = `Week ${weekNumber}`;
        const { start, endInclusive } = getZendeskDisplayRange(weekStartDate, weekEndDate);
        const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Seoul' });
        const weekRange = `${formatter.format(start)} – ${formatter.format(endInclusive)}`;

        await upsertKPI(supabase, {
          brand: normalizedBrand,
          weekStartDate: weekStart,
          weekEndDate: weekEnd,
          weekLabel,
          ...kpiData,
        });

        weeklyResults.push({
          weekStartDate,
          weekEndDate,
          weekLabel,
          weekRange,
          ticketsIn: kpiData.ticketsIn,
          ticketsResolved: kpiData.ticketsResolved,
          frtMedian: kpiData.frtMedian,
          aht: kpiData.aht,
          fcrPercent: kpiData.fcrPercent,
          frtDistribution: kpiData.frtDistribution,
          fcrBreakdown: kpiData.fcrBreakdown,
        });
      }

      const overviewPayload = buildOverviewPayload(weeklyResults);
      await upsertTicketOverviewCache(normalizedBrand, overviewPayload, supabase);
      await getVOCAnalysis({
        weeks: HISTORY_WEEKS,
        forceRefresh: true,
        brand: normalizedBrand,
        sourceTickets: brandTickets,
      });

      const expectedCounts = computeExpectedWeeklyCounts(brandTickets);
      const latestVocRows = await getLatestVocRows(HISTORY_WEEKS, normalizedBrand, supabase);
      validateVocIntegrity(
        normalizedBrand,
        expectedCounts,
        latestVocRows.map(row => ({
          week_start_date: typeof row.week_start_date === 'string' ? row.week_start_date : undefined,
          ticket_count: typeof row.ticket_count === 'number' ? row.ticket_count : 0,
        })),
      );
      console.log('[sync-metrics] VOC generation verified', {
        brand: normalizedBrand,
        weeksGenerated: latestVocRows.length,
        ticketSummariesGenerated: countTicketSummaries(
          latestVocRows.map(row => ({
            ticket_summaries: row.ticket_summaries,
          })),
        ),
      });

      console.log(`[sync-metrics] brand=${normalizedBrand} cache updated`);
    }

    await syncOpenTicketDevSummaries({
      limit: 200,
      forceRefresh: false,
      sourceTickets: allTickets,
    });
    console.log('[sync-metrics] dev_summary_cache updated');

    await finalizeSyncJobRun(syncRunId, 'success', new Date().toISOString(), 'Precompute sync complete');
    console.log('[sync-metrics] Precompute sync complete.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync error';
    await finalizeSyncJobRun(syncRunId, 'failed', new Date().toISOString(), message);
    throw error;
  }
}

main().catch(error => {
  console.error('[sync-metrics] Failed:', error);
  process.exit(1);
});
