import { Request, Response } from 'express';
import { AdminService } from './admin.service.js';

export const AdminController = {
    async login(req: Request, res: Response) {
        try {
            const { email, password } = req.body;
            const result = await AdminService.login(email, password);
            res.status(200).json({ success: true, ...result, message: 'Login successful' });
        } catch (error: any) {
            res.status(401).json({ success: false, message: error.message });
        }
    },

    async getMe(req: Request, res: Response) {
        try {
            if (!req.admin) {
                return res.status(401).json({ success: false, message: 'Not authenticated' });
            }
            res.status(200).json({
                success: true,
                admin: req.admin
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    async getAll(req: Request, res: Response) {
        try {
            const admins = await AdminService.getAll();
            res.status(200).json({ success: true, data: admins });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    async getById(req: Request, res: Response) {
        try {
            const id = req.params.id as string;
            const admin = await AdminService.getById(id);
            res.status(200).json({ success: true, data: admin });
        } catch (error: any) {
            res.status(404).json({ success: false, message: error.message });
        }
    },

    async create(req: Request, res: Response) {
        try {
            const admin = await AdminService.createAdmin(req.body);
            res.status(201).json({ success: true, data: admin, message: 'Admin user created successfully' });
        } catch (error: any) {
            res.status(400).json({ success: false, message: error.message });
        }
    },

    async update(req: Request, res: Response) {
        try {
            const id = req.params.id as string;
            const admin = await AdminService.updateAdmin(id, req.body);
            res.status(200).json({ success: true, data: admin, message: 'Admin updated successfully' });
        } catch (error: any) {
            res.status(400).json({ success: false, message: error.message });
        }
    },

    async delete(req: Request, res: Response) {
        try {
            const id = req.params.id as string;
            await AdminService.deleteAdmin(id);
            res.status(200).json({ success: true, message: 'Admin deleted successfully' });
        } catch (error: any) {
            res.status(400).json({ success: false, message: error.message });
        }
    }
};
