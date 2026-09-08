const solutions = [
  {
    title: 'Petites entreprises',
    icon: '🏢',
    items: [
      'Import manuel des factures',
      'Suivi simple des statuts',
      'Historique centralisé',
    ],
  },
  {
    title: 'Entreprises avec ERP',
    icon: '⚙️',
    items: [
      'Connexion à la base ERP',
      'Import automatisé',
      'Réduction de la saisie manuelle',
    ],
  },
  {
    title: 'Administrateurs',
    icon: '🛡️',
    items: [
      'Vue globale des clients',
      'Statistiques des factures',
      'Gestion des erreurs et utilisateurs',
    ],
  },
];

function SolutionsSection() {
  return (
    <section className="public-section">
      <div className="public-container">
        <div className="public-section-heading">
       
          <h2>
            Une solution adaptée à chaque besoin
          </h2>
        </div>

        <div className="solutions-grid">
          {solutions.map((solution) => (
            <article
              key={solution.title}
              className="solution-card"
            >
              <div className="solution-icon">
                {solution.icon}
              </div>

              <h3>
                {solution.title}
              </h3>

              <ul>
                {solution.items.map((item) => (
                  <li key={item}>
                    <span>✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default SolutionsSection;