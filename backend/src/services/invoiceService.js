const sql = require('mssql');

const {
  getPool,
} = require('../database/sqlServer');

/*
|--------------------------------------------------------------------------
| WORKFLOW
|--------------------------------------------------------------------------
*/

const WORKFLOW_STAGES = [
  'IMPORT',
  'EXTRACTION',
  'VALIDATION',
  'TEIF',
  'SIGNATURE',
  'TTN',
];

const PROCESSING_STATUSES =
  new Set([
    'UPLOADED',
    'PROCESSING',
    'PENDING_REVIEW',
    'VALIDATED',
    'SIGNING',
    'SIGNED',
    'SUBMITTED',
    'PENDING',
    'PENDING_RETRY',
  ]);

/*
|--------------------------------------------------------------------------
| NORMALISATION
|--------------------------------------------------------------------------
*/

function normalizeStatus(status) {
  return String(
    status || '',
  )
    .trim()
    .toUpperCase();
}

function normalizeStage(stage) {
  const normalized =
    String(
      stage || 'IMPORT',
    )
      .trim()
      .toUpperCase();

  return WORKFLOW_STAGES.includes(
    normalized,
  )
    ? normalized
    : 'IMPORT';
}

/*
|--------------------------------------------------------------------------
| STATUS MAPPING
|--------------------------------------------------------------------------
*/

function mapStatus(status) {
  const normalizedStatus =
    normalizeStatus(status);

  const mapping = {
    ACCEPTED: {
      label: 'Acceptée',
      tone: 'accepted',
    },

    UPLOADED: {
      label: 'Importée',
      tone: 'pending',
    },

    PROCESSING: {
      label: 'En traitement',
      tone: 'pending',
    },

    PENDING: {
      label: 'En attente',
      tone: 'pending',
    },

    PENDING_REVIEW: {
      label: 'À vérifier',
      tone: 'pending',
    },

    VALIDATED: {
      label: 'Validée',
      tone: 'pending',
    },

    SIGNING: {
      label: 'Signature en cours',
      tone: 'pending',
    },

    SIGNED: {
      label: 'Signée',
      tone: 'pending',
    },

    SUBMITTED: {
      label: 'Transmise à TTN',
      tone: 'pending',
    },

    PENDING_RETRY: {
      label: 'Nouvelle tentative',
      tone: 'pending',
    },

    REJECTED: {
      label: 'Rejetée',
      tone: 'rejected',
    },

    ERROR: {
      label: 'Erreur',
      tone: 'rejected',
    },
  };

  return (
    mapping[
      normalizedStatus
    ] || {
      label:
        normalizedStatus ||
        'Inconnu',

      tone:
        'pending',
    }
  );
}

/*
|--------------------------------------------------------------------------
| FORMAT DATE
|--------------------------------------------------------------------------
*/

function formatDate(value) {
  if (!value) {
    return '—';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '—';
  }

  return date.toLocaleDateString(
    'fr-FR',
  );
}

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '—';
  }

  return date.toLocaleString(
    'fr-FR',
  );
}

/*
|--------------------------------------------------------------------------
| DASHBOARD CLIENT
|--------------------------------------------------------------------------
*/

