import {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import {
  useTranslation,
} from "react-i18next";

const HERO_WORDS = [
  {
    key: "imported",
    defaultValue: "importées",
    className: "blue",
  },
  {
    key: "verified",
    defaultValue: "vérifiées",
    className: "orange",
  },
  {
    key: "validated",
    defaultValue: "validées",
    className: "green",
  },
  {
    key: "signed",
    defaultValue: "signées",
    className: "purple",
  },
  {
    key: "transmitted",
    defaultValue: "transmises",
    className: "teal",
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
    navigate("/auth?mode=register");
  }

  function openDemo() {
    navigate("/demonstration");
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
        <h1 className="stripe-hero-title">
          <span className="stripe-title-line">
            {t(
              "hero.centeredTitleLine1",
              {
                defaultValue:
                  "Vos factures électroniques",
              }
            )}
          </span>

          <span className="stripe-title-line stripe-title-middle">
            <span>
              {t(
                "hero.centeredTitleLine2Start",
                {
                  defaultValue:
                    "sont",
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
              "hero.centeredTitleLine3",
              {
                defaultValue:
                  "de bout en bout.",
              }
            )}
          </span>
        </h1>

        <div className="stripe-hero-actions">
          <button
            type="button"
            className="stripe-primary-button"
            onClick={openRegistration}
          >
            <span>
              {t(
                "common.createSpace",
                {
                  defaultValue:
                    "Créer mon espace",
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
            onClick={openDemo}
          >
            <span
              className="stripe-play-button"
              aria-hidden="true"
            >
              ▶
            </span>

            {t(
              "hero.viewDemo",
              {
                defaultValue:
                  "Voir la démonstration",
              }
            )}
          </button>
        </div>
      </div>
    </section>
  );
}

export default HeroSection;
