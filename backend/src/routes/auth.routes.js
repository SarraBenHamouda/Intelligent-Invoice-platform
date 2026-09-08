const crypto =
  require("node:crypto");

const express =
  require("express");

const bcrypt =
  require("bcryptjs");

const jwt =
  require("jsonwebtoken");

const {
  OAuth2Client,
} =
  require(
    "google-auth-library",
  );

const {
  redirectToGitHub,
  githubCallback,
} =
  require(
    "../controllers/auth.controller",
  );

const {
  sql,
  getDatabase,
} =
  require(
    "../config/database",
  );

const authenticate =
  require(
    "../middleware/authenticate",
  );

const {
  sendPasswordResetEmail,
} =
  require(
    "../services/mail.service",
  );

const router =
  express.Router();

const googleClient =
  new OAuth2Client(
    process.env
      .GOOGLE_CLIENT_ID,
  );

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/

const RECAPTCHA_VERIFY_URL =
  "https://www.google.com/recaptcha/api/siteverify";

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function normalizeEmail(
  email,
) {
  return String(
    email || "",
  )
    .trim()
    .toLowerCase();
}

function normalizeMode(
  mode,
) {
  return mode ===
    "register"
    ? "register"
    : "login";
}

function normalizeCountryCode(
  countryCode,
) {
  return String(
    countryCode ||
      "TN",
  )
    .trim()
    .toUpperCase();
}

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

function getPasswordResetExpirationMinutes() {
  const configuredValue =
    Number(
      process.env
        .PASSWORD_RESET_EXPIRES_MINUTES ||
        30,
    );

  if (
    !Number.isFinite(
      configuredValue,
    ) ||
    configuredValue <=
      0
  ) {
    return 30;
  }

  return Math.floor(
    configuredValue,
  );
}

function getPasswordResetFrontendUrl() {
  return String(
    process.env
      .PASSWORD_RESET_FRONTEND_URL ||
      "http://localhost:5173/reset-password",
  ).trim();
}

/*
|--------------------------------------------------------------------------
| PASSWORD RESET TOKEN
|--------------------------------------------------------------------------
*/

function createPasswordResetToken() {
  return crypto
    .randomBytes(
      32,
    )
    .toString(
      "hex",
    );
}

function hashPasswordResetToken(
  token,
) {
  return crypto
    .createHash(
      "sha256",
    )
    .update(
      String(
        token ||
          "",
      ),
    )
    .digest(
      "hex",
    );
}

/*
|--------------------------------------------------------------------------
| FORMAT USER
|--------------------------------------------------------------------------
*/

function formatUser(
  user,
) {
  return {
    id:
      user.id,

    organizationId:
      user.organization_id ||
      null,

    firstName:
      user.first_name ||
      "",

    lastName:
      user.last_name ||
      "",

    fullName: [
      user.first_name,
      user.last_name,
    ]
      .filter(Boolean)
      .join(" "),

    email:
      user.email,

    phone:
      user.phone ||
      "",

    city:
      user.city ||
      "",

    countryCode:
      user.country_code ||
      null,

    role:
      user.role,

    isActive:
      Boolean(
        user.is_active,
      ),

    authProvider:
      user.auth_provider ||
      null,

    avatarUrl:
      user.avatar_url ||
      null,

    createdAt:
      user.created_at ||
      null,

    updatedAt:
      user.updated_at ||
      null,
  };
}

/*
|--------------------------------------------------------------------------
| JWT
|--------------------------------------------------------------------------
*/

function createAccessToken(
  user,
) {
  if (
    !process.env
      .JWT_SECRET
  ) {
    throw new Error(
      "JWT_SECRET is not configured.",
    );
  }

  return jwt.sign(
    {
      sub:
        String(
          user.id,
        ),

      email:
        user.email,

      role:
        user.role,

      organizationId:
        user.organization_id ||
        null,

      tokenType:
        "access",
    },

    process.env
      .JWT_SECRET,

    {
      expiresIn:
        process.env
          .JWT_EXPIRES_IN ||
        "8h",

      issuer:
        "intelligent-invoice-platform",

      audience:
        "invoice-portal-web",
    },
  );
}

