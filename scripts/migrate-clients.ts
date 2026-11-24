import pool from '../src/config/db.config.js';
import { snowflake } from '../src/utils/SnowFlakeIdGenerator.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

interface ClientInput {
    id?: string;
    org_name: string;
    contact_name: string;
    email: string;
    phone?: string;
    status?: 'active' | 'inactive' | 'suspended';
    license_key?: string;
    validity_days?: number;
    max_machines?: number;
    max_pings_per_day?: number;
}

// Generate realistic license key if not provided: CTX-XXXX-XXXX-XXXX-XXXX
function generateLicenseKey(): string {
    const p1 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const p2 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const p3 = crypto.randomBytes(2).toString('hex').toUpperCase();
    const p4 = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `CTX-${p1}-${p2}-${p3}-${p4}`;
}

async function runMigration() {
    console.log('\n======================================================');
    console.log('🚀 TiDB Data Migration: Clients & Licenses Importer');
    console.log('======================================================\n');

    const jsonPath = path.join(process.cwd(), 'scripts', 'clients_to_migrate.json');

    let clientsToMigrate: ClientInput[] = [];

    if (fs.existsSync(jsonPath)) {
        console.log(`📄 Found custom migration file: ${jsonPath}`);
        try {
            const raw = fs.readFileSync(jsonPath, 'utf-8');
            clientsToMigrate = JSON.parse(raw);
        } catch (e: any) {
            console.error('❌ Failed to parse clients_to_migrate.json:', e.message);
            process.exit(1);
        }
    } else {
        console.log(`ℹ️ No scripts/clients_to_migrate.json found. Creating sample template...`);
        const sample: ClientInput[] = [
            {
                org_name: 'Example Org 1',
                contact_name: 'Client One',
                email: 'client1@example.com',
                phone: '+91-9876543210',
                status: 'active',
                validity_days: 264,
                max_machines: 3
            },
            {
                org_name: 'Example Org 2',
                contact_name: 'Client Two',
                email: 'client2@example.com',
                phone: '+91-9876543211',
                status: 'active',
                validity_days: 365,
                max_machines: 5
            }
        ];
        fs.writeFileSync(jsonPath, JSON.stringify(sample, null, 2), 'utf-8');
        console.log(`Created sample file at: ${jsonPath}`);
        console.log(`Edit ${jsonPath} with your real clients data and re-run this script!\n`);
        clientsToMigrate = sample;
    }

    if (!Array.isArray(clientsToMigrate) || clientsToMigrate.length === 0) {
        console.log('No clients to migrate in clients_to_migrate.json');
        process.exit(0);
    }

    console.log(`Found ${clientsToMigrate.length} client(s) to process.`);

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        for (const item of clientsToMigrate) {
            const clientId = item.id || snowflake.nextID().toString();
            const email = item.email.trim().toLowerCase();
            const orgName = item.org_name.trim();
            const contactName = item.contact_name.trim();
            const phone = item.phone || null;
            const status = item.status || 'active';

            console.log(`\nProcessing client: ${orgName} (${email})...`);

            // 1. Insert / Update Client
            await conn.query(
                `INSERT INTO clients (id, org_name, contact_name, email, phone, status, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
                 ON DUPLICATE KEY UPDATE
                    org_name = VALUES(org_name),
                    contact_name = VALUES(contact_name),
                    phone = VALUES(phone),
                    status = VALUES(status),
                    updated_at = NOW()`,
                [clientId, orgName, contactName, email, phone, status]
            );

            // Fetch actual clientId if it was an update by email
            const [clientRows]: any = await conn.query('SELECT id FROM clients WHERE email = ?', [email]);
            const resolvedClientId = clientRows[0]?.id || clientId;

            // 2. Insert License if client doesn't already have one, or create specified one
            const licenseKey = item.license_key || generateLicenseKey();
            const days = item.validity_days || 264;
            const maxMachines = item.max_machines || 1;
            const maxPings = item.max_pings_per_day || 4;
            const licenseId = snowflake.nextID().toString();

            const [existingLic]: any = await conn.query('SELECT id, license_key FROM licenses WHERE client_id = ?', [resolvedClientId]);
            if (existingLic && existingLic.length > 0) {
                console.log(`  ℹ️ Existing license found for client: ${existingLic[0].license_key}`);
            } else {
                await conn.query(
                    `INSERT INTO licenses (id, client_id, license_key, status, expiry_date, max_machines, max_pings_per_day, issued_at)
                     VALUES (?, ?, ?, 'active', DATE_ADD(NOW(), INTERVAL ? DAY), ?, ?, NOW())`,
                    [licenseId, resolvedClientId, licenseKey, days, maxMachines, maxPings]
                );
                console.log(`  ✅ Created License: ${licenseKey} (valid for ${days} days, ${maxMachines} seats)`);
            }
        }

        await conn.commit();
        console.log('\n🎉 ALL CLIENTS MIGRATED SUCCESSFULLY TO TIDB CLUSTER!');

        // Query and display
        const [verified]: any = await conn.query(`
            SELECT c.id as client_id, c.org_name, c.email, c.status, l.license_key, l.max_machines, l.expiry_date
            FROM clients c
            LEFT JOIN licenses l ON l.client_id = c.id
            ORDER BY c.created_at DESC
        `);
        console.log('\nCurrent TiDB Clients Table:');
        console.table(verified);
    } catch (err: any) {
        await conn.rollback();
        console.error('❌ Migration failed and rolled back:', err.message);
    } finally {
        conn.release();
        await pool.end();
    }
}

runMigration();
