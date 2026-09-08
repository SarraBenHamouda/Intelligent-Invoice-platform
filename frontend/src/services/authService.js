import {
  API_BASE_URL,
} from "../config/api";

const TOKEN_STORAGE_KEY =
  "auth_token";

const USER_STORAGE_KEY =
  "auth_user";

/*
|--------------------------------------------------------------------------
| RESPONSE PARSER
|--------------------------------------------------------------------------
*/

async function parseResponse(
  response,
) {
  const contentType =
    response.headers.get(
      "content-type",
    ) || "";

  let data;

  if (
    contentType.includes(
      "application/json",
    )
  ) {
    data =
      await response.json();
  } else {
    const text =
      await response.text();

    data = {
      success:
        response.ok,

      message:
        text,
    };
  }

  if (!response.ok) {
    const error =
      new Error(
        data?.message ||
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

/*
|--------------------------------------------------------------------------
| SAVE AUTHENTICATION
|--------------------------------------------------------------------------
*/

function saveAuthentication(
  result,
) {
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
      JSON.stringify(
        result.user,
      ),
    );
  }

  return result;
}

/*
|--------------------------------------------------------------------------
| ACCESS TOKEN
|--------------------------------------------------------------------------
*/

export function getAccessToken() {
  return localStorage.getItem(
    TOKEN_STORAGE_KEY,
  );
}

/*
|--------------------------------------------------------------------------
| STORED USER
|--------------------------------------------------------------------------
*/

export function getStoredUser() {
  const storedUser =
    localStorage.getItem(
      USER_STORAGE_KEY,
    );

  if (!storedUser) {
    return null;
  }

  try {
    return JSON.parse(
      storedUser,
    );
  } catch (error) {
    console.error(
      "Impossible de lire l’utilisateur enregistré :",
      error,
    );

    localStorage.removeItem(
      USER_STORAGE_KEY,
    );

    return null;
  }
}

/*
|--------------------------------------------------------------------------
| AUTH CHECK
|--------------------------------------------------------------------------
*/

export function isAuthenticated() {
  return Boolean(
    getAccessToken(),
  );
}

/*
|--------------------------------------------------------------------------
| CLEAR AUTH
|--------------------------------------------------------------------------
*/

export function clearAuthentication() {
  localStorage.removeItem(
    TOKEN_STORAGE_KEY,
  );

  localStorage.removeItem(
    USER_STORAGE_KEY,
  );

  /*
  |--------------------------------------------------------------------------
  | OLD TEST KEYS
  |--------------------------------------------------------------------------
  */

  localStorage.removeItem(
    "accessToken",
  );

  localStorage.removeItem(
    "user",
  );
}

/*
|--------------------------------------------------------------------------
| REGISTER
|--------------------------------------------------------------------------
*/

export async function register(
  registrationData,
) {
  if (
    !registrationData ||
    typeof registrationData !==
      "object"
  ) {
    throw new Error(
      "Les informations d'inscription sont invalides.",
    );
  }

  const firstName =
    String(
      registrationData.firstName ||
        "",
    ).trim();

  const lastName =
    String(
      registrationData.lastName ||
        "",
    ).trim();

  const email =
    String(
      registrationData.email ||
        "",
    )
      .trim()
      .toLowerCase();

  const phone =
    String(
      registrationData.phone ||
        "",
    ).trim();

  const city =
    String(
      registrationData.city ||
        "",
    ).trim();

  const countryCode =
    String(
      registrationData.countryCode ||
        "TN",
    )
      .trim()
      .toUpperCase();

  const organizationName =
    String(
      registrationData.organizationName ||
        "",
    ).trim();

  const taxIdentifier =
    String(
      registrationData.taxIdentifier ||
        "",
    ).trim();

  const password =
    String(
      registrationData.password ||
        "",
    );

  const recaptchaToken =
    String(
      registrationData.recaptchaToken ||
        "",
    ).trim();

  /*
  |--------------------------------------------------------------------------
  | FRONTEND VALIDATION
  |--------------------------------------------------------------------------
  */

  if (!firstName) {
    throw new Error(
      "Le prénom est obligatoire.",
    );
  }

  if (!lastName) {
    throw new Error(
      "Le nom est obligatoire.",
    );
  }

  if (
    !email ||
    !email.includes("@")
  ) {
    throw new Error(
      "Adresse e-mail invalide.",
    );
  }

  if (!organizationName) {
    throw new Error(
      "Le nom de l’entreprise est obligatoire.",
    );
  }

  if (!countryCode) {
    throw new Error(
      "Le pays est obligatoire.",
    );
  }

  if (
    password.length <
    8
  ) {
    throw new Error(
      "Le mot de passe doit contenir au moins 8 caractères.",
    );
  }

  /*
  |--------------------------------------------------------------------------
  | REQUEST
  |--------------------------------------------------------------------------
  */

  const response =
    await fetch(
      `${API_BASE_URL}/auth/register`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          Accept:
            "application/json",
        },

        body:
          JSON.stringify({
            firstName,
            lastName,
            email,
            phone,
            city,
            countryCode,
            organizationName,
            taxIdentifier,
            password,
            recaptchaToken,
          }),
      },
    );

  const result =
    await parseResponse(
      response,
    );

  return saveAuthentication(
    result,
  );
}

