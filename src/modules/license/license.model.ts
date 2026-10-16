import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../../config/db.config.js';
import { snowflake } from '../../utils/SnowFlakeIdGenerator.js';

export interface LicenseModel {
    id?: string;
    client_id: string;
    license_key: string;
    expiry_date: Date;
    status: 'active' | 'expired' | 'suspended' | 'revoked';
    issued_at?: Date;
    last_validated_at?: Date | null;
    max_pings_per_day?: number;
    max_machines?: number;
}

export interface HwidRecord {
    id: string;
    license_id: string;
    hwid: string;
    label?: string | null;
    first_seen_at: Date;
    last_seen_at?: Date | null;
    is_blocked: boolean;
}

export const LicenseModel = {
    async create(data: LicenseModel) {
        let connection;
        try {
            connection = await pool.getConnection();
            const uniqueID = snowflake.nextID().toString();
            await connection.query<ResultSetHeader>(
                `INSERT INTO licenses (id, client_id, license_key, status, expiry_date, max_pings_per_day, max_machines) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [uniqueID, data.client_id, data.license_key, data.status || 'active', data.expiry_date, data.max_pings_per_day || 4, data.max_machines ?? 1]
            );
            return this.findById(uniqueID);
        } catch (error: any) {
            throw new Error(error.message || 'Error While Inserting License Key');
        } finally {
            if (connection) connection.release();
        }
    },

    async findById(id: string) {
        let connection;
        try {
            connection = await pool.getConnection();
            const [result] = await connection.query<RowDataPacket[]>(`
                SELECT l.*, c.org_name, c.contact_name, c.email as client_email, c.status as client_status
                FROM licenses l
                LEFT JOIN clients c ON l.client_id = c.id
                WHERE l.id = ?
            `, [id]);
            return result[0] || null;
        } catch (error: any) {
            throw new Error(error.message || 'Error While Finding License By ID');
        } finally {
            if (connection) connection.release();
        }
    },

    async findByClientId(clientId: string) {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.query<RowDataPacket[]>(`
                SELECT * FROM licenses WHERE client_id = ? ORDER BY issued_at DESC
            `, [clientId]);
            return rows;
        } catch (error: any) {
            throw new Error(error.message || 'Error While Finding Licenses For Client');
        } finally {
            if (connection) connection.release();
        }
    },

    async findByKey(licenseKey: string) {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows]: any = await connection.query(`
                SELECT l.*, c.org_name, c.contact_name, c.email as client_email, c.status as client_status
                FROM licenses l
                LEFT JOIN clients c ON l.client_id = c.id
                WHERE l.license_key = ?
            `, [licenseKey]);
            return rows[0] || null;
        } catch (error: any) {
            throw new Error(error.message || 'Error While Finding License By Key');
        } finally {
            if (connection) connection.release();
        }
    },

    async findAll() {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.query<RowDataPacket[]>(`
                SELECT 
                    l.*, 
                    c.org_name, 
                    c.contact_name, 
                    c.email as client_email, 
                    c.status as client_status,
                    COALESCE(h_stats.bound_count, 0) as bound_machines_count,
                    COALESCE(h_stats.blocked_count, 0) as blocked_machines_count
                FROM licenses l
                LEFT JOIN clients c ON l.client_id = c.id
                LEFT JOIN (
                    SELECT 
                        license_id, 
                        COUNT(*) as bound_count,
                        SUM(CASE WHEN is_blocked = 1 THEN 1 ELSE 0 END) as blocked_count
                    FROM license_hwids
                    GROUP BY license_id
                ) h_stats ON l.id = h_stats.license_id
                ORDER BY l.issued_at DESC
            `);
            return rows;
        } catch (error: any) {
            throw new Error(error.message || 'Error While Fetching Licenses');
        } finally {
            if (connection) connection.release();
        }
    },

    async updateStatus(id: string, status: 'active' | 'expired' | 'suspended' | 'revoked') {
        let connection;
        try {
            connection = await pool.getConnection();
            await connection.query(`UPDATE licenses SET status = ? WHERE id = ?`, [status, id]);
            return this.findById(id);
        } finally {
            if (connection) connection.release();
        }
    },

    async updateLastValidated(id: string, timestamp: Date) {
        let connection;
        try {
            connection = await pool.getConnection();
            await connection.query(`UPDATE licenses SET last_validated_at = ? WHERE id = ?`, [timestamp, id]);
        } finally {
            if (connection) connection.release();
        }
    },

    async updateLicense(id: string, data: { status?: string; max_machines?: number; expiry_date?: string | Date }) {
        let connection;
        try {
            connection = await pool.getConnection();
            const updates: string[] = [];
            const values: any[] = [];
            if (data.status) {
                updates.push('status = ?');
                values.push(data.status);
            }
            if (data.max_machines !== undefined && !isNaN(Number(data.max_machines))) {
                updates.push('max_machines = ?');
                values.push(Math.max(1, Number(data.max_machines)));
            }
            if (data.expiry_date) {
                updates.push('expiry_date = ?');
                values.push(new Date(data.expiry_date));
            }
            if (updates.length > 0) {
                values.push(id);
                await connection.query(`UPDATE licenses SET ${updates.join(', ')} WHERE id = ?`, values);
            }
            return this.findById(id);
        } finally {
            if (connection) connection.release();
        }
    },

    async updateMaxMachines(id: string, maxMachines: number) {
        let connection;
        try {
            connection = await pool.getConnection();
            await connection.query(`UPDATE licenses SET max_machines = ? WHERE id = ?`, [maxMachines, id]);
            return this.findById(id);
        } finally {
            if (connection) connection.release();
        }
    },

    async delete(id: string) {
        let connection;
        try {
            connection = await pool.getConnection();
            const [res] = await connection.query<ResultSetHeader>('DELETE FROM licenses WHERE id=?', [id]);
            return res.affectedRows > 0;
        } finally {
            if (connection) connection.release();
        }
    },

    async count() {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows]: any = await connection.query(`
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'active' AND expiry_date > NOW() THEN 1 ELSE 0 END) as active,
                    SUM(CASE WHEN status = 'expired' OR (status = 'active' AND expiry_date <= NOW()) THEN 1 ELSE 0 END) as expired,
                    SUM(CASE WHEN status = 'revoked' THEN 1 ELSE 0 END) as revoked,
                    SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspended
                FROM licenses
            `);
            return rows[0] || { total: 0, active: 0, expired: 0, revoked: 0, suspended: 0 };
        } finally {
            if (connection) connection.release();
        }
    },

    async findExpiringSoon(daysThreshold = 30) {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.query<RowDataPacket[]>(`
                SELECT
                    l.id, l.client_id, l.license_key, l.status, l.issued_at, l.expiry_date, l.last_validated_at,
                    c.org_name, c.contact_name, c.email as client_email,
                    DATEDIFF(l.expiry_date, NOW()) as days_remaining
                FROM licenses l
                JOIN clients c ON l.client_id = c.id
                WHERE l.status = 'active' AND l.expiry_date BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? DAY)
                ORDER BY l.expiry_date ASC
            `, [daysThreshold]);
            return rows;
        } finally {
            if (connection) connection.release();
        }
    },

    async getAllForExport() {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.query<RowDataPacket[]>(`
                SELECT
                    l.id, l.license_key, l.status,
                    c.org_name, c.contact_name, c.email as client_email,
                    l.issued_at, l.expiry_date, l.last_validated_at,
                    DATEDIFF(l.expiry_date, NOW()) as days_remaining
                FROM licenses l
                JOIN clients c ON l.client_id = c.id
                ORDER BY l.issued_at DESC
            `);
            return rows;
        } finally {
            if (connection) connection.release();
        }
    },

    // ─── HWID Management ──────────────────────────────────────────────────────

    /**
     * Get all HWIDs registered for a license
     */
    async getHwids(licenseId: string): Promise<HwidRecord[]> {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.query<RowDataPacket[]>(
                `SELECT * FROM license_hwids WHERE license_id = ? ORDER BY COALESCE(last_seen_at, first_seen_at) DESC`,
                [licenseId]
            );
            return rows as HwidRecord[];
        } finally {
            if (connection) connection.release();
        }
    },

    /**
     * Find a specific HWID record for a license
     */
    async findHwid(licenseId: string, hwid: string): Promise<HwidRecord | null> {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.query<RowDataPacket[]>(
                `SELECT * FROM license_hwids WHERE license_id = ? AND hwid = ?`,
                [licenseId, hwid]
            );
            return (rows[0] as HwidRecord) || null;
        } finally {
            if (connection) connection.release();
        }
    },

    /**
     * Count active (non-blocked) HWIDs for a license
     */
    async countActiveHwids(licenseId: string): Promise<number> {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows]: any = await connection.query(
                `SELECT COUNT(*) as cnt FROM license_hwids WHERE license_id = ? AND is_blocked = 0`,
                [licenseId]
            );
            return rows[0]?.cnt ?? 0;
        } finally {
            if (connection) connection.release();
        }
    },

    /**
     * Register a new HWID for a license.
     * If isInitialPing is true (e.g. TOFU first boot), last_seen_at is initialized to NOW().
     * If isInitialPing is false (e.g. Admin manual pre-whitelist), last_seen_at is NULL (awaiting handshake).
     */
    async registerHwid(licenseId: string, hwid: string, label?: string, isInitialPing: boolean = true): Promise<HwidRecord> {
        let connection;
        try {
            connection = await pool.getConnection();
            const id = snowflake.nextID().toString();
            const initialLastSeen = isInitialPing ? new Date() : null;
            await connection.query<ResultSetHeader>(
                `INSERT INTO license_hwids (id, license_id, hwid, label, last_seen_at) VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE last_seen_at = IF(?, NOW(), last_seen_at), is_blocked = is_blocked`,
                [id, licenseId, hwid, label || null, initialLastSeen, isInitialPing ? 1 : 0]
            );
            const record = await this.findHwid(licenseId, hwid);
            return record!;
        } finally {
            if (connection) connection.release();
        }
    },

    /**
     * Update last_seen_at timestamp for an existing HWID
     */
    async touchHwid(licenseId: string, hwid: string): Promise<void> {
        let connection;
        try {
            connection = await pool.getConnection();
            await connection.query(
                `UPDATE license_hwids SET last_seen_at = NOW() WHERE license_id = ? AND hwid = ?`,
                [licenseId, hwid]
            );
        } finally {
            if (connection) connection.release();
        }
    },

    /**
     * Block or unblock a specific HWID (admin action)
     */
    async setHwidBlocked(licenseId: string, hwid: string, blocked: boolean): Promise<void> {
        let connection;
        try {
            connection = await pool.getConnection();
            await connection.query(
                `UPDATE license_hwids SET is_blocked = ? WHERE license_id = ? AND hwid = ?`,
                [blocked ? 1 : 0, licenseId, hwid]
            );
        } finally {
            if (connection) connection.release();
        }
    },

    /**
     * Remove a specific HWID from a license (admin hard-delete — removes the slot)
     */
    async removeHwid(licenseId: string, hwid: string): Promise<boolean> {
        let connection;
        try {
            connection = await pool.getConnection();
            const [res] = await connection.query<ResultSetHeader>(
                `DELETE FROM license_hwids WHERE license_id = ? AND hwid = ?`,
                [licenseId, hwid]
            );
            return res.affectedRows > 0;
        } finally {
            if (connection) connection.release();
        }
    },

    /**
     * Remove ALL HWIDs for a license (full reset — admin action)
     */
    async resetAllHwids(licenseId: string): Promise<number> {
        let connection;
        try {
            connection = await pool.getConnection();
            const [res] = await connection.query<ResultSetHeader>(
                `DELETE FROM license_hwids WHERE license_id = ?`,
                [licenseId]
            );
            return res.affectedRows;
        } finally {
            if (connection) connection.release();
        }
    },

    /**
     * Get all HWIDs across all licenses for global device management
     */
    async getAllHwidsGlobal(): Promise<any[]> {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.query<RowDataPacket[]>(`
                SELECT h.*, l.license_key, l.status as license_status, c.org_name, c.email as client_email
                FROM license_hwids h
                JOIN licenses l ON h.license_id = l.id
                JOIN clients c ON l.client_id = c.id
                ORDER BY COALESCE(h.last_seen_at, h.first_seen_at) DESC
            `);
            return rows;
        } finally {
            if (connection) connection.release();
        }
    }
};
