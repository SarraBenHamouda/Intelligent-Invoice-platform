import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import "./FeaturesSection.css";

/*
|--------------------------------------------------------------------------
| FEATURE CATEGORIES
|--------------------------------------------------------------------------
*/

const FEATURE_CATEGORIES = [
  {
    id: "all",
    label: "Toutes",
  },
  {
    id: "automation",
    label: "Automatisation",
  },
  {
    id: "compliance",
    label: "Conformité",
  },
  {
    id: "tracking",
    label: "Pilotage",
  },
];

/*
|--------------------------------------------------------------------------
| FEATURES
|--------------------------------------------------------------------------
*/

const FEATURES = [
  {
    id: "invoice-import",
    category: "automation",
    icon: "⇩",
    title: "Import multicanal",
    description:
      "Importez une facture PDF native, une image scannée ou récupérez-la directement depuis votre ERP, sans changer d'outil.",
    benefit:
      "Une seule entrée pour toutes vos factures",
    metric:
      "PDF · OCR · ERP",
    accent:
      "blue",
  },

  {
    id: "intelligent-extraction",
    category: "automation",
    icon: "⌕",
    title: "Extraction intelligente",
    description:
      "La plateforme détecte automatiquement le fournisseur, le client, les dates, les lignes, les taxes et les montants de la facture.",
    benefit:
      "Moins de saisie et moins d'erreurs humaines",
    metric:
      "Données structurées",
    accent:
      "cyan",
  },

  {
    id: "automatic-validation",
    category: "compliance",
    icon: "✓",
    title: "Contrôle et validation",
    description:
      "Les champs manquants, les montants incohérents, les erreurs de TVA et les écarts entre les lignes et les totaux sont détectés avant signature.",
    benefit:
      "Les anomalies sont corrigées avant l'envoi",
    metric:
      "Contrôles métier",
    accent:
      "green",
  },

  {
    id: "teif-generation",
    category: "compliance",
    icon: "</>",
    title: "Génération TEIF",
    description:
      "Les données validées sont automatiquement transformées en XML TEIF conforme au format attendu par les services de facturation électronique.",
    benefit:
      "Aucune construction XML manuelle",
    metric:
      "TEIF XML",
    accent:
      "yellow",
  },

  {
    id: "electronic-signature",
    category: "compliance",
    icon: "✎",
    title: "Signature électronique",
    description:
      "Le document TEIF est signé en XAdES-EPES avec le certificat électronique de l'entreprise et son token sécurisé.",
    benefit:
      "Authenticité, intégrité et traçabilité",
    metric:
      "XAdES-EPES",
    accent:
      "purple",
  },

  {
    id: "ttn-transmission",
    category: "tracking",
    icon: "↗",
    title: "Transmission TTN",
    description:
      "La facture signée est envoyée automatiquement à TTN. Les indisponibilités temporaires déclenchent une nouvelle tentative contrôlée.",
    benefit:
      "Aucun suivi manuel des transmissions",
    metric:
      "Envoi automatisé",
    accent:
      "pink",
  },

  {
    id: "status-tracking",
    category: "tracking",
    icon: "◉",
    title: "Suivi des statuts",
    description:
      "Chaque facture possède un état clair et actualisé : acceptée, en attente, rejetée ou en erreur, avec le motif retourné par TTN.",
    benefit:
      "Une visibilité immédiate sur chaque facture",
    metric:
      "Temps réel",
    accent:
      "orange",
    hasStatusDemo:
      true,
  },

  {
    id: "duplicate-protection",
    category: "tracking",
    icon: "⧉",
    title: "Protection contre les doublons",
    description:
      "Une facture déjà acceptée ne peut pas être retraitée ou signée une deuxième fois. La plateforme reconnaît automatiquement les doublons.",
    benefit:
      "Aucune double transmission accidentelle",
    metric:
      "Contrôle d'unicité",
    accent:
      "indigo",
  },

  {
    id: "error-management",
    category: "tracking",
    icon: "!",
    title: "Gestion intelligente des erreurs",
    description:
      "Les erreurs sont classées selon leur origine : extraction, validation, signature, réseau ou TTN, avec une action adaptée à chaque situation.",
    benefit:
      "Comprendre et corriger rapidement le problème",
    metric:
      "Diagnostic précis",
    accent:
      "red",
  },
];

