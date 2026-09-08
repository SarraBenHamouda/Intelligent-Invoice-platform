import './SecuritySection.css';

function SecuritySection() {
  const securityItems = [
    {
      icon: '🔐',
      title: 'Connexion sécurisée',
    },
    {
      icon: '🛡️',
      title: 'Mot de passe protégé',
    },
    {
      icon: '✓',
      title: 'Factures protégées',
    },
    {
      icon: '👤',
      title: 'Accès personnel',
    },
  ];

  return (
    <section
      id="security"
      className="security-section"
    >
      <div className="public-container security-grid">
        <div className="security-content">
          <h2 className="security-title">
            Vos factures et votre espace sont protégés
          </h2>

          <div className="security-list">
            {securityItems.map((item) => (
              <div
                key={item.title}
                className="security-item"
              >
                <span
                  className="security-item-icon"
                  aria-hidden="true"
                >
                  {item.icon}
                </span>

                <span className="security-item-text">
                  {item.title}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div
          className="security-visual"
          aria-label="Illustration de protection des factures"
        >
          <div className="security-visual-glow" />

          <div className="security-floating-card security-card-top">
            <span className="security-floating-card-icon">
              🔒
            </span>

            <div>
              <strong>
                Espace protégé
              </strong>

              <span>
                Connexion sécurisée
              </span>
            </div>
          </div>

          <div className="security-shield-wrapper">
            <div className="security-shield">
              <span
                className="security-shield-icon"
                aria-hidden="true"
              >
                🔒
              </span>
            </div>
          </div>

          <div className="security-floating-card security-card-bottom">
            <span className="security-floating-card-icon">
              ✓
            </span>

            <div>
              <strong>
                Facture protégée
              </strong>

              <span>
                Document vérifié
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default SecuritySection;
