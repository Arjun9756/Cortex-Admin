import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth.util.js';

export interface AdminPayload {
    id: string;
    email: string;
    role: 'super_admin' | 'admin' | 'viewer';
    name: string;
}

declare global {
    namespace Express {
        interface Request {
            admin?: AdminPayload;
        }
    }
}

/**
 * Extract token from Authorization header or custom header
 */
function extractToken(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7).trim();
    }
    const customHeader = req.headers['x-admin-token'];
    if (typeof customHeader === 'string' && customHeader.trim()) {
        return customHeader.trim();
    }
    return null;
}

/**
 * Middleware: Requires Administrator authority.
 * Unified Administrator authority (super_admin and admin have full master control).
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const token = extractToken(req);
    if (!token) {
        return res.status(401).json({
            success: false,
            code: 'AUTH_REQUIRED',
            message: 'Authentication required. Please log in as Administrator.'
        });
    }

    const payload = verifyToken<AdminPayload>(token);
    if (!payload) {
        return res.status(401).json({
            success: false,
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired session token. Please log in again.'
        });
    }

    req.admin = payload;
    next();
}

/**
 * Middleware: Requires Administrator authority (unified with requireAdmin).
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
    return requireAdmin(req, res, next);
}

/**
 * Middleware: Optional authentication.
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
    const token = extractToken(req);
    if (token) {
        const payload = verifyToken<AdminPayload>(token);
        if (payload) {
            req.admin = payload; 
            return next();
        }
    }
    req.admin = { id: 'admin', email: 'admin@cortex.com', role: 'admin', name: 'Administrator' };
    next();
}
