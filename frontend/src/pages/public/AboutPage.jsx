import CallToAction from '../../features/landing/components/CallToAction/CallToAction';

function AboutPage() {
  return (
    <>
      <section className="inner-page-hero">
        <div className="public-container">
          <span className="public-section-label">
            À propos
          </span>

          <h1>
            Une plateforme conçue pour moderniser
            la gestion des factures
          </h1>

          <p>
            Intelligent Invoice Platform réunit
            l’extraction, la validation, la
            signature et la transmission des
            factures électroniques.
          </p>
        </div>
      </section>

      <section className="public-section">
        <div className="public-container about-grid">
          <article className="about-card">
            <span>🎯</span>

            <h2>
              Notre objectif
            </h2>

            <p>
              Réduire les tâches manuelles,
              améliorer la qualité des données et
              simplifier le suivi des factures.
            </p>
          </article>

          <article className="about-card">
            <span>💡</span>

            <h2>
              Notre approche
            </h2>

            <p>
              Automatiser les étapes répétitives
              tout en laissant les utilisateurs
              contrôler les données importantes.
            </p>
          </article>

          <article className="about-card">
            <span>🤝</span>

            <h2>
              Notre engagement
            </h2>

            <p>
              Proposer une plateforme simple,
              sécurisée et adaptée aux besoins
              réels des entreprises.
            </p>
          </article>
        </div>
      </section>

      <CallToAction />
    </>
  );
}

export default AboutPage;