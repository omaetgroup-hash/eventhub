import crypto from 'node:crypto';
import { serverEnv } from '../env';

function nowIso(): string {
  return new Date().toISOString();
}

function mockId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function createPaymentIntent(payload: {
  amount: number;
  currency: string;
  metadata: Record<string, string>;
  publishableKey?: string;
}) {
  if (!serverEnv.stripeSecretKey) {
    return {
      id: mockId('pi'),
      amount: payload.amount,
      currency: payload.currency,
      status: 'succeeded',
      clientSecret: undefined,
      metadata: payload.metadata,
      createdAt: nowIso(),
    };
  }

  const params = new URLSearchParams();
  params.set('amount', String(payload.amount));
  params.set('currency', payload.currency);
  for (const [key, value] of Object.entries(payload.metadata)) {
    params.set(`metadata[${key}]`, value);
  }

  const response = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serverEnv.stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    throw new Error((body.error as { message?: string } | undefined)?.message ?? 'Stripe payment intent failed.');
  }

  return {
    id: String(body.id),
    amount: Number(body.amount ?? payload.amount),
    currency: String(body.currency ?? payload.currency),
    status: String(body.status ?? 'requires_payment_method'),
    clientSecret: typeof body.client_secret === 'string' ? body.client_secret : undefined,
    metadata: payload.metadata,
    createdAt: nowIso(),
  };
}

export async function createCheckoutSession(payload: {
  lineItems: Array<{ name: string; description?: string; quantity: number; unitAmount: number; currency: string }>;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  idempotencyKey?: string;
}) {
  if (!serverEnv.stripeSecretKey) {
    const amountTotal = payload.lineItems.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0);
    return {
      id: mockId('cs'),
      paymentIntentId: mockId('pi'),
      status: 'complete' as const,
      amountTotal,
      currency: payload.lineItems[0]?.currency ?? 'nzd',
      successUrl: payload.successUrl,
      cancelUrl: payload.cancelUrl,
      metadata: payload.metadata,
      createdAt: nowIso(),
      url: undefined,
    };
  }

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', payload.successUrl);
  params.set('cancel_url', payload.cancelUrl);
  payload.lineItems.forEach((item, index) => {
    params.set(`line_items[${index}][price_data][currency]`, item.currency);
    params.set(`line_items[${index}][price_data][unit_amount]`, String(item.unitAmount));
    params.set(`line_items[${index}][price_data][product_data][name]`, item.name);
    params.set(`line_items[${index}][quantity]`, String(item.quantity));
    if (item.description) {
      params.set(`line_items[${index}][price_data][product_data][description]`, item.description);
    }
  });
  for (const [key, value] of Object.entries(payload.metadata)) {
    params.set(`metadata[${key}]`, value);
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${serverEnv.stripeSecretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (payload.idempotencyKey) {
    headers['Idempotency-Key'] = payload.idempotencyKey;
  }

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers,
    body: params,
  });

  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    throw new Error((body.error as { message?: string } | undefined)?.message ?? 'Stripe checkout session failed.');
  }

  return {
    id: String(body.id),
    paymentIntentId: typeof body.payment_intent === 'string' ? body.payment_intent : undefined,
    status: 'open' as const,
    amountTotal: Number(body.amount_total ?? 0),
    currency: String(body.currency ?? payload.lineItems[0]?.currency ?? 'nzd'),
    successUrl: payload.successUrl,
    cancelUrl: payload.cancelUrl,
    metadata: payload.metadata,
    createdAt: nowIso(),
    url: typeof body.url === 'string' ? body.url : undefined,
  };
}

export async function createRefund(intentId: string, amount?: number, reason?: string) {
  if (!serverEnv.stripeSecretKey) {
    return {
      id: mockId('re'),
      intentId,
      status: 'succeeded',
      amount: amount ?? 0,
      currency: 'nzd',
      reason,
      createdAt: nowIso(),
    };
  }

  const params = new URLSearchParams();
  params.set('payment_intent', intentId);
  if (amount) params.set('amount', String(amount));
  if (reason) params.set('reason', reason);

  const response = await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serverEnv.stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    throw new Error((body.error as { message?: string } | undefined)?.message ?? 'Stripe refund failed.');
  }

  return {
    id: String(body.id),
    intentId,
    status: String(body.status ?? 'pending'),
    amount: Number(body.amount ?? 0),
    currency: String(body.currency ?? 'nzd'),
    reason,
    createdAt: nowIso(),
  };
}

export function parseWebhook(rawBody: string, signatureHeader: string) {
  if (serverEnv.stripeWebhookSecret) {
    // Stripe header format: t=TIMESTAMP,v1=SIGNATURE
    const parts = signatureHeader.split(',');
    const tPart = parts.find((p) => p.startsWith('t='));
    const v1Part = parts.find((p) => p.startsWith('v1='));
    if (!tPart || !v1Part) throw new Error('Invalid Stripe webhook signature header.');
    const timestamp = tPart.slice(2);
    const expected = v1Part.slice(3);
    const signedPayload = `${timestamp}.${rawBody}`;
    const computed = crypto
      .createHmac('sha256', serverEnv.stripeWebhookSecret)
      .update(signedPayload)
      .digest('hex');
    if (computed !== expected) {
      throw new Error('Invalid Stripe webhook signature.');
    }
  }

  const parsed = JSON.parse(rawBody) as { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  return {
    id: parsed.id ?? mockId('evt'),
    type: parsed.type ?? 'unknown',
    data: {
      object: parsed.data?.object ?? parsed,
    },
    createdAt: nowIso(),
  };
}
