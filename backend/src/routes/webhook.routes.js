const express = require('express');

const router = express.Router();

router.post(
  '/n8n/status',
  async (req, res) => {
    console.log(
      'Callback n8n reçu :',
      req.body
    );

    return res.status(200).json({
      success: true,
      message:
        'Callback n8n reçu.',
    });
  }
);

module.exports = router;