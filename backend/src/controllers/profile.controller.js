const bcrypt =
  require('bcryptjs');

const fs =
  require('fs/promises');

const path =
  require('path');

const {
  sql,
  getDatabase,
} =
  require('../config/database');

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function getAuthenticatedUserId(
  req,
) {
  const userId =
    req.user?.id;

  if (!userId) {
    throw new Error(
      "Identifiant utilisateur introuvable dans le jeton.",
    );
  }

  return userId;
}

function normalizeText(
  value,
  maxLength = 255,
) {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  const text =
    String(value)
      .trim();

  if (!text) {
    return null;
  }

  return text.slice(
    0,
    maxLength,
  );
}

function buildAvatarUrl(
  req,
  avatarUrl,
) {
  if (!avatarUrl) {
    return null;
  }

  if (
    avatarUrl.startsWith(
      'http://',
    ) ||
    avatarUrl.startsWith(
      'https://',
    )
  ) {
    return avatarUrl;
  }

  return (
    `${req.protocol}://` +
    `${req.get('host')}` +
    `${avatarUrl}`
  );
}

function serializeProfile(
  req,
  user,
) {
  if (!user) {
    return null;
  }

  return {
    id:
      user.id,

    organization_id:
      user.organization_id,

    first_name:
      user.first_name,

    last_name:
      user.last_name,

    full_name:
      [
        user.first_name,
        user.last_name,
      ]
        .filter(Boolean)
        .join(' '),

    email:
      user.email,

    phone:
      user.phone,

    city:
      user.city,

    country_code:
      user.country_code,

    role:
      user.role,

    is_active:
      Boolean(
        user.is_active,
      ),

    auth_provider:
      user.auth_provider,

    avatar_url:
      user.avatar_url,

    avatar_absolute_url:
      buildAvatarUrl(
        req,
        user.avatar_url,
      ),

    created_at:
      user.created_at,

    updated_at:
      user.updated_at,
  };
}

/*
|--------------------------------------------------------------------------
| GET /api/profile
|--------------------------------------------------------------------------
*/

async function getProfile(
  req,
  res,
) {
  try {
    const userId =
      getAuthenticatedUserId(
        req,
      );

    const pool =
      getDatabase();

    const result =
      await pool
        .request()

        .input(
          'user_id',
          sql.UniqueIdentifier,
          userId,
        )

        .query(`
          SELECT TOP 1
            id,
            organization_id,

            first_name,
            last_name,
            email,

            phone,
            city,
            country_code,

            role,
            is_active,

            auth_provider,
            provider_id,

            avatar_url,

            created_at,
            updated_at

          FROM dbo.users

          WHERE
            id = @user_id;
        `);

    if (
      result.recordset.length === 0
    ) {
      return res
        .status(404)
        .json({
          success: false,

          errorCode:
            'PROFILE_NOT_FOUND',

          message:
            'Profil utilisateur introuvable.',
        });
    }

    return res
      .status(200)
      .json({
        success: true,

        profile:
          serializeProfile(
            req,
            result.recordset[0],
          ),
      });
  } catch (error) {
    console.error(
      'getProfile error:',
      error,
    );

    return res
      .status(500)
      .json({
        success: false,

        errorCode:
          'PROFILE_LOAD_FAILED',

        message:
          'Impossible de charger le profil.',

        error:
          error.message,
      });
  }
}

/*
|--------------------------------------------------------------------------
| PUT /api/profile
|--------------------------------------------------------------------------
*/

