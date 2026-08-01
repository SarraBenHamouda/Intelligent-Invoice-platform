import i18n from 'i18next';

import {
  initReactI18next,
} from 'react-i18next';

import LanguageDetector from
  'i18next-browser-languagedetector';

import frenchTranslations from
  './locales/fr/translation.json';

import englishTranslations from
  './locales/en/translation.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: {
        translation:
          frenchTranslations,
      },

      en: {
        translation:
          englishTranslations,
      },
    },

    fallbackLng: 'fr',

    supportedLngs: [
      'fr',
      'en',
    ],

    interpolation: {
      escapeValue: false,
    },

    detection: {
      order: [
        'localStorage',
        'navigator',
      ],

      caches: [
        'localStorage',
      ],

      lookupLocalStorage:
        'site-language',
    },
  });

export default i18n;