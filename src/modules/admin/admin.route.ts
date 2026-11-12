import { Router } from 'express';
import { AdminController } from './admin.controller.js';
import { requireAdmin, requireSuperAdmin } from '../../middleware/auth.middleware.js';
import { adminAuthRateLimiter } from '../../middleware/rateLimit.middleware.js';

const router = Router();

// Public authentication endpoint (In-Memory RAM Rate Limit: 10 requests / minute)
router.post('/login', adminAuthRateLimiter, AdminController.login);

// Session & Security Posture
router.get('/me', requireAdmin, AdminController.getMe);
router.get('/security-status', requireAdmin, AdminController.getSecurityStatus);

// Admin roster & management
router.get('/', requireAdmin, AdminController.getAll);
router.post('/', requireSuperAdmin, AdminController.create);
router.get('/:id', requireAdmin, AdminController.getById);
router.put('/:id', requireSuperAdmin, AdminController.update);
router.delete('/:id', requireSuperAdmin, AdminController.delete);

export default router;
 