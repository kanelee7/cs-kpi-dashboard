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
  reply_time_in_seconds?: ZendeskMetricTime | null;
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
  brand?: string | null;
  brand_id?: number | null;
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
  first_reply_metric_source?: string | null;
  first_reply_metric_components?: FirstReplyMetricResolution['components'] | null;
}

type MetricTimePayload = ZendeskMetricTime | { calendar?: number | null; business?: number | null; seconds?: number | null } | number | null | undefined;

interface MetricComponents {
  calendar: number | null;
  business: number | null;
  seconds: number | null;
  combined: number | null;
  type: 'minutes' | 'seconds';
}

export interface FirstReplyMetricResolution {
  minutes: number | null;
  seconds: number | null;
  source: string;
  components: {
    firstReplyMinutes: MetricComponents;
    firstReplySeconds: MetricComponents;
    replyMinutes: MetricComponents;
    replySeconds: MetricComponents;
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value !== 'number') {
    return null;
  }

  return Number.isFinite(value) ? value : null;
}

function extractMetricTimeComponents(value: MetricTimePayload, type: 'minutes' | 'seconds'): MetricComponents {
  if (value === null || value === undefined) {
    return {
      calendar: null,
      business: null,
      seconds: null,
      combined: null,
      type,
    };
  }

  if (typeof value === 'number') {
    const numeric = toNumber(value);
    return {
      calendar: numeric,
      business: null,
      seconds: numeric,
      combined: numeric,
      type,
    };
  }

  const calendar = toNumber((value as any).calendar);
  const business = toNumber((value as any).business);
  const seconds = toNumber((value as any).seconds);

  return {
    calendar,
    business,
    seconds,
    combined: calendar ?? business ?? seconds ?? null,
    type,
  };
}

