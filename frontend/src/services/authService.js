import { API_URL } from '../config/api';

async function parseResponse(response) {
  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      'Réponse invalide reçue depuis le serveur.'
    );
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
        'Une erreur est survenue.'
    );
  }

  return data;
}

function saveSession(data) {
  localStorage.setItem(
    'accessToken',
    data.accessToken
  );

  localStorage.setItem(
    'user',
    JSON.stringify(data.user)
  );
}

export async function loginUser(
  email,
  password
) {
  const response = await fetch(
    `${API_URL}/auth/login`,
    {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/json',
      },

      body: JSON.stringify({
        email,
        password,
      }),
    }
  );

  const data =
    await parseResponse(response);

  saveSession(data);

  return data;
}

export async function registerUser({
  organizationName,
  countryCode,
  firstName,
  lastName,
  email,
  password,
}) {
  const response = await fetch(
    `${API_URL}/auth/register`,
    {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/json',
      },

      body: JSON.stringify({
        organizationName,
        countryCode,
        firstName,
        lastName,
        email,
        password,
      }),
    }
  );

  const data =
    await parseResponse(response);

  saveSession(data);

  return data;
}

export async function loginWithGoogle(
  credential
) {
  const response = await fetch(
    `${API_URL}/auth/google`,
    {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/json',
      },

      body: JSON.stringify({
        credential,
      }),
    }
  );

  const data =
    await parseResponse(response);

  saveSession(data);

  return data;
}

export async function getCurrentUser() {
  const token =
    localStorage.getItem(
      'accessToken'
    );

  if (!token) {
    throw new Error(
      'Aucun utilisateur connecté.'
    );
  }

  const response = await fetch(
    `${API_URL}/auth/me`,
    {
      method: 'GET',

      headers: {
        Authorization:
          `Bearer ${token}`,
      },
    }
  );

  const data =
    await parseResponse(response);

  localStorage.setItem(
    'user',
    JSON.stringify(data.user)
  );

  return data.user;
}

export function getStoredUser() {
  const storedUser =
    localStorage.getItem('user');

  if (!storedUser) {
    return null;
  }

  try {
    return JSON.parse(storedUser);
  } catch {
    return null;
  }
}

export function logoutUser() {
  localStorage.removeItem(
    'accessToken'
  );

  localStorage.removeItem(
    'user'
  );
}