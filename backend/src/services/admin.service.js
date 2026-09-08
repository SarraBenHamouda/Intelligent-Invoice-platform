const {
  sql,
  getDatabase,
} = require("../config/database");

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function createServiceError(
  message,
  statusCode = 500,
  errorCode = "ADMIN_SERVICE_ERROR",
) {
  const error = new Error(message);

  error.statusCode = statusCode;
  error.errorCode = errorCode;

  return error;
}

function normalizeId(value) {
  return String(value || "").trim();
}

/*
|--------------------------------------------------------------------------
| CHECK UUID
|--------------------------------------------------------------------------
*/

function isValidUuid(value) {
  const normalized = normalizeId(value);

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    normalized,
  );
}

/*
|--------------------------------------------------------------------------
| GET ORGANIZATION
|--------------------------------------------------------------------------
*/

async function findOrganizationById(
  organizationId,
  transaction = null,
) {
  const id = normalizeId(organizationId);

  if (!id) {
    throw createServiceError(
      "Identifiant du client manquant.",
      400,
      "CLIENT_ID_REQUIRED",
    );
  }

  if (!isValidUuid(id)) {
    throw createServiceError(
      "Identifiant du client invalide.",
      400,
      "INVALID_CLIENT_ID",
    );
  }

  const pool = getDatabase();

  const request = transaction
    ? new sql.Request(transaction)
    : pool.request();

  const result = await request
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      id,
    )
    .query(`
      SELECT TOP (1)
        id,
        name,
        tax_identifier,
        country_code,
        is_active,
        created_at
      FROM dbo.organizations
      WHERE id = @organizationId;
    `);

  return result.recordset?.[0] || null;
}

/*
|--------------------------------------------------------------------------
| GET DELETE PREVIEW
|--------------------------------------------------------------------------
*/

async function getOrganizationDeletePreview(
  organizationId,
) {
  const organization =
    await findOrganizationById(
      organizationId,
    );

  if (!organization) {
    throw createServiceError(
      "Client introuvable.",
      404,
      "ADMIN_CLIENT_NOT_FOUND",
    );
  }

  const pool = getDatabase();

  const result = await pool
    .request()
    .input(
      "organizationId",
      sql.UniqueIdentifier,
      organizationId,
    )
    .query(`
      SELECT
        (
          SELECT COUNT(*)
          FROM dbo.users
          WHERE organization_id = @organizationId
        ) AS users_count,

        (
          SELECT COUNT(*)
          FROM dbo.invoices
          WHERE organization_id = @organizationId
        ) AS invoices_count;
    `);

  const counters =
    result.recordset?.[0] || {};

  return {
    organization,
    usersCount:
      Number(
        counters.users_count ||
          0,
      ),

    invoicesCount:
      Number(
        counters.invoices_count ||
          0,
      ),
  };
}

/*
|--------------------------------------------------------------------------
| DELETE CLIENT / ORGANIZATION
|--------------------------------------------------------------------------
|
| Important:
|
| "Client" dans ton portail Admin = organisation.
|
| Ordre:
|
| 1. Vérifier l'organisation
| 2. Supprimer les factures de l'organisation
| 3. Supprimer les utilisateurs de l'organisation
| 4. Supprimer l'organisation
|
| Tout est exécuté dans une transaction.
|
|--------------------------------------------------------------------------
*/

