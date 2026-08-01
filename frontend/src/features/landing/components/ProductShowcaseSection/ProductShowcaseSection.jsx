import { useTranslation } from 'react-i18next';

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
    description: 'Source PDF',
    state: 'completed',
  },
  {
    time: '09:12',
    title: 'Extraction terminée',
    description: '5 lignes détectées',
    state: 'completed',
  },
  {
    time: '09:13',
    title: 'Validation réussie',
    description: 'Aucune erreur bloquante',
    state: 'completed',
  },
  {
    time: '09:14',
    title: 'Signature XAdES appliquée',
    description: 'Certificat fournisseur',
    state: 'completed',
  },
  {
    time: '09:15',
    title: 'Transmission TTN',
    description: 'En cours',
    state: 'active',
  },
];

function ProductShowcaseSection() {
  const { t } = useTranslation();

  return (
    <section className="product-showcase-section stripe-animated-background">
      <div className="notion-shell">
        <div className="product-showcase-heading">
          <span className="notion-section-label">
            {t('productShowcase.label', {
              defaultValue:
                'Une plateforme conçue pour vos factures',
            })}
          </span>

          <h2>
            {t('productShowcase.title', {
              defaultValue:
                'Centralisez, contrôlez et transmettez vos factures depuis un seul espace.',
            })}
          </h2>

          <p>
            {t('productShowcase.description', {
              defaultValue:
                'Chaque étape importante est visible, compréhensible et entièrement traçable.',
            })}
          </p>
        </div>

        <div className="product-showcase-grid">
          <article className="product-showcase-card product-showcase-card-large">
            <div className="product-showcase-card-heading">
              <div>
                <span className="product-showcase-kicker">
                  {t('productShowcase.import.kicker', {
                    defaultValue:
                      'Centraliser les sources',
                  })}
                </span>

                <h3>
                  {t('productShowcase.import.title', {
                    defaultValue:
                      'Importez toutes vos factures au même endroit.',
                  })}
                </h3>

                <p>
                  {t('productShowcase.import.description', {
                    defaultValue:
                      'Ajoutez une facture PDF, une image scannée ou récupérez directement les données depuis votre ERP.',
                  })}
                </p>
              </div>

              <button
                type="button"
                className="product-showcase-arrow"
                aria-label="Voir les possibilités d’importation"
              >
                →
              </button>
            </div>

            <div className="showcase-import-preview">
              <div className="showcase-sidebar">
                <strong>Tenor Afrique</strong>

                <nav>
                  <span className="active">
                    Tableau de bord
                  </span>
                  <span>Mes factures</span>
                  <span>Importer</span>
                  <span>Historique</span>
                  <span>Notifications</span>
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

                  <button type="button">
                    + Importer une facture
                  </button>
                </div>

                <div className="showcase-source-tabs">
                  <span className="active">Toutes</span>
                  <span>PDF</span>
                  <span>OCR</span>
                  <span>ERP</span>
                </div>

                <div className="showcase-invoice-table">
                  <div className="showcase-table-header">
                    <span>Facture</span>
                    <span>Client</span>
                    <span>Montant</span>
                    <span>Statut</span>
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

                <div className="showcase-import-dropzone">
                  <div className="showcase-dropzone-icon">
                    ↓
                  </div>

                  <div>
                    <strong>
                      Déposez une facture ici
                    </strong>

                    <span>
                      PDF, PNG, JPG ou source ERP
                    </span>
                  </div>

                  <button type="button">
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
                    defaultValue:
                      'Contrôle automatique',
                  })}
                </span>

                <h3>
                  {t('productShowcase.validation.title', {
                    defaultValue:
                      'Détectez les erreurs avant la signature.',
                  })}
                </h3>

                <p>
                  {t('productShowcase.validation.description', {
                    defaultValue:
                      'Les champs obligatoires, les taxes, les lignes et les montants sont vérifiés automatiquement.',
                  })}
                </p>
              </div>

              <button
                type="button"
                className="product-showcase-arrow"
                aria-label="Voir la validation automatique"
              >
                →
              </button>
            </div>

            <div className="showcase-validation-preview">
              <div className="showcase-validation-header">
                <div>
                  <span>
                    Validation de la facture
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
                      <span>{row.label}</span>
                      <strong>{row.value}</strong>
                    </div>
                  </div>
                ))}
              </div>

              <div className="showcase-validation-result">
                <span>✓</span>

                <div>
                  <strong>
                    Facture prête à être signée
                  </strong>

                  <p>
                    Aucun blocage ni incohérence
                    détecté.
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
                    defaultValue:
                      'Comprendre les rejets',
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
                      'La plateforme indique le champ concerné, la cause du problème et l’action recommandée.',
                  })}
                </p>
              </div>

              <button
                type="button"
                className="product-showcase-arrow"
                aria-label="Voir le détail des erreurs"
              >
                →
              </button>
            </div>

            <div className="showcase-error-preview">
              <div className="showcase-error-banner">
                <span>!</span>

                <div>
                  <strong>
                    Deux corrections requises
                  </strong>

                  <p>
                    La facture ne peut pas encore
                    être transmise.
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
                    Champ : document.numero
                  </span>
                </div>

                <button type="button">
                  Corriger
                </button>
              </div>

              <div className="showcase-error-item">
                <div className="showcase-error-number">
                  02
                </div>

                <div>
                  <strong>
                    Désignation de ligne manquante
                  </strong>

                  <span>
                    Champ : lignes[0].designation
                  </span>
                </div>

                <button type="button">
                  Corriger
                </button>
              </div>

              <div className="showcase-error-suggestion">
                <span>✦</span>

                <p>
                  Vérifiez les données signalées puis
                  relancez automatiquement la validation.
                </p>
              </div>
            </div>
          </article>

          <article className="product-showcase-card">
            <div className="product-showcase-card-heading">
              <div>
                <span className="product-showcase-kicker">
                  {t('productShowcase.signature.kicker', {
                    defaultValue:
                      'Signature sécurisée',
                  })}
                </span>

                <h3>
                  {t('productShowcase.signature.title', {
                    defaultValue:
                      'Signez vos factures au format XAdES.',
                  })}
                </h3>

                <p>
                  {t('productShowcase.signature.description', {
                    defaultValue:
                      'La signature électronique garantit l’intégrité, l’origine et la traçabilité du document.',
                  })}
                </p>
              </div>

              <button
                type="button"
                className="product-showcase-arrow"
                aria-label="Voir la signature électronique"
              >
                →
              </button>
            </div>

            <div className="showcase-signature-preview">
              <div className="showcase-document-card">
                <div className="showcase-document-top">
                  <span>TEIF XML</span>
                  <small>FA260002</small>
                </div>

                <div className="showcase-code-lines">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>

                <div className="showcase-document-signature">
                  <span className="showcase-certificate-icon">
                    ✓
                  </span>

                  <div>
                    <strong>
                      Signature XAdES valide
                    </strong>

                    <small>
                      Certificat fournisseur
                    </small>
                  </div>
                </div>
              </div>

              <div className="showcase-signature-side">
                <div className="showcase-signature-badge">
                  <span>✓</span>

                  <div>
                    <strong>
                      Document signé
                    </strong>

                    <small>
                      Intégrité vérifiée
                    </small>
                  </div>
                </div>

                <div className="showcase-signature-detail">
                  <span>Algorithme</span>
                  <strong>RSA-SHA256</strong>
                </div>

                <div className="showcase-signature-detail">
                  <span>Format</span>
                  <strong>XAdES-EPES</strong>
                </div>

                <div className="showcase-signature-detail">
                  <span>Rôle</span>
                  <strong>Fournisseur</strong>
                </div>
              </div>
            </div>
          </article>

          <article className="product-showcase-card product-showcase-card-wide">
            <div className="product-showcase-card-heading">
              <div>
                <span className="product-showcase-kicker">
                  {t('productShowcase.tracking.kicker', {
                    defaultValue:
                      'Traçabilité complète',
                  })}
                </span>

                <h3>
                  {t('productShowcase.tracking.title', {
                    defaultValue:
                      'Suivez la facture jusqu’à son acceptation par la TTN.',
                  })}
                </h3>

                <p>
                  {t('productShowcase.tracking.description', {
                    defaultValue:
                      'Chaque événement est horodaté afin de comprendre immédiatement où se trouve votre facture.',
                  })}
                </p>
              </div>

              <button
                type="button"
                className="product-showcase-arrow"
                aria-label="Voir la traçabilité"
              >
                →
              </button>
            </div>

            <div className="showcase-timeline-preview">
              <div className="showcase-timeline-summary">
                <div>
                  <span>
                    Facture suivie
                  </span>

                  <strong>
                    FA260002
                  </strong>
                </div>

                <small className="pending">
                  Transmission en cours
                </small>
              </div>

              <div className="showcase-timeline-list">
                {TIMELINE_ITEMS.map((item) => (
                  <div
                    className={`showcase-timeline-item ${item.state}`}
                    key={`${item.time}-${item.title}`}
                  >
                    <time>
                      {item.time}
                    </time>

                    <span className="showcase-timeline-dot">
                      {item.state === 'completed'
                        ? '✓'
                        : ''}
                    </span>

                    <div>
                      <strong>
                        {item.title}
                      </strong>

                      <small>
                        {item.description}
                      </small>
                    </div>
                  </div>
                ))}
              </div>

              <div className="showcase-ttn-result">
                <div className="showcase-ttn-icon">
                  TTN
                </div>

                <div>
                  <span>
                    Dernière mise à jour
                  </span>

                  <strong>
                    En attente de la réponse TTN
                  </strong>
                </div>

                <span className="showcase-live-pulse" />
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

export default ProductShowcaseSection;