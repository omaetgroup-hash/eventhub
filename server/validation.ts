import type { Request, Response, NextFunction } from 'express';

type PrimitiveField = 'string' | 'number' | 'boolean';
type ValidatorSpec = Record<string, PrimitiveField>;

function matchesType(value: unknown, type: PrimitiveField): boolean {
  if (type === 'number') {
    return typeof value === 'number' && Number.isFinite(value);
  }
  return typeof value === type;
}

export function requireJsonBody<T extends ValidatorSpec>(spec: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.is('application/json')) {
      res.status(415).json({ error: 'Expected application/json request body.' });
      return;
    }

    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.status(400).json({ error: 'Request body must be a JSON object.' });
      return;
    }

    for (const [field, type] of Object.entries(spec)) {
      const value = (req.body as Record<string, unknown>)[field];
      if (value === undefined || value === null || !matchesType(value, type)) {
        res.status(400).json({ error: `Field "${field}" is required and must be a ${type}.` });
        return;
      }
    }

    next();
  };
}
