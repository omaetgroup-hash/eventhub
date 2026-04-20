import { serverEnv } from '../env';
import { logger } from '../logger';

export type ServerEmailTemplate =
  | 'auth_code'
  | 'order_confirmation'
  | 'ticket_issued'
  | 'refund_confirmation'
  | 'organizer_invite'
  | 'event_reminder';

export interface ServerSendResult {
  id: string;
  template: ServerEmailTemplate;
  to: string;
  status: 'sent' | 'failed';
  provider: string;
  error?: string;
  sentAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function mockId(): string {
  return `email_${Math.random().toString(36).slice(2, 10)}`;
}

function dollars(amount: number): string {
  return `$${Number(amount).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-NZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function wrap(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#f5f5f5;margin:0;padding:24px}
.card{background:#fff;border-radius:12px;max-width:600px;margin:0 auto;padding:32px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
h1{font-size:22px;margin:0 0 8px}h2{font-size:16px;margin:24px 0 8px}
p{margin:8px 0;color:#444;line-height:1.5}.muted{color:#888;font-size:13px}
.ticket{background:#f9f9f9;border-radius:8px;padding:16px;margin:12px 0}
.code{font-family:monospace;font-size:28px;letter-spacing:4px;background:#f0f4ff;padding:12px 24px;border-radius:8px;display:inline-block;margin:12px 0}
.qr{font-family:monospace;font-size:11px;color:#555;word-break:break-all}
table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:6px 0;border-bottom:1px solid #eee}td:last-child{text-align:right;font-weight:600}
.btn{display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px}
footer{text-align:center;margin-top:24px;color:#aaa;font-size:12px}</style></head>
<body><div class="card">${body}<footer>EventHub · Aotearoa's event ticketing platform</footer></div></body></html>`;
}

function buildHtml(template: ServerEmailTemplate, payload: Record<string, unknown>): { subject: string; html: string; text: string } {
  switch (template) {
    case 'auth_code': {
      const code = String(payload.code ?? '');
      const name = String(payload.name ?? 'there');
      const subject = 'Your EventHub sign-in code';
      const html = wrap(subject, `
        <h1>Sign in to EventHub</h1>
        <p>Hi ${name}, here is your one-time sign-in code:</p>
        <div class="code">${code}</div>
        <p class="muted">This code expires in 10 minutes. Do not share it with anyone.</p>
      `);
      return { subject, html, text: `Your EventHub sign-in code is ${code}.` };
    }

    case 'order_confirmation': {
      const { orderId, buyerName, eventName, eventDate, venueName, tierName, quantity, total, currency, tickets } = payload as Record<string, unknown>;
      const subject = `Order confirmed – ${eventName}`;
      const ticketRows = Array.isArray(tickets) ? tickets.map((t: Record<string, unknown>) =>
        `<div class="ticket"><strong>${t.holderName}</strong><p class="muted">${t.id}</p><div class="qr">${t.qrPayload}</div></div>`
      ).join('') : '';
      const html = wrap(subject, `
        <h1>You're going!</h1>
        <p>Hi ${buyerName}, your order for <strong>${eventName}</strong> is confirmed.</p>
        <table>
          <tr><td>Event</td><td>${eventName}</td></tr>
          <tr><td>Date</td><td>${formatDate(String(eventDate ?? ''))}</td></tr>
          <tr><td>Venue</td><td>${venueName}</td></tr>
          <tr><td>Tier</td><td>${tierName}</td></tr>
          <tr><td>Quantity</td><td>${quantity}</td></tr>
          <tr><td>Total</td><td>${dollars(Number(total))} ${currency}</td></tr>
          <tr><td>Order ID</td><td class="muted">${orderId}</td></tr>
        </table>
        <h2>Your tickets</h2>${ticketRows}
        <p class="muted">Present each QR code at the door. Screenshot them now in case you lose connectivity.</p>
      `);
      return { subject, html, text: `Order confirmed for ${eventName}. Order ID: ${orderId}. Quantity: ${quantity}. Total: ${dollars(Number(total))} ${currency}.` };
    }

    case 'ticket_issued': {
      const { holderName, eventName, eventDate, tierName, ticketId, qrPayload } = payload as Record<string, unknown>;
      const subject = `Your ticket – ${eventName}`;
      const html = wrap(subject, `
        <h1>Your ticket is ready</h1>
        <p>Hi ${holderName}, your ticket for <strong>${eventName}</strong> has been issued.</p>
        <table>
          <tr><td>Event</td><td>${eventName}</td></tr>
          <tr><td>Date</td><td>${formatDate(String(eventDate ?? ''))}</td></tr>
          <tr><td>Tier</td><td>${tierName}</td></tr>
        </table>
        <div class="ticket">
          <strong>${holderName}</strong>
          <p class="muted">${ticketId}</p>
          <div class="qr">${qrPayload}</div>
        </div>
        <p class="muted">Present this QR code at the door.</p>
      `);
      return { subject, html, text: `Your ticket for ${eventName} is ready. Ticket ID: ${ticketId}.` };
    }

    case 'refund_confirmation': {
      const { buyerName, orderId, eventName, amount, currency } = payload as Record<string, unknown>;
      const subject = `Refund processed – ${eventName}`;
      const html = wrap(subject, `
        <h1>Refund processed</h1>
        <p>Hi ${buyerName}, your refund for <strong>${eventName}</strong> has been processed.</p>
        <table>
          <tr><td>Order ID</td><td class="muted">${orderId}</td></tr>
          <tr><td>Refund amount</td><td>${dollars(Number(amount))} ${currency}</td></tr>
        </table>
        <p class="muted">Refunds typically appear on your statement within 5–10 business days.</p>
      `);
      return { subject, html, text: `Refund of ${dollars(Number(amount))} ${currency} processed for order ${orderId}.` };
    }

    case 'organizer_invite': {
      const { name, inviterName, role, acceptUrl } = payload as Record<string, unknown>;
      const subject = `You've been invited to EventHub`;
      const html = wrap(subject, `
        <h1>You've been invited</h1>
        <p>Hi ${name ?? 'there'}, <strong>${inviterName}</strong> has invited you to join EventHub as <strong>${role}</strong>.</p>
        <a class="btn" href="${acceptUrl}">Accept invitation</a>
        <p class="muted">This invitation expires in 72 hours. If you did not expect this, you can safely ignore it.</p>
      `);
      return { subject, html, text: `You've been invited to EventHub as ${role} by ${inviterName}. Accept at: ${acceptUrl}` };
    }

    case 'event_reminder': {
      const { buyerName, eventName, eventDate, venueName, ticketCount } = payload as Record<string, unknown>;
      const subject = `Reminder: ${eventName} is tomorrow`;
      const html = wrap(subject, `
        <h1>Your event is coming up!</h1>
        <p>Hi ${buyerName}, just a reminder that <strong>${eventName}</strong> is almost here.</p>
        <table>
          <tr><td>Date</td><td>${formatDate(String(eventDate ?? ''))}</td></tr>
          <tr><td>Venue</td><td>${venueName}</td></tr>
          <tr><td>Tickets</td><td>${ticketCount}</td></tr>
        </table>
        <p class="muted">Have your QR tickets ready at the door. Check your previous order confirmation email for your QR codes.</p>
      `);
      return { subject, html, text: `Reminder: ${eventName} at ${venueName} on ${eventDate}. You have ${ticketCount} ticket(s).` };
    }
  }
}

async function sendViaResend(template: ServerEmailTemplate, to: string, subject: string, html: string, text: string): Promise<ServerSendResult> {
  const sentAt = nowIso();
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serverEnv.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: serverEnv.emailSender, to, subject, html, text }),
    });

    if (response.ok) {
      const body = await response.json() as { id?: string };
      return { id: body.id ?? mockId(), template, to, status: 'sent', provider: 'resend', sentAt };
    }

    const isRetryable = response.status >= 500 || response.status === 429;
    if (!isRetryable || attempt === 3) {
      const errorBody = await response.text();
      return { id: mockId(), template, to, status: 'failed', provider: 'resend', error: errorBody, sentAt };
    }

    await new Promise((r) => setTimeout(r, attempt * 1000));
  }

  return { id: mockId(), template, to, status: 'failed', provider: 'resend', error: 'Max retries exceeded', sentAt: nowIso() };
}

export async function sendTransactionalEmail(
  template: ServerEmailTemplate,
  to: string,
  payload: Record<string, unknown>,
): Promise<ServerSendResult> {
  const { subject, html, text } = buildHtml(template, payload);

  if (!serverEnv.resendApiKey) {
    logger.info('email.mock_send', { template, to, subject });
    return { id: mockId(), template, to, status: 'sent', provider: 'mock', sentAt: nowIso() };
  }

  return sendViaResend(template, to, subject, html, text);
}
