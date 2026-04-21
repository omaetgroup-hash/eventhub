import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import { sendAlert } from './alerts';
import { logger, requestLogger } from './logger';
import {
  acceptTeamInvite, appendAudit, bootstrapFirstAdmin, consumeAuthCode, countSuperAdmins, countUsers, createAuthCode, createOrUpdateUser, createSession, deleteSession, deleteSessionsForUser,
  findUserByEmail, getAuthFailureState, getAuthRequestState, getOrder, getEvent, getTier, getVenue, getPublicSnapshot, getSession, getSnapshot, getTeamInviteByToken, invalidateOutstandingAuthCodes,
  insertEmailLog, listAccountOrders, recordAuthAttempt, saveSnapshot, fulfillOrder, transitionOrderStatus, getPaymentRecordByIntentId, updatePaymentRecordStatus, getDb,
} from './db';
import { serverEnv } from './env';
import { authTokenFrom, requireSession, requireSuperAdmin, type AuthRequest } from './middleware';
import { sendTransactionalEmail } from './services/email';
import { createCheckoutSession, createPaymentIntent, createRefund, parseWebhook } from './services/payment';
import { requireJsonBody } from './validation';

import eventsRouter from './routes/events';
import venuesRouter from './routes/venues';
import ordersRouter from './routes/orders';
import ticketsRouter from './routes/tickets';
import auditRouter from './routes/audit';
import marketingRouter from './routes/marketing';
import teamRouter from './routes/team';
import commerceRouter from './routes/commerce';
import publicRouter from './routes/public';
import accountRouter from './routes/account';
import gatesRouter from './routes/gates';
import queueRouter from './routes/queue';
import adminRouter from './routes/admin';
import reportsRouter from './routes/reports';
import growthRouter from './routes/growth';
import conferenceRouter from './routes/conference';
import monetizationRouter from './routes/monetization';

function nowIso(): string { return new Date().toISOString(); }
function randomCode(): string { return String(Math.floor(100000 + Math.random() * 900000)); }
function randomToken(): string { return crypto.randomBytes(24).toString('hex'); }
function requestIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]!.trim();
  }
  return req.ip || '127.0.0.1';
}


// ─── CORS allowlist ───────────────────────────────────────────────────────────

const allowedOrigins: Set<string> | null = (() => {
  const raw = serverEnv.corsOrigins;
  if (!raw) return null;
  return new Set(raw.split(',').map((o) => o.trim()).filter(Boolean));
})();

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) { callback(null, true); return; }
    if (!allowedOrigins) {
      // In dev with no CORS_ORIGINS set, allow any localhost
      const isLocalhost = /^https?:\/\/localhost(:\d+)?$/.test(origin);
      callback(isLocalhost ? null : new Error('CORS: origin not allowed'), isLocalhost);
    } else {
      const allowed = allowedOrigins.has(origin);
      callback(allowed ? null : new Error('CORS: origin not allowed'), allowed);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
};

const app = express();

// ─── Security headers ────────────────────────────────────────────────────────
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(requestLogger);

