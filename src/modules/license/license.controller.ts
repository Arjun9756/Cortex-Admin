import { Request, Response } from 'express';
import { LicenseService } from './license.service.js';

export const LicenseController = {
    /**
     * Heartbeat validation endpoint for Cortex client app
     * POST /api/license/ping (or /api/license/verify)
     */
    async ping(req: Request, res: Response) {
        try {
            const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
            const result = await LicenseService.validatePing({
                ...req.body,
                ip: typeof ip === 'string' ? ip.split(',')[0]?.trim() : '127.0.0.1'
            });

            // Return 200 with allowed: true | false so Cortex client can easily inspect
            res.status(200).json(result);
        } catch (error: any) {
            res.status(500).json({ allowed: false, code: 'INTERNAL_ERROR', message: error.message });
        }
    },

    async create(req: Request, res: Response) {
        try {
            const { client_id, validity_days } = req.body;
            if (!client_id) {
                return res.status(400).json({ success: false, message: 'client_id is required' });
            }
            const license = await LicenseService.createLicense(client_id, validity_days ? parseInt(validity_days) : undefined);
            res.status(201).json({ success: true, data: license, message: 'License key issued successfully' });
        } catch (error: any) {
            res.status(400).json({ success: false, message: error.message });
        }
    },

    async getAll(req: Request, res: Response) {
        try {
            const licenses = await LicenseService.getAllLicenses();
            res.status(200).json({ success: true, data: licenses });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    async getById(req: Request, res: Response) {
        try {
            const id = req.params.id as string;
            const license = await LicenseService.getById(id);
            res.status(200).json({ success: true, data: license });
        } catch (error: any) {
            res.status(404).json({ success: false, message: error.message });
        }
    },

    async getByClient(req: Request, res: Response) {
        try {
            const clientId = req.params.clientId as string;
            const licenses = await LicenseService.getByClientId(clientId);
            res.status(200).json({ success: true, data: licenses });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    async revoke(req: Request, res: Response) {
        try {
            const id = req.params.id as string;
            const license = await LicenseService.revokeLicense(id);
            res.status(200).json({ success: true, data: license, message: 'License revoked successfully' });
        } catch (error: any) {
            res.status(400).json({ success: false, message: error.message });
        }
    },

    async updateStatus(req: Request, res: Response) {
        try {
            const id = req.params.id as string;
            const { status } = req.body;
            if (!['active', 'expired', 'suspended', 'revoked'].includes(status)) {
                return res.status(400).json({ success: false, message: 'Invalid status value' });
            }
            const license = await LicenseService.updateStatus(id, status);
            res.status(200).json({ success: true, data: license, message: `License status updated to ${status}` });
        } catch (error: any) {
            res.status(400).json({ success: false, message: error.message });
        }
    },

    async delete(req: Request, res: Response) {
        try {
            const id = req.params.id as string;
            await LicenseService.deleteLicense(id);
            res.status(200).json({ success: true, message: 'License deleted successfully' });
        } catch (error: any) {
            res.status(400).json({ success: false, message: error.message });
        }
    }
};