const express =
  require("express");

const authenticate =
  require(
    "../middleware/authenticate",
  );

const {
  askAssistant,
  assistantHealth,
} =
  require(
    "../controllers/assistant.controller",
  );

const router =
  express.Router();

/*
|--------------------------------------------------------------------------
| POST /api/assistant/ask
|--------------------------------------------------------------------------
*/

router.post(
  "/ask",
  authenticate,
  askAssistant,
);

/*
|--------------------------------------------------------------------------
| GET /api/assistant/health
|--------------------------------------------------------------------------
*/

router.get(
  "/health",
  authenticate,
  assistantHealth,
);

module.exports =
  router;