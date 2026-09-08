const {
  getDatabase,
} = require("../config/database");

/*
|--------------------------------------------------------------------------
| CONFIGURATION
|--------------------------------------------------------------------------
*/

const REQUEST_TIMEOUT_MS =
  Number(
    process.env.ADMIN_HEALTH_TIMEOUT_MS ||
      3500,
  );

/*
|--------------------------------------------------------------------------
| SERVICE URLS
|--------------------------------------------------------------------------
|
| Les variables .env sont prioritaires.
|
| Les valeurs par défaut correspondent à ton environnement actuel.
|
|--------------------------------------------------------------------------
*/

const SERVICE_CONFIG = [
  {
    key:
      "n8n",

    name:
      "n8n",

    category:
      "Workflow",

    icon:
      "🔗",

    url:
      process.env.N8N_HEALTH_URL ||
      process.env.N8N_URL ||
      "http://localhost:5678/healthz",

    expectedType:
      "http",
  },

  {
    key:
      "pdfservice",

    name:
      "PDF Service",

    category:
      "Import",

    icon:
      "📄",

    url:
      process.env.PDF_SERVICE_HEALTH_URL ||
      "http://localhost:8001/health",

    expectedType:
      "http",
  },

  {
    key:
      "ocrservice",

    name:
      "OCR Service",

    category:
      "Extraction",

    icon:
      "👁️",

    url:
      process.env.OCR_SERVICE_HEALTH_URL ||
      "http://localhost:8002/health",

    expectedType:
      "http",
  },

  {
    key:
      "extractionservice",

    name:
      "Extraction Service",

    category:
      "Extraction",

    icon:
      "🧠",

    url:
      process.env.EXTRACTION_SERVICE_HEALTH_URL ||
      "http://localhost:8003/health",

    expectedType:
      "http",
  },

  {
    key:
      "validationservice",

    name:
      "Validation Service",

    category:
      "Validation",

    icon:
      "✅",

    url:
      process.env.VALIDATION_SERVICE_HEALTH_URL ||
      "http://localhost:8004/health",

    expectedType:
      "http",
  },

  {
    key:
      "extractionserviceocr",

    name:
      "OCR Extraction Service",

    category:
      "Extraction",

    icon:
      "🔎",

    url:
      process.env.EXTRACTION_OCR_HEALTH_URL ||
      "http://localhost:8005/health",

    expectedType:
      "http",
  },

  {
    key:
      "teif",

    name:
      "TEIF API",

    category:
      "TEIF",

    icon:
      "🧾",

    url:
      process.env.TEIF_HEALTH_URL ||
      "http://localhost:5004/health",

    expectedType:
      "http",
  },

  {
    key:
      "signature",

    name:
      "Signature API",

    category:
      "Signature",

    icon:
      "✍️",

    url:
      process.env.SIGNATURE_HEALTH_URL ||
      "http://localhost:5001/health",

    expectedType:
      "http",
  },

  {
    key:
      "ttn",

    name:
      "TTN Orchestrator",

    category:
      "Soumission",

    icon:
      "📡",

    url:
      process.env.TTN_HEALTH_URL ||
      "http://localhost:5006/health",

    expectedType:
      "http",
  },

  {
    key:
      "ollama",

    name:
      "Ollama",

    category:
      "IA",

    icon:
      "🤖",

    url:
      process.env.OLLAMA_HEALTH_URL ||
      "http://localhost:11434/api/tags",

    expectedType:
      "http",
  },
];

/*
|--------------------------------------------------------------------------
| ADMIN AUTHORIZATION
|--------------------------------------------------------------------------
*/

function getAdminUser(
  req,
) {
  const userId =
    req.user?.id ||
    req.user?.user_id ||
    req.user?.sub ||
    null;

  const role =
    String(
      req.user?.role ||
        "",
    )
      .trim()
      .toUpperCase();

  if (!userId) {
    const error =
      new Error(
        "Utilisateur non authentifié.",
      );

    error.statusCode =
      401;

    error.errorCode =
      "AUTHENTICATION_REQUIRED";

    throw error;
  }

  if (
    role !==
    "ADMIN"
  ) {
    const error =
      new Error(
        "Accès administrateur requis.",
      );

    error.statusCode =
      403;

    error.errorCode =
      "ADMIN_ACCESS_REQUIRED";

    throw error;
  }

  return {
    userId,
    role,
  };
}

/*
|--------------------------------------------------------------------------
| CACHE
|--------------------------------------------------------------------------
*/

function setNoCacheHeaders(
  res,
) {
  res.set({
    "Cache-Control":
      "no-store, no-cache, must-revalidate, proxy-revalidate",

    Pragma:
      "no-cache",

    Expires:
      "0",

    "Surrogate-Control":
      "no-store",
  });
}

