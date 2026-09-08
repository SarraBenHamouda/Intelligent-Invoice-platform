require('dotenv').config();

/*
|--------------------------------------------------------------------------
| ENVIRONMENT CONFIGURATION
|--------------------------------------------------------------------------
|
| Ce fichier centralise toutes les variables du fichier backend/.env.
| Les autres fichiers du backend importeront cette configuration au lieu
| d'utiliser process.env partout.
|
|--------------------------------------------------------------------------
*/

function toBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  return String(value).toLowerCase() === 'true';
}

function toNumber(value, defaultValue) {
  const parsedValue = Number(value);

  return Number.isFinite(parsedValue)
    ? parsedValue
    : defaultValue;
}

const env = {
  /*
  |--------------------------------------------------------------------------
  | APPLICATION
  |--------------------------------------------------------------------------
  */

  port: toNumber(
    process.env.PORT,
    3000,
  ),

  nodeEnv:
    process.env.NODE_ENV ||
    'development',

  frontendUrl:
    process.env.FRONTEND_URL ||
    'http://localhost:5173',

  /*
  |--------------------------------------------------------------------------
  | SQL SERVER
  |--------------------------------------------------------------------------
  */

  database: {
    server:
      process.env.DB_SERVER ||
      'localhost',

    port: toNumber(
      process.env.DB_PORT,
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
      encrypt: toBoolean(
        process.env.DB_ENCRYPT,
        false,
      ),

      trustServerCertificate:
        toBoolean(
          process.env
            .DB_TRUST_SERVER_CERTIFICATE ??
            process.env
              .DB_TRUST_CERTIFICATE,
          true,
        ),

      enableArithAbort: true,
    },

    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },

    requestTimeout: 30000,
    connectionTimeout: 15000,
  },

  /*
  |--------------------------------------------------------------------------
  | AUTHENTICATION
  |--------------------------------------------------------------------------
  */

  jwtSecret:
    process.env.JWT_SECRET ||
    '',

  jwtExpiresIn:
    process.env.JWT_EXPIRES_IN ||
    '24h',

  /*
  |--------------------------------------------------------------------------
  | INTERNAL SECURITY: N8N -> BACKEND
  |--------------------------------------------------------------------------
  */

  internalApiKey:
    process.env.INTERNAL_API_KEY ||
    '',

  /*
  |--------------------------------------------------------------------------
  | N8N
  |--------------------------------------------------------------------------
  */

  n8n: {
    baseUrl:
      process.env.N8N_BASE_URL ||
      'http://localhost:5678',

    documentWebhook:
      process.env.N8N_DOCUMENT_WEBHOOK ||
      '',

    erpWebhook:
      process.env.N8N_ERP_WEBHOOK ||
      '',

    pdfWebhook:
      process.env.N8N_PDF_WEBHOOK ||
      '',

    invoiceWebhook:
      process.env
        .N8N_INVOICE_WEBHOOK_URL ||
      process.env
        .N8N_DOCUMENT_WEBHOOK ||
      '',

    retryWebhook:
      process.env
        .N8N_RETRY_WEBHOOK_URL ||
      '',
  },

  /*
  |--------------------------------------------------------------------------
  | CALLBACKS
  |--------------------------------------------------------------------------
  */

  backendCallbackUrl:
    process.env.BACKEND_CALLBACK_URL ||
    '',

  backendWorkflowCallbackUrl:
    process.env
      .BACKEND_WORKFLOW_CALLBACK_URL ||
    '',

  /*
  |--------------------------------------------------------------------------
  | FILE UPLOADS
  |--------------------------------------------------------------------------
  */

  uploadDirectory:
    process.env.UPLOAD_DIRECTORY ||
    '',
};

/*
|--------------------------------------------------------------------------
| REQUIRED VARIABLES CHECK
|--------------------------------------------------------------------------
*/

function validateEnvironment() {
  const missingVariables = [];

  if (!env.database.server) {
    missingVariables.push('DB_SERVER');
  }

  if (!env.database.database) {
    missingVariables.push('DB_DATABASE');
  }

  if (!env.database.user) {
    missingVariables.push('DB_USER');
  }

  if (!env.database.password) {
    missingVariables.push('DB_PASSWORD');
  }

  if (!env.jwtSecret) {
    missingVariables.push('JWT_SECRET');
  }

  if (!env.internalApiKey) {
    missingVariables.push(
      'INTERNAL_API_KEY',
    );
  }

  if (missingVariables.length > 0) {
    console.warn(
      '[Configuration] Variables manquantes :',
      missingVariables.join(', '),
    );
  }

  return missingVariables;
}

module.exports = {
  ...env,
  validateEnvironment,
};