// Stripe webhook must read the raw body before JSON parsing touches it.
app.post(
  `${serverEnv.apiBasePath}/payments/stripe/webhook`,
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = String(req.headers['stripe-signature'] ?? '');
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : String(req.body);
    let event: ReturnType<typeof parseWebhook>;
    try {
      event = parseWebhook(rawBody, sig);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Webhook parse failed.' });
      return;
    }

    try {
      const obj = event.data.object as Record<string, unknown>;

      if (event.type === 'checkout.session.completed') {
        const metadata = (obj.metadata ?? {}) as Record<string, string>;
        const orderId = metadata.orderId;
        const intentId = String(obj.payment_intent ?? '');
        if (orderId) {
          const order = getOrder(orderId);
          if (order && order.status === 'pending') {
            const existing = getPaymentRecordByIntentId(intentId);
            if (existing) updatePaymentRecordStatus(orderId, 'succeeded', JSON.stringify({ intentId }));

            const event_ = getEvent(order.eventId);
            const tier = getTier(order.tierId);
            const venue = event_?.venueId ? getVenue(event_.venueId) : null;

            const tickets = Array.from({ length: order.quantity }, () => {
              const id = `tkt_${crypto.randomBytes(4).toString('hex')}`;
              const checksum = crypto.createHash('sha1').update(`${order.eventId}:${id}:${serverEnv.qrChecksumSalt}`).digest('hex').slice(0, 8);
              return { id, orderId, tierId: order.tierId, eventId: order.eventId, holderName: order.buyerName, holderEmail: order.buyerEmail, qrPayload: `${order.eventId}.${id}.${checksum}`, status: 'valid' as const, issuedAt: new Date().toISOString() };
            });
            fulfillOrder(orderId, tickets);

            const sent = await sendTransactionalEmail('order_confirmation', order.buyerEmail, {
              orderId, buyerName: order.buyerName, buyerEmail: order.buyerEmail,
              eventName: event_?.name ?? orderId, eventDate: event_?.startsAt ?? '',
              venueName: venue?.name ?? 'TBC', tierName: tier?.name ?? '',
              quantity: order.quantity, total: order.total, currency: order.currency ?? 'NZD',
              tickets: tickets.map((t) => ({ id: t.id, qrPayload: t.qrPayload, holderName: t.holderName })),
            });
            insertEmailLog({ id: `email_${crypto.randomBytes(4).toString('hex')}`, template: 'order_confirmation', toAddress: order.buyerEmail, orderId, provider: sent.provider, status: sent.status, error: sent.error });
            appendAudit({ actor: 'stripe', action: 'order.fulfilled', target: orderId, severity: 'info', note: 'checkout.session.completed' });
          }
        }
      } else if (event.type === 'payment_intent.payment_failed') {
        const intentId = String(obj.id ?? '');
        if (intentId) {
          const record = getPaymentRecordByIntentId(intentId);
          if (record) {
            updatePaymentRecordStatus(record.orderId, 'failed');
            appendAudit({ actor: 'stripe', action: 'order.payment_failed', target: record.orderId, severity: 'warning', note: intentId });
          }
        }
      } else if (event.type === 'charge.refunded') {
        const intentId = String(obj.payment_intent ?? '');
        if (intentId) {
          const record = getPaymentRecordByIntentId(intentId);
          if (record) {
            transitionOrderStatus(record.orderId, 'refunded');
            updatePaymentRecordStatus(record.orderId, 'refunded');
            appendAudit({ actor: 'stripe', action: 'order.refunded', target: record.orderId, severity: 'info', note: intentId });
          }
        }
      }
    } catch (err) {
      appendAudit({ actor: 'stripe', action: 'webhook.error', target: event.type, severity: 'warning', note: err instanceof Error ? err.message : String(err) });
      await sendAlert('warning', 'Stripe webhook processing failed', {
        eventType: event.type,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    res.json({ received: true });
  },
);

app.use(express.json({ limit: '2mb' }));

// ─── Health ───────────────────────────────────────────────────────────────────

const startedAt = new Date().toISOString();

function buildReadiness() {
  let dbOk = true;
  try {
    getDb().prepare('SELECT 1').get();
  } catch {
    dbOk = false;
  }
  const paymentReady = !serverEnv.stripeSecretKey ? serverEnv.nodeEnv !== 'production' : true;
  const emailReady = !serverEnv.resendApiKey ? serverEnv.nodeEnv !== 'production' : true;
  const backupDirReady = fs.existsSync(path.resolve(serverEnv.backupDir)) || fs.existsSync(path.dirname(path.resolve(serverEnv.backupDir)));
  return {
    ok: dbOk && paymentReady && emailReady && backupDirReady,
    dbOk,
    paymentReady,
    emailReady,
    backupDirReady,
  };
}

app.get(`${serverEnv.apiBasePath}/health`, (_req, res) => {
  const readiness = buildReadiness();
  const status = readiness.dbOk ? 200 : 503;
  res.status(status).json({
    ok: readiness.dbOk,
    app: 'EventHub API',
    version: process.env['npm_package_version'] ?? 'unknown',
    uptime: Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
    startedAt,
    db: readiness.dbOk ? 'ok' : 'error',
    host: os.hostname(),
    now: nowIso(),
  });
});

app.get(`${serverEnv.apiBasePath}/ready`, (_req, res) => {
  const readiness = buildReadiness();
  res.status(readiness.ok ? 200 : 503).json({
    ok: readiness.ok,
    checks: {
      db: readiness.dbOk ? 'ok' : 'error',
      payment: readiness.paymentReady ? 'ok' : 'missing_config',
      email: readiness.emailReady ? 'ok' : 'missing_config',
      backup: readiness.backupDirReady ? 'ok' : 'missing_dir',
    },
    env: serverEnv.nodeEnv,
    now: nowIso(),
  });
});

// ─── Resource routes ─────────────────────────────────────────────────────────

app.use(`${serverEnv.apiBasePath}/events`, eventsRouter);
app.use(`${serverEnv.apiBasePath}/venues`, venuesRouter);
app.use(`${serverEnv.apiBasePath}/orders`, ordersRouter);
app.use(`${serverEnv.apiBasePath}/tickets`, ticketsRouter);
app.use(`${serverEnv.apiBasePath}/audit`, auditRouter);
app.use(`${serverEnv.apiBasePath}/marketing`, marketingRouter);
app.use(`${serverEnv.apiBasePath}/team`, teamRouter);
app.use(`${serverEnv.apiBasePath}/commerce`, commerceRouter);
app.use(`${serverEnv.apiBasePath}/public`, publicRouter);
app.use(`${serverEnv.apiBasePath}/account`, accountRouter);
app.use(`${serverEnv.apiBasePath}/gates`, gatesRouter);
app.use(`${serverEnv.apiBasePath}/queue`, queueRouter);
app.use(`${serverEnv.apiBasePath}/admin`, adminRouter);
app.use(`${serverEnv.apiBasePath}/reports`, reportsRouter);
app.use(`${serverEnv.apiBasePath}/growth`, growthRouter);
app.use(`${serverEnv.apiBasePath}/conference`, conferenceRouter);
app.use(`${serverEnv.apiBasePath}/monetization`, monetizationRouter);

// ─── Platform snapshot (legacy + merged) ──────────────────────────────────────

app.get(`${serverEnv.apiBasePath}/platform/public`, (_req, res) => {
  res.json(getPublicSnapshot());
});

app.get(`${serverEnv.apiBasePath}/platform/private`, requireSession, (_req, res) => {
  res.json(getSnapshot());
});

app.put(`${serverEnv.apiBasePath}/platform/private`, requireSession, requireSuperAdmin, (req, res) => {
  const snapshot = req.body;
  const saved = saveSnapshot(snapshot);
  res.json(saved);
});

// ─── Auth ─────────────────────────────────────────────────────────────────────

app.post(`${serverEnv.apiBasePath}/auth/request-code`, requireJsonBody({ email: 'string' }), async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!email) { res.status(400).json({ error: 'Email is required.' }); return; }
  const user = findUserByEmail(email);
  if (!user) { res.status(404).json({ error: 'No EventHub account found for that email.' }); return; }
  const ipAddress = requestIp(req);
  const requestState = getAuthRequestState(email, ipAddress);
  if (requestState.nextAllowedAt && requestState.nextAllowedAt > nowIso()) {
    recordAuthAttempt(email, ipAddress, 'request', false);
    res.status(429).json({ error: 'A sign-in code was sent recently. Please wait before requesting another.', nextAllowedAt: requestState.nextAllowedAt });
    return;
  }
  if (requestState.recentEmailRequests >= serverEnv.authRequestLimitPerEmail) {
    recordAuthAttempt(email, ipAddress, 'request', false);
    res.status(429).json({ error: 'Too many code requests for this email. Try again later.' });
    return;
  }
  if (requestState.recentIpRequests >= serverEnv.authRequestLimitPerIp) {
    recordAuthAttempt(email, ipAddress, 'request', false);
    res.status(429).json({ error: 'Too many sign-in attempts from this network. Try again later.' });
    return;
  }

  const code = randomCode();
  const expiresAt = new Date(Date.now() + serverEnv.authCodeTtlMinutes * 60_000).toISOString();
  invalidateOutstandingAuthCodes(email);
  createAuthCode(email, code, expiresAt);
  recordAuthAttempt(email, ipAddress, 'request', true);
  appendAudit({ actor: user.id, action: 'auth.code_requested', target: email, severity: 'info', note: ipAddress });

  const emailResult = await sendTransactionalEmail('auth_code', email, { code, name: user.name, expiresAt });
  res.json({
    status: 'sent',
    delivery: emailResult.provider === 'mock' ? 'preview' : 'email',
    expiresAt,
    nextAllowedAt: new Date(Date.now() + serverEnv.authRequestCooldownSeconds * 1000).toISOString(),
    previewCode: emailResult.provider === 'mock' ? code : undefined,
  });
});

