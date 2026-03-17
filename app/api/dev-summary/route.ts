import { NextResponse } from 'next/server';
import { getCachedOpenTicketDevSummaries, syncOpenTicketDevSummaries } from '../../../services/devSummaryService';

function parseBoolean(value: string | null): boolean {
  if (!value) return false;
  return value === '1' || value.toLowerCase() === 'true';
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const brand = searchParams.get('brand') || undefined;
    const forceRefresh = parseBoolean(searchParams.get('forceRefresh'));
    const limit = limitParam ? Number(limitParam) : undefined;

    const safeLimit = Number.isFinite(limit) ? limit : undefined;
    const rows = forceRefresh
      ? await syncOpenTicketDevSummaries({ limit: safeLimit, forceRefresh: true })
      : await getCachedOpenTicketDevSummaries({ limit: safeLimit, brand });

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No precomputed dev summaries found. Run sync job.' }, { status: 404 });
    }

    return NextResponse.json({
      count: rows.length,
      source: forceRefresh ? 'regenerated' : 'cache',
      items: rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate developer summaries';
    if (message.includes("Could not find the table 'public.dev_summary_cache'")) {
      return NextResponse.json({ error: 'No precomputed dev summaries found. Run sync job.' }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
