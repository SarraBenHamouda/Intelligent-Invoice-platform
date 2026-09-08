/*
|--------------------------------------------------------------------------
| NOTIFICATION CONTROLLER
|--------------------------------------------------------------------------
|
| Responsabilités :
| - lister les notifications de l'utilisateur connecté
| - récupérer le nombre de notifications non lues
| - marquer une notification comme lue
| - marquer toutes les notifications comme lues
| - supprimer une notification
| - récupérer une estimation ETA pour un traitement
|
|--------------------------------------------------------------------------
*/

const {
  getUserNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  calculateEstimatedRemainingSeconds,
  formatEstimatedRemainingTime,
} = require('../services/notification.service');

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function getAuthenticatedUserContext(
  req,
) {
  return {
    userId:
      req.user?.id ||
      req.user?.userId ||
      req.user?.sub ||
      null,

    organizationId:
      req.user?.organizationId ||
      req.user?.organization_id ||
      null,
  };
}

function parseLimit(
  value,
  fallback = 30,
) {
  const parsed =
    Number.parseInt(
      value,
      10,
    );

  if (
    !Number.isInteger(
      parsed,
    ) ||
    parsed <= 0
  ) {
    return fallback;
  }

  return Math.min(
    parsed,
    100,
  );
}

function parseBoolean(
  value,
) {
  if (
    value === true ||
    value === 'true' ||
    value === '1' ||
    value === 1
  ) {
    return true;
  }

  return false;
}

/*
|--------------------------------------------------------------------------
| GET NOTIFICATIONS
|--------------------------------------------------------------------------
|
| GET /api/notifications
|
| Query params :
| - limit=30
| - unreadOnly=true
|
|--------------------------------------------------------------------------
*/

async function getNotifications(
  req,
  res,
) {
  try {
    const {
      userId,
      organizationId,
    } =
      getAuthenticatedUserContext(
        req,
      );

    if (
      !userId ||
      !organizationId
    ) {
      return res
        .status(403)
        .json({
          success: false,

          errorCode:
            'NOTIFICATION_CONTEXT_REQUIRED',

          message:
            "Impossible de déterminer l'utilisateur ou l'organisation.",
        });
    }

    const limit =
      parseLimit(
        req.query.limit,
        30,
      );

    const unreadOnly =
      parseBoolean(
        req.query.unreadOnly,
      );

    const notifications =
      await getUserNotifications({
        userId,
        organizationId,
        limit,
        unreadOnly,
      });

    return res
      .status(200)
      .json({
        success: true,

        count:
          notifications.length,

        notifications,
      });
  } catch (error) {
    console.error(
      'getNotifications error:',
      error,
    );

    return res
      .status(500)
      .json({
        success: false,

        errorCode:
          'NOTIFICATIONS_FETCH_ERROR',

        message:
          'Impossible de récupérer les notifications.',
      });
  }
}

/*
|--------------------------------------------------------------------------
| GET UNREAD COUNT
|--------------------------------------------------------------------------
|
| GET /api/notifications/unread-count
|
|--------------------------------------------------------------------------
*/

async function getNotificationsUnreadCount(
  req,
  res,
) {
  try {
    const {
      userId,
      organizationId,
    } =
      getAuthenticatedUserContext(
        req,
      );

    if (
      !userId ||
      !organizationId
    ) {
      return res
        .status(403)
        .json({
          success: false,

          errorCode:
            'NOTIFICATION_CONTEXT_REQUIRED',

          message:
            "Impossible de déterminer l'utilisateur ou l'organisation.",
        });
    }

    const unreadCount =
      await getUnreadCount({
        userId,
        organizationId,
      });

    return res
      .status(200)
      .json({
        success: true,

        unreadCount,
      });
  } catch (error) {
    console.error(
      'getNotificationsUnreadCount error:',
      error,
    );

    return res
      .status(500)
      .json({
        success: false,

        errorCode:
          'NOTIFICATION_COUNT_ERROR',

        message:
          'Impossible de récupérer le nombre de notifications non lues.',
      });
  }
}

/*
|--------------------------------------------------------------------------
| MARK ONE AS READ
|--------------------------------------------------------------------------
|
| PATCH /api/notifications/:id/read
|
|--------------------------------------------------------------------------
*/

async function markOneNotificationAsRead(
  req,
  res,
) {
  try {
    const {
      userId,
      organizationId,
    } =
      getAuthenticatedUserContext(
        req,
      );

    const notificationId =
      req.params.id;

    if (
      !userId ||
      !organizationId
    ) {
      return res
        .status(403)
        .json({
          success: false,

          errorCode:
            'NOTIFICATION_CONTEXT_REQUIRED',

          message:
            "Impossible de déterminer l'utilisateur ou l'organisation.",
        });
    }

    if (!notificationId) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            'NOTIFICATION_ID_REQUIRED',

          message:
            'Identifiant de notification manquant.',
        });
    }

    const notification =
      await markNotificationAsRead({
        notificationId,
        userId,
        organizationId,
      });

    if (!notification) {
      return res
        .status(404)
        .json({
          success: false,

          errorCode:
            'NOTIFICATION_NOT_FOUND',

          message:
            'Notification introuvable.',
        });
    }

    return res
      .status(200)
      .json({
        success: true,

        message:
          'Notification marquée comme lue.',

        notification,
      });
  } catch (error) {
    console.error(
      'markOneNotificationAsRead error:',
      error,
    );

    return res
      .status(500)
      .json({
        success: false,

        errorCode:
          'NOTIFICATION_READ_ERROR',

        message:
          'Impossible de marquer cette notification comme lue.',
      });
  }
}

