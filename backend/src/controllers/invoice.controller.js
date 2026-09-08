const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");

const {
  sql,
  getDatabase,
} = require("../config/database");

const {
  sendInvoiceToN8n,
} = require("../services/n8n.service");

const {
  createNotification,
  createInvoiceNotification,
} = require("../services/notification.service");

/*
|--------------------------------------------------------------------------
| STATUTS
|--------------------------------------------------------------------------
*/

const ALLOWED_WORKFLOW_STATUSES = new Set([
  "UPLOADED",
  "PROCESSING",
  "PENDING_REVIEW",
  "VALIDATED",
  "SIGNING",
  "SIGNED",
  "SUBMITTED",
  "ACCEPTED",
  "REJECTED",
  "PENDING_RETRY",
  "ERROR",
]);

const RETRYABLE_STATUSES = new Set([
  "PENDING_RETRY",
  "REJECTED",
  "ERROR",
]);

const FINAL_WORKFLOW_STATUSES = new Set([
  "ACCEPTED",
]);

const WORKFLOW_STAGE_ORDER = Object.freeze({
  IMPORT: 1,
  EXTRACTION: 2,
  VALIDATION: 3,
  TEIF: 4,
  SIGNATURE: 5,
  TTN: 6,
});

/*
|--------------------------------------------------------------------------
| AUTH
|--------------------------------------------------------------------------
*/

function getAuthenticatedUser(req) {
  const userId =
    req.user?.id ||
    req.user?.user_id ||
    req.user?.sub;

  const organizationId =
    req.user?.organization_id ||
    req.user?.organizationId;

  if (!userId) {
    throw new Error(
      "Identifiant de l'utilisateur connecté introuvable.",
    );
  }

  if (!organizationId) {
    throw new Error(
      "Organisation de l'utilisateur connecté introuvable.",
    );
  }

  return {
    userId,
    organizationId,
  };
}

/*
|--------------------------------------------------------------------------
| NUMBER
|--------------------------------------------------------------------------
*/

function nullableNumber(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value === "number"
  ) {
    return Number.isFinite(value)
      ? value
      : null;
  }

  let normalizedValue =
    String(value)
      .trim()
      .replace(/\s/g, "")
      .replace(
        /[^\d,.\-+]/g,
        "",
      );

  if (!normalizedValue) {
    return null;
  }

  const hasComma =
    normalizedValue.includes(",");

  const hasDot =
    normalizedValue.includes(".");

  if (
    hasComma &&
    hasDot
  ) {
    const lastComma =
      normalizedValue.lastIndexOf(",");

    const lastDot =
      normalizedValue.lastIndexOf(".");

    if (
      lastComma >
      lastDot
    ) {
      normalizedValue =
        normalizedValue
          .replace(/\./g, "")
          .replace(",", ".");
    } else {
      normalizedValue =
        normalizedValue
          .replace(/,/g, "");
    }
  } else if (hasComma) {
    normalizedValue =
      normalizedValue.replace(
        ",",
        ".",
      );
  }

  const parsedValue =
    Number(normalizedValue);

  return Number.isFinite(
    parsedValue,
  )
    ? parsedValue
    : null;
}

/*
|--------------------------------------------------------------------------
| JSON
|--------------------------------------------------------------------------
*/

function nullableJson(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

/*
|--------------------------------------------------------------------------
| BOOLEAN
|--------------------------------------------------------------------------
*/

function nullableBoolean(
  value,
  fallback = false,
) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return [
    "1",
    "true",
    "yes",
  ].includes(
    String(value)
      .trim()
      .toLowerCase(),
  );
}

/*
|--------------------------------------------------------------------------
| WORKFLOW ERROR NORMALIZATION
|--------------------------------------------------------------------------
|
| n8n / microservices do not always send the same error property names.
| These helpers normalize the most common shapes so the client portal can
| always receive:
|
| - last_error_code
| - last_error_message
| - rejection_reason
| - current_stage
| - can_retry
|
|--------------------------------------------------------------------------
*/

function normalizeWorkflowText(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value === "string"
  ) {
    const trimmed =
      value.trim();

    return trimmed ||
      null;
  }

  if (
    value instanceof Error
  ) {
    return (
      value.message ||
      String(value)
    );
  }

  if (
    typeof value === "object"
  ) {
    try {
      return JSON.stringify(
        value,
      );
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function normalizeWorkflowErrorCode(
  value,
) {
  const normalized =
    normalizeWorkflowText(
      value,
    );

  if (!normalized) {
    return null;
  }

  return normalized
    .trim()
    .replace(
      /\s+/g,
      "_",
    )
    .toUpperCase()
    .slice(
      0,
      100,
    );
}

function getDefaultWorkflowErrorCode(
  status,
  stage,
) {
  const normalizedStatus =
    String(
      status ||
      "ERROR",
    )
      .trim()
      .toUpperCase();

  const normalizedStage =
    String(
      stage ||
      "WORKFLOW",
    )
      .trim()
      .toUpperCase();

  if (
    normalizedStatus ===
    "PENDING_RETRY"
  ) {
    return `${normalizedStage}_TEMPORARY_ERROR`;
  }

  if (
    normalizedStatus ===
    "REJECTED"
  ) {
    return `${normalizedStage}_REJECTED`;
  }

  return `${normalizedStage}_ERROR`;
}

function getDefaultWorkflowErrorMessage(
  status,
  stage,
) {
  const normalizedStatus =
    String(
      status ||
      "",
    )
      .trim()
      .toUpperCase();

  const normalizedStage =
    String(
      stage ||
      "",
    )
      .trim()
      .toUpperCase();

  const stageMessages = {
    IMPORT:
      "Le workflow n'a pas pu démarrer ou importer correctement la facture.",

    EXTRACTION:
      "L'extraction des données de la facture n'a pas pu être terminée.",

    VALIDATION:
      "La validation de la facture n'a pas pu être terminée.",

    TEIF:
      "La génération du document TEIF n'a pas pu être terminée.",

    SIGNATURE:
      "La signature électronique de la facture n'a pas pu être terminée.",

    TTN:
      "La transmission de la facture n'a pas pu être terminée.",
  };

  if (
    normalizedStatus ===
    "PENDING_RETRY"
  ) {
    return (
      stageMessages[
        normalizedStage
      ] ||
      "Le traitement est temporairement interrompu et peut être relancé."
    );
  }

  if (
    normalizedStatus ===
    "REJECTED"
  ) {
    return (
      stageMessages[
        normalizedStage
      ] ||
      "La facture a été rejetée pendant son traitement."
    );
  }

  return (
    stageMessages[
      normalizedStage
    ] ||
    "Le workflow s'est interrompu pendant le traitement de la facture."
  );
}

function extractWorkflowError(
  body = {},
) {
  const nestedError =
    body?.error &&
    typeof body.error ===
      "object"
      ? body.error
      : {};

  const errorDetails =
    body?.errorDetails &&
    typeof body.errorDetails ===
      "object"
      ? body.errorDetails
      : {};

  const rawErrorMessages =
    Array.isArray(
      errorDetails.rawErrorMessage,
    )
      ? errorDetails.rawErrorMessage
      : [];

  const code =
    normalizeWorkflowErrorCode(
      body?.error_code ??
      body?.errorCode ??
      body?.code ??
      nestedError?.error_code ??
      nestedError?.errorCode ??
      nestedError?.code ??
      nestedError?.name ??
      null,
    );

  const message =
    normalizeWorkflowText(
      body?.error_message ??
      body?.errorMessage ??
      body?.rejection_reason ??
      body?.reason ??
      nestedError?.error_message ??
      nestedError?.errorMessage ??
      nestedError?.message ??
      nestedError?.errorDescription ??
      body?.errorDescription ??
      rawErrorMessages?.[0] ??
      body?.message ??
      null,
    );

  return {
    code,
    message,
  };
}

/*
|--------------------------------------------------------------------------
| DATE
|--------------------------------------------------------------------------
*/

function normalizeSqlDate(value) {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const text =
    String(value).trim();

  const frenchMatch =
    text.match(
      /^(\d{2})\/(\d{2})\/(\d{4})$/,
    );

  if (frenchMatch) {
    const day =
      Number(frenchMatch[1]);

    const month =
      Number(frenchMatch[2]);

    const year =
      Number(frenchMatch[3]);

    const date =
      new Date(
        Date.UTC(
          year,
          month - 1,
          day,
        ),
      );

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    return [
      String(year).padStart(4, "0"),
      String(month).padStart(2, "0"),
      String(day).padStart(2, "0"),
    ].join("-");
  }

  const isoMatch =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})/,
    );

  if (isoMatch) {
    const year =
      Number(isoMatch[1]);

    const month =
      Number(isoMatch[2]);

    const day =
      Number(isoMatch[3]);

    const date =
      new Date(
        Date.UTC(
          year,
          month - 1,
          day,
        ),
      );

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    return [
      String(year).padStart(4, "0"),
      String(month).padStart(2, "0"),
      String(day).padStart(2, "0"),
    ].join("-");
  }

  return null;
}

/*
|--------------------------------------------------------------------------
| EXTRACTION JSON
|--------------------------------------------------------------------------
*/

function parseExtractedData(value) {
  if (!value) {
    return {};
  }

  if (
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed =
        JSON.parse(value);

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return parsed;
      }
    } catch {
      return {};
    }
  }

  return {};
}

/*
|--------------------------------------------------------------------------
| VERIFICATION TOKEN
|--------------------------------------------------------------------------
*/

function generateVerificationToken() {
  return crypto
    .randomBytes(32)
    .toString("hex");
}

/*
|--------------------------------------------------------------------------
| VERIFICATION URL
|--------------------------------------------------------------------------
*/

function buildVerificationUrl(
  verificationToken,
) {
  const frontendBaseUrl =
    "http://192.168.1.105:5173";

  return (
    `${frontendBaseUrl}/verify/` +
    `${verificationToken}`
  );
}

/*
|--------------------------------------------------------------------------
| VERIFICATION QR
|--------------------------------------------------------------------------
*/

async function generateVerificationQrBase64(
  verificationUrl,
) {
  const dataUrl =
    await QRCode.toDataURL(
      verificationUrl,
      {
        errorCorrectionLevel:
          "H",

        type:
          "image/png",

        margin:
          2,

        width:
          500,
      },
    );

  return dataUrl.replace(
    /^data:image\/png;base64,/,
    "",
  );
}

/*
|--------------------------------------------------------------------------
| UPLOAD FACTURE
|--------------------------------------------------------------------------
*/

async function uploadInvoice(req, res) {
  let createdInvoiceId =
    null;

  try {
    if (!req.file) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            "Aucun fichier reçu. Sélectionnez un PDF, PNG ou JPG.",
        });
    }

    const {
      userId,
      organizationId,
    } =
      getAuthenticatedUser(req);

    const pool =
      getDatabase();

    const sourceType =
      req.file.mimetype ===
      "application/pdf"
        ? "PDF"
        : "IMAGE";

    const insertResult =
      await pool
        .request()

        .input(
          "organization_id",
          sql.UniqueIdentifier,
          organizationId,
        )

        .input(
          "client_id",
          sql.UniqueIdentifier,
          userId,
        )

        .input(
          "created_by",
          sql.UniqueIdentifier,
          userId,
        )

        .input(
          "source_type",
          sql.NVarChar(30),
          sourceType,
        )

        .input(
          "source",
          sql.NVarChar(30),
          sourceType,
        )

        .input(
          "original_filename",
          sql.NVarChar(255),
          req.file.originalname,
        )

        .input(
          "original_file_path",
          sql.NVarChar(500),
          req.file.path,
        )

        .input(
          "status",
          sql.NVarChar(40),
          "UPLOADED",
        )

        .input(
          "current_stage",
          sql.NVarChar(50),
          "IMPORT",
        )

        .query(`
          INSERT INTO dbo.invoices (
            organization_id,
            client_id,
            created_by,

            source_type,
            source,

            original_filename,
            original_file_path,

            status,
            current_stage,
            can_retry,

            created_at,
            updated_at
          )

          OUTPUT
            INSERTED.id,
            INSERTED.invoice_number,
            INSERTED.original_filename,
            INSERTED.source_type,
            INSERTED.status,
            INSERTED.current_stage,
            INSERTED.created_at,
            INSERTED.updated_at

          VALUES (
            @organization_id,
            @client_id,
            @created_by,

            @source_type,
            @source,

            @original_filename,
            @original_file_path,

            @status,
            @current_stage,
            0,

            SYSUTCDATETIME(),
            SYSUTCDATETIME()
          );
        `);

    const createdInvoice =
      insertResult.recordset[0];

    createdInvoiceId =
      createdInvoice.id;

    await pool
      .request()

      .input(
        "invoice_id",
        sql.UniqueIdentifier,
        createdInvoice.id,
      )

      .query(`
        UPDATE dbo.invoices

        SET
          status =
            'PROCESSING',

          current_stage =
            'IMPORT',

          can_retry =
            0,

          rejection_reason =
            NULL,

          last_error_code =
            NULL,

          last_error_message =
            NULL,

          updated_at =
            SYSUTCDATETIME()

        WHERE id =
          @invoice_id;
      `);

    try {
      const workflowResponse =
        await sendInvoiceToN8n({
          filePath:
            req.file.path,

          originalName:
            req.file.originalname,

          platformInvoiceId:
            createdInvoice.id,

          userId,
          organizationId,
        });

      return res
        .status(202)
        .json({
          success: true,

          message:
            "La facture a été envoyée au workflow n8n.",

          invoice: {
            id:
              createdInvoice.id,

            original_filename:
              createdInvoice.original_filename,

            source_type:
              createdInvoice.source_type,

            status:
              "PROCESSING",

            current_stage:
              "IMPORT",

            created_at:
              createdInvoice.created_at,
          },

          workflow:
            workflowResponse,
        });
    } catch (workflowError) {
      const workflowErrorData =
        workflowError.response?.data ||
        workflowError.message;

      await pool
        .request()

        .input(
          "invoice_id",
          sql.UniqueIdentifier,
          createdInvoice.id,
        )

        .input(
          "error_code",
          sql.NVarChar(100),
          workflowError.code ||
            "N8N_START_FAILED",
        )

        .input(
          "error_message",
          sql.NVarChar(sql.MAX),
          typeof workflowErrorData ===
            "string"
            ? workflowErrorData
            : JSON.stringify(
                workflowErrorData,
              ),
        )

        .query(`
          UPDATE dbo.invoices

          SET
            status =
              CASE
                WHEN current_stage = 'IMPORT'
                THEN 'ERROR'
                ELSE status
              END,

            can_retry =
              CASE
                WHEN current_stage = 'IMPORT'
                THEN 1
                ELSE can_retry
              END,

            rejection_reason =
              CASE
                WHEN current_stage = 'IMPORT'
                THEN @error_message
                ELSE rejection_reason
              END,

            last_error_code =
              CASE
                WHEN current_stage = 'IMPORT'
                THEN @error_code
                ELSE last_error_code
              END,

            last_error_message =
              CASE
                WHEN current_stage = 'IMPORT'
                THEN @error_message
                ELSE last_error_message
              END,

            updated_at =
              SYSUTCDATETIME()

          WHERE id =
            @invoice_id;
        `);

      return res
        .status(502)
        .json({
          success: false,

          message:
            "La facture a été enregistrée, mais le workflow n8n n'a pas pu démarrer correctement.",

          invoice: {
            id:
              createdInvoice.id,
          },

          error:
            workflowErrorData,
        });
    }
  } catch (error) {
    console.error(
      "uploadInvoice error:",
      error,
    );

    return res
      .status(500)
      .json({
        success: false,

        message:
          "Une erreur est survenue pendant l'importation de la facture.",

        invoice_id:
          createdInvoiceId,

        error:
          error.message,
      });
  }
}

/*
|--------------------------------------------------------------------------
| IMPORT FACTURE DEPUIS ERP
|--------------------------------------------------------------------------
*/

