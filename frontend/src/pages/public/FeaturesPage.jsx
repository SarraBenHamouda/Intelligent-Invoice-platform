import FeaturesSection from '../../features/landing/components/FeaturesSection/FeaturesSection';
import SolutionsSection from '../../features/landing/components/SolutionsSection/SolutionsSection';
import BenefitsSection from '../../features/landing/components/BenefitsSection/BenefitsSection';
import CallToAction from '../../features/landing/components/CallToAction/CallToAction';

function FeaturesPage() {
  return (
    <>
      <section className="inner-page-hero">
        <div className="public-container">
          <span className="public-section-label">
            Fonctionnalités
          </span>

          <h1>
            Tous les outils nécessaires pour
            gérer vos factures électroniques
          </h1>

          <p>
            Import, extraction, validation,
            signature, transmission TTN et suivi
            dans une seule plateforme.
          </p>
        </div>
      </section>

      <FeaturesSection />
      <SolutionsSection />
      <BenefitsSection />
      <CallToAction />
    </>
  );
}

export default FeaturesPage;