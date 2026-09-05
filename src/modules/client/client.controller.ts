import { Request, Response } from 'express';
import { ClientService } from './client.service.js';

export const ClientController = {
    async create(req: Request, res: Response) {
        try {
            const client = await ClientService.createClient(req.body);
            res.status(201).json({ success: true, data: client, message: 'Client created successfully' });
        } catch (error: any) {
            res.status(400).json({ success: false, message: error.message });
        }
    },

    async getAll(req: Request, res: Response) {
        try {
            const clients = await ClientService.getAllClients();
            res.status(200).json({ success: true, data: clients });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    async getById(req: Request, res: Response) {
        try {
            const id = req.params.id as string;
            const client = await ClientService.getClientById(id);
            res.status(200).json({ success: true, data: client });
        } catch (error: any) {
            res.status(404).json({ success: false, message: error.message });
        }
    },

    async update(req: Request, res: Response) {
        try {
            const id = req.params.id as string;
            const client = await ClientService.updateClient(id, req.body);
            res.status(200).json({ success: true, data: client, message: 'Client updated successfully' });
        } catch (error: any) {
            res.status(400).json({ success: false, message: error.message });
        }
    },

    async updateStatus(req: Request, res: Response) {
        try {
            const id = req.params.id as string;
            const { status } = req.body;
            if (!['active', 'inactive', 'suspended'].includes(status)) {
                return res.status(400).json({ success: false, message: 'Invalid status value' });
            }
            const client = await ClientService.updateStatus(id, status);
            res.status(200).json({ success: true, data: client, message: `Client status updated to ${status}` });
        } catch (error: any) {
            res.status(400).json({ success: false, message: error.message });
        }
    },

    async delete(req: Request, res: Response) {
        try {
            const id = req.params.id as string;
            await ClientService.deleteClient(id);
            res.status(200).json({ success: true, message: 'Client deleted successfully' });
        } catch (error: any) {
            res.status(400).json({ success: false, message: error.message });
        }
    }
};
