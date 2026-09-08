const express =
  require('express');

const authenticate =
  require(
    '../middleware/authenticate',
  );

const {
  uploadProfileAvatar,
} =
  require(
    '../middleware/profileUpload.middleware',
  );

const {
  getProfile,
  updateProfile,
  uploadAvatar,
  deleteAvatar,
  changePassword,
} =
  require(
    '../controllers/profile.controller',
  );

const router =
  express.Router();

/*
|--------------------------------------------------------------------------
| AUTHENTIFICATION
|--------------------------------------------------------------------------
|
| Toutes les routes de profil nécessitent un utilisateur connecté.
|
|--------------------------------------------------------------------------
*/

router.use(
  authenticate,
);

/*
|--------------------------------------------------------------------------
| GET /api/profile
|--------------------------------------------------------------------------
|
| Charger le profil de l'utilisateur connecté.
|
|--------------------------------------------------------------------------
*/

router.get(
  '/',
  getProfile,
);

/*
|--------------------------------------------------------------------------
| PUT /api/profile
|--------------------------------------------------------------------------
|
| Modifier :
|
| first_name
| last_name
| phone
| city
| country_code
|
|--------------------------------------------------------------------------
*/

router.put(
  '/',
  updateProfile,
);

/*
|--------------------------------------------------------------------------
| POST /api/profile/avatar
|--------------------------------------------------------------------------
|
| FormData :
|
| avatar = fichier JPG / PNG / WEBP
|
|--------------------------------------------------------------------------
*/

router.post(
  '/avatar',

  uploadProfileAvatar.single(
    'avatar',
  ),

  uploadAvatar,
);

/*
|--------------------------------------------------------------------------
| DELETE /api/profile/avatar
|--------------------------------------------------------------------------
|
| Supprime la photo actuelle.
|
|--------------------------------------------------------------------------
*/

router.delete(
  '/avatar',
  deleteAvatar,
);

/*
|--------------------------------------------------------------------------
| PUT /api/profile/password
|--------------------------------------------------------------------------
|
| Body JSON :
|
| {
|   "current_password": "...",
|   "new_password": "...",
|   "confirm_password": "..."
| }
|
|--------------------------------------------------------------------------
*/

router.put(
  '/password',
  changePassword,
);

/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports =
  router;