async function buildClientDashboard({
  clientId,
  organizationId,
}) {
  const pool =
    await getPool();

  const request =
    pool.request();

  request.input(
    'clientId',
    sql.UniqueIdentifier,
    clientId,
  );

  request.input(
    'organizationId',
    sql.UniqueIdentifier,
    organizationId || null,
  );

  const result =
    await request.query(`
      ;WITH InvoiceCandidates AS (
        SELECT
          id,

          organization_id,
          client_id,

          invoice_number,

          supplier_identifier,
          customer_identifier,

          customer_name,

          source,
          currency,

          total_amount,
          total_ht,
          total_tva,
          total_ttc,

          status,
          current_stage,

          rejection_reason,
          last_error_code,
          last_error_message,

          can_retry,

          created_at,
          updated_at,

          transaction_id,
          ttn_reference,

          /*
          |--------------------------------------------------------------------------
          | CLÉ DE DÉDOUBLONNAGE
          |--------------------------------------------------------------------------
          |
          | Pour une vraie facture :
          | organisation + numéro + fournisseur
          |
          | Pour une facture PENDING :
          | son ID propre afin de ne pas fusionner deux imports différents.
          |--------------------------------------------------------------------------
          */

          CASE
            WHEN
              invoice_number IS NULL

              OR LTRIM(
                RTRIM(
                  invoice_number
                )
              ) = ''

              OR UPPER(
                LTRIM(
                  RTRIM(
                    invoice_number
                  )
                )
              ) LIKE 'PENDING-%'

            THEN
              CONCAT(
                'ID|',
                CONVERT(
                  NVARCHAR(36),
                  id
                )
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
          END AS duplicate_key,

          /*
          |--------------------------------------------------------------------------
          | PRIORITÉ STATUS
          |--------------------------------------------------------------------------
          */

          CASE
            WHEN UPPER(
              LTRIM(
                RTRIM(
                  COALESCE(
                    status,
                    ''
                  )
                )
              )
            ) = 'ACCEPTED'
            THEN 100

            WHEN UPPER(
              LTRIM(
                RTRIM(
                  COALESCE(
                    status,
                    ''
                  )
                )
              )
            ) = 'REJECTED'
            THEN 95

            WHEN UPPER(
              LTRIM(
                RTRIM(
                  COALESCE(
                    status,
                    ''
                  )
                )
              )
            ) = 'SUBMITTED'
            THEN 90

            WHEN UPPER(
              LTRIM(
                RTRIM(
                  COALESCE(
                    status,
                    ''
                  )
                )
              )
            ) = 'SIGNED'
            THEN 85

            WHEN UPPER(
              LTRIM(
                RTRIM(
                  COALESCE(
                    status,
                    ''
                  )
                )
              )
            ) = 'SIGNING'
            THEN 80

            WHEN UPPER(
              LTRIM(
                RTRIM(
                  COALESCE(
                    status,
                    ''
                  )
                )
              )
            ) = 'VALIDATED'
            THEN 70

            WHEN UPPER(
              LTRIM(
                RTRIM(
                  COALESCE(
                    status,
                    ''
                  )
                )
              )
            ) = 'PENDING_REVIEW'
            THEN 60

            WHEN UPPER(
              LTRIM(
                RTRIM(
                  COALESCE(
                    status,
                    ''
                  )
                )
              )
            ) = 'PENDING_RETRY'
            THEN 55

            WHEN UPPER(
              LTRIM(
                RTRIM(
                  COALESCE(
                    status,
                    ''
                  )
                )
              )
            ) = 'ERROR'
            THEN 50

            WHEN UPPER(
              LTRIM(
                RTRIM(
                  COALESCE(
                    status,
                    ''
                  )
                )
              )
            ) = 'PROCESSING'
            THEN 40

            WHEN UPPER(
              LTRIM(
                RTRIM(
                  COALESCE(
                    status,
                    ''
                  )
                )
              )
            ) = 'UPLOADED'
            THEN 20

            ELSE 10
          END AS status_priority,

          /*
          |--------------------------------------------------------------------------
          | PRIORITÉ STAGE
          |--------------------------------------------------------------------------
          */

          CASE
            WHEN UPPER(
              LTRIM(
                RTRIM(
                  COALESCE(
                    current_stage,
                    ''
                  )
                )
              )
            ) = 'TTN'
            THEN 6

            WHEN UPPER(
              LTRIM(
                RTRIM(
                  COALESCE(
                    current_stage,
                    ''
                  )
                )
              )
            ) = 'SIGNATURE'
            THEN 5

            WHEN UPPER(
              LTRIM(
                RTRIM(
                  COALESCE(
                    current_stage,
                    ''
                  )
                )
              )
            ) = 'TEIF'
            THEN 4

            WHEN UPPER(
              LTRIM(
                RTRIM(
                  COALESCE(
                    current_stage,
                    ''
                  )
                )
              )
            ) = 'VALIDATION'
            THEN 3

            WHEN UPPER(
              LTRIM(
                RTRIM(
                  COALESCE(
                    current_stage,
                    ''
                  )
                )
              )
            ) = 'EXTRACTION'
            THEN 2

            ELSE 1
          END AS stage_priority

        FROM dbo.invoices

        WHERE
          client_id =
            @clientId

          OR (
            @organizationId
              IS NOT NULL

            AND organization_id =
              @organizationId
          )
      ),

      InvoiceWithDuplicates AS (
        SELECT
          *,

          COUNT(*) OVER (
            PARTITION BY
              duplicate_key
          ) AS duplicate_count

        FROM InvoiceCandidates
      ),

      RankedInvoices AS (
        SELECT
          *,

          ROW_NUMBER() OVER (
            PARTITION BY
              duplicate_key

            ORDER BY
              status_priority DESC,
              stage_priority DESC,
              updated_at DESC,
              created_at DESC
          ) AS row_number

        FROM InvoiceWithDuplicates
      )

      SELECT
        id,

        invoice_number,

        supplier_identifier,
        customer_identifier,

        customer_name,

        source,
        currency,

        total_amount,
        total_ht,
        total_tva,
        total_ttc,

        status,
        current_stage,

        rejection_reason,
        last_error_code,
        last_error_message,

        can_retry,

        created_at,
        updated_at,

        transaction_id,
        ttn_reference,

        duplicate_count

      FROM RankedInvoices

      WHERE
        row_number = 1

      ORDER BY
        updated_at DESC,
        created_at DESC;
    `);

  const rows =
    result.recordset || [];

  const normalizedRows =
    rows.map(
      (invoice) => ({
        ...invoice,

        status:
          normalizeStatus(
            invoice.status,
          ),

        current_stage:
          normalizeStage(
            invoice.current_stage,
          ),
      }),
    );

  /*
  |--------------------------------------------------------------------------
  | STATS
  |--------------------------------------------------------------------------
  */

  const total =
    normalizedRows.length;

  const accepted =
    normalizedRows.filter(
      (invoice) =>
        invoice.status ===
        'ACCEPTED',
    ).length;

  const pending =
    normalizedRows.filter(
      (invoice) =>
        PROCESSING_STATUSES.has(
          invoice.status,
        ),
    ).length;

  const rejected =
    normalizedRows.filter(
      (invoice) =>
        [
          'REJECTED',
          'ERROR',
        ].includes(
          invoice.status,
        ),
    ).length;

  const percentage = (
    value,
  ) =>
    total > 0
      ? Math.round(
          (
            value /
            total
          ) * 100,
        )
      : 0;

  /*
  |--------------------------------------------------------------------------
  | TRAITEMENT ACTUEL
  |--------------------------------------------------------------------------
  */

  const processingRows =
    normalizedRows
      .filter(
        (invoice) =>
          PROCESSING_STATUSES.has(
            invoice.status,
          ),
      )
      .sort(
        (
          invoiceA,
          invoiceB,
        ) => {
          const stageA =
            WORKFLOW_STAGES.indexOf(
              invoiceA.current_stage,
            );

          const stageB =
            WORKFLOW_STAGES.indexOf(
              invoiceB.current_stage,
            );

          if (
            stageA !==
            stageB
          ) {
            return (
              stageB -
              stageA
            );
          }

          return (
            new Date(
              invoiceB.updated_at ||
                invoiceB.created_at,
            ).getTime() -
            new Date(
              invoiceA.updated_at ||
                invoiceA.created_at,
            ).getTime()
          );
        },
      );

  const currentProcessingRow =
    processingRows[0] ||
    null;

  return {
    stats: [
      {
        id: 'total',
        label:
          'Factures totales',
        value:
          total,
        detail:
          'Toutes les factures',
        tone:
          'primary',
        symbol:
          '∑',
      },

      {
        id: 'accepted',
        label:
          'Acceptées',
        value:
          accepted,
        detail:
          `${percentage(
            accepted,
          )}% du total`,
        tone:
          'success',
        symbol:
          '✓',
      },

      {
        id: 'pending',
        label:
          'En attente',
        value:
          pending,
        detail:
          'Traitement en cours',
        tone:
          'warning',
        symbol:
          '…',
      },

      {
        id: 'rejected',
        label:
          'Rejetées',
        value:
          rejected,
        detail:
          'Action requise',
        tone:
          'danger',
        symbol:
          '!',
      },
    ],

    statusOverview: [
      {
        id: 'accepted',
        label:
          'Acceptées',
        value:
          accepted,
        percentage:
          percentage(
            accepted,
          ),
        tone:
          'success',
      },

      {
        id: 'pending',
        label:
          'En attente',
        value:
          pending,
        percentage:
          percentage(
            pending,
          ),
        tone:
          'warning',
      },

      {
        id: 'rejected',
        label:
          'Rejetées',
        value:
          rejected,
        percentage:
          percentage(
            rejected,
          ),
        tone:
          'danger',
      },
    ],

    currentProcessing:
      currentProcessingRow
        ? mapProcessingInvoice(
            currentProcessingRow,
          )
        : null,

    recentInvoices:
      normalizedRows
        .slice(0, 10)
        .map(
          mapInvoice,
        ),

    quickActions: [
      {
        id: 'upload',
        title:
          'Importer une facture',
        description:
          'PDF, image ou document scanné',
        path:
          '/client/invoices/upload',
        symbol:
          '+',
        tone:
          'primary',
      },

      {
        id: 'invoices',
        title:
          'Voir mes factures',
        description:
          'Consulter tous les statuts',
        path:
          '/client/invoices',
        symbol:
          '≡',
        tone:
          'neutral',
      },

      {
        id: 'rejected',
        title:
          'Corriger les rejets',
        description:
          'Afficher les factures à corriger',
        path:
          '/client/invoices?status=rejected',
        symbol:
          '!',
        tone:
          'danger',
      },
    ],
  };
}

