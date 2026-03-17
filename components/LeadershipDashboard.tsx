'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Activity, AlertCircle, ArrowRight, BarChart3, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { TicketOverviewSnapshotRow } from '@/services/precomputeCacheService';
import {
  calculateHealthFromSnapshots,
  type HealthScoreResult,
  type RiskLevel,
} from '@/services/kpiService';
import type { VocTicketSummary, VocWeek } from '@/types/voc';

type TicketOverviewResponse = {
  data?: TicketOverviewSnapshotRow;
  lastCalculatedAt?: string | null;
  error?: string;
};

type VOCInsight = VocWeek & {
  weekStartDate: string;
  weekEndDate: string;
  topIssues: string[];
  trendChanges: string;
};

type VOCResponse = {
  data?: unknown;
  lastCalculatedAt?: string;
  error?: string;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return 'No precomputed metrics found.';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function toVocInsight(input: Record<string, unknown>): VOCInsight {
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
  };
}

function riskToLabel(level: RiskLevel): { label: string; className: string } {
  if (level === 'red') {
    return {
      label: 'High Risk',
      className: 'bg-red-500/10 text-red-300 border-red-500/30',
    };
  }
  if (level === 'yellow') {
    return {
      label: 'Watchlist',
      className: 'bg-amber-500/10 text-amber-200 border-amber-500/30',
    };
  }
  if (level === 'improving') {
    return {
      label: 'Improving',
      className: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
    };
  }
  return {
    label: 'Stable',
    className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  };
}

function healthToNarrative(health: HealthScoreResult | null): string {
  if (!health) {
    return 'Precomputed CS health index not found. Trigger the sync job and revisit this view.';
  }

  const score = Math.round(health.compositeScore);
  const pieces: string[] = [];

  if (score >= 80) {
    pieces.push('CS operations are performing in a healthy, scalable band this period.');
  } else if (score >= 65) {
    pieces.push('Core CS operations are stable but showing early pressure signals.');
  } else {
    pieces.push('CS health is in a stressed band with meaningful risk to customer experience.');
  }

  if (health.criticalOverrides.frtCritical) {
    pieces.push('First response time has breached the 12h critical threshold, indicating structural staffing or routing gaps.');
  }
  if (health.criticalOverrides.reopenCritical) {
    pieces.push('Reopen rate is above 15%, suggesting quality and policy alignment issues in frontline resolutions.');
  }
  if (health.criticalOverrides.resolutionCritical) {
    pieces.push('Resolution rate has fallen below 60%, raising the risk of backlog growth and customer churn.');
  }

  if (health.isHighVolatility && typeof health.volatilityDelta === 'number') {
    const direction = health.volatilityDelta > 0 ? 'upward' : 'downward';
    pieces.push(
      `Composite health has moved ${direction} by ${Math.abs(Math.round(health.volatilityDelta))} points vs. the prior period, indicating a rapid structural shift rather than noise.`,
    );
  }

  return pieces.join(' ');
}

