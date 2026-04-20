import { Router } from 'express';
import { listAudit } from '../db';
import { requirePack, requirePermission, requireSession } from '../middleware';

const router = Router();

router.get('/', requireSession, requirePack('standard'), requirePermission('audit:read'), (req, res) => {
  const { actor, action, severity, limit, offset } = req.query as Record<string, string | undefined>;
  res.json(listAudit({
    actor: actor || undefined,
    action: action || undefined,
    severity: severity || undefined,
    limit: limit ? Number(limit) : undefined,
    offset: offset ? Number(offset) : undefined,
  }));
});

export default router;