app.post(`${serverEnv.apiBasePath}/auth/verify-code`, requireJsonBody({ email: 'string', code: 'string' }), (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const code = String(req.body?.code ?? '').trim();
  if (!email || !code) { res.status(400).json({ error: 'Email and code are required.' }); return; }
  const user = findUserByEmail(email);
  if (!user) { res.status(404).json({ error: 'No EventHub account found for that email.' }); return; }
  const ipAddress = requestIp(req);
  const failureState = getAuthFailureState(email, ipAddress);
  if (failureState.lockedUntil && failureState.lockedUntil > nowIso()) {
    recordAuthAttempt(email, ipAddress, 'verify', false);
    res.status(429).json({ error: 'Too many failed verification attempts. Try again later.', lockedUntil: failureState.lockedUntil });
    return;
  }
  if (!consumeAuthCode(email, code)) {
    recordAuthAttempt(email, ipAddress, 'verify', false);
    appendAudit({ actor: user.id, action: 'auth.login_failed', target: email, severity: 'warning', note: ipAddress });
    res.status(401).json({ error: 'That sign-in code is invalid or expired.' });
    return;
  }

  const token = randomToken();
  const expiresAt = new Date(Date.now() + serverEnv.sessionTtlHours * 60 * 60_000).toISOString();
  createSession(user.id, token, expiresAt);
  recordAuthAttempt(email, ipAddress, 'verify', true);
  appendAudit({ actor: user.id, action: 'auth.login_succeeded', target: email, severity: 'info', note: ipAddress });
  res.json({ token, expiresAt, user });
});