/*
|--------------------------------------------------------------------------
| SUPPRIMER LES DOUBLONS D'UNE FACTURE
|--------------------------------------------------------------------------
|
| IMPORTANT :
|
| invoiceId = ligne affichée actuellement dans le Dashboard.
|
| Cette ligne est conservée.
| Les autres lignes avec le même :
|
| - organization
| - invoice_number
| - supplier_identifier
|
| sont supprimées.
|--------------------------------------------------------------------------
*/

async function deleteInvoiceDuplicates({
  clientId,
  organizationId,
  invoiceId,
}) {
  const pool =
    await getPool();

  /*
  |--------------------------------------------------------------------------
  | RÉCUPÉRER LA FACTURE À CONSERVER
  |--------------------------------------------------------------------------
  */

  const targetRequest =
    pool.request();

  targetRequest.input(
    'invoiceId',
    sql.UniqueIdentifier,
    invoiceId,
  );

  targetRequest.input(
    'clientId',
    sql.UniqueIdentifier,
    clientId,
  );

  targetRequest.input(
    'organizationId',
    sql.UniqueIdentifier,
    organizationId || null,
  );

  const targetResult =
    await targetRequest.query(`
      SELECT TOP 1
        id,
        organization_id,
        client_id,
        invoice_number,
        supplier_identifier,
        status,
        current_stage

      FROM dbo.invoices

      WHERE
        id =
          @invoiceId

        AND (
          client_id =
            @clientId

          OR (
            @organizationId
              IS NOT NULL

            AND organization_id =
              @organizationId
          )
        );
    `);

  if (
    targetResult.recordset.length ===
    0
  ) {
    const error =
      new Error(
        'Facture introuvable.',
      );

    error.statusCode =
      404;

    throw error;
  }

  const target =
    targetResult.recordset[0];

  const invoiceNumber =
    String(
      target.invoice_number ||
        '',
    ).trim();

  if (
    !invoiceNumber ||
    invoiceNumber
      .toUpperCase()
      .startsWith(
        'PENDING-',
      )
  ) {
    const error =
      new Error(
        'Cette facture ne possède pas encore de numéro valide permettant de rechercher les doublons.',
      );

    error.statusCode =
      400;

    throw error;
  }

  /*
  |--------------------------------------------------------------------------
  | SUPPRESSION
  |--------------------------------------------------------------------------
  */

  const deleteRequest =
    pool.request();

  deleteRequest.input(
    'invoiceId',
    sql.UniqueIdentifier,
    invoiceId,
  );

  deleteRequest.input(
    'clientId',
    sql.UniqueIdentifier,
    clientId,
  );

  deleteRequest.input(
    'organizationId',
    sql.UniqueIdentifier,
    organizationId || null,
  );

  deleteRequest.input(
    'invoiceNumber',
    sql.NVarChar(100),
    invoiceNumber,
  );

  deleteRequest.input(
    'supplierIdentifier',
    sql.NVarChar(100),
    target.supplier_identifier ||
      '',
  );

  const deleteResult =
    await deleteRequest.query(`
      DELETE FROM dbo.invoices

      OUTPUT
        DELETED.id,
        DELETED.invoice_number,
        DELETED.status,
        DELETED.current_stage

      WHERE
        id <>
          @invoiceId

        AND UPPER(
          LTRIM(
            RTRIM(
              COALESCE(
                invoice_number,
                ''
              )
            )
          )
        ) =
        UPPER(
          LTRIM(
            RTRIM(
              @invoiceNumber
            )
          )
        )

        AND UPPER(
          LTRIM(
            RTRIM(
              COALESCE(
                supplier_identifier,
                ''
              )
            )
          )
        ) =
        UPPER(
          LTRIM(
            RTRIM(
              COALESCE(
                @supplierIdentifier,
                ''
              )
            )
          )
        )

        AND (
          client_id =
            @clientId

          OR (
            @organizationId
              IS NOT NULL

            AND organization_id =
              @organizationId
          )
        );
    `);

  const deletedRows =
    deleteResult.recordset ||
    [];

  return {
    invoiceId:
      target.id,

    invoiceNumber,

    deletedCount:
      deletedRows.length,

    deletedInvoices:
      deletedRows,
  };
}

