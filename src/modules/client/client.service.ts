import { ClientModel } from './client.model.js';
import { LicenseModel } from '../license/license.model.js';
import pool from '../../config/db.config.js';
import { RowDataPacket } from 'mysql2';

export const ClientService = {
    async createClient(data: { org_name: string; contact_name: string; email: string; phone?: string; status?: 'active' | 'inactive' | 'suspended' }) {
        if (!data.org_name || !data.contact_name || !data.email) {
            throw new Error('Organization name, contact name, and email are required');
        }

        const existing = await ClientModel.findByEmail(data.email);
        if (existing) {
            throw new Error(`Client with email ${data.email} already exists`);
        }

        return await ClientModel.createClient(data);
    },

    async getAllClients() {
        return await ClientModel.findAll();
    },

    async getClientById(id: string) {
        const client = await ClientModel.findById(id);
        if (!client) {
            throw new Error(`Client with ID ${id} not found`);
        }
        const licenses = await LicenseModel.findByClientId(id);
        let connectors: any[] = [];
        try {
            const [rows] = await pool.query<RowDataPacket[]>(
                `SELECT id, license_key, provider, status, account_name, account_email, account_id, webhook_url, connected_at, updated_at
                 FROM client_connectors WHERE client_id = ? ORDER BY updated_at DESC`,
                [id]
            );
            connectors = rows;
        } catch {
            connectors = [];
        }
        return { ...client, licenses, connectors };
    },

    async updateClient(id: string, data: Partial<ClientModel>) {
        const client = await ClientModel.findById(id);
        if (!client) {
            throw new Error(`Client with ID ${id} not found`);
        }

        if (data.email && data.email !== client.email) {
            const existing = await ClientModel.findByEmail(data.email);
            if (existing && existing.id !== id) {
                throw new Error(`Email ${data.email} is already in use by another client`);
            }
        }

        return await ClientModel.update(id, data);
    },

    async updateStatus(id: string, status: 'active' | 'inactive' | 'suspended') {
        const client = await ClientModel.findById(id);
        if (!client) {
            throw new Error(`Client with ID ${id} not found`);
        }
        return await ClientModel.updateStatus(id, status);
    },

    async deleteClient(id: string) {
        const client = await ClientModel.findById(id);
        if (!client) {
            throw new Error(`Client with ID ${id} not found`);
        }
        return await ClientModel.delete(id);
    }
};
