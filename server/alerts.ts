import { serverEnv } from './env';
import { logger } from './logger';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export async function sendAlert(
  severity: AlertSeverity,
  message: string,
  details?: Record<string, unknown>,
): Promise<void> {
  logger[severity === 'critical' ? 'error' : severity === 'warning' ? 'warn' : 'info']('alert.dispatch', {
    severity,
    message,
    ...details,
  });

  if (!serverEnv.alertWebhookUrl) {
    return;
  }

  try {
    const response = await fetch(serverEnv.alertWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app: 'EventHub API',
        severity,
        message,
        details,
        sentAt: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      logger.warn('alert.dispatch_failed', {
        severity,
        status: response.status,
        message,
      });
    }
  } catch (error) {
    logger.warn('alert.dispatch_failed', {
      severity,
      message,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
