/**
 * CORTEX CONTROL PLANE - MASTER ADMINISTRATOR APPLICATION CORE
 * Enterprise Architecture: Utilitarian Studio Console (Tailscale / Stripe style)
 * Features:
 * - Resilient Event Delegation (Zero tab lockups)
 * - Real Database Simulator (Zero fake/mock data)
 * - Executive Dashboard & Global HWID Fleet Manager
 * - Absolute Zero Emojis (Pure SVG Iconography)
 */

(function () {
    'use strict';

    // Application Global State
    const state = {
        currentTab: 'dashboard',
        licenses: [],
        clients: [],
        globalDevices: [],
        logs: [],
        filterStatus: 'all',
        searchQuery: '',
        licenseSort: 'newest',
        devicesSearchQuery: '',
        deviceFilter: 'all',
        devicePlatformFilter: 'all',
        clientFilter: 'all',
        telemetryActionFilter: 'all',
        currentHwidLicense: null,
        sessionToken: null,
        currentAdmin: null,
        isUnlocking: false,

        // Control Plane Analytics & Security State
        analyticsRange: '24h',
        analytics: null,
        distTab: 'platforms',
        admins: [],
        securityStatus: null,
        systemHealth: null,
        autoRefreshSeconds: 0,
        autoRefreshTimer: null,
        telemetryTailActive: false,
        telemetryTailTimer: null,
        confirmResolver: null,
        rateLimitCountdownTimer: null,
        cmdkIndex: 0,
        cmdkItems: [],
        lastIssuedLicense: null,
        lastSimResponse: null,

        // Resend Email Integration State (Zero-DB Persistence)
        resendConfig: { configured: false, valid: false },
        audiences: [],
        currentAudienceId: '',
        contacts: [],
        contactsFilter: 'all',
        contactsSearch: '',
        broadcasts: [],
        broadcastSubTab: 'audiences',
        broadcastEditorMode: 'visual',
        supportSubTab: 'compose',
        sentEmails: [],
        trackerFilter: 'all',
        previewDevice: 'desktop',
        currentPreviewType: 'broadcast',
        parsedCsvContacts: [],
        supportAttachments: [],
        activeComposerContext: 'support',
        selectedPhoto: null,
        activeImgElement: null,
        lastSavedRange: null
    };

    // ─────────────────────────────────────────────────────────────────────────
    // UTILITY HELPERS
    // ─────────────────────────────────────────────────────────────────────────
    function escapeHtml(str) {
        if (!str && str !== 0) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function parseUTCDate(dateStr) {
        if (!dateStr) return null;
        let s = String(dateStr).trim();
        if (!s) return null;
        if (s.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(s)) {
            const d = new Date(s);
            return isNaN(d.getTime()) ? null : d;
        }
        if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(s)) {
            s = s.replace(' ', 'T') + 'Z';
        }
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }

    function formatDate(dateStr) {
        if (!dateStr) return '<span style="color: var(--text-muted);">N/A</span>';
        const d = parseUTCDate(dateStr);
        if (!d) return String(dateStr);
        const day = String(d.getDate()).padStart(2, '0');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[d.getMonth()];
        const year = d.getFullYear();
        let hours = d.getHours();
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        return `${day} ${month} ${year}, ${String(hours).padStart(2, '0')}:${minutes} ${ampm}`;
    }

    function formatRelative(dateStr) {
        if (!dateStr) return '<span style="color: var(--text-muted);">Never</span>';
        const d = parseUTCDate(dateStr);
        if (!d) return '';
        const diff = Date.now() - d.getTime();
        if (diff < 0) return '<span style="color: var(--emerald);">Active Now</span>';
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return '<span style="color: var(--emerald);">Just now</span>';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }

    function formatLastSeenBadge(lastSeenStr) {
        if (!lastSeenStr) {
            return `<span class="last-seen-pill awaiting" title="Pre-authorized by admin. Awaiting first cryptographic handshake from machine.">
                <span class="indicator-dot"></span>
                <span>Awaiting Handshake</span>
            </span>`;
        }

        const d = parseUTCDate(lastSeenStr);
        if (!d) {
            return `<span style="font-size: 11.5px; color: var(--text-muted);">---</span>`;
        }

        const diffMs = Date.now() - d.getTime();
        const exactDate = formatDate(lastSeenStr);
        const effectiveDiffMs = Math.max(0, diffMs);
        const mins = Math.floor(effectiveDiffMs / 60000);

        if (mins < 15) {
            const label = mins < 1 ? 'Active Now' : `${mins}m ago`;
            return `<span class="last-seen-pill live" title="Live Heartbeat: ${exactDate}">
                <span class="indicator-dot"></span>
                <span>${label}</span>
            </span>`;
        }

        if (mins < 60) {
            return `<span class="last-seen-pill recent" title="Last Heartbeat: ${exactDate}">
                <span class="indicator-dot"></span>
                <span>${mins}m ago</span>
            </span>`;
        }

        const hours = Math.floor(mins / 60);
        if (hours < 24) {
            return `<span class="last-seen-pill recent" title="Last Heartbeat: ${exactDate}">
                <span class="indicator-dot"></span>
                <span>${hours}h ago</span>
            </span>`;
        }

        const days = Math.floor(hours / 24);
        return `<span class="last-seen-pill stale" title="Last Heartbeat: ${exactDate}">
            <span class="indicator-dot"></span>
            <span>Offline (${days}d ago)</span>
        </span>`;
    }

    function formatExpiryCountdown(dateStr) {
        if (!dateStr) return '';
        const d = parseUTCDate(dateStr);
        if (!d) return '';
        const diff = d.getTime() - Date.now();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        if (days < 0) return `<span style="color: var(--ruby); font-weight: 500;">Expired (${Math.abs(days)}d ago)</span>`;
        if (days === 0) return `<span style="color: var(--amber); font-weight: 500;">Expires today</span>`;
        if (days <= 14) return `<span style="color: var(--amber); font-weight: 500;">in ${days} days</span>`;
        if (days > 3650) return `<span style="color: var(--emerald);">Perpetual</span>`;
        return `<span style="color: var(--text-secondary);">in ${days} days</span>`;
    }

    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span style="font-weight: 600; font-family: var(--font-mono); font-size: 11px;">[${type.toUpperCase()}]</span><span>${escapeHtml(message)}</span>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(6px)';
            setTimeout(() => toast.remove(), 200);
        }, 3500);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MASTER SESSION AUTHENTICATION & ACCESS CONTROL
    // ─────────────────────────────────────────────────────────────────────────
    function getAuthToken() {
        if (state.sessionToken) return state.sessionToken;
        try {
            const local = localStorage.getItem('cortex_admin_token');
            if (local) {
                state.sessionToken = local;
                return local;
            }
        } catch (_) {}
        try {
            const sess = sessionStorage.getItem('cortex_admin_token');
            if (sess) {
                state.sessionToken = sess;
                return sess;
            }
        } catch (_) {}
        return null;
    }

    function setAuthToken(token) {
        state.sessionToken = token || null;
        if (!token) {
            try { localStorage.removeItem('cortex_admin_token'); } catch (_) {}
            try { sessionStorage.removeItem('cortex_admin_token'); } catch (_) {}
            return;
        }
        try { localStorage.setItem('cortex_admin_token', token); } catch (_) {}
        try { sessionStorage.setItem('cortex_admin_token', token); } catch (_) {}
    }

    function showAuthGate() {
        if (state.isUnlocking) {
            console.log('[AUTH] Ignored showAuthGate while unlocking is active');
            return;
        }
        const overlay = document.getElementById('auth-gate-overlay');
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.style.removeProperty('display');
            overlay.style.display = 'flex';
            const pwdInput = document.getElementById('login-password');
            if (pwdInput) {
                pwdInput.value = '';
            }
            const errBanner = document.getElementById('login-error-banner');
            if (errBanner) {
                errBanner.style.display = 'none';
                errBanner.textContent = '';
            }
        }
    }

    function hideAuthGate() {
        const overlay = document.getElementById('auth-gate-overlay');
        if (overlay) {
            overlay.style.setProperty('display', 'none', 'important');
            overlay.classList.add('hidden');
        }
    }

    function updateOperatorProfile(admin) {
        if (!admin) return;
        state.currentAdmin = admin;
        const nameEl = document.getElementById('operator-name');
        const emailEl = document.getElementById('operator-email');
        const initialsEl = document.getElementById('operator-initials');

        if (nameEl && admin.name) nameEl.textContent = admin.name;
        if (emailEl && admin.email) emailEl.textContent = admin.email;
        if (initialsEl) {
            const initials = (admin.name || 'MA')
                .split(' ')
                .map(n => n[0])
                .join('')
                .substring(0, 2)
                .toUpperCase() || 'MA';
            initialsEl.textContent = initials;
        }
    }

    async function checkAuthSession() {
        const token = getAuthToken();
        if (!token) {
            showAuthGate();
            return false;
        }

        try {
            const res = await fetch('/api/admin/me', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.admin) {
                    updateOperatorProfile(data.admin);
                    hideAuthGate();
                    switchTab(getStoredActiveTab() || 'dashboard');
                    return true;
                }
            }
            if (res.status === 401) {
                setAuthToken(null);
                showAuthGate();
                return false;
            }
        } catch (err) {
            console.warn('Session verification network error:', err);
            hideAuthGate();
            return true;
        }

        setAuthToken(null);
        showAuthGate();
        return false;
    }

    function stopRateLimitCountdown() {
        if (state.rateLimitCountdownTimer) {
            clearInterval(state.rateLimitCountdownTimer);
            state.rateLimitCountdownTimer = null;
        }
    }

    function startRateLimitCountdown(seconds) {
        stopRateLimitCountdown();
        const errorBanner = document.getElementById('login-error-banner');
        const submitBtn = document.getElementById('btn-login-submit');
        let remaining = Math.max(1, parseInt(seconds, 10) || 60);

        const renderCountdown = () => {
            if (errorBanner) {
                errorBanner.textContent = `Rate Limit Exceeded: Max 10 login attempts per minute from your IP. Retry in ${remaining}s.`;
                errorBanner.style.display = 'block';
            }
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = `Locked (${remaining}s)`;
            }
        };

        renderCountdown();
        state.rateLimitCountdownTimer = setInterval(() => {
            remaining -= 1;
            if (remaining <= 0) {
                stopRateLimitCountdown();
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Authenticate & Unlock Console';
                }
                if (errorBanner) {
                    errorBanner.style.display = 'none';
                }
            } else {
                renderCountdown();
            }
        }, 1000);
    }

    function toggleLoginPassword() {
        const pwdInput = document.getElementById('login-password');
        const btn = document.getElementById('btn-toggle-login-pwd');
        if (!pwdInput) return;
        const isPassword = pwdInput.type === 'password';
        pwdInput.type = isPassword ? 'text' : 'password';
        if (btn) btn.title = isPassword ? 'Hide Password' : 'Show Password';
    }

    async function handleLoginSubmit(e) {
        if (e) {
            try { e.preventDefault(); } catch (_) {}
            try { e.stopPropagation(); } catch (_) {}
        }
        const emailInput = document.getElementById('login-email');
        const passwordInput = document.getElementById('login-password');
        const email = (emailInput?.value || '').trim();
        const password = (passwordInput?.value || '').trim();
        const submitBtn = document.getElementById('btn-login-submit');
        const errorBanner = document.getElementById('login-error-banner');

        if (state.rateLimitCountdownTimer) {
            return;
        }

        if (!email || !password) {
            if (errorBanner) {
                errorBanner.textContent = 'Please enter administrator email and master password.';
                errorBanner.style.display = 'block';
            }
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Authenticating...';
        }
        if (errorBanner) errorBanner.style.display = 'none';

        state.isUnlocking = true;

        let rateLimited = false;
        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success && data.token) {
                stopRateLimitCountdown();
                setAuthToken(data.token);
                updateOperatorProfile(data.admin);
                hideAuthGate();

                const activeTab = getStoredActiveTab() || 'dashboard';
                switchTab(activeTab);
                showToast('Console unlocked. Master session active.', 'success');

                setTimeout(() => {
                    state.isUnlocking = false;
                }, 4000);

                // Run background data fetches independently without risking lockout
                loadLicenses().catch(err => console.warn('Background loadLicenses failed:', err));
                loadClients().catch(err => console.warn('Background loadClients failed:', err));
                loadGlobalDevices().catch(err => console.warn('Background loadGlobalDevices failed:', err));
                loadLogs().catch(err => console.warn('Background loadLogs failed:', err));
                loadAnalytics().catch(err => console.warn('Background loadAnalytics failed:', err));
                checkSystemHealth(false).catch(() => {});
                checkResendStatus().catch(err => console.warn('Background checkResendStatus failed:', err));
            } else if (res.status === 429) {
                rateLimited = true;
                state.isUnlocking = false;
                const retryHeader = res.headers.get('Retry-After');
                const retrySeconds = Number(data.retryAfterSeconds || retryHeader || 60);
                startRateLimitCountdown(retrySeconds);
            } else {
                state.isUnlocking = false;
                const remainingHeader = res.headers.get('RateLimit-Remaining');
                const remainingNote = remainingHeader !== null ? ` (${remainingHeader} auth attempt(s) remaining this minute)` : '';
                if (errorBanner) {
                    errorBanner.textContent = (data.message || 'Access Denied: Invalid administrator credentials.') + remainingNote;
                    errorBanner.style.display = 'block';
                }
                if (passwordInput) {
                    passwordInput.value = '';
                    passwordInput.focus();
                }
            }
        } catch (err) {
            state.isUnlocking = false;
            if (errorBanner) {
                errorBanner.textContent = 'Connection to authorization server failed.';
                errorBanner.style.display = 'block';
            }
        } finally {
            if (submitBtn && !rateLimited && !state.rateLimitCountdownTimer) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Authenticate & Unlock Console';
            }
        }
    }

    function handleLogout() {
        stopRateLimitCountdown();
        if (state.autoRefreshTimer) {
            clearInterval(state.autoRefreshTimer);
            state.autoRefreshTimer = null;
        }
        if (state.telemetryTailTimer) {
            clearInterval(state.telemetryTailTimer);
            state.telemetryTailTimer = null;
            state.telemetryTailActive = false;
        }
        setAuthToken(null);
        state.currentAdmin = null;
        state.licenses = [];
        state.clients = [];
        state.globalDevices = [];
        state.logs = [];
        state.analytics = null;
        state.admins = [];

        // Clear UI tables so confidential data is not visible behind modal
        renderLicensesTable();
        renderClientsTable();
        renderGlobalDevicesTable();
        renderLogsTable();

        showAuthGate();
        showToast('Console session locked. Re-authentication required.', 'info');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SECURE API CLIENT
    // ─────────────────────────────────────────────────────────────────────────
    async function apiRequest(endpoint, method = 'GET', body = null) {
        const token = getAuthToken();
        if (!token && !endpoint.includes('/api/admin/login')) {
            if (!state.isUnlocking) {
                showAuthGate();
            }
            return { ok: false, status: 401, success: false, message: 'Authentication required' };
        }

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = { method, headers };
        if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            config.body = JSON.stringify(body);
        }

        try {
            const res = await fetch(endpoint, config);
            if (res.status === 401) {
                if (!state.isUnlocking) {
                    setAuthToken(null);
                    showAuthGate();
                    showToast('Master session expired. Re-authentication required.', 'error');
                }
                return { ok: false, status: 401, success: false, message: 'Session expired' };
            }
            const data = await res.json().catch(() => ({}));
            return { ok: res.ok, status: res.status, ...data };
        } catch (err) {
            console.error(`API Error on ${endpoint}:`, err);
            return { ok: false, status: 0, success: false, message: err.message || 'Connection failed' };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BULLETPROOF TAB NAVIGATION (Event-Delegated & State-Safe)
    // ─────────────────────────────────────────────────────────────────────────
    function getStoredActiveTab() {
        const validTabs = ['dashboard', 'licenses', 'devices', 'telemetry', 'clients', 'broadcasts', 'support-mail', 'admins'];
        const hash = (window.location.hash || '').replace('#', '').trim().toLowerCase();
        if (validTabs.includes(hash)) return hash;

        try {
            const saved = localStorage.getItem('cortex_active_tab');
            if (saved && validTabs.includes(saved)) return saved;
        } catch (_) {}

        return 'dashboard';
    }

    function toggleMobileSidebar(forceOpen) {
        const sidebar = document.getElementById('app-sidebar');
        const backdrop = document.getElementById('sidebar-backdrop');
        if (!sidebar) return;
        const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !sidebar.classList.contains('mobile-open');
        sidebar.classList.toggle('mobile-open', shouldOpen);
        if (backdrop) backdrop.classList.toggle('active', shouldOpen);
    }

    function switchTab(tabId) {
        const validTabs = ['dashboard', 'licenses', 'devices', 'telemetry', 'clients', 'broadcasts', 'support-mail', 'admins'];
        if (!tabId || !validTabs.includes(tabId)) tabId = 'dashboard';
        state.currentTab = tabId;

        toggleMobileSidebar(false);

        // Persist to localStorage and URL hash
        try {
            localStorage.setItem('cortex_active_tab', tabId);
            if (window.location.hash !== `#${tabId}`) {
                history.replaceState(null, '', `#${tabId}`);
            }
        } catch (_) {}

        // Instant top reset to prevent layout jumping
        window.scrollTo({ top: 0, behavior: 'instant' });

        // Update Nav Link Active States
        document.querySelectorAll('.nav-link').forEach(btn => {
            if (btn.getAttribute('data-tab') === tabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Hide All Panes & Show Target Pane
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('active');
        });
        const targetPane = document.getElementById(`pane-${tabId}`);
        if (targetPane) targetPane.classList.add('active');

        // Update Breadcrumb Text
        const breadcrumbEl = document.getElementById('page-breadcrumb');
        if (breadcrumbEl) {
            const titles = {
                dashboard: 'Executive Control Dashboard',
                licenses: 'Licenses & Hardware Quota Allocation',
                devices: 'Hardware Machine Fleet Inventory',
                telemetry: 'Telemetry & Cryptographic Audit Stream',
                clients: 'Client Organizations Directory',
                broadcasts: 'Marketing & Operational Broadcast Engine',
                'support-mail': 'Customer Support Communications & Delivery Telemetry',
                admins: 'Team & Security Control'
            };
            breadcrumbEl.innerHTML = `<span>${titles[tabId] || 'Control Plane'}</span>`;
        }

        // Lazy refresh data on tab switch
        if (tabId === 'devices') loadGlobalDevices();
        if (tabId === 'telemetry') loadLogs();
        if (tabId === 'dashboard') {
            loadAnalytics();
            updateDashboardMetrics();
            checkSystemHealth(false);
        }
        if (tabId === 'admins') {
            loadAdminsTab();
        }
        if (tabId === 'broadcasts') {
            checkResendStatus();
            loadAudiences();
            loadBroadcasts();
        }
        if (tabId === 'support-mail') {
            checkResendStatus();
            populateSupportClientPicker();
            loadSentHistory();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EXECUTIVE DASHBOARD & ANALYTICS ENGINE
    // ─────────────────────────────────────────────────────────────────────────
    async function loadAnalytics(rangeOverride) {
        if (rangeOverride) state.analyticsRange = rangeOverride;
        const range = state.analyticsRange || '24h';

        document.querySelectorAll('#dash-range-switcher .range-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-range') === range);
        });

        const res = await apiRequest(`/api/analytics/overview?range=${encodeURIComponent(range)}`);
        if (res && res.success && res.data) {
            state.analytics = res.data;
            updateDashboardMetrics();
        }
    }

    function normalizePlatformLabel(raw) {
        const p = String(raw || '').trim().toLowerCase();
        if (!p || p === 'unknown' || p === 'unknown os') return 'Unknown OS';
        if (p.includes('win')) return 'Windows (win32)';
        if (p.includes('darwin') || p.includes('mac')) return 'macOS (darwin)';
        if (p.includes('linux')) return 'Linux';
        if (p.includes('manual')) return 'Manual Binding';
        return String(raw);
    }

    function updateDashboardMetrics() {
        const analytics = state.analytics || null;
        const licStats = analytics?.licenses || {};
        const pingStats = analytics?.pings || {};
        const clientStats = analytics?.clients || {};
        const secStats = analytics?.security || {};

        const totalLicenses = licStats.total ?? state.licenses.length;
        const activeLicenses = licStats.active ?? state.licenses.filter(l => l.status === 'active').length;
        const suspendedLicenses = licStats.suspended ?? state.licenses.filter(l => l.status === 'suspended').length;
        const revokedLicenses = licStats.revoked ?? state.licenses.filter(l => l.status === 'revoked').length;
        const expiringSoonCount = licStats.expiring_soon_count ?? state.licenses.filter(isLicenseExpiringSoon).length;

        const devices = state.globalDevices || [];
        let boundDevicesCount = devices.length;
        let blockedDevicesCount = devices.filter(isDeviceBlocked).length;
        let onlineNowCount = devices.filter(d => !isDeviceBlocked(d) && isDeviceLive(d)).length;
        let totalSeatLimit = 0;

        state.licenses.forEach(l => {
            if (devices.length === 0) {
                boundDevicesCount += Number(l.bound_machines_count || (Array.isArray(l.hwids) ? l.hwids.length : 0));
                blockedDevicesCount += Number(l.blocked_machines_count || 0);
            }
            totalSeatLimit += Number(l.max_machines || 1);
        });

        const totalPings = Number(pingStats.total ?? 0);
        const successRate = pingStats.success_rate_percent !== undefined
            ? Math.round(Number(pingStats.success_rate_percent) * 10) / 10
            : (state.logs.length
                ? Math.round((state.logs.filter(l => l.status === 'success').length / state.logs.length) * 100)
                : 100);

        const totalClients = clientStats.total ?? state.clients.length;
        const activeClients = clientStats.active ?? state.clients.filter(c => c.status === 'active').length;

        // Fleet Heartbeat Health: prefer backend client fleet_health_percent, plus healthy/delayed/offline breakdown
        const hasClientHeartbeat = (clientStats.healthy_count || 0) + (clientStats.delayed_count || 0) + (clientStats.offline_count || 0) > 0;
        const healthyCount = hasClientHeartbeat ? Number(clientStats.healthy_count || 0) : onlineNowCount;
        const delayedCount = hasClientHeartbeat ? Number(clientStats.delayed_count || 0) : 0;
        const offlineCount = hasClientHeartbeat
            ? Number(clientStats.offline_count || 0)
            : Math.max(0, boundDevicesCount - onlineNowCount);
        const healthPct = hasClientHeartbeat
            ? Number(clientStats.fleet_health_percent ?? 100)
            : (boundDevicesCount > 0 ? Math.round(((boundDevicesCount - blockedDevicesCount) / boundDevicesCount) * 100) : 100);

        const unauthorizedAttempts = Number(secStats.unauthorized_key_attempts || 0);

        const statLic = document.getElementById('dash-stat-licenses');
        const subLic = document.getElementById('dash-sub-licenses');
        const licBar = document.getElementById('dash-lic-bar');
        const statDev = document.getElementById('dash-stat-devices');
        const subDev = document.getElementById('dash-sub-devices');
        const statSuccess = document.getElementById('dash-stat-success-rate');
        const subPings = document.getElementById('dash-sub-pings');
        const statFleet = document.getElementById('dash-stat-fleet-health');
        const subFleet = document.getElementById('dash-sub-fleet');
        const statRev = document.getElementById('dash-stat-revoked');
        const subSec = document.getElementById('dash-sub-security');
        const statCli = document.getElementById('dash-stat-clients');
        const subCli = document.getElementById('dash-sub-clients');
        const lastUpdatedEl = document.getElementById('dash-last-updated');

        if (statLic) statLic.textContent = totalLicenses;
        if (subLic) subLic.textContent = `${activeLicenses} active · ${expiringSoonCount} expiring <=30d`;
        if (licBar) {
            const activePct = totalLicenses > 0 ? Math.round((activeLicenses / totalLicenses) * 100) : 0;
            licBar.innerHTML = `<div class="kpi-mini-bar-fill" style="width: ${activePct}%"></div>`;
        }

        if (statDev) statDev.textContent = boundDevicesCount;
        if (subDev) subDev.textContent = `${onlineNowCount} active 15m · ${totalSeatLimit} seats max`;

        if (statSuccess) {
            statSuccess.textContent = `${successRate}%`;
            statSuccess.style.color = successRate >= 90 ? 'var(--emerald)' : successRate >= 70 ? 'var(--amber)' : 'var(--ruby)';
        }
        if (subPings) subPings.textContent = `${totalPings} handshakes (${state.analyticsRange})`;

        if (statFleet) {
            statFleet.textContent = `${healthPct}%`;
            statFleet.style.color = healthPct >= 80 ? 'var(--cobalt)' : healthPct >= 50 ? 'var(--amber)' : 'var(--ruby)';
        }
        if (subFleet) {
            subFleet.textContent = `${healthyCount} healthy · ${delayedCount} delayed · ${offlineCount} offline`;
        }

        if (statRev) statRev.textContent = revokedLicenses + suspendedLicenses + blockedDevicesCount;
        if (subSec) subSec.textContent = `${revokedLicenses} revoked · ${blockedDevicesCount} blocked · ${unauthorizedAttempts} key alerts`;

        if (statCli) statCli.textContent = totalClients;
        if (subCli) subCli.textContent = `${activeClients} active corporate tenants`;

        if (lastUpdatedEl) {
            lastUpdatedEl.textContent = `Synced ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
        }

        renderAnalyticsTimelineSvg(analytics?.timeline || []);
        renderAnalyticsDistribution();
        renderExpiringWatchlist();
        renderClientRoster();
        renderDashboardRecentLogs();
    }

    function renderAnalyticsTimelineSvg(timeline) {
        const host = document.getElementById('dash-timeline-chart');
        if (!host) return;

        if (!Array.isArray(timeline) || timeline.length === 0) {
            host.innerHTML = `
                <div class="table-empty" style="padding: 46px 16px;">
                    <div class="table-empty-text">No heartbeat telemetry in the selected ${escapeHtml(state.analyticsRange)} window</div>
                    <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 4px;">Try switching to 7d / 30d or wait for incoming endpoint handshakes.</div>
                </div>
            `;
            return;
        }

        const width = 680;
        const height = 210;
        const pad = { top: 18, right: 16, bottom: 28, left: 36 };
        const plotW = width - pad.left - pad.right;
        const plotH = height - pad.top - pad.bottom;

        const maxRaw = Math.max(1, ...timeline.map(d => Number(d.total || 0)));
        const yMax = Math.max(4, Math.ceil(maxRaw / 4) * 4);
        const stepW = plotW / timeline.length;
        const barW = Math.max(8, Math.min(34, stepW * 0.62));

        const gridLines = [0, 0.25, 0.5, 0.75, 1].map(ratio => {
            const y = (pad.top + plotH - ratio * plotH).toFixed(1);
            const label = Math.round(yMax * ratio);
            return `
                <line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="rgba(148,163,184,0.12)" stroke-dasharray="3 3" />
                <text x="${pad.left - 8}" y="${Number(y) + 3}" fill="#64748b" font-size="10" text-anchor="end" font-family="monospace">${label}</text>
            `;
        }).join('');

        const bars = timeline.map((pt, idx) => {
            const succ = Number(pt.success ?? pt.successful ?? 0);
            const fail = Number(pt.failed ?? 0);
            const total = Number(pt.total ?? (succ + fail));
            const x = pad.left + idx * stepW + (stepW - barW) / 2;

            const succH = succ > 0 ? Math.max(3, (succ / yMax) * plotH) : 0;
            const failH = fail > 0 ? Math.max(3, (fail / yMax) * plotH) : 0;
            const succY = pad.top + plotH - succH;
            const failY = succY - failH;

            const rawLabel = String(pt.time_bucket || pt.label || '');
            const shortLabel = rawLabel.length > 8 ? rawLabel.slice(0, 8) : rawLabel;
            const showTick = timeline.length <= 12 || idx % Math.ceil(timeline.length / 8) === 0 || idx === timeline.length - 1;

            return `
                <g class="chart-bar-group" data-label="${escapeHtml(rawLabel)}" data-total="${total}" data-succ="${succ}" data-fail="${fail}" style="cursor: pointer;">
                    <rect x="${(pad.left + idx * stepW).toFixed(1)}" y="${pad.top}" width="${stepW.toFixed(1)}" height="${plotH}" fill="transparent" />
                    ${succH > 0 ? `<rect x="${x.toFixed(1)}" y="${succY.toFixed(1)}" width="${barW.toFixed(1)}" height="${succH.toFixed(1)}" rx="2" fill="#22c55e" fill-opacity="0.85" />` : ''}
                    ${failH > 0 ? `<rect x="${x.toFixed(1)}" y="${failY.toFixed(1)}" width="${barW.toFixed(1)}" height="${failH.toFixed(1)}" rx="2" fill="#ef4444" fill-opacity="0.9" />` : ''}
                    ${showTick ? `<text x="${(x + barW / 2).toFixed(1)}" y="${height - 8}" fill="#64748b" font-size="9.5" text-anchor="middle" font-family="monospace">${escapeHtml(shortLabel)}</text>` : ''}
                </g>
            `;
        }).join('');

        host.innerHTML = `
            <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Telemetry timeline chart">
                ${gridLines}
                ${bars}
            </svg>
            <div class="chart-legend">
                <span><span class="chart-legend-dot" style="background:#22c55e;"></span>Authorized Handshakes</span>
                <span><span class="chart-legend-dot" style="background:#ef4444;"></span>Denied / Security Events</span>
            </div>
        `;

        const tooltip = document.getElementById('chart-tooltip');
        host.querySelectorAll('.chart-bar-group').forEach(grp => {
            grp.addEventListener('mousemove', (ev) => {
                if (!tooltip) return;
                const label = grp.getAttribute('data-label');
                const total = grp.getAttribute('data-total');
                const succ = grp.getAttribute('data-succ');
                const fail = grp.getAttribute('data-fail');
                tooltip.innerHTML = `
                    <div style="font-family: var(--font-mono); font-size: 10.5px; color: var(--text-muted); margin-bottom: 4px;">${escapeHtml(label)}</div>
                    <div>Total: <strong>${total}</strong></div>
                    <div style="color: #4ade80;">Allowed: <strong>${succ}</strong></div>
                    <div style="color: #f87171;">Denied: <strong>${fail}</strong></div>
                `;
                tooltip.style.display = 'block';
                tooltip.style.left = `${Math.min(window.innerWidth - 170, ev.clientX + 14)}px`;
                tooltip.style.top = `${Math.max(12, ev.clientY - 56)}px`;
            });
            grp.addEventListener('mouseleave', () => {
                if (tooltip) tooltip.style.display = 'none';
            });
        });
    }

    function renderAnalyticsDistribution() {
        const body = document.getElementById('dash-dist-body');
        if (!body) return;

        const tab = state.distTab || 'platforms';
        document.querySelectorAll('#dash-dist-tabs .mini-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-dist') === tab);
        });

        const analytics = state.analytics || {};
        let rows = [];
        let barClass = '';
        let sourceNote = '';

        if (tab === 'platforms') {
            const rawPlatforms = analytics.platforms || analytics.distributions?.platforms || [];
            rows = rawPlatforms.map(p => ({ label: normalizePlatformLabel(p.platform), count: Number(p.count || 0) }));
            if (rows.length === 0 && Array.isArray(state.globalDevices) && state.globalDevices.length > 0) {
                const counts = {};
                state.globalDevices.forEach(d => {
                    const key = normalizePlatformLabel(d.platform);
                    counts[key] = (counts[key] || 0) + 1;
                });
                rows = Object.entries(counts)
                    .map(([label, count]) => ({ label, count }))
                    .sort((a, b) => b.count - a.count);
                sourceNote = 'Enrolled device fleet breakdown (no ping telemetry in selected window)';
            }
        } else if (tab === 'versions') {
            const rawVersions = analytics.versions || analytics.distributions?.versions || [];
            rows = rawVersions.map(v => {
                const ver = String(v.version || v.app_version || '1.0.0');
                return { label: ver.startsWith('v') ? ver : `v${ver}`, count: Number(v.count || 0) };
            });
            barClass = 'success';
        } else {
            const rawFailures = analytics.failure_breakdown || analytics.distributions?.failure_reasons || [];
            rows = rawFailures.map(f => ({ label: f.reason || 'Denied', count: Number(f.count || 0) }));
            barClass = 'danger';
        }

        if (rows.length === 0) {
            body.innerHTML = `<div class="table-empty" style="padding: 28px 12px;"><div class="table-empty-text">No ${escapeHtml(tab)} telemetry in ${escapeHtml(state.analyticsRange)} window</div></div>`;
            return;
        }

        const total = Math.max(1, rows.reduce((sum, r) => sum + r.count, 0));
        body.innerHTML = rows.slice(0, 6).map(r => {
            const pct = Math.round((r.count / total) * 100);
            return `
                <div class="dist-item">
                    <div class="dist-item-head">
                        <span class="dist-item-label">${escapeHtml(r.label)}</span>
                        <span class="dist-item-val">${r.count} (${pct}%)</span>
                    </div>
                    <div class="dist-bar-track">
                        <div class="dist-bar-fill ${barClass}" style="width: ${pct}%;"></div>
                    </div>
                </div>
            `;
        }).join('') + (sourceNote ? `<div style="font-size: 10.5px; color: var(--text-muted); margin-top: 6px;">${escapeHtml(sourceNote)}</div>` : '');
    }

    function renderExpiringWatchlist() {
        const host = document.getElementById('dash-expiring-list');
        const badge = document.getElementById('dash-expiring-badge');
        if (!host) return;

        const apiExpiring = state.analytics?.expiring_licenses;
        const expiring = Array.isArray(apiExpiring) ? apiExpiring : state.licenses.filter(isLicenseExpiringSoon);

        if (badge) badge.textContent = `${expiring.length} expiring`;

        if (expiring.length === 0) {
            host.innerHTML = `<div class="table-empty" style="padding: 24px 12px;"><div class="table-empty-text">All active licenses have &gt;30 days remaining</div></div>`;
            return;
        }

        host.innerHTML = expiring.slice(0, 5).map(l => {
            const d = parseUTCDate(l.expiry_date);
            const daysLeft = l.days_remaining !== undefined
                ? Number(l.days_remaining)
                : (d ? Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86400000)) : '?');
            return `
                <div class="watchlist-row">
                    <div class="watchlist-row-main">
                        <span class="watchlist-row-title clickable-org" onclick="window.app.openClientDetailModal(${Number(l.client_id)})">${escapeHtml(l.org_name || 'Organization')}</span>
                        <span class="watchlist-row-sub">${escapeHtml(l.license_key)} · ${daysLeft}d remaining</span>
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.extendLicenseDays(${Number(l.id)}, 30)">+30d</button>
                </div>
            `;
        }).join('');
    }

    function renderClientRoster() {
        const host = document.getElementById('dash-client-roster');
        if (!host) return;

        const roster = Array.isArray(state.analytics?.client_roster) && state.analytics.client_roster.length > 0
            ? state.analytics.client_roster
            : (state.clients || []);
        const top = roster.slice(0, 5);
        if (top.length === 0) {
            host.innerHTML = `<div class="table-empty" style="padding: 24px 12px;"><div class="table-empty-text">No registered organizations yet</div></div>`;
            return;
        }

        host.innerHTML = top.map(c => {
            const activeCount = Number(c.active_licenses ?? 0);
            const totalCount = Number(c.total_licenses ?? 0);
            const st = c.health_status
                ? (c.health_status === 'healthy' ? 'active' : c.health_status === 'delayed' ? 'suspended' : 'revoked')
                : (c.client_status || c.status || 'active');
            const label = c.health_label || (c.client_status || c.status || 'active');
            return `
                <div class="watchlist-row">
                    <div class="watchlist-row-main">
                        <span class="watchlist-row-title clickable-org" onclick="window.app.openClientDetailModal(${Number(c.id)})">${escapeHtml(c.org_name)}</span>
                        <span class="watchlist-row-sub">${escapeHtml(c.email || 'No email')} · ${activeCount}/${totalCount} active keys</span>
                    </div>
                    <span class="status-pill ${escapeHtml(st)}" style="font-size: 10.5px;">
                        <span class="indicator-dot"></span>
                        <span>${escapeHtml(label)}</span>
                    </span>
                </div>
            `;
        }).join('');
    }

    function renderDashboardRecentLogs() {
        const tbody = document.getElementById('dash-recent-logs-tbody');
        if (!tbody) return;

        const recent = state.logs.slice(0, 6);
        if (recent.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4">
                        <div class="table-empty" style="padding: 24px 16px;">
                            <div class="table-empty-text">No recent telemetry logs recorded</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = recent.map((log, idx) => {
            const isSuccess = log.status === 'success';
            const logTimestamp = log.created_at || log.timestamp;
            const logAction = log.action_type || log.action || 'ping';
            return `
                <tr style="cursor: pointer;" onclick="window.app.openPayloadInspector(${idx})" title="Inspect telemetry payload">
                    <td>
                        <span style="font-weight: 500; color: var(--text-white);">${escapeHtml(logAction)}</span>
                    </td>
                    <td>
                        <span class="status-pill ${isSuccess ? 'active' : 'revoked'}" style="font-size: 10.5px; padding: 1px 6px;">
                            <span class="indicator-dot"></span>
                            <span>${isSuccess ? 'Allowed' : 'Denied'}</span>
                        </span>
                    </td>
                    <td>
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-size: 12px; color: var(--text-primary);">${escapeHtml(log.org_name || 'Individual')}</span>
                            <span style="font-size: 11px; font-family: var(--font-mono); color: var(--text-muted);">${escapeHtml(log.license_key || '---')}</span>
                        </div>
                    </td>
                    <td>
                        <span style="font-size: 11px; color: var(--text-secondary);">${formatRelative(logTimestamp)}</span>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LICENSES WORKSPACE LOGIC
    // ─────────────────────────────────────────────────────────────────────────
    async function loadLicenses() {
        const res = await apiRequest('/api/license');
        if (res.success && Array.isArray(res.data)) {
            state.licenses = res.data;
            updateLicenseCounters();
            renderLicensesTable();
            updateDashboardMetrics();
        } else {
            const tbody = document.getElementById('licenses-table-body');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7">
                            <div class="table-empty">
                                <div class="table-empty-text" style="color: var(--ruby);">Unable to connect to database</div>
                                <div style="font-size: 11.5px; color: var(--text-muted);">${escapeHtml(res.message || 'Check database connectivity')}</div>
                            </div>
                        </td>
                    </tr>
                `;
            }
        }
    }

    function isLicenseExpiringSoon(l) {
        if (!l || l.status !== 'active' || !l.expiry_date) return false;
        const d = parseUTCDate(l.expiry_date);
        if (!d) return false;
        const days = (d.getTime() - Date.now()) / 86400000;
        return days >= 0 && days <= 30;
    }

    function isLicenseExpired(l) {
        if (!l || !l.expiry_date) return false;
        const d = parseUTCDate(l.expiry_date);
        return Boolean(d && d.getTime() < Date.now());
    }

    function updateLicenseCounters() {
        const total = state.licenses.length;
        const active = state.licenses.filter(l => l.status === 'active').length;
        const expiring = state.licenses.filter(isLicenseExpiringSoon).length;
        const suspended = state.licenses.filter(l => l.status === 'suspended').length;
        const revoked = state.licenses.filter(l => l.status === 'revoked').length;
        const expired = state.licenses.filter(isLicenseExpired).length;

        const countAll = document.getElementById('count-all');
        const countActive = document.getElementById('count-active');
        const countExpiring = document.getElementById('count-expiring');
        const countSuspended = document.getElementById('count-suspended');
        const countRevoked = document.getElementById('count-revoked');
        const countExpired = document.getElementById('count-expired');
        const navCounter = document.getElementById('nav-counter-licenses');

        if (countAll) countAll.textContent = total;
        if (countActive) countActive.textContent = active;
        if (countExpiring) countExpiring.textContent = expiring;
        if (countSuspended) countSuspended.textContent = suspended;
        if (countRevoked) countRevoked.textContent = revoked;
        if (countExpired) countExpired.textContent = expired;
        if (navCounter) navCounter.textContent = active;
    }

    function renderLicensesTable() {
        const tbody = document.getElementById('licenses-table-body');
        const footer = document.getElementById('licenses-table-footer');
        if (!tbody) return;

        let filtered = [...state.licenses];

        if (state.filterStatus === 'expiring') {
            filtered = filtered.filter(isLicenseExpiringSoon);
        } else if (state.filterStatus === 'expired') {
            filtered = filtered.filter(isLicenseExpired);
        } else if (state.filterStatus !== 'all') {
            filtered = filtered.filter(l => l.status === state.filterStatus);
        }

        if (state.searchQuery.trim()) {
            const q = state.searchQuery.toLowerCase().trim();
            filtered = filtered.filter(l => {
                const org = (l.org_name || '').toLowerCase();
                const key = (l.license_key || '').toLowerCase();
                const email = (l.email || '').toLowerCase();
                const hasHwid = Array.isArray(l.hwids) && l.hwids.some(h => (h.hwid || '').toLowerCase().includes(q));
                return org.includes(q) || key.includes(q) || email.includes(q) || hasHwid;
            });
        }

        const sortMode = document.getElementById('license-sort-select')?.value || state.licenseSort || 'newest';
        state.licenseSort = sortMode;
        filtered.sort((a, b) => {
            if (sortMode === 'expiry_asc') {
                return (parseUTCDate(a.expiry_date)?.getTime() || Infinity) - (parseUTCDate(b.expiry_date)?.getTime() || Infinity);
            }
            if (sortMode === 'seats_desc') {
                return Number(b.bound_machines_count || 0) - Number(a.bound_machines_count || 0);
            }
            if (sortMode === 'org_asc') {
                return String(a.org_name || '').localeCompare(String(b.org_name || ''));
            }
            return (parseUTCDate(b.created_at)?.getTime() || Number(b.id || 0)) - (parseUTCDate(a.created_at)?.getTime() || Number(a.id || 0));
        });

        if (footer) {
            footer.textContent = `Showing ${filtered.length} of ${state.licenses.length} licenses`;
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7">
                        <div class="table-empty">
                            <div class="table-empty-text">No licenses match the selected criteria</div>
                            <div style="font-size: 11.5px; color: var(--text-muted);">Adjust search query or filter tags.</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map(l => {
            const hwids = Array.isArray(l.hwids) ? l.hwids : [];
            const boundCount = Number(l.bound_machines_count !== undefined ? l.bound_machines_count : hwids.length);
            const blockedCount = Number(l.blocked_machines_count || 0);
            const maxMachines = Number(l.max_machines || 1);

            let slotsHtml = '';
            for (let i = 0; i < Math.min(maxMachines, 8); i++) {
                if (i < boundCount) {
                    const isSlotBlocked = i < blockedCount;
                    slotsHtml += `<span class="hwid-slot-pip ${isSlotBlocked ? 'blocked' : 'filled'}" title="${isSlotBlocked ? 'Device Blocked' : 'Device Authorized'}"></span>`;
                } else {
                    slotsHtml += `<span class="hwid-slot-pip" title="Available Device Slot"></span>`;
                }
            }
            if (maxMachines > 8) {
                slotsHtml += `<span style="font-size: 10px; color: var(--text-muted); margin-left: 2px;">+${maxMachines - 8}</span>`;
            }

            const statusClass = l.status === 'active' ? 'active' : (l.status === 'suspended' ? 'suspended' : 'revoked');
            const statusLabel = l.status ? l.status.charAt(0).toUpperCase() + l.status.slice(1) : 'Unknown';

            return `
                <tr id="row-license-${l.id}">
                    <td>
                        <div class="cell-client">
                            <span class="client-org-name clickable-org" onclick="window.app.openClientDetailModal(${Number(l.client_id)})" title="Inspect organization overview">${escapeHtml(l.org_name || 'Individual')}</span>
                            <span class="client-subtext">${escapeHtml(l.email || l.contact_name || 'No email')}</span>
                        </div>
                    </td>
                    <td>
                        <div class="key-pill">
                            <span>${escapeHtml(l.license_key)}</span>
                            <button class="btn-copy-inline" title="Copy license key" onclick="window.app.copyKey('${escapeHtml(l.license_key)}', this)">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </button>
                        </div>
                    </td>
                    <td>
                        <span class="status-pill ${statusClass}">
                            <span class="indicator-dot"></span>
                            <span>${statusLabel}</span>
                        </span>
                    </td>
                    <td>
                        <div class="hwid-quota-cell">
                            <div class="hwid-slots">${slotsHtml}</div>
                            <span class="hwid-quota-text">${boundCount}/${maxMachines}</span>
                            <button class="hwid-trigger-btn" onclick="window.app.openHwidModal('${l.id}')">
                                Manage HWIDs
                            </button>
                        </div>
                    </td>
                    <td>
                        <div style="display: flex; flex-direction: column; gap: 1px;">
                            <span style="font-size: 12px; color: var(--text-primary);">${formatDate(l.expiry_date)}</span>
                            <span style="font-size: 11px;">${formatExpiryCountdown(l.expiry_date)}</span>
                        </div>
                    </td>
                    <td>
                        <div style="display: flex; flex-direction: column; gap: 1px;">
                            <span style="font-size: 12px; color: var(--text-primary);">${formatRelative(l.last_validated_at)}</span>
                            <span style="font-size: 10.5px; font-family: var(--font-mono); color: var(--text-muted);">${escapeHtml(l.last_ip || '---')}</span>
                        </div>
                    </td>
                    <td class="align-right">
                        <div class="row-actions">
                            <button class="btn btn-secondary btn-sm" onclick="window.app.extendLicenseDays(${Number(l.id)}, 30)" title="Extend expiration by 30 days">+30d</button>
                            <button class="btn btn-secondary btn-sm" onclick="window.app.openEditLicenseModal('${l.id}')" title="Edit Parameters">
                                Edit
                            </button>
                            ${l.status === 'active' ? `
                                <button class="btn btn-secondary btn-sm" onclick="window.app.updateLicenseStatus('${l.id}', 'suspended')" title="Suspend Access">
                                    Suspend
                                </button>
                                <button class="btn btn-danger btn-sm" onclick="window.app.updateLicenseStatus('${l.id}', 'revoked')" title="Instant Remote Kill-Switch">
                                    Revoke
                                </button>
                            ` : `
                                <button class="btn btn-primary btn-sm" onclick="window.app.updateLicenseStatus('${l.id}', 'active')" title="Re-authorize">
                                    Activate
                                </button>
                            `}
                            <button class="btn btn-danger btn-sm" onclick="window.app.deleteLicense(${Number(l.id)})" title="Delete License Permanently">
                                Delete
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GLOBAL HARDWARE DEVICES FLEET LOGIC
    // ─────────────────────────────────────────────────────────────────────────
    function isDeviceLive(d) {
        if (!d || !d.last_seen_at) return false;
        const dt = parseUTCDate(d.last_seen_at);
        return Boolean(dt && (Date.now() - dt.getTime()) <= 15 * 60 * 1000);
    }

    function isDeviceBlocked(d) {
        return Boolean(d && (d.is_blocked === 1 || d.is_blocked === true || d.is_blocked === '1'));
    }

    function updateDeviceCounters() {
        const all = state.globalDevices || [];
        const blocked = all.filter(isDeviceBlocked).length;
        const authorized = all.length - blocked;
        const live = all.filter(d => !isDeviceBlocked(d) && isDeviceLive(d)).length;
        const awaiting = all.filter(d => !d.last_seen_at).length;

        const counter = document.getElementById('nav-counter-devices');
        const ribbonCounter = document.getElementById('count-global-devices');
        const elAuth = document.getElementById('count-dev-authorized');
        const elBlocked = document.getElementById('count-dev-blocked');
        const elLive = document.getElementById('count-dev-live');
        const elAwait = document.getElementById('count-dev-awaiting');

        if (counter) counter.textContent = all.length;
        if (ribbonCounter) ribbonCounter.textContent = all.length;
        if (elAuth) elAuth.textContent = authorized;
        if (elBlocked) elBlocked.textContent = blocked;
        if (elLive) elLive.textContent = live;
        if (elAwait) elAwait.textContent = awaiting;
    }

    async function loadGlobalDevices() {
        const tbody = document.getElementById('devices-table-body');
        if (!tbody) return;

        const res = await apiRequest('/api/license/hwids/all');
        if (res.success && Array.isArray(res.data)) {
            state.globalDevices = res.data;
            updateDeviceCounters();
            renderGlobalDevicesTable();
            updateDashboardMetrics();
        } else {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8">
                        <div class="table-empty">
                            <div class="table-empty-text">No hardware devices enrolled</div>
                            <div style="font-size: 11.5px; color: var(--text-muted);">Client engines bind automatically via TOFU on first startup.</div>
                        </div>
                    </td>
                </tr>
            `;
        }
    }

    function renderGlobalDevicesTable() {
        const tbody = document.getElementById('devices-table-body');
        const footer = document.getElementById('devices-table-footer');
        if (!tbody) return;

        let filtered = state.globalDevices || [];

        if (state.deviceFilter === 'authorized') {
            filtered = filtered.filter(d => !isDeviceBlocked(d));
        } else if (state.deviceFilter === 'blocked') {
            filtered = filtered.filter(isDeviceBlocked);
        } else if (state.deviceFilter === 'live') {
            filtered = filtered.filter(d => !isDeviceBlocked(d) && isDeviceLive(d));
        } else if (state.deviceFilter === 'awaiting') {
            filtered = filtered.filter(d => !d.last_seen_at);
        }

        const platFilter = document.getElementById('devices-platform-filter')?.value || state.devicePlatformFilter || 'all';
        if (platFilter && platFilter !== 'all') {
            filtered = filtered.filter(d => {
                const p = (d.platform || '').toLowerCase();
                if (platFilter === 'win32') return p.includes('win');
                if (platFilter === 'darwin') return p.includes('darwin') || p.includes('mac');
                if (platFilter === 'linux') return p.includes('linux');
                return p === platFilter;
            });
        }

        if (state.devicesSearchQuery.trim()) {
            const q = state.devicesSearchQuery.toLowerCase().trim();
            filtered = filtered.filter(d => {
                const hwid = (d.hwid || '').toLowerCase();
                const org = (d.org_name || '').toLowerCase();
                const key = (d.license_key || '').toLowerCase();
                const plat = (d.platform || '').toLowerCase();
                return hwid.includes(q) || org.includes(q) || key.includes(q) || plat.includes(q);
            });
        }

        if (footer) {
            footer.textContent = `Showing ${filtered.length} of ${state.globalDevices.length} hardware devices`;
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8">
                        <div class="table-empty">
                            <div class="table-empty-text">No devices match filter criteria</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map(d => {
            const isBlocked = isDeviceBlocked(d);
            const platRaw = (d.platform || '').toLowerCase();
            const platformName = platRaw.includes('linux') ? 'Linux' : (platRaw.includes('darwin') || platRaw.includes('mac') ? 'macOS' : platRaw.includes('manual') ? 'Manual' : 'Windows');
            return `
                <tr>
                    <td>
                        <span style="font-weight: 500; font-size: 12px; color: var(--text-primary);">${platformName}</span>
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span class="key-pill" style="font-size: 11.5px; max-width: 270px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(d.hwid)}">${escapeHtml(d.hwid)}</span>
                            <button class="btn-copy-inline" onclick="window.app.copyKey('${escapeHtml(d.hwid)}', this)" title="Copy HWID">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </button>
                        </div>
                    </td>
                    <td>
                        <span class="key-pill" style="font-size: 11px;">${escapeHtml(d.license_key || '---')}</span>
                    </td>
                    <td>
                        <span style="font-size: 12.5px; color: var(--text-white); font-weight: 500;">${escapeHtml(d.org_name || 'Individual')}</span>
                    </td>
                    <td>
                        <span style="font-size: 11.5px; color: var(--text-secondary);" title="${formatDate(d.first_seen_at || d.created_at)}">${formatDate(d.first_seen_at || d.created_at)}</span>
                    </td>
                    <td>
                        ${formatLastSeenBadge(d.last_seen_at)}
                    </td>
                    <td>
                        <span class="status-pill ${isBlocked ? 'revoked' : 'active'}" style="font-size: 11px; padding: 2px 8px; font-weight: 600;">
                            <span class="indicator-dot"></span>
                            <span>${isBlocked ? 'Blocked' : 'Authorized'}</span>
                        </span>
                    </td>
                    <td class="align-right">
                        <div class="row-actions">
                            <button class="btn ${isBlocked ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="window.app.toggleHwidBlock('${d.license_id}', '${escapeHtml(d.hwid)}', ${!isBlocked})">
                                ${isBlocked ? 'Unblock' : 'Block'}
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="window.app.removeHwid('${d.license_id}', '${escapeHtml(d.hwid)}')">
                                Unbind
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HWID MODAL MANAGEMENT
    // ─────────────────────────────────────────────────────────────────────────
    async function openHwidModal(licenseId) {
        const license = state.licenses.find(l => l.id === licenseId);
        if (!license) return;
        state.currentHwidLicense = license;

        const modal = document.getElementById('modal-hwid-manager');
        const keyLabel = document.getElementById('hwid-modal-key');
        const orgLabel = document.getElementById('hwid-modal-org');
        const quotaInput = document.getElementById('hwid-quota-input');

        if (keyLabel) keyLabel.textContent = license.license_key;
        if (orgLabel) orgLabel.textContent = license.org_name || 'Individual';
        if (quotaInput) quotaInput.value = license.max_machines || 1;

        await loadHwidsForModal(licenseId);
        if (modal) modal.classList.add('open');
    }

    async function loadHwidsForModal(licenseId) {
        const tbody = document.getElementById('hwid-list-tbody');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="table-empty">
                        <div class="table-empty-text">Loading bound devices...</div>
                    </div>
                </td>
            </tr>
        `;

        const res = await apiRequest(`/api/license/${licenseId}/hwids`);
        if (res.success && Array.isArray(res.data)) {
            const hwids = res.data;
            if (hwids.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6">
                            <div class="table-empty">
                                <div class="table-empty-text">No hardware devices bound yet.</div>
                                <div style="font-size: 11.5px; color: var(--text-muted);">The machine will auto-bind via TOFU on first client startup.</div>
                            </div>
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = hwids.map(h => {
                const isBlocked = Boolean(h.is_blocked === 1 || h.is_blocked === true || h.is_blocked === '1');
                const platformName = h.platform === 'linux' ? 'Linux' : (h.platform === 'darwin' ? 'macOS' : 'Windows');
                return `
                    <tr>
                        <td>
                            <span style="font-size: 12px; color: var(--text-primary); font-weight: 500;">${platformName}</span>
                        </td>
                        <td>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span class="key-pill" style="font-size: 11.5px; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(h.hwid)}">${escapeHtml(h.hwid)}</span>
                                <button class="btn-copy-inline" onclick="window.app.copyKey('${escapeHtml(h.hwid)}', this)" title="Copy HWID">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                </button>
                            </div>
                        </td>
                        <td>
                            <span style="font-size: 11.5px; color: var(--text-secondary);" title="${formatDate(h.first_seen_at || h.created_at)}">${formatDate(h.first_seen_at || h.created_at)}</span>
                        </td>
                        <td>
                            ${formatLastSeenBadge(h.last_seen_at)}
                        </td>
                        <td>
                            <span class="status-pill ${isBlocked ? 'revoked' : 'active'}" style="font-size: 11px; padding: 2px 8px; font-weight: 600;">
                                <span class="indicator-dot"></span>
                                <span>${isBlocked ? 'Blocked' : 'Authorized'}</span>
                            </span>
                        </td>
                        <td class="align-right">
                            <div class="row-actions">
                                <button class="btn ${isBlocked ? 'btn-primary' : 'btn-secondary'} btn-sm" onclick="window.app.toggleHwidBlock('${licenseId}', '${escapeHtml(h.hwid)}', ${!isBlocked})">
                                    ${isBlocked ? 'Unblock' : 'Block'}
                                </button>
                                <button class="btn btn-danger btn-sm" onclick="window.app.removeHwid('${licenseId}', '${escapeHtml(h.hwid)}')">
                                    Unbind
                                </button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }

    async function updateHwidQuota() {
        if (!state.currentHwidLicense) return;
        const input = document.getElementById('hwid-quota-input');
        const maxMachines = parseInt(input.value, 10);
        if (isNaN(maxMachines) || maxMachines < 1) {
            showToast('Enter a valid quota number (>= 1)', 'error');
            return;
        }

        const res = await apiRequest(`/api/license/${state.currentHwidLicense.id}/max-machines`, 'PATCH', { max_machines: maxMachines });
        if (res.success) {
            showToast(`Quota updated to ${maxMachines} machine(s)`, 'success');
            await loadLicenses();
            loadGlobalDevices();
        } else {
            showToast(res.message || 'Failed to update quota', 'error');
        }
    }

    async function toggleHwidBlock(licenseId, hwid, block) {
        const res = await apiRequest(`/api/license/${licenseId}/hwids/${encodeURIComponent(hwid)}/block`, 'PATCH', { blocked: block, is_blocked: block });
        if (res.success) {
            showToast(`Hardware ID ${block ? 'blocked' : 'unblocked'}`, 'success');
            await loadHwidsForModal(licenseId);
            await loadLicenses();
            loadGlobalDevices();
        } else {
            showToast(res.message || 'Failed to update hardware status', 'error');
        }
    }

    async function removeHwid(licenseId, hwid) {
        const ok = await showConfirmModal('Unbind Hardware Device', `Unbind device ${hwid}?\n\nThe machine will immediately lose active seat authorization.`);
        if (!ok) return;
        const res = await apiRequest(`/api/license/${licenseId}/hwids/${encodeURIComponent(hwid)}`, 'DELETE');
        if (res.success) {
            showToast('Hardware device unpinned', 'success');
            await loadHwidsForModal(licenseId);
            await loadLicenses();
            loadGlobalDevices();
        } else {
            showToast(res.message || 'Failed to unbind hardware', 'error');
        }
    }

    async function resetAllHwids() {
        if (!state.currentHwidLicense) return;
        const ok = await showConfirmModal(
            'Reset All Hardware Bindings',
            `Reset all hardware bindings for license ${state.currentHwidLicense.license_key}?\n\nAll currently bound machines will be detached and must re-bind via TOFU.`
        );
        if (!ok) return;

        const res = await apiRequest(`/api/license/${state.currentHwidLicense.id}/hwids`, 'DELETE');
        if (res.success) {
            showToast('All hardware bindings cleared', 'success');
            await loadHwidsForModal(state.currentHwidLicense.id);
            await loadLicenses();
            loadGlobalDevices();
        } else {
            showToast(res.message || 'Failed to reset bindings', 'error');
        }
    }

    async function addManualHwid() {
        if (!state.currentHwidLicense) return;
        const input = document.getElementById('hwid-manual-input');
        const hwid = (input?.value || '').trim();
        if (!hwid) {
            showToast('Enter a hardware ID string', 'error');
            return;
        }

        const res = await apiRequest(`/api/license/${state.currentHwidLicense.id}/hwids`, 'POST', {
            hwid,
            platform: 'manual',
            label: 'Manually Whitelisted Machine'
        });

        if (res.success) {
            showToast('Hardware ID authorized', 'success');
            input.value = '';
            await loadHwidsForModal(state.currentHwidLicense.id);
            await loadLicenses();
            loadGlobalDevices();
        } else {
            showToast(res.message || 'Failed to whitelist hardware ID', 'error');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LICENSE MUTATION
    // ─────────────────────────────────────────────────────────────────────────
    async function updateLicenseStatus(licenseId, newStatus) {
        if (newStatus === 'revoked') {
            const ok = await showConfirmModal(
                'Engage Remote Kill-Switch',
                'Client engines running this license will print ACCESS DENIED, purge local cache, and terminate immediately.'
            );
            if (!ok) return;
        }

        const res = await apiRequest(`/api/license/${licenseId}/status`, 'PATCH', { status: newStatus });
        if (res.success) {
            showToast(`License operational status set to ${newStatus}`, 'success');
            await loadLicenses();
            loadAnalytics();
        } else {
            showToast(res.message || `Failed to update status`, 'error');
        }
    }

    async function extendLicenseDays(licenseId, daysToAdd) {
        const license = state.licenses.find(l => Number(l.id) === Number(licenseId));
        if (!license) return;
        const baseTime = Math.max(Date.now(), parseUTCDate(license.expiry_date)?.getTime() || Date.now());
        const nextExpiry = new Date(baseTime + Number(daysToAdd || 30) * 86400000);
        const res = await apiRequest(`/api/license/${licenseId}`, 'PUT', {
            expiry_date: nextExpiry.toISOString(),
            status: license.status === 'expired' ? 'active' : license.status
        });
        if (res.success) {
            showToast(`Extended license ${license.license_key} by +${daysToAdd} days`, 'success');
            await loadLicenses();
            loadAnalytics();
        } else {
            showToast(res.message || 'Failed to extend license', 'error');
        }
    }

    async function deleteLicense(licenseId) {
        const license = state.licenses.find(l => Number(l.id) === Number(licenseId));
        const label = license ? license.license_key : `#${licenseId}`;
        const ok = await showConfirmModal(
            'Delete License Permanently',
            `Permanently delete license ${label} and all bound HWIDs?\n\nThis action cannot be undone.`
        );
        if (!ok) return;
        const res = await apiRequest(`/api/license/${licenseId}`, 'DELETE');
        if (res.success) {
            showToast(`Deleted license ${label}`, 'success');
            await loadLicenses();
            loadGlobalDevices();
            loadAnalytics();
        } else {
            showToast(res.message || 'Failed to delete license', 'error');
        }
    }

    function openIssueModal(preselectedClientId) {
        const modal = document.getElementById('modal-issue-license');
        const select = document.getElementById('issue-client-id');
        if (select) {
            select.innerHTML = '<option value="">Select organization...</option>' +
                state.clients.map(c => `<option value="${c.id}">${escapeHtml(c.org_name)} (${escapeHtml(c.email)})</option>`).join('');
            if (preselectedClientId) {
                select.value = String(preselectedClientId);
            }
        }
        if (modal) modal.classList.add('open');
    }

    function openIssueModalForClient(clientId) {
        closeModals();
        openIssueModal(clientId);
    }

    function openEditLicenseModal(licenseId) {
        const license = state.licenses.find(l => l.id === licenseId);
        if (!license) return;

        const modal = document.getElementById('modal-edit-license');
        document.getElementById('edit-license-id').value = license.id;
        document.getElementById('edit-license-key').value = license.license_key;
        document.getElementById('edit-max-machines').value = license.max_machines || 1;
        document.getElementById('edit-license-status').value = license.status || 'active';

        if (license.expiry_date) {
            const dateObj = new Date(license.expiry_date);
            const tzOffset = dateObj.getTimezoneOffset() * 60000;
            const localISOTime = (new Date(dateObj.getTime() - tzOffset)).toISOString().slice(0, 16);
            document.getElementById('edit-expiry-date').value = localISOTime;
        }

        if (modal) modal.classList.add('open');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TELEMETRY & AUDIT STREAM
    // ─────────────────────────────────────────────────────────────────────────
    async function loadLogs() {
        const tbody = document.getElementById('logs-table-body');
        if (!tbody) return;

        const actionFilter = document.getElementById('log-action-filter')?.value || state.telemetryActionFilter || 'all';
        state.telemetryActionFilter = actionFilter;
        const url = actionFilter && actionFilter !== 'all'
            ? `/api/analytics/logs?limit=200&action_type=${encodeURIComponent(actionFilter)}`
            : '/api/analytics/logs?limit=200';

        const res = await apiRequest(url);
        if (res.success && Array.isArray(res.data)) {
            state.logs = res.data;
            renderLogsTable();
            renderDashboardRecentLogs();
        }
    }

    function toggleTelemetryTail() {
        state.telemetryTailActive = !state.telemetryTailActive;
        const btn = document.getElementById('btn-toggle-live-tail');
        if (btn) btn.classList.toggle('active', state.telemetryTailActive);

        if (state.telemetryTailTimer) {
            clearInterval(state.telemetryTailTimer);
            state.telemetryTailTimer = null;
        }

        if (state.telemetryTailActive) {
            loadLogs();
            state.telemetryTailTimer = setInterval(() => {
                if (state.currentTab === 'telemetry') loadLogs();
            }, 10000);
            showToast('Live telemetry tail enabled (10s polling)', 'info');
        } else {
            showToast('Live telemetry tail paused', 'info');
        }
    }

    async function downloadAuthorizedCsv(endpoint, defaultFilename) {
        const token = getAuthToken();
        if (!token) {
            showToast('Session expired. Please log in again.', 'error');
            return;
        }
        try {
            const res = await fetch(endpoint, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                showToast(`CSV export failed (HTTP ${res.status})`, 'error');
                return;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = defaultFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast(`Exported ${defaultFilename}`, 'success');
        } catch (err) {
            showToast('CSV download failed', 'error');
        }
    }

    function exportTelemetryCsv() {
        downloadAuthorizedCsv('/api/analytics/export/telemetry', `cortex-telemetry-${new Date().toISOString().slice(0, 10)}.csv`);
    }

    function exportLicensesCsv() {
        downloadAuthorizedCsv('/api/analytics/export/licenses', `cortex-licenses-${new Date().toISOString().slice(0, 10)}.csv`);
    }

    function renderLogsTable() {
        const tbody = document.getElementById('logs-table-body');
        const footer = document.getElementById('telemetry-table-footer');
        const countBadge = document.getElementById('count-telemetry-total');
        if (!tbody) return;

        let filtered = state.logs || [];
        const statusFilter = document.getElementById('log-status-filter')?.value;
        const actionFilter = document.getElementById('log-action-filter')?.value;
        const searchInput = document.getElementById('log-search-input')?.value.toLowerCase().trim();

        if (actionFilter && actionFilter !== 'all') {
            filtered = filtered.filter(l => (l.action_type || l.action || '') === actionFilter);
        }

        if (statusFilter && statusFilter !== 'all') {
            filtered = filtered.filter(l => l.status === statusFilter);
        }

        if (searchInput) {
            filtered = filtered.filter(l => {
                const key = (l.license_key || '').toLowerCase();
                const reason = (getLogReason(l) || '').toLowerCase();
                const ip = (l.ip_address || '').toLowerCase();
                const org = (l.org_name || '').toLowerCase();
                const action = (l.action_type || l.action || '').toLowerCase();
                return key.includes(searchInput) || reason.includes(searchInput) || ip.includes(searchInput) || org.includes(searchInput) || action.includes(searchInput);
            });
        }

        if (countBadge) countBadge.textContent = `${filtered.length} events`;
        if (footer) footer.textContent = `Showing ${filtered.length} of ${state.logs.length} telemetry events`;

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8">
                        <div class="table-empty">
                            <div class="table-empty-text">No telemetry audit events recorded</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map((log, idx) => {
            const isSuccess = log.status === 'success';
            const logTimestamp = log.created_at || log.timestamp;
            const logAction = log.action_type || log.action || 'ping';
            const logReason = getLogReason(log);
            const inspectKey = log.id !== undefined && log.id !== null ? `'${log.id}'` : String(idx);

            return `
                <tr>
                    <td>
                        <span style="font-size: 11.5px; font-family: var(--font-mono); color: var(--text-secondary);">${formatDate(logTimestamp)}</span>
                    </td>
                    <td>
                        <span style="font-size: 12px; font-weight: 500; color: var(--text-white);">${escapeHtml(logAction)}</span>
                    </td>
                    <td>
                        <span class="status-pill ${isSuccess ? 'active' : 'revoked'}" style="font-size: 10.5px; padding: 1px 6px;">
                            <span class="indicator-dot"></span>
                            <span>${isSuccess ? 'Allowed' : 'Denied'}</span>
                        </span>
                    </td>
                    <td>
                        <span style="font-size: 12px; color: var(--text-white); font-weight: 500;">${escapeHtml(log.org_name || 'Individual')}</span>
                    </td>
                    <td>
                        <span class="key-pill" style="font-size: 11px;">${escapeHtml(log.license_key || '---')}</span>
                    </td>
                    <td>
                        <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">${escapeHtml(log.ip_address || '---')}</span>
                    </td>
                    <td>
                        <span style="font-size: 11.5px; color: ${isSuccess ? 'var(--text-secondary)' : 'var(--ruby)'};">${escapeHtml(logReason)}</span>
                    </td>
                    <td class="align-right">
                        <button class="btn btn-secondary btn-sm" onclick="window.app.inspectLogPayload(${inspectKey})">
                            Inspect
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function getLogReason(log) {
        if (!log) return '';
        if (log.reason) return log.reason;
        if (log.metadata) {
            let meta = log.metadata;
            if (typeof meta === 'string') {
                try { meta = JSON.parse(meta); } catch (_) {}
            }
            if (meta && typeof meta === 'object') {
                return meta.reason || meta.error || meta.status_detail || (log.status === 'success' ? 'Telemetry validation OK' : 'Verification denied');
            }
        }
        return log.status === 'success' ? 'Telemetry validation OK' : 'Verification denied';
    }

    function openPayloadInspector(indexOrId) {
        let log = state.logs[indexOrId];
        if (!log) {
            log = state.logs.find(l => String(l.id) === String(indexOrId));
        }
        if (!log) return;
        const modal = document.getElementById('modal-log-payload');
        const pre = document.getElementById('log-json-modal-content');
        if (pre) {
            let payloadObj = log.metadata || log.request_payload;
            if (typeof payloadObj === 'string') {
                try { payloadObj = JSON.parse(payloadObj); } catch (_) {}
            }
            pre.textContent = JSON.stringify({ ...log, parsed_metadata: payloadObj || null }, null, 2);
        }
        if (modal) modal.classList.add('open');
    }

    function inspectLogPayload(logId) {
        openPayloadInspector(logId);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CLIENT DIRECTORY & 360 ORGANIZATION VIEW
    // ─────────────────────────────────────────────────────────────────────────
    function updateClientCounters() {
        const all = state.clients || [];
        const active = all.filter(c => c.status === 'active').length;
        const suspended = all.filter(c => c.status === 'suspended').length;
        const inactive = all.filter(c => c.status === 'inactive').length;

        const navCli = document.getElementById('nav-counter-clients');
        const elAll = document.getElementById('count-clients-all');
        const elAct = document.getElementById('count-clients-active');
        const elSus = document.getElementById('count-clients-suspended');
        const elInact = document.getElementById('count-clients-inactive');

        if (navCli) navCli.textContent = all.length;
        if (elAll) elAll.textContent = all.length;
        if (elAct) elAct.textContent = active;
        if (elSus) elSus.textContent = suspended;
        if (elInact) elInact.textContent = inactive;
    }

    async function loadClients() {
        const res = await apiRequest('/api/clients');
        if (res.success && Array.isArray(res.data)) {
            state.clients = res.data;
            updateClientCounters();
            renderClientsTable();
            updateDashboardMetrics();
            populateSupportClientPicker();
        }
    }

    function renderClientsTable() {
        const tbody = document.getElementById('clients-table-body');
        const footer = document.getElementById('clients-table-footer');
        if (!tbody) return;

        let filtered = state.clients || [];
        const statusFilter = state.clientFilter || 'all';
        const searchInput = document.getElementById('client-search-input')?.value.toLowerCase().trim();

        if (statusFilter && statusFilter !== 'all') {
            filtered = filtered.filter(c => c.status === statusFilter);
        }

        if (searchInput) {
            filtered = filtered.filter(c => {
                const org = (c.org_name || '').toLowerCase();
                const email = (c.email || '').toLowerCase();
                const contact = (c.contact_name || '').toLowerCase();
                return org.includes(searchInput) || email.includes(searchInput) || contact.includes(searchInput);
            });
        }

        if (footer) {
            footer.textContent = `Showing ${filtered.length} of ${state.clients.length} client organizations`;
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8">
                        <div class="table-empty">
                            <div class="table-empty-text">No client organizations found</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map(c => {
            const activeLic = Number(c.active_licenses ?? 0);
            const totalLic = Number(c.total_licenses ?? 0);
            const nextStatus = c.status === 'active' ? 'suspended' : 'active';
            return `
            <tr>
                <td>
                    <span class="clickable-org" style="font-size: 13px; font-weight: 600;" onclick="window.app.openClientDetailModal(${Number(c.id)})">${escapeHtml(c.org_name)}</span>
                </td>
                <td>
                    <span style="font-size: 12.5px; color: var(--text-primary);">${escapeHtml(c.contact_name)}</span>
                </td>
                <td>
                    <span style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(c.email)}</span>
                </td>
                <td>
                    <span style="font-size: 12px; color: var(--text-muted); font-family: var(--font-mono);">${escapeHtml(c.phone || '---')}</span>
                </td>
                <td>
                    <span class="badge-metric">${activeLic}/${totalLic} active</span>
                </td>
                <td>
                    <span class="status-pill ${c.status === 'active' ? 'active' : (c.status === 'suspended' ? 'suspended' : 'revoked')}" style="font-size: 10.5px; padding: 1px 6px;">
                        <span class="indicator-dot"></span>
                        <span>${c.status ? c.status.charAt(0).toUpperCase() + c.status.slice(1) : 'Active'}</span>
                    </span>
                </td>
                <td>
                    <span style="font-size: 11.5px; color: var(--text-muted);">${formatDate(c.created_at)}</span>
                </td>
                <td class="align-right">
                    <div class="row-actions">
                        <button class="btn btn-secondary btn-sm" onclick="window.app.openClientDetailModal(${Number(c.id)})">Inspect</button>
                        <button class="btn btn-secondary btn-sm" onclick="window.app.openIssueModalForClient(${Number(c.id)})">+ Key</button>
                        <button class="btn btn-secondary btn-sm" onclick="window.app.openEditClientModal('${c.id}')">Edit</button>
                        <button class="btn btn-secondary btn-sm" onclick="window.app.toggleClientStatus(${Number(c.id)}, '${nextStatus}')">${c.status === 'active' ? 'Suspend' : 'Activate'}</button>
                        <button class="btn btn-danger btn-sm" onclick="window.app.deleteClient(${Number(c.id)})">Delete</button>
                    </div>
                </td>
            </tr>
        `;
        }).join('');
    }

    async function openClientDetailModal(clientId) {
        if (!clientId) return;
        const modal = document.getElementById('modal-client-detail');
        const orgEl = document.getElementById('client-detail-org');
        const subEl = document.getElementById('client-detail-sub');
        const bodyEl = document.getElementById('client-detail-body');
        const btnIssue = document.getElementById('btn-client-detail-issue');
        const btnEmail = document.getElementById('btn-client-detail-email');
        if (!modal || !bodyEl) return;

        if (orgEl) orgEl.textContent = 'Loading Organization...';
        if (subEl) subEl.textContent = 'Fetching live licenses and OAuth connectors...';
        bodyEl.innerHTML = '<div class="table-empty"><div class="table-empty-text">Loading tenant profile...</div></div>';
        modal.classList.add('open');

        const res = await apiRequest(`/api/clients/${clientId}`);
        if (!res.success || !res.data) {
            bodyEl.innerHTML = `<div class="table-empty"><div class="table-empty-text" style="color: var(--ruby);">${escapeHtml(res.message || 'Failed to load client details')}</div></div>`;
            return;
        }

        const client = res.data;
        const licenses = Array.isArray(client.licenses) ? client.licenses : [];
        const connectors = Array.isArray(client.connectors) ? client.connectors : [];
        const activeCount = licenses.filter(l => l.status === 'active').length;
        const connectedCount = connectors.filter(cn => cn.status === 'connected' || cn.is_connected).length;

        if (orgEl) orgEl.textContent = client.org_name || 'Organization';
        if (subEl) subEl.textContent = `${client.contact_name || 'Contact'} • ${client.email || 'No email'} • Status: ${(client.status || 'active').toUpperCase()}`;

        if (btnIssue) {
            btnIssue.onclick = () => openIssueModalForClient(client.id);
        }
        if (btnEmail) {
            btnEmail.onclick = () => {
                closeModals();
                switchTab('support-mail');
                const toInput = document.getElementById('supp-to-input');
                if (toInput && client.email) toInput.value = client.email;
            };
        }

        bodyEl.innerHTML = `
            <div class="client-detail-grid">
                <div class="client-detail-stat">
                    <div class="client-detail-stat-label">Total Licenses</div>
                    <div class="client-detail-stat-val">${licenses.length}</div>
                </div>
                <div class="client-detail-stat">
                    <div class="client-detail-stat-label">Active Keys</div>
                    <div class="client-detail-stat-val" style="color: var(--emerald);">${activeCount}</div>
                </div>
                <div class="client-detail-stat">
                    <div class="client-detail-stat-label">OAuth Connectors</div>
                    <div class="client-detail-stat-val">${connectors.length} (${connectedCount} live)</div>
                </div>
                <div class="client-detail-stat">
                    <div class="client-detail-stat-label">Phone</div>
                    <div class="client-detail-stat-val" style="font-size: 13px; font-family: var(--font-mono);">${escapeHtml(client.phone || '---')}</div>
                </div>
            </div>
            <div>
                <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 8px;">Provisioned Licenses (${licenses.length})</div>
                ${licenses.length === 0 ? '<div style="font-size: 12px; color: var(--text-muted);">No licenses issued for this tenant yet.</div>' : `
                    <div style="display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow-y: auto;">
                        ${licenses.map(l => `
                            <div class="watchlist-row">
                                <div class="watchlist-row-main">
                                    <span class="watchlist-row-title font-mono">${escapeHtml(l.license_key)}</span>
                                    <span class="watchlist-row-sub">Seats: ${l.max_machines || 1} • Expires: ${formatDate(l.expiry_date)}</span>
                                </div>
                                <span class="status-pill ${l.status === 'active' ? 'active' : (l.status === 'suspended' ? 'suspended' : 'revoked')}" style="font-size: 10.5px;">${escapeHtml(l.status)}</span>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
            <div style="margin-top: 8px;">
                <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); margin-bottom: 8px;">Cloud OAuth Connectors (${connectors.length})</div>
                ${connectors.length === 0 ? '<div style="font-size: 12px; color: var(--text-muted);">No OAuth connectors linked by this client.</div>' : `
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${connectors.map(cn => `
                            <span class="badge-metric">${escapeHtml(cn.provider || cn.connector_name || 'OAuth')}: ${escapeHtml(cn.account_email || cn.status || 'Linked')}</span>
                        `).join('')}
                    </div>
                `}
            </div>
        `;
    }

    async function toggleClientStatus(clientId, nextStatus) {
        const res = await apiRequest(`/api/clients/${clientId}/status`, 'PATCH', { status: nextStatus });
        if (res.success) {
            showToast(`Client status set to ${nextStatus}`, 'success');
            await loadClients();
        } else {
            showToast(res.message || 'Failed to update client status', 'error');
        }
    }

    async function deleteClient(clientId) {
        const client = state.clients.find(c => Number(c.id) === Number(clientId));
        const ok = await showConfirmModal(
            'Delete Client Organization',
            `Permanently remove "${client?.org_name || clientId}" and its associated records?\n\nThis action cannot be undone.`
        );
        if (!ok) return;
        const res = await apiRequest(`/api/clients/${clientId}`, 'DELETE');
        if (res.success) {
            showToast('Organization removed', 'success');
            await loadClients();
            await loadLicenses();
        } else {
            showToast(res.message || 'Failed to delete client', 'error');
        }
    }

    function openEditClientModal(clientId) {
        const client = state.clients.find(c => c.id === clientId);
        if (!client) return;

        const modal = document.getElementById('modal-edit-client');
        document.getElementById('edit-client-id').value = client.id;
        document.getElementById('edit-client-org').value = client.org_name;
        document.getElementById('edit-client-contact').value = client.contact_name;
        document.getElementById('edit-client-email').value = client.email;
        document.getElementById('edit-client-phone').value = client.phone || '';
        document.getElementById('edit-client-status').value = client.status || 'active';

        if (modal) modal.classList.add('open');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RESEND EMAIL INTEGRATION: BROADCASTS & SUPPORT 1-TO-1 (Zero-DB Direct)
    // ─────────────────────────────────────────────────────────────────────────

    async function checkResendStatus() {
        try {
            const res = await apiRequest('/api/email/status');
            if (res.success && res.data) {
                state.resendConfig = res.data;
                const banner = document.getElementById('resend-api-banner');
                const title = document.getElementById('resend-banner-title');
                const desc = document.getElementById('resend-banner-desc');
                const isLive = Boolean(res.data.configured && res.data.valid);

                ['bcast-resend-status-pill', 'supp-resend-status-pill'].forEach(pillId => {
                    const pill = document.getElementById(pillId);
                    if (!pill) return;
                    pill.classList.toggle('connected', isLive);
                    pill.classList.toggle('offline', !isLive);
                });

                if (banner) {
                    if (!res.data.configured) {
                        banner.style.display = 'flex';
                        if (title) title.textContent = 'Resend API Key Missing';
                        if (desc) desc.innerHTML = 'Add <code>RESEND_API_KEY=re_...</code> in your <code>.env</code> file to enable email dispatch.';
                    } else if (!res.data.valid) {
                        banner.style.display = 'flex';
                        if (title) title.textContent = 'Resend API Authentication Failed';
                        if (desc) desc.innerHTML = `Error from Resend: ${escapeHtml(res.data.error || 'Invalid API Key')}. Verify your API key at resend.com.`;
                    } else {
                        banner.style.display = 'none';
                    }
                }
            }
        } catch (err) {
            console.error('Failed to check Resend status:', err);
        }
    }

    // --- AUDIENCE & CONTACTS MANAGEMENT ---

    async function loadAudiences() {
        const selectAudience = document.getElementById('bcast-audience-select');
        const selectCompose = document.getElementById('bcast-compose-audience');

        try {
            const res = await apiRequest('/api/email/segments');
            if (res.success && Array.isArray(res.data)) {
                state.audiences = res.data;

                let optionsHtml = '';
                if (state.audiences.length === 0) {
                    optionsHtml = '<option value="">No audiences found (Click "+ New Audience")</option>';
                } else {
                    optionsHtml = state.audiences.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.name || 'Unnamed Audience')}</option>`).join('');
                }

                if (selectAudience) selectAudience.innerHTML = optionsHtml;
                if (selectCompose) selectCompose.innerHTML = '<option value="">Select target audience...</option>' + optionsHtml;

                if (state.audiences.length > 0) {
                    if (!state.currentAudienceId || !state.audiences.some(a => a.id === state.currentAudienceId)) {
                        state.currentAudienceId = state.audiences[0].id;
                    }
                    if (selectAudience) selectAudience.value = state.currentAudienceId;
                    if (selectCompose) selectCompose.value = state.currentAudienceId;
                    updateAudienceMetrics();
                    await loadContacts(state.currentAudienceId);
                } else {
                    state.currentAudienceId = '';
                    updateAudienceMetrics();
                    state.contacts = [];
                    renderContactsTable();
                }
            } else {
                if (selectAudience) selectAudience.innerHTML = '<option value="">Failed to connect to Resend</option>';
            }
        } catch (err) {
            console.error('Failed to load audiences from Resend:', err);
        }
    }

    function updateAudienceMetrics() {
        const idEl = document.getElementById('bcast-metric-id');
        const countEl = document.getElementById('bcast-metric-count');
        const subEl = document.getElementById('bcast-metric-subscribed');
        const subscribedCount = (state.contacts || []).filter(c => !c.unsubscribed).length;
        if (idEl) idEl.textContent = state.currentAudienceId || '---';
        if (countEl) countEl.textContent = state.contacts.length;
        if (subEl) subEl.textContent = subscribedCount;
    }

    async function syncClientsToAudience() {
        if (!state.currentAudienceId) {
            showToast('Select or create a Resend audience first', 'error');
            return;
        }
        const existingEmails = new Set((state.contacts || []).map(c => String(c.email || '').toLowerCase()));
        const candidates = (state.clients || [])
            .filter(c => c.status === 'active' && c.email && c.email.includes('@'))
            .filter(c => !existingEmails.has(String(c.email).toLowerCase()))
            .map(c => {
                const parts = String(c.contact_name || c.org_name || '').trim().split(/\s+/);
                return {
                    email: c.email.trim(),
                    first_name: parts[0] || c.org_name || 'Partner',
                    last_name: parts.slice(1).join(' ') || ''
                };
            });

        if (candidates.length === 0) {
            showToast('All active Cortex clients are already in this audience', 'info');
            return;
        }

        const ok = await showConfirmModal(
            'Sync Clients to Resend Audience',
            `Import ${candidates.length} active client email(s) from your Clients directory into the selected Resend audience?`
        );
        if (!ok) return;

        const res = await apiRequest('/api/email/contacts/import-csv', 'POST', {
            segmentId: state.currentAudienceId,
            contacts: candidates
        });
        if (res.success) {
            showToast(`Synced ${candidates.length} client contact(s) to Resend`, 'success');
            await loadContacts(state.currentAudienceId);
        } else {
            showToast(res.message || 'Failed to sync clients to audience', 'error');
        }
    }

    async function loadContacts(audienceId) {
        if (!audienceId) {
            state.contacts = [];
            renderContactsTable();
            updateAudienceMetrics();
            return;
        }

        try {
            const res = await apiRequest(`/api/email/contacts?segmentId=${encodeURIComponent(audienceId)}`);
            if (res.success && Array.isArray(res.data)) {
                state.contacts = res.data;
            } else {
                state.contacts = [];
            }
            renderContactsTable();
            updateAudienceMetrics();
        } catch (err) {
            console.error('Failed to load contacts:', err);
            state.contacts = [];
            renderContactsTable();
        }
    }

    function renderContactsTable() {
        const tbody = document.getElementById('contacts-table-body');
        const totalBadge = document.getElementById('count-contacts-total');
        if (!tbody) return;

        let filtered = state.contacts;
        const statusFilter = document.getElementById('contacts-status-filter')?.value || 'all';
        const search = (document.getElementById('contacts-search-input')?.value || '').toLowerCase().trim();

        if (statusFilter === 'subscribed') {
            filtered = filtered.filter(c => !c.unsubscribed);
        } else if (statusFilter === 'unsubscribed') {
            filtered = filtered.filter(c => !!c.unsubscribed);
        }

        if (search) {
            filtered = filtered.filter(c => {
                const email = (c.email || '').toLowerCase();
                const fn = (c.first_name || '').toLowerCase();
                const ln = (c.last_name || '').toLowerCase();
                return email.includes(search) || fn.includes(search) || ln.includes(search);
            });
        }

        if (totalBadge) totalBadge.textContent = state.contacts.length;

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6">
                        <div class="table-empty">
                            <div class="table-empty-text">No contacts found in this audience. Add one or click "Import CSV".</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map(c => `
            <tr>
                <td>
                    <span style="font-size: 13px; font-weight: 500; color: var(--text-white);">${escapeHtml(c.email)}</span>
                </td>
                <td>
                    <span style="color: var(--text-primary); font-size: 12.5px;">${escapeHtml(c.first_name || '---')}</span>
                </td>
                <td>
                    <span style="color: var(--text-primary); font-size: 12.5px;">${escapeHtml(c.last_name || '---')}</span>
                </td>
                <td>
                    <span class="status-pill ${c.unsubscribed ? 'revoked' : 'active'}" style="font-size: 10.5px; padding: 1px 6px;">
                        <span class="indicator-dot"></span>
                        <span>${c.unsubscribed ? 'Unsubscribed' : 'Subscribed'}</span>
                    </span>
                </td>
                <td>
                    <span style="font-size: 11.5px; color: var(--text-muted); font-family: var(--font-mono);">${formatDate(c.created_at)}</span>
                </td>
                <td class="align-right">
                    <button class="btn btn-secondary btn-sm" style="color: var(--ruby);" onclick="window.app.deleteContact('${escapeHtml(c.id || c.email)}')">
                        Remove
                    </button>
                </td>
            </tr>
        `).join('');
    }

    async function deleteContact(idOrEmail) {
        const ok = await showConfirmModal('Remove Subscriber', `Permanently remove subscriber "${idOrEmail}" from Resend?`);
        if (!ok) return;
        const res = await apiRequest(`/api/email/contacts/${encodeURIComponent(idOrEmail)}`, 'DELETE');
        if (res.success) {
            showToast('Subscriber removed from Resend', 'info');
            await loadContacts(state.currentAudienceId);
        } else {
            showToast(res.message || 'Failed to remove contact', 'error');
        }
    }

    async function deleteCurrentAudience() {
        if (!state.currentAudienceId) {
            showToast('No audience selected', 'error');
            return;
        }
        const current = state.audiences.find(a => a.id === state.currentAudienceId);
        const name = current ? current.name : state.currentAudienceId;
        const ok = await showConfirmModal('Delete Audience', `Delete audience "${name}" from Resend?\n\nThis action cannot be undone.`);
        if (!ok) return;

        const res = await apiRequest(`/api/email/segments/${encodeURIComponent(state.currentAudienceId)}`, 'DELETE');
        if (res.success) {
            showToast('Audience deleted from Resend', 'info');
            state.currentAudienceId = '';
            await loadAudiences();
        } else {
            showToast(res.message || 'Failed to delete audience', 'error');
        }
    }

    // --- CSV BATCH IMPORTER ---

    function parseCSVText(csvText) {
        const lines = csvText.split(/\r\n|\n|\r/).filter(l => l.trim().length > 0);
        if (lines.length < 2) return [];

        function parseLine(line) {
            const result = [];
            let current = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            result.push(current.trim());
            return result;
        }

        const header = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
        const emailIdx = header.findIndex(h => h.includes('email'));
        const fnIdx = header.findIndex(h => h.includes('first') || h === 'name');
        const lnIdx = header.findIndex(h => h.includes('last'));

        if (emailIdx === -1) {
            throw new Error('CSV must contain an "email" column header.');
        }

        const records = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = parseLine(lines[i]);
            const email = (cols[emailIdx] || '').trim();
            if (email && email.includes('@')) {
                records.push({
                    email: email.toLowerCase(),
                    firstName: fnIdx !== -1 ? (cols[fnIdx] || '').trim() : '',
                    lastName: lnIdx !== -1 ? (cols[lnIdx] || '').trim() : ''
                });
            }
        }
        return records;
    }

    function handleCsvSelected(event) {
        const file = event.target?.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const content = e.target.result;
                const records = parseCSVText(content);
                state.parsedCsvContacts = records;

                const previewSection = document.getElementById('csv-preview-section');
                const badge = document.getElementById('csv-summary-badge');
                const tbody = document.getElementById('csv-preview-tbody');
                const btnImport = document.getElementById('btn-execute-csv-import');

                if (records.length === 0) {
                    showToast('No valid email records found in CSV file', 'error');
                    if (btnImport) btnImport.disabled = true;
                    return;
                }

                if (badge) badge.textContent = `${records.length} subscribers detected`;
                if (tbody) {
                    const previewRows = records.slice(0, 10);
                    tbody.innerHTML = previewRows.map((r, idx) => `
                        <tr>
                            <td><span style="font-size: 11px; color: var(--text-muted);">${idx + 1}</span></td>
                            <td><span style="font-size: 12px; color: var(--text-white);">${escapeHtml(r.email)}</span></td>
                            <td><span style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(r.firstName || '---')}</span></td>
                            <td><span style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(r.lastName || '---')}</span></td>
                        </tr>
                    `).join('');
                }

                if (previewSection) previewSection.style.display = 'block';
                if (btnImport) btnImport.disabled = false;
                showToast(`Parsed ${records.length} contacts from CSV`, 'info');
            } catch (err) {
                showToast(err.message || 'Failed to parse CSV file', 'error');
            }
        };
        reader.readAsText(file);
    }

    function downloadSampleCsv() {
        const sampleContent = 'email,first_name,last_name\nclient1@example.com,Sarah,Connor\nclient2@example.com,John,Doe\nsupport@enterprise.org,Jane,Smith\n';
        const blob = new Blob([sampleContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'cortex_contacts_sample.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async function executeCsvImport() {
        if (!state.parsedCsvContacts || state.parsedCsvContacts.length === 0) {
            showToast('No contacts to import', 'error');
            return;
        }

        const btn = document.getElementById('btn-execute-csv-import');
        const progressSection = document.getElementById('csv-progress-section');
        const progressFill = document.getElementById('csv-progress-fill');
        const progressStatus = document.getElementById('csv-progress-status');

        if (btn) btn.disabled = true;
        if (progressSection) progressSection.style.display = 'block';
        if (progressFill) progressFill.style.width = '45%';
        if (progressStatus) progressStatus.textContent = `Syncing ${state.parsedCsvContacts.length} contacts with Resend...`;

        try {
            const res = await apiRequest('/api/email/contacts/import-csv', 'POST', {
                contacts: state.parsedCsvContacts,
                segmentId: state.currentAudienceId || undefined
            });

            if (progressFill) progressFill.style.width = '100%';

            if (res.success && res.data) {
                const { created, already_existed, failed } = res.data;
                showToast(`Import completed: ${created} created, ${already_existed} existing, ${failed} failed`, 'success');
                setTimeout(() => {
                    closeModals();
                    if (progressSection) progressSection.style.display = 'none';
                    state.parsedCsvContacts = [];
                }, 800);
                await loadContacts(state.currentAudienceId);
            } else {
                showToast(res.message || 'Import failed', 'error');
                if (btn) btn.disabled = false;
            }
        } catch (err) {
            showToast('Failed to execute CSV batch import', 'error');
            if (btn) btn.disabled = false;
        }
    }

    function exportContactsCsv() {
        if (!state.contacts || state.contacts.length === 0) {
            showToast('No contacts to export in this audience', 'error');
            return;
        }

        let csv = 'email,first_name,last_name,unsubscribed,enrolled_at\n';
        state.contacts.forEach(c => {
            const cleanFn = (c.first_name || '').replace(/"/g, '""');
            const cleanLn = (c.last_name || '').replace(/"/g, '""');
            csv += `"${c.email}","${cleanFn}","${cleanLn}",${!!c.unsubscribed},"${c.created_at || ''}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        const audienceName = (state.audiences.find(a => a.id === state.currentAudienceId)?.name || 'audience').replace(/\s+/g, '_');
        link.download = `cortex_${audienceName}_subscribers.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Subscribers exported to CSV', 'info');
    }

    // --- GMAIL SELECTION, FORMATTING & MEDIA SYSTEM ---

    function saveSelection() {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            state.lastSavedRange = sel.getRangeAt(0).cloneRange();
        }
    }

    function restoreSelection() {
        if (state.lastSavedRange) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(state.lastSavedRange);
        }
    }

    function applyFontFamily(font, context) {
        const canvasId = context === 'broadcast' ? 'bcast-editor-canvas' : 'supp-editor-canvas';
        const canvas = document.getElementById(canvasId);
        if (canvas) canvas.focus();
        document.execCommand('fontName', false, font);
    }

    function applyFontSize(size, context) {
        const canvasId = context === 'broadcast' ? 'bcast-editor-canvas' : 'supp-editor-canvas';
        const canvas = document.getElementById(canvasId);
        if (canvas) canvas.focus();
        document.execCommand('fontSize', false, size);
    }

    function toggleFormatBar(context) {
        const barId = context === 'broadcast' ? 'bcast-format-bar' : 'supp-format-bar';
        const btnId = context === 'broadcast' ? 'btn-toggle-bcast-format' : 'btn-toggle-supp-format';
        const bar = document.getElementById(barId);
        const btn = document.getElementById(btnId);
        if (!bar) return;
        const isHidden = bar.style.display === 'none';
        bar.style.display = isHidden ? 'flex' : 'none';
        if (btn) btn.classList.toggle('active', isHidden);
    }

    function toggleComposerExpand(context) {
        const winId = context === 'broadcast' ? 'bcast-compose-window' : 'supp-compose-window';
        const win = document.getElementById(winId);
        if (win) win.classList.toggle('expanded');
    }

    function toggleCc() {
        const row = document.getElementById('supp-cc-row');
        if (!row) return;
        const isHidden = row.style.display === 'none';
        row.style.display = isHidden ? 'flex' : 'none';
        const btn = document.getElementById('btn-toggle-cc');
        if (btn) btn.classList.toggle('active', isHidden);
        if (isHidden) document.getElementById('supp-cc-input')?.focus();
    }

    function toggleBcc() {
        const row = document.getElementById('supp-bcc-row');
        if (!row) return;
        const isHidden = row.style.display === 'none';
        row.style.display = isHidden ? 'flex' : 'none';
        const btn = document.getElementById('btn-toggle-bcc');
        if (btn) btn.classList.toggle('active', isHidden);
        if (isHidden) document.getElementById('supp-bcc-input')?.focus();
    }

    function togglePreheader() {
        const row = document.getElementById('bcast-preheader-row');
        if (!row) return;
        const isHidden = row.style.display === 'none';
        row.style.display = isHidden ? 'flex' : 'none';
        const btn = document.getElementById('btn-toggle-preheader');
        if (btn) btn.classList.toggle('active', isHidden);
        if (isHidden) document.getElementById('bcast-preview-text-input')?.focus();
    }

    // --- SYSTEM PHOTO / IMAGE UPLOAD & URL HANDLING ---

    function openPhotoModal(context = 'support') {
        state.activeComposerContext = context;
        saveSelection();
        clearPhotoSelection();
        switchPhotoTab('upload');

        const attachOpt = document.getElementById('photo-attach-option');
        if (attachOpt) {
            attachOpt.style.display = context === 'support' ? 'inline-flex' : 'none';
        }
        const modal = document.getElementById('modal-insert-photo');
        if (modal) modal.classList.add('open');
    }

    function switchPhotoTab(tab) {
        const uploadTabBtn = document.getElementById('photo-tabbtn-upload');
        const urlTabBtn = document.getElementById('photo-tabbtn-url');
        const uploadView = document.getElementById('photo-view-upload');
        const urlView = document.getElementById('photo-view-url');

        if (tab === 'upload') {
            if (uploadTabBtn) uploadTabBtn.classList.add('active');
            if (urlTabBtn) urlTabBtn.classList.remove('active');
            if (uploadView) uploadView.style.display = 'block';
            if (urlView) urlView.style.display = 'none';
        } else {
            if (uploadTabBtn) uploadTabBtn.classList.remove('active');
            if (urlTabBtn) urlTabBtn.classList.add('active');
            if (uploadView) uploadView.style.display = 'none';
            if (urlView) urlView.style.display = 'block';
            document.getElementById('photo-url-input')?.focus();
        }
    }

    function handlePhotoFileSelected(event) {
        const file = event.target?.files?.[0];
        if (!file) return;

        if (file.size > 15 * 1024 * 1024) {
            showToast('Photo exceeds 15MB size limit', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const dataUrl = e.target.result;
            state.selectedPhoto = {
                file: file,
                name: file.name,
                dataUrl: dataUrl,
                base64: dataUrl.split(',')[1],
                type: file.type || 'image/png',
                sizeStr: formatBytes(file.size)
            };

            const dropZone = document.getElementById('photo-drop-zone');
            const previewCard = document.getElementById('photo-upload-preview');
            const previewImg = document.getElementById('photo-preview-img');
            const previewName = document.getElementById('photo-preview-name');
            const previewSize = document.getElementById('photo-preview-size');

            if (dropZone) dropZone.style.display = 'none';
            if (previewImg) previewImg.src = dataUrl;
            if (previewName) previewName.textContent = file.name;
            if (previewSize) previewSize.textContent = formatBytes(file.size);
            if (previewCard) previewCard.style.display = 'flex';
        };
        reader.readAsDataURL(file);
    }

    function handlePhotoUrlInput(url) {
        url = (url || '').trim();
        const card = document.getElementById('photo-url-preview-card');
        const img = document.getElementById('photo-url-img');
        if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/'))) {
            if (img) img.src = url;
            if (card) card.style.display = 'block';
            state.selectedPhoto = {
                dataUrl: url,
                name: 'web-image',
                type: 'image/jpeg',
                sizeStr: 'Web Asset'
            };
        } else {
            if (card) card.style.display = 'none';
            if (state.selectedPhoto && state.selectedPhoto.name === 'web-image') {
                state.selectedPhoto = null;
            }
        }
    }

    function clearPhotoSelection() {
        state.selectedPhoto = null;
        const picker = document.getElementById('photo-file-picker');
        if (picker) picker.value = '';
        const dropZone = document.getElementById('photo-drop-zone');
        const previewCard = document.getElementById('photo-upload-preview');
        const urlInput = document.getElementById('photo-url-input');
        const urlCard = document.getElementById('photo-url-preview-card');

        if (dropZone) dropZone.style.display = 'block';
        if (previewCard) previewCard.style.display = 'none';
        if (urlInput) urlInput.value = '';
        if (urlCard) urlCard.style.display = 'none';
    }

    async function executeInsertPhoto() {
        if (!state.selectedPhoto || !state.selectedPhoto.dataUrl) {
            showToast('Please select a photo file or enter a valid URL', 'error');
            return;
        }

        const placement = document.querySelector('input[name="photo-placement"]:checked')?.value || 'inline';

        if (placement === 'attachment' && state.activeComposerContext === 'support') {
            state.supportAttachments.push({
                filename: state.selectedPhoto.name || 'photo.png',
                content: state.selectedPhoto.base64 || state.selectedPhoto.dataUrl.split(',')[1] || '',
                sizeStr: state.selectedPhoto.sizeStr || '---',
                content_type: state.selectedPhoto.type || 'image/png'
            });
            renderAttachedFileChips();
            closeModals();
            showToast('Photo attached to email', 'success');
            return;
        }

        let resolvedUrl = state.selectedPhoto.dataUrl;

        // Auto-upload local images to server for bulletproof inbox rendering (Gmail/Apple Mail/Outlook)
        if (resolvedUrl.startsWith('data:image/')) {
            try {
                showToast('Uploading image asset...', 'info');
                const uploadRes = await apiRequest('/api/email/upload-image', 'POST', {
                    filename: state.selectedPhoto.name || 'image.png',
                    dataUrl: resolvedUrl
                });
                if (uploadRes && uploadRes.success && uploadRes.url) {
                    resolvedUrl = uploadRes.url;
                }
            } catch (err) {
                console.warn('Image upload fallback to data URI:', err);
            }
        }

        const canvasId = state.activeComposerContext === 'broadcast' ? 'bcast-editor-canvas' : 'supp-editor-canvas';
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        canvas.focus();
        restoreSelection();

        const imgHtml = `<img src="${resolvedUrl}" alt="${escapeHtml(state.selectedPhoto.name || 'image')}" style="max-width: 100%; height: auto; border-radius: 6px; margin: 10px 0; display: inline-block;" />`;
        document.execCommand('insertHTML', false, imgHtml);

        attachImageBubbleListeners(canvas);
        closeModals();
        showToast('Photo inserted inline', 'success');
    }

    // --- INLINE IMAGE RESIZE BUBBLE ---

    function attachImageBubbleListeners(container) {
        if (!container) return;
        const imgs = container.querySelectorAll('img');
        imgs.forEach(img => {
            img.onclick = (e) => {
                e.stopPropagation();
                container.querySelectorAll('img').forEach(i => i.classList.remove('active-img-selected'));
                img.classList.add('active-img-selected');
                state.activeImgElement = img;
                showImageBubble(img);
            };
        });
    }

    function showImageBubble(img) {
        const bubble = document.getElementById('gmail-image-bubble');
        if (!bubble) return;
        const rect = img.getBoundingClientRect();
        bubble.style.left = `${Math.max(10, rect.left + window.scrollX)}px`;
        bubble.style.top = `${Math.max(10, rect.top + window.scrollY - 36)}px`;
        bubble.style.display = 'flex';
    }

    function hideImageBubble() {
        const bubble = document.getElementById('gmail-image-bubble');
        if (bubble) bubble.style.display = 'none';
        if (state.activeImgElement) {
            state.activeImgElement.classList.remove('active-img-selected');
            state.activeImgElement = null;
        }
    }

    function resizeActiveImage(size) {
        if (!state.activeImgElement) return;
        if (size === 'auto') {
            state.activeImgElement.style.width = 'auto';
            state.activeImgElement.style.maxWidth = '100%';
        } else {
            state.activeImgElement.style.width = size;
            state.activeImgElement.style.maxWidth = '100%';
        }
        hideImageBubble();
    }

    function removeActiveImage() {
        if (!state.activeImgElement) return;
        state.activeImgElement.remove();
        hideImageBubble();
        showToast('Image removed', 'info');
    }

    // --- LINK & CALLOUT BUTTON MODALS (GMAIL STYLE: WEB URL & EMAIL DETECTION) ---

    function openLinkModal(context = 'support') {
        state.activeComposerContext = context;
        saveSelection();
        const selText = window.getSelection()?.toString().trim() || '';
        const txtInput = document.getElementById('link-text-input');
        const urlInput = document.getElementById('link-url-input');
        const webRadio = document.getElementById('link-type-web');
        const emailRadio = document.getElementById('link-type-email');

        if (txtInput) txtInput.value = selText;

        // Auto-detect if user selected an email address vs a web URL
        if (selText && selText.includes('@') && !selText.startsWith('http')) {
            if (emailRadio) emailRadio.checked = true;
            if (urlInput) {
                urlInput.value = selText.replace(/^mailto:/i, '');
                urlInput.placeholder = 'support@cortexco.in';
            }
        } else if (selText && (selText.startsWith('http') || selText.includes('.co') || selText.includes('.in') || selText.includes('.com'))) {
            if (webRadio) webRadio.checked = true;
            if (urlInput) {
                urlInput.value = selText;
                urlInput.placeholder = 'https://cortexco.in';
            }
        } else {
            if (webRadio) webRadio.checked = true;
            if (urlInput) {
                urlInput.value = '';
                urlInput.placeholder = 'https://cortexco.in';
            }
        }

        updateLinkHint();
        const modal = document.getElementById('modal-insert-link');
        if (modal) modal.classList.add('open');
        setTimeout(() => urlInput?.focus(), 50);
    }

    function onLinkTypeChange(type) {
        const urlInput = document.getElementById('link-url-input');
        if (!urlInput) return;
        if (type === 'email') {
            urlInput.placeholder = 'support@cortexco.in';
            if (urlInput.value.startsWith('https://') || urlInput.value.startsWith('http://')) {
                urlInput.value = '';
            }
        } else {
            urlInput.placeholder = 'https://cortexco.in';
            if (urlInput.value.startsWith('mailto:')) {
                urlInput.value = '';
            }
        }
        updateLinkHint();
    }

    function onLinkInputDetect(val) {
        val = (val || '').trim();
        const webRadio = document.getElementById('link-type-web');
        const emailRadio = document.getElementById('link-type-email');
        if (val.includes('@') && !val.startsWith('http://') && !val.startsWith('https://')) {
            if (emailRadio) emailRadio.checked = true;
        } else if (val.startsWith('http://') || val.startsWith('https://') || val.startsWith('www.')) {
            if (webRadio) webRadio.checked = true;
        }
        updateLinkHint();
    }

    function updateLinkHint() {
        const hint = document.getElementById('link-target-hint');
        const isEmail = document.getElementById('link-type-email')?.checked;
        const urlVal = document.getElementById('link-url-input')?.value.trim();
        if (!hint) return;
        if (isEmail) {
            hint.innerHTML = `Email link: creates a clickable blue link <code style="color: #60a5fa;">mailto:${escapeHtml(urlVal || 'support@cortexco.in')}</code> (opens mail composer)`;
        } else {
            hint.innerHTML = `Web address: creates a clickable blue link <code style="color: #60a5fa;">${escapeHtml(urlVal || 'https://cortexco.in')}</code> (opens website)`;
        }
    }

    function executeInsertLink() {
        const urlInput = document.getElementById('link-url-input');
        let url = (urlInput?.value || '').trim();
        const isEmailType = document.getElementById('link-type-email')?.checked;
        let text = document.getElementById('link-text-input')?.value.trim() || url || 'Link';

        if (!url) {
            showToast('Please enter a destination URL or email address', 'error');
            return;
        }

        const isEmail = isEmailType || (url.includes('@') && !url.startsWith('http://') && !url.startsWith('https://'));
        let finalHref = url;
        if (isEmail) {
            finalHref = url.startsWith('mailto:') ? url : `mailto:${url.replace(/^mailto:/i, '')}`;
        } else if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('#')) {
            finalHref = `https://${url}`;
        }

        const canvasId = state.activeComposerContext === 'broadcast' ? 'bcast-editor-canvas' : 'supp-editor-canvas';
        const canvas = document.getElementById(canvasId);
        if (canvas) canvas.focus();

        restoreSelection();
        const targetAttr = isEmail ? '' : ' target="_blank" rel="noopener noreferrer"';
        const html = `<a href="${escapeHtml(finalHref)}"${targetAttr} style="color: #2563eb; text-decoration: underline; font-weight: 500;">${escapeHtml(text)}</a>`;
        document.execCommand('insertHTML', false, html);
        closeModals();
        showToast(isEmail ? 'Email link inserted (mailto:)' : 'Web link inserted', 'info');
    }

    function openButtonModal() {
        saveSelection();
        previewCtaButton();
        const modal = document.getElementById('modal-insert-button');
        if (modal) modal.classList.add('open');
    }

    function previewCtaButton() {
        const text = document.getElementById('cta-btn-text')?.value || 'Access Cortex Portal →';
        const color = document.getElementById('cta-btn-style')?.value || '#2563eb';
        const preview = document.getElementById('cta-btn-preview-anchor');
        if (preview) {
            preview.textContent = text;
            preview.style.backgroundColor = color;
            preview.style.borderColor = color;
        }
    }

    function executeInsertButton() {
        const text = document.getElementById('cta-btn-text')?.value.trim() || 'Action';
        const url = document.getElementById('cta-btn-url')?.value.trim() || 'https://cortexco.in';
        const color = document.getElementById('cta-btn-style')?.value || '#2563eb';

        const canvas = document.getElementById('bcast-editor-canvas');
        if (canvas) canvas.focus();
        restoreSelection();

        const html = `
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 22px 0;">
                <tr>
                    <td align="center" style="border-radius: 6px; background: ${color};">
                        <a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="background: ${color}; border: 1px solid ${color}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.2; text-align: center; text-decoration: none; display: inline-block; border-radius: 6px; font-weight: 600; padding: 12px 24px; color: #ffffff;">${escapeHtml(text)}</a>
                    </td>
                </tr>
            </table>
        `;
        document.execCommand('insertHTML', false, html);
        closeModals();
        showToast('Button inserted', 'info');
    }

    // --- COLOR PALETTE & EMOJIS ---

    const COLOR_PALETTE = [
        '#000000', '#475569', '#94a3b8', '#ffffff',
        '#ef4444', '#f97316', '#eab308', '#22c55e',
        '#06b6d4', '#3b82f6', '#6366f1', '#a855f7',
        '#ec4899', '#14b8a6', '#84cc16', '#f43f5e'
    ];

    const EMOJI_LIST = [
        '👋', '👍', '🚀', '⚡', '🔒', '📦', '📧', '✅',
        '💡', '🔥', '🎯', '🤝', '📊', '🛠️', '🙌', '❤️',
        '💻', '🛡️', '🌐', '📢', '🔑', '⏱️', '✨', '🎉'
    ];

    function toggleColorPalette(context, btnEl) {
        state.activeComposerContext = context;
        saveSelection();
        const popover = document.getElementById('gmail-color-popover');
        if (!popover) return;

        if (popover.style.display === 'block') {
            popover.style.display = 'none';
            return;
        }

        const textGrid = document.getElementById('text-color-grid');
        const bgGrid = document.getElementById('bg-color-grid');

        if (textGrid) {
            textGrid.innerHTML = COLOR_PALETTE.map(c => `
                <div class="color-swatch" style="background: ${c};" onclick="window.app.applyColor('${c}', 'text')" title="${c}"></div>
            `).join('');
        }
        if (bgGrid) {
            bgGrid.innerHTML = COLOR_PALETTE.map(c => `
                <div class="color-swatch" style="background: ${c};" onclick="window.app.applyColor('${c}', 'bg')" title="${c}"></div>
            `).join('');
        }

        const rect = btnEl.getBoundingClientRect();
        popover.style.left = `${Math.max(10, rect.left + window.scrollX - 50)}px`;
        popover.style.top = `${rect.bottom + window.scrollY + 6}px`;
        popover.style.display = 'block';
    }

    function applyColor(color, mode) {
        const canvasId = state.activeComposerContext === 'broadcast' ? 'bcast-editor-canvas' : 'supp-editor-canvas';
        const canvas = document.getElementById(canvasId);
        if (canvas) canvas.focus();
        restoreSelection();

        if (mode === 'text') {
            document.execCommand('foreColor', false, color);
        } else {
            document.execCommand('hiliteColor', false, color);
        }
        const popover = document.getElementById('gmail-color-popover');
        if (popover) popover.style.display = 'none';
    }

    function toggleEmojiPicker(context, btnEl) {
        state.activeComposerContext = context;
        saveSelection();
        const popover = document.getElementById('gmail-emoji-popover');
        if (!popover) return;

        if (popover.style.display === 'block') {
            popover.style.display = 'none';
            return;
        }

        const grid = document.getElementById('emoji-grid');
        if (grid) {
            grid.innerHTML = EMOJI_LIST.map(em => `
                <button type="button" class="emoji-btn" onclick="window.app.insertEmoji('${em}')">${em}</button>
            `).join('');
        }

        const rect = btnEl.getBoundingClientRect();
        popover.style.left = `${Math.max(10, rect.left + window.scrollX - 60)}px`;
        popover.style.top = `${rect.bottom + window.scrollY + 6}px`;
        popover.style.display = 'block';
    }

    function insertEmoji(em) {
        const canvasId = state.activeComposerContext === 'broadcast' ? 'bcast-editor-canvas' : 'supp-editor-canvas';
        const canvas = document.getElementById(canvasId);
        if (canvas) canvas.focus();
        restoreSelection();
        document.execCommand('insertText', false, em);
        const popover = document.getElementById('gmail-emoji-popover');
        if (popover) popover.style.display = 'none';
    }

    // --- CANVAS DRAG & DROP AND CLIPBOARD PASTE SETUP ---

    function setupCanvasDragAndDrop(containerId, canvasId, dropOverlayId) {
        const container = document.getElementById(containerId);
        const canvas = document.getElementById(canvasId);
        const overlay = document.getElementById(dropOverlayId);
        if (!container || !canvas) return;

        ['dragenter', 'dragover'].forEach(eventName => {
            container.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (overlay) overlay.classList.add('active');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            container.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (overlay) overlay.classList.remove('active');
            }, false);
        });

        container.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = Array.from(dt.files || []);
            if (files.length === 0) return;

            files.forEach(file => {
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = async function(evt) {
                        canvas.focus();
                        let srcUrl = evt.target.result;
                        try {
                            const uploadRes = await apiRequest('/api/email/upload-image', 'POST', {
                                filename: file.name,
                                dataUrl: srcUrl
                            });
                            if (uploadRes && uploadRes.success && uploadRes.url) {
                                srcUrl = uploadRes.url;
                            }
                        } catch (_) {}
                        const imgHtml = `<img src="${srcUrl}" alt="${escapeHtml(file.name)}" style="max-width: 100%; height: auto; border-radius: 6px; margin: 10px 0; display: inline-block;" />`;
                        document.execCommand('insertHTML', false, imgHtml);
                        attachImageBubbleListeners(canvas);
                        showToast(`Inserted photo "${file.name}"`, 'success');
                    };
                    reader.readAsDataURL(file);
                } else if (containerId.includes('supp')) {
                    const reader = new FileReader();
                    reader.onload = function(evt) {
                        state.supportAttachments.push({
                            filename: file.name,
                            content: evt.target.result.split(',')[1],
                            sizeStr: formatBytes(file.size),
                            content_type: file.type || 'application/octet-stream'
                        });
                        renderAttachedFileChips();
                        showToast(`Attached file "${file.name}"`, 'info');
                    };
                    reader.readAsDataURL(file);
                }
            });
        }, false);

        canvas.addEventListener('focus', () => {
            try {
                document.execCommand('defaultParagraphSeparator', false, 'div');
            } catch (_) {}
        });

        canvas.addEventListener('paste', (e) => {
            const clipboardData = e.clipboardData;
            if (!clipboardData) return;
            const items = Array.from(clipboardData.items || []);
            const imageItem = items.find(item => item.type.startsWith('image/'));

            if (imageItem) {
                e.preventDefault();
                const blob = imageItem.getAsFile();
                if (!blob) return;

                const reader = new FileReader();
                reader.onload = async function(evt) {
                    canvas.focus();
                    let srcUrl = evt.target.result;
                    try {
                        const uploadRes = await apiRequest('/api/email/upload-image', 'POST', {
                            filename: 'pasted-image.png',
                            dataUrl: srcUrl
                        });
                        if (uploadRes && uploadRes.success && uploadRes.url) {
                            srcUrl = uploadRes.url;
                        }
                    } catch (_) {}
                    const imgHtml = `<img src="${srcUrl}" alt="Pasted Image" style="max-width: 100%; height: auto; border-radius: 6px; margin: 8px 0; display: inline-block;" />`;
                    document.execCommand('insertHTML', false, imgHtml);
                    attachImageBubbleListeners(canvas);
                    showToast('Pasted image inserted inline', 'success');
                };
                reader.readAsDataURL(blob);
                return;
            }

            // Clean Plain-Text Paste: Prevent double-spacing and excessive empty lines
            const text = clipboardData.getData('text/plain');
            if (text && (!clipboardData.getData('text/html') || !clipboardData.getData('text/html').includes('<table'))) {
                e.preventDefault();
                // Normalize newlines and collapse 3+ consecutive blank lines down to 2 (one blank line between paragraphs)
                const normalized = text
                    .replace(/\r\n/g, '\n')
                    .replace(/\r/g, '\n')
                    .replace(/\n{3,}/g, '\n\n')
                    .trim();

                const lines = normalized.split('\n');
                const html = lines.map(line => {
                    const trimmed = line.trim();
                    if (!trimmed) {
                        return '<div><br></div>';
                    }
                    return `<div>${escapeHtml(line)}</div>`;
                }).join('');

                document.execCommand('insertHTML', false, html);
                return;
            }
        });

        canvas.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                if (containerId.includes('bcast')) {
                    submitBroadcast(true);
                } else {
                    sendSupportEmail();
                }
            } else if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                openLinkModal(containerId.includes('bcast') ? 'broadcast' : 'support');
            }
        });

        attachImageBubbleListeners(canvas);
    }

    // --- BROADCAST COMPOSER & HISTORY ---

    function switchBroadcastSubTab(subTab) {
        state.broadcastSubTab = subTab;
        const tabs = ['audiences', 'compose', 'history'];
        tabs.forEach(t => {
            const btn = document.getElementById(`bcast-tabbtn-${t}`);
            const view = document.getElementById(`bcast-view-${t}`);
            if (btn) {
                if (t === subTab) btn.classList.add('active');
                else btn.classList.remove('active');
            }
            if (view) {
                view.style.display = t === subTab ? 'block' : 'none';
            }
        });

        if (subTab === 'history') {
            loadBroadcasts();
        } else if (subTab === 'compose') {
            const selectCompose = document.getElementById('bcast-compose-audience');
            if (selectCompose && state.currentAudienceId) {
                selectCompose.value = state.currentAudienceId;
            }
        }
    }

    function setBroadcastEditorMode(mode) {
        state.broadcastEditorMode = mode;
        const visualBtn = document.getElementById('bcast-mode-visual');
        const htmlBtn = document.getElementById('bcast-mode-html');
        const visualCanvas = document.getElementById('bcast-editor-canvas');
        const rawTextarea = document.getElementById('bcast-editor-raw');
        const toolbar = document.getElementById('bcast-format-bar');

        if (mode === 'html') {
            if (visualBtn) visualBtn.classList.remove('active');
            if (htmlBtn) htmlBtn.classList.add('active');
            if (rawTextarea && visualCanvas) {
                rawTextarea.value = visualCanvas.innerHTML.trim();
                visualCanvas.style.display = 'none';
                rawTextarea.style.display = 'block';
            }
            if (toolbar) toolbar.style.display = 'none';
        } else {
            if (visualBtn) visualBtn.classList.add('active');
            if (htmlBtn) htmlBtn.classList.remove('active');
            if (rawTextarea && visualCanvas) {
                visualCanvas.innerHTML = rawTextarea.value.trim();
                rawTextarea.style.display = 'none';
                visualCanvas.style.display = 'block';
            }
            if (toolbar) toolbar.style.display = 'flex';
        }
    }

    function insertMergeTag(tag) {
        if (state.broadcastEditorMode === 'html') {
            const textarea = document.getElementById('bcast-editor-raw');
            if (!textarea) return;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const text = textarea.value;
            textarea.value = text.substring(0, start) + tag + text.substring(end);
            textarea.focus();
            textarea.selectionStart = textarea.selectionEnd = start + tag.length;
        } else {
            const canvas = document.getElementById('bcast-editor-canvas');
            if (!canvas) return;
            canvas.focus();
            document.execCommand('insertText', false, tag);
        }
    }

    async function resetBroadcastComposer() {
        const ok = await showConfirmModal('Reset Broadcast Composer', 'Discard current edits and restore the default CortexCo template?');
        if (!ok) return;
        const camp = document.getElementById('bcast-campaign-name-input');
        const subj = document.getElementById('bcast-subject-input');
        const pre = document.getElementById('bcast-preview-text-input');
        const canvas = document.getElementById('bcast-editor-canvas');
        const raw = document.getElementById('bcast-editor-raw');

        if (camp) camp.value = '';
        if (subj) subj.value = '';
        if (pre) pre.value = '';
        if (canvas) {
            canvas.innerHTML = `<p>Hello {{{contact.first_name|there}}},</p><p>We are reaching out with an official update regarding your CortexCo workspace and connected infrastructure.</p><br><hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0 20px 0;"><table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;"><tr><td style="vertical-align: middle; padding-right: 14px;"><img src="/assets/cortexco-logo-200.png" alt="CortexCo" width="68" height="68" style="display: block; width: 68px; height: 68px; border-radius: 50%; object-fit: cover;"></td><td style="border-left: 2px solid #4f6ef7; width: 2px; padding: 0; height: 62px;"></td><td style="vertical-align: middle; padding-left: 14px;"><div style="font-size: 18px; font-weight: 800; color: #111827; letter-spacing: -0.2px; line-height: 1.2;">Cortex<span style="color: #2f8cff;">C</span><span style="color: #8a4dff;">o</span></div><div style="font-size: 10px; font-weight: 700; letter-spacing: 1.5px; color: #6b7280; text-transform: uppercase; margin-top: 3px; line-height: 1;">ENGINEERING INTELLIGENCE</div><div style="margin-top: 6px; line-height: 1;"><a href="https://cortexco.in" target="_blank" style="color: #2563eb; text-decoration: none; font-size: 13px; font-weight: 500;">cortexco.in</a></div></td></tr></table><hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0 14px 0;"><p style="font-size: 12px; color: #6b7280; line-height: 1.5; margin: 0 0 6px 0;">This is an automated message from CortexCo. Please do not reply to this email, as this mailbox is not monitored.</p><p style="font-size: 11px; color: #94a3b8; line-height: 1.4; margin: 0;">To stop receiving updates, <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color: #2563eb; text-decoration: underline;">unsubscribe here</a>.</p>`;
        }
        if (raw) raw.value = '';
        showToast('Broadcast composer reset', 'info');
    }

    async function submitBroadcast(sendNow) {
        const audienceSelect = document.getElementById('bcast-compose-audience');
        const segmentId = audienceSelect?.value;
        const campaignName = document.getElementById('bcast-campaign-name-input')?.value.trim();
        const subject = document.getElementById('bcast-subject-input')?.value.trim();
        const previewText = document.getElementById('bcast-preview-text-input')?.value.trim();

        let html = '';
        if (state.broadcastEditorMode === 'html') {
            html = document.getElementById('bcast-editor-raw')?.value.trim();
        } else {
            html = document.getElementById('bcast-editor-canvas')?.innerHTML.trim();
        }

        if (!segmentId) {
            showToast('Select a target audience segment', 'error');
            return;
        }
        if (!subject) {
            showToast('Enter a broadcast subject line', 'error');
            return;
        }
        if (!html) {
            showToast('Broadcast email body cannot be empty', 'error');
            return;
        }

        if (sendNow) {
            const confirmed = await showConfirmModal('Dispatch Broadcast Campaign', 'Send this broadcast immediately to all subscribers in the selected audience?');
            if (!confirmed) return;
        }

        const btn = sendNow ? document.getElementById('btn-send-broadcast-now') : document.getElementById('btn-save-broadcast-draft');
        const originalText = btn ? btn.innerHTML : '';
        if (btn) btn.innerHTML = `<span>Processing...</span>`;

        try {
            const res = await apiRequest('/api/email/broadcasts', 'POST', {
                name: campaignName || subject,
                segmentId,
                subject,
                html,
                previewText: previewText || undefined,
                send: sendNow
            });

            if (res.success) {
                showToast(sendNow ? 'Broadcast queued and sent via Resend!' : 'Broadcast saved as draft', 'success');
                switchBroadcastSubTab('history');
                loadBroadcasts();
            } else {
                showToast(res.message || 'Failed to submit broadcast', 'error');
            }
        } catch (err) {
            showToast('Error communicating with Resend', 'error');
        } finally {
            if (btn) btn.innerHTML = originalText;
        }
    }

    async function loadBroadcasts() {
        const tbody = document.getElementById('broadcasts-history-tbody');
        if (!tbody) return;

        try {
            const res = await apiRequest('/api/email/broadcasts');
            if (res.success && Array.isArray(res.data)) {
                state.broadcasts = res.data;
                renderBroadcastsTable();
            } else {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6">
                            <div class="table-empty">
                                <div class="table-empty-text">No broadcasts found in your Resend account.</div>
                            </div>
                        </td>
                    </tr>
                `;
            }
        } catch (err) {
            console.error('Failed to load broadcasts:', err);
        }
    }

    function renderBroadcastsTable() {
        const tbody = document.getElementById('broadcasts-history-tbody');
        if (!tbody) return;

        if (state.broadcasts.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6">
                        <div class="table-empty">
                            <div class="table-empty-text">No broadcasts found. Create your first broadcast from the "Compose" tab.</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = state.broadcasts.map(b => {
            const isSent = b.status === 'sent';
            const isDraft = b.status === 'draft';
            const statusClass = isSent ? 'active' : (isDraft ? 'suspended' : 'live');
            const audienceName = (state.audiences.find(a => a.id === (b.segment_id || b.audience_id))?.name) || 'Audience';
            const campaignTitle = b.name || b.subject || 'Broadcast';
            const hasDiffSubject = b.subject && b.subject !== b.name;

            return `
                <tr>
                    <td>
                        <div style="font-size: 13.5px; font-weight: 600; color: var(--text-white); letter-spacing: -0.01em;">
                            ${escapeHtml(campaignTitle)}
                        </div>
                        ${hasDiffSubject ? `<div style="font-size: 11.5px; color: var(--text-secondary); margin-top: 2px;">Subject: ${escapeHtml(b.subject)}</div>` : ''}
                        ${b.preview_text ? `<div style="font-size: 11px; color: var(--text-muted); font-style: italic; margin-top: 1px;">Snippet: ${escapeHtml(b.preview_text)}</div>` : ''}
                    </td>
                    <td>
                        <span style="font-size: 12px; color: var(--text-secondary); background: rgba(255,255,255,0.04); padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.06);">${escapeHtml(audienceName)}</span>
                    </td>
                    <td>
                        <span class="status-pill ${statusClass}" style="font-size: 10.5px; padding: 2px 7px;">
                            <span class="indicator-dot"></span>
                            <span>${escapeHtml(b.status ? b.status.toUpperCase() : 'SENT')}</span>
                        </span>
                    </td>
                    <td>
                        <span style="font-size: 11.5px; color: var(--text-primary); font-family: var(--font-mono);">${formatDate(b.sent_at || b.scheduled_at || b.created_at)}</span>
                    </td>
                    <td>
                        <span style="font-size: 11.5px; color: var(--text-muted);">${formatDate(b.created_at)}</span>
                    </td>
                    <td class="align-right">
                        ${isDraft ? `
                            <button class="btn btn-primary btn-sm" onclick="window.app.sendDraftBroadcast('${escapeHtml(b.id)}')">
                                Trigger Send
                            </button>
                        ` : `
                            <span class="badge-metric" style="color: var(--emerald); font-weight: 600;">✓ Dispatched</span>
                        `}
                    </td>
                </tr>
            `;
        }).join('');
    }

    async function sendDraftBroadcast(broadcastId) {
        const ok = await showConfirmModal('Send Draft Broadcast', 'Trigger immediate sending of this draft broadcast to its audience?');
        if (!ok) return;
        const res = await apiRequest(`/api/email/broadcasts/${encodeURIComponent(broadcastId)}/send`, 'POST');
        if (res.success) {
            showToast('Broadcast triggered successfully!', 'success');
            await loadBroadcasts();
        } else {
            showToast(res.message || 'Failed to trigger broadcast', 'error');
        }
    }

    // --- SUPPORT 1-TO-1 EMAIL & REAL-TIME TRACKING ---

    function switchSupportSubTab(subTab) {
        state.supportSubTab = subTab;
        const btnCompose = document.getElementById('supp-tabbtn-compose');
        const btnTracker = document.getElementById('supp-tabbtn-tracker');
        const viewCompose = document.getElementById('supp-view-compose');
        const viewTracker = document.getElementById('supp-view-tracker');

        if (subTab === 'compose') {
            if (btnCompose) btnCompose.classList.add('active');
            if (btnTracker) btnTracker.classList.remove('active');
            if (viewCompose) viewCompose.style.display = 'block';
            if (viewTracker) viewTracker.style.display = 'none';
        } else {
            if (btnCompose) btnCompose.classList.remove('active');
            if (btnTracker) btnTracker.classList.add('active');
            if (viewCompose) viewCompose.style.display = 'none';
            if (viewTracker) viewTracker.style.display = 'block';
            loadSentHistory();
        }
    }

    function handleFileSelect(event) {
        const files = Array.from(event.target?.files || []);
        if (files.length === 0) return;

        files.forEach(file => {
            if (file.size > 15 * 1024 * 1024) {
                showToast(`File "${file.name}" exceeds 15MB limit`, 'error');
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                const base64Data = e.target.result.split(',')[1];
                state.supportAttachments.push({
                    filename: file.name,
                    content: base64Data,
                    sizeStr: formatBytes(file.size),
                    content_type: file.type || 'application/octet-stream'
                });
                renderAttachedFileChips();
            };
            reader.readAsDataURL(file);
        });
        event.target.value = '';
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function removeAttachedFile(index) {
        state.supportAttachments.splice(index, 1);
        renderAttachedFileChips();
    }

    function renderAttachedFileChips() {
        const tray = document.getElementById('supp-attachments-tray');
        const container = document.getElementById('supp-attachments-container');
        if (!tray || !container) return;

        if (state.supportAttachments.length === 0) {
            tray.style.display = 'none';
            container.innerHTML = '';
            return;
        }

        tray.style.display = 'block';
        container.innerHTML = state.supportAttachments.map((att, idx) => `
            <div class="gmail-attach-card">
                <span class="attach-icon">📎</span>
                <span class="attach-name" title="${escapeHtml(att.filename)}">${escapeHtml(att.filename)}</span>
                <span class="attach-size">(${escapeHtml(att.sizeStr)})</span>
                <span class="attach-remove" onclick="window.app.removeAttachedFile(${idx})" title="Remove attachment">✕</span>
            </div>
        `).join('');
    }

    function clearSupportComposer() {
        const to = document.getElementById('supp-to-input');
        const subj = document.getElementById('supp-subject-input');
        const cc = document.getElementById('supp-cc-input');
        const bcc = document.getElementById('supp-bcc-input');
        const canvas = document.getElementById('supp-editor-canvas');

        if (to) to.value = '';
        if (subj) subj.value = '';
        if (cc) cc.value = '';
        if (bcc) bcc.value = '';
        if (canvas) {
            canvas.innerHTML = `<p>Hello,</p><p>Thank you for contacting CortexCo Support. We have received your query and are reviewing the details.</p><br><hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0 20px 0;"><table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;"><tr><td style="vertical-align: middle; padding-right: 14px;"><img src="/assets/cortexco-logo-200.png" alt="CortexCo" width="68" height="68" style="display: block; width: 68px; height: 68px; border-radius: 50%; object-fit: cover;"></td><td style="border-left: 2px solid #4f6ef7; width: 2px; padding: 0; height: 72px;"></td><td style="vertical-align: middle; padding-left: 14px;"><div style="font-size: 18px; font-weight: 800; color: #0f172a; line-height: 1.2;">Support Team</div><div style="font-size: 15px; font-weight: 700; color: #111827; margin-top: 2px; line-height: 1.2;">Cortex<span style="color: #2f8cff;">C</span><span style="color: #8a4dff;">o</span></div><div style="font-size: 10px; font-weight: 700; letter-spacing: 1.5px; color: #6b7280; text-transform: uppercase; margin-top: 3px; line-height: 1;">ENGINEERING INTELLIGENCE</div><div style="margin-top: 6px; font-size: 13px; line-height: 1;"><a href="https://cortexco.in" target="_blank" style="color: #2563eb; text-decoration: none; font-weight: 500;">cortexco.in</a><span style="color: #cbd5e1; margin: 0 8px;">|</span><a href="mailto:support@cortexco.in" style="color: #2563eb; text-decoration: none; font-weight: 500;">support@cortexco.in</a></div></td></tr></table><hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0 14px 0;"><p style="font-size: 12px; color: #6b7280; line-height: 1.5; margin: 0;">Need help? Reply to this email or write to <a href="mailto:support@cortexco.in" style="color: #2563eb; text-decoration: underline;">support@cortexco.in</a> and our team will get back to you as soon as possible.</p>`;
        }
        state.supportAttachments = [];
        renderAttachedFileChips();

        const ccRow = document.getElementById('supp-cc-row');
        const bccRow = document.getElementById('supp-bcc-row');
        if (ccRow) ccRow.style.display = 'none';
        if (bccRow) bccRow.style.display = 'none';
        document.getElementById('btn-toggle-cc')?.classList.remove('active');
        document.getElementById('btn-toggle-bcc')?.classList.remove('active');

        const draftStatus = document.getElementById('supp-draft-status');
        if (draftStatus) draftStatus.textContent = 'Cleared';
    }

    async function sendSupportEmail() {
        const to = document.getElementById('supp-to-input')?.value.trim();
        const subject = document.getElementById('supp-subject-input')?.value.trim();
        const ccVal = document.getElementById('supp-cc-input')?.value.trim();
        const bccVal = document.getElementById('supp-bcc-input')?.value.trim();
        const canvas = document.getElementById('supp-editor-canvas');
        const html = canvas ? canvas.innerHTML.trim() : '';

        if (!to || !to.includes('@')) {
            showToast('Enter a valid recipient email address', 'error');
            document.getElementById('supp-to-input')?.focus();
            return;
        }
        if (!subject) {
            showToast('Enter an email subject line', 'error');
            document.getElementById('supp-subject-input')?.focus();
            return;
        }
        if (!html || html === '<p><br></p>') {
            showToast('Email message content cannot be empty', 'error');
            if (canvas) canvas.focus();
            return;
        }

        const cc = ccVal ? ccVal.split(',').map(s => s.trim()).filter(Boolean) : undefined;
        const bcc = bccVal ? bccVal.split(',').map(s => s.trim()).filter(Boolean) : undefined;

        const attachments = state.supportAttachments.map(a => ({
            filename: a.filename,
            content: a.content,
            content_type: a.content_type
        }));

        const btn = document.getElementById('btn-send-support-email');
        const originalHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.innerHTML = `<span>Sending...</span>`;
            btn.disabled = true;
        }

        try {
            const res = await apiRequest('/api/email/support/send', 'POST', {
                to,
                subject,
                html,
                cc,
                bcc,
                attachments: attachments.length > 0 ? attachments : undefined
            });

            if (res.success && res.data) {
                showToast(`Support email sent! ID: ${res.data.id}`, 'success');
                clearSupportComposer();
                switchSupportSubTab('tracker');
            } else {
                showToast(res.message || 'Failed to dispatch email', 'error');
            }
        } catch (err) {
            showToast('Failed to dispatch support email', 'error');
        } finally {
            if (btn) {
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            }
        }
    }

    async function loadSentHistory() {
        const tbody = document.getElementById('tracker-table-body');
        if (!tbody) return;

        try {
            const res = await apiRequest('/api/email/support/history?limit=50');
            if (res.success && Array.isArray(res.data)) {
                state.sentEmails = res.data;
                updateTrackerCounts();
                renderTrackerTable();
            } else {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6">
                            <div class="table-empty">
                                <div class="table-empty-text">No sent emails recorded in Resend.</div>
                            </div>
                        </td>
                    </tr>
                `;
            }
        } catch (err) {
            console.error('Failed to load sent history:', err);
        }
    }

    function populateSupportClientPicker() {
        const picker = document.getElementById('supp-client-picker');
        if (!picker) return;
        const clients = (state.clients || []).filter(c => c.email && c.email.includes('@'));
        picker.innerHTML = '<option value="">Pick Client...</option>' +
            clients.map(c => `<option value="${escapeHtml(c.email)}">${escapeHtml(c.org_name)} — ${escapeHtml(c.email)}</option>`).join('');
    }

    function pickSupportClientRecipient(email) {
        if (!email) return;
        const toInput = document.getElementById('supp-to-input');
        if (toInput) toInput.value = email;
    }

    function applySupportTemplate(templateKey) {
        const subjInput = document.getElementById('supp-subject-input');
        const canvas = document.getElementById('supp-editor-canvas');
        if (!canvas) return;

        const signatureBlock = `<br><hr style="border: none; border-top: 1px solid #e2e8f0; margin: 28px 0 20px 0;"><table cellpadding="0" cellspacing="0" border="0" style="border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;"><tr><td style="vertical-align: middle; padding-right: 14px;"><img src="/assets/cortexco-logo-200.png" alt="CortexCo" width="68" height="68" style="display: block; width: 68px; height: 68px; border-radius: 50%; object-fit: cover;"></td><td style="border-left: 2px solid #4f6ef7; width: 2px; padding: 0; height: 72px;"></td><td style="vertical-align: middle; padding-left: 14px;"><div style="font-size: 18px; font-weight: 800; color: #0f172a; line-height: 1.2;">Support Team</div><div style="font-size: 11px; color: #475569; margin-top: 2px;">CortexCo Engineering Infrastructure</div><div style="margin-top: 6px;"><a href="https://cortexco.in" target="_blank" style="color: #2563eb; text-decoration: none; font-size: 13px; font-weight: 500;">cortexco.in</a></div></td></tr></table>`;

        const templates = {
            welcome: {
                subject: 'Welcome to CortexCo — Your Workspace Onboarding Details',
                body: `<p>Hello,</p><p>Welcome to <strong>CortexCo</strong>! Your workspace entitlements are active and ready for deployment.</p><p>If you need any assistance binding machines or configuring connectors, reply directly to this message.</p>`
            },
            renewal: {
                subject: 'Action Recommended: CortexCo License Renewal Notice',
                body: `<p>Hello,</p><p>This is a friendly heads-up that your active CortexCo license is approaching its scheduled expiration window.</p><p>Please reply to confirm renewal terms so we can extend your validity seamlessly without service interruption.</p>`
            },
            quota: {
                subject: 'Seat Quota Expanded on Your CortexCo License',
                body: `<p>Hello,</p><p>We have increased the maximum bound machine seats on your CortexCo license as requested.</p><p>Additional workstations can now activate automatically via standard handshake startup.</p>`
            },
            resolved: {
                subject: 'Resolved: Your CortexCo Support Request',
                body: `<p>Hello,</p><p>We are writing to confirm that the issue reported for your CortexCo environment has been resolved and verified.</p><p>Let us know if you observe any further anomalies.</p>`
            }
        };

        const tpl = templates[templateKey];
        if (!tpl) return;
        if (subjInput) subjInput.value = tpl.subject;
        canvas.innerHTML = tpl.body + signatureBlock;
        showToast('Applied support email template', 'info');
    }

    function updateTrackerCounts() {
        const total = state.sentEmails.length;
        const delivered = state.sentEmails.filter(e => e.last_event === 'delivered').length;
        const opened = state.sentEmails.filter(e => e.last_event === 'opened' || e.last_event === 'clicked').length;
        const bounced = state.sentEmails.filter(e => e.last_event === 'bounced' || e.last_event === 'complained').length;
        const deliveryRate = total > 0 ? Math.round(((total - bounced) / total) * 100) : 100;

        const totalEl = document.getElementById('count-tracker-all');
        const delEl = document.getElementById('count-tracker-delivered');
        const openEl = document.getElementById('count-tracker-opened');
        const bncEl = document.getElementById('count-tracker-bounced');

        if (totalEl) totalEl.textContent = total;
        if (delEl) delEl.textContent = delivered;
        if (openEl) openEl.textContent = opened;
        if (bncEl) bncEl.textContent = bounced;

        const kpiTotal = document.getElementById('supp-kpi-total');
        const kpiDel = document.getElementById('supp-kpi-delivered');
        const kpiOpen = document.getElementById('supp-kpi-opened');
        const kpiRate = document.getElementById('supp-kpi-rate');

        if (kpiTotal) kpiTotal.textContent = total;
        if (kpiDel) kpiDel.textContent = delivered;
        if (kpiOpen) kpiOpen.textContent = opened;
        if (kpiRate) kpiRate.textContent = `${deliveryRate}%`;
    }

    function filterTracker(status, btnEl) {
        state.trackerFilter = status;
        document.querySelectorAll('[data-tracker-filter]').forEach(b => b.classList.remove('active'));
        if (btnEl) btnEl.classList.add('active');
        renderTrackerTable();
    }

    function renderTrackerTable() {
        const tbody = document.getElementById('tracker-table-body');
        if (!tbody) return;

        let filtered = state.sentEmails;
        if (state.trackerFilter && state.trackerFilter !== 'all') {
            if (state.trackerFilter === 'opened') {
                filtered = filtered.filter(e => e.last_event === 'opened' || e.last_event === 'clicked');
            } else if (state.trackerFilter === 'bounced') {
                filtered = filtered.filter(e => e.last_event === 'bounced' || e.last_event === 'complained');
            } else {
                filtered = filtered.filter(e => e.last_event === state.trackerFilter);
            }
        }

        const search = (document.getElementById('tracker-search-input')?.value || '').toLowerCase().trim();
        if (search) {
            filtered = filtered.filter(e => {
                const recipients = (Array.isArray(e.to) ? e.to.join(',') : String(e.to || '')).toLowerCase();
                const subj = (e.subject || '').toLowerCase();
                const id = (e.id || '').toLowerCase();
                return recipients.includes(search) || subj.includes(search) || id.includes(search);
            });
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6">
                        <div class="table-empty">
                            <div class="table-empty-text">No delivery telemetry matches your filter.</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map(item => {
            const status = (item.last_event || 'sent').toLowerCase();
            const recipientStr = Array.isArray(item.to) ? item.to.join(', ') : (item.to || '---');
            const pillClass = status;

            return `
                <tr>
                    <td>
                        <span style="font-size: 12.5px; font-weight: 500; color: var(--text-white);">${escapeHtml(recipientStr)}</span>
                    </td>
                    <td>
                        <span style="font-size: 12.5px; color: var(--text-primary);">${escapeHtml(item.subject || '(No Subject)')}</span>
                    </td>
                    <td>
                        <span style="font-size: 11.5px; font-family: var(--font-mono); color: var(--text-secondary);">${formatDate(item.created_at)}</span>
                    </td>
                    <td>
                        <span class="status-pill ${pillClass}" style="font-size: 10.5px; padding: 2px 7px;">
                            <span class="indicator-dot"></span>
                            <span style="text-transform: capitalize;">${escapeHtml(status)}</span>
                        </span>
                    </td>
                    <td>
                        <span class="key-pill" style="font-size: 10.5px; cursor: pointer;" title="Click to copy Resend Email ID" onclick="window.app.copyKey('${escapeHtml(item.id)}', this)">
                            ${escapeHtml(item.id ? item.id.substring(0, 18) + '...' : '---')}
                        </span>
                    </td>
                    <td class="align-right">
                        <button class="btn btn-secondary btn-sm" onclick="window.app.inspectEmailDelivery('${escapeHtml(item.id)}')">
                            Diagnostics
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async function inspectEmailDelivery(emailId) {
        if (!emailId || !emailId.trim()) return;
        emailId = emailId.trim();

        try {
            const res = await apiRequest(`/api/email/support/status/${encodeURIComponent(emailId)}`);
            if (res.success && res.data) {
                const data = res.data;
                const modal = document.getElementById('modal-email-status-inspect');
                const pill = document.getElementById('inspect-status-pill');
                const timeEl = document.getElementById('inspect-timestamp');
                const idEl = document.getElementById('inspect-email-id');
                const toEl = document.getElementById('inspect-recipient');
                const fromEl = document.getElementById('inspect-sender');
                const subjEl = document.getElementById('inspect-subject');
                const pre = document.getElementById('inspect-json-raw');

                if (pill) {
                    const st = (data.last_event || 'sent').toLowerCase();
                    pill.className = `status-pill ${st}`;
                    pill.innerHTML = `<span class="indicator-dot"></span><span style="text-transform: capitalize;">${escapeHtml(st)}</span>`;
                }

                if (timeEl) timeEl.textContent = formatDate(data.created_at);
                if (idEl) idEl.textContent = data.id || emailId;
                if (toEl) toEl.textContent = Array.isArray(data.to) ? data.to.join(', ') : (data.to || '---');
                if (fromEl) fromEl.textContent = data.from || '---';
                if (subjEl) subjEl.textContent = data.subject || '---';
                if (pre) pre.textContent = JSON.stringify(data, null, 2);

                if (modal) modal.classList.add('open');
            } else {
                showToast(res.message || 'Could not find email status for given ID', 'error');
            }
        } catch (err) {
            showToast('Failed to retrieve delivery diagnostics from Resend', 'error');
        }
    }

    function queryEmailStatusById() {
        const input = document.getElementById('supp-quick-id-input');
        const id = input?.value.trim();
        if (!id) {
            showToast('Please paste a Resend Email ID', 'error');
            return;
        }
        inspectEmailDelivery(id);
    }

    // --- INTERACTIVE LIVE PREVIEW MODAL ---

    function openLivePreview(type = 'broadcast') {
        state.currentPreviewType = type;
        const modal = document.getElementById('modal-email-preview');
        const fromHeader = document.getElementById('preview-from-header');
        const toHeader = document.getElementById('preview-to-header');
        const subjHeader = document.getElementById('preview-subject-header');
        const preheaderRow = document.getElementById('preview-preheader-row');
        const preheaderHeader = document.getElementById('preview-preheader-header');
        const iframe = document.getElementById('preview-render-frame');

        let fromText = '';
        let toText = '';
        let subjText = '';
        let preheaderText = '';
        let bodyHtml = '';

        if (type === 'broadcast') {
            fromText = 'CortexCo <no-reply@cortexco.in>';
            const audName = state.audiences.find(a => a.id === state.currentAudienceId)?.name || 'Target Audience';
            toText = `${audName} (All Active Subscribers)`;
            const campName = document.getElementById('bcast-campaign-name-input')?.value.trim();
            const rawSubj = document.getElementById('bcast-subject-input')?.value.trim();
            subjText = rawSubj || (campName ? `Campaign: ${campName}` : 'Untitled Broadcast');
            preheaderText = document.getElementById('bcast-preview-text-input')?.value.trim() || '';

            if (state.broadcastEditorMode === 'html') {
                bodyHtml = document.getElementById('bcast-editor-raw')?.value.trim() || '<p>Empty broadcast body</p>';
            } else {
                bodyHtml = document.getElementById('bcast-editor-canvas')?.innerHTML.trim() || '<p>Empty broadcast body</p>';
            }

            // Substitute sample values for preview merge tags
            bodyHtml = bodyHtml
                .replace(/\{\{\{contact\.first_name\|?.*?\}\}\}/g, 'Alex')
                .replace(/\{\{\{contact\.last_name\}\}\}/g, 'Vance')
                .replace(/\{\{\{contact\.email\}\}\}/g, 'alex.vance@example.com')
                .replace(/\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/g, '#unsubscribe');

        } else {
            fromText = 'CortexCo Support <support@cortexco.in>';
            toText = document.getElementById('supp-to-input')?.value.trim() || 'client@company.com';
            subjText = document.getElementById('supp-subject-input')?.value.trim() || 'CortexCo Support Inquiry';
            preheaderText = '';
            bodyHtml = document.getElementById('supp-editor-canvas')?.innerHTML.trim() || '<p>Empty email body</p>';
        }

        if (fromHeader) fromHeader.textContent = fromText;
        if (toHeader) toHeader.textContent = toText;
        if (subjHeader) subjHeader.textContent = subjText;

        if (preheaderRow && preheaderHeader) {
            if (preheaderText) {
                preheaderHeader.textContent = preheaderText;
                preheaderRow.style.display = 'flex';
            } else {
                preheaderRow.style.display = 'none';
            }
        }

        if (iframe) {
            const styledDocument = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body {
                            margin: 0;
                            padding: 24px;
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                            font-size: 14px;
                            line-height: 1.6;
                            color: #1e293b;
                            background: #ffffff;
                        }
                        div, p { margin: 0; padding: 0; line-height: 1.5; }
                        h1, h2, h3 { color: #0f172a; margin: 18px 0 10px 0; }
                        blockquote {
                            border-left: 3px solid #3b82f6;
                            padding-left: 12px;
                            margin: 14px 0;
                            color: #64748b;
                        }
                        ul, ol { margin: 10px 0 14px 24px; }
                        li { margin-bottom: 4px; }
                        img { max-width: 100%; height: auto; border-radius: 4px; }
                    </style>
                </head>
                <body>
                    ${bodyHtml}
                </body>
                </html>
            `;
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            if (doc) {
                doc.open();
                doc.write(styledDocument);
                doc.close();
            }
        }

        setPreviewDevice('desktop');
        if (modal) modal.classList.add('open');
    }

    function setPreviewDevice(device) {
        state.previewDevice = device;
        const wrapper = document.getElementById('preview-canvas-wrapper');
        const btnDesktop = document.getElementById('btn-preview-desktop');
        const btnMobile = document.getElementById('btn-preview-mobile');

        if (device === 'mobile') {
            if (wrapper) wrapper.classList.add('mobile-frame');
            if (btnDesktop) btnDesktop.classList.remove('active');
            if (btnMobile) btnMobile.classList.add('active');
        } else {
            if (wrapper) wrapper.classList.remove('mobile-frame');
            if (btnDesktop) btnDesktop.classList.add('active');
            if (btnMobile) btnMobile.classList.remove('active');
        }
    }

    function closeModals() {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
        if (state.confirmResolver) {
            const resolver = state.confirmResolver;
            state.confirmResolver = null;
            resolver(false);
        }
    }

    function showConfirmModal(title, message, confirmLabel = 'Confirm') {
        return new Promise((resolve) => {
            const modal = document.getElementById('modal-confirm');
            const titleEl = document.getElementById('confirm-modal-title');
            const msgEl = document.getElementById('confirm-modal-message');
            const okBtn = document.getElementById('confirm-modal-ok');

            if (!modal || !okBtn) {
                resolve(window.confirm(`${title}\n\n${message}`));
                return;
            }

            if (state.confirmResolver) {
                state.confirmResolver(false);
            }
            state.confirmResolver = resolve;

            if (titleEl) titleEl.textContent = title || 'Confirm Action';
            if (msgEl) msgEl.textContent = message || '';
            okBtn.textContent = confirmLabel || 'Confirm';
            okBtn.onclick = () => closeConfirmModal(true);
            modal.classList.add('open');
        });
    }

    function closeConfirmModal(confirmed) {
        const modal = document.getElementById('modal-confirm');
        if (modal) modal.classList.remove('open');
        if (state.confirmResolver) {
            const resolver = state.confirmResolver;
            state.confirmResolver = null;
            resolver(Boolean(confirmed));
        }
    }

    function copyKey(text, btn) {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            showToast('Copied to clipboard', 'info');
            if (btn) {
                const originalHtml = btn.innerHTML;
                btn.innerHTML = `<span style="color: var(--emerald); font-size: 10px; font-weight: 600;">COPIED</span>`;
                setTimeout(() => { btn.innerHTML = originalHtml; }, 1500);
            }
        });
    }

    function updateLiveClock() {
        const clockEl = document.getElementById('live-clock');
        if (!clockEl) return;
        const now = new Date();
        let hours = now.getHours();
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        clockEl.textContent = `${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
    }

    async function checkSystemHealth(showFeedback = false) {
        const pill = document.getElementById('env-health-pill');
        const text = document.getElementById('env-health-text');
        const latencyEl = document.getElementById('dash-api-latency');
        const clusterPill = document.getElementById('dash-cluster-status-pill');
        const t0 = performance.now();

        try {
            const res = await fetch('/api/health', { headers: { 'Accept': 'application/json' } });
            const ms = Math.max(1, Math.round(performance.now() - t0));
            const data = await res.json().catch(() => ({}));
            const ok = res.ok && (data.status === 'ok' || data.success !== false);
            state.systemHealth = { ok, ms, ...data };

            if (text) text.textContent = ok ? `System Online (${ms}ms)` : 'Degraded';
            if (pill) {
                pill.classList.toggle('degraded', !ok);
            }
            if (latencyEl) {
                latencyEl.textContent = ok ? `${ms} ms • DB ${data.database || 'connected'}` : 'Degraded';
                latencyEl.style.color = ok ? 'var(--emerald)' : 'var(--ruby)';
            }
            if (clusterPill) {
                clusterPill.className = `status-pill ${ok ? 'active' : 'revoked'}`;
                clusterPill.style.fontSize = '11px';
                clusterPill.textContent = ok ? 'Operational' : 'Degraded';
            }
            if (showFeedback) {
                showToast(ok ? `API & Database healthy (${ms}ms latency)` : 'Health check reported degraded state', ok ? 'success' : 'error');
            }
        } catch (err) {
            if (text) text.textContent = 'Offline';
            if (latencyEl) {
                latencyEl.textContent = 'Unreachable';
                latencyEl.style.color = 'var(--ruby)';
            }
            if (clusterPill) {
                clusterPill.className = 'status-pill revoked';
                clusterPill.textContent = 'Offline';
            }
            if (showFeedback) showToast('Failed to reach /api/health', 'error');
        }
    }

    function setAutoRefresh(seconds) {
        if (state.autoRefreshTimer) {
            clearInterval(state.autoRefreshTimer);
            state.autoRefreshTimer = null;
        }
        const sec = parseInt(seconds, 10) || 0;
        state.autoRefreshSeconds = sec;
        if (sec > 0) {
            state.autoRefreshTimer = setInterval(() => {
                if (!getAuthToken()) return;
                loadLicenses();
                loadClients();
                loadAnalytics();
                if (state.currentTab === 'devices') loadGlobalDevices();
                if (state.currentTab === 'telemetry') loadLogs();
            }, sec * 1000);
            showToast(`Auto-refresh active every ${sec}s`, 'info');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEAM & SECURITY CONTROL (Admins + In-Memory Rate Limit Telemetry)
    // ─────────────────────────────────────────────────────────────────────────
    async function loadAdminsTab() {
        const [adminsRes, secRes, healthRes] = await Promise.all([
            apiRequest('/api/admin'),
            apiRequest('/api/admin/security-status'),
            fetch('/api/health').then(r => r.json()).catch(() => null)
        ]);

        if (adminsRes && adminsRes.success && Array.isArray(adminsRes.data)) {
            state.admins = adminsRes.data;
            renderAdminsTable();
        }

        if (secRes && secRes.success && secRes.data) {
            state.securityStatus = secRes.data;
            const rl = secRes.data.authRateLimit || secRes.data.loginRateLimit || {};
            const rlVal = document.getElementById('sec-rate-limit-val');
            const rlSub = document.getElementById('sec-rate-limit-sub');
            const algEl = document.getElementById('sec-token-alg');
            const metaEl = document.getElementById('sec-health-meta');
            const healthStatusEl = document.getElementById('sec-health-status');

            const windowSec = rl.windowSeconds || (rl.windowMs ? Math.round(rl.windowMs / 1000) : 60);
            const storeLabel = rl.storeBackend === 'in-memory-ram' ? 'In-Memory RAM' : (rl.storeBackend || 'In-Memory RAM');
            const tracked = Number(rl.trackedClients ?? rl.activeTrackedClients ?? 0);

            if (rlVal) rlVal.textContent = `${rl.maxRequests || 10} req / ${windowSec}s`;
            if (rlSub) rlSub.textContent = `${storeLabel} • ${tracked} active IP bucket(s)`;
            if (algEl) algEl.textContent = secRes.data.tokenAlgorithm || 'HMAC-SHA256';
            if (metaEl) metaEl.textContent = `Env: ${secRes.data.environment || 'standalone'} • Uptime: ${Math.floor((secRes.data.uptimeSeconds || 0) / 60)}m`;
            if (healthStatusEl && healthRes) {
                const ok = healthRes.status === 'ok' || healthRes.success !== false;
                healthStatusEl.textContent = ok ? 'Online' : 'Degraded';
                healthStatusEl.style.color = ok ? 'var(--emerald)' : 'var(--ruby)';
            }
        }
    }

    function renderAdminsTable() {
        const tbody = document.getElementById('admins-table-body');
        const countEl = document.getElementById('sec-admin-count');
        const admins = state.admins || [];
        if (countEl) countEl.textContent = admins.length;
        if (!tbody) return;

        if (admins.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6"><div class="table-empty"><div class="table-empty-text">No administrators found</div></div></td></tr>';
            return;
        }

        const isSuper = state.currentAdmin?.role === 'super_admin';
        tbody.innerHTML = admins.map(a => {
            const isSelf = Number(state.currentAdmin?.id) === Number(a.id);
            const roleLabel = a.role === 'super_admin' ? 'Super Admin' : 'Operator Admin';
            return `
                <tr>
                    <td><strong style="color: var(--text-white);">${escapeHtml(a.name)}</strong>${isSelf ? ' <span class="badge-metric" style="margin-left:4px;">You</span>' : ''}</td>
                    <td><span class="font-mono" style="font-size: 12px;">${escapeHtml(a.email)}</span></td>
                    <td><span class="status-pill ${a.role === 'super_admin' ? 'active' : 'suspended'}" style="font-size: 10.5px;">${roleLabel}</span></td>
                    <td><span class="status-pill ${a.is_active ? 'active' : 'revoked'}" style="font-size: 10.5px;">${a.is_active ? 'Active' : 'Disabled'}</span></td>
                    <td><span style="font-size: 11.5px; color: var(--text-muted);">${formatDate(a.created_at)}</span></td>
                    <td class="align-right">
                        <div class="row-actions">
                            <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.editAdminUser(${Number(a.id)})">Edit</button>
                            ${!isSelf ? `<button type="button" class="btn btn-danger btn-sm" onclick="window.app.deleteAdminUser(${Number(a.id)})" ${!isSuper ? 'title="Super Admin privileges required"' : ''}>Remove</button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function openAdminModal(adminObj = null) {
        const modal = document.getElementById('modal-admin-form');
        const title = document.getElementById('admin-modal-title');
        const idInput = document.getElementById('admin-form-id');
        const nameInput = document.getElementById('admin-form-name');
        const emailInput = document.getElementById('admin-form-email');
        const roleSelect = document.getElementById('admin-form-role');
        const pwdInput = document.getElementById('admin-form-password');
        const pwdHint = document.getElementById('admin-pwd-hint');

        if (!modal) return;
        if (adminObj) {
            if (title) title.textContent = `Edit Administrator: ${adminObj.name}`;
            if (idInput) idInput.value = adminObj.id;
            if (nameInput) nameInput.value = adminObj.name || '';
            if (emailInput) emailInput.value = adminObj.email || '';
            if (roleSelect) roleSelect.value = adminObj.role || 'admin';
            if (pwdInput) { pwdInput.value = ''; pwdInput.required = false; }
            if (pwdHint) pwdHint.textContent = '(leave blank to keep current password)';
        } else {
            if (title) title.textContent = 'Add Administrator';
            if (idInput) idInput.value = '';
            if (nameInput) nameInput.value = '';
            if (emailInput) emailInput.value = '';
            if (roleSelect) roleSelect.value = 'admin';
            if (pwdInput) { pwdInput.value = ''; pwdInput.required = true; }
            if (pwdHint) pwdHint.textContent = '(min 6 chars, required)';
        }
        modal.classList.add('open');
    }

    function editAdminUser(adminId) {
        const admin = state.admins.find(a => Number(a.id) === Number(adminId));
        if (admin) openAdminModal(admin);
    }

    async function deleteAdminUser(adminId) {
        const admin = state.admins.find(a => Number(a.id) === Number(adminId));
        const ok = await showConfirmModal('Remove Administrator', `Revoke console access for "${admin?.email || adminId}"?`);
        if (!ok) return;
        const res = await apiRequest(`/api/admin/${adminId}`, 'DELETE');
        if (res.success) {
            showToast('Administrator removed', 'success');
            await loadAdminsTab();
        } else {
            showToast(res.message || 'Failed to delete administrator (Super Admin required)', 'error');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // COMMAND PALETTE (Ctrl+K / Cmd+K)
    // ─────────────────────────────────────────────────────────────────────────
    function openCommandPalette() {
        const modal = document.getElementById('modal-cmdk');
        const input = document.getElementById('cmdk-input');
        if (!modal) return;
        modal.classList.add('open');
        if (input) {
            input.value = '';
            setTimeout(() => input.focus(), 20);
        }
        state.cmdkIndex = 0;
        renderCommandPalette('');
    }

    function buildCommandItems(query) {
        const q = (query || '').toLowerCase().trim();
        const navItems = [
            { section: 'Navigation', label: 'Executive Dashboard', meta: 'Tab 1', action: () => switchTab('dashboard') },
            { section: 'Navigation', label: 'Licenses & Entitlements', meta: 'Tab 2', action: () => switchTab('licenses') },
            { section: 'Navigation', label: 'Hardware Fleet Devices', meta: 'Tab 3', action: () => switchTab('devices') },
            { section: 'Navigation', label: 'Client Organizations', meta: 'Tab 4', action: () => switchTab('clients') },
            { section: 'Navigation', label: 'Telemetry Audit Stream', meta: 'Tab 5', action: () => switchTab('telemetry') },
            { section: 'Navigation', label: 'Broadcasts & Segments', meta: 'Resend', action: () => switchTab('broadcasts') },
            { section: 'Navigation', label: 'Support 1-to-1 Mail', meta: 'Resend', action: () => switchTab('support-mail') },
            { section: 'Navigation', label: 'Team & Security Control', meta: 'Admins & Rate Limit', action: () => switchTab('admins') },
            { section: 'Quick Actions', label: 'Issue New Cryptographic License', meta: 'Create Key', action: () => openIssueModal() },
            { section: 'Quick Actions', label: 'Register Client Organization', meta: 'New Client', action: () => { const m = document.getElementById('modal-add-client'); if (m) m.classList.add('open'); } },
            { section: 'Quick Actions', label: 'Export Licenses CSV', meta: 'Download', action: () => exportLicensesCsv() },
            { section: 'Quick Actions', label: 'Export Telemetry CSV', meta: 'Download', action: () => exportTelemetryCsv() },
            { section: 'Quick Actions', label: 'Run Live API Health Check', meta: '/api/health', action: () => checkSystemHealth(true) }
        ];

        const licenseItems = (state.licenses || []).slice(0, 60).map(l => ({
            section: 'Licenses',
            label: `${l.license_key} — ${l.org_name || 'Organization'}`,
            meta: `${l.status || 'active'} • ${l.bound_machines_count || 0}/${l.max_machines || 1} seats`,
            action: () => {
                switchTab('licenses');
                const search = document.getElementById('license-search-input');
                if (search) {
                    search.value = l.license_key;
                    state.searchQuery = l.license_key;
                    renderLicensesTable();
                }
            }
        }));

        const clientItems = (state.clients || []).slice(0, 40).map(c => ({
            section: 'Clients',
            label: c.org_name,
            meta: `${c.email || ''} • ${c.status || 'active'}`,
            action: () => openClientDetailModal(c.id)
        }));

        const all = [...navItems, ...licenseItems, ...clientItems];
        if (!q) return all.slice(0, 14);
        return all.filter(item =>
            item.label.toLowerCase().includes(q) ||
            item.meta.toLowerCase().includes(q) ||
            item.section.toLowerCase().includes(q)
        ).slice(0, 18);
    }

    function renderCommandPalette(query) {
        const container = document.getElementById('cmdk-results');
        if (!container) return;

        const items = buildCommandItems(query);
        state.cmdkItems = items;
        if (state.cmdkIndex >= items.length) state.cmdkIndex = 0;

        if (items.length === 0) {
            container.innerHTML = '<div class="table-empty" style="padding: 26px;"><div class="table-empty-text">No matching commands, licenses, or organizations</div></div>';
            return;
        }

        let lastSection = '';
        container.innerHTML = items.map((item, idx) => {
            const heading = item.section !== lastSection
                ? `<div class="cmdk-section-label">${escapeHtml(item.section)}</div>`
                : '';
            lastSection = item.section;
            return `${heading}<button type="button" class="cmdk-item ${idx === state.cmdkIndex ? 'selected' : ''}" data-cmdk-idx="${idx}"><span>${escapeHtml(item.label)}</span><span class="cmdk-item-meta">${escapeHtml(item.meta)}</span></button>`;
        }).join('');

        container.querySelectorAll('.cmdk-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = Number(btn.getAttribute('data-cmdk-idx'));
                executeCommandItem(idx);
            });
        });
    }

    function executeCommandItem(idx) {
        const item = state.cmdkItems?.[idx];
        if (!item) return;
        closeModals();
        item.action();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EVENT LISTENERS & RESILIENT EVENT DELEGATION
    // ─────────────────────────────────────────────────────────────────────────
    function setupEventListeners() {
        // Document-Level Event Delegation for Tab Switching (Never Fails)
        document.addEventListener('click', (e) => {
            const tabBtn = e.target.closest('[data-tab]');
            if (tabBtn) {
                e.preventDefault();
                const tab = tabBtn.getAttribute('data-tab');
                if (tab) switchTab(tab);
            }
        });

        // Mobile Sidebar Drawer Toggle & Backdrop
        const btnMobileMenu = document.getElementById('btn-mobile-menu');
        if (btnMobileMenu) btnMobileMenu.addEventListener('click', () => toggleMobileSidebar());
        const sidebarBackdrop = document.getElementById('sidebar-backdrop');
        if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', () => toggleMobileSidebar(false));

        // Command Palette Trigger & Search Input
        const btnOpenCmdk = document.getElementById('btn-open-cmdk');
        if (btnOpenCmdk) btnOpenCmdk.addEventListener('click', openCommandPalette);
        const cmdkInput = document.getElementById('cmdk-input');
        if (cmdkInput) {
            cmdkInput.addEventListener('input', (e) => {
                state.cmdkIndex = 0;
                renderCommandPalette(e.target.value);
            });
            cmdkInput.addEventListener('keydown', (e) => {
                if (!state.cmdkItems || state.cmdkItems.length === 0) return;
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    state.cmdkIndex = (state.cmdkIndex + 1) % state.cmdkItems.length;
                    renderCommandPalette(cmdkInput.value);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    state.cmdkIndex = (state.cmdkIndex - 1 + state.cmdkItems.length) % state.cmdkItems.length;
                    renderCommandPalette(cmdkInput.value);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    executeCommandItem(state.cmdkIndex);
                }
            });
        }

        // Topbar Auto-Refresh Interval
        const autoRefreshSelect = document.getElementById('auto-refresh-select');
        if (autoRefreshSelect) {
            autoRefreshSelect.addEventListener('change', (e) => setAutoRefresh(e.target.value));
        }

        // Dashboard Range Switcher & Distribution Tabs
        document.querySelectorAll('#dash-range-switcher .range-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                loadAnalytics(btn.getAttribute('data-range') || '24h');
            });
        });

        document.querySelectorAll('#dash-dist-tabs .mini-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                state.distTab = btn.getAttribute('data-dist') || 'platforms';
                renderAnalyticsDistribution();
            });
        });

        // Dismiss Modals When Clicking on Modal Backdrop (Blank Space)
        document.addEventListener('click', (e) => {
            if (e.target && e.target.classList && e.target.classList.contains('modal-overlay')) {
                closeModals();
            }
        });

        // License Filter Pills & Sort
        document.querySelectorAll('#pane-licenses .filter-pill[data-filter]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#pane-licenses .filter-pill[data-filter]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.filterStatus = btn.getAttribute('data-filter') || 'all';
                renderLicensesTable();
            });
        });

        const licenseSortSelect = document.getElementById('license-sort-select');
        if (licenseSortSelect) {
            licenseSortSelect.addEventListener('change', (e) => {
                state.licenseSort = e.target.value;
                renderLicensesTable();
            });
        }

        // Device Filter Pills & Platform Select
        document.querySelectorAll('.device-filter-pill[data-device-filter]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.device-filter-pill[data-device-filter]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.deviceFilter = btn.getAttribute('data-device-filter') || 'all';
                renderGlobalDevicesTable();
            });
        });

        const devicesPlatformFilter = document.getElementById('devices-platform-filter');
        if (devicesPlatformFilter) {
            devicesPlatformFilter.addEventListener('change', (e) => {
                state.devicePlatformFilter = e.target.value;
                renderGlobalDevicesTable();
            });
        }

        // Client Filter Pills
        document.querySelectorAll('.client-filter-pill[data-client-filter]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.client-filter-pill[data-client-filter]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.clientFilter = btn.getAttribute('data-client-filter') || 'all';
                renderClientsTable();
            });
        });

        // License Search Field
        const searchInput = document.getElementById('license-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                state.searchQuery = e.target.value;
                renderLicensesTable();
            });
        }

        // Global Devices Search Field
        const devicesSearchInput = document.getElementById('devices-search-input');
        if (devicesSearchInput) {
            devicesSearchInput.addEventListener('input', (e) => {
                state.devicesSearchQuery = e.target.value;
                renderGlobalDevicesTable();
            });
        }

        // Global Keyboard Shortcuts (Escape, Ctrl/Cmd+K outside email editors, '/' search, 1-8 tabs)
        document.addEventListener('keydown', (e) => {
            const active = document.activeElement;
            const inEditorCanvas = Boolean(active && active.closest && active.closest('.gmail-canvas'));
            const isTypingField = Boolean(active && (
                active.tagName === 'INPUT' ||
                active.tagName === 'TEXTAREA' ||
                active.tagName === 'SELECT' ||
                active.isContentEditable
            ));

            if (e.key === 'Escape') {
                closeModals();
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                if (!inEditorCanvas && getAuthToken()) {
                    e.preventDefault();
                    openCommandPalette();
                }
                return;
            }

            if (isTypingField) return;

            if (e.key === '/') {
                e.preventDefault();
                const search = document.getElementById('license-search-input');
                if (search) search.focus();
            } else if (e.key === '1') switchTab('dashboard');
            else if (e.key === '2') switchTab('licenses');
            else if (e.key === '3') switchTab('devices');
            else if (e.key === '4') switchTab('clients');
            else if (e.key === '5') switchTab('telemetry');
            else if (e.key === '6') switchTab('broadcasts');
            else if (e.key === '7') switchTab('support-mail');
            else if (e.key === '8') switchTab('admins');
        });

        // Refresh Button
        const btnRefresh = document.getElementById('btn-refresh');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', async () => {
                await Promise.all([loadLicenses(), loadClients(), loadGlobalDevices(), loadLogs(), loadAnalytics(), checkSystemHealth(false)]);
                showToast('Workspace data refreshed', 'info');
            });
        }

        const btnRefreshDev = document.getElementById('btn-refresh-devices');
        if (btnRefreshDev) btnRefreshDev.addEventListener('click', loadGlobalDevices);

        // Open Issue Modal
        const btnOpenIssue = document.getElementById('btn-open-issue');
        if (btnOpenIssue) btnOpenIssue.addEventListener('click', () => openIssueModal());

        // Issued License Reveal Modal Actions
        const btnCopyIssued = document.getElementById('btn-copy-issued-key');
        if (btnCopyIssued) {
            btnCopyIssued.addEventListener('click', () => {
                if (state.lastIssuedLicense?.license_key) {
                    copyKey(state.lastIssuedLicense.license_key, btnCopyIssued);
                }
            });
        }

        const btnEmailIssued = document.getElementById('btn-email-issued-key');
        if (btnEmailIssued) {
            btnEmailIssued.addEventListener('click', () => {
                const issued = state.lastIssuedLicense;
                closeModals();
                switchTab('support-mail');
                if (!issued) return;
                const toInput = document.getElementById('supp-to-input');
                const subjInput = document.getElementById('supp-subject-input');
                const editor = document.getElementById('supp-editor-canvas');
                if (toInput && issued.email) toInput.value = issued.email;
                if (subjInput) subjInput.value = `Your CortexCo License Key (${issued.org_name || 'Organization'})`;
                if (editor) {
                    editor.innerHTML = `<p>Hello ${escapeHtml(issued.contact_name || issued.org_name || 'Team')},</p><p>Your CortexCo cryptographic license key has been provisioned:</p><p><strong style="font-family: monospace; font-size: 15px;">${escapeHtml(issued.license_key)}</strong></p><p>Seats Allocated: ${Number(issued.max_machines || 1)} machine(s)<br>Validity: ${Number(issued.validity_days || 365)} days</p><p>Keep this key secure. Reach out if you need additional hardware seats.</p>`;
                }
            });
        }

        // Open Add Client Modal
        const btnOpenAddClient = document.getElementById('btn-open-add-client');
        if (btnOpenAddClient) {
            btnOpenAddClient.addEventListener('click', () => {
                const modal = document.getElementById('modal-add-client');
                if (modal) modal.classList.add('open');
            });
        }

        // Form: Issue License (sends validity_days matching backend LicenseController.create)
        const formIssue = document.getElementById('form-issue-license');
        if (formIssue) {
            formIssue.addEventListener('submit', async (e) => {
                e.preventDefault();
                const clientId = document.getElementById('issue-client-id')?.value;
                const maxMachines = parseInt(document.getElementById('issue-max-machines')?.value, 10) || 1;
                const durationPreset = document.getElementById('issue-expiry-preset')?.value || '365';
                const notes = document.getElementById('issue-notes')?.value || '';

                if (!clientId) {
                    showToast('Select an organization', 'error');
                    return;
                }

                const validityDays = durationPreset === 'perpetual' ? 3650 : (parseInt(durationPreset, 10) || 365);

                const res = await apiRequest('/api/license', 'POST', {
                    client_id: clientId,
                    max_machines: maxMachines,
                    validity_days: validityDays,
                    notes
                });

                if (res.success && res.data) {
                    const client = state.clients.find(c => String(c.id) === String(clientId));
                    state.lastIssuedLicense = {
                        ...res.data,
                        org_name: client?.org_name || 'Organization',
                        email: client?.email || '',
                        contact_name: client?.contact_name || '',
                        validity_days: validityDays
                    };
                    closeModals();
                    formIssue.reset();
                    await Promise.all([loadLicenses(), loadClients(), loadAnalytics()]);

                    const issuedModal = document.getElementById('modal-license-issued');
                    const orgEl = document.getElementById('issued-modal-org');
                    const keyEl = document.getElementById('issued-modal-key');
                    const metaEl = document.getElementById('issued-modal-meta');
                    if (orgEl) orgEl.textContent = state.lastIssuedLicense.org_name;
                    if (keyEl) keyEl.textContent = res.data.license_key || '---';
                    if (metaEl) metaEl.textContent = `Max Seats: ${maxMachines} machine(s) • Validity: ${validityDays} days`;
                    if (issuedModal) issuedModal.classList.add('open');
                } else {
                    showToast(res.message || 'Failed to issue license', 'error');
                }
            });
        }

        // Form: Edit License
        const formEdit = document.getElementById('form-edit-license');
        if (formEdit) {
            formEdit.addEventListener('submit', async (e) => {
                e.preventDefault();
                const licenseId = document.getElementById('edit-license-id')?.value;
                const maxMachines = parseInt(document.getElementById('edit-max-machines')?.value, 10) || 1;
                const status = document.getElementById('edit-license-status')?.value || 'active';
                const expiryVal = document.getElementById('edit-expiry-date')?.value;

                const payload = {
                    max_machines: maxMachines,
                    status
                };
                if (expiryVal) {
                    payload.expiry_date = new Date(expiryVal).toISOString();
                }

                const res = await apiRequest(`/api/license/${licenseId}`, 'PUT', payload);
                if (res.success) {
                    showToast('License parameters updated', 'success');
                    closeModals();
                    await loadLicenses();
                    loadGlobalDevices();
                    loadAnalytics();
                } else {
                    showToast(res.message || 'Failed to update license', 'error');
                }
            });
        }

        // HWID Manager Actions
        const btnUpdateQuota = document.getElementById('btn-update-hwid-quota');
        if (btnUpdateQuota) btnUpdateQuota.addEventListener('click', updateHwidQuota);

        const btnResetAll = document.getElementById('btn-reset-all-hwids');
        if (btnResetAll) btnResetAll.addEventListener('click', resetAllHwids);

        const btnAddManual = document.getElementById('btn-add-manual-hwid');
        if (btnAddManual) btnAddManual.addEventListener('click', addManualHwid);

        // Form: Add Client
        const formAddClient = document.getElementById('form-add-client');
        if (formAddClient) {
            formAddClient.addEventListener('submit', async (e) => {
                e.preventDefault();
                const payload = {
                    org_name: document.getElementById('add-client-org')?.value.trim(),
                    contact_name: document.getElementById('add-client-contact')?.value.trim(),
                    email: document.getElementById('add-client-email')?.value.trim(),
                    phone: document.getElementById('add-client-phone')?.value.trim()
                };

                const res = await apiRequest('/api/clients', 'POST', payload);
                if (res.success) {
                    showToast('Client organization registered', 'success');
                    closeModals();
                    formAddClient.reset();
                    await loadClients();
                    loadAnalytics();
                } else {
                    showToast(res.message || 'Failed to register client', 'error');
                }
            });
        }

        // Form: Edit Client
        const formEditClient = document.getElementById('form-edit-client');
        if (formEditClient) {
            formEditClient.addEventListener('submit', async (e) => {
                e.preventDefault();
                const clientId = document.getElementById('edit-client-id')?.value;
                const payload = {
                    org_name: document.getElementById('edit-client-org')?.value.trim(),
                    contact_name: document.getElementById('edit-client-contact')?.value.trim(),
                    email: document.getElementById('edit-client-email')?.value.trim(),
                    phone: document.getElementById('edit-client-phone')?.value.trim(),
                    status: document.getElementById('edit-client-status')?.value
                };

                const res = await apiRequest(`/api/clients/${clientId}`, 'PUT', payload);
                if (res.success) {
                    showToast('Client organization updated', 'success');
                    closeModals();
                    await loadClients();
                } else {
                    showToast(res.message || 'Failed to update client', 'error');
                }
            });
        }

        // Form: Add / Edit Administrator
        const formAdminUser = document.getElementById('form-admin-user');
        if (formAdminUser) {
            formAdminUser.addEventListener('submit', async (e) => {
                e.preventDefault();
                const adminId = document.getElementById('admin-form-id')?.value;
                const name = document.getElementById('admin-form-name')?.value.trim();
                const email = document.getElementById('admin-form-email')?.value.trim();
                const role = document.getElementById('admin-form-role')?.value || 'admin';
                const password = document.getElementById('admin-form-password')?.value || '';

                if (!name || !email) {
                    showToast('Name and email are required', 'error');
                    return;
                }

                const submitBtn = document.getElementById('btn-submit-admin-form');
                if (submitBtn) submitBtn.disabled = true;

                try {
                    let res;
                    if (adminId) {
                        const payload = { name, email, role };
                        if (password.trim()) payload.password = password;
                        res = await apiRequest(`/api/admin/${adminId}`, 'PUT', payload);
                    } else {
                        if (password.length < 6) {
                            showToast('Password must be at least 6 characters', 'error');
                            return;
                        }
                        res = await apiRequest('/api/admin', 'POST', { name, email, role, password });
                    }

                    if (res.success) {
                        showToast(adminId ? 'Administrator updated' : 'Administrator created', 'success');
                        closeModals();
                        await loadAdminsTab();
                    } else {
                        showToast(res.message || 'Failed to save administrator', 'error');
                    }
                } finally {
                    if (submitBtn) submitBtn.disabled = false;
                }
            });
        }

        // Telemetry Logs Refresh & Filter
        const btnRefreshLogs = document.getElementById('btn-refresh-logs');
        if (btnRefreshLogs) btnRefreshLogs.addEventListener('click', loadLogs);

        const logActionFilter = document.getElementById('log-action-filter');
        if (logActionFilter) logActionFilter.addEventListener('change', loadLogs);

        const logStatusFilter = document.getElementById('log-status-filter');
        if (logStatusFilter) logStatusFilter.addEventListener('change', renderLogsTable);

        const logSearchInput = document.getElementById('log-search-input');
        if (logSearchInput) logSearchInput.addEventListener('input', renderLogsTable);

        // Client Search
        const clientSearchInput = document.getElementById('client-search-input');
        if (clientSearchInput) clientSearchInput.addEventListener('input', renderClientsTable);

        // Master Session Authentication Form & Logout Button
        const formLogin = document.getElementById('form-admin-login');
        if (formLogin) {
            formLogin.addEventListener('submit', (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleLoginSubmit(e);
                return false;
            });
        }

        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleLogout();
            });
        }

        // ─── RESEND BROADCASTS & AUDIENCES EVENT LISTENERS ───
        const bcastAudienceSelect = document.getElementById('bcast-audience-select');
        if (bcastAudienceSelect) {
            bcastAudienceSelect.addEventListener('change', async (e) => {
                state.currentAudienceId = e.target.value;
                const composeSelect = document.getElementById('bcast-compose-audience');
                if (composeSelect) composeSelect.value = state.currentAudienceId;
                updateAudienceMetrics();
                await loadContacts(state.currentAudienceId);
            });
        }

        const btnOpenNewAudience = document.getElementById('btn-open-new-audience');
        if (btnOpenNewAudience) {
            btnOpenNewAudience.addEventListener('click', () => {
                const modal = document.getElementById('modal-new-audience');
                if (modal) modal.classList.add('open');
            });
        }

        const formNewAudience = document.getElementById('form-new-audience');
        if (formNewAudience) {
            formNewAudience.addEventListener('submit', async (e) => {
                e.preventDefault();
                const nameInput = document.getElementById('new-audience-name');
                const name = nameInput?.value.trim();
                if (!name) return;

                const submitBtn = document.getElementById('btn-submit-new-audience');
                if (submitBtn) submitBtn.disabled = true;

                try {
                    const res = await apiRequest('/api/email/segments', 'POST', { name });
                    if (res.success) {
                        showToast(`Audience "${name}" created in Resend`, 'success');
                        closeModals();
                        formNewAudience.reset();
                        await loadAudiences();
                    } else {
                        showToast(res.message || 'Failed to create audience', 'error');
                    }
                } catch {
                    showToast('Failed to connect to Resend API', 'error');
                } finally {
                    if (submitBtn) submitBtn.disabled = false;
                }
            });
        }

        const btnDeleteAudience = document.getElementById('btn-delete-audience');
        if (btnDeleteAudience) {
            btnDeleteAudience.addEventListener('click', deleteCurrentAudience);
        }

        const contactsSearchInput = document.getElementById('contacts-search-input');
        if (contactsSearchInput) {
            contactsSearchInput.addEventListener('input', renderContactsTable);
        }

        const contactsStatusFilter = document.getElementById('contacts-status-filter');
        if (contactsStatusFilter) {
            contactsStatusFilter.addEventListener('change', renderContactsTable);
        }

        const btnOpenAddContact = document.getElementById('btn-open-add-contact');
        if (btnOpenAddContact) {
            btnOpenAddContact.addEventListener('click', () => {
                const modal = document.getElementById('modal-add-contact');
                if (modal) modal.classList.add('open');
            });
        }

        const formAddContact = document.getElementById('form-add-contact');
        if (formAddContact) {
            formAddContact.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('contact-email')?.value.trim();
                const firstName = document.getElementById('contact-firstname')?.value.trim();
                const lastName = document.getElementById('contact-lastname')?.value.trim();
                const unsubscribed = document.getElementById('contact-unsubscribed')?.checked;

                if (!email) {
                    showToast('Valid email is required', 'error');
                    return;
                }

                const submitBtn = document.getElementById('btn-submit-contact');
                if (submitBtn) submitBtn.disabled = true;

                try {
                    const res = await apiRequest('/api/email/contacts', 'POST', {
                        email,
                        firstName,
                        lastName,
                        unsubscribed,
                        segmentId: state.currentAudienceId || undefined
                    });

                    if (res.success) {
                        showToast('Subscriber saved to Resend', 'success');
                        closeModals();
                        formAddContact.reset();
                        await loadContacts(state.currentAudienceId);
                    } else {
                        showToast(res.message || 'Failed to add contact', 'error');
                    }
                } catch {
                    showToast('Error communicating with Resend', 'error');
                } finally {
                    if (submitBtn) submitBtn.disabled = false;
                }
            });
        }

        const btnOpenImportCsv = document.getElementById('btn-open-import-csv');
        if (btnOpenImportCsv) {
            btnOpenImportCsv.addEventListener('click', () => {
                const modal = document.getElementById('modal-import-csv');
                const previewSection = document.getElementById('csv-preview-section');
                const progressSection = document.getElementById('csv-progress-section');
                const btnImport = document.getElementById('btn-execute-csv-import');
                if (previewSection) previewSection.style.display = 'none';
                if (progressSection) progressSection.style.display = 'none';
                if (btnImport) btnImport.disabled = true;
                state.parsedCsvContacts = [];
                if (modal) modal.classList.add('open');
            });
        }

        const btnExportCsv = document.getElementById('btn-export-csv');
        if (btnExportCsv) {
            btnExportCsv.addEventListener('click', exportContactsCsv);
        }

        const btnRefreshBroadcasts = document.getElementById('btn-refresh-broadcasts');
        if (btnRefreshBroadcasts) {
            btnRefreshBroadcasts.addEventListener('click', async () => {
                await checkResendStatus();
                await loadAudiences();
                await loadBroadcasts();
                showToast('Resend audiences and broadcasts synchronized', 'info');
            });
        }

        // CSV Drag and Drop Zone Listeners
        const csvDropZone = document.getElementById('csv-drop-zone');
        if (csvDropZone) {
            ['dragenter', 'dragover'].forEach(eventName => {
                csvDropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    csvDropZone.classList.add('dragover');
                }, false);
            });
            ['dragleave', 'drop'].forEach(eventName => {
                csvDropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    csvDropZone.classList.remove('dragover');
                }, false);
            });
            csvDropZone.addEventListener('drop', (e) => {
                const dt = e.dataTransfer;
                const files = dt.files;
                if (files && files.length > 0) {
                    handleCsvSelected({ target: { files: [files[0]] } });
                }
            }, false);
        }

        // ─── GMAIL COMPOSER CANVAS DRAG & DROP & PHOTO UPLOADER ───
        setupCanvasDragAndDrop('supp-body-container', 'supp-editor-canvas', 'supp-drop-overlay');
        setupCanvasDragAndDrop('bcast-body-container', 'bcast-editor-canvas', 'bcast-drop-overlay');

        const photoDropZone = document.getElementById('photo-drop-zone');
        if (photoDropZone) {
            ['dragenter', 'dragover'].forEach(eventName => {
                photoDropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    photoDropZone.classList.add('dragover');
                }, false);
            });
            ['dragleave', 'drop'].forEach(eventName => {
                photoDropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    photoDropZone.classList.remove('dragover');
                }, false);
            });
            photoDropZone.addEventListener('drop', (e) => {
                const dt = e.dataTransfer;
                const files = dt.files;
                if (files && files.length > 0) {
                    handlePhotoFileSelected({ target: { files: [files[0]] } });
                }
            }, false);
        }

        // Global dismissal for popovers and floating bubble
        document.addEventListener('click', (e) => {
            const colorPopover = document.getElementById('gmail-color-popover');
            if (colorPopover && colorPopover.style.display === 'block') {
                if (!colorPopover.contains(e.target) && !e.target.closest('[onclick*="toggleColorPalette"]')) {
                    colorPopover.style.display = 'none';
                }
            }
            const emojiPopover = document.getElementById('gmail-emoji-popover');
            if (emojiPopover && emojiPopover.style.display === 'block') {
                if (!emojiPopover.contains(e.target) && !e.target.closest('[onclick*="toggleEmojiPicker"]')) {
                    emojiPopover.style.display = 'none';
                }
            }
            const imgBubble = document.getElementById('gmail-image-bubble');
            if (imgBubble && imgBubble.style.display === 'flex') {
                if (!imgBubble.contains(e.target) && e.target !== state.activeImgElement) {
                    hideImageBubble();
                }
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // APP INITIALIZATION
    // ─────────────────────────────────────────────────────────────────────────
    async function init() {
        setupEventListeners();

        setInterval(updateLiveClock, 1000);
        updateLiveClock();

        // Restore active tab immediately on load/refresh
        const initialTab = getStoredActiveTab();
        switchTab(initialTab);

        window.addEventListener('hashchange', () => {
            const currentHashTab = getStoredActiveTab();
            if (currentHashTab !== state.currentTab) {
                switchTab(currentHashTab);
            }
        });

        // Mandatory Master Session Verification
        const authenticated = await checkAuthSession();
        if (!authenticated) {
            return; // Retain auth gate modal; do not fetch confidential data
        }

        await Promise.all([
            loadLicenses(),
            loadClients(),
            loadGlobalDevices(),
            loadLogs(),
            loadAnalytics(),
            checkSystemHealth(false),
            checkResendStatus()
        ]);
    }

    // Expose window.app for inline HTML callers
    window.app = {
        switchTab,
        closeModals,
        closeConfirmModal,
        copyKey,
        openIssueModal,
        openIssueModalForClient,
        openEditLicenseModal,
        extendLicenseDays,
        deleteLicense,
        openHwidModal,
        toggleHwidBlock,
        removeHwid,
        resetAllHwids,
        addManualHwid,
        updateLicenseStatus,
        inspectLogPayload,
        openPayloadInspector,
        toggleTelemetryTail,
        exportTelemetryCsv,
        exportLicensesCsv,
        openEditClientModal,
        openClientDetailModal,
        toggleClientStatus,
        deleteClient,
        loadAdminsTab,
        openAdminModal,
        editAdminUser,
        deleteAdminUser,
        checkSystemHealth,
        logout: handleLogout,
        checkAuthSession,
        handleLoginSubmit,
        toggleLoginPassword,

        // Gmail Suite Formatting & Compose
        applyFontFamily,
        applyFontSize,
        toggleFormatBar,
        toggleComposerExpand,
        toggleCc,
        toggleBcc,
        togglePreheader,
        openPhotoModal,
        switchPhotoTab,
        handlePhotoFileSelected,
        handlePhotoUrlInput,
        clearPhotoSelection,
        executeInsertPhoto,
        resizeActiveImage,
        removeActiveImage,
        openLinkModal,
        executeInsertLink,
        onLinkTypeChange,
        onLinkInputDetect,
        openButtonModal,
        previewCtaButton,
        executeInsertButton,
        toggleColorPalette,
        applyColor,
        toggleEmojiPicker,
        insertEmoji,
        sendSupportEmail,
        resetBroadcastComposer,

        // Resend Broadcasts & Audiences API
        switchBroadcastSubTab,
        setBroadcastEditorMode,
        insertMergeTag,
        submitBroadcast,
        loadBroadcasts,
        sendDraftBroadcast,
        syncClientsToAudience,
        deleteContact,
        handleCsvSelected,
        downloadSampleCsv,
        executeCsvImport,
        exportContactsCsv,

        // Resend Support 1-to-1 Mail API
        switchSupportSubTab,
        pickSupportClientRecipient,
        applySupportTemplate,
        handleFileSelect,
        removeAttachedFile,
        clearSupportComposer,
        loadSentHistory,
        renderTrackerTable,
        filterTracker,
        inspectEmailDelivery,
        queryEmailStatusById,

        // Interactive Live Preview
        openLivePreview,
        setPreviewDevice
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