/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

export async function login(
  credentials,
) {
  if (
    !credentials ||
    typeof credentials !==
      "object"
  ) {
    throw new Error(
      "Les identifiants de connexion sont invalides.",
    );
  }

  const email =
    String(
      credentials.email ||
        "",
    )
      .trim()
      .toLowerCase();

  const password =
    String(
      credentials.password ||
        "",
    );

  const recaptchaToken =
    String(
      credentials.recaptchaToken ||
        "",
    ).trim();

  if (
    !email ||
    !password
  ) {
    throw new Error(
      "E-mail et mot de passe obligatoires.",
    );
  }

  const response =
    await fetch(
      `${API_BASE_URL}/auth/login`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          Accept:
            "application/json",
        },

        body:
          JSON.stringify({
            email,
            password,
            recaptchaToken,
          }),
      },
    );

  const result =
    await parseResponse(
      response,
    );

  return saveAuthentication(
    result,
  );
}

/*
|--------------------------------------------------------------------------
| GOOGLE
|--------------------------------------------------------------------------
*/

export async function loginWithGoogle(
  credential,
  mode = "login",
  recaptchaToken = "",
) {
  if (!credential) {
    throw new Error(
      "Le jeton Google est obligatoire.",
    );
  }

  const normalizedMode =
    mode ===
    "register"
      ? "register"
      : "login";

  const normalizedRecaptchaToken =
    String(
      recaptchaToken ||
        "",
    ).trim();

  const response =
    await fetch(
      `${API_BASE_URL}/auth/google`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          Accept:
            "application/json",
        },

        body:
          JSON.stringify({
            credential,

            mode:
              normalizedMode,

            recaptchaToken:
              normalizedRecaptchaToken,
          }),
      },
    );

  const result =
    await parseResponse(
      response,
    );

  return saveAuthentication(
    result,
  );
}

/*
|--------------------------------------------------------------------------
| GITHUB START
|--------------------------------------------------------------------------
*/

export function startGitHubLogin(
  mode = "login",
  recaptchaToken = "",
) {
  const normalizedMode =
    mode ===
    "register"
      ? "register"
      : "login";

  const parameters =
    new URLSearchParams();

  parameters.set(
    "mode",
    normalizedMode,
  );

  const cleanRecaptchaToken =
    String(
      recaptchaToken ||
        "",
    ).trim();

  if (
    cleanRecaptchaToken
  ) {
    parameters.set(
      "recaptchaToken",
      cleanRecaptchaToken,
    );
  }

  const githubUrl =
    `${API_BASE_URL}/auth/github?${parameters.toString()}`;

  window.location.assign(
    githubUrl,
  );
}

