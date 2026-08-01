const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const {
  OAuth2Client,
} = require('google-auth-library');

const {
  redirectToGitHub,
  githubCallback,
} = require('../controllers/auth.controller');

const {
  sql,
  getDatabase,
} = require('../config/database');

const authenticate =
  require('../middleware/authenticate');

const router = express.Router();

const googleClient =
  new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
  );

console.log(
  '=== AUTH.ROUTES.JS V3 CHARGE ===',
);

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function formatUser(user) {
  return {
    id:
      user.id,

    organizationId:
      user.organization_id || null,

    firstName:
      user.first_name || '',

    lastName:
      user.last_name || '',

    fullName: [
      user.first_name,
      user.last_name,
    ]
      .filter(Boolean)
      .join(' '),

    email:
      user.email,

    role:
      user.role,

    isActive:
      Boolean(user.is_active),

    authProvider:
      user.auth_provider || null,

    avatarUrl:
      user.avatar_url || null,

    createdAt:
      user.created_at || null,
  };
}

function createAccessToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error(
      'JWT_SECRET is not configured.',
    );
  }

  return jwt.sign(
    {
      sub:
        String(user.id),

      email:
        user.email,

      role:
        user.role,

      organizationId:
        user.organization_id || null,

      tokenType:
        'access',
    },
    process.env.JWT_SECRET,
    {
      expiresIn:
        process.env.JWT_EXPIRES_IN ||
        '8h',

      issuer:
        'intelligent-invoice-platform',

      audience:
        'invoice-portal-web',
    },
  );
}

/*
|--------------------------------------------------------------------------
| ROUTES TEST
|--------------------------------------------------------------------------
*/

router.get(
  '/routes-test',
  (request, response) => {
    return response.status(200).json({
      success: true,

      message:
        'Les routes Auth sont actives.',

      registerAvailable: true,
      loginAvailable: true,
      googleAvailable: true,
      githubAvailable: true,
      meAvailable: true,

      version:
        'AUTH-V3',
    });
  },
);

/*
|--------------------------------------------------------------------------
| REGISTER
|--------------------------------------------------------------------------
*/

