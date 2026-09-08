const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

const {
  getDatabase,
} = require("./config/database");

const contactRoutes =
  require("./routes/contact.routes");

/*
|--------------------------------------------------------------------------
| ROUTES
|--------------------------------------------------------------------------
*/

const authRoutes =
  require("./routes/auth.routes");

const invoiceRoutes =
  require("./routes/invoice.routes");

const webhookRoutes =
  require("./routes/webhook.routes");

const clientDashboardRoutes =
  require("./routes/clientDashboardRoutes");

const profileRoutes =
  require("./routes/profile.routes");

const avatarRoutes =
  require("./routes/avatar.routes");

const notificationRoutes =
  require("./routes/notification.routes");

const assistantRoutes =
  require("./routes/assistant.routes");

/*
|--------------------------------------------------------------------------
| ADMIN ROUTES
|--------------------------------------------------------------------------
*/

const adminRoutes =
  require("./routes/admin.route");

/*
|--------------------------------------------------------------------------
| ERROR HANDLER
|--------------------------------------------------------------------------
*/

const errorHandler =
  require("./middleware/errorHandler");

/*
|--------------------------------------------------------------------------
| APP
|--------------------------------------------------------------------------
*/

const app =
  express();

console.log(
  "=== NOUVEAU APP.JS CHARGE ===",
);

app.disable(
  "x-powered-by",
);

/*
|--------------------------------------------------------------------------
| SECURITY
|--------------------------------------------------------------------------
*/

app.use(
  helmet({
    crossOriginOpenerPolicy:
      false,

    crossOriginResourcePolicy: {
      policy:
        "cross-origin",
    },
  }),
);

/*
|--------------------------------------------------------------------------
| CORS - ORIGINES AUTORISÉES
|--------------------------------------------------------------------------
*/

const allowedOrigins =
  new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://192.168.1.105:5173",

    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://192.168.1.105:3000",
  ]);

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/

app.use(
  cors({
    origin(
      origin,
      callback,
    ) {
      /*
      |--------------------------------------------------------------------------
      | REQUÊTES SANS ORIGIN
      |--------------------------------------------------------------------------
      |
      | Postman, backend-to-backend, n8n, etc.
      |
      |--------------------------------------------------------------------------
      */

      if (!origin) {
        return callback(
          null,
          true,
        );
      }

      /*
      |--------------------------------------------------------------------------
      | ORIGIN AUTORISÉE
      |--------------------------------------------------------------------------
      */

      if (
        allowedOrigins.has(
          origin,
        )
      ) {
        return callback(
          null,
          true,
        );
      }

      /*
      |--------------------------------------------------------------------------
      | ORIGIN REFUSÉE
      |--------------------------------------------------------------------------
      */

      console.warn(
        "[CORS] Origin refusée:",
        origin,
      );

      return callback(
        new Error(
          `Origin non autorisée par CORS : ${origin}`,
        ),
      );
    },

    credentials:
      true,

    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ],

    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Cache-Control",
      "Pragma",
      "x-workflow-secret",
    ],

    exposedHeaders: [
      "Content-Length",
    ],

    optionsSuccessStatus:
      204,
  }),
);

/*
|--------------------------------------------------------------------------
| LOGGING
|--------------------------------------------------------------------------
*/

app.use(
  morgan(
    "dev",
  ),
);

/*
|--------------------------------------------------------------------------
| BODY PARSERS
|--------------------------------------------------------------------------
|
| IMPORTANT :
|
| Toutes les routes qui utilisent req.body doivent être déclarées APRÈS.
|
|--------------------------------------------------------------------------
*/

app.use(
  express.json({
    limit:
      "10mb",
  }),
);

app.use(
  express.urlencoded({
    extended:
      true,

    limit:
      "10mb",
  }),
);

/*
|--------------------------------------------------------------------------
| STATIC FILES
|--------------------------------------------------------------------------
*/

app.use(
  "/uploads",
  express.static(
    path.join(
      process.cwd(),
      "uploads",
    ),
  ),
);

/*
|--------------------------------------------------------------------------
| HEALTH
|--------------------------------------------------------------------------
*/

app.get(
  "/api/health",

  (req, res) => {
    return res
      .status(200)
      .json({
        success:
          true,

        service:
          "invoice-platform-backend",

        status:
          "UP",

        version:
          "AUTH-V2",

        timestamp:
          new Date()
            .toISOString(),
      });
  },
);

