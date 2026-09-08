/*
|--------------------------------------------------------------------------
| NOTIFICATION SERVICE
|--------------------------------------------------------------------------
|
| Responsabilités :
| - créer une notification
| - créer une notification liée à une facture
| - récupérer les notifications d'un utilisateur
| - compter les notifications non lues
| - marquer une notification comme lue
| - tout marquer comme lu
| - supprimer une notification
| - intégrer automatiquement ETA / chrono / progression
|
|--------------------------------------------------------------------------
*/

const {
  sql,
  getDatabase,
} = require('../config/database');

const {
  buildProcessingEta,
  buildNotificationEtaMeta,
  formatDuration,
  getEstimatedRemainingSeconds,
  DEFAULT_STAGE_SECONDS,
} = require('./processingEta.service');

/*
|--------------------------------------------------------------------------
| CONSTANTES
|--------------------------------------------------------------------------
*/

const ALLOWED_SEVERITIES =
  new Set([
    'INFO',
    'SUCCESS',
    'WARNING',
    'ERROR',
  ]);

const ALLOWED_TYPES =
  new Set([
    'INVOICE_IMPORTED',
    'PROCESSING_STARTED',
    'EXTRACTION_COMPLETED',
    'EXTRACTION_FAILED',
    'VALIDATION_COMPLETED',
    'VALIDATION_FAILED',
    'SIGNATURE_STARTED',
    'SIGNATURE_COMPLETED',
    'SIGNATURE_FAILED',
    'TTN_ACCEPTED',
    'TTN_REJECTED',
    'PROCESSING_DELAYED',
    'PROCESSING_COMPLETED',
    'RETRY_STARTED',
    'RETRY_COMPLETED',
    'MONTHLY_DIGEST_READY',
  ]);

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function cleanString(
  value,
  fallback = '',
) {
  const normalized =
    String(
      value ?? '',
    ).trim();

  return (
    normalized ||
    fallback
  );
}

function normalizeSeverity(
  value,
) {
  const severity =
    cleanString(
      value,
      'INFO',
    ).toUpperCase();

  if (
    !ALLOWED_SEVERITIES.has(
      severity,
    )
  ) {
    return 'INFO';
  }

  return severity;
}

function normalizeType(
  value,
) {
  const type =
    cleanString(
      value,
    ).toUpperCase();

  if (
    !ALLOWED_TYPES.has(
      type,
    )
  ) {
    throw new Error(
      `Type de notification invalide : ${type || 'EMPTY'}`,
    );
  }

  return type;
}

function normalizeMetaJson(
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  if (
    typeof value ===
    'string'
  ) {
    try {
      JSON.parse(value);

      return value;
    } catch {
      return JSON.stringify({
        raw:
          value,
      });
    }
  }

  try {
    return JSON.stringify(
      value,
    );
  } catch {
    return null;
  }
}

function safeParseJson(
  value,
) {
  if (!value) {
    return null;
  }

  if (
    typeof value ===
    'object'
  ) {
    return value;
  }

  try {
    return JSON.parse(
      value,
    );
  } catch {
    return null;
  }
}

function normalizeDate(
  value,
) {
  if (!value) {
    return null;
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return null;
  }

  return date;
}

function normalizeStageProgressRatio(
  value,
) {
  const number =
    Number(
      value,
    );

  if (
    !Number.isFinite(
      number,
    )
  ) {
    return 0;
  }

  return Math.min(
    1,
    Math.max(
      0,
      number,
    ),
  );
}

/*
|--------------------------------------------------------------------------
| NORMALIZE NOTIFICATION
|--------------------------------------------------------------------------
*/

function normalizeNotification(
  row,
) {
  if (!row) {
    return null;
  }

  return {
    id:
      row.id,

    organizationId:
      row.organization_id,

    userId:
      row.user_id,

    invoiceId:
      row.invoice_id,

    type:
      row.type,

    title:
      row.title,

    message:
      row.message,

    severity:
      row.severity,

    isRead:
      Boolean(
        row.is_read,
      ),

    actionUrl:
      row.action_url ||
      null,

    meta:
      safeParseJson(
        row.meta_json,
      ),

    createdAt:
      row.created_at,

    readAt:
      row.read_at ||
      null,
  };
}

