function InvoiceDetails({ invoice }) {

  return (

    <div className="invoice-details">

      <h2>
        Invoice Information
      </h2>

      <div className="invoice-grid">

        <div className="info-card">
          <h3>Invoice Number</h3>
          <p>{invoice.invoice_number}</p>
        </div>

        <div className="info-card">
          <h3>Client Name</h3>
          <p>{invoice.client_name}</p>
        </div>

        <div className="info-card">
          <h3>Invoice Date</h3>
          <p>{invoice.invoice_date}</p>
        </div>

        <div className="info-card">
          <h3>Total TTC</h3>
          <p>{invoice.total_ttc}</p>
        </div>

        <div className="info-card">
          <h3>TVA</h3>
          <p>{invoice.tax_rate}%</p>
        </div>

        <div className="info-card">
          <h3>Currency</h3>
          <p>{invoice.currency}</p>
        </div>

      </div>

    </div>
  );
}

export default InvoiceDetails;