export function resolveFirstReplyMetrics(metricSet: ZendeskMetricSet | null | undefined): FirstReplyMetricResolution {
  const firstReplyMinutes = extractMetricTimeComponents(metricSet?.first_reply_time_in_minutes, 'minutes');
  const firstReplySeconds = extractMetricTimeComponents(metricSet?.first_reply_time_in_seconds, 'seconds');
  const replyMinutes = extractMetricTimeComponents(metricSet?.reply_time_in_minutes, 'minutes');
  const replySeconds = extractMetricTimeComponents(metricSet?.reply_time_in_seconds, 'seconds');

  let minutes: number | null = null;
  let seconds: number | null = null;
  let source = 'none';

  const selectMinutes = (value: number | null, label: string) => {
    if (minutes === null && value !== null && value > 0) {
      minutes = value;
      source = label;
    }
  };

  const applySeconds = (value: number | null, label: string) => {
    if (value !== null && value > 0) {
      if (minutes === null) {
        minutes = value / 60;
        source = label;
      }
      if (seconds === null) {
        seconds = value;
      }
    }
  };

  selectMinutes(firstReplyMinutes.business, 'first_reply_minutes_business');
  selectMinutes(firstReplyMinutes.calendar, 'first_reply_minutes_calendar');
  selectMinutes(firstReplyMinutes.combined, 'first_reply_minutes_combined');

  if (minutes === null) {
    selectMinutes(replyMinutes.business, 'reply_minutes_business');
    selectMinutes(replyMinutes.calendar, 'reply_minutes_calendar');
    selectMinutes(replyMinutes.combined, 'reply_minutes_combined');
  }

  if (minutes === null) {
    applySeconds(firstReplySeconds.business, 'first_reply_seconds_business');
    applySeconds(firstReplySeconds.calendar, 'first_reply_seconds_calendar');
    applySeconds(firstReplySeconds.combined, 'first_reply_seconds_combined');
    if (minutes === null) {
      applySeconds(replySeconds.business, 'reply_seconds_business');
      applySeconds(replySeconds.calendar, 'reply_seconds_calendar');
      applySeconds(replySeconds.combined, 'reply_seconds_combined');
    }
  } else {
    applySeconds(firstReplySeconds.business, 'first_reply_seconds_business');
    applySeconds(firstReplySeconds.calendar, 'first_reply_seconds_calendar');
    applySeconds(firstReplySeconds.combined, 'first_reply_seconds_combined');
    applySeconds(replySeconds.business, 'reply_seconds_business');
    applySeconds(replySeconds.calendar, 'reply_seconds_calendar');
    applySeconds(replySeconds.combined, 'reply_seconds_combined');
  }

  return {
    minutes,
    seconds,
    source,
    components: {
      firstReplyMinutes,
      firstReplySeconds,
      replyMinutes,
      replySeconds,
    },
  };
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
    const totalResolutionSourceCounts: Record<string, number> = {};

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

        const pageResolutionSourceCounts: Record<string, number> = {};

        const processedTickets = tickets.map(ticket => {
          const metrics = metricMap.get(ticket.id) ?? null;
          const firstReplyResolution = resolveFirstReplyMetrics(metrics);

          const replyMinutesBusiness = metrics?.reply_time_in_minutes?.business ?? null;
          const replyMinutesCalendar = metrics?.reply_time_in_minutes?.calendar ?? null;
          const replySecondsBusiness = metrics?.reply_time_in_seconds?.business ?? null;
          const replySecondsCalendar = metrics?.reply_time_in_seconds?.calendar ?? null;

          let minutesValue = firstReplyResolution.minutes;
          let secondsValue = firstReplyResolution.seconds;
          let sourceLabel = firstReplyResolution.source;

          if (minutesValue === null || minutesValue <= 0) {
            if (typeof replyMinutesBusiness === 'number' && replyMinutesBusiness > 0) {
              minutesValue = replyMinutesBusiness;
              sourceLabel = 'reply_minutes_business';
            } else if (typeof replyMinutesCalendar === 'number' && replyMinutesCalendar > 0) {
              minutesValue = replyMinutesCalendar;
              sourceLabel = 'reply_minutes_calendar';
            }
          }

          if (secondsValue === null || secondsValue <= 0) {
            if (typeof replySecondsBusiness === 'number' && replySecondsBusiness > 0) {
              secondsValue = replySecondsBusiness;
            } else if (typeof replySecondsCalendar === 'number' && replySecondsCalendar > 0) {
              secondsValue = replySecondsCalendar;
            }
          }

          const fullResolutionMinutes = metrics?.full_resolution_time_in_minutes?.calendar ?? null;
          const agentWaitMinutes = metrics?.agent_wait_time_in_minutes?.calendar ?? null;
          const requesterWaitMinutes = metrics?.requester_wait_time_in_minutes?.calendar ?? null;
          const solvedAt = metrics?.solved_at || ticket.solved_at;

          const resolutionSourceKey = sourceLabel && sourceLabel !== '' ? sourceLabel : 'none';
          pageResolutionSourceCounts[resolutionSourceKey] = (pageResolutionSourceCounts[resolutionSourceKey] ?? 0) + 1;
          totalResolutionSourceCounts[resolutionSourceKey] = (totalResolutionSourceCounts[resolutionSourceKey] ?? 0) + 1;

          return {
            ...ticket,
            solved_at: solvedAt,
            metric_set: metrics,
            first_reply_time_minutes: minutesValue ?? null,
            first_reply_time_seconds: secondsValue ?? null,
            full_resolution_time_minutes: fullResolutionMinutes,
            agent_wait_time_minutes: agentWaitMinutes,
            requester_wait_time_minutes: requesterWaitMinutes,
            replies: metrics?.replies ?? null,
            reopens: metrics?.reopens ?? null,
            first_reply_metric_source: sourceLabel,
            first_reply_metric_components: firstReplyResolution.components,
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
            resolutionSource: ticket.first_reply_metric_source,
            components: ticket.first_reply_metric_components,
            metricSetPresent: !!ticket.metric_set,
            metricSetExcerpt: ticket.metric_set
              ? {
                  first_reply_time_in_minutes: ticket.metric_set.first_reply_time_in_minutes ?? null,
                  first_reply_time_in_seconds: ticket.metric_set.first_reply_time_in_seconds ?? null,
                  reply_time_in_minutes: ticket.metric_set.reply_time_in_minutes ?? null,
                  reply_time_in_seconds: ticket.metric_set.reply_time_in_seconds ?? null,
                }
              : null,
          }));
          console.log('[ZendeskClient] Sample metric_set payload (first 5 tickets):', sampleMetrics);
          console.log('[ZendeskClient] Raw metric_set sample JSON:', JSON.stringify(metricSets.slice(0, 3), null, 2));
        }

        console.log('[ZendeskClient] Page first reply resolution sources:', pageResolutionSourceCounts);

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
      firstReplyResolutionSources: totalResolutionSourceCounts,
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

  /** Minimal comment shape for ticket conversation (no html_body). Max 100 comments. */
  static readonly MAX_TICKET_COMMENTS = 100;

  async getTicketComments(ticketId: number): Promise<ZendeskTicketComment[]> {
    const collected: ZendeskTicketComment[] = [];
    let nextPageUrl: string | null = `${this.baseUrl}/tickets/${ticketId}/comments.json?per_page=100`;

    while (nextPageUrl && collected.length < ZendeskClient.MAX_TICKET_COMMENTS) {
      const data: ZendeskCommentsResponse = await this.fetchJson<ZendeskCommentsResponse>(nextPageUrl);
      const comments = data.comments ?? [];
      for (const c of comments) {
        if (collected.length >= ZendeskClient.MAX_TICKET_COMMENTS) break;
        collected.push({
          plain_body: c.plain_body ?? c.body ?? '',
          author_id: c.author_id ?? null,
          created_at: c.created_at ?? '',
          public: c.public ?? true,
        });
      }
      nextPageUrl = data.next_page ?? null;
      if (nextPageUrl && collected.length < ZendeskClient.MAX_TICKET_COMMENTS) {
        await this.sleep(this.delayMs);
      }
    }

    return collected;
  }
}

export interface ZendeskTicketComment {
  plain_body: string;
  author_id: number | null;
  created_at: string;
  public: boolean;
}

interface ZendeskCommentsResponse {
  comments?: Array<{
    plain_body?: string | null;
    body?: string | null;
    author_id?: number | null;
    created_at?: string | null;
    public?: boolean;
  }>;
  next_page?: string | null;
}
