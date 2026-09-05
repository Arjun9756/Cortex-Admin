import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import env from './config/env.config.js';
import { initDatabase } from './db/db.init.js';

// Import Route Handlers
import clientRoutes from './modules/client/client.route.js';
import licenseRoutes from './modules/license/license.route.js';
import adminRoutes from './modules/admin/admin.route.js';
import analyticsRoutes from './modules/analytics/analytics.route.js';

const __filename = import.meta.filename;
const __dirname = path.dirname(__filename);

const app = express();

// Standard Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Request Logger
app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (!req.url.startsWith('/css') && !req.url.startsWith('/js') && !req.url.startsWith('/favicon')) {
            console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
        }
    });
    next();
});

// Determine public directory path (cwd fallback for Vercel)
const publicPath = path.join(process.cwd(), 'public');
app.use(express.static(publicPath));

// Lazy Database Initializer for Serverless / Warm instances
let dbInitPromise: Promise<void> | null = null;
export async function ensureDatabaseReady() {
    if (!dbInitPromise) {
        dbInitPromise = initDatabase().catch(err => {
            console.error('Database connection / initialization error:', err);
            dbInitPromise = null;
            throw err;
        });
    }
    return dbInitPromise;
}

// Pre-flight database readiness check for API routes
app.use(['/api', '/clients', '/license', '/admin', '/analytics'], async (req: Request, res: Response, next: NextFunction) => {
    try {
        await ensureDatabaseReady();
        next();
    } catch (err: any) {
        res.status(500).json({
            success: false,
            message: 'Database connection failed',
            error: err.message
        });
    }
});

// API Routes (Mounted on /api/... and root fallback)
app.use('/api/clients', clientRoutes);
app.use('/api/license', licenseRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);

app.use('/clients', clientRoutes);
app.use('/license', licenseRoutes);
app.use('/admin', adminRoutes);
app.use('/analytics', analyticsRoutes);

// System Health Endpoint
app.get(['/api/health', '/health'], (req: Request, res: Response) => {
    res.json({
        status: 'online',
        service: 'Cortex License & Admin Control Plane',
        version: '1.0.0',
        environment: process.env.VERCEL ? 'vercel-serverless' : 'standalone',
        timestamp: new Date().toISOString()
    });
});

// SPA Fallback: Serve index.html for any unmatched non-API requests (Express 5 compatible)
app.use((req: Request, res: Response) => {
    if (req.url.startsWith('/api/')) {
        return res.status(404).json({ success: false, message: 'API Route Not Found' });
    }
    const indexPath = path.join(publicPath, 'index.html');
    res.sendFile(indexPath);
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled Application Error:', err);
    res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
});

// Start Server & Bootstrap Database
async function startServer() {
    try {
        await ensureDatabaseReady();

        app.listen(env.PORT, () => {
            console.log(`\n=================================================`);
            console.log(`🚀 CORTEX ADMIN & LICENSE SERVER IS RUNNING!`);
            console.log(`📡 URL: http://localhost:${env.PORT}`);
            console.log(`⚡ Ping API: http://localhost:${env.PORT}/api/license/ping`);
            console.log(`🔐 Default Admin: ${env.ADMIN_DEFAULT_EMAIL} / ${env.ADMIN_DEFAULT_PASSWORD}`);
            console.log(`=================================================\n`);
        });
    } catch (err: any) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

// Only listen on port if running directly (standalone mode, not on Vercel)
if (!process.env.VERCEL) {
    startServer();
}

export { app };
export default app;
