const {
  authenticateWithGitHub,
  createGitHubAuthorizationUrl,
} = require('../services/auth.service');

/**
 * Retourne l'adresse du frontend.
 *
 * @returns {string}
 */
function getFrontendUrl() {
  return (
    process.env.FRONTEND_URL ||
    'http://localhost:5173'
  );
}

/**
 * Redirige l'utilisateur vers GitHub.
 */
function redirectToGitHub(
  request,
  response,
  next,
) {
  try {
    const mode =
      request.query.mode ===
      'register'
        ? 'register'
        : 'login';

    const authorizationUrl =
      createGitHubAuthorizationUrl({
        mode,
      });

    return response.redirect(
      authorizationUrl,
    );
  } catch (error) {
    return next(error);
  }
}

/**
 * Reçoit le retour OAuth de GitHub.
 */
async function githubCallback(
  request,
  response,
) {
  const frontendUrl =
    getFrontendUrl();

  try {
    const {
      code,
      state,
      error,
      error_description:
        errorDescription,
    } = request.query;

    if (error) {
      throw new Error(
        errorDescription ||
        error,
      );
    }

    if (!code || !state) {
      throw new Error(
        'Code ou état GitHub manquant.',
      );
    }

    const result =
      await authenticateWithGitHub({
        code,
        state,
      });

    const callbackUrl =
      new URL(
        '/oauth/github/callback',
        frontendUrl,
      );

    callbackUrl.searchParams.set(
      'accessToken',
      result.accessToken,
    );

    callbackUrl.searchParams.set(
      'user',
      Buffer.from(
        JSON.stringify(
          result.user,
        ),
      ).toString('base64url'),
    );

    callbackUrl.searchParams.set(
      'isNewUser',
      String(
        result.isNewUser,
      ),
    );

    return response.redirect(
      callbackUrl.toString(),
    );
  } catch (error) {
    console.error(
      'GITHUB CALLBACK ERROR:',
      error,
    );

    const errorUrl =
      new URL(
        '/auth',
        frontendUrl,
      );

    errorUrl.searchParams.set(
      'mode',
      'login',
    );

    errorUrl.searchParams.set(
      'error',
      error.message ||
        'La connexion GitHub a échoué.',
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