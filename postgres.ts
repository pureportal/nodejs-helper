import pkg, { PoolClient } from "pg";
const { Pool } = pkg;

const pool = new Pool({
  // Basic connection settings
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  host: process.env.POSTGRES_HOSTNAME || "localhost",
  database: process.env.POSTGRES_DATABASE || "postgres",
  port: Number.parseInt(process.env.POSTGRES_PORT || "5432"),

  // Pool size configuration
  max: Number.parseInt(process.env.POSTGRES_POOL_MAX || "75"), // Increased from 10 to 75 to handle more connections
  min: Number.parseInt(process.env.POSTGRES_POOL_MIN || "2"), // Increased from 0 to 2 to maintain a minimum pool

  // Timeouts (in milliseconds)
  idleTimeoutMillis: Number.parseInt(process.env.POSTGRES_POOL_IDLE_TIMEOUT || "60000"), // Increased to 1 minute
  connectionTimeoutMillis: Number.parseInt(process.env.POSTGRES_POOL_CONNECTION_TIMEOUT || "5000"), // Increased to 5 seconds
  statement_timeout: Number.parseInt(process.env.POSTGRES_STATEMENT_TIMEOUT || "30000"), // Increased to 30 seconds
  query_timeout: Number.parseInt(process.env.POSTGRES_QUERY_TIMEOUT || "60000"), // Increased to 1 minute

  // Connection management
  keepAlive: process.env.POSTGRES_KEEP_ALIVE !== "false", // Default to true unless explicitly set to 'false'
  keepAliveInitialDelayMillis: Number.parseInt(process.env.POSTGRES_KEEP_ALIVE_INITIAL_DELAY || "30000"), // Increased to 30 seconds

  // Security
  ssl: process.env.POSTGRES_SSL === "true", // Enable SSL only when explicitly set to 'true'

  // Resource management
  allowExitOnIdle: process.env.POSTGRES_ALLOW_EXIT_ON_IDLE === "true", // Default to false unless explicitly set to 'true'
  maxUses: Number.parseInt(process.env.POSTGRES_MAX_USES || "7500"), // Increased to 7500 to reduce connection churn

  // Advanced settings
  Promise: global.Promise, // Use native promises
  log: process.env.POSTGRES_LOG === "true" ? console.log : undefined, // Enable logging only when explicitly set to 'true'

  // Application name for easier identification in PostgreSQL logs
  application_name: process.env.POSTGRES_APP_NAME || "MyNodeApp",
});

// Attach error handler to the pool
pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  // Log the error but don't immediately exit - let the application handle graceful shutdown
  console.error("Database pool error - application may need restart");
});

// Connection monitoring
pool.on("connect", () => {
  console.log("New client connected to database");
});

pool.on("acquire", () => {
  console.log("Client acquired from pool");
});

pool.on("remove", () => {
  console.log("Client removed from pool");
});

// Health check function
export const checkDatabaseHealth = async (): Promise<boolean> => {
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("SELECT 1");
    return true;
  } catch (error) {
    console.error("Database health check failed:", error);
    return false;
  } finally {
    if (client) {
      client.release();
    }
  }
};

// Pool stats monitoring
export const getPoolStats = () => {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
};

export default pool;
export { pool as postgres };