async function updateProfile(
  req,
  res,
) {
  try {
    const userId =
      getAuthenticatedUserId(
        req,
      );

    /*
    |--------------------------------------------------------------------------
    | DONNÉES
    |--------------------------------------------------------------------------
    */

    const firstName =
      normalizeText(
        req.body?.first_name,
        100,
      );

    const lastName =
      normalizeText(
        req.body?.last_name,
        100,
      );

    const phone =
      normalizeText(
        req.body?.phone,
        50,
      );

    const city =
      normalizeText(
        req.body?.city,
        120,
      );

    const countryCode =
      normalizeText(
        req.body?.country_code,
        10,
      );

    if (!firstName) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            'FIRST_NAME_REQUIRED',

          message:
            'Le prénom est obligatoire.',
        });
    }

    if (!lastName) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            'LAST_NAME_REQUIRED',

          message:
            'Le nom est obligatoire.',
        });
    }

    const pool =
      getDatabase();

    const result =
      await pool
        .request()

        .input(
          'user_id',
          sql.UniqueIdentifier,
          userId,
        )

        .input(
          'first_name',
          sql.NVarChar(100),
          firstName,
        )

        .input(
          'last_name',
          sql.NVarChar(100),
          lastName,
        )

        .input(
          'phone',
          sql.NVarChar(50),
          phone,
        )

        .input(
          'city',
          sql.NVarChar(120),
          city,
        )

        .input(
          'country_code',
          sql.NVarChar(10),
          countryCode
            ? countryCode
                .toUpperCase()
            : null,
        )

        .query(`
          UPDATE dbo.users

          SET
            first_name =
              @first_name,

            last_name =
              @last_name,

            phone =
              @phone,

            city =
              @city,

            country_code =
              @country_code,

            updated_at =
              SYSUTCDATETIME()

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

            INSERTED.avatar_url,

            INSERTED.created_at,
            INSERTED.updated_at

          WHERE
            id =
              @user_id;
        `);

    if (
      result.recordset.length === 0
    ) {
      return res
        .status(404)
        .json({
          success: false,

          errorCode:
            'PROFILE_NOT_FOUND',

          message:
            'Profil utilisateur introuvable.',
        });
    }

    return res
      .status(200)
      .json({
        success: true,

        message:
          'Profil mis à jour avec succès.',

        profile:
          serializeProfile(
            req,
            result.recordset[0],
          ),
      });
  } catch (error) {
    console.error(
      'updateProfile error:',
      error,
    );

    return res
      .status(500)
      .json({
        success: false,

        errorCode:
          'PROFILE_UPDATE_FAILED',

        message:
          'Impossible de modifier le profil.',

        error:
          error.message,
      });
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/profile/avatar
|--------------------------------------------------------------------------
*/

async function uploadAvatar(
  req,
  res,
) {
  try {
    const userId =
      getAuthenticatedUserId(
        req,
      );

    if (!req.file) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            'AVATAR_REQUIRED',

          message:
            'Aucune image reçue.',
        });
    }

    const pool =
      getDatabase();

    /*
    |--------------------------------------------------------------------------
    | AVATAR ACTUEL
    |--------------------------------------------------------------------------
    */

    const existingResult =
      await pool
        .request()

        .input(
          'user_id',
          sql.UniqueIdentifier,
          userId,
        )

        .query(`
          SELECT TOP 1
            avatar_url

          FROM dbo.users

          WHERE
            id =
              @user_id;
        `);

    if (
      existingResult.recordset.length === 0
    ) {
      return res
        .status(404)
        .json({
          success: false,

          errorCode:
            'PROFILE_NOT_FOUND',

          message:
            'Profil utilisateur introuvable.',
        });
    }

    const oldAvatar =
      existingResult
        .recordset[0]
        ?.avatar_url ||
      null;

    /*
    |--------------------------------------------------------------------------
    | NOUVELLE URL
    |--------------------------------------------------------------------------
    */

    const avatarUrl =
      `/uploads/avatars/${req.file.filename}`;

    const updateResult =
      await pool
        .request()

        .input(
          'user_id',
          sql.UniqueIdentifier,
          userId,
        )

        .input(
          'avatar_url',
          sql.NVarChar(1000),
          avatarUrl,
        )

        .query(`
          UPDATE dbo.users

          SET
            avatar_url =
              @avatar_url,

            updated_at =
              SYSUTCDATETIME()

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

            INSERTED.avatar_url,

            INSERTED.created_at,
            INSERTED.updated_at

          WHERE
            id =
              @user_id;
        `);

    /*
    |--------------------------------------------------------------------------
    | SUPPRIMER ANCIEN AVATAR LOCAL
    |--------------------------------------------------------------------------
    */

    if (
      oldAvatar &&
      oldAvatar.startsWith(
        '/uploads/avatars/',
      ) &&
      oldAvatar !==
        avatarUrl
    ) {
      const oldFileName =
        path.basename(
          oldAvatar,
        );

      const oldFilePath =
        path.join(
          process.cwd(),
          'uploads',
          'avatars',
          oldFileName,
        );

      try {
        await fs.unlink(
          oldFilePath,
        );
      } catch (deleteError) {
        if (
          deleteError.code !==
          'ENOENT'
        ) {
          console.warn(
            'Suppression ancien avatar impossible:',
            deleteError.message,
          );
        }
      }
    }

    return res
      .status(200)
      .json({
        success: true,

        message:
          'Photo de profil mise à jour.',

        profile:
          serializeProfile(
            req,
            updateResult.recordset[0],
          ),
      });
  } catch (error) {
    console.error(
      'uploadAvatar error:',
      error,
    );

    return res
      .status(500)
      .json({
        success: false,

        errorCode:
          'AVATAR_UPLOAD_FAILED',

        message:
          'Impossible de modifier la photo de profil.',

        error:
          error.message,
      });
  }
}

