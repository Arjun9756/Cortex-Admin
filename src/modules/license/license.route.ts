import { Router } from 'express';
import { LicenseController } from './license.controller.js';
import { requireAdmin } from '../../middleware/auth.middleware.js';

const router = Router();

// Heartbeat & Validation endpoints for Cortex Client App & Simulator
// 100% PUBLIC: Viewer and Cortex apps can verify licenses with ZERO signup/login
router.post('/ping', LicenseController.ping);
router.post('/verify', LicenseController.ping);

// Read endpoints (Viewer allowed)
router.get('/', LicenseController.getAll);
router.get('/:id', LicenseController.getById);
router.get('/client/:clientId', LicenseController.getByClient);

// Mutating endpoints (Super Admin & Admin ONLY)
router.post('/', requireAdmin, LicenseController.create);
router.patch('/:id/revoke', requireAdmin, LicenseController.revoke);
router.patch('/:id/status', requireAdmin, LicenseController.updateStatus);
router.delete('/:id', requireAdmin, LicenseController.delete);

export default router;
