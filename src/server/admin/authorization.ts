export type AdminRole = 'USER' | 'CREATOR' | 'MODERATOR' | 'ADMIN' | 'SUPERADMIN';
const ROLE_LEVEL: Record<AdminRole, number> = { USER: 0, CREATOR: 1, MODERATOR: 2, ADMIN: 3, SUPERADMIN: 4 };

export interface AuthenticatedAdmin { userId: string; role: AdminRole; sessionId: string; }
export function canAccessAdmin(user: AuthenticatedAdmin, minimum: AdminRole = 'MODERATOR'): boolean { return ROLE_LEVEL[user.role] >= ROLE_LEVEL[minimum]; }
export function assertAdmin(user: AuthenticatedAdmin | null, minimum: AdminRole = 'MODERATOR'): void {
  if (!user || !canAccessAdmin(user, minimum)) throw new Error('ADMIN_FORBIDDEN');
}
