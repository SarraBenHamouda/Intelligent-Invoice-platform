const {
  sql,
  getDatabase,
} = require("../config/database");

const {
  createInvoiceNotification,
} = require("./notification.service");

/*
|--------------------------------------------------------------------------
| CONFIGURATION
|--------------------------------------------------------------------------
*/

const WORKFLOW_TIMEOUT_MS =
  Number(
    process.env.WORKFLOW_TIMEOUT_MS ||
      120000,
  );

const WORKFLOW_WATCH_INTERVAL_MS =
  Number(
    process.env.WORKFLOW_WATCH_INTERVAL_MS ||
      15000,
  );

/*
|--------------------------------------------------------------------------
| STATUTS SURVEILLÉS
|--------------------------------------------------------------------------
|
| On surveille uniquement les statuts correspondant
| à un traitement automatique.
|
| PENDING_REVIEW n'est volontairement pas inclus :
| l'utilisateur peut avoir besoin de temps pour corriger la facture.
|
|--------------------------------------------------------------------------
*/

const WATCHED_STATUSES = [
  "UPLOADED",
  "PROCESSING",
  "VALIDATED",
  "SIGNING",
  "SIGNED",
  "SUBMITTED",
];

/*
|--------------------------------------------------------------------------
| TIMER
|--------------------------------------------------------------------------
*/

let timeoutWatcher = null;
let watcherRunning = false;

/*
|--------------------------------------------------------------------------
| MESSAGE PAR ÉTAPE
|--------------------------------------------------------------------------
*/

function buildTimeoutMessage(
  stage,
) {
  const normalizedStage =
    String(
      stage ||
        "IMPORT",
    )
      .trim()
      .toUpperCase();

  const labels = {
    IMPORT:
      "l'import",

    EXTRACTION:
      "l'extraction",

    VALIDATION:
      "la validation",

    TEIF:
      "la génération TEIF",

    SIGNATURE:
      "la signature électronique",

    TTN:
      "la transmission TTN",
  };

  const label =
    labels[
      normalizedStage
    ] ||
    normalizedStage;

  return (
    `Le traitement a été automatiquement rejeté : ` +
    `aucune nouvelle réponse du workflow n8n n'a été reçue pendant plus de 2 minutes à l'étape ${label}.`
  );
}

/*
|--------------------------------------------------------------------------
| VÉRIFIER LES FACTURES BLOQUÉES
|--------------------------------------------------------------------------
*/