/*
|--------------------------------------------------------------------------
| CREATE NOTIFICATION
|--------------------------------------------------------------------------
*/

async function createNotification({
  organizationId,
  userId = null,
  invoiceId = null,
  type,
  title,
  message,
  severity = 'INFO',
  actionUrl = null,
  meta = null,
}) {
  if (!organizationId) {
    throw new Error(
      'organizationId est obligatoire pour créer une notification.',
    );
  }

  const normalizedType =
    normalizeType(
      type,
    );

  const normalizedSeverity =
    normalizeSeverity(
      severity,
    );

  const normalizedTitle =
    cleanString(
      title,
    );

  const normalizedMessage =
    cleanString(
      message,
    );

  if (!normalizedTitle) {
    throw new Error(
      'Le titre de la notification est obligatoire.',
    );
  }

  if (!normalizedMessage) {
    throw new Error(
      'Le message de la notification est obligatoire.',
    );
  }

  const metaJson =
    normalizeMetaJson(
      meta,
    );

  const database =
    getDatabase();

  const result =
    await database
      .request()
      .input(
        'organizationId',
        sql.UniqueIdentifier,
        organizationId,
      )
      .input(
        'userId',
        sql.UniqueIdentifier,
        userId ||
          null,
      )
      .input(
        'invoiceId',
        sql.UniqueIdentifier,
        invoiceId ||
          null,
      )
      .input(
        'type',
        sql.NVarChar(60),
        normalizedType,
      )
      .input(
        'title',
        sql.NVarChar(200),
        normalizedTitle,
      )
      .input(
        'message',
        sql.NVarChar(1200),
        normalizedMessage,
      )
      .input(
        'severity',
        sql.NVarChar(20),
        normalizedSeverity,
      )
      .input(
        'actionUrl',
        sql.NVarChar(500),
        actionUrl ||
          null,
      )
      .input(
        'metaJson',
        sql.NVarChar(
          sql.MAX,
        ),
        metaJson,
      )
      .query(`
        INSERT INTO dbo.notifications (
          organization_id,
          user_id,
          invoice_id,
          type,
          title,
          message,
          severity,
          is_read,
          action_url,
          meta_json
        )
        OUTPUT
          INSERTED.id,
          INSERTED.organization_id,
          INSERTED.user_id,
          INSERTED.invoice_id,
          INSERTED.type,
          INSERTED.title,
          INSERTED.message,
          INSERTED.severity,
          INSERTED.is_read,
          INSERTED.action_url,
          INSERTED.meta_json,
          INSERTED.created_at,
          INSERTED.read_at
        VALUES (
          @organizationId,
          @userId,
          @invoiceId,
          @type,
          @title,
          @message,
          @severity,
          0,
          @actionUrl,
          @metaJson
        )
      `);

  return normalizeNotification(
    result
      .recordset?.[0],
  );
}

/*
|--------------------------------------------------------------------------
| CREATE INVOICE NOTIFICATION
|--------------------------------------------------------------------------
|
| Cette fonction :
| - choisit automatiquement le type de notification
| - choisit le message
| - calcule ETA
| - calcule progression
| - détecte si le traitement est lent
| - injecte tout dans meta_json
|
|--------------------------------------------------------------------------
*/

