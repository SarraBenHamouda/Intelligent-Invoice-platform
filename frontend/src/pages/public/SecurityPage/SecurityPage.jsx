import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import "./SecurityPage.css";

/*
|--------------------------------------------------------------------------
| SECURITY BENEFITS
|--------------------------------------------------------------------------
*/

const SECURITY_ITEMS = [
  {
    id: "account",
    icon: "🔐",
    title: "Connexion sécurisée",
    description:
      "Votre espace reste accessible uniquement aux utilisateurs autorisés.",
  },
  {
    id: "password",
    icon: "🛡️",
    title: "Mot de passe protégé",
    description:
      "Vos informations de connexion restent privées et sécurisées.",
  },
  {
    id: "invoice",
    icon: "✓",
    title: "Factures protégées",
    description:
      "Vos documents sont vérifiés avant leur envoi.",
  },
  {
    id: "access",
    icon: "👤",
    title: "Accès personnel",
    description:
      "Chaque utilisateur dispose uniquement des accès qui le concernent.",
  },
];

/*
|--------------------------------------------------------------------------
| SECURITY STEPS
|--------------------------------------------------------------------------
*/

const SECURITY_CHECKS = [
  {
    label: "Compte vérifié",
    detail: "Accès autorisé",
  },
  {
    label: "Facture contrôlée",
    detail: "Informations vérifiées",
  },
  {
    label: "Document protégé",
    detail: "Facture sécurisée",
  },
  {
    label: "Envoi sécurisé",
    detail: "Transmission suivie",
  },
];

/*
|--------------------------------------------------------------------------
| REDUCED MOTION
|--------------------------------------------------------------------------
*/

function useReducedMotion() {
  const [
    reducedMotion,
    setReducedMotion,
  ] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined"
    ) {
      return undefined;
    }

    const mediaQuery =
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      );

    function updatePreference() {
      setReducedMotion(
        mediaQuery.matches,
      );
    }

    updatePreference();

    mediaQuery.addEventListener?.(
      "change",
      updatePreference,
    );

    return () => {
      mediaQuery.removeEventListener?.(
        "change",
        updatePreference,
      );
    };
  }, []);

  return reducedMotion;
}

/*
|--------------------------------------------------------------------------
| SECURITY VISUAL
|--------------------------------------------------------------------------
*/

