import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    // Basic connection settings
    user:     process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    host:     process.env.POSTGRES_HOSTNAME || 'localhost',
    database: process.env.POSTGRES_DATABASE || 'postgres',
    port:     parseInt(process.env.POSTGRES_PORT || '5432'),

    // Pool size configuration
    max: parseInt(process.env.POSTGRES_POOL_MAX || '75'),     // Increased from 10 to 75 to handle more connections
    min: parseInt(process.env.POSTGRES_POOL_MIN || '2'),      // Increased from 0 to 2 to maintain a minimum pool

    // Timeouts (in milliseconds)
    idleTimeoutMillis:         parseInt(process.env.POSTGRES_POOL_IDLE_TIMEOUT || '60000'),         // Increased to 1 minute
    connectionTimeoutMillis:   parseInt(process.env.POSTGRES_POOL_CONNECTION_TIMEOUT || '5000'),    // Increased to 5 seconds
    statement_timeout:         parseInt(process.env.POSTGRES_STATEMENT_TIMEOUT || '30000'),         // Increased to 30 seconds
    query_timeout:             parseInt(process.env.POSTGRES_QUERY_TIMEOUT || '60000'),             // Increased to 1 minute

    // Connection management
    keepAlive: process.env.POSTGRES_KEEP_ALIVE !== 'false',   // Default to true unless explicitly set to 'false'
    keepAliveInitialDelayMillis: parseInt(process.env.POSTGRES_KEEP_ALIVE_INITIAL_DELAY || '30000'), // Increased to 30 seconds

    // Security
    ssl: process.env.POSTGRES_SSL === 'true' ? true : false,  // Enable SSL only when explicitly set to 'true'

    // Resource management
    allowExitOnIdle: process.env.POSTGRES_ALLOW_EXIT_ON_IDLE === 'true',  // Default to false unless explicitly set to 'true'
    maxUses: parseInt(process.env.POSTGRES_MAX_USES || '7500'),  // Increased to 7500 to reduce connection churn

    // Advanced settings
    Promise: global.Promise,  // Use native promises
    log: process.env.POSTGRES_LOG === 'true' ? console.log : undefined,  // Enable logging only when explicitly set to 'true'

    // Application name for easier identification in PostgreSQL logs
    application_name: process.env.POSTGRES_APP_NAME || 'MyNodeApp',
});

// Attach error handler to the pool
pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

export default pool;
export { pool as postgres };