import { NextResponse } from 'next/server'

export async function GET() {
  try {
    // Check if Supabase is configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL_2
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_2

    if (!supabaseUrl || !supabaseAnonKey) {
      // Return sample data if Supabase is not configured
      return NextResponse.json(getSampleData())
    }

    // Import Supabase dynamically only if environment variables are set
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    // Fetch all tickets from the last 7 days
    const { data: tickets, error: ticketsError } = await supabase
      .from('tickets')
      .select('*')
      .gte('created_at', sevenDaysAgo.toISOString())

    if (ticketsError) {
      throw ticketsError
    }

    // Fetch CSAT feedback from the last 7 days
    const { data: csatData, error: csatError } = await supabase
      .from('csat_feedback')
      .select('*')
      .gte('created_at', sevenDaysAgo.toISOString())

    if (csatError) {
      throw csatError
    }

    // Calculate KPIs
    const totalTickets = tickets?.length || 0
    const resolvedTickets = tickets?.filter((t: any) => t.resolved_at) || []
    const firstContactResolved = tickets?.filter((t: any) => t.first_contact_resolved) || []
    
    // Weekly tickets trend (last 5 weeks)
    const weeklyTickets = await getWeeklyTicketsTrend(supabase)
    
    // FRT Median
    const frtValues = tickets
      ?.filter((t: any) => t.first_response_time)
      .map((t: any) => t.first_response_time!) || []
    const frtMedian = frtValues.length > 0 
      ? frtValues.sort((a, b) => a - b)[Math.floor(frtValues.length / 2)]
      : 0

    // Average Handle Time (resolution time)
    const resolutionTimes = resolvedTickets
      .filter((t: any) => t.resolved_at)
      .map((t: any) => {
        const created = new Date(t.created_at)
        const resolved = new Date(t.resolved_at!)
        return (resolved.getTime() - created.getTime()) / (1000 * 60) // minutes
      })
    const avgHandleTime = resolutionTimes.length > 0
      ? resolutionTimes.reduce((a: number, b: number) => a + b, 0) / resolutionTimes.length
      : 0

    // FCR Rate
    const fcrRate = totalTickets > 0 ? (firstContactResolved.length / totalTickets) * 100 : 0

    // CSAT Average
    const csatAverage = csatData && csatData.length > 0
      ? csatData.reduce((sum: number, item: any) => sum + item.rating, 0) / csatData.length
      : 0

    // Weekly trends for charts
    const frtTrend = await getWeeklyTrend(supabase, 'first_response_time')
    const ahtTrend = await getWeeklyTrend(supabase, 'resolution_time')
    const fcrTrend = await getWeeklyTrend(supabase, 'fcr_rate')
    const csatTrend = await getWeeklyTrend(supabase, 'csat_rating')

    const kpis = {
      weeklyTicketsIn: weeklyTickets.in,
      weeklyTicketsResolved: weeklyTickets.resolved,
      frtMedian: frtMedian,
      avgHandleTime: avgHandleTime,
      fcrRate: fcrRate,
      csatAverage: csatAverage,
      trends: {
        frt: frtTrend,
        aht: ahtTrend,
        fcr: fcrTrend,
        csat: csatTrend
      }
    }

    return NextResponse.json(kpis)
  } catch (error) {
    console.error('Error fetching KPIs:', error)
    return NextResponse.json({ error: 'Failed to fetch KPIs' }, { status: 500 })
  }
}

async function getWeeklyTicketsTrend(supabase: any) {
  const weeks = []
  for (let i = 4; i >= 0; i--) {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - (i * 7))
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + 6)

    const { data: tickets } = await supabase
      .from('tickets')
      .select('created_at, resolved_at')
      .gte('created_at', startDate.toISOString())
      .lt('created_at', endDate.toISOString())

    const inCount = tickets?.length || 0
    const resolvedCount = tickets?.filter((t: any) => t.resolved_at)?.length || 0

    weeks.push({ in: inCount, resolved: resolvedCount })
  }

  return {
    in: weeks.map(w => w.in),
    resolved: weeks.map(w => w.resolved)
  }
}

async function getWeeklyTrend(supabase: any, metric: string) {
  const weeks = []
  for (let i = 4; i >= 0; i--) {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - (i * 7))
    const endDate = new Date(startDate)
    endDate.setDate(endDate.getDate() + 6)

    let value = 0

    switch (metric) {
      case 'first_response_time':
        const { data: frtTickets } = await supabase
          .from('tickets')
          .select('first_response_time')
          .gte('created_at', startDate.toISOString())
          .lt('created_at', endDate.toISOString())
          .not('first_response_time', 'is', null)

        if (frtTickets && frtTickets.length > 0) {
          const values = frtTickets.map((t: any) => t.first_response_time!).sort((a, b) => a - b)
          value = values[Math.floor(values.length / 2)]
        }
        break

      case 'resolution_time':
        const { data: resTickets } = await supabase
          .from('tickets')
          .select('created_at, resolved_at')
          .gte('created_at', startDate.toISOString())
          .lt('created_at', endDate.toISOString())
          .not('resolved_at', 'is', null)

        if (resTickets && resTickets.length > 0) {
          const times = resTickets.map((t: any) => {
            const created = new Date(t.created_at)
            const resolved = new Date(t.resolved_at!)
            return (resolved.getTime() - created.getTime()) / (1000 * 60) // minutes
          })
          value = times.reduce((a: number, b: number) => a + b, 0) / times.length
        }
        break

      case 'fcr_rate':
        const { data: fcrTickets } = await supabase
          .from('tickets')
          .select('first_contact_resolved')
          .gte('created_at', startDate.toISOString())
          .lt('created_at', endDate.toISOString())

        if (fcrTickets && fcrTickets.length > 0) {
          const resolved = fcrTickets.filter((t: any) => t.first_contact_resolved).length
          value = (resolved / fcrTickets.length) * 100
        }
        break

      case 'csat_rating':
        const { data: csatData } = await supabase
          .from('csat_feedback')
          .select('rating')
          .gte('created_at', startDate.toISOString())
          .lt('created_at', endDate.toISOString())

        if (csatData && csatData.length > 0) {
          value = csatData.reduce((sum: number, item: any) => sum + item.rating, 0) / csatData.length
        }
        break
    }

    weeks.push(value)
  }

  return weeks
}

// Sample data for when Supabase is not configured
function getSampleData() {
  return {
    weeklyTicketsIn: [980, 1120, 1050, 1180, 1247],
    weeklyTicketsResolved: [950, 1080, 1020, 1150, 1189],
    frtMedian: 2.4,
    avgHandleTime: 18.5,
    fcrRate: 78.2,
    csatAverage: 4.2,
    trends: {
      frt: [3.2, 2.8, 3.1, 2.7, 2.4],
      aht: [22.1, 20.8, 21.3, 19.2, 18.5],
      fcr: [72.5, 75.1, 74.8, 76.9, 78.2],
      csat: [4.0, 4.1, 4.0, 4.2, 4.2]
    }
  }
}
