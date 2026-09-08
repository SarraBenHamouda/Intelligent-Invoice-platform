import {
  useEffect,
  useRef,
} from "react";

import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import {
  completeGitHubLogin,
} from "../services/authService";

/*
|--------------------------------------------------------------------------
| DECODE BASE64 URL
|--------------------------------------------------------------------------
*/

function decodeBase64Url(value) {
  let base64 = String(
    value || "",
  )
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  while (
    base64.length % 4 !== 0
  ) {
    base64 += "=";
  }

  const binary =
    window.atob(base64);

  const bytes =
    Uint8Array.from(
      binary,
      (character) =>
        character.charCodeAt(0),
    );

  return new TextDecoder().decode(
    bytes,
  );
}

/*
|--------------------------------------------------------------------------
| GITHUB CALLBACK
|--------------------------------------------------------------------------
*/

function GitHubCallback() {
  const navigate =
    useNavigate();

  const [
    searchParams,
  ] = useSearchParams();

  const processedRef =
    useRef(false);

  useEffect(() => {
    /*
    |--------------------------------------------------------------------------
    | PREVENT DOUBLE EXECUTION
    |--------------------------------------------------------------------------
    */

    if (
      processedRef.current
    ) {
      return;
    }

    processedRef.current =
      true;

    try {
      /*
      |--------------------------------------------------------------------------
      | READ CALLBACK DATA
      |--------------------------------------------------------------------------
      */

      const accessToken =
        searchParams.get(
          "accessToken",
        );

      const encodedUser =
        searchParams.get(
          "user",
        );

      if (
        !accessToken ||
        !encodedUser
      ) {
        throw new Error(
          "Informations GitHub manquantes.",
        );
      }

      /*
      |--------------------------------------------------------------------------
      | DECODE USER
      |--------------------------------------------------------------------------
      */

      const decodedUser =
        decodeBase64Url(
          encodedUser,
        );

      const user =
        JSON.parse(
          decodedUser,
        );

      /*
      |--------------------------------------------------------------------------
      | STORE AUTH DATA
      |--------------------------------------------------------------------------
      |
      | completeGitHubLogin() doit stocker les mêmes informations que
      | login classique / Google :
      |
      | auth_token
      | auth_user
      |
      |--------------------------------------------------------------------------
      */

      completeGitHubLogin({
        accessToken,
        user,
      });

      /*
      |--------------------------------------------------------------------------
      | NORMALIZE ROLE
      |--------------------------------------------------------------------------
      */

      const role =
        String(
          user?.role || "",
        )
          .trim()
          .toUpperCase();

      /*
      |--------------------------------------------------------------------------
      | CLEAN URL
      |--------------------------------------------------------------------------
      |
      | On retire le JWT et les données utilisateur de l'URL visible.
      |
      |--------------------------------------------------------------------------
      */

      window.history.replaceState(
        {},
        document.title,
        "/oauth/github/callback",
      );

      /*
      |--------------------------------------------------------------------------
      | CLIENT
      |--------------------------------------------------------------------------
      */

      if (
        role === "CLIENT"
      ) {
        navigate(
          "/client/invoices",
          {
            replace: true,
          },
        );

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | ADMIN
      |--------------------------------------------------------------------------
      */

      if (
        role === "ADMIN"
      ) {
        navigate(
          "/admin/dashboard",
          {
            replace: true,
          },
        );

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | UNKNOWN ROLE
      |--------------------------------------------------------------------------
      */

      throw new Error(
        `Rôle utilisateur non reconnu : ${role || "VIDE"}`,
      );
    } catch (error) {
      console.error(
        "GITHUB CALLBACK ERROR:",
        error,
      );

      const errorMessage =
        error?.message ||
        "La connexion GitHub a échoué.";

      navigate(
        `/auth?mode=login&error=${encodeURIComponent(
          errorMessage,
        )}`,
        {
          replace: true,
        },
      );
    }
  }, [
    navigate,
    searchParams,
  ]);

  /*
  |--------------------------------------------------------------------------
  | LOADING SCREEN
  |--------------------------------------------------------------------------
  */

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
      }}
    >
      <div>
        <h2>
          Connexion GitHub
        </h2>

        <p>
          Connexion en cours...
        </p>
      </div>
    </main>
  );
}

export default GitHubCallback;