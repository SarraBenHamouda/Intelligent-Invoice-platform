import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  useNavigate,
} from 'react-router-dom';

import {
  useTranslation,
} from 'react-i18next';

import '../../features/landing/components/SecuritySection/SecuritySection.css';

const SECURITY_CATEGORIES = [
  {
    id: 'all',
    label: 'Toutes',
  },
  {
    id: 'identity',
    label: 'Identité et accès',
  },
  {
    id: 'signature',
    label: 'Signature',
  },
  {
    id: 'data',
    label: 'Données',
  },
  {
    id: 'tracking',
    label: 'Traçabilité',
  },
];

const SECURITY_FEATURES = [
  {
    id: 'secure-authentication',
    category: 'identity',
    icon: '⌁',
    title: 'Authentification sécurisée',
    description:
      'Chaque utilisateur accède à la plateforme avec un compte personnel protégé. Les sessions sont contrôlées et les accès non autorisés sont bloqués.',
    benefit:
      'Protection des comptes et des espaces clients',
    metric: 'Accès contrôlé',
    accent: 'blue',
  },
  {
    id: 'role-management',
    category: 'identity',
    icon: '◎',
    title: 'Gestion des rôles',
    description:
      'Les droits sont séparés entre administrateurs et clients. Chaque utilisateur ne voit que les données et les actions correspondant à son rôle.',
    benefit:
      'Séparation claire des responsabilités',
    metric: 'Admin · Client',
    accent: 'cyan',
  },
  {
    id: 'xades-signature',
    category: 'signature',
    icon: '✎',
    title: 'Signature électronique XAdES',
    description:
      'Les factures TEIF sont signées avec une signature électronique XAdES-EPES garantissant l’authenticité du signataire et l’intégrité du document.',
    benefit:
      'Une facture signée ne peut pas être modifiée discrètement',
    metric: 'XAdES-EPES',
    accent: 'purple',
  },
  {
    id: 'certificate-token',
    category: 'signature',
    icon: '◆',
    title: 'Certificat sur token sécurisé',
    description:
      'La clé privée reste protégée dans le token électronique de l’entreprise. Elle n’est jamais stockée directement dans l’application.',
    benefit:
      'La clé de signature reste sous le contrôle de l’entreprise',
    metric: 'Token ANCE',
    accent: 'indigo',
  },
  {
    id: 'signature-verification',
    category: 'signature',
    icon: '✓',
    title: 'Vérification de la signature',
    description:
      'Après la signature, la plateforme vérifie le condensat du document, les propriétés XAdES et la validité cryptographique de la signature.',
    benefit:
      'Détection immédiate d’une signature invalide',
    metric: 'RSA · SHA-256',
    accent: 'green',
  },
  {
    id: 'data-protection',
    category: 'data',
    icon: '▣',
    title: 'Protection des données',
    description:
      'Les informations des factures sont isolées par utilisateur et transmises uniquement aux services nécessaires au traitement.',
    benefit:
      'Les données de chaque client restent séparées',
    metric: 'Isolation client',
    accent: 'orange',
  },
  {
    id: 'integrity-checks',
    category: 'data',
    icon: '◇',
    title: 'Contrôles d’intégrité',
    description:
      'Les montants, les lignes, les identifiants et les totaux sont contrôlés avant la génération du TEIF et avant l’envoi vers TTN.',
    benefit:
      'Réduction des erreurs et des documents incohérents',
    metric: 'Contrôle métier',
    accent: 'yellow',
  },
  {
    id: 'audit-history',
    category: 'tracking',
    icon: '≡',
    title: 'Historique d’audit',
    description:
      'Les principales étapes sont enregistrées : import, extraction, validation, signature, transmission, rejet et nouvelle tentative.',
    benefit:
      'Chaque action importante peut être retracée',
    metric: 'Journal complet',
    accent: 'pink',
  },
  {
    id: 'duplicate-protection',
    category: 'tracking',
    icon: '⧉',
    title: 'Protection contre les doublons',
    description:
      'Une facture déjà acceptée par TTN ne peut pas être signée et envoyée une nouvelle fois par erreur.',
    benefit:
      'Aucune double transmission involontaire',
    metric: 'Unicité facture',
    accent: 'red',
  },
];

