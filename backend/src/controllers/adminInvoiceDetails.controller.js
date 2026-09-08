const {
  sql,
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
| JSON PARSER
|--------------------------------------------------------------------------
*/

function tryParseJson(
  value,
) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value ===
    "object"
  ) {
    return value;
  }

  const text =
    String(value).trim();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(
      text,
    );
  } catch {
    return value;
  }
}

/*
|--------------------------------------------------------------------------
| SEVERITY
|--------------------------------------------------------------------------
*/

function getSeverity(
  invoice,
) {
  const status =
    String(
      invoice?.status ||
        "",
    )
      .trim()
      .toUpperCase();

  const errorCode =
    String(
      invoice?.last_error_code ||
        "",
    )
      .trim()
      .toUpperCase();

  if (
    status ===
      "ERROR" ||
    status ===
      "REJECTED"
  ) {
    return "HIGH";
  }

  if (
    errorCode.includes(
      "SIGNATURE",
    ) ||
    errorCode.includes(
      "TTN",
    ) ||
    errorCode.includes(
      "XML",
    )
  ) {
    return "HIGH";
  }

  if (
    status ===
      "PENDING_REVIEW" ||
    status ===
      "PENDING_RETRY"
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

/*
|--------------------------------------------------------------------------
| GET /api/admin/invoices/:id
|--------------------------------------------------------------------------
*/

async function getAdminInvoiceById(
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

    const invoiceId =
      String(
        req.params?.id ||
          "",
      ).trim();

    if (!invoiceId) {
      return res
        .status(400)
        .json({
          success:
            false,

          errorCode:
            "INVOICE_ID_REQUIRED",

          message:
            "Identifiant facture manquant.",
        });
    }

    const pool =
      getDatabase();

    /*
    |--------------------------------------------------------------------------
    | INVOICE
    |--------------------------------------------------------------------------
    */

    const invoiceResult =
      await pool
        .request()
        .input(
          "invoiceId",
          sql.UniqueIdentifier,
          invoiceId,
        )
        .query(`
          SELECT TOP (1)
            i.*,

            o.name
              AS organization_name,

            o.country_code
              AS organization_country,

            o.tax_identifier
              AS organization_tax_identifier,

            o.is_active
              AS organization_is_active,

            u.first_name
              AS client_first_name,

            u.last_name
              AS client_last_name,

            u.email
              AS client_email,

            u.role
              AS client_role,

            u.is_active
              AS client_is_active,

            u.auth_provider
              AS client_auth_provider,

            u.avatar_url
              AS client_avatar_url

          FROM dbo.invoices i

          LEFT JOIN dbo.organizations o
            ON o.id =
              i.organization_id

          LEFT JOIN dbo.users u
            ON u.id =
              i.client_id

          WHERE
            i.id =
              @invoiceId;
        `);

    const rawInvoice =
      invoiceResult.recordset?.[0];

    if (!rawInvoice) {
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

    /*
    |--------------------------------------------------------------------------
    | CLIENT NAME
    |--------------------------------------------------------------------------
    */

    const clientName =
      [
        rawInvoice.client_first_name,
        rawInvoice.client_last_name,
      ]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      rawInvoice.client_email ||
      "Client";

    /*
    |--------------------------------------------------------------------------
    | NORMALIZED ERROR
    |--------------------------------------------------------------------------
    */

    let errorCode =
      rawInvoice.last_error_code ||
      null;

    let errorMessage =
      rawInvoice.last_error_message ||
      rawInvoice.rejection_reason ||
      null;

    const normalizedStatus =
      String(
        rawInvoice.status ||
          "",
      )
        .trim()
        .toUpperCase();

    if (
      !errorCode &&
      normalizedStatus ===
        "PENDING_REVIEW"
    ) {
      errorCode =
        "HUMAN_REVIEW_REQUIRED";
    }

    if (
      !errorMessage &&
      normalizedStatus ===
        "PENDING_REVIEW"
    ) {
      errorMessage =
        "La facture nécessite une vérification humaine.";
    }

    if (
      !errorCode &&
      normalizedStatus ===
        "REJECTED"
    ) {
      errorCode =
        "INVOICE_REJECTED";
    }

    /*
    |--------------------------------------------------------------------------
    | RESPONSE OBJECT
    |--------------------------------------------------------------------------
    */

    const invoice = {
      ...rawInvoice,

      client_name:
        clientName,

      organization_is_active:
        Boolean(
          rawInvoice.organization_is_active,
        ),

      client_is_active:
        Boolean(
          rawInvoice.client_is_active,
        ),

      can_retry:
        Boolean(
          rawInvoice.can_retry,
        ),

      error_code:
        errorCode,

      error_message:
        errorMessage,

      severity:
        getSeverity(
          rawInvoice,
        ),

      validation_errors:
        tryParseJson(
          rawInvoice.validation_errors,
        ),

      extracted_data:
        tryParseJson(
          rawInvoice.extracted_data,
        ),

      corrected_data:
        tryParseJson(
          rawInvoice.corrected_data,
        ),

      transaction_id:
        rawInvoice.ttn_transaction_id ||
        rawInvoice.transaction_id ||
        null,
    };

    /*
    |--------------------------------------------------------------------------
    | TIMELINE
    |--------------------------------------------------------------------------
    |
    | Nous utilisons ici les informations persistées dans invoices.
    | Aucun historique fictif n'est créé.
    |
    |--------------------------------------------------------------------------
    */

    const timeline = [];

    if (
      rawInvoice.created_at
    ) {
      timeline.push({
        key:
          "CREATED",

        title:
          "Facture enregistrée",

        description:
          rawInvoice.original_filename
            ? `Fichier ${rawInvoice.original_filename} enregistré dans la plateforme.`
            : "Facture enregistrée dans la plateforme.",

        date:
          rawInvoice.created_at,

        state:
          "done",
      });
    }

    if (
      rawInvoice.updated_at
    ) {
      timeline.push({
        key:
          "CURRENT",

        title:
          `Étape actuelle : ${
            rawInvoice.current_stage ||
            "INCONNUE"
          }`,

        description:
          errorMessage ||
          `Statut actuel : ${
            rawInvoice.status ||
            "INCONNU"
          }.`,

        date:
          rawInvoice.updated_at,

        state:
          (
            normalizedStatus ===
              "ERROR" ||
            normalizedStatus ===
              "REJECTED"
          )
            ? "error"
            : normalizedStatus ===
                "PENDING_REVIEW" ||
              normalizedStatus ===
                "PENDING_RETRY"
            ? "warning"
            : "current",
      });
    }

    return res
      .status(200)
      .json({
        success:
          true,

        generated_at:
          new Date()
            .toISOString(),

        invoice,

        timeline,
      });
  } catch (error) {
    console.error(
      "getAdminInvoiceById error:",
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
          "ADMIN_INVOICE_DETAILS_FAILED",

        message:
          statusCode === 500
            ? "Impossible de charger le détail de la facture."
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
  getAdminInvoiceById,
};