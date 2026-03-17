import { ZendeskClient } from '../services/zendeskClient';
import { getSupabaseClient, upsertKPI } from '../services/supabaseService';
import { calculateKPIsForWeek } from '../services/kpiCalculator';
import { getWeekRange } from '../utils/dateUtils';
import { groupTicketsByBrand, SUPPORTED_BRANDS } from '../services/brandResolver';

// 환경 변수 확인
const requiredEnvVars = [
  'ZENDESK_EMAIL',
  'ZENDESK_API_TOKEN',
  'ZENDESK_SUBDOMAIN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: ${envVar} environment variable is not set`);
    process.exit(1);
  }
}

async function main() {
  console.log('Starting KPI sync process with brand resolution...');

  try {
    // 1. 클라이언트 초기화
    const zendeskClient = new ZendeskClient({
      subdomain: process.env.ZENDESK_SUBDOMAIN!,
      email: process.env.ZENDESK_EMAIL!,
      apiToken: process.env.ZENDESK_API_TOKEN!,
    });

    const supabaseClient = getSupabaseClient();

    // 2. Zendesk에서 티켓 데이터 가져오기 (최근 60일)
    console.log('Fetching tickets from Zendesk...');
    const lookbackStart = new Date();
    lookbackStart.setDate(lookbackStart.getDate() - 60);
    const allTickets = await zendeskClient.getAllTickets(lookbackStart.toISOString());
    console.log(`Fetched ${allTickets.length} tickets in lookback window`);

    if (allTickets.length === 0) {
      console.log('No tickets fetched from Zendesk; aborting sync.');
      return;
    }

    // 3. 브랜별로 티켓 그룹화
    console.log('Grouping tickets by brand...');
    const ticketsByBrand = groupTicketsByBrand(allTickets);
    console.log(`Grouped into ${ticketsByBrand.size} brands (including unknown)`);

    // 4. 최근 5개의 완료된 주에 대한 KPI 계산 및 저장 (현재 주 제외)
    const HISTORY_WEEKS = 5;
    const brandsToSync = [...SUPPORTED_BRANDS];

    for (let offset = 1; offset <= HISTORY_WEEKS; offset++) {
      const { start: weekStart, end: weekEnd } = getWeekRange(offset);
      const weekLabel = `Week of ${weekStart.toISOString().split('T')[0]}`;
      console.log(`--- Processing week ${weekStart.toISOString()} ---`);

      for (const brand of brandsToSync) {
        const brandTickets = ticketsByBrand.get(brand) ?? [];
        console.log(`Calculating KPIs for brand: ${brand} (${brandTickets.length} tickets found)`);

        const kpiData = calculateKPIsForWeek(brandTickets, weekStart, weekEnd);

        // 유의미한 데이터가 없는 주/브랜드는 건너뜁니다 (티켓 양이 아예 없을수도 있으므로)
        const hasMeaningfulData =
          kpiData.ticketsIn > 0 ||
          kpiData.ticketsResolved > 0;

        if (!hasMeaningfulData && brandTickets.length === 0) {
          console.log(`Skipping brand ${brand} for this week - no data.`);
          continue;
        }

        console.log(`Brand ${brand} stats: In=${kpiData.ticketsIn}, Res=${kpiData.ticketsResolved}`);

        await upsertKPI(supabaseClient, {
          ...kpiData,
          brand: brand,
          weekStartDate: weekStart,
          weekEndDate: weekEnd,
          weekLabel: weekLabel,
        });
      }
    }

    console.log('KPI sync completed successfully for all brands');
  } catch (error) {
    console.error('Error during KPI sync:', error);
    process.exit(1);
  }
}

// 실행
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