function SecurityVisual() {
  const [
    activeStep,
    setActiveStep,
  ] = useState(0);

  const reducedMotion =
    useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      setActiveStep(
        SECURITY_CHECKS.length - 1,
      );

      return undefined;
    }

    const interval =
      window.setInterval(
        () => {
          setActiveStep(
            (current) =>
              (current + 1) %
              SECURITY_CHECKS.length,
          );
        },
        1700,
      );

    return () => {
      window.clearInterval(
        interval,
      );
    };
  }, [
    reducedMotion,
  ]);

  return (
    <div className="security-page-visual">
      <div
        className="security-page-visual-glow"
        aria-hidden="true"
      />

      <div className="security-page-visual-header">
        <div>
          <span className="security-page-live-dot" />

          <strong>
            Protection de votre espace
          </strong>
        </div>

        <span className="security-page-live-label">
          Protection active
        </span>
      </div>

      <div className="security-page-visual-content">
        <div
          className="security-page-shield-area"
          aria-hidden="true"
        >
          <div className="security-page-shield-glow" />

          <div className="security-page-shield">
            <span>
              🔒
            </span>
          </div>
        </div>

        <div className="security-page-check-list">
          {SECURITY_CHECKS.map(
            (
              check,
              index,
            ) => {
              const isCompleted =
                index <
                activeStep;

              const isActive =
                index ===
                activeStep;

              return (
                <div
                  key={
                    check.label
                  }
                  className={[
                    "security-page-check",
                    isCompleted
                      ? "is-completed"
                      : "",
                    isActive
                      ? "is-active"
                      : "",
                  ]
                    .filter(
                      Boolean,
                    )
                    .join(" ")}
                >
                  <span className="security-page-check-icon">
                    {isCompleted
                      ? "✓"
                      : index + 1}
                  </span>

                  <div>
                    <strong>
                      {
                        check.label
                      }
                    </strong>

                    <small>
                      {
                        check.detail
                      }
                    </small>
                  </div>

                  {isActive && (
                    <span className="security-page-spinner" />
                  )}
                </div>
              );
            },
          )}
        </div>
      </div>

      <div className="security-page-visual-footer">
        <span>
          ✓
        </span>

        <strong>
          Votre espace est protégé
        </strong>
      </div>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| PAGE
|--------------------------------------------------------------------------
*/

function SecurityPage() {
  const navigate =
    useNavigate();

  const contentRef =
    useRef(null);

  const [
    visible,
    setVisible,
  ] = useState(false);

  const reducedMotion =
    useReducedMotion();

  useEffect(() => {
    const node =
      contentRef.current;

    if (
      !node ||
      reducedMotion
    ) {
      setVisible(true);
      return undefined;
    }

    if (
      typeof IntersectionObserver ===
      "undefined"
    ) {
      setVisible(true);
      return undefined;
    }

    const observer =
      new IntersectionObserver(
        ([entry]) => {
          if (
            entry.isIntersecting
          ) {
            setVisible(true);

            observer.disconnect();
          }
        },
        {
          threshold: 0.15,
        },
      );

    observer.observe(
      node,
    );

    return () => {
      observer.disconnect();
    };
  }, [
    reducedMotion,
  ]);

  return (
    <main className="security-page">
      {/*
      |--------------------------------------------------------------------------
      | ANIMATED BACKGROUND
      |--------------------------------------------------------------------------
      */}

      <div
        className="security-page-lights"
        aria-hidden="true"
      >
        <span className="security-page-light security-page-light--one" />

        <span className="security-page-light security-page-light--two" />

        <span className="security-page-light security-page-light--three" />

        <span className="security-page-light-beam" />

        <span className="security-page-dot security-page-dot--one" />

        <span className="security-page-dot security-page-dot--two" />
      </div>

      {/*
      |--------------------------------------------------------------------------
      | HERO
      |--------------------------------------------------------------------------
      */}

      <section className="security-page-hero">
        <div className="security-page-container">
          <div className="security-page-hero-content">
            <h1>
              Vos factures restent
              protégées à chaque étape
            </h1>

            
          </div>
        </div>
      </section>

      {/*
      |--------------------------------------------------------------------------
      | MAIN SECURITY SECTION
      |--------------------------------------------------------------------------
      */}

      <section className="security-page-main">
        <div className="security-page-container">
          <div
            ref={contentRef}
            className={[
              "security-page-main-grid",
              visible
                ? "is-visible"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="security-page-content">
              <h2>
                Votre espace,
                simplement protégé
              </h2>

              <p className="security-page-intro">
                Utilisez votre espace en
                toute confiance.
              </p>

              <div className="security-page-benefits">
                {SECURITY_ITEMS.map(
                  (
                    item,
                  ) => (
                    <article
                      key={
                        item.id
                      }
                      className="security-page-benefit"
                    >
                      <span
                        className="security-page-benefit-icon"
                        aria-hidden="true"
                      >
                        {
                          item.icon
                        }
                      </span>

                      <div>
                        <h3>
                          {
                            item.title
                          }
                        </h3>

                        <p>
                          {
                            item.description
                          }
                        </p>
                      </div>
                    </article>
                  ),
                )}
              </div>
            </div>

            <SecurityVisual />
          </div>
        </div>
      </section>

      {/*
      |--------------------------------------------------------------------------
      | SIMPLE TRUST SECTION
      |--------------------------------------------------------------------------
      */}

      <section className="security-page-trust">
        <div className="security-page-container">
          <div className="security-page-trust-card">
            <div>
              <h2>
                Gardez le contrôle de
                vos factures
              </h2>

              <p>
                Retrouvez vos documents,
                leur état et les principales
                actions réalisées depuis
                votre espace.
              </p>
            </div>

            <div className="security-page-trust-points">
              <div>
                <span>
                  ✓
                </span>

                <strong>
                  Accès sécurisé
                </strong>
              </div>

              <div>
                <span>
                  ✓
                </span>

                <strong>
                  Factures vérifiées
                </strong>
              </div>

              <div>
                <span>
                  ✓
                </span>

                <strong>
                  Suivi des actions
                </strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/*
      |--------------------------------------------------------------------------
      | CTA
      |--------------------------------------------------------------------------
      */}

      <section className="security-page-cta">
        <div className="security-page-container">
          <div className="security-page-cta-card">
            <div>
              <h2>
                Votre espace est prêt
                à vous accueillir
              </h2>

              <p>
                Centralisez et suivez vos
                factures depuis un espace
                protégé.
              </p>
            </div>

            <div className="security-page-cta-actions">
              <button
                type="button"
                className="security-page-primary-button"
                onClick={() =>
                  navigate(
                    "/auth?mode=register",
                  )
                }
              >
                Créer un compte
              </button>

              <button
                type="button"
                className="security-page-secondary-button"
                onClick={() =>
                  navigate(
                    "/auth?mode=login",
                  )
                }
              >
                Se connecter
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default SecurityPage;