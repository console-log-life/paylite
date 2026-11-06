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
