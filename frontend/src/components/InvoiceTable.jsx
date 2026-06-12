function InvoiceTable({ lines }) {

  return (

    <div className="invoice-table">

      <h2>
        Invoice Lines
      </h2>

      <table>

        <thead>

          <tr>
            <th>Reference</th>
            <th>Designation</th>
            <th>Quantity</th>
            <th>Unit Price</th>
            <th>Total</th>
          </tr>

        </thead>

        <tbody>

          {
            lines.map((line,index)=>(

              <tr key={index}>

                <td>{line.article_reference}</td>
                <td>{line.designation}</td>
                <td>{line.quantity}</td>
                <td>{line.unit_price}</td>
                <td>{line.line_total}</td>

              </tr>

            ))
          }

        </tbody>

      </table>

    </div>
  );
}

export default InvoiceTable;