import { LicenseModel } from './license.model.js';
import { ClientModel } from '../client/client.model.js';
import { UsageLogModel } from '../usage/usage.model.js';
import env from '../../config/env.config.js';
import { generateLicenseKey } from '../../utils/licenseGenerator.util.js';

export interface PingPayload {
    license_key: string;
    client_identifier?: string;
    machine_id?: string;
    app_version?: string;
    platform?: string;
    ip?: string;
}

function formatDate12h(date: Date | string | null | undefined, includeSeconds = true): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);

    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();

    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hourStr = String(hours).padStart(2, '0');

    if (includeSeconds) {
        const seconds = String(d.getSeconds()).padStart(2, '0');
        return `${day} ${month} ${year}, ${hourStr}:${minutes}:${seconds} ${ampm}`;
    }
    return `${day} ${month} ${year}, ${hourStr}:${minutes} ${ampm}`;
}

export const LicenseService = {
    async createLicense(clientID: string, validityDays?: number) {
        const client = await ClientModel.findById(clientID);
        if (!client) {
            throw new Error(`Client with ID ${clientID} not found`);
        }

        const days = validityDays && validityDays > 0 ? validityDays : env.DEFAULT_LICENSE_VALIDITY_DAYS;
        const licenseKey = generateLicenseKey();

        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + days);

        return await LicenseModel.create({
            client_id: clientID,
            license_key: licenseKey,
            expiry_date: expiryDate,
            status: 'active',
            max_pings_per_day: 4
        });
    },

    async getAllLicenses() {
        return await LicenseModel.findAll();
    },

    async getById(id: string) {
        const license = await LicenseModel.findById(id);
        if (!license) {
            throw new Error(`License with ID ${id} not found`);
        }
        return license;
    },

    async getByClientId(clientId: string) {
        return await LicenseModel.findByClientId(clientId);
    },

    async revokeLicense(id: string) {
        const license = await LicenseModel.findById(id);
        if (!license) {
            throw new Error(`License with ID ${id} not found`);
        }
        return await LicenseModel.updateStatus(id, 'revoked');
    },

    async updateStatus(id: string, status: 'active' | 'expired' | 'suspended' | 'revoked') {
        const license = await LicenseModel.findById(id);
        if (!license) {
            throw new Error(`License with ID ${id} not found`);
        }
        return await LicenseModel.updateStatus(id, status);
    },

    async deleteLicense(id: string) {
        const license = await LicenseModel.findById(id);
        if (!license) {
            throw new Error(`License with ID ${id} not found`);
        }
        return await LicenseModel.delete(id);
    },

    /**
     * Heartbeat Verification Engine for Cortex Client
     * Periodic ping every 5-7 hours.
     */
    async validatePing(payload: PingPayload) {
        const { license_key, machine_id, app_version, platform, ip } = payload;
        const ipAddress = ip || '127.0.0.1';

        if (!license_key || typeof license_key !== 'string') {
            await UsageLogModel.createLog({
                action_type: 'ping',
                status: 'failed',
                ip_address: ipAddress,
                metadata: { error: 'Missing or empty license key', payload }
            });
            return {
                allowed: false,
                code: 'INVALID_PAYLOAD',
                message: 'License key is required in request payload'
            };
        }

        const cleanKey = license_key.trim();
        const license = await LicenseModel.findByKey(cleanKey);

        // 1. Check if key exists
        if (!license) {
            await UsageLogModel.createLog({
                action_type: 'ping',
                status: 'failed',
                ip_address: ipAddress,
                metadata: {
                    error: 'Unknown license key',
                    license_key_attempted: cleanKey,
                    machine_id,
                    app_version
                }
            });
            return {
                allowed: false,
                code: 'INVALID_KEY',
                message: 'License key does not exist or is unrecognized'
            };
        }

        // 2. Check License Status
        if (license.status === 'revoked') {
            await UsageLogModel.createLog({
                client_id: license.client_id,
                license_id: license.id,
                action_type: 'ping',
                status: 'failed',
                ip_address: ipAddress,
                metadata: { reason: 'License revoked by administrator', machine_id }
            });
            return {
                allowed: false,
                code: 'LICENSE_REVOKED',
                message: 'This license has been revoked by the administrator'
            };
        }

        if (license.status === 'suspended') {
            await UsageLogModel.createLog({
                client_id: license.client_id,
                license_id: license.id,
                action_type: 'ping',
                status: 'failed',
                ip_address: ipAddress,
                metadata: { reason: 'License suspended', machine_id }
            });
            return {
                allowed: false,
                code: 'LICENSE_SUSPENDED',
                message: 'This license is temporarily suspended'
            };
        }

        // 3. Check Expiry
        const now = new Date();
        const expiryDate = new Date(license.expiry_date);
        if (now > expiryDate) {
            if (license.status !== 'expired') {
                await LicenseModel.updateStatus(license.id, 'expired');
            }
            await UsageLogModel.createLog({
                client_id: license.client_id,
                license_id: license.id,
                action_type: 'ping',
                status: 'failed',
                ip_address: ipAddress,
                metadata: { reason: 'License expired', expiry_date: expiryDate }
            });
            return {
                allowed: false,
                code: 'LICENSE_EXPIRED',
                message: `License expired on ${formatDate12h(expiryDate)}`
            };
        }

        // 4. Check Client Status
        if (license.client_status && license.client_status !== 'active') {
            await UsageLogModel.createLog({
                client_id: license.client_id,
                license_id: license.id,
                action_type: 'ping',
                status: 'failed',
                ip_address: ipAddress,
                metadata: { reason: `Client account status is ${license.client_status}` }
            });
            return {
                allowed: false,
                code: 'CLIENT_INACTIVE',
                message: `Client organization account is ${license.client_status}`
            };
        }

        // 5. Verification Passed! Update telemetry and log success
        await LicenseModel.updateLastValidated(license.id, now);
        await UsageLogModel.createLog({
            client_id: license.client_id,
            license_id: license.id,
            action_type: 'ping',
            status: 'success',
            ip_address: ipAddress,
            metadata: {
                machine_id: machine_id || 'unknown',
                app_version: app_version || '1.0.0',
                platform: platform || 'unknown'
            }
        });

        return {
            allowed: true,
            status: 'active',
            client: {
                org_name: license.org_name,
                contact_name: license.contact_name,
                email: license.client_email
            },
            expiry_date: license.expiry_date,
            expiry_date_12h: formatDate12h(license.expiry_date, false),
            next_ping_interval_hours: env.LICENSE_PING_INTERVAL_HOURS,
            server_time: now.toISOString(),
            server_time_12h: formatDate12h(now, true)
        };
    }
};