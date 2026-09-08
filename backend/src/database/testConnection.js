require('dotenv').config();

const {
  testDatabaseConnection,
  closePool,
  databaseConfig,
} = require('./sqlServer');

/*
|--------------------------------------------------------------------------
| TEST SQL SERVER CONNECTION
|--------------------------------------------------------------------------
|
| Exécution depuis le dossier backend :
|
|   node src/database/testConnection.js
|
| Ce script vérifie :
| - que les variables du fichier .env sont chargées ;
| - que Node.js peut joindre SQL Server ;
| - que la base InvoiceFlow est accessible ;
| - que la table dbo.invoices existe.
|
|--------------------------------------------------------------------------
*/

async function runDatabaseTest() {
  try {
    console.log('');
    console.log('========================================');
    console.log(' TEST DE CONNEXION SQL SERVER');
    console.log('========================================');
    console.log(
      `Serveur : ${databaseConfig.server}:${databaseConfig.port}`,
    );
    console.log(
      `Base    : ${databaseConfig.database}`,
    );
    console.log(
      `Compte  : ${databaseConfig.user}`,
    );
    console.log('----------------------------------------');

    if (!databaseConfig.password) {
      throw new Error(
        'DB_PASSWORD est vide dans le fichier backend/.env.',
      );
    }

    const connectionInformation =
      await testDatabaseConnection();

    console.log(
      '[OK] Connexion SQL Server réussie.',
    );

    console.log(
      '[OK] Informations serveur :',
      connectionInformation,
    );

    const {
      getPool,
    } = require('./sqlServer');

    const pool =
      await getPool();

    const tableCheck =
      await pool.request().query(`
        SELECT
          CASE
            WHEN OBJECT_ID(
              N'dbo.invoices',
              N'U'
            ) IS NOT NULL
            THEN 1
            ELSE 0
          END AS table_exists;
      `);

    const tableExists =
      Number(
        tableCheck.recordset?.[0]
          ?.table_exists,
      ) === 1;

    if (!tableExists) {
      throw new Error(
        `La table dbo.invoices n'existe pas dans la base ${databaseConfig.database}.`,
      );
    }

    console.log(
      '[OK] La table dbo.invoices existe.',
    );

    const columnsResult =
      await pool.request().query(`
        SELECT
          COLUMN_NAME,
          DATA_TYPE,
          IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE
          TABLE_SCHEMA = N'dbo'
          AND TABLE_NAME = N'invoices'
        ORDER BY ORDINAL_POSITION;
      `);

    console.log(
      `[OK] ${columnsResult.recordset.length} colonnes détectées dans dbo.invoices.`,
    );

    console.table(
      columnsResult.recordset,
    );

    const countResult =
      await pool.request().query(`
        SELECT
          COUNT(*) AS invoice_count
        FROM dbo.invoices;
      `);

    const invoiceCount =
      Number(
        countResult.recordset?.[0]
          ?.invoice_count,
      ) || 0;

    console.log(
      `[OK] Nombre de factures enregistrées : ${invoiceCount}`,
    );

    console.log('----------------------------------------');
    console.log(
      'TEST TERMINÉ AVEC SUCCÈS.',
    );
    console.log('========================================');
    console.log('');

    process.exitCode = 0;
  } catch (error) {
    console.error('');
    console.error('========================================');
    console.error(' ÉCHEC DU TEST SQL SERVER');
    console.error('========================================');
    console.error(
      error?.message || error,
    );

    if (
      error?.originalError?.message
    ) {
      console.error(
        'Détail SQL Server :',
        error.originalError.message,
      );
    }

    console.error('');
    console.error(
      'Vérifie principalement :',
    );
    console.error(
      '- DB_SERVER dans backend/.env',
    );
    console.error(
      '- DB_PORT dans backend/.env',
    );
    console.error(
      '- DB_DATABASE dans backend/.env',
    );
    console.error(
      '- DB_USER et DB_PASSWORD',
    );
    console.error(
      '- le protocole TCP/IP de SQL Server',
    );
    console.error(
      '- le port 1433 et le pare-feu Windows',
    );
    console.error('========================================');
    console.error('');

    process.exitCode = 1;
  } finally {
    try {
      await closePool();
    } catch (closeError) {
      console.error(
        '[SQL Server] Erreur pendant la fermeture :',
        closeError.message,
      );
    }
  }
}

runDatabaseTest();