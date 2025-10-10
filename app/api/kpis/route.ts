import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Zendesk 주차 번호 계산 (일요일 기준)
function getZendeskWeekNumber(date: Date): number {
  const year = date.getUTCFullYear()
  const startOfYear = new Date(Date.UTC(year, 0, 1, 15, 0, 0)) // 1월 1일 KST 00:00
  
  // 1월 1일이 일요일이 아닌 경우, 첫 번째 일요일을 찾음
  const firstSunday = new Date(startOfYear)
  const dayOfWeek = startOfYear.getUTCDay()
  if (dayOfWeek !== 0) {
    firstSunday.setUTCDate(startOfYear.getUTCDate() + (7 - dayOfWeek))
  }
  
  const diffTime = date.getTime() - firstSunday.getTime()
  const diffWeeks = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000))
  
  return Math.max(1, diffWeeks + 1) // 최소 1주차
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const brand = searchParams.get('brand') || 'all'

  try {
    console.log(`Fetching KPI data for brand: ${brand}`)

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      console.log('Supabase credentials not configured, returning sample data')
      return NextResponse.json(getSampleData(brand))
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

          // Query the latest 5 weeks of KPI data for the specified brand
          const { data: kpiRecords, error } = await supabase
            .from('kpis')
            .select('*')
            .eq('brand', brand)
            .order('week_start_date', { ascending: true })
            .limit(5)

    if (error) {
      console.error('Error fetching KPI data from Supabase:', error)
      return NextResponse.json(getSampleData(brand))
    }

    if (!kpiRecords || kpiRecords.length === 0) {
      console.log(`No KPI data found for brand: ${brand}, returning sample data`)
      return NextResponse.json(getSampleData(brand))
    }

    // Use the latest week's data for main KPIs
    const latestRecord = kpiRecords[kpiRecords.length - 1]

    // Extract weekly data in correct order (oldest to newest)
    const weeklyTicketsIn = kpiRecords.map(record => record.tickets_in)
    const weeklyTicketsResolved = kpiRecords.map(record => record.tickets_resolved)
    const weeklyFrt = kpiRecords.map(record => record.frt_median)
    const weeklyAht = kpiRecords.map(record => record.aht)
    const weeklyFcr = kpiRecords.map(record => record.fcr_percent)
    
    // Use stored week labels from database
    const weeklyLabels = kpiRecords.map(record => record.week_label)

    // Transform Supabase data to match the expected API response format
    const response = {
      ticketsIn: latestRecord.tickets_in,
      ticketsResolved: latestRecord.tickets_resolved,
      frtMedian: latestRecord.frt_median,
      aht: latestRecord.aht,
      fcrPercent: latestRecord.fcr_percent,
      frtDistribution: latestRecord.frt_distribution,
      fcrBreakdown: latestRecord.fcr_breakdown,
      // Use actual weekly data
      weeklyTicketsIn,
      weeklyTicketsResolved,
      weeklyLabels,
      trends: {
        frt: weeklyFrt,
        aht: weeklyAht,
        fcr: weeklyFcr,
        csat: [4.0, 4.1, 3.9, 4.2, 4.2] // Default CSAT values
      },
      csatAverage: 4.2, // Default CSAT value
      avgHandleTime: latestRecord.aht,
      fcrRate: latestRecord.fcr_percent
    }

    console.log(`Successfully fetched KPI data for brand: ${brand}`)
    return NextResponse.json(response)

  } catch (error) {
    console.error('Error fetching KPI data:', error)
    return NextResponse.json(getSampleData(brand))
  }
}

function getSampleData(brand: string) {
  const brandData = {
    'all': {
      ticketsIn: 1247,
      ticketsResolved: 1189,
      frtMedian: 2.4,
      aht: 18.5,
      fcrPercent: 78.2,
      frtDistribution: {
        "0-1h": 45,
        "1-8h": 35,
        "8-24h": 15,
        ">24h": 4,
        "No Reply": 1
      },
      fcrBreakdown: {
        oneTouch: 892,
        twoTouch: 178,
        reopened: 119
      }
    },
    'brand-a': {
      ticketsIn: 312,
      ticketsResolved: 298,
      frtMedian: 2.1,
      aht: 16.8,
      fcrPercent: 82.1,
      frtDistribution: {
        "0-1h": 12,
        "1-8h": 8,
        "8-24h": 3,
        ">24h": 1,
        "No Reply": 0
      },
      fcrBreakdown: {
        oneTouch: 245,
        twoTouch: 45,
        reopened: 8
      }
    },
    'brand-b': {
      ticketsIn: 289,
      ticketsResolved: 275,
      frtMedian: 2.6,
      aht: 19.2,
      fcrPercent: 75.8,
      frtDistribution: {
        "0-1h": 10,
        "1-8h": 9,
        "8-24h": 4,
        ">24h": 1,
        "No Reply": 0
      },
      fcrBreakdown: {
        oneTouch: 208,
        twoTouch: 52,
        reopened: 15
      }
    },
    'brand-c': {
      ticketsIn: 267,
      ticketsResolved: 254,
      frtMedian: 2.8,
      aht: 20.1,
      fcrPercent: 73.5,
      frtDistribution: {
        "0-1h": 9,
        "1-8h": 8,
        "8-24h": 3,
        ">24h": 1,
        "No Reply": 1
      },
      fcrBreakdown: {
        oneTouch: 187,
        twoTouch: 55,
        reopened: 12
      }
    },
    'brand-d': {
      ticketsIn: 201,
      ticketsResolved: 192,
      frtMedian: 2.3,
      aht: 17.9,
      fcrPercent: 79.8,
      frtDistribution: {
        "0-1h": 7,
        "1-8h": 6,
        "8-24h": 2,
        ">24h": 1,
        "No Reply": 0
      },
      fcrBreakdown: {
        oneTouch: 153,
        twoTouch: 32,
        reopened: 7
      }
    },
    'brand-e': {
      ticketsIn: 178,
      ticketsResolved: 170,
      frtMedian: 2.5,
      aht: 18.7,
      fcrPercent: 76.4,
      frtDistribution: {
        "0-1h": 6,
        "1-8h": 5,
        "8-24h": 2,
        ">24h": 1,
        "No Reply": 0
      },
      fcrBreakdown: {
        oneTouch: 130,
        twoTouch: 35,
        reopened: 5
      }
    }
  }

  const data = brandData[brand as keyof typeof brandData] || brandData['all']

  return {
    ...data,
    weeklyTicketsIn: [980, 1120, 1050, 1180, data.ticketsIn],
    weeklyTicketsResolved: [950, 1080, 1020, 1150, data.ticketsResolved],
    trends: {
      frt: [2.1, 2.3, 2.2, 2.5, data.frtMedian],
      aht: [16.8, 17.2, 17.8, 18.1, data.aht],
      fcr: [75.2, 76.8, 77.1, 77.9, data.fcrPercent],
      csat: [4.1, 4.2, 4.0, 4.3, 4.2]
    },
    csatAverage: 4.2,
    avgHandleTime: data.aht,
    fcrRate: data.fcrPercent
  }
}