const SECURITY_CHECKS = [
  {
    label: 'Identité utilisateur',
    detail: 'Vérification du compte et du rôle',
  },
  {
    label: 'Intégrité TEIF',
    detail: 'Contrôle du XML avant signature',
  },
  {
    label: 'Signature XAdES',
    detail: 'Vérification cryptographique',
  },
  {
    label: 'Transmission TTN',
    detail: 'Suivi de la réponse distante',
  },
];

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] =
    useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    );

    function updatePreference() {
      setReducedMotion(mediaQuery.matches);
    }

    updatePreference();

    mediaQuery.addEventListener?.(
      'change',
      updatePreference
    );

    return () => {
      mediaQuery.removeEventListener?.(
        'change',
        updatePreference
      );
    };
  }, []);

  return reducedMotion;
}

function SecurityScanPreview() {
  const [activeCheck, setActiveCheck] =
    useState(0);

  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion) {
      setActiveCheck(
        SECURITY_CHECKS.length - 1
      );

      return undefined;
    }

    const intervalId = window.setInterval(
      () => {
        setActiveCheck(
          (currentIndex) =>
            (currentIndex + 1) %
            SECURITY_CHECKS.length
        );
      },
      1600
    );

    return () => {
      window.clearInterval(intervalId);
    };
  }, [reducedMotion]);

  return (
    <div className="security-scan-preview">
      <div className="security-scan-header">
        <div>
          <span className="security-scan-dot" />

          <strong>
            Contrôle de sécurité
          </strong>
        </div>

        <span className="security-scan-live">
          Analyse active
        </span>
      </div>

      <div className="security-scan-body">
        <div
          className="security-shield-visual"
          aria-hidden="true"
        >
          <span className="security-shield-glow" />
          <span className="security-shield-icon">
            ✓
          </span>
        </div>

        <div className="security-check-list">
          {SECURITY_CHECKS.map(
            (check, index) => {
              const isCompleted =
                index < activeCheck;

              const isActive =
                index === activeCheck;

              return (
                <div
                  key={check.label}
                  className={[
                    'security-check-item',
                    isCompleted
                      ? 'is-completed'
                      : '',
                    isActive
                      ? 'is-active'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="security-check-icon">
                    {isCompleted
                      ? '✓'
                      : index + 1}
                  </span>

                  <div>
                    <strong>
                      {check.label}
                    </strong>

                    <small>
                      {check.detail}
                    </small>
                  </div>

                  {isActive && (
                    <span className="security-check-spinner" />
                  )}
                </div>
              );
            }
          )}
        </div>
      </div>

      <div className="security-scan-footer">
        <span>
          Algorithme
        </span>

        <strong>
          RSA-SHA256
        </strong>

        <span>
          Statut
        </span>

        <strong className="security-valid-text">
          Conforme
        </strong>
      </div>
    </div>
  );
}

function SecurityCard({
  feature,
  index,
}) {
  const cardRef = useRef(null);

  const [visible, setVisible] =
    useState(false);

  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const node = cardRef.current;

    if (!node) {
      return undefined;
    }

    if (
      reducedMotion ||
      typeof IntersectionObserver ===
        'undefined'
    ) {
      setVisible(true);

      return undefined;
    }

    const observer =
      new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        },
        {
          threshold: 0.15,
          rootMargin:
            '0px 0px -40px 0px',
        }
      );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [reducedMotion]);

  const handlePointerMove = useCallback(
    (event) => {
      const node = cardRef.current;

      if (!node || reducedMotion) {
        return;
      }

      const rectangle =
        node.getBoundingClientRect();

      node.style.setProperty(
        '--security-spot-x',
        `${
          event.clientX -
          rectangle.left
        }px`
      );

      node.style.setProperty(
        '--security-spot-y',
        `${
          event.clientY -
          rectangle.top
        }px`
      );
    },
    [reducedMotion]
  );

  return (
    <article
      ref={cardRef}
      className={[
        'security-feature-card',
        `security-feature-card--${feature.accent}`,
        visible ? 'is-visible' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        transitionDelay:
          reducedMotion
            ? '0ms'
            : `${index * 65}ms`,
      }}
      onPointerMove={handlePointerMove}
    >
      <div className="security-feature-top">
        <span className="security-feature-number">
          {String(index + 1).padStart(
            2,
            '0'
          )}
        </span>

        <span className="security-feature-metric">
          {feature.metric}
        </span>
      </div>

      <span
        className="security-feature-icon"
        aria-hidden="true"
      >
        {feature.icon}
      </span>

      <h3>{feature.title}</h3>

      <p>{feature.description}</p>

      <div className="security-feature-benefit">
        <span aria-hidden="true">
          ✓
        </span>

        <strong>
          {feature.benefit}
        </strong>
      </div>

      <span
        className="security-feature-glow"
        aria-hidden="true"
      />
    </article>
  );
}

