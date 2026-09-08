import FeaturesSection from "../../../features/landing/components/FeaturesSection/FeaturesSection";
import SolutionsSection from "../../../features/landing/components/SolutionsSection/SolutionsSection";
import BenefitsSection from "../../../features/landing/components/BenefitsSection/BenefitsSection";
import CallToAction from "../../../features/landing/components/CallToAction/CallToAction";

import "./FeaturesPage.css";

function FeaturesPage() {
  return (
    <>
      <section className="inner-page-hero features-page-hero">
        <div
          className="features-page-hero__lights"
          aria-hidden="true"
        >
          <span className="features-light features-light--one" />
          <span className="features-light features-light--two" />
          <span className="features-light features-light--three" />
          <span className="features-light features-light--four" />
          <span className="features-light-beam" />
          <span className="features-light-dot features-light-dot--one" />
          <span className="features-light-dot features-light-dot--two" />
          <span className="features-light-dot features-light-dot--three" />
        </div>

        <div className="public-container">
         

          <h1>
            Tous les outils nécessaires pour
            gérer vos factures électroniques
          </h1>

        
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