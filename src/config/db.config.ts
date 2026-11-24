import mysql from 'mysql2/promise'
import env from './env.config.js'
import fs from 'fs'
import path from 'path'

const __filename = import.meta.filename
const __dirname = path.dirname(__filename)

export function getSslConfig(): any {
    if (process.env.DB_CA_CERT) {
        return { ca: process.env.DB_CA_CERT };
    }
    const cwdCa = path.join(process.cwd(), 'ca.pem');
    if (fs.existsSync(cwdCa)) {
        return { ca: fs.readFileSync(cwdCa, 'utf-8') };
    }
    const relCa = path.join(__dirname, '..', '..', 'ca.pem');
    if (fs.existsSync(relCa)) {
        return { ca: fs.readFileSync(relCa, 'utf-8') };
    }
    return {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
    };
}

const pool = mysql.createPool({
    host: env.DATABASE_SQL_HOST,
    user: env.DATABASE_SQL_USER,
    password: env.DATABASE_SQL_PASSWORD,
    port: parseInt(env.DATABASE_SQL_PORT || '4000', 10),
    database: env.DATABASE_SQL_DATABASE,
    waitForConnections: true,
    ssl: getSslConfig(),
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 30000,
    connectTimeout: 15000,
})

// --- TiDB Cloud Keepalive Heartbeat (Runs every 15 minutes) ---
let keepAliveTimer: NodeJS.Timeout | null = null;
let keepaliveStatus = {
    running: false,
    intervalMinutes: 15,
    lastPingAt: null as string | null,
    lastLatencyMs: null as number | null,
    lastStatus: 'idle' as 'idle' | 'ok' | 'error',
    totalPings: 0,
    lastError: null as string | null
};

export function startDatabaseKeepalive(intervalMs: number = 15 * 60 * 1000) {
    if (keepAliveTimer) {
        return;
    }

    keepaliveStatus.running = true;
    keepaliveStatus.intervalMinutes = Math.round(intervalMs / 60000);

    const runPing = async () => {
        const start = Date.now();
        try {
            await pool.query('SELECT 1 AS keepalive');
            const latency = Date.now() - start;
            keepaliveStatus.lastPingAt = new Date().toISOString();
            keepaliveStatus.lastLatencyMs = latency;
            keepaliveStatus.lastStatus = 'ok';
            keepaliveStatus.lastError = null;
            keepaliveStatus.totalPings += 1;
            console.log(`[TiDB Keepalive] Ping #${keepaliveStatus.totalPings} OK (${latency}ms) at ${keepaliveStatus.lastPingAt}`);
        } catch (err: any) {
            keepaliveStatus.lastPingAt = new Date().toISOString();
            keepaliveStatus.lastStatus = 'error';
            keepaliveStatus.lastError = err?.message || String(err);
            console.warn(`[TiDB Keepalive] Ping warning:`, keepaliveStatus.lastError);
        }
    };

    // Run first ping immediately to ensure pool connection is warm
    runPing().catch(() => {});

    // Schedule periodic keepalive
    keepAliveTimer = setInterval(runPing, intervalMs);
    if (keepAliveTimer.unref) {
        keepAliveTimer.unref();
    }
    console.log(`⏱️ TiDB keepalive active: pinging cluster every ${keepaliveStatus.intervalMinutes}m`);
}

export function stopDatabaseKeepalive() {
    if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
    }
    keepaliveStatus.running = false;
}

export function getDatabaseKeepaliveStatus() {
    return { ...keepaliveStatus };
}

export default Object.freeze(pool)