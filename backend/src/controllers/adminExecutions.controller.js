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
| NORMALIZE
|--------------------------------------------------------------------------
*/

function normalize(value) {
  return String(
    value || "",
  )
    .trim()
    .toUpperCase();
}

/*
|--------------------------------------------------------------------------
| EXECUTION STATUS
|--------------------------------------------------------------------------
|
| Ici nous construisons un statut d'exécution à partir de la facture.
|
| On ne prétend PAS récupérer directement les executions internes n8n.
|
| Il s'agit du suivi de l'exécution métier persisté dans la base InvoiceFlow.
|
|--------------------------------------------------------------------------
*/

function getExecutionStatus(
  invoice,
) {
  const status =
    normalize(
      invoice?.status,
    );

  if (
    status ===
    "ACCEPTED"
  ) {
    return "COMPLETED";
  }

  if (
    status ===
      "REJECTED" ||
    status ===
      "ERROR"
  ) {
    return "FAILED";
  }

  if (
    status ===
      "PENDING_REVIEW" ||
    status ===
      "PENDING_RETRY"
  ) {
    return "PAUSED";
  }

  if (
    [
      "UPLOADED",
      "PROCESSING",
      "VALIDATED",
      "SIGNING",
      "SIGNED",
      "SUBMITTED",
    ].includes(
      status,
    )
  ) {
    return "RUNNING";
  }

  return "UNKNOWN";
}

/*
|--------------------------------------------------------------------------
| EXECUTION SEVERITY
|--------------------------------------------------------------------------
*/

function getExecutionSeverity(
  invoice,
) {
  const status =
    normalize(
      invoice?.status,
    );

  if (
    status ===
      "ERROR" ||
    status ===
      "REJECTED"
  ) {
    return "HIGH";
  }

  if (
    status ===
      "PENDING_RETRY" ||
    status ===
      "PENDING_REVIEW"
  ) {
    return "MEDIUM";
  }

  return "NORMAL";
}

/*
|--------------------------------------------------------------------------
| PIPELINE PROGRESS
|--------------------------------------------------------------------------
*/

function getPipelineProgress(
  currentStage,
) {
  const stages = [
    "IMPORT",
    "EXTRACTION",
    "VALIDATION",
    "TEIF",
    "SIGNATURE",
    "TTN",
  ];

  const normalizedStage =
    normalize(
      currentStage,
    );

  const index =
    stages.indexOf(
      normalizedStage,
    );

  if (
    index === -1
  ) {
    return {
      current_stage:
        normalizedStage ||
        "UNKNOWN",

      current_index:
        -1,

      total_stages:
        stages.length,

      progress_percent:
        0,

      stages,
    };
  }

  const progress =
    Math.round(
      ((index + 1) /
        stages.length) *
        100,
    );

  return {
    current_stage:
      normalizedStage,

    current_index:
      index,

    total_stages:
      stages.length,

    progress_percent:
      progress,

    stages,
  };
}

/*
|--------------------------------------------------------------------------
| EXECUTION DURATION
|--------------------------------------------------------------------------
*/

function getDurationSeconds(
  createdAt,
  updatedAt,
) {
  if (
    !createdAt
  ) {
    return 0;
  }

  const start =
    new Date(
      createdAt,
    );

  const end =
    updatedAt
      ? new Date(
          updatedAt,
        )
      : new Date();

  if (
    Number.isNaN(
      start.getTime(),
    ) ||
    Number.isNaN(
      end.getTime(),
    )
  ) {
    return 0;
  }

  const duration =
    Math.floor(
      (
        end.getTime() -
        start.getTime()
      ) /
        1000,
    );

  return Math.max(
    0,
    duration,
  );
}

/*
|--------------------------------------------------------------------------
| GET /api/admin/executions
|--------------------------------------------------------------------------
*/