/*
|--------------------------------------------------------------------------
| RECAPTCHA V2
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
    String(
      process.env
        .RECAPTCHA_SECRET_KEY ||
        "",
    ).trim();

  if (!secret) {
    throw new Error(
      "RECAPTCHA_SECRET_KEY is not configured.",
    );
  }

  const cleanToken =
    String(
      token || "",
    ).trim();

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
        "RECAPTCHA REFUSED:",
        result[
          "error-codes"
        ] ||
          [],
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
      "RECAPTCHA ERROR:",
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

function sendRecaptchaError(
  response,
  result,
) {
  return response
    .status(403)
    .json({
      success:
        false,

      errorCode:
        result.errorCode ||
        "RECAPTCHA_FAILED",

      message:
        result.message ||
        "La vérification reCAPTCHA a échoué.",
    });
}

/*
|--------------------------------------------------------------------------
| ROUTES TEST
|--------------------------------------------------------------------------
*/

router.get(
  "/routes-test",

  (
    request,
    response,
  ) => {
    return response
      .status(200)
      .json({
        success:
          true,

        message:
          "Les routes Auth sont actives.",

        registerAvailable:
          true,

        loginAvailable:
          true,

        googleAvailable:
          true,

        githubAvailable:
          true,

        forgotPasswordAvailable:
          true,

        resetPasswordAvailable:
          true,

        recaptchaEnabled:
          isRecaptchaEnabled(),

        version:
          "AUTH-V7-PASSWORD-RESET",
      });
  },
);

/*
|--------------------------------------------------------------------------
| REGISTER
|--------------------------------------------------------------------------
*/

