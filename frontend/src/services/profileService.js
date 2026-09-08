const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:3000/api';

/*
|--------------------------------------------------------------------------
| AUTH TOKEN
|--------------------------------------------------------------------------
*/

function getToken() {
  return (
    localStorage.getItem('auth_token') ||
    localStorage.getItem('token') ||
    localStorage.getItem('accessToken') ||
    localStorage.getItem('authToken') ||
    ''
  );
}

/*
|--------------------------------------------------------------------------
| AUTH HEADERS
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| RESPONSE
|--------------------------------------------------------------------------
*/

async function parseResponse(
  response,
) {
  let data = null;

  try {
    data =
      await response.json();
  } catch {
    data = null;
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

    error.errorCode =
      data?.errorCode ||
      null;

    error.data =
      data;

    throw error;
  }

  return data;
}

/*
|--------------------------------------------------------------------------
| GET PROFILE
|--------------------------------------------------------------------------
*/

export async function getProfile() {
  const response =
    await fetch(
      `${API_BASE_URL}/profile`,
      {
        method:
          'GET',

        headers: {
          ...getAuthorizationHeaders(),

          Accept:
            'application/json',

          'Cache-Control':
            'no-cache',

          Pragma:
            'no-cache',
        },

        cache:
          'no-store',
      },
    );

  return parseResponse(
    response,
  );
}

/*
|--------------------------------------------------------------------------
| UPDATE PROFILE
|--------------------------------------------------------------------------
*/

export async function updateProfile(
  payload,
) {
  const response =
    await fetch(
      `${API_BASE_URL}/profile`,
      {
        method:
          'PUT',

        headers: {
          ...getAuthorizationHeaders(),

          Accept:
            'application/json',

          'Content-Type':
            'application/json',
        },

        body:
          JSON.stringify(
            payload,
          ),

        cache:
          'no-store',
      },
    );

  return parseResponse(
    response,
  );
}

/*
|--------------------------------------------------------------------------
| UPLOAD AVATAR
|--------------------------------------------------------------------------
*/

export async function uploadAvatar(
  file,
) {
  if (!file) {
    throw new Error(
      'Aucune image sélectionnée.',
    );
  }

  const formData =
    new FormData();

  formData.append(
    'avatar',
    file,
  );

  const response =
    await fetch(
      `${API_BASE_URL}/profile/avatar`,
      {
        method:
          'POST',

        headers: {
          ...getAuthorizationHeaders(),
        },

        body:
          formData,

        cache:
          'no-store',
      },
    );

  return parseResponse(
    response,
  );
}

/*
|--------------------------------------------------------------------------
| DELETE AVATAR
|--------------------------------------------------------------------------
*/

export async function deleteAvatar() {
  const response =
    await fetch(
      `${API_BASE_URL}/profile/avatar`,
      {
        method:
          'DELETE',

        headers: {
          ...getAuthorizationHeaders(),

          Accept:
            'application/json',
        },

        cache:
          'no-store',
      },
    );

  return parseResponse(
    response,
  );
}

/*
|--------------------------------------------------------------------------
| CHANGE PASSWORD
|--------------------------------------------------------------------------
*/

export async function changePassword(
  payload,
) {
  const response =
    await fetch(
      `${API_BASE_URL}/profile/password`,
      {
        method:
          'PUT',

        headers: {
          ...getAuthorizationHeaders(),

          Accept:
            'application/json',

          'Content-Type':
            'application/json',
        },

        body:
          JSON.stringify(
            payload,
          ),

        cache:
          'no-store',
      },
    );

  return parseResponse(
    response,
  );
}