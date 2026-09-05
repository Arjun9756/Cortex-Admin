import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../../config/db.config.js';
import { snowflake } from '../../utils/SnowFlakeIdGenerator.js';

export interface ClientModel {
    id?: string;
    org_name: string;
    contact_name: string;
    email: string;
    phone?: string;
    status?: 'active' | 'inactive' | 'suspended';
    created_at?: Date;
    updated_at?: Date;
}

export const ClientModel = {
    async createClient(data: ClientModel) {
        let connection;
        try {
            connection = await pool.getConnection();
            const uniqueID = snowflake.nextID().toString();

            await connection.query<ResultSetHeader>(
                `INSERT INTO clients(id, org_name, contact_name, email, phone, status) VALUES (?, ?, ?, ?, ?, ?)`,
                [uniqueID, data.org_name, data.contact_name, data.email, data.phone || '', data.status || 'active']
            );
            return this.findById(uniqueID);
        } catch (error: any) {
            throw new Error(error?.message || "Error While Creating Client");
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
            const [result] = await connection.query<RowDataPacket[]>(`SELECT * FROM clients WHERE id=?`, [id]);
            return (result[0] as ClientModel) || null;
        } catch (error: any) {
            throw new Error(error?.message || "Error While Finding Client With ID " + id);
        } finally {
            if (connection) {
                connection.release();
            }
        }
    },

    async findByEmail(email: string) {
        let connection;
        try {
            connection = await pool.getConnection();
            const [result] = await connection.query<RowDataPacket[]>(`SELECT * FROM clients WHERE email=?`, [email]);
            return (result[0] as ClientModel) || null;
        } catch (error: any) {
            throw new Error(error?.message || "Error While Finding Client With Email " + email);
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
            const [result] = await connection.query<RowDataPacket[]>(`
                SELECT c.*, 
                       COUNT(l.id) AS total_licenses,
                       SUM(CASE WHEN l.status = 'active' AND l.expiry_date > NOW() THEN 1 ELSE 0 END) AS active_licenses
                FROM clients c
                LEFT JOIN licenses l ON c.id = l.client_id
                GROUP BY c.id
                ORDER BY c.created_at DESC
            `);
            return result;
        } catch (error: any) {
            throw new Error(error?.message || "Not Able To Find The Clients");
        } finally {
            if (connection) {
                connection.release();
            }
        }
    },
    
    async delete(id: string) {
        let connection;
        try {
            connection = await pool.getConnection();
            const [res] = await connection.query<ResultSetHeader>('DELETE FROM clients WHERE id=?', [id]);
            return res.affectedRows > 0;
        } catch (error: any) {
            throw new Error(error?.message || "Error While Deleting Client");
        } finally {
            if (connection) {
                connection.release();
            }
        }
    },

    async updateStatus(id: string, status: 'active' | 'inactive' | 'suspended') {
        let connection;
        try {
            connection = await pool.getConnection();
            await connection.query<ResultSetHeader>('UPDATE clients SET status=? WHERE id=?', [status, id]);
            return this.findById(id);
        } catch (error: any) {
            throw new Error(error?.message || "Error While Updating Client Status");
        } finally {
            if (connection) {
                connection.release();
            }
        }
    },

    async update(id: string, data: Partial<ClientModel>) {
        let connection;
        try {
            connection = await pool.getConnection();
            const entries = Object.fromEntries(
                Object.entries(data).filter(([key, value]) => value !== undefined && key !== 'id')
            );
            
            const keys = Object.keys(entries);
            if (keys.length <= 0) {
                throw new Error('No Fields Provided To Update');
            }

            const values = [...Object.values(entries), id];
            const clause = keys.map((field) => `${field}=?`).join(', ');

            const query = `UPDATE clients SET ${clause} WHERE id=?`;
            await connection.query<ResultSetHeader>(query, values);

            return this.findById(id);
        } catch (error: any) {
            throw new Error(error?.message || "Error While Updating Client Details");
        } finally {
            if (connection) {
                connection.release();
            }
        }
    },

    async count() {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows]: any = await connection.query(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
                    SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspended
                FROM clients
            `);
            return rows[0] || { total: 0, active: 0, suspended: 0 };
        } finally {
            if (connection) connection.release();
        }
    },

    async getClientHeartbeatStatus() {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.query<RowDataPacket[]>(`
                SELECT 
                    c.id,
                    c.org_name,
                    c.contact_name,
                    c.email,
                    c.status as client_status,
                    COUNT(DISTINCT l.id) as total_licenses,
                    SUM(CASE WHEN l.status = 'active' AND l.expiry_date > NOW() THEN 1 ELSE 0 END) as active_licenses,
                    COALESCE(MAX(u.created_at), MAX(l.last_validated_at)) as last_heartbeat_at,
                    TIMESTAMPDIFF(HOUR, COALESCE(MAX(u.created_at), MAX(l.last_validated_at)), NOW()) as hours_since_ping
                FROM clients c
                LEFT JOIN licenses l ON c.id = l.client_id
                LEFT JOIN usage_logs u ON c.id = u.client_id AND u.action_type = 'ping' AND u.status = 'success'
                GROUP BY c.id, c.org_name, c.contact_name, c.email, c.status
                ORDER BY (hours_since_ping IS NULL) ASC, hours_since_ping ASC
            `);
            return rows;
        } finally {
            if (connection) connection.release();
        }
    }
};