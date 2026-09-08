import {
  getAccessToken,
} from "../../../services/authService";

/*
|--------------------------------------------------------------------------
| API BASE URL
|--------------------------------------------------------------------------
*/

const API_BASE_URL =
  String(
    import.meta.env.VITE_API_URL ||
      "http://localhost:3000",
  ).replace(/\/+$/, "");

/*
|--------------------------------------------------------------------------
| ADMIN REQUEST
|--------------------------------------------------------------------------
*/

async function adminRequest(
  path,
  options = {},
) {
  const token =
    getAccessToken();

  if (!token) {
    throw new Error(
      "Session administrateur introuvable.",
    );
  }

  const response =
    await fetch(
      `${API_BASE_URL}${path}`,
      {
        ...options,

        headers: {
          Accept:
            "application/json",

          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${token}`,

          ...(options.headers ||
            {}),
        },

        cache:
          "no-store",
      },
    );

  const responseText =
    await response.text();

  let data =
    null;

  if (responseText) {
    try {
      data =
        JSON.parse(
          responseText,
        );
    } catch {
      data = {
        success:
          false,

        message:
          responseText,
      };
    }
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
        `Erreur HTTP ${response.status}`,
    );
  }

  if (
    data?.success ===
    false
  ) {
    throw new Error(
      data?.message ||
        "La requête administrateur a échoué.",
    );
  }

  return data;
}

/*
|--------------------------------------------------------------------------
| DASHBOARD
|--------------------------------------------------------------------------
*/

export function getAdminDashboard() {
  return adminRequest(
    "/api/admin/dashboard",
  );
}

/*
|--------------------------------------------------------------------------
| INVOICES
|--------------------------------------------------------------------------
*/

export function getAdminInvoices() {
  return adminRequest(
    "/api/admin/invoices",
  );
}

/*
|--------------------------------------------------------------------------
| CLIENTS
|--------------------------------------------------------------------------
*/

export function getAdminClients() {
  return adminRequest(
    "/api/admin/clients",
  );
}

/*
|--------------------------------------------------------------------------
| USERS
|--------------------------------------------------------------------------
*/

export function getAdminUsers() {
  return adminRequest(
    "/api/admin/users",
  );
}

/*
|--------------------------------------------------------------------------
| ERRORS
|--------------------------------------------------------------------------
*/

export function getAdminErrors() {
  return adminRequest(
    "/api/admin/errors",
  );
}

/*
|--------------------------------------------------------------------------
| SYSTEM
|--------------------------------------------------------------------------
*/

export function getAdminSystemHealth() {
  return adminRequest(
    "/api/admin/system",
  );
}