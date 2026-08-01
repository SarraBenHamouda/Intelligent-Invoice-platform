import WorkflowSection from '../../features/landing/components/WorkflowSection/WorkflowSection';
import SecuritySection from '../../features/landing/components/SecuritySection/SecuritySection';
import CallToAction from '../../features/landing/components/CallToAction/CallToAction';

function HowItWorksPage() {
  return (
    <>
      <section className="inner-page-hero">
        <div className="public-container">
          <span className="public-section-label">
            Processus
          </span>

          <h1>
            Un processus clair, automatisé
            et entièrement traçable
          </h1>

          <p>
            Suivez le parcours complet d’une
            facture depuis son import jusqu’à
            son acceptation par la TTN.
          </p>
        </div>
      </section>

      <WorkflowSection />
      <SecuritySection />
      <CallToAction />
    </>
  );
}

export default HowItWorksPage;