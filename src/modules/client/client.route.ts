import { Router } from 'express';
import { ClientController } from './client.controller.js';
import { requireAdmin } from '../../middleware/auth.middleware.js';

const router = Router();

// Read operations (Viewer allowed)
router.get('/', ClientController.getAll);
router.get('/:id', ClientController.getById);

// Write/Mutate operations (Super Admin & Admin ONLY)
router.post('/', requireAdmin, ClientController.create);
router.put('/:id', requireAdmin, ClientController.update);
router.patch('/:id/status', requireAdmin, ClientController.updateStatus);
router.delete('/:id', requireAdmin, ClientController.delete);

export default router;