/*
|--------------------------------------------------------------------------
| MARK ALL AS READ
|--------------------------------------------------------------------------
|
| PATCH /api/notifications/read-all
|
|--------------------------------------------------------------------------
*/

async function markAllAsRead(
  req,
  res,
) {
  try {
    const {
      userId,
      organizationId,
    } =
      getAuthenticatedUserContext(
        req,
      );

    if (
      !userId ||
      !organizationId
    ) {
      return res
        .status(403)
        .json({
          success: false,

          errorCode:
            'NOTIFICATION_CONTEXT_REQUIRED',

          message:
            "Impossible de déterminer l'utilisateur ou l'organisation.",
        });
    }

    const updatedCount =
      await markAllNotificationsAsRead({
        userId,
        organizationId,
      });

    return res
      .status(200)
      .json({
        success: true,

        message:
          'Toutes les notifications ont été marquées comme lues.',

        updatedCount,
      });
  } catch (error) {
    console.error(
      'markAllAsRead error:',
      error,
    );

    return res
      .status(500)
      .json({
        success: false,

        errorCode:
          'NOTIFICATION_READ_ALL_ERROR',

        message:
          'Impossible de marquer toutes les notifications comme lues.',
      });
  }
}

/*
|--------------------------------------------------------------------------
| DELETE NOTIFICATION
|--------------------------------------------------------------------------
|
| DELETE /api/notifications/:id
|
|--------------------------------------------------------------------------
*/

async function removeNotification(
  req,
  res,
) {
  try {
    const {
      userId,
      organizationId,
    } =
      getAuthenticatedUserContext(
        req,
      );

    const notificationId =
      req.params.id;

    if (
      !userId ||
      !organizationId
    ) {
      return res
        .status(403)
        .json({
          success: false,

          errorCode:
            'NOTIFICATION_CONTEXT_REQUIRED',

          message:
            "Impossible de déterminer l'utilisateur ou l'organisation.",
        });
    }

    if (!notificationId) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            'NOTIFICATION_ID_REQUIRED',

          message:
            'Identifiant de notification manquant.',
        });
    }

    const deleted =
      await deleteNotification({
        notificationId,
        userId,
        organizationId,
      });

    if (!deleted) {
      return res
        .status(404)
        .json({
          success: false,

          errorCode:
            'NOTIFICATION_NOT_FOUND',

          message:
            'Notification introuvable.',
        });
    }

    return res
      .status(200)
      .json({
        success: true,

        message:
          'Notification supprimée.',
      });
  } catch (error) {
    console.error(
      'removeNotification error:',
      error,
    );

    return res
      .status(500)
      .json({
        success: false,

        errorCode:
          'NOTIFICATION_DELETE_ERROR',

        message:
          'Impossible de supprimer cette notification.',
      });
  }
}

/*
|--------------------------------------------------------------------------
| PROCESS ETA
|--------------------------------------------------------------------------
|
| GET /api/notifications/eta?stage=VALIDATION
|
| Exemple :
|
| GET /api/notifications/eta?stage=SIGNATURE
|
|--------------------------------------------------------------------------
*/

async function getProcessEta(
  req,
  res,
) {
  try {
    const stage =
      String(
        req.query.stage ||
          '',
      )
        .trim()
        .toUpperCase();

    if (!stage) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            'STAGE_REQUIRED',

          message:
            'Étape de traitement manquante.',
        });
    }

    const estimatedRemainingSeconds =
      calculateEstimatedRemainingSeconds(
        stage,
      );

    if (
      estimatedRemainingSeconds ===
      null
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            'UNKNOWN_STAGE',

          message:
            `Étape inconnue : ${stage}`,
        });
    }

    const estimatedRemainingLabel =
      formatEstimatedRemainingTime(
        estimatedRemainingSeconds,
      );

    return res
      .status(200)
      .json({
        success: true,

        stage,

        estimatedRemainingSeconds,

        estimatedRemainingLabel,
      });
  } catch (error) {
    console.error(
      'getProcessEta error:',
      error,
    );

    return res
      .status(500)
      .json({
        success: false,

        errorCode:
          'PROCESS_ETA_ERROR',

        message:
          "Impossible d'estimer le temps restant.",
      });
  }
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  getNotifications,
  getNotificationsUnreadCount,
  markOneNotificationAsRead,
  markAllAsRead,
  removeNotification,
  getProcessEta,
};