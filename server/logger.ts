import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVELS: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

const configuredLevel: LogLevel = (process.env['LOG_LEVEL'] as LogLevel) || 'info';
const isPretty = (process.env['LOG_FORMAT'] || 'pretty') !== 'json';

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] <= LEVELS[configuredLevel];
}

function formatPretty(level: LogLevel, msg: string, meta?: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const prefix = { error: 'ERR', warn: 'WRN', info: 'INF', debug: 'DBG' }[level];
  const metaStr = meta && Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
  return `${ts} [${prefix}] ${msg}${metaStr}`;
}

function formatJson(level: LogLevel, msg: string, meta?: Record<string, unknown>): string {
  return JSON.stringify({ time: new Date().toISOString(), level, msg, ...meta });
}

function emit(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const line = isPretty ? formatPretty(level, msg, meta) : formatJson(level, msg, meta);
  if (level === 'error' || level === 'warn') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => emit('warn',  msg, meta),
  info:  (msg: string, meta?: Record<string, unknown>) => emit('info',  msg, meta),
  debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),
};

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = crypto.randomBytes(8).toString('hex');
  const start = Date.now();
  (req as Request & { requestId: string }).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const ms = Date.now() - start;
    const level: LogLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    emit(level, `${req.method} ${req.path}`, {
      status: res.statusCode,
      ms,
      requestId,
      ip: req.ip,
    });
  });

  next();
}
