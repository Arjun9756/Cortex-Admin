import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import pool from '../../config/db.config.js';
import env from '../../config/env.config.js';
import { RowDataPacket } from 'mysql2';
import { snowflake } from '../../utils/SnowFlakeIdGenerator.js';

export const oauthRouter = Router();

// Store temporary OAuth states (10 min TTL)
interface OAuthStateInfo {
    provider: 'github' | 'slack' | 'jira';
    licenseKey: string;
    clientId: string;
    returnUrl: string;
    createdAt: number;
}
const authStates = new Map<string, OAuthStateInfo>();

// Store short-lived single-use claim tickets (60s TTL)
interface ClaimTicketInfo {
    ticket: string;
    licenseKey: string;
    provider: 'github' | 'slack' | 'jira';
    accessToken: string;
    refreshToken?: string | null;
    expiresAt?: Date | null;
    scopes: string[];
    accountId: string;
    accountName: string;
    accountEmail: string;
    metadata?: {
        cloudId?: string;
        siteName?: string;
        siteUrl?: string;
        [key: string]: any;
    };
    signingSecret?: string | null;
    createdAt: number;
}
const claimTickets = new Map<string, ClaimTicketInfo>();

// Cleanup helpers
function cleanExpired() {
    const now = Date.now();
    for (const [state, info] of authStates.entries()) {
        if (now - info.createdAt > 600000) authStates.delete(state);
    }
    for (const [ticket, info] of claimTickets.entries()) {
        if (now - info.createdAt > 60000) claimTickets.delete(ticket);
    }
}
setInterval(cleanExpired, 30000);

// Production-grade Dynamic Base URL resolution (Host Header & Proxy Aware)
function getBaseUrl(req: Request): string {
    if (env.ADMIN_PUBLIC_URL && env.ADMIN_PUBLIC_URL.trim()) {
        const clean = env.ADMIN_PUBLIC_URL.trim().replace(/\/+$/, '');
        return clean.startsWith('http') ? clean : `https://${clean}`;
    }
    const rawHost = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'admin.cortexco.in';
    const firstHost = rawHost.split(',')[0] || 'admin.cortexco.in';
    const host = firstHost.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    const rawProto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const firstProto = rawProto.split(',')[0] || 'https';
    const proto = firstProto.trim();
    return `${proto}://${host}`;
}

// Helper to validate license key
async function validateLicense(licenseKey: string): Promise<{ valid: boolean; clientId?: string; error?: string }> {
    if (!licenseKey) {
        return { valid: false, error: 'License key is required' };
    }
    const [rows] = await pool.query<RowDataPacket[]>(
        'SELECT id, client_id, status, expiry_date FROM licenses WHERE license_key = ?',
        [licenseKey.trim()]
    );
    if (!rows || rows.length === 0) {
        return { valid: false, error: 'License key not found' };
    }
    const license = rows[0];
    if (!license) {
        return { valid: false, error: 'License record not found' };
    }
    if (license.status !== 'active') {
        return { valid: false, error: `License is ${license.status}. Please renew your license.` };
    }
    if (license.expiry_date && new Date(license.expiry_date).getTime() < Date.now()) {
        return { valid: false, error: 'License has expired.' };
    }
    return { valid: true, clientId: license.client_id };
}

