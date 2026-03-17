import type { TicketOverviewCachePayload, TicketOverviewSnapshotRow } from './precomputeCacheService';

export type RiskLevel = 'green' | 'yellow' | 'red' | 'improving';

export interface HealthSubMetrics {
  resolutionRate: number;
  reopenRate: number;
  frtHours: number;
}

export interface HealthSubScores {
  resolutionScore: number;
  reopenScore: number;
  frtScore: number;
}

export interface HealthScoreResult {
  subMetrics: HealthSubMetrics;
  subScores: HealthSubScores;
  compositeScore: number;
  volatilityDelta: number | null;
  isHighVolatility: boolean;
  primaryTrendRisk: RiskLevel;
  criticalOverrides: {
    frtCritical: boolean;
    reopenCritical: boolean;
    resolutionCritical: boolean;
  };
}

const RESOLUTION_WEIGHT = 0.5;
const REOPEN_WEIGHT = 0.2;
const FRT_WEIGHT = 0.3;

const VOLATILITY_THRESHOLD_POINTS = 15;

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function getPayloadFromSnapshot(snapshot: TicketOverviewSnapshotRow | null): TicketOverviewCachePayload | null {
  if (!snapshot) return null;
  const payload = (snapshot as { payload?: unknown }).payload;
  if (!payload || typeof payload !== 'object') return null;
  return payload as TicketOverviewCachePayload;
}

export function calculateResolutionRate(payload: TicketOverviewCachePayload): number {
  const weeklyTicketsIn = payload.weeklyTicketsIn ?? [];
  const weeklyTicketsResolved = payload.weeklyTicketsResolved ?? [];

  // 3-week rolling average reduces single-week noise for cross-week tickets
  if (weeklyTicketsIn.length >= 1) {
    const recentIn = weeklyTicketsIn.slice(-3).reduce((a, b) => a + b, 0);
    const recentResolved = weeklyTicketsResolved.slice(-3).reduce((a, b) => a + b, 0);
    if (recentIn > 0) {
      return clamp((recentResolved / recentIn) * 100, 0, 100);
    }
  }

  // Fallback to direct totals when weekly arrays are absent
  const ticketsIn = payload.ticketsIn ?? 0;
  const ticketsResolved = payload.ticketsResolved ?? 0;
  if (!ticketsIn || ticketsIn <= 0) return 0;
  return clamp((ticketsResolved / ticketsIn) * 100, 0, 100);
}

export function calculateReopenRate(payload: TicketOverviewCachePayload): number {
  const reopened = payload.fcrBreakdown?.reopened ?? 0;
  const oneTouch = payload.fcrBreakdown?.oneTouch ?? 0;
  const twoTouch = payload.fcrBreakdown?.twoTouch ?? 0;
  const total = reopened + oneTouch + twoTouch;
  if (!total || total <= 0) {
    return 0;
  }
  const rate = (reopened / total) * 100;
  return clamp(rate, 0, 100);
}

export function calculateSubMetrics(payload: TicketOverviewCachePayload): HealthSubMetrics {
  const resolutionRate = calculateResolutionRate(payload);
  const reopenRate = calculateReopenRate(payload);
  const frtHours = typeof payload.frtMedian === 'number' ? Math.max(payload.frtMedian, 0) : 0;

  return {
    resolutionRate,
    reopenRate,
    frtHours,
  };
}

export function calculateSubScores(subMetrics: HealthSubMetrics): HealthSubScores {
  const resolutionScore = clamp(subMetrics.resolutionRate, 0, 100);

  const reopenScore = clamp(100 - subMetrics.reopenRate, 0, 100);

  // Rescaled to 24h baseline: 6h≈82, 12h≈73, 24h≈60, 48h≈51
  const frtLogComponent = Math.log10(1 + subMetrics.frtHours);
  const frtScore = clamp(100 - 28 * frtLogComponent, 0, 100);

  return {
    resolutionScore,
    reopenScore,
    frtScore,
  };
}

export function calculateCompositeScore(subScores: HealthSubScores): number {
  const raw =
    subScores.resolutionScore * RESOLUTION_WEIGHT +
    subScores.reopenScore * REOPEN_WEIGHT +
    subScores.frtScore * FRT_WEIGHT;
  return clamp(raw, 0, 100);
}

export function calculateVolatilityDelta(currentScore: number, previousScore: number | null): {
  delta: number | null;
  isHighVolatility: boolean;
} {
  if (previousScore === null || Number.isNaN(previousScore)) {
    return { delta: null, isHighVolatility: false };
  }
  const delta = currentScore - previousScore;
  // Only flag deterioration as volatile; score recovery should not trigger a warning
  const isHighVolatility = delta < -VOLATILITY_THRESHOLD_POINTS;
  return { delta, isHighVolatility };
}