function SecuritySection() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const headingRef = useRef(null);

  const [
    activeCategory,
    setActiveCategory,
  ] = useState('all');

  const [
    headingVisible,
    setHeadingVisible,
  ] = useState(false);

  const reducedMotion = useReducedMotion();

  const displayedFeatures = useMemo(
    () => {
      if (activeCategory === 'all') {
        return SECURITY_FEATURES;
      }

      return SECURITY_FEATURES.filter(
        (feature) =>
          feature.category ===
          activeCategory
      );
    },
    [activeCategory]
  );

  useEffect(() => {
    const node = headingRef.current;

    if (!node) {
      return undefined;
    }

    if (
      reducedMotion ||
      typeof IntersectionObserver ===
        'undefined'
    ) {
      setHeadingVisible(true);

      return undefined;
    }

    const observer =
      new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setHeadingVisible(true);
            observer.disconnect();
          }
        },
        {
          threshold: 0.3,
        }
      );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [reducedMotion]);

  function openRegistration() {
    navigate('/auth?mode=register');
  }

  function openContact() {
    navigate('/contact');
  }

  return (
    <section className="security-section">
      <div className="security-shell">
        <div
          ref={headingRef}
          className={[
            'security-heading',
            headingVisible
              ? 'is-visible'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <span className="security-label">
            {t('security.label', {
              defaultValue:
                'Sécurité et conformité',
            })}
          </span>

          <h2>
            {t('security.title', {
              defaultValue:
                'Vos factures et vos signatures restent protégées à chaque étape',
            })}
          </h2>

          <p>
            {t('security.description', {
              defaultValue:
                'De la connexion utilisateur jusqu’à la transmission vers TTN, la plateforme applique des contrôles d’accès, d’intégrité et de traçabilité.',
            })}
          </p>
        </div>

        <div className="security-introduction-grid">
          <div className="security-introduction-content">
            <span className="security-label">
              Protection de bout en bout
            </span>

            <h3>
              La sécurité n’est pas ajoutée après le traitement
            </h3>

            <p>
              Elle accompagne chaque facture depuis
              son import jusqu’à son acceptation par
              TTN. Les accès, les données, la
              signature et les événements sont
              contrôlés dans un même processus.
            </p>

            <ul className="security-introduction-list">
              <li>
                <span>✓</span>
                Clés privées conservées sur le token
              </li>

              <li>
                <span>✓</span>
                Signature électronique vérifiable
              </li>

              <li>
                <span>✓</span>
                Historique complet des traitements
              </li>

              <li>
                <span>✓</span>
                Isolation des données clients
              </li>
            </ul>
          </div>

          <SecurityScanPreview />
        </div>

        <div
          className="security-filters"
          role="tablist"
          aria-label="Catégories de sécurité"
        >
          {SECURITY_CATEGORIES.map(
            (category) => {
              const isActive =
                activeCategory ===
                category.id;

              return (
                <button
                  key={category.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={[
                    'security-filter',
                    isActive
                      ? 'is-active'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    setActiveCategory(
                      category.id
                    );
                  }}
                >
                  {category.label}
                </button>
              );
            }
          )}
        </div>

        <div className="security-features-grid">
          {displayedFeatures.map(
            (feature, index) => (
              <SecurityCard
                key={feature.id}
                feature={feature}
                index={index}
              />
            )
          )}
        </div>

        <div className="security-summary">
          <div className="security-summary-content">
            <span className="security-label">
              Confiance numérique
            </span>

            <h3>
              Authenticité, intégrité et traçabilité
            </h3>

            <p>
              Chaque facture conserve une preuve de
              son traitement, de sa signature et de
              sa transmission.
            </p>
          </div>

          <div className="security-summary-stats">
            <div>
              <strong>SHA-256</strong>
              <span>
                Empreinte cryptographique
              </span>
            </div>

            <div>
              <strong>XAdES</strong>
              <span>
                Signature électronique
              </span>
            </div>

            <div>
              <strong>100 %</strong>
              <span>
                Étapes traçables
              </span>
            </div>
          </div>

          <div className="security-summary-actions">
            <button
              type="button"
              className="security-primary-button"
              onClick={openRegistration}
            >
              Créer mon espace
              <span aria-hidden="true">
                →
              </span>
            </button>

            <button
              type="button"
              className="security-secondary-button"
              onClick={openContact}
            >
              Nous contacter
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default SecuritySection;