async function deleteAdminClient(
  organizationId,
) {
  const id =
    normalizeId(
      organizationId,
    );

  if (!id) {
    throw createServiceError(
      "Identifiant du client manquant.",
      400,
      "CLIENT_ID_REQUIRED",
    );
  }

  if (!isValidUuid(id)) {
    throw createServiceError(
      "Identifiant du client invalide.",
      400,
      "INVALID_CLIENT_ID",
    );
  }

  const pool =
    getDatabase();

  const transaction =
    new sql.Transaction(
      pool,
    );

  try {
    await transaction.begin(
      sql.ISOLATION_LEVEL.READ_COMMITTED,
    );

    /*
    |--------------------------------------------------------------------------
    | ORGANIZATION
    |--------------------------------------------------------------------------
    */

    const organizationRequest =
      new sql.Request(
        transaction,
      );

    const organizationResult =
      await organizationRequest
        .input(
          "organizationId",
          sql.UniqueIdentifier,
          id,
        )
        .query(`
          SELECT TOP (1)
            id,
            name,
            tax_identifier,
            country_code,
            is_active,
            created_at
          FROM dbo.organizations
          WHERE id = @organizationId;
        `);

    const organization =
      organizationResult
        .recordset?.[0] ||
      null;

    if (!organization) {
      throw createServiceError(
        "Ce client n'existe plus ou a déjà été supprimé.",
        404,
        "ADMIN_CLIENT_NOT_FOUND",
      );
    }

    /*
    |--------------------------------------------------------------------------
    | COUNT BEFORE DELETE
    |--------------------------------------------------------------------------
    */

    const countRequest =
      new sql.Request(
        transaction,
      );

    const countResult =
      await countRequest
        .input(
          "organizationId",
          sql.UniqueIdentifier,
          id,
        )
        .query(`
          SELECT
            (
              SELECT COUNT(*)
              FROM dbo.invoices
              WHERE organization_id = @organizationId
            ) AS invoices_count,

            (
              SELECT COUNT(*)
              FROM dbo.users
              WHERE organization_id = @organizationId
            ) AS users_count;
        `);

    const counts =
      countResult.recordset?.[0] ||
      {};

    const invoicesCount =
      Number(
        counts.invoices_count ||
          0,
      );

    const usersCount =
      Number(
        counts.users_count ||
          0,
      );

    /*
    |--------------------------------------------------------------------------
    | DELETE INVOICES
    |--------------------------------------------------------------------------
    |
    | Les factures doivent être supprimées avant les utilisateurs car
    | invoices.client_id peut référencer users.id.
    |
    |--------------------------------------------------------------------------
    */

    const invoiceDeleteRequest =
      new sql.Request(
        transaction,
      );

    const invoiceDeleteResult =
      await invoiceDeleteRequest
        .input(
          "organizationId",
          sql.UniqueIdentifier,
          id,
        )
        .query(`
          DELETE FROM dbo.invoices
          WHERE organization_id = @organizationId;
        `);

    /*
    |--------------------------------------------------------------------------
    | DELETE USERS
    |--------------------------------------------------------------------------
    */

    const userDeleteRequest =
      new sql.Request(
        transaction,
      );

    const userDeleteResult =
      await userDeleteRequest
        .input(
          "organizationId",
          sql.UniqueIdentifier,
          id,
        )
        .query(`
          DELETE FROM dbo.users
          WHERE organization_id = @organizationId;
        `);

    /*
    |--------------------------------------------------------------------------
    | DELETE ORGANIZATION
    |--------------------------------------------------------------------------
    */

    const organizationDeleteRequest =
      new sql.Request(
        transaction,
      );

    const organizationDeleteResult =
      await organizationDeleteRequest
        .input(
          "organizationId",
          sql.UniqueIdentifier,
          id,
        )
        .query(`
          DELETE FROM dbo.organizations
          WHERE id = @organizationId;
        `);

    const organizationDeleted =
      Number(
        organizationDeleteResult
          .rowsAffected?.[0] ||
          0,
      );

    if (
      organizationDeleted !==
      1
    ) {
      throw createServiceError(
        "La suppression du client n'a pas pu être confirmée.",
        409,
        "ADMIN_CLIENT_DELETE_NOT_CONFIRMED",
      );
    }

    await transaction.commit();

    return {
      organization: {
        id:
          organization.id,

        name:
          organization.name,

        tax_identifier:
          organization.tax_identifier ||
          null,

        country_code:
          organization.country_code ||
          null,
      },

      deleted: {
        organization:
          organizationDeleted,

        invoices:
          Number(
            invoiceDeleteResult
              .rowsAffected?.[0] ||
              invoicesCount ||
              0,
          ),

        users:
          Number(
            userDeleteResult
              .rowsAffected?.[0] ||
              usersCount ||
              0,
          ),
      },
    };
  } catch (error) {
    try {
      if (
        transaction._aborted !==
        true
      ) {
        await transaction.rollback();
      }
    } catch (
      rollbackError
    ) {
      console.error(
        "deleteAdminClient rollback error:",
        rollbackError,
      );
    }

    /*
    |--------------------------------------------------------------------------
    | SQL SERVER FOREIGN KEY
    |--------------------------------------------------------------------------
    */

    if (
      Number(error?.number) ===
      547
    ) {
      throw createServiceError(
        "Ce client possède encore des données liées dans la base de données. La suppression a été annulée afin d'éviter de corrompre les données.",
        409,
        "ADMIN_CLIENT_HAS_DEPENDENCIES",
      );
    }

    if (
      error.statusCode
    ) {
      throw error;
    }

    console.error(
      "deleteAdminClient service error:",
      error,
    );

    throw createServiceError(
      error?.message ||
        "Impossible de supprimer le client.",
      500,
      "ADMIN_CLIENT_DELETE_FAILED",
    );
  }
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  findOrganizationById,
  getOrganizationDeletePreview,
  deleteAdminClient,
};