async function importInvoiceFromErp(
  req,
  res,
) {
  let createdInvoiceId =
    null;

  try {
    const {
      userId,
      organizationId,
    } =
      getAuthenticatedUser(req);

    const invoiceNumber =
      String(
        req.body?.invoice_number ||
        req.body?.invoiceNumber ||
        "",
      ).trim();

    const clientCode =
      String(
        req.body?.client_code ||
        req.body?.clientCode ||
        "",
      ).trim();

    if (!invoiceNumber) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "ERP_INVOICE_NUMBER_REQUIRED",

          message:
            "Le numéro de facture ERP est obligatoire.",
        });
    }

    if (!clientCode) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "ERP_CLIENT_CODE_REQUIRED",

          message:
            "Le code client ERP est obligatoire.",
        });
    }

    const invoiceNumberPattern =
      /^[A-Za-z0-9._/-]{1,100}$/;

    const clientCodePattern =
      /^[A-Za-z0-9._/-]{1,100}$/;

    if (
      !invoiceNumberPattern.test(
        invoiceNumber,
      )
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "INVALID_ERP_INVOICE_NUMBER",

          message:
            "Le numéro de facture ERP contient des caractères non autorisés.",
        });
    }

    if (
      !clientCodePattern.test(
        clientCode,
      )
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "INVALID_ERP_CLIENT_CODE",

          message:
            "Le code client ERP contient des caractères non autorisés.",
        });
    }

    const pool =
      getDatabase();

    const existingResult =
      await pool
        .request()

        .input(
          "organization_id",
          sql.UniqueIdentifier,
          organizationId,
        )

        .input(
          "invoice_number",
          sql.NVarChar(100),
          invoiceNumber,
        )

        .query(`
          SELECT TOP 1
            id,
            invoice_number,

            source_type,
            source,

            status,
            current_stage,
            can_retry,

            ttn_reference,
            ttn_transaction_id,
            transaction_id,

            last_error_code,
            last_error_message,

            created_at,
            updated_at

          FROM dbo.invoices

          WHERE
            organization_id =
              @organization_id

            AND UPPER(
              LTRIM(
                RTRIM(
                  invoice_number
                )
              )
            ) =
            UPPER(
              LTRIM(
                RTRIM(
                  @invoice_number
                )
              )
            )

          ORDER BY
            updated_at DESC,
            created_at DESC;
        `);

    const existingInvoice =
      existingResult
        .recordset?.[0] ||
      null;

    if (
      existingInvoice &&
      String(
        existingInvoice.status ||
        "",
      )
        .trim()
        .toUpperCase() ===
        "ACCEPTED"
    ) {
      const duplicateMessage =
        `La facture ERP ${invoiceNumber} a déjà été traitée et acceptée.`;

      const originalFilename =
        `${invoiceNumber}.erp`;

      const duplicateInsertResult =
        await pool
          .request()

          .input(
            "organization_id",
            sql.UniqueIdentifier,
            organizationId,
          )

          .input(
            "client_id",
            sql.UniqueIdentifier,
            userId,
          )

          .input(
            "created_by",
            sql.UniqueIdentifier,
            userId,
          )

          .input(
            "invoice_number",
            sql.NVarChar(100),
            invoiceNumber,
          )

          .input(
            "customer_identifier",
            sql.NVarChar(100),
            clientCode,
          )

          .input(
            "source_type",
            sql.NVarChar(30),
            "ERP",
          )

          .input(
            "source",
            sql.NVarChar(30),
            "ERP",
          )

          .input(
            "original_filename",
            sql.NVarChar(255),
            originalFilename,
          )

          .input(
            "error_code",
            sql.NVarChar(100),
            "INVOICE_ALREADY_ACCEPTED",
          )

          .input(
            "error_message",
            sql.NVarChar(sql.MAX),
            duplicateMessage,
          )

          .query(`
            INSERT INTO dbo.invoices (
              organization_id,
              client_id,
              created_by,

              invoice_number,
              customer_identifier,

              source_type,
              source,

              original_filename,
              original_file_path,

              status,
              current_stage,
              can_retry,

              rejection_reason,
              last_error_code,
              last_error_message,

              created_at,
              updated_at
            )

            OUTPUT
              INSERTED.id,
              INSERTED.invoice_number,
              INSERTED.customer_identifier,
              INSERTED.source_type,
              INSERTED.source,
              INSERTED.original_filename,
              INSERTED.status,
              INSERTED.current_stage,
              INSERTED.can_retry,
              INSERTED.last_error_code,
              INSERTED.last_error_message,
              INSERTED.created_at,
              INSERTED.updated_at

            VALUES (
              @organization_id,
              @client_id,
              @created_by,

              @invoice_number,
              @customer_identifier,

              @source_type,
              @source,

              @original_filename,
              NULL,

              'ERROR',
              'VALIDATION',
              0,

              @error_message,
              @error_code,
              @error_message,

              SYSUTCDATETIME(),
              SYSUTCDATETIME()
            );
          `);

      const duplicateAttempt =
        duplicateInsertResult.recordset?.[0];

      if (!duplicateAttempt) {
        throw new Error(
          "Impossible de créer la tentative de doublon ERP.",
        );
      }

      createdInvoiceId =
        duplicateAttempt.id;

      return res
        .status(202)
        .json({
          success: true,

          duplicate_invoice:
            true,

          already_signed:
            true,

          workflow_started:
            false,

          erp_import_started:
            false,

          errorCode:
            "INVOICE_ALREADY_ACCEPTED",

          message:
            duplicateMessage,

          invoice: {
            ...duplicateAttempt,

            duplicate_invoice:
              true,

            already_signed:
              true,
          },

          existing_invoice: {
            id:
              existingInvoice.id,

            invoice_number:
              existingInvoice.invoice_number,

            source_type:
              existingInvoice.source_type,

            source:
              existingInvoice.source,

            status:
              existingInvoice.status,

            current_stage:
              existingInvoice.current_stage,

            ttn_reference:
              existingInvoice.ttn_reference,

            transaction_id:
              existingInvoice.ttn_transaction_id ||
              existingInvoice.transaction_id,

            created_at:
              existingInvoice.created_at,

            updated_at:
              existingInvoice.updated_at,
          },
        });
    }

    if (
      existingInvoice &&
      [
        "UPLOADED",
        "PROCESSING",
        "PENDING_REVIEW",
        "VALIDATED",
        "SIGNING",
        "SIGNED",
        "SUBMITTED",
      ].includes(
        String(
          existingInvoice.status ||
          "",
        )
          .trim()
          .toUpperCase(),
      )
    ) {
      return res
        .status(409)
        .json({
          success: false,

          duplicate_invoice:
            true,

          workflow_running:
            true,

          errorCode:
            "ERP_INVOICE_ALREADY_PROCESSING",

          message:
            `La facture ERP ${invoiceNumber} est déjà en cours de traitement.`,

          invoice:
            existingInvoice,
        });
    }

    if (
      existingInvoice &&
      [
        "REJECTED",
        "ERROR",
        "PENDING_RETRY",
      ].includes(
        String(
          existingInvoice.status ||
          "",
        )
          .trim()
          .toUpperCase(),
      )
    ) {
      return res
        .status(409)
        .json({
          success: false,

          duplicate_invoice:
            true,

          retry_available:
            true,

          errorCode:
            "ERP_INVOICE_RETRY_REQUIRED",

          message:
            `La facture ERP ${invoiceNumber} existe déjà avec le statut ${existingInvoice.status}. Utilisez la fonction de relance.`,

          invoice:
            existingInvoice,
        });
    }

    const originalFilename =
      `${invoiceNumber}.erp`;

    const insertResult =
      await pool
        .request()

        .input(
          "organization_id",
          sql.UniqueIdentifier,
          organizationId,
        )

        .input(
          "client_id",
          sql.UniqueIdentifier,
          userId,
        )

        .input(
          "created_by",
          sql.UniqueIdentifier,
          userId,
        )

        .input(
          "invoice_number",
          sql.NVarChar(100),
          invoiceNumber,
        )

        .input(
          "customer_identifier",
          sql.NVarChar(100),
          clientCode,
        )

        .input(
          "source_type",
          sql.NVarChar(30),
          "ERP",
        )

        .input(
          "source",
          sql.NVarChar(30),
          "ERP",
        )

        .input(
          "original_filename",
          sql.NVarChar(255),
          originalFilename,
        )

        .query(`
          INSERT INTO dbo.invoices (
            organization_id,
            client_id,
            created_by,

            invoice_number,
            customer_identifier,

            source_type,
            source,

            original_filename,
            original_file_path,

            status,
            current_stage,
            can_retry,

            created_at,
            updated_at
          )

          OUTPUT
            INSERTED.id,
            INSERTED.organization_id,
            INSERTED.client_id,

            INSERTED.invoice_number,
            INSERTED.customer_identifier,

            INSERTED.source_type,
            INSERTED.source,

            INSERTED.original_filename,

            INSERTED.status,
            INSERTED.current_stage,
            INSERTED.can_retry,

            INSERTED.created_at,
            INSERTED.updated_at

          VALUES (
            @organization_id,
            @client_id,
            @created_by,

            @invoice_number,
            @customer_identifier,

            @source_type,
            @source,

            @original_filename,
            NULL,

            'PROCESSING',
            'IMPORT',
            0,

            SYSUTCDATETIME(),
            SYSUTCDATETIME()
          );
        `);

    const createdInvoice =
      insertResult
        .recordset?.[0];

    if (!createdInvoice) {
      throw new Error(
        "La création de la facture ERP dans InvoiceFlow a échoué.",
      );
    }

    createdInvoiceId =
      createdInvoice.id;

    try {
      await createInvoiceNotification({
        organizationId,

        userId,

        invoiceId:
          createdInvoice.id,

        invoiceNumber,

        status:
          "PROCESSING",

        stage:
          "IMPORT",

        actionUrl:
          `/client/invoices/${createdInvoice.id}`,

        meta: {
          source:
            "ERP",

          source_system:
            "Divalto",

          client_code:
            clientCode,

          erp_import:
            true,
        },
      });
    } catch (
      notificationError
    ) {
      console.error(
        "[importInvoiceFromErp][notification-error]",
        notificationError.message,
      );
    }

    const n8nErpWebhookUrl =
      String(
        process.env
          .N8N_ERP_WEBHOOK_URL ||
        "http://localhost:5678/webhook/client/invoices/erp",
      ).trim();

    const workflowPayload = {
      invoice_id:
        createdInvoice.id,

      invoice_number:
        invoiceNumber,

      client_code:
        clientCode,

      source:
        "ERP",

      source_system:
        "Divalto",

      user_id:
        userId,

      organization_id:
        organizationId,
    };

    try {
      const workflowResponse =
        await fetch(
          n8nErpWebhookUrl,
          {
            method:
              "POST",

            headers: {
              Accept:
                "application/json",

              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                workflowPayload,
              ),
          },
        );

      const responseText =
        await workflowResponse.text();

      let workflowData =
        null;

      if (responseText) {
        try {
          workflowData =
            JSON.parse(
              responseText,
            );
        } catch {
          workflowData =
            responseText;
        }
      }

      if (
        !workflowResponse.ok
      ) {
        const workflowError =
          new Error(
            typeof workflowData ===
              "string"
              ? workflowData
              : workflowData
                  ?.message ||
                `Erreur n8n HTTP ${workflowResponse.status}`,
          );

        workflowError.status =
          workflowResponse.status;

        workflowError.data =
          workflowData;

        throw workflowError;
      }

      return res
        .status(202)
        .json({
          success: true,

          erp_import_started:
            true,

          message:
            `La facture ERP ${invoiceNumber} a été envoyée au workflow.`,

          invoice: {
            id:
              createdInvoice.id,

            invoice_number:
              invoiceNumber,

            client_code:
              clientCode,

            customer_identifier:
              clientCode,

            source_type:
              "ERP",

            source:
              "ERP",

            source_system:
              "Divalto",

            original_filename:
              originalFilename,

            status:
              "PROCESSING",

            current_stage:
              "IMPORT",

            can_retry:
              false,

            created_at:
              createdInvoice.created_at,
          },

          workflow: {
            started:
              true,

            url:
              n8nErpWebhookUrl,

            response:
              workflowData,
          },
        });
    } catch (
      workflowError
    ) {
      const workflowErrorData =
        workflowError.data ||
        workflowError.message ||
        "Impossible de démarrer le workflow ERP.";

      const errorMessage =
        typeof workflowErrorData ===
          "string"
          ? workflowErrorData
          : JSON.stringify(
              workflowErrorData,
            );

      await pool
        .request()

        .input(
          "invoice_id",
          sql.UniqueIdentifier,
          createdInvoice.id,
        )

        .input(
          "error_code",
          sql.NVarChar(100),
          "N8N_ERP_START_FAILED",
        )

        .input(
          "error_message",
          sql.NVarChar(sql.MAX),
          errorMessage,
        )

        .query(`
          UPDATE dbo.invoices

          SET
            status =
              'ERROR',

            current_stage =
              'IMPORT',

            can_retry =
              1,

            rejection_reason =
              @error_message,

            last_error_code =
              @error_code,

            last_error_message =
              @error_message,

            updated_at =
              SYSUTCDATETIME()

          WHERE id =
            @invoice_id;
        `);

      try {
        await createInvoiceNotification({
          organizationId,

          userId,

          invoiceId:
            createdInvoice.id,

          invoiceNumber,

          status:
            "ERROR",

          stage:
            "IMPORT",

          errorCode:
            "N8N_ERP_START_FAILED",

          errorMessage,

          actionUrl:
            `/client/invoices/${createdInvoice.id}`,

          meta: {
            source:
              "ERP",

            source_system:
              "Divalto",

            client_code:
              clientCode,

            n8n_start_failed:
              true,
          },
        });
      } catch (
        notificationError
      ) {
        console.error(
          "[importInvoiceFromErp][error-notification]",
          notificationError.message,
        );
      }

      return res
        .status(502)
        .json({
          success: false,

          erp_import_started:
            false,

          errorCode:
            "N8N_ERP_START_FAILED",

          message:
            "La facture ERP a été créée dans le portail, mais n8n n'a pas pu démarrer le workflow.",

          invoice: {
            id:
              createdInvoice.id,

            invoice_number:
              invoiceNumber,

            client_code:
              clientCode,

            status:
              "ERROR",

            current_stage:
              "IMPORT",

            can_retry:
              true,
          },

          error:
            workflowErrorData,
        });
    }
  } catch (error) {
    console.error(
      "importInvoiceFromErp error:",
      error,
    );

    if (
      error.code ===
      "EPARAM"
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "ERP_IMPORT_INVALID_PARAMETER",

          message:
            "Une donnée envoyée pour l'import ERP est invalide.",

          invoice_id:
            createdInvoiceId,

          error:
            error.message,
        });
    }

    return res
      .status(500)
      .json({
        success: false,

        errorCode:
          "ERP_IMPORT_FAILED",

        message:
          "Impossible d'importer la facture depuis l'ERP.",

        invoice_id:
          createdInvoiceId,

        error:
          error.message,
      });
  }
}

/*
|--------------------------------------------------------------------------
| LISTE FACTURES
|--------------------------------------------------------------------------
*/

async function getInvoices(req, res) {
  try {
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

    const {
      organizationId,
    } =
      getAuthenticatedUser(req);

    const pool =
      getDatabase();

    const result =
      await pool
        .request()

        .input(
          "organization_id",
          sql.UniqueIdentifier,
          organizationId,
        )

        .query(`
          ;WITH RankedInvoices AS (
            SELECT
              id,
              organization_id,
              client_id,
              created_by,

              invoice_number,
              supplier_identifier,
              customer_identifier,

              source_type,
              source,

              original_filename,
              original_file_path,

              invoice_date,
              currency,

              total_ht,
              total_tva,
              total_ttc,
              total_amount,

              status,
              current_stage,
              can_retry,

              validation_errors,

              signed_xml_path,
              qr_code_path,

              ttn_reference,
              ttn_transaction_id,
              transaction_id,

              verification_token,
              verification_created_at,

              rejection_reason,
              last_error_code,
              last_error_message,

              created_at,
              updated_at,

              ROW_NUMBER() OVER (
                PARTITION BY
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

            WHERE
              organization_id =
                @organization_id
          )

          SELECT
            id,
            organization_id,
            client_id,
            created_by,

            invoice_number,
            supplier_identifier,
            customer_identifier,

            source_type,
            source,

            original_filename,
            original_file_path,

            invoice_date,
            currency,

            total_ht,
            total_tva,
            total_ttc,
            total_amount,

            status,
            current_stage,
            can_retry,

            validation_errors,

            signed_xml_path,
            qr_code_path,

            ttn_reference,
            ttn_transaction_id,
            transaction_id,

            verification_token,
            verification_created_at,

            rejection_reason,
            last_error_code,
            last_error_message,

            created_at,
            updated_at

          FROM RankedInvoices

          WHERE rn = 1

          ORDER BY
            updated_at DESC;
        `);

    return res
      .status(200)
      .json({
        success: true,

        count:
          result.recordset.length,

        invoices:
          result.recordset,
      });
  } catch (error) {
    console.error(
      "getInvoices error:",
      error,
    );

    return res
      .status(500)
      .json({
        success: false,

        message:
          "Impossible de charger les factures.",

        error:
          error.message,
      });
  }
}
/*
|--------------------------------------------------------------------------
| DÉTAIL FACTURE
|--------------------------------------------------------------------------
*/

