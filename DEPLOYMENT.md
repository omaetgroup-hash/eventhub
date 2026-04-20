# EventHub Deployment and Operations

## Build

```bash
npm ci
npm run build
```

This produces:
- `dist/` for the frontend

## Run

```bash
npm run start:server
```

The API runs via `tsx server/index.ts` and serves static frontend assets from `dist/` when they exist.

## Environment separation

Use:
- [.env.example](C:/omaet/projects/eventhub/.env.example) for local development
- [.env.staging.example](C:/omaet/projects/eventhub/.env.staging.example) for staging
- [.env.production.example](C:/omaet/projects/eventhub/.env.production.example) for production

Critical production values:
- `QR_CHECKSUM_SALT`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `EMAIL_SENDER`
- `CORS_ORIGINS`
- `ALERT_WEBHOOK_URL`

## Health checks

- `GET /api/health`
  liveness plus DB status
- `GET /api/ready`
  readiness plus DB, payment, email, and backup checks

## Backups

Manual backup:

```bash
npm run backup
```

Admin-triggered backup:

```http
POST /api/admin/ops/backup
Authorization: Bearer <super-admin-session-token>
```

Backups are written to `BACKUP_DIR` and pruned to `BACKUP_RETAIN`.

## Logging and alerting

- request logs include an `X-Request-Id`
- configure `LOG_FORMAT=json` in staging/production
- configure `ALERT_WEBHOOK_URL` to receive critical API and backup alerts

## First-deploy initialization

On a fresh production database, the server boots to an empty state. No seed data runs.

**Initialization sequence:**

1. Set all required environment variables (see above)
2. Build the frontend: `npm run build`
3. Start the server: `npm run start:server`
4. Confirm health: `GET /api/health` returns `{ ok: true }`
5. Confirm migrations ran: `npm run db:migrate` (prints migration history)
6. Visit `/app/login` in a browser — the bootstrap form will appear
7. Fill in organization name, slug, admin name, and admin email
8. Sign in via the email code flow (check server logs for `previewCode` if `RESEND_API_KEY` is not yet set)

The bootstrap form only appears once, while no super admin exists. After completion it is permanently disabled.

## Data management

**Local development seed** (creates demo org, users, venues, and events):

```bash
npm run seed:local
```

**Staging seed** (creates org and two test users, no event data):

```bash
npm run seed:staging
```

**Export data to JSON**:

```bash
npm run db:export [output-file.json]
```

**Import from JSON export** (INSERT OR IGNORE — safe to re-run):

```bash
npm run db:import <export-file.json> [--dry-run]
```

**Run migrations only** (prints migration history):

```bash
npm run db:migrate
```

## Admin recovery

Super admins can unlock locked-out users and revoke sessions via the Admin Recovery page in the app (`/app/admin-recovery`), or directly via the API:

```http
GET    /api/admin/users
POST   /api/admin/users/:userId/unlock
POST   /api/admin/users/:userId/revoke-sessions
```

## Docker Compose (production — eventhub.kopaegroup.com)

Caddy handles TLS automatically via Let's Encrypt. The app is not exposed directly.

**On the server (first time):**

```bash
# 1. Copy and fill in secrets
cp .env.production.example .env.production
# Edit .env.production — set QR_CHECKSUM_SALT, STRIPE keys, RESEND_API_KEY etc.

# 2. Build and start
docker compose up -d --build

# 3. Watch logs until healthy
docker compose logs -f

# 4. Bootstrap the org/admin
# Visit https://eventhub.kopaegroup.com/app/login
```

**Redeploy after a code change:**

```bash
docker compose up -d --build app
```

**View logs:**

```bash
docker compose logs app     # app logs
docker compose logs caddy   # TLS / access logs
```

**Manual backup:**

```bash
docker compose exec app npm run backup
```

## Docker (standalone)

Build:

```bash
docker build -t eventhub .
```

Run:

```bash
docker run --env-file .env.production -p 8787:8787 eventhub
```
