import { Router } from 'express';
import { EmailController } from './email.controller.js';
import { requireAdmin } from '../../middleware/auth.middleware.js';

const router = Router();

// Resend Status & Connectivity Check
router.get('/status', requireAdmin, EmailController.getStatus);

// Audiences / Segments
router.get('/segments', requireAdmin, EmailController.getSegments);
router.post('/segments', requireAdmin, EmailController.createSegment);
router.delete('/segments/:id', requireAdmin, EmailController.deleteSegment);

// Contacts & CSV Import
router.get('/contacts', requireAdmin, EmailController.getContacts);
router.post('/contacts', requireAdmin, EmailController.createContact);
router.delete('/contacts/:id', requireAdmin, EmailController.deleteContact);
router.post('/contacts/import-csv', requireAdmin, EmailController.importCsvContacts);

// Broadcasts
router.get('/broadcasts', requireAdmin, EmailController.getBroadcasts);
router.get('/broadcasts/:id', requireAdmin, EmailController.getBroadcastById);
router.post('/broadcasts', requireAdmin, EmailController.createBroadcast);
router.post('/broadcasts/:id/send', requireAdmin, EmailController.sendBroadcast);

// 1-to-1 Support Emails & Delivery Status Tracking
router.post('/support/send', requireAdmin, EmailController.sendSupportEmail);
router.get('/support/history', requireAdmin, EmailController.getSupportSentHistory);
router.get('/support/status/:id', requireAdmin, EmailController.getSupportEmailStatus);

export default router;