router.post(
  '/register',
  async (
    request,
    response,
    next,
  ) => {
    let transaction = null;

    try {
      const organizationName =
        String(
          request.body
            .organizationName || '',
        ).trim();

      const taxIdentifier =
        String(
          request.body
            .taxIdentifier || '',
        ).trim();

      const countryCode =
        String(
          request.body
            .countryCode || 'TN',
        )
          .trim()
          .toUpperCase();

      const firstName =
        String(
          request.body
            .firstName || '',
        ).trim();

      const lastName =
        String(
          request.body
            .lastName || '',
        ).trim();

      const email =
        normalizeEmail(
          request.body.email,
        );

      const password =
        String(
          request.body
            .password || '',
        );

      if (!organizationName) {
        return response
          .status(422)
          .json({
            success: false,

            errorCode:
              'ORGANIZATION_NAME_REQUIRED',

            message:
              'Le nom de l’organisation est obligatoire.',
          });
      }

      if (!firstName || !lastName) {
        return response
          .status(422)
          .json({
            success: false,

            errorCode:
              'USER_NAME_REQUIRED',

            message:
              'Le prénom et le nom sont obligatoires.',
          });
      }

      if (
        !email ||
        !email.includes('@')
      ) {
        return response
          .status(422)
          .json({
            success: false,

            errorCode:
              'INVALID_EMAIL',

            message:
              'Adresse e-mail invalide.',
          });
      }

      if (password.length < 8) {
        return response
          .status(422)
          .json({
            success: false,

            errorCode:
              'WEAK_PASSWORD',

            message:
              'Le mot de passe doit contenir au moins 8 caractères.',
          });
      }

      const database =
        getDatabase();

      const existingUserResult =
        await database
          .request()
          .input(
            'email',
            sql.NVarChar(255),
            email,
          )
          .query(`
            SELECT TOP (1)
              id
            FROM dbo.users
            WHERE
              LOWER(LTRIM(RTRIM(email))) =
              @email
          `);

      if (
        existingUserResult
          .recordset.length > 0
      ) {
        return response
          .status(409)
          .json({
            success: false,

            errorCode:
              'EMAIL_ALREADY_USED',

            message:
              'Un compte existe déjà avec cette adresse e-mail.',
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
            'name',
            sql.NVarChar(150),
            organizationName,
          )
          .input(
            'taxIdentifier',
            sql.NVarChar(100),
            taxIdentifier || null,
          )
          .input(
            'countryCode',
            sql.NVarChar(10),
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
            'organizationId',
            sql.UniqueIdentifier,
            organization.id,
          )
          .input(
            'firstName',
            sql.NVarChar(100),
            firstName,
          )
          .input(
            'lastName',
            sql.NVarChar(100),
            lastName,
          )
          .input(
            'email',
            sql.NVarChar(255),
            email,
          )
          .input(
            'passwordHash',
            sql.NVarChar(255),
            passwordHash,
          )
          .input(
            'role',
            sql.NVarChar(30),
            'CLIENT',
          )
          .query(`
            INSERT INTO dbo.users (
              organization_id,
              first_name,
              last_name,
              email,
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
              INSERTED.role,
              INSERTED.is_active,
              INSERTED.created_at
            VALUES (
              @organizationId,
              @firstName,
              @lastName,
              @email,
              @passwordHash,
              @role,
              1
            )
          `);

      const user =
        userResult.recordset[0];

      await transaction.commit();

      transaction = null;

      const accessToken =
        createAccessToken(user);

      return response
        .status(201)
        .json({
          success: true,

          message:
            'Compte créé avec succès.',

          accessToken,

          expiresIn:
            process.env
              .JWT_EXPIRES_IN ||
            '8h',

          user:
            formatUser(user),

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
    } catch (error) {
      if (transaction) {
        try {
          await transaction.rollback();
        } catch (rollbackError) {
          console.error(
            'Register rollback error:',
            rollbackError,
          );
        }
      }

      return next(error);
    }
  },
);

/*
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
*/

router.post(
  '/login',
  async (
    request,
    response,
    next,
  ) => {
    try {
      const email =
        normalizeEmail(
          request.body.email,
        );

      const password =
        String(
          request.body
            .password || '',
        );

      if (!email || !password) {
        return response
          .status(422)
          .json({
            success: false,

            errorCode:
              'EMAIL_AND_PASSWORD_REQUIRED',

            message:
              'E-mail et mot de passe obligatoires.',
          });
      }

      const database =
        getDatabase();

      const result =
        await database
          .request()
          .input(
            'email',
            sql.NVarChar(255),
            email,
          )
          .query(`
            SELECT TOP (1)
              id,
              organization_id,
              first_name,
              last_name,
              email,
              password_hash,
              role,
              is_active,
              auth_provider,
              provider_id,
              avatar_url,
              created_at
            FROM dbo.users
            WHERE
              LOWER(LTRIM(RTRIM(email))) =
              @email
          `);

      const user =
        result.recordset[0];

      if (!user) {
        return response
          .status(401)
          .json({
            success: false,

            errorCode:
              'INVALID_CREDENTIALS',

            message:
              'E-mail ou mot de passe incorrect.',
          });
      }

      if (!user.is_active) {
        return response
          .status(403)
          .json({
            success: false,

            errorCode:
              'ACCOUNT_DISABLED',

            message:
              'Ce compte utilisateur est désactivé.',
          });
      }

      const storedHash =
        String(
          user.password_hash || '',
        ).trim();

      const validPassword =
        await bcrypt.compare(
          password,
          storedHash,
        );

      if (!validPassword) {
        return response
          .status(401)
          .json({
            success: false,

            errorCode:
              'INVALID_CREDENTIALS',

            message:
              'E-mail ou mot de passe incorrect.',
          });
      }

      const accessToken =
        createAccessToken(user);

      return response
        .status(200)
        .json({
          success: true,

          message:
            'Connexion réussie.',

          accessToken,

          expiresIn:
            process.env
              .JWT_EXPIRES_IN ||
            '8h',

          user:
            formatUser(user),
        });
    } catch (error) {
      return next(error);
    }
  },
);

/*
|--------------------------------------------------------------------------
| GOOGLE AUTH
|--------------------------------------------------------------------------
*/

router.post(
  '/google',
  async (
    request,
    response,
    next,
  ) => {
    let transaction = null;

    try {
      const credential =
        String(
          request.body
            .credential || '',
        ).trim();

      if (!credential) {
        return response
          .status(422)
          .json({
            success: false,

            errorCode:
              'GOOGLE_CREDENTIAL_REQUIRED',

            message:
              'Le jeton Google est obligatoire.',
          });
      }

      if (
        !process.env
          .GOOGLE_CLIENT_ID
      ) {
        throw new Error(
          'GOOGLE_CLIENT_ID is not configured.',
        );
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
            success: false,

            errorCode:
              'INVALID_GOOGLE_ACCOUNT',

            message:
              'Le compte Google est invalide ou non vérifié.',
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
            'email',
            sql.NVarChar(255),
            email,
          )
          .query(`
            SELECT TOP (1)
              id,
              organization_id,
              first_name,
              last_name,
              email,
              password_hash,
              role,
              is_active,
              auth_provider,
              provider_id,
              avatar_url,
              created_at
            FROM dbo.users
            WHERE
              LOWER(LTRIM(RTRIM(email))) =
              @email
          `);

      let user =
        existingUserResult
          .recordset[0];

      let isNewUser = false;

      if (!user) {
        transaction =
          new sql.Transaction(
            database,
          );

        await transaction.begin();

        const organizationName =
          payload.name
            ? `${payload.name} Organization`
            : 'Google Organization';

        const organizationResult =
          await transaction
            .request()
            .input(
              'name',
              sql.NVarChar(150),
              organizationName,
            )
            .input(
              'countryCode',
              sql.NVarChar(10),
              'TN',
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
                INSERTED.country_code,
                INSERTED.is_active,
                INSERTED.created_at
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
              payload.sub,
              Date.now(),
              Math.random(),
            ].join('-'),
            12,
          );

        const firstName =
          String(
            payload.given_name ||
              payload.name ||
              'Google',
          ).trim();

        const lastName =
          String(
            payload.family_name ||
              'User',
          ).trim();

        const userResult =
          await transaction
            .request()
            .input(
              'organizationId',
              sql.UniqueIdentifier,
              organization.id,
            )
            .input(
              'firstName',
              sql.NVarChar(100),
              firstName,
            )
            .input(
              'lastName',
              sql.NVarChar(100),
              lastName,
            )
            .input(
              'email',
              sql.NVarChar(255),
              email,
            )
            .input(
              'passwordHash',
              sql.NVarChar(255),
              randomPasswordHash,
            )
            .input(
              'role',
              sql.NVarChar(30),
              'CLIENT',
            )
            .input(
              'authProvider',
              sql.NVarChar(30),
              'google',
            )
            .input(
              'providerId',
              sql.NVarChar(255),
              String(payload.sub),
            )
            .input(
              'avatarUrl',
              sql.NVarChar(1000),
              payload.picture || null,
            )
            .query(`
              INSERT INTO dbo.users (
                organization_id,
                first_name,
                last_name,
                email,
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
                INSERTED.password_hash,
                INSERTED.role,
                INSERTED.is_active,
                INSERTED.auth_provider,
                INSERTED.provider_id,
                INSERTED.avatar_url,
                INSERTED.created_at
              VALUES (
                @organizationId,
                @firstName,
                @lastName,
                @email,
                @passwordHash,
                @role,
                1,
                @authProvider,
                @providerId,
                @avatarUrl
              )
            `);

        user =
          userResult.recordset[0];

        await transaction.commit();

        transaction = null;
        isNewUser = true;
      }

      if (!user.is_active) {
        return response
          .status(403)
          .json({
            success: false,

            errorCode:
              'ACCOUNT_DISABLED',

            message:
              'Ce compte utilisateur est désactivé.',
          });
      }

      const accessToken =
        createAccessToken(user);

      return response
        .status(200)
        .json({
          success: true,

          message:
            isNewUser
              ? 'Compte Google créé avec succès.'
              : 'Connexion Google réussie.',

          accessToken,

          expiresIn:
            process.env
              .JWT_EXPIRES_IN ||
            '8h',

          isNewUser,

          user:
            formatUser(user),
        });
    } catch (error) {
      if (transaction) {
        try {
          await transaction.rollback();
        } catch (rollbackError) {
          console.error(
            'Google rollback error:',
            rollbackError,
          );
        }
      }

      console.error(
        'GOOGLE AUTH ERROR:',
        error,
      );

      if (
        error.message ===
        'GOOGLE_CLIENT_ID is not configured.'
      ) {
        return next(error);
      }

      return response
        .status(401)
        .json({
          success: false,

          errorCode:
            'GOOGLE_AUTHENTICATION_FAILED',

          message:
            'La connexion Google a échoué.',
        });
    }
  },
);

/*
|--------------------------------------------------------------------------
| GITHUB AUTH
|--------------------------------------------------------------------------
*/

router.get(
  '/github',
  redirectToGitHub,
);

router.get(
  '/github/callback',
  githubCallback,
);

/*
|--------------------------------------------------------------------------
| CURRENT USER
|--------------------------------------------------------------------------
*/

router.get(
  '/me',
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
            'userId',
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
              u.role,
              u.is_active,
              u.auth_provider,
              u.provider_id,
              u.avatar_url,
              u.created_at,

              o.name
                AS organization_name,

              o.tax_identifier,

              o.country_code,

              o.is_active
                AS organization_is_active

            FROM dbo.users u

            LEFT JOIN dbo.organizations o
              ON o.id =
                u.organization_id

            WHERE u.id = @userId
          `);

      const user =
        result.recordset[0];

      if (!user) {
        return response
          .status(404)
          .json({
            success: false,

            errorCode:
              'USER_NOT_FOUND',

            message:
              'Utilisateur introuvable.',
          });
      }

      return response
        .status(200)
        .json({
          success: true,

          message:
            'Utilisateur connecté récupéré.',

          user: {
            ...formatUser(user),

            organization:
              user.organization_id
                ? {
                    id:
                      user.organization_id,

                    name:
                      user.organization_name,

                    taxIdentifier:
                      user.tax_identifier,

                    countryCode:
                      user.country_code,

                    isActive:
                      Boolean(
                        user
                          .organization_is_active,
                      ),
                  }
                : null,
          },
        });
    } catch (error) {
      return next(error);
    }
  },
);

/*
|--------------------------------------------------------------------------
| LOGOUT
|--------------------------------------------------------------------------
*/

router.post(
  '/logout',
  authenticate,
  (
    request,
    response,
  ) => {
    return response
      .status(200)
      .json({
        success: true,

        message:
          'Déconnexion réussie.',
      });
  },
);

module.exports = router;