app.get(`${serverEnv.apiBasePath}/auth/session`, (req, res) => {
  const token = authTokenFrom(req);
  if (!token) { res.status(401).json({ error: 'No session token provided.' }); return; }
  const session = getSession(token);
  if (!session) { res.status(401).json({ error: 'Session expired or invalid.' }); return; }
  res.json(session);
});

app.post(`${serverEnv.apiBasePath}/auth/logout`, (req, res) => {
  const token = authTokenFrom(req);
  if (token) {
    const session = getSession(token);
    if (session) {
      appendAudit({ actor: session.user.id, action: 'auth.logout', target: session.user.email, severity: 'info' });
    }
    deleteSession(token);
  }
  res.status(204).send();
});

app.post(`${serverEnv.apiBasePath}/auth/logout-all`, requireSession, (req, res) => {
  const session = (req as AuthRequest).session;
  if (session) {
    deleteSessionsForUser(session.user.id);
    appendAudit({ actor: session.user.id, action: 'auth.logout_all', target: session.user.email, severity: 'warning' });
  }
  res.status(204).send();
});

app.get(`${serverEnv.apiBasePath}/auth/bootstrap-status`, (_req, res) => {
  res.json({ required: countUsers() === 0 || countSuperAdmins() === 0 });
});

app.post(
  `${serverEnv.apiBasePath}/auth/bootstrap`,
  requireJsonBody({ organizationName: 'string', organizationSlug: 'string', name: 'string', email: 'string' }),
  (req, res) => {
  const body = req.body as { organizationName?: string; organizationSlug?: string; name?: string; email?: string; timezone?: string; region?: string };
  if (!body.organizationName?.trim() || !body.organizationSlug?.trim() || !body.name?.trim() || !body.email?.trim()) {
    res.status(400).json({ error: 'Organization name, slug, admin name, and admin email are required.' });
    return;
  }
  try {
    const user = bootstrapFirstAdmin({
      organizationName: body.organizationName,
      organizationSlug: body.organizationSlug,
      name: body.name,
      email: body.email,
      timezone: body.timezone?.trim() || 'Pacific/Auckland',
      region: body.region?.trim() || 'NZ',
    });
    appendAudit({ actor: user.id, action: 'auth.bootstrap_completed', target: user.email, severity: 'warning', note: body.organizationName.trim() });
    res.status(201).json({ status: 'created', user });
  } catch (error) {
    res.status(409).json({ error: error instanceof Error ? error.message : 'Bootstrap failed.' });
  }
  },
);