router.post(
  "/register",

  async (
    request,
    response,
    next,
  ) => {
    let transaction =
      null;

    try {
      const captcha =
        await verifyRecaptcha(
          request.body
            ?.recaptchaToken,

          request.ip,
        );

      if (
        !captcha.success
      ) {
        return sendRecaptchaError(
          response,
          captcha,
        );
      }

      const organizationName =
        String(
          request.body
            .organizationName ||
            "",
        ).trim();

      const taxIdentifier =
        String(
          request.body
            .taxIdentifier ||
            "",
        ).trim();

      const countryCode =
        normalizeCountryCode(
          request.body
            .countryCode,
        );

      const firstName =
        String(
          request.body
            .firstName ||
            "",
        ).trim();

      const lastName =
        String(
          request.body
            .lastName ||
            "",
        ).trim();

      const email =
        normalizeEmail(
          request.body
            .email,
        );

      const phone =
        String(
          request.body
            .phone ||
            "",
        ).trim();

      const city =
        String(
          request.body
            .city ||
            "",
        ).trim();

      const password =
        String(
          request.body
            .password ||
            "",
        );

      if (
        !organizationName
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            errorCode:
              "ORGANIZATION_NAME_REQUIRED",

            message:
              "Le nom de l’organisation est obligatoire.",
          });
      }

      if (
        !firstName ||
        !lastName
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            errorCode:
              "USER_NAME_REQUIRED",

            message:
              "Le prénom et le nom sont obligatoires.",
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
              "INVALID_EMAIL",

            message:
              "Adresse e-mail invalide.",
          });
      }

      if (
        password.length <
        8
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            errorCode:
              "WEAK_PASSWORD",

            message:
              "Le mot de passe doit contenir au moins 8 caractères.",
          });
      }

      const database =
        getDatabase();

      const existingUserResult =
        await database
          .request()

          .input(
            "email",
            sql.NVarChar(
              255,
            ),
            email,
          )

          .query(`
            SELECT TOP (1)
              id
            FROM dbo.users
            WHERE
              LOWER(
                LTRIM(
                  RTRIM(email)
                )
              ) = @email
          `);

      if (
        existingUserResult
          .recordset
          .length >
        0
      ) {
        return response
          .status(409)
          .json({
            success:
              false,

            errorCode:
              "EMAIL_ALREADY_USED",

            message:
              "Un compte existe déjà avec cette adresse e-mail.",
          });
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          12,
        );

      transaction =
        new sql.Transaction(
          database,
        );

      await transaction.begin();

      const organizationResult =
        await transaction
          .request()

          .input(
            "name",
            sql.NVarChar(
              150,
            ),
            organizationName,
          )

          .input(
            "taxIdentifier",
            sql.NVarChar(
              100,
            ),
            taxIdentifier ||
              null,
          )

          .input(
            "countryCode",
            sql.NVarChar(
              10,
            ),
            countryCode,
          )

          .query(`
            INSERT INTO dbo.organizations (
              name,
              tax_identifier,
              country_code,
              is_active
            )

            OUTPUT
              INSERTED.id,
              INSERTED.name,
              INSERTED.tax_identifier,
              INSERTED.country_code,
              INSERTED.is_active,
              INSERTED.created_at

            VALUES (
              @name,
              @taxIdentifier,
              @countryCode,
              1
            )
          `);

      const organization =
        organizationResult
          .recordset[0];

      const userResult =
        await transaction
          .request()

          .input(
            "organizationId",
            sql.UniqueIdentifier,
            organization.id,
          )

          .input(
            "firstName",
            sql.NVarChar(
              100,
            ),
            firstName,
          )

          .input(
            "lastName",
            sql.NVarChar(
              100,
            ),
            lastName,
          )

          .input(
            "email",
            sql.NVarChar(
              255,
            ),
            email,
          )

          .input(
            "phone",
            sql.NVarChar(
              50,
            ),
            phone ||
              null,
          )

          .input(
            "city",
            sql.NVarChar(
              120,
            ),
            city ||
              null,
          )

          .input(
            "countryCode",
            sql.NVarChar(
              10,
            ),
            countryCode,
          )

          .input(
            "passwordHash",
            sql.NVarChar(
              255,
            ),
            passwordHash,
          )

          .input(
            "role",
            sql.NVarChar(
              30,
            ),
            "CLIENT",
          )

          .query(`
            INSERT INTO dbo.users (
              organization_id,
              first_name,
              last_name,
              email,
              phone,
              city,
              country_code,
              password_hash,
              role,
              is_active
            )

            OUTPUT
              INSERTED.id,
              INSERTED.organization_id,
              INSERTED.first_name,
              INSERTED.last_name,
              INSERTED.email,
              INSERTED.phone,
              INSERTED.city,
              INSERTED.country_code,
              INSERTED.role,
              INSERTED.is_active,
              INSERTED.auth_provider,
              INSERTED.provider_id,
              INSERTED.avatar_url,
              INSERTED.created_at,
              INSERTED.updated_at

            VALUES (
              @organizationId,
              @firstName,
              @lastName,
              @email,
              @phone,
              @city,
              @countryCode,
              @passwordHash,
              @role,
              1
            )
          `);

      const user =
        userResult
          .recordset[0];

      await transaction.commit();

      transaction =
        null;

      const accessToken =
        createAccessToken(
          user,
        );

      return response
        .status(201)
        .json({
          success:
            true,

          message:
            "Merci de nous avoir rejoints ! Votre compte a été créé avec succès.",

          accessToken,

          expiresIn:
            process.env
              .JWT_EXPIRES_IN ||
            "8h",

          user:
            formatUser(
              user,
            ),

          organization: {
            id:
              organization.id,

            name:
              organization.name,

            taxIdentifier:
              organization
                .tax_identifier,

            countryCode:
              organization
                .country_code,

            isActive:
              Boolean(
                organization
                  .is_active,
              ),
          },
        });
    } catch (
      error
    ) {
      if (
        transaction
      ) {
        try {
          await transaction.rollback();
        } catch (
          rollbackError
        ) {
          console.error(
            "REGISTER ROLLBACK ERROR:",
            rollbackError,
          );
        }
      }

      return next(
        error,
      );
    }
  },
);

/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

router.post(
  "/login",

  async (
    request,
    response,
    next,
  ) => {
    try {
      const captcha =
        await verifyRecaptcha(
          request.body
            ?.recaptchaToken,

          request.ip,
        );

      if (
        !captcha.success
      ) {
        return sendRecaptchaError(
          response,
          captcha,
        );
      }

      const email =
        normalizeEmail(
          request.body
            .email,
        );

      const password =
        String(
          request.body
            .password ||
            "",
        );

      if (
        !email ||
        !password
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            errorCode:
              "EMAIL_AND_PASSWORD_REQUIRED",

            message:
              "E-mail et mot de passe obligatoires.",
          });
      }

      const database =
        getDatabase();

      const result =
        await database
          .request()

          .input(
            "email",
            sql.NVarChar(
              255,
            ),
            email,
          )

          .query(`
            SELECT TOP (1)
              id,
              organization_id,
              first_name,
              last_name,
              email,
              phone,
              city,
              country_code,
              password_hash,
              role,
              is_active,
              auth_provider,
              provider_id,
              avatar_url,
              created_at,
              updated_at

            FROM dbo.users

            WHERE
              LOWER(
                LTRIM(
                  RTRIM(email)
                )
              ) =
              @email
          `);

      const user =
        result
          .recordset[0];

      if (
        !user ||
        !user.is_active
      ) {
        return response
          .status(401)
          .json({
            success:
              false,

            errorCode:
              "INVALID_CREDENTIALS",

            message:
              "E-mail ou mot de passe incorrect.",
          });
      }

      const storedHash =
        String(
          user.password_hash ||
            "",
        ).trim();

      const validPassword =
        storedHash
          ? await bcrypt.compare(
              password,
              storedHash,
            )
          : false;

      if (
        !validPassword
      ) {
        return response
          .status(401)
          .json({
            success:
              false,

            errorCode:
              "INVALID_CREDENTIALS",

            message:
              "E-mail ou mot de passe incorrect.",
          });
      }

      const accessToken =
        createAccessToken(
          user,
        );

      return response
        .status(200)
        .json({
          success:
            true,

          message:
            "Connexion réussie.",

          accessToken,

          expiresIn:
            process.env
              .JWT_EXPIRES_IN ||
            "8h",

          user:
            formatUser(
              user,
            ),
        });
    } catch (
      error
    ) {
      return next(
        error,
      );
    }
  },
);

