import OpenAI from 'openai';

export interface VOCIssueAnalysisInput {
  weekLabel: string;
  previousWeekLabel?: string;
  previousWeekTopIssues?: string[];
  tickets: Array<{
    id: number;
    subject: string;
    description: string;
    status: string;
    tags: string[];
    issueType: string | null;
  }>;
}

export interface VOCTicketSummary {
  ticket_id: number;
  summary: string;
}

export interface VOCIssueAnalysisResult {
  topIssues: string[];
  trendChanges: string;
  weeklySummary: string;
}

export interface VOCTicketSummaryInput {
  id: number;
  subject: string;
  description: string;
  status: string;
  tags: string[];
  issueType: string | null;
}

export interface DevSummaryTicketInput {
  ticketId: number;
  subject: string;
  descriptionSnippet: string;
  /** Token-safe context: description + at most one internal note or one public reply, capped at 2000 chars. Never full comment arrays. */
  contextForSummary?: string;
}

export interface DevSummaryAIOutput {
  ticketId: number;
  oneLineSummary: string;
  oneLineSummaryKo: string;
}

let openAIClient: OpenAI | null = null;
const OPENAI_TIMEOUT_MS = 60000;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getOpenAIClient(): OpenAI {
  if (openAIClient) {
    return openAIClient;
  }

  openAIClient = new OpenAI({
    apiKey: getEnv('OPENAI_API_KEY'),
  });

  return openAIClient;
}

function getModel(): string {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

function safeJsonParse<T>(content: string): T {
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    throw new Error(`OpenAI returned invalid JSON: ${content}`);
  }
}

async function createChatCompletion(
  client: OpenAI,
  payload: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
) {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      client.chat.completions.create(payload),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`OpenAI request timed out after ${OPENAI_TIMEOUT_MS}ms`));
        }, OPENAI_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function hasHangul(text: string): boolean {
  return /[가-힣]/.test(text);
}

async function backfillKoreanSummaries(
  client: OpenAI,
  model: string,
  rows: DevSummaryAIOutput[],
): Promise<Map<number, string>> {
  const missing = rows.filter(row => !hasHangul(row.oneLineSummaryKo || ''));
  if (missing.length === 0) {
    return new Map<number, string>();
  }

  const response = await createChatCompletion(client, {
    model,
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content:
          'Translate English ticket issue one-liners into natural Korean. Return strict JSON only. Do not add markdown.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: 'Translate each oneLineSummary into Korean',
          outputShape: [{ ticketId: 'number', oneLineSummaryKo: 'Korean sentence only' }],
          constraints: [
            'Korean output must include Hangul characters',
            'One sentence per ticket',
            'Preserve technical entities like UID, TXH, wallet addresses',
            'No additional commentary',
          ],
          items: missing.map(item => ({ ticketId: item.ticketId, oneLineSummary: item.oneLineSummary })),
        }),
      },
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    return new Map<number, string>();
  }

  const parsed = safeJsonParse<
    { summaries?: Array<{ ticketId?: number; oneLineSummaryKo?: string }> } | Array<{ ticketId?: number; oneLineSummaryKo?: string }>
  >(content);
  const mapped = new Map<number, string>();
  const list = Array.isArray(parsed) ? parsed : parsed.summaries ?? [];
  list.forEach(item => {
    if (typeof item.ticketId === 'number' && typeof item.oneLineSummaryKo === 'string' && item.oneLineSummaryKo.trim()) {
      mapped.set(item.ticketId, item.oneLineSummaryKo.trim());
    }
  });
  return mapped;
}

async function translateOneLineToKorean(client: OpenAI, model: string, english: string): Promise<string> {
  const response = await createChatCompletion(client, {
    model,
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content:
          'Translate the given issue summary into natural Korean. Keep technical IDs unchanged. Return only the translated sentence.',
      },
      { role: 'user', content: english },
    ],
  });
  const text = response.choices[0]?.message?.content?.trim() || '';
  return text;
}

