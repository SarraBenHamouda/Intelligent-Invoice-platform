function errorHandler(
  error,
  req,
  res,
  next
) {
  console.error('API ERROR:', {
    method: req.method,
    path: req.originalUrl,
    message: error.message,
    stack:
      process.env.NODE_ENV === 'development'
        ? error.stack
        : undefined,
  });

  if (
    error.number === 2627 ||
    error.number === 2601
  ) {
    return res.status(409).json({
      success: false,
      errorCode: 'DUPLICATE_DATA',
      message:
        'Cette donnée existe déjà.',
    });
  }

  return res
    .status(error.statusCode || 500)
    .json({
      success: false,
      errorCode:
        error.errorCode ||
        'INTERNAL_SERVER_ERROR',
      message:
        error.message ||
        'Une erreur interne est survenue.',
    });
}

module.exports = errorHandler;