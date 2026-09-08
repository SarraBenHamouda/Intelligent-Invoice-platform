const API_BASE_URL =
  import.meta.env
    .VITE_API_BASE_URL ||
  import.meta.env
    .VITE_API_URL ||
  'http://localhost:3000/api';

/*
|--------------------------------------------------------------------------
| AUTH TOKEN
|--------------------------------------------------------------------------
*/

function getAuthToken() {
  return (
    localStorage.getItem(
      'auth_token',
    ) ||
    localStorage.getItem(
      'token',
    ) ||
    localStorage.getItem(
      'accessToken',
    ) ||
    localStorage.getItem(
      'authToken',
    ) ||
    ''
  );
}

/*
|--------------------------------------------------------------------------
| GENERIC REQUEST
|--------------------------------------------------------------------------
*/

async function request(
  path,
  options = {},
) {
  const token =
    getAuthToken();

  const response =
    await fetch(
      `${API_BASE_URL}${path}`,
      {
        ...options,

        cache:
          'no-store',

        headers: {
          Accept:
            'application/json',

          'Content-Type':
            'application/json',

          'Cache-Control':
            'no-cache',

          Pragma:
            'no-cache',

          ...(token
            ? {
                Authorization:
                  `Bearer ${token}`,
              }
            : {}),

          ...options.headers,
        },
      },
    );

  let data = null;

  try {
    data =
      await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        `Erreur HTTP ${response.status}`,
    );
  }

  return data;
}

/*
|--------------------------------------------------------------------------
| GET NOTIFICATIONS
|--------------------------------------------------------------------------
|
| GET /api/notifications
|
|--------------------------------------------------------------------------
*/

export async function getNotifications({
  limit = 30,
  unreadOnly = false,
} = {}) {
  const params =
    new URLSearchParams();

  if (limit) {
    params.set(
      'limit',
      String(limit),
    );
  }

  if (unreadOnly) {
    params.set(
      'unreadOnly',
      'true',
    );
  }

  const query =
    params.toString();

  const response =
    await request(
      `/notifications${
        query
          ? `?${query}`
          : ''
      }`,
    );

  return {
    count:
      Number(
        response?.count ||
          0,
      ),

    notifications:
      Array.isArray(
        response?.notifications,
      )
        ? response.notifications
        : [],
  };
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

export async function getUnreadNotificationCount() {
  const response =
    await request(
      '/notifications/unread-count',
    );

  return Number(
    response?.unreadCount ||
      0,
  );
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

export async function markNotificationAsRead(
  notificationId,
) {
  if (!notificationId) {
    throw new Error(
      'Identifiant de notification manquant.',
    );
  }

  const response =
    await request(
      `/notifications/${encodeURIComponent(
        notificationId,
      )}/read`,
      {
        method:
          'PATCH',
      },
    );

  return (
    response?.notification ||
    null
  );
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

export async function markAllNotificationsAsRead() {
  const response =
    await request(
      '/notifications/read-all',
      {
        method:
          'PATCH',
      },
    );

  return {
    updatedCount:
      Number(
        response?.updatedCount ||
          0,
      ),

    message:
      response?.message ||
      '',
  };
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

export async function deleteNotification(
  notificationId,
) {
  if (!notificationId) {
    throw new Error(
      'Identifiant de notification manquant.',
    );
  }

  const response =
    await request(
      `/notifications/${encodeURIComponent(
        notificationId,
      )}`,
      {
        method:
          'DELETE',
      },
    );

  return {
    success:
      response?.success ===
      true,

    message:
      response?.message ||
      '',
  };
}

/*
|--------------------------------------------------------------------------
| PROCESS ETA
|--------------------------------------------------------------------------
|
| GET /api/notifications/eta?stage=VALIDATION
|
|--------------------------------------------------------------------------
*/

export async function getProcessEta(
  stage,
) {
  const normalizedStage =
    String(
      stage || '',
    )
      .trim()
      .toUpperCase();

  if (!normalizedStage) {
    throw new Error(
      'Étape de traitement manquante.',
    );
  }

  const response =
    await request(
      `/notifications/eta?stage=${encodeURIComponent(
        normalizedStage,
      )}`,
    );

  return {
    stage:
      response?.stage ||
      normalizedStage,

    estimatedRemainingSeconds:
      response
        ?.estimatedRemainingSeconds ===
        null ||
      response
        ?.estimatedRemainingSeconds ===
        undefined
        ? null
        : Number(
            response
              .estimatedRemainingSeconds,
          ),

    estimatedRemainingLabel:
      response
        ?.estimatedRemainingLabel ||
      null,
  };
}

/*
|--------------------------------------------------------------------------
| FORMAT RELATIVE DATE
|--------------------------------------------------------------------------
|
| Utilisé plus tard dans la cloche :
|
| "À l'instant"
| "Il y a 5 min"
| "Il y a 2 h"
|
|--------------------------------------------------------------------------
*/

export function formatNotificationDate(
  value,
) {
  if (!value) {
    return '';
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
    return '';
  }

  const now =
    Date.now();

  const difference =
    Math.max(
      0,
      now -
        date.getTime(),
    );

  const seconds =
    Math.floor(
      difference /
        1000,
    );

  if (
    seconds <
    30
  ) {
    return "À l'instant";
  }

  if (
    seconds <
    60
  ) {
    return `Il y a ${seconds} sec`;
  }

  const minutes =
    Math.floor(
      seconds /
        60,
    );

  if (
    minutes <
    60
  ) {
    return `Il y a ${minutes} min`;
  }

  const hours =
    Math.floor(
      minutes /
        60,
    );

  if (
    hours <
    24
  ) {
    return `Il y a ${hours} h`;
  }

  const days =
    Math.floor(
      hours /
        24,
    );

  if (
    days === 1
  ) {
    return 'Hier';
  }

  if (
    days <
    7
  ) {
    return `Il y a ${days} jours`;
  }

  return new Intl.DateTimeFormat(
    'fr-FR',
    {
      day:
        '2-digit',

      month:
        'short',

      year:
        'numeric',
    },
  ).format(date);
}

/*
|--------------------------------------------------------------------------
| NOTIFICATION ICON
|--------------------------------------------------------------------------
|
| Renvoie une catégorie visuelle.
| Le composant React décidera ensuite quelle icône SVG afficher.
|
|--------------------------------------------------------------------------
*/

export function getNotificationVisualType(
  notification,
) {
  const severity =
    String(
      notification?.severity ||
        '',
    )
      .trim()
      .toUpperCase();

  if (
    severity ===
    'SUCCESS'
  ) {
    return 'success';
  }

  if (
    severity ===
    'ERROR'
  ) {
    return 'error';
  }

  if (
    severity ===
    'WARNING'
  ) {
    return 'warning';
  }

  return 'info';
}

/*
|--------------------------------------------------------------------------
| IS PROCESSING NOTIFICATION
|--------------------------------------------------------------------------
*/

export function isProcessingNotification(
  notification,
) {
  const type =
    String(
      notification?.type ||
        '',
    )
      .trim()
      .toUpperCase();

  return [
    'PROCESSING_STARTED',
    'SIGNATURE_STARTED',
    'RETRY_STARTED',
  ].includes(type);
}