// 1. GET /api/oauth/:provider/authorize
oauthRouter.get('/:provider/authorize', async (req: Request, res: Response) => {
    try {
        const provider = req.params.provider as 'github' | 'slack' | 'jira';
        if (!['github', 'slack', 'jira'].includes(provider)) {
            return res.status(400).json({ success: false, error: `Unsupported provider: ${provider}` });
        }

        const licenseKey = (req.query.license_key as string) || '';
        const returnUrl = (req.query.return_url as string) || 'http://localhost:5173';

        // 1. Verify Client License
        const licenseCheck = await validateLicense(licenseKey);
        if (!licenseCheck.valid || !licenseCheck.clientId) {
            return res.status(403).json({
                success: false,
                error: licenseCheck.error || 'Invalid Cortex license'
            });
        }

        // 2. Determine provider credentials from Cortex-admin environment
        let clientId = '';
        if (provider === 'github') clientId = env.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID || '';
        if (provider === 'slack') clientId = env.SLACK_CLIENT_ID || process.env.SLACK_CLIENT_ID || '';
        if (provider === 'jira') clientId = env.JIRA_CLIENT_ID || process.env.JIRA_CLIENT_ID || '';

        if (!clientId) {
            return res.status(500).json({
                success: false,
                error: `OAuth credentials for ${provider.toUpperCase()} are not yet configured on Cortex-Admin server. Please configure ${provider.toUpperCase()}_CLIENT_ID and ${provider.toUpperCase()}_CLIENT_SECRET.`
            });
        }

        cleanExpired();

        const state = crypto.randomBytes(24).toString('hex');
        authStates.set(state, {
            provider,
            licenseKey,
            clientId: licenseCheck.clientId,
            returnUrl,
            createdAt: Date.now()
        });

        const baseUrl = getBaseUrl(req);
        const callbackUrl = `${baseUrl}/api/oauth/${provider}/callback`;

        let redirectUrl = '';
        if (provider === 'github') {
            const scopes = encodeURIComponent('repo read:org user:email read:user');
            redirectUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=${scopes}&state=${encodeURIComponent(state)}`;
        } else if (provider === 'slack') {
            const botScopes = encodeURIComponent('channels:read,channels:join,channels:history,groups:read,groups:history,users:read,users:read.email,team:read');
            redirectUrl = `https://slack.com/oauth/v2/authorize?client_id=${encodeURIComponent(clientId)}&scope=${botScopes}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${encodeURIComponent(state)}`;
        } else if (provider === 'jira') {
            const scopes = encodeURIComponent('read:jira-work read:jira-user manage:jira-webhook offline_access read:me');
            redirectUrl = `https://auth.atlassian.com/authorize?audience=api.atlassian.com&client_id=${encodeURIComponent(clientId)}&scope=${scopes}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${encodeURIComponent(state)}&response_type=code&prompt=consent`;
        }

        return res.redirect(redirectUrl);
    } catch (err: any) {
        console.error('[OAuthBroker] Authorize error:', err);
        return res.status(500).json({ success: false, error: err?.message });
    }
});