/*
|--------------------------------------------------------------------------
| MAP INVOICE
|--------------------------------------------------------------------------
*/

function mapInvoice(invoice) {
  const mappedStatus =
    mapStatus(
      invoice.status,
    );

  const rawAmount =
    invoice.total_amount ??
    invoice.total_ttc;

  const amount =
    rawAmount == null
      ? 'Non renseigné'
      : `${Number(
          rawAmount,
        ).toLocaleString(
          'fr-FR',
          {
            minimumFractionDigits:
              2,

            maximumFractionDigits:
              3,
          },
        )} ${
          invoice.currency ||
          ''
        }`.trim();

  const rawInvoiceNumber =
    invoice.invoice_number
      ? String(
          invoice.invoice_number,
        ).trim()
      : '';

  const invoiceNumber =
    rawInvoiceNumber &&
    !rawInvoiceNumber
      .toUpperCase()
      .startsWith(
        'PENDING-',
      )
      ? rawInvoiceNumber
      : null;

  const duplicateCount =
    Number(
      invoice.duplicate_count ||
        1,
    );

  return {
    id:
      invoice.id,

    number:
      invoiceNumber,

    customer:
      invoice.customer_name ||
      invoice.customer_identifier ||
      '—',

    date:
      formatDate(
        invoice.created_at,
      ),

    amount,

    source:
      invoice.source ||
      'PDF',

    status:
      mappedStatus.tone,

    statusLabel:
      mappedStatus.label,

    currentStage:
      invoice.current_stage,

    reason:
      invoice.rejection_reason ||
      invoice.last_error_message ||
      null,

    errorCode:
      invoice.last_error_code ||
      null,

    canRetry:
      Boolean(
        invoice.can_retry,
      ),

    transactionId:
      invoice.transaction_id,

    ttnReference:
      invoice.ttn_reference,

    duplicateCount,

    duplicateCopies:
      Math.max(
        duplicateCount - 1,
        0,
      ),

    hasDuplicates:
      Boolean(
        invoiceNumber &&
          duplicateCount > 1,
      ),
  };
}