async function createInvoiceNotification({
  organizationId,
  userId = null,
  invoiceId = null,

  invoiceNumber = '',

  status = '',
  stage = '',

  errorCode = '',
  errorMessage = '',

  actionUrl = null,

  /*
  |--------------------------------------------------------------------------
  | ETA INPUTS
  |--------------------------------------------------------------------------
  */

  startedAt = null,

  stageProgressRatio = 0,

  stageDurations =
    DEFAULT_STAGE_SECONDS,

  meta = null,
}) {
  const normalizedStatus =
    cleanString(
      status,
    ).toUpperCase();

  const normalizedStage =
    cleanString(
      stage,
    ).toUpperCase();

  const numberLabel =
    cleanString(
      invoiceNumber,
      'Facture',
    );

  /*
  |--------------------------------------------------------------------------
  | BUILD ETA
  |--------------------------------------------------------------------------
  */

  const eta =
    buildProcessingEta({
      stage:
        normalizedStage,

      status:
        normalizedStatus,

      startedAt:
        normalizeDate(
          startedAt,
        ),

      stageProgressRatio:
        normalizeStageProgressRatio(
          stageProgressRatio,
        ),

      stageDurations,
    });

  const etaMeta =
    buildNotificationEtaMeta(
      eta,
    ) ||
    {};

  /*
  |--------------------------------------------------------------------------
  | DEFAULT MESSAGE
  |--------------------------------------------------------------------------
  */

  let type =
    'PROCESSING_STARTED';

  let severity =
    'INFO';

  let title =
    'Traitement en cours';

  let message =
    `La facture ${numberLabel} est en cours de traitement.`;

  /*
  |--------------------------------------------------------------------------
  | ACCEPTED
  |--------------------------------------------------------------------------
  */

  if (
    normalizedStatus ===
    'ACCEPTED'
  ) {
    type =
      'TTN_ACCEPTED';

    severity =
      'SUCCESS';

    title =
      'Facture acceptée';

    message =
      `La facture ${numberLabel} a été acceptée par TTN.`;
  }

  /*
  |--------------------------------------------------------------------------
  | REJECTED
  |--------------------------------------------------------------------------
  */

  else if (
    normalizedStatus ===
    'REJECTED'
  ) {
    type =
      'TTN_REJECTED';

    severity =
      'ERROR';

    title =
      'Facture rejetée';

    const reason =
      cleanString(
        errorMessage ||
        errorCode,
      );

    message =
      reason
        ? `La facture ${numberLabel} a été rejetée : ${reason}.`
        : `La facture ${numberLabel} a été rejetée.`;
  }

  /*
  |--------------------------------------------------------------------------
  | ERROR
  |--------------------------------------------------------------------------
  */

  else if (
    normalizedStatus ===
    'ERROR'
  ) {
    if (
      normalizedStage ===
      'SIGNATURE'
    ) {
      type =
        'SIGNATURE_FAILED';
    } else if (
      normalizedStage ===
      'EXTRACTION'
    ) {
      type =
        'EXTRACTION_FAILED';
    } else if (
      normalizedStage ===
      'VALIDATION'
    ) {
      type =
        'VALIDATION_FAILED';
    } else {
      type =
        'PROCESSING_DELAYED';
    }

    severity =
      'ERROR';

    title =
      'Erreur de traitement';

    const reason =
      cleanString(
        errorMessage ||
        errorCode,
      );

    message =
      reason
        ? `Une erreur est survenue pour la facture ${numberLabel} : ${reason}.`
        : `Une erreur est survenue pendant le traitement de la facture ${numberLabel}.`;
  }

  /*
  |--------------------------------------------------------------------------
  | PENDING RETRY
  |--------------------------------------------------------------------------
  */

  else if (
    normalizedStatus ===
    'PENDING_RETRY'
  ) {
    type =
      'PROCESSING_DELAYED';

    severity =
      'WARNING';

    title =
      'Traitement temporairement retardé';

    message =
      `La facture ${numberLabel} sera automatiquement relancée.`;
  }

  /*
  |--------------------------------------------------------------------------
  | PENDING REVIEW
  |--------------------------------------------------------------------------
  */

  else if (
    normalizedStatus ===
    'PENDING_REVIEW'
  ) {
    type =
      'VALIDATION_FAILED';

    severity =
      'WARNING';

    title =
      'Vérification nécessaire';

    message =
      `La facture ${numberLabel} nécessite une vérification avant de continuer.`;
  }

  /*
  |--------------------------------------------------------------------------
  | SIGNED
  |--------------------------------------------------------------------------
  */

  else if (
    normalizedStatus ===
    'SIGNED'
  ) {
    type =
      'SIGNATURE_COMPLETED';

    severity =
      'SUCCESS';

    title =
      'Signature terminée';

    message =
      `La facture ${numberLabel} a été signée avec succès.`;
  }

  /*
  |--------------------------------------------------------------------------
  | SIGNING
  |--------------------------------------------------------------------------
  */

  else if (
    normalizedStatus ===
    'SIGNING'
  ) {
    type =
      'SIGNATURE_STARTED';

    severity =
      'INFO';

    title =
      'Signature en cours';

    message =
      `La signature de la facture ${numberLabel} est en cours.`;
  }

  /*
  |--------------------------------------------------------------------------
  | VALIDATED
  |--------------------------------------------------------------------------
  */

  else if (
    normalizedStatus ===
    'VALIDATED'
  ) {
    type =
      'VALIDATION_COMPLETED';

    severity =
      'SUCCESS';

    title =
      'Validation terminée';

    message =
      `La facture ${numberLabel} a été validée avec succès.`;
  }

  /*
  |--------------------------------------------------------------------------
  | SUBMITTED
  |--------------------------------------------------------------------------
  */

  else if (
    normalizedStatus ===
    'SUBMITTED'
  ) {
    type =
      'PROCESSING_STARTED';

    severity =
      'INFO';

    title =
      'Transmission TTN';

    message =
      `La facture ${numberLabel} a été transmise à TTN.`;
  }

  /*
  |--------------------------------------------------------------------------
  | PROCESSING
  |--------------------------------------------------------------------------
  */

  else if (
    normalizedStatus ===
    'PROCESSING'
  ) {
    type =
      'PROCESSING_STARTED';

    severity =
      'INFO';

    title =
      'Traitement démarré';

    message =
      `Le traitement de la facture ${numberLabel} a commencé.`;
  }

  /*
  |--------------------------------------------------------------------------
  | UPLOADED
  |--------------------------------------------------------------------------
  */

  else if (
    normalizedStatus ===
    'UPLOADED'
  ) {
    type =
      'INVOICE_IMPORTED';

    severity =
      'INFO';

    title =
      'Facture importée';

    message =
      `La facture ${numberLabel} a été importée avec succès.`;
  }

  /*
  |--------------------------------------------------------------------------
  | STAGE FALLBACKS
  |--------------------------------------------------------------------------
  */

  else if (
    normalizedStage ===
    'EXTRACTION'
  ) {
    type =
      'EXTRACTION_COMPLETED';

    severity =
      'INFO';

    title =
      'Extraction terminée';

    message =
      `Les données de la facture ${numberLabel} ont été extraites.`;
  }

  else if (
    normalizedStage ===
    'VALIDATION'
  ) {
    type =
      'VALIDATION_COMPLETED';

    severity =
      'INFO';

    title =
      'Validation terminée';

    message =
      `La validation de la facture ${numberLabel} est terminée.`;
  }

  else if (
    normalizedStage ===
    'SIGNATURE'
  ) {
    type =
      'SIGNATURE_STARTED';

    severity =
      'INFO';

    title =
      'Signature en cours';

    message =
      `La facture ${numberLabel} est en cours de signature.`;
  }

  else if (
    normalizedStage ===
    'TTN'
  ) {
    type =
      'PROCESSING_STARTED';

    severity =
      'INFO';

    title =
      'Transmission TTN';

    message =
      `La facture ${numberLabel} est en cours de transmission vers TTN.`;
  }

  /*
  |--------------------------------------------------------------------------
  | DELAY OVERRIDE
  |--------------------------------------------------------------------------
  |
  | Si le traitement dépasse notre estimation :
  |
  | - warning
  | - PROCESSING_DELAYED
  |
  |--------------------------------------------------------------------------
  */

  if (
    eta?.delayed ===
      true &&
    ![
      'ACCEPTED',
      'REJECTED',
      'ERROR',
    ].includes(
      normalizedStatus,
    )
  ) {
    type =
      'PROCESSING_DELAYED';

    severity =
      'WARNING';

    title =
      'Traitement plus long que prévu';

    message =
      `Le traitement de la facture ${numberLabel} prend plus de temps que la moyenne.`;
  }

  /*
  |--------------------------------------------------------------------------
  | FINAL META
  |--------------------------------------------------------------------------
  */

  const mergedMeta = {
    ...(meta &&
    typeof meta ===
      'object'
      ? meta
      : {}),

    invoice_number:
      numberLabel,

    status:
      normalizedStatus ||
      null,

    stage:
      normalizedStage ||
      null,

    error_code:
      cleanString(
        errorCode,
      ) ||
      null,

    error_message:
      cleanString(
        errorMessage,
      ) ||
      null,

    /*
    |--------------------------------------------------------------------------
    | ETA / PROGRESS
    |--------------------------------------------------------------------------
    */

    ...etaMeta,
  };

  /*
  |--------------------------------------------------------------------------
  | CREATE
  |--------------------------------------------------------------------------
  */

  return createNotification({
    organizationId,
    userId,
    invoiceId,

    type,
    title,
    message,
    severity,

    actionUrl:
      actionUrl ||
      (
        invoiceId
          ? `/client/invoices/${invoiceId}`
          : '/client/invoices'
      ),

    meta:
      mergedMeta,
  });
}

