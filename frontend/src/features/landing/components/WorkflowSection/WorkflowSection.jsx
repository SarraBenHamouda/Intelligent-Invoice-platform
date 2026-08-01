const workflowSteps = [
  {
    number: '01',
    title: 'Importer',
    description:
      'Ajoutez un PDF, une facture scannée ou sélectionnez une facture ERP.',
  },
  {
    number: '02',
    title: 'Extraire',
    description:
      'La plateforme transforme automatiquement les informations en données structurées.',
  },
  {
    number: '03',
    title: 'Vérifier',
    description:
      'Les champs, les montants, les taxes et les lignes sont contrôlés.',
  },
  {
    number: '04',
    title: 'Signer',
    description:
      'La facture est signée électroniquement avec une signature XAdES.',
  },
  {
    number: '05',
    title: 'Envoyer',
    description:
      'Le document signé est transmis vers la plateforme TTN.',
  },
  {
    number: '06',
    title: 'Suivre',
    description:
      'Le statut accepté, rejeté ou en attente apparaît dans le tableau de bord.',
  },
];

function WorkflowSection() {
  return (
    <section
      id="workflow"
      className="public-section public-section-alternative"
    >
      <div className="public-container">
        <div className="public-section-heading">
          <span className="public-section-label">
            Comment ça marche
          </span>

          <h2>
            De la facture à la transmission TTN
            en quelques étapes
          </h2>

          <p>
            Un parcours simple, centralisé et
            entièrement traçable.
          </p>
        </div>

        <div className="workflow-grid">
          {workflowSteps.map((step) => (
            <article
              key={step.number}
              className="workflow-card"
            >
              <span className="workflow-number">
                {step.number}
              </span>

              <h3>
                {step.title}
              </h3>

              <p>
                {step.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default WorkflowSection;