/*
|--------------------------------------------------------------------------
| FORGOT PASSWORD
|--------------------------------------------------------------------------
*/

router.post(
  "/forgot-password",

  async (
    request,
    response,
    next,
  ) => {
    try {
      /*
      |--------------------------------------------------------------------------
      | CAPTCHA
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
        return sendRecaptchaError(
          response,
          captcha,
        );
      }

      /*
      |--------------------------------------------------------------------------
      | EMAIL
      |--------------------------------------------------------------------------
      */

      const email =
        normalizeEmail(
          request.body
            ?.email,
        );

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
              "INVALID_EMAIL",

            message:
              "Adresse e-mail invalide.",
          });
      }

      const genericMessage =
        "Si un compte correspondant existe, un lien de réinitialisation a été envoyé.";

      const database =
        getDatabase();

      /*
      |--------------------------------------------------------------------------
      | FIND USER
      |--------------------------------------------------------------------------
      */

      const userResult =
        await database
          .request()

          .input(
            "email",
            sql.NVarChar(
              255,
            ),
            email,
          )

          .query(`
            SELECT TOP (1)
              id,
              first_name,
              email,
              is_active

            FROM dbo.users

            WHERE
              LOWER(
                LTRIM(
                  RTRIM(email)
                )
              ) = @email
          `);

      const user =
        userResult
          .recordset[0];

      /*
      |--------------------------------------------------------------------------
      | DO NOT REVEAL USER EXISTENCE
      |--------------------------------------------------------------------------
      */

      if (
        !user ||
        !user.is_active
      ) {
        return response
          .status(200)
          .json({
            success:
              true,

            message:
              genericMessage,
          });
      }

      /*
      |--------------------------------------------------------------------------
      | INVALIDATE OLD TOKENS
      |--------------------------------------------------------------------------
      */

      await database
        .request()

        .input(
          "userId",
          sql.UniqueIdentifier,
          user.id,
        )

        .query(`
          UPDATE dbo.password_reset_tokens

          SET
            used_at =
              SYSUTCDATETIME()

          WHERE
            user_id =
              @userId

            AND used_at
              IS NULL
        `);

      /*
      |--------------------------------------------------------------------------
      | CREATE TOKEN
      |--------------------------------------------------------------------------
      */

      const rawToken =
        createPasswordResetToken();

      const tokenHash =
        hashPasswordResetToken(
          rawToken,
        );

      const expiresInMinutes =
        getPasswordResetExpirationMinutes();

      const expiresAt =
        new Date(
          Date.now() +
            expiresInMinutes *
              60 *
              1000,
        );

      /*
      |--------------------------------------------------------------------------
      | STORE HASH ONLY
      |--------------------------------------------------------------------------
      */

      await database
        .request()

        .input(
          "userId",
          sql.UniqueIdentifier,
          user.id,
        )

        .input(
          "tokenHash",
          sql.NVarChar(
            128,
          ),
          tokenHash,
        )

        .input(
          "expiresAt",
          sql.DateTime2,
          expiresAt,
        )

        .query(`
          INSERT INTO dbo.password_reset_tokens (
            user_id,
            token_hash,
            expires_at
          )

          VALUES (
            @userId,
            @tokenHash,
            @expiresAt
          )
        `);

      /*
      |--------------------------------------------------------------------------
      | RESET URL
      |--------------------------------------------------------------------------
      */

      const resetUrl =
        new URL(
          getPasswordResetFrontendUrl(),
        );

      resetUrl
        .searchParams
        .set(
          "token",
          rawToken,
        );

      /*
      |--------------------------------------------------------------------------
      | DEBUG DEVELOPMENT
      |--------------------------------------------------------------------------
      */

      const debugEnabled =
        String(
          process.env
            .PASSWORD_RESET_DEBUG ||
            "false",
        )
          .trim()
          .toLowerCase() ===
        "true";

      if (
        debugEnabled &&
        process.env
          .NODE_ENV !==
          "production"
      ) {
        console.log(
          "PASSWORD RESET URL:",
          resetUrl.toString(),
        );
      }

      /*
      |--------------------------------------------------------------------------
      | SEND EMAIL
      |--------------------------------------------------------------------------
      */

      try {
        await sendPasswordResetEmail({
          email:
            user.email,

          firstName:
            user.first_name,

          resetUrl:
            resetUrl.toString(),

          expiresInMinutes,
        });
      } catch (
        mailError
      ) {
        console.error(
          "PASSWORD RESET EMAIL ERROR:",
          mailError,
        );

        /*
        |--------------------------------------------------------------------------
        | Invalidate token if email could not be sent.
        |--------------------------------------------------------------------------
        */

        await database
          .request()

          .input(
            "tokenHash",
            sql.NVarChar(
              128,
            ),
            tokenHash,
          )

          .query(`
            UPDATE dbo.password_reset_tokens

            SET
              used_at =
                SYSUTCDATETIME()

            WHERE
              token_hash =
                @tokenHash
          `);
      }

      /*
      |--------------------------------------------------------------------------
      | ALWAYS GENERIC
      |--------------------------------------------------------------------------
      */

      return response
        .status(200)
        .json({
          success:
            true,

          message:
            genericMessage,
        });
    } catch (
      error
    ) {
      return next(
        error,
      );
    }
  },
);

