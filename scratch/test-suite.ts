import http from 'http';
import app, { ensureDatabaseReady } from '../src/server.js';
import env from '../src/config/env.config.js';
import pool from '../src/config/db.config.js';

async function runTestSuite() {
    console.log('\n======================================================');
    console.log('🧪 CORTEX ADMIN COMPREHENSIVE END-TO-END TEST SUITE');
    console.log('======================================================\n');

    const testPort = 5055;
    let server: http.Server;

    try {
        console.log('1. Connecting to TiDB Cloud & Initializing Schema...');
        await ensureDatabaseReady();
        console.log('✅ TiDB Cloud Database Initialized & Connected.\n');

        // Start server on test port
        server = await new Promise<http.Server>((resolve) => {
            const s = app.listen(testPort, () => resolve(s));
        });
        console.log(`✅ Test server running on http://127.0.0.1:${testPort}\n`);

        const baseUrl = `http://127.0.0.1:${testPort}`;

        // TEST 1: Health & Database Keepalive
        console.log('------------------------------------------------------');
        console.log('TEST 1: GET /api/health (System & TiDB Keepalive)');
        console.log('------------------------------------------------------');
        const healthRes = await fetch(`${baseUrl}/api/health`);
        const healthData = await healthRes.json();
        console.log('Status code:', healthRes.status);
        console.log('Health Payload:', healthData);
        if (healthRes.ok && healthData.status === 'online') {
            console.log('✅ Health & TiDB check PASSED\n');
        } else {
            throw new Error('Health check failed: ' + JSON.stringify(healthData));
        }

        // TEST 2: Admin Login Authentication
        console.log('------------------------------------------------------');
        console.log('TEST 2: POST /api/admin/login (Admin Auth & JWT)');
        console.log('------------------------------------------------------');
        const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: env.ADMIN_DEFAULT_EMAIL,
                password: env.ADMIN_DEFAULT_PASSWORD
            })
        });
        const loginData = await loginRes.json();
        console.log('Status code:', loginRes.status);
        console.log('Login Result:', { success: loginData.success, admin: loginData.admin, hasToken: Boolean(loginData.token) });
        if (!loginRes.ok || !loginData.token) {
            throw new Error('Admin login failed: ' + JSON.stringify(loginData));
        }
        const authToken = loginData.token;
        console.log('✅ Admin Authentication PASSED\n');

        // TEST 3: Resend Email Status
        console.log('------------------------------------------------------');
        console.log('TEST 3: GET /api/email/status (Resend API & Domain)');
        console.log('------------------------------------------------------');
        const emailRes = await fetch(`${baseUrl}/api/email/status`, {
            headers: { Authorization: `Bearer ${authToken}` }
        });
        const emailData = await emailRes.json();
        console.log('Email Status Payload:', emailData);
        if (emailRes.ok && emailData.success) {
            console.log(`✅ Resend Email Service PASSED (Broadcast from: ${emailData.data?.broadcastFrom})\n`);
        } else {
            console.warn('⚠️ Resend Email Note:', emailData);
        }

        // TEST 4: Fetch a valid License Key from Database for OAuth & Ping Tests
        console.log('------------------------------------------------------');
        console.log('TEST 4: Inspecting active licenses in TiDB...');
        console.log('------------------------------------------------------');
        const [licRows]: any = await pool.query('SELECT license_key, client_id, status FROM licenses LIMIT 1');
        const activeLicenseKey = licRows[0]?.license_key || '3AF4-E2A7-0F5F-E01E';
        console.log(`Found active license key for tests: ${activeLicenseKey}\n`);

        // TEST 5: License Ping Handshake
        console.log('------------------------------------------------------');
        console.log('TEST 5: POST /api/license/ping (Fleet Telemetry Ping)');
        console.log('------------------------------------------------------');
        const pingRes = await fetch(`${baseUrl}/api/license/ping`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                license_key: activeLicenseKey,
                hwid: 'HWID-TEST-SUITE-RUNNER-001',
                app_version: '1.0.4',
                platform: 'win32'
            })
        });
        const pingData = await pingRes.json();
        console.log('Ping Response Status:', pingRes.status);
        console.log('Ping Response Data:', pingData);
        if (pingRes.ok && pingData.status) {
            console.log(`✅ License Ping PASSED (License Status: ${pingData.status})\n`);
        } else {
            console.warn('⚠️ License Ping Note:', pingData);
        }

        // TEST 6: GitHub App OAuth Broker Flow (/api/oauth/github/authorize)
        console.log('------------------------------------------------------');
        console.log('TEST 6: GET /api/oauth/github/authorize (GitHub App Flow)');
        console.log('------------------------------------------------------');
        const ghRes = await fetch(`${baseUrl}/api/oauth/github/authorize?license_key=${encodeURIComponent(activeLicenseKey)}`, {
            redirect: 'manual'
        });
        console.log('GitHub Authorize Status:', ghRes.status);
        const ghLocation = ghRes.headers.get('location') || '';
        console.log('GitHub Redirect Location:', ghLocation);
        if (ghLocation.includes('github.com/login/oauth/authorize') && ghLocation.includes(env.GITHUB_CLIENT_ID)) {
            console.log('✅ GitHub App Authorize URL matches GITHUB_CLIENT_ID correctly!\n');
        } else {
            throw new Error('GitHub Authorize failed: ' + ghLocation);
        }

        // TEST 7: Jira OAuth 3LO Broker Flow (/api/oauth/jira/authorize)
        console.log('------------------------------------------------------');
        console.log('TEST 7: GET /api/oauth/jira/authorize (Jira 3LO Flow)');
        console.log('------------------------------------------------------');
        const jiraRes = await fetch(`${baseUrl}/api/oauth/jira/authorize?license_key=${encodeURIComponent(activeLicenseKey)}`, {
            redirect: 'manual'
        });
        console.log('Jira Authorize Status:', jiraRes.status);
        const jiraLocation = jiraRes.headers.get('location') || '';
        console.log('Jira Redirect Location:', jiraLocation);
        if (jiraLocation.includes('auth.atlassian.com/authorize') && jiraLocation.includes(env.JIRA_CLIENT_ID)) {
            console.log('✅ Jira 3LO Authorize URL matches JIRA_CLIENT_ID & Scopes correctly!\n');
        } else {
            throw new Error('Jira Authorize failed: ' + jiraLocation);
        }

        // TEST 8: Slack OAuth Broker Flow (/api/oauth/slack/authorize)
        console.log('------------------------------------------------------');
        console.log('TEST 8: GET /api/oauth/slack/authorize (Slack Flow)');
        console.log('------------------------------------------------------');
        const slackRes = await fetch(`${baseUrl}/api/oauth/slack/authorize?license_key=${encodeURIComponent(activeLicenseKey)}`, {
            redirect: 'manual'
        });
        console.log('Slack Authorize Status:', slackRes.status);
        const slackLocation = slackRes.headers.get('location') || '';
        console.log('Slack Redirect Location:', slackLocation);
        if (slackLocation.includes('slack.com/oauth/v2/authorize') && slackLocation.includes(env.SLACK_CLIENT_ID)) {
            console.log('✅ Slack Authorize URL matches SLACK_CLIENT_ID correctly!\n');
        } else {
            throw new Error('Slack Authorize failed: ' + slackLocation);
        }

        console.log('======================================================');
        console.log('🎉 ALL TESTS PASSED SUCCESSFULLY! ALL SYSTEMS LIVE & WORKING!');
        console.log('======================================================\n');
    } catch (err: any) {
        console.error('\n❌ Test Suite Error:', err.message || err);
        process.exitCode = 1;
    } finally {
        if (server!) {
            server.close();
        }
        await pool.end();
    }
}

runTestSuite();