async function checkWorkflowTimeouts() {
  /*
  |--------------------------------------------------------------------------
  | ÉVITER DE LANCER DEUX CONTRÔLES EN MÊME TEMPS
  |--------------------------------------------------------------------------
  */

  if (watcherRunning) {
    return;
  }

  watcherRunning =
    true;

  try {
    const pool =
      getDatabase();

    /*
    |--------------------------------------------------------------------------
    | RECHERCHE
    |--------------------------------------------------------------------------
    |
    | updated_at représente la dernière activité connue
    | du workflow dans notre plateforme.
    |
    |--------------------------------------------------------------------------
    */

    const timeoutSeconds =
      Math.max(
        1,
        Math.floor(
          WORKFLOW_TIMEOUT_MS /
            1000,
        ),
      );

    const result =
      await pool
        .request()

        .input(
          "timeout_seconds",
          sql.Int,
          timeoutSeconds,
        )

        .query(`
          SELECT
            id,
            organization_id,
            client_id,
            created_by,

            invoice_number,
            source_type,
            source,

            status,
            current_stage,

            created_at,
            updated_at

          FROM dbo.invoices

          WHERE
            status IN (
              'UPLOADED',
              'PROCESSING',
              'VALIDATED',
              'SIGNING',
              'SIGNED',
              'SUBMITTED'
            )

            AND updated_at IS NOT NULL

            AND DATEDIFF(
              SECOND,
              updated_at,
              SYSUTCDATETIME()
            ) >= @timeout_seconds;
        `);

    const invoices =
      result.recordset ||
      [];

    if (
      invoices.length ===
      0
    ) {
      return;
    }

    console.warn(
      "[workflow-timeout] factures bloquées:",
      invoices.length,
    );

    /*
    |--------------------------------------------------------------------------
    | TRAITER CHAQUE FACTURE
    |--------------------------------------------------------------------------
    */

    for (
      const invoice
      of invoices
    ) {
      try {
        const invoiceId =
          invoice.id;

        const stage =
          String(
            invoice.current_stage ||
              "IMPORT",
          )
            .trim()
            .toUpperCase();

        const previousStatus =
          String(
            invoice.status ||
              "",
          )
            .trim()
            .toUpperCase();

        const errorCode =
          "WORKFLOW_STAGE_TIMEOUT";

        const errorMessage =
          buildTimeoutMessage(
            stage,
          );

        /*
        |--------------------------------------------------------------------------
        | UPDATE ATOMIQUE
        |--------------------------------------------------------------------------
        |
        | Le WHERE vérifie encore que la facture est active.
        |
        | Donc si un callback n8n est arrivé entre le SELECT et cet UPDATE,
        | on évite de rejeter une facture déjà ACCEPTED.
        |
        |--------------------------------------------------------------------------
        */

        const updateResult =
          await pool
            .request()

            .input(
              "invoice_id",
              sql.UniqueIdentifier,
              invoiceId,
            )

            .input(
              "timeout_seconds",
              sql.Int,
              timeoutSeconds,
            )

            .input(
              "error_code",
              sql.NVarChar(100),
              errorCode,
            )

            .input(
              "error_message",
              sql.NVarChar(
                sql.MAX,
              ),
              errorMessage,
            )

            .query(`
              UPDATE dbo.invoices

              SET
                status =
                  'REJECTED',

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

              OUTPUT
                INSERTED.id,
                INSERTED.organization_id,
                INSERTED.client_id,
                INSERTED.created_by,

                INSERTED.invoice_number,

                INSERTED.status,
                INSERTED.current_stage,
                INSERTED.can_retry,

                INSERTED.rejection_reason,
                INSERTED.last_error_code,
                INSERTED.last_error_message,

                INSERTED.updated_at

              WHERE
                id =
                  @invoice_id

                AND status IN (
                  'UPLOADED',
                  'PROCESSING',
                  'VALIDATED',
                  'SIGNING',
                  'SIGNED',
                  'SUBMITTED'
                )

                AND DATEDIFF(
                  SECOND,
                  updated_at,
                  SYSUTCDATETIME()
                ) >= @timeout_seconds;
            `);

        const updatedInvoice =
          updateResult
            .recordset?.[0] ||
          null;

        /*
        |--------------------------------------------------------------------------
        | RIEN À FAIRE
        |--------------------------------------------------------------------------
        |
        | Cela signifie généralement qu'un callback n8n
        | est arrivé juste avant notre UPDATE.
        |
        |--------------------------------------------------------------------------
        */

        if (!updatedInvoice) {
          continue;
        }

        console.warn(
          "[workflow-timeout][rejected]",
          {
            invoiceId,

            invoiceNumber:
              updatedInvoice.invoice_number,

            previousStatus,

            stage,

            timeoutSeconds,
          },
        );

        /*
        |--------------------------------------------------------------------------
        | NOTIFICATION
        |--------------------------------------------------------------------------
        */

        try {
          const notificationUserId =
            updatedInvoice.client_id ||
            updatedInvoice.created_by ||
            null;

          if (
            notificationUserId
          ) {
            await createInvoiceNotification({
              organizationId:
                updatedInvoice.organization_id,

              userId:
                notificationUserId,

              invoiceId,

              invoiceNumber:
                updatedInvoice.invoice_number ||
                "Facture",

              status:
                "REJECTED",

              stage,

              errorCode,

              errorMessage,

              startedAt:
                invoice.created_at ||
                null,

              actionUrl:
                `/client/invoices/${invoiceId}`,

              meta: {
                source:
                  "WORKFLOW_TIMEOUT_WATCHER",

                automatic_rejection:
                  true,

                previous_status:
                  previousStatus,

                current_stage:
                  stage,

                timeout_seconds:
                  timeoutSeconds,
              },
            });
          }
        } catch (
          notificationError
        ) {
          console.error(
            "[workflow-timeout][notification-error]",
            {
              invoiceId,

              message:
                notificationError.message,
            },
          );
        }
      } catch (
        invoiceError
      ) {
        console.error(
          "[workflow-timeout][invoice-error]",
          {
            invoiceId:
              invoice?.id,

            message:
              invoiceError.message,
          },
        );
      }
    }
  } catch (error) {
    console.error(
      "[workflow-timeout][check-error]",
      error,
    );
  } finally {
    watcherRunning =
      false;
  }
}

/*
|--------------------------------------------------------------------------
| START
|--------------------------------------------------------------------------
*/

function startWorkflowTimeoutWatcher() {
  if (timeoutWatcher) {
    return timeoutWatcher;
  }

  console.log(
    "[workflow-timeout] watcher started",
    {
      timeoutMs:
        WORKFLOW_TIMEOUT_MS,

      intervalMs:
        WORKFLOW_WATCH_INTERVAL_MS,
    },
  );

  /*
  |--------------------------------------------------------------------------
  | PREMIER CONTRÔLE
  |--------------------------------------------------------------------------
  */

  setTimeout(() => {
    checkWorkflowTimeouts();
  }, 3000);

  /*
  |--------------------------------------------------------------------------
  | CONTRÔLE PÉRIODIQUE
  |--------------------------------------------------------------------------
  */

  timeoutWatcher =
    setInterval(
      checkWorkflowTimeouts,
      WORKFLOW_WATCH_INTERVAL_MS,
    );

  /*
  |--------------------------------------------------------------------------
  | NE PAS EMPÊCHER NODE DE SE FERMER
  |--------------------------------------------------------------------------
  */

  if (
    typeof timeoutWatcher.unref ===
    "function"
  ) {
    timeoutWatcher.unref();
  }

  return timeoutWatcher;
}

/*
|--------------------------------------------------------------------------
| STOP
|--------------------------------------------------------------------------
*/

function stopWorkflowTimeoutWatcher() {
  if (!timeoutWatcher) {
    return;
  }

  clearInterval(
    timeoutWatcher,
  );

  timeoutWatcher =
    null;

  console.log(
    "[workflow-timeout] watcher stopped",
  );
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  checkWorkflowTimeouts,
  startWorkflowTimeoutWatcher,
  stopWorkflowTimeoutWatcher,
};