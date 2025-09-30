import { ZendeskClient } from '../services/zendeskClient';
import { getSupabaseClient, upsertKPI } from '../services/supabaseService';
import { calculateKPIs } from '../services/kpiCalculator';
import { getDateRange } from '../utils/dateUtils';

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

    // 2. 날짜 범위 설정 (지난 주 데이터 가져오기)
    const today = new Date();
    const { start: weekStart, end: weekEnd } = getDateRange(today, 'week');
    console.log(`Fetching data for week: ${weekStart.toISOString()} to ${weekEnd.toISOString()}`);

    // 3. Zendesk에서 티켓 데이터 가져오기 (지난 30일 데이터를 가져와서 필터링)
    console.log('Fetching tickets from Zendesk...');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const allTickets = await zendeskClient.getAllTickets(thirtyDaysAgo.toISOString());
    
    // 주간 티켓 필터링
    const tickets = allTickets.filter(ticket => {
      const createdAt = new Date(ticket.created_at);
      return createdAt >= weekStart && createdAt <= weekEnd;
    });
    console.log(`Fetched ${tickets.length} tickets`);

    if (tickets.length === 0) {
      console.log('No tickets found for the specified date range');
      return;
    }

    // 4. KPI 계산
    console.log('Calculating KPIs...');
    const kpiData = calculateKPIs(tickets, today);
    
    // 5. 결과 출력 (디버깅용)
    console.log('Calculated KPIs:', {
      ticketsIn: kpiData.ticketsIn,
      ticketsResolved: kpiData.ticketsResolved,
      frtMedian: kpiData.frtMedian,
      aht: kpiData.aht,
      fcrPercent: kpiData.fcrPercent,
    });

    // 6. Supabase에 저장
    console.log('Saving to Supabase...');
    await upsertKPI(supabaseClient, {
      ...kpiData,
      brand: 'default', // 브랜드 정보가 필요한 경우 수정
      weekStartDate: weekStart,
      weekEndDate: weekEnd,
      weekLabel: `Week of ${weekStart.toISOString().split('T')[0]}`,
    });

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
