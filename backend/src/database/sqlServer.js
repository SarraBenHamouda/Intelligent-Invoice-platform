const sql = require('mssql');

/*
|--------------------------------------------------------------------------
| SQL SERVER CONNECTION
|--------------------------------------------------------------------------
|
| Ce fichier crée et réutilise une seule connexion SQL Server.
| Les informations de connexion viennent du fichier backend/.env.
|
| Variables attendues :
|
| DB_SERVER=localhost
| DB_PORT=1433
| DB_DATABASE=InvoiceFlow
| DB_USER=sa
| DB_PASSWORD=VotreMotDePasse
| DB_ENCRYPT=false
| DB_TRUST_SERVER_CERTIFICATE=true
|
|--------------------------------------------------------------------------
*/

const databaseConfig = {
  server:
    process.env.DB_SERVER ||
    'localhost',

  port:
    Number(
      process.env.DB_PORT ||
      1433,
    ),

  database:
    process.env.DB_DATABASE ||
    'InvoiceFlow',

  user:
    process.env.DB_USER ||
    'sa',

  password:
    process.env.DB_PASSWORD ||
    '',

  options: {
    encrypt:
      String(
        process.env.DB_ENCRYPT ||
        'false',
      ).toLowerCase() === 'true',

    trustServerCertificate:
      String(
        process.env
          .DB_TRUST_SERVER_CERTIFICATE ||
        'true',
      ).toLowerCase() === 'true',

    enableArithAbort: true,
  },

  pool: {
    max: 10,
    min: 0,

    idleTimeoutMillis:
      30000,
  },

  requestTimeout:
    30000,

  connectionTimeout:
    15000,
};

let poolPromise = null;

/*
|--------------------------------------------------------------------------
| GET POOL
|--------------------------------------------------------------------------
|
| Retourne une connexion SQL Server existante.
| Si aucune connexion n'existe, elle est créée.
|
|--------------------------------------------------------------------------
*/

async function getPool() {
  if (!poolPromise) {
    const pool =
      new sql.ConnectionPool(
        databaseConfig,
      );

    pool.on(
      'error',
      (error) => {
        console.error(
          '[SQL Server] Erreur du pool :',
          error,
        );

        poolPromise = null;
      },
    );

    poolPromise =
      pool.connect()
        .then(
          (connectedPool) => {
            console.log(
              `[SQL Server] Connecté à ${databaseConfig.server}:${databaseConfig.port}/${databaseConfig.database}`,
            );

            return connectedPool;
          },
        )
        .catch(
          (error) => {
            poolPromise = null;

            console.error(
              '[SQL Server] Connexion impossible :',
              error.message,
            );

            throw error;
          },
        );
  }

  return poolPromise;
}

/*
|--------------------------------------------------------------------------
| TEST CONNECTION
|--------------------------------------------------------------------------
|
| Utilisé au démarrage du backend pour vérifier que SQL Server répond.
|
|--------------------------------------------------------------------------
*/

async function testDatabaseConnection() {
  const pool =
    await getPool();

  const result =
    await pool.request().query(`
      SELECT
        DB_NAME() AS database_name,
        @@SERVERNAME AS server_name,
        GETDATE() AS server_time;
    `);

  return result.recordset?.[0] || null;
}

/*
|--------------------------------------------------------------------------
| CLOSE POOL
|--------------------------------------------------------------------------
|
| Ferme proprement la connexion lorsque le backend s'arrête.
|
|--------------------------------------------------------------------------
*/

async function closePool() {
  if (!poolPromise) {
    return;
  }

  try {
    const pool =
      await poolPromise;

    await pool.close();

    console.log(
      '[SQL Server] Connexion fermée.',
    );
  } finally {
    poolPromise = null;
  }
}

module.exports = {
  sql,
  getPool,
  testDatabaseConnection,
  closePool,
  databaseConfig,
};