async function getInvoiceById(
  req,
  res,
) {
  try {
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

    const {
      organizationId,
    } =
      getAuthenticatedUser(req);

    const invoiceId =
      req.params.id;

    const pool =
      getDatabase();

    const result =
      await pool
        .request()

        .input(
          "invoice_id",
          sql.UniqueIdentifier,
          invoiceId,
        )

        .input(
          "organization_id",
          sql.UniqueIdentifier,
          organizationId,
        )

        .query(`
          SELECT
            id,
            organization_id,
            client_id,
            created_by,

            invoice_number,
            supplier_identifier,
            customer_identifier,

            source_type,
            source,

            original_filename,
            original_file_path,

            invoice_date,
            currency,

            total_ht,
            total_tva,
            total_ttc,
            total_amount,

            status,
            current_stage,
            can_retry,

            extracted_data,
            validation_errors,

            signed_xml_path,

            qr_code_path,
            qr_code_base64,

            ttn_reference,
            ttn_transaction_id,
            transaction_id,

            verification_token,
            verification_created_at,

            rejection_reason,
            last_error_code,
            last_error_message,

            created_at,
            updated_at

          FROM dbo.invoices

          WHERE
            id =
              @invoice_id

            AND organization_id =
              @organization_id;
        `);

    if (
      result.recordset.length === 0
    ) {
      return res
        .status(404)
        .json({
          success: false,

          message:
            "Facture introuvable.",
        });
    }

    const invoice =
      result.recordset[0];

    /*
    |--------------------------------------------------------------------------
    | INFORMATIONS DE DOUBLON POUR LE FRONTEND
    |--------------------------------------------------------------------------
    */

    const invoiceErrorCode =
      String(
        invoice.last_error_code ||
        "",
      )
        .trim()
        .toUpperCase();

    const duplicateInvoice =
      invoiceErrorCode ===
        "INVOICE_ALREADY_ACCEPTED" ||
      invoiceErrorCode ===
        "DUPLICATE_INVOICE";

    let existingDuplicateInvoice =
      null;

    if (
      duplicateInvoice &&
      invoice.invoice_number
    ) {
      const duplicateResult =
        await pool
          .request()

          .input(
            "organization_id",
            sql.UniqueIdentifier,
            organizationId,
          )

          .input(
            "current_invoice_id",
            sql.UniqueIdentifier,
            invoice.id,
          )

          .input(
            "invoice_number",
            sql.NVarChar(100),
            invoice.invoice_number,
          )

          .query(`
            SELECT TOP 1
              id,
              invoice_number,

              source_type,
              source,

              status,
              current_stage,

              ttn_reference,
              ttn_transaction_id,
              transaction_id,

              verification_token,
              verification_created_at,

              created_at,
              updated_at

            FROM dbo.invoices

            WHERE
              organization_id =
                @organization_id

              AND id <>
                @current_invoice_id

              AND UPPER(
                LTRIM(
                  RTRIM(
                    invoice_number
                  )
                )
              ) =
              UPPER(
                LTRIM(
                  RTRIM(
                    @invoice_number
                  )
                )
              )

              AND status =
                'ACCEPTED'

            ORDER BY
              updated_at DESC,
              created_at DESC;
          `);

      existingDuplicateInvoice =
        duplicateResult.recordset?.[0] ||
        null;
    }

    return res
      .status(200)
      .json({
        success: true,

        invoice: {
          ...invoice,

          xml_available:
            Boolean(
              invoice.signed_xml_path,
            ),

          duplicate_invoice:
            duplicateInvoice,

          already_signed:
            Boolean(
              duplicateInvoice &&
              existingDuplicateInvoice,
            ),

          duplicate_message:
            duplicateInvoice
              ? invoice.last_error_message ||
                `La facture ${invoice.invoice_number} a déjà été traitée.`
              : null,

          existing_invoice:
            existingDuplicateInvoice
              ? {
                  id:
                    existingDuplicateInvoice.id,

                  invoice_number:
                    existingDuplicateInvoice.invoice_number,

                  source_type:
                    existingDuplicateInvoice.source_type,

                  source:
                    existingDuplicateInvoice.source,

                  status:
                    existingDuplicateInvoice.status,

                  current_stage:
                    existingDuplicateInvoice.current_stage,

                  ttn_reference:
                    existingDuplicateInvoice.ttn_reference,

                  transaction_id:
                    existingDuplicateInvoice.ttn_transaction_id ||
                    existingDuplicateInvoice.transaction_id,

                  verification_token:
                    existingDuplicateInvoice.verification_token,

                  verification_created_at:
                    existingDuplicateInvoice.verification_created_at,

                  created_at:
                    existingDuplicateInvoice.created_at,

                  updated_at:
                    existingDuplicateInvoice.updated_at,
                }
              : null,

          verification_url:
            invoice.verification_token
              ? buildVerificationUrl(
                  invoice.verification_token,
                )
              : null,
        },
      });
  } catch (error) {
    console.error(
      "getInvoiceById error:",
      error,
    );

    if (
      error.code ===
        "EPARAM"
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "INVALID_INVOICE_ID",

          message:
            "L'identifiant de la facture est invalide.",

          error:
            error.message,
        });
    }

    return res
      .status(500)
      .json({
        success: false,

        message:
          "Impossible de charger la facture.",

        error:
          error.message,
      });
  }
}

/*
|--------------------------------------------------------------------------
| MODIFICATION MANUELLE
|--------------------------------------------------------------------------
*/

async function updateInvoiceById(
  req,
  res,
) {
  try {
    const {
      organizationId,
    } =
      getAuthenticatedUser(req);

    const invoiceId =
      req.params.id;

    if (!invoiceId) {
      return res
        .status(400)
        .json({
          success: false,

          message:
            "Identifiant facture manquant.",
        });
    }

    const pool =
      getDatabase();

    /*
    |--------------------------------------------------------------------------
    | FACTURE ACTUELLE
    |--------------------------------------------------------------------------
    */

    const existingResult =
      await pool
        .request()

        .input(
          "invoice_id",
          sql.UniqueIdentifier,
          invoiceId,
        )

        .input(
          "organization_id",
          sql.UniqueIdentifier,
          organizationId,
        )

        .query(`
          SELECT TOP 1
            id,
            organization_id,
            client_id,
            created_by,

            invoice_number,
            status,
            current_stage,

            extracted_data,

            signed_xml_path,
            qr_code_path,
            qr_code_base64,

            ttn_reference,
            ttn_transaction_id,
            transaction_id,

            verification_token,
            verification_created_at

          FROM dbo.invoices

          WHERE
            id =
              @invoice_id

            AND organization_id =
              @organization_id;
        `);

    if (
      existingResult.recordset.length ===
      0
    ) {
      return res
        .status(404)
        .json({
          success: false,

          message:
            "Facture introuvable.",
        });
    }

    const existingInvoice =
      existingResult.recordset[0];

    const existingStatus =
      String(
        existingInvoice.status ||
        "",
      )
        .trim()
        .toUpperCase();

    const metadataOnly =
      nullableBoolean(
        req.body?.metadata_only,
        false,
      );

    /*
    |--------------------------------------------------------------------------
    | ACCEPTED :
    | MODIFICATION DES INFORMATIONS COMPLÉMENTAIRES UNIQUEMENT
    |--------------------------------------------------------------------------
    */

    if (
      existingStatus ===
        "ACCEPTED" &&
      metadataOnly
    ) {
      let extractedData =
        req.body?.extracted_data;

      if (
        extractedData ===
        undefined
      ) {
        extractedData =
          parseExtractedData(
            existingInvoice.extracted_data,
          );
      }

      if (
        !extractedData ||
        typeof extractedData !==
          "object" ||
        Array.isArray(
          extractedData,
        )
      ) {
        return res
          .status(400)
          .json({
            success: false,

            errorCode:
              "INVALID_EXTRACTED_DATA",

            message:
              "extracted_data doit être un objet JSON.",
          });
      }

      const supplier =
        extractedData.fournisseur ||
        {};

      const customer =
        extractedData.client ||
        {};

      const supplierIdentifier =
        String(
          req.body?.supplier_identifier ??
            supplier.identifiant ??
            "",
        ).trim() ||
        null;

      const customerIdentifier =
        String(
          req.body?.customer_identifier ??
            customer.identifiant ??
            customer.code_client ??
            "",
        ).trim() ||
        null;

      const result =
        await pool
          .request()

          .input(
            "invoice_id",
            sql.UniqueIdentifier,
            invoiceId,
          )

          .input(
            "organization_id",
            sql.UniqueIdentifier,
            organizationId,
          )

          .input(
            "supplier_identifier",
            sql.NVarChar(100),
            supplierIdentifier,
          )

          .input(
            "customer_identifier",
            sql.NVarChar(100),
            customerIdentifier,
          )

          .input(
            "extracted_data",
            sql.NVarChar(sql.MAX),
            JSON.stringify(
              extractedData,
            ),
          )

          .query(`
            UPDATE dbo.invoices

            SET
              supplier_identifier =
                COALESCE(
                  @supplier_identifier,
                  supplier_identifier
                ),

              customer_identifier =
                COALESCE(
                  @customer_identifier,
                  customer_identifier
                ),

              extracted_data =
                @extracted_data,

              updated_at =
                SYSUTCDATETIME()

            OUTPUT
              INSERTED.id,
              INSERTED.organization_id,
              INSERTED.client_id,

              INSERTED.invoice_number,
              INSERTED.supplier_identifier,
              INSERTED.customer_identifier,

              INSERTED.status,
              INSERTED.current_stage,

              INSERTED.extracted_data,

              INSERTED.signed_xml_path,

              INSERTED.qr_code_path,
              INSERTED.qr_code_base64,

              INSERTED.ttn_reference,
              INSERTED.ttn_transaction_id,
              INSERTED.transaction_id,

              INSERTED.verification_token,
              INSERTED.verification_created_at,

              INSERTED.updated_at

            WHERE
              id =
                @invoice_id

              AND organization_id =
                @organization_id;
          `);

      if (
        result.recordset.length ===
        0
      ) {
        return res
          .status(404)
          .json({
            success: false,

            message:
              "Facture introuvable.",
          });
      }

      return res
        .status(200)
        .json({
          success: true,

          metadata_only:
            true,

          requires_revalidation:
            false,

          message:
            "Les informations complémentaires ont été enregistrées. Le statut ACCEPTED, la signature, le QR code et les références TTN restent inchangés.",

          invoice:
            result.recordset[0],
        });
    }

    /*
    |--------------------------------------------------------------------------
    | FACTURE VERROUILLÉE
    |--------------------------------------------------------------------------
    */

    if (
      [
        "SIGNED",
        "SUBMITTED",
        "ACCEPTED",
      ].includes(
        existingStatus,
      )
    ) {
      return res
        .status(409)
        .json({
          success: false,

          errorCode:
            "INVOICE_LOCKED",

          message:
            "Cette facture ne peut plus être modifiée car elle a déjà été signée ou transmise.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | EXTRACTION DATA
    |--------------------------------------------------------------------------
    */

    let extractedData =
      req.body?.extracted_data;

    if (
      extractedData ===
      undefined
    ) {
      extractedData =
        parseExtractedData(
          existingInvoice.extracted_data,
        );
    }

    if (
      !extractedData ||
      typeof extractedData !==
        "object" ||
      Array.isArray(
        extractedData,
      )
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "INVALID_EXTRACTED_DATA",

          message:
            "extracted_data doit être un objet JSON.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | DONNÉES
    |--------------------------------------------------------------------------
    */

    const documentData =
      extractedData.document ||
      {};

    const supplier =
      extractedData.fournisseur ||
      {};

    const customer =
      extractedData.client ||
      {};

    const invoiceData =
      extractedData.facture ||
      {};

    const totals =
      extractedData.totaux ||
      {};

    /*
    |--------------------------------------------------------------------------
    | NUMÉRO
    |--------------------------------------------------------------------------
    */

    const invoiceNumber =
      String(
        req.body?.invoice_number ??
          invoiceData.numero ??
          documentData.numero ??
          "",
      ).trim() ||
      null;

    /*
    |--------------------------------------------------------------------------
    | DEVISE
    |--------------------------------------------------------------------------
    */

    const currency =
      String(
        req.body?.currency ??
          documentData.devise ??
          "",
      )
        .trim()
        .toUpperCase() ||
      null;

    /*
    |--------------------------------------------------------------------------
    | FOURNISSEUR
    |--------------------------------------------------------------------------
    */

    const supplierIdentifier =
      String(
        req.body?.supplier_identifier ??
          supplier.identifiant ??
          "",
      ).trim() ||
      null;

    /*
    |--------------------------------------------------------------------------
    | CLIENT
    |--------------------------------------------------------------------------
    */

    const customerIdentifier =
      String(
        req.body?.customer_identifier ??
          customer.identifiant ??
          customer.code_client ??
          "",
      ).trim() ||
      null;

    /*
    |--------------------------------------------------------------------------
    | DATE
    |--------------------------------------------------------------------------
    */

    const rawInvoiceDate =
      req.body?.invoice_date ??
      invoiceData.date_facture ??
      documentData.date ??
      null;

    const invoiceDate =
      normalizeSqlDate(
        rawInvoiceDate,
      );

    if (
      rawInvoiceDate &&
      !invoiceDate
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "INVALID_INVOICE_DATE",

          message:
            `Date de facture invalide : ${rawInvoiceDate}. Format attendu : JJ/MM/AAAA ou AAAA-MM-JJ.`,
        });
    }

    /*
    |--------------------------------------------------------------------------
    | TOTAUX
    |--------------------------------------------------------------------------
    */

    const totalHt =
      nullableNumber(
        req.body?.total_ht ??
          totals.total_ht,
      );

    const totalTva =
      nullableNumber(
        req.body?.total_tva ??
          totals.montant_tva ??
          totals.total_tva,
      );

    const totalTtc =
      nullableNumber(
        req.body?.total_ttc ??
          totals.total_ttc ??
          totals.net_a_payer,
      );

    /*
    |--------------------------------------------------------------------------
    | APRÈS MODIFICATION :
    | RETOUR À VALIDATION
    |--------------------------------------------------------------------------
    */

    const finalStatus =
      "PENDING_REVIEW";

    const finalStage =
      "VALIDATION";

    /*
    |--------------------------------------------------------------------------
    | UPDATE
    |--------------------------------------------------------------------------
    */

    const result =
      await pool
        .request()

        .input(
          "invoice_id",
          sql.UniqueIdentifier,
          invoiceId,
        )

        .input(
          "organization_id",
          sql.UniqueIdentifier,
          organizationId,
        )

        .input(
          "invoice_number",
          sql.NVarChar(100),
          invoiceNumber,
        )

        .input(
          "supplier_identifier",
          sql.NVarChar(100),
          supplierIdentifier,
        )

        .input(
          "customer_identifier",
          sql.NVarChar(100),
          customerIdentifier,
        )

        .input(
          "invoice_date",
          sql.NVarChar(10),
          invoiceDate,
        )

        .input(
          "currency",
          sql.NVarChar(10),
          currency,
        )

        .input(
          "total_ht",
          sql.Decimal(18, 3),
          totalHt,
        )

        .input(
          "total_tva",
          sql.Decimal(18, 3),
          totalTva,
        )

        .input(
          "total_ttc",
          sql.Decimal(18, 3),
          totalTtc,
        )

        .input(
          "extracted_data",
          sql.NVarChar(sql.MAX),
          JSON.stringify(
            extractedData,
          ),
        )

        .input(
          "status",
          sql.NVarChar(40),
          finalStatus,
        )

        .input(
          "current_stage",
          sql.NVarChar(50),
          finalStage,
        )

        .query(`
          UPDATE dbo.invoices

          SET
            invoice_number =
              @invoice_number,

            supplier_identifier =
              @supplier_identifier,

            customer_identifier =
              @customer_identifier,

            invoice_date =
              CASE
                WHEN @invoice_date IS NULL
                THEN NULL

                ELSE
                  CONVERT(
                    date,
                    @invoice_date,
                    23
                  )
              END,

            currency =
              @currency,

            total_ht =
              @total_ht,

            total_tva =
              @total_tva,

            total_ttc =
              @total_ttc,

            total_amount =
              @total_ttc,

            extracted_data =
              @extracted_data,

            status =
              @status,

            current_stage =
              @current_stage,

            can_retry =
              0,

            validation_errors =
              NULL,

            rejection_reason =
              NULL,

            last_error_code =
              NULL,

            last_error_message =
              NULL,

            signed_xml_path =
              NULL,

            qr_code_path =
              NULL,

            qr_code_base64 =
              NULL,

            verification_token =
              NULL,

            verification_created_at =
              NULL,

            ttn_reference =
              NULL,

            ttn_transaction_id =
              NULL,

            transaction_id =
              NULL,

            updated_at =
              SYSUTCDATETIME()

          OUTPUT
            INSERTED.id,
            INSERTED.organization_id,
            INSERTED.client_id,

            INSERTED.invoice_number,
            INSERTED.supplier_identifier,
            INSERTED.customer_identifier,

            INSERTED.invoice_date,
            INSERTED.currency,

            INSERTED.total_ht,
            INSERTED.total_tva,
            INSERTED.total_ttc,
            INSERTED.total_amount,

            INSERTED.status,
            INSERTED.current_stage,
            INSERTED.can_retry,

            INSERTED.extracted_data,

            INSERTED.updated_at

          WHERE
            id =
              @invoice_id

            AND organization_id =
              @organization_id;
        `);

    if (
      result.recordset.length ===
      0
    ) {
      return res
        .status(404)
        .json({
          success: false,

          message:
            "Facture introuvable.",
        });
    }

    return res
      .status(200)
      .json({
        success: true,

        message:
          "Les données de la facture ont été modifiées. Une nouvelle validation est maintenant nécessaire.",

        requires_revalidation:
          true,

        invoice:
          result.recordset[0],
      });
  } catch (error) {
    console.error(
      "updateInvoiceById error:",
      error,
    );

    if (
      error.code ===
        "EPARAM"
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "INVALID_UPDATE_PARAMETER",

          message:
            "Une donnée envoyée pour la facture est invalide.",

          error:
            error.message,
        });
    }

    return res
      .status(500)
      .json({
        success: false,

        message:
          "Impossible de modifier la facture.",

        error:
          error.message,
      });
  }
}

/*
|--------------------------------------------------------------------------
| CORRECTION HUMAINE + REPRISE N8N
|--------------------------------------------------------------------------
|
| Route associée :
|
| POST /api/invoices/:id/human-correction
|
| Body attendu :
|
| {
|   "corrections": {
|     "document.numero": "AC_250001"
|   }
| }
|
| Cette route ne relance PAS OCR / Extraction.
| Elle reprend le traitement depuis la correction / revalidation.
|
|--------------------------------------------------------------------------
*/

