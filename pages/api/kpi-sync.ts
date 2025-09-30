import type { NextApiRequest, NextApiResponse } from 'next';
import { ZendeskClient, type ZendeskTicket } from '../../services/zendeskClient';
import { calculateKPIsForWeek } from '../../services/kpiCalculator';
import { getWeekRange, getZendeskWeekNumber } from '../../utils/dateUtils';
import { getSupabaseClient, upsertKPI } from '../../services/supabaseService';

const BRANDS = ['all', 'brand-a', 'brand-b', 'brand-c', 'brand-d', 'brand-e'];

function filterTicketsByBrand(tickets: ZendeskTicket[], brand: string): ZendeskTicket[] {
  console.log(`[kpi-sync] Filtering tickets for brand ${brand}. Currently returning all tickets.`);
  return tickets;
}

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

    const zendeskClient = new ZendeskClient({ subdomain, email, apiToken });
    const allTickets = await zendeskClient.getAllTickets();

    const supabaseClient = getSupabaseClient();

    const results = [] as Array<{ brand: string; weeks: Array<{ week: number; success: boolean; error?: string }> }>;

    for (const brand of BRANDS) {
      const filteredTickets = filterTicketsByBrand(allTickets, brand);
      const brandResult = { brand, weeks: [] as Array<{ week: number; success: boolean; error?: string }> };

      for (let weekOffset = 1; weekOffset <= 5; weekOffset++) {
        const { start, end } = getWeekRange(weekOffset);
        const weekNumber = getZendeskWeekNumber(start);
        const weekLabel = `Week ${weekNumber}`;

        try {
          const kpiData = calculateKPIsForWeek(filteredTickets, start, end);
          await upsertKPI(supabaseClient, {
            ...kpiData,
            brand,
            weekStartDate: start,
            weekEndDate: end,
            weekLabel,
          });

          brandResult.weeks.push({ week: weekNumber, success: true });
        } catch (error) {
          console.error(`[kpi-sync] Failed to process brand ${brand} week ${weekNumber}:`, error);
          brandResult.weeks.push({ week: weekNumber, success: false, error: error instanceof Error ? error.message : String(error) });
        }
      }

      results.push(brandResult);
    }

    return res.status(200).json({ message: 'KPI sync completed', totalTickets: allTickets.length, results });
  } catch (error) {
    console.error('[kpi-sync] Sync job failed:', error);
    return res.status(500).json({ error: 'Sync job failed', details: error instanceof Error ? error.message : String(error) });
  }
}