function Sparkline({ values }: { values: number[] }) {
  if (!Array.isArray(values) || values.length === 0) {
    return <div className="h-8 w-16 rounded-full bg-gray-800/60" />;
  }
  const data = values.slice(-6);
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map((v, index) => {
      const x = (index / Math.max(data.length - 1, 1)) * 60;
      const y = 24 - ((v - min) / range) * 18;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg width="64" height="24" className="opacity-80">
      <polyline
        fill="none"
        stroke="#4FBDBA"
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
}

export default function LeadershipDashboard() {
  const searchParams = useSearchParams();
  const brand = (searchParams?.get('brand') || 'all').trim().toLowerCase();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ticketOverview, setTicketOverview] = useState<TicketOverviewSnapshotRow | null>(null);
  const [ticketOverviewLastCalculatedAt, setTicketOverviewLastCalculatedAt] = useState<string | null>(null);
  const [vocInsights, setVocInsights] = useState<VOCInsight[]>([]);
  const [vocLastCalculatedAt, setVocLastCalculatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewResponse, vocResponse] = await Promise.all([
        fetch(`/api/ticket-overview?weeks=5&brand=${encodeURIComponent(brand)}`),
        fetch(`/api/voc?weeks=3&brand=${encodeURIComponent(brand)}`),
      ]);

      const overviewPayload = (await overviewResponse.json()) as TicketOverviewResponse;
      if (!overviewResponse.ok) {
        throw new Error(overviewPayload?.error || 'Failed to fetch ticket overview snapshot');
      }
      setTicketOverview(overviewPayload.data ?? null);
      setTicketOverviewLastCalculatedAt(overviewPayload.lastCalculatedAt ?? null);

      const vocPayload = (await vocResponse.json()) as VOCResponse;
      if (vocResponse.status === 404) {
        setVocInsights([]);
        setVocLastCalculatedAt(null);
      } else if (!vocResponse.ok) {
        throw new Error(vocPayload?.error || 'Failed to fetch VOC insights');
      } else {
        const rows = Array.isArray(vocPayload.data) ? vocPayload.data : [];
        const parsed = rows
          .filter(item => item && typeof item === 'object')
          .map(item => toVocInsight(item as Record<string, unknown>));
        setVocInsights(parsed);
        setVocLastCalculatedAt(
          vocPayload.lastCalculatedAt ??
            (rows[0] && typeof (rows[0] as Record<string, unknown>).generated_at === 'string'
              ? ((rows[0] as Record<string, unknown>).generated_at as string)
              : null) ??
            null,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error while loading leadership dashboard');
    } finally {
      setLoading(false);
    }
  }, [brand]);

  useEffect(() => {
    load();
  }, [load]);

  const health = useMemo<HealthScoreResult | null>(() => {
    return calculateHealthFromSnapshots({
      current: ticketOverview,
    });
  }, [ticketOverview]);

  const riskPill = useMemo(() => {
    const level = health?.primaryTrendRisk ?? 'green';
    const info = riskToLabel(level);
    const Icon = level === 'improving' ? TrendingUp : Activity;
    const improvingDescription = 'Health Score is trending upward vs last week';
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${info.className}`}
        title={level === 'improving' ? improvingDescription : undefined}
        aria-label={level === 'improving' ? improvingDescription : undefined}
      >
        <Icon className="h-3.5 w-3.5" />
        {info.label}
      </span>
    );
  }, [health]);

  const vocHeadline = useMemo(() => {
    if (!vocInsights.length) return 'No VOC snapshot available. Once AI sync runs, this will surface top structural shifts.';
    const latest = vocInsights[0];
    const headlineIssue = latest.topIssues[0];
    if (headlineIssue) {
      return `Top structural issue this period: “${headlineIssue}”.`;
    }
    if (latest.weekly_summary) {
      return latest.weekly_summary;
    }
    return 'Customer voice signals are stable without a dominant new theme this period.';
  }, [vocInsights]);

  const latestTopIssues = vocInsights[0]?.topIssues ?? [];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-32 w-full" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-40 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-gray-700 bg-[#232424] text-white">
        <CardHeader>
          <CardTitle>Leadership Dashboard Error</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => load()}
            className="rounded-md border border-gray-600 px-3 py-1.5 text-xs hover:bg-[#2b3030]"
          >
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 text-white">
      {/* 1. Executive Health Overview */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">CS Health (Composite Index)</h2>
            <p className="text-xs text-gray-400">
              One-line view of operational stability, quality, and responsiveness for leadership.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-300">
            <span className="text-gray-400">
              Ticket metrics last updated:{' '}
              <span className="text-gray-200">{formatDate(ticketOverviewLastCalculatedAt)}</span>
            </span>
            <span className="h-4 w-px bg-gray-700" />
            <span className="text-gray-400">
              VOC last updated: <span className="text-gray-200">{formatDate(vocLastCalculatedAt)}</span>
            </span>
          </div>
        </div>

        <Card className="border-gray-700 bg-[#232424] text-white">
          <CardContent className="flex flex-col gap-6 p-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-5">
              <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-[#181919]">
                <div className="absolute inset-1 rounded-full bg-gradient-to-br from-[#111111] to-[#1f2933]" />
                <div className="relative text-center">
                  <div className="text-[26px] font-bold">
                    {health ? Math.round(health.compositeScore) : '--'}
                  </div>
                  <div className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                    Health Score
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {riskPill}
                  {health?.isHighVolatility ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-200">
                      <AlertCircle className="h-3.5 w-3.5" />
                      ⚠ Rapid Shift Detected
                    </span>
                  ) : null}
                </div>
                <p className="max-w-2xl text-xs leading-relaxed text-gray-300">
                  {healthToNarrative(health)}
                </p>
              </div>
            </div>

            {health ? (
              <div className="grid flex-1 gap-3 text-xs md:grid-cols-3">
                <div className="rounded-lg border border-gray-700 bg-[#1d1f20] p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-medium text-gray-200">Resolution</span>
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                  <div className="mb-1 text-lg font-semibold text-white">
                    {health.subMetrics.resolutionRate.toFixed(1)}%
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Linear contribution into the index. Below 60% is treated as a critical red override.
                  </p>
                </div>
                <div className="rounded-lg border border-gray-700 bg-[#1d1f20] p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-medium text-gray-200">Reopen Rate</span>
                    <TrendingDown className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                  <div className="mb-1 text-lg font-semibold text-white">
                    {health.subMetrics.reopenRate.toFixed(1)}%
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Inverted contribution. Above 15% is treated as a critical red override.
                  </p>
                </div>
                <div className="rounded-lg border border-gray-700 bg-[#1d1f20] p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-medium text-gray-200">FRT Median</span>
                    <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                  <div className="mb-1 text-lg font-semibold text-white">
                    {health.subMetrics.frtHours.toFixed(1)}h
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Inverted log contribution. &gt; 12h is a critical red override on the composite.
                  </p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      {/* 2. Operational Stability Detail (with sparklines) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-100">Operational Stability – Trend View</h2>
          <p className="text-[11px] text-gray-400">
            Integrated sparklines highlight directional shifts without requiring a full chart review.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-gray-700 bg-[#232424] text-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-gray-300">Resolution Rate</CardTitle>
              <Sparkline
                values={
                  Array.isArray(
                    (ticketOverview as TicketOverviewSnapshotRow | null)?.payload &&
                      (ticketOverview as TicketOverviewSnapshotRow & { payload: { weeklyTicketsIn?: number[]; weeklyTicketsResolved?: number[] } })
                        .payload.weeklyTicketsResolved,
                  )
                    ? (
                        (ticketOverview as TicketOverviewSnapshotRow & {
                          payload: { weeklyTicketsIn?: number[]; weeklyTicketsResolved?: number[] };
                        }).payload.weeklyTicketsResolved ?? []
                      ).map((resolved, index) => {
                        const payload = (
                          ticketOverview as TicketOverviewSnapshotRow & {
                            payload: { weeklyTicketsIn?: number[]; weeklyTicketsResolved?: number[] };
                          }
                        ).payload;
                        const inValue = payload.weeklyTicketsIn?.[index] ?? 0;
                        if (!inValue) return 0;
                        return (resolved / inValue) * 100;
                      })
                    : []
                }
              />
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-lg font-semibold">
                {health ? `${health.subMetrics.resolutionRate.toFixed(1)}%` : '--'}
              </div>
              <p className="text-[11px] text-gray-400">
                Week-over-week view of closure efficiency. Sustained decline signals backlog pressure and staffing risk.
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-700 bg-[#232424] text-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-gray-300">First Response Time (FRT)</CardTitle>
              <Sparkline
                values={
                  Array.isArray(
                    (ticketOverview as TicketOverviewSnapshotRow | null)?.payload &&
                      (ticketOverview as TicketOverviewSnapshotRow & { payload: { trends?: { frt?: number[] } } })
                        .payload.trends?.frt,
                  )
                    ? (
                        (ticketOverview as TicketOverviewSnapshotRow & {
                          payload: { trends?: { frt?: number[] } };
                        }).payload.trends?.frt ?? []
                      )
                    : []
                }
              />
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-lg font-semibold">
                {health ? `${health.subMetrics.frtHours.toFixed(1)}h` : '--'}
              </div>
              <p className="text-[11px] text-gray-400">
                Log-normalized into the health score. Spikes above 12h are treated as critical structural risk.
              </p>
            </CardContent>
          </Card>

          <Card className="border-gray-700 bg-[#232424] text-white">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-gray-300">Reopen Rate</CardTitle>
              <Sparkline values={[]} />
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-lg font-semibold">
                {health ? `${health.subMetrics.reopenRate.toFixed(1)}%` : '--'}
              </div>
              <p className="text-[11px] text-gray-400">
                Derived from reopen vs. one-/two-touch mix. &gt; 15% indicates policy, training, or product fit gaps.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 3. Business Impact Lens (formulas defined, MAU wiring pending) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-100">Business Impact – Elasticity &amp; Retention Signals</h2>
          <p className="text-[11px] text-gray-400">
            Uses ticket volume vs. MAU and payment-related tickets vs. refund flags once MAU data is wired in.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-gray-700 bg-[#232424] text-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-[#4FBDBA]" />
                Scalability (Elasticity Index)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-gray-300">
              <p>
                Defined as <span className="font-mono">% Ticket Change - % MAU Growth</span>. Values near 0 indicate neutral
                scaling, positive values highlight growth risk, and negative values signal high efficiency.
              </p>
              <p>
                MAU time series is not yet connected in this codebase. The formula is implemented and will output once MAU
                data is provided to the dashboard.
              </p>
            </CardContent>
          </Card>
          <Card className="border-gray-700 bg-[#232424] text-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <BarChart3 className="h-4 w-4 text-[#F3C969]" />
                Tickets per 1,000 MAU
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-gray-300">
              <p>
                Tracks structural efficiency via <span className="font-mono">Tickets / (MAU / 1,000)</span>. As MAU grows, a
                flat or declining ratio indicates healthy scalability.
              </p>
              <p>
                Once MAU input is wired in, this card surfaces a compact trendline and the latest-period efficiency ratio for
                executive review.
              </p>
            </CardContent>
          </Card>
          <Card className="border-gray-700 bg-[#232424] text-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertCircle className="h-4 w-4 text-[#F47C7C]" />
                Retention Risk (Payment vs Refund)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-gray-300">
              <p>
                Designed as a 3‑month rolling correlation between payment-ticket surge and refund/churn flags, surfaced as a
                Pearson r‑coefficient with confidence status.
              </p>
              <p>
                Upstream refund/churn flags are not yet modeled in the current schema, so this view will activate once those
                signals are added to the data layer.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 4. Structural Trend & VOC Narrative */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-100">Structural Trend – Customer Voice</h2>
          <p className="text-[11px] text-gray-400">
            Rolls up precomputed VOC insights into an executive narrative of macro shifts.
          </p>
        </div>
        <Card className="border-gray-700 bg-[#232424] text-white">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start gap-3">
              <div className="mt-1 rounded-full bg-[#111111] p-1.5">
                <BarChart3 className="h-4 w-4 text-[#4FBDBA]" />
              </div>
              <div className="space-y-1 text-xs text-gray-200">
                <div className="font-semibold">Impact Narrative</div>
                <p className="leading-relaxed text-gray-300">{vocHeadline}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 text-xs">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Top Structural Issues
                </div>
                <ul className="space-y-1.5 text-gray-200">
                  {latestTopIssues.length ? (
                    latestTopIssues.slice(0, 5).map((issue, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="mt-0.5 text-[10px] text-gray-500">{index + 1}.</span>
                        <span>{issue}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-gray-400">No dominant themes identified in the latest VOC snapshot.</li>
                  )}
                </ul>
              </div>
              <div className="space-y-2 text-xs">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Supporting Ticket Summaries
                </div>
                {vocInsights[0]?.ticket_summaries && vocInsights[0].ticket_summaries.length > 0 ? (
                  <div className="space-y-2">
                    {vocInsights[0].ticket_summaries.slice(0, 3).map(item => (
                      <div
                        key={item.ticket_id}
                        className="rounded-md border border-gray-700/80 bg-[#181919] p-2 text-[11px] text-gray-300"
                      >
                        <span className="mr-1 font-semibold text-[#4FBDBA]">#{item.ticket_id}</span>
                        <span>{item.summary}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-400">
                    Once VOC sync is populated with ticket summaries, this panel will surface representative customer stories.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 5. Recommended Executive Actions */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-100">Recommended Executive Actions</h2>
          <p className="text-[11px] text-gray-400">
            Direct, lever-ready actions derived from the health index and VOC signals.
          </p>
        </div>
        <Card className="border-gray-700 bg-[#232424] text-white">
          <CardContent className="space-y-2 p-5 text-xs text-gray-200">
            <div className="flex items-start gap-2">
              <ArrowRight className="mt-0.5 h-3.5 w-3.5 text-[#4FBDBA]" />
              <p>
                If FRT is in a critical red band (&gt; 12h), prioritize a time‑boxed staffing and routing review for{' '}
                <span className="font-semibold">top 2 VOC themes</span> where slow response amplifies churn risk.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <ArrowRight className="mt-0.5 h-3.5 w-3.5 text-[#4FBDBA]" />
              <p>
                When reopen rate exceeds 15%, trigger a focused QA and playbook audit on the most frequent structural issues
                from VOC, with a goal of reducing reopens by the next 4‑week cycle.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <ArrowRight className="mt-0.5 h-3.5 w-3.5 text-[#4FBDBA]" />
              <p>
                As MAU wiring is completed, institutionalize a monthly{' '}
                <span className="font-semibold">Elasticity &amp; Retention</span> review where CS and Growth jointly inspect
                the Ticket vs. MAU ratio and payment‑refund correlation before major product or campaign launches.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