// 2. GET /api/oauth/:provider/callback
oauthRouter.get('/:provider/callback', async (req: Request, res: Response) => {
    try {
        const provider = req.params.provider as 'github' | 'slack' | 'jira';
        const code = (req.query.code as string) || '';
        const state = (req.query.state as string) || '';
        const error = (req.query.error as string) || (req.query.error_description as string);

        const stateInfo = state ? authStates.get(state) : undefined;
        const returnUrl = stateInfo?.returnUrl || 'http://localhost:5173';

        if (error) {
            console.error(`[OAuthBroker] Provider error from ${provider}:`, error);
            return renderBridgeHtml(res, {
                success: false,
                provider,
                error: `Authorization cancelled or denied: ${error}`,
                returnUrl
            });
        }

        if (!code || !stateInfo) {
            return renderBridgeHtml(res, {
                success: false,
                provider,
                error: 'Invalid or expired OAuth state session. Please try again.',
                returnUrl
            });
        }

        authStates.delete(state);

        const baseUrl = getBaseUrl(req);
        const callbackUrl = `${baseUrl}/api/oauth/${provider}/callback`;

        // 3. Exchange Code with Provider
        let accessToken = '';
        let refreshToken: string | null = null;
        let expiresAt: Date | null = null;
        let accountId = '';
        let accountName = 'Connected Account';
        let accountEmail = '';
        let scopes: string[] = [];
        let ticketMetadata: any = {};

        if (provider === 'github') {
            const clientId = env.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID || '';
            const clientSecret = env.GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET || '';

            const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: callbackUrl })
            });
            const tokenData = (await tokenRes.json()) as any;
            if (tokenData.error || !tokenData.access_token) {
                throw new Error(tokenData.error_description || tokenData.error || 'Failed to exchange GitHub code');
            }
            accessToken = tokenData.access_token;
            scopes = tokenData.scope ? tokenData.scope.split(',').map((s: string) => s.trim()) : [];

            // Fetch GitHub profile
            try {
                const uRes = await fetch('https://api.github.com/user', {
                    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Cortex-Admin/1.0' }
                });
                if (uRes.ok) {
                    const uData = (await uRes.json()) as any;
                    accountId = String(uData.id);
                    accountName = uData.name || uData.login || 'GitHub User';
                    accountEmail = uData.email || '';
                }
            } catch (uErr: any) {
                console.warn('[OAuthBroker] Could not fetch user profile:', uErr?.message);
            }
        } else if (provider === 'slack') {
            const clientId = env.SLACK_CLIENT_ID || process.env.SLACK_CLIENT_ID || '';
            const clientSecret = env.SLACK_CLIENT_SECRET || process.env.SLACK_CLIENT_SECRET || '';

            const formData = new URLSearchParams();
            formData.append('client_id', clientId);
            formData.append('client_secret', clientSecret);
            formData.append('code', code);
            formData.append('redirect_uri', callbackUrl);

            const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString()
            });
            const tokenData = (await tokenRes.json()) as any;
            if (!tokenData.ok) {
                throw new Error(tokenData.error || 'Failed to exchange Slack code');
            }
            accessToken = tokenData.access_token;
            accountName = tokenData.team?.name || 'Slack Team';
            accountId = tokenData.team?.id || '';
            scopes = tokenData.scope ? tokenData.scope.split(',').map((s: string) => s.trim()) : [];
        } else if (provider === 'jira') {
            const clientId = env.JIRA_CLIENT_ID || process.env.JIRA_CLIENT_ID || '';
            const clientSecret = env.JIRA_CLIENT_SECRET || process.env.JIRA_CLIENT_SECRET || '';

            const tokenRes = await fetch('https://auth.atlassian.com/oauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({
                    grant_type: 'authorization_code',
                    client_id: clientId,
                    client_secret: clientSecret,
                    code,
                    redirect_uri: callbackUrl
                })
            });
            const tokenData = (await tokenRes.json()) as any;
            if (tokenData.error || !tokenData.access_token) {
                throw new Error(tokenData.error_description || tokenData.error || 'Failed to exchange Jira code');
            }
            accessToken = tokenData.access_token;
            refreshToken = tokenData.refresh_token || null;
            if (tokenData.expires_in) {
                expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
            }
            scopes = tokenData.scope ? tokenData.scope.split(' ') : [];

            // 1. Fetch user identity profile (/me) for authentic verified email
            try {
                const meRes = await fetch('https://api.atlassian.com/me', {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        Accept: 'application/json'
                    }
                });
                if (meRes.ok) {
                    const meData = (await meRes.json()) as any;
                    if (meData.email) accountEmail = meData.email;
                    if (meData.name) accountName = meData.name;
                    if (meData.account_id) accountId = meData.account_id;
                }
            } catch (meErr: any) {
                console.warn('[OAuthBroker] Could not fetch Atlassian /me user profile:', meErr?.message);
            }

            // 2. Fetch accessible resources for site and Cloud ID
            let cloudId = '';
            let siteName = '';
            let siteUrl = '';
            try {
                const resRes = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        Accept: 'application/json'
                    }
                });
                if (resRes.ok) {
                    const resources = (await resRes.json()) as any[];
                    if (resources && resources.length > 0) {
                        const primary = resources[0];
                        cloudId = primary.id;
                        siteName = primary.name || 'Jira Cloud';
                        siteUrl = primary.url || '';
                        if (!accountId) accountId = cloudId;
                        accountName = accountName ? `${accountName} (${siteName})` : siteName;
                    }
                }
            } catch (rErr: any) {
                console.warn('[OAuthBroker] Could not fetch Atlassian accessible resources:', rErr?.message);
            }

            if (cloudId) accountId = cloudId;
            ticketMetadata = { cloudId, siteName, siteUrl };
        }

        // 4. Sync status into MySQL client_connectors
        try {
            const connectorId = snowflake.nextID().toString();
            await pool.query(
                `INSERT INTO client_connectors (
                    id, client_id, license_key, provider, status, 
                    account_name, account_email, account_id, scopes, connected_at, updated_at
                )
                VALUES (?, ?, ?, ?, 'connected', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE 
                    status = 'connected',
                    account_name = VALUES(account_name),
                    account_email = VALUES(account_email),
                    account_id = VALUES(account_id),
                    scopes = VALUES(scopes),
                    updated_at = CURRENT_TIMESTAMP`,
                [
                    connectorId,
                    stateInfo.clientId,
                    stateInfo.licenseKey,
                    provider,
                    accountName,
                    accountEmail,
                    accountId,
                    JSON.stringify(scopes)
                ]
            );
        } catch (dbErr: any) {
            console.error('[OAuthBroker] Error upserting client_connectors:', dbErr?.message);
        }

        // 5. Generate short-lived claim ticket (60s TTL)
        const ticket = `cortex_ticket_${crypto.randomBytes(32).toString('hex')}`;
        claimTickets.set(ticket, {
            ticket,
            licenseKey: stateInfo.licenseKey,
            provider,
            accessToken,
            refreshToken,
            expiresAt,
            scopes,
            accountId,
            accountName,
            accountEmail,
            metadata: ticketMetadata,
            signingSecret: provider === 'slack' ? (env.SLACK_SIGNING_SECRET || process.env.SLACK_SIGNING_SECRET || process.env.SLACK_SECRET || null) : null,
            createdAt: Date.now()
        });

        // 6. Return Bridge HTML with ticket handoff
        return renderBridgeHtml(res, {
            success: true,
            provider,
            ticket,
            accountName,
            returnUrl
        });
    } catch (err: any) {
        console.error('[OAuthBroker] Callback exchange error:', err);
        return renderBridgeHtml(res, {
            success: false,
            provider: String(req.params.provider || ''),
            error: err?.message || 'Token exchange failed',
            returnUrl: 'http://localhost:5173'
        });
    }
});

