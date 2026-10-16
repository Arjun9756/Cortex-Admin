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
        devicesSearchQuery: '',
        currentHwidLicense: null
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
    function showAuthGate() {
        const overlay = document.getElementById('auth-gate-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            const pwdInput = document.getElementById('login-password');
            if (pwdInput) {
                pwdInput.value = '';
                pwdInput.focus();
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
            overlay.style.display = 'none';
        }
    }

    function updateOperatorProfile(admin) {
        if (!admin) return;
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
        const token = localStorage.getItem('cortex_admin_token');
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
                    return true;
                }
            }
        } catch (err) {
            console.error('Session verification error:', err);
        }

        // Invalid or expired session
        localStorage.removeItem('cortex_admin_token');
        showAuthGate();
        return false;
    }

    async function handleLoginSubmit(e) {
        if (e) e.preventDefault();
        const email = document.getElementById('login-email')?.value.trim();
        const password = document.getElementById('login-password')?.value;
        const submitBtn = document.getElementById('btn-login-submit');
        const errorBanner = document.getElementById('login-error-banner');

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
                localStorage.setItem('cortex_admin_token', data.token);
                updateOperatorProfile(data.admin);
                hideAuthGate();
                showToast('Console unlocked. Master session active.', 'success');
                await Promise.all([
                    loadLicenses(),
                    loadClients(),
                    loadGlobalDevices(),
                    loadLogs()
                ]);
            } else {
                if (errorBanner) {
                    errorBanner.textContent = data.message || 'Access Denied: Invalid administrator credentials.';
                    errorBanner.style.display = 'block';
                }
                const pwdInput = document.getElementById('login-password');
                if (pwdInput) {
                    pwdInput.value = '';
                    pwdInput.focus();
                }
            }
        } catch (err) {
            if (errorBanner) {
                errorBanner.textContent = 'Connection to authorization server failed.';
                errorBanner.style.display = 'block';
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Authenticate & Unlock Console';
            }
        }
    }

    function handleLogout() {
        localStorage.removeItem('cortex_admin_token');
        state.licenses = [];
        state.clients = [];
        state.globalDevices = [];
        state.logs = [];

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
        const token = localStorage.getItem('cortex_admin_token');
        if (!token && !endpoint.includes('/api/admin/login')) {
            showAuthGate();
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
                localStorage.removeItem('cortex_admin_token');
                showAuthGate();
                showToast('Master session expired. Re-authentication required.', 'error');
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
        const validTabs = ['dashboard', 'licenses', 'devices', 'telemetry', 'clients'];
        const hash = (window.location.hash || '').replace('#', '').trim().toLowerCase();
        if (validTabs.includes(hash)) return hash;

        try {
            const saved = localStorage.getItem('cortex_active_tab');
            if (saved && validTabs.includes(saved)) return saved;
        } catch (_) {}

        return 'dashboard';
    }

    function switchTab(tabId) {
        if (!tabId || tabId === 'simulator') tabId = 'dashboard';
        state.currentTab = tabId;

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
                clients: 'Client Organizations Directory'
            };
            breadcrumbEl.innerHTML = `<span>${titles[tabId] || 'Control Plane'}</span>`;
        }

        // Lazy refresh data on tab switch
        if (tabId === 'devices') loadGlobalDevices();
        if (tabId === 'telemetry') loadLogs();
        if (tabId === 'dashboard') updateDashboardMetrics();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EXECUTIVE DASHBOARD LOGIC
    // ─────────────────────────────────────────────────────────────────────────
    function updateDashboardMetrics() {
        const totalLicenses = state.licenses.length;
        const activeLicenses = state.licenses.filter(l => l.status === 'active').length;
        const revokedLicenses = state.licenses.filter(l => l.status === 'revoked' || l.status === 'suspended').length;
        const totalClients = state.clients.length;

        // Calculate total bound hardware devices
        let boundDevicesCount = 0;
        let totalSeatLimit = 0;
        state.licenses.forEach(l => {
            boundDevicesCount += (l.bound_machines_count || (Array.isArray(l.hwids) ? l.hwids.length : 0));
            totalSeatLimit += (l.max_machines || 1);
        });

        const statLic = document.getElementById('dash-stat-licenses');
        const subLic = document.getElementById('dash-sub-licenses');
        const statDev = document.getElementById('dash-stat-devices');
        const subDev = document.getElementById('dash-sub-devices');
        const statRev = document.getElementById('dash-stat-revoked');
        const statCli = document.getElementById('dash-stat-clients');

        if (statLic) statLic.textContent = totalLicenses;
        if (subLic) subLic.textContent = `${activeLicenses} active of ${totalLicenses} issued`;
        if (statDev) statDev.textContent = boundDevicesCount;
        if (subDev) subDev.textContent = `${boundDevicesCount} of ${totalSeatLimit} slots allocated`;
        if (statRev) statRev.textContent = revokedLicenses;
        if (statCli) statCli.textContent = totalClients;

        // Render Recent Logs into Dashboard
        renderDashboardRecentLogs();
    }

    function renderDashboardRecentLogs() {
        const tbody = document.getElementById('dash-recent-logs-tbody');
        if (!tbody) return;

        const recent = state.logs.slice(0, 5);
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

        tbody.innerHTML = recent.map(log => {
            const isSuccess = log.status === 'success';
            const logTimestamp = log.created_at || log.timestamp;
            const logAction = log.action_type || log.action || 'ping';
            return `
                <tr>
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

    function updateLicenseCounters() {
        const total = state.licenses.length;
        const active = state.licenses.filter(l => l.status === 'active').length;
        const suspended = state.licenses.filter(l => l.status === 'suspended').length;
        const revoked = state.licenses.filter(l => l.status === 'revoked').length;

        const countAll = document.getElementById('count-all');
        const countActive = document.getElementById('count-active');
        const countSuspended = document.getElementById('count-suspended');
        const countRevoked = document.getElementById('count-revoked');
        const navCounter = document.getElementById('nav-counter-licenses');

        if (countAll) countAll.textContent = total;
        if (countActive) countActive.textContent = active;
        if (countSuspended) countSuspended.textContent = suspended;
        if (countRevoked) countRevoked.textContent = revoked;
        if (navCounter) navCounter.textContent = active;
    }

    function renderLicensesTable() {
        const tbody = document.getElementById('licenses-table-body');
        if (!tbody) return;

        let filtered = state.licenses;

        if (state.filterStatus !== 'all') {
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
                            <span class="client-org-name">${escapeHtml(l.org_name || 'Individual')}</span>
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
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // GLOBAL HARDWARE DEVICES FLEET LOGIC
    // ─────────────────────────────────────────────────────────────────────────
    async function loadGlobalDevices() {
        const tbody = document.getElementById('devices-table-body');
        if (!tbody) return;

        const res = await apiRequest('/api/license/hwids/all');
        if (res.success && Array.isArray(res.data)) {
            state.globalDevices = res.data;
            const counter = document.getElementById('nav-counter-devices');
            const ribbonCounter = document.getElementById('count-global-devices');
            if (counter) counter.textContent = state.globalDevices.length;
            if (ribbonCounter) ribbonCounter.textContent = `${state.globalDevices.length} devices`;
            renderGlobalDevicesTable();
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
        if (!tbody) return;

        let filtered = state.globalDevices;
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

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8">
                        <div class="table-empty">
                            <div class="table-empty-text">No devices match query</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map(d => {
            const isBlocked = Boolean(d.is_blocked === 1 || d.is_blocked === true || d.is_blocked === '1');
            const platformName = d.platform === 'linux' ? 'Linux' : (d.platform === 'darwin' ? 'macOS' : 'Windows');
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
        if (!confirm('Unbind this hardware device? The machine will lose authorization.')) return;
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
        if (!confirm(`RESET ALL HARDWARE BINDINGS for license ${state.currentHwidLicense.license_key}?\nAll currently bound machines will be detached and must re-bind via TOFU.`)) return;

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
        if (newStatus === 'revoked' && !confirm('ENGAGE IMMEDIATE REMOTE KILL-SWITCH?\n\nClient engines running this license will print ACCESS DENIED, purge local cache, and terminate immediately.')) {
            return;
        }

        const res = await apiRequest(`/api/license/${licenseId}/status`, 'PATCH', { status: newStatus });
        if (res.success) {
            showToast(`License operational status set to ${newStatus}`, 'success');
            await loadLicenses();
        } else {
            showToast(res.message || `Failed to update status`, 'error');
        }
    }

    function openIssueModal() {
        const modal = document.getElementById('modal-issue-license');
        const select = document.getElementById('issue-client-id');
        if (select) {
            select.innerHTML = '<option value="">Select organization...</option>' +
                state.clients.map(c => `<option value="${c.id}">${escapeHtml(c.org_name)} (${escapeHtml(c.email)})</option>`).join('');
        }
        if (modal) modal.classList.add('open');
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

        const res = await apiRequest('/api/analytics/logs');
        if (res.success && Array.isArray(res.data)) {
            state.logs = res.data;
            renderLogsTable();
            renderDashboardRecentLogs();
        }
    }

    function renderLogsTable() {
        const tbody = document.getElementById('logs-table-body');
        if (!tbody) return;

        let filtered = state.logs;
        const statusFilter = document.getElementById('log-status-filter')?.value;
        const searchInput = document.getElementById('log-search-input')?.value.toLowerCase().trim();

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

        tbody.innerHTML = filtered.map(log => {
            const isSuccess = log.status === 'success';
            const logTimestamp = log.created_at || log.timestamp;
            const logAction = log.action_type || log.action || 'ping';
            const logReason = getLogReason(log);

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
                        <button class="btn btn-secondary btn-sm" onclick="window.app.inspectLogPayload('${log.id}')">
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

    function inspectLogPayload(logId) {
        const log = state.logs.find(l => String(l.id) === String(logId));
        if (!log) return;
        const modal = document.getElementById('modal-log-payload');
        const pre = document.getElementById('log-json-modal-content');
        if (pre) {
            let payloadObj = log.metadata || log.request_payload;
            if (typeof payloadObj === 'string') {
                try { payloadObj = JSON.parse(payloadObj); } catch (_) {}
            }
            pre.textContent = JSON.stringify(payloadObj || log, null, 2);
        }
        if (modal) modal.classList.add('open');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CLIENT DIRECTORY
    // ─────────────────────────────────────────────────────────────────────────
    async function loadClients() {
        const res = await apiRequest('/api/clients');
        if (res.success && Array.isArray(res.data)) {
            state.clients = res.data;
            renderClientsTable();
            updateDashboardMetrics();
        }
    }

    function renderClientsTable() {
        const tbody = document.getElementById('clients-table-body');
        if (!tbody) return;

        let filtered = state.clients;
        const statusFilter = document.getElementById('client-status-filter')?.value;
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

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7">
                        <div class="table-empty">
                            <div class="table-empty-text">No client organizations found</div>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map(c => `
            <tr>
                <td>
                    <span style="font-size: 13px; font-weight: 600; color: var(--text-white);">${escapeHtml(c.org_name)}</span>
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
                    <span class="status-pill ${c.status === 'active' ? 'active' : 'suspended'}" style="font-size: 10.5px; padding: 1px 6px;">
                        <span class="indicator-dot"></span>
                        <span>${c.status ? c.status.charAt(0).toUpperCase() + c.status.slice(1) : 'Active'}</span>
                    </span>
                </td>
                <td>
                    <span style="font-size: 11.5px; color: var(--text-muted);">${formatDate(c.created_at)}</span>
                </td>
                <td class="align-right">
                    <div class="row-actions">
                        <button class="btn btn-secondary btn-sm" onclick="window.app.openEditClientModal('${c.id}')">
                            Edit
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
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
    // MODAL HELPERS & CLOCK
    // ─────────────────────────────────────────────────────────────────────────
    function closeModals() {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
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

    function copySimulatorJson() {
        const pre = document.getElementById('sim-json-output');
        if (pre) copyKey(pre.textContent);
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

        // Dismiss Modals When Clicking on Modal Backdrop (Blank Space)
        document.addEventListener('click', (e) => {
            if (e.target && e.target.classList && e.target.classList.contains('modal-overlay')) {
                closeModals();
            }
        });

        // Filter Pills
        document.querySelectorAll('.filter-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.filterStatus = btn.getAttribute('data-filter') || 'all';
                const selectFilter = document.getElementById('license-status-filter');
                if (selectFilter) selectFilter.value = state.filterStatus;
                renderLicensesTable();
            });
        });

        // Status Dropdown Filter
        const licenseStatusFilter = document.getElementById('license-status-filter');
        if (licenseStatusFilter) {
            licenseStatusFilter.addEventListener('change', (e) => {
                state.filterStatus = e.target.value;
                document.querySelectorAll('.filter-pill').forEach(b => {
                    if (b.getAttribute('data-filter') === state.filterStatus) {
                        b.classList.add('active');
                    } else {
                        b.classList.remove('active');
                    }
                });
                renderLicensesTable();
            });
        }

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

        // Global Keyboard Shortcut: '/' to focus search, 1-6 for tabs, Escape for modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeModals();
            } else if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                e.preventDefault();
                const search = document.getElementById('license-search-input');
                if (search) search.focus();
            } else if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                if (e.key === '1') switchTab('dashboard');
                if (e.key === '2') switchTab('licenses');
                if (e.key === '3') switchTab('devices');
                if (e.key === '4') switchTab('telemetry');
                if (e.key === '5') switchTab('clients');
            }
        });

        // Refresh Button
        const btnRefresh = document.getElementById('btn-refresh');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', async () => {
                await Promise.all([loadLicenses(), loadClients(), loadGlobalDevices(), loadLogs()]);
                showToast('Workspace data refreshed', 'info');
            });
        }

        const btnRefreshDev = document.getElementById('btn-refresh-devices');
        if (btnRefreshDev) btnRefreshDev.addEventListener('click', loadGlobalDevices);

        // Open Issue Modal
        const btnOpenIssue = document.getElementById('btn-open-issue');
        if (btnOpenIssue) btnOpenIssue.addEventListener('click', openIssueModal);

        // Open Add Client Modal
        const btnOpenAddClient = document.getElementById('btn-open-add-client');
        if (btnOpenAddClient) {
            btnOpenAddClient.addEventListener('click', () => {
                const modal = document.getElementById('modal-add-client');
                if (modal) modal.classList.add('open');
            });
        }

        // Form: Issue License
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

                let expiryDate;
                if (durationPreset === 'perpetual') {
                    expiryDate = new Date();
                    expiryDate.setFullYear(expiryDate.getFullYear() + 10);
                } else {
                    const days = parseInt(durationPreset, 10) || 365;
                    expiryDate = new Date();
                    expiryDate.setDate(expiryDate.getDate() + days);
                }

                const res = await apiRequest('/api/license', 'POST', {
                    client_id: clientId,
                    max_machines: maxMachines,
                    expiry_date: expiryDate.toISOString(),
                    notes
                });

                if (res.success) {
                    showToast('Cryptographic license issued', 'success');
                    closeModals();
                    await loadLicenses();
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

        // Telemetry Logs Refresh & Filter
        const btnRefreshLogs = document.getElementById('btn-refresh-logs');
        if (btnRefreshLogs) btnRefreshLogs.addEventListener('click', loadLogs);

        const logStatusFilter = document.getElementById('log-status-filter');
        if (logStatusFilter) logStatusFilter.addEventListener('change', renderLogsTable);

        const logSearchInput = document.getElementById('log-search-input');
        if (logSearchInput) logSearchInput.addEventListener('input', renderLogsTable);

        // Client Search & Filter
        const clientStatusFilter = document.getElementById('client-status-filter');
        if (clientStatusFilter) clientStatusFilter.addEventListener('change', renderClientsTable);

        const clientSearchInput = document.getElementById('client-search-input');
        if (clientSearchInput) clientSearchInput.addEventListener('input', renderClientsTable);

        // Master Session Authentication Form & Logout Button
        const formLogin = document.getElementById('form-admin-login');
        if (formLogin) {
            formLogin.addEventListener('submit', handleLoginSubmit);
        }

        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleLogout();
            });
        }
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
            loadLogs()
        ]);
    }

    // Expose window.app for inline HTML callers
    window.app = {
        switchTab,
        closeModals,
        copyKey,
        openIssueModal,
        openEditLicenseModal,
        openHwidModal,
        toggleHwidBlock,
        removeHwid,
        resetAllHwids,
        addManualHwid,
        updateLicenseStatus,
        inspectLogPayload,
        openEditClientModal,
        logout: handleLogout,
        checkAuthSession,
        handleLoginSubmit
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
