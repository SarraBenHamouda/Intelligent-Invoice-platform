const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const {
  getDatabase,
} = require('./config/database');

const authRoutes =
  require('./routes/auth.routes');

const invoiceRoutes =
  require('./routes/invoice.routes');

const webhookRoutes =
  require('./routes/webhook.routes');

const errorHandler =
  require('./middleware/errorHandler');

const app = express();

console.log('=== NOUVEAU APP.JS CHARGE ===');

app.disable('x-powered-by');

// Use Helmet but disable Cross-Origin-Opener-Policy for local development
app.use(
  helmet({
    crossOriginOpenerPolicy: false,
  }),
);

app.use(
  cors({
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ],
    credentials: true,
  }),
);

app.use(morgan('dev'));

app.use(
  express.json({
    limit: '10mb',
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: '10mb',
  })
);

/*
|--------------------------------------------------------------------------
| HEALTH
|--------------------------------------------------------------------------
*/

app.get('/api/health', (req, res) => {
  return res.status(200).json({
    success: true,
    service: 'invoice-platform-backend',
    status: 'UP',
    version: 'AUTH-V2',
    timestamp: new Date().toISOString(),
  });
});

app.get(
  '/api/health/database',
  async (req, res, next) => {
    try {
      const database = getDatabase();

      const result =
        await database.request().query(`
          SELECT
            DB_NAME() AS database_name,
            GETDATE() AS server_time
        `);

      return res.status(200).json({
        success: true,
        status: 'CONNECTED',
        database:
          result.recordset[0].database_name,
        serverTime:
          result.recordset[0].server_time,
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
|--------------------------------------------------------------------------
| TEST DIRECT
|--------------------------------------------------------------------------
*/

app.get('/api/direct-test', (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Le nouveau fichier app.js est actif',
    version: 'AUTH-V2',
  });
});

/*
|--------------------------------------------------------------------------
| ROUTES
|--------------------------------------------------------------------------
*/

app.use('/api/auth', authRoutes);

app.use(
  '/api/invoices',
  invoiceRoutes
);

app.use(
  '/api/webhooks',
  webhookRoutes
);

/*
|--------------------------------------------------------------------------
| NOT FOUND
|--------------------------------------------------------------------------
*/

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    errorCode: 'ROUTE_NOT_FOUND',
    message:
      `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

/*
|--------------------------------------------------------------------------
| ERROR HANDLER
|--------------------------------------------------------------------------
*/

app.use(errorHandler);

module.exports = app;