// 3. POST /api/oauth/claim (Called by client backend to securely claim the token)
oauthRouter.post('/claim', async (req: Request, res: Response) => {
    try {
        const { ticket, license_key } = req.body;
        if (!ticket || !license_key) {
            return res.status(400).json({ success: false, error: 'ticket and license_key are required' });
        }

        cleanExpired();

        const claimInfo = claimTickets.get(ticket);
        if (!claimInfo) {
            return res.status(404).json({ success: false, error: 'Ticket not found or has expired. Please authorize again.' });
        }

        if (claimInfo.licenseKey !== license_key.trim()) {
            return res.status(403).json({ success: false, error: 'Ticket does not match the provided license key.' });
        }

        // Single-use: Burn the ticket immediately!
        claimTickets.delete(ticket);

        return res.json({
            success: true,
            provider: claimInfo.provider,
            accessToken: claimInfo.accessToken,
            refreshToken: claimInfo.refreshToken || null,
            expiresAt: claimInfo.expiresAt || null,
            scopes: claimInfo.scopes,
            accountId: claimInfo.accountId,
            accountName: claimInfo.accountName,
            accountEmail: claimInfo.accountEmail,
            cloudId: claimInfo.metadata?.cloudId || claimInfo.accountId,
            signingSecret: claimInfo.signingSecret || null,
            metadata: claimInfo.metadata || {}
        });
    } catch (err: any) {
        console.error('[OAuthBroker] Claim error:', err);
        return res.status(500).json({ success: false, error: err?.message });
    }
});

// 4. POST /api/oauth/disconnect (Called when client disconnects tool)
oauthRouter.post('/disconnect', async (req: Request, res: Response) => {
    try {
        const { license_key, provider } = req.body;
        if (!license_key || !provider) {
            return res.status(400).json({ success: false, error: 'license_key and provider are required' });
        }

        await pool.query(
            'UPDATE client_connectors SET status = "disconnected", updated_at = CURRENT_TIMESTAMP WHERE license_key = ? AND provider = ?',
            [license_key.trim(), provider]
        );

        return res.json({ success: true, message: `Disconnected ${provider} for license` });
    } catch (err: any) {
        console.error('[OAuthBroker] Disconnect error:', err);
        return res.status(500).json({ success: false, error: err?.message });
    }
});

