const {
  body,
} = require('express-validator');

const registerValidator = [
  body('organizationName')
    .trim()
    .notEmpty()
    .withMessage(
      'Le nom de l’organisation est obligatoire'
    )
    .isLength({
      min: 2,
      max: 150,
    })
    .withMessage(
      'Le nom de l’organisation doit contenir entre 2 et 150 caractères'
    ),

  body('taxIdentifier')
    .optional({
      checkFalsy: true,
    })
    .trim()
    .isLength({
      max: 100,
    })
    .withMessage(
      'L’identifiant fiscal ne peut pas dépasser 100 caractères'
    ),

  body('countryCode')
    .optional()
    .trim()
    .isLength({
      min: 2,
      max: 3,
    })
    .withMessage(
      'Le code du pays doit contenir 2 ou 3 caractères'
    ),

  body('firstName')
    .trim()
    .notEmpty()
    .withMessage(
      'Le prénom est obligatoire'
    )
    .isLength({
      min: 2,
      max: 100,
    })
    .withMessage(
      'Le prénom doit contenir entre 2 et 100 caractères'
    ),

  body('lastName')
    .trim()
    .notEmpty()
    .withMessage(
      'Le nom est obligatoire'
    )
    .isLength({
      min: 2,
      max: 100,
    })
    .withMessage(
      'Le nom doit contenir entre 2 et 100 caractères'
    ),

  body('email')
    .trim()
    .notEmpty()
    .withMessage(
      'L’adresse e-mail est obligatoire'
    )
    .isEmail()
    .withMessage(
      'L’adresse e-mail est invalide'
    )
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage(
      'Le mot de passe est obligatoire'
    )
    .isLength({
      min: 8,
      max: 128,
    })
    .withMessage(
      'Le mot de passe doit contenir entre 8 et 128 caractères'
    )
    .matches(/[a-z]/)
    .withMessage(
      'Le mot de passe doit contenir une lettre minuscule'
    )
    .matches(/[A-Z]/)
    .withMessage(
      'Le mot de passe doit contenir une lettre majuscule'
    )
    .matches(/[0-9]/)
    .withMessage(
      'Le mot de passe doit contenir un chiffre'
    ),
];

const loginValidator = [
  body('email')
    .trim()
    .notEmpty()
    .withMessage(
      'L’adresse e-mail est obligatoire'
    )
    .isEmail()
    .withMessage(
      'L’adresse e-mail est invalide'
    )
    .normalizeEmail(),

  body('password')
    .notEmpty()
    .withMessage(
      'Le mot de passe est obligatoire'
    ),
];

module.exports = {
  registerValidator,
  loginValidator,
};