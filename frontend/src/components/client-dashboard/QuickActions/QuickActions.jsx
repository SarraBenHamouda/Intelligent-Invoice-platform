import { Link } from 'react-router-dom';
import './QuickActions.css';

function QuickActions({ items }) {
  return (
    <section className="quick-actions-section">
      <header>
        <span className="dashboard-panel-label">Accès rapide</span>
        <h2>Actions utiles</h2>
      </header>

      <div className="quick-actions-grid">
        {items.map((item) => (
          <Link
            key={item.id}
            to={item.path}
            className={`quick-action-card quick-action-card--${item.tone}`}
          >
            <span className="quick-action-symbol" aria-hidden="true">
              {item.symbol}
            </span>

            <div>
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </div>

            <span className="quick-action-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default QuickActions;
