import path from 'node:path';

function trim(value?: string): string {
  return value?.trim() ?? '';
}

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(trim(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const rootDir = path.resolve(process.cwd());

export const serverEnv = {
  port: toNumber(process.env.API_PORT, 8787),
  appUrl: trim(process.env.APP_URL) || 'http://localhost:5173',
  apiBasePath: trim(process.env.API_BASE_PATH) || '/api',
  databasePath: trim(process.env.DATABASE_PATH) || path.join(rootDir, 'server', 'data', 'eventhub.sqlite'),
  authCodeTtlMinutes: toNumber(process.env.AUTH_CODE_TTL_MINUTES, 10),
  authRequestCooldownSeconds: toNumber(process.env.AUTH_REQUEST_COOLDOWN_SECONDS, 60),
  authRequestWindowMinutes: toNumber(process.env.AUTH_REQUEST_WINDOW_MINUTES, 15),
  authRequestLimitPerEmail: toNumber(process.env.AUTH_REQUEST_LIMIT_PER_EMAIL, 5),
  authRequestLimitPerIp: toNumber(process.env.AUTH_REQUEST_LIMIT_PER_IP, 20),
  authVerifyWindowMinutes: toNumber(process.env.AUTH_VERIFY_WINDOW_MINUTES, 15),
  authVerifyFailureLimit: toNumber(process.env.AUTH_VERIFY_FAILURE_LIMIT, 5),
  authLockoutMinutes: toNumber(process.env.AUTH_LOCKOUT_MINUTES, 15),
  inviteTtlHours: toNumber(process.env.INVITE_TTL_HOURS, 72),
  sessionTtlHours: toNumber(process.env.SESSION_TTL_HOURS, 24),
  stripeSecretKey: trim(process.env.STRIPE_SECRET_KEY),
  stripeWebhookSecret: trim(process.env.STRIPE_WEBHOOK_SECRET),
  resendApiKey: trim(process.env.RESEND_API_KEY),
  emailSender: trim(process.env.EMAIL_SENDER) || 'tickets@eventhub.local',
  qrChecksumSalt: trim(process.env.QR_CHECKSUM_SALT) || 'eventhub-demo-salt',
  nodeEnv: trim(process.env.NODE_ENV) || 'development',
  corsOrigins: trim(process.env.CORS_ORIGINS),
  backupDir: trim(process.env.BACKUP_DIR) || 'server/data/backups',
  backupRetain: toNumber(process.env.BACKUP_RETAIN, 14),
  alertWebhookUrl: trim(process.env.ALERT_WEBHOOK_URL),
  logFormat: trim(process.env.LOG_FORMAT) || 'pretty',
  logLevel: trim(process.env.LOG_LEVEL) || 'info',
};

export function isProductionServer(): boolean {
  return serverEnv.nodeEnv === 'production';
}