async function humanCorrectionInvoice(
  req,
  res,
) {
  try {
    const {
      organizationId,
    } =
      getAuthenticatedUser(req);

    const invoiceId =
      String(
        req.params?.id ||
        "",
      ).trim();

    if (!invoiceId) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "INVOICE_ID_REQUIRED",

          message:
            "Identifiant facture manquant.",
        });
    }

    let corrections =
      req.body?.corrections ??
      req.body?.corrections_json ??
      null;

    if (
      typeof corrections ===
      "string"
    ) {
      try {
        corrections =
          JSON.parse(
            corrections,
          );
      } catch {
        return res
          .status(400)
          .json({
            success: false,

            errorCode:
              "INVALID_CORRECTIONS_JSON",

            message:
              "Le JSON des corrections est invalide.",
          });
      }
    }

    if (
      !corrections ||
      typeof corrections !==
        "object" ||
      Array.isArray(
        corrections,
      ) ||
      Object.keys(
        corrections,
      ).length === 0
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "CORRECTIONS_REQUIRED",

          message:
            "Aucune correction n'a été envoyée.",
        });
    }

    const pool =
      getDatabase();

    const existingResult =
      await pool
        .request()

        .input(
          "invoice_id",
          sql.UniqueIdentifier,
          invoiceId,
        )

        .input(
          "organization_id",
          sql.UniqueIdentifier,
          organizationId,
        )

        .query(`
          SELECT TOP 1
            id,
            organization_id,
            client_id,
            created_by,
            invoice_number,
            status,
            current_stage,
            extracted_data

          FROM dbo.invoices

          WHERE
            id = @invoice_id

            AND organization_id =
              @organization_id;
        `);

    if (
      existingResult.recordset.length ===
      0
    ) {
      return res
        .status(404)
        .json({
          success: false,

          errorCode:
            "INVOICE_NOT_FOUND",

          message:
            "Facture introuvable.",
        });
    }

    const existingInvoice =
      existingResult.recordset[0];

    const existingStatus =
      String(
        existingInvoice.status ||
        "",
      )
        .trim()
        .toUpperCase();

    const existingStage =
      String(
        existingInvoice.current_stage ||
        "",
      )
        .trim()
        .toUpperCase();

    if (
      existingStatus !==
      "PENDING_REVIEW"
    ) {
      return res
        .status(409)
        .json({
          success: false,

          errorCode:
            "HUMAN_CORRECTION_NOT_ALLOWED",

          message:
            `La facture doit être en PENDING_REVIEW pour être corrigée. Statut actuel : ${existingStatus}.`,
        });
    }

    if (
      existingStage !==
      "VALIDATION"
    ) {
      return res
        .status(409)
        .json({
          success: false,

          errorCode:
            "INVALID_HUMAN_CORRECTION_STAGE",

          message:
            `La correction humaine est attendue à l'étape VALIDATION, pas ${existingStage || "INCONNUE"}.`,
        });
    }

    const workingData =
      parseExtractedData(
        existingInvoice.extracted_data,
      );

    if (
      !workingData ||
      typeof workingData !==
        "object" ||
      Array.isArray(
        workingData,
      ) ||
      Object.keys(
        workingData,
      ).length === 0
    ) {
      return res
        .status(409)
        .json({
          success: false,

          errorCode:
            "EXTRACTED_DATA_NOT_AVAILABLE",

          message:
            "L'extraction de la facture n'est pas disponible.",
        });
    }

    function setCorrectionByPath(
      target,
      fieldPath,
      value,
    ) {
      const parts =
        String(fieldPath)
          .replace(
            /\[(\d+)\]/g,
            ".$1",
          )
          .split(".")
          .filter(Boolean);

      if (!parts.length) {
        return;
      }

      let current =
        target;

      for (
        let index = 0;
        index < parts.length - 1;
        index++
      ) {
        const part =
          parts[index];

        const nextPart =
          parts[index + 1];

        const nextIsArrayIndex =
          /^\d+$/.test(
            nextPart,
          );

        if (
          current[part] ===
            undefined ||
          current[part] ===
            null ||
          typeof current[part] !==
            "object"
        ) {
          current[part] =
            nextIsArrayIndex
              ? []
              : {};
        }

        current =
          current[part];
      }

      current[
        parts[
          parts.length - 1
        ]
      ] = value;
    }

    for (
      const [
        field,
        value,
      ] of Object.entries(
        corrections,
      )
    ) {
      setCorrectionByPath(
        workingData,
        field,
        value,
      );
    }

    const correctedInvoiceNumber =
      String(
        workingData.facture
          ?.numero ??
        workingData.document
          ?.numero ??
        "",
      ).trim();

    if (
      correctedInvoiceNumber
    ) {
      workingData.document =
        workingData.document ||
        {};

      workingData.facture =
        workingData.facture ||
        {};

      workingData.document.numero =
        correctedInvoiceNumber;

      workingData.facture.numero =
        correctedInvoiceNumber;
    }

    if (
      workingData
        .controle_validation
    ) {
      delete workingData
        .controle_validation;
    }

    const documentData =
      workingData.document ||
      {};

    const supplier =
      workingData.fournisseur ||
      {};

    const customer =
      workingData.client ||
      {};

    const invoiceData =
      workingData.facture ||
      {};

    const totals =
      workingData.totaux ||
      {};

    const invoiceNumber =
      String(
        invoiceData.numero ??
        documentData.numero ??
        existingInvoice
          .invoice_number ??
        "",
      ).trim() ||
      null;

    const supplierIdentifier =
      String(
        supplier.identifiant ??
        supplier
          .matricule_fiscal_ou_tva ??
        "",
      ).trim() ||
      null;

    const customerIdentifier =
      String(
        customer.code_client ??
        customer.identifiant ??
        customer
          .matricule_fiscal_ou_tva ??
        "",
      ).trim() ||
      null;

    const currency =
      String(
        documentData.devise ??
        "",
      )
        .trim()
        .toUpperCase() ||
      null;

    const rawInvoiceDate =
      invoiceData
        .date_facture ??
      documentData.date ??
      null;

    const invoiceDate =
      normalizeSqlDate(
        rawInvoiceDate,
      );

    if (
      rawInvoiceDate &&
      !invoiceDate
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "INVALID_INVOICE_DATE",

          message:
            `Date de facture invalide : ${rawInvoiceDate}.`,
        });
    }

    const totalHt =
      nullableNumber(
        totals.total_ht,
      );

    const totalTva =
      nullableNumber(
        totals.montant_tva ??
        totals.total_tva,
      );

    const totalTtc =
      nullableNumber(
        totals.total_ttc ??
        totals.net_a_payer,
      );

    const result =
      await pool
        .request()

        .input(
          "invoice_id",
          sql.UniqueIdentifier,
          invoiceId,
        )

        .input(
          "organization_id",
          sql.UniqueIdentifier,
          organizationId,
        )

        .input(
          "invoice_number",
          sql.NVarChar(100),
          invoiceNumber,
        )

        .input(
          "supplier_identifier",
          sql.NVarChar(100),
          supplierIdentifier,
        )

        .input(
          "customer_identifier",
          sql.NVarChar(100),
          customerIdentifier,
        )

        .input(
          "invoice_date",
          sql.NVarChar(10),
          invoiceDate,
        )

        .input(
          "currency",
          sql.NVarChar(10),
          currency,
        )

        .input(
          "total_ht",
          sql.Decimal(18, 3),
          totalHt,
        )

        .input(
          "total_tva",
          sql.Decimal(18, 3),
          totalTva,
        )

        .input(
          "total_ttc",
          sql.Decimal(18, 3),
          totalTtc,
        )

        .input(
          "extracted_data",
          sql.NVarChar(sql.MAX),
          JSON.stringify(
            workingData,
          ),
        )

        .query(`
          UPDATE dbo.invoices

          SET
            invoice_number =
              COALESCE(
                @invoice_number,
                invoice_number
              ),

            supplier_identifier =
              COALESCE(
                @supplier_identifier,
                supplier_identifier
              ),

            customer_identifier =
              COALESCE(
                @customer_identifier,
                customer_identifier
              ),

            invoice_date =
              CASE
                WHEN @invoice_date IS NULL
                THEN invoice_date

                ELSE
                  CONVERT(
                    date,
                    @invoice_date,
                    23
                  )
              END,

            currency =
              COALESCE(
                @currency,
                currency
              ),

            total_ht =
              COALESCE(
                @total_ht,
                total_ht
              ),

            total_tva =
              COALESCE(
                @total_tva,
                total_tva
              ),

            total_ttc =
              COALESCE(
                @total_ttc,
                total_ttc
              ),

            total_amount =
              COALESCE(
                @total_ttc,
                total_amount
              ),

            extracted_data =
              @extracted_data,

            validation_errors =
              NULL,

            status =
              'PENDING_REVIEW',

            current_stage =
              'VALIDATION',

            can_retry =
              0,

            rejection_reason =
              NULL,

            last_error_code =
              NULL,

            last_error_message =
              NULL,

            updated_at =
              SYSUTCDATETIME()

          OUTPUT
            INSERTED.id,
            INSERTED.invoice_number,
            INSERTED.supplier_identifier,
            INSERTED.customer_identifier,
            INSERTED.invoice_date,
            INSERTED.currency,
            INSERTED.total_ht,
            INSERTED.total_tva,
            INSERTED.total_ttc,
            INSERTED.status,
            INSERTED.current_stage,
            INSERTED.can_retry,
            INSERTED.extracted_data,
            INSERTED.validation_errors,
            INSERTED.updated_at

          WHERE
            id =
              @invoice_id

            AND organization_id =
              @organization_id;
        `);

    return res
      .status(200)
      .json({
        success: true,

        correction_saved:
          true,

        workflow_started:
          false,

        requires_client_approval:
          true,

        message:
          "Correction enregistrée. Vérifiez les données puis cliquez sur « Valider et continuer vers la signature ».",

        corrections,

        invoice:
          result.recordset[0],
      });
  } catch (error) {
    console.error(
      "humanCorrectionInvoice error:",
      error,
    );

    if (
      error.code ===
        "EPARAM" ||
      error.name ===
        "RequestError"
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "HUMAN_CORRECTION_INVALID_PARAMETER",

          message:
            "Une donnée envoyée pour la correction humaine est invalide.",

          error:
            error.message,
        });
    }

    return res
      .status(500)
      .json({
        success: false,

        errorCode:
          "HUMAN_CORRECTION_FAILED",

        message:
          "Impossible d'enregistrer la correction.",

        error:
          error.message,
      });
  }
}
/*
|--------------------------------------------------------------------------
| APPROUVER EXTRACTION ET POURSUIVRE
|--------------------------------------------------------------------------
*/

async function approveExtractionById(
  req,
  res,
) {
  try {
    const {
      userId,
      organizationId,
    } =
      getAuthenticatedUser(req);

    const invoiceId =
      String(
        req.params?.id ||
        "",
      ).trim();

    if (!invoiceId) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "INVOICE_ID_REQUIRED",

          message:
            "Identifiant facture manquant.",
        });
    }

    const pool =
      getDatabase();

    const existingResult =
      await pool
        .request()

        .input(
          "invoice_id",
          sql.UniqueIdentifier,
          invoiceId,
        )

        .input(
          "organization_id",
          sql.UniqueIdentifier,
          organizationId,
        )

        .query(`
          SELECT TOP 1
            id,
            organization_id,
            client_id,
            created_by,
            invoice_number,
            source_type,
            source,
            status,
            current_stage,
            extracted_data,
            validation_errors,
            created_at,
            updated_at

          FROM dbo.invoices

          WHERE
            id =
              @invoice_id

            AND organization_id =
              @organization_id;
        `);

    if (
      existingResult.recordset.length ===
      0
    ) {
      return res
        .status(404)
        .json({
          success: false,

          errorCode:
            "INVOICE_NOT_FOUND",

          message:
            "Facture introuvable.",
        });
    }

    const invoice =
      existingResult.recordset[0];

    const status =
      String(
        invoice.status ||
        "",
      )
        .trim()
        .toUpperCase();

    const stage =
      String(
        invoice.current_stage ||
        "",
      )
        .trim()
        .toUpperCase();

    if (
      status !==
      "PENDING_REVIEW"
    ) {
      return res
        .status(409)
        .json({
          success: false,

          errorCode:
            "EXTRACTION_APPROVAL_NOT_ALLOWED",

          message:
            `La facture ne peut pas être approuvée depuis le statut ${status}.`,

          invoice: {
            id:
              invoice.id,

            status,

            current_stage:
              stage,
          },
        });
    }

    if (
      stage !==
      "VALIDATION"
    ) {
      return res
        .status(409)
        .json({
          success: false,

          errorCode:
            "INVALID_APPROVAL_STAGE",

          message:
            `La validation client est attendue à l'étape VALIDATION, pas ${stage || "INCONNUE"}.`,
        });
    }

    const workingData =
      parseExtractedData(
        invoice.extracted_data,
      );

    if (
      !workingData ||
      typeof workingData !==
        "object" ||
      Array.isArray(
        workingData,
      ) ||
      Object.keys(
        workingData,
      ).length === 0
    ) {
      return res
        .status(409)
        .json({
          success: false,

          errorCode:
            "EXTRACTED_DATA_NOT_AVAILABLE",

          message:
            "Impossible de poursuivre : aucune extraction complète n'est enregistrée.",
        });
    }

    const documentData =
      workingData.document ||
      {};

    const invoiceData =
      workingData.facture ||
      {};

    const extractedInvoiceNumber =
      String(
        invoiceData.numero ??
        documentData.numero ??
        invoice.invoice_number ??
        "",
      ).trim() ||
      null;

    const n8nContinueWebhookUrl =
      String(
        process.env
          .N8N_CONTINUE_WEBHOOK_URL ||
        "http://localhost:5678/webhook/client-invoice-approve",
      ).trim();

    const callbackUrl =
      String(
        process.env
          .BACKEND_WORKFLOW_CALLBACK_URL ||
        "http://host.docker.internal:3000/api/invoices/workflow-update",
      ).trim();

    const workflowPayload = {
      platform_invoice_id:
        invoice.id,

      invoice_id:
        invoice.id,

      invoice_number:
        extractedInvoiceNumber,

      source:
        "CLIENT_APPROVED_EXTRACTION",

      source_type:
        invoice.source_type ||
        null,

      user_id:
        invoice.client_id ||
        invoice.created_by ||
        userId,

      organization_id:
        invoice.organization_id,

      human_review_completed:
        true,

      client_approved:
        true,

      review_status:
        "CLIENT_APPROVED",

      working_data:
        workingData,

      extracted_data:
        workingData,

      original_data:
        JSON.parse(
          JSON.stringify(
            workingData,
          ),
        ),

      callback_url:
        callbackUrl,

      callback_secret:
        process.env
          .WORKFLOW_CALLBACK_SECRET ||
        null,
    };

    await pool
      .request()

      .input(
        "invoice_id",
        sql.UniqueIdentifier,
        invoiceId,
      )

      .input(
        "organization_id",
        sql.UniqueIdentifier,
        organizationId,
      )

      .query(`
        UPDATE dbo.invoices

        SET
          status =
            'PROCESSING',

          current_stage =
            'VALIDATION',

          can_retry =
            0,

          rejection_reason =
            NULL,

          last_error_code =
            NULL,

          last_error_message =
            NULL,

          updated_at =
            SYSUTCDATETIME()

        WHERE
          id =
            @invoice_id

          AND organization_id =
            @organization_id;
      `);

    const abortController =
      new AbortController();

    const requestTimeout =
      setTimeout(
        () =>
          abortController.abort(),
        30000,
      );

    try {
      const workflowResponse =
        await fetch(
          n8nContinueWebhookUrl,
          {
            method:
              "POST",

            headers: {
              Accept:
                "application/json",

              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                workflowPayload,
              ),

            signal:
              abortController.signal,
          },
        );

      clearTimeout(
        requestTimeout,
      );

      const responseText =
        await workflowResponse.text();

      let workflowData =
        null;

      if (responseText) {
        try {
          workflowData =
            JSON.parse(
              responseText,
            );
        } catch {
          workflowData =
            responseText;
        }
      }

      if (
        !workflowResponse.ok
      ) {
        const workflowError =
          new Error(
            typeof workflowData ===
              "string"
              ? workflowData
              : workflowData
                  ?.message ||
                `Erreur n8n HTTP ${workflowResponse.status}`,
          );

        workflowError.data =
          workflowData;

        throw workflowError;
      }

      return res
        .status(202)
        .json({
          success: true,

          extraction_approved:
            true,

          workflow_started:
            true,

          message:
            "Extraction validée. Le workflow poursuit maintenant vers la revalidation, TEIF et la signature.",

          invoice: {
            id:
              invoice.id,

            invoice_number:
              extractedInvoiceNumber,

            status:
              "PROCESSING",

            current_stage:
              "VALIDATION",

            can_retry:
              false,
          },

          workflow: {
            started:
              true,

            url:
              n8nContinueWebhookUrl,

            response:
              workflowData,
          },
        });
    } catch (
      workflowError
    ) {
      clearTimeout(
        requestTimeout,
      );

      const workflowErrorData =
        workflowError.data ||
        workflowError.message ||
        "Impossible de démarrer la continuation n8n.";

      const errorMessage =
        typeof workflowErrorData ===
          "string"
          ? workflowErrorData
          : JSON.stringify(
              workflowErrorData,
            );

      await pool
        .request()

        .input(
          "invoice_id",
          sql.UniqueIdentifier,
          invoiceId,
        )

        .input(
          "organization_id",
          sql.UniqueIdentifier,
          organizationId,
        )

        .input(
          "error_message",
          sql.NVarChar(sql.MAX),
          errorMessage,
        )

        .query(`
          UPDATE dbo.invoices

          SET
            status =
              'PENDING_REVIEW',

            current_stage =
              'VALIDATION',

            can_retry =
              0,

            last_error_code =
              'N8N_CONTINUE_START_FAILED',

            last_error_message =
              @error_message,

            updated_at =
              SYSUTCDATETIME()

          WHERE
            id =
              @invoice_id

            AND organization_id =
              @organization_id;
        `);

      return res
        .status(502)
        .json({
          success: false,

          extraction_approved:
            false,

          workflow_started:
            false,

          errorCode:
            "N8N_CONTINUE_START_FAILED",

          message:
            "L'extraction est conservée, mais n8n n'a pas pu démarrer la suite du traitement.",

          invoice: {
            id:
              invoice.id,

            invoice_number:
              extractedInvoiceNumber,

            status:
              "PENDING_REVIEW",

            current_stage:
              "VALIDATION",
          },

          error:
            workflowErrorData,
        });
    }
  } catch (error) {
    console.error(
      "approveExtractionById error:",
      error,
    );

    return res
      .status(500)
      .json({
        success: false,

        errorCode:
          "APPROVE_EXTRACTION_FAILED",

        message:
          "Impossible de valider l'extraction.",

        error:
          error.message,
      });
  }
}

