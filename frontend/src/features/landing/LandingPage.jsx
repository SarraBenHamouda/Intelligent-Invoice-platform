import '../../styles/notion-landing.css';

import HeroSection from './components/HeroSection/HeroSection';
import PartnersSection from './components/PartnersSection/PartnersSection';
import ProductShowcaseSection from './components/ProductShowcaseSection/ProductShowcaseSection';
import SecuritySection from './components/SecuritySection/SecuritySection';
import CallToAction from './components/CallToAction/CallToAction';

function LandingPage() {
  return (
    <main>
      <section id="accueil">
        <HeroSection />
      </section>

      <section id="fonctionnalites">
        <ProductShowcaseSection />
      </section>



      <section id="securite">
        <SecuritySection />
      </section>

      <section id="tarifs">
        <PartnersSection />
      </section>

      <section id="contact">
        <CallToAction />
      </section>
    </main>
  );
}

export default LandingPage;
