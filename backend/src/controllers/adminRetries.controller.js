const sql =
  require("mssql");

const axios =
  require("axios");

const {
  getDatabase,
} =
  require(
    "../config/database",
  );

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/

const N8N_RETRY_WEBHOOK_URL =
  String(
    process.env.N8N_RETRY_WEBHOOK_URL ||
      "",
  ).trim();

const RETRY_REQUEST_TIMEOUT_MS =
  Math.max(
    1000,
    Number(
      process.env.ADMIN_RETRY_TIMEOUT_MS ||
        15000,
    ),
  );

/*
|--------------------------------------------------------------------------
| ADMIN AUTHORIZATION
|--------------------------------------------------------------------------
*/

function getAdminUser(req) {
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
| NO CACHE
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
| HELPERS
|--------------------------------------------------------------------------
*/

function normalize(value) {
  return String(
    value ||
      "",
  )
    .trim()
    .toUpperCase();
}

function toBoolean(value) {
  if (
    value === true ||
    value === 1 ||
    value === "1"
  ) {
    return true;
  }

  const normalized =
    normalize(value);

  return (
    normalized ===
      "TRUE" ||
    normalized ===
      "YES"
  );
}

function getClientName(
  row,
) {
  const name =
    [
      row.client_first_name,
      row.client_last_name,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

  return (
    name ||
    row.client_email ||
    "Client"
  );
}

/*
|--------------------------------------------------------------------------
| RETRYABLE ERROR
|--------------------------------------------------------------------------
*/

function isRetryableErrorCode(
  errorCode,
) {
  const code =
    normalize(
      errorCode,
    );

  const retryableCodes = [
    "TTN_TIMEOUT",
    "TTN_UNAVAILABLE",
    "TTN_SERVER_ERROR",
    "TIMEOUT",
    "CONNECTIONERROR",
    "CONNECTION_ERROR",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "NETWORK_ERROR",
    "SERVICE_UNAVAILABLE",
  ];

  return retryableCodes.includes(
    code,
  );
}

/*
|--------------------------------------------------------------------------
| RETRYABLE INVOICE
|--------------------------------------------------------------------------
*/

function isRetryableInvoice(
  invoice,
) {
  const status =
    normalize(
      invoice.status,
    );

  if (
    status ===
    "PENDING_RETRY"
  ) {
    return true;
  }

  if (
    toBoolean(
      invoice.can_retry,
    )
  ) {
    return true;
  }

  return isRetryableErrorCode(
    invoice.last_error_code,
  );
}

/*
|--------------------------------------------------------------------------
| RETRY SEVERITY
|--------------------------------------------------------------------------
*/

function getRetrySeverity(
  invoice,
) {
  const code =
    normalize(
      invoice.last_error_code,
    );

  if (
    [
      "TTN_UNAVAILABLE",
      "SERVICE_UNAVAILABLE",
      "ECONNREFUSED",
    ].includes(
      code,
    )
  ) {
    return "HIGH";
  }

  if (
    [
      "TTN_TIMEOUT",
      "TIMEOUT",
      "ETIMEDOUT",
      "NETWORK_ERROR",
      "CONNECTION_ERROR",
      "CONNECTIONERROR",
    ].includes(
      code,
    )
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

/*
|--------------------------------------------------------------------------
| GET /api/admin/retries
|--------------------------------------------------------------------------
*/

async function getAdminRetries(
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

    const pool =
      getDatabase();

    const result =
      await pool
        .request()
        .query(`
          ;WITH RankedInvoices AS (
            SELECT
              i.*,

              ROW_NUMBER() OVER (
                PARTITION BY
                  i.organization_id,

                  CASE
                    WHEN
                      i.invoice_number IS NULL
                      OR LTRIM(
                        RTRIM(
                          i.invoice_number
                        )
                      ) = ''

                    THEN
                      CONVERT(
                        NVARCHAR(36),
                        i.id
                      )

                    ELSE
                      CONCAT(
                        UPPER(
                          LTRIM(
                            RTRIM(
                              i.invoice_number
                            )
                          )
                        ),

                        '|',

                        UPPER(
                          LTRIM(
                            RTRIM(
                              COALESCE(
                                i.supplier_identifier,
                                ''
                              )
                            )
                          )
                        )
                      )
                  END

                ORDER BY
                  i.updated_at DESC,
                  i.created_at DESC
              ) AS rn

            FROM dbo.invoices i
          )

          SELECT
            r.*,

            o.name
              AS organization_name,

            o.country_code
              AS organization_country,

            u.first_name
              AS client_first_name,

            u.last_name
              AS client_last_name,

            u.email
              AS client_email

          FROM RankedInvoices r

          LEFT JOIN dbo.organizations o
            ON o.id =
              r.organization_id

          LEFT JOIN dbo.users u
            ON u.id =
              r.client_id

          WHERE
            r.rn = 1

          ORDER BY
            r.updated_at DESC,
            r.created_at DESC;
        `);

    const retries =
      result.recordset
        .filter(
          (
            invoice,
          ) =>
            isRetryableInvoice(
              invoice,
            ),
        )
        .map(
          (
            invoice,
          ) => ({
            invoice_id:
              invoice.id,

            invoice_number:
              invoice.invoice_number ||
              null,

            organization_id:
              invoice.organization_id ||
              null,

            organization_name:
              invoice.organization_name ||
              "Organisation inconnue",

            organization_country:
              invoice.organization_country ||
              null,

            client_id:
              invoice.client_id ||
              null,

            client_name:
              getClientName(
                invoice,
              ),

            client_email:
              invoice.client_email ||
              null,

            source:
              invoice.source_type ||
              invoice.source ||
              "UNKNOWN",

            status:
              invoice.status ||
              null,

            current_stage:
              invoice.current_stage ||
              null,

            can_retry:
              true,

            severity:
              getRetrySeverity(
                invoice,
              ),

            error_code:
              invoice.last_error_code ||
              null,

            error_message:
              invoice.last_error_message ||
              invoice.rejection_reason ||
              null,

            rejection_reason:
              invoice.rejection_reason ||
              null,

            retry_count:
              Number(
                invoice.retry_count ||
                  invoice.retry_attempts ||
                  invoice.attempt_count ||
                  0,
              ),

            transaction_id:
              invoice.ttn_transaction_id ||
              invoice.transaction_id ||
              null,

            ttn_reference:
              invoice.ttn_reference ||
              null,

            created_at:
              invoice.created_at ||
              null,

            updated_at:
              invoice.updated_at ||
              null,
          }),
        );

    /*
    |--------------------------------------------------------------------------
    | STATS
    |--------------------------------------------------------------------------
    */

    const stats = {
      total:
        retries.length,

      high:
        0,

      medium:
        0,

      low:
        0,

      ttn:
        0,

      signature:
        0,

      other:
        0,
    };

    for (
      const retry
      of retries
    ) {
      const severity =
        normalize(
          retry.severity,
        );

      if (
        severity ===
        "HIGH"
      ) {
        stats.high +=
          1;
      } else if (
        severity ===
        "MEDIUM"
      ) {
        stats.medium +=
          1;
      } else {
        stats.low +=
          1;
      }

      const stage =
        normalize(
          retry.current_stage,
        );

      if (
        stage ===
        "TTN"
      ) {
        stats.ttn +=
          1;
      } else if (
        stage ===
        "SIGNATURE"
      ) {
        stats.signature +=
          1;
      } else {
        stats.other +=
          1;
      }
    }

    /*
    |--------------------------------------------------------------------------
    | ERROR DISTRIBUTION
    |--------------------------------------------------------------------------
    */

    const errorMap =
      new Map();

    for (
      const retry
      of retries
    ) {
      const code =
        normalize(
          retry.error_code,
        ) ||
        "UNKNOWN";

      errorMap.set(
        code,
        (
          errorMap.get(
            code,
          ) ||
          0
        ) +
          1,
      );
    }

    const errorTypes =
      [...errorMap.entries()]
        .map(
          ([
            error_code,
            total,
          ]) => ({
            error_code,
            total,
          }),
        )
        .sort(
          (
            first,
            second,
          ) =>
            second.total -
            first.total,
        );

    return res
      .status(200)
      .json({
        success:
          true,

        generated_at:
          new Date()
            .toISOString(),

        count:
          retries.length,

        stats,

        error_types:
          errorTypes,

        retries,
      });
  } catch (
    error
  ) {
    console.error(
      "getAdminRetries error:",
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
          "ADMIN_RETRIES_FAILED",

        message:
          statusCode ===
          500
            ? "Impossible de charger le centre de relances."
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
| POST /api/admin/retries/:id/retry
|--------------------------------------------------------------------------
|
| Cette action ne modifie pas directement la facture en ACCEPTED.
|
| Elle demande seulement une nouvelle exécution du workflow.
|
|--------------------------------------------------------------------------
*/

async function retryAdminInvoice(
  req,
  res,
) {
  try {
    setNoCacheHeaders(
      res,
    );

    const admin =
      getAdminUser(
        req,
      );

    const invoiceId =
      String(
        req.params?.id ||
          "",
      ).trim();

    if (
      !invoiceId
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          errorCode:
            "INVOICE_ID_REQUIRED",

          message:
            "Identifiant de facture requis.",
        });
    }

    const pool =
      getDatabase();

    const request =
      pool.request();

    request.input(
      "invoice_id",
      sql.UniqueIdentifier,
      invoiceId,
    );

    const result =
      await request.query(`
        SELECT TOP (1)
          i.*,

          o.name
            AS organization_name

        FROM dbo.invoices i

        LEFT JOIN dbo.organizations o
          ON o.id =
            i.organization_id

        WHERE
          i.id =
            @invoice_id;
      `);

    const invoice =
      result.recordset?.[0];

    if (!invoice) {
      return res
        .status(404)
        .json({
          success:
            false,

          errorCode:
            "INVOICE_NOT_FOUND",

          message:
            "Facture introuvable.",
        });
    }

    if (
      !isRetryableInvoice(
        invoice,
      )
    ) {
      return res
        .status(409)
        .json({
          success:
            false,

          errorCode:
            "INVOICE_NOT_RETRYABLE",

          message:
            "Cette facture n’est pas actuellement relançable.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | RETRY ENDPOINT CHECK
    |--------------------------------------------------------------------------
    */

    if (
      !N8N_RETRY_WEBHOOK_URL
    ) {
      return res
        .status(503)
        .json({
          success:
            false,

          errorCode:
            "RETRY_WEBHOOK_NOT_CONFIGURED",

          message:
            "Le webhook de relance n8n n’est pas configuré.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | START RETRY
    |--------------------------------------------------------------------------
    */

    const payload = {
      invoice_id:
        invoice.id,

      invoice_number:
        invoice.invoice_number ||
        null,

      organization_id:
        invoice.organization_id ||
        null,

      requested_by:
        admin.userId,

      requested_by_role:
        "ADMIN",

      retry_reason:
        invoice.last_error_code ||
        invoice.rejection_reason ||
        "ADMIN_MANUAL_RETRY",

      previous_status:
        invoice.status ||
        null,

      previous_stage:
        invoice.current_stage ||
        null,

      transaction_id:
        invoice.ttn_transaction_id ||
        invoice.transaction_id ||
        null,
    };

    let workflowResponse;

    try {
      workflowResponse =
        await axios.post(
          N8N_RETRY_WEBHOOK_URL,
          payload,
          {
            timeout:
              RETRY_REQUEST_TIMEOUT_MS,

            headers: {
              "Content-Type":
                "application/json",
            },
          },
        );
    } catch (
      workflowError
    ) {
      console.error(
        "Admin retry webhook error:",
        workflowError?.response?.data ||
          workflowError.message,
      );

      return res
        .status(502)
        .json({
          success:
            false,

          errorCode:
            "RETRY_WORKFLOW_START_FAILED",

          message:
            "Impossible de démarrer la relance du workflow.",

          error:
            workflowError?.response?.data ||
            workflowError.message,
        });
    }

    /*
    |--------------------------------------------------------------------------
    | UPDATE LOCAL STATE
    |--------------------------------------------------------------------------
    |
    | On remet la facture en traitement.
    |
    | Le workflow callback reste responsable de la suite.
    |
    |--------------------------------------------------------------------------
    */

    const updateRequest =
      pool.request();

    updateRequest.input(
      "invoice_id",
      sql.UniqueIdentifier,
      invoiceId,
    );

    await updateRequest.query(`
      UPDATE dbo.invoices

      SET
        status =
          'PROCESSING',

        can_retry =
          0,

        updated_at =
          GETUTCDATE()

      WHERE
        id =
          @invoice_id;
    `);

    return res
      .status(200)
      .json({
        success:
          true,

        message:
          "La relance a été demandée avec succès.",

        invoice_id:
          invoiceId,

        invoice_number:
          invoice.invoice_number ||
          null,

        workflow: {
          started:
            true,

          status:
            workflowResponse.status,

          data:
            workflowResponse.data ??
            null,
        },
      });
  } catch (
    error
  ) {
    console.error(
      "retryAdminInvoice error:",
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
          "ADMIN_RETRY_FAILED",

        message:
          statusCode ===
          500
            ? "Impossible de relancer cette facture."
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
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports = {
  getAdminRetries,
  retryAdminInvoice,
};