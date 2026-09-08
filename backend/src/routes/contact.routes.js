const express =
  require("express");

const {
  sendContactEmail,
} =
  require(
    "../services/mail.service",
  );

const router =
  express.Router();

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/

const RECAPTCHA_VERIFY_URL =
  "https://www.google.com/recaptcha/api/siteverify";

const ALLOWED_SUBJECTS =
  new Set([
    "demo",
    "integration",
    "signature",
    "ttn",
    "support",
    "other",
  ]);

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function isRecaptchaEnabled() {
  return (
    String(
      process.env
        .RECAPTCHA_ENABLED ||
        "false",
    )
      .trim()
      .toLowerCase() ===
    "true"
  );
}

function normalizeText(
  value,
) {
  return String(
    value || "",
  ).trim();
}

function normalizeEmail(
  value,
) {
  return normalizeText(
    value,
  ).toLowerCase();
}

/*
|--------------------------------------------------------------------------
| VERIFY RECAPTCHA
|--------------------------------------------------------------------------
*/

async function verifyRecaptcha(
  token,
  remoteIp,
) {
  if (
    !isRecaptchaEnabled()
  ) {
    return {
      success:
        true,

      skipped:
        true,
    };
  }

  const secret =
    normalizeText(
      process.env
        .RECAPTCHA_SECRET_KEY,
    );

  if (!secret) {
    throw new Error(
      "RECAPTCHA_SECRET_KEY is not configured.",
    );
  }

  const cleanToken =
    normalizeText(
      token,
    );

  if (!cleanToken) {
    return {
      success:
        false,

      errorCode:
        "RECAPTCHA_TOKEN_REQUIRED",

      message:
        "Veuillez confirmer que vous n'êtes pas un robot.",
    };
  }

  const body =
    new URLSearchParams();

  body.set(
    "secret",
    secret,
  );

  body.set(
    "response",
    cleanToken,
  );

  if (remoteIp) {
    body.set(
      "remoteip",
      remoteIp,
    );
  }

  try {
    const googleResponse =
      await fetch(
        RECAPTCHA_VERIFY_URL,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },

          body:
            body.toString(),
        },
      );

    const result =
      await googleResponse.json();

    if (
      result.success !==
      true
    ) {
      console.warn(
        "[CONTACT] reCAPTCHA refused:",
        result[
          "error-codes"
        ] || [],
      );

      return {
        success:
          false,

        errorCode:
          "RECAPTCHA_INVALID",

        message:
          "La vérification reCAPTCHA a échoué. Veuillez réessayer.",
      };
    }

    return {
      success:
        true,

      hostname:
        result.hostname ||
        null,
    };
  } catch (
    error
  ) {
    console.error(
      "[CONTACT] reCAPTCHA error:",
      error,
    );

    return {
      success:
        false,

      errorCode:
        "RECAPTCHA_SERVICE_UNAVAILABLE",

      message:
        "Le service reCAPTCHA est temporairement indisponible.",
    };
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/contact
|--------------------------------------------------------------------------
*/

router.post(
  "/",

  async (
    request,
    response,
    next,
  ) => {
    try {
      /*
      |--------------------------------------------------------------------------
      | RECAPTCHA
      |--------------------------------------------------------------------------
      */

      const captcha =
        await verifyRecaptcha(
          request.body
            ?.recaptchaToken,

          request.ip,
        );

      if (
        !captcha.success
      ) {
        return response
          .status(403)
          .json({
            success:
              false,

            errorCode:
              captcha.errorCode ||
              "RECAPTCHA_FAILED",

            message:
              captcha.message ||
              "La vérification reCAPTCHA a échoué.",
          });
      }

      /*
      |--------------------------------------------------------------------------
      | DATA
      |--------------------------------------------------------------------------
      */

      const name =
        normalizeText(
          request.body
            ?.name,
        );

      const email =
        normalizeEmail(
          request.body
            ?.email,
        );

      const company =
        normalizeText(
          request.body
            ?.company,
        );

      const subject =
        normalizeText(
          request.body
            ?.subject,
        );

      const message =
        normalizeText(
          request.body
            ?.message,
        );

      /*
      |--------------------------------------------------------------------------
      | VALIDATION
      |--------------------------------------------------------------------------
      */

      if (!name) {
        return response
          .status(422)
          .json({
            success:
              false,

            errorCode:
              "CONTACT_NAME_REQUIRED",

            message:
              "Le nom est obligatoire.",
          });
      }

      if (
        name.length >
        150
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            errorCode:
              "CONTACT_NAME_TOO_LONG",

            message:
              "Le nom est trop long.",
          });
      }

      if (
        !email ||
        !email.includes(
          "@",
        )
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            errorCode:
              "CONTACT_EMAIL_INVALID",

            message:
              "Adresse e-mail invalide.",
          });
      }

      if (
        email.length >
        255
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            errorCode:
              "CONTACT_EMAIL_TOO_LONG",

            message:
              "Adresse e-mail trop longue.",
          });
      }

      if (
        company.length >
        150
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            errorCode:
              "CONTACT_COMPANY_TOO_LONG",

            message:
              "Le nom de l'entreprise est trop long.",
          });
      }

      if (
        !ALLOWED_SUBJECTS.has(
          subject,
        )
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            errorCode:
              "CONTACT_SUBJECT_INVALID",

            message:
              "Le sujet sélectionné est invalide.",
          });
      }

      if (
        message.length <
        10
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            errorCode:
              "CONTACT_MESSAGE_TOO_SHORT",

            message:
              "Le message doit contenir au moins 10 caractères.",
          });
      }

      if (
        message.length >
        3000
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            errorCode:
              "CONTACT_MESSAGE_TOO_LONG",

            message:
              "Le message ne peut pas dépasser 3000 caractères.",
          });
      }

      /*
      |--------------------------------------------------------------------------
      | SEND EMAIL
      |--------------------------------------------------------------------------
      */

      await sendContactEmail({
        name,
        email,
        company,
        subject,
        message,
      });

      /*
      |--------------------------------------------------------------------------
      | RESPONSE
      |--------------------------------------------------------------------------
      */

      return response
        .status(200)
        .json({
          success:
            true,

          message:
            "Merci, votre message a bien été envoyé.",
        });
    } catch (
      error
    ) {
      console.error(
        "[CONTACT] Error:",
        error,
      );

      return next(
        error,
      );
    }
  },
);

module.exports =
  router;