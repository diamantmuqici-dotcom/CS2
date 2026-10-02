import crypto from 'node:crypto';

export function createCsrfToken(): string { return crypto.randomBytes(24).toString('base64url'); }
export function timingSafeTokenMatch(expected: string, supplied: string | undefined): boolean { if (!supplied) return false; const a = Buffer.from(expected); const b = Buffer.from(supplied); return a.length === b.length && crypto.timingSafeEqual(a, b); }
