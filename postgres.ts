import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    user:       process.env.POSTGRES_USER,
    password:   process.env.POSTGRES_PASSWORD,
    host:       process.env.POSTGRES_HOSTNAME || 'localhost',
    database:   process.env.POSTGRES_DATABASE || 'beewatec-intern',
    port:       process.env.POSTGRES_PORT ? parseInt(process.env.POSTGRES_PORT) : 5432,
})


// Generate pool
export default pool;
export { pool as postgres };