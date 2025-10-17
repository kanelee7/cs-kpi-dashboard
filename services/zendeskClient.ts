export interface ZendeskClientConfig {
  subdomain: string;
  email: string;
  apiToken: string;
  /** Maximum number of pages to fetch before stopping (guardrail against runaway loops). */
  maxPages?: number;
  /** Number of tickets to request per page. Zendesk defaults to 100. */
  perPage?: number;
  /** Optional delay (ms) between paginated requests to respect rate limits. */
  delayMs?: number;
}

export interface ZendeskMetricTime {
  calendar: number | null;
  business: number | null;
}

export interface ZendeskMetricSet {
  ticket_id: number;
  latest_comment_added_at?: string | null;
  solved_at?: string | null;
  first_resolution_time_in_minutes?: ZendeskMetricTime | null;
  full_resolution_time_in_minutes?: ZendeskMetricTime | null;
  first_reply_time_in_minutes?: ZendeskMetricTime | null;
  first_reply_time_in_seconds?: ZendeskMetricTime | null;
  reply_time_in_minutes?: ZendeskMetricTime | null;
  agent_wait_time_in_minutes?: ZendeskMetricTime | null;
  requester_wait_time_in_minutes?: ZendeskMetricTime | null;
  on_hold_time_in_minutes?: ZendeskMetricTime | null;
  reopens?: number | null;
  replies?: number | null;
  touches?: number | null;
}

export interface ZendeskTicket {
  id: number;
  created_at: string;
  updated_at: string;
  status: string;
  solved_at: string | null;
  requester_id: number;
  assignee_id: number | null;
  group_id: number | null;
  organization_id: number | null;
  tags: string[];
  custom_fields: Array<Record<string, unknown>>;
  subject: string;
  description: string;
  priority: string | null;
  type: string | null;
  metric_set?: ZendeskMetricSet | null;
  first_reply_time_minutes?: number | null;
  first_reply_time_seconds?: number | null;
  full_resolution_time_minutes?: number | null;
  agent_wait_time_minutes?: number | null;
  requester_wait_time_minutes?: number | null;
  replies?: number | null;
  reopens?: number | null;
}

interface ZendeskTicketListResponse {
  tickets: ZendeskTicket[];
  next_page?: string | null;
  metric_sets?: ZendeskMetricSet[];
}

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_DELAY_MS = 1000;
const DEFAULT_MAX_PAGES = 100;

export class ZendeskClient {
  private readonly subdomain: string;
  private readonly email: string;
  private readonly apiToken: string;
  private readonly baseUrl: string;
  private readonly maxPages: number;
  private readonly perPage: number;
  private readonly delayMs: number;