/*
|--------------------------------------------------------------------------
| STATUS CYCLE
|--------------------------------------------------------------------------
*/

const STATUS_CYCLE = [
  {
    label:
      "Acceptée",
    detail:
      "QR Code généré",
    tone:
      "accepted",
    icon:
      "✓",
  },

  {
    label:
      "En attente",
    detail:
      "Nouvelle tentative planifiée",
    tone:
      "pending",
    icon:
      "…",
  },

  {
    label:
      "Rejetée",
    detail:
      "Motif TTN disponible",
    tone:
      "rejected",
    icon:
      "×",
  },

  {
    label:
      "Erreur",
    detail:
      "Action corrective requise",
    tone:
      "error",
    icon:
      "!",
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
  ] =
    useState(false);

  useEffect(() => {
    if (
      typeof window ===
      "undefined"
    ) {
      return undefined;
    }

    const mediaQuery =
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      );

    const updatePreference =
      () => {
        setReducedMotion(
          mediaQuery.matches,
        );
      };

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
| STATUS BADGE
|--------------------------------------------------------------------------
*/

function StatusBadge() {
  const [
    index,
    setIndex,
  ] =
    useState(0);

  const reducedMotion =
    useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      return undefined;
    }

    const intervalId =
      window.setInterval(
        () => {
          setIndex(
            (
              currentIndex,
            ) =>
              (
                currentIndex +
                1
              ) %
              STATUS_CYCLE.length,
          );
        },
        2200,
      );

    return () => {
      window.clearInterval(
        intervalId,
      );
    };
  }, [
    reducedMotion,
  ]);

  const currentStatus =
    STATUS_CYCLE[
      index
    ];

  return (
    <div
      className={`notion-live-status notion-live-status--${currentStatus.tone}`}
      aria-live="polite"
    >
      <span
        className="notion-live-status-icon"
        aria-hidden="true"
      >
        {
          currentStatus.icon
        }
      </span>

      <span className="notion-live-status-content">
        <strong>
          {
            currentStatus.label
          }
        </strong>

        <small>
          {
            currentStatus.detail
          }
        </small>
      </span>
    </div>
  );
}

/*
|--------------------------------------------------------------------------
| FEATURE CARD
|--------------------------------------------------------------------------
*/

