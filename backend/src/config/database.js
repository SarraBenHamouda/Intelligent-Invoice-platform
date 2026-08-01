const sql = require('mssql');

const databaseConfig = {
  server: process.env.DB_SERVER,
  port: Number(process.env.DB_PORT || 1433),
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,

  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate:
      process.env.DB_TRUST_CERTIFICATE === 'true',
  },

  pool: {
    min: 0,
    max: 10,
    idleTimeoutMillis: 30000,
  },

  connectionTimeout: 15000,
  requestTimeout: 30000,
};

let pool = null;

async function connectDatabase() {
  if (pool?.connected) {
    return pool;
  }

  pool = await new sql.ConnectionPool(
    databaseConfig
  ).connect();

  console.log('SQL Server connected');

  return pool;
}

function getDatabase() {
  if (!pool?.connected) {
    throw new Error(
      'La connexion SQL Server n’est pas initialisée.'
    );
  }

  return pool;
}

async function closeDatabase() {
  if (pool) {
    await pool.close();
    pool = null;
  }
}

module.exports = {
  sql,
  connectDatabase,
  getDatabase,
  closeDatabase,
};