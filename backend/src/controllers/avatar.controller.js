/*
|--------------------------------------------------------------------------
| AVATAR CONTROLLER
|--------------------------------------------------------------------------
*/

const {
  generateAvatarWithAI,
} = require(
  "../services/avatarAI.service",
);

/*
|--------------------------------------------------------------------------
| AUTH USER
|--------------------------------------------------------------------------
*/

function getAuthenticatedUser(
  req,
) {
  const userId =
    req.user?.id ||
    req.user?.user_id ||
    req.user?.sub;

  const organizationId =
    req.user?.organization_id ||
    req.user?.organizationId ||
    null;

  if (!userId) {
    const error =
      new Error(
        "Utilisateur connecté introuvable.",
      );

    error.code =
      "AUTH_USER_NOT_FOUND";

    error.status =
      401;

    throw error;
  }

  return {
    userId,
    organizationId,
  };
}

/*
|--------------------------------------------------------------------------
| GENERATE AI AVATAR
|--------------------------------------------------------------------------
*/

async function generateAiAvatar(
  req,
  res,
) {
  try {
    /*
    |--------------------------------------------------------------------------
    | USER
    |--------------------------------------------------------------------------
    */

    const {
      userId,
      organizationId,
    } =
      getAuthenticatedUser(
        req,
      );

    /*
    |--------------------------------------------------------------------------
    | BODY
    |--------------------------------------------------------------------------
    */

    const prompt =
      String(
        req.body?.prompt ||
        "",
      ).trim();

    const description =
      String(
        req.body?.description ||
        "",
      ).trim();

    const preset =
      String(
        req.body?.preset ||
        "professional",
      ).trim();

    const settings =
      req.body?.settings &&
      typeof req.body.settings ===
        "object"
        ? req.body.settings
        : {};

    /*
    |--------------------------------------------------------------------------
    | VALIDATION
    |--------------------------------------------------------------------------
    */

    if (
      !prompt &&
      !description
    ) {
      return res
        .status(400)
        .json({
          success:
            false,

          errorCode:
            "AVATAR_PROMPT_REQUIRED",

          message:
            "Décrivez l'avatar à générer.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | CLOUDFLARE AI
    |--------------------------------------------------------------------------
    */

    const result =
      await generateAvatarWithAI({
        prompt,
        description,
        preset,
        settings,
      });

    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    return res
      .status(200)
      .json({
        success:
          true,

        message:
          "Avatar IA généré avec succès.",

        user_id:
          userId,

        organization_id:
          organizationId,

        provider:
          result.provider,

        model:
          result.model,

        mime_type:
          result.mimeType,

        image_base64:
          result.imageBase64,

        image_data_url:
          result.imageDataUrl,

        prompt:
          result.promptUsed,

        request: {
          description,
          preset,
          settings,
        },
      });
  } catch (
    error
  ) {
    console.error(
      "generateAiAvatar error:",
      error,
    );

    /*
    |--------------------------------------------------------------------------
    | AUTH ERROR
    |--------------------------------------------------------------------------
    */

    if (
      error.code ===
      "AUTH_USER_NOT_FOUND"
    ) {
      return res
        .status(401)
        .json({
          success:
            false,

          errorCode:
            error.code,

          message:
            error.message,
        });
    }

    /*
    |--------------------------------------------------------------------------
    | CLOUDFLARE CONFIG ERRORS
    |--------------------------------------------------------------------------
    */

    if (
      error.code ===
      "CLOUDFLARE_ACCOUNT_ID_MISSING" ||
      error.message ===
        "CLOUDFLARE_ACCOUNT_ID_MISSING"
    ) {
      return res
        .status(503)
        .json({
          success:
            false,

          errorCode:
            "CLOUDFLARE_ACCOUNT_ID_MISSING",

          message:
            "CLOUDFLARE_ACCOUNT_ID n'est pas configuré dans backend/.env.",
        });
    }

    if (
      error.code ===
      "CLOUDFLARE_API_TOKEN_MISSING" ||
      error.message ===
        "CLOUDFLARE_API_TOKEN_MISSING"
    ) {
      return res
        .status(503)
        .json({
          success:
            false,

          errorCode:
            "CLOUDFLARE_API_TOKEN_MISSING",

          message:
            "CLOUDFLARE_API_TOKEN n'est pas configuré dans backend/.env.",
        });
    }

    /*
    |--------------------------------------------------------------------------
    | CLOUDFLARE API ERROR
    |--------------------------------------------------------------------------
    */

    if (
      error.code ===
      "CLOUDFLARE_AI_ERROR"
    ) {
      return res
        .status(
          Number.isInteger(
            error.status,
          )
            ? error.status
            : 502,
        )
        .json({
          success:
            false,

          errorCode:
            error.code,

          message:
            error.message,

          details:
            error.details ||
            null,
        });
    }

    /*
    |--------------------------------------------------------------------------
    | IMAGE NOT FOUND
    |--------------------------------------------------------------------------
    */

    if (
      error.code ===
      "CLOUDFLARE_IMAGE_NOT_FOUND"
    ) {
      return res
        .status(502)
        .json({
          success:
            false,

          errorCode:
            error.code,

          message:
            error.message,

          details:
            error.details ||
            null,
        });
    }

    /*
    |--------------------------------------------------------------------------
    | GENERIC ERROR
    |--------------------------------------------------------------------------
    */

    return res
      .status(
        Number.isInteger(
          error.status,
        )
          ? error.status
          : 500,
      )
      .json({
        success:
          false,

        errorCode:
          error.code ||
          "AVATAR_AI_GENERATION_FAILED",

        message:
          error.message ||
          "Impossible de générer l'avatar.",
      });
  }
}

/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports = {
  generateAiAvatar,
};