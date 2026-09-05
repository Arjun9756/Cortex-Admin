import path from 'path'
import dotenv from 'dotenv'

const __filename = import.meta.filename
const __dirname = path.dirname(__filename)

dotenv.config({
    path:path.join(__dirname , '..' , '..' , '.env'),
    encoding:"utf-8"
})

const env = {
    AIVEN_SQL_HOST:process.env.AIVEN_SQL_HOST!,
    AIVEN_SQL_PORT:process.env.AIVEN_SQL_PORT!,
    AIVEN_SQL_USER:process.env.AIVEN_SQL_USER!,
    AIVEN_SQL_PASSWORD:process.env.AIVEN_SQL_PASSWORD!,

    AIVEN_SQL_DATABASE: process.env.AIVEN_SQL_DATABASE || 'defaultdb',

    PORT: parseInt(process.env.PORT || '5000'),
    JWT_SECRET: process.env.JWT_SECRET || 'cortex-super-secret-key-2026',
    COOKIE_SECRET: process.env.COOKIE_SECRET || 'cortex-cookie-secret',
    COOKIE_EXPIRY_DAYS: parseInt(process.env.COOKIE_EXPIRY_DAYS || '7'),

    DEFAULT_LICENSE_VALIDITY_DAYS: parseInt(process.env.DEFAULT_LICENSE_VALIDITY_DAYS || '264'),
    LICENSE_PING_INTERVAL_HOURS: parseInt(process.env.LICENSE_PING_INTERVAL_HOURS || '6'),

    ADMIN_DEFAULT_EMAIL: process.env.ADMIN_DEFAULT_EMAIL || 'admin@cortex.com',
    ADMIN_DEFAULT_PASSWORD: process.env.ADMIN_DEFAULT_PASSWORD || 'Admin@Cortex2026'
}

export default Object.freeze(env)