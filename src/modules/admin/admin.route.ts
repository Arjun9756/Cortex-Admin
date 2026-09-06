import { Router } from 'express';
import { AdminController } from './admin.controller.js';
import { requireAdmin, requireSuperAdmin } from '../../middleware/auth.middleware.js';

const router = Router();

// Public authentication endpoint
router.post('/login', AdminController.login);

// Session verification
router.get('/me', requireAdmin, AdminController.getMe);

// Admin roster & management
router.get('/', requireAdmin, AdminController.getAll);
router.post('/', requireSuperAdmin, AdminController.create);
router.get('/:id', requireAdmin, AdminController.getById);
router.put('/:id', requireSuperAdmin, AdminController.update);
router.delete('/:id', requireSuperAdmin, AdminController.delete);

export default router;
