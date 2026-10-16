import { Router } from 'express';
import { LicenseController } from './license.controller.js';
import { requireAdmin } from '../../middleware/auth.middleware.js';

const router = Router();

// ─── Public: Heartbeat & Validation (Cortex Client App) ───────────────────────
// No auth required — clients ping from their own machines
router.post('/ping', LicenseController.ping);
router.post('/verify', LicenseController.ping);

// ─── Protected Read Endpoints (Admin Authentication Required) ────────────────
router.get('/', requireAdmin, LicenseController.getAll);
router.get('/:id', requireAdmin, LicenseController.getById);
router.get('/client/:clientId', requireAdmin, LicenseController.getByClient);

// ─── Protected HWID Read (Admin Authentication Required) ───────────────────────
router.get('/hwids/all', requireAdmin, LicenseController.getAllHwidsGlobal);
router.get('/:id/hwids', requireAdmin, LicenseController.getHwids);

// ─── Mutating Endpoints (Admin ONLY) ─────────────────────────────────────────
router.post('/', requireAdmin, LicenseController.create);
router.patch('/:id/revoke', requireAdmin, LicenseController.revoke);
router.patch('/:id/status', requireAdmin, LicenseController.updateStatus);
router.put('/:id', requireAdmin, LicenseController.update);
router.patch('/:id', requireAdmin, LicenseController.update);

router.patch('/:id/max-machines', requireAdmin, LicenseController.updateMaxMachines);
router.delete('/:id', requireAdmin, LicenseController.delete);

// ─── HWID Management (Admin ONLY) ────────────────────────────────────────────
router.post('/:id/hwids', requireAdmin, LicenseController.addHwid);
router.delete('/:id/hwids/:hwid', requireAdmin, LicenseController.removeHwid);
router.patch('/:id/hwids/:hwid/block', requireAdmin, LicenseController.blockHwid);
router.delete('/:id/hwids', requireAdmin, LicenseController.resetHwids);

export default router;