/*
|--------------------------------------------------------------------------
| RETRY FACTURE
|--------------------------------------------------------------------------
*/

async function retryInvoiceById(
  req,
  res,
) {
  try {
    const {
      userId,
      organizationId,
    } =
      getAuthenticatedUser(req);

    const invoiceId =
      String(
        req.params?.id ||
        "",
      ).trim();

    if (!invoiceId) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "INVOICE_ID_REQUIRED",

          message:
            "Identifiant facture manquant.",
        });
    }

    const pool =
      getDatabase();

    const existingResult =
      await pool
        .request()

        .input(
          "invoice_id",
          sql.UniqueIdentifier,
          invoiceId,
        )

        .input(
          "organization_id",
          sql.UniqueIdentifier,
          organizationId,
        )

        .query(`
          SELECT TOP 1
            id,
            organization_id,
            client_id,
            created_by,

            invoice_number,

            original_filename,
            original_file_path,

            source_type,
            source,

            status,
            current_stage,
            can_retry,

            created_at,
            updated_at

          FROM dbo.invoices

          WHERE
            id =
              @invoice_id

            AND organization_id =
              @organization_id;
        `);

    if (
      existingResult.recordset.length ===
      0
    ) {
      return res
        .status(404)
        .json({
          success: false,

          errorCode:
            "INVOICE_NOT_FOUND",

          message:
            "Facture introuvable.",
        });
    }

    const existingInvoice =
      existingResult.recordset[0];

    const existingStatus =
      String(
        existingInvoice.status ||
        "",
      )
        .trim()
        .toUpperCase();

    const currentStage =
      String(
        existingInvoice.current_stage ||
        "IMPORT",
      )
        .trim()
        .toUpperCase();

    /*
    |--------------------------------------------------------------------------
    | ACCEPTED = PAS DE RETRY
    |--------------------------------------------------------------------------
    */

    if (
      existingStatus ===
      "ACCEPTED"
    ) {
      return res
        .status(409)
        .json({
          success: false,

          errorCode:
            "RETRY_NOT_ALLOWED",

          message:
            "Cette facture est déjà acceptée. Elle ne peut pas être relancée.",
        });
    }

    if (
      !RETRYABLE_STATUSES.has(
        existingStatus,
      )
    ) {
      return res
        .status(409)
        .json({
          success: false,

          errorCode:
            "INVOICE_NOT_RETRYABLE",

          message:
            `La facture ne peut pas être relancée depuis le statut ${existingStatus}.`,
        });
    }

    if (
      !nullableBoolean(
        existingInvoice.can_retry,
        false,
      )
    ) {
      return res
        .status(409)
        .json({
          success: false,

          errorCode:
            "RETRY_DISABLED",

          message:
            "La relance n'est pas autorisée pour cette facture.",
        });
    }

    if (
      !existingInvoice.original_file_path
    ) {
      return res
        .status(409)
        .json({
          success: false,

          errorCode:
            "ORIGINAL_FILE_NOT_FOUND",

          message:
            "Le fichier original de la facture est introuvable. La relance est impossible.",
        });
    }

    await pool
      .request()

      .input(
        "invoice_id",
        sql.UniqueIdentifier,
        invoiceId,
      )

      .input(
        "organization_id",
        sql.UniqueIdentifier,
        organizationId,
      )

      .query(`
        UPDATE dbo.invoices

        SET
          status =
            'PROCESSING',

          current_stage =
            'IMPORT',

          can_retry =
            0,

          rejection_reason =
            NULL,

          last_error_code =
            NULL,

          last_error_message =
            NULL,

          updated_at =
            SYSUTCDATETIME()

        WHERE
          id =
            @invoice_id

          AND organization_id =
            @organization_id;
      `);

    try {
      await createInvoiceNotification({
        organizationId:
          existingInvoice.organization_id,

        userId:
          existingInvoice.client_id ||
          existingInvoice.created_by ||
          userId,

        invoiceId,

        invoiceNumber:
          existingInvoice.invoice_number ||
          "Facture",

        status:
          "PROCESSING",

        stage:
          "IMPORT",

        actionUrl:
          `/client/invoices/${invoiceId}`,

        meta: {
          source:
            "MANUAL_RETRY",

          previous_status:
            existingStatus,

          previous_stage:
            currentStage,

          retry_started:
            true,
        },
      });
    } catch (
      notificationError
    ) {
      console.error(
        "[retryInvoiceById][notification-error]",
        notificationError.message,
      );
    }

    try {
      const workflowResponse =
        await sendInvoiceToN8n({
          filePath:
            existingInvoice.original_file_path,

          originalName:
            existingInvoice.original_filename,

          platformInvoiceId:
            existingInvoice.id,

          userId:
            existingInvoice.client_id ||
            existingInvoice.created_by ||
            userId,

          organizationId:
            existingInvoice.organization_id,
        });

      return res
        .status(202)
        .json({
          success: true,

          retry_started:
            true,

          previous_status:
            existingStatus,

          previous_stage:
            currentStage,

          message:
            "La facture a été relancée dans le workflow.",

          invoice: {
            id:
              existingInvoice.id,

            invoice_number:
              existingInvoice.invoice_number,

            status:
              "PROCESSING",

            current_stage:
              "IMPORT",

            can_retry:
              false,
          },

          workflow:
            workflowResponse,
        });
    } catch (
      workflowError
    ) {
      const workflowErrorData =
        workflowError.response?.data ||
        workflowError.message;

      await pool
        .request()

        .input(
          "invoice_id",
          sql.UniqueIdentifier,
          invoiceId,
        )

        .input(
          "organization_id",
          sql.UniqueIdentifier,
          organizationId,
        )

        .input(
          "error_code",
          sql.NVarChar(100),
          workflowError.code ||
            "N8N_RETRY_FAILED",
        )

        .input(
          "error_message",
          sql.NVarChar(sql.MAX),
          typeof workflowErrorData ===
            "string"
            ? workflowErrorData
            : JSON.stringify(
                workflowErrorData,
              ),
        )

        .query(`
          UPDATE dbo.invoices

          SET
            status =
              'ERROR',

            current_stage =
              'IMPORT',

            can_retry =
              1,

            rejection_reason =
              @error_message,

            last_error_code =
              @error_code,

            last_error_message =
              @error_message,

            updated_at =
              SYSUTCDATETIME()

          WHERE
            id =
              @invoice_id

            AND organization_id =
              @organization_id;
        `);

      return res
        .status(502)
        .json({
          success: false,

          retry_started:
            false,

          errorCode:
            "N8N_RETRY_FAILED",

          message:
            "La relance a été demandée, mais n8n n'a pas pu démarrer le workflow.",

          error:
            workflowErrorData,
        });
    }
  } catch (error) {
    console.error(
      "retryInvoiceById error:",
      error,
    );

    if (
      error.name ===
        "RequestError" ||
      error.code ===
        "EPARAM"
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "RETRY_SQL_ERROR",

          message:
            "Impossible de préparer la relance de cette facture.",

          error:
            error.message,
        });
    }

    return res
      .status(500)
      .json({
        success: false,

        errorCode:
          "RETRY_FAILED",

        message:
          "Impossible de relancer la facture.",

        error:
          error.message,
      });
  }
}

/*
|--------------------------------------------------------------------------
| RETRY ERP AVEC CORRECTION DES IDENTIFIANTS
|--------------------------------------------------------------------------
|
| Route associée :
|
| POST /api/invoices/:id/retry-erp
|
| Body attendu :
|
| {
|   "invoice_number": "10001293",
|   "client_code": "C0000001"
| }
|
| Cette route :
|
| - conserve le même invoice_id du portail ;
| - met à jour invoice_number et customer_identifier ;
| - remet la facture en PROCESSING / EXTRACTION ;
| - efface l'ancienne erreur et les données dérivées devenues obsolètes ;
| - appelle le webhook n8n ERP Retry ;
| - n'utilise PAS original_file_path, car une facture ERP n'a pas de fichier.
|
|--------------------------------------------------------------------------
*/

function normalizeCodeForErpRetry(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

async function retryErpInvoiceById(
  req,
  res,
) {
  try {
    const {
      userId,
      organizationId,
    } =
      getAuthenticatedUser(req);

    const invoiceId =
      String(
        req.params?.id ||
        "",
      ).trim();

    const invoiceNumber =
      String(
        req.body?.invoice_number ||
        req.body?.invoiceNumber ||
        "",
      ).trim();

    const clientCode =
      String(
        req.body?.client_code ||
        req.body?.clientCode ||
        "",
      ).trim();

    if (!invoiceId) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "INVOICE_ID_REQUIRED",

          message:
            "Identifiant facture manquant.",
        });
    }

    if (!invoiceNumber) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "ERP_INVOICE_NUMBER_REQUIRED",

          message:
            "Le numéro de facture ERP est obligatoire.",
        });
    }

    if (!clientCode) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "ERP_CLIENT_CODE_REQUIRED",

          message:
            "Le code client ERP est obligatoire.",
        });
    }

    const invoiceNumberPattern =
      /^[A-Za-z0-9._/-]{1,100}$/;

    const clientCodePattern =
      /^[A-Za-z0-9._/-]{1,100}$/;

    if (
      !invoiceNumberPattern.test(
        invoiceNumber,
      )
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "INVALID_ERP_INVOICE_NUMBER",

          message:
            "Le numéro de facture ERP contient des caractères non autorisés.",
        });
    }

    if (
      !clientCodePattern.test(
        clientCode,
      )
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "INVALID_ERP_CLIENT_CODE",

          message:
            "Le code client ERP contient des caractères non autorisés.",
        });
    }

    const pool =
      getDatabase();

    const existingResult =
      await pool
        .request()

        .input(
          "invoice_id",
          sql.UniqueIdentifier,
          invoiceId,
        )

        .input(
          "organization_id",
          sql.UniqueIdentifier,
          organizationId,
        )

        .query(`
          SELECT TOP 1
            id,
            organization_id,
            client_id,
            created_by,

            invoice_number,
            customer_identifier,

            source_type,
            source,

            status,
            current_stage,
            can_retry,

            created_at,
            updated_at

          FROM dbo.invoices

          WHERE
            id =
              @invoice_id

            AND organization_id =
              @organization_id;
        `);

    if (
      existingResult.recordset.length ===
      0
    ) {
      return res
        .status(404)
        .json({
          success: false,

          errorCode:
            "INVOICE_NOT_FOUND",

          message:
            "Facture introuvable.",
        });
    }

    const existingInvoice =
      existingResult.recordset[0];

    const existingSource =
      normalizeCodeForErpRetry(
        existingInvoice.source ||
        existingInvoice.source_type,
      );

    const existingStatus =
      normalizeCodeForErpRetry(
        existingInvoice.status,
      );

    const existingStage =
      normalizeCodeForErpRetry(
        existingInvoice.current_stage ||
        "IMPORT",
      );

    if (
      existingSource !==
      "ERP"
    ) {
      return res
        .status(409)
        .json({
          success: false,

          errorCode:
            "ERP_RETRY_SOURCE_REQUIRED",

          message:
            "Cette relance est réservée aux factures provenant de l'ERP.",
        });
    }

    if (
      !RETRYABLE_STATUSES.has(
        existingStatus,
      )
    ) {
      return res
        .status(409)
        .json({
          success: false,

          errorCode:
            "ERP_INVOICE_NOT_RETRYABLE",

          message:
            `La facture ERP ne peut pas être relancée depuis le statut ${existingStatus}.`,
        });
    }

    if (
      ![
        "IMPORT",
        "EXTRACTION",
      ].includes(
        existingStage,
      )
    ) {
      return res
        .status(409)
        .json({
          success: false,

          errorCode:
            "ERP_RETRY_STAGE_NOT_ALLOWED",

          message:
            `La correction ERP est autorisée à IMPORT ou EXTRACTION, pas ${existingStage}.`,
        });
    }

    if (
      !nullableBoolean(
        existingInvoice.can_retry,
        false,
      )
    ) {
      return res
        .status(409)
        .json({
          success: false,

          errorCode:
            "RETRY_DISABLED",

          message:
            "La relance n'est pas autorisée pour cette facture.",
        });
    }

    const updateResult =
      await pool
        .request()

        .input(
          "invoice_id",
          sql.UniqueIdentifier,
          invoiceId,
        )

        .input(
          "organization_id",
          sql.UniqueIdentifier,
          organizationId,
        )

        .input(
          "invoice_number",
          sql.NVarChar(100),
          invoiceNumber,
        )

        .input(
          "customer_identifier",
          sql.NVarChar(100),
          clientCode,
        )

        .input(
          "original_filename",
          sql.NVarChar(255),
          `${invoiceNumber}.erp`,
        )

        .query(`
          UPDATE dbo.invoices

          SET
            invoice_number =
              @invoice_number,

            customer_identifier =
              @customer_identifier,

            original_filename =
              @original_filename,

            source_type =
              'ERP',

            source =
              'ERP',

            status =
              'PROCESSING',

            current_stage =
              'EXTRACTION',

            can_retry =
              0,

            supplier_identifier =
              NULL,

            invoice_date =
              NULL,

            currency =
              NULL,

            total_ht =
              NULL,

            total_tva =
              NULL,

            total_ttc =
              NULL,

            total_amount =
              NULL,

            extracted_data =
              NULL,

            validation_errors =
              NULL,

            rejection_reason =
              NULL,

            last_error_code =
              NULL,

            last_error_message =
              NULL,

            signed_xml_path =
              NULL,

            qr_code_path =
              NULL,

            qr_code_base64 =
              NULL,

            verification_token =
              NULL,

            verification_created_at =
              NULL,

            ttn_reference =
              NULL,

            ttn_transaction_id =
              NULL,

            transaction_id =
              NULL,

            updated_at =
              SYSUTCDATETIME()

          OUTPUT
            INSERTED.id,
            INSERTED.organization_id,
            INSERTED.client_id,
            INSERTED.created_by,
            INSERTED.invoice_number,
            INSERTED.customer_identifier,
            INSERTED.source_type,
            INSERTED.source,
            INSERTED.original_filename,
            INSERTED.status,
            INSERTED.current_stage,
            INSERTED.can_retry,
            INSERTED.updated_at

          WHERE
            id =
              @invoice_id

            AND organization_id =
              @organization_id;
        `);

    if (
      updateResult.recordset.length ===
      0
    ) {
      return res
        .status(404)
        .json({
          success: false,

          errorCode:
            "INVOICE_NOT_FOUND",

          message:
            "La facture ERP n'a pas pu être préparée pour la relance.",
        });
    }

    const updatedInvoice =
      updateResult.recordset[0];

    try {
      await createInvoiceNotification({
        organizationId:
          existingInvoice.organization_id,

        userId:
          existingInvoice.client_id ||
          existingInvoice.created_by ||
          userId,

        invoiceId,

        invoiceNumber,

        status:
          "PROCESSING",

        stage:
          "EXTRACTION",

        actionUrl:
          `/client/invoices/${invoiceId}`,

        meta: {
          source:
            "ERP_RETRY",

          source_system:
            "Divalto",

          previous_status:
            existingStatus,

          previous_stage:
            existingStage,

          client_code:
            clientCode,

          retry_started:
            true,
        },
      });
    } catch (
      notificationError
    ) {
      console.error(
        "[retryErpInvoiceById][notification-error]",
        notificationError.message,
      );
    }

    const n8nErpRetryWebhookUrl =
      String(
        process.env
          .N8N_ERP_RETRY_WEBHOOK_URL ||
        "http://localhost:5678/webhook/client/invoices/erp/retry",
      ).trim();

    const workflowPayload = {
      invoice_id:
        invoiceId,

      platform_invoice_id:
        invoiceId,

      invoice_number:
        invoiceNumber,

      client_code:
        clientCode,

      source:
        "ERP",

      source_system:
        "Divalto",

      retry:
        true,

      resume_from_stage:
        "EXTRACTION",

      user_id:
        existingInvoice.client_id ||
        existingInvoice.created_by ||
        userId,

      organization_id:
        existingInvoice.organization_id,
    };

    const abortController =
      new AbortController();

    const requestTimeout =
      setTimeout(
        () =>
          abortController.abort(),
        30000,
      );

    try {
      const workflowResponse =
        await fetch(
          n8nErpRetryWebhookUrl,
          {
            method:
              "POST",

            headers: {
              Accept:
                "application/json",

              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                workflowPayload,
              ),

            signal:
              abortController.signal,
          },
        );

      clearTimeout(
        requestTimeout,
      );

      const responseText =
        await workflowResponse.text();

      let workflowData =
        null;

      if (responseText) {
        try {
          workflowData =
            JSON.parse(
              responseText,
            );
        } catch {
          workflowData =
            responseText;
        }
      }

      if (
        !workflowResponse.ok
      ) {
        const workflowError =
          new Error(
            typeof workflowData ===
              "string"
              ? workflowData
              : workflowData?.message ||
                `Erreur n8n HTTP ${workflowResponse.status}`,
          );

        workflowError.status =
          workflowResponse.status;

        workflowError.data =
          workflowData;

        throw workflowError;
      }

      return res
        .status(202)
        .json({
          success: true,

          retry_started:
            true,

          erp_retry:
            true,

          message:
            `La facture ERP ${invoiceNumber} a été corrigée et relancée.`,

          invoice: {
            ...updatedInvoice,

            client_code:
              clientCode,
          },

          workflow: {
            started:
              true,

            response:
              workflowData,
          },
        });
    } catch (
      workflowError
    ) {
      clearTimeout(
        requestTimeout,
      );

      const workflowErrorData =
        workflowError.data ||
        workflowError.message ||
        "Impossible de démarrer le retry ERP dans n8n.";

      const errorMessage =
        typeof workflowErrorData ===
          "string"
          ? workflowErrorData
          : JSON.stringify(
              workflowErrorData,
            );

      await pool
        .request()

        .input(
          "invoice_id",
          sql.UniqueIdentifier,
          invoiceId,
        )

        .input(
          "organization_id",
          sql.UniqueIdentifier,
          organizationId,
        )

        .input(
          "error_message",
          sql.NVarChar(sql.MAX),
          errorMessage,
        )

        .query(`
          UPDATE dbo.invoices

          SET
            status =
              'ERROR',

            current_stage =
              'EXTRACTION',

            can_retry =
              1,

            rejection_reason =
              @error_message,

            last_error_code =
              'N8N_ERP_RETRY_FAILED',

            last_error_message =
              @error_message,

            updated_at =
              SYSUTCDATETIME()

          WHERE
            id =
              @invoice_id

            AND organization_id =
              @organization_id;
        `);

      try {
        await createInvoiceNotification({
          organizationId:
            existingInvoice.organization_id,

          userId:
            existingInvoice.client_id ||
            existingInvoice.created_by ||
            userId,

          invoiceId,

          invoiceNumber,

          status:
            "ERROR",

          stage:
            "EXTRACTION",

          errorCode:
            "N8N_ERP_RETRY_FAILED",

          errorMessage,

          actionUrl:
            `/client/invoices/${invoiceId}`,

          meta: {
            source:
              "ERP_RETRY",

            source_system:
              "Divalto",

            client_code:
              clientCode,

            retry_start_failed:
              true,
          },
        });
      } catch (
        notificationError
      ) {
        console.error(
          "[retryErpInvoiceById][error-notification]",
          notificationError.message,
        );
      }

      return res
        .status(502)
        .json({
          success: false,

          retry_started:
            false,

          erp_retry:
            true,

          errorCode:
            "N8N_ERP_RETRY_FAILED",

          message:
            "Les informations ERP ont été corrigées, mais n8n n'a pas pu démarrer la relance.",

          invoice: {
            id:
              invoiceId,

            invoice_number:
              invoiceNumber,

            client_code:
              clientCode,

            customer_identifier:
              clientCode,

            status:
              "ERROR",

            current_stage:
              "EXTRACTION",

            can_retry:
              true,
          },

          error:
            workflowErrorData,
        });
    }
  } catch (error) {
    console.error(
      "retryErpInvoiceById error:",
      error,
    );

    if (
      error.code ===
        "EPARAM" ||
      error.name ===
        "RequestError"
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "ERP_RETRY_INVALID_PARAMETER",

          message:
            "Une donnée envoyée pour la relance ERP est invalide.",

          error:
            error.message,
        });
    }

    return res
      .status(500)
      .json({
        success: false,

        errorCode:
          "ERP_RETRY_FAILED",

        message:
          "Impossible de relancer la facture ERP.",

        error:
          error.message,
      });
  }
}

