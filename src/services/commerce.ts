import type { EmailLog, IssuedTicket, OrderRecord, PaymentRecord } from '../lib/domain';
import { apiRequest } from './api';

export interface CommerceCheckoutPayload {
  eventId: string;
  tierId: string;
  buyerName: string;
  buyerEmail: string;
  quantity: number;
  presaleCode?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CommerceCheckoutResult {
  order: OrderRecord;
  tickets: IssuedTicket[];
  paymentRecord: PaymentRecord;
  checkoutSession: {
    id: string;
    status: 'open' | 'complete' | 'expired';
    amountTotal: number;
    currency: string;
    successUrl: string;
    cancelUrl: string;
    metadata: Record<string, string>;
    createdAt: string;
    url?: string;
  };
  emailLog: EmailLog | null;
}

export interface AccountOrdersResult {
  orders: OrderRecord[];
  issuedTickets: IssuedTicket[];
  paymentRecords: PaymentRecord[];
}

export async function completeCheckout(payload: CommerceCheckoutPayload): Promise<CommerceCheckoutResult> {
  return apiRequest<CommerceCheckoutResult>('/commerce/orders', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function lookupAccountOrders(email: string): Promise<AccountOrdersResult> {
  const query = new URLSearchParams({ email }).toString();
  return apiRequest<AccountOrdersResult>(`/account/orders?${query}`);
}
