import crypto from 'crypto';
import env from '../config/env.config.js';

/**
 * Hash a password using Node.js native crypto scrypt with a random 16-byte salt.
 */
export function hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify a password against a stored salt:hash string.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
    try {
        const [salt, key] = storedHash.split(':');
        if (!salt || !key) return false;
        const keyBuffer = Buffer.from(key, 'hex');
        const derivedKey = crypto.scryptSync(password, salt, 64);
        return crypto.timingSafeEqual(keyBuffer, derivedKey);
    } catch {
        return false;
    }
}

/**
 * Generate a cryptographically signed session token (HMAC-SHA256).
 */
export function generateToken(payload: Record<string, any>, expiresInHours = 24 * 7): string {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + (expiresInHours * 3600);
    const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
    const data = `${header}.${body}`;
    const signature = crypto.createHmac('sha256', env.JWT_SECRET).update(data).digest('base64url');
    return `${data}.${signature}`;
}

/**
 * Verify and decode an HMAC-SHA256 token.
 */
export function verifyToken<T = any>(token: string): T | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const [header, body, signature] = parts;
        const expectedSig = crypto.createHmac('sha256', env.JWT_SECRET).update(`${header}.${body}`).digest('base64url');
        
        if (!crypto.timingSafeEqual(Buffer.from(signature!), Buffer.from(expectedSig))) {
            return null;
        }

        const payload = JSON.parse(Buffer.from(body!, 'base64url').toString('utf-8'));
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            return null; // Expired
        }

        return payload as T;
    } catch {
        return null;
    }
}
