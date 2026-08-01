const statistics = [
  {
    value: '100 %',
    label: 'Traçabilité des factures',
  },
  {
    value: '3',
    label: 'Sources prises en charge',
  },
  {
    value: '24 h / 24',
    label: 'Accès à la plateforme',
  },
  {
    value: '6',
    label: 'Étapes automatisées',
  },
];

function StatisticsSection() {
  return (
    <section className="statistics-section">
      <div className="public-container statistics-grid">
        {statistics.map((statistic) => (
          <article
            key={statistic.label}
            className="statistic-item"
          >
            <strong>
              {statistic.value}
            </strong>

            <span>
              {statistic.label}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

export default StatisticsSection;