/*
|--------------------------------------------------------------------------
| COMPLETE GITHUB LOGIN
|--------------------------------------------------------------------------
*/

export function completeGitHubLogin({
  accessToken,
  user,
}) {
  if (!accessToken) {
    throw new Error(
      "Jeton GitHub manquant.",
    );
  }

  if (!user) {
    throw new Error(
      "Utilisateur GitHub manquant.",
    );
  }

  return saveAuthentication({
    success:
      true,

    accessToken,

    user,
  });
}

/*
|--------------------------------------------------------------------------
| CURRENT USER
|--------------------------------------------------------------------------
*/

export async function getCurrentUser() {
  const accessToken =
    getAccessToken();

  if (!accessToken) {
    throw new Error(
      "Utilisateur non authentifié.",
    );
  }

  const response =
    await fetch(
      `${API_BASE_URL}/auth/me`,
      {
        method:
          "GET",

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          Accept:
            "application/json",
        },
      },
    );

  const result =
    await parseResponse(
      response,
    );

  if (result?.user) {
    localStorage.setItem(
      USER_STORAGE_KEY,
      JSON.stringify(
        result.user,
      ),
    );
  }

  return result;
}

/*
|--------------------------------------------------------------------------
| FORGOT PASSWORD
|--------------------------------------------------------------------------
*/

export async function forgotPassword({
  email,
  recaptchaToken = "",
}) {
  const normalizedEmail =
    String(
      email ||
        "",
    )
      .trim()
      .toLowerCase();

  const normalizedRecaptchaToken =
    String(
      recaptchaToken ||
        "",
    ).trim();

  if (
    !normalizedEmail ||
    !normalizedEmail.includes(
      "@",
    )
  ) {
    throw new Error(
      "Adresse e-mail invalide.",
    );
  }

  const response =
    await fetch(
      `${API_BASE_URL}/auth/forgot-password`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          Accept:
            "application/json",
        },

        body:
          JSON.stringify({
            email:
              normalizedEmail,

            recaptchaToken:
              normalizedRecaptchaToken,
          }),
      },
    );

  return parseResponse(
    response,
  );
}

/*
|--------------------------------------------------------------------------
| RESET PASSWORD
|--------------------------------------------------------------------------
*/

export async function resetPassword({
  token,
  password,
  confirmPassword,
}) {
  const normalizedToken =
    String(
      token ||
        "",
    ).trim();

  const normalizedPassword =
    String(
      password ||
        "",
    );

  const normalizedConfirmPassword =
    String(
      confirmPassword ||
        "",
    );

  if (!normalizedToken) {
    throw new Error(
      "Le jeton de réinitialisation est manquant.",
    );
  }

  if (
    normalizedPassword.length <
    8
  ) {
    throw new Error(
      "Le mot de passe doit contenir au moins 8 caractères.",
    );
  }

  if (
    normalizedPassword !==
    normalizedConfirmPassword
  ) {
    throw new Error(
      "Les mots de passe ne correspondent pas.",
    );
  }

  const response =
    await fetch(
      `${API_BASE_URL}/auth/reset-password`,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          Accept:
            "application/json",
        },

        body:
          JSON.stringify({
            token:
              normalizedToken,

            password:
              normalizedPassword,
          }),
      },
    );

  return parseResponse(
    response,
  );
}

/*
|--------------------------------------------------------------------------
| LOGOUT
|--------------------------------------------------------------------------
*/

export async function logout() {
  const accessToken =
    getAccessToken();

  try {
    if (
      accessToken
    ) {
      await fetch(
        `${API_BASE_URL}/auth/logout`,
        {
          method:
            "POST",

          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            Accept:
              "application/json",
          },
        },
      );
    }
  } finally {
    clearAuthentication();
  }
}