/*
|--------------------------------------------------------------------------
| GET USER NOTIFICATIONS
|--------------------------------------------------------------------------
*/

async function getUserNotifications({
  userId,
  organizationId,
  limit = 30,
  unreadOnly = false,
}) {
  if (
    !userId ||
    !organizationId
  ) {
    throw new Error(
      'userId et organizationId sont obligatoires.',
    );
  }

  const safeLimit =
    Math.min(
      Math.max(
        Number(
          limit,
        ) ||
          30,
        1,
      ),
      100,
    );

  const database =
    getDatabase();

  const result =
    await database
      .request()
      .input(
        'userId',
        sql.UniqueIdentifier,
        userId,
      )
      .input(
        'organizationId',
        sql.UniqueIdentifier,
        organizationId,
      )
      .input(
        'limit',
        sql.Int,
        safeLimit,
      )
      .input(
        'unreadOnly',
        sql.Bit,
        unreadOnly
          ? 1
          : 0,
      )
      .query(`
        SELECT TOP (@limit)
          id,
          organization_id,
          user_id,
          invoice_id,
          type,
          title,
          message,
          severity,
          is_read,
          action_url,
          meta_json,
          created_at,
          read_at

        FROM dbo.notifications

        WHERE
          organization_id =
            @organizationId

          AND (
            user_id =
              @userId
            OR user_id IS NULL
          )

          AND (
            @unreadOnly = 0
            OR is_read = 0
          )

        ORDER BY
          created_at DESC
      `);

  return result
    .recordset
    .map(
      normalizeNotification,
    );
}

