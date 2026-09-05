import { ClientModel } from './client.model.js';
import { LicenseModel } from '../license/license.model.js';

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
        return { ...client, licenses };
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