app.get(`${serverEnv.apiBasePath}/auth/invites/:token`, (req, res) => {
  const invite = getTeamInviteByToken(req.params.token);
  if (!invite) {
    res.status(404).json({ error: 'Invite not found.' });
    return;
  }
  if (invite.status === 'expired' || invite.status === 'revoked') {
    res.status(410).json({ error: 'This invite is no longer active.' });
    return;
  }
  res.json({ email: invite.email, name: invite.name, role: invite.role, scope: invite.scope, expiresAt: invite.expiresAt, status: invite.status });
});

app.post(`${serverEnv.apiBasePath}/auth/invites/:token/accept`, (req, res) => {
  const invite = acceptTeamInvite(req.params.token);
  if (!invite) {
    res.status(404).json({ error: 'Invite not found.' });
    return;
  }
  if (invite.status === 'expired' || invite.status === 'revoked') {
    res.status(410).json({ error: 'This invite is no longer active.' });
    return;
  }

  const existingUser = findUserByEmail(invite.email);
  const user = createOrUpdateUser({
    id: existingUser?.id ?? `user_${crypto.randomBytes(4).toString('hex')}`,
    name: invite.name,
    email: invite.email,
    role: invite.role,
    scope: invite.scope,
    lastActive: existingUser?.lastActive ?? 'Invite accepted — awaiting login',
  });

  appendAudit({ actor: user.id, action: 'team.invite_accepted', target: invite.email, severity: 'info', note: invite.role });
  res.json({ email: user.email, name: user.name, role: user.role, scope: user.scope, acceptedAt: invite.acceptedAt });
});


// ─── Payments ─────────────────────────────────────────────────────────────────

app.post(`${serverEnv.apiBasePath}/payments/intents`, requireJsonBody({ amount: 'number', currency: 'string' }), async (req, res) => {
  try {
    res.json(await createPaymentIntent(req.body as { amount: number; currency: string; metadata: Record<string, string>; publishableKey?: string }));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Payment intent failed.' });
  }
});

app.post(`${serverEnv.apiBasePath}/payments/checkout-sessions`, requireJsonBody({ successUrl: 'string', cancelUrl: 'string' }), async (req, res) => {
  try {
    res.json(await createCheckoutSession(req.body as { lineItems: Array<{ name: string; description?: string; quantity: number; unitAmount: number; currency: string }>; successUrl: string; cancelUrl: string; metadata: Record<string, string> }));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Checkout session failed.' });
  }
});

app.post(`${serverEnv.apiBasePath}/payments/intents/:intentId/confirm`, (req, res) => {
  res.json({ id: req.params.intentId, amount: 0, currency: 'nzd', status: 'succeeded', metadata: {}, createdAt: nowIso() });
});

