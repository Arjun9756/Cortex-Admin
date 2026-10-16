import { LicenseModel } from './license.model.js';
import { ClientModel } from '../client/client.model.js';
import { UsageLogModel } from '../usage/usage.model.js';
import env from '../../config/env.config.js';
import { generateLicenseKey } from '../../utils/licenseGenerator.util.js';

export interface PingPayload {
    license_key: string;
    machine_id?: string;       // Hardware fingerprint / HWID sent by client (MANDATORY)
    app_version?: string;
    platform?: string;
    ip?: string;
    nonce?: string;
    timestamp?: string;
}

function formatDate12h(date: Date | string | null | undefined, includeSeconds = true): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);

    const day = d.getDate();
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
    async createLicense(clientID: string, validityDays?: number, maxMachines?: number) {
        const client = await ClientModel.findById(clientID);
        if (!client) throw new Error(`Client with ID ${clientID} not found`);

        const days = validityDays && validityDays > 0 ? validityDays : env.DEFAULT_LICENSE_VALIDITY_DAYS;
        const licenseKey = generateLicenseKey();

        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + days);

        return await LicenseModel.create({
            client_id: clientID,
            license_key: licenseKey,
            expiry_date: expiryDate,
            status: 'active',
            max_pings_per_day: 4,
            max_machines: maxMachines && maxMachines > 0 ? maxMachines : 1
        });
    },

    async getAllLicenses() {
        return await LicenseModel.findAll();
    },

    async getById(id: string) {
        const license = await LicenseModel.findById(id);
        if (!license) throw new Error(`License with ID ${id} not found`);
        return license;
    },

    async getByClientId(clientId: string) {
        return await LicenseModel.findByClientId(clientId);
    },

    async revokeLicense(id: string) {
        const license = await LicenseModel.findById(id);
        if (!license) throw new Error(`License with ID ${id} not found`);
        return await LicenseModel.updateStatus(id, 'revoked');
    },

    async updateStatus(id: string, status: 'active' | 'expired' | 'suspended' | 'revoked') {
        const license = await LicenseModel.findById(id);
        if (!license) throw new Error(`License with ID ${id} not found`);
        return await LicenseModel.updateStatus(id, status);
    },

    async deleteLicense(id: string) {
        const license = await LicenseModel.findById(id);
        if (!license) throw new Error(`License with ID ${id} not found`);
        return await LicenseModel.delete(id);
    },

    async updateLicense(id: string, data: { status?: any; max_machines?: number; expiry_date?: string }) {
        const license = await LicenseModel.findById(id);
        if (!license) throw new Error(`License with ID ${id} not found`);
        return await LicenseModel.updateLicense(id, data);
    },

    async updateMaxMachines(id: string, maxMachines: number) {
        const license = await LicenseModel.findById(id);
        if (!license) throw new Error(`License with ID ${id} not found`);
        if (maxMachines < 1 || maxMachines > 100) throw new Error('max_machines must be between 1 and 100');
        return await LicenseModel.updateMaxMachines(id, maxMachines);
    },

    // ─── HWID Management (Admin) ──────────────────────────────────────────────────

    async getHwids(licenseId: string) {
        const license = await LicenseModel.findById(licenseId);
        if (!license) throw new Error(`License with ID ${licenseId} not found`);
        return await LicenseModel.getHwids(licenseId);
    },

    async getAllHwidsGlobal() {
        return await LicenseModel.getAllHwidsGlobal();
    },

    async resetHwids(licenseId: string) {
        const license = await LicenseModel.findById(licenseId);
        if (!license) throw new Error(`License with ID ${licenseId} not found`);
        const removed = await LicenseModel.resetAllHwids(licenseId);
        return { removed, message: `All ${removed} HWID(s) cleared. Next ping will register fresh.` };
    },

    async removeHwid(licenseId: string, hwid: string) {
        const license = await LicenseModel.findById(licenseId);
        if (!license) throw new Error(`License with ID ${licenseId} not found`);
        const removed = await LicenseModel.removeHwid(licenseId, hwid);
        if (!removed) throw new Error('HWID not found for this license');
        return { message: 'HWID removed successfully. That slot is now free.' };
    },

    async blockHwid(licenseId: string, hwid: string, blocked: boolean) {
        const license = await LicenseModel.findById(licenseId);
        if (!license) throw new Error(`License with ID ${licenseId} not found`);
        const record = await LicenseModel.findHwid(licenseId, hwid);
        if (!record) throw new Error('HWID not found for this license');
        await LicenseModel.setHwidBlocked(licenseId, hwid, blocked);
        return { message: blocked ? 'HWID blocked successfully.' : 'HWID unblocked successfully.' };
    },

    async addHwid(licenseId: string, hwid: string, label?: string) {
        const license = await LicenseModel.findById(licenseId);
        if (!license) throw new Error(`License with ID ${licenseId} not found`);
        if (!hwid || hwid.trim().length < 8) throw new Error('HWID must be at least 8 characters');

        const maxMachines = license.max_machines ?? 1;
        const activeCount = await LicenseModel.countActiveHwids(licenseId);

        // Check if HWID already exists for this license
        const existing = await LicenseModel.findHwid(licenseId, hwid.trim());
        if (existing) throw new Error('This HWID is already registered for this license');

        if (activeCount >= maxMachines) {
            throw new Error(`Machine limit reached (${activeCount}/${maxMachines}). Remove an existing HWID or increase max_machines first.`);
        }

        const record = await LicenseModel.registerHwid(licenseId, hwid.trim(), label || 'Manual Whitelist', false);
        return { data: record, message: 'HWID added successfully.' };
    },

    // ─── Heartbeat Verification Engine (Client ➔ /ping) ───────────────────────────

    /**
     * Strict HWID-enforced ping validation flow:
     * 1. Validate key exists
     * 2. Anti-Replay: Timestamp drift check
     * 3. Check license & client status (Revoked / Suspended immediate lockout)
     * 4. Check expiry
     * 5. Mandatory HWID check:
     *    a. If missing / < 8 chars ➔ DENY (MISSING_HWID)
     *    b. If HWID already registered + blocked ➔ DENY (HWID_BLOCKED)
     *    c. If HWID already registered + not blocked ➔ Touch timestamp, ALLOW
     *    d. If HWID is new:
     *       - If slot available (activeHwids < max_machines) ➔ Auto-register (TOFU), ALLOW
     *       - If slots full ➔ DENY with HWID_LIMIT_REACHED
     */
    async validatePing(payload: PingPayload) {
        const { license_key, app_version, platform, ip, timestamp } = payload;
        const rawHwid = payload.machine_id || (payload as any).hwid;
        const hwid = rawHwid ? String(rawHwid).trim() : null;
        const ipAddress = ip || '127.0.0.1';

        // 1. Missing or invalid license key
        if (!license_key || typeof license_key !== 'string') {
            await UsageLogModel.createLog({
                action_type: 'ping',
                status: 'failed',
                ip_address: ipAddress,
                metadata: { error: 'Missing or empty license key', payload }
            });
            return { allowed: false, code: 'INVALID_PAYLOAD', message: 'License key is required in request payload' };
        }

        const cleanKey = license_key.trim();
        const license = await LicenseModel.findByKey(cleanKey);

        if (!license) {
            await UsageLogModel.createLog({
                action_type: 'ping',
                status: 'failed',
                ip_address: ipAddress,
                metadata: { error: 'Unknown license key', license_key_attempted: cleanKey, hwid, app_version }
            });
            return { allowed: false, code: 'INVALID_KEY', message: 'License key does not exist or is unrecognized' };
        }

        // 2. Anti-Replay Timestamp Skew Check (Reject if clock drift > 5 minutes)
        if (timestamp) {
            const clientTime = new Date(timestamp).getTime();
            if (!isNaN(clientTime) && Math.abs(Date.now() - clientTime) > 5 * 60 * 1000) {
                await UsageLogModel.createLog({
                    client_id: license.client_id, license_id: license.id,
                    action_type: 'ping', status: 'failed', ip_address: ipAddress,
                    metadata: { error: 'Replay timestamp drift exceeds 5 minutes', timestamp, server_time: new Date().toISOString() }
                });
                return {
                    allowed: false,
                    code: 'REPLAY_ATTACK_DETECTED',
                    message: 'Ping timestamp drift exceeds 5 minutes. Check client system clock.'
                };
            }
        }

        // 3. License status checks (Immediate Client Revocation Sync)
        if (license.status === 'revoked') {
            await UsageLogModel.createLog({
                client_id: license.client_id, license_id: license.id,
                action_type: 'ping', status: 'failed', ip_address: ipAddress,
                metadata: { reason: 'License revoked by administrator', hwid }
            });
            return { allowed: false, code: 'LICENSE_REVOKED', message: 'This license has been revoked by the administrator' };
        }

        if (license.status === 'suspended') {
            await UsageLogModel.createLog({
                client_id: license.client_id, license_id: license.id,
                action_type: 'ping', status: 'failed', ip_address: ipAddress,
                metadata: { reason: 'License suspended by administrator', hwid }
            });
            return { allowed: false, code: 'LICENSE_SUSPENDED', message: 'This license is temporarily suspended' };
        }

        // 4. Expiry check
        const now = new Date();
        const expiryDate = new Date(license.expiry_date);
        if (now > expiryDate) {
            if (license.status !== 'expired') await LicenseModel.updateStatus(license.id, 'expired');
            await UsageLogModel.createLog({
                client_id: license.client_id, license_id: license.id,
                action_type: 'ping', status: 'failed', ip_address: ipAddress,
                metadata: { reason: 'License expired', expiry_date: expiryDate }
            });
            return { allowed: false, code: 'LICENSE_EXPIRED', message: `License expired on ${formatDate12h(expiryDate)}` };
        }

        // 5. Client status check
        if (license.client_status && license.client_status !== 'active') {
            await UsageLogModel.createLog({
                client_id: license.client_id, license_id: license.id,
                action_type: 'ping', status: 'failed', ip_address: ipAddress,
                metadata: { reason: `Client account status is ${license.client_status}` }
            });
            return { allowed: false, code: 'CLIENT_INACTIVE', message: `Client organization account is ${license.client_status}` };
        }

        // 6. Strict Mandatory HWID Enforcement
        if (!hwid || hwid.length < 8) {
            await UsageLogModel.createLog({
                client_id: license.client_id, license_id: license.id,
                action_type: 'ping', status: 'failed', ip_address: ipAddress,
                metadata: { error: 'Missing or short HWID in payload', hwid }
            });
            return {
                allowed: false,
                code: 'MISSING_HWID',
                message: 'A valid hardware machine identifier (HWID) is required for license activation and verification.'
            };
        }

        const maxMachines: number = license.max_machines ?? 1;
        const existingHwid = await LicenseModel.findHwid(license.id, hwid);
        let currentActiveCount = 0;

        if (existingHwid) {
            // HWID is already registered
            if (existingHwid.is_blocked) {
                await UsageLogModel.createLog({
                    client_id: license.client_id, license_id: license.id,
                    action_type: 'ping', status: 'failed', ip_address: ipAddress,
                    metadata: { reason: 'HWID blocked by administrator', hwid }
                });
                return {
                    allowed: false,
                    code: 'HWID_BLOCKED',
                    message: 'This machine has been blocked by the administrator. Contact support.'
                };
            }
            // Valid existing HWID - touch timestamp
            await LicenseModel.touchHwid(license.id, hwid);
            currentActiveCount = await LicenseModel.countActiveHwids(license.id);
        } else {
            // New HWID - check if slots available
            const activeCount = await LicenseModel.countActiveHwids(license.id);
            if (activeCount >= maxMachines) {
                await UsageLogModel.createLog({
                    client_id: license.client_id, license_id: license.id,
                    action_type: 'ping', status: 'failed', ip_address: ipAddress,
                    metadata: { reason: 'HWID machine limit reached', hwid, active_hwids: activeCount, max_machines: maxMachines }
                });
                return {
                    allowed: false,
                    code: 'HWID_LIMIT_REACHED',
                    message: `Hardware mismatch. This license is locked to ${maxMachines} device(s). Machine ${hwid} is unauthorized. Contact your administrator to reset or increase machine allowance.`
                };
            }
            // Auto-register this new HWID on first request (TOFU)!
            await LicenseModel.registerHwid(license.id, hwid, `Auto: ${platform || 'unknown'} / ${app_version || '?'}`);
            currentActiveCount = activeCount + 1;
        }

        // 7. All checks passed - update telemetry and respond
        await LicenseModel.updateLastValidated(license.id, now);
        await UsageLogModel.createLog({
            client_id: license.client_id, license_id: license.id,
            action_type: 'ping', status: 'success', ip_address: ipAddress,
            metadata: {
                machine_id: hwid,
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
            server_time_12h: formatDate12h(now, true),
            bound_hwid: hwid,
            seats_used: `${currentActiveCount}/${maxMachines}`
        };
    }
};
