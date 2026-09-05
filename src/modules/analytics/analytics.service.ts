import { ClientModel } from '../client/client.model.js';
import { LicenseModel } from '../license/license.model.js';
import { UsageLogModel } from '../usage/usage.model.js';
import { AdminModel } from '../admin/admin.model.js';

function formatDate12h(date: Date | string | null | undefined, includeSeconds = true): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);

    const day = String(d.getDate()).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();

    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hourStr = String(hours).padStart(2, '0');

    if (includeSeconds) {
        const seconds = String(d.getSeconds()).padStart(2, '0');
        return `${day} ${month} ${year}, ${hourStr}:${minutes}:${seconds} ${ampm}`;
    }
    return `${day} ${month} ${year}, ${hourStr}:${minutes} ${ampm}`;
}

export const AnalyticsService = {
    async getOverview() {
        return this.getDetailedAnalytics('24h');
    },

    async getDetailedAnalytics(range: '24h' | '7d' | '30d' = '24h') {
        let hours = 24;
        if (range === '7d') hours = 168;
        if (range === '30d') hours = 720;

        const [
            clientStats,
            licenseStats,
            pingStats,
            adminCount,
            timeline,
            failureBreakdown,
            platforms,
            versions,
            topClients,
            securityAnomalies,
            expiringLicenses,
            clientHeartbeatStatus
        ] = await Promise.all([
            ClientModel.count(),
            LicenseModel.count(),
            UsageLogModel.getPingStatsByTimeframe(hours),
            AdminModel.count(),
            UsageLogModel.getPingTimeline(hours),
            UsageLogModel.getFailureReasonBreakdown(hours),
            UsageLogModel.getPlatformDistribution(hours),
            UsageLogModel.getAppVersionDistribution(hours),
            UsageLogModel.getTopActiveClients(hours, 5),
            UsageLogModel.getSecurityAnomalies(hours),
            LicenseModel.findExpiringSoon(30),
            ClientModel.getClientHeartbeatStatus()
        ]);

        const totalPings = parseInt(pingStats.total_pings) || 0;
        const successfulPings = parseInt(pingStats.successful_pings) || 0;
        const failedPings = parseInt(pingStats.failed_pings) || 0;
        const successRate = totalPings > 0 ? ((successfulPings / totalPings) * 100).toFixed(1) : '100.0';

        // Compute Client Fleet Heartbeat Health
        const totalClientsCount = clientHeartbeatStatus.length;
        let healthyClients = 0;
        let delayedClients = 0;
        let offlineClients = 0;

        const clientsRoster = clientHeartbeatStatus.map((c: any) => {
            const hours = c.hours_since_ping !== null ? parseInt(c.hours_since_ping) : null;
            let healthStatus: 'healthy' | 'delayed' | 'offline' = 'offline';
            let healthLabel = 'Never Pinged';

            if (hours !== null) {
                if (hours <= 8) {
                    healthStatus = 'healthy';
                    healthLabel = `Online (${hours}h ago)`;
                    healthyClients++;
                } else if (hours <= 24) {
                    healthStatus = 'delayed';
                    healthLabel = `Delayed (${hours}h ago)`;
                    delayedClients++;
                } else {
                    healthStatus = 'offline';
                    healthLabel = `Offline (${Math.round(hours / 24)}d ago)`;
                    offlineClients++;
                }
            } else {
                offlineClients++;
            }

            return {
                id: c.id,
                org_name: c.org_name,
                contact_name: c.contact_name,
                email: c.email,
                client_status: c.client_status,
                total_licenses: parseInt(c.total_licenses) || 0,
                active_licenses: parseInt(c.active_licenses) || 0,
                last_heartbeat_at: c.last_heartbeat_at,
                hours_since_ping: hours,
                health_status: healthStatus,
                health_label: healthLabel
            };
        });

        const fleetHealthPercent = totalClientsCount > 0
            ? Math.round((healthyClients / totalClientsCount) * 100)
            : 100;

        // Categorize expiring licenses (<7d urgent, <14d warning, <30d info)
        let expiringIn7Days = 0;
        let expiringIn14Days = 0;
        let expiringIn30Days = expiringLicenses.length;

        const processedExpiring = expiringLicenses.map((lic: any) => {
            const daysLeft = parseInt(lic.days_remaining) || 0;
            let urgency: 'critical' | 'warning' | 'info' = 'info';
            if (daysLeft <= 7) {
                urgency = 'critical';
                expiringIn7Days++;
            } else if (daysLeft <= 14) {
                urgency = 'warning';
                expiringIn14Days++;
            }
            return {
                ...lic,
                days_remaining: daysLeft,
                urgency
            };
        });

        return {
            range,
            hours,
            clients: {
                total: parseInt(clientStats.total) || 0,
                active: parseInt(clientStats.active) || 0,
                suspended: parseInt(clientStats.suspended) || 0,
                fleet_health_percent: fleetHealthPercent,
                healthy_count: healthyClients,
                delayed_count: delayedClients,
                offline_count: offlineClients
            },
            licenses: {
                total: parseInt(licenseStats.total) || 0,
                active: parseInt(licenseStats.active) || 0,
                expired: parseInt(licenseStats.expired) || 0,
                revoked: parseInt(licenseStats.revoked) || 0,
                suspended: parseInt(licenseStats.suspended) || 0,
                expiring_soon_count: expiringIn30Days,
                expiring_7d_count: expiringIn7Days,
                expiring_14d_count: expiringIn14Days
            },
            pings: {
                total: totalPings,
                success: successfulPings,
                failed: failedPings,
                success_rate_percent: parseFloat(successRate),
                active_clients_pinging: parseInt(pingStats.active_clients_pinging) || 0,
                unique_ips: parseInt(pingStats.unique_ips) || 0
            },
            security: {
                unauthorized_key_attempts: parseInt(securityAnomalies.unauthorized_key_attempts) || 0,
                suspicious_unique_ips: parseInt(securityAnomalies.suspicious_unique_ips) || 0,
                active_machines_count: parseInt(securityAnomalies.active_machines_count) || 0
            },
            timeline,
            failure_breakdown: failureBreakdown.map((f: any) => ({
                reason: f.reason,
                count: parseInt(f.count),
                percent: totalPings > 0 ? ((parseInt(f.count) / failedPings) * 100).toFixed(1) : '0'
            })),
            platforms: platforms.map((p: any) => ({
                platform: p.platform,
                count: parseInt(p.count),
                percent: totalPings > 0 ? ((parseInt(p.count) / totalPings) * 100).toFixed(1) : '0'
            })),
            versions: versions.map((v: any) => ({
                version: v.app_version,
                count: parseInt(v.count),
                percent: totalPings > 0 ? ((parseInt(v.count) / totalPings) * 100).toFixed(1) : '0'
            })),
            top_clients: topClients.map((tc: any) => ({
                client_id: tc.client_id,
                org_name: tc.org_name,
                email: tc.email,
                total_pings: parseInt(tc.total_pings),
                success_pings: parseInt(tc.success_pings),
                failed_pings: parseInt(tc.failed_pings),
                last_ping_at: tc.last_ping_at
            })),
            expiring_licenses: processedExpiring,
            client_roster: clientsRoster,
            admins_count: adminCount
        };
    },

    async getRecentLogs(limit = 50, actionType?: string) {
        return await UsageLogModel.getRecentLogs(limit, actionType);
    },

    async getPingTimeline() {
        return await UsageLogModel.getPingTimelineHourly();
    },

    async exportTelemetryCsv(limit = 2000): Promise<string> {
        const rows = await UsageLogModel.getAllLogsForExport(limit);
        const headers = [
            'ID',
            'Timestamp (12-Hour AM/PM)',
            'Action Type',
            'Status',
            'Organization',
            'Client Email',
            'License Key',
            'IP Address',
            'Machine ID',
            'App Version',
            'Platform',
            'Details'
        ];

        const csvLines = [headers.join(',')];
        for (const row of rows) {
            const values = [
                row.id,
                row.created_at ? `"${formatDate12h(row.created_at, true)}"` : '',
                row.action_type,
                row.status,
                `"${(row.org_name || '').replace(/"/g, '""')}"`,
                row.client_email || '',
                row.license_key || '',
                row.ip_address || '',
                row.machine_id || '',
                row.app_version || '',
                row.platform || '',
                `"${(row.status_detail || '').replace(/"/g, '""')}"`
            ];
            csvLines.push(values.join(','));
        }

        return csvLines.join('\n');
    },

    async exportLicensesCsv(): Promise<string> {
        const rows = await LicenseModel.getAllForExport();
        const headers = [
            'License ID',
            'License Key',
            'Status',
            'Organization',
            'Contact Person',
            'Client Email',
            'Issued Date (12-Hour AM/PM)',
            'Expiry Date (12-Hour AM/PM)',
            'Days Remaining',
            'Last Heartbeat (12-Hour AM/PM)'
        ];

        const csvLines = [headers.join(',')];
        for (const row of rows) {
            const values = [
                row.id,
                row.license_key,
                row.status,
                `"${(row.org_name || '').replace(/"/g, '""')}"`,
                `"${(row.contact_name || '').replace(/"/g, '""')}"`,
                row.client_email || '',
                row.issued_at ? `"${formatDate12h(row.issued_at, false)}"` : '',
                row.expiry_date ? `"${formatDate12h(row.expiry_date, false)}"` : '',
                row.days_remaining !== undefined ? row.days_remaining : '',
                row.last_validated_at ? `"${formatDate12h(row.last_validated_at, true)}"` : 'Never'
            ];
            csvLines.push(values.join(','));
        }

        return csvLines.join('\n');
    }
};