/*
|--------------------------------------------------------------------------
| RESET PASSWORD
|--------------------------------------------------------------------------
*/

router.post(
  "/reset-password",

  async (
    request,
    response,
    next,
  ) => {
    let transaction =
      null;

    try {
      const rawToken =
        String(
          request.body
            ?.token ||
            "",
        ).trim();

      const password =
        String(
          request.body
            ?.password ||
            "",
        );

      if (!rawToken) {
        return response
          .status(422)
          .json({
            success:
              false,

            errorCode:
              "RESET_TOKEN_REQUIRED",

            message:
              "Le lien de réinitialisation est invalide.",
          });
      }

      if (
        password.length <
        8
      ) {
        return response
          .status(422)
          .json({
            success:
              false,

            errorCode:
              "WEAK_PASSWORD",

            message:
              "Le mot de passe doit contenir au moins 8 caractères.",
          });
      }

      const tokenHash =
        hashPasswordResetToken(
          rawToken,
        );

      const database =
        getDatabase();

      /*
      |--------------------------------------------------------------------------
      | VALID TOKEN
      |--------------------------------------------------------------------------
      */

      const tokenResult =
        await database
          .request()

          .input(
            "tokenHash",
            sql.NVarChar(
              128,
            ),
            tokenHash,
          )

          .query(`
            SELECT TOP (1)
              prt.id,
              prt.user_id,
              prt.expires_at,
              prt.used_at,
              u.email,
              u.is_active

            FROM dbo.password_reset_tokens prt

            INNER JOIN dbo.users u
              ON
                u.id =
                  prt.user_id

            WHERE
              prt.token_hash =
                @tokenHash

              AND prt.used_at
                IS NULL

              AND prt.expires_at >
                SYSUTCDATETIME()

              AND u.is_active =
                1
          `);

      const resetToken =
        tokenResult
          .recordset[0];

      if (!resetToken) {
        return response
          .status(400)
          .json({
            success:
              false,

            errorCode:
              "RESET_TOKEN_INVALID_OR_EXPIRED",

            message:
              "Ce lien de réinitialisation est invalide, expiré ou a déjà été utilisé.",
          });
      }

      /*
      |--------------------------------------------------------------------------
      | HASH NEW PASSWORD
      |--------------------------------------------------------------------------
      */

      const passwordHash =
        await bcrypt.hash(
          password,
          12,
        );

      /*
      |--------------------------------------------------------------------------
      | TRANSACTION
      |--------------------------------------------------------------------------
      */

      transaction =
        new sql.Transaction(
          database,
        );

      await transaction.begin();

      /*
      |--------------------------------------------------------------------------
      | UPDATE PASSWORD
      |--------------------------------------------------------------------------
      */

      await transaction
        .request()

        .input(
          "userId",
          sql.UniqueIdentifier,
          resetToken.user_id,
        )

        .input(
          "passwordHash",
          sql.NVarChar(
            255,
          ),
          passwordHash,
        )

        .query(`
          UPDATE dbo.users

          SET
            password_hash =
              @passwordHash,

            updated_at =
              SYSUTCDATETIME()

          WHERE
            id =
              @userId
        `);

      /*
      |--------------------------------------------------------------------------
      | INVALIDATE ALL PASSWORD RESET TOKENS
      |--------------------------------------------------------------------------
      */

      await transaction
        .request()

        .input(
          "userId",
          sql.UniqueIdentifier,
          resetToken.user_id,
        )

        .query(`
          UPDATE dbo.password_reset_tokens

          SET
            used_at =
              SYSUTCDATETIME()

          WHERE
            user_id =
              @userId

            AND used_at
              IS NULL
        `);

      await transaction.commit();

      transaction =
        null;

      return response
        .status(200)
        .json({
          success:
            true,

          message:
            "Votre mot de passe a été modifié avec succès. Vous pouvez maintenant vous connecter.",
        });
    } catch (
      error
    ) {
      if (
        transaction
      ) {
        try {
          await transaction.rollback();
        } catch (
          rollbackError
        ) {
          console.error(
            "RESET PASSWORD ROLLBACK ERROR:",
            rollbackError,
          );
        }
      }

      return next(
        error,
      );
    }
  },
);

