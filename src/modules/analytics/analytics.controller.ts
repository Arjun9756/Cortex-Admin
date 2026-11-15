import { Request, Response } from 'express';
import { AnalyticsService } from './analytics.service.js';

export const AnalyticsController = {
    async getOverview(req: Request, res: Response) {
        try {
            const range = (req.query.range as '24h' | '7d' | '30d') || '24h';
            const data = await AnalyticsService.getDetailedAnalytics(range);
            res.status(200).json({ success: true, data });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    async getDetailed(req: Request, res: Response) {
        try {
            const range = (req.query.range as '24h' | '7d' | '30d') || '24h';
            const data = await AnalyticsService.getDetailedAnalytics(range);
            res.status(200).json({ success: true, data });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    async getLogs(req: Request, res: Response) {
        try {
            const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
            const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
            const actionType = (req.query.action_type as string) || undefined;
            const status = (req.query.status as string) || undefined;
            const search = (req.query.search as string) || undefined;

            const result = await AnalyticsService.getPaginatedLogs({
                page,
                limit,
                action_type: actionType,
                status,
                search
            });

            res.status(200).json({
                success: true,
                data: result.data,
                pagination: result.pagination
            });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    async getTimeline(req: Request, res: Response) {
        try {
            const timeline = await AnalyticsService.getPingTimeline();
            res.status(200).json({ success: true, data: timeline });
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    async exportTelemetry(req: Request, res: Response) {
        try {
            const limit = req.query.limit ? parseInt(req.query.limit as string) : 2000;
            const csvData = await AnalyticsService.exportTelemetryCsv(limit);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=cortex-telemetry-${Date.now()}.csv`);
            res.status(200).send(csvData);
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    },

    async exportLicenses(req: Request, res: Response) {
        try {
            const csvData = await AnalyticsService.exportLicensesCsv();
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=cortex-licenses-${Date.now()}.csv`);
            res.status(200).send(csvData);
        } catch (error: any) {
            res.status(500).json({ success: false, message: error.message });
        }
    }
};