export async function analyzeVOCWeek(input: VOCIssueAnalysisInput): Promise<VOCIssueAnalysisResult> {
  const client = getOpenAIClient();
  const model = getModel();

  const systemPrompt =
    'You analyze Zendesk support tickets and return compact JSON only. No markdown, no prose outside JSON.';

  const userPrompt = JSON.stringify({
    task: 'Analyze weekly VOC ticket data and summarize patterns using full ticket content (subject + full description).',
    outputShape: {
      topIssues: ['exactly 5 short issue labels, each <= 8 words'],
      trendChanges: '1-2 sentences comparing this week with previous week context if provided',
      weeklySummary: '2-3 sentences with practical support insight',
    },
    constraints: [
      'Output strict JSON',
      'Keep wording concise',
      'Prefer issue names that can be tracked week-over-week',
      'Use previous week context when available',
    ],
    week: {
      label: input.weekLabel,
      previousWeekLabel: input.previousWeekLabel ?? null,
      previousWeekTopIssues: input.previousWeekTopIssues ?? [],
    },
    tickets: input.tickets,
  });

  const response = await createChatCompletion(client, {
    model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned an empty response for VOC analysis');
  }

  const parsed = safeJsonParse<Partial<VOCIssueAnalysisResult>>(content);
  const topIssues = Array.isArray(parsed.topIssues)
    ? parsed.topIssues.filter((issue): issue is string => typeof issue === 'string').slice(0, 5)
    : [];
  return {
    topIssues,
    trendChanges: typeof parsed.trendChanges === 'string' ? parsed.trendChanges : '',
    weeklySummary: typeof parsed.weeklySummary === 'string' ? parsed.weeklySummary : '',
  };
}

export async function summarizeVOCTicketsBatch(
  tickets: VOCTicketSummaryInput[],
  chunkSize = 10,
): Promise<VOCTicketSummary[]> {
  if (tickets.length === 0) {
    return [];
  }

  const client = getOpenAIClient();
  const model = getModel();
  const summaries = new Map<number, string>();

  for (let idx = 0; idx < tickets.length; idx += chunkSize) {
    const chunk = tickets.slice(idx, idx + chunkSize);
    try {
      const response = await createChatCompletion(client, {
        model,
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content:
              'Summarize each ticket using provided fields only. Return strict JSON only. No markdown.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              task: 'Generate per-ticket VOC summaries',
              outputShape: [{ ticket_id: 'number', summary: '2-3 lines with root cause, category, user impact' }],
              constraints: [
                'Use only provided ticket fields',
                'Do not hallucinate missing fields',
                'Each summary must include root cause (or unknown), category, and user impact',
                'Return exactly one summary per input ticket',
              ],
              tickets: chunk,
            }),
          },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        continue;
      }

      const parsed = safeJsonParse<{ summaries?: VOCTicketSummary[] } | VOCTicketSummary[]>(content);
      const list = Array.isArray(parsed) ? parsed : parsed.summaries ?? [];
      list.forEach(item => {
        if (typeof item.ticket_id === 'number' && typeof item.summary === 'string' && item.summary.trim()) {
          summaries.set(item.ticket_id, item.summary.trim());
        }
      });
    } catch {
      continue;
    }
  }

  return tickets.map(ticket => ({
    ticket_id: ticket.id,
    summary:
      summaries.get(ticket.id) ??
      `Root cause: Unknown from provided context.\nCategory: Uncategorized.\nUser impact: ${ticket.subject || 'Issue reported by user'}`,
  }));
}

export async function generateDevSummariesBatch(
  tickets: DevSummaryTicketInput[],
): Promise<DevSummaryAIOutput[]> {
  if (tickets.length === 0) {
    return [];
  }

  const client = getOpenAIClient();
  const model = getModel();

  const systemPrompt =
    'You create concise engineering-facing issue one-liners from support tickets. Return JSON only.';

  const ticketsPayload = tickets.map(t => ({
    ticketId: t.ticketId,
    subject: t.subject,
    context: t.contextForSummary && t.contextForSummary.length > 0 ? t.contextForSummary : t.descriptionSnippet,
  }));

  const userPrompt = JSON.stringify({
    task: 'Generate one-line issue summaries for each ticket in English and Korean. Use the "context" field (description and optionally latest internal note or public reply) when provided.',
    outputShape: [
      {
        ticketId: 'number',
        oneLineSummary: 'short English sentence describing core issue',
        oneLineSummaryKo: 'short Korean sentence describing same core issue',
      },
    ],
    constraints: [
      'Output strict JSON array in the same order if possible',
      'One sentence each',
      'Do not add diagnostics or remediation steps',
      'Avoid hallucinating IDs or account details',
      'Keep both summaries semantically equivalent',
      'oneLineSummaryKo must be written in Korean with Hangul characters',
      'Prefer Korean support-ops wording (concise and actionable)',
    ],
    tickets: ticketsPayload,
  });

  const response = await createChatCompletion(client, {
    model,
    temperature: 0.1,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned an empty response for dev summaries');
  }

  const parsed = safeJsonParse<{ summaries?: DevSummaryAIOutput[] } | DevSummaryAIOutput[]>(content);
  const summaries = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.summaries)
      ? parsed.summaries
      : [];

  const normalized = summaries
    .filter(
      item =>
        typeof item?.ticketId === 'number' &&
        typeof item?.oneLineSummary === 'string',
    )
    .map(item => ({
      ticketId: item.ticketId,
      oneLineSummary: item.oneLineSummary.trim(),
      oneLineSummaryKo:
        typeof item.oneLineSummaryKo === 'string' && item.oneLineSummaryKo.trim() !== ''
          ? item.oneLineSummaryKo.trim()
          : item.oneLineSummary.trim(),
    }));

  if (normalized.length === 0) {
    const fallback = await Promise.all(
      tickets.map(async ticket => {
        const english = ticket.subject?.trim() || 'Issue reported by customer';
        const translated = await translateOneLineToKorean(client, model, english);
        return {
          ticketId: ticket.ticketId,
          oneLineSummary: english,
          oneLineSummaryKo: hasHangul(translated) ? translated : `한글 번역 필요: ${english}`,
        };
      }),
    );
    return fallback;
  }

  const koreanBackfillMap = await backfillKoreanSummaries(client, model, normalized);
  const finalized = await Promise.all(
    normalized.map(async item => {
      if (hasHangul(item.oneLineSummaryKo)) {
        return item;
      }

      const backfilled = koreanBackfillMap.get(item.ticketId);
      if (backfilled && hasHangul(backfilled)) {
        return { ...item, oneLineSummaryKo: backfilled };
      }

      const translated = await translateOneLineToKorean(client, model, item.oneLineSummary);
      if (translated && hasHangul(translated)) {
        return { ...item, oneLineSummaryKo: translated };
      }

      return { ...item, oneLineSummaryKo: `한글 번역 필요: ${item.oneLineSummary}` };
    }),
  );

  return finalized;
}