/*
|--------------------------------------------------------------------------
| GOOGLE AUTH
|--------------------------------------------------------------------------
*/

router.post(
  "/google",

  async (
    request,
    response,
    next,
  ) => {
    let transaction =
      null;

    try {
      const captcha =
        await verifyRecaptcha(
          request.body
            ?.recaptchaToken,

          request.ip,
        );

      if (
        !captcha.success
      ) {
        return sendRecaptchaError(
          response,
          captcha,
        );
      }

      const mode =
        normalizeMode(
          request.body
            .mode,
        );

      const credential =
        String(
          request.body
            .credential ||
            "",
        ).trim();

      if (!credential) {
        return response
          .status(422)
          .json({
            success:
              false,

            errorCode:
              "GOOGLE_CREDENTIAL_REQUIRED",

            message:
              "Le jeton Google est obligatoire.",
          });
      }

      const ticket =
        await googleClient
          .verifyIdToken({
            idToken:
              credential,

            audience:
              process.env
                .GOOGLE_CLIENT_ID,
          });

      const payload =
        ticket.getPayload();

      if (
        !payload ||
        !payload.sub ||
        !payload.email ||
        payload.email_verified !==
          true
      ) {
        return response
          .status(401)
          .json({
            success:
              false,

            errorCode:
              "INVALID_GOOGLE_ACCOUNT",

            message:
              "Le compte Google est invalide ou non vérifié.",
          });
      }

      const email =
        normalizeEmail(
          payload.email,
        );

      const database =
        getDatabase();

      const existingUserResult =
        await database
          .request()

          .input(
            "email",
            sql.NVarChar(
              255,
            ),
            email,
          )

          .query(`
            SELECT TOP (1)
              id,
              organization_id,
              first_name,
              last_name,
              email,
              phone,
              city,
              country_code,
              password_hash,
              role,
              is_active,
              auth_provider,
              provider_id,
              avatar_url,
              created_at,
              updated_at

            FROM dbo.users

            WHERE
              LOWER(
                LTRIM(
                  RTRIM(email)
                )
              ) =
              @email
          `);

      let user =
        existingUserResult
          .recordset[0];

      if (
        mode ===
        "login"
      ) {
        if (!user) {
          return response
            .status(404)
            .json({
              success:
                false,

              errorCode:
                "GOOGLE_ACCOUNT_NOT_REGISTERED",

              message:
                "Aucun compte n’est associé à cette adresse Google. Créez d’abord votre compte.",
            });
        }

        if (
          !user.is_active
        ) {
          return response
            .status(403)
            .json({
              success:
                false,

              errorCode:
                "ACCOUNT_DISABLED",

              message:
                "Ce compte utilisateur est désactivé.",
            });
        }

        if (
          !user.auth_provider ||
          user.auth_provider ===
            "google"
        ) {
          await database
            .request()

            .input(
              "userId",
              sql.UniqueIdentifier,
              user.id,
            )

            .input(
              "provider",
              sql.NVarChar(
                30,
              ),
              "google",
            )

            .input(
              "providerId",
              sql.NVarChar(
                255,
              ),
              String(
                payload.sub,
              ),
            )

            .input(
              "avatarUrl",
              sql.NVarChar(
                1000,
              ),
              payload.picture ||
                null,
            )

            .query(`
              UPDATE dbo.users

              SET
                auth_provider = @provider,
                provider_id = @providerId,
                avatar_url =
                  COALESCE(
                    @avatarUrl,
                    avatar_url
                  )

              WHERE
                id = @userId
            `);

          user = {
            ...user,

            auth_provider:
              "google",

            provider_id:
              String(
                payload.sub,
              ),

            avatar_url:
              payload.picture ||
              user.avatar_url,
          };
        }

        const accessToken =
          createAccessToken(
            user,
          );

        return response
          .status(200)
          .json({
            success:
              true,

            message:
              "Connexion Google réussie.",

            accessToken,

            expiresIn:
              process.env
                .JWT_EXPIRES_IN ||
              "8h",

            isNewUser:
              false,

            mode:
              "login",

            user:
              formatUser(
                user,
              ),
          });
      }

      if (user) {
        return response
          .status(409)
          .json({
            success:
              false,

            errorCode:
              "GOOGLE_ACCOUNT_ALREADY_EXISTS",

            message:
              "Un compte existe déjà avec cette adresse Google. Utilisez l’onglet Connexion.",
          });
      }

      transaction =
        new sql.Transaction(
          database,
        );

      await transaction.begin();

      const firstName =
        String(
          payload.given_name ||
            payload.name ||
            "Google",
        ).trim();

      const lastName =
        String(
          payload.family_name ||
            "User",
        ).trim();

      const organizationName =
        payload.name
          ? `${payload.name} Organization`
          : "Google Organization";

      const countryCode =
        normalizeCountryCode(
          process.env
            .DEFAULT_COUNTRY_CODE ||
            "TN",
        );

      const organizationResult =
        await transaction
          .request()

          .input(
            "name",
            sql.NVarChar(
              150,
            ),
            organizationName,
          )

          .input(
            "countryCode",
            sql.NVarChar(
              10,
            ),
            countryCode,
          )

          .query(`
            INSERT INTO dbo.organizations (
              name,
              tax_identifier,
              country_code,
              is_active
            )

            OUTPUT
              INSERTED.id,
              INSERTED.name,
              INSERTED.tax_identifier,
              INSERTED.country_code,
              INSERTED.is_active

            VALUES (
              @name,
              NULL,
              @countryCode,
              1
            )
          `);

      const organization =
        organizationResult
          .recordset[0];

      const randomPasswordHash =
        await bcrypt.hash(
          [
            "google",
            payload.sub,
            Date.now(),
            Math.random(),
          ].join(
            "-",
          ),
          12,
        );

      const userResult =
        await transaction
          .request()

          .input(
            "organizationId",
            sql.UniqueIdentifier,
            organization.id,
          )

          .input(
            "firstName",
            sql.NVarChar(
              100,
            ),
            firstName,
          )

          .input(
            "lastName",
            sql.NVarChar(
              100,
            ),
            lastName,
          )

          .input(
            "email",
            sql.NVarChar(
              255,
            ),
            email,
          )

          .input(
            "countryCode",
            sql.NVarChar(
              10,
            ),
            countryCode,
          )

          .input(
            "passwordHash",
            sql.NVarChar(
              255,
            ),
            randomPasswordHash,
          )

          .input(
            "role",
            sql.NVarChar(
              30,
            ),
            "CLIENT",
          )

          .input(
            "authProvider",
            sql.NVarChar(
              30,
            ),
            "google",
          )

          .input(
            "providerId",
            sql.NVarChar(
              255,
            ),
            String(
              payload.sub,
            ),
          )

          .input(
            "avatarUrl",
            sql.NVarChar(
              1000,
            ),
            payload.picture ||
              null,
          )

          .query(`
            INSERT INTO dbo.users (
              organization_id,
              first_name,
              last_name,
              email,
              phone,
              city,
              country_code,
              password_hash,
              role,
              is_active,
              auth_provider,
              provider_id,
              avatar_url
            )

            OUTPUT
              INSERTED.id,
              INSERTED.organization_id,
              INSERTED.first_name,
              INSERTED.last_name,
              INSERTED.email,
              INSERTED.phone,
              INSERTED.city,
              INSERTED.country_code,
              INSERTED.role,
              INSERTED.is_active,
              INSERTED.auth_provider,
              INSERTED.provider_id,
              INSERTED.avatar_url,
              INSERTED.created_at,
              INSERTED.updated_at

            VALUES (
              @organizationId,
              @firstName,
              @lastName,
              @email,
              NULL,
              NULL,
              @countryCode,
              @passwordHash,
              @role,
              1,
              @authProvider,
              @providerId,
              @avatarUrl
            )
          `);

      user =
        userResult
          .recordset[0];

      await transaction.commit();

      transaction =
        null;

      const accessToken =
        createAccessToken(
          user,
        );

      return response
        .status(201)
        .json({
          success:
            true,

          message:
            "Merci de nous avoir rejoints ! Votre compte Google a été créé avec succès.",

          accessToken,

          expiresIn:
            process.env
              .JWT_EXPIRES_IN ||
            "8h",

          isNewUser:
            true,

          mode:
            "register",

          profileCompletionRequired:
            true,

          user:
            formatUser(
              user,
            ),

          organization,
        });
    } catch (
      error
    ) {
      if (
        transaction
      ) {
        try {
          await transaction.rollback();
        } catch (
          rollbackError
        ) {
          console.error(
            "GOOGLE ROLLBACK ERROR:",
            rollbackError,
          );
        }
      }

      return next(
        error,
      );
    }
  },
);

