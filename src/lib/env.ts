function normalizeUrl(value?: string): string {
  return value?.trim().replace(/\/+$/, '') ?? '';
}

const apiBaseUrl = normalizeUrl(import.meta.env.VITE_API_BASE_URL || '/api');
const paymentApiBaseUrl = normalizeUrl(import.meta.env.VITE_PAYMENT_API_BASE_URL) || apiBaseUrl;
const emailApiBaseUrl = normalizeUrl(import.meta.env.VITE_EMAIL_API_BASE_URL) || apiBaseUrl;

export const env = {
  appName: import.meta.env.VITE_APP_NAME ?? 'EventHub',
  appUrl: import.meta.env.VITE_APP_URL ?? 'http://localhost:5173',
  authProvider: import.meta.env.VITE_AUTH_PROVIDER ?? 'eventhub_code',
  paymentProvider: import.meta.env.VITE_PAYMENT_PROVIDER ?? 'pending',
  emailProvider: import.meta.env.VITE_EMAIL_PROVIDER ?? 'pending',
  persistenceProvider: import.meta.env.VITE_PERSISTENCE_PROVIDER ?? 'api',
  apiBaseUrl,
  paymentApiBaseUrl,
  emailApiBaseUrl,

  // Payment (publishable key only)
  stripePublishableKey: import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? '',

  // Email
  emailSender: import.meta.env.VITE_EMAIL_SENDER ?? '',

  // QR checksum salt for demo/offline integrity only
  qrChecksumSalt: import.meta.env.VITE_QR_CHECKSUM_SALT ?? '',
};

export function isServerBackedPaymentsConfigured(): boolean {
  return env.paymentProvider === 'stripe' && env.stripePublishableKey.startsWith('pk_') && Boolean(env.paymentApiBaseUrl);
}

export function isServerBackedEmailConfigured(): boolean {
  return env.emailProvider === 'resend' && Boolean(env.emailApiBaseUrl) && env.emailSender.includes('@');
}

export function isApiAuthConfigured(): boolean {
  return env.authProvider === 'eventhub_code' && Boolean(env.apiBaseUrl);
}

export function isApiPersistenceConfigured(): boolean {
  return env.persistenceProvider === 'api' && Boolean(env.apiBaseUrl);
}
