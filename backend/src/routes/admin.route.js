const express =
  require("express");

const authenticate =
  require(
    "../middleware/authenticate",
  );

const {
  getAdminDashboard,
  getAdminInvoices,
  getAdminClients,
  deleteAdminClient,
} =
  require(
    "../controllers/admin.controller",
  );

const {
  getAdminUsers,
  updateAdminUserStatus,
} =
  require(
    "../controllers/adminUsers.controller",
  );

const {
  getAdminErrors,
} =
  require(
    "../controllers/adminErrors.controller",
  );

const {
  getAdminInvoiceById,
} =
  require(
    "../controllers/adminInvoiceDetails.controller",
  );

const {
  getAdminSystemHealth,
} =
  require(
    "../controllers/adminSystem.controller",
  );

const {
  getAdminExecutions,
} =
  require(
    "../controllers/adminExecutions.controller",
  );

const {
  getAdminAuditLogs,
} =
  require(
    "../controllers/adminAudit.controller",
  );

const {
  getAdminReports,
} =
  require(
    "../controllers/adminReports.controller",
  );

const {
  getAdminRetries,
  retryAdminInvoice,
} =
  require(
    "../controllers/adminRetries.controller",
  );

const router =
  express.Router();

/*
|--------------------------------------------------------------------------
| DASHBOARD
|--------------------------------------------------------------------------
*/

router.get(
  "/dashboard",
  authenticate,
  getAdminDashboard,
);

/*
|--------------------------------------------------------------------------
| INVOICES
|--------------------------------------------------------------------------
*/

router.get(
  "/invoices",
  authenticate,
  getAdminInvoices,
);

/*
|--------------------------------------------------------------------------
| SINGLE INVOICE
|--------------------------------------------------------------------------
*/

router.get(
  "/invoices/:id",
  authenticate,
  getAdminInvoiceById,
);

/*
|--------------------------------------------------------------------------
| CLIENTS
|--------------------------------------------------------------------------
*/

router.get(
  "/clients",
  authenticate,
  getAdminClients,
);

/*
|--------------------------------------------------------------------------
| DELETE CLIENT
|--------------------------------------------------------------------------
|
| DELETE /api/admin/clients/:id
|
|--------------------------------------------------------------------------
*/

router.delete(
  "/clients/:id",
  authenticate,
  deleteAdminClient,
);

/*
|--------------------------------------------------------------------------
| USERS
|--------------------------------------------------------------------------
*/

router.get(
  "/users",
  authenticate,
  getAdminUsers,
);

/*
|--------------------------------------------------------------------------
| USER STATUS
|--------------------------------------------------------------------------
*/

router.patch(
  "/users/:id/status",
  authenticate,
  updateAdminUserStatus,
);

/*
|--------------------------------------------------------------------------
| ERRORS / ANOMALIES
|--------------------------------------------------------------------------
*/

router.get(
  "/errors",
  authenticate,
  getAdminErrors,
);

/*
|--------------------------------------------------------------------------
| EXECUTIONS
|--------------------------------------------------------------------------
*/

router.get(
  "/executions",
  authenticate,
  getAdminExecutions,
);

/*
|--------------------------------------------------------------------------
| RETRIES
|--------------------------------------------------------------------------
*/

router.get(
  "/retries",
  authenticate,
  getAdminRetries,
);

router.post(
  "/retries/:id/retry",
  authenticate,
  retryAdminInvoice,
);

/*
|--------------------------------------------------------------------------
| REPORTS
|--------------------------------------------------------------------------
*/

router.get(
  "/reports",
  authenticate,
  getAdminReports,
);

/*
|--------------------------------------------------------------------------
| AUDIT
|--------------------------------------------------------------------------
*/

router.get(
  "/audit",
  authenticate,
  getAdminAuditLogs,
);

/*
|--------------------------------------------------------------------------
| SYSTEM
|--------------------------------------------------------------------------
*/

router.get(
  "/system",
  authenticate,
  getAdminSystemHealth,
);

/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports =
  router;