/*
|--------------------------------------------------------------------------
| HEALTH DATABASE
|--------------------------------------------------------------------------
*/

app.get(
  "/api/health/database",

  async (
    req,
    res,
    next,
  ) => {
    try {
      const database =
        getDatabase();

      const result =
        await database
          .request()
          .query(`
            SELECT
              DB_NAME()
                AS database_name,

              GETDATE()
                AS server_time
          `);

      return res
        .status(200)
        .json({
          success:
            true,

          status:
            "CONNECTED",

          database:
            result
              .recordset[0]
              .database_name,

          serverTime:
            result
              .recordset[0]
              .server_time,
        });
    } catch (error) {
      return next(
        error,
      );
    }
  },
);

/*
|--------------------------------------------------------------------------
| TEST DIRECT
|--------------------------------------------------------------------------
*/

app.get(
  "/api/direct-test",

  (req, res) => {
    return res
      .status(200)
      .json({
        success:
          true,

        message:
          "Le nouveau fichier app.js est actif",

        version:
          "AUTH-V2",
      });
  },
);

/*
|--------------------------------------------------------------------------
| TEST CORS
|--------------------------------------------------------------------------
*/

app.get(
  "/api/cors-test",

  (req, res) => {
    return res
      .status(200)
      .json({
        success:
          true,

        message:
          "CORS fonctionne.",

        origin:
          req.headers
            .origin ||
          null,

        timestamp:
          new Date()
            .toISOString(),
      });
  },
);

/*
|--------------------------------------------------------------------------
| AUTH ROUTES
|--------------------------------------------------------------------------
*/

app.use(
  "/api/auth",
  authRoutes,
);

/*
|--------------------------------------------------------------------------
| PROFILE ROUTES
|--------------------------------------------------------------------------
*/

app.use(
  "/api/profile",
  profileRoutes,
);

/*
|--------------------------------------------------------------------------
| AVATAR AI ROUTES
|--------------------------------------------------------------------------
*/

app.use(
  "/api/avatar",
  avatarRoutes,
);

/*
|--------------------------------------------------------------------------
| INVOICE ROUTES
|--------------------------------------------------------------------------
*/

app.use(
  "/api/invoices",
  invoiceRoutes,
);

/*
|--------------------------------------------------------------------------
| ASSISTANT FACTURES
|--------------------------------------------------------------------------
|
| IMPORTANT :
|
| Cette route doit être APRÈS express.json().
|
| POST /api/assistant/ask
|
|--------------------------------------------------------------------------
*/

app.use(
  "/api/assistant",
  assistantRoutes,
);

/*
|--------------------------------------------------------------------------
| ADMIN ROUTES
|--------------------------------------------------------------------------
*/

app.use(
  "/api/admin",
  adminRoutes,
);

/*
|--------------------------------------------------------------------------
| WEBHOOK ROUTES
|--------------------------------------------------------------------------
*/

app.use(
  "/api/webhooks",
  webhookRoutes,
);

/*
|--------------------------------------------------------------------------
| CLIENT DASHBOARD
|--------------------------------------------------------------------------
*/

app.use(
  "/api/client",
  clientDashboardRoutes,
);

app.use(
  "/api/client-dashboard",
  clientDashboardRoutes,
);

/*
|--------------------------------------------------------------------------
| NOTIFICATION ROUTES
|--------------------------------------------------------------------------
*/

app.use(
  "/api/notifications",
  notificationRoutes,
);
/*
|--------------------------------------------------------------------------
| PUBLIC CONTACT
|--------------------------------------------------------------------------
*/

app.use(
  "/api/contact",
  contactRoutes,
);
/*
|--------------------------------------------------------------------------
| NOT FOUND
|--------------------------------------------------------------------------
|
| Toujours garder cette route APRÈS toutes les routes applicatives.
|
|--------------------------------------------------------------------------
*/

app.use(
  (
    req,
    res,
  ) => {
    return res
      .status(404)
      .json({
        success:
          false,

        errorCode:
          "ROUTE_NOT_FOUND",

        message:
          `Route not found: ${req.method} ${req.originalUrl}`,
      });
  },
);

/*
|--------------------------------------------------------------------------
| ERROR HANDLER
|--------------------------------------------------------------------------
*/

app.use(
  errorHandler,
);

/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports =
  app;