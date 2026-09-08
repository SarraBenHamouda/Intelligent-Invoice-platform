import {
  Navigate,
} from "react-router-dom";

import {
  getAccessToken,
  getStoredUser,
} from "../services/authService";

/*
|--------------------------------------------------------------------------
| PROTECTED ROUTE
|--------------------------------------------------------------------------
|
| Vérifie :
|
| 1. qu'un token existe
| 2. qu'un utilisateur existe
| 3. que son rôle correspond au rôle demandé
|
|--------------------------------------------------------------------------
*/

function ProtectedRoute({
  children,
  allowedRole,
}) {
  const token =
    getAccessToken();

  const user =
    getStoredUser();

  /*
  |--------------------------------------------------------------------------
  | NON CONNECTÉ
  |--------------------------------------------------------------------------
  */

  if (
    !token ||
    !user
  ) {
    return (
      <Navigate
        to="/auth?mode=login"
        replace
      />
    );
  }

  /*
  |--------------------------------------------------------------------------
  | RÔLE ACTUEL
  |--------------------------------------------------------------------------
  */

  const currentRole =
    String(
      user.role || "",
    )
      .trim()
      .toUpperCase();

  /*
  |--------------------------------------------------------------------------
  | RÔLE REQUIS
  |--------------------------------------------------------------------------
  */

  const requiredRole =
    allowedRole
      ? String(
          allowedRole,
        )
          .trim()
          .toUpperCase()
      : null;

  /*
  |--------------------------------------------------------------------------
  | ROLE INVALIDE
  |--------------------------------------------------------------------------
  */

  if (
    !currentRole
  ) {
    return (
      <Navigate
        to="/auth?mode=login"
        replace
      />
    );
  }

  /*
  |--------------------------------------------------------------------------
  | MAUVAIS ROLE
  |--------------------------------------------------------------------------
  */

  if (
    requiredRole &&
    currentRole !==
      requiredRole
  ) {
    /*
    |--------------------------------------------------------------------------
    | ADMIN
    |--------------------------------------------------------------------------
    */

    if (
      currentRole ===
      "ADMIN"
    ) {
      return (
        <Navigate
          to="/admin/dashboard"
          replace
        />
      );
    }

    /*
    |--------------------------------------------------------------------------
    | CLIENT
    |--------------------------------------------------------------------------
    */

    if (
      currentRole ===
      "CLIENT"
    ) {
      return (
        <Navigate
          to="/client/invoices"
          replace
        />
      );
    }

    /*
    |--------------------------------------------------------------------------
    | ROLE NON RECONNU
    |--------------------------------------------------------------------------
    */

    return (
      <Navigate
        to="/auth?mode=login"
        replace
      />
    );
  }

  /*
  |--------------------------------------------------------------------------
  | ACCESS AUTORISÉ
  |--------------------------------------------------------------------------
  */

  return children;
}

export default ProtectedRoute;