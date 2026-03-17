'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSearchParams } from 'next/navigation';
import type { VocTicketSummary, VocWeek } from '@/types/voc';

type VOCInsight = VocWeek & {
  weekStartDate: string;
  weekEndDate: string;
  topIssues: string[];
  trendChanges: string;
  cached: boolean;
};

type VOCResponse = {
  data?: unknown;
  lastCalculatedAt?: string;
  error?: string;
};

function parseBoolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function formatDate(value: string | null): string {
  if (!value) return 'No precomputed metrics found.';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function toInsight(input: Record<string, unknown>): VOCInsight {
  const rawTopIssues = input.topIssues ?? input.top_issues;
  const rawTicketSummaries = input.ticket_summaries;
  const ticketSummaries: VocTicketSummary[] = Array.isArray(rawTicketSummaries)
    ? rawTicketSummaries
        .filter(item => item && typeof item === 'object')
        .map(item => item as Record<string, unknown>)
        .filter(item => typeof item.ticket_id === 'number' && typeof item.summary === 'string')
        .map(item => ({ ticket_id: Number(item.ticket_id), summary: String(item.summary) }))
    : [];

  return {
    weekStartDate: String(input.weekStartDate ?? input.week_start_date ?? ''),
    weekEndDate: String(input.weekEndDate ?? input.week_end_date ?? ''),
    iso_week: Number(input.isoWeek ?? input.iso_week ?? 0),
    week_label: String(input.weekLabel ?? input.week_label ?? '-'),
    weekly_summary: String(input.weeklySummary ?? input.weekly_summary ?? ''),
    ticket_count: Number(input.ticketCount ?? input.ticket_count ?? 0),
    ticket_summaries: ticketSummaries,
    topIssues: Array.isArray(rawTopIssues)
      ? rawTopIssues.filter((item): item is string => typeof item === 'string')
      : [],
    trendChanges: String(input.trendChanges ?? input.trend_changes ?? ''),
    cached: parseBoolean(input.cached),
  };
}

export default function VOCDashboard() {
  const searchParams = useSearchParams();
  const brand = (searchParams?.get('brand') || 'all').trim().toLowerCase();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [items, setItems] = useState<VOCInsight[]>([]);
  const [expandedWeekKeys, setExpandedWeekKeys] = useState<Record<string, boolean>>({});
  const [lastCalculatedAt, setLastCalculatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const response = await fetch(`/api/voc?weeks=5&brand=${encodeURIComponent(brand)}`);
      const payload = (await response.json()) as VOCResponse;

      if (response.status === 404) {
        setItems([]);
        setLastCalculatedAt(null);
        setNotFound(true);
        setError(payload?.error ?? null);
        return;
      }

      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to fetch VOC insights');
      }

      const rows = Array.isArray(payload?.data) ? payload.data : [];
      const nextItems = rows
        .filter(item => item && typeof item === 'object')
        .map(item => toInsight(item as Record<string, unknown>));

      setLastCalculatedAt(
        payload?.lastCalculatedAt ??
          (rows[0] && typeof (rows[0] as Record<string, unknown>).generated_at === 'string'
            ? ((rows[0] as Record<string, unknown>).generated_at as string)
            : null) ??
          null,
      );
      setItems(nextItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, [brand]);

  const triggerSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const publicToken = process.env.NEXT_PUBLIC_INTERNAL_SYNC_TOKEN;
      const response = await fetch('/api/internal/trigger-sync', {
        method: 'POST',
        headers: publicToken ? { Authorization: `Bearer ${publicToken}` } : undefined,
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to trigger sync job');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-72 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <Card className="border-gray-700 bg-[#232424] text-white">
        <CardHeader>
          <CardTitle>No VOC snapshot found.</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-300">Run sync job or press Re-run AI.</p>
          {error ? <p className="text-xs text-red-400">{error}</p> : null}
          <div className="flex items-center gap-2">
            <button
              onClick={triggerSync}
              disabled={syncing}
              className="rounded-md border border-gray-600 px-3 py-1.5 text-xs hover:bg-[#2b3030] disabled:opacity-50"
            >
              {syncing ? 'Triggering...' : 'Trigger Sync'}
            </button>
            <button
              onClick={load}
              disabled={syncing}
              className="rounded-md border border-gray-600 px-3 py-1.5 text-xs hover:bg-[#2b3030] disabled:opacity-50"
            >
              Retry
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-gray-700 bg-[#232424] text-white">
        <CardHeader>
          <CardTitle>VOC Dashboard Error</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={load} className="rounded-md border border-gray-600 px-3 py-1.5 text-xs hover:bg-[#2b3030]">
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-700 bg-[#232424] p-3">
        <p className="text-xs text-gray-300">Last updated: {formatDate(lastCalculatedAt)}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={syncing}
            className="rounded-md border border-gray-600 px-3 py-1.5 text-xs hover:bg-[#2b3030] disabled:opacity-50"
          >
          Refresh
          </button>
          <button
            onClick={triggerSync}
            disabled={syncing}
            className="rounded-md border border-gray-600 px-3 py-1.5 text-xs hover:bg-[#2b3030] disabled:opacity-50"
          >
            {syncing ? 'Re-running...' : 'Re-run AI'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map(week => (
          <Card key={week.weekStartDate} className="border-gray-700 bg-[#232424] text-white">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{week.week_label}</CardTitle>
                <span className="text-xs text-gray-400">{week.cached ? 'cached' : 'fresh'}</span>
              </div>
              <p className="text-xs text-gray-400">
                Tickets: {week.ticket_count} | ISO Week: {week.iso_week}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="mb-1 text-sm font-medium">Top 5 Issues</p>
                <ul className="space-y-1 text-sm text-gray-300">
                  {week.topIssues.map((issue, idx) => (
                    <li key={`${week.weekStartDate}-${idx}`}>{idx + 1}. {issue}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">Trend Changes</p>
                <p className="text-sm text-gray-400">{week.trendChanges || '-'}</p>
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">Weekly Summary</p>
                <p className="text-sm text-gray-400">{week.weekly_summary || '-'}</p>
              </div>
              <div className="rounded-md border border-gray-700 p-3">
                <button
                  type="button"
                  onClick={() =>
                    setExpandedWeekKeys(prev => ({
                      ...prev,
                      [week.weekStartDate]: !prev[week.weekStartDate],
                    }))
                  }
                  className="w-full text-left text-sm font-medium text-gray-100 hover:text-white"
                >
                  {expandedWeekKeys[week.weekStartDate] ? 'Hide Ticket Summaries' : 'View Ticket Summaries'}
                </button>
                {expandedWeekKeys[week.weekStartDate] ? (
                  <div className="mt-3 space-y-2">
                    {Array.isArray(week.ticket_summaries) && week.ticket_summaries.length > 0 ? (
                      week.ticket_summaries.map(item => (
                        <div key={`${week.weekStartDate}-${item.ticket_id}`} className="rounded border border-gray-700 p-2">
                          <p className="text-xs font-semibold text-[#4FBDBA]">#{item.ticket_id}</p>
                          <p className="mt-1 whitespace-pre-wrap text-xs text-gray-300">{item.summary}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-gray-400">No ticket summaries available for this week.</p>
                    )}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
