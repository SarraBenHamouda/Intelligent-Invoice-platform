import { useTranslation } from 'react-i18next';

function SecuritySection() {
  const { t } = useTranslation();

  const securityItems = [
    t('security.items.authentication', {
      defaultValue: 'Authentification sécurisée',
    }),
    t('security.items.passwords', {
      defaultValue: 'Mots de passe chiffrés',
    }),
    t('security.items.signature', {
      defaultValue: 'Signature électronique XAdES',
    }),
    t('security.items.roles', {
      defaultValue: 'Rôles administrateur et client',
    }),
    t('security.items.jwt', {
      defaultValue: 'Accès protégés par JWT',
    }),
    t('security.items.history', {
      defaultValue: 'Historique des opérations',
    }),
  ];

  return (
    <section id="security" className="security-section">
      <div className="public-container security-grid">
        <div className="security-content">
          <span className="public-section-label">
            {t('security.label', {
              defaultValue: 'Sécurité',
            })}
          </span>

          <h2 className="security-title">
            {t('security.title', {
              defaultValue: 'La sécurité au cœur de votre facturation',
            })}
          </h2>

          <p className="security-description">
            {t('security.description', {
              defaultValue:
                'Les comptes, les documents et les opérations sont protégés à chaque étape du traitement.',
            })}
          </p>

          <div className="security-list">
            {securityItems.map((item, index) => (
              <div key={index} className="security-item">
                <span className="security-check">✓</span>
                <span className="security-item-text">{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="security-visual">
          <div className="security-floating-card security-card-top">
            <strong>
              {t('security.cardTopTitle', {
                defaultValue: 'Accès sécurisé',
              })}
            </strong>
            <span>
              {t('security.cardTopText', {
                defaultValue: 'JWT actif',
              })}
            </span>
          </div>

          <div className="security-shield-wrapper">
            <div className="security-shield">
              <span className="security-shield-icon">🔒</span>
            </div>
          </div>

          <div className="security-floating-card security-card-bottom">
            <strong>
              {t('security.cardBottomTitle', {
                defaultValue: 'Signature',
              })}
            </strong>
            <span>
              {t('security.cardBottomText', {
                defaultValue: 'XAdES vérifiée',
              })}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export default SecuritySection;