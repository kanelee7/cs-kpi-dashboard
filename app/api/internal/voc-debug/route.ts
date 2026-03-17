import { NextResponse } from 'next/server';
import { getLatestVocRows } from '../../../../services/precomputeCacheService';
import { normalizeBrandId } from '../../../../services/brandResolver';

export const runtime = 'nodejs';

function getExpectedToken(): string | null {
  return process.env.INTERNAL_SYNC_TOKEN ?? null;
}

function getProvidedToken(request: Request): string {
  const direct = request.headers.get('x-sync-token');
  if (direct) return direct;

  const auth = request.headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim();
  }
  return '';
}

function parseWeeks(value: string | null): number {
  const parsed = value ? Number(value) : 5;
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(Math.max(1, parsed), 10);
}

export async function GET(request: Request) {
  try {
    const expectedToken = getExpectedToken();
    const providedToken = getProvidedToken(request);
    if (!expectedToken || !providedToken || providedToken !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const weeks = parseWeeks(searchParams.get('weeks'));
    const brand = normalizeBrandId(searchParams.get('brand'));
    const rows = await getLatestVocRows(weeks, brand ?? undefined);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No VOC snapshots found.' }, { status: 404 });
    }

    const ticketsProcessed = rows.reduce((sum, row) => sum + Number(row.ticket_count ?? 0), 0);
    const sampleTicketIds = Array.from(
      new Set(
        rows
          .flatMap(row => (Array.isArray(row.ticket_summaries) ? row.ticket_summaries : []))
          .map(item => Number(item?.ticket_id))
          .filter(id => Number.isFinite(id)),
      ),
    ).slice(0, 5);

    return NextResponse.json({
      last_sync_status: 'success',
      last_sync_time: rows[0]?.generated_at ?? null,
      tickets_processed: ticketsProcessed,
      weeks_generated: rows.length,
      sample_ticket_ids: sampleTicketIds,
      brand: brand ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load VOC debug info';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