/*
|--------------------------------------------------------------------------
| SUPPRIMER UNE FACTURE
|--------------------------------------------------------------------------
*/

async function deleteInvoiceById(
  req,
  res,
) {
  try {
    const {
      userId,
      organizationId,
    } =
      getAuthenticatedUser(req);

    const invoiceId =
      String(
        req.params?.id ||
        "",
      ).trim();

    if (!invoiceId) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "INVOICE_ID_REQUIRED",

          message:
            "Identifiant facture manquant.",
        });
    }

    const pool =
      getDatabase();

    const existingResult =
      await pool
        .request()

        .input(
          "invoice_id",
          sql.UniqueIdentifier,
          invoiceId,
        )

        .input(
          "organization_id",
          sql.UniqueIdentifier,
          organizationId,
        )

        .query(`
          SELECT TOP 1
            id,
            organization_id,
            client_id,
            created_by,

            invoice_number,

            original_filename,
            original_file_path,

            source_type,
            source,

            status,
            current_stage,

            ttn_reference,
            ttn_transaction_id,
            transaction_id,

            created_at,
            updated_at

          FROM dbo.invoices

          WHERE
            id =
              @invoice_id

            AND organization_id =
              @organization_id;
        `);

    if (
      existingResult.recordset.length ===
      0
    ) {
      return res
        .status(404)
        .json({
          success: false,

          errorCode:
            "INVOICE_NOT_FOUND",

          message:
            "Facture introuvable.",
        });
    }

    const existingInvoice =
      existingResult.recordset[0];

    const deletedInvoice = {
      id:
        existingInvoice.id,

      invoice_number:
        existingInvoice.invoice_number,

      original_filename:
        existingInvoice.original_filename,

      source_type:
        existingInvoice.source_type,

      source:
        existingInvoice.source,

      status:
        existingInvoice.status,

      current_stage:
        existingInvoice.current_stage,

      ttn_reference:
        existingInvoice.ttn_reference,

      transaction_id:
        existingInvoice.ttn_transaction_id ||
        existingInvoice.transaction_id,
    };

    const deleteResult =
      await pool
        .request()

        .input(
          "invoice_id",
          sql.UniqueIdentifier,
          invoiceId,
        )

        .input(
          "organization_id",
          sql.UniqueIdentifier,
          organizationId,
        )

        .query(`
          DELETE FROM dbo.invoices

          OUTPUT
            DELETED.id,
            DELETED.invoice_number,
            DELETED.original_filename,
            DELETED.source_type,
            DELETED.source,
            DELETED.status,
            DELETED.current_stage,
            DELETED.created_at,
            DELETED.updated_at

          WHERE
            id =
              @invoice_id

            AND organization_id =
              @organization_id;
        `);

    if (
      deleteResult.recordset.length ===
      0
    ) {
      return res
        .status(404)
        .json({
          success: false,

          errorCode:
            "INVOICE_NOT_FOUND",

          message:
            "La facture n'a pas pu être supprimée.",
        });
    }

    console.log(
      "[deleteInvoiceById]",
      {
        userId,

        organizationId,

        invoiceId,

        invoiceNumber:
          existingInvoice.invoice_number,

        previousStatus:
          existingInvoice.status,
      },
    );

    return res
      .status(200)
      .json({
        success: true,

        deleted:
          true,

        message:
          existingInvoice.invoice_number
            ? `La facture ${existingInvoice.invoice_number} a été supprimée. Vous pouvez maintenant la réimporter pour effectuer un nouveau test.`
            : "La facture a été supprimée. Vous pouvez maintenant effectuer un nouveau test.",

        invoice:
          deletedInvoice,
      });
  } catch (error) {
    console.error(
      "deleteInvoiceById error:",
      error,
    );

    if (
      error.code ===
        "EPARAM" ||
      error.name ===
        "RequestError"
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "DELETE_INVOICE_INVALID_PARAMETER",

          message:
            "L'identifiant de la facture est invalide.",

          error:
            error.message,
        });
    }

    if (
      Number(
        error.number,
      ) === 547
    ) {
      return res
        .status(409)
        .json({
          success: false,

          errorCode:
            "INVOICE_DELETE_CONSTRAINT",

          message:
            "Cette facture est encore référencée par d'autres données du portail et ne peut pas être supprimée directement.",

          error:
            error.message,
        });
    }

    return res
      .status(500)
      .json({
        success: false,

        errorCode:
          "INVOICE_DELETE_FAILED",

        message:
          "Impossible de supprimer la facture.",

        error:
          error.message,
      });
  }
}
/*
|--------------------------------------------------------------------------
| CALLBACK N8N
|--------------------------------------------------------------------------
*/

