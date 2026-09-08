const {
  sql,
  getDatabase,
} = require("../config/database");
const {
  deleteAdminClient: deleteAdminClientService,
} = require("../services/admin.service");

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
| GET ADMIN DASHBOARD
|--------------------------------------------------------------------------
*/

async function getAdminDashboard(
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
    | GLOBAL STATISTICS
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
              ) AS rn

            FROM dbo.invoices i
          ),

          VisibleInvoices AS (
            SELECT *
            FROM RankedInvoices
            WHERE rn = 1
          )

          SELECT
            (
              SELECT COUNT(*)
              FROM VisibleInvoices
            )
              AS total_invoices,

            (
              SELECT COUNT(*)
              FROM VisibleInvoices
              WHERE
                UPPER(
                  COALESCE(
                    status,
                    ''
                  )
                ) = 'ACCEPTED'
            )
              AS accepted_invoices,

            (
              SELECT COUNT(*)
              FROM VisibleInvoices
              WHERE
                UPPER(
                  COALESCE(
                    status,
                    ''
                  )
                ) IN (
                  'UPLOADED',
                  'PROCESSING',
                  'VALIDATED',
                  'SIGNING',
                  'SIGNED',
                  'SUBMITTED'
                )
            )
              AS processing_invoices,

            (
              SELECT COUNT(*)
              FROM VisibleInvoices
              WHERE
                UPPER(
                  COALESCE(
                    status,
                    ''
                  )
                ) IN (
                  'PENDING_REVIEW',
                  'PENDING_RETRY',
                  'REJECTED',
                  'ERROR'
                )
            )
              AS action_required_invoices,

            (
              SELECT COUNT(*)
              FROM VisibleInvoices
              WHERE
                CAST(
                  created_at AS date
                ) =
                CAST(
                  SYSUTCDATETIME()
                  AS date
                )
            )
              AS invoices_today,

            (
              SELECT COUNT(*)
              FROM dbo.organizations
              WHERE
                is_active = 1
            )
              AS active_organizations,

            (
              SELECT COUNT(*)
              FROM dbo.users
              WHERE
                UPPER(
                  COALESCE(
                    role,
                    ''
                  )
                ) = 'CLIENT'

                AND is_active = 1
            )
              AS active_client_users,

            CAST(
              CASE
                WHEN (
                  SELECT COUNT(*)
                  FROM VisibleInvoices
                ) = 0

                THEN 0

                ELSE
                  (
                    (
                      SELECT COUNT(*)
                      FROM VisibleInvoices
                      WHERE
                        UPPER(
                          COALESCE(
                            status,
                            ''
                          )
                        ) =
                        'ACCEPTED'
                    ) * 100.0
                  )
                  /
                  (
                    SELECT COUNT(*)
                    FROM VisibleInvoices
                  )
              END

              AS DECIMAL(6, 2)
            )
              AS acceptance_rate,

            (
              SELECT
                COALESCE(
                  AVG(
                    CAST(
                      DATEDIFF(
                        SECOND,
                        created_at,
                        updated_at
                      )
                      AS BIGINT
                    )
                  ),
                  0
                )

              FROM VisibleInvoices

              WHERE
                UPPER(
                  COALESCE(
                    status,
                    ''
                  )
                ) = 'ACCEPTED'
            )
              AS average_processing_seconds;
        `);

    const rawStats =
      result.recordset?.[0] ||
      {};

    /*
    |--------------------------------------------------------------------------
    | PIPELINE
    |--------------------------------------------------------------------------
    */

    const pipelineResult =
      await pool
        .request()
        .query(`
          ;WITH RankedInvoices AS (
            SELECT
              id,
              organization_id,
              invoice_number,
              supplier_identifier,
              current_stage,
              updated_at,
              created_at,

              ROW_NUMBER() OVER (
                PARTITION BY
                  organization_id,

                  CASE
                    WHEN
                      invoice_number IS NULL
                      OR LTRIM(
                        RTRIM(
                          invoice_number
                        )
                      ) = ''

                    THEN
                      CONVERT(
                        NVARCHAR(36),
                        id
                      )

                    ELSE
                      CONCAT(
                        UPPER(
                          LTRIM(
                            RTRIM(
                              invoice_number
                            )
                          )
                        ),

                        '|',

                        UPPER(
                          LTRIM(
                            RTRIM(
                              COALESCE(
                                supplier_identifier,
                                ''
                              )
                            )
                          )
                        )
                      )
                  END

                ORDER BY
                  updated_at DESC,
                  created_at DESC
              ) AS rn

            FROM dbo.invoices
          )

          SELECT
            UPPER(
              COALESCE(
                current_stage,
                'IMPORT'
              )
            )
              AS stage,

            COUNT(*)
              AS total

          FROM RankedInvoices

          WHERE rn = 1

          GROUP BY
            UPPER(
              COALESCE(
                current_stage,
                'IMPORT'
              )
            );
        `);

    const pipeline = {
      IMPORT: 0,
      EXTRACTION: 0,
      VALIDATION: 0,
      TEIF: 0,
      SIGNATURE: 0,
      TTN: 0,
    };

    for (
      const row
      of pipelineResult.recordset
    ) {
      const stage =
        String(
          row.stage || "",
        )
          .trim()
          .toUpperCase();

      if (
        Object.prototype.hasOwnProperty.call(
          pipeline,
          stage,
        )
      ) {
        pipeline[stage] =
          Number(
            row.total || 0,
          );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | RECENT INVOICES
    |--------------------------------------------------------------------------
    */

    const recentResult =
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

              i.ttn_reference,
              i.ttn_transaction_id,
              i.transaction_id,

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
              ) AS rn

            FROM dbo.invoices i
          )

          SELECT TOP (10)
            r.id,
            r.organization_id,
            r.client_id,

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

            r.ttn_reference,
            r.ttn_transaction_id,
            r.transaction_id,

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

          WHERE r.rn = 1

          ORDER BY
            r.updated_at DESC,
            r.created_at DESC;
        `);

    /*
    |--------------------------------------------------------------------------
    | ACTION REQUIRED
    |--------------------------------------------------------------------------
    */

    const actionRequiredResult =
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

              i.status,
              i.current_stage,
              i.can_retry,

              i.last_error_code,
              i.last_error_message,
              i.rejection_reason,

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

          SELECT TOP (8)
            r.id,
            r.organization_id,
            r.client_id,

            r.invoice_number,

            r.status,
            r.current_stage,
            r.can_retry,

            r.last_error_code,
            r.last_error_message,
            r.rejection_reason,

            r.created_at,
            r.updated_at,

            o.name
              AS organization_name,

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

            AND UPPER(
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

          ORDER BY
            r.updated_at DESC,
            r.created_at DESC;
        `);

    /*
    |--------------------------------------------------------------------------
    | TOP ERRORS
    |--------------------------------------------------------------------------
    */

    const errorsResult =
      await pool
        .request()
        .query(`
          SELECT TOP (8)
            COALESCE(
              NULLIF(
                LTRIM(
                  RTRIM(
                    last_error_code
                  )
                ),
                ''
              ),
              'UNKNOWN_ERROR'
            )
              AS error_code,

            COUNT(*)
              AS total

          FROM dbo.invoices

          WHERE
            UPPER(
              COALESCE(
                status,
                ''
              )
            ) IN (
              'ERROR',
              'REJECTED',
              'PENDING_RETRY'
            )

          GROUP BY
            COALESCE(
              NULLIF(
                LTRIM(
                  RTRIM(
                    last_error_code
                  )
                ),
                ''
              ),
              'UNKNOWN_ERROR'
            )

          ORDER BY
            COUNT(*) DESC;
        `);

    /*
    |--------------------------------------------------------------------------
    | SOURCES
    |--------------------------------------------------------------------------
    */

    const sourcesResult =
      await pool
        .request()
        .query(`
          SELECT
            UPPER(
              COALESCE(
                NULLIF(
                  LTRIM(
                    RTRIM(
                      source_type
                    )
                  ),
                  ''
                ),
                NULLIF(
                  LTRIM(
                    RTRIM(
                      source
                    )
                  ),
                  ''
                ),
                'UNKNOWN'
              )
            )
              AS source,

            COUNT(*)
              AS total

          FROM dbo.invoices

          GROUP BY
            UPPER(
              COALESCE(
                NULLIF(
                  LTRIM(
                    RTRIM(
                      source_type
                    )
                  ),
                  ''
                ),
                NULLIF(
                  LTRIM(
                    RTRIM(
                      source
                    )
                  ),
                  ''
                ),
                'UNKNOWN'
              )
            )

          ORDER BY
            COUNT(*) DESC;
        `);

    const recentInvoices =
      recentResult.recordset.map(
        (invoice) => ({
          ...invoice,

          client_name:
            [
              invoice.client_first_name,
              invoice.client_last_name,
            ]
              .filter(Boolean)
              .join(" ")
              .trim() ||
            invoice.client_email ||
            "Client",

          transaction_id:
            invoice.ttn_transaction_id ||
            invoice.transaction_id ||
            null,
        }),
      );

    const actionRequired =
      actionRequiredResult.recordset.map(
        (invoice) => ({
          ...invoice,

          client_name:
            [
              invoice.client_first_name,
              invoice.client_last_name,
            ]
              .filter(Boolean)
              .join(" ")
              .trim() ||
            invoice.client_email ||
            "Client",
        }),
      );

    return res
      .status(200)
      .json({
        success:
          true,

        generated_at:
          new Date()
            .toISOString(),

        stats: {
          total:
            Number(
              rawStats.total_invoices ||
              0,
            ),

          accepted:
            Number(
              rawStats.accepted_invoices ||
              0,
            ),

          processing:
            Number(
              rawStats.processing_invoices ||
              0,
            ),

          action_required:
            Number(
              rawStats.action_required_invoices ||
              0,
            ),

          today:
            Number(
              rawStats.invoices_today ||
              0,
            ),

          active_organizations:
            Number(
              rawStats.active_organizations ||
              0,
            ),

          active_clients:
            Number(
              rawStats.active_client_users ||
              0,
            ),

          acceptance_rate:
            Number(
              rawStats.acceptance_rate ||
              0,
            ),

          average_processing_seconds:
            Number(
              rawStats.average_processing_seconds ||
              0,
            ),
        },

        pipeline,

        recent_invoices:
          recentInvoices,

        action_required:
          actionRequired,

        top_errors:
          errorsResult.recordset.map(
            (row) => ({
              error_code:
                row.error_code,

              total:
                Number(
                  row.total ||
                  0,
                ),
            }),
          ),

        sources:
          sourcesResult.recordset.map(
            (row) => ({
              source:
                row.source,

              total:
                Number(
                  row.total ||
                  0,
                ),
            }),
          ),
      });
  } catch (error) {
    console.error(
      "getAdminDashboard error:",
      error,
    );

    const statusCode =
      error.statusCode ||
      500;

    return res
      .status(statusCode)
      .json({
        success:
          false,

        errorCode:
          error.errorCode ||
          "ADMIN_DASHBOARD_FAILED",

        message:
          statusCode === 500
            ? "Impossible de charger le tableau de bord administrateur."
            : error.message,

        error:
          statusCode === 500
            ? error.message
            : undefined,
      });
  }
}

/*
|--------------------------------------------------------------------------
| GET ALL ADMIN INVOICES
|--------------------------------------------------------------------------
*/

async function getAdminInvoices(
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
            r.updated_at DESC;
        `);

    const invoices =
      result.recordset.map(
        (invoice) => ({
          ...invoice,

          client_name:
            [
              invoice.client_first_name,
              invoice.client_last_name,
            ]
              .filter(Boolean)
              .join(" ")
              .trim() ||
            invoice.client_email ||
            "Client",

          transaction_id:
            invoice.ttn_transaction_id ||
            invoice.transaction_id ||
            null,
        }),
      );

    return res
      .status(200)
      .json({
        success:
          true,

        count:
          invoices.length,

        invoices,
      });
  } catch (error) {
    console.error(
      "getAdminInvoices error:",
      error,
    );

    const statusCode =
      error.statusCode ||
      500;

    return res
      .status(statusCode)
      .json({
        success:
          false,

        errorCode:
          error.errorCode ||
          "ADMIN_INVOICES_FAILED",

        message:
          statusCode === 500
            ? "Impossible de charger les factures administrateur."
            : error.message,

        error:
          statusCode === 500
            ? error.message
            : undefined,
      });
  }
}

