const multer =
  require('multer');

const path =
  require('path');

const fs =
  require('fs');

/*
|--------------------------------------------------------------------------
| DOSSIER DES AVATARS
|--------------------------------------------------------------------------
*/

const avatarDirectory =
  path.join(
    process.cwd(),
    'uploads',
    'avatars',
  );

/*
|--------------------------------------------------------------------------
| CRÉER LE DOSSIER S'IL N'EXISTE PAS
|--------------------------------------------------------------------------
*/

if (
  !fs.existsSync(
    avatarDirectory,
  )
) {
  fs.mkdirSync(
    avatarDirectory,
    {
      recursive:
        true,
    },
  );
}

/*
|--------------------------------------------------------------------------
| STORAGE
|--------------------------------------------------------------------------
*/

const storage =
  multer.diskStorage({
    /*
    |--------------------------------------------------------------------------
    | DESTINATION
    |--------------------------------------------------------------------------
    */

    destination(
      req,
      file,
      callback,
    ) {
      callback(
        null,
        avatarDirectory,
      );
    },

    /*
    |--------------------------------------------------------------------------
    | NOM DU FICHIER
    |--------------------------------------------------------------------------
    */

    filename(
      req,
      file,
      callback,
    ) {
      const extension =
        path
          .extname(
            file.originalname,
          )
          .toLowerCase();

      const userId =
        String(
          req.user?.id ||
          'user',
        )
          .replace(
            /[^a-zA-Z0-9-]/g,
            '',
          );

      const fileName =
        [
          'avatar',
          userId,
          Date.now(),
        ].join('_') +
        extension;

      callback(
        null,
        fileName,
      );
    },
  });

/*
|--------------------------------------------------------------------------
| TYPES D'IMAGES AUTORISÉS
|--------------------------------------------------------------------------
*/

const allowedMimeTypes =
  new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);

/*
|--------------------------------------------------------------------------
| FILTRE
|--------------------------------------------------------------------------
*/

function fileFilter(
  req,
  file,
  callback,
) {
  if (
    !allowedMimeTypes.has(
      file.mimetype,
    )
  ) {
    return callback(
      new Error(
        'Format non autorisé. Utilisez JPG, JPEG, PNG ou WEBP.',
      ),
      false,
    );
  }

  return callback(
    null,
    true,
  );
}

/*
|--------------------------------------------------------------------------
| MULTER
|--------------------------------------------------------------------------
|
| Taille maximum :
| 5 MB
|
|--------------------------------------------------------------------------
*/

const uploadProfileAvatar =
  multer({
    storage,

    fileFilter,

    limits: {
      fileSize:
        5 * 1024 * 1024,
    },
  });

/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports = {
  uploadProfileAvatar,
};