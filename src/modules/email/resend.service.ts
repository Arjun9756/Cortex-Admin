import env from '../../config/env.config.js';

export interface ResendSegment {
    id: string;
    name: string;
    created_at?: string | undefined;
    contacts_count?: number | undefined;
}

export interface ResendContact {
    id: string;
    email: string;
    first_name?: string | undefined;
    last_name?: string | undefined;
    unsubscribed?: boolean | undefined;
    created_at?: string | undefined;
    segments?: string[] | undefined;
}

export interface ResendBroadcast {
    id: string;
    name?: string | undefined;
    audience_id?: string | undefined;
    segment_id?: string | undefined;
    from?: string | undefined;
    subject?: string | undefined;
    status: 'draft' | 'sent' | 'scheduled' | string;
    created_at: string;
    scheduled_at?: string | null | undefined;
    sent_at?: string | null | undefined;
    preview_text?: string | undefined;
    html?: string | undefined;
    text?: string | undefined;
}

export interface ResendSentEmailSummary {
    id: string;
    object: string;
    to: string[];
    from: string;
    created_at: string;
    subject: string;
    last_event: 'sent' | 'delivered' | 'delivery_delayed' | 'complained' | 'bounced' | 'opened' | 'clicked' | string;
    cc?: string[] | null | undefined;
    bcc?: string[] | null | undefined;
    reply_to?: string[] | null | undefined;
}

export interface ResendSentEmailDetail extends ResendSentEmailSummary {
    html?: string | null | undefined;
    text?: string | null | undefined;
    message_id?: string | undefined;
}

export interface ResendAttachment {
    filename: string;
    content: string; // Base64 encoded string
    content_type?: string | undefined;
}

export class ResendService {
    private static BASE_URL = 'https://api.resend.com';

    private static getApiKey(): string {
        return (env.RESEND_API_KEY || '').trim();
    }

