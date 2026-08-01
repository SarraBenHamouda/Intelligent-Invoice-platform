import {
  useTranslation,
} from 'react-i18next';

function LanguageSwitcher() {
  const {
    i18n,
  } = useTranslation();

  const currentLanguage =
    i18n.resolvedLanguage ||
    i18n.language ||
    'fr';

  const isEnglish =
    currentLanguage.startsWith('en');

  function switchLanguage() {
    const nextLanguage =
      isEnglish
        ? 'fr'
        : 'en';

    i18n.changeLanguage(
      nextLanguage
    );
  }

  return (
    <button
      type="button"
      className="language-switcher"
      onClick={switchLanguage}
      aria-label={
        isEnglish
          ? 'Passer en français'
          : 'Switch to English'
      }
      title={
        isEnglish
          ? 'Français'
          : 'English'
      }
    >
      <span
        className="language-switcher-code"
      >
        {isEnglish
          ? 'FR'
          : 'EN'}
      </span>
    </button>
  );
}

export default LanguageSwitcher;