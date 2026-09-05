import { Router } from 'express';
import { AnalyticsController } from './analytics.controller.js';

const router = Router();

router.get('/overview', AnalyticsController.getOverview);
router.get('/detailed', AnalyticsController.getDetailed);
router.get('/logs', AnalyticsController.getLogs);
router.get('/timeline', AnalyticsController.getTimeline);
router.get('/export/telemetry', AnalyticsController.exportTelemetry);
router.get('/export/licenses', AnalyticsController.exportLicenses);

export default router;
