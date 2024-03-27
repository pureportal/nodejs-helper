import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    user:                       process.env.POSTGRES_USER,
    password:                   process.env.POSTGRES_PASSWORD,
    host:                       process.env.POSTGRES_HOSTNAME || 'localhost',
    database:                   process.env.POSTGRES_DATABASE || 'postgres',
    port:                       process.env.POSTGRES_PORT ? parseInt(process.env.POSTGRES_PORT) : 5432,
    connectionTimeoutMillis:    2000, // 2 seconds - terminate the connection if it takes longer than 2 seconds
    idleTimeoutMillis:          1000, // 1 second - close idle clients after 1 second
})

// Generate pool
export default pool;
export { pool as postgres };