import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { KPIData } from './kpiCalculator';

export interface KPIUpsertInput extends KPIData {
  brand: string;
  weekStartDate: Date;
  weekEndDate: Date;
  weekLabel: string;
}

let cachedClient: SupabaseClient | null = null;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = getEnv('SUPABASE_URL');
  const supabaseKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  cachedClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'kpi-sync-service',
      },
    },
  });

  return cachedClient;
}

export async function upsertKPI(client: SupabaseClient, input: KPIUpsertInput): Promise<void> {
  const { data, error } = await client
    .from('kpis')
    .upsert(
      {
        brand: input.brand,
        week_start_date: input.weekStartDate.toISOString().split('T')[0],
        week_end_date: input.weekEndDate.toISOString().split('T')[0],
        week_label: input.weekLabel,
        tickets_in: input.ticketsIn,
        tickets_resolved: input.ticketsResolved,
        frt_median: input.frtMedian,
        aht: input.aht,
        fcr_percent: input.fcrPercent,
        frt_distribution: input.frtDistribution,
        fcr_breakdown: input.fcrBreakdown,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'brand,week_start_date,week_end_date',
      },
    )
    .select();

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }

  console.log('[SupabaseService] Upserted KPI record:', data);
}
