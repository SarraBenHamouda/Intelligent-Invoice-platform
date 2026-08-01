const {
  validationResult,
} = require('express-validator');

function validateRequest(req, res, next) {
  const validationErrors = validationResult(req);

  if (!validationErrors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Données invalides',
      errors: validationErrors.array().map(
        (error) => ({
          field: error.path,
          message: error.msg,
          value: error.value,
        })
      ),
    });
  }

  next();
}

module.exports = validateRequest;