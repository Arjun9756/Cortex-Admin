/**
 * CORTEX CONTROL PLANE - CORE FRONTEND CONTROLLER
 * Vanilla ES6+ JavaScript, zero framework dependencies
 */

(function () {
    'use strict';

    const state = {
        currentTab: 'overview',
        timeframe: '24h',
        clients: [],
        licenses: [],
        admins: [],
        logs: [],
        overview: null,
        autoRefreshInterval: null,
        logSearchQuery: '',
        logStatusFilter: ''
    };

    // DOM Elements Cache
    const elements = {
        navButtons: document.querySelectorAll('.nav-item'),
        tabPanes: document.querySelectorAll('.tab-pane'),
        pageTitle: document.getElementById('page-title'),
        pageSubtitle: document.getElementById('page-subtitle'),
        liveClock: document.getElementById('live-clock'),
        refreshAllBtn: document.getElementById('refresh-all-btn'),

        // Analytics Toolbar & Timeframe
        timeframeButtons: document.querySelectorAll('.timeframe-btn'),
        fleetHealthPill: document.getElementById('fleet-health-pill'),
        fleetHealthBadgeText: document.getElementById('fleet-health-badge-text'),
        btnExportTelemetryCsv: document.getElementById('btn-export-telemetry-csv'),
        btnExportLicensesCsv: document.getElementById('btn-export-licenses-csv'),
        
        // Overview KPIs
        kpiActiveLicenses: document.getElementById('kpi-active-licenses'),
        kpiTotalLicenses: document.getElementById('kpi-total-licenses'),
        kpiLicenseRatio: document.getElementById('kpi-license-ratio'),
        kpiActiveClients: document.getElementById('kpi-active-clients'),
        kpiFleetHealthy: document.getElementById('kpi-fleet-healthy'),
        kpiFleetDelayed: document.getElementById('kpi-fleet-delayed'),
        kpiFleetOffline: document.getElementById('kpi-fleet-offline'),
        kpiTodayPings: document.getElementById('kpi-today-pings'),
        kpiTodaySuccess: document.getElementById('kpi-today-success'),
        kpiSuccessRate: document.getElementById('kpi-success-rate'),
        kpiBlockedLicenses: document.getElementById('kpi-blocked-licenses'),
        kpiSecurityAnomalies: document.getElementById('kpi-security-anomalies'),
        
        // Timeline & Diagnostics
        timelineChartTitle: document.getElementById('timeline-chart-title'),
        timelineRangeBadge: document.getElementById('timeline-range-badge'),
        pingChartContainer: document.getElementById('ping-chart-container'),
        diagnosticTotalFailed: document.getElementById('diagnostic-total-failed'),
        failureBreakdownContainer: document.getElementById('failure-breakdown-container'),

        // Fleet Environment
        platformMetersContainer: document.getElementById('platform-meters-container'),
        versionMetersContainer: document.getElementById('version-meters-container'),

        // Distribution Bars
        barActive: document.getElementById('bar-active'),
        barExpired: document.getElementById('bar-expired'),
        barRevoked: document.getElementById('bar-revoked'),
        barSuspended: document.getElementById('bar-suspended'),
        distActiveVal: document.getElementById('dist-active-val'),
        distExpiredVal: document.getElementById('dist-expired-val'),
        distRevokedVal: document.getElementById('dist-revoked-val'),
        distSuspendedVal: document.getElementById('dist-suspended-val'),

        // Operational Intelligence
        expiringWatchlistCount: document.getElementById('expiring-watchlist-count'),
        expiryWatchlistBody: document.getElementById('expiry-watchlist-body'),
        clientHealthRosterBody: document.getElementById('client-health-roster-body'),
        overviewRecentPingsBody: document.getElementById('overview-recent-pings-body'),

        // Clients
        clientsTableBody: document.getElementById('clients-table-body'),
        clientSearchInput: document.getElementById('client-search-input'),
        clientStatusFilter: document.getElementById('client-status-filter'),
        btnOpenAddClient: document.getElementById('btn-open-add-client'),
        modalAddClient: document.getElementById('modal-add-client'),
        formAddClient: document.getElementById('form-add-client'),
        modalEditClient: document.getElementById('modal-edit-client'),
        formEditClient: document.getElementById('form-edit-client'),

        // Licenses
        licensesTableBody: document.getElementById('licenses-table-body'),
        licenseSearchInput: document.getElementById('license-search-input'),
        licenseStatusFilter: document.getElementById('license-status-filter'),
        btnOpenIssueLicense: document.getElementById('btn-open-issue-license'),
        modalIssueLicense: document.getElementById('modal-issue-license'),
        formIssueLicense: document.getElementById('form-issue-license'),
        issueClientId: document.getElementById('issue-client-id'),
        customDaysWrap: document.getElementById('custom-days-wrap'),
        issueCustomDays: document.getElementById('issue-custom-days'),

        // Simulator
        simulatorForm: document.getElementById('simulator-form'),
        simLicenseKey: document.getElementById('sim-license-key'),
        simQuickKeyPicker: document.getElementById('sim-quick-key-picker'),
        simMachineId: document.getElementById('sim-machine-id'),
        simAppVersion: document.getElementById('sim-app-version'),
        simPlatform: document.getElementById('sim-platform'),
        simIp: document.getElementById('sim-ip'),
        simStatusBadge: document.getElementById('sim-status-badge'),
        simDecisionContainer: document.getElementById('sim-decision-container'),
        simDecisionBanner: document.getElementById('sim-decision-banner'),
        simDecisionIcon: document.getElementById('sim-decision-icon'),
        simDecisionTitle: document.getElementById('sim-decision-title'),
        simDecisionDesc: document.getElementById('sim-decision-desc'),
        simLatency: document.getElementById('sim-latency'),
        simHttpCode: document.getElementById('sim-http-code'),
        simJsonOutput: document.getElementById('sim-json-output'),

        // Admins
        adminsTableBody: document.getElementById('admins-table-body'),
        btnOpenAddAdmin: document.getElementById('btn-open-add-admin'),
        modalAddAdmin: document.getElementById('modal-add-admin'),
        formAddAdmin: document.getElementById('form-add-admin'),

        // Logs
        logsTableBody: document.getElementById('logs-table-body'),
        logActionFilter: document.getElementById('log-action-filter'),
        logStatusFilter: document.getElementById('log-status-filter'),
        logSearchInput: document.getElementById('log-search-input'),
        logAutoRefresh: document.getElementById('log-auto-refresh'),
        btnRefreshLogs: document.getElementById('btn-refresh-logs'),
        btnExportLogsCsv: document.getElementById('btn-export-logs-csv'),
        modalMetadata: document.getElementById('modal-metadata'),
        metadataJsonContent: document.getElementById('metadata-json-content'),

        // Toasts
        toastContainer: document.getElementById('toast-container')
    };

    // ==========================================
    // API Helper
    // ==========================================
    async function apiRequest(endpoint, method = 'GET', body = null) {
        const headers = { 'Content-Type': 'application/json' };
        const config = { method, headers };
        if (body) config.body = JSON.stringify(body);

        const res = await fetch(endpoint, config);
        const data = await res.json().catch(() => ({}));
        if (!res.ok && res.status >= 500) {
            throw new Error(data.message || `Server error (${res.status})`);
        }
        return data;
    }

    // ==========================================
    // Toast Notifications
    // ==========================================
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-message">${escapeHtml(message)}</span>
        `;
        elements.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(40px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // 12-Hour AM/PM Date & Time Formatters
    function formatDate(dateStr, includeSeconds = false) {
        if (!dateStr) return 'Never';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;

        const day = String(d.getDate()).padStart(2, '0');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[d.getMonth()];
        const year = d.getFullYear();

        let hours = d.getHours();
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // 0 becomes 12
        const hourStr = String(hours).padStart(2, '0');

        if (includeSeconds) {
            const seconds = String(d.getSeconds()).padStart(2, '0');
            return `${day} ${month} ${year}, ${hourStr}:${minutes}:${seconds} ${ampm}`;
        }
        return `${day} ${month} ${year}, ${hourStr}:${minutes} ${ampm}`;
    }

    function formatTime12h(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        let hours = d.getHours();
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        const hourStr = String(hours).padStart(2, '0');
        return `${hourStr}:${minutes} ${ampm}`;
    }

    function formatRelative(dateStr) {
        if (!dateStr) return 'Never';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        const diffMs = Date.now() - d.getTime();
        const diffSec = Math.floor(diffMs / 1000);
        if (diffSec < 60) return `${diffSec}s ago`;
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr}h ago`;
        const diffDay = Math.floor(diffHr / 24);
        return `${diffDay}d ago`;
    }

    function formatDaysRemaining(expiryStr) {
        if (!expiryStr) return '';
        const exp = new Date(expiryStr);
        const now = new Date();
        const diffMs = exp.getTime() - now.getTime();
        const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        if (days < 0) return `<span class="text-rose">Expired ${Math.abs(days)}d ago</span>`;
        if (days === 0) return `<span class="text-amber">Expires today</span>`;
        return `<span class="text-emerald">${days} days left</span>`;
    }

    // ==========================================
    // Navigation & Tabs
    // ==========================================
    const tabHeaders = {
        overview: { title: 'System Overview', sub: 'Real-time health, licensing status & heartbeat telemetry' },
        clients: { title: 'Client Organizations', sub: 'Manage registered clients, contacts, and license allocations' },
        licenses: { title: 'License Management', sub: 'Issue, inspect, suspend, and revoke Cortex authorization keys' },
        simulator: { title: 'Heartbeat Ping Simulator', sub: 'Interactive client verification test bench for Cortex app' },
        admins: { title: 'Administrator Accounts', sub: 'Manage control plane access and role-based permissions' },
        logs: { title: 'Heartbeat & Telemetry Logs', sub: 'Full audit trail of all verification queries and client pings' }
    };

    function switchTab(tabId) {
        state.currentTab = tabId;

        elements.navButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        elements.tabPanes.forEach(pane => {
            pane.classList.toggle('active', pane.id === `tab-${tabId}`);
        });

        const meta = tabHeaders[tabId] || tabHeaders.overview;
        elements.pageTitle.textContent = meta.title;
        elements.pageSubtitle.textContent = meta.sub;

        // Auto load tab data
        if (tabId === 'overview') loadOverview();
        if (tabId === 'clients') loadClients();
        if (tabId === 'licenses') loadLicenses();
        if (tabId === 'simulator') syncSimulatorKeys();
        if (tabId === 'admins') loadAdmins();
        if (tabId === 'logs') loadLogs();
    }

    // ==========================================
    // Tab 1: Overview & Analytics
    // ==========================================
    async function loadOverview() {
        try {
            const [detailedRes, recentPingsRes] = await Promise.all([
                apiRequest(`/api/analytics/detailed?range=${state.timeframe}`),
                apiRequest('/api/analytics/logs?limit=6&action_type=ping')
            ]);

            if (detailedRes.success && detailedRes.data) {
                const data = detailedRes.data;
                state.overview = data;

                // 1. Update KPIs
                elements.kpiActiveLicenses.textContent = data.licenses.active;
                elements.kpiTotalLicenses.textContent = `${data.licenses.total} total issued`;
                elements.kpiLicenseRatio.textContent = data.licenses.total > 0 
                    ? `${Math.round((data.licenses.active / data.licenses.total) * 100)}% active`
                    : '100% active';

                elements.kpiActiveClients.textContent = `${data.clients.active} Active`;
                elements.kpiFleetHealthy.textContent = `${data.clients.healthy_count} Online`;
                elements.kpiFleetDelayed.textContent = `${data.clients.delayed_count} Delayed`;
                elements.kpiFleetOffline.textContent = `${data.clients.offline_count} Offline`;

                // Update Fleet Health Pill
                const fleetHealth = data.clients.fleet_health_percent;
                elements.fleetHealthBadgeText.textContent = `Fleet: ${fleetHealth}% Online`;
                const dot = elements.fleetHealthPill.querySelector('.health-pulse-dot');
                if (dot) {
                    dot.className = 'health-pulse-dot ' + (fleetHealth >= 90 ? 'healthy' : fleetHealth >= 60 ? 'warning' : 'danger');
                }

                // Heartbeat Telemetry
                elements.kpiTodayPings.textContent = data.pings.total.toLocaleString();
                elements.kpiTodaySuccess.textContent = `${data.pings.success.toLocaleString()} allowed`;
                elements.kpiSuccessRate.textContent = `${data.pings.success_rate_percent}% allowed`;

                // Security & Gating Radar
                const blockedCount = data.licenses.expired + data.licenses.revoked;
                elements.kpiBlockedLicenses.textContent = blockedCount;
                elements.kpiSecurityAnomalies.textContent = `${data.security.unauthorized_key_attempts} unauthorized key tries (${data.security.suspicious_unique_ips} IPs)`;

                // 2. Timeline Chart & Diagnostics
                const rangeTitles = {
                    '24h': 'Heartbeat Pings (Last 24 Hours)',
                    '7d': 'Heartbeat Pings (Last 7 Days)',
                    '30d': 'Heartbeat Pings (Last 30 Days)'
                };
                elements.timelineChartTitle.textContent = rangeTitles[state.timeframe] || 'Heartbeat Pings Activity';
                elements.timelineRangeBadge.textContent = `${state.timeframe.toUpperCase()} View`;
                renderPingChart(data.timeline || [], state.timeframe);

                // Diagnostics
                renderFailureDiagnostics(data.failure_breakdown || [], data.pings.failed);

                // 3. Environment & License Distribution
                renderPlatformDistribution(data.platforms || []);
                renderVersionDistribution(data.versions || []);
                renderLicenseDistribution(data.licenses);

                // 4. Operational Intelligence (Expiry Watchlist & Heartbeat Availability)
                renderExpiryWatchlist(data.expiring_licenses || []);
                renderClientHealthRoster(data.client_roster || []);
            }

            // Render recent 6 pings
            renderOverviewRecentPings(recentPingsRes.data || []);

        } catch (err) {
            console.error('Error loading overview:', err);
        }
    }

    function renderPingChart(timeline, timeframe) {
        if (!timeline || timeline.length === 0) {
            elements.pingChartContainer.innerHTML = `
                <div class="chart-placeholder">
                    <span>No heartbeat activity recorded in this timeframe (${timeframe}).</span>
                </div>
            `;
            return;
        }

        const maxTotal = Math.max(...timeline.map(t => parseInt(t.total) || 1), 5);
        let barsHtml = '';

        timeline.forEach(item => {
            const timeLabel = item.time_bucket || item.hour || '-';
            const totalCount = parseInt(item.total) || 0;
            const successCount = parseInt(item.success) || 0;
            const failedCount = parseInt(item.failed) || 0;
            const heightPercent = Math.max((totalCount / maxTotal) * 100, 8);

            barsHtml += `
                <div class="chart-bar-group" title="${timeLabel}: ${totalCount} pings (${successCount} allowed, ${failedCount} rejected)">
                    <div class="chart-bar" style="height: ${heightPercent}%;"></div>
                    <span class="chart-label">${escapeHtml(timeLabel)}</span>
                </div>
            `;
        });

        elements.pingChartContainer.innerHTML = barsHtml;
    }

    function renderFailureDiagnostics(breakdown, totalFailed) {
        elements.diagnosticTotalFailed.textContent = `${totalFailed} Failed Attempts`;

        if (!breakdown || breakdown.length === 0 || totalFailed === 0) {
            elements.failureBreakdownContainer.innerHTML = `
                <div class="clean-pass-banner">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon-clean"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    <span>100% Clean Gating — No authorization failures detected in this window</span>
                </div>
            `;
            return;
        }

        elements.failureBreakdownContainer.innerHTML = breakdown.map(item => `
            <div class="failure-row">
                <div class="failure-label" title="${escapeHtml(item.reason)}">${escapeHtml(item.reason)}</div>
                <div class="failure-bar-wrap">
                    <div class="failure-bar" style="width: ${item.percent}%;"></div>
                </div>
                <div class="failure-meta">
                    <strong>${item.count}</strong> (${item.percent}%)
                </div>
            </div>
        `).join('');
    }

    function renderPlatformDistribution(platforms) {
        if (!platforms || platforms.length === 0) {
            elements.platformMetersContainer.innerHTML = `
                <div class="dist-row">
                    <div class="dist-label"><span class="dot active"></span> Windows</div>
                    <div class="dist-bar-wrap"><div class="dist-bar bar-active" style="width: 100%"></div></div>
                    <span class="dist-count">100%</span>
                </div>
            `;
            return;
        }

        elements.platformMetersContainer.innerHTML = platforms.map(item => {
            const raw = (item.platform || '').toLowerCase();
            let label = item.platform;
            let dotClass = 'active';
            if (raw.includes('win')) label = 'Windows (win32)';
            else if (raw.includes('dar') || raw.includes('mac')) label = 'macOS (darwin)';
            else if (raw.includes('lin')) label = 'Linux (x86_64)';

            return `
                <div class="dist-row">
                    <div class="dist-label"><span class="dot ${dotClass}"></span> ${escapeHtml(label)}</div>
                    <div class="dist-bar-wrap">
                        <div class="dist-bar bar-active" style="width: ${item.percent}%;"></div>
                    </div>
                    <span class="dist-count">${item.percent}%</span>
                </div>
            `;
        }).join('');
    }

    function renderVersionDistribution(versions) {
        if (!versions || versions.length === 0) {
            elements.versionMetersContainer.innerHTML = `
                <div class="dist-row">
                    <div class="dist-label"><span class="dot active"></span> v1.0.4</div>
                    <div class="dist-bar-wrap"><div class="dist-bar bar-active" style="width: 100%"></div></div>
                    <span class="dist-count">100%</span>
                </div>
            `;
            return;
        }

        elements.versionMetersContainer.innerHTML = versions.map(item => `
            <div class="dist-row">
                <div class="dist-label"><span class="dot active"></span> ${escapeHtml(item.version)}</div>
                <div class="dist-bar-wrap">
                    <div class="dist-bar bar-active" style="width: ${item.percent}%;"></div>
                </div>
                <span class="dist-count">${item.percent}%</span>
            </div>
        `).join('');
    }

    function renderLicenseDistribution(lic) {
        const totalLic = Math.max(lic.total, 1);
        elements.barActive.style.width = `${(lic.active / totalLic) * 100}%`;
        elements.barExpired.style.width = `${(lic.expired / totalLic) * 100}%`;
        elements.barRevoked.style.width = `${(lic.revoked / totalLic) * 100}%`;
        elements.barSuspended.style.width = `${(lic.suspended / totalLic) * 100}%`;

        elements.distActiveVal.textContent = lic.active;
        elements.distExpiredVal.textContent = lic.expired;
        elements.distRevokedVal.textContent = lic.revoked;
        elements.distSuspendedVal.textContent = lic.suspended;
    }

    function renderExpiryWatchlist(expiringLicenses) {
        elements.expiringWatchlistCount.textContent = `${expiringLicenses.length} Expiring Soon`;

        if (!expiringLicenses || expiringLicenses.length === 0) {
            elements.expiryWatchlistBody.innerHTML = `
                <tr><td colspan="5" class="text-center py-4 text-muted">No licenses expiring within the next 30 days. All active licenses healthy.</td></tr>
            `;
            return;
        }

        elements.expiryWatchlistBody.innerHTML = expiringLicenses.map(lic => {
            let badgeClass = 'urgency-info';
            let label = `${lic.days_remaining}d remaining`;
            if (lic.urgency === 'critical') {
                badgeClass = 'urgency-critical';
                label = `⚠️ ${lic.days_remaining}d (URGENT)`;
            } else if (lic.urgency === 'warning') {
                badgeClass = 'urgency-warning';
                label = `⚡ ${lic.days_remaining}d (Warning)`;
            }

            return `
                <tr>
                    <td><strong>${escapeHtml(lic.org_name)}</strong></td>
                    <td><span class="license-key-pill">${escapeHtml(lic.license_key)}</span></td>
                    <td>${formatDate(lic.expiry_date)}</td>
                    <td><span class="urgency-badge ${badgeClass}">${label}</span></td>
                    <td class="text-right">
                        <button class="btn-xs" onclick="window.app.testInSimulator('${lic.license_key}')">Test Key</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function renderClientHealthRoster(clientRoster) {
        if (!clientRoster || clientRoster.length === 0) {
            elements.clientHealthRosterBody.innerHTML = `
                <tr><td colspan="5" class="text-center py-4">No registered clients available.</td></tr>
            `;
            return;
        }

        elements.clientHealthRosterBody.innerHTML = clientRoster.map(client => {
            const badgeClass = `health-badge ${client.health_status}`;
            const dotClass = client.health_status === 'healthy' ? 'online' : (client.health_status === 'delayed' ? 'delayed' : 'offline');

            return `
                <tr>
                    <td><strong>${escapeHtml(client.org_name)}</strong><br><small class="text-muted">${escapeHtml(client.email)}</small></td>
                    <td><span class="tag-meta">${client.active_licenses} Active / ${client.total_licenses} Total</span></td>
                    <td>${client.last_heartbeat_at ? `<div>${formatDate(client.last_heartbeat_at)}</div><small class="text-muted">(${formatRelative(client.last_heartbeat_at)})</small>` : '<span class="text-muted">Never</span>'}</td>
                    <td><span class="${badgeClass}"><span class="fleet-dot-tag ${dotClass}"></span> ${escapeHtml(client.health_label)}</span></td>
                    <td class="text-right">
                        <button class="btn-xs" onclick="window.app.openEditClient('${client.id}')">Manage</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function renderOverviewRecentPings(logs) {
        if (!logs || logs.length === 0) {
            elements.overviewRecentPingsBody.innerHTML = `
                <tr><td colspan="6" class="text-center py-4">No recent pings recorded yet. Use the Simulator to send a test ping!</td></tr>
            `;
            return;
        }

        elements.overviewRecentPingsBody.innerHTML = logs.map(log => {
            const isSuccess = log.status === 'success';
            const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata || '{}') : (log.metadata || {});

            return `
                <tr>
                    <td>
                        <div>${formatDate(log.created_at)}</div>
                        <small class="tag-meta">${formatRelative(log.created_at)}</small>
                    </td>
                    <td><strong>${escapeHtml(log.org_name || 'Unregistered Client')}</strong></td>
                    <td>
                        <span class="license-key-pill">
                            ${escapeHtml(log.license_key || meta.license_key_attempted || 'N/A')}
                        </span>
                    </td>
                    <td><code>${escapeHtml(log.ip_address || '127.0.0.1')}</code></td>
                    <td>
                        <span class="${isSuccess ? 'tag-status-active' : 'tag-status-revoked'}">
                            ${isSuccess ? '✓ Allowed' : '✕ Rejected'}
                        </span>
                    </td>
                    <td>
                        <button class="btn-xs" onclick="window.app.viewMetadata('${log.id}')">Inspect</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ==========================================
    // Tab 2: Client Management
    // ==========================================
    async function loadClients() {
        try {
            const res = await apiRequest('/api/clients');
            if (res.success && res.data) {
                state.clients = res.data;
                renderClientsTable();
                populateClientSelects();
            }
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    function renderClientsTable() {
        const query = (elements.clientSearchInput.value || '').toLowerCase().trim();
        const statusFilter = elements.clientStatusFilter.value;

        const filtered = state.clients.filter(c => {
            const matchesQuery = !query || 
                c.org_name.toLowerCase().includes(query) ||
                c.contact_name.toLowerCase().includes(query) ||
                c.email.toLowerCase().includes(query);
            const matchesStatus = !statusFilter || c.status === statusFilter;
            return matchesQuery && matchesStatus;
        });

        if (filtered.length === 0) {
            elements.clientsTableBody.innerHTML = `
                <tr><td colspan="8" class="text-center py-6">No clients found matching your filter criteria.</td></tr>
            `;
            return;
        }

        elements.clientsTableBody.innerHTML = filtered.map(client => {
            let statusTagClass = 'tag-status-active';
            if (client.status === 'suspended') statusTagClass = 'tag-status-suspended';
            if (client.status === 'inactive') statusTagClass = 'tag-status-expired';

            return `
                <tr>
                    <td><strong>${escapeHtml(client.org_name)}</strong></td>
                    <td>${escapeHtml(client.contact_name)}</td>
                    <td><code>${escapeHtml(client.email)}</code></td>
                    <td>${escapeHtml(client.phone || '-')}</td>
                    <td>
                        <span class="${statusTagClass}">${escapeHtml(client.status.toUpperCase())}</span>
                    </td>
                    <td>
                        <span class="tag-meta">${client.active_licenses || 0} active / ${client.total_licenses || 0} total</span>
                    </td>
                    <td>${formatDate(client.created_at)}</td>
                    <td class="text-right">
                        <div class="table-actions">
                            <button class="btn-xs" onclick="window.app.openIssueForClient('${client.id}')" title="Issue License Key">+ Key</button>
                            <button class="btn-xs" onclick="window.app.openEditClient('${client.id}')" title="Edit Client">Edit</button>
                            <button class="btn-xs" onclick="window.app.toggleClientStatus('${client.id}', '${client.status === 'active' ? 'suspended' : 'active'}')">
                                ${client.status === 'active' ? 'Suspend' : 'Activate'}
                            </button>
                            <button class="btn-xs" onclick="window.app.deleteClient('${client.id}')" title="Delete Client" style="color: var(--accent-rose);">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function populateClientSelects() {
        const optionsHtml = '<option value="">Choose a client...</option>' + 
            state.clients.map(c => `<option value="${c.id}">${escapeHtml(c.org_name)} (${escapeHtml(c.email)})</option>`).join('');
        elements.issueClientId.innerHTML = optionsHtml;
    }

    // ==========================================
    // Tab 3: License Management
    // ==========================================
    async function loadLicenses() {
        try {
            const res = await apiRequest('/api/license');
            if (res.success && res.data) {
                state.licenses = res.data;
                renderLicensesTable();
                syncSimulatorKeys();
            }
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    function renderLicensesTable() {
        const query = (elements.licenseSearchInput.value || '').toLowerCase().trim();
        const statusFilter = elements.licenseStatusFilter.value;

        const filtered = state.licenses.filter(l => {
            const matchesQuery = !query ||
                l.license_key.toLowerCase().includes(query) ||
                (l.org_name && l.org_name.toLowerCase().includes(query)) ||
                (l.client_email && l.client_email.toLowerCase().includes(query));
            const matchesStatus = !statusFilter || l.status === statusFilter;
            return matchesQuery && matchesStatus;
        });

        if (filtered.length === 0) {
            elements.licensesTableBody.innerHTML = `
                <tr><td colspan="7" class="text-center py-6">No licenses found matching your filters.</td></tr>
            `;
            return;
        }

        elements.licensesTableBody.innerHTML = filtered.map(license => {
            let statusTagClass = 'tag-status-active';
            if (license.status === 'expired') statusTagClass = 'tag-status-expired';
            if (license.status === 'revoked') statusTagClass = 'tag-status-revoked';
            if (license.status === 'suspended') statusTagClass = 'tag-status-suspended';

            const remainingDays = formatDaysRemaining(license.expiry_date);

            return `
                <tr>
                    <td>
                        <div class="license-key-pill">
                            <span>${escapeHtml(license.license_key)}</span>
                            <button class="btn-copy" onclick="window.app.copyKey('${license.license_key}')" title="Copy License Key">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </button>
                        </div>
                    </td>
                    <td>
                        <strong>${escapeHtml(license.org_name || 'Unknown Org')}</strong><br>
                        <small class="tag-meta">${escapeHtml(license.client_email || '')}</small>
                    </td>
                    <td>
                        <span class="${statusTagClass}">${escapeHtml(license.status.toUpperCase())}</span>
                    </td>
                    <td>${formatDate(license.issued_at)}</td>
                    <td>
                        <div>${formatDate(license.expiry_date)}</div>
                        <small>${remainingDays}</small>
                    </td>
                    <td>
                        ${license.last_validated_at ? `<div>${formatDate(license.last_validated_at)}</div><small class="tag-meta">${formatRelative(license.last_validated_at)}</small>` : '<span class="text-muted">Never</span>'}
                    </td>
                    <td class="text-right">
                        <div class="table-actions">
                            <button class="btn-xs" onclick="window.app.testInSimulator('${license.license_key}')" title="Test in Simulator">Test</button>
                            ${license.status === 'active' ? `
                                <button class="btn-xs" onclick="window.app.revokeLicense('${license.id}')" style="color: var(--accent-rose);">Revoke</button>
                            ` : `
                                <button class="btn-xs" onclick="window.app.updateLicenseStatus('${license.id}', 'active')">Reactivate</button>
                            `}
                            <button class="btn-xs" onclick="window.app.deleteLicense('${license.id}')" title="Delete">Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function syncSimulatorKeys() {
        const activeKeys = state.licenses.map(l => ({
            key: l.license_key,
            label: `${l.license_key} (${l.org_name || 'Client'} - ${l.status})`
        }));

        let options = '<option value="">Pick from issued licenses...</option>';
        activeKeys.forEach(k => {
            options += `<option value="${escapeHtml(k.key)}">${escapeHtml(k.label)}</option>`;
        });
        elements.simQuickKeyPicker.innerHTML = options;
    }

    // ==========================================
    // Tab 4: Cortex Heartbeat Simulator
    // ==========================================
    async function executeSimulatorPing(e) {
        if (e) e.preventDefault();

        const licenseKey = elements.simLicenseKey.value.trim();
        if (!licenseKey) {
            showToast('Please provide a license key to verify', 'error');
            return;
        }

        const payload = {
            license_key: licenseKey,
            machine_id: elements.simMachineId.value.trim() || 'HWID-SIM-TEST',
            app_version: elements.simAppVersion.value.trim() || '1.0.0',
            platform: elements.simPlatform.value,
            ip: elements.simIp.value.trim() || '127.0.0.1'
        };

        elements.simStatusBadge.innerHTML = `<span class="tag-meta">Sending verification ping...</span>`;
        elements.simJsonOutput.textContent = '// Pinging Cortex Admin /api/license/ping...';

        const startTime = performance.now();
        try {
            const res = await fetch('/api/license/ping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const latency = Math.round(performance.now() - startTime);
            const data = await res.json().catch(() => ({}));

            // Display HTTP Status
            elements.simHttpCode.textContent = `HTTP ${res.status}`;
            elements.simLatency.textContent = `Latency: ${latency}ms`;

            // Display Decision Banner
            elements.simDecisionContainer.style.display = 'block';
            if (data.allowed) {
                elements.simDecisionBanner.className = 'decision-banner allowed';
                elements.simDecisionIcon.textContent = '✓';
                elements.simDecisionTitle.textContent = 'ACCESS ALLOWED: VALID LICENSE';
                const verifiedAt12h = data.server_time_12h || formatDate(data.server_time, true);
                const expiry12h = data.expiry_date_12h || formatDate(data.expiry_date);
                elements.simDecisionDesc.textContent = `Client: ${data.client?.org_name || 'Authorized'} | Verified: ${verifiedAt12h} | Expires: ${expiry12h} | Ping cadence: ${data.next_ping_interval_hours || 6}h`;
                elements.simStatusBadge.innerHTML = `<span class="tag-status-active">ALLOWED</span>`;
                showToast('Heartbeat Verified: Client Execution Allowed!', 'success');
            } else {
                elements.simDecisionBanner.className = 'decision-banner denied';
                elements.simDecisionIcon.textContent = '✕';
                elements.simDecisionTitle.textContent = `ACCESS DENIED: ${data.code || 'BLOCKED'}`;
                elements.simDecisionDesc.textContent = `${data.message || 'Verification failed. Client application will block access.'} (${formatDate(new Date(), true)})`;
                elements.simStatusBadge.innerHTML = `<span class="tag-status-revoked">DENIED</span>`;
                showToast(`Heartbeat Denied: ${data.code || 'Verification failed'}`, 'error');
            }

            // Syntax-formatted JSON output
            elements.simJsonOutput.textContent = JSON.stringify(data, null, 2);

            // Refresh Overview and Logs in background to reflect live ping telemetry
            loadOverview();
            if (state.currentTab === 'licenses') loadLicenses();

        } catch (err) {
            const latency = Math.round(performance.now() - startTime);
            elements.simHttpCode.textContent = 'ERR';
            elements.simLatency.textContent = `Latency: ${latency}ms`;
            elements.simDecisionContainer.style.display = 'block';
            elements.simDecisionBanner.className = 'decision-banner denied';
            elements.simDecisionIcon.textContent = '!';
            elements.simDecisionTitle.textContent = 'CONNECTION ERROR';
            elements.simDecisionDesc.textContent = err.message;
            elements.simJsonOutput.textContent = JSON.stringify({ error: err.message }, null, 2);
        }
    }

    // ==========================================
    // Tab 5: Administrator Management
    // ==========================================
    async function loadAdmins() {
        try {
            const res = await apiRequest('/api/admin');
            if (res.success && res.data) {
                state.admins = res.data;
                renderAdminsTable();
            }
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    function renderAdminsTable() {
        if (!state.admins || state.admins.length === 0) {
            elements.adminsTableBody.innerHTML = `
                <tr><td colspan="5" class="text-center py-6">No administrators found.</td></tr>
            `;
            return;
        }

        elements.adminsTableBody.innerHTML = state.admins.map(admin => {
            const isSuper = admin.role === 'super_admin';
            return `
                <tr>
                    <td><strong>${escapeHtml(admin.name)}</strong></td>
                    <td><code>${escapeHtml(admin.email)}</code></td>
                    <td>
                        <span class="${isSuper ? 'badge-accent' : 'tag-meta'}">
                            ${escapeHtml(admin.role.toUpperCase())}
                        </span>
                    </td>
                    <td>${formatDate(admin.created_at)}</td>
                    <td class="text-right">
                        ${state.admins.length > 1 ? `
                            <button class="btn-xs" onclick="window.app.deleteAdmin('${admin.id}')" style="color: var(--accent-rose);">Delete</button>
                        ` : '<span class="tag-meta">Primary Admin</span>'}
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ==========================================
    // Tab 6: Telemetry Logs
    // ==========================================
    async function loadLogs() {
        try {
            const actionType = elements.logActionFilter ? elements.logActionFilter.value : '';
            const query = actionType ? `?action_type=${actionType}&limit=200` : '?limit=200';
            const res = await apiRequest(`/api/analytics/logs${query}`);
            if (res.success && res.data) {
                state.logs = res.data;
                renderLogsTable();
            }
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    function renderLogsTable() {
        if (!state.logs || state.logs.length === 0) {
            elements.logsTableBody.innerHTML = `
                <tr><td colspan="8" class="text-center py-6">No telemetry logs found.</td></tr>
            `;
            return;
        }

        const statusFilter = elements.logStatusFilter ? elements.logStatusFilter.value : '';
        const searchVal = elements.logSearchInput ? elements.logSearchInput.value.toLowerCase().trim() : '';

        const filtered = state.logs.filter(log => {
            if (statusFilter && log.status !== statusFilter) return false;
            if (searchVal) {
                const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata || '{}') : (log.metadata || {});
                const matchString = `${log.ip_address || ''} ${log.license_key || ''} ${meta.license_key_attempted || ''} ${meta.machine_id || ''} ${log.org_name || ''} ${log.id || ''}`.toLowerCase();
                if (!matchString.includes(searchVal)) return false;
            }
            return true;
        });

        if (filtered.length === 0) {
            elements.logsTableBody.innerHTML = `
                <tr><td colspan="8" class="text-center py-6">No telemetry logs match the current filter.</td></tr>
            `;
            return;
        }

        elements.logsTableBody.innerHTML = filtered.map(log => {
            const isSuccess = log.status === 'success';
            const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata || '{}') : (log.metadata || {});
            const detailSummary = meta.error || meta.reason || (isSuccess ? 'Heartbeat verified' : 'Rejected');

            return `
                <tr>
                    <td><small class="tag-meta">${escapeHtml(log.id?.slice(-8) || '-')}</small></td>
                    <td>${formatDate(log.created_at, true)}</td>
                    <td><span class="badge-mini">${escapeHtml(log.action_type.toUpperCase())}</span></td>
                    <td>
                        <span class="${isSuccess ? 'tag-status-active' : 'tag-status-revoked'}">
                            ${isSuccess ? 'SUCCESS' : 'FAILED'}
                        </span>
                    </td>
                    <td>${escapeHtml(log.org_name || 'External / Unknown')}</td>
                    <td>
                        <span class="license-key-pill">
                            ${escapeHtml(log.license_key || meta.license_key_attempted || 'N/A')}
                        </span>
                    </td>
                    <td><code>${escapeHtml(log.ip_address || '-')}</code></td>
                    <td>
                        <button class="btn-xs" onclick="window.app.viewMetadata('${log.id}')" title="${escapeHtml(detailSummary)}">Inspect JSON</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ==========================================
    // Public App Handlers (Window Binding)
    // ==========================================
    window.app = {
        switchTab,
        closeModals() {
            document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
        },
        copyKey(key) {
            navigator.clipboard.writeText(key).then(() => {
                showToast(`License key copied: ${key}`, 'success');
            }).catch(() => {
                showToast('Unable to copy to clipboard', 'error');
            });
        },
        testInSimulator(key) {
            elements.simLicenseKey.value = key;
            switchTab('simulator');
            executeSimulatorPing();
        },
        openIssueForClient(clientId) {
            elements.issueClientId.value = clientId;
            elements.modalIssueLicense.classList.add('open');
        },
        openEditClient(clientId) {
            const client = state.clients.find(c => c.id === clientId);
            if (!client) return;
            document.getElementById('edit-client-id').value = client.id;
            document.getElementById('edit-client-org').value = client.org_name;
            document.getElementById('edit-client-contact').value = client.contact_name;
            document.getElementById('edit-client-email').value = client.email;
            document.getElementById('edit-client-phone').value = client.phone || '';
            document.getElementById('edit-client-status').value = client.status;
            elements.modalEditClient.classList.add('open');
        },
        async toggleClientStatus(clientId, newStatus) {
            try {
                const res = await apiRequest(`/api/clients/${clientId}/status`, 'PATCH', { status: newStatus });
                if (res.success) {
                    showToast(`Client marked as ${newStatus}`, 'success');
                    await loadClients();
                    loadOverview();
                } else {
                    showToast(res.message, 'error');
                }
            } catch (err) {
                showToast(err.message, 'error');
            }
        },
        async deleteClient(clientId) {
            if (!confirm('Are you sure you want to delete this client? All associated licenses will be removed!')) return;
            try {
                const res = await apiRequest(`/api/clients/${clientId}`, 'DELETE');
                if (res.success) {
                    showToast('Client deleted successfully', 'success');
                    await loadClients();
                    loadOverview();
                } else {
                    showToast(res.message, 'error');
                }
            } catch (err) {
                showToast(err.message, 'error');
            }
        },
        async revokeLicense(licenseId) {
            if (!confirm('Revoke this license? The Cortex client will be blocked immediately upon next ping!')) return;
            try {
                const res = await apiRequest(`/api/license/${licenseId}/revoke`, 'PATCH');
                if (res.success) {
                    showToast('License revoked successfully', 'success');
                    await loadLicenses();
                    loadOverview();
                } else {
                    showToast(res.message, 'error');
                }
            } catch (err) {
                showToast(err.message, 'error');
            }
        },
        async updateLicenseStatus(licenseId, status) {
            try {
                const res = await apiRequest(`/api/license/${licenseId}/status`, 'PATCH', { status });
                if (res.success) {
                    showToast(`License status updated to ${status}`, 'success');
                    await loadLicenses();
                    loadOverview();
                } else {
                    showToast(res.message, 'error');
                }
            } catch (err) {
                showToast(err.message, 'error');
            }
        },
        async deleteLicense(licenseId) {
            if (!confirm('Permanently delete this license key?')) return;
            try {
                const res = await apiRequest(`/api/license/${licenseId}`, 'DELETE');
                if (res.success) {
                    showToast('License deleted successfully', 'success');
                    await loadLicenses();
                    loadOverview();
                } else {
                    showToast(res.message, 'error');
                }
            } catch (err) {
                showToast(err.message, 'error');
            }
        },
        async deleteAdmin(adminId) {
            if (!confirm('Delete this administrator account?')) return;
            try {
                const res = await apiRequest(`/api/admin/${adminId}`, 'DELETE');
                if (res.success) {
                    showToast('Admin deleted successfully', 'success');
                    await loadAdmins();
                } else {
                    showToast(res.message, 'error');
                }
            } catch (err) {
                showToast(err.message, 'error');
            }
        },
        viewMetadata(logId) {
            const log = (state.logs || []).find(l => l.id === logId) || 
                        (state.overview?.recentPings || []).find(l => l.id === logId);
            if (!log) return;
            const meta = typeof log.metadata === 'string' ? JSON.parse(log.metadata || '{}') : (log.metadata || {});
            elements.metadataJsonContent.textContent = JSON.stringify({
                log_id: log.id,
                action_type: log.action_type,
                status: log.status,
                client: log.org_name || 'N/A',
                license_key: log.license_key || meta.license_key_attempted || 'N/A',
                ip_address: log.ip_address,
                timestamp_12h: formatDate(log.created_at, true),
                timestamp_iso: log.created_at,
                telemetry_metadata: meta
            }, null, 2);
            elements.modalMetadata.classList.add('open');
        }
    };

    // ==========================================
    // Event Listeners & Modals
    // ==========================================
    function setupEventListeners() {
        // Tab switching
        elements.navButtons.forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });

        // Timeframe selector buttons (24h, 7d, 30d)
        if (elements.timeframeButtons) {
            elements.timeframeButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    elements.timeframeButtons.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    state.timeframe = btn.dataset.range || '24h';
                    loadOverview();
                });
            });
        }

        // CSV Download Helper
        function downloadFile(endpoint, filename) {
            const a = document.createElement('a');
            a.href = endpoint;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showToast(`Generating ${filename}...`, 'info');
        }

        // CSV Export buttons
        if (elements.btnExportTelemetryCsv) {
            elements.btnExportTelemetryCsv.addEventListener('click', () => {
                downloadFile('/api/analytics/export/telemetry', `cortex-telemetry-${Date.now()}.csv`);
            });
        }

        if (elements.btnExportLicensesCsv) {
            elements.btnExportLicensesCsv.addEventListener('click', () => {
                downloadFile('/api/analytics/export/licenses', `cortex-licenses-${Date.now()}.csv`);
            });
        }

        if (elements.btnExportLogsCsv) {
            elements.btnExportLogsCsv.addEventListener('click', () => {
                downloadFile('/api/analytics/export/telemetry', `cortex-telemetry-${Date.now()}.csv`);
            });
        }

        // Top refresh button
        elements.refreshAllBtn.addEventListener('click', () => {
            loadOverview();
            loadClients();
            loadLicenses();
            loadAdmins();
            loadLogs();
            showToast('All data refreshed', 'info');
        });

        // Client filters & search
        elements.clientSearchInput.addEventListener('input', renderClientsTable);
        elements.clientStatusFilter.addEventListener('change', renderClientsTable);

        // License filters & search
        elements.licenseSearchInput.addEventListener('input', renderLicensesTable);
        elements.licenseStatusFilter.addEventListener('change', renderLicensesTable);

        // Simulator Quick Picker
        elements.simQuickKeyPicker.addEventListener('change', (e) => {
            if (e.target.value) elements.simLicenseKey.value = e.target.value;
        });

        // Simulator form submit
        elements.simulatorForm.addEventListener('submit', executeSimulatorPing);

        // Logs filters & refresh
        if (elements.logActionFilter) elements.logActionFilter.addEventListener('change', loadLogs);
        if (elements.logStatusFilter) elements.logStatusFilter.addEventListener('change', renderLogsTable);
        if (elements.logSearchInput) elements.logSearchInput.addEventListener('input', renderLogsTable);
        if (elements.btnRefreshLogs) elements.btnRefreshLogs.addEventListener('click', loadLogs);

        // Modal Open Triggers
        elements.btnOpenAddClient.addEventListener('click', () => elements.modalAddClient.classList.add('open'));
        elements.btnOpenIssueLicense.addEventListener('click', () => elements.modalIssueLicense.classList.add('open'));
        elements.btnOpenAddAdmin.addEventListener('click', () => elements.modalAddAdmin.classList.add('open'));

        // Validity Presets in Issue License Modal
        document.querySelectorAll('input[name="validity_preset"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                elements.customDaysWrap.style.display = e.target.value === 'custom' ? 'block' : 'none';
            });
        });

        // Form: Add Client
        elements.formAddClient.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                org_name: document.getElementById('client-org-name').value.trim(),
                contact_name: document.getElementById('client-contact-name').value.trim(),
                email: document.getElementById('client-email').value.trim(),
                phone: document.getElementById('client-phone').value.trim(),
                status: document.getElementById('client-status').value
            };

            try {
                const res = await apiRequest('/api/clients', 'POST', payload);
                if (res.success) {
                    showToast(`Client "${payload.org_name}" registered!`, 'success');
                    elements.formAddClient.reset();
                    window.app.closeModals();
                    await loadClients();
                    loadOverview();
                } else {
                    showToast(res.message, 'error');
                }
            } catch (err) {
                showToast(err.message, 'error');
            }
        });

        // Form: Edit Client
        elements.formEditClient.addEventListener('submit', async (e) => {
            e.preventDefault();
            const clientId = document.getElementById('edit-client-id').value;
            const payload = {
                org_name: document.getElementById('edit-client-org').value.trim(),
                contact_name: document.getElementById('edit-client-contact').value.trim(),
                email: document.getElementById('edit-client-email').value.trim(),
                phone: document.getElementById('edit-client-phone').value.trim(),
                status: document.getElementById('edit-client-status').value
            };

            try {
                const res = await apiRequest(`/api/clients/${clientId}`, 'PUT', payload);
                if (res.success) {
                    showToast('Client details updated!', 'success');
                    window.app.closeModals();
                    await loadClients();
                    loadOverview();
                } else {
                    showToast(res.message, 'error');
                }
            } catch (err) {
                showToast(err.message, 'error');
            }
        });

        // Form: Issue License
        elements.formIssueLicense.addEventListener('submit', async (e) => {
            e.preventDefault();
            const clientId = elements.issueClientId.value;
            const preset = document.querySelector('input[name="validity_preset"]:checked').value;
            let validityDays = parseInt(preset);
            if (preset === 'custom') {
                validityDays = parseInt(elements.issueCustomDays.value) || 30;
            }

            try {
                const res = await apiRequest('/api/license', 'POST', {
                    client_id: clientId,
                    validity_days: validityDays
                });

                if (res.success) {
                    showToast(`License issued: ${res.data.license_key}`, 'success');
                    elements.formIssueLicense.reset();
                    window.app.closeModals();
                    await loadLicenses();
                    await loadClients();
                    loadOverview();
                } else {
                    showToast(res.message, 'error');
                }
            } catch (err) {
                showToast(err.message, 'error');
            }
        });

        // Form: Add Admin
        elements.formAddAdmin.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                name: document.getElementById('admin-name').value.trim(),
                email: document.getElementById('admin-email').value.trim(),
                password: document.getElementById('admin-password').value,
                role: document.getElementById('admin-role').value
            };

            try {
                const res = await apiRequest('/api/admin', 'POST', payload);
                if (res.success) {
                    showToast(`Admin user "${payload.name}" created!`, 'success');
                    elements.formAddAdmin.reset();
                    window.app.closeModals();
                    await loadAdmins();
                } else {
                    showToast(res.message, 'error');
                }
            } catch (err) {
                showToast(err.message, 'error');
            }
        });

        // Close modal on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') window.app.closeModals();
        });

        // Auto refresh telemetry logs if checked
        setInterval(() => {
            if (elements.logAutoRefresh.checked && state.currentTab === 'logs') {
                loadLogs();
            }
        }, 10000);

        // Real-time Clock (12-Hour AM/PM format)
        function updateClock() {
            const now = new Date();
            let hours = now.getHours();
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12;
            const hourStr = String(hours).padStart(2, '0');
            elements.liveClock.textContent = `${hourStr}:${minutes}:${seconds} ${ampm}`;
        }
        setInterval(updateClock, 1000);
        updateClock();
    }

    // Initialize App
    async function init() {
        setupEventListeners();
        await loadOverview();
        await loadClients();
        await loadLicenses();
        await loadAdmins();
    }

    init();
})();