    private static getHeaders(): Record<string, string> {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('RESEND_API_KEY is not configured in .env. Please configure RESEND_API_KEY to enable email operations.');
        }
        return {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Cortex-Admin-ControlPlane/2.0'
        };
    }

    private static async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<{ ok: boolean; status: number; data?: T; error?: any }> {
        const url = `${this.BASE_URL}${endpoint}`;
        try {
            const headers = {
                ...this.getHeaders(),
                ...(options.headers as Record<string, string> || {})
            };

            const response = await fetch(url, {
                ...options,
                headers
            });

            const text = await response.text();
            let parsedData: any = null;
            try {
                parsedData = text ? JSON.parse(text) : null;
            } catch {
                parsedData = text;
            }

            if (!response.ok) {
                const message = (parsedData && typeof parsedData === 'object' && (parsedData.message || parsedData.error || parsedData.name))
                    ? (parsedData.message || parsedData.error)
                    : `Resend API returned status ${response.status}`;
                return {
                    ok: false,
                    status: response.status,
                    error: { message, raw: parsedData }
                };
            }

            return {
                ok: true,
                status: response.status,
                data: parsedData as T
            };
        } catch (err: any) {
            return {
                ok: false,
                status: 0,
                error: { message: err.message || 'Network error communicating with Resend' }
            };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STATUS & CONNECTIVITY
    // ─────────────────────────────────────────────────────────────────────────
    static async checkStatus(): Promise<{ configured: boolean; valid: boolean; error?: string; broadcastFrom: string; supportFrom: string }> {
        const apiKey = this.getApiKey();
        const broadcastFrom = env.RESEND_BROADCAST_FROM || 'Cortex <no-reply@cortexco.in>';
        const supportFrom = env.RESEND_SUPPORT_FROM || 'Cortex Support <support@cortexco.in>';

        if (!apiKey) {
            return {
                configured: false,
                valid: false,
                error: 'RESEND_API_KEY is missing from environment (.env)',
                broadcastFrom,
                supportFrom
            };
        }

        // Test connectivity by querying the API
        const testRes = await this.request<{ data: any[] }>('/emails?limit=1', { method: 'GET' });
        if (testRes.ok) {
            return {
                configured: true,
                valid: true,
                broadcastFrom,
                supportFrom
            };
        }

        // Try /segments if /emails had a permission scope limit
        const testSeg = await this.request<{ data: any[] }>('/segments', { method: 'GET' });
        if (testSeg.ok) {
            return {
                configured: true,
                valid: true,
                broadcastFrom,
                supportFrom
            };
        }

        return {
            configured: true,
            valid: false,
            error: testRes.error?.message || 'Invalid Resend API Key or restricted permissions',
            broadcastFrom,
            supportFrom
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SEGMENTS & AUDIENCES (CRUD)
    // ─────────────────────────────────────────────────────────────────────────
    static async listSegments(): Promise<ResendSegment[]> {
        // Try canonical Resend /audiences endpoint first
        let res = await this.request<{ data: ResendSegment[] }>('/audiences', { method: 'GET' });
        if (res.ok && res.data) {
            const list = Array.isArray(res.data) ? res.data : (res.data.data || []);
            if (list.length > 0) {
                return list;
            }
        }

        // Try /segments if /audiences was empty or failed
        const segRes = await this.request<{ data: ResendSegment[] }>('/segments', { method: 'GET' });
        if (segRes.ok && segRes.data) {
            const segList = Array.isArray(segRes.data) ? segRes.data : (segRes.data.data || []);
            if (segList.length > 0) {
                return segList;
            }
        }

        if (res.ok && res.data) {
            return Array.isArray(res.data) ? res.data : (res.data.data || []);
        }
        if (segRes.ok && segRes.data) {
            return Array.isArray(segRes.data) ? segRes.data : (segRes.data.data || []);
        }

        if (res.error) {
            throw new Error(res.error.message || 'Failed to list audiences/segments');
        }
        return [];
    }

    static async createSegment(name: string): Promise<ResendSegment> {
        if (!name || !name.trim()) {
            throw new Error('Audience name is required');
        }

        // Try /audiences first (Resend canonical)
        let res = await this.request<ResendSegment>('/audiences', {
            method: 'POST',
            body: JSON.stringify({ name: name.trim() })
        });

        if (res.ok && res.data) {
            return res.data;
        }

        // Fallback to /segments
        res = await this.request<ResendSegment>('/segments', {
            method: 'POST',
            body: JSON.stringify({ name: name.trim() })
        });

        if (res.ok && res.data) {
            return res.data;
        }

        throw new Error(res.error?.message || 'Failed to create audience/segment');
    }

    static async deleteSegment(segmentId: string): Promise<boolean> {
        let res = await this.request(`/audiences/${segmentId}`, { method: 'DELETE' });
        if (res.ok) return true;

        res = await this.request(`/segments/${segmentId}`, { method: 'DELETE' });
        if (res.ok) return true;

        throw new Error(res.error?.message || 'Failed to delete audience/segment');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONTACTS (CRUD & CSV IMPORT)
    // ─────────────────────────────────────────────────────────────────────────
    static async listContacts(segmentId?: string): Promise<ResendContact[]> {
        if (segmentId) {
            // First try canonical /audiences/{id}/contacts
            let res = await this.request<{ data: ResendContact[] }>(`/audiences/${segmentId}/contacts`, { method: 'GET' });
            if (res.ok && res.data) {
                return Array.isArray(res.data) ? res.data : (res.data.data || []);
            }

            // Fallback to /segments/{id}/contacts
            res = await this.request<{ data: ResendContact[] }>(`/segments/${segmentId}/contacts`, { method: 'GET' });
            if (res.ok && res.data) {
                return Array.isArray(res.data) ? res.data : (res.data.data || []);
            }

            // Fallback to /contacts?segment_id={id}
            res = await this.request<{ data: ResendContact[] }>(`/contacts?segment_id=${segmentId}`, { method: 'GET' });
            if (res.ok && res.data) {
                return Array.isArray(res.data) ? res.data : (res.data.data || []);
            }
        }

        // Global contacts list
        const res = await this.request<{ data: ResendContact[] }>('/contacts', { method: 'GET' });
        if (res.ok && res.data) {
            return Array.isArray(res.data) ? res.data : (res.data.data || []);
        }

        if (res.error) {
            throw new Error(res.error.message || 'Failed to list contacts');
        }
        return [];
    }

    static async createContact(contact: {
        email: string;
        firstName?: string | undefined;
        lastName?: string | undefined;
        unsubscribed?: boolean | undefined;
        segments?: string[] | undefined;
        audienceId?: string | undefined;
    }): Promise<{ success: boolean; id?: string; alreadyExists?: boolean; error?: string }> {
        const email = (contact.email || '').trim().toLowerCase();
        if (!email || !email.includes('@')) {
            return { success: false, error: 'Valid email address is required' };
        }

        const payload: Record<string, any> = {
            email,
            unsubscribed: !!contact.unsubscribed
        };

        if (contact.firstName) {
            payload.first_name = contact.firstName.trim();
        }
        if (contact.lastName) {
            payload.last_name = contact.lastName.trim();
        }
        if (contact.segments && contact.segments.length > 0) {
            payload.segments = contact.segments;
        }
        const targetAudienceId = contact.audienceId || (contact.segments && contact.segments.length > 0 ? contact.segments[0] : undefined);
        if (targetAudienceId) {
            payload.audience_id = targetAudienceId;

            // Try canonical /audiences/{audience_id}/contacts first
            const audContactRes = await this.request<{ id: string }>(`/audiences/${targetAudienceId}/contacts`, {
                method: 'POST',
                body: JSON.stringify({
                    email,
                    first_name: contact.firstName ? contact.firstName.trim() : undefined,
                    last_name: contact.lastName ? contact.lastName.trim() : undefined,
                    unsubscribed: !!contact.unsubscribed
                })
            });

            if (audContactRes.ok && audContactRes.data) {
                return { success: true, id: audContactRes.data.id };
            }
            if (audContactRes.status === 422 || (audContactRes.error?.message && audContactRes.error.message.toLowerCase().includes('already exists'))) {
                return { success: true, alreadyExists: true };
            }
        }

        const res = await this.request<{ id: string }>('/contacts', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (res.ok && res.data) {
            return { success: true, id: res.data.id };
        }

        // Check if already exists (422)
        if (res.status === 422 || (res.error?.message && res.error.message.toLowerCase().includes('already exists'))) {
            // If segments were provided, try updating the existing contact
            if (contact.segments && contact.segments.length > 0) {
                try {
                    await this.request(`/contacts/${encodeURIComponent(email)}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ segments: contact.segments })
                    });
                } catch {
                    // Ignore patch failure
                }
            }
            return { success: true, alreadyExists: true };
        }

        return {
            success: false,
            error: res.error?.message || 'Failed to add contact to Resend'
        };
    }

    static async deleteContact(contactIdOrEmail: string, audienceId?: string): Promise<boolean> {
        if (audienceId) {
            const audRes = await this.request(`/audiences/${audienceId}/contacts/${encodeURIComponent(contactIdOrEmail)}`, {
                method: 'DELETE'
            });
            if (audRes.ok) return true;
        }

        const res = await this.request(`/contacts/${encodeURIComponent(contactIdOrEmail)}`, {
            method: 'DELETE'
        });

        if (res.ok) return true;
        throw new Error(res.error?.message || 'Failed to delete contact');
    }

    /**
     * Batch import contacts directly into Resend with graceful duplicate handling
     */
    static async batchImportContacts(
        contacts: Array<{ email: string; firstName?: string | undefined; lastName?: string | undefined; unsubscribed?: boolean | undefined }>,
        segmentId?: string | undefined
    ): Promise<{
        total: number;
        created: number;
        already_existed: number;
        failed: number;
        errors: Array<{ email: string; reason: string }>;
    }> {
        const results = {
            total: contacts.length,
            created: 0,
            already_existed: 0,
            failed: 0,
            errors: [] as Array<{ email: string; reason: string }>
        };

        const segments = segmentId ? [segmentId] : undefined;

        // Process in chunks of 5 to avoid burst rate-limits
        const chunkSize = 5;
        for (let i = 0; i < contacts.length; i += chunkSize) {
            const chunk = contacts.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async (item) => {
                const res = await this.createContact({
                    email: item.email,
                    firstName: item.firstName,
                    lastName: item.lastName,
                    unsubscribed: item.unsubscribed,
                    segments
                });

                if (res.success) {
                    if (res.alreadyExists) {
                        results.already_existed++;
                    } else {
                        results.created++;
                    }
                } else {
                    results.failed++;
                    results.errors.push({
                        email: item.email,
                        reason: res.error || 'Unknown error'
                    });
                }
            }));

            // Micro-delay between batches
            if (i + chunkSize < contacts.length) {
                await new Promise(r => setTimeout(r, 120));
            }
        }

        return results;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BROADCASTS ENGINE
    // ─────────────────────────────────────────────────────────────────────────
    static async listBroadcasts(): Promise<ResendBroadcast[]> {
        const res = await this.request<{ data: ResendBroadcast[] }>('/broadcasts', { method: 'GET' });
        if (res.ok && res.data) {
            return Array.isArray(res.data) ? res.data : (res.data.data || []);
        }
        if (res.error) {
            throw new Error(res.error.message || 'Failed to list broadcasts');
        }
        return [];
    }

    static async getBroadcast(broadcastId: string): Promise<ResendBroadcast> {
        const res = await this.request<ResendBroadcast>(`/broadcasts/${broadcastId}`, { method: 'GET' });
        if (res.ok && res.data) {
            return res.data;
        }
        throw new Error(res.error?.message || 'Failed to retrieve broadcast');
    }

    static async createBroadcast(payload: {
        name?: string | undefined;
        segmentId: string;
        from?: string | undefined;
        subject: string;
        html?: string | undefined;
        text?: string | undefined;
        previewText?: string | undefined;
        send?: boolean | undefined;
    }): Promise<{ id: string }> {
        const fromAddress = payload.from || env.RESEND_BROADCAST_FROM || 'Cortex <no-reply@cortexco.in>';

        const body: Record<string, any> = {
            audience_id: payload.segmentId,
            name: payload.name || payload.subject,
            from: fromAddress,
            subject: payload.subject,
            send: !!payload.send
        };

        if (payload.previewText) body.preview_text = payload.previewText;
        if (payload.html) body.html = payload.html;
        if (payload.text) body.text = payload.text;

        const res = await this.request<{ id: string }>('/broadcasts', {
            method: 'POST',
            body: JSON.stringify(body)
        });

        if (res.ok && res.data) {
            return res.data;
        }
        throw new Error(res.error?.message || 'Failed to create broadcast');
    }

    static async sendBroadcast(broadcastId: string): Promise<{ id: string }> {
        const res = await this.request<{ id: string }>(`/broadcasts/${broadcastId}/send`, {
            method: 'POST'
        });

        if (res.ok && res.data) {
            return res.data;
        }
        throw new Error(res.error?.message || 'Failed to trigger broadcast delivery');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SUPPORT 1-TO-1 EMAILS & REAL-TIME TRACKING
    // ─────────────────────────────────────────────────────────────────────────
    static async sendEmail(payload: {
        from?: string | undefined;
        to: string | string[];
        subject: string;
        html?: string | undefined;
        text?: string | undefined;
        cc?: string | string[] | undefined;
        bcc?: string | string[] | undefined;
        replyTo?: string | undefined;
        attachments?: ResendAttachment[] | undefined;
    }): Promise<{ id: string }> {
        const fromAddress = payload.from || env.RESEND_SUPPORT_FROM || 'Cortex Support <support@cortexco.in>';
        const toRecipients = Array.isArray(payload.to) ? payload.to : [payload.to];

        const body: Record<string, any> = {
            from: fromAddress,
            to: toRecipients,
            subject: payload.subject
        };

        if (payload.html) body.html = payload.html;
        if (payload.text) body.text = payload.text;

        if (payload.cc) {
            body.cc = Array.isArray(payload.cc) ? payload.cc : [payload.cc];
        }
        if (payload.bcc) {
            body.bcc = Array.isArray(payload.bcc) ? payload.bcc : [payload.bcc];
        }
        if (payload.replyTo) {
            body.reply_to = payload.replyTo;
        }
        if (payload.attachments && payload.attachments.length > 0) {
            body.attachments = payload.attachments;
        }

        const res = await this.request<{ id: string }>('/emails', {
            method: 'POST',
            body: JSON.stringify(body)
        });

        if (res.ok && res.data) {
            return res.data;
        }

        throw new Error(res.error?.message || 'Failed to send transactional support email');
    }

    static async listSentEmails(limit = 30): Promise<ResendSentEmailSummary[]> {
        const res = await this.request<{ data: ResendSentEmailSummary[] }>(`/emails?limit=${limit}`, {
            method: 'GET'
        });

        if (res.ok && res.data) {
            return Array.isArray(res.data) ? res.data : (res.data.data || []);
        }
        if (res.error) {
            throw new Error(res.error.message || 'Failed to fetch sent emails from Resend');
        }
        return [];
    }

    static async getSentEmail(emailId: string): Promise<ResendSentEmailDetail> {
        const res = await this.request<ResendSentEmailDetail>(`/emails/${emailId}`, {
            method: 'GET'
        });

        if (res.ok && res.data) {
            return res.data;
        }
        throw new Error(res.error?.message || 'Failed to retrieve email details from Resend');
    }
}
