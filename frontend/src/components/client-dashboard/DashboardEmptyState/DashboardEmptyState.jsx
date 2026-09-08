import {
  Link,
} from 'react-router-dom';

import './DashboardEmptyState.css';

function DashboardEmptyState({
  title = 'Aucune facture',
  description = 'Importez votre première facture pour commencer.',
  actionLabel = 'Importer une facture',
  actionPath = '/client/invoices/upload',
}) {
  return (
    <section className="dashboard-empty-state">
      <h2>
        {title}
      </h2>

      <p>
        {description}
      </p>

      <Link to={actionPath}>
        {actionLabel}
      </Link>
    </section>
  );
}

export default DashboardEmptyState;