/*
|--------------------------------------------------------------------------
| GET UNREAD COUNT
|--------------------------------------------------------------------------
*/

async function getUnreadCount({
  userId,
  organizationId,
}) {
  if (
    !userId ||
    !organizationId
  ) {
    throw new Error(
      'userId et organizationId sont obligatoires.',
    );
  }

  const database =
    getDatabase();

  const result =
    await database
      .request()
      .input(
        'userId',
        sql.UniqueIdentifier,
        userId,
      )
      .input(
        'organizationId',
        sql.UniqueIdentifier,
        organizationId,
      )
      .query(`
        SELECT
          COUNT_BIG(*) AS unread_count

        FROM dbo.notifications

        WHERE
          organization_id =
            @organizationId

          AND (
            user_id =
              @userId
            OR user_id IS NULL
          )

          AND is_read = 0
      `);

  return Number(
    result
      .recordset?.[0]
      ?.unread_count ||
      0,
  );
}

/*
|--------------------------------------------------------------------------
| MARK ONE AS READ
|--------------------------------------------------------------------------
*/

async function markNotificationAsRead({
  notificationId,
  userId,
  organizationId,
}) {
  if (
    !notificationId ||
    !userId ||
    !organizationId
  ) {
    throw new Error(
      'notificationId, userId et organizationId sont obligatoires.',
    );
  }

  const database =
    getDatabase();

  const result =
    await database
      .request()
      .input(
        'notificationId',
        sql.UniqueIdentifier,
        notificationId,
      )
      .input(
        'userId',
        sql.UniqueIdentifier,
        userId,
      )
      .input(
        'organizationId',
        sql.UniqueIdentifier,
        organizationId,
      )
      .query(`
        UPDATE dbo.notifications

        SET
          is_read = 1,

          read_at =
            COALESCE(
              read_at,
              SYSUTCDATETIME()
            )

        OUTPUT
          INSERTED.id,
          INSERTED.organization_id,
          INSERTED.user_id,
          INSERTED.invoice_id,
          INSERTED.type,
          INSERTED.title,
          INSERTED.message,
          INSERTED.severity,
          INSERTED.is_read,
          INSERTED.action_url,
          INSERTED.meta_json,
          INSERTED.created_at,
          INSERTED.read_at

        WHERE
          id =
            @notificationId

          AND organization_id =
            @organizationId

          AND (
            user_id =
              @userId
            OR user_id IS NULL
          )
      `);

  return normalizeNotification(
    result
      .recordset?.[0],
  );
}

