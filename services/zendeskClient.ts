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

export interface ZendeskTicket {
  id: number;
  created_at: string;
  updated_at: string;
  status: string;
  first_response_time: number | null;
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
}

export interface ZendeskTicketMetrics {
  first_reply_time_in_minutes?: number | null;
  reply_time_in_minutes?: number | null;
  requester_wait_time_in_minutes?: number | null;
}

interface ZendeskTicketListResponse {
  tickets: ZendeskTicket[];
  next_page?: string | null;
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
        lastError = error as Error;
        console.warn(`[ZendeskClient] Attempt ${attempt} failed: ${error.message}`);
        
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

    console.log(`[ZendeskClient] Fetching tickets created after ${startDate}`);

    while (nextPageUrl && page <= this.maxPages) {
      console.log(`[ZendeskClient] Fetching page ${page} with URL: ${nextPageUrl}`);

      try {
        const data: any = await this.fetchJson<ZendeskTicketListResponse>(nextPageUrl);
        const tickets: ZendeskTicket[] = data.tickets ?? [];
        
        // Zendesk Analytics와 동일한 방식으로 solved_at 설정
        const processedTickets = tickets.map((ticket: any) => {
          // metric_sets에서 정확한 해결 시간 사용
          const metrics = ticket.metric_sets?.ticket_metric_events?.find((m: any) => m.id === ticket.id);
          const solvedAt = metrics?.solved_at || ticket.solved_at;
          
          return {
            ...ticket,
            solved_at: solvedAt,
            // 추가 메트릭 정보
            first_reply_time: metrics?.first_reply_time_in_minutes || null,
            full_resolution_time: metrics?.full_resolution_time_in_minutes || null,
            requester_wait_time: metrics?.requester_wait_time_in_minutes || null,
          };
        });

        collected.push(...processedTickets);
        console.log(`[ZendeskClient] Retrieved ${tickets.length} tickets on page ${page} (total=${collected.length})`);

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

  async getTicketMetrics(ticketId: number): Promise<ZendeskTicketMetrics | null> {
    const url = `${this.baseUrl}/tickets/${ticketId}/metrics.json`;

    try {
      const data: { ticket_metric?: ZendeskTicketMetrics | null } = await this.fetchJson<{
        ticket_metric?: ZendeskTicketMetrics | null;
      }>(url);
      return data.ticket_metric ?? null;
    } catch (error) {
      console.error(`[ZendeskClient] Failed to fetch metrics for ticket ${ticketId}:`, error);
      return null;
    }
  }
}
