import path from 'path'
import dotenv from 'dotenv'

const __filename = import.meta.filename
const __dirname = path.dirname(__filename)

dotenv.config({
    path:path.join(__dirname , '..' , '..' , '.env'),
    encoding:"utf-8"
})

const env = {
    DATABASE_SQL_HOST: process.env.DATABASE_SQL_HOST || process.env.DTABASE_SQL_HOST || process.env.AIVEN_SQL_HOST || '',
    DATABASE_SQL_PORT: process.env.DATABASE_SQL_PORT || process.env.AIVEN_SQL_PORT || '4000',
    DATABASE_SQL_USER: process.env.DATABASE_SQL_USER || process.env.AIVEN_SQL_USER || '',
    DATABASE_SQL_PASSWORD: process.env.DATABASE_SQL_PASSWORD || process.env.DATBASE_SQL_PASSWORD || process.env.AIVEN_SQL_PASSWORD || '',
    DATABASE_SQL_DATABASE: process.env.DATABASE_SQL_DATABASE || process.env.AIVEN_SQL_DATABASE || 'cortex_admin',

    // Backward-compatibility aliases
    AIVEN_SQL_HOST: process.env.DATABASE_SQL_HOST || process.env.DTABASE_SQL_HOST || process.env.AIVEN_SQL_HOST || '',
    AIVEN_SQL_PORT: process.env.DATABASE_SQL_PORT || process.env.AIVEN_SQL_PORT || '4000',
    AIVEN_SQL_USER: process.env.DATABASE_SQL_USER || process.env.AIVEN_SQL_USER || '',
    AIVEN_SQL_PASSWORD: process.env.DATABASE_SQL_PASSWORD || process.env.DATBASE_SQL_PASSWORD || process.env.AIVEN_SQL_PASSWORD || '',
    AIVEN_SQL_DATABASE: process.env.DATABASE_SQL_DATABASE || process.env.AIVEN_SQL_DATABASE || 'cortex_admin',

    PORT: parseInt(process.env.PORT || '5000'),
    JWT_SECRET: process.env.JWT_SECRET || 'cortex-super-secret-key-2026',
    COOKIE_SECRET: process.env.COOKIE_SECRET || 'cortex-cookie-secret',
    COOKIE_EXPIRY_DAYS: parseInt(process.env.COOKIE_EXPIRY_DAYS || '7'),

    DEFAULT_LICENSE_VALIDITY_DAYS: parseInt(process.env.DEFAULT_LICENSE_VALIDITY_DAYS || '264'),
    LICENSE_PING_INTERVAL_HOURS: parseInt(process.env.LICENSE_PING_INTERVAL_HOURS || '6'),

    ADMIN_DEFAULT_EMAIL: process.env.ADMIN_DEFAULT_EMAIL || 'admin@cortex.com',
    ADMIN_DEFAULT_PASSWORD: process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@Cortex2026',

    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || '',
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || '',
    SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID || '',
    SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET || '',
    SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET || process.env.SLACK_SECRET || '',
    JIRA_CLIENT_ID: process.env.JIRA_CLIENT_ID || '',
    JIRA_CLIENT_SECRET: process.env.JIRA_CLIENT_SECRET || '',
    ADMIN_PUBLIC_URL: (process.env.ADMIN_PUBLIC_URL && !process.env.ADMIN_PUBLIC_URL.includes('cortex-admin-two.vercel.app'))
        ? process.env.ADMIN_PUBLIC_URL.trim()
        : 'https://admin.cortexco.in',

    RESEND_API_KEY: process.env.RESEND_API_KEY || '',
    RESEND_BROADCAST_FROM: process.env.RESEND_BROADCAST_FROM || 'CortexCo <notification@cortexco.in>',
    RESEND_SUPPORT_FROM: process.env.RESEND_SUPPORT_FROM || 'CortexCo Support <support@cortexco.in>'
}

export default Object.freeze(env)