export function calculatePrimaryTrendRisk(current: number, previous: number | null): RiskLevel {
  if (previous === null || previous === 0 || Number.isNaN(previous)) {
    return 'green';
  }
  const delta = current - previous;
  // Direction-aware: distinguish deterioration from recovery
  if (delta <= -15) return 'red';
  if (delta <= -8) return 'yellow';
  if (delta >= 10) return 'improving'; // Positive momentum signal
  return 'green';
}

export function calculateCriticalOverrides(
  subMetrics: HealthSubMetrics,
  fcrTotal?: number,
): {
  frtCritical: boolean;
  reopenCritical: boolean;
  resolutionCritical: boolean;
} {
  // Internal SLA defines response failure at 24h, not 12h
  const frtCritical = subMetrics.frtHours > 24;
  // Require ≥20 FCR samples to avoid false critical from 1–2 reopened tickets
  const reopenCritical = (fcrTotal === undefined || fcrTotal >= 20) && subMetrics.reopenRate > 15;
  const resolutionCritical = subMetrics.resolutionRate < 60;
  return {
    frtCritical,
    reopenCritical,
    resolutionCritical,
  };
}

export function calculateHealthFromSnapshots(options: {
  current: TicketOverviewSnapshotRow | null;
  previous?: TicketOverviewSnapshotRow | null;
}): HealthScoreResult | null {
  const currentPayload = getPayloadFromSnapshot(options.current);
  if (!currentPayload) {
    return null;
  }

  const subMetrics = calculateSubMetrics(currentPayload);
  const subScores = calculateSubScores(subMetrics);
  const compositeScore = calculateCompositeScore(subScores); // CSAT is not used in this product, keep base 50/20/30 weights

  let previousComposite: number | null = null;
  const previousPayload = getPayloadFromSnapshot(options.previous ?? null);
  if (previousPayload) {
    const previousSubMetrics = calculateSubMetrics(previousPayload);
    const previousSubScores = calculateSubScores(previousSubMetrics);
    previousComposite = calculateCompositeScore(previousSubScores);
  } else if (Array.isArray(currentPayload.trends?.frt) && currentPayload.trends.frt.length >= 2) {
    const currentFrt = currentPayload.trends.frt[currentPayload.trends.frt.length - 1] ?? subMetrics.frtHours;
    const previousFrt = currentPayload.trends.frt[currentPayload.trends.frt.length - 2];
    const syntheticPrevious: HealthSubMetrics = {
      resolutionRate: subMetrics.resolutionRate,
      reopenRate: subMetrics.reopenRate,
      frtHours: previousFrt,
    };
    const previousScores = calculateSubScores(syntheticPrevious);
    previousComposite = calculateCompositeScore(previousScores); // Both current and previous composite use identical weights — delta is comparable
  }

  const { delta: volatilityDelta, isHighVolatility } = calculateVolatilityDelta(compositeScore, previousComposite);
  const primaryTrendRisk = calculatePrimaryTrendRisk(compositeScore, previousComposite);

  // Pass total FCR sample size to enforce minimum-sample guard on reopen critical
  const fcrBreakdown = currentPayload.fcrBreakdown;
  const fcrTotal = fcrBreakdown
    ? (fcrBreakdown.oneTouch ?? 0) + (fcrBreakdown.twoTouch ?? 0) + (fcrBreakdown.reopened ?? 0)
    : undefined;
  const criticalOverrides = calculateCriticalOverrides(subMetrics, fcrTotal);

  const finalComposite = (() => {
    if (criticalOverrides.frtCritical || criticalOverrides.reopenCritical || criticalOverrides.resolutionCritical) {
      // Relax FRT critical cap 50 → 65 when trend has improved 3 consecutive weeks
      const frtTrend: number[] = currentPayload.trends?.frt ?? [];
      const isConsistentlyImproving =
        frtTrend.length >= 3 &&
        frtTrend[frtTrend.length - 1] < frtTrend[frtTrend.length - 2] &&
        frtTrend[frtTrend.length - 2] < frtTrend[frtTrend.length - 3];
      // Trend relief applies only to FRT critical; reopen/resolution critical caps stay firm at 50
      const criticalCap = criticalOverrides.frtCritical && isConsistentlyImproving ? 65 : 50;
      return Math.min(compositeScore, criticalCap);
    }
    return compositeScore;
  })();

  return {
    subMetrics,
    subScores,
    compositeScore: finalComposite,
    volatilityDelta,
    isHighVolatility,
    primaryTrendRisk,
    criticalOverrides,
  };
}