/*
|--------------------------------------------------------------------------
| MARK ALL AS READ
|--------------------------------------------------------------------------
*/

async function markAllNotificationsAsRead({
  userId,
  organizationId,
}) {
  if (
    !userId ||
    !organizationId
  ) {
    throw new Error(
      'userId et organizationId sont obligatoires.',
    );
  }

  const database =
    getDatabase();

  const result =
    await database
      .request()
      .input(
        'userId',
        sql.UniqueIdentifier,
        userId,
      )
      .input(
        'organizationId',
        sql.UniqueIdentifier,
        organizationId,
      )
      .query(`
        UPDATE dbo.notifications

        SET
          is_read = 1,

          read_at =
            COALESCE(
              read_at,
              SYSUTCDATETIME()
            )

        WHERE
          organization_id =
            @organizationId

          AND (
            user_id =
              @userId
            OR user_id IS NULL
          )

          AND is_read = 0;

        SELECT
          @@ROWCOUNT AS updated_count;
      `);

  return Number(
    result
      .recordset?.[0]
      ?.updated_count ||
      0,
  );
}

/*
|--------------------------------------------------------------------------
| DELETE NOTIFICATION
|--------------------------------------------------------------------------
*/

async function deleteNotification({
  notificationId,
  userId,
  organizationId,
}) {
  if (
    !notificationId ||
    !userId ||
    !organizationId
  ) {
    throw new Error(
      'notificationId, userId et organizationId sont obligatoires.',
    );
  }

  const database =
    getDatabase();

  const result =
    await database
      .request()
      .input(
        'notificationId',
        sql.UniqueIdentifier,
        notificationId,
      )
      .input(
        'userId',
        sql.UniqueIdentifier,
        userId,
      )
      .input(
        'organizationId',
        sql.UniqueIdentifier,
        organizationId,
      )
      .query(`
        DELETE FROM dbo.notifications

        OUTPUT
          DELETED.id

        WHERE
          id =
            @notificationId

          AND organization_id =
            @organizationId

          AND (
            user_id =
              @userId
            OR user_id IS NULL
          )
      `);

  return Boolean(
    result
      .recordset?.[0]
      ?.id,
  );
}

/*
|--------------------------------------------------------------------------
| LEGACY ETA COMPATIBILITY
|--------------------------------------------------------------------------
|
| Ton notification.controller.js actuel utilise encore :
|
| calculateEstimatedRemainingSeconds(stage)
| formatEstimatedRemainingTime(seconds)
|
| On garde donc ces fonctions afin de ne rien casser.
|
|--------------------------------------------------------------------------
*/

function calculateEstimatedRemainingSeconds(
  currentStage,
) {
  return getEstimatedRemainingSeconds({
    stage:
      currentStage,

    status:
      'PROCESSING',

    stageDurations:
      DEFAULT_STAGE_SECONDS,

    stageProgressRatio:
      0,
  });
}

function formatEstimatedRemainingTime(
  seconds,
) {
  if (
    seconds ===
      null ||
    seconds ===
      undefined
  ) {
    return null;
  }

  return formatDuration(
    seconds,
  );
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  createNotification,
  createInvoiceNotification,

  getUserNotifications,
  getUnreadCount,

  markNotificationAsRead,
  markAllNotificationsAsRead,

  deleteNotification,

  /*
  |--------------------------------------------------------------------------
  | COMPATIBILITY
  |--------------------------------------------------------------------------
  */

  calculateEstimatedRemainingSeconds,
  formatEstimatedRemainingTime,

  /*
  |--------------------------------------------------------------------------
  | ETA ENGINE
  |--------------------------------------------------------------------------
  */

  buildProcessingEta,
  buildNotificationEtaMeta,

  STAGE_AVERAGE_SECONDS:
    DEFAULT_STAGE_SECONDS,
};