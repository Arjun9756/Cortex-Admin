import { AdminModel } from './admin.model.js';
import { hashPassword, verifyPassword, generateToken } from '../../utils/auth.util.js';

export const AdminService = {
    async login(email: string, password: string) {
        if (!email || !password) {
            throw new Error('Email and password are required');
        }

        const admin = await AdminModel.findByEmail(email.toLowerCase().trim());
        if (!admin) {
            throw new Error('Invalid email or password');
        }

        const isValid = verifyPassword(password, admin.password_hash);
        if (!isValid) {
            throw new Error('Invalid email or password');
        }

        const token = generateToken({
            id: admin.id,
            email: admin.email,
            role: admin.role,
            name: admin.name
        });

        return {
            token,
            admin: {
                id: admin.id,
                name: admin.name,
                email: admin.email,
                role: admin.role
            }
        };
    },

    async createAdmin(data: { name: string; email: string; password: string; role?: 'super_admin' | 'admin' | 'viewer' }) {
        if (!data.name || !data.email || !data.password) {
            throw new Error('Name, email, and password are required');
        }

        if (data.password.length < 6) {
            throw new Error('Password must be at least 6 characters long');
        }

        const existing = await AdminModel.findByEmail(data.email.toLowerCase().trim());
        if (existing) {
            throw new Error(`Admin with email ${data.email} already exists`);
        }

        const password_hash = hashPassword(data.password);
        return await AdminModel.create({
            name: data.name.trim(),
            email: data.email.toLowerCase().trim(),
            password_hash,
            role: data.role || 'admin'
        });
    },

    async getAll() {
        return await AdminModel.findAll();
    },

    async getById(id: string) {
        const admin = await AdminModel.findById(id);
        if (!admin) {
            throw new Error('Admin not found');
        }
        return admin;
    },

    async updateAdmin(id: string, data: { name?: string; role?: 'super_admin' | 'admin' | 'viewer'; password?: string }) {
        const existing = await AdminModel.findById(id);
        if (!existing) {
            throw new Error('Admin not found');
        }

        const updatePayload: any = {};
        if (data.name) updatePayload.name = data.name.trim();
        if (data.role) updatePayload.role = data.role;
        if (data.password) {
            if (data.password.length < 6) throw new Error('Password must be at least 6 characters');
            updatePayload.password_hash = hashPassword(data.password);
        }

        return await AdminModel.update(id, updatePayload);
    },

    async deleteAdmin(id: string) {
        const total = await AdminModel.count();
        if (total <= 1) {
            throw new Error('Cannot delete the only remaining administrator');
        }
        return await AdminModel.delete(id);
    }
};
