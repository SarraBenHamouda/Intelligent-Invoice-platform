const {
  sql,
  getDatabase,
} = require("../config/database");

/*
|--------------------------------------------------------------------------
| HELPERS
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

function normalizeBoolean(
  value,
) {
  if (
    value === true ||
    value === 1 ||
    value === "1" ||
    String(value)
      .trim()
      .toLowerCase() ===
      "true"
  ) {
    return true;
  }

  if (
    value === false ||
    value === 0 ||
    value === "0" ||
    String(value)
      .trim()
      .toLowerCase() ===
      "false"
  ) {
    return false;
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| GET /api/admin/users
|--------------------------------------------------------------------------
|
| Retourne tous les utilisateurs de toutes les organisations.
|
|--------------------------------------------------------------------------
*/

async function getAdminUsers(
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
          SELECT
            u.id,

            u.organization_id,

            u.first_name,
            u.last_name,
            u.email,

            u.role,
            u.is_active,

            u.auth_provider,
            u.provider_id,

            u.avatar_url,

            u.created_at,

            o.name
              AS organization_name,

            o.country_code
              AS organization_country,

            o.tax_identifier
              AS organization_tax_identifier,

            o.is_active
              AS organization_is_active,

            (
              SELECT COUNT(*)

              FROM dbo.invoices i

              WHERE
                i.organization_id =
                  u.organization_id

                AND (
                  i.client_id = u.id
                  OR
                  i.created_by = u.id
                )
            )
              AS invoice_count,

            (
              SELECT COUNT(*)

              FROM dbo.invoices i

              WHERE
                i.organization_id =
                  u.organization_id

                AND (
                  i.client_id = u.id
                  OR
                  i.created_by = u.id
                )

                AND UPPER(
                  COALESCE(
                    i.status,
                    ''
                  )
                ) = 'ACCEPTED'
            )
              AS accepted_invoice_count,

            (
              SELECT
                MAX(
                  i.updated_at
                )

              FROM dbo.invoices i

              WHERE
                i.organization_id =
                  u.organization_id

                AND (
                  i.client_id = u.id
                  OR
                  i.created_by = u.id
                )
            )
              AS last_invoice_activity

          FROM dbo.users u

          LEFT JOIN dbo.organizations o
            ON o.id =
              u.organization_id

          ORDER BY
            CASE
              WHEN
                UPPER(
                  COALESCE(
                    u.role,
                    ''
                  )
                ) = 'ADMIN'
              THEN 0
              ELSE 1
            END,

            CASE
              WHEN u.is_active = 1
              THEN 0
              ELSE 1
            END,

            u.created_at DESC;
        `);

    const users =
      result.recordset.map(
        (user) => ({
          id:
            user.id,

          organization_id:
            user.organization_id ||
            null,

          organization_name:
            user.organization_name ||
            null,

          organization_country:
            user.organization_country ||
            null,

          organization_tax_identifier:
            user.organization_tax_identifier ||
            null,

          organization_is_active:
            Boolean(
              user.organization_is_active,
            ),

          first_name:
            user.first_name ||
            "",

          last_name:
            user.last_name ||
            "",

          full_name:
            [
              user.first_name,
              user.last_name,
            ]
              .filter(Boolean)
              .join(" ")
              .trim() ||
            user.email ||
            "Utilisateur",

          email:
            user.email,

          role:
            String(
              user.role ||
                "CLIENT",
            )
              .trim()
              .toUpperCase(),

          is_active:
            Boolean(
              user.is_active,
            ),

          auth_provider:
            user.auth_provider ||
            "local",

          provider_id:
            user.provider_id ||
            null,

          avatar_url:
            user.avatar_url ||
            null,

          invoice_count:
            Number(
              user.invoice_count ||
                0,
            ),

          accepted_invoice_count:
            Number(
              user.accepted_invoice_count ||
                0,
            ),

          last_invoice_activity:
            user.last_invoice_activity ||
            null,

          created_at:
            user.created_at ||
            null,
        }),
      );

    /*
    |--------------------------------------------------------------------------
    | STATS
    |--------------------------------------------------------------------------
    */

    const stats =
      users.reduce(
        (
          accumulator,
          user,
        ) => {
          accumulator.total +=
            1;

          if (
            user.is_active
          ) {
            accumulator.active +=
              1;
          } else {
            accumulator.inactive +=
              1;
          }

          if (
            user.role ===
            "ADMIN"
          ) {
            accumulator.admins +=
              1;
          }

          if (
            user.role ===
            "CLIENT"
          ) {
            accumulator.clients +=
              1;
          }

          const provider =
            String(
              user.auth_provider ||
                "local",
            )
              .trim()
              .toLowerCase();

          if (
            provider ===
            "google"
          ) {
            accumulator.google +=
              1;
          } else if (
            provider ===
            "github"
          ) {
            accumulator.github +=
              1;
          } else {
            accumulator.local +=
              1;
          }

          return accumulator;
        },
        {
          total: 0,
          active: 0,
          inactive: 0,
          admins: 0,
          clients: 0,
          google: 0,
          github: 0,
          local: 0,
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
          users.length,

        stats,

        users,
      });
  } catch (error) {
    console.error(
      "getAdminUsers error:",
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
          "ADMIN_USERS_FAILED",

        message:
          statusCode ===
          500
            ? "Impossible de charger les utilisateurs."
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
| PATCH /api/admin/users/:id/status
|--------------------------------------------------------------------------
|
| Body :
|
| {
|   "is_active": true
| }
|
| ou :
|
| {
|   "is_active": false
| }
|
|--------------------------------------------------------------------------
*/

async function updateAdminUserStatus(
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

    const userId =
      String(
        req.params?.id ||
          "",
      ).trim();

    if (!userId) {
      return res
        .status(400)
        .json({
          success:
            false,

          errorCode:
            "USER_ID_REQUIRED",

          message:
            "Identifiant utilisateur manquant.",
        });
    }

    const isActive =
      normalizeBoolean(
        req.body?.is_active,
      );

    if (
      isActive ===
      null
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          errorCode:
            "INVALID_USER_STATUS",

          message:
            "Le champ is_active doit être true ou false.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | ADMIN CANNOT DISABLE HIMSELF
    |--------------------------------------------------------------------------
    */

    if (
      String(
        admin.userId,
      ).toLowerCase() ===
        userId.toLowerCase() &&
      isActive === false
    ) {
      return res
        .status(409)
        .json({
          success:
            false,

          errorCode:
            "ADMIN_SELF_DISABLE_FORBIDDEN",

          message:
            "Vous ne pouvez pas désactiver votre propre compte administrateur.",
        });
    }

    const pool =
      getDatabase();

    /*
    |--------------------------------------------------------------------------
    | USER EXISTS?
    |--------------------------------------------------------------------------
    */

    const existingResult =
      await pool
        .request()
        .input(
          "userId",
          sql.UniqueIdentifier,
          userId,
        )
        .query(`
          SELECT TOP (1)
            id,
            organization_id,
            first_name,
            last_name,
            email,
            role,
            is_active,
            auth_provider,
            avatar_url,
            created_at

          FROM dbo.users

          WHERE id = @userId;
        `);

    const existingUser =
      existingResult.recordset?.[0];

    if (
      !existingUser
    ) {
      return res
        .status(404)
        .json({
          success:
            false,

          errorCode:
            "USER_NOT_FOUND",

          message:
            "Utilisateur introuvable.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | UPDATE
    |--------------------------------------------------------------------------
    */

    const updateResult =
      await pool
        .request()
        .input(
          "userId",
          sql.UniqueIdentifier,
          userId,
        )
        .input(
          "isActive",
          sql.Bit,
          isActive
            ? 1
            : 0,
        )
        .query(`
          UPDATE dbo.users

          SET
            is_active =
              @isActive

          OUTPUT
            INSERTED.id,
            INSERTED.organization_id,
            INSERTED.first_name,
            INSERTED.last_name,
            INSERTED.email,
            INSERTED.role,
            INSERTED.is_active,
            INSERTED.auth_provider,
            INSERTED.avatar_url,
            INSERTED.created_at

          WHERE
            id = @userId;
        `);

    const updatedUser =
      updateResult.recordset?.[0];

    return res
      .status(200)
      .json({
        success:
          true,

        message:
          isActive
            ? "Utilisateur activé."
            : "Utilisateur désactivé.",

        user: {
          ...updatedUser,

          full_name:
            [
              updatedUser?.first_name,
              updatedUser?.last_name,
            ]
              .filter(Boolean)
              .join(" ")
              .trim() ||
            updatedUser?.email ||
            "Utilisateur",

          is_active:
            Boolean(
              updatedUser?.is_active,
            ),
        },
      });
  } catch (error) {
    console.error(
      "updateAdminUserStatus error:",
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
          "ADMIN_USER_STATUS_UPDATE_FAILED",

        message:
          statusCode ===
          500
            ? "Impossible de modifier l'état de l'utilisateur."
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
  getAdminUsers,
  updateAdminUserStatus,
};