/*
|--------------------------------------------------------------------------
| GET ADMIN CLIENTS
|--------------------------------------------------------------------------
|
| GET /api/admin/clients
|
| A "client" on the admin portal represents an organization.
|
| For each organization we return:
|
| - organization information
| - number of CLIENT users
| - total unique invoices
| - accepted invoices
| - invoices requiring attention
| - acceptance rate
| - last activity
|
|--------------------------------------------------------------------------
*/

async function getAdminClients(
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
    | CLIENT / ORGANIZATION QUERY
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
              i.invoice_number,
              i.supplier_identifier,
              i.status,
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
          ),

          VisibleInvoices AS (
            SELECT
              id,
              organization_id,
              invoice_number,
              supplier_identifier,
              status,
              created_at,
              updated_at

            FROM RankedInvoices

            WHERE rn = 1
          ),

          InvoiceStats AS (
            SELECT
              organization_id,

              COUNT(*)
                AS total_invoices,

              SUM(
                CASE
                  WHEN
                    UPPER(
                      COALESCE(
                        status,
                        ''
                      )
                    ) = 'ACCEPTED'
                  THEN 1
                  ELSE 0
                END
              )
                AS accepted_invoices,

              SUM(
                CASE
                  WHEN
                    UPPER(
                      COALESCE(
                        status,
                        ''
                      )
                    ) IN (
                      'PENDING_REVIEW',
                      'PENDING_RETRY',
                      'REJECTED',
                      'ERROR'
                    )
                  THEN 1
                  ELSE 0
                END
              )
                AS action_required,

              MAX(
                updated_at
              )
                AS last_activity

            FROM VisibleInvoices

            GROUP BY
              organization_id
          ),

          UserStats AS (
            SELECT
              organization_id,

              COUNT(*)
                AS users_count,

              SUM(
                CASE
                  WHEN
                    UPPER(
                      COALESCE(
                        role,
                        ''
                      )
                    ) = 'CLIENT'
                    AND is_active = 1
                  THEN 1
                  ELSE 0
                END
              )
                AS active_client_users,

              MAX(
                created_at
              )
                AS last_user_created_at

            FROM dbo.users

            GROUP BY
              organization_id
          ),

          ContactUsers AS (
            SELECT
              organization_id,

              first_name,
              last_name,
              email,

              ROW_NUMBER() OVER (
                PARTITION BY
                  organization_id

                ORDER BY
                  CASE
                    WHEN
                      UPPER(
                        COALESCE(
                          role,
                          ''
                        )
                      ) = 'CLIENT'
                    THEN 0
                    ELSE 1
                  END,

                  created_at ASC
              )
                AS rn

            FROM dbo.users

            WHERE
              is_active = 1
          )

          SELECT
            o.id,

            o.id
              AS organization_id,

            o.name
              AS organization_name,

            o.tax_identifier,

            o.country_code,

            o.is_active,

            o.created_at,

            COALESCE(
              us.users_count,
              0
            )
              AS users_count,

            COALESCE(
              us.active_client_users,
              0
            )
              AS active_client_users,

            COALESCE(
              ins.total_invoices,
              0
            )
              AS total_invoices,

            COALESCE(
              ins.accepted_invoices,
              0
            )
              AS accepted_invoices,

            COALESCE(
              ins.action_required,
              0
            )
              AS action_required,

            CAST(
              CASE
                WHEN
                  COALESCE(
                    ins.total_invoices,
                    0
                  ) = 0

                THEN 0

                ELSE
                  (
                    COALESCE(
                      ins.accepted_invoices,
                      0
                    ) * 100.0
                  )
                  /
                  ins.total_invoices
              END

              AS DECIMAL(6, 2)
            )
              AS acceptance_rate,

            CASE
              WHEN
                ins.last_activity IS NULL
              THEN
                us.last_user_created_at

              WHEN
                us.last_user_created_at IS NULL
              THEN
                ins.last_activity

              WHEN
                ins.last_activity >=
                us.last_user_created_at
              THEN
                ins.last_activity

              ELSE
                us.last_user_created_at
            END
              AS last_activity,

            cu.first_name
              AS contact_first_name,

            cu.last_name
              AS contact_last_name,

            cu.email
              AS contact_email

          FROM dbo.organizations o

          LEFT JOIN InvoiceStats ins
            ON ins.organization_id =
              o.id

          LEFT JOIN UserStats us
            ON us.organization_id =
              o.id

          LEFT JOIN ContactUsers cu
            ON cu.organization_id =
              o.id

            AND cu.rn = 1

          ORDER BY
            CASE
              WHEN o.is_active = 1
              THEN 0
              ELSE 1
            END,

            CASE
              WHEN
                ins.last_activity IS NULL
              THEN
                us.last_user_created_at

              WHEN
                us.last_user_created_at IS NULL
              THEN
                ins.last_activity

              WHEN
                ins.last_activity >=
                us.last_user_created_at
              THEN
                ins.last_activity

              ELSE
                us.last_user_created_at
            END DESC,

            o.name ASC;
        `);

    /*
    |--------------------------------------------------------------------------
    | FORMAT
    |--------------------------------------------------------------------------
    */

    const clients =
      result.recordset.map(
        (organization) => {
          const totalInvoices =
            Number(
              organization.total_invoices ||
              0,
            );

          const acceptedInvoices =
            Number(
              organization.accepted_invoices ||
              0,
            );

          const actionRequired =
            Number(
              organization.action_required ||
              0,
            );

          const usersCount =
            Number(
              organization.users_count ||
              0,
            );

          const activeClientUsers =
            Number(
              organization.active_client_users ||
              0,
            );

          return {
            id:
              organization.id,

            organization_id:
              organization.organization_id,

            organization_name:
              organization.organization_name,

            name:
              organization.organization_name,

            tax_identifier:
              organization.tax_identifier ||
              null,

            country_code:
              organization.country_code ||
              null,

            is_active:
              Boolean(
                organization.is_active,
              ),

            created_at:
              organization.created_at ||
              null,

            users_count:
              usersCount,

            active_client_users:
              activeClientUsers,

            total_invoices:
              totalInvoices,

            accepted_invoices:
              acceptedInvoices,

            action_required:
              actionRequired,

            acceptance_rate:
              Number(
                organization.acceptance_rate ||
                0,
              ),

            last_activity:
              organization.last_activity ||
              null,

            contact_first_name:
              organization.contact_first_name ||
              null,

            contact_last_name:
              organization.contact_last_name ||
              null,

            contact_name:
              [
                organization.contact_first_name,
                organization.contact_last_name,
              ]
                .filter(Boolean)
                .join(" ")
                .trim() ||
              null,

            contact_email:
              organization.contact_email ||
              null,

            email:
              organization.contact_email ||
              null,
          };
        },
      );

    /*
    |--------------------------------------------------------------------------
    | GLOBAL CLIENT STATS
    |--------------------------------------------------------------------------
    */

    const stats =
      clients.reduce(
        (
          accumulator,
          client,
        ) => {
          accumulator.total +=
            1;

          if (
            client.is_active
          ) {
            accumulator.active +=
              1;
          }

          accumulator.users +=
            client.users_count;

          accumulator.active_users +=
            client.active_client_users;

          accumulator.invoices +=
            client.total_invoices;

          accumulator.accepted +=
            client.accepted_invoices;

          accumulator.action_required +=
            client.action_required;

          return accumulator;
        },
        {
          total: 0,
          active: 0,
          users: 0,
          active_users: 0,
          invoices: 0,
          accepted: 0,
          action_required: 0,
        },
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
          clients.length,

        stats,

        clients,
      });
  } catch (error) {
    console.error(
      "getAdminClients error:",
      error,
    );

    const statusCode =
      error.statusCode ||
      500;

    return res
      .status(statusCode)
      .json({
        success:
          false,

        errorCode:
          error.errorCode ||
          "ADMIN_CLIENTS_FAILED",

        message:
          statusCode === 500
            ? "Impossible de charger les clients administrateur."
            : error.message,

        error:
          statusCode === 500
            ? error.message
            : undefined,
      });
  }
}


/*
|--------------------------------------------------------------------------
| DELETE ADMIN CLIENT
|--------------------------------------------------------------------------
|
| DELETE /api/admin/clients/:id
|
|--------------------------------------------------------------------------
*/

async function deleteAdminClient(
  req,
  res,
) {
  try {
    setNoCacheHeaders(
      res,
    );

    const admin =
      getAdminUser(req);

    const organizationId =
      String(
        req.params?.id ||
          "",
      ).trim();

    if (!organizationId) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "CLIENT_ID_REQUIRED",

          message:
            "Identifiant du client manquant.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | IMPORTANT
    |--------------------------------------------------------------------------
    |
    | L'administrateur connecté a déjà été contrôlé par getAdminUser().
    |
    |--------------------------------------------------------------------------
    */

    const result =
      await deleteAdminClientService(
        organizationId,
      );

    console.info(
      "Admin client deleted:",
      {
        adminUserId:
          admin.userId,

        organizationId,

        organizationName:
          result.organization?.name,

        deleted:
          result.deleted,
      },
    );

    return res
      .status(200)
      .json({
        success:
          true,

        message:
          `Le client « ${
            result.organization?.name ||
            "Organisation"
          } » a été supprimé définitivement.`,

        client:
          result.organization,

        deleted:
          result.deleted,
      });
  } catch (error) {
    console.error(
      "deleteAdminClient error:",
      error,
    );

    const statusCode =
      error.statusCode ||
      500;

    return res
      .status(statusCode)
      .json({
        success:
          false,

        errorCode:
          error.errorCode ||
          "ADMIN_CLIENT_DELETE_FAILED",

        message:
          statusCode === 500
            ? "Impossible de supprimer définitivement ce client."
            : error.message,

        error:
          statusCode === 500
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
  getAdminDashboard,
  getAdminInvoices,
  getAdminClients,
  deleteAdminClient,
};