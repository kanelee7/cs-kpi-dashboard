import { NextResponse } from 'next/server';
import { getLatestVocRows } from '../../../services/precomputeCacheService';
import { normalizeBrandId, SUPPORTED_BRANDS } from '../../../services/brandResolver';

function parseWeeks(value: string | null): number {
  const parsed = value ? Number(value) : 5;
  return Number.isFinite(parsed) ? Math.max(1, parsed) : 5;
}

function parseBoolean(value: string | null): boolean {
  if (!value) return false;
  return value === '1' || value.toLowerCase() === 'true';
}

export async function GET(request: Request) {
  const start = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const weeks = parseWeeks(searchParams.get('weeks'));
    const brand = normalizeBrandId(searchParams.get('brand'));
    const forceRefresh = parseBoolean(searchParams.get('forceRefresh'));
    if (!brand) {
      return NextResponse.json(
        { error: `brand parameter required. supported brands: all, ${SUPPORTED_BRANDS.join(', ')}` },
        { status: 400 },
      );
    }
    console.info('[api/voc] start', { weeks, brand, forceRefresh });

    if (forceRefresh) {
      const url = new URL('/api/internal/trigger-sync', request.url);
      await fetch(url, {
        method: 'POST',
        headers: {
          'x-sync-token': process.env.INTERNAL_SYNC_TOKEN ?? '',
        },
      });
    }

    const weeklyRows = await getLatestVocRows(weeks, brand === 'all' ? undefined : brand);

    if (weeklyRows.length === 0) {
      console.info('[api/voc] snapshot not found', { weeks, brand, durationMs: Date.now() - start });
      return NextResponse.json(
        {
          error: 'No precomputed VOC insights found. Run sync job.',
        },
        { status: 404 },
      );
    }

    console.info('[api/voc] snapshot found', { weeks, brand, durationMs: Date.now() - start });
    return NextResponse.json({
      data: weeklyRows,
      lastCalculatedAt: (weeklyRows[0]?.generated_at as string | undefined) ?? null,
    });
  } catch (error) {
    console.info('[api/voc] failed', { durationMs: Date.now() - start });
    const message = error instanceof Error ? error.message : 'Failed to generate VOC analysis';
    if (message.includes("Could not find the table 'public.voc_insights'")) {
      return NextResponse.json({ error: 'No precomputed VOC insights found. Run sync job.' }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
