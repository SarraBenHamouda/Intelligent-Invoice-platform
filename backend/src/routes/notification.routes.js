/*
|--------------------------------------------------------------------------
| NOTIFICATION ROUTES
|--------------------------------------------------------------------------
|
| Routes protégées pour :
| - récupérer les notifications
| - récupérer le nombre de notifications non lues
| - récupérer une estimation du temps restant
| - marquer une notification comme lue
| - marquer toutes les notifications comme lues
| - supprimer une notification
|
|--------------------------------------------------------------------------
*/

const express =
  require('express');

const authenticationModule =
  require('../middleware/authenticate');

const {
  getNotifications,
  getNotificationsUnreadCount,
  markOneNotificationAsRead,
  markAllAsRead,
  removeNotification,
  getProcessEta,
} = require('../controllers/notification.controller');

const router =
  express.Router();

/*
|--------------------------------------------------------------------------
| AUTH MIDDLEWARE
|--------------------------------------------------------------------------
|
| Ton projet a déjà utilisé plusieurs formes d'export pour authenticate.
| Ce bloc reste compatible avec :
|
| module.exports = authenticate
|
| ou :
|
| module.exports = {
|   authenticateToken
| }
|
| ou :
|
| module.exports = {
|   authenticate
| }
|
|--------------------------------------------------------------------------
*/

const authenticate =
  authenticationModule.authenticateToken ||
  authenticationModule.authenticate ||
  authenticationModule;

if (
  typeof authenticate !==
  'function'
) {
  throw new Error(
    'notification.routes.js : middleware authenticate introuvable.',
  );
}

/*
|--------------------------------------------------------------------------
| CONTROLLER CHECKS
|--------------------------------------------------------------------------
*/

if (
  typeof getNotifications !==
  'function'
) {
  throw new Error(
    'notification.routes.js : getNotifications introuvable.',
  );
}

if (
  typeof getNotificationsUnreadCount !==
  'function'
) {
  throw new Error(
    'notification.routes.js : getNotificationsUnreadCount introuvable.',
  );
}

if (
  typeof markOneNotificationAsRead !==
  'function'
) {
  throw new Error(
    'notification.routes.js : markOneNotificationAsRead introuvable.',
  );
}

if (
  typeof markAllAsRead !==
  'function'
) {
  throw new Error(
    'notification.routes.js : markAllAsRead introuvable.',
  );
}

if (
  typeof removeNotification !==
  'function'
) {
  throw new Error(
    'notification.routes.js : removeNotification introuvable.',
  );
}

if (
  typeof getProcessEta !==
  'function'
) {
  throw new Error(
    'notification.routes.js : getProcessEta introuvable.',
  );
}

/*
|--------------------------------------------------------------------------
| AUTHENTICATION
|--------------------------------------------------------------------------
|
| Toutes les routes ci-dessous nécessitent un JWT valide.
|
|--------------------------------------------------------------------------
*/

router.use(
  authenticate,
);

/*
|--------------------------------------------------------------------------
| GET NOTIFICATIONS
|--------------------------------------------------------------------------
|
| GET /api/notifications
|
| Exemples :
|
| GET /api/notifications
|
| GET /api/notifications?limit=20
|
| GET /api/notifications?unreadOnly=true
|
| GET /api/notifications?limit=20&unreadOnly=true
|
|--------------------------------------------------------------------------
*/

router.get(
  '/',
  getNotifications,
);

/*
|--------------------------------------------------------------------------
| UNREAD COUNT
|--------------------------------------------------------------------------
|
| GET /api/notifications/unread-count
|
|--------------------------------------------------------------------------
*/

router.get(
  '/unread-count',
  getNotificationsUnreadCount,
);

/*
|--------------------------------------------------------------------------
| PROCESS ETA
|--------------------------------------------------------------------------
|
| GET /api/notifications/eta?stage=VALIDATION
|
| Exemples :
|
| /api/notifications/eta?stage=IMPORT
| /api/notifications/eta?stage=EXTRACTION
| /api/notifications/eta?stage=VALIDATION
| /api/notifications/eta?stage=TEIF
| /api/notifications/eta?stage=SIGNATURE
| /api/notifications/eta?stage=TTN
|
|--------------------------------------------------------------------------
*/

router.get(
  '/eta',
  getProcessEta,
);

/*
|--------------------------------------------------------------------------
| MARK ALL AS READ
|--------------------------------------------------------------------------
|
| IMPORTANT :
| Cette route doit être déclarée AVANT /:id/read.
|
| PATCH /api/notifications/read-all
|
|--------------------------------------------------------------------------
*/

router.patch(
  '/read-all',
  markAllAsRead,
);

/*
|--------------------------------------------------------------------------
| MARK ONE AS READ
|--------------------------------------------------------------------------
|
| PATCH /api/notifications/:id/read
|
|--------------------------------------------------------------------------
*/

router.patch(
  '/:id/read',
  markOneNotificationAsRead,
);

/*
|--------------------------------------------------------------------------
| DELETE ONE
|--------------------------------------------------------------------------
|
| DELETE /api/notifications/:id
|
|--------------------------------------------------------------------------
*/

router.delete(
  '/:id',
  removeNotification,
);

/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports =
  router;