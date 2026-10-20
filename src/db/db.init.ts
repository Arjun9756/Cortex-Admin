import pool from '../config/db.config.js';
import env from '../config/env.config.js';
import { hashPassword } from '../utils/auth.util.js';
import { snowflake } from '../utils/SnowFlakeIdGenerator.js';
import { RowDataPacket } from 'mysql2';

export async function initDatabase() {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log('🔧 Checking & initializing MySQL database schema in:', env.AIVEN_SQL_DATABASE);

        // 1. Clients Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS clients (
                id VARCHAR(32) PRIMARY KEY,
                org_name VARCHAR(255) NOT NULL,
                contact_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                phone VARCHAR(20),
                status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_email (email),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // 2. Licenses Table (max_machines: how many unique HWIDs are allowed)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS licenses (
                id VARCHAR(32) PRIMARY KEY,
                client_id VARCHAR(32) NOT NULL,
                license_key VARCHAR(68) NOT NULL UNIQUE,
                status ENUM('active', 'expired', 'suspended', 'revoked') DEFAULT 'active',
                issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expiry_date DATETIME NOT NULL,
                last_validated_at DATETIME,
                max_pings_per_day INT DEFAULT 4,
                max_machines INT DEFAULT 1,
                FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
                INDEX idx_license_key (license_key),
                INDEX idx_status (status),
                INDEX idx_client_id (client_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Add max_machines column if it doesn't exist (robust migration for MySQL 8.0)
        try {
            const [cols]: any = await connection.query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                  AND TABLE_NAME = 'licenses' 
                  AND COLUMN_NAME = 'max_machines'
            `);
            if (!cols || cols.length === 0) {
                await connection.query(`ALTER TABLE licenses ADD COLUMN max_machines INT DEFAULT 1`);
                console.log('✅ Successfully added max_machines column to licenses table');
            }
        } catch (colErr: any) {
            console.error('⚠️ Could not alter licenses table for max_machines:', colErr.message);
        }

        // 3. License HWIDs Table — stores all registered hardware IDs per license
        await connection.query(`
            CREATE TABLE IF NOT EXISTS license_hwids (
                id VARCHAR(32) PRIMARY KEY,
                license_id VARCHAR(32) NOT NULL,
                hwid VARCHAR(512) NOT NULL,
                label VARCHAR(255),
                first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen_at TIMESTAMP NULL DEFAULT NULL,
                is_blocked TINYINT(1) DEFAULT 0,
                FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE CASCADE,
                UNIQUE KEY uniq_license_hwid (license_id, hwid),
                INDEX idx_license_id (license_id),
                INDEX idx_hwid (hwid(128))
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // Migration: Ensure last_seen_at is nullable and DOES NOT mutate on admin row updates
        try {
            await connection.query(`
                ALTER TABLE license_hwids 
                MODIFY COLUMN last_seen_at TIMESTAMP NULL DEFAULT NULL
            `);
        } catch (hwidColErr: any) {
            console.error('⚠️ Could not alter license_hwids last_seen_at column:', hwidColErr.message);
        }

        // 4. Usage Logs Table (client_id & license_id nullable so failed pings from unauthorized keys can be recorded safely)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS usage_logs (
                id VARCHAR(32) PRIMARY KEY,
                client_id VARCHAR(32) NULL,
                license_id VARCHAR(32) NULL,
                action_type ENUM('ping', 'query', 'export', 'other') NOT NULL,
                query_count INT DEFAULT 0,
                status ENUM('success', 'failed') DEFAULT 'success',
                ip_address VARCHAR(45),
                metadata JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
                FOREIGN KEY (license_id) REFERENCES licenses(id) ON DELETE SET NULL,
                INDEX idx_client_created (client_id, created_at),
                INDEX idx_action_type (action_type),
                INDEX idx_created_at (created_at),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // 5. Admin Users Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS admin_users (
                id VARCHAR(32) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                role ENUM('super_admin', 'admin', 'viewer') DEFAULT 'admin',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_email (email)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        // 6. Client Connectors Table (Tracks OAuth tools connected by self-hosted clients)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS client_connectors (
                id VARCHAR(32) PRIMARY KEY,
                client_id VARCHAR(32) NOT NULL,
                license_key VARCHAR(68) NOT NULL,
                provider ENUM('github', 'slack', 'jira') NOT NULL,
                status ENUM('connected', 'disconnected', 'needs_reauth') DEFAULT 'connected',
                account_name VARCHAR(255),
                account_email VARCHAR(255),
                account_id VARCHAR(255),
                scopes JSON,
                connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
                UNIQUE KEY uniq_license_provider (license_key, provider),
                INDEX idx_license (license_key),
                INDEX idx_client_id (client_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        try {
            await connection.query('ALTER TABLE client_connectors ADD COLUMN webhook_url VARCHAR(500) NULL AFTER scopes');
        } catch {
            // column already exists
        }

        // Sync/Seed default super admin from env
        const adminEmail = (env.ADMIN_DEFAULT_EMAIL || 'admin@cortex.com').toLowerCase().trim();
        const passwordHash = hashPassword(env.ADMIN_DEFAULT_PASSWORD || 'Admin@Cortex2026');
        const [existing] = await connection.query<RowDataPacket[]>(
            'SELECT id FROM admin_users WHERE email = ?',
            [adminEmail]
        );

        if (existing && existing.length > 0) {
            await connection.query(
                'UPDATE admin_users SET password_hash = ?, role = ? WHERE email = ?',
                [passwordHash, 'super_admin', adminEmail]
            );
            console.log(`✅ Default Super Admin synchronized with .env: ${adminEmail}`);
        } else {
            const adminId = snowflake.nextID().toString();
            await connection.query(
                'INSERT INTO admin_users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
                [adminId, 'Super Admin', adminEmail, passwordHash, 'super_admin']
            );
            console.log(`✅ Default Super Admin created from .env: ${adminEmail}`);
        }

        console.log('✅ Database schema initialized successfully.');
    } catch (err: any) {
        console.error('❌ Database initialization error:', err.message);
        throw err;
    } finally {
        if (connection) {
            connection.release();
        }
    }
}