/*
|--------------------------------------------------------------------------
| DELETE /api/profile/avatar
|--------------------------------------------------------------------------
*/

async function deleteAvatar(
  req,
  res,
) {
  try {
    const userId =
      getAuthenticatedUserId(
        req,
      );

    const pool =
      getDatabase();

    const existingResult =
      await pool
        .request()

        .input(
          'user_id',
          sql.UniqueIdentifier,
          userId,
        )

        .query(`
          SELECT TOP 1
            avatar_url

          FROM dbo.users

          WHERE
            id =
              @user_id;
        `);

    if (
      existingResult.recordset.length === 0
    ) {
      return res
        .status(404)
        .json({
          success: false,

          errorCode:
            'PROFILE_NOT_FOUND',

          message:
            'Profil utilisateur introuvable.',
        });
    }

    const currentAvatar =
      existingResult
        .recordset[0]
        ?.avatar_url ||
      null;

    const updateResult =
      await pool
        .request()

        .input(
          'user_id',
          sql.UniqueIdentifier,
          userId,
        )

        .query(`
          UPDATE dbo.users

          SET
            avatar_url =
              NULL,

            updated_at =
              SYSUTCDATETIME()

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

            INSERTED.avatar_url,

            INSERTED.created_at,
            INSERTED.updated_at

          WHERE
            id =
              @user_id;
        `);

    /*
    |--------------------------------------------------------------------------
    | SUPPRIMER FICHIER
    |--------------------------------------------------------------------------
    */

    if (
      currentAvatar &&
      currentAvatar.startsWith(
        '/uploads/avatars/',
      )
    ) {
      const filePath =
        path.join(
          process.cwd(),
          'uploads',
          'avatars',
          path.basename(
            currentAvatar,
          ),
        );

      try {
        await fs.unlink(
          filePath,
        );
      } catch (deleteError) {
        if (
          deleteError.code !==
          'ENOENT'
        ) {
          console.warn(
            'Suppression avatar impossible:',
            deleteError.message,
          );
        }
      }
    }

    return res
      .status(200)
      .json({
        success: true,

        message:
          'Photo de profil supprimée.',

        profile:
          serializeProfile(
            req,
            updateResult.recordset[0],
          ),
      });
  } catch (error) {
    console.error(
      'deleteAvatar error:',
      error,
    );

    return res
      .status(500)
      .json({
        success: false,

        errorCode:
          'AVATAR_DELETE_FAILED',

        message:
          'Impossible de supprimer la photo de profil.',

        error:
          error.message,
      });
  }
}

