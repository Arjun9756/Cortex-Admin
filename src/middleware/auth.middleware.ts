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
 * Middleware: Strictly requires Super Admin or Admin role
 * Blocks Viewers and unauthenticated requests from write/delete/manage operations.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const token = extractToken(req);
    if (!token) {
        return res.status(401).json({
            success: false,
            code: 'AUTH_REQUIRED',
            message: 'Authentication required. Only Super Admin and Admin can perform this action.'
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

    if (payload.role !== 'super_admin' && payload.role !== 'admin') {
        return res.status(403).json({
            success: false,
            code: 'FORBIDDEN',
            message: 'Forbidden: Viewer accounts have read-only access and cannot perform management actions.'
        });
    }

    req.admin = payload;
    next();
}

/**
 * Middleware: Strictly requires Super Admin role
 * Used for sensitive actions like deleting or adding new administrator accounts.
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
    const token = extractToken(req);
    if (!token) {
        return res.status(401).json({
            success: false,
            code: 'AUTH_REQUIRED',
            message: 'Super Admin authentication required.'
        });
    }

    const payload = verifyToken<AdminPayload>(token);
    if (!payload) {
        return res.status(401).json({
            success: false,
            code: 'INVALID_TOKEN',
            message: 'Invalid or expired session token.'
        });
    }

    if (payload.role !== 'super_admin') {
        return res.status(403).json({
            success: false,
            code: 'SUPER_ADMIN_REQUIRED',
            message: 'Action restricted: Only Super Admin can manage administrator credentials.'
        });
    }

    req.admin = payload;
    next();
}

/**
 * Middleware: Optional authentication
 * Allows guest viewers while extracting admin identity if present.
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
    req.admin = { id: 'guest', email: '', role: 'viewer', name: 'Guest Viewer' };
    next();
}
