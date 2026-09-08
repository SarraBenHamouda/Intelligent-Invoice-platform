const {
  authenticateWithGitHub,
  createGitHubAuthorizationUrl,
} =
  require(
    "../services/auth.service",
  );

/*
|--------------------------------------------------------------------------
| FRONTEND URL
|--------------------------------------------------------------------------
*/

function getFrontendUrl() {
  return (
    process.env
      .FRONTEND_URL ||
    "http://localhost:5173"
  );
}

/*
|--------------------------------------------------------------------------
| NORMALIZE MODE
|--------------------------------------------------------------------------
*/

function normalizeMode(
  mode,
) {
  return mode ===
    "register"
    ? "register"
    : "login";
}

/*
|--------------------------------------------------------------------------
| REDIRECT TO GITHUB
|--------------------------------------------------------------------------
*/

function redirectToGitHub(
  request,
  response,
  next,
) {
  try {
    const mode =
      normalizeMode(
        request.query
          .mode,
      );

    const authorizationUrl =
      createGitHubAuthorizationUrl({
        mode,
      });

    return response.redirect(
      authorizationUrl,
    );
  } catch (
    error
  ) {
    return next(
      error,
    );
  }
}

/*
|--------------------------------------------------------------------------
| GITHUB CALLBACK
|--------------------------------------------------------------------------
*/

async function githubCallback(
  request,
  response,
) {
  const frontendUrl =
    getFrontendUrl();

  let resolvedMode =
    "login";

  try {
    const {
      code,
      state,
      error,
      error_description:
        errorDescription,
    } =
      request.query;

    /*
    |--------------------------------------------------------------------------
    | GITHUB ERROR
    |--------------------------------------------------------------------------
    */

    if (error) {
      throw new Error(
        errorDescription ||
          error,
      );
    }

    /*
    |--------------------------------------------------------------------------
    | VALIDATE CALLBACK
    |--------------------------------------------------------------------------
    */

    if (
      !code ||
      !state
    ) {
      throw new Error(
        "Code ou état GitHub manquant.",
      );
    }

    /*
    |--------------------------------------------------------------------------
    | AUTHENTICATE
    |--------------------------------------------------------------------------
    */

    const result =
      await authenticateWithGitHub({
        code,
        state,
      });

    resolvedMode =
      normalizeMode(
        result?.mode,
      );

    /*
    |--------------------------------------------------------------------------
    | CALLBACK URL
    |--------------------------------------------------------------------------
    */

    const callbackUrl =
      new URL(
        "/oauth/github/callback",
        frontendUrl,
      );

    /*
    |--------------------------------------------------------------------------
    | TOKEN
    |--------------------------------------------------------------------------
    */

    callbackUrl
      .searchParams
      .set(
        "accessToken",
        result.accessToken,
      );

    /*
    |--------------------------------------------------------------------------
    | USER
    |--------------------------------------------------------------------------
    */

    callbackUrl
      .searchParams
      .set(
        "user",
        Buffer.from(
          JSON.stringify(
            result.user,
          ),
        ).toString(
          "base64url",
        ),
      );

    /*
    |--------------------------------------------------------------------------
    | MODE
    |--------------------------------------------------------------------------
    */

    callbackUrl
      .searchParams
      .set(
        "mode",
        resolvedMode,
      );

    /*
    |--------------------------------------------------------------------------
    | NEW USER
    |--------------------------------------------------------------------------
    */

    callbackUrl
      .searchParams
      .set(
        "isNewUser",
        String(
          Boolean(
            result.isNewUser,
          ),
        ),
      );

    /*
    |--------------------------------------------------------------------------
    | PROFILE COMPLETION
    |--------------------------------------------------------------------------
    */

    callbackUrl
      .searchParams
      .set(
        "profileCompletionRequired",
        String(
          Boolean(
            result
              .profileCompletionRequired,
          ),
        ),
      );

    return response.redirect(
      callbackUrl.toString(),
    );
  } catch (
    error
  ) {
    console.error(
      "GITHUB CALLBACK ERROR:",
      error,
    );

    /*
    |--------------------------------------------------------------------------
    | MODE ATTACHED BY SERVICE
    |--------------------------------------------------------------------------
    */

    if (
      error?.mode
    ) {
      resolvedMode =
        normalizeMode(
          error.mode,
        );
    }

    const errorUrl =
      new URL(
        "/auth",
        frontendUrl,
      );

    errorUrl
      .searchParams
      .set(
        "mode",
        resolvedMode,
      );

    errorUrl
      .searchParams
      .set(
        "error",
        error?.message ||
          "L’authentification GitHub a échoué.",
      );

    return response.redirect(
      errorUrl.toString(),
    );
  }
}

module.exports = {
  redirectToGitHub,
  githubCallback,
};