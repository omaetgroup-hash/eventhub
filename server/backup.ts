import fs from 'node:fs';
import path from 'node:path';
import { getDb } from './db';
import { serverEnv } from './env';
import { logger } from './logger';

function retainRecent(dir: string, keep: number): void {
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.sqlite'))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const file of files.slice(keep)) {
    fs.unlinkSync(path.join(dir, file.name));
    logger.info('backup.pruned', { file: file.name });
  }
}

export async function runBackup(): Promise<string> {
  const dir = path.resolve(serverEnv.backupDir);
  fs.mkdirSync(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest = path.join(dir, `eventhub-${stamp}.sqlite`);

  const db = getDb();
  await db.backup(dest);
  logger.info('backup.created', { dest });

  retainRecent(dir, serverEnv.backupRetain);
  return dest;
}
