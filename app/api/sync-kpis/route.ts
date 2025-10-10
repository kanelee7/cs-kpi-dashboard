import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Zendesk API client
class ZendeskClient {
  private subdomain: string
  private email: string
  private apiToken: string
  private baseUrl: string

  constructor(subdomain: string, email: string, apiToken: string) {
    this.subdomain = subdomain
    this.email = email
    this.apiToken = apiToken
    this.baseUrl = `https://${subdomain}.zendesk.com/api/v2`
  }

  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.email}/token:${this.apiToken}`).toString('base64')
    return `Basic ${credentials}`
  }

  async getAllTickets(): Promise<ZendeskTicket[]> {
    const allTickets: ZendeskTicket[] = []
    
    // Get tickets from the last 6 months to ensure we have recent data
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    const startDate = sixMonthsAgo.toISOString().split('T')[0] // YYYY-MM-DD format
    
    let url = `${this.baseUrl}/tickets.json?include=organizations&per_page=100&created_after=${startDate}`
    let page = 1

    console.log(`Fetching tickets created after ${startDate}`)

    while (url) {
      try {
        console.log(`Fetching page ${page}...`)
        const response = await fetch(url, {
          headers: {
            'Authorization': this.getAuthHeader(),
            'Content-Type': 'application/json'
          }
        })

        if (!response.ok) {
          throw new Error(`Zendesk API error: ${response.status} ${response.statusText}`)
        }

        const data = await response.json()
        const tickets = data.tickets || []
        
        // Add solved_at field by checking ticket status and updated_at
        const ticketsWithSolvedAt = tickets.map((ticket: ZendeskTicket) => {
          let solvedAt = null
          
          // If ticket is solved or closed, use updated_at as solved_at
          if (ticket.status === 'solved' || ticket.status === 'closed') {
            solvedAt = ticket.updated_at
          }
          
          return {
            ...ticket,
            solved_at: solvedAt
          }
        })
        
        allTickets.push(...ticketsWithSolvedAt)

        console.log(`Found ${tickets.length} tickets on page ${page}`)

        // Show sample ticket data for debugging
        if (tickets.length > 0) {
          const sampleTicket = ticketsWithSolvedAt[0]
          console.log(`Sample ticket:`, {
            id: sampleTicket.id,
            status: sampleTicket.status,
            created_at: sampleTicket.created_at,
            updated_at: sampleTicket.updated_at,
            solved_at: sampleTicket.solved_at
          })
        }

        // Rate limiting
        if (page % 10 === 0) {
          console.log('Rate limiting: waiting 1 second...')
          await new Promise(resolve => setTimeout(resolve, 1000))
        }

        url = data.next_page
        page++

        if (page > 50) { // Safety limit
          console.log('Reached page limit, stopping...')
          break
        }
      } catch (error) {
        console.error(`Error fetching page ${page}:`, error)
        break
      }
    }

    console.log(`Total tickets fetched: ${allTickets.length}`)
    
    // Show date range of fetched tickets
    if (allTickets.length > 0) {
      const dates = allTickets.map(t => new Date(t.created_at)).sort()
      console.log(`Ticket date range: ${dates[0].toISOString()} to ${dates[dates.length - 1].toISOString()}`)
    }
    
    return allTickets
  }

  async getTicketMetrics(ticketId: number): Promise<number | null> {
    try {
      const response = await fetch(`${this.baseUrl}/tickets/${ticketId}/metrics.json`, {
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        return null
      }

      const data = await response.json()
      return data.ticket_metric?.first_reply_time_in_minutes || null
    } catch (error) {
      return null
    }
  }
}

interface ZendeskTicket {
  id: number
  created_at: string
  updated_at: string
  status: string
  first_response_time: number | null
  solved_at: string | null
  requester_id: number
  assignee_id: number | null
  group_id: number | null
  organization_id: number | null
  tags: string[]
  custom_fields: any[]
  subject: string
  description: string
  priority: string
  type: string
}

interface KPIData {
  ticketsIn: number
  ticketsResolved: number
  frtMedian: number
  aht: number
  fcrPercent: number
  frtDistribution: {
    "0-1h": number
    "1-8h": number
    "8-24h": number
    ">24h": number
    "No Reply": number
  }
  fcrBreakdown: {
    oneTouch: number
    twoTouch: number
    reopened: number
  }
}

// Brand organization mapping - Updated with actual organization IDs from Zendesk
const brandOrganizations: Record<string, number[]> = {
  'all': [], // All organizations
  'brand-a': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], // League of Kingdoms - Use all orgs for now
  'brand-b': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], // LOK Chronicle - Use all orgs for now
  'brand-c': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], // LOK Hunters - Use all orgs for now
  'brand-d': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], // Arena-Z - Use all orgs for now
  'brand-e': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] // The New Order - Use all orgs for now
}

function filterTicketsByBrand(tickets: ZendeskTicket[], brand: string): ZendeskTicket[] {
  // For now, all brands show the same data until we get actual organization IDs
  console.log(`Filtering for brand: ${brand} - returning all ${tickets.length} tickets`)
  return tickets
}

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

// 주간 범위 계산 함수 (일요일~토요일, KST 기준)
function getWeekRange(offsetWeeks: number = 0) {
  const now = new Date()
  
  // UTC+9 보정 (KST = UTC+9)
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  
  // 이번 주 일요일 00:00:00 KST (UTC 15:00)
  const day = kstNow.getUTCDay() // 0=일, 1=월 ...
  const diffToSunday = day // 일요일까지 뺄 일수
  const sunday = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(), 15, 0, 0) // UTC 15:00 = KST 00:00
  )
  sunday.setUTCDate(sunday.getUTCDate() - diffToSunday)
  
  // 시작 시간 (일요일 00:00 KST = UTC 15:00)
  const start = new Date(sunday.getTime() - offsetWeeks * 7 * 24 * 60 * 60 * 1000)
  
  // 끝 시간 (토요일 23:59:59 KST = UTC 14:59:59 다음날)
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
  end.setUTCHours(14, 59, 59, 999) // UTC 14:59:59 = KST 23:59:59
  
  return { start, end }
}

// 30일/90일 범위 계산 (09:00 기준)
function getDateRange(days: number) {
  const now = new Date()
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  
  // 09:00:00으로 설정
  const end = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(), 0, 0, 0))
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000)
  
  return { start, end }
}

async function calculateKPIsForWeek(tickets: ZendeskTicket[], weekStart: Date, weekEnd: Date, zendeskClient: ZendeskClient): Promise<KPIData> {
  console.log(`\n=== Calculating KPIs for ${tickets.length} tickets for week ${weekStart.toISOString()} to ${weekEnd.toISOString()} ===`)

  // Filter tickets for the specific week
  const weekTickets = tickets.filter(ticket => {
    const created = new Date(ticket.created_at)
    return created >= weekStart && created <= weekEnd
  })

  // Filter resolved tickets for the specific week
  // Count tickets that were SOLVED in this week (based on solved_at date)
  const resolvedTickets = tickets.filter(ticket => {
    if (!ticket.solved_at) return false
    
    const solvedAt = new Date(ticket.solved_at)
    return solvedAt >= weekStart && solvedAt <= weekEnd
  })

  // Filter tickets for FRT calculation (last 30 days from week end)
  const frtStartDate = new Date(weekEnd.getTime() - (30 * 24 * 60 * 60 * 1000))
  const frtTickets = tickets.filter(ticket => {
    const created = new Date(ticket.created_at)
    return created >= frtStartDate && created <= weekEnd
  })

  console.log(`Week tickets (In): ${weekTickets.length}`)
  console.log(`Week resolved tickets: ${resolvedTickets.length}`)
  console.log(`FRT tickets (30 days): ${frtTickets.length}`)
  
  // Debug: Show solved_at data
  const ticketsWithSolvedAt = tickets.filter(t => t.solved_at).length
  console.log(`Total tickets with solved_at: ${ticketsWithSolvedAt}`)
  
  if (resolvedTickets.length > 0) {
    console.log(`Sample resolved ticket solved_at:`, {
      id: resolvedTickets[0].id,
      solved_at: resolvedTickets[0].solved_at,
      status: resolvedTickets[0].status
    })
  }
  
  // Debug: Show some sample ticket data
  if (weekTickets.length > 0) {
    console.log(`Sample week ticket:`, {
      id: weekTickets[0].id,
      created: weekTickets[0].created_at,
      status: weekTickets[0].status,
      solved_at: weekTickets[0].solved_at
    })
  }
  
  if (resolvedTickets.length > 0) {
    console.log(`Sample resolved ticket:`, {
      id: resolvedTickets[0].id,
      created: resolvedTickets[0].created_at,
      status: resolvedTickets[0].status,
      solved_at: resolvedTickets[0].solved_at
    })
  }

  // Calculate tickets in and resolved
  const ticketsIn = weekTickets.length
  const ticketsResolved = resolvedTickets.length

  // Calculate FRT Median - use sample calculation for now
  let frtMedian = 0
  
  // Sample FRT calculation based on ticket age and status
  const frtValues = frtTickets
    .filter(ticket => ticket.status === 'solved' || ticket.status === 'closed')
    .map(ticket => {
      const created = new Date(ticket.created_at)
      const updated = new Date(ticket.updated_at)
      const timeDiff = (updated.getTime() - created.getTime()) / (1000 * 60) // minutes
      return Math.min(timeDiff, 1440) // Cap at 24 hours
    })
    .filter(time => time > 0)

  if (frtValues.length > 0) {
    frtMedian = frtValues.sort((a, b) => a - b)[Math.floor(frtValues.length / 2)]
    // Convert FRT from minutes to hours
    frtMedian = frtMedian / 60
  }

  console.log(`FRT values found: ${frtValues.length}`)
  console.log(`FRT median: ${frtMedian} hours`)

  // Calculate Average Handle Time (in hours)
  let aht = 0
  if (resolvedTickets.length > 0) {
    const ahtValues = resolvedTickets.map(ticket => {
      const created = new Date(ticket.created_at)
      const solved = ticket.solved_at ? new Date(ticket.solved_at) : new Date(ticket.updated_at)
      return (solved.getTime() - created.getTime()) / (1000 * 60 * 60) // hours
    }).filter(time => time > 0)
    
    if (ahtValues.length > 0) {
      aht = ahtValues.reduce((sum, time) => sum + time, 0) / ahtValues.length
    }
  }

  // Calculate FCR Rate
  let fcrPercent = 0
  if (resolvedTickets.length > 0) {
    const oneTouchTickets = resolvedTickets.filter(ticket => {
      const created = new Date(ticket.created_at)
      const solved = ticket.solved_at ? new Date(ticket.solved_at) : new Date(ticket.updated_at)
      const timeToSolve = (solved.getTime() - created.getTime()) / (1000 * 60 * 60) // hours
      return timeToSolve <= 24
    })
    fcrPercent = (oneTouchTickets.length / resolvedTickets.length) * 100
  }

  // Calculate FRT Distribution based on actual FRT values
  const frtDistribution = {
    "0-1h": 0,
    "1-8h": 0,
    "8-24h": 0,
    ">24h": 0,
    "No Reply": 0
  }
  
  // Calculate distribution from actual FRT values
  frtValues.forEach(frtMinutes => {
    const frtHours = frtMinutes / 60
    if (frtHours <= 1) {
      frtDistribution["0-1h"]++
    } else if (frtHours <= 8) {
      frtDistribution["1-8h"]++
    } else if (frtHours <= 24) {
      frtDistribution["8-24h"]++
    } else {
      frtDistribution[">24h"]++
    }
  })
  
  // Count tickets with no response (open tickets)
  const noReplyTickets = weekTickets.filter(ticket => 
    ticket.status === 'open' || ticket.status === 'pending'
  ).length
  frtDistribution["No Reply"] = noReplyTickets

  // Calculate FCR Breakdown based on actual data
  const oneTouchTickets = resolvedTickets.filter(ticket => {
    const created = new Date(ticket.created_at)
    const solved = ticket.solved_at ? new Date(ticket.solved_at) : new Date(ticket.updated_at)
    const timeToSolve = (solved.getTime() - created.getTime()) / (1000 * 60 * 60) // hours
    return timeToSolve <= 24
  })
  
  const twoTouchTickets = resolvedTickets.filter(ticket => {
    const created = new Date(ticket.created_at)
    const solved = ticket.solved_at ? new Date(ticket.solved_at) : new Date(ticket.updated_at)
    const timeToSolve = (solved.getTime() - created.getTime()) / (1000 * 60 * 60) // hours
    return timeToSolve > 24 && timeToSolve <= 72 // 1-3 days
  })
  
  const reopenedTickets = resolvedTickets.filter(ticket => {
    // Simple heuristic: if updated_at is much later than solved_at, it might be reopened
    if (!ticket.solved_at) return false
    const solved = new Date(ticket.solved_at)
    const updated = new Date(ticket.updated_at)
    const timeDiff = (updated.getTime() - solved.getTime()) / (1000 * 60 * 60) // hours
    return timeDiff > 24 // Updated more than 24 hours after being solved
  })
  
  const fcrBreakdown = {
    oneTouch: oneTouchTickets.length,
    twoTouch: twoTouchTickets.length,
    reopened: reopenedTickets.length
  }

  return {
    ticketsIn,
    ticketsResolved,
    frtMedian: Math.round(frtMedian * 10) / 10,
    aht: Math.round(aht * 100) / 100, // Round to 2 decimal places for hours
    fcrPercent: Math.round(fcrPercent * 10) / 10,
    frtDistribution,
    fcrBreakdown
  }
}

async function calculateKPIs(tickets: ZendeskTicket[]): Promise<KPIData> {
  console.log(`\n=== Calculating KPIs for ${tickets.length} tickets ===`)
  
  // Find the actual date range of the data
  const ticketDates = tickets.map(ticket => new Date(ticket.created_at)).sort()
  const oldestTicket = ticketDates[0]
  const newestTicket = ticketDates[ticketDates.length - 1]
  
  console.log(`Data date range: ${oldestTicket.toISOString()} to ${newestTicket.toISOString()}`)
  
  // Use the actual data range instead of current time
  const dataEndDate = newestTicket
  const dataStartDate = new Date(dataEndDate.getTime() - (7 * 24 * 60 * 60 * 1000)) // 7 days before newest ticket
  const dataStartDate30 = new Date(dataEndDate.getTime() - (30 * 24 * 60 * 60 * 1000)) // 30 days before newest ticket
  const dataStartDate90 = new Date(dataEndDate.getTime() - (90 * 24 * 60 * 60 * 1000)) // 90 days before newest ticket

  console.log(`Using data range: ${dataStartDate.toISOString()} to ${dataEndDate.toISOString()}`)
  console.log(`30-day range: ${dataStartDate30.toISOString()} to ${dataEndDate.toISOString()}`)
  console.log(`90-day range: ${dataStartDate90.toISOString()} to ${dataEndDate.toISOString()}`)

  // Show some sample ticket dates for debugging
  if (tickets.length > 0) {
    const sampleTicket = tickets[0]
    console.log(`Sample ticket created: ${sampleTicket.created_at}`)
    console.log(`Sample ticket solved: ${sampleTicket.solved_at}`)
    console.log(`Sample ticket FRT: ${sampleTicket.first_response_time}`)
    console.log(`Sample ticket status: ${sampleTicket.status}`)
  }

  // Filter tickets for the last 7 days of data (for "In" count)
  const recentTickets = tickets.filter(ticket => {
    const created = new Date(ticket.created_at)
    return created >= dataStartDate && created <= dataEndDate
  })

  // Filter resolved tickets for the last 7 days of data
  const resolvedTickets = tickets.filter(ticket => {
    const isResolved = ticket.status === 'solved' || ticket.status === 'closed'
    if (isResolved) {
      // Use solved_at if available, otherwise use updated_at
      const resolvedDate = ticket.solved_at ? new Date(ticket.solved_at) : new Date(ticket.updated_at)
      return resolvedDate >= dataStartDate && resolvedDate <= dataEndDate
    }
    return false
  })

  // Also try to get resolved tickets by looking at all tickets with solved/closed status
  const allResolvedTickets = tickets.filter(ticket => {
    return ticket.status === 'solved' || ticket.status === 'closed'
  })

  // Filter tickets for FRT calculation (last 30 days of data)
  const frtTickets = tickets.filter(ticket => {
    const created = new Date(ticket.created_at)
    return created >= dataStartDate30 && created <= dataEndDate
  })

  console.log(`Recent tickets (last 7 days of data): ${recentTickets.length}`)
  console.log(`Resolved tickets (last 7 days of data): ${resolvedTickets.length}`)
  console.log(`All resolved tickets: ${allResolvedTickets.length}`)
  console.log(`FRT tickets (last 30 days of data): ${frtTickets.length}`)

  // Calculate tickets in and resolved
  const ticketsIn = recentTickets.length
  const ticketsResolved = resolvedTickets.length

  // Calculate FRT Median - use sample calculation for now
  let frtMedian = 0
  
  // Sample FRT calculation based on ticket age and status
  const frtValues = frtTickets
    .filter(ticket => ticket.status === 'solved' || ticket.status === 'closed')
    .map(ticket => {
      const created = new Date(ticket.created_at)
      const updated = new Date(ticket.updated_at)
      const timeDiff = (updated.getTime() - created.getTime()) / (1000 * 60) // minutes
      return Math.min(timeDiff, 1440) // Cap at 24 hours
    })
    .filter(time => time > 0)

  if (frtValues.length > 0) {
    frtMedian = frtValues.sort((a, b) => a - b)[Math.floor(frtValues.length / 2)]
    // Convert FRT from minutes to hours
    frtMedian = frtMedian / 60
  }

  console.log(`FRT values found: ${frtValues.length}`)
  console.log(`FRT median: ${frtMedian} hours`)

  // Ensure frtMedian is not null or undefined
  const safeFrtMedian = frtMedian || 0

  // Calculate Average Handle Time - use 90-day range (in hours)
  let aht = 0
  const ticketsForAHT = tickets.filter(ticket => {
    const isResolved = ticket.status === 'solved' || ticket.status === 'closed'
    if (isResolved) {
      const resolvedDate = ticket.solved_at ? new Date(ticket.solved_at) : new Date(ticket.updated_at)
      return resolvedDate >= dataStartDate90 && resolvedDate <= dataEndDate
    }
    return false
  })
  
  if (ticketsForAHT.length > 0) {
    const ahtValues = ticketsForAHT.map(ticket => {
      const created = new Date(ticket.created_at)
      const solved = ticket.solved_at ? new Date(ticket.solved_at) : new Date(ticket.updated_at)
      return (solved.getTime() - created.getTime()) / (1000 * 60 * 60) // hours
    }).filter(time => time > 0) // Only positive times
    
    if (ahtValues.length > 0) {
      aht = ahtValues.reduce((sum, time) => sum + time, 0) / ahtValues.length
      console.log(`AHT calculated: ${aht} hours from ${ahtValues.length} resolved tickets (90-day range)`)
    } else {
      console.log(`No valid AHT values found`)
    }
  } else {
    console.log(`No resolved tickets for AHT calculation (90-day range)`)
  }

  // Calculate FCR Rate - use 90-day range
  let fcrPercent = 0
  const ticketsForFCR = tickets.filter(ticket => {
    const isResolved = ticket.status === 'solved' || ticket.status === 'closed'
    if (isResolved) {
      const resolvedDate = ticket.solved_at ? new Date(ticket.solved_at) : new Date(ticket.updated_at)
      return resolvedDate >= dataStartDate90 && resolvedDate <= dataEndDate
    }
    return false
  })
  
  if (ticketsForFCR.length > 0) {
    const oneTouchTickets = ticketsForFCR.filter(ticket => {
      const created = new Date(ticket.created_at)
      const solved = ticket.solved_at ? new Date(ticket.solved_at) : new Date(ticket.updated_at)
      const timeToSolve = (solved.getTime() - created.getTime()) / (1000 * 60 * 60) // hours
      return timeToSolve <= 24
    })
    fcrPercent = (oneTouchTickets.length / ticketsForFCR.length) * 100
    console.log(`FCR calculated: ${fcrPercent}% (${oneTouchTickets.length} one-touch out of ${ticketsForFCR.length} resolved, 90-day range)`)
  } else {
    console.log(`No resolved tickets for FCR calculation (90-day range)`)
  }

  // Calculate FRT Distribution
  const frtDistribution = {
    "0-1h": 0,
    "1-8h": 0,
    "8-24h": 0,
    ">24h": 0,
    "No Reply": 0
  }

  recentTickets.forEach(ticket => {
    if (ticket.first_response_time === null) {
      frtDistribution["No Reply"]++
    } else {
      const frtHours = ticket.first_response_time / 3600
      if (frtHours <= 1) {
        frtDistribution["0-1h"]++
      } else if (frtHours <= 8) {
        frtDistribution["1-8h"]++
      } else if (frtHours <= 24) {
        frtDistribution["8-24h"]++
      } else {
        frtDistribution[">24h"]++
      }
    }
  })

  // Calculate FCR Breakdown
  const fcrBreakdown = {
    oneTouch: 0,
    twoTouch: 0,
    reopened: 0
  }

  resolvedTickets.forEach(ticket => {
    const created = new Date(ticket.created_at)
    const solved = ticket.solved_at ? new Date(ticket.solved_at) : new Date(ticket.updated_at)
    const timeToSolve = (solved.getTime() - created.getTime()) / (1000 * 60 * 60) // hours

    if (timeToSolve <= 24) {
      fcrBreakdown.oneTouch++
    } else if (timeToSolve <= 48) {
      fcrBreakdown.twoTouch++
    } else {
      fcrBreakdown.reopened++
    }
  })

  return {
    ticketsIn,
    ticketsResolved,
    frtMedian: Math.round(safeFrtMedian * 10) / 10,
    aht: Math.round(aht * 100) / 100, // Round to 2 decimal places for hours
    fcrPercent: Math.round(fcrPercent * 10) / 10,
    frtDistribution,
    fcrBreakdown
  }
}

export async function POST() {
  try {
    console.log('Starting KPI sync job...')

    // Check if Zendesk is configured
    const subdomain = process.env.ZENDESK_SUBDOMAIN
    const email = process.env.ZENDESK_EMAIL
    const apiToken = process.env.ZENDESK_API_TOKEN

    if (!subdomain || !email || !apiToken) {
      return NextResponse.json(
        { error: 'Zendesk credentials not configured' },
        { status: 500 }
      )
    }

    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Supabase credentials not configured' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch all tickets from Zendesk
    const zendeskClient = new ZendeskClient(subdomain, email, apiToken)
    const allTickets = await zendeskClient.getAllTickets()

    // Process data for each brand and each week (5 weeks)
    const brands = ['all', 'brand-a', 'brand-b', 'brand-c', 'brand-d', 'brand-e']
    const results = []

    for (const brand of brands) {
      console.log(`Processing brand: ${brand}`)
      
      const filteredTickets = filterTicketsByBrand(allTickets, brand)
      
      // Process 5 weeks of data (previous weeks, not current)
      for (let weekOffset = 1; weekOffset <= 5; weekOffset++) {
        const { start: weekStart, end: weekEnd } = getWeekRange(weekOffset)
        
        // Generate Zendesk-style week label
        const weekNumber = getZendeskWeekNumber(weekStart)
        const weekLabel = `Week ${weekNumber}`
        
        console.log(`Processing week ${weekOffset + 1}: ${weekStart.toISOString()} to ${weekEnd.toISOString()} (${weekLabel})`)
        
        const kpiData = await calculateKPIsForWeek(filteredTickets, weekStart, weekEnd, zendeskClient)

        // Upsert to Supabase
        const { error } = await supabase
          .from('kpis')
          .upsert({
            brand,
            week_start_date: weekStart.toISOString().split('T')[0],
            week_end_date: weekEnd.toISOString().split('T')[0],
            week_label: weekLabel,
            tickets_in: kpiData.ticketsIn,
            tickets_resolved: kpiData.ticketsResolved,
            frt_median: kpiData.frtMedian,
            aht: kpiData.aht,
            fcr_percent: kpiData.fcrPercent,
            frt_distribution: kpiData.frtDistribution,
            fcr_breakdown: kpiData.fcrBreakdown,
            created_at: new Date().toISOString()
          }, {
            onConflict: 'brand,week_start_date,week_end_date'
          })

        if (error) {
          console.error(`Error upserting data for brand ${brand}, week ${weekOffset + 1}:`, error)
          results.push({ brand, week: weekOffset + 1, success: false, error: error.message })
        } else {
          console.log(`Successfully synced data for brand ${brand}, week ${weekOffset + 1}`)
          results.push({ brand, week: weekOffset + 1, success: true, data: kpiData })
        }
      }
    }

    return NextResponse.json({
      message: 'KPI sync completed',
      results,
      totalTickets: allTickets.length
    })

  } catch (error) {
    console.error('Error in sync job:', error)
    return NextResponse.json(
      { error: 'Sync job failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
