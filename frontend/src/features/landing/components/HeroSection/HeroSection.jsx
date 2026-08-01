import {
  useEffect,
  useState,
} from 'react';

import {
  useNavigate,
} from 'react-router-dom';

import {
  useTranslation,
} from 'react-i18next';

const HERO_WORDS = [
  {
    key: 'automated',
    defaultValue: 'automatisées',
    className: 'green',
  },
  {
    key: 'extracted',
    defaultValue: 'extraites',
    className: 'blue',
  },
  {
    key: 'validated',
    defaultValue: 'validées',
    className: 'yellow',
  },
  {
    key: 'signed',
    defaultValue: 'signées',
    className: 'purple',
  },
  {
    key: 'transmitted',
    defaultValue: 'transmises',
    className: 'pink',
  },
];

function HeroSection() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [
    activeWordIndex,
    setActiveWordIndex,
  ] = useState(0);

  useEffect(() => {
    const intervalId =
      window.setInterval(() => {
        setActiveWordIndex(
          (currentIndex) =>
            (currentIndex + 1) %
            HERO_WORDS.length
        );
      }, 2500);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  const activeWord =
    HERO_WORDS[activeWordIndex];

  function openRegistration() {
    navigate('/auth?mode=register');
  }

  function scrollToDemo() {
    const demonstration =
      document.getElementById(
        'promotional-demo'
      );

    if (demonstration) {
      demonstration.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });

      return;
    }

    navigate('/how-it-works');
  }

  return (
    <section className="stripe-notion-hero">
      <div
        className="stripe-hero-background"
        aria-hidden="true"
      >
        <div className="stripe-gradient-mesh" />

        <div className="stripe-orb stripe-orb-one" />
        <div className="stripe-orb stripe-orb-two" />
        <div className="stripe-orb stripe-orb-three" />

        <div className="stripe-light-beam" />

        <div className="stripe-grid-pattern" />
      </div>

      <div className="notion-shell stripe-hero-content">
        <div className="stripe-hero-badge">
          <span className="stripe-badge-dot" />

          {t(
            'hero.eyebrow',
            {
              defaultValue:
                'Plateforme intelligente de facturation électronique',
            }
          )}
        </div>

        <h1 className="stripe-hero-title">
          <span className="stripe-title-line">
            {t(
              'hero.centeredTitleLine1',
              {
                defaultValue:
                  'Vos factures électroniques',
              }
            )}
          </span>

          <span className="stripe-title-line stripe-title-middle">
            <span>
              {t(
                'hero.centeredTitleLine2Start',
                {
                  defaultValue:
                    'sont',
                }
              )}
            </span>

            <span
              key={activeWord.key}
              className={`stripe-changing-word stripe-changing-word-${activeWord.className}`}
            >
              <span className="stripe-changing-dot" />

              <span>
                {t(
                  `hero.rotatingWords.${activeWord.key}`,
                  {
                    defaultValue:
                      activeWord.defaultValue,
                  }
                )}
              </span>
            </span>
          </span>

          <span className="stripe-title-line">
            {t(
              'hero.centeredTitleLine3',
              {
                defaultValue:
                  'de bout en bout.',
              }
            )}
          </span>
        </h1>

        <p className="stripe-hero-description">
          {t(
            'hero.centeredDescription',
            {
              defaultValue:
                'Importez vos factures PDF, scannées ou issues de votre ERP. Tenor Afrique extrait les données, contrôle leur cohérence, génère le format TEIF, applique la signature électronique XAdES et suit leur transmission vers la TTN.',
            }
          )}
        </p>

        <div className="stripe-hero-actions">
          <button
            type="button"
            className="stripe-primary-button"
            onClick={openRegistration}
          >
            <span>
              {t(
                'common.createSpace',
                {
                  defaultValue:
                    'Créer mon espace',
                }
              )}
            </span>

            <span
              className="stripe-button-arrow"
              aria-hidden="true"
            >
              →
            </span>
          </button>

          <button
            type="button"
            className="stripe-secondary-button"
            onClick={scrollToDemo}
          >
            <span
              className="stripe-play-button"
              aria-hidden="true"
            >
              ▶
            </span>

            {t(
              'hero.viewDemo',
              {
                defaultValue:
                  'Voir la démonstration',
              }
            )}
          </button>
        </div>

        <div className="stripe-hero-proof">
          <span>PDF, OCR et ERP</span>
          <i />
          <span>Génération TEIF</span>
          <i />
          <span>Signature XAdES</span>
          <i />
          <span>Suivi TTN</span>
        </div>

        <div
          className="stripe-floating-card stripe-floating-card-left"
          aria-hidden="true"
        >
          <span className="stripe-floating-card-label">
            Facture analysée
          </span>

          <strong>FA260002</strong>

          <span className="stripe-floating-status">
            Validée
          </span>
        </div>

        <div
          className="stripe-floating-card stripe-floating-card-right"
          aria-hidden="true"
        >
          <span className="stripe-floating-card-label">
            Transmission TTN
          </span>

          <strong>Terminée</strong>

          <span className="stripe-floating-success">
            ✓ Acceptée
          </span>
        </div>
      </div>
    </section>
  );
}

export default HeroSection;