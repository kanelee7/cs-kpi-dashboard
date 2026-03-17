import { ZendeskClient, type ZendeskTicket, type ZendeskTicketComment } from './zendeskClient';
import { generateDevSummariesBatch } from './openaiService';
import { getSupabaseClient } from './supabaseService';
import { normalizeBrandId, resolveTicketBrand } from './brandResolver';
import { createHash } from 'node:crypto';

const TARGET_STATUSES = new Set(['open', 'in_progress']);
const DEFAULT_LIMIT = 30;
const MAX_BATCH_SIZE = 20;
const DESCRIPTION_SNIPPET_LENGTH = 500;
const DEFAULT_CACHE_TTL_HOURS = 12;
/** Token-safe: max chars per text part (description, internal note, or public reply). */
const MAX_PART_CHARS = 800;
/** Token-safe: max total chars per ticket context sent to OpenAI. Never send full comment arrays. */
const MAX_CONTEXT_CHARS = 2000;

const FIELD_IDS = {
  uid: [10403901273615, 11110415657615],
  wallet: [10821942289935],
  skinId: [10821992657039],
  txh: [13598979252111],
  merchantId: [10821994802959],
};

type CustomField = {
  id?: number | string;
  value?: unknown;
};

type DevSummaryCacheRecord = {
  ticket_id: number;
  brand: string | null;
  status: string;
  subject: string;
  one_line_summary: string;
  one_line_summary_ko: string;
  uid: string | null;
  wallet: string | null;
  skin_id: string | null;
  txh: string | null;
  merchant_id: string | null;
  drago_id: string | null;
  summary: string;
  fingerprint: string;
  generated_at: string;
  last_updated: string;
};

type PreparedTicket = {
  ticket: ZendeskTicket;
  brand: string;
  status: string;
  subject: string;
  descriptionSnippet: string;
  uid: string;
  wallet: string;
  skinId: string;
  txh: string;
  merchantId: string;
  dragoId: string;
  fingerprint: string;
};

export interface DevSummaryRow {
  ticketId: number;
  brand: string;
  status: string;
  subject: string;
  oneLineSummary: string;
  oneLineSummaryKo: string;
  uid: string;
  wallet: string;
  skinId: string;
  txh: string;
  merchantId: string;
  dragoId: string;
  summary: string;
}

function validateZendeskCredentials(): void {
  const required = ['ZENDESK_SUBDOMAIN', 'ZENDESK_EMAIL', 'ZENDESK_API_TOKEN'] as const;
  for (const name of required) {
    if (!process.env[name]) {
      throw new Error(`Missing required environment variable: ${name}`);
    }
  }
}

function normalizeDescription(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  return value.replace(/\s+/g, ' ').trim().slice(0, DESCRIPTION_SNIPPET_LENGTH);
}

function getFieldValue(ticket: ZendeskTicket, ids: number[]): string | null {
  const fields = ticket.custom_fields as CustomField[];
  for (const fieldId of ids) {
    const matched = fields.find(field => Number(field.id) === fieldId);
    if (!matched) continue;
    if (typeof matched.value === 'string' && matched.value.trim() !== '') return matched.value.trim();
    if (typeof matched.value === 'number') return String(matched.value);
  }
  return null;
}

