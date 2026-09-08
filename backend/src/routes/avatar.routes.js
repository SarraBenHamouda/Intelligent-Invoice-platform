/*
|--------------------------------------------------------------------------
| AVATAR ROUTES
|--------------------------------------------------------------------------
*/

const express =
  require(
    "express",
  );

const authenticate =
  require(
    "../middleware/authenticate",
  );

const {
  generateAiAvatar,
} =
  require(
    "../controllers/avatar.controller",
  );

const router =
  express.Router();

/*
|--------------------------------------------------------------------------
| POST /api/avatar/generate-ai
|--------------------------------------------------------------------------
|
| Génère un avatar avec l'IA à partir du prompt
| construit par le frontend.
|
| Route protégée :
| l'utilisateur doit être connecté.
|
|--------------------------------------------------------------------------
*/

router.post(
  "/generate-ai",
  authenticate,
  generateAiAvatar,
);

/*
|--------------------------------------------------------------------------
| EXPORT
|--------------------------------------------------------------------------
*/

module.exports =
  router;