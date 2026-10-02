import type { Request, Response, NextFunction } from 'express';
import { assertAdmin, type AdminRole, type AuthenticatedAdmin } from '../admin/authorization';

export function requireAdminRole(minimum: AdminRole = 'MODERATOR') {
  return (req: Request, res: Response, next: NextFunction) => {
    const admin = (req as Request & { admin?: AuthenticatedAdmin }).admin ?? null;
    try { assertAdmin(admin, minimum); next(); } catch { res.status(403).json({ error: { code: 'ADMIN_FORBIDDEN', message: 'An authorized operator session is required.', retryable: false } }); }
  };
}