/*
|--------------------------------------------------------------------------
| PUT /api/profile/password
|--------------------------------------------------------------------------
*/

async function changePassword(
  req,
  res,
) {
  try {
    const userId =
      getAuthenticatedUserId(
        req,
      );

    const currentPassword =
      String(
        req.body
          ?.current_password ||
        '',
      );

    const newPassword =
      String(
        req.body
          ?.new_password ||
        '',
      );

    const confirmPassword =
      String(
        req.body
          ?.confirm_password ||
        '',
      );

    if (!currentPassword) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            'CURRENT_PASSWORD_REQUIRED',

          message:
            'Le mot de passe actuel est obligatoire.',
        });
    }

    if (
      newPassword.length < 8
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            'PASSWORD_TOO_SHORT',

          message:
            'Le nouveau mot de passe doit contenir au moins 8 caractères.',
        });
    }

    if (
      newPassword !==
      confirmPassword
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            'PASSWORD_CONFIRMATION_MISMATCH',

          message:
            'La confirmation du mot de passe ne correspond pas.',
        });
    }

    if (
      currentPassword ===
      newPassword
    ) {
      return res
        .status(400)
        .json({
          success: false,

          errorCode:
            'PASSWORD_UNCHANGED',

          message:
            'Le nouveau mot de passe doit être différent du mot de passe actuel.',
        });
    }

    const pool =
      getDatabase();

    const result =
      await pool
        .request()

        .input(
          'user_id',
          sql.UniqueIdentifier,
          userId,
        )

        .query(`
          SELECT TOP 1
            id,
            password_hash,
            auth_provider

          FROM dbo.users

          WHERE
            id =
              @user_id;
        `);

    if (
      result.recordset.length === 0
    ) {
      return res
        .status(404)
        .json({
          success: false,

          errorCode:
            'PROFILE_NOT_FOUND',

          message:
            'Utilisateur introuvable.',
        });
    }

    const user =
      result.recordset[0];

    if (!user.password_hash) {
      return res
        .status(409)
        .json({
          success: false,

          errorCode:
            'PASSWORD_NOT_AVAILABLE',

          message:
            'Ce compte utilise une connexion externe. Aucun mot de passe local n’est actuellement défini.',
        });
    }

    const passwordMatches =
      await bcrypt.compare(
        currentPassword,
        user.password_hash,
      );

    if (!passwordMatches) {
      return res
        .status(401)
        .json({
          success: false,

          errorCode:
            'CURRENT_PASSWORD_INVALID',

          message:
            'Le mot de passe actuel est incorrect.',
        });
    }

    const passwordHash =
      await bcrypt.hash(
        newPassword,
        12,
      );

    await pool
      .request()

      .input(
        'user_id',
        sql.UniqueIdentifier,
        userId,
      )

      .input(
        'password_hash',
        sql.NVarChar(255),
        passwordHash,
      )

      .query(`
        UPDATE dbo.users

        SET
          password_hash =
            @password_hash,

          updated_at =
            SYSUTCDATETIME()

        WHERE
          id =
            @user_id;
      `);

    return res
      .status(200)
      .json({
        success: true,

        message:
          'Mot de passe modifié avec succès.',
      });
  } catch (error) {
    console.error(
      'changePassword error:',
      error,
    );

    return res
      .status(500)
      .json({
        success: false,

        errorCode:
          'PASSWORD_CHANGE_FAILED',

        message:
          'Impossible de modifier le mot de passe.',

        error:
          error.message,
      });
  }
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  getProfile,
  updateProfile,
  uploadAvatar,
  deleteAvatar,
  changePassword,
};