async function workflowUpdate(
  req,
  res,
) {
  try {
    /*
    |--------------------------------------------------------------------------
     | SECRET
    |--------------------------------------------------------------------------
    */

    const expectedSecret =
      process.env
        .WORKFLOW_CALLBACK_SECRET;

    const receivedSecret =
      req.headers[
        "x-workflow-secret"
      ] ||
      req.body?.callback_secret;

    if (!expectedSecret) {
      return res
        .status(500)
        .json({
          success: false,

          errorCode:
            "WORKFLOW_SECRET_NOT_CONFIGURED",

          message:
            "Le secret du workflow n'est pas configuré sur le backend.",
        });
    }

    if (
      !receivedSecret ||
      receivedSecret !==
        expectedSecret
    ) {
      return res
        .status(401)
        .json({
          success: false,

          errorCode:
            "INVALID_WORKFLOW_SECRET",

          message:
            "Le secret du workflow est invalide.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | PAYLOAD
    |--------------------------------------------------------------------------
    */

    const invoiceId =
      String(
        req.body
          ?.platform_invoice_id ||
          "",
      ).trim();

    const requestedStatus =
      String(
        req.body?.status ||
          "",
      )
        .trim()
        .toUpperCase();

    /*
    |--------------------------------------------------------------------------
    | ÉTAPE :
    | ACCEPTER current_stage OU stage
    |--------------------------------------------------------------------------
    */

    const rawRequestedStage =
      req.body?.current_stage ||
      req.body?.stage ||
      null;

    const requestedStage =
      rawRequestedStage
        ? String(
            rawRequestedStage,
          )
            .trim()
            .toUpperCase()
        : null;

    /*
    |--------------------------------------------------------------------------
    | ERROR PAYLOAD NORMALIZATION
    |--------------------------------------------------------------------------
    */

    const incomingWorkflowError =
      extractWorkflowError(
        req.body ||
        {},
      );

    if (!invoiceId) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "INVOICE_ID_REQUIRED",

          message:
            "platform_invoice_id est obligatoire.",
        });
    }

    if (
      !requestedStatus ||
      !ALLOWED_WORKFLOW_STATUSES.has(
        requestedStatus,
      )
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "INVALID_INVOICE_STATUS",

          message:
            `Statut non autorisé : ${requestedStatus}`,
        });
    }

    if (
      requestedStage &&
      !WORKFLOW_STAGE_ORDER[
        requestedStage
      ]
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "INVALID_WORKFLOW_STAGE",

          message:
            `Étape workflow non autorisée : ${requestedStage}`,
        });
    }

    const pool =
      getDatabase();

    /*
    |--------------------------------------------------------------------------
    | FACTURE EXISTANTE
    |--------------------------------------------------------------------------
    */

    const existingResult =
      await pool
        .request()

        .input(
          "invoice_id",
          sql.UniqueIdentifier,
          invoiceId,
        )

        .query(`
          SELECT TOP 1
            id,
            organization_id,
            client_id,
            created_by,

            invoice_number,

            status,
            current_stage,
            can_retry,

            verification_token,
            verification_created_at,

            created_at,
            updated_at

          FROM dbo.invoices

          WHERE id =
            @invoice_id;
        `);

    if (
      existingResult.recordset.length ===
      0
    ) {
      return res
        .status(404)
        .json({
          success: false,

          errorCode:
            "INVOICE_NOT_FOUND",

          message:
            "Aucune facture ne correspond à cet identifiant.",
        });
    }

    const existingInvoice =
      existingResult.recordset[0];

    /*
    |--------------------------------------------------------------------------
    | NUMÉRO FACTURE ENTRANT
    |--------------------------------------------------------------------------
    */

    const rawIncomingInvoiceNumber =
      String(
        req.body?.invoice_number ||
        "",
      ).trim();

    const invalidInvoiceNumbers =
      new Set([
        "",
        "invoice",
        "facture",
        "unknown",
        "undefined",
        "null",
      ]);

    const incomingInvoiceNumber =
      invalidInvoiceNumbers.has(
        rawIncomingInvoiceNumber.toLowerCase(),
      )
        ? null
        : rawIncomingInvoiceNumber;

    /*
    |--------------------------------------------------------------------------
    | DUPLICATE ACCEPTED
    |--------------------------------------------------------------------------
    */

    if (incomingInvoiceNumber) {
      const duplicateAcceptedResult =
        await pool
          .request()

          .input(
            "organization_id",
            sql.UniqueIdentifier,
            existingInvoice.organization_id,
          )

          .input(
            "invoice_id",
            sql.UniqueIdentifier,
            invoiceId,
          )

          .input(
            "invoice_number",
            sql.NVarChar(200),
            incomingInvoiceNumber,
          )

          .query(`
            SELECT TOP 1
              id,
              invoice_number,
              status,
              current_stage,
              ttn_reference,
              transaction_id,
              created_at,
              updated_at

            FROM dbo.invoices

            WHERE
              organization_id =
                @organization_id

              AND id <>
                @invoice_id

              AND UPPER(
                LTRIM(
                  RTRIM(
                    invoice_number
                  )
                )
              ) =
              UPPER(
                LTRIM(
                  RTRIM(
                    @invoice_number
                  )
                )
              )

              AND status =
                'ACCEPTED'

            ORDER BY
              updated_at DESC;
          `);

      const duplicateAcceptedInvoice =
        duplicateAcceptedResult
          .recordset?.[0] ||
        null;

      if (
        duplicateAcceptedInvoice
      ) {
        const duplicateMessage =
          `La facture ${incomingInvoiceNumber} a déjà été traitée et acceptée.`;

        const duplicateExtractedData =
          parseExtractedData(
            req.body?.extracted_data,
          );

        const duplicateExtractedDataJson =
          duplicateExtractedData &&
          typeof duplicateExtractedData ===
            "object" &&
          !Array.isArray(
            duplicateExtractedData,
          ) &&
          Object.keys(
            duplicateExtractedData,
          ).length > 0
            ? JSON.stringify(
                duplicateExtractedData,
              )
            : null;

        await pool
          .request()

          .input(
            "invoice_id",
            sql.UniqueIdentifier,
            invoiceId,
          )

          .input(
            "invoice_number",
            sql.NVarChar(100),
            incomingInvoiceNumber,
          )

          .input(
            "supplier_identifier",
            sql.NVarChar(100),
            req.body?.supplier_identifier ||
              null,
          )

          .input(
            "customer_identifier",
            sql.NVarChar(100),
            req.body?.customer_identifier ||
              null,
          )

          .input(
            "currency",
            sql.NVarChar(10),
            req.body?.currency ||
              null,
          )

          .input(
            "total_ht",
            sql.Decimal(18, 3),
            nullableNumber(
              req.body?.total_ht,
            ),
          )

          .input(
            "total_tva",
            sql.Decimal(18, 3),
            nullableNumber(
              req.body?.total_tva,
            ),
          )

          .input(
            "total_ttc",
            sql.Decimal(18, 3),
            nullableNumber(
              req.body?.total_ttc,
            ),
          )

          .input(
            "extracted_data",
            sql.NVarChar(sql.MAX),
            duplicateExtractedDataJson,
          )

          .input(
            "error_code",
            sql.NVarChar(100),
            "INVOICE_ALREADY_ACCEPTED",
          )

          .input(
            "error_message",
            sql.NVarChar(sql.MAX),
            duplicateMessage,
          )

          .query(`
            UPDATE dbo.invoices

            SET
              invoice_number =
                @invoice_number,

              supplier_identifier =
                COALESCE(
                  @supplier_identifier,
                  supplier_identifier
                ),

              customer_identifier =
                COALESCE(
                  @customer_identifier,
                  customer_identifier
                ),

              currency =
                COALESCE(
                  @currency,
                  currency
                ),

              total_ht =
                COALESCE(
                  @total_ht,
                  total_ht
                ),

              total_tva =
                COALESCE(
                  @total_tva,
                  total_tva
                ),

              total_ttc =
                COALESCE(
                  @total_ttc,
                  total_ttc
                ),

              total_amount =
                COALESCE(
                  @total_ttc,
                  total_amount
                ),

              extracted_data =
                COALESCE(
                  @extracted_data,
                  extracted_data
                ),

              status =
                'ERROR',

              current_stage =
                'VALIDATION',

              can_retry =
                0,

              rejection_reason =
                @error_message,

              last_error_code =
                @error_code,

              last_error_message =
                @error_message,

              updated_at =
                SYSUTCDATETIME()

            WHERE id =
              @invoice_id;
          `);

        return res
          .status(200)
          .json({
            success: true,

            workflow_stopped:
              true,

            duplicate_invoice:
              true,

            already_signed:
              true,

            errorCode:
              "INVOICE_ALREADY_ACCEPTED",

            message:
              duplicateMessage,

            invoice: {
              id:
                invoiceId,

              invoice_number:
                incomingInvoiceNumber,

              status:
                "ERROR",

              current_stage:
                "VALIDATION",

              can_retry:
                false,

              duplicate_invoice:
                true,

              already_signed:
                true,
            },

            existing_invoice: {
              id:
                duplicateAcceptedInvoice.id,

              invoice_number:
                duplicateAcceptedInvoice.invoice_number,

              status:
                duplicateAcceptedInvoice.status,

              current_stage:
                duplicateAcceptedInvoice.current_stage,

              ttn_reference:
                duplicateAcceptedInvoice.ttn_reference,

              transaction_id:
                duplicateAcceptedInvoice.transaction_id,

              created_at:
                duplicateAcceptedInvoice.created_at,

              updated_at:
                duplicateAcceptedInvoice.updated_at,
            },
          });
      }
    }

    /*
    |--------------------------------------------------------------------------
    | NUMÉRO OBLIGATOIRE AVANT ACCEPTED
    |--------------------------------------------------------------------------
    */

    if (
      requestedStatus ===
        "ACCEPTED" &&
      !incomingInvoiceNumber &&
      (
        !existingInvoice.invoice_number ||
        invalidInvoiceNumbers.has(
          String(
            existingInvoice.invoice_number,
          )
            .trim()
            .toLowerCase(),
        )
      )
    ) {
      return res
        .status(200)
        .json({
          success: true,

          workflow_stopped:
            true,

          invoice_number_missing:
            true,

          errorCode:
            "INVOICE_NUMBER_MISSING",

          message:
            "Le workflow a été arrêté car aucun numéro de facture valide n'a été extrait.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | ÉTAT EXISTANT
    |--------------------------------------------------------------------------
    */

    const existingStage =
      String(
        existingInvoice.current_stage ||
          "IMPORT",
      )
        .trim()
        .toUpperCase();

    const existingStatus =
      String(
        existingInvoice.status ||
          "UPLOADED",
      )
        .trim()
        .toUpperCase();

    const existingStageRank =
      WORKFLOW_STAGE_ORDER[
        existingStage
      ] ||
      1;

    const requestedStageRank =
      requestedStage
        ? WORKFLOW_STAGE_ORDER[
            requestedStage
          ] ||
          1
        : existingStageRank;

    const isRegression =
      Boolean(
        requestedStage,
      ) &&
      requestedStageRank <
        existingStageRank;

    const isTerminalLocked =
      FINAL_WORKFLOW_STATUSES.has(
        existingStatus,
      ) &&
      requestedStatus !==
        existingStatus;

    const isSameWorkflowState =
      requestedStatus ===
        existingStatus &&
      (
        !requestedStage ||
        requestedStage ===
          existingStage
      );

    /*
    |--------------------------------------------------------------------------
    | ÉTAT FINAL
    |--------------------------------------------------------------------------
    */

    let finalStage =
      requestedStage ||
      existingStage;

    let finalStatus =
      requestedStatus;

    if (
      isRegression ||
      isTerminalLocked
    ) {
      finalStage =
        existingStage;

      finalStatus =
        existingStatus;
    }

    if (
      finalStatus ===
      "ACCEPTED"
    ) {
      finalStage =
        "TTN";
    }

    /*
    |--------------------------------------------------------------------------
    | RETRY
    |--------------------------------------------------------------------------
    */

    let canRetry;

    if (
      isRegression ||
      isTerminalLocked
    ) {
      canRetry =
        nullableBoolean(
          existingInvoice.can_retry,
          false,
        );
    } else {
      canRetry =
        req.body?.can_retry ===
        undefined
          ? RETRYABLE_STATUSES.has(
              finalStatus,
            )
          : nullableBoolean(
              req.body.can_retry,
            );
    }

    /*
    |--------------------------------------------------------------------------
    | DATE
    |--------------------------------------------------------------------------
    */

    const rawWorkflowDate =
      req.body?.invoice_date ||
      null;

    const workflowInvoiceDate =
      normalizeSqlDate(
        rawWorkflowDate,
      );

    if (
      rawWorkflowDate &&
      !workflowInvoiceDate
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "INVALID_INVOICE_DATE",

          message:
            `Date de facture invalide envoyée par le workflow : ${rawWorkflowDate}`,
        });
    }

    /*
    |--------------------------------------------------------------------------
    | PROTECTION CRITIQUE DE extracted_data
    |--------------------------------------------------------------------------
    */

    let workflowExtractedData =
      null;

    if (
      requestedStageRank <=
      WORKFLOW_STAGE_ORDER
        .VALIDATION
    ) {
      const incomingExtractedData =
        parseExtractedData(
          req.body?.extracted_data,
        );

      if (
        incomingExtractedData &&
        typeof incomingExtractedData ===
          "object" &&
        !Array.isArray(
          incomingExtractedData,
        ) &&
        Object.keys(
          incomingExtractedData,
        ).length > 0
      ) {
        workflowExtractedData =
          JSON.stringify(
            incomingExtractedData,
          );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | FINAL ERROR INFORMATION
    |--------------------------------------------------------------------------
    */

    const isFailureStatus =
      [
        "ERROR",
        "REJECTED",
        "PENDING_RETRY",
      ].includes(
        finalStatus,
      );

    const effectiveErrorCode =
      isFailureStatus
        ? incomingWorkflowError.code ||
          getDefaultWorkflowErrorCode(
            finalStatus,
            finalStage,
          )
        : null;

    const effectiveErrorMessage =
      isFailureStatus
        ? incomingWorkflowError.message ||
          getDefaultWorkflowErrorMessage(
            finalStatus,
            finalStage,
          )
        : null;

    /*
    |--------------------------------------------------------------------------
    | QR REÇU DE N8N
    |--------------------------------------------------------------------------
    */

    const qrCodeBase64 =
      req.body?.qr_code_base64
        ? String(
            req.body
              .qr_code_base64,
          ).trim()
        : null;

    /*
    |--------------------------------------------------------------------------
    | TOKEN DE VÉRIFICATION
    |--------------------------------------------------------------------------
    */

    const shouldCreateVerificationToken =
      finalStatus ===
        "ACCEPTED" &&
      !existingInvoice.verification_token;

    const verificationToken =
      shouldCreateVerificationToken
        ? generateVerificationToken()
        : existingInvoice
            .verification_token ||
          null;

    const verificationUrl =
      verificationToken
        ? buildVerificationUrl(
            verificationToken,
          )
        : null;

    /*
    |--------------------------------------------------------------------------
    | QR PUBLIC
    |--------------------------------------------------------------------------
    */

    let verificationQrBase64 =
      qrCodeBase64;

    if (
      finalStatus ===
        "ACCEPTED" &&
      verificationUrl
    ) {
      verificationQrBase64 =
        await generateVerificationQrBase64(
          verificationUrl,
        );
    }

    /*
    |--------------------------------------------------------------------------
    | UPDATE SQL
    |--------------------------------------------------------------------------
    */

    const result =
      await pool
        .request()

        .input(
          "invoice_id",
          sql.UniqueIdentifier,
          invoiceId,
        )

        .input(
          "status",
          sql.NVarChar(40),
          finalStatus,
        )

        .input(
          "current_stage",
          sql.NVarChar(50),
          finalStage,
        )

        .input(
          "can_retry",
          sql.Bit,
          canRetry,
        )

        .input(
          "invoice_number",
          sql.NVarChar(100),
          incomingInvoiceNumber,
        )

        .input(
          "supplier_identifier",
          sql.NVarChar(100),
          req.body?.supplier_identifier ||
            null,
        )

        .input(
          "customer_identifier",
          sql.NVarChar(100),
          req.body?.customer_identifier ||
            null,
        )

        .input(
          "invoice_date",
          sql.NVarChar(10),
          workflowInvoiceDate,
        )

        .input(
          "currency",
          sql.NVarChar(10),
          req.body?.currency ||
            null,
        )

        .input(
          "total_ht",
          sql.Decimal(18, 3),
          nullableNumber(
            req.body?.total_ht,
          ),
        )

        .input(
          "total_tva",
          sql.Decimal(18, 3),
          nullableNumber(
            req.body?.total_tva,
          ),
        )

        .input(
          "total_ttc",
          sql.Decimal(18, 3),
          nullableNumber(
            req.body?.total_ttc,
          ),
        )

        .input(
          "extracted_data",
          sql.NVarChar(sql.MAX),
          workflowExtractedData,
        )

        .input(
          "validation_errors",
          sql.NVarChar(sql.MAX),
          nullableJson(
            req.body?.validation_errors,
          ),
        )

        .input(
          "signed_xml_path",
          sql.NVarChar(500),
          req.body?.signed_xml_path ||
            null,
        )

        .input(
          "qr_code_path",
          sql.NVarChar(500),
          req.body?.qr_code_path ||
            null,
        )

        .input(
          "qr_code_base64",
          sql.NVarChar(sql.MAX),
          verificationQrBase64,
        )

        .input(
          "verification_token",
          sql.NVarChar(150),
          verificationToken,
        )

        .input(
          "create_verification_date",
          sql.Bit,
          shouldCreateVerificationToken,
        )

        .input(
          "ttn_reference",
          sql.NVarChar(150),
          req.body?.ttn_reference ||
            null,
        )

        .input(
          "ttn_transaction_id",
          sql.NVarChar(150),
          req.body?.ttn_transaction_id ||
            req.body?.transaction_id ||
            null,
        )

        .input(
          "error_code",
          sql.NVarChar(100),
          effectiveErrorCode,
        )

        .input(
          "error_message",
          sql.NVarChar(sql.MAX),
          effectiveErrorMessage,
        )

        .query(`
          UPDATE dbo.invoices

          SET
            status =
              @status,

            current_stage =
              @current_stage,

            can_retry =
              @can_retry,

            invoice_number =
              COALESCE(
                @invoice_number,
                invoice_number
              ),

            supplier_identifier =
              COALESCE(
                @supplier_identifier,
                supplier_identifier
              ),

            customer_identifier =
              COALESCE(
                @customer_identifier,
                customer_identifier
              ),

            invoice_date =
              CASE
                WHEN @invoice_date IS NULL
                THEN invoice_date

                ELSE
                  CONVERT(
                    date,
                    @invoice_date,
                    23
                  )
              END,

            currency =
              COALESCE(
                @currency,
                currency
              ),

            total_ht =
              COALESCE(
                @total_ht,
                total_ht
              ),

            total_tva =
              COALESCE(
                @total_tva,
                total_tva
              ),

            total_ttc =
              COALESCE(
                @total_ttc,
                total_ttc
              ),

            total_amount =
              COALESCE(
                @total_ttc,
                total_amount
              ),

            extracted_data =
              COALESCE(
                @extracted_data,
                extracted_data
              ),

            validation_errors =
              COALESCE(
                @validation_errors,
                validation_errors
              ),

            signed_xml_path =
              COALESCE(
                @signed_xml_path,
                signed_xml_path
              ),

            qr_code_path =
              COALESCE(
                @qr_code_path,
                qr_code_path
              ),

            qr_code_base64 =
              COALESCE(
                @qr_code_base64,
                qr_code_base64
              ),

            verification_token =
              CASE
                WHEN @status =
                  'ACCEPTED'

                THEN
                  COALESCE(
                    verification_token,
                    @verification_token
                  )

                ELSE
                  verification_token
              END,

            verification_created_at =
              CASE
                WHEN
                  @status =
                    'ACCEPTED'

                  AND
                  @create_verification_date =
                    1

                  AND
                  verification_created_at
                    IS NULL

                THEN
                  SYSUTCDATETIME()

                ELSE
                  verification_created_at
              END,

            ttn_reference =
              COALESCE(
                @ttn_reference,
                ttn_reference
              ),

            ttn_transaction_id =
              COALESCE(
                @ttn_transaction_id,
                ttn_transaction_id
              ),

            transaction_id =
              COALESCE(
                @ttn_transaction_id,
                transaction_id
              ),

            rejection_reason =
              CASE
                WHEN @status IN (
                  'ERROR',
                  'REJECTED',
                  'PENDING_RETRY'
                )

                THEN
                  COALESCE(
                    @error_message,
                    rejection_reason
                  )

                ELSE
                  NULL
              END,

            last_error_code =
              CASE
                WHEN @status IN (
                  'ERROR',
                  'REJECTED',
                  'PENDING_RETRY'
                )

                THEN
                  COALESCE(
                    @error_code,
                    last_error_code
                  )

                ELSE
                  NULL
              END,

            last_error_message =
              CASE
                WHEN @status IN (
                  'ERROR',
                  'REJECTED',
                  'PENDING_RETRY'
                )

                THEN
                  COALESCE(
                    @error_message,
                    last_error_message
                  )

                ELSE
                  NULL
              END,

            updated_at =
              SYSUTCDATETIME()

          OUTPUT
            INSERTED.id,
            INSERTED.invoice_number,
            INSERTED.original_filename,

            INSERTED.source_type,
            INSERTED.source,

            INSERTED.status,
            INSERTED.current_stage,
            INSERTED.can_retry,

            INSERTED.total_ht,
            INSERTED.total_tva,
            INSERTED.total_ttc,

            INSERTED.currency,

            INSERTED.ttn_reference,
            INSERTED.ttn_transaction_id,
            INSERTED.transaction_id,

            INSERTED.qr_code_path,

            INSERTED.verification_token,
            INSERTED.verification_created_at,

            CASE
              WHEN
                INSERTED.qr_code_base64
                  IS NULL

              THEN
                0

              ELSE
                LEN(
                  INSERTED.qr_code_base64
                )
            END
              AS qr_code_base64_length,

            INSERTED.last_error_code,
            INSERTED.last_error_message,

            INSERTED.updated_at

          WHERE id =
            @invoice_id;
        `);

    if (
      result.recordset.length ===
      0
    ) {
      return res
        .status(404)
        .json({
          success: false,

          errorCode:
            "INVOICE_NOT_FOUND",

          message:
            "La facture n'a pas pu être mise à jour.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | NOTIFICATION
    |--------------------------------------------------------------------------
    */

    let notification =
      null;

    if (
      !isRegression &&
      !isTerminalLocked &&
      !isSameWorkflowState
    ) {
      try {
        const updatedInvoice =
          result.recordset[0];

        const notificationUserId =
          existingInvoice.client_id ||
          existingInvoice.created_by ||
          null;

        notification =
          await createInvoiceNotification({
            organizationId:
              existingInvoice.organization_id,

            userId:
              notificationUserId,

            invoiceId,

            invoiceNumber:
              updatedInvoice.invoice_number ||
              existingInvoice.invoice_number ||
              incomingInvoiceNumber ||
              "Facture",

            status:
              finalStatus,

            stage:
              finalStage,

            errorCode:
              effectiveErrorCode ||
              updatedInvoice.last_error_code ||
              null,

            errorMessage:
              effectiveErrorMessage ||
              updatedInvoice.last_error_message ||
              null,

            startedAt:
              existingInvoice.created_at ||
              null,

            stageProgressRatio:
              Number.isFinite(
                Number(
                  req.body?.stage_progress_ratio,
                ),
              )
                ? Math.min(
                    1,
                    Math.max(
                      0,
                      Number(
                        req.body?.stage_progress_ratio,
                      ),
                    ),
                  )
                : 0,

            actionUrl:
              `/client/invoices/${invoiceId}`,

            meta: {
              source:
                "N8N_WORKFLOW",

              requested_status:
                requestedStatus,

              requested_stage:
                requestedStage,

              applied_status:
                finalStatus,

              applied_stage:
                finalStage,

              can_retry:
                canRetry,

              error_code:
                effectiveErrorCode,

              error_message:
                effectiveErrorMessage,

              ttn_reference:
                updatedInvoice.ttn_reference ||
                req.body?.ttn_reference ||
                null,

              ttn_transaction_id:
                updatedInvoice.ttn_transaction_id ||
                req.body?.ttn_transaction_id ||
                null,

              transaction_id:
                updatedInvoice.transaction_id ||
                req.body?.transaction_id ||
                null,
            },
          });
      } catch (
        notificationError
      ) {
        console.error(
          "[workflowUpdate][notification-error]",
          notificationError.message,
        );
      }
    }

    /*
    |--------------------------------------------------------------------------
    | LOG
    |--------------------------------------------------------------------------
    */

    console.log(
      "[workflowUpdate]",
      {
        invoiceId,

        existing: {
          status:
            existingStatus,

          stage:
            existingStage,
        },

        requested: {
          status:
            requestedStatus,

          stage:
            requestedStage,
        },

        applied: {
          status:
            finalStatus,

          stage:
            finalStage,

          canRetry,
        },

        error: {
          code:
            effectiveErrorCode,

          message:
            effectiveErrorMessage,
        },

        verificationTokenCreated:
          shouldCreateVerificationToken,

        verificationUrl,

        regressionIgnored:
          isRegression,

        terminalLocked:
          isTerminalLocked,

        duplicateCallbackIgnored:
          isSameWorkflowState,
      },
    );

    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    return res
      .status(200)
      .json({
        success: true,

        message:
          isRegression
            ? `Callback ${requestedStage} ignoré car la facture est déjà à l'étape ${existingStage}.`

            : isTerminalLocked
              ? `La facture est déjà dans le statut terminal ${existingStatus}.`

              : isSameWorkflowState
                ? "Callback identique déjà appliqué, aucune nouvelle notification créée."

                : isFailureStatus
                  ? "Erreur du workflow enregistrée dans la facture."

                  : "Statut de la facture mis à jour.",

        regression_ignored:
          isRegression,

        terminal_locked:
          isTerminalLocked,

        duplicate_callback_ignored:
          isSameWorkflowState,

        workflow_failed:
          isFailureStatus,

        error_code:
          effectiveErrorCode,

        error_message:
          effectiveErrorMessage,

        can_retry:
          canRetry,

        current_stage:
          finalStage,

        status:
          finalStatus,

        verification_qr_generated:
          Boolean(
            verificationQrBase64,
          ),

        verification_token_created:
          shouldCreateVerificationToken,

        verification_token:
          result.recordset[0]
            ?.verification_token ||
          null,

        verification_url:
          verificationUrl,

        notification,

        invoice:
          result.recordset[0],
      });
  } catch (error) {
    console.error(
      "workflowUpdate error:",
      error,
    );

    if (
      error.name ===
        "RequestError" ||
      error.code ===
        "EPARAM"
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            "WORKFLOW_UPDATE_SQL_ERROR",

          message:
            "Les données envoyées par le workflow sont invalides.",

          error:
            error.message,
        });
    }

    return res
      .status(500)
      .json({
        success: false,

        errorCode:
          "WORKFLOW_UPDATE_FAILED",

        message:
          "Impossible de mettre à jour le statut de la facture.",

        error:
          error.message,
      });
  }
}

/*
|--------------------------------------------------------------------------
| XML - HELPERS
|--------------------------------------------------------------------------
*/

function buildInvoiceXmlFilename(
  invoice,
) {
  const invoiceNumber =
    String(
      invoice?.invoice_number ||
      invoice?.id ||
      "facture",
    )
      .trim()
      .replace(
        /[^a-zA-Z0-9._-]+/g,
        "-",
      );

  return `facture-${invoiceNumber}.xml`;
}

function getXmlPathCandidates(
  storedPath,
) {
  const normalizedPath =
    String(
      storedPath ||
      "",
    ).trim();

  if (!normalizedPath) {
    return [];
  }

  const candidates =
    [];

  /*
  |--------------------------------------------------------------------------
  | CHEMIN TEL QU'ENREGISTRÉ
  |--------------------------------------------------------------------------
  */

  if (
    path.isAbsolute(
      normalizedPath,
    )
  ) {
    candidates.push(
      normalizedPath,
    );
  } else {
    candidates.push(
      path.resolve(
        process.cwd(),
        normalizedPath,
      ),
    );
  }

  /*
  |--------------------------------------------------------------------------
  | MAPPING OPTIONNEL D'UN DOSSIER PARTAGÉ DOCKER
  |--------------------------------------------------------------------------
  */

  const sharedRoot =
    String(
      process.env
        .XML_SHARED_ROOT ||
      "",
    ).trim();

  if (
    sharedRoot &&
    normalizedPath
      .replace(/\\/g, "/")
      .startsWith(
        "/shared/",
      )
  ) {
    const relativeSharedPath =
      normalizedPath
        .replace(/\\/g, "/")
        .replace(
          /^\/shared\/+/,
          "",
        );

    candidates.push(
      path.resolve(
        sharedRoot,
        ...relativeSharedPath
          .split("/")
          .filter(Boolean),
      ),
    );
  }

  return [
    ...new Set(
      candidates,
    ),
  ];
}

async function findExistingXmlPath(
  storedPath,
) {
  const candidates =
    getXmlPathCandidates(
      storedPath,
    );

  for (
    const candidate
    of candidates
  ) {
    try {
      const stats =
        await fs.promises.stat(
          candidate,
        );

      if (
        stats.isFile()
      ) {
        return candidate;
      }
    } catch {
      // On essaie le candidat suivant.
    }
  }

  return null;
}

async function getAuthenticatedInvoiceXml(
  req,
) {
  const {
    organizationId,
  } =
    getAuthenticatedUser(
      req,
    );

  const invoiceId =
    String(
      req.params?.id ||
      "",
    ).trim();

  if (!invoiceId) {
    const error =
      new Error(
        "Identifiant facture manquant.",
      );

    error.statusCode =
      400;

    error.errorCode =
      "INVOICE_ID_REQUIRED";

    throw error;
  }

  const pool =
    getDatabase();

  const result =
    await pool
      .request()

      .input(
        "invoice_id",
        sql.UniqueIdentifier,
        invoiceId,
      )

      .input(
        "organization_id",
        sql.UniqueIdentifier,
        organizationId,
      )

      .query(`
        SELECT TOP 1
          id,
          invoice_number,
          status,
          current_stage,
          signed_xml_path

        FROM dbo.invoices

        WHERE
          id =
            @invoice_id

          AND organization_id =
            @organization_id;
      `);

  if (
    result.recordset.length ===
    0
  ) {
    const error =
      new Error(
        "Facture introuvable.",
      );

    error.statusCode =
      404;

    error.errorCode =
      "INVOICE_NOT_FOUND";

    throw error;
  }

  const invoice =
    result.recordset[0];

  if (
    !invoice.signed_xml_path
  ) {
    const error =
      new Error(
        "Le document XML n'est pas encore disponible pour cette facture.",
      );

    error.statusCode =
      404;

    error.errorCode =
      "INVOICE_XML_NOT_AVAILABLE";

    throw error;
  }

  const xmlPath =
    await findExistingXmlPath(
      invoice.signed_xml_path,
    );

  if (!xmlPath) {
    const error =
      new Error(
        "Le document XML est enregistré pour cette facture, mais le fichier n'est pas accessible depuis le backend.",
      );

    error.statusCode =
      404;

    error.errorCode =
      "INVOICE_XML_FILE_NOT_FOUND";

    throw error;
  }

  return {
    invoice,
    xmlPath,
  };
}

/*
|--------------------------------------------------------------------------
| XML - VOIR
|--------------------------------------------------------------------------
*/

async function viewInvoiceXml(
  req,
  res,
) {
  try {
    const {
      invoice,
      xmlPath,
    } =
      await getAuthenticatedInvoiceXml(
        req,
      );

    const filename =
      buildInvoiceXmlFilename(
        invoice,
      );

    res.set({
      "Content-Type":
        "application/xml; charset=utf-8",

      "Content-Disposition":
        `inline; filename="${filename}"`,

      "Cache-Control":
        "private, no-store, no-cache, must-revalidate",

      Pragma:
        "no-cache",

      Expires:
        "0",
    });

    return res.sendFile(
      xmlPath,
    );
  } catch (error) {
    console.error(
      "viewInvoiceXml error:",
      error,
    );

    if (
      error.code ===
        "EPARAM" ||
      error.name ===
        "RequestError"
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          errorCode:
            "INVALID_INVOICE_ID",

          message:
            "L'identifiant de la facture est invalide.",
        });
    }

    return res
      .status(
        error.statusCode ||
        500,
      )
      .json({
        success:
          false,

        errorCode:
          error.errorCode ||
          "INVOICE_XML_VIEW_FAILED",

        message:
          error.message ||
          "Impossible d'afficher le document XML.",
      });
  }
}

