import {
  useNavigate,
} from 'react-router-dom';

import {
  useTranslation,
} from 'react-i18next';

import logoDark from '../../../../assets/logo-dark.png';

import './ProductShowcaseSection.css';

const INVOICE_ROWS = [
  {
    number: 'FA260002',
    customer: 'IT SOFT',
    amount: '2 097,730 TND',
    status: 'Validée',
    className: 'success',
  },
  {
    number: '10001403',
    customer: 'CFAB Somme',
    amount: '108,000 EUR',
    status: 'Signée',
    className: 'signed',
  },
  {
    number: '10001293',
    customer: 'NEBOUT SA',
    amount: '6 460,690 EUR',
    status: 'En attente',
    className: 'pending',
  },
];

const VALIDATION_ROWS = [
  {
    label: 'Numéro de facture',
    value: 'FA260002',
    status: 'valid',
  },
  {
    label: 'Fournisseur',
    value: 'Tenor Afrique',
    status: 'valid',
  },
  {
    label: 'Total HT',
    value: '1 762,800 TND',
    status: 'valid',
  },
  {
    label: 'TVA',
    value: '334,930 TND',
    status: 'valid',
  },
  {
    label: 'Total TTC',
    value: '2 097,730 TND',
    status: 'valid',
  },
];

const TIMELINE_ITEMS = [
  {
    time: '09:12',
    title: 'Facture importée',
    description: 'Document reçu',
    state: 'completed',
  },
  {
    time: '09:12',
    title: 'Informations récupérées',
    description: '5 lignes détectées',
    state: 'completed',
  },
  {
    time: '09:13',
    title: 'Vérification réussie',
    description: 'Aucune erreur bloquante',
    state: 'completed',
  },
  {
    time: '09:14',
    title: 'Facture signée',
    description: 'Signature terminée',
    state: 'completed',
  },
  {
    time: '09:15',
    title: 'Facture envoyée',
    description: 'En cours',
    state: 'active',
  },
];

function ProductShowcaseSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  function openLoginForImport() {
    navigate('/auth?mode=login&redirect=%2Fclient%2Finvoices%2Fupload');
  }

  function openLogin() {
    navigate('/auth?mode=login');
  }

  return (
    <section className="product-showcase-section stripe-animated-background">
      <div className="notion-shell">
        <div className="product-showcase-grid">
          <article className="product-showcase-card product-showcase-card-large">
            <div className="product-showcase-card-heading">
              <div>
                <span className="product-showcase-kicker">
                  {t('productShowcase.import.kicker', {
                    defaultValue: 'Centraliser les sources',
                  })}
                </span>

                <h3>
                  {t('productShowcase.import.title', {
                    defaultValue: 'Importez toutes vos factures au même endroit.',
                  })}
                </h3>
              </div>

              <button
                type="button"
                className="product-showcase-arrow"
                aria-label="Importer une facture"
                onClick={openLoginForImport}
              >
                →
              </button>
            </div>

            <div className="showcase-import-preview">
              <div className="showcase-sidebar">
                <div className="showcase-sidebar-brand">
                  <img
                    src={logoDark}
                    alt="Tenor Afrique"
                  />

                  <span>
                    Espace Client
                  </span>
                </div>

                <nav>
                  <span className="active">
                    Tableau de bord
                  </span>
                  <span>
                    Mes factures
                  </span>
                  <span>
                    Importer
                  </span>
                  <span>
                    Historique
                  </span>
                  <span>
                    Notifications
                  </span>
                </nav>
              </div>

              <div className="showcase-import-content">
                <div className="showcase-preview-toolbar">
                  <div>
                    <span className="showcase-toolbar-label">
                      Factures récentes
                    </span>

                    <h4>
                      Suivez tous vos documents
                    </h4>
                  </div>
                </div>

                <div className="showcase-source-tabs">
                  <span className="active">
                    Toutes
                  </span>
                  <span>
                    PDF
                  </span>
                  <span>
                    Image
                  </span>
                  <span>
                    Autres
                  </span>
                </div>

                <div className="showcase-invoice-table">
                  <div className="showcase-table-header">
                    <span>
                      Facture
                    </span>
                    <span>
                      Client
                    </span>
                    <span>
                      Montant
                    </span>
                    <span>
                      Statut
                    </span>
                  </div>

                  {INVOICE_ROWS.map((invoice) => (
                    <div
                      className="showcase-table-row"
                      key={invoice.number}
                    >
                      <strong>
                        {invoice.number}
                      </strong>

                      <span>
                        {invoice.customer}
                      </span>

                      <span>
                        {invoice.amount}
                      </span>

                      <small
                        className={`showcase-status ${invoice.className}`}
                      >
                        {invoice.status}
                      </small>
                    </div>
                  ))}
                </div>

                <div
                  className="showcase-import-dropzone"
                  role="button"
                  tabIndex={0}
                  onClick={openLoginForImport}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' ||
                      event.key === ' '
                    ) {
                      openLoginForImport();
                    }
                  }}
                >
                  <div className="showcase-dropzone-icon">
                    ↓
                  </div>

                  <div>
                    <strong>
                      Déposez une facture ici
                    </strong>

                    <span>
                      PDF, PNG ou JPG
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openLoginForImport();
                    }}
                  >
                    Parcourir
                  </button>
                </div>
              </div>
            </div>
          </article>

          <article className="product-showcase-card">
            <div className="product-showcase-card-heading">
              <div>
                <span className="product-showcase-kicker">
                  {t('productShowcase.validation.kicker', {
                    defaultValue: 'Contrôle automatique',
                  })}
                </span>

                <h3>
                  {t('productShowcase.validation.title', {
                    defaultValue: 'Détectez les erreurs avant la validation.',
                  })}
                </h3>

                <p>
                  {t('productShowcase.validation.description', {
                    defaultValue:
                      'Les informations importantes sont vérifiées automatiquement avant de poursuivre.',
                  })}
                </p>
              </div>
            </div>

            <div className="showcase-validation-preview">
              <div className="showcase-validation-header">
                <div>
                  <span>
                    Vérification de la facture
                  </span>

                  <strong>
                    FA260002
                  </strong>
                </div>

                <small>
                  100 % conforme
                </small>
              </div>

              <div className="showcase-validation-list">
                {VALIDATION_ROWS.map((row) => (
                  <div
                    className="showcase-validation-row"
                    key={row.label}
                  >
                    <span className="showcase-validation-check">
                      ✓
                    </span>

                    <div>
                      <span>
                        {row.label}
                      </span>

                      <strong>
                        {row.value}
                      </strong>
                    </div>
                  </div>
                ))}
              </div>

              <div className="showcase-validation-result">
                <span>
                  ✓
                </span>

                <div>
                  <strong>
                    Facture prête
                  </strong>

                  <p>
                    Aucun problème détecté.
                  </p>
                </div>
              </div>
            </div>
          </article>

          <article className="product-showcase-card">
            <div className="product-showcase-card-heading">
              <div>
                <span className="product-showcase-kicker">
                  {t('productShowcase.errors.kicker', {
                    defaultValue: 'Comprendre les erreurs',
                  })}
                </span>

                <h3>
                  {t('productShowcase.errors.title', {
                    defaultValue:
                      'Identifiez immédiatement ce qui doit être corrigé.',
                  })}
                </h3>

                <p>
                  {t('productShowcase.errors.description', {
                    defaultValue:
                      'La plateforme indique clairement le problème et ce que vous devez faire.',
                  })}
                </p>
              </div>
            </div>

            <div className="showcase-error-preview">
              <div className="showcase-error-banner">
                <span>
                  !
                </span>

                <div>
                  <strong>
                    Deux corrections requises
                  </strong>

                  <p>
                    La facture doit être corrigée avant de continuer.
                  </p>
                </div>
              </div>

              <div className="showcase-error-item">
                <div className="showcase-error-number">
                  01
                </div>

                <div>
                  <strong>
                    Numéro de facture manquant
                  </strong>

                  <span>
                    Vérifiez le numéro de la facture.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={openLogin}
                >
                  Corriger
                </button>
              </div>

              <div className="showcase-error-item">
                <div className="showcase-error-number">
                  02
                </div>

                <div>
                  <strong>
                    Désignation manquante
                  </strong>

                  <span>
                    Vérifiez la ligne concernée.
                  </span>
                </div>

                <button
                  type="button"
                  onClick={openLogin}
                >
                  Corriger
                </button>
              </div>

              <div className="showcase-error-suggestion">
                <span>
                  ✦
                </span>

                <p>
                  Corrigez les informations signalées puis relancez la vérification.
                </p>
              </div>
            </div>
          </article>

         
          
        </div>
      </div>
    </section>
  );
}

export default ProductShowcaseSection;
