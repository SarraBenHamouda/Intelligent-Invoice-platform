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
| HELPERS
|--------------------------------------------------------------------------
*/

function normalize(value) {
  return String(
    value || "",
  )
    .trim()
    .toUpperCase();
}

function toNumber(value) {
  const number =
    Number(value);

  return Number.isFinite(
    number,
  )
    ? number
    : 0;
}

function round(
  value,
  decimals = 2,
) {
  const factor =
    10 ** decimals;

  return (
    Math.round(
      (
        Number(value) +
        Number.EPSILON
      ) *
        factor,
    ) /
    factor
  );
}

function getDateKey(
  value,
) {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return null;
  }

  return date
    .toISOString()
    .slice(
      0,
      10,
    );
}

function getMonthKey(
  value,
) {
  const dateKey =
    getDateKey(
      value,
    );

  if (!dateKey) {
    return null;
  }

  return dateKey.slice(
    0,
    7,
  );
}

function getDurationSeconds(
  createdAt,
  updatedAt,
) {
  if (
    !createdAt ||
    !updatedAt
  ) {
    return 0;
  }

  const start =
    new Date(
      createdAt,
    );

  const end =
    new Date(
      updatedAt,
    );

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

  return Math.max(
    0,
    Math.floor(
      (
        end.getTime() -
        start.getTime()
      ) /
        1000,
    ),
  );
}

/*
|--------------------------------------------------------------------------
| GET /api/admin/reports
|--------------------------------------------------------------------------
*/

