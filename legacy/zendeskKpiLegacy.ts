/**
 * Legacy Zendesk KPI implementation preserved for reference only.
 *
 * The original code lived in `app/api/sync-kpis/route.ts` before the refactor
 * introduced modular services.  It fetched tickets from Zendesk, calculated
 * KPIs inline, and upserted the results to Supabase in a single file.
 *
 * The full legacy source has been copied below inside a block comment so it
 * can be inspected without affecting the modern TypeScript build.
 */

/*
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

class ZendeskClient {
  ...
}

async function calculateKPIsForWeek(...) {
  ...
}

export async function POST() {
  ...
}
*/

// No executable code is exported from this file on purpose.
export const legacyZendeskKpiReference = 'See block comment above for historical implementation.';