  constructor(config: ZendeskClientConfig) {
    this.subdomain = config.subdomain;
    this.email = config.email;
    this.apiToken = config.apiToken;
    this.baseUrl = `https://${config.subdomain}.zendesk.com/api/v2`;
    this.maxPages = config.maxPages ?? DEFAULT_MAX_PAGES;
    this.perPage = config.perPage ?? DEFAULT_PAGE_SIZE;
    this.delayMs = config.delayMs ?? DEFAULT_DELAY_MS;
  }

  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.email}/token:${this.apiToken}`).toString('base64');
    return `Basic ${credentials}`;
  }

  private async fetchJson<T>(url: string, retries = 3, delay = 1000): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            Authorization: this.getAuthHeader(),
            'Content-Type': 'application/json',
          },
        });

        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') || '10', 10) * 1000;
          console.warn(`[ZendeskClient] Rate limited. Retrying after ${retryAfter}ms (attempt ${attempt}/${retries})`);
          await this.sleep(retryAfter);
          continue;
        }

        if (!response.ok) {
          throw new Error(`Zendesk API error: ${response.status} ${response.statusText}`);
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`[ZendeskClient] Attempt ${attempt} failed: ${errorMessage}`);
        
        if (attempt < retries) {
          const backoff = delay * Math.pow(2, attempt - 1);
          console.log(`[ZendeskClient] Retrying in ${backoff}ms...`);
          await this.sleep(backoff);
        }
      }
    }

    throw lastError || new Error('Failed to fetch data from Zendesk API');
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Fetch all tickets created after the provided ISO date (inclusive).
   * Falls back to the last 6 months of data if no date is supplied.
   */
  async getAllTickets(createdAfter?: string): Promise<ZendeskTicket[]> {
    const fallbackStart = new Date();
    fallbackStart.setMonth(fallbackStart.getMonth() - 6);
    const startDate = createdAfter ?? fallbackStart.toISOString().split('T')[0];

    let page = 1;
    let nextPageUrl: string | null = `${this.baseUrl}/incremental/tickets/cursor.json?start_time=${Math.floor(new Date(startDate).getTime() / 1000)}&include=organizations,metric_sets`;
    const collected: ZendeskTicket[] = [];
    let totalMetricSetCount = 0;
    let totalFirstReplyCalendarCount = 0;
    let totalFirstReplyBusinessCount = 0;
    let totalProcessedFirstReplyCount = 0;
    let totalFirstReplySecondsCount = 0;

    console.log(`[ZendeskClient] Fetching tickets created after ${startDate}`);

    while (nextPageUrl && page <= this.maxPages) {
      console.log(`[ZendeskClient] Fetching page ${page} with URL: ${nextPageUrl}`);

      try {
        const data: ZendeskTicketListResponse = await this.fetchJson<ZendeskTicketListResponse>(nextPageUrl);
        const tickets: ZendeskTicket[] = data.tickets ?? [];
        const metricSets = data.metric_sets ?? [];
        const pageFirstReplyCalendarCount = metricSets.filter(metric => typeof metric.first_reply_time_in_minutes?.calendar === 'number').length;
        const pageFirstReplyBusinessCount = metricSets.filter(metric => typeof metric.first_reply_time_in_minutes?.business === 'number').length;
        const pageFirstReplySecondsCount = metricSets.filter(metric => {
          const seconds = metric.first_reply_time_in_seconds;
          return typeof seconds?.calendar === 'number' || typeof seconds?.business === 'number';
        }).length;
        console.log(`[ZendeskClient] Page ${page} metric_sets: total=${metricSets.length}, first_reply.calendar=${pageFirstReplyCalendarCount}, first_reply.business=${pageFirstReplyBusinessCount}, first_reply.seconds=${pageFirstReplySecondsCount}`);

        const metricMap = new Map<number, ZendeskMetricSet>();
        for (const metric of metricSets) {
          metricMap.set(metric.ticket_id, metric);
        }

        const processedTickets = tickets.map(ticket => {
          const metrics = metricMap.get(ticket.id) ?? null;

          const firstReplyMinutesCalendar = metrics?.first_reply_time_in_minutes?.calendar ?? null;
          const firstReplyMinutesBusiness = metrics?.first_reply_time_in_minutes?.business ?? null;
          const firstReplySecondsCalendar = metrics?.first_reply_time_in_seconds?.calendar ?? null;
          const firstReplySecondsBusiness = metrics?.first_reply_time_in_seconds?.business ?? null;

          const firstReplySeconds = typeof firstReplySecondsCalendar === 'number'
            ? firstReplySecondsCalendar
            : typeof firstReplySecondsBusiness === 'number'
              ? firstReplySecondsBusiness
              : null;

          let firstReplyMinutes = firstReplyMinutesCalendar ?? firstReplyMinutesBusiness ?? null;
          if (firstReplyMinutes === null && typeof firstReplySeconds === 'number') {
            firstReplyMinutes = firstReplySeconds / 60;
          }

          const fullResolutionMinutes = metrics?.full_resolution_time_in_minutes?.calendar ?? null;
          const agentWaitMinutes = metrics?.agent_wait_time_in_minutes?.calendar ?? null;
          const requesterWaitMinutes = metrics?.requester_wait_time_in_minutes?.calendar ?? null;
          const solvedAt = metrics?.solved_at || ticket.solved_at;

          return {
            ...ticket,
            solved_at: solvedAt,
            metric_set: metrics,
            first_reply_time_minutes: firstReplyMinutes,
            first_reply_time_seconds: firstReplySeconds,
            full_resolution_time_minutes: fullResolutionMinutes,
            agent_wait_time_minutes: agentWaitMinutes,
            requester_wait_time_minutes: requesterWaitMinutes,
            replies: metrics?.replies ?? null,
            reopens: metrics?.reopens ?? null,
          };
        });

        const processedFirstReplyCount = processedTickets.filter(ticket => typeof ticket.first_reply_time_minutes === 'number').length;
        totalMetricSetCount += metricSets.length;
        totalFirstReplyCalendarCount += pageFirstReplyCalendarCount;
        totalFirstReplyBusinessCount += pageFirstReplyBusinessCount;
        totalFirstReplySecondsCount += pageFirstReplySecondsCount;
        totalProcessedFirstReplyCount += processedFirstReplyCount;

        if (page === 1 && processedTickets.length > 0) {
          const sampleMetrics = processedTickets.slice(0, 5).map(ticket => ({
            id: ticket.id,
            firstReplyMinutes: ticket.first_reply_time_minutes,
            firstReplySeconds: ticket.first_reply_time_seconds,
            metricSetPresent: !!ticket.metric_set,
          }));
          console.log('[ZendeskClient] Sample metric_set payload (first 5 tickets):', sampleMetrics);
        }

        collected.push(...processedTickets);
        console.log(`[ZendeskClient] Retrieved ${tickets.length} tickets on page ${page} (total=${collected.length}, first_reply_with_value=${processedFirstReplyCount})`);

        nextPageUrl = data.next_page ?? null;
        page += 1;

        if (nextPageUrl) {
          await this.sleep(this.delayMs);
        }
      } catch (error) {
        console.error(`[ZendeskClient] Error fetching page ${page}:`, error);
        throw error;
      }
    }

    if (nextPageUrl) {
      console.warn(
        `[ZendeskClient] Pagination stopped at page ${page - 1}. Increase maxPages if additional data is required.`,
      );
    }

    console.log('[ZendeskClient] Metric availability summary', {
      totalTickets: collected.length,
      totalMetricSets: totalMetricSetCount,
      firstReplyCalendarCount: totalFirstReplyCalendarCount,
      firstReplyBusinessCount: totalFirstReplyBusinessCount,
      firstReplySecondsCount: totalFirstReplySecondsCount,
      processedFirstReplyCount: totalProcessedFirstReplyCount,
    });
    if (totalFirstReplyCalendarCount === 0) {
      console.warn('[ZendeskClient] Warning: No metric_set.first_reply_time_in_minutes.calendar values were returned. Check Zendesk account settings.');
    }

    if (collected.length > 0) {
      const byCreated = [...collected].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      console.log(
        `[ZendeskClient] Ticket date range: ${byCreated[0].created_at} to ${
          byCreated[byCreated.length - 1].created_at
        }`,
      );
    }

    return collected;
  }

  async getTicketMetrics(ticketId: number): Promise<ZendeskMetricSet | null> {
    const url = `${this.baseUrl}/tickets/${ticketId}/metrics.json`;

    try {
      const data = await this.fetchJson<{ ticket_metric?: any | null }>(url);
      const metric = data.ticket_metric;
      if (!metric) {
        return null;
      }

      return {
        ticket_id: metric.ticket_id ?? ticketId,
        latest_comment_added_at: metric.latest_comment_added_at ?? null,
        solved_at: metric.solved_at ?? null,
        first_resolution_time_in_minutes: metric.first_resolution_time_in_minutes ?? null,
        full_resolution_time_in_minutes: metric.full_resolution_time_in_minutes ?? null,
        first_reply_time_in_minutes: metric.first_reply_time_in_minutes ?? null,
        first_reply_time_in_seconds: metric.first_reply_time_in_seconds ?? null,
        reply_time_in_minutes: metric.reply_time_in_minutes ?? null,
        agent_wait_time_in_minutes: metric.agent_wait_time_in_minutes ?? null,
        requester_wait_time_in_minutes: metric.requester_wait_time_in_minutes ?? null,
        on_hold_time_in_minutes: metric.on_hold_time_in_minutes ?? null,
        reopens: metric.reopens ?? null,
        replies: metric.replies ?? null,
        touches: metric.touches ?? null,
      } as ZendeskMetricSet;
    } catch (error) {
      console.error(`[ZendeskClient] Failed to fetch metrics for ticket ${ticketId}:`, error);
      return null;
    }
  }
}
