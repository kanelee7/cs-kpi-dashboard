'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSearchParams } from 'next/navigation';

type DevSummaryRow = {
  ticketId: number;
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
};

type DevSummaryResponse = {
  count: number;
  items: DevSummaryRow[];
};

type TicketComment = {
  plain_body: string;
  author_id: number | null;
  created_at: string;
  public: boolean;
};

function getStatusUI(status: string): { label: string; className: string } {
  const normalized = status.toLowerCase();
  if (normalized === 'open') {
    return {
      label: 'OPEN',
      className: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300',
    };
  }
  if (normalized === 'in_progress') {
    return {
      label: 'IN PROGRESS',
      className: 'border-amber-500/40 bg-amber-500/15 text-amber-200',
    };
  }
  return {
    label: status.toUpperCase(),
    className: 'border-gray-600 bg-gray-600/20 text-gray-200',
  };
}

function formatKo(row: DevSummaryRow): string {
  return [
    row.oneLineSummaryKo || row.oneLineSummary,
    `UID: ${row.uid}`,
    `지갑 주소: ${row.wallet}`,
    `스킨 ID / TXH / Merchant ID / Drago ID: ${row.skinId} / ${row.txh} / ${row.merchantId} / ${row.dragoId}`,
  ].join('\n');
}

export default function DevSummaryTool() {
  const searchParams = useSearchParams();
  const brand = (searchParams?.get('brand') || 'all').trim().toLowerCase();
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<DevSummaryRow[]>([]);
  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState<10 | 20>(10);
  const [page, setPage] = useState(1);
  const [koFormat, setKoFormat] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [detailTicketId, setDetailTicketId] = useState<number | null>(null);
  const [detailComments, setDetailComments] = useState<TicketComment[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = useCallback(async (forceRefresh = false) => {
    if (forceRefresh) {
      setSyncing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await fetch(
        `/api/dev-summary?limit=100&brand=${encodeURIComponent(brand)}&forceRefresh=${forceRefresh ? 'true' : 'false'}`,
      );
      if (!response.ok) {
        let message = 'Failed to fetch ticket summaries';
        try {
          const payload = (await response.json()) as { error?: string };
          if (payload?.error) {
            message = payload.error;
          }
        } catch {
          // use fallback
        }
        throw new Error(message);
      }
      const payload = (await response.json()) as DevSummaryResponse;
      setRows(Array.isArray(payload.items) ? payload.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [brand]);

  useEffect(() => {
    load();
  }, [load]);

  const copy = async (row: DevSummaryRow) => {
    const text = koFormat ? formatKo(row) : row.summary;
    await navigator.clipboard.writeText(text);
    setCopiedId(row.ticketId);
    window.setTimeout(() => setCopiedId(null), 1200);
  };

  const openTicketDetail = useCallback(async (ticketId: number) => {
    setDetailTicketId(ticketId);
    setDetailError(null);
    setDetailComments([]);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/ticket-comments?ticketId=${ticketId}`);
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data?.error ?? 'Failed to load comments');
      }
      const data = (await res.json()) as { comments: TicketComment[] };
      const list = Array.isArray(data.comments) ? data.comments : [];
      const sorted = [...list].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      setDetailComments(sorted);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Failed to load conversation');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeTicketDetail = useCallback(() => {
    setDetailTicketId(null);
    setDetailComments([]);
    setDetailError(null);
  }, []);

  function formatCommentDate(iso: string): string {
    try {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
    } catch {
      return iso;
    }
  }

  useEffect(() => {
    if (detailTicketId === null) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeTicketDetail();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [detailTicketId, closeTicketDetail]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(row =>
      [row.ticketId, row.status, row.subject, row.oneLineSummary, row.uid, row.wallet, row.txh, row.merchantId]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query]);

  useEffect(() => {
    setPage(1);
  }, [pageSize, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-gray-700 bg-[#232424] text-white">
        <CardHeader>
          <CardTitle>Ticket Management Error</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => load()} className="rounded-md border border-gray-600 px-3 py-1.5 text-xs hover:bg-[#2b3030]">
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search by ticket, UID, wallet, hash..."
          className="rounded-md border border-gray-600 bg-[#232424] px-3 py-2 text-sm text-white md:col-span-2"
        />
        <select
          value={pageSize}
          onChange={event => setPageSize(Number(event.target.value) as 10 | 20)}
          className="rounded-md border border-gray-600 bg-[#232424] px-3 py-2 text-sm text-white"
        >
          <option value={10}>10개씩 보기</option>
          <option value={20}>20개씩 보기</option>
        </select>
        <div className="flex items-center justify-between rounded-md border border-gray-600 bg-[#232424] px-3">
          <label className="text-xs text-gray-300">한국어 포맷</label>
          <input type="checkbox" checked={koFormat} onChange={event => setKoFormat(event.target.checked)} />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>
          Showing {paged.length} of {filtered.length} filtered (total {rows.length})
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => load(true)}
            disabled={syncing}
            className="rounded-md border border-gray-600 px-2 py-1 hover:bg-[#2b3030] disabled:opacity-50"
          >
            {syncing ? 'Recomputing...' : 'Refresh'}
          </button>
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setPage(prev => Math.max(1, prev - 1))}
            className="rounded-md border border-gray-600 px-2 py-1 disabled:opacity-40"
          >
            Prev
          </button>
          <span>
            {currentPage}/{totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
            className="rounded-md border border-gray-600 px-2 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>

      {paged.map(row => (
        <Card key={row.ticketId} className="border-gray-700 bg-[#232424] text-white">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Ticket #{row.ticketId}</CardTitle>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold tracking-wide ${getStatusUI(row.status).className}`}
              >
                {getStatusUI(row.status).label}
              </span>
            </div>
            <p className="text-sm text-gray-400">{row.subject}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border border-gray-700 p-3 text-sm">
              {koFormat ? row.oneLineSummaryKo || row.oneLineSummary : row.oneLineSummary}
            </div>
            <div className="grid gap-2 rounded-md border border-gray-700 p-3 text-xs text-gray-300 md:grid-cols-2">
              <div>
                <span className="text-gray-400">UID</span>
                <p className="mt-1 break-all text-gray-200">{row.uid || '-'}</p>
              </div>
              <div>
                <span className="text-gray-400">Wallet</span>
                <p className="mt-1 break-all text-gray-200">{row.wallet || '-'}</p>
              </div>
              <div>
                <span className="text-gray-400">Skin ID</span>
                <p className="mt-1 break-all text-gray-200">{row.skinId || '-'}</p>
              </div>
              <div>
                <span className="text-gray-400">TXH</span>
                <p className="mt-1 break-all text-gray-200">{row.txh || '-'}</p>
              </div>
              <div>
                <span className="text-gray-400">Merchant ID</span>
                <p className="mt-1 break-all text-gray-200">{row.merchantId || '-'}</p>
              </div>
              <div>
                <span className="text-gray-400">Drago ID</span>
                <p className="mt-1 break-all text-gray-200">{row.dragoId || '-'}</p>
              </div>
            </div>
            <pre className="whitespace-pre-wrap rounded-md border border-gray-700 p-3 text-xs text-gray-300">
              {koFormat ? formatKo(row) : row.summary}
            </pre>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => openTicketDetail(row.ticketId)}
                className="rounded-md border border-gray-600 px-3 py-1.5 text-xs hover:bg-[#2b3030]"
              >
                View conversation
              </button>
              <button
                onClick={() => copy(row)}
                className="rounded-md border border-gray-600 px-3 py-1.5 text-xs hover:bg-[#2b3030]"
              >
                {copiedId === row.ticketId ? 'Copied' : 'Copy'}
              </button>
            </div>
          </CardContent>
        </Card>
      ))}

      {detailTicketId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ticket-detail-title"
          onClick={event => {
            if (event.target === event.currentTarget) {
              closeTicketDetail();
            }
          }}
        >
          <div className="flex max-h-[70vh] w-full max-w-2xl flex-col rounded-lg border border-gray-700 bg-[#232424] text-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-700 p-4">
              <h2 id="ticket-detail-title" className="text-lg font-semibold">
                Ticket #{detailTicketId} — Conversation
              </h2>
              <button
                type="button"
                onClick={closeTicketDetail}
                className="rounded border border-gray-600 px-3 py-1.5 text-sm hover:bg-[#2b3030]"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {detailLoading && (
                <p className="text-sm text-gray-400">Loading conversation…</p>
              )}
              {detailError && (
                <p className="text-sm text-red-400">{detailError}</p>
              )}
              {!detailLoading && !detailError && detailComments.length === 0 && (
                <p className="text-sm text-gray-400">No conversation available.</p>
              )}
              {!detailLoading && !detailError && detailComments.length > 0 && (
                <ul className="space-y-4">
                  {detailComments.map((comment, idx) => (
                    <li
                      key={idx}
                      className={`rounded-md border p-3 text-sm ${
                        comment.public
                          ? 'border-gray-600 bg-gray-800/40'
                          : 'border-amber-600/50 bg-amber-900/20'
                      }`}
                    >
                      <div className="mb-2 flex items-center gap-2 text-xs text-gray-400">
                        <time dateTime={comment.created_at}>
                          {formatCommentDate(comment.created_at)}
                        </time>
                        {comment.author_id != null && (
                          <span>Author ID: {comment.author_id}</span>
                        )}
                        {!comment.public && (
                          <span className="rounded bg-amber-600/40 px-1.5 py-0.5 font-medium text-amber-200">
                            Internal note
                          </span>
                        )}
                      </div>
                      <pre className="whitespace-pre-wrap break-words text-gray-200">
                        {comment.plain_body || '(empty)'}
                      </pre>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