function FeatureCard({
  feature,
  index,
}) {
  const cardRef =
    useRef(null);

  const [
    visible,
    setVisible,
  ] =
    useState(false);

  const reducedMotion =
    useReducedMotion();

  useEffect(() => {
    const node =
      cardRef.current;

    if (!node) {
      return undefined;
    }

    if (
      reducedMotion ||
      typeof IntersectionObserver ===
        "undefined"
    ) {
      setVisible(true);

      return undefined;
    }

    const observer =
      new IntersectionObserver(
        (
          [
            entry,
          ],
        ) => {
          if (
            entry.isIntersecting
          ) {
            setVisible(
              true,
            );

            observer.disconnect();
          }
        },
        {
          threshold:
            0.15,

          rootMargin:
            "0px 0px -40px 0px",
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

  const handlePointerMove =
    useCallback(
      (
        event,
      ) => {
        const node =
          cardRef.current;

        if (
          !node ||
          reducedMotion
        ) {
          return;
        }

        const rect =
          node.getBoundingClientRect();

        node.style.setProperty(
          "--spot-x",
          `${event.clientX - rect.left}px`,
        );

        node.style.setProperty(
          "--spot-y",
          `${event.clientY - rect.top}px`,
        );
      },
      [
        reducedMotion,
      ],
    );

  return (
    <article
      ref={
        cardRef
      }
      className={[
        "notion-feature-card",
        `notion-feature-card--${feature.accent}`,
        visible
          ? "is-visible"
          : "",
      ]
        .filter(
          Boolean,
        )
        .join(" ")}
      style={{
        transitionDelay:
          reducedMotion
            ? "0ms"
            : `${index * 65}ms`,
      }}
      onPointerMove={
        handlePointerMove
      }
    >
      <div className="notion-feature-card-top">
        <span
          className="notion-feature-step"
          aria-hidden="true"
        >
          {String(
            index +
              1,
          ).padStart(
            2,
            "0",
          )}
        </span>

        <span className="notion-feature-metric">
          {
            feature.metric
          }
        </span>
      </div>

      <span
        className="notion-feature-icon-ring"
        aria-hidden="true"
      >
        <span className="notion-feature-icon">
          {
            feature.icon
          }
        </span>
      </span>

      <h3>
        {
          feature.title
        }
      </h3>

      <p>
        {
          feature.description
        }
      </p>

      <div className="notion-feature-benefit">
        <span
          aria-hidden="true"
        >
          ✓
        </span>

        <strong>
          {
            feature.benefit
          }
        </strong>
      </div>

      {feature.hasStatusDemo && (
        <StatusBadge />
      )}

      <span
        className="notion-feature-card-glow"
        aria-hidden="true"
      />
    </article>
  );
}

/*
|--------------------------------------------------------------------------
| FEATURES SECTION
|--------------------------------------------------------------------------
*/

function FeaturesSection() {
  const navigate =
    useNavigate();

  const [
    activeCategory,
    setActiveCategory,
  ] =
    useState(
      "all",
    );

  const displayedFeatures =
    useMemo(
      () => {
        if (
          activeCategory ===
          "all"
        ) {
          return FEATURES;
        }

        return FEATURES.filter(
          (
            feature,
          ) =>
            feature.category ===
            activeCategory,
        );
      },
      [
        activeCategory,
      ],
    );

  function openDemonstration() {
    navigate(
      "/demonstration",
    );
  }

  function openRegistration() {
    navigate(
      "/auth?mode=register",
    );
  }

  return (
    <section className="notion-features-section">
      <div className="notion-shell">

        {/*
        |--------------------------------------------------------------------------
        | FILTERS
        |--------------------------------------------------------------------------
        */}

        <div
          className="notion-features-filters"
          role="tablist"
          aria-label="Catégories de fonctionnalités"
        >
          {FEATURE_CATEGORIES.map(
            (
              category,
            ) => {
              const isActive =
                activeCategory ===
                category.id;

              return (
                <button
                  key={
                    category.id
                  }
                  type="button"
                  role="tab"
                  aria-selected={
                    isActive
                  }
                  className={[
                    "notion-features-filter",
                    isActive
                      ? "is-active"
                      : "",
                  ]
                    .filter(
                      Boolean,
                    )
                    .join(
                      " ",
                    )}
                  onClick={() => {
                    setActiveCategory(
                      category.id,
                    );
                  }}
                >
                  {
                    category.label
                  }
                </button>
              );
            },
          )}
        </div>

        {/*
        |--------------------------------------------------------------------------
        | FEATURES GRID
        |--------------------------------------------------------------------------
        */}

        <div className="notion-features-grid">
          <div
            className="notion-features-thread"
            aria-hidden="true"
          />

          {displayedFeatures.map(
            (
              feature,
              index,
            ) => (
              <FeatureCard
                key={
                  feature.id
                }
                feature={
                  feature
                }
                index={
                  index
                }
              />
            ),
          )}
        </div>

        {/*
        |--------------------------------------------------------------------------
        | SUMMARY
        |--------------------------------------------------------------------------
        */}
          </div>
     
    </section>
  );
}

export default FeaturesSection;