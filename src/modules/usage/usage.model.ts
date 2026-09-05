import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../../config/db.config.js';
import { snowflake } from '../../utils/SnowFlakeIdGenerator.js';

export interface UsageLogModel {
    id?: string;
    client_id?: string | null;
    license_id?: string | null;
    action_type: 'ping' | 'query' | 'export' | 'other';
    query_count?: number;
    status: 'success' | 'failed';
    ip_address?: string;
    metadata?: Record<string, any>;
    created_at?: Date;
}

export const UsageLogModel = {
    async createLog(data: UsageLogModel) {
        let connection;
        try {
            connection = await pool.getConnection();
            const uniqueID = snowflake.nextID().toString();
            const metaJson = data.metadata ? JSON.stringify(data.metadata) : null;

            await connection.query<ResultSetHeader>(
                `INSERT INTO usage_logs (id, client_id, license_id, action_type, query_count, status, ip_address, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    uniqueID,
                    data.client_id || null,
                    data.license_id || null,
                    data.action_type,
                    data.query_count || 0,
                    data.status,
                    data.ip_address || '127.0.0.1',
                    metaJson
                ]
            );
            return uniqueID;
        } catch (error: any) {
            console.error('Error recording usage log:', error.message);
            // We do not throw error here to avoid blocking heartbeat if log insert fails
            return null;
        } finally {
            if (connection) connection.release();
        }
    },

    async getRecentLogs(limit = 50, actionType?: string) {
        let connection;
        try {
            connection = await pool.getConnection();
            let query = `
                SELECT u.*, 
                       c.org_name, c.contact_name, c.email as client_email,
                       l.license_key
                FROM usage_logs u
                LEFT JOIN clients c ON u.client_id = c.id
                LEFT JOIN licenses l ON u.license_id = l.id
            `;
            const params: any[] = [];

            if (actionType) {
                query += ` WHERE u.action_type = ?`;
                params.push(actionType);
            }

            query += ` ORDER BY u.created_at DESC LIMIT ?`;
            params.push(limit);

            const [rows] = await connection.query<RowDataPacket[]>(query, params);
            return rows;
        } finally {
            if (connection) connection.release();
        }
    },

    async getPingStatsToday() {
        return await this.getPingStatsByTimeframe(24);
    },

    async getPingStatsByTimeframe(hours = 24) {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows]: any = await connection.query(`
                SELECT 
                    COUNT(*) as total_pings,
                    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_pings,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_pings,
                    COUNT(DISTINCT client_id) as active_clients_pinging,
                    COUNT(DISTINCT ip_address) as unique_ips
                FROM usage_logs
                WHERE action_type = 'ping' AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
            `, [hours]);
            return rows[0] || { total_pings: 0, successful_pings: 0, failed_pings: 0, active_clients_pinging: 0, unique_ips: 0 };
        } finally {
            if (connection) connection.release();
        }
    },

    async getPingTimeline(hours = 24) {
        let connection;
        try {
            connection = await pool.getConnection();
            const isDaily = hours > 48;
            const formatStr = isDaily ? '%d %b' : '%h %p';
            const sortGroupStr = isDaily ? '%Y-%m-%d' : '%Y-%m-%d %H';
            
            const [rows]: any = await connection.query(`
                SELECT 
                    DATE_FORMAT(created_at, '${formatStr}') as time_bucket,
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
                FROM usage_logs
                WHERE action_type = 'ping' AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
                GROUP BY time_bucket, DATE_FORMAT(created_at, '${sortGroupStr}')
                ORDER BY MIN(created_at) ASC
            `, [hours]);
            return rows;
        } finally {
            if (connection) connection.release();
        }
    },

    async getPingTimelineHourly() {
        return await this.getPingTimeline(24);
    },

    async getFailureReasonBreakdown(hours = 24) {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows]: any = await connection.query(`
                SELECT 
                    CASE 
                        WHEN metadata->>'$.reason' LIKE '%revoked%' THEN 'License Revoked'
                        WHEN metadata->>'$.reason' LIKE '%expired%' THEN 'License Expired'
                        WHEN metadata->>'$.reason' LIKE '%suspended%' THEN 'License Suspended'
                        WHEN metadata->>'$.reason' LIKE '%inactive%' THEN 'Client Inactive'
                        WHEN metadata->>'$.error' LIKE '%Unknown%' THEN 'Unknown / Invalid Key'
                        WHEN metadata->>'$.error' LIKE '%Missing%' THEN 'Missing Key Payload'
                        ELSE COALESCE(metadata->>'$.reason', metadata->>'$.error', 'Gating Blocked')
                    END AS reason,
                    COUNT(*) as count
                FROM usage_logs
                WHERE action_type = 'ping' AND status = 'failed' AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
                GROUP BY reason
                ORDER BY count DESC
            `, [hours]);
            return rows;
        } finally {
            if (connection) connection.release();
        }
    },

    async getPlatformDistribution(hours = 24) {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows]: any = await connection.query(`
                SELECT 
                    COALESCE(NULLIF(metadata->>'$.platform', ''), 'Unknown OS') as platform,
                    COUNT(*) as count
                FROM usage_logs
                WHERE action_type = 'ping' AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
                GROUP BY platform
                ORDER BY count DESC
            `, [hours]);
            return rows;
        } finally {
            if (connection) connection.release();
        }
    },

    async getAppVersionDistribution(hours = 24) {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows]: any = await connection.query(`
                SELECT 
                    COALESCE(NULLIF(metadata->>'$.app_version', ''), 'v1.0.0') as app_version,
                    COUNT(*) as count
                FROM usage_logs
                WHERE action_type = 'ping' AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
                GROUP BY app_version
                ORDER BY count DESC
            `, [hours]);
            return rows;
        } finally {
            if (connection) connection.release();
        }
    },

    async getTopActiveClients(hours = 24, limit = 5) {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows]: any = await connection.query(`
                SELECT 
                    u.client_id,
                    c.org_name,
                    c.email,
                    COUNT(*) as total_pings,
                    SUM(CASE WHEN u.status = 'success' THEN 1 ELSE 0 END) as success_pings,
                    SUM(CASE WHEN u.status = 'failed' THEN 1 ELSE 0 END) as failed_pings,
                    MAX(u.created_at) as last_ping_at
                FROM usage_logs u
                JOIN clients c ON u.client_id = c.id
                WHERE u.action_type = 'ping' AND u.created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
                GROUP BY u.client_id, c.org_name, c.email
                ORDER BY total_pings DESC
                LIMIT ?
            `, [hours, limit]);
            return rows;
        } finally {
            if (connection) connection.release();
        }
    },

    async getSecurityAnomalies(hours = 24) {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows]: any = await connection.query(`
                SELECT 
                    SUM(CASE WHEN metadata->>'$.error' LIKE '%Unknown%' OR metadata->>'$.error' LIKE '%Missing%' THEN 1 ELSE 0 END) as unauthorized_key_attempts,
                    COUNT(DISTINCT CASE WHEN status = 'failed' THEN ip_address END) as suspicious_unique_ips,
                    COUNT(DISTINCT CASE WHEN metadata->>'$.machine_id' IS NOT NULL THEN metadata->>'$.machine_id' END) as active_machines_count
                FROM usage_logs
                WHERE action_type = 'ping' AND created_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
            `, [hours]);
            return rows[0] || { unauthorized_key_attempts: 0, suspicious_unique_ips: 0, active_machines_count: 0 };
        } finally {
            if (connection) connection.release();
        }
    },

    async getAllLogsForExport(limit = 2000) {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.query<RowDataPacket[]>(`
                SELECT 
                    u.id,
                    u.created_at,
                    u.action_type,
                    u.status,
                    u.ip_address,
                    c.org_name,
                    c.email as client_email,
                    l.license_key,
                    u.metadata->>'$.machine_id' as machine_id,
                    u.metadata->>'$.app_version' as app_version,
                    u.metadata->>'$.platform' as platform,
                    COALESCE(u.metadata->>'$.reason', u.metadata->>'$.error', '') as status_detail
                FROM usage_logs u
                LEFT JOIN clients c ON u.client_id = c.id
                LEFT JOIN licenses l ON u.license_id = l.id
                ORDER BY u.created_at DESC
                LIMIT ?
            `, [limit]);
            return rows;
        } finally {
            if (connection) connection.release();
        }
    }
};
