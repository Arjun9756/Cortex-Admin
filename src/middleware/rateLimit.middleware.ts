import { Request, Response, NextFunction } from 'express';

export interface RateLimitOptions {
    windowMs: number;
    maxRequests: number;
    keyPrefix?: string;
    message?: string;
}

interface RateLimitStoreEntry {
    timestamps: number[];
}

/**
 * Extract normalized client IP address from request headers or socket.
 */
function resolveClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    let raw = '';
    if (typeof forwarded === 'string' && forwarded.trim()) {
        raw = forwarded.split(',')[0]?.trim() || '';
    } else if (Array.isArray(forwarded) && forwarded.length > 0) {
        raw = forwarded[0]?.split(',')[0]?.trim() || '';
    }

    if (!raw) {
        const realIp = req.headers['x-real-ip'];
        if (typeof realIp === 'string' && realIp.trim()) {
            raw = realIp.trim();
        }
    }

    if (!raw) {
        raw = req.ip || req.socket?.remoteAddress || '127.0.0.1';
    }

    // Normalize IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1)
    if (raw.startsWith('::ffff:')) {
        raw = raw.slice(7);
    }
    return raw || '127.0.0.1';
}

/**
 * Create a pure in-memory (RAM) sliding-window rate limiter middleware.
 */
export function createMemoryRateLimiter(options: RateLimitOptions) {
    const windowMs = Math.max(1000, options.windowMs);
    const maxRequests = Math.max(1, options.maxRequests);
    const keyPrefix = options.keyPrefix || 'rl';
    const baseMessage = options.message || `Rate limit exceeded. Maximum ${maxRequests} requests allowed per ${Math.round(windowMs / 1000)}s.`;

    // Server RAM store: key -> sorted array of request timestamps (ms)
    const store = new Map<string, RateLimitStoreEntry>();

    // Periodic background sweep to evict idle entries and keep RAM usage bounded
    const cleanupTimer = setInterval(() => {
        const cutoff = Date.now() - windowMs;
        for (const [key, entry] of store.entries()) {
            const active = entry.timestamps.filter(ts => ts > cutoff);
            if (active.length === 0) {
                store.delete(key);
            } else {
                entry.timestamps = active;
            }
        }
    }, Math.min(windowMs, 60_000));

    if (typeof cleanupTimer.unref === 'function') {
        cleanupTimer.unref();
    }

    const middleware = (req: Request, res: Response, next: NextFunction) => {
        const now = Date.now();
        const cutoff = now - windowMs;
        const clientIp = resolveClientIp(req);
        const key = `${keyPrefix}:${clientIp}`;

        let entry = store.get(key);
        if (!entry) {
            entry = { timestamps: [] };
            store.set(key, entry);
        }

        // Prune expired timestamps outside the sliding window
        entry.timestamps = entry.timestamps.filter(ts => ts > cutoff);

        const used = entry.timestamps.length;
        const oldestActive = entry.timestamps[0] ?? now;
        const resetAtMs = oldestActive + windowMs;
        const resetSeconds = Math.max(1, Math.ceil((resetAtMs - now) / 1000));

        res.setHeader('RateLimit-Limit', String(maxRequests));
        res.setHeader('X-RateLimit-Limit', String(maxRequests));

        if (used >= maxRequests) {
            res.setHeader('RateLimit-Remaining', '0');
            res.setHeader('X-RateLimit-Remaining', '0');
            res.setHeader('RateLimit-Reset', String(resetSeconds));
            res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAtMs / 1000)));
            res.setHeader('Retry-After', String(resetSeconds));

            return res.status(429).json({
                success: false,
                code: 'RATE_LIMIT_EXCEEDED',
                message: `${baseMessage} Please retry in ${resetSeconds}s.`,
                limit: maxRequests,
                remaining: 0,
                retryAfterSeconds: resetSeconds
            });
        }

        entry.timestamps.push(now);
        const remaining = Math.max(0, maxRequests - entry.timestamps.length);

        res.setHeader('RateLimit-Remaining', String(remaining));
        res.setHeader('X-RateLimit-Remaining', String(remaining));
        res.setHeader('RateLimit-Reset', String(resetSeconds));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil((entry.timestamps[0]! + windowMs) / 1000)));

        next();
    };

    return Object.assign(middleware, {
        getStats: () => ({
            storeBackend: 'in-memory-ram',
            windowSeconds: Math.round(windowMs / 1000),
            maxRequests,
            trackedClients: store.size
        }),
        resetForTesting: () => {
            store.clear();
        }
    });
}

/**
 * Admin Authentication Rate Limiter:
 * Strictly allows 10 requests per minute (60,000 ms) per IP in server RAM.
 */
export const adminAuthRateLimiter = createMemoryRateLimiter({
    windowMs: 60_000,
    maxRequests: 10,
    keyPrefix: 'admin_auth',
    message: 'Too many admin authentication requests (max 10/min).'
});
