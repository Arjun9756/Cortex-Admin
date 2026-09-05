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
}

export const LicenseModel = {
    async create(data: LicenseModel) {
        let connection;
        try {
            connection = await pool.getConnection();
            const uniqueID = snowflake.nextID().toString();

            await connection.query<ResultSetHeader>(
                `INSERT INTO licenses (id, client_id, license_key, status, expiry_date, max_pings_per_day) VALUES (?, ?, ?, ?, ?, ?)`,
                [uniqueID, data.client_id, data.license_key, data.status || 'active', data.expiry_date, data.max_pings_per_day || 4]
            );
            return this.findById(uniqueID);
        } catch (error: any) {
            throw new Error(error.message || "Error While Inserting License Key");
        } finally {
            if (connection) {
                connection.release();
            }
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
            throw new Error(error.message || "Error While Finding License By ID");
        } finally {
            if (connection) {
                connection.release();
            }
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
            throw new Error(error.message || "Error While Finding Licenses For Client");
        } finally {
            if (connection) {
                connection.release();
            }
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
            throw new Error(error.message || "Error While Finding License By Key");
        } finally {
            if (connection) {
                connection.release();
            }
        }
    },

    async findAll() {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.query<RowDataPacket[]>(`
                SELECT l.*, c.org_name, c.contact_name, c.email as client_email, c.status as client_status
                FROM licenses l
                LEFT JOIN clients c ON l.client_id = c.id
                ORDER BY l.issued_at DESC
            `);
            return rows;
        } catch (error: any) {
            throw new Error(error.message || "Error While Fetching Licenses");
        } finally {
            if (connection) {
                connection.release();
            }
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
                    l.id,
                    l.license_key,
                    l.status,
                    c.org_name,
                    c.contact_name,
                    c.email as client_email,
                    l.issued_at,
                    l.expiry_date,
                    l.last_validated_at,
                    DATEDIFF(l.expiry_date, NOW()) as days_remaining
                FROM licenses l
                JOIN clients c ON l.client_id = c.id
                ORDER BY l.issued_at DESC
            `);
            return rows;
        } finally {
            if (connection) connection.release();
        }
    }
};