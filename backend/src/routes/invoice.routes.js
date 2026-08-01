const express = require('express');

const authenticate =
  require('../middleware/authenticate');

const router = express.Router();

router.get(
  '/test',
  authenticate,
  (req, res) => {
    return res.status(200).json({
      success: true,
      message:
        'Invoice routes working',
      connectedUser: req.user,
    });
  }
);

module.exports = router;