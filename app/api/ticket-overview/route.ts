import { NextResponse } from 'next/server';
import {
  getLatestTicketOverviewSnapshot,
  getAllBrandsAggregatedTicketOverview,
} from '../../../services/precomputeCacheService';
import { normalizeBrandId, SUPPORTED_BRANDS } from '../../../services/brandResolver';

function parseWeeks(value: string | null): number {
  const parsed = value ? Number(value) : 5;
  return Number.isFinite(parsed) ? Math.max(1, parsed) : 5;
}

export async function GET(request: Request) {
  const start = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const weeks = parseWeeks(searchParams.get('weeks'));
    const brand = normalizeBrandId(searchParams.get('brand'));

    if (!brand) {
      return NextResponse.json(
        { error: `brand parameter required. supported brands: all, ${SUPPORTED_BRANDS.join(', ')}` },
        { status: 400 },
      );
    }

    console.info('[api/ticket-overview] start', { weeks, brand });
    const snapshot =
      brand === 'all'
        ? await getAllBrandsAggregatedTicketOverview()
        : await getLatestTicketOverviewSnapshot(brand, weeks);

    if (!snapshot) {
      console.info('[api/ticket-overview] snapshot not found', { weeks, brand, durationMs: Date.now() - start });
      return NextResponse.json(
        {
          error: 'No precomputed ticket metrics found. Run sync job.',
        },
        { status: 404 },
      );
    }

    console.info('[api/ticket-overview] snapshot found', { weeks, brand, durationMs: Date.now() - start });
    return NextResponse.json({
      data: snapshot,
      lastCalculatedAt: (snapshot.calculated_at as string | undefined) ?? (snapshot.generated_at as string | undefined) ?? null,
    });
  } catch (error) {
    console.info('[api/ticket-overview] failed', { durationMs: Date.now() - start });
    const message = error instanceof Error ? error.message : 'Failed to fetch ticket overview cache';
    if (message.includes("Could not find the table 'public.ticket_overview_cache'")) {
      return NextResponse.json({ error: 'No precomputed ticket metrics found. Run sync job.' }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
