import "./BenefitsSection.css";

const benefits = [
  {
    icon: "⚡",
    title: "Traitement rapide",
    description:
      "Gagnez du temps dans la gestion et le contrôle de vos factures.",
  },

  {
    icon: "🔒",
    title: "Données sécurisées",
    description:
      "Vos informations, vos comptes et vos factures restent protégés.",
  },

  {
    icon: "📊",
    title: "Suivi simplifié",
    description:
      "Consultez facilement l’état et l’historique de chaque facture.",
  },

  {
    icon: "✅",
    title: "Moins d’erreurs",
    description:
      "Repérez les problèmes avant l’envoi de votre facture.",
  },
];

function BenefitsSection() {
  return (
    <section className="benefits-section">
      <div className="public-container">

        <div className="public-section-heading light">
          <h2>
            Pourquoi choisir notre plateforme ?
          </h2>
        </div>

        <div className="benefits-grid">
          {benefits.map((benefit) => (
            <article
              key={benefit.title}
              className="benefit-card"
            >
              <div
                className="benefit-icon"
                aria-hidden="true"
              >
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