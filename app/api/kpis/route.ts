import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getZendeskWeekNumber } from '../../../utils/dateUtils'

type FRTDistribution = Record<'0-1h' | '1-8h' | '8-24h' | '>24h' | 'No Reply', number>

type FCRBreakdown = {
  oneTouch: number
  twoTouch: number
  reopened: number
}

const EMPTY_FRT_DISTRIBUTION: FRTDistribution = {
  '0-1h': 0,
  '1-8h': 0,
  '8-24h': 0,
  '>24h': 0,
  'No Reply': 0
}

const EMPTY_FCR_BREAKDOWN: FCRBreakdown = {
  oneTouch: 0,
  twoTouch: 0,
  reopened: 0
}

function createEmptyDistribution(): FRTDistribution {
  return { ...EMPTY_FRT_DISTRIBUTION }
}

function cloneDistribution(distribution: FRTDistribution): FRTDistribution {
  return { ...distribution }
}

function cloneBreakdown(breakdown: FCRBreakdown): FCRBreakdown {
  return { ...breakdown }
}

function formatWeekRange(startDateString: string, endDateString: string): string {
  const start = new Date(startDateString)
  const end = new Date(endDateString)

  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Seoul'
  })

  return `${formatter.format(start)} – ${formatter.format(end)}`
}

type KPIRecord = {
  brand: string
  week_start_date: string
  week_end_date: string
  week_label: string
  tickets_in: number
  tickets_resolved: number
  frt_median: number
  aht: number
  fcr_percent: number
  frt_distribution: FRTDistribution | null
  fcr_breakdown: FCRBreakdown | null
}

function normalizeRecords(records: KPIRecord[], brand: string): KPIRecord[] {
  const parsed = [...records].map(record => ({
    ...record,
    frt_distribution: record.frt_distribution ? cloneDistribution(record.frt_distribution) : createEmptyDistribution(),
    fcr_breakdown: record.fcr_breakdown ? cloneBreakdown(record.fcr_breakdown) : { ...EMPTY_FCR_BREAKDOWN }
  }))

  if (brand !== 'all') {
    return parsed
      .sort((a, b) => new Date(a.week_start_date).getTime() - new Date(b.week_start_date).getTime())
      .slice(-5)
  }

  const aggregateMap = new Map<string, {
    week_start_date: string
    week_end_date: string
    week_label: string
    tickets_in: number
    tickets_resolved: number
    frtValues: number[]
    ahtValues: number[]
    fcrValues: number[]
    frt_distribution: FRTDistribution
    fcr_breakdown: FCRBreakdown
  }>()

  parsed.forEach((record: KPIRecord) => {
    const key = record.week_start_date
    if (!aggregateMap.has(key)) {
      aggregateMap.set(key, {
        week_start_date: record.week_start_date,
        week_end_date: record.week_end_date,
        week_label: record.week_label,
        tickets_in: 0,
        tickets_resolved: 0,
        frtValues: [],
        ahtValues: [],
        fcrValues: [],
        frt_distribution: createEmptyDistribution(),
        fcr_breakdown: { ...EMPTY_FCR_BREAKDOWN }
      })
    }

    const bucket = aggregateMap.get(key)!
    bucket.tickets_in += record.tickets_in || 0
    bucket.tickets_resolved += record.tickets_resolved || 0
    if (typeof record.frt_median === 'number') bucket.frtValues.push(record.frt_median)
    if (typeof record.aht === 'number') bucket.ahtValues.push(record.aht)
    if (typeof record.fcr_percent === 'number') bucket.fcrValues.push(record.fcr_percent)

    if (record.frt_distribution) {
      for (const [label, value] of Object.entries(record.frt_distribution)) {
        const numericValue = typeof value === 'number' ? value : Number(value ?? 0)
        if (label in bucket.frt_distribution) {
          bucket.frt_distribution[label as keyof FRTDistribution] += numericValue
        }
      }
    }

    if (record.fcr_breakdown) {
      for (const [label, value] of Object.entries(record.fcr_breakdown)) {
        const numericValue = typeof value === 'number' ? value : Number(value ?? 0)
        if (label in bucket.fcr_breakdown) {
          bucket.fcr_breakdown[label as keyof FCRBreakdown] += numericValue
        }
      }
    }
  })

  const aggregated = Array.from(aggregateMap.values())
    .map(bucket => ({
      brand: 'all',
      week_start_date: bucket.week_start_date,
      week_end_date: bucket.week_end_date,
      week_label: bucket.week_label,
      tickets_in: bucket.tickets_in,
      tickets_resolved: bucket.tickets_resolved,
      frt_median: average(bucket.frtValues),
      aht: average(bucket.ahtValues),
      fcr_percent: average(bucket.fcrValues),
      frt_distribution: cloneDistribution(bucket.frt_distribution),
      fcr_breakdown: cloneBreakdown(bucket.fcr_breakdown)
    }))
    .sort((a, b) => new Date(a.week_start_date).getTime() - new Date(b.week_start_date).getTime())
    .slice(-5)

  return aggregated
}

function average(values: number[]): number {
  if (!values.length) return 0
  const sum = values.reduce((acc, value) => acc + value, 0)
  return Number((sum / values.length).toFixed(2))
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

    // Query the latest KPI data (grab enough rows to cover multiple brands per week)
    let query = supabase
      .from('kpis')
      .select('*')
      .order('week_start_date', { ascending: false })
      .limit(50)

    if (brand !== 'all') {
      query = query.eq('brand', brand)
    }

    const { data: kpiRecords, error } = await query

    if (error) {
      console.error('Error fetching KPI data from Supabase:', error)
      return NextResponse.json(getSampleData(brand))
    }

    if (!kpiRecords || kpiRecords.length === 0) {
      console.log(`No KPI data found for brand: ${brand}, returning sample data`)
      return NextResponse.json(getSampleData(brand))
    }

    const normalizedRecords = normalizeRecords(kpiRecords, brand)

    if (normalizedRecords.length === 0) {
      console.log(`KPI data normalization returned empty result for brand: ${brand}`)
      return NextResponse.json(getSampleData(brand))
    }

    const weeklyWeekNumbers = normalizedRecords.map(record =>
      getZendeskWeekNumber(new Date(record.week_start_date))
    )
    const weeklyLabels = weeklyWeekNumbers.map(weekNumber => `Week ${weekNumber}`)
    const weeklyRanges = normalizedRecords.map(record =>
      formatWeekRange(record.week_start_date, record.week_end_date)
    )

    const latestRecord = normalizedRecords[normalizedRecords.length - 1]

    const weeklyTicketsIn = normalizedRecords.map((record: KPIRecord) => record.tickets_in)
    const weeklyTicketsResolved = normalizedRecords.map((record: KPIRecord) => record.tickets_resolved)
    const weeklyFrt = normalizedRecords.map((record: KPIRecord) => record.frt_median)
    const weeklyAht = normalizedRecords.map((record: KPIRecord) => record.aht)
    const weeklyFcr = normalizedRecords.map((record: KPIRecord) => record.fcr_percent)

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
      weeklyRanges,
      trends: {
        frt: weeklyFrt,
        aht: weeklyAht,
        fcr: weeklyFcr,
        csat: [4.0, 4.1, 3.9, 4.2, 4.2] // Default CSAT values
      },
      latestWeekLabel: weeklyLabels[weeklyLabels.length - 1],
      latestWeekRange: weeklyRanges[weeklyRanges.length - 1],
      latestWeekStartDate: latestRecord.week_start_date,
      latestWeekEndDate: latestRecord.week_end_date,
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