import { ZendeskClient } from '../services/zendeskClient';
import { getSupabaseClient, upsertKPI } from '../services/supabaseService';
import { calculateKPIsForWeek } from '../services/kpiCalculator';
import { getWeekRange } from '../utils/dateUtils';

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
  console.log('Starting KPI sync process...');
  
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

    // 3. 최근 5주(현재 주 포함) KPI 계산 및 저장
    const HISTORY_WEEKS = 5;
    for (let offset = HISTORY_WEEKS - 1; offset >= 0; offset--) {
      const { start: weekStart, end: weekEnd } = getWeekRange(offset);
      console.log(`Calculating KPIs for week ${weekStart.toISOString()} to ${weekEnd.toISOString()}`);

      const kpiData = calculateKPIsForWeek(allTickets, weekStart, weekEnd);

      // 유의미한 데이터가 없는 주는 건너뜁니다.
      const hasMeaningfulData =
        kpiData.ticketsIn > 0 ||
        kpiData.ticketsResolved > 0 ||
        Object.values(kpiData.frtDistribution).some(value => value > 0) ||
        kpiData.fcrPercent > 0 ||
        kpiData.aht > 0;

      if (!hasMeaningfulData) {
        console.log('Skipping week with no meaningful data');
        continue;
      }

      console.log('Calculated KPIs:', {
        weekLabel: `Week of ${weekStart.toISOString().split('T')[0]}`,
        ticketsIn: kpiData.ticketsIn,
        ticketsResolved: kpiData.ticketsResolved,
        frtMedian: kpiData.frtMedian,
        aht: kpiData.aht,
        fcrPercent: kpiData.fcrPercent,
      });

      console.log('Saving to Supabase...');
      await upsertKPI(supabaseClient, {
        ...kpiData,
        brand: 'default',
        weekStartDate: weekStart,
        weekEndDate: weekEnd,
        weekLabel: `Week of ${weekStart.toISOString().split('T')[0]}`,
      });
    }

    console.log('KPI sync completed successfully');
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