/*
|--------------------------------------------------------------------------
| XML - TÉLÉCHARGER
|--------------------------------------------------------------------------
*/

async function downloadInvoiceXml(
  req,
  res,
) {
  try {
    const {
      invoice,
      xmlPath,
    } =
      await getAuthenticatedInvoiceXml(
        req,
      );

    const filename =
      buildInvoiceXmlFilename(
        invoice,
      );

    res.set({
      "Content-Type":
        "application/xml; charset=utf-8",

      "Cache-Control":
        "private, no-store, no-cache, must-revalidate",

      Pragma:
        "no-cache",

      Expires:
        "0",
    });

    return res.download(
      xmlPath,
      filename,
    );
  } catch (error) {
    console.error(
      "downloadInvoiceXml error:",
      error,
    );

    if (
      error.code ===
        "EPARAM" ||
      error.name ===
        "RequestError"
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          errorCode:
            "INVALID_INVOICE_ID",

          message:
            "L'identifiant de la facture est invalide.",
        });
    }

    return res
      .status(
        error.statusCode ||
        500,
      )
      .json({
        success:
          false,

        errorCode:
          error.errorCode ||
          "INVOICE_XML_DOWNLOAD_FAILED",

        message:
          error.message ||
          "Impossible de télécharger le document XML.",
      });
  }
}

/*
|--------------------------------------------------------------------------
| VÉRIFICATION PUBLIQUE
|--------------------------------------------------------------------------
*/

async function verifyInvoiceByToken(
  req,
  res,
) {
  try {
    res.set({
      "Cache-Control":
        "no-store, no-cache, must-revalidate",

      Pragma:
        "no-cache",

      Expires:
        "0",
    });

    const verificationToken =
      String(
        req.params?.token ||
        "",
      ).trim();

    if (!verificationToken) {
      return res
        .status(400)
        .json({
          success: false,

          valid:
            false,

          errorCode:
            "VERIFICATION_TOKEN_REQUIRED",

          message:
            "Le token de vérification est obligatoire.",
        });
    }

    if (
      !/^[a-fA-F0-9]{64}$/.test(
        verificationToken,
      )
    ) {
      return res
        .status(400)
        .json({
          success: false,

          valid:
            false,

          verification_status:
            "INVALID_TOKEN",

          errorCode:
            "INVALID_VERIFICATION_TOKEN",

          message:
            "Le code de vérification est invalide.",
        });
    }

    const pool =
      getDatabase();

    const result =
      await pool
        .request()

        .input(
          "verification_token",
          sql.NVarChar(150),
          verificationToken,
        )

        .query(`
          SELECT TOP 1
            invoice_number,
            invoice_date,
            currency,

            source_type,
            source,

            supplier_identifier,
            customer_identifier,

            total_ht,
            total_tva,
            total_ttc,
            total_amount,

            extracted_data,

            status,
            current_stage,

            ttn_reference,
            ttn_transaction_id,
            transaction_id,

            verification_created_at,

            created_at,
            updated_at

          FROM dbo.invoices

          WHERE
            verification_token =
              @verification_token;
        `);

    if (
      result.recordset.length ===
      0
    ) {
      return res
        .status(404)
        .json({
          success: false,

          valid:
            false,

          verification_status:
            "NOT_FOUND",

          errorCode:
            "INVOICE_VERIFICATION_NOT_FOUND",

          message:
            "Aucune facture ne correspond à ce QR code.",
        });
    }

    const invoice =
      result.recordset[0];

    const extractedData =
      parseExtractedData(
        invoice.extracted_data,
      );

    const extractedTotals =
      extractedData?.totaux ||
      {};

    const extractedTotalHt =
      nullableNumber(
        extractedTotals.total_ht,
      );

    const extractedTotalTva =
      nullableNumber(
        extractedTotals.montant_tva ??
        extractedTotals.total_tva,
      );

    const extractedTotalTtc =
      nullableNumber(
        extractedTotals.total_ttc,
      );

    const extractedNetAPayer =
      nullableNumber(
        extractedTotals.net_a_payer ??
        extractedTotals.total_ttc,
      );

    const publicTotalHt =
      extractedTotalHt ??
      nullableNumber(
        invoice.total_ht,
      );

    const publicTotalTva =
      extractedTotalTva ??
      nullableNumber(
        invoice.total_tva,
      );

    const publicTotalTtc =
      extractedTotalTtc ??
      nullableNumber(
        invoice.total_ttc,
      );

    const publicTotalAmount =
      extractedNetAPayer ??
      nullableNumber(
        invoice.total_amount,
      );

    const status =
      String(
        invoice.status ||
          "",
      )
        .trim()
        .toUpperCase();

    const stage =
      String(
        invoice.current_stage ||
          "",
      )
        .trim()
        .toUpperCase();

    const hasTtnResult =
      Boolean(
        invoice.ttn_reference ||
        invoice.ttn_transaction_id ||
        invoice.transaction_id,
      );

    const isValid =
      status ===
        "ACCEPTED" &&
      (
        stage ===
          "TTN" ||
        hasTtnResult
      );

    if (!isValid) {
      return res
        .status(200)
        .json({
          success:
            true,

          valid:
            false,

          verification_status:
            "NOT_VALIDATED",

          message:
            "Cette facture existe, mais son traitement TTN n'est pas terminé.",

          invoice: {
            invoice_number:
              invoice.invoice_number,

            invoice_date:
              invoice.invoice_date,

            currency:
              invoice.currency,

            source_type:
              invoice.source_type,

            source:
              invoice.source,

            total_ht:
              publicTotalHt,

            total_tva:
              publicTotalTva,

            total_ttc:
              publicTotalTtc,

            total_amount:
              publicTotalAmount,

            status,

            current_stage:
              stage,

            ttn_reference:
              invoice.ttn_reference,

            transaction_id:
              invoice.ttn_transaction_id ||
              invoice.transaction_id,

            updated_at:
              invoice.updated_at,
          },
        });
    }

    return res
      .status(200)
      .json({
        success:
          true,

        valid:
          true,

        verification_status:
          "VERIFIED",

        message:
          "Facture vérifiée et acceptée par le scénario TTN.",

        invoice: {
          invoice_number:
            invoice.invoice_number,

          invoice_date:
            invoice.invoice_date,

          currency:
            invoice.currency,

          source_type:
            invoice.source_type,

          source:
            invoice.source,

          supplier_identifier:
            invoice.supplier_identifier,

          customer_identifier:
            invoice.customer_identifier,

          total_ht:
            publicTotalHt,

          total_tva:
            publicTotalTva,

          total_ttc:
            publicTotalTtc,

          total_amount:
            publicTotalAmount,

          status,

          current_stage:
            stage,

          ttn_reference:
            invoice.ttn_reference,

          transaction_id:
            invoice.ttn_transaction_id ||
            invoice.transaction_id,

          verification_created_at:
            invoice.verification_created_at,

          updated_at:
            invoice.updated_at,
        },
      });
  } catch (error) {
    console.error(
      "verifyInvoiceByToken error:",
      error,
    );

    return res
      .status(500)
      .json({
        success: false,

        valid:
          false,

        errorCode:
          "INVOICE_VERIFICATION_FAILED",

        message:
          "Impossible de vérifier cette facture.",

        error:
          error.message,
      });
  }
}


/*
|--------------------------------------------------------------------------
| DOCUMENT ORIGINAL - AFFICHAGE SÉCURISÉ
|--------------------------------------------------------------------------
|
| GET /api/invoices/:id/original
|
| - JWT obligatoire
| - contrôle organization_id
| - le chemin original_file_path reste privé
| - le fichier est envoyé inline au navigateur
|
|--------------------------------------------------------------------------
*/

async function viewInvoiceOriginal(
  req,
  res,
) {
  try {
    const {
      organizationId,
    } =
      getAuthenticatedUser(req);

    const invoiceId =
      String(
        req.params?.id ||
        "",
      ).trim();

    if (!invoiceId) {
      return res
        .status(400)
        .json({
          success: false,
          errorCode:
            "INVOICE_ID_REQUIRED",
          message:
            "Identifiant facture manquant.",
        });
    }

    const pool =
      getDatabase();

    const result =
      await pool
        .request()
        .input(
          "invoice_id",
          sql.UniqueIdentifier,
          invoiceId,
        )
        .input(
          "organization_id",
          sql.UniqueIdentifier,
          organizationId,
        )
        .query(`
          SELECT TOP 1
            id,
            invoice_number,
            source_type,
            source,
            original_filename,
            original_file_path
          FROM dbo.invoices
          WHERE
            id = @invoice_id
            AND organization_id = @organization_id;
        `);

    if (
      result.recordset.length ===
      0
    ) {
      return res
        .status(404)
        .json({
          success: false,
          errorCode:
            "INVOICE_NOT_FOUND",
          message:
            "Facture introuvable.",
        });
    }

    const invoice =
      result.recordset[0];

    const storedPath =
      String(
        invoice.original_file_path ||
        "",
      ).trim();

    if (!storedPath) {
      return res
        .status(404)
        .json({
          success: false,
          errorCode:
            "ORIGINAL_DOCUMENT_NOT_AVAILABLE",
          message:
            "Aucun document original n'est disponible pour cette facture.",
        });
    }

    const resolvedPath =
      path.resolve(
        storedPath,
      );

    if (
      !fs.existsSync(
        resolvedPath,
      )
    ) {
      return res
        .status(404)
        .json({
          success: false,
          errorCode:
            "ORIGINAL_DOCUMENT_NOT_FOUND",
          message:
            "Le document original enregistré est introuvable sur le serveur.",
        });
    }

    const stats =
      fs.statSync(
        resolvedPath,
      );

    if (!stats.isFile()) {
      return res
        .status(404)
        .json({
          success: false,
          errorCode:
            "ORIGINAL_DOCUMENT_INVALID",
          message:
            "Le document original enregistré n'est pas un fichier valide.",
        });
    }

    const fallbackFilename =
      invoice.invoice_number
        ? `facture-${invoice.invoice_number}`
        : `facture-${invoice.id}`;

    const filename =
      String(
        invoice.original_filename ||
        path.basename(
          resolvedPath,
        ) ||
        fallbackFilename,
      )
        .replace(
          /[\r\n"]/g,
          "",
        )
        .trim();

    const extension =
      path
        .extname(
          filename ||
          resolvedPath,
        )
        .toLowerCase();

    const contentTypes = {
      ".pdf":
        "application/pdf",
      ".png":
        "image/png",
      ".jpg":
        "image/jpeg",
      ".jpeg":
        "image/jpeg",
      ".webp":
        "image/webp",
    };

    const contentType =
      contentTypes[
        extension
      ] ||
      "application/octet-stream";

    res.set({
      "Cache-Control":
        "private, no-store, no-cache, must-revalidate",
      Pragma:
        "no-cache",
      Expires:
        "0",
      "Content-Type":
        contentType,
      "Content-Disposition":
        `inline; filename*=UTF-8''${encodeURIComponent(
          filename ||
          fallbackFilename,
        )}`,
      "X-Content-Type-Options":
        "nosniff",
    });

    return res.sendFile(
      resolvedPath,
      (
        sendError,
      ) => {
        if (
          sendError &&
          !res.headersSent
        ) {
          console.error(
            "viewInvoiceOriginal sendFile error:",
            sendError,
          );

          res
            .status(500)
            .json({
              success:
                false,
              errorCode:
                "ORIGINAL_DOCUMENT_READ_FAILED",
              message:
                "Impossible de lire le document original.",
            });
        }
      },
    );
  } catch (error) {
    console.error(
      "viewInvoiceOriginal error:",
      error,
    );

    if (
      error.code ===
      "EPARAM"
    ) {
      return res
        .status(400)
        .json({
          success: false,
          errorCode:
            "INVALID_INVOICE_ID",
          message:
            "L'identifiant de la facture est invalide.",
          error:
            error.message,
        });
    }

    return res
      .status(500)
      .json({
        success: false,
        errorCode:
          "ORIGINAL_DOCUMENT_FAILED",
        message:
          "Impossible de charger le document original.",
        error:
          error.message,
      });
  }
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  uploadInvoice,
  importInvoiceFromErp,
  getInvoices,
  getInvoiceById,
  updateInvoiceById,
  humanCorrectionInvoice,
  approveExtractionById,
  retryInvoiceById,
  retryErpInvoiceById,
  deleteInvoiceById,
  workflowUpdate,
  verifyInvoiceByToken,
  viewInvoiceOriginal,
  viewInvoiceXml,
  downloadInvoiceXml,
};