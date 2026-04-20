// ─── Payment service abstraction ─────────────────────────────────────────────
//
// Designed around Stripe's API shape, but browser code must only ever see
// publishable keys plus a backend API base. Intent creation, refunds, and
// webhook processing remain server-side responsibilities.

import { env, isServerBackedPaymentsConfigured } from '../lib/env';

export type PaymentStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'succeeded'
  | 'canceled'
  | 'failed';

export type RefundStatus = 'pending' | 'succeeded' | 'failed' | 'canceled';

export interface PaymentIntent {
  id: string;
  amount: number; // cents
  currency: string;
  status: PaymentStatus;
  clientSecret?: string;
  chargeId?: string;
  metadata: Record<string, string>;
  createdAt: string;
}

export interface CheckoutLineItem {
  name: string;
  description?: string;
  quantity: number;
  unitAmount: number; // cents
  currency: string;
}

export interface CheckoutSession {
  id: string;
  paymentIntentId?: string;
  url?: string;
  status: 'open' | 'complete' | 'expired';
  amountTotal: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  createdAt: string;
}

export interface RefundResult {
  id: string;
  intentId: string;
  status: RefundStatus;
  amount: number;
  currency: string;
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
  createdAt: string;
}

export interface WebhookEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
  createdAt: string;
}

export class PaymentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly provider: string,
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

// ─── Service interface ────────────────────────────────────────────────────────

export interface PaymentService {
  readonly provider: string;
  isConfigured(): boolean;
  createPaymentIntent(
    amountCents: number,
    currency: string,
    metadata: Record<string, string>,
  ): Promise<PaymentIntent>;
  createCheckoutSession(
    lineItems: CheckoutLineItem[],
    successUrl: string,
    cancelUrl: string,
    metadata: Record<string, string>,
  ): Promise<CheckoutSession>;
  confirmPaymentIntent(intentId: string): Promise<PaymentIntent>;
  createRefund(
    intentId: string,
    amountCents?: number,
    reason?: RefundResult['reason'],
  ): Promise<RefundResult>;
  handleWebhook(rawBody: string, signatureHeader: string): Promise<WebhookEvent>;
}

// ─── Mock implementation (dev / no credentials) ───────────────────────────────

function mockId(prefix: string): string {
  return `${prefix}_mock_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

class MockPaymentService implements PaymentService {
  readonly provider = 'mock';

  isConfigured(): boolean {
    return false; // always signals unconfigured to prompt real setup
  }

  async createPaymentIntent(
    amountCents: number,
    currency: string,
    metadata: Record<string, string>,
  ): Promise<PaymentIntent> {
    return {
      id: mockId('pi'),
      amount: amountCents,
      currency,
      status: 'succeeded',
      chargeId: mockId('ch'),
      metadata,
      createdAt: nowIso(),
    };
  }

  async createCheckoutSession(
    lineItems: CheckoutLineItem[],
    successUrl: string,
    cancelUrl: string,
    metadata: Record<string, string>,
  ): Promise<CheckoutSession> {
    const amountTotal = lineItems.reduce((s, i) => s + i.unitAmount * i.quantity, 0);
    return {
      id: mockId('cs'),
      status: 'complete',
      amountTotal,
      currency: lineItems[0]?.currency ?? 'nzd',
      successUrl,
      cancelUrl,
      metadata,
      createdAt: nowIso(),
    };
  }

  async confirmPaymentIntent(intentId: string): Promise<PaymentIntent> {
    return {
      id: intentId,
      amount: 0,
      currency: 'nzd',
      status: 'succeeded',
      metadata: {},
      createdAt: nowIso(),
    };
  }

  async createRefund(
    intentId: string,
    amountCents?: number,
    reason?: RefundResult['reason'],
  ): Promise<RefundResult> {
    return {
      id: mockId('re'),
      intentId,
      status: 'succeeded',
      amount: amountCents ?? 0,
      currency: 'nzd',
      reason,
      createdAt: nowIso(),
    };
  }

  async handleWebhook(rawBody: string, _signatureHeader: string): Promise<WebhookEvent> {
    try {
      const parsed = JSON.parse(rawBody) as { id?: string; type?: string };
      return {
        id: parsed.id ?? mockId('evt'),
        type: parsed.type ?? 'unknown',
        data: { object: parsed },
        createdAt: nowIso(),
      };
    } catch {
      throw new PaymentError('Invalid webhook payload', 'invalid_payload', 'mock');
    }
  }
}

// ─── Stripe client stub (publishable key only) ────────────────────────────────
// createPaymentIntent and server-only operations must be called from a backend.
// This client stub uses the publishable key to initialize Stripe.js for
// client-side confirmation flows (e.g. stripe.confirmCardPayment).

class StripeClientService implements PaymentService {
  readonly provider = 'stripe';

  constructor(
    private readonly publishableKey: string,
    private readonly apiBaseUrl: string,
  ) {}

  isConfigured(): boolean {
    return this.publishableKey.startsWith('pk_') && Boolean(this.apiBaseUrl);
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    try {
      const response = await fetch(`${this.apiBaseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
      if (!response.ok) {
        throw new PaymentError(`Payment API request failed (${response.status})`, 'http_error', 'stripe');
      }
      return await response.json() as T;
    } catch (error) {
      if (error instanceof PaymentError) throw error;
      throw new PaymentError(
        `Payment API is unavailable at ${this.apiBaseUrl}.`,
        'network_error',
        'stripe',
      );
    }
  }

  async createPaymentIntent(
    amountCents: number,
    currency: string,
    metadata: Record<string, string>,
  ): Promise<PaymentIntent> {
    return this.request<PaymentIntent>('/payments/intents', {
      method: 'POST',
      body: JSON.stringify({
        amount: amountCents,
        currency,
        metadata,
        publishableKey: this.publishableKey,
      }),
    });
  }

  async createCheckoutSession(
    lineItems: CheckoutLineItem[],
    successUrl: string,
    cancelUrl: string,
    metadata: Record<string, string>,
  ): Promise<CheckoutSession> {
    return this.request<CheckoutSession>('/payments/checkout-sessions', {
      method: 'POST',
      body: JSON.stringify({
        lineItems,
        successUrl,
        cancelUrl,
        metadata,
      }),
    });
  }

  async confirmPaymentIntent(intentId: string): Promise<PaymentIntent> {
    return this.request<PaymentIntent>(`/payments/intents/${intentId}/confirm`, {
      method: 'POST',
    });
  }

  async createRefund(
    intentId: string,
    amountCents?: number,
    reason?: RefundResult['reason'],
  ): Promise<RefundResult> {
    return this.request<RefundResult>(`/payments/intents/${intentId}/refunds`, {
      method: 'POST',
      body: JSON.stringify({
        amount: amountCents,
        reason,
      }),
    });
  }

  async handleWebhook(rawBody: string, signatureHeader: string): Promise<WebhookEvent> {
    return this.request<WebhookEvent>('/payments/webhooks/parse', {
      method: 'POST',
      body: JSON.stringify({
        rawBody,
        signatureHeader,
      }),
    });
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createPaymentService(stripePublishableKey?: string): PaymentService {
  if (isServerBackedPaymentsConfigured() && stripePublishableKey && stripePublishableKey.startsWith('pk_')) {
    return new StripeClientService(stripePublishableKey, env.paymentApiBaseUrl);
  }
  return new MockPaymentService();
}

// Singleton — initialized with publishable key only (safe for client bundles)
export const paymentService: PaymentService = createPaymentService(
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY,
);