async function getAdminReports(
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
    | INVOICES
    |--------------------------------------------------------------------------
    */

    const invoiceResult =
      await pool
        .request()
        .query(`
          ;WITH RankedInvoices AS (
            SELECT
              i.id,
              i.organization_id,
              i.client_id,

              i.invoice_number,
              i.supplier_identifier,

              i.source_type,
              i.source,

              i.status,
              i.current_stage,

              i.currency,

              i.total_ht,
              i.total_tva,
              i.total_ttc,
              i.total_amount,

              i.last_error_code,

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
              ) AS rn

            FROM dbo.invoices i
          )

          SELECT
            r.*,

            o.name
              AS organization_name,

            o.country_code
              AS organization_country

          FROM RankedInvoices r

          LEFT JOIN dbo.organizations o
            ON o.id =
              r.organization_id

          WHERE
            r.rn = 1

          ORDER BY
            r.created_at ASC;
        `);

    const invoices =
      invoiceResult.recordset ||
      [];

    /*
    |--------------------------------------------------------------------------
    | USERS / ORGANIZATIONS
    |--------------------------------------------------------------------------
    */

    const userStatsResult =
      await pool
        .request()
        .query(`
          SELECT
            COUNT(*)
              AS total_users,

            SUM(
              CASE
                WHEN
                  UPPER(
                    COALESCE(
                      role,
                      ''
                    )
                  ) = 'CLIENT'

                THEN 1
                ELSE 0
              END
            )
              AS clients,

            SUM(
              CASE
                WHEN
                  UPPER(
                    COALESCE(
                      role,
                      ''
                    )
                  ) = 'ADMIN'

                THEN 1
                ELSE 0
              END
            )
              AS admins,

            SUM(
              CASE
                WHEN
                  is_active = 1

                THEN 1
                ELSE 0
              END
            )
              AS active_users

          FROM dbo.users;
        `);

    const organizationResult =
      await pool
        .request()
        .query(`
          SELECT
            COUNT(*)
              AS total_organizations,

            SUM(
              CASE
                WHEN
                  is_active = 1

                THEN 1
                ELSE 0
              END
            )
              AS active_organizations

          FROM dbo.organizations;
        `);

    const users =
      userStatsResult.recordset?.[0] ||
      {};

    const organizationsStats =
      organizationResult.recordset?.[0] ||
      {};

    /*
    |--------------------------------------------------------------------------
    | GLOBAL STATS
    |--------------------------------------------------------------------------
    */

    const global = {
      total_invoices:
        invoices.length,

      accepted:
        0,

      rejected:
        0,

      errors:
        0,

      pending_review:
        0,

      pending_retry:
        0,

      processing:
        0,

      total_value:
        0,

      total_ht:
        0,

      total_tva:
        0,

      average_processing_seconds:
        0,

      acceptance_rate:
        0,

      rejection_rate:
        0,
    };

    let durationTotal =
      0;

    let durationCount =
      0;

    for (
      const invoice
      of invoices
    ) {
      const status =
        normalize(
          invoice.status,
        );

      if (
        status ===
        "ACCEPTED"
      ) {
        global.accepted +=
          1;
      }

      if (
        status ===
        "REJECTED"
      ) {
        global.rejected +=
          1;
      }

      if (
        status ===
        "ERROR"
      ) {
        global.errors +=
          1;
      }

      if (
        status ===
        "PENDING_REVIEW"
      ) {
        global.pending_review +=
          1;
      }

      if (
        status ===
        "PENDING_RETRY"
      ) {
        global.pending_retry +=
          1;
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
        global.processing +=
          1;
      }

      global.total_ht +=
        toNumber(
          invoice.total_ht,
        );

      global.total_tva +=
        toNumber(
          invoice.total_tva,
        );

      global.total_value +=
        toNumber(
          invoice.total_ttc ??
            invoice.total_amount,
        );

      const duration =
        getDurationSeconds(
          invoice.created_at,
          invoice.updated_at,
        );

      if (
        duration >
        0
      ) {
        durationTotal +=
          duration;

        durationCount +=
          1;
      }
    }

    global.total_ht =
      round(
        global.total_ht,
        3,
      );

    global.total_tva =
      round(
        global.total_tva,
        3,
      );

    global.total_value =
      round(
        global.total_value,
        3,
      );

    global.average_processing_seconds =
      durationCount >
      0
        ? Math.round(
            durationTotal /
              durationCount,
          )
        : 0;

    global.acceptance_rate =
      global.total_invoices >
      0
        ? round(
            (
              global.accepted /
              global.total_invoices
            ) *
              100,
            1,
          )
        : 0;

    global.rejection_rate =
      global.total_invoices >
      0
        ? round(
            (
              (
                global.rejected +
                global.errors
              ) /
              global.total_invoices
            ) *
              100,
            1,
          )
        : 0;

    /*
    |--------------------------------------------------------------------------
    | STATUS DISTRIBUTION
    |--------------------------------------------------------------------------
    */

    const statusMap =
      new Map();

    for (
      const invoice
      of invoices
    ) {
      const status =
        normalize(
          invoice.status,
        ) ||
        "UNKNOWN";

      statusMap.set(
        status,
        (
          statusMap.get(
            status,
          ) ||
          0
        ) +
          1,
      );
    }

    const statuses =
      [...statusMap.entries()]
        .map(
          ([
            status,
            total,
          ]) => ({
            status,
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
    | STAGES
    |--------------------------------------------------------------------------
    */

    const stageMap =
      new Map();

    for (
      const invoice
      of invoices
    ) {
      const stage =
        normalize(
          invoice.current_stage,
        ) ||
        "UNKNOWN";

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
        );

    /*
    |--------------------------------------------------------------------------
    | SOURCES
    |--------------------------------------------------------------------------
    */

    const sourceMap =
      new Map();

    for (
      const invoice
      of invoices
    ) {
      const source =
        normalize(
          invoice.source_type ||
            invoice.source,
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

            percentage:
              invoices.length >
              0
                ? round(
                    (
                      total /
                      invoices.length
                    ) *
                      100,
                    1,
                  )
                : 0,
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
    | DAILY ACTIVITY
    |--------------------------------------------------------------------------
    */

    const dailyMap =
      new Map();

    for (
      const invoice
      of invoices
    ) {
      const day =
        getDateKey(
          invoice.created_at,
        );

      if (!day) {
        continue;
      }

      const current =
        dailyMap.get(
          day,
        ) || {
          date:
            day,

          total:
            0,

          accepted:
            0,

          rejected:
            0,

          errors:
            0,
        };

      current.total +=
        1;

      const status =
        normalize(
          invoice.status,
        );

      if (
        status ===
        "ACCEPTED"
      ) {
        current.accepted +=
          1;
      }

      if (
        status ===
        "REJECTED"
      ) {
        current.rejected +=
          1;
      }

      if (
        status ===
        "ERROR"
      ) {
        current.errors +=
          1;
      }

      dailyMap.set(
        day,
        current,
      );
    }

    const dailyActivity =
      [...dailyMap.values()]
        .sort(
          (
            first,
            second,
          ) =>
            first.date.localeCompare(
              second.date,
            ),
        )
        .slice(
          -30,
        );

    /*
    |--------------------------------------------------------------------------
    | MONTHLY ACTIVITY
    |--------------------------------------------------------------------------
    */

    const monthlyMap =
      new Map();

    for (
      const invoice
      of invoices
    ) {
      const month =
        getMonthKey(
          invoice.created_at,
        );

      if (!month) {
        continue;
      }

      const current =
        monthlyMap.get(
          month,
        ) || {
          month,
          total:
            0,
          accepted:
            0,
          rejected:
            0,
        };

      current.total +=
        1;

      const status =
        normalize(
          invoice.status,
        );

      if (
        status ===
        "ACCEPTED"
      ) {
        current.accepted +=
          1;
      }

      if (
        status ===
          "REJECTED" ||
        status ===
          "ERROR"
      ) {
        current.rejected +=
          1;
      }

      monthlyMap.set(
        month,
        current,
      );
    }

    const monthlyActivity =
      [...monthlyMap.values()]
        .sort(
          (
            first,
            second,
          ) =>
            first.month.localeCompare(
              second.month,
            ),
        )
        .slice(
          -12,
        );

    /*
    |--------------------------------------------------------------------------
    | ORGANIZATION PERFORMANCE
    |--------------------------------------------------------------------------
    */

    const organizationMap =
      new Map();

    for (
      const invoice
      of invoices
    ) {
      const id =
        invoice.organization_id ||
        "UNKNOWN";

      const current =
        organizationMap.get(
          id,
        ) || {
          organization_id:
            invoice.organization_id ||
            null,

          organization_name:
            invoice.organization_name ||
            "Organisation inconnue",

          country:
            invoice.organization_country ||
            null,

          total:
            0,

          accepted:
            0,

          rejected:
            0,

          action_required:
            0,

          total_value:
            0,
        };

      current.total +=
        1;

      const status =
        normalize(
          invoice.status,
        );

      if (
        status ===
        "ACCEPTED"
      ) {
        current.accepted +=
          1;
      }

      if (
        status ===
          "REJECTED" ||
        status ===
          "ERROR"
      ) {
        current.rejected +=
          1;
      }

      if (
        status ===
          "PENDING_REVIEW" ||
        status ===
          "PENDING_RETRY"
      ) {
        current.action_required +=
          1;
      }

      current.total_value +=
        toNumber(
          invoice.total_ttc ??
            invoice.total_amount,
        );

      organizationMap.set(
        id,
        current,
      );
    }

    const organizationPerformance =
      [...organizationMap.values()]
        .map(
          (
            item,
          ) => ({
            ...item,

            total_value:
              round(
                item.total_value,
                3,
              ),

            acceptance_rate:
              item.total >
              0
                ? round(
                    (
                      item.accepted /
                      item.total
                    ) *
                      100,
                    1,
                  )
                : 0,
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
    | ERRORS
    |--------------------------------------------------------------------------
    */

    const errorMap =
      new Map();

    for (
      const invoice
      of invoices
    ) {
      const code =
        String(
          invoice.last_error_code ||
            "",
        ).trim();

      if (!code) {
        continue;
      }

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

    const errors =
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

        stats: global,

        users: {
          total:
            toNumber(
              users.total_users,
            ),

          clients:
            toNumber(
              users.clients,
            ),

          admins:
            toNumber(
              users.admins,
            ),

          active:
            toNumber(
              users.active_users,
            ),
        },

        organizations: {
          total:
            toNumber(
              organizationsStats.total_organizations,
            ),

          active:
            toNumber(
              organizationsStats.active_organizations,
            ),
        },

        statuses,

        stages,

        sources,

        daily_activity:
          dailyActivity,

        monthly_activity:
          monthlyActivity,

        organization_performance:
          organizationPerformance,

        top_errors:
          errors,
      });
  } catch (
    error
  ) {
    console.error(
      "getAdminReports error:",
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
          "ADMIN_REPORTS_FAILED",

        message:
          statusCode ===
          500
            ? "Impossible de charger les statistiques."
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
  getAdminReports,
};