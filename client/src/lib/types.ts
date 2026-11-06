// Shapes returned by the PayLite API. Money is always integer paise.

export interface User {
  id: string;
  name: string;
  email: string;
  handle: string;
  hasPin: boolean;
}

export interface Counterparty {
  name: string;
  handle: string | null;
}

export interface Wallet {
  balancePaise: number;
  topupMode: 'razorpay' | 'demo';
  limits: {
    maxTransferPaise: number;
    dailySendPaise: number;
    sentTodayPaise: number;
    remainingTodayPaise: number;
    maxTopupPaise: number;
  };
}

export interface Receipt {
  transaction: {
    id: string;
    reference: string;
    type: 'transfer' | 'topup' | 'request_payment';
    direction: 'sent' | 'received';
    amountPaise: number;
    note: string;
    createdAt: string;
    counterparty: Counterparty;
    category: string | null;
  };
  balancePaise: number;
}

export interface HistoryItem {
  id: string;
  transactionId: string;
  reference: string;
  type: 'transfer' | 'topup' | 'request_payment';
  direction: 'sent' | 'received';
  amountPaise: number;
  balanceAfterPaise: number;
  note: string;
  category: string | null;
  createdAt: string;
  counterparty: Counterparty;
}

export interface PaymentRequest {
  id: string;
  direction: 'incoming' | 'outgoing';
  amountPaise: number;
  note: string;
  status: 'pending' | 'paid' | 'declined' | 'cancelled' | 'expired';
  createdAt: string;
  expiresAt: string;
  counterparty: Counterparty | null;
}

export interface LedgerCheck {
  cachedBalancePaise: number;
  ledgerBalancePaise: number;
  entries: number;
  matches: boolean;
}

export type BudgetStatus = 'ok' | 'warning' | 'exceeded';

export interface Budget {
  id: string;
  category: string;
  month: string;
  amountPaise: number;
  spentPaise: number;
  remainingPaise: number;
  percentUsed: number;
  status: BudgetStatus;
}

export interface Insights {
  month: string;
  spentPaise: number;
  receivedPaise: number;
  spentChangePercent: number | null;
  byCategory: { category: string; totalPaise: number; count: number }[];
  trend: { month: string; spentPaise: number; receivedPaise: number }[];
  topPayees: { name: string; handle: string | null; totalPaise: number; count: number }[];
  budgets: Budget[];
  alerts: Budget[];
}

export interface TopupOrder {
  orderId: string;
  amountPaise: number;
  currency: 'INR';
  keyId: string;
  prefill: { name: string; email: string };
}

// Must match server/src/lib/categories.js
export const EXPENSE_CATEGORIES = [
  'Food & Dining',
  'Groceries',
  'Shopping',
  'Travel',
  'Transport',
  'Bills & Utilities',
  'Rent',
  'Entertainment',
  'Health',
  'Education',
  'Friends & Family',
  'Other',
] as const;

export const CATEGORY_ICONS: Record<string, string> = {
  'Food & Dining': '🍽️',
  Groceries: '🛒',
  Shopping: '🛍️',
  Travel: '✈️',
  Transport: '🚕',
  'Bills & Utilities': '💡',
  Rent: '🏠',
  Entertainment: '🎬',
  Health: '🩺',
  Education: '📚',
  'Friends & Family': '👪',
  Other: '📦',
  Income: '💰',
  'Wallet top-up': '🏦',
};