/*
|--------------------------------------------------------------------------
| GITHUB
|--------------------------------------------------------------------------
*/

router.get(
  "/github",

  async (
    request,
    response,
    next,
  ) => {
    try {
      const captcha =
        await verifyRecaptcha(
          request.query
            ?.recaptchaToken,

          request.ip,
        );

      if (
        !captcha.success
      ) {
        return sendRecaptchaError(
          response,
          captcha,
        );
      }

      return next();
    } catch (
      error
    ) {
      return next(
        error,
      );
    }
  },

  redirectToGitHub,
);

router.get(
  "/github/callback",
  githubCallback,
);

/*
|--------------------------------------------------------------------------
| CURRENT USER
|--------------------------------------------------------------------------
*/

router.get(
  "/me",

  authenticate,

  async (
    request,
    response,
    next,
  ) => {
    try {
      const database =
        getDatabase();

      const result =
        await database
          .request()

          .input(
            "userId",
            sql.UniqueIdentifier,
            request.user.id,
          )

          .query(`
            SELECT TOP (1)
              u.id,
              u.organization_id,
              u.first_name,
              u.last_name,
              u.email,
              u.phone,
              u.city,
              u.country_code,
              u.role,
              u.is_active,
              u.auth_provider,
              u.provider_id,
              u.avatar_url,
              u.created_at,
              u.updated_at,

              o.name
                AS organization_name,

              o.tax_identifier,

              o.country_code
                AS organization_country_code,

              o.is_active
                AS organization_is_active

            FROM dbo.users u

            LEFT JOIN dbo.organizations o
              ON
                o.id =
                u.organization_id

            WHERE
              u.id =
                @userId
          `);

      const user =
        result
          .recordset[0];

      if (!user) {
        return response
          .status(404)
          .json({
            success:
              false,

            message:
              "Utilisateur introuvable.",
          });
      }

      return response
        .status(200)
        .json({
          success:
            true,

          user: {
            ...formatUser(
              user,
            ),

            organization:
              user.organization_id
                ? {
                    id:
                      user.organization_id,

                    name:
                      user.organization_name,

                    taxIdentifier:
                      user.tax_identifier ||
                      null,

                    countryCode:
                      user.organization_country_code ||
                      null,

                    isActive:
                      Boolean(
                        user.organization_is_active,
                      ),
                  }
                : null,
          },
        });
    } catch (
      error
    ) {
      return next(
        error,
      );
    }
  },
);

/*
|--------------------------------------------------------------------------
| LOGOUT
|--------------------------------------------------------------------------
*/

router.post(
  "/logout",

  authenticate,

  (
    request,
    response,
  ) => {
    return response
      .status(200)
      .json({
        success:
          true,

        message:
          "Déconnexion réussie.",
      });
  },
);

module.exports =
  router;