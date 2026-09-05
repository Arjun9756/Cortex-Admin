import { Router } from 'express';
import { LicenseController } from './license.controller.js';

const router = Router();

// Heartbeat & Validation endpoints for Cortex Client App
router.post('/ping', LicenseController.ping);
router.post('/verify', LicenseController.ping);

// Admin Management endpoints
router.get('/', LicenseController.getAll);
router.post('/', LicenseController.create);
router.get('/:id', LicenseController.getById);
router.get('/client/:clientId', LicenseController.getByClient);
router.patch('/:id/revoke', LicenseController.revoke);
router.patch('/:id/status', LicenseController.updateStatus);
router.delete('/:id', LicenseController.delete);

export default router;