/*
|--------------------------------------------------------------------------
| PIPELINE
|--------------------------------------------------------------------------
*/

function mapProcessingInvoice(
  invoice,
) {
  const currentStage =
    normalizeStage(
      invoice.current_stage,
    );

  const status =
    normalizeStatus(
      invoice.status,
    );

  const currentStageIndex =
    Math.max(
      WORKFLOW_STAGES.indexOf(
        currentStage,
      ),
      0,
    );

  const isError =
    [
      'ERROR',
      'REJECTED',
    ].includes(status);

  const isRetry =
    status ===
    'PENDING_RETRY';

  function getStepDescription(
    stepIndex,
    completedText,
    activeText,
  ) {
    if (
      stepIndex <
      currentStageIndex
    ) {
      return completedText;
    }

    if (
      stepIndex >
      currentStageIndex
    ) {
      return 'En attente';
    }

    if (isError) {
      return 'Erreur à cette étape';
    }

    if (isRetry) {
      return 'Nouvelle tentative en attente';
    }

    return activeText;
  }

  return {
    id:
      invoice.id,

    invoiceNumber:
      invoice.invoice_number,

    source:
      invoice.source ||
      'PDF',

    status,

    currentStage,

    currentStep:
      currentStageIndex +
      1,

    progress:
      Math.round(
        (
          currentStageIndex /
          (
            WORKFLOW_STAGES.length -
            1
          )
        ) * 100,
      ),

    updatedAt:
      formatDateTime(
        invoice.updated_at,
      ),

    canRetry:
      Boolean(
        invoice.can_retry,
      ),

    errorMessage:
      invoice.last_error_message ||
      invoice.rejection_reason ||
      null,

    steps: [
      {
        id: 1,
        label: 'Import',

        description:
          getStepDescription(
            0,
            'Fichier reçu',
            'Import du fichier',
          ),
      },

      {
        id: 2,
        label: 'Extraction',

        description:
          getStepDescription(
            1,
            'Données extraites',
            'Extraction en cours',
          ),
      },

      {
        id: 3,
        label: 'Validation',

        description:
          getStepDescription(
            2,
            'Contrôles terminés',
            'Validation en cours',
          ),
      },

      {
        id: 4,
        label: 'TEIF',

        description:
          getStepDescription(
            3,
            'XML TEIF généré',
            'Génération TEIF en cours',
          ),
      },

      {
        id: 5,
        label: 'Signature',

        description:
          getStepDescription(
            4,
            'Signature terminée',
            'Signature électronique en cours',
          ),
      },

      {
        id: 6,
        label: 'TTN',

        description:
          getStepDescription(
            5,
            status ===
              'ACCEPTED'
              ? 'Facture acceptée'
              : 'Transmission effectuée',
            'Transmission TTN en cours',
          ),
      },
    ],
  };
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  buildClientDashboard,
  deleteInvoiceDuplicates,
};