import type { NextApiRequest, NextApiResponse } from 'next';
import { ZendeskClient } from '../../services/zendeskClient';
import { calculateKPIsForWeek } from '../../services/kpiCalculator';
import { getWeekRange, getZendeskWeekNumber } from '../../utils/dateUtils';
import { getSupabaseClient, upsertKPI } from '../../services/supabaseService';
import { groupTicketsByBrand } from '../../services/brandResolver';

const HISTORY_WEEKS = 5;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const subdomain = process.env.ZENDESK_SUBDOMAIN;
    const email = process.env.ZENDESK_EMAIL;
    const apiToken = process.env.ZENDESK_API_TOKEN;

    if (!subdomain || !email || !apiToken) {
      return res.status(500).json({ error: 'Zendesk credentials are not configured' });
    }

    console.log('[kpi-sync] Fetching tickets from Zendesk...');
    const zendeskClient = new ZendeskClient({ subdomain, email, apiToken });

    const lookbackStart = new Date();
    lookbackStart.setDate(lookbackStart.getDate() - 60);
    const allTickets = await zendeskClient.getAllTickets(lookbackStart.toISOString());
    console.log(`[kpi-sync] Fetched ${allTickets.length} tickets`);

    if (allTickets.length === 0) {
      return res.status(200).json({ message: 'No tickets found', totalTickets: 0, results: [] });
    }

    const supabaseClient = getSupabaseClient();
    const groupedByBrand = groupTicketsByBrand(allTickets);
    console.log(`[kpi-sync] Brand groups: ${Array.from(groupedByBrand.keys()).join(', ')}`);

    const results: Array<{ brand: string; weeks: Array<{ week: number; success: boolean; error?: string }> }> = [];

    for (const [brand, brandTickets] of Array.from(groupedByBrand.entries())) {
      const brandResult: { brand: string; weeks: Array<{ week: number; success: boolean; error?: string }> } = {
        brand,
        weeks: [],
      };

      for (let offset = HISTORY_WEEKS; offset >= 1; offset--) {
        const { start: weekStart, end: weekEnd } = getWeekRange(offset);
        const weekNumber = getZendeskWeekNumber(weekStart);
        const weekLabel = `Week ${weekNumber}`;

        try {
          const kpiData = calculateKPIsForWeek(brandTickets, weekStart, weekEnd);
          await upsertKPI(supabaseClient, {
            ...kpiData,
            brand,
            weekStartDate: weekStart,
            weekEndDate: weekEnd,
            weekLabel,
          });

          console.log(`[kpi-sync] brand=${brand} week=${weekNumber} upserted to Supabase`);
          brandResult.weeks.push({ week: weekNumber, success: true });
        } catch (error) {
          console.error(`[kpi-sync] Failed brand=${brand} week=${weekNumber}:`, error);
          brandResult.weeks.push({
            week: weekNumber,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      results.push(brandResult);
    }

    return res.status(200).json({
      message: 'KPI sync completed',
      totalTickets: allTickets.length,
      brandsProcessed: results.length,
      results,
    });
  } catch (error) {
    console.error('[kpi-sync] Sync job failed:', error);
    return res.status(500).json({
      error: 'Sync job failed',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
