import './InvoiceStatusOverview.css';

function InvoiceStatusOverview({ items }) {
  return (
    <section className="dashboard-panel invoice-status-panel">
      <header className="dashboard-panel-header">
        <div>
          <span className="dashboard-panel-label">Répartition</span>
          <h2>Statut des factures</h2>
        </div>

        <span className="dashboard-panel-period">30 derniers jours</span>
      </header>

      <div className="invoice-status-list">
        {items.map((item) => (
          <div
            key={item.id}
            className={`invoice-status-item invoice-status-item--${item.tone}`}
          >
            <div className="invoice-status-row">
              <div>
                <span className="invoice-status-dot" />
                <strong>{item.label}</strong>
              </div>

              <span>{item.value}</span>
            </div>

            <div className="invoice-status-track">
              <span style={{ width: `${item.percentage}%` }} />
            </div>

            <small>{item.percentage}% du total</small>
          </div>
        ))}
      </div>
    </section>
  );
}

export default InvoiceStatusOverview;
