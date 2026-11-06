import type { HistoryItem, Insights, LedgerCheck, PaymentRequest, Receipt, TopupOrder, User, Wallet } from './types';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');
const TOKEN_KEY = 'paylite-token';

export class ApiError extends Error {
  status: number;
  code: string;
  extra: Record<string, unknown>;

  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }

  // Per-field messages from the server's validation, if any.
  get fields(): Record<string, string> {
    return (this.extra.fields as Record<string, string>) || {};
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked (private mode): the session lasts for this tab only.
  }
}

let onSessionExpired = () => {};
export const setSessionExpiredHandler = (fn: () => void) => {
  onSessionExpired = fn;
};

interface Options {
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
}

async function call<T>(path: string, { method = 'GET', body, idempotencyKey }: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach PayLite. Check your connection.');
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { code = 'ERROR', message = 'Something went wrong', ...extra } = data.error || {};
    // Only a real session problem logs the user out (a wrong PIN is a 403).
    if (res.status === 401 && code === 'UNAUTHORIZED' && token) onSessionExpired();
    throw new ApiError(res.status, code, message, extra);
  }
  return data as T;
}

// For requests that move money. A fresh Idempotency-Key is made once per
// attempt and re-sent if the network drops, so a retry can never pay twice:
// the server recognises the key and returns the original result.
async function moneyCall<T>(path: string, body: unknown): Promise<T> {
  const idempotencyKey = crypto.randomUUID();
  for (let attempt = 1; ; attempt++) {
    try {
      return await call<T>(path, { method: 'POST', body, idempotencyKey });
    } catch (err) {
      const retryable = err instanceof ApiError && (err.code === 'NETWORK' || err.code === 'REQUEST_IN_PROGRESS');
      if (!retryable || attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
}

export const api = {
  register: (body: { name: string; email: string; password: string }) =>
    call<{ token: string; user: User }>('/api/auth/register', { method: 'POST', body }),
  login: (body: { email: string; password: string }) =>
    call<{ token: string; user: User }>('/api/auth/login', { method: 'POST', body }),
  me: () => call<{ user: User }>('/api/auth/me'),
  setPin: (body: { pin: string; password: string }) => call<{ ok: true }>('/api/auth/pin', { method: 'PUT', body }),

  wallet: () => call<Wallet>('/api/wallet'),
  verifyLedger: () => call<LedgerCheck>('/api/wallet/verify'),
  topup: (amount: string) => moneyCall<Receipt>('/api/wallet/topup', { amount }),
  topupOrder: (amount: string) => call<TopupOrder>('/api/wallet/topup/order', { method: 'POST', body: { amount } }),
  topupVerify: (body: { orderId: string; paymentId: string; signature: string }) =>
    call<Receipt>('/api/wallet/topup/verify', { method: 'POST', body }),

  lookup: (to: string) =>
    call<{ name: string; handle: string; isSelf: boolean }>(`/api/transfers/lookup?to=${encodeURIComponent(to)}`),
  transfer: (body: { to: string; amount: string; note: string; pin: string; category: string }) =>
    moneyCall<Receipt>('/api/transfers', body),
  suggestCategory: (to: string, note: string) =>
    call<{ category: string; source: 'note' | 'history' | 'default' }>(
      `/api/transfers/suggest-category?to=${encodeURIComponent(to)}&note=${encodeURIComponent(note)}`,
    ),
  setCategory: (entryId: string, category: string) =>
    call<{ id: string; category: string }>(`/api/transactions/${entryId}/category`, { method: 'PATCH', body: { category } }),

  insights: (month: string) => call<Insights>(`/api/insights?month=${month}`),
  saveBudget: (body: { category: string; month: string; amount: string }) =>
    call<{ budget: { id: string } }>('/api/insights/budgets', { method: 'PUT', body }),
  deleteBudget: (id: string) => call<void>(`/api/insights/budgets/${id}`, { method: 'DELETE' }),

  requests: (box: 'incoming' | 'outgoing') => call<{ items: PaymentRequest[] }>(`/api/requests?box=${box}`),
  createRequest: (body: { from: string; amount: string; note: string }) =>
    call<{ request: PaymentRequest }>('/api/requests', { method: 'POST', body }),
  payRequest: (id: string, pin: string) => moneyCall<Receipt>(`/api/requests/${id}/pay`, { pin }),
  declineRequest: (id: string) => call<{ request: PaymentRequest }>(`/api/requests/${id}/decline`, { method: 'POST' }),
  cancelRequest: (id: string) => call<{ request: PaymentRequest }>(`/api/requests/${id}/cancel`, { method: 'POST' }),

  history: (params: { cursor?: string | null; limit?: number; direction?: string }) => {
    const q = new URLSearchParams();
    if (params.cursor) q.set('cursor', params.cursor);
    if (params.limit) q.set('limit', String(params.limit));
    if (params.direction) q.set('direction', params.direction);
    return call<{ items: HistoryItem[]; nextCursor: string | null }>(`/api/transactions?${q}`);
  },

  // Fetches the CSV with the auth header, then hands it to the browser as a file.
  async downloadStatement(from: string, to: string) {
    const res = await fetch(`${API_URL}/api/transactions/statement?from=${from}&to=${to}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(res.status, data.error?.code || 'ERROR', data.error?.message || 'Could not download');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `paylite-statement-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
};
