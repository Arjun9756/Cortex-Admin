import mysql from 'mysql2/promise'
import env from './env.config.js'
import fs from 'fs'
import path from 'path'

const __filename = import.meta.filename
const __dirname = path.dirname(__filename)

console.log(env)

function getSslConfig() {
    if (process.env.AIVEN_CA_CERT) {
        return { ca: process.env.AIVEN_CA_CERT };
    }
    const cwdCa = path.join(process.cwd(), 'ca.pem');
    if (fs.existsSync(cwdCa)) {
        return { ca: fs.readFileSync(cwdCa, 'utf-8') };
    }
    const relCa = path.join(__dirname, '..', '..', 'ca.pem');
    if (fs.existsSync(relCa)) {
        return { ca: fs.readFileSync(relCa, 'utf-8') };
    }
    return { rejectUnauthorized: false };
}

const pool = mysql.createPool({
    host: env.AIVEN_SQL_HOST,
    user: env.AIVEN_SQL_USER,
    password: env.AIVEN_SQL_PASSWORD,
    port: parseInt(env.AIVEN_SQL_PORT),
    database: env.AIVEN_SQL_DATABASE,
    waitForConnections: true,
    ssl: getSslConfig(),
    connectionLimit: 10,
    connectTimeout: 10000,
})

export default Object.freeze(pool)