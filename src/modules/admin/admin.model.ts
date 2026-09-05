import { ResultSetHeader, RowDataPacket } from 'mysql2';
import pool from '../../config/db.config.js';
import { snowflake } from '../../utils/SnowFlakeIdGenerator.js';

export interface AdminUserModel {
    id?: string;
    name: string;
    email: string;
    password_hash: string;
    role?: 'super_admin' | 'admin' | 'viewer';
    created_at?: Date;
}

export const AdminModel = {
    async create(data: AdminUserModel) {
        let connection;
        try {
            connection = await pool.getConnection();
            const uniqueID = snowflake.nextID().toString();

            await connection.query<ResultSetHeader>(
                `INSERT INTO admin_users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`,
                [uniqueID, data.name, data.email, data.password_hash, data.role || 'admin']
            );
            return this.findById(uniqueID);
        } finally {
            if (connection) connection.release();
        }
    },

    async findById(id: string) {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.query<RowDataPacket[]>(
                `SELECT id, name, email, role, created_at FROM admin_users WHERE id = ?`,
                [id]
            );
            return rows[0] || null;
        } finally {
            if (connection) connection.release();
        }
    },

    async findByEmail(email: string) {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.query<RowDataPacket[]>(
                `SELECT * FROM admin_users WHERE email = ?`,
                [email]
            );
            return rows[0] || null;
        } finally {
            if (connection) connection.release();
        }
    },

    async findAll() {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows] = await connection.query<RowDataPacket[]>(
                `SELECT id, name, email, role, created_at FROM admin_users ORDER BY created_at DESC`
            );
            return rows;
        } finally {
            if (connection) connection.release();
        }
    },

    async update(id: string, data: { name?: string; role?: 'super_admin' | 'admin' | 'viewer'; password_hash?: string }) {
        let connection;
        try {
            connection = await pool.getConnection();
            const updates: string[] = [];
            const values: any[] = [];

            if (data.name) {
                updates.push('name = ?');
                values.push(data.name);
            }
            if (data.role) {
                updates.push('role = ?');
                values.push(data.role);
            }
            if (data.password_hash) {
                updates.push('password_hash = ?');
                values.push(data.password_hash);
            }

            if (updates.length === 0) return this.findById(id);

            values.push(id);
            await connection.query(`UPDATE admin_users SET ${updates.join(', ')} WHERE id = ?`, values);
            return this.findById(id);
        } finally {
            if (connection) connection.release();
        }
    },

    async delete(id: string) {
        let connection;
        try {
            connection = await pool.getConnection();
            const [res] = await connection.query<ResultSetHeader>('DELETE FROM admin_users WHERE id = ?', [id]);
            return res.affectedRows > 0;
        } finally {
            if (connection) connection.release();
        }
    },

    async count() {
        let connection;
        try {
            connection = await pool.getConnection();
            const [rows]: any = await connection.query('SELECT COUNT(*) as total FROM admin_users');
            return rows[0]?.total || 0;
        } finally {
            if (connection) connection.release();
        }
    }
};
