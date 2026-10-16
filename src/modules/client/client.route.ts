import { Router } from 'express';
import { ClientController } from './client.controller.js';
import { requireAdmin } from '../../middleware/auth.middleware.js';

const router = Router();

// Read operations (Admin ONLY)
router.get('/', requireAdmin, ClientController.getAll);
router.get('/:id', requireAdmin, ClientController.getById);

// Write/Mutate operations (Super Admin & Admin ONLY)
router.post('/', requireAdmin, ClientController.create);
router.put('/:id', requireAdmin, ClientController.update);
router.patch('/:id/status', requireAdmin, ClientController.updateStatus);
router.delete('/:id', requireAdmin, ClientController.delete);

export default router;