app.post(`${serverEnv.apiBasePath}/payments/intents/:intentId/refunds`, async (req, res) => {
  try {
    res.json(await createRefund(req.params.intentId, req.body?.amount, req.body?.reason));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Refund failed.' });
  }
});

app.post(`${serverEnv.apiBasePath}/payments/webhooks/parse`, (req, res) => {
  try {
    res.json(parseWebhook(String(req.body?.rawBody ?? ''), String(req.body?.signatureHeader ?? '')));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Webhook parse failed.' });
  }
});

// ─── Email ────────────────────────────────────────────────────────────────────

app.post(`${serverEnv.apiBasePath}/email/send`, requireJsonBody({ template: 'string', to: 'string' }), async (req, res) => {
  const template = String(req.body?.template ?? '') as Parameters<typeof sendTransactionalEmail>[0];
  const to = String(req.body?.to ?? '').trim();
  const payload = (req.body?.payload ?? {}) as Record<string, unknown>;
  try {
    res.json(await sendTransactionalEmail(template, to, payload));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Email send failed.' });
  }
});

app.post(`${serverEnv.apiBasePath}/admin/orders/:orderId/resend`, requireSession, async (req, res) => {
  const { orderId } = req.params as { orderId: string };
  const order = getOrder(orderId);
  if (!order) { res.status(404).json({ error: 'Order not found.' }); return; }
  if (order.status !== 'paid') { res.status(409).json({ error: 'Only paid orders can have confirmation emails resent.' }); return; }

  const event_ = getEvent(order.eventId);
  const tier = getTier(order.tierId);
  const venue = event_?.venueId ? getVenue(event_.venueId) : null;
  const { issuedTickets } = listAccountOrders(order.buyerEmail);
  const tickets = issuedTickets.filter((t) => t.orderId === orderId);

  const sent = await sendTransactionalEmail('order_confirmation', order.buyerEmail, {
    orderId, buyerName: order.buyerName, buyerEmail: order.buyerEmail,
    eventName: event_?.name ?? orderId, eventDate: event_?.startsAt ?? '',
    venueName: venue?.name ?? 'TBC', tierName: tier?.name ?? '',
    quantity: order.quantity, total: order.total, currency: 'NZD',
    tickets: tickets.map((t) => ({ id: t.id, qrPayload: t.qrPayload, holderName: t.holderName })),
  });
  insertEmailLog({ id: `email_${crypto.randomBytes(4).toString('hex')}`, template: 'order_confirmation', toAddress: order.buyerEmail, orderId, provider: sent.provider, status: sent.status, error: sent.error });
  appendAudit({ actor: (req as import('./middleware').AuthRequest).session?.user.id ?? 'admin', action: 'order.resend_confirmation', target: orderId, severity: 'info' });

  res.json({ status: sent.status, provider: sent.provider });
});


const distDir = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, {
    index: false,
    redirect: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store');
        return;
      }

      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }));

  app.get(/^\/(?!api)(?!.*\.[^/]+$).*/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});


// ─── Global error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('unhandled_error', { message: err.message, stack: err.stack });
  void sendAlert('critical', 'Unhandled API error', {
    message: err.message,
    stack: err.stack,
  });
  res.status(500).json({ error: 'Internal server error.' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const server = app.listen(serverEnv.port, () => {
  logger.info('server_started', { port: serverEnv.port, path: serverEnv.apiBasePath, env: serverEnv.nodeEnv });
});

function shutdown(signal: string): void {
  logger.info('server_shutdown', { signal });
  server.close(() => {
    logger.info('server_closed');
    process.exit(0);
  });
  setTimeout(() => { logger.error('shutdown_timeout'); process.exit(1); }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_rejection', { reason: reason instanceof Error ? reason.message : String(reason) });
  void sendAlert('critical', 'Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});
process.on('uncaughtException', (error) => {
  logger.error('uncaught_exception', { message: error.message, stack: error.stack });
  void sendAlert('critical', 'Uncaught exception', {
    message: error.message,
    stack: error.stack,
  });
});