/*
|--------------------------------------------------------------------------
| SANITIZE URL
|--------------------------------------------------------------------------
|
| On affiche host + port, mais jamais les credentials/query sensibles.
|
|--------------------------------------------------------------------------
*/

function sanitizeUrl(
  value,
) {
  if (!value) {
    return null;
  }

  try {
    const parsed =
      new URL(value);

    parsed.username =
      "";

    parsed.password =
      "";

    parsed.search =
      "";

    return parsed.toString();
  } catch {
    return String(
      value,
    );
  }
}

/*
|--------------------------------------------------------------------------
| HTTP HEALTH CHECK
|--------------------------------------------------------------------------
*/

async function checkHttpService(
  service,
) {
  const startedAt =
    Date.now();

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      REQUEST_TIMEOUT_MS,
    );

  try {
    const response =
      await fetch(
        service.url,
        {
          method:
            "GET",

          headers: {
            Accept:
              "application/json,text/plain,*/*",
          },

          cache:
            "no-store",

          signal:
            controller.signal,
        },
      );

    const durationMs =
      Date.now() -
      startedAt;

    let responseData =
      null;

    try {
      const text =
        await response.text();

      if (text) {
        try {
          responseData =
            JSON.parse(
              text,
            );
        } catch {
          responseData =
            text.slice(
              0,
              500,
            );
        }
      }
    } catch {
      responseData =
        null;
    }

    /*
    |--------------------------------------------------------------------------
    | 2xx / 3xx = service joignable
    |--------------------------------------------------------------------------
    */

    const healthy =
      response.status >=
        200 &&
      response.status <
        400;

    return {
      key:
        service.key,

      name:
        service.name,

      category:
        service.category,

      icon:
        service.icon,

      status:
        healthy
          ? "UP"
          : "DEGRADED",

      available:
        true,

      http_status:
        response.status,

      response_time_ms:
        durationMs,

      url:
        sanitizeUrl(
          service.url,
        ),

      message:
        healthy
          ? "Service disponible."
          : `Le service répond avec HTTP ${response.status}.`,

      details:
        responseData,

      checked_at:
        new Date()
          .toISOString(),
    };
  } catch (
    error
  ) {
    const durationMs =
      Date.now() -
      startedAt;

    const timeoutError =
      error?.name ===
      "AbortError";

    return {
      key:
        service.key,

      name:
        service.name,

      category:
        service.category,

      icon:
        service.icon,

      status:
        "DOWN",

      available:
        false,

      http_status:
        null,

      response_time_ms:
        durationMs,

      url:
        sanitizeUrl(
          service.url,
        ),

      message:
        timeoutError
          ? `Timeout après ${REQUEST_TIMEOUT_MS} ms.`
          : (
              error?.message ||
              "Service inaccessible."
            ),

      details:
        null,

      checked_at:
        new Date()
          .toISOString(),
    };
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

/*
|--------------------------------------------------------------------------
| SQL SERVER HEALTH CHECK
|--------------------------------------------------------------------------
*/

async function checkDatabase() {
  const startedAt =
    Date.now();

  try {
    const pool =
      getDatabase();

    const result =
      await pool
        .request()
        .query(`
          SELECT
            DB_NAME()
              AS database_name,

            @@SERVERNAME
              AS server_name,

            GETUTCDATE()
              AS database_time;
        `);

    const durationMs =
      Date.now() -
      startedAt;

    const row =
      result.recordset?.[0] ||
      {};

    return {
      key:
        "sqlserver",

      name:
        "SQL Server",

      category:
        "Base de données",

      icon:
        "🗄️",

      status:
        "UP",

      available:
        true,

      http_status:
        null,

      response_time_ms:
        durationMs,

      url:
        null,

      message:
        "Connexion SQL Server opérationnelle.",

      details: {
        database_name:
          row.database_name ||
          null,

        server_name:
          row.server_name ||
          null,

        database_time:
          row.database_time ||
          null,
      },

      checked_at:
        new Date()
          .toISOString(),
    };
  } catch (
    error
  ) {
    return {
      key:
        "sqlserver",

      name:
        "SQL Server",

      category:
        "Base de données",

      icon:
        "🗄️",

      status:
        "DOWN",

      available:
        false,

      http_status:
        null,

      response_time_ms:
        Date.now() -
        startedAt,

      url:
        null,

      message:
        error?.message ||
        "Connexion SQL Server impossible.",

      details:
        null,

      checked_at:
        new Date()
          .toISOString(),
    };
  }
}

/*
|--------------------------------------------------------------------------
| BACKEND STATUS
|--------------------------------------------------------------------------
*/

function getBackendStatus() {
  return {
    key:
      "backend",

    name:
      "Backend API",

    category:
      "Application",

    icon:
      "🟢",

    status:
      "UP",

    available:
      true,

    http_status:
      200,

    response_time_ms:
      0,

    url:
      `http://localhost:${
        process.env.PORT ||
        3000
      }`,

    message:
      "API Node.js / Express opérationnelle.",

    details: {
      node_version:
        process.version,

      environment:
        process.env.NODE_ENV ||
        "development",

      process_id:
        process.pid,

      uptime_seconds:
        Math.floor(
          process.uptime(),
        ),

      memory_mb: {
        rss:
          Math.round(
            process.memoryUsage()
              .rss /
              1024 /
              1024,
          ),

        heap_used:
          Math.round(
            process.memoryUsage()
              .heapUsed /
              1024 /
              1024,
          ),

        heap_total:
          Math.round(
            process.memoryUsage()
              .heapTotal /
              1024 /
              1024,
          ),
      },
    },

    checked_at:
      new Date()
        .toISOString(),
  };
}

/*
|--------------------------------------------------------------------------
| GET /api/admin/system
|--------------------------------------------------------------------------
*/

async function getAdminSystemHealth(
  req,
  res,
) {
  try {
    setNoCacheHeaders(
      res,
    );

    getAdminUser(
      req,
    );

    /*
    |--------------------------------------------------------------------------
    | RUN ALL CHECKS IN PARALLEL
    |--------------------------------------------------------------------------
    */

    const [
      databaseStatus,
      ...httpStatuses
    ] =
      await Promise.all([
        checkDatabase(),

        ...SERVICE_CONFIG.map(
          (
            service,
          ) =>
            checkHttpService(
              service,
            ),
        ),
      ]);

    const services = [
      getBackendStatus(),
      databaseStatus,
      ...httpStatuses,
    ];

    /*
    |--------------------------------------------------------------------------
    | GLOBAL STATS
    |--------------------------------------------------------------------------
    */

    const stats =
      services.reduce(
        (
          accumulator,
          service,
        ) => {
          accumulator.total +=
            1;

          if (
            service.status ===
            "UP"
          ) {
            accumulator.up +=
              1;
          } else if (
            service.status ===
            "DEGRADED"
          ) {
            accumulator.degraded +=
              1;
          } else {
            accumulator.down +=
              1;
          }

          if (
            Number.isFinite(
              Number(
                service.response_time_ms,
              ),
            )
          ) {
            accumulator.response_total +=
              Number(
                service.response_time_ms,
              );

            accumulator.response_count +=
              1;
          }

          return accumulator;
        },
        {
          total: 0,
          up: 0,
          degraded: 0,
          down: 0,

          response_total:
            0,

          response_count:
            0,
        },
      );

    const averageResponseTime =
      stats.response_count >
      0
        ? Math.round(
            stats.response_total /
              stats.response_count,
          )
        : 0;

    /*
    |--------------------------------------------------------------------------
    | GLOBAL STATUS
    |--------------------------------------------------------------------------
    */

    let globalStatus =
      "HEALTHY";

    if (
      stats.down >
      0
    ) {
      globalStatus =
        "DEGRADED";
    }

    /*
    |--------------------------------------------------------------------------
    | IMPORTANT SERVICES
    |--------------------------------------------------------------------------
    |
    | Backend ou SQL indisponible = CRITICAL.
    |
    |--------------------------------------------------------------------------
    */

    const backendOrDatabaseDown =
      services.some(
        (
          service,
        ) =>
          (
            service.key ===
              "backend" ||
            service.key ===
              "sqlserver"
          ) &&
          service.status ===
            "DOWN",
      );

    if (
      backendOrDatabaseDown
    ) {
      globalStatus =
        "CRITICAL";
    }

    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    return res
      .status(200)
      .json({
        success:
          true,

        generated_at:
          new Date()
            .toISOString(),

        global_status:
          globalStatus,

        stats: {
          total_services:
            stats.total,

          operational:
            stats.up,

          degraded:
            stats.degraded,

          unavailable:
            stats.down,

          average_response_ms:
            averageResponseTime,
        },

        platform: {
          backend:
            "Node.js + Express",

          frontend:
            "React + Vite",

          database:
            "Microsoft SQL Server",

          workflow:
            "n8n",

          environment:
            process.env.NODE_ENV ||
            "development",
        },

        services,
      });
  } catch (
    error
  ) {
    console.error(
      "getAdminSystemHealth error:",
      error,
    );

    const statusCode =
      error.statusCode ||
      500;

    return res
      .status(
        statusCode,
      )
      .json({
        success:
          false,

        errorCode:
          error.errorCode ||
          "ADMIN_SYSTEM_HEALTH_FAILED",

        message:
          statusCode ===
          500
            ? "Impossible de charger l'état du système."
            : error.message,

        error:
          statusCode ===
          500
            ? error.message
            : undefined,
      });
  }
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  getAdminSystemHealth,
};