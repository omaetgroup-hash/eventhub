import { runBackup } from '../server/backup';

runBackup()
  .then((dest) => { console.log('Backup saved:', dest); process.exit(0); })
  .catch((err) => { console.error('Backup failed:', err); process.exit(1); });