// 4.5. POST /api/oauth/client-webhook (Client registers or overwrites active tunnel/webhook URL)
oauthRouter.post('/client-webhook', async (req: Request, res: Response) => {
    try {
        const { license_key, webhook_url, provider, account_id } = req.body;
        if (!license_key || !webhook_url) {
            return res.status(400).json({ success: false, error: 'license_key and webhook_url are required' });
        }

        const cleanUrl = String(webhook_url).trim().replace(/\/+$/, '');

        // Verify valid active license
        const [licenses] = await pool.query<RowDataPacket[]>(
            'SELECT id, status FROM licenses WHERE license_key = ?',
            [license_key.trim()]
        );
        if (!licenses || licenses.length === 0) {
            return res.status(404).json({ success: false, error: 'License key not found' });
        }

        if (provider) {
            await pool.query(
                `UPDATE client_connectors 
                 SET webhook_url = ?, 
                     account_id = COALESCE(NULLIF(?, ''), account_id),
                     updated_at = CURRENT_TIMESTAMP 
                 WHERE license_key = ? AND provider = ?`,
                [cleanUrl, account_id || '', license_key.trim(), provider]
            );
        } else {
            await pool.query(
                'UPDATE client_connectors SET webhook_url = ?, updated_at = CURRENT_TIMESTAMP WHERE license_key = ?',
                [cleanUrl, license_key.trim()]
            );
        }

        console.log(`[OAuthBroker] Overwrote client webhook URL for license ${license_key} (${provider || 'all'}): ${cleanUrl}`);
        return res.json({ success: true, message: 'Client webhook URL updated successfully', webhook_url: cleanUrl });
    } catch (err: any) {
        console.error('[OAuthBroker] Error updating client webhook:', err);
        return res.status(500).json({ success: false, error: err?.message });
    }
});