async function getAdminExecutions(
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

    /*
    |--------------------------------------------------------------------------
    | QUERY
    |--------------------------------------------------------------------------
    |
    | Même logique de déduplication que dashboard/invoices.
    |
    | Une organisation peut avoir une même référence de facture qu'une autre.
    | Elles restent donc indépendantes.
    |
    |--------------------------------------------------------------------------
    */

    const result =
      await pool
        .request()
        .query(`
          ;WITH RankedInvoices AS (
            SELECT
              i.id,
              i.organization_id,
              i.client_id,
              i.created_by,

              i.invoice_number,

              i.supplier_identifier,
              i.customer_identifier,

              i.source_type,
              i.source,

              i.original_filename,

              i.invoice_date,
              i.currency,

              i.total_ht,
              i.total_tva,
              i.total_ttc,
              i.total_amount,

              i.status,
              i.current_stage,
              i.can_retry,

              i.validation_errors,

              i.ttn_reference,
              i.ttn_transaction_id,
              i.transaction_id,

              i.rejection_reason,

              i.last_error_code,
              i.last_error_message,

              i.created_at,
              i.updated_at,

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
            r.created_by,

            r.invoice_number,

            r.supplier_identifier,
            r.customer_identifier,

            r.source_type,
            r.source,

            r.original_filename,

            r.invoice_date,
            r.currency,

            r.total_ht,
            r.total_tva,
            r.total_ttc,
            r.total_amount,

            r.status,
            r.current_stage,
            r.can_retry,

            r.validation_errors,

            r.ttn_reference,
            r.ttn_transaction_id,
            r.transaction_id,

            r.rejection_reason,

            r.last_error_code,
            r.last_error_message,

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

          ORDER BY
            r.updated_at DESC,
            r.created_at DESC;
        `);

    /*
    |--------------------------------------------------------------------------
    | FORMAT EXECUTIONS
    |--------------------------------------------------------------------------
    */

    const executions =
      result.recordset.map(
        (
          invoice,
        ) => {
          const clientName =
            [
              invoice.client_first_name,
              invoice.client_last_name,
            ]
              .filter(Boolean)
              .join(" ")
              .trim() ||
            invoice.client_email ||
            "Client";

          const pipeline =
            getPipelineProgress(
              invoice.current_stage,
            );

          const executionStatus =
            getExecutionStatus(
              invoice,
            );

          const durationSeconds =
            getDurationSeconds(
              invoice.created_at,
              invoice.updated_at,
            );

          return {
            /*
            |--------------------------------------------------------------------------
            | EXECUTION
            |--------------------------------------------------------------------------
            */

            execution_id:
              invoice.id,

            invoice_id:
              invoice.id,

            execution_status:
              executionStatus,

            severity:
              getExecutionSeverity(
                invoice,
              ),

            started_at:
              invoice.created_at ||
              null,

            last_activity_at:
              invoice.updated_at ||
              null,

            duration_seconds:
              durationSeconds,

            /*
            |--------------------------------------------------------------------------
            | INVOICE
            |--------------------------------------------------------------------------
            */

            invoice_number:
              invoice.invoice_number ||
              null,

            original_filename:
              invoice.original_filename ||
              null,

            invoice_date:
              invoice.invoice_date ||
              null,

            currency:
              invoice.currency ||
              null,

            total_ht:
              invoice.total_ht,

            total_tva:
              invoice.total_tva,

            total_ttc:
              invoice.total_ttc ??
              invoice.total_amount ??
              null,

            /*
            |--------------------------------------------------------------------------
            | SOURCE
            |--------------------------------------------------------------------------
            */

            source:
              invoice.source_type ||
              invoice.source ||
              "UNKNOWN",

            /*
            |--------------------------------------------------------------------------
            | BUSINESS STATUS
            |--------------------------------------------------------------------------
            */

            status:
              invoice.status ||
              null,

            current_stage:
              invoice.current_stage ||
              null,

            can_retry:
              Boolean(
                invoice.can_retry,
              ),

            /*
            |--------------------------------------------------------------------------
            | PIPELINE
            |--------------------------------------------------------------------------
            */

            pipeline,

            progress_percent:
              pipeline.progress_percent,

            /*
            |--------------------------------------------------------------------------
            | ORGANIZATION
            |--------------------------------------------------------------------------
            */

            organization_id:
              invoice.organization_id ||
              null,

            organization_name:
              invoice.organization_name ||
              "Organisation inconnue",

            organization_country:
              invoice.organization_country ||
              null,

            /*
            |--------------------------------------------------------------------------
            | CLIENT
            |--------------------------------------------------------------------------
            */

            client_id:
              invoice.client_id ||
              null,

            client_name:
              clientName,

            client_email:
              invoice.client_email ||
              null,

            /*
            |--------------------------------------------------------------------------
            | ERRORS
            |--------------------------------------------------------------------------
            */

            has_error:
              Boolean(
                invoice.last_error_code ||
                  invoice.last_error_message ||
                  invoice.rejection_reason,
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

            /*
            |--------------------------------------------------------------------------
            | TTN
            |--------------------------------------------------------------------------
            */

            ttn_reference:
              invoice.ttn_reference ||
              null,

            transaction_id:
              invoice.ttn_transaction_id ||
              invoice.transaction_id ||
              null,
          };
        },
      );

    /*
    |--------------------------------------------------------------------------
    | STATISTICS
    |--------------------------------------------------------------------------
    */

    const stats =
      executions.reduce(
        (
          accumulator,
          execution,
        ) => {
          accumulator.total +=
            1;

          if (
            execution.execution_status ===
            "COMPLETED"
          ) {
            accumulator.completed +=
              1;
          }

          if (
            execution.execution_status ===
            "RUNNING"
          ) {
            accumulator.running +=
              1;
          }

          if (
            execution.execution_status ===
            "PAUSED"
          ) {
            accumulator.paused +=
              1;
          }

          if (
            execution.execution_status ===
            "FAILED"
          ) {
            accumulator.failed +=
              1;
          }

          if (
            execution.can_retry
          ) {
            accumulator.retryable +=
              1;
          }

          accumulator.total_duration_seconds +=
            Number(
              execution.duration_seconds ||
                0,
            );

          return accumulator;
        },
        {
          total:
            0,

          completed:
            0,

          running:
            0,

          paused:
            0,

          failed:
            0,

          retryable:
            0,

          total_duration_seconds:
            0,
        },
      );

    /*
    |--------------------------------------------------------------------------
    | AVERAGE DURATION
    |--------------------------------------------------------------------------
    */

    const averageDurationSeconds =
      stats.total >
      0
        ? Math.round(
            stats.total_duration_seconds /
              stats.total,
          )
        : 0;

    /*
    |--------------------------------------------------------------------------
    | PIPELINE DISTRIBUTION
    |--------------------------------------------------------------------------
    */

    const pipelineStats = {
      IMPORT:
        0,

      EXTRACTION:
        0,

      VALIDATION:
        0,

      TEIF:
        0,

      SIGNATURE:
        0,

      TTN:
        0,

      UNKNOWN:
        0,
    };

    for (
      const execution
      of executions
    ) {
      const stage =
        normalize(
          execution.current_stage,
        ) ||
        "UNKNOWN";

      if (
        Object.prototype.hasOwnProperty.call(
          pipelineStats,
          stage,
        )
      ) {
        pipelineStats[
          stage
        ] +=
          1;
      } else {
        pipelineStats.UNKNOWN +=
          1;
      }
    }

    /*
    |--------------------------------------------------------------------------
    | SOURCE DISTRIBUTION
    |--------------------------------------------------------------------------
    */

    const sourceMap =
      new Map();

    for (
      const execution
      of executions
    ) {
      const source =
        normalize(
          execution.source,
        ) ||
        "UNKNOWN";

      sourceMap.set(
        source,
        (
          sourceMap.get(
            source,
          ) ||
          0
        ) +
          1,
      );
    }

    const sources =
      [...sourceMap.entries()]
        .map(
          ([
            source,
            total,
          ]) => ({
            source,
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

    /*
    |--------------------------------------------------------------------------
    | RECENT FAILURES
    |--------------------------------------------------------------------------
    */

    const recentFailures =
      executions
        .filter(
          (
            execution,
          ) =>
            execution.execution_status ===
              "FAILED" ||
            execution.execution_status ===
              "PAUSED",
        )
        .slice(
          0,
          10,
        );

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

        count:
          executions.length,

        stats: {
          total:
            stats.total,

          completed:
            stats.completed,

          running:
            stats.running,

          paused:
            stats.paused,

          failed:
            stats.failed,

          retryable:
            stats.retryable,

          average_duration_seconds:
            averageDurationSeconds,
        },

        pipeline:
          pipelineStats,

        sources,

        recent_failures:
          recentFailures,

        executions,
      });
  } catch (
    error
  ) {
    console.error(
      "getAdminExecutions error:",
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
          "ADMIN_EXECUTIONS_FAILED",

        message:
          statusCode ===
          500
            ? "Impossible de charger les exécutions."
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
  getAdminExecutions,
};