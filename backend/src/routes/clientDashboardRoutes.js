const express =
  require('express');

const authenticationModule =
  require('../middleware/authenticate');

const dashboardController =
  require('../controllers/clientDashboardController');

const {
  getMonthlyFinancialDigest,
} =
  require('../controllers/monthlyDigest.controller');

const router =
  express.Router();

/*
|--------------------------------------------------------------------------
| AUTH MIDDLEWARE
|--------------------------------------------------------------------------
*/

const authenticate =
  authenticationModule.authenticateToken ||
  authenticationModule.authenticate ||
  authenticationModule;

/*
|--------------------------------------------------------------------------
| CONTROLLERS
|--------------------------------------------------------------------------
*/

const getClientDashboard =
  dashboardController.getClientDashboard;

const deleteDuplicates =
  dashboardController.deleteDuplicates;

/*
|--------------------------------------------------------------------------
| VERIFY IMPORTS
|--------------------------------------------------------------------------
*/

if (
  typeof authenticate !==
  'function'
) {
  throw new TypeError(
    'Le middleware ../middleware/authenticate doit exporter une fonction.',
  );
}

if (
  typeof getClientDashboard !==
  'function'
) {
  throw new TypeError(
    'Le contrôleur clientDashboardController doit exporter getClientDashboard.',
  );
}

if (
  typeof deleteDuplicates !==
  'function'
) {
  throw new TypeError(
    'Le contrôleur clientDashboardController doit exporter deleteDuplicates.',
  );
}

if (
  typeof getMonthlyFinancialDigest !==
  'function'
) {
  throw new TypeError(
    'Le contrôleur monthlyDigest.controller doit exporter getMonthlyFinancialDigest.',
  );
}

/*
|--------------------------------------------------------------------------
| GET CLIENT DASHBOARD
|--------------------------------------------------------------------------
|
| Selon le préfixe configuré dans app.js :
|
| GET /api/client/dashboard
|
|--------------------------------------------------------------------------
*/

router.get(
  '/dashboard',
  authenticate,
  getClientDashboard,
);

/*
|--------------------------------------------------------------------------
| MONTHLY FINANCIAL DIGEST
|--------------------------------------------------------------------------
|
| Cette route sera utilisée avec le préfixe :
|
| /api/client-dashboard
|
| GET:
|
| /api/client-dashboard/monthly-digest?year=2026&month=8
|
|--------------------------------------------------------------------------
*/

router.get(
  '/monthly-digest',
  authenticate,
  getMonthlyFinancialDigest,
);

/*
|--------------------------------------------------------------------------
| DELETE INVOICE DUPLICATES
|--------------------------------------------------------------------------
*/

router.delete(
  '/invoices/:id/duplicates',
  authenticate,
  deleteDuplicates,
);

module.exports =
  router;