// 4.6. POST /api/oauth/slack/events & /api/slack/events (Zero-Persistence Instant Relay for Slack Events)
oauthRouter.post(['/slack/events', '/events'], async (req: Request, res: Response) => {
    try {
        // 1. Handle Slack URL Verification Challenge (Setup Handshake)
        if (req.body?.type === 'url_verification') {
            console.log('[SlackRelay] Verified Slack Challenge handshake successfully.');
            return res.json({ challenge: req.body.challenge });
        }

        // Acknowledge Slack immediately within 3s window to avoid retries
        res.status(200).send('OK');

        // 2. Extract Team ID
        const teamId = req.body?.team_id || req.body?.context_team_id || req.body?.team?.id;
        if (!teamId) return;

        // 3. Fast In-Memory / DB routing to client webhook
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT webhook_url FROM client_connectors 
             WHERE account_id = ? AND provider = 'slack' AND status = 'connected' AND webhook_url IS NOT NULL
             ORDER BY updated_at DESC LIMIT 1`,
            [teamId]
        );

        let targetUrl = rows?.[0]?.webhook_url;
        if (!targetUrl) {
            // Fallback for single-tenant / testing environments
            const [fallback] = await pool.query<RowDataPacket[]>(
                `SELECT webhook_url FROM client_connectors 
                 WHERE provider = 'slack' AND status = 'connected' AND webhook_url IS NOT NULL 
                 ORDER BY updated_at DESC LIMIT 1`
            );
            targetUrl = fallback?.[0]?.webhook_url;
        }

        if (targetUrl) {
            const forwardHeaders: Record<string, string> = {
                'Content-Type': 'application/json',
                'User-Agent': 'Cortex-Admin-Relay/1.0',
            };
            if (req.headers['x-slack-signature']) {
                forwardHeaders['x-slack-signature'] = String(req.headers['x-slack-signature']);
            }
            if (req.headers['x-slack-request-timestamp']) {
                forwardHeaders['x-slack-request-timestamp'] = String(req.headers['x-slack-request-timestamp']);
            }

            // Zero-persistence streaming relay (< 10ms)
            fetch(targetUrl, {
                method: 'POST',
                headers: forwardHeaders,
                body: JSON.stringify(req.body),
                signal: AbortSignal.timeout(10000),
            }).catch(fErr => {
                console.warn(`[SlackRelay] Notice: Client webhook unreachable (${targetUrl}):`, fErr?.message);
            });
        }
    } catch (err: any) {
        console.error('[SlackRelay] Error handling Slack event:', err?.message);
    }
});

// 5. POST /api/oauth/:provider/refresh (Token rotation for background operations & continuous sync)
oauthRouter.post('/:provider/refresh', async (req: Request, res: Response) => {
    try {
        const provider = req.params.provider as 'github' | 'slack' | 'jira';
        const { license_key, refresh_token } = req.body;

        if (!license_key || !refresh_token) {
            return res.status(400).json({ success: false, error: 'license_key and refresh_token are required' });
        }

        // Verify client license
        const licenseCheck = await validateLicense(license_key);
        if (!licenseCheck.valid) {
            return res.status(403).json({ success: false, error: licenseCheck.error || 'Invalid license key' });
        }

        if (provider === 'jira') {
            const clientId = env.JIRA_CLIENT_ID || process.env.JIRA_CLIENT_ID || '';
            const clientSecret = env.JIRA_CLIENT_SECRET || process.env.JIRA_CLIENT_SECRET || '';

            if (!clientId || !clientSecret) {
                return res.status(500).json({ success: false, error: 'Jira OAuth credentials not configured on Cortex-Admin' });
            }

            const tokenRes = await fetch('https://auth.atlassian.com/oauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({
                    grant_type: 'refresh_token',
                    client_id: clientId,
                    client_secret: clientSecret,
                    refresh_token: refresh_token.trim()
                })
            });

            const tokenData = (await tokenRes.json()) as any;
            if (!tokenRes.ok || !tokenData.access_token) {
                return res.status(tokenRes.status || 400).json({
                    success: false,
                    error: tokenData.error || 'Failed to refresh Jira token',
                    error_description: tokenData.error_description || 'Invalid grant'
                });
            }

            return res.json({
                success: true,
                provider: 'jira',
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token || refresh_token,
                expiresIn: tokenData.expires_in || 3600
            });
        }

        return res.status(400).json({ success: false, error: `Provider ${provider} does not support broker token refresh` });
    } catch (err: any) {
        console.error('[OAuthBroker] Refresh error:', err);
        return res.status(500).json({ success: false, error: err?.message });
    }
});

// Bridge HTML renderer for popup / browser redirection
function renderBridgeHtml(
    res: Response,
    opts: { success: boolean; provider: string; ticket?: string; accountName?: string; error?: string; returnUrl: string }
) {
    const { success, provider, ticket, accountName, error, returnUrl } = opts;
    const cleanProvider = (provider || '').toUpperCase();

    return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>${success ? `${cleanProvider} Connected` : 'Connection Failed'}</title>
            <style>
                body {
                    background: #090d16;
                    color: #f8fafc;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    margin: 0;
                }
                .card {
                    background: #111827;
                    border: 1px solid ${success ? '#22c55e' : '#ef4444'};
                    padding: 36px;
                    border-radius: 16px;
                    text-align: center;
                    max-width: 440px;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                }
                .icon {
                    width: 56px;
                    height: 56px;
                    background: ${success ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)'};
                    color: ${success ? '#22c55e' : '#ef4444'};
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 28px;
                    margin: 0 auto 18px;
                }
                h2 { margin: 0 0 8px; font-size: 20px; }
                p { color: #94a3b8; font-size: 14px; margin: 0 0 24px; line-height: 1.5; }
                .btn {
                    background: #6366f1;
                    color: #fff;
                    border: none;
                    padding: 10px 24px;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="icon">${success ? '✓' : '✕'}</div>
                <h2>${success ? `${cleanProvider} Authorized!` : 'Authorization Failed'}</h2>
                <p>${success ? `Successfully authorized ${accountName || cleanProvider}. Returning to Cortex...` : (error || 'An error occurred during authorization.')}</p>
                <button class="btn" onclick="proceed()">Return to App</button>
            </div>
            <script>
                function proceed() {
                    if (window.opener) {
                        window.opener.postMessage({
                            type: '${success ? 'CORTEX_OAUTH_TICKET' : 'CORTEX_OAUTH_ERROR'}',
                            provider: '${provider}',
                            ticket: '${ticket || ''}',
                            error: '${error || ''}'
                        }, '*');
                        window.close();
                    } else {
                        const target = new URL('${returnUrl}');
                        ${success ? `target.searchParams.set('claim_ticket', '${ticket || ''}');` : ''}
                        target.searchParams.set('provider', '${provider}');
                        ${error ? `target.searchParams.set('error', '${encodeURIComponent(error)}');` : ''}
                        window.location.href = target.toString();
                    }
                }
                setTimeout(proceed, 1000);
            </script>
        </body>
        </html>
    `);
}
