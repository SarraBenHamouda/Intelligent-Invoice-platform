import './ProcessingTimeline.css';

function ProcessingTimeline({ invoice }) {
  return (
    <section className="dashboard-panel processing-panel">
      <header className="dashboard-panel-header">
        <div>
          <span className="dashboard-panel-label">Traitement en cours</span>
          <h2>Facture #{invoice.invoiceNumber}</h2>
        </div>

        <span className="processing-source">{invoice.source}</span>
      </header>

      <div className="processing-timeline">
        {invoice.steps.map((step) => {
          const isCompleted = step.id < invoice.currentStep;
          const isActive = step.id === invoice.currentStep;

          return (
            <div
              key={step.id}
              className={[
                'processing-step',
                isCompleted ? 'is-completed' : '',
                isActive ? 'is-active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="processing-step-marker">
                {isCompleted ? '✓' : step.id}
              </div>

              <div>
                <strong>{step.label}</strong>
                <span>{step.description}</span>
              </div>

              {isActive && <small>En cours</small>}
            </div>
          );
        })}
      </div>

      <footer className="processing-footer">
        <span>Dernière mise à jour</span>
        <strong>{invoice.updatedAt}</strong>
      </footer>
    </section>
  );
}

export default ProcessingTimeline;
