import { Request, Response } from 'express';
import { ResendService } from './resend.service.js';

function extractParamString(param: unknown): string {
    if (typeof param === 'string') return param.trim();
    if (Array.isArray(param) && typeof param[0] === 'string') return param[0].trim();
    return '';
}

export class EmailController {
    // ─────────────────────────────────────────────────────────────────────────
    // STATUS & DIAGNOSTICS
    // ─────────────────────────────────────────────────────────────────────────
    static async getStatus(req: Request, res: Response) {
        try {
            const status = await ResendService.checkStatus();
            res.json({
                success: true,
                data: status
            });
        } catch (err: any) {
            res.status(500).json({
                success: false,
                message: err.message || 'Failed to check Resend status'
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AUDIENCES / SEGMENTS
    // ─────────────────────────────────────────────────────────────────────────
    static async getSegments(req: Request, res: Response) {
        try {
            const segments = await ResendService.listSegments();
            res.json({
                success: true,
                data: segments
            });
        } catch (err: any) {
            res.status(500).json({
                success: false,
                message: err.message || 'Failed to retrieve audiences'
            });
        }
    }

    static async createSegment(req: Request, res: Response) {
        try {
            const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
            if (!name) {
                return res.status(400).json({
                    success: false,
                    message: 'Audience / Segment name is required'
                });
            }

            const segment = await ResendService.createSegment(name);
            res.status(201).json({
                success: true,
                message: 'Audience created successfully in Resend',
                data: segment
            });
        } catch (err: any) {
            res.status(500).json({
                success: false,
                message: err.message || 'Failed to create audience'
            });
        }
    }

    static async deleteSegment(req: Request, res: Response) {
        try {
            const id = extractParamString(req.params.id);
            if (!id) {
                return res.status(400).json({ success: false, message: 'Audience ID is required' });
            }

            await ResendService.deleteSegment(id);
            res.json({
                success: true,
                message: 'Audience deleted successfully'
            });
        } catch (err: any) {
            res.status(500).json({
                success: false,
                message: err.message || 'Failed to delete audience'
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONTACTS
    // ─────────────────────────────────────────────────────────────────────────
    static async getContacts(req: Request, res: Response) {
        try {
            const segmentId = typeof req.query.segmentId === 'string' ? req.query.segmentId.trim() : undefined;
            const contacts = await ResendService.listContacts(segmentId);
            res.json({
                success: true,
                data: contacts
            });
        } catch (err: any) {
            res.status(500).json({
                success: false,
                message: err.message || 'Failed to retrieve contacts'
            });
        }
    }

    static async createContact(req: Request, res: Response) {
        try {
            const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
            const firstName = typeof req.body.firstName === 'string' && req.body.firstName.trim() ? req.body.firstName.trim() : undefined;
            const lastName = typeof req.body.lastName === 'string' && req.body.lastName.trim() ? req.body.lastName.trim() : undefined;
            const unsubscribed = !!req.body.unsubscribed;
            const segmentId = typeof req.body.segmentId === 'string' && req.body.segmentId.trim() 
                ? req.body.segmentId.trim() 
                : (typeof req.body.audienceId === 'string' && req.body.audienceId.trim() ? req.body.audienceId.trim() : undefined);
            const segments = segmentId ? [segmentId] : undefined;

            if (!email || !email.includes('@')) {
                return res.status(400).json({
                    success: false,
                    message: 'Valid email address is required'
                });
            }

            const result = await ResendService.createContact({
                email,
                firstName,
                lastName,
                unsubscribed,
                segments,
                audienceId: segmentId
            });

            if (!result.success) {
                return res.status(400).json({
                    success: false,
                    message: result.error || 'Failed to create contact'
                });
            }

            res.status(201).json({
                success: true,
                message: result.alreadyExists ? 'Contact already existed (updated)' : 'Contact added successfully',
                data: result
            });
        } catch (err: any) {
            res.status(500).json({
                success: false,
                message: err.message || 'Failed to create contact'
            });
        }
    }

    static async deleteContact(req: Request, res: Response) {
        try {
            const id = extractParamString(req.params.id);
            const audienceId = typeof req.query.audienceId === 'string' && req.query.audienceId.trim()
                ? req.query.audienceId.trim()
                : (typeof req.query.segmentId === 'string' && req.query.segmentId.trim() ? req.query.segmentId.trim() : undefined);

            if (!id) {
                return res.status(400).json({ success: false, message: 'Contact ID or email is required' });
            }

            await ResendService.deleteContact(id, audienceId);
            res.json({
                success: true,
                message: 'Contact removed successfully from Resend'
            });
        } catch (err: any) {
            res.status(500).json({
                success: false,
                message: err.message || 'Failed to delete contact'
            });
        }
    }

    static async importCsvContacts(req: Request, res: Response) {
        try {
            const { contacts, segmentId: rawSegId } = req.body;
            const segmentId = typeof rawSegId === 'string' && rawSegId.trim() ? rawSegId.trim() : undefined;

            if (!Array.isArray(contacts) || contacts.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Contacts array is required and must not be empty'
                });
            }

            // Sanitize and validate rows
            const cleanContacts: Array<{ email: string; firstName?: string | undefined; lastName?: string | undefined; unsubscribed?: boolean | undefined }> = [];
            for (const c of contacts) {
                const email = (c.email || c.Email || '').trim().toLowerCase();
                if (email && email.includes('@')) {
                    const fn = (c.firstName || c.first_name || c.FirstName || c.name || c.Name || '').trim();
                    const ln = (c.lastName || c.last_name || c.LastName || '').trim();
                    cleanContacts.push({
                        email,
                        firstName: fn || undefined,
                        lastName: ln || undefined,
                        unsubscribed: !!(c.unsubscribed || c.Unsubscribed)
                    });
                }
            }

            if (cleanContacts.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'No valid email addresses found in the provided CSV dataset'
                });
            }

            const importStats = await ResendService.batchImportContacts(cleanContacts, segmentId);
            res.json({
                success: true,
                message: `CSV import completed: ${importStats.created} created, ${importStats.already_existed} existing, ${importStats.failed} failed.`,
                data: importStats
            });
        } catch (err: any) {
            res.status(500).json({
                success: false,
                message: err.message || 'Failed to batch import CSV contacts'
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BROADCASTS
    // ─────────────────────────────────────────────────────────────────────────
    static async getBroadcasts(req: Request, res: Response) {
        try {
            const broadcasts = await ResendService.listBroadcasts();
            res.json({
                success: true,
                data: broadcasts
            });
        } catch (err: any) {
            res.status(500).json({
                success: false,
                message: err.message || 'Failed to retrieve broadcasts'
            });
        }
    }

    static async getBroadcastById(req: Request, res: Response) {
        try {
            const id = extractParamString(req.params.id);
            if (!id) {
                return res.status(400).json({ success: false, message: 'Broadcast ID is required' });
            }

            const broadcast = await ResendService.getBroadcast(id);
            res.json({
                success: true,
                data: broadcast
            });
        } catch (err: any) {
            res.status(500).json({
                success: false,
                message: err.message || 'Failed to retrieve broadcast details'
            });
        }
    }

    static async createBroadcast(req: Request, res: Response) {
        try {
            const { name, segmentId, subject, html, text, previewText, send } = req.body;

            const cleanSegmentId = typeof segmentId === 'string' ? segmentId.trim() : '';
            const cleanSubject = typeof subject === 'string' ? subject.trim() : '';
            const cleanName = typeof name === 'string' && name.trim() ? name.trim() : undefined;
            const cleanHtml = typeof html === 'string' && html.trim() ? html.trim() : undefined;
            const cleanText = typeof text === 'string' && text.trim() ? text.trim() : undefined;
            const cleanPreviewText = typeof previewText === 'string' && previewText.trim() ? previewText.trim() : undefined;

            if (!cleanSegmentId) {
                return res.status(400).json({ success: false, message: 'Audience / Segment selection is required' });
            }
            if (!cleanSubject) {
                return res.status(400).json({ success: false, message: 'Broadcast Subject line is required' });
            }
            if (!cleanHtml && !cleanText) {
                return res.status(400).json({ success: false, message: 'Broadcast body (HTML or plain text) is required' });
            }

            const result = await ResendService.createBroadcast({
                name: cleanName || cleanSubject,
                segmentId: cleanSegmentId,
                subject: cleanSubject,
                html: cleanHtml,
                text: cleanText,
                previewText: cleanPreviewText,
                send: !!send
            });

            res.status(201).json({
                success: true,
                message: send ? 'Broadcast queued and sent via Resend' : 'Broadcast draft created successfully',
                data: result
            });
        } catch (err: any) {
            res.status(500).json({
                success: false,
                message: err.message || 'Failed to create broadcast'
            });
        }
    }

    static async sendBroadcast(req: Request, res: Response) {
        try {
            const id = extractParamString(req.params.id);
            if (!id) {
                return res.status(400).json({ success: false, message: 'Broadcast ID is required' });
            }

            const result = await ResendService.sendBroadcast(id);
            res.json({
                success: true,
                message: 'Broadcast triggered successfully',
                data: result
            });
        } catch (err: any) {
            res.status(500).json({
                success: false,
                message: err.message || 'Failed to send broadcast'
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SUPPORT 1-TO-1 MAIL & LIVE STATUS TRACKING
    // ─────────────────────────────────────────────────────────────────────────
    static async sendSupportEmail(req: Request, res: Response) {
        try {
            const { to, subject, html, text, cc, bcc, replyTo, attachments } = req.body;

            if (!to || (typeof to === 'string' && !to.includes('@')) || (Array.isArray(to) && to.length === 0)) {
                return res.status(400).json({ success: false, message: 'Recipient "to" address is required' });
            }
            const cleanSubject = typeof subject === 'string' ? subject.trim() : '';
            if (!cleanSubject) {
                return res.status(400).json({ success: false, message: 'Subject line is required' });
            }

            const cleanHtml = typeof html === 'string' && html.trim() ? html.trim() : undefined;
            const cleanText = typeof text === 'string' && text.trim() ? text.trim() : undefined;

            if (!cleanHtml && !cleanText) {
                return res.status(400).json({ success: false, message: 'Email body (HTML or text) is required' });
            }

            const cleanCc = cc ? (Array.isArray(cc) ? cc : [String(cc)]) : undefined;
            const cleanBcc = bcc ? (Array.isArray(bcc) ? bcc : [String(bcc)]) : undefined;
            const cleanReplyTo = typeof replyTo === 'string' && replyTo.trim() ? replyTo.trim() : undefined;

            const result = await ResendService.sendEmail({
                to,
                subject: cleanSubject,
                html: cleanHtml,
                text: cleanText,
                cc: cleanCc,
                bcc: cleanBcc,
                replyTo: cleanReplyTo,
                attachments: Array.isArray(attachments) ? attachments : undefined
            });

            res.status(200).json({
                success: true,
                message: 'Support email dispatched successfully via Resend',
                data: result
            });
        } catch (err: any) {
            res.status(500).json({
                success: false,
                message: err.message || 'Failed to send support email'
            });
        }
    }

    static async getSupportSentHistory(req: Request, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string, 10) || 50;
            const emails = await ResendService.listSentEmails(limit);
            res.json({
                success: true,
                data: emails
            });
        } catch (err: any) {
            res.status(500).json({
                success: false,
                message: err.message || 'Failed to load sent emails history'
            });
        }
    }

    static async getSupportEmailStatus(req: Request, res: Response) {
        try {
            const id = extractParamString(req.params.id);
            if (!id) {
                return res.status(400).json({ success: false, message: 'Email ID is required' });
            }

            const emailDetail = await ResendService.getSentEmail(id);
            res.json({
                success: true,
                data: emailDetail
            });
        } catch (err: any) {
            res.status(500).json({
                success: false,
                message: err.message || 'Failed to retrieve email delivery status'
            });
        }
    }
}
