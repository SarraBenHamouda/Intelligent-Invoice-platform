const CONFIGURED_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  '';

const API_BASE_URL =
  CONFIGURED_API_BASE_URL ||
  'http://localhost:3000/api';

function getToken() {
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

function getAuthorizationHeaders() {
  const token =
    getToken();

  if (!token) {
    throw new Error(
      'Utilisateur non authentifié.',
    );
  }

  return {
    Authorization:
      `Bearer ${token}`,
  };
}

async function parseResponse(
  response,
) {
  let data =
    null;

  try {
    data =
      await response.json();
  } catch {
    data =
      null;
  }

  if (!response.ok) {
    const error =
      new Error(
        data?.message ||
        data?.error ||
        `Erreur HTTP ${response.status}`,
      );

    error.status =
      response.status;

    error.data =
      data;

    throw error;
  }

  return data;
}

export async function askInvoiceAssistant(
  message,
) {
  const cleanMessage =
    String(
      message || '',
    ).trim();

  if (!cleanMessage) {
    throw new Error(
      'Écrivez une question.',
    );
  }

  const response =
    await fetch(
      `${API_BASE_URL}/assistant/ask`,
      {
        method:
          'POST',

        headers: {
          ...getAuthorizationHeaders(),

          Accept:
            'application/json',

          'Content-Type':
            'application/json',

          'Cache-Control':
            'no-cache',

          Pragma:
            'no-cache',
        },

        body:
          JSON.stringify({
            message:
              cleanMessage,
          }),

        cache:
          'no-store',
      },
    );

  return parseResponse(
    response,
  );
}