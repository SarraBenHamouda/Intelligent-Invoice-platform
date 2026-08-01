const benefits = [
  {
    icon: '⚡',
    title: 'Traitement rapide',
    description:
      'Réduisez le temps consacré à la saisie et au contrôle des factures.',
  },
  {
    icon: '🔒',
    title: 'Données sécurisées',
    description:
      'Protégez les accès, les comptes utilisateurs et les documents signés.',
  },
  {
    icon: '📊',
    title: 'Suivi en temps réel',
    description:
      'Consultez à tout moment le statut et l’historique de chaque facture.',
  },
  {
    icon: '✅',
    title: 'Réduction des erreurs',
    description:
      'Détectez les incohérences avant la génération et la transmission.',
  },
];

function BenefitsSection() {
  return (
    <section className="benefits-section">
      <div className="public-container">
        <div className="public-section-heading light">
          <span className="public-section-label">
            Avantages
          </span>

          <h2>
            Pourquoi choisir notre plateforme ?
          </h2>

          <p>
            Gagnez en productivité tout en
            conservant une traçabilité complète.
          </p>
        </div>

        <div className="benefits-grid">
          {benefits.map((benefit) => (
            <article
              key={benefit.title}
              className="benefit-card"
            >
              <div className="benefit-icon">
                {benefit.icon}
              </div>

              <h3>
                {benefit.title}
              </h3>

              <p>
                {benefit.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default BenefitsSection;