function extractDragoId(description: string): string | null {
  const match = description.match(/drago(?:\s+id)?\s*[:#]?\s*([a-zA-Z0-9-_]+)/i);
  return match?.[1] ?? null;
}

function formatSummary(row: {
  oneLineSummary: string;
  oneLineSummaryKo: string;
  uid: string;
  wallet: string;
  skinId: string;
  txh: string;
  merchantId: string;
  dragoId: string;
}): string {
  return [
    row.oneLineSummary,
    `한글 요약: ${row.oneLineSummaryKo}`,
    `UID: ${row.uid}`,
    `Wallet: ${row.wallet}`,
    `Skin ID / TXH / Merchant ID / Drago ID: ${row.skinId} / ${row.txh} / ${row.merchantId} / ${row.dragoId}`,
  ].join('\n');
}

function chunk<T>(values: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    output.push(values.slice(i, i + size));
  }
  return output;
}

function getCacheTtlHours(): number {
  const parsed = Number(process.env.DEV_SUMMARY_CACHE_TTL_HOURS ?? DEFAULT_CACHE_TTL_HOURS);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_CACHE_TTL_HOURS;
  return parsed;
}

function isExpired(generatedAt: string, ttlHours: number): boolean {
  const generated = new Date(generatedAt);
  if (Number.isNaN(generated.getTime())) return true;
  return Date.now() - generated.getTime() > ttlHours * 60 * 60 * 1000;
}

function toNormalizedStatus(status: string | null | undefined): string {
  return (status || '').toLowerCase();
}

function buildFingerprint(input: {
  brand: string;
  status: string;
  subject: string;
  descriptionSnippet: string;
  uid: string;
  wallet: string;
  skinId: string;
  txh: string;
  merchantId: string;
  dragoId: string;
}): string {
  const raw = [
    input.brand,
    input.status,
    input.subject,
    input.descriptionSnippet,
    input.uid,
    input.wallet,
    input.skinId,
    input.txh,
    input.merchantId,
    input.dragoId,
  ].join('|');
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Build token-safe context for one ticket: at most description + latest internal note OR latest 1 public comment.
 * Never sends full comment arrays. Truncates each part to MAX_PART_CHARS and total to MAX_CONTEXT_CHARS.
 */
function buildTokenSafeContext(ticket: ZendeskTicket, comments: ZendeskTicketComment[]): string {
  const truncate = (s: string, max: number): string =>
    (s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

  const description = truncate(ticket.description ?? '', MAX_PART_CHARS);
  const parts: string[] = [`Ticket ID: ${ticket.id}`, `Original Description:\n${description}`];

  if (comments.length > 5) {
    // Hard constraint: do not concatenate; only selective extraction.
  }

  const byCreatedDesc = [...comments].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const latestInternal = byCreatedDesc.find(c => !c.public);
  const latestPublic = byCreatedDesc.find(c => c.public);

  if (latestInternal) {
    parts.push(`Latest Internal Note:\n${truncate(latestInternal.plain_body, MAX_PART_CHARS)}`);
  } else if (latestPublic) {
    parts.push(`Latest Public Reply:\n${truncate(latestPublic.plain_body, MAX_PART_CHARS)}`);
  }

  return parts.join('\n\n').slice(0, MAX_CONTEXT_CHARS);
}

function prepareTicket(ticket: ZendeskTicket): PreparedTicket {
  const status = toNormalizedStatus(ticket.status);
  const subject = ticket.subject || '';
  const descriptionSnippet = normalizeDescription(ticket.description);
  const uid = getFieldValue(ticket, FIELD_IDS.uid) ?? '-';
  const wallet = getFieldValue(ticket, FIELD_IDS.wallet) ?? '-';
  const skinId = getFieldValue(ticket, FIELD_IDS.skinId) ?? '-';
  const txh = getFieldValue(ticket, FIELD_IDS.txh) ?? '-';
  const merchantId = getFieldValue(ticket, FIELD_IDS.merchantId) ?? '-';
  const dragoId = extractDragoId(ticket.description || '') ?? '-';
  const brand = resolveTicketBrand(ticket);
  const fingerprint = buildFingerprint({
    brand,
    status,
    subject,
    descriptionSnippet,
    uid,
    wallet,
    skinId,
    txh,
    merchantId,
    dragoId,
  });

  return {
    ticket,
    brand,
    status,
    subject,
    descriptionSnippet,
    uid,
    wallet,
    skinId,
    txh,
    merchantId,
    dragoId,
    fingerprint,
  };
}

function mapCacheRecordToRow(record: DevSummaryCacheRecord): DevSummaryRow {
  return {
    ticketId: record.ticket_id,
    brand: record.brand || 'unknown',
    status: record.status,
    subject: record.subject,
    oneLineSummary: record.one_line_summary,
    oneLineSummaryKo: record.one_line_summary_ko || record.one_line_summary,
    uid: record.uid ?? '-',
    wallet: record.wallet ?? '-',
    skinId: record.skin_id ?? '-',
    txh: record.txh ?? '-',
    merchantId: record.merchant_id ?? '-',
    dragoId: record.drago_id ?? '-',
    summary: record.summary,
  };
}

async function fetchTargetTickets(limit: number): Promise<ZendeskTicket[]> {
  const zendeskClient = new ZendeskClient({
    subdomain: process.env.ZENDESK_SUBDOMAIN || '',
    email: process.env.ZENDESK_EMAIL || '',
    apiToken: process.env.ZENDESK_API_TOKEN || '',
  });

  const lookback = new Date();
  lookback.setDate(lookback.getDate() - 60);
  const tickets = await zendeskClient.getAllTickets(lookback.toISOString());
  return tickets.filter(ticket => TARGET_STATUSES.has(toNormalizedStatus(ticket.status))).slice(0, limit);
}

export async function getCachedOpenTicketDevSummaries(options?: {
  limit?: number;
  brand?: string;
}): Promise<DevSummaryRow[]> {
  const limit = Math.min(Math.max(options?.limit ?? DEFAULT_LIMIT, 1), 300);
  const brand = normalizeBrandId(options?.brand) ?? null;
  const supabase = getSupabaseClient();

  let query = supabase
    .from('dev_summary_cache')
    .select(
      'ticket_id, brand, status, subject, one_line_summary, one_line_summary_ko, uid, wallet, skin_id, txh, merchant_id, drago_id, summary, fingerprint, generated_at, last_updated',
    )
    .order('last_updated', { ascending: false })
    .limit(limit);

  if (brand) {
    query = query.eq('brand', brand);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to read dev_summary_cache: ${error.message}`);
  }

  return (data ?? []).map(record => mapCacheRecordToRow(record as DevSummaryCacheRecord));
}

export async function syncOpenTicketDevSummaries(options?: {
  limit?: number;
  forceRefresh?: boolean;
  sourceTickets?: ZendeskTicket[];
}): Promise<DevSummaryRow[]> {
  if (!options?.sourceTickets) {
    validateZendeskCredentials();
  }

  const limit = Math.min(Math.max(options?.limit ?? DEFAULT_LIMIT, 1), 300);
  const sourceTickets = options?.sourceTickets ?? (await fetchTargetTickets(limit));
  const tickets = sourceTickets
    .filter(ticket => TARGET_STATUSES.has(toNormalizedStatus(ticket.status)))
    .slice(0, limit);
  const prepared = tickets.map(prepareTicket);
  const ttlHours = getCacheTtlHours();
  const supabase = getSupabaseClient();
  const ticketIds = prepared.map(item => item.ticket.id);

  const existingMap = new Map<number, DevSummaryCacheRecord>();
  if (ticketIds.length > 0) {
    const { data: existingRows, error: existingError } = await supabase
      .from('dev_summary_cache')
      .select(
        'ticket_id, brand, status, subject, one_line_summary, one_line_summary_ko, uid, wallet, skin_id, txh, merchant_id, drago_id, summary, fingerprint, generated_at, last_updated',
      )
      .in('ticket_id', ticketIds);

    if (existingError) {
      throw new Error(`Failed to read existing dev summary cache: ${existingError.message}`);
    }

    (existingRows ?? []).forEach(record => {
      const typed = record as DevSummaryCacheRecord;
      existingMap.set(typed.ticket_id, typed);
    });
  }

  const regenerate = prepared.filter(item => {
    if (options?.forceRefresh) return true;
    const cached = existingMap.get(item.ticket.id);
    if (!cached) return true;
    if (cached.status !== item.status) return true;
    if (cached.fingerprint !== item.fingerprint) return true;
    if (isExpired(cached.generated_at, ttlHours)) return true;
    return false;
  });

  const generatedSummaryMap = new Map<number, { oneLineSummary: string; oneLineSummaryKo: string }>();
  let zendeskClient: ZendeskClient | null = null;
  if (regenerate.length > 0) {
    validateZendeskCredentials();
    zendeskClient = new ZendeskClient({
      subdomain: process.env.ZENDESK_SUBDOMAIN!,
      email: process.env.ZENDESK_EMAIL!,
      apiToken: process.env.ZENDESK_API_TOKEN!,
    });
  }

  for (const ticketBatch of chunk(regenerate, MAX_BATCH_SIZE)) {
    const batchInputs = await Promise.all(
      ticketBatch.map(async item => {
        let contextForSummary: string | undefined;
        if (zendeskClient) {
          try {
            const comments = await zendeskClient.getTicketComments(item.ticket.id);
            contextForSummary = buildTokenSafeContext(item.ticket, comments);
          } catch (err) {
            console.warn(`[devSummary] Failed to fetch comments for ticket ${item.ticket.id}:`, err);
          }
        }
        return {
          ticketId: item.ticket.id,
          subject: item.subject,
          descriptionSnippet: item.descriptionSnippet,
          ...(contextForSummary && contextForSummary.length > 0 ? { contextForSummary } : {}),
        };
      }),
    );

    const aiResults = await generateDevSummariesBatch(batchInputs);

    aiResults.forEach(result => {
      generatedSummaryMap.set(result.ticketId, {
        oneLineSummary: result.oneLineSummary,
        oneLineSummaryKo: result.oneLineSummaryKo || result.oneLineSummary,
      });
    });
  }

  const nowIso = new Date().toISOString();
  const upsertRows = prepared.map(item => {
    const cached = existingMap.get(item.ticket.id);
    const generated = generatedSummaryMap.get(item.ticket.id);
    const oneLineSummary =
      generated?.oneLineSummary ||
      cached?.one_line_summary ||
      item.subject ||
      'Issue reported by customer';
    const oneLineSummaryKo =
      generated?.oneLineSummaryKo ||
      cached?.one_line_summary_ko ||
      oneLineSummary;
    const summary = formatSummary({
      oneLineSummary,
      oneLineSummaryKo,
      uid: item.uid,
      wallet: item.wallet,
      skinId: item.skinId,
      txh: item.txh,
      merchantId: item.merchantId,
      dragoId: item.dragoId,
    });

    return {
      ticket_id: item.ticket.id,
      brand: item.brand,
      status: item.status,
      subject: item.subject,
      one_line_summary: oneLineSummary,
      one_line_summary_ko: oneLineSummaryKo,
      uid: item.uid,
      wallet: item.wallet,
      skin_id: item.skinId,
      txh: item.txh,
      merchant_id: item.merchantId,
      drago_id: item.dragoId,
      summary,
      fingerprint: item.fingerprint,
      generated_at: generated ? nowIso : cached?.generated_at ?? nowIso,
      last_updated: nowIso,
    };
  });

  if (upsertRows.length > 0) {
    const { error: upsertError } = await supabase
      .from('dev_summary_cache')
      .upsert(upsertRows, { onConflict: 'ticket_id' });
    if (upsertError) {
      throw new Error(`Failed to upsert dev_summary_cache: ${upsertError.message}`);
    }
  }

  return upsertRows.map(record =>
    mapCacheRecordToRow({
      ...record,
      generated_at: record.generated_at,
      last_updated: record.last_updated,
    } as DevSummaryCacheRecord),
  );
}

export async function generateOpenTicketDevSummaries(options?: {
  limit?: number;
  brand?: string;
}): Promise<DevSummaryRow[]> {
  return getCachedOpenTicketDevSummaries(options);
}
