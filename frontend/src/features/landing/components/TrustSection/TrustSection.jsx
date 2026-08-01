const trustItems = [
  'Factures PDF',
  'Factures scannées',
  'Données ERP',
  'Signature XAdES',
  'Transmission TTN',
  'Suivi en temps réel',
];

function TrustSection() {
  return (
    <section className="trust-section">
      <div className="public-container">
        <p className="trust-title">
          Une plateforme pensée pour les
          entreprises tunisiennes et françaises
        </p>

        <div className="trust-items">
          {trustItems.map((item) => (
            <span
              key={item}
              className="trust-item"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default TrustSection;