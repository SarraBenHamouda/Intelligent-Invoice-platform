const {
  getDatabase,
} = require("../config/database");

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
      req.user?.role || "",
    )
      .trim()
      .toUpperCase();

  if (!userId) {
    const error =
      new Error(
        "Utilisateur non authentifié.",
      );

    error.statusCode = 401;
    error.errorCode =
      "AUTHENTICATION_REQUIRED";

    throw error;
  }

  if (role !== "ADMIN") {
    const error =
      new Error(
        "Accès administrateur requis.",
      );

    error.statusCode = 403;
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

function setNoCacheHeaders(res) {
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
| SEVERITY
|--------------------------------------------------------------------------
*/

function getSeverity(
  status,
  errorCode,
) {
  const normalizedStatus =
    String(
      status || "",
    )
      .trim()
      .toUpperCase();

  const normalizedCode =
    String(
      errorCode || "",
    )
      .trim()
      .toUpperCase();

  if (
    normalizedStatus ===
      "ERROR" ||
    normalizedStatus ===
      "REJECTED"
  ) {
    return "HIGH";
  }

  if (
    normalizedCode.includes(
      "SIGNATURE",
    ) ||
    normalizedCode.includes(
      "TTN",
    ) ||
    normalizedCode.includes(
      "XML",
    )
  ) {
    return "HIGH";
  }

  if (
    normalizedStatus ===
      "PENDING_RETRY" ||
    normalizedStatus ===
      "PENDING_REVIEW"
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

/*
|--------------------------------------------------------------------------
| GET /api/admin/errors
|--------------------------------------------------------------------------
*/

async function getAdminErrors(
  req,
  res,
) {
  try {
    setNoCacheHeaders(
      res,
    );

    getAdminUser(req);

    const pool =
      getDatabase();

    /*
    |--------------------------------------------------------------------------
    | ANOMALIES
    |--------------------------------------------------------------------------
    */

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
              )
                AS rn

            FROM dbo.invoices i
          )

          SELECT
            r.id,
            r.organization_id,
            r.client_id,

            r.invoice_number,
            r.original_filename,

            r.source_type,
            r.source,

            r.status,
            r.current_stage,
            r.can_retry,

            r.validation_errors,

            r.rejection_reason,

            r.last_error_code,
            r.last_error_message,

            r.ttn_reference,
            r.ttn_transaction_id,
            r.transaction_id,

            r.created_at,
            r.updated_at,

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

            AND (
              UPPER(
                COALESCE(
                  r.status,
                  ''
                )
              ) IN (
                'PENDING_REVIEW',
                'PENDING_RETRY',
                'REJECTED',
                'ERROR'
              )

              OR NULLIF(
                LTRIM(
                  RTRIM(
                    r.last_error_code
                  )
                ),
                ''
              ) IS NOT NULL

              OR NULLIF(
                LTRIM(
                  RTRIM(
                    r.last_error_message
                  )
                ),
                ''
              ) IS NOT NULL

              OR NULLIF(
                LTRIM(
                  RTRIM(
                    r.rejection_reason
                  )
                ),
                ''
              ) IS NOT NULL
            )

          ORDER BY
            r.updated_at DESC,
            r.created_at DESC;
        `);

    const anomalies =
      result.recordset.map(
        (item) => {
          const clientName =
            [
              item.client_first_name,
              item.client_last_name,
            ]
              .filter(Boolean)
              .join(" ")
              .trim() ||
            item.client_email ||
            "Client";

          const errorCode =
            item.last_error_code ||
            (
              String(
                item.status ||
                  "",
              )
                .trim()
                .toUpperCase() ===
              "PENDING_REVIEW"
                ? "HUMAN_REVIEW_REQUIRED"
                : null
            ) ||
            (
              String(
                item.status ||
                  "",
              )
                .trim()
                .toUpperCase() ===
              "REJECTED"
                ? "INVOICE_REJECTED"
                : null
            ) ||
            "UNKNOWN_ANOMALY";

          const message =
            item.last_error_message ||
            item.rejection_reason ||
            (
              String(
                item.status ||
                  "",
              )
                .trim()
                .toUpperCase() ===
              "PENDING_REVIEW"
                ? "La facture nécessite une vérification humaine."
                : "Une anomalie a été détectée sur cette facture."
            );

          return {
            id:
              item.id,

            organization_id:
              item.organization_id,

            organization_name:
              item.organization_name ||
              "Organisation inconnue",

            organization_country:
              item.organization_country ||
              null,

            client_id:
              item.client_id,

            client_name:
              clientName,

            client_email:
              item.client_email ||
              null,

            invoice_number:
              item.invoice_number ||
              null,

            original_filename:
              item.original_filename ||
              null,

            source:
              item.source_type ||
              item.source ||
              null,

            status:
              item.status ||
              null,

            current_stage:
              item.current_stage ||
              null,

            can_retry:
              Boolean(
                item.can_retry,
              ),

            error_code:
              errorCode,

            error_message:
              message,

            rejection_reason:
              item.rejection_reason ||
              null,

            validation_errors:
              item.validation_errors ||
              null,

            severity:
              getSeverity(
                item.status,
                errorCode,
              ),

            ttn_reference:
              item.ttn_reference ||
              null,

            transaction_id:
              item.ttn_transaction_id ||
              item.transaction_id ||
              null,

            created_at:
              item.created_at ||
              null,

            updated_at:
              item.updated_at ||
              null,
          };
        },
      );

    /*
    |--------------------------------------------------------------------------
    | STATS
    |--------------------------------------------------------------------------
    */

    const stats =
      anomalies.reduce(
        (
          accumulator,
          item,
        ) => {
          accumulator.total +=
            1;

          const severity =
            String(
              item.severity ||
                "",
            ).toUpperCase();

          if (
            severity ===
            "HIGH"
          ) {
            accumulator.high +=
              1;
          }

          if (
            severity ===
            "MEDIUM"
          ) {
            accumulator.medium +=
              1;
          }

          if (
            severity ===
            "LOW"
          ) {
            accumulator.low +=
              1;
          }

          const status =
            String(
              item.status ||
                "",
            )
              .trim()
              .toUpperCase();

          if (
            status ===
            "PENDING_REVIEW"
          ) {
            accumulator.pending_review +=
              1;
          }

          if (
            status ===
            "PENDING_RETRY"
          ) {
            accumulator.pending_retry +=
              1;
          }

          if (
            status ===
            "REJECTED"
          ) {
            accumulator.rejected +=
              1;
          }

          if (
            status ===
            "ERROR"
          ) {
            accumulator.errors +=
              1;
          }

          if (
            item.can_retry
          ) {
            accumulator.retryable +=
              1;
          }

          return accumulator;
        },
        {
          total: 0,
          high: 0,
          medium: 0,
          low: 0,

          pending_review: 0,
          pending_retry: 0,
          rejected: 0,
          errors: 0,

          retryable: 0,
        },
      );

    /*
    |--------------------------------------------------------------------------
    | ERROR CODES
    |--------------------------------------------------------------------------
    */

    const errorCodeMap =
      new Map();

    for (
      const anomaly
      of anomalies
    ) {
      const code =
        anomaly.error_code ||
        "UNKNOWN_ANOMALY";

      const current =
        errorCodeMap.get(
          code,
        ) ||
        {
          error_code:
            code,

          total:
            0,

          severity:
            anomaly.severity,
        };

      current.total +=
        1;

      errorCodeMap.set(
        code,
        current,
      );
    }

    const topErrors =
      [...errorCodeMap.values()]
        .sort(
          (
            a,
            b,
          ) =>
            b.total -
            a.total,
        )
        .slice(
          0,
          10,
        );

    /*
    |--------------------------------------------------------------------------
    | STAGES
    |--------------------------------------------------------------------------
    */

    const stageMap =
      new Map();

    for (
      const anomaly
      of anomalies
    ) {
      const stage =
        String(
          anomaly.current_stage ||
            "UNKNOWN",
        )
          .trim()
          .toUpperCase();

      stageMap.set(
        stage,
        (
          stageMap.get(
            stage,
          ) ||
          0
        ) +
          1,
      );
    }

    const stages =
      [...stageMap.entries()]
        .map(
          ([
            stage,
            total,
          ]) => ({
            stage,
            total,
          }),
        )
        .sort(
          (
            a,
            b,
          ) =>
            b.total -
            a.total,
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
          anomalies.length,

        stats,

        top_errors:
          topErrors,

        stages,

        anomalies,
      });
  } catch (error) {
    console.error(
      "getAdminErrors error:",
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
          "ADMIN_ERRORS_FAILED",

        message:
          statusCode ===
          500
            ? "Impossible de charger les anomalies."
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
  getAdminErrors,
};