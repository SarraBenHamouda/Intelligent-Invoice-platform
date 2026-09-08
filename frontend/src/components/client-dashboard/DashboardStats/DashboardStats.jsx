import './DashboardStats.css';

function DashboardStats({ items }) {
  return (
    <section className="dashboard-stats-grid" aria-label="Statistiques des factures">
      {items.map((item) => (
        <article
          key={item.id}
          className={`dashboard-stat-card dashboard-stat-card--${item.tone}`}
        >
          <div className="dashboard-stat-symbol" aria-hidden="true">
            {item.symbol}
          </div>

          <div>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.detail}</small>
          </div>
        </article>
      ))}
    </section>
  );
}

export default DashboardStats;
