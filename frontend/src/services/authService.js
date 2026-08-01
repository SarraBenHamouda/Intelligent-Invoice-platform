import { API_BASE_URL } from '../config/api';

const TOKEN_STORAGE_KEY = 'auth_token';
const USER_STORAGE_KEY = 'auth_user';

async function parseResponse(response) {
  const contentType =
    response.headers.get('content-type') || '';

  let data = null;

  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    const text = await response.text();

    data = {
      success: response.ok,
      message: text,
    };
  }

  if (!response.ok) {
    const error = new Error(
      data?.message ||
        `Erreur HTTP ${response.status}`,
    );

    error.status = response.status;
    error.data = data;

    throw error;
  }

  return data;
}

function saveAuthentication(result) {
  const accessToken =
    result?.accessToken ||
    result?.token;

  if (accessToken) {
    localStorage.setItem(
      TOKEN_STORAGE_KEY,
      accessToken,
    );
  }

  if (result?.user) {
    localStorage.setItem(
      USER_STORAGE_KEY,
      JSON.stringify(result.user),
    );
  }

  return result;
}

export function getAccessToken() {
  return localStorage.getItem(
    TOKEN_STORAGE_KEY,
  );
}

export function getStoredUser() {
  const storedUser =
    localStorage.getItem(
      USER_STORAGE_KEY,
    );

  if (!storedUser) {
    return null;
  }

  try {
    return JSON.parse(storedUser);
  } catch (error) {
    console.error(
      'Impossible de lire l’utilisateur enregistré :',
      error,
    );

    localStorage.removeItem(
      USER_STORAGE_KEY,
    );

    return null;
  }
}

export function isAuthenticated() {
  return Boolean(getAccessToken());
}

export function clearAuthentication() {
  localStorage.removeItem(
    TOKEN_STORAGE_KEY,
  );

  localStorage.removeItem(
    USER_STORAGE_KEY,
  );
}

export async function register(
  registrationData,
) {
  const response = await fetch(
    `${API_BASE_URL}/auth/register`,
    {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/json',
      },

      body: JSON.stringify(
        registrationData,
      ),
    },
  );

  const result =
    await parseResponse(response);

  return saveAuthentication(result);
}

export async function login(
  credentials,
) {
  const response = await fetch(
    `${API_BASE_URL}/auth/login`,
    {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/json',
      },

      body: JSON.stringify(
        credentials,
      ),
    },
  );

  const result =
    await parseResponse(response);

  return saveAuthentication(result);
}

export async function loginWithGoogle(
  credential,
) {
  const response = await fetch(
    `${API_BASE_URL}/auth/google`,
    {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/json',
      },

      body: JSON.stringify({
        credential,
      }),
    },
  );

  const result =
    await parseResponse(response);

  return saveAuthentication(result);
}

export function startGitHubLogin(
  mode = 'login',
) {
  const normalizedMode =
    mode === 'register'
      ? 'register'
      : 'login';

  window.location.assign(
    `${API_BASE_URL}/auth/github?mode=${normalizedMode}`,
  );
}

export function completeGitHubLogin({
  accessToken,
  user,
}) {
  if (!accessToken) {
    throw new Error(
      'Jeton GitHub manquant.',
    );
  }

  const result = {
    success: true,
    accessToken,
    user,
  };

  return saveAuthentication(result);
}

export async function getCurrentUser() {
  const accessToken =
    getAccessToken();

  if (!accessToken) {
    throw new Error(
      'Utilisateur non authentifié.',
    );
  }

  const response = await fetch(
    `${API_BASE_URL}/auth/me`,
    {
      method: 'GET',

      headers: {
        Authorization:
          `Bearer ${accessToken}`,
      },
    },
  );

  const result =
    await parseResponse(response);

  if (result?.user) {
    localStorage.setItem(
      USER_STORAGE_KEY,
      JSON.stringify(result.user),
    );
  }

  return result;
}

export async function logout() {
  const accessToken =
    getAccessToken();

  try {
    if (accessToken) {
      await fetch(
        `${API_BASE_URL}/auth/logout`,
        {
          method: 'POST',

          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },
        },
      );
    }
  